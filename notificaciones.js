// =============================================
// MÓDULO NOTIFICACIONES — recordatorios por Web Push
// =============================================
// Hoja "Notificaciones" en Google Sheets (se crea sola, igual que
// Recordatorios):
// A: id | B: titulo | C: mensaje | D: tipo (unica/diaria/semanal/mensual)
// E: fecha_hora (ISO UTC — el ancla: para "unica" es cuándo dispara, para
//    las recurrentes de ahí se sacan la hora y el día-de-semana/mes)
// F: fecha_limite (YYYY-MM-DD, opcional — solo aplica a las recurrentes)
// G: destinatario ("yo" | "familia") | H: autor | I: estado (activa/cancelada)
// J: ultimo_envio (ISO UTC, lo actualiza el Worker — no se toca desde acá)
// P: categoria — nombre del "bloque" personalizado al que pertenece esta
//    alerta (ver BLOQUES_ALERTAS_KEY más abajo). Vacío = sin bloque (cae en
//    "Activas"). Si la alerta tiene gasto_fijo, ese manda y esto se ignora
//    -- una alerta no puede estar en "Gastos fijos" Y en un bloque a la vez.
//
// El envío real lo hace el Cron Trigger del Worker (worker/src/push.js),
// no el navegador — esta app solo crea/edita/borra los recordatorios y
// gestiona el permiso + la suscripción push del dispositivo.

// ---- EXTENSIÓN DE Sheets PARA NOTIFICACIONES ----

Sheets._notificacionesHojaLista = false;

Sheets._asegurarHojaNotificaciones = async function () {
  if (this._notificacionesHojaLista) return;
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const existe = meta.sheets.some(s => s.properties.title === CONFIG.SHEETS.NOTIFICACIONES);

  if (!existe) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CONFIG.SHEETS.NOTIFICACIONES } } }] })
      }
    );
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.NOTIFICACIONES + "!A1")}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["id", "titulo", "mensaje", "tipo", "fecha_hora", "fecha_limite", "destinatario", "autor", "estado", "ultimo_envio", "intervalo", "unidad", "gasto_fijo", "recordar_en_dias", "revisado_en", "categoria"]] })
      }
    );
  } else {
    // Migración liviana: hojas creadas antes de que existieran estas
    // columnas no las tienen en el encabezado -- se agregan solas, sin
    // tocar las filas existentes (que igual siguen funcionando por
    // compatibilidad hacia atrás, ver UNIDAD_LEGADO en worker/src/push.js).
    const encabezado = await this.leer(`${CONFIG.SHEETS.NOTIFICACIONES}!K1:P1`);
    if (!encabezado[0] || !encabezado[0][0] || !encabezado[0][2] || !encabezado[0][3] || !encabezado[0][4] || !encabezado[0][5]) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.NOTIFICACIONES + "!K1:P1")}?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [["intervalo", "unidad", "gasto_fijo", "recordar_en_dias", "revisado_en", "categoria"]] })
        }
      );
    }
  }
  this._notificacionesHojaLista = true;
};

Sheets.getNotificaciones = async function () {
  await this._asegurarHojaNotificaciones();
  const rows = await this.leer(`${CONFIG.SHEETS.NOTIFICACIONES}!A2:P`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:            r[0] || "",
    titulo:        r[1] || "",
    mensaje:       r[2] || "",
    tipo:          r[3] || "unica",
    fechaHora:     r[4] || "",
    fechaLimite:   r[5] || "",
    destinatario:  r[6] || "yo",
    autor:         r[7] || "",
    estado:        r[8] || "activa",
    ultimoEnvio:   r[9] || "",
    intervalo:     r[10] || "",
    unidad:        r[11] || "",
    gastoFijo:     r[12] || "",
    recordarEnDias: r[13] || "",
    revisadoEn:    r[14] || "",
    categoria:     r[15] || ""
  }));
};

// "texto" es lo único que pide el formulario (sin título separado, ver
// index.html) -- se guarda en la columna "titulo" para que el push lo
// muestre como único renglón, sin un segundo texto de cuerpo debajo.
// "gastoFijo" (opcional) vincula la notificación a un concepto de Gasto
// fijo por NOMBRE, no a una fila de Presupuesto/Proyección -- así sigue
// funcionando aunque el usuario nunca haya cargado presupuesto ni
// proyección para ese concepto (ver conversación: ambos son opcionales).
// "recordarEnDias" (opcional, solo aplica a "unica"): si nadie la marca
// como revisada, el Worker la vuelve a mandar cada esos días (ver
// tocaRecordatorioDeSeguimiento en worker/src/push.js).
Sheets.agregarNotificacion = async function (texto, tipo, fechaHoraISO, fechaLimite, destinatario, autor, intervalo, unidad, gastoFijo, recordarEnDias, categoria) {
  await this._asegurarHojaNotificaciones();
  const id = "N" + Date.now();
  await this.agregar(CONFIG.SHEETS.NOTIFICACIONES, [id, texto, "", tipo, fechaHoraISO, fechaLimite || "", destinatario, autor, "activa", "", intervalo || "", unidad || "", gastoFijo || "", recordarEnDias || "", "", categoria || ""]);
  return id;
};

Sheets._escribirFilaNotificacion = async function (id, campos) {
  const rows = await this.leer(`${CONFIG.SHEETS.NOTIFICACIONES}!A2:P`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Notificación no encontrada");
  const sheetRow = rowIndex + 2;
  const actual = rows[rowIndex];
  const nueva = [
    id,
    campos.titulo ?? actual[1],
    campos.mensaje ?? actual[2],
    campos.tipo ?? actual[3],
    campos.fechaHora ?? actual[4],
    campos.fechaLimite ?? actual[5],
    campos.destinatario ?? actual[6],
    actual[7] || "",
    campos.estado ?? actual[8],
    actual[9] || "",
    campos.intervalo ?? actual[10] ?? "",
    campos.unidad ?? actual[11] ?? "",
    campos.gastoFijo ?? actual[12] ?? "",
    campos.recordarEnDias ?? actual[13] ?? "",
    campos.revisadoEn ?? actual[14] ?? "",
    campos.categoria ?? actual[15] ?? ""
  ];
  const range = `${CONFIG.SHEETS.NOTIFICACIONES}!A${sheetRow}:P${sheetRow}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [nueva] })
    }
  );
  if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!res.ok) throw new Error(`Error actualizando notificación: ${res.status}`);
  return res.json();
};

Sheets.editarNotificacion = function (id, campos) {
  return this._escribirFilaNotificacion(id, campos);
};

Sheets.borrarNotificacion = async function (id) {
  const rows = await this.leer(`${CONFIG.SHEETS.NOTIFICACIONES}!A2:A`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Notificación no encontrada");
  const sheetRowIndex = rowIndex + 1;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === CONFIG.SHEETS.NOTIFICACIONES);
  if (!sheet) throw new Error("Hoja de notificaciones no encontrada");
  const sheetId = sheet.properties.sheetId;

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: sheetRowIndex, endIndex: sheetRowIndex + 1 } }
        }]
      })
    }
  );
  if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!res.ok) throw new Error(`Error borrando notificación: ${res.status}`);
  return res.json();
};

// =============================================
// PERMISO + SUSCRIPCIÓN PUSH DEL DISPOSITIVO
// =============================================

function _base64urlToUint8Array(base64url) {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function _uint8ArrayToBase64url(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function notificacionesSoportadas() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function estadoSuscripcionPush() {
  if (!notificacionesSoportadas()) return "no_soportado";
  if (Notification.permission === "denied") return "denegado";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "activo" : "inactivo";
}

// Pide permiso (si hace falta) y registra la suscripción push de este
// dispositivo en el Worker. Se puede llamar de nuevo sin problema: el
// Worker deduplica por endpoint.
async function activarNotificacionesPush() {
  if (!notificacionesSoportadas()) {
    alert("Este navegador no soporta alertas push.");
    return false;
  }
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    SyncManager.mostrarToast("🔕 No se activaron las alertas (permiso no concedido)", "warn");
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    // Si ya había una suscripción pero quedó atada a una clave VAPID vieja
    // (ej. se rotaron las claves en el servidor porque la privada estaba
    // desincronizada — bug real, agosto 2026), el navegador la sigue
    // devolviendo tal cual sin importar cuántas veces se toque "Activar":
    // hay que darla de baja explícitamente antes de pedir una nueva.
    if (sub) {
      const claveActual = sub.options?.applicationServerKey
        ? _uint8ArrayToBase64url(new Uint8Array(sub.options.applicationServerKey))
        : null;
      if (claveActual && claveActual !== CONFIG.VAPID_PUBLIC_KEY) {
        await sub.unsubscribe();
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _base64urlToUint8Array(CONFIG.VAPID_PUBLIC_KEY)
      });
    }

    const sessionToken = localStorage.getItem("worker_session");
    const res = await fetch(`${CONFIG.WORKER_URL}/push/subscribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    if (!res.ok) throw new Error(`Worker respondió ${res.status}`);

    SyncManager.mostrarToast("🔔 Alertas activadas en este dispositivo");
    await actualizarBotonActivarPush();
    return true;
  } catch (err) {
    console.warn("Error activando notificaciones push:", err);
    alert("No se pudo activar las alertas: " + err.message);
    return false;
  }
}

// Le pide al Worker el link de suscripción a un calendario .ics (ver
// worker/src/calendario.js) con las alertas propias (individuales) más las
// grupales, y lo abre. En iOS, un enlace webcal:// dispara directo el
// picker nativo de "Agregar calendario suscrito" -- una vez aceptado ahí,
// el propio iPhone revisa el feed solo de ahí en adelante, sin volver a
// pasar por la app. En navegadores que no reconocen ese esquema (desktop,
// Android) el enlace https:// del mismo feed queda copiado al portapapeles
// como respaldo, para suscribirlo a mano donde corresponda.
async function suscribirCalendario() {
  try {
    const sessionToken = localStorage.getItem("worker_session");
    const res = await fetch(`${CONFIG.WORKER_URL}/calendario/link`, {
      headers: { Authorization: `Bearer ${sessionToken}` }
    });
    if (!res.ok) throw new Error(`Worker respondió ${res.status}`);
    const { url, httpsUrl } = await res.json();

    if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(httpsUrl); } catch (e) { /* sin permiso de portapapeles, no es crítico */ }
    }
    SyncManager.mostrarToast("🗓️ Abriendo el picker de suscripción del Calendario…");
    window.location.href = url;

    // No existe una API web para confirmar que la suscripción se completó
    // de verdad (eso pasa afuera de la app, en Calendar/Ajustes) -- se
    // asume que si llegó hasta acá, siguió el picker nativo, y el botón se
    // oculta solo en ESTE dispositivo. Igual que el de Activar push, cada
    // dispositivo lo ve una vez.
    localStorage.setItem("calendario_suscrito", "1");
    actualizarBotonSuscribirCalendario();
  } catch (err) {
    alert("No se pudo generar el enlace del calendario: " + err.message);
  }
}

function actualizarBotonSuscribirCalendario() {
  document.getElementById("btn-suscribir-calendario")
    ?.classList.toggle("hidden", localStorage.getItem("calendario_suscrito") === "1");
}

// Este dispositivo ya tiene el permiso + la suscripción push activa -- no
// tiene sentido seguir ofreciendo el botón para activarlas de nuevo, ni la
// explicación de por qué hace falta activarlas (ya se activaron acá).
async function actualizarBotonActivarPush() {
  const btn  = document.getElementById("btn-activar-push");
  const nota = document.getElementById("notif-header-nota");
  if (!btn && !nota) return;
  const estado = await estadoSuscripcionPush();
  const yaActivo = estado === "activo";
  if (btn)  btn.classList.toggle("hidden", yaActivo);
  if (nota) nota.classList.toggle("hidden", yaActivo);
}

// =============================================
// LÓGICA DE UI
// =============================================

window.notificaciones = window.notificaciones || [];

// Mismo mapeo legado que UNIDAD_LEGADO en worker/src/push.js -- filas
// creadas antes de que existiera la repetición personalizada todavía
// tienen tipo "diaria"/"semanal"/"mensual" en vez de "recurrente".
const UNIDAD_LEGADO_NOTIF = { diaria: "dia", semanal: "semana", mensual: "mes" };
const NOMBRES_UNIDAD_NOTIF = {
  dia:    ["día", "días"],
  semana: ["semana", "semanas"],
  mes:    ["mes", "meses"],
  anio:   ["año", "años"]
};

function descripcionRecurrencia(n) {
  if (n.tipo === "unica") return "Única vez";
  const unidad = n.unidad || UNIDAD_LEGADO_NOTIF[n.tipo] || "dia";
  const intervalo = parseInt(n.intervalo, 10) || 1;
  const [singular, plural] = NOMBRES_UNIDAD_NOTIF[unidad] || NOMBRES_UNIDAD_NOTIF.dia;
  return intervalo === 1 ? `Cada ${singular}` : `Cada ${intervalo} ${plural}`;
}

// Suma "intervalo" meses a una fecha (UTC), clampeando el día al último
// del mes destino si no existe (ej. 31 de enero + 1 mes -> 28/29 de
// febrero, no "3 de marzo" como haría Date normal por desborde) -- mismo
// criterio que usa el Worker para decidir "¿hoy le toca?" (ver
// estaVencida en worker/src/push.js), para que acá salga la MISMA fecha
// que el Worker considera la próxima.
function _sumarMeses(fecha, mesesASumar) {
  const totalMeses = fecha.getUTCMonth() + mesesASumar;
  const nuevoAnio = fecha.getUTCFullYear() + Math.floor(totalMeses / 12);
  const nuevoMes = ((totalMeses % 12) + 12) % 12;
  const ultimoDiaNuevoMes = new Date(Date.UTC(nuevoAnio, nuevoMes + 1, 0)).getUTCDate();
  const nuevoDia = Math.min(fecha.getUTCDate(), ultimoDiaNuevoMes);
  return new Date(Date.UTC(nuevoAnio, nuevoMes, nuevoDia, fecha.getUTCHours(), fecha.getUTCMinutes(), fecha.getUTCSeconds()));
}

function _siguienteCiclo(fecha, unidad, intervalo) {
  if (unidad === "dia")    { const d = new Date(fecha); d.setUTCDate(d.getUTCDate() + intervalo); return d; }
  if (unidad === "semana") { const d = new Date(fecha); d.setUTCDate(d.getUTCDate() + intervalo * 7); return d; }
  if (unidad === "mes")    return _sumarMeses(fecha, intervalo);
  if (unidad === "anio")   return _sumarMeses(fecha, intervalo * 12);
  return new Date(fecha.getTime() + 86400000);
}

// n.fechaHora es el ANCLA (cuándo se creó/empezó a repetir la alerta) --
// para una recurrente queda fija en esa fecha para SIEMPRE, no es "cuándo
// dispara la próxima vez". Bug real reportado: una alerta recurrente
// creada hace 2 meses se veía siempre "pasada" (roja) aunque estuviera
// funcionando perfecto, porque el color comparaba directo contra esa
// ancla vieja. Esta función calcula la próxima fecha real (hoy si hoy le
// toca, si no la que sigue), con la misma regla de intervalo+unidad que
// usa el Worker para decidir si ya le tocaba disparar.
function _proximaOcurrencia(n, ahora = new Date()) {
  const ancla = new Date(n.fechaHora);
  if (isNaN(ancla.getTime())) return null;
  if (n.tipo === "unica") return ancla;

  const unidad = n.unidad || UNIDAD_LEGADO_NOTIF[n.tipo] || "dia";
  const intervalo = Math.max(1, parseInt(n.intervalo, 10) || 1);
  const hoyDia = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());

  let candidata = ancla;
  let guarda = 0; // corta cualquier caso raro en vez de colgar el navegador
  while (Date.UTC(candidata.getUTCFullYear(), candidata.getUTCMonth(), candidata.getUTCDate()) < hoyDia && guarda < 10000) {
    candidata = _siguienteCiclo(candidata, unidad, intervalo);
    guarda++;
  }
  return candidata;
}

// La hoja "Notificaciones" es compartida por toda la familia -- una
// alerta "Solo yo" solo debe verse en la lista de quien la creó. El envío
// del push ya estaba bien restringido (ver revisarYEnviarNotificaciones
// en worker/src/push.js), pero la lista de la app mostraba todo sin
// filtrar (bug real reportado: las de Royer le aparecían a Blanjor y a
// Yei también). Filtrar acá, al cargar, alcanza para que todo lo que
// cuelga de "notificaciones" (badge, panel, secciones) respete esto solo.
function filtrarNotificacionesVisibles(lista) {
  return lista.filter(n => n.destinatario === "familia" || n.autor === currentUser?.email);
}

// =============================================
// BLOQUES PERSONALIZADOS (panel de Alertas, estilo "Acciones rápidas")
// =============================================
// Cada usuario configura sus propios bloques para agrupar SUS alertas --
// se guardan del lado del servidor (Sheets, por email de quien los creó)
// para que carguen igual en cualquier dispositivo donde ese usuario inicie
// sesión (antes vivían solo en el localStorage de un dispositivo puntual --
// bug real reportado). El bloque "Gastos fijos" NO vive acá: es fijo,
// igual para todos, y sigue funcionando exactamente como antes
// (n.gastoFijo). Se cachea en memoria + localStorage como respaldo para no
// depender de la red en cada toque.
let bloquesAlertas = []; // cache en memoria, la llena cargarBloquesAlertas() al abrir la app

function _bloquesAlertasCacheKey() {
  return `cache_alertas_bloques_${currentUser?.email || "anon"}`;
}

// Cada bloque es { nombre, icono }. Los guardados antes de que existiera
// el ícono elegible quedaron como texto plano (solo el nombre) -- se
// normalizan al leer, con el 🗂️ de siempre como respaldo.
function _normalizarBloquesAlertas(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(b => typeof b === "string" ? { nombre: b, icono: "🗂️" } : b);
}

async function cargarBloquesAlertas() {
  try {
    let valor = await Sheets.getConfigUsuario(currentUser.email, "alertas_bloques");
    if (valor === null) {
      // Migración única desde la clave vieja de localStorage (por email,
      // pero atada al dispositivo) hacia el servidor, para no perder los
      // bloques que el usuario ya tenía configurados.
      const viejo = localStorage.getItem(`alertas_bloques_${currentUser?.email || "anon"}`);
      if (viejo) {
        try {
          const arr = _normalizarBloquesAlertas(JSON.parse(viejo));
          if (arr.length > 0) { valor = arr; await Sheets.guardarConfigUsuario(currentUser.email, "alertas_bloques", arr); }
        } catch {}
      }
    }
    bloquesAlertas = _normalizarBloquesAlertas(valor);
    localStorage.setItem(_bloquesAlertasCacheKey(), JSON.stringify(bloquesAlertas));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem(_bloquesAlertasCacheKey());
    if (cache) { try { bloquesAlertas = JSON.parse(cache); } catch { bloquesAlertas = []; } }
  }
}

function obtenerBloquesAlertas() {
  return bloquesAlertas;
}

async function _guardarBloquesAlertas(bloques) {
  bloquesAlertas = bloques;
  localStorage.setItem(_bloquesAlertasCacheKey(), JSON.stringify(bloques));
  await Sheets.guardarConfigUsuario(currentUser.email, "alertas_bloques", bloques);
}

// Se llama al soltar tras arrastrar un bloque a un lugar nuevo (ver
// crearManejadorArrastrable en gestos.js). "bloque_N" en data-clave es el
// índice DENTRO de bloquesAlertas al momento de este render -- se usa para
// mapear el orden ya reordenado del DOM de vuelta al arreglo real.
// _guardarBloquesAlertas actualiza bloquesAlertas de una (antes del await a
// Sheets); renderNotificaciones reconstruye la cuadrícula con los índices
// ya al día para el próximo arrastre.
function _reordenarBloquesAlertaDesdeGrid(grid) {
  const bloques = obtenerBloquesAlertas();
  const nuevoOrden = Array.from(grid.querySelectorAll('.alerta-bloque-card[data-clave^="bloque_"]'))
    .map(btn => bloques[parseInt(btn.dataset.clave.slice("bloque_".length), 10)])
    .filter(Boolean);
  _guardarBloquesAlertas(nuevoOrden);
  renderNotificaciones();
}

async function agregarBloqueAlerta(nombre, icono) {
  const bloques = obtenerBloquesAlertas();
  if (!nombre || nombre === "Gastos fijos" || bloques.some(b => b.nombre === nombre)) return false;
  await _guardarBloquesAlertas([...bloques, { nombre, icono: icono || "🗂️" }]);
  return true;
}

async function borrarBloqueAlerta(nombre) {
  await _guardarBloquesAlertas(obtenerBloquesAlertas().filter(b => b.nombre !== nombre));
}

// GASTOS_FIJOS ya tiene su propio select (poblarSelectGastoFijo) -- este
// puebla el select de "a qué bloque pertenece esta alerta", que incluye el
// fijo "Gastos fijos" + los personalizados del usuario logueado.
function poblarSelectBloque() {
  const sel = document.getElementById("notif-bloque");
  if (!sel) return;
  const valorActual = sel.value;
  const bloques = obtenerBloquesAlertas();
  sel.innerHTML = `<option value="">🔖 Otros</option><option value="__gastos_fijos__">📌 Gastos fijos</option>` +
    bloques.map(b => `<option value="${escapeAttr(b.nombre)}">${escapeHtml(b.icono)} ${escapeHtml(b.nombre)}</option>`).join("");
  sel.value = ["", "__gastos_fijos__", ...bloques.map(b => b.nombre)].includes(valorActual) ? valorActual : "";
}

async function cargarNotificaciones() {
  try {
    notificaciones = filtrarNotificacionesVisibles(await Sheets.getNotificaciones());
    localStorage.setItem("cache_notificaciones", JSON.stringify(notificaciones));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem("cache_notificaciones");
    if (cache) { try { notificaciones = JSON.parse(cache); } catch {} }
  }
  actualizarBotonActivarPush();
  actualizarBotonSuscribirCalendario();
  renderNotificaciones();
  renderNotificacionesBadge();
  if (typeof actualizarBadgeApp === "function") actualizarBadgeApp();
}

function _formatoFechaHoraLocal(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

// Compara por DÍA en hora local (no la hora exacta) -- "hoy"/"pasado"
// deben coincidir con el día que ve el usuario en su reloj, no con el
// corte UTC en el que se guarda fechaHora.
function _diaLocal(fechaOIso) {
  const d = fechaOIso instanceof Date ? fechaOIso : new Date(fechaOIso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "hoy" / "pasado" / "futuro" según el día de una fecha (Date o ISO)
// contra hoy en hora local -- usado tanto para el color de la tarjeta
// como para el contador de "Activos" (solo hoy) en renderNotificaciones().
function _estadoDiaAlarma(fechaODiaISO) {
  const dia = _diaLocal(fechaODiaISO);
  if (!dia) return null;
  const hoy = _diaLocal(new Date());
  if (dia === hoy) return "hoy";
  return dia < hoy ? "pasado" : "futuro";
}

// Una alerta cae en "Pasados" si todavía no fue aprobada (revisada) Y ya
// pasó su fecha -- no depende de que el Worker ya haya alcanzado a marcarla
// "enviada" (si el Cron todavía no corrió, igual cuenta con tal de que la
// fecha ya pasó). "enviada" siempre cuenta (ya se disparó el push y sigue
// sin revisar). Se usa tanto para armar el grupo "Pasados" como para
// decidir si el resumen muestra el botón de "Marcar como revisada".
function _esPasada(n) {
  if (n.estado === "enviada") return true;
  if (n.estado !== "activa") return false;
  const proxima = _proximaOcurrencia(n);
  return !!proxima && _estadoDiaAlarma(proxima) === "pasado";
}

// Tarjeta de una alerta (usada dentro de la pantalla de detalle de un
// bloque) -- a propósito minimalista, solo nombre + próximo recordatorio.
// Editar/Eliminar ya no van sueltos acá: viven en el resumen del segundo
// toque (abrirResumenNotificacion), igual que en Proyección y Movimientos.
// El color y la fecha mostrada usan la PRÓXIMA ocurrencia real
// (_proximaOcurrencia), no el ancla cruda -- si no, una recurrente creada
// hace tiempo se ve "pasada" para siempre aunque esté funcionando bien.
// soloRevisado: true dentro del bloque "Activos" -- ahí, en vez de la
// fecha sola, se ve además un botón para confirmar que ya se atendió.
// icono: el mismo emoji del bloque (grupo.icono) -- pedido explícito, cada
// fila de la lista se lee "icono - texto - próximo vencimiento".
function renderItemNotificacion(n, soloRevisado = false, icono = "🔔") {
  const proxima = _proximaOcurrencia(n);
  const estadoDia = proxima ? _estadoDiaAlarma(proxima) : null;
  const claseDia = estadoDia === "hoy" ? " notificacion-item-hoy" : estadoDia === "pasado" ? " notificacion-item-pasada" : "";
  const botones = soloRevisado
    ? `<button class="btn-secondary notif-card-btn" onclick="event.stopPropagation(); marcarNotificacionRevisada('${n.id}')" onpointerup="event.stopPropagation()">✅ Revisado</button>
        <span class="notif-card-proximo">🗓️ ${proxima ? _formatoFechaHoraLocal(proxima.toISOString()) : "—"}</span>`
    : `<span class="notif-card-proximo">🗓️ ${proxima ? _formatoFechaHoraLocal(proxima.toISOString()) : "—"}</span>`;
  return `
    <div class="notificacion-item${claseDia}" data-id="${n.id}" onpointerup="tapNotificacion('${n.id}', event)">
      <div class="notif-card-grid">
        <span class="notif-card-nombre"><span class="notif-card-icon">${icono}</span>${escapeHtml(n.titulo)}</span>
        ${botones}
      </div>
    </div>`;
}

// Doble tap/clic manual (mismo patrón que tapMovimiento en app.js): no se
// puede usar ondblclick acá -- el bloqueo de zoom (touchend ->
// preventDefault en index.html) suprime la síntesis nativa de dblclick en
// iOS Safari real, aunque funcione con .dblclick() de Playwright (que no
// pasa por ese camino táctil). Tampoco alcanza con onclick: ese mismo
// preventDefault() en el touchend del SEGUNDO toque también suprime la
// síntesis del click de ESE toque puntual (no solo dblclick) -- por eso
// el div usa onpointerup, no onclick: pointerup sí llega siempre, porque
// preventDefault() no cancela el evento en sí, solo la acción por defecto
// del navegador que dispara (bug real reportado: con onclick, "al darle
// doble clic no me da el resumen" seguía pasando en el celular real).
const tapNotificacion = crearManejadorDobleToque(id => id, id => abrirResumenNotificacion(id));

// ---- Resumen de una alerta (doble clic sobre su tarjeta) ----
function abrirResumenNotificacion(id) {
  const n = notificaciones.find(x => x.id === id);
  if (!n) return;

  const ESTADOS = { activa: "Activa", enviada: "Por revisar", cancelada: "Cancelada" };
  const bloqueLabel = n.gastoFijo ? `📌 Gastos fijos (${n.gastoFijo})` : (n.categoria ? `🗂️ ${n.categoria}` : "🔖 Otros");
  const filas = [];
  if (n.mensaje) filas.push(["Mensaje", n.mensaje]);
  filas.push(
    ["Bloque", bloqueLabel],
    ["Repetición", descripcionRecurrencia(n)],
    ["Fecha y hora", _formatoFechaHoraLocal(n.fechaHora)],
    ["Repetir hasta", n.fechaLimite || "—"],
    ["Destinatario", n.destinatario === "familia" ? "Toda la familia" : "Solo yo"],
    ["Si no se revisa, recuerda de nuevo en", n.recordarEnDias ? `${n.recordarEnDias} día(s)` : "—"],
    ["Estado", ESTADOS[n.estado] || n.estado],
    ["Último envío", n.ultimoEnvio ? _formatoFechaHoraLocal(n.ultimoEnvio) : "—"]
  );

  document.getElementById("resumen-notificacion-titulo").textContent = n.titulo;
  const cuerpo = document.getElementById("resumen-notificacion-cuerpo");
  if (cuerpo) {
    cuerpo.innerHTML = filas.map(([label, valor]) => `
      <div class="detalle-notif-fila">
        <span class="detalle-notif-label">${escapeHtml(label)}</span>
        <span class="detalle-notif-valor">${escapeHtml(String(valor))}</span>
      </div>`).join("");
  }

  // "Marcar como revisada" siempre visible -- se puede aprobar antes de
  // tiempo (pedido explícito: se maneja igual que si se aprueba a la hora
  // que es, ver marcarNotificacionRevisada más abajo, que ya no depende de
  // si la fecha pasó o no).
  const modal = document.getElementById("modal-resumen-notificacion");
  if (modal) modal.dataset.id = id;
  modal?.classList.remove("hidden");
}

// clave del bloque cuya pantalla de detalle está abierta -- null = se ve
// la cuadrícula. Vive fuera de renderNotificaciones() para sobrevivir a
// que la lista se repinte entera cada vez que llegan datos nuevos (si no,
// cualquier acción -- editar, borrar, marcar revisada -- te devolvería de
// golpe a la cuadrícula).
let bloqueAlertaAbierto = null;

function renderNotificaciones() {
  const lista = document.getElementById("notificaciones-list");
  if (!lista) return;

  const bloquesPersonalizados = obtenerBloquesAlertas();

  // Dos dimensiones independientes (ver conversación):
  //  - Agrupaciones (Activos/Pasados): por ESTADO, cruzan todos los bloques.
  //  - Bloques (Gastos fijos/Otros/los del usuario): por CATEGORÍA -- acá
  //    (y solo acá) se puede crear una alerta nueva.
  // "Activos" en particular solo cuenta las de HOY (no todo lo pendiente
  // sin importar la fecha) -- las demás siguen viéndose igual, adentro de
  // su bloque de categoría (Gastos fijos/Otros/uno propio).
  const todasActivas = notificaciones.filter(n => n.estado === "activa");
  // Usa la PRÓXIMA ocurrencia real, no el ancla cruda -- si no, una
  // recurrente que hoy le toca pero se creó otro día nunca contaría acá.
  const activosHoy    = todasActivas.filter(n => {
    const proxima = _proximaOcurrencia(n);
    return proxima && _estadoDiaAlarma(proxima) === "hoy";
  });
  // "Pasados" = no está aprobada (revisada) todavía Y ya pasó su fecha --
  // no depende de que el Worker ya haya alcanzado a mandar el push (estado
  // "enviada"): si por lo que sea el Cron todavía no corrió, igual cuenta
  // acá con tal de que la fecha ya haya pasado (pedido explícito del
  // usuario). Ya no existe un bloque "Canceladas" -- al aprobar una alerta
  // de una sola vez se borra directo (ver marcarNotificacionRevisada), así
  // que nunca queda una fila huérfana que mostrar ahí.
  const pasados = notificaciones.filter(n => _esPasada(n));

  const gastosFijos = todasActivas.filter(n => n.gastoFijo);
  const porBloque = {};
  bloquesPersonalizados.forEach(b => { porBloque[b.nombre] = []; });
  const otros = [];
  todasActivas
    .filter(n => !n.gastoFijo)
    .forEach(n => {
      if (n.categoria && porBloque[n.categoria]) porBloque[n.categoria].push(n);
      else otros.push(n);
    });

  // Mapa clave -> tarjeta. El orden de inserción define el orden en la
  // cuadrícula: Activos/Pasados van primero (primera fila), después los
  // bloques (Gastos fijos y Otros fijos, los del usuario después).
  const grupos = {};
  grupos.activos = { titulo: "Activos", icono: "🔔", items: activosHoy, esBloque: false, eliminable: false, esAgrupacion: true };
  grupos.pasados = { titulo: "Pasados", icono: "⏰", items: pasados, esBloque: false, eliminable: false, esAgrupacion: true };
  grupos.gastosFijos = { titulo: "Gastos fijos", icono: "📌", items: gastosFijos, esBloque: true, eliminable: false, valorBloque: "__gastos_fijos__" };
  grupos.otros = { titulo: "Otros", icono: "🔖", items: otros, esBloque: true, eliminable: false, valorBloque: "" };
  bloquesPersonalizados.forEach((b, i) => {
    grupos[`bloque_${i}`] = { titulo: b.nombre, icono: b.icono, items: porBloque[b.nombre] || [], esBloque: true, eliminable: true, nombreBloque: b.nombre, valorBloque: b.nombre };
  });

  if (bloqueAlertaAbierto && !grupos[bloqueAlertaAbierto]) bloqueAlertaAbierto = null; // se borró el bloque que estaba abierto

  if (bloqueAlertaAbierto) {
    renderBloqueAlertaDetalle(lista, grupos[bloqueAlertaAbierto], bloqueAlertaAbierto);
  } else {
    renderBloquesAlertaGrid(lista, grupos);
  }
}

// ---- Cuadrícula de bloques (2 columnas, estilo Acciones rápidas) ----
function renderBloquesAlertaGrid(lista, grupos) {
  const tarjetas = Object.entries(grupos).map(([clave, g]) => `
    <button type="button" class="alerta-bloque-card${g.esAgrupacion ? " alerta-bloque-card-agrupacion" : ""}" data-clave="${clave}">
      ${g.esAgrupacion && g.items.length > 0 ? `<span class="alerta-bloque-cantidad">${g.items.length}</span>` : ""}
      <span class="alerta-bloque-icono">${g.icono}</span>
      <span class="alerta-bloque-nombre">${escapeHtml(g.titulo)}</span>
    </button>`).join("");

  lista.innerHTML = `
    <div class="alertas-bloques-grid">
      ${tarjetas}
      <button type="button" class="alerta-bloque-card alerta-bloque-agregar" id="btn-nuevo-bloque">
        <span class="alerta-bloque-icono">➕</span>
        <span class="alerta-bloque-nombre">Agregar bloque</span>
      </button>
    </div>`;

  const grid = lista.querySelector(".alertas-bloques-grid");
  const abrir = (clave) => { bloqueAlertaAbierto = clave; renderNotificaciones(); };

  lista.querySelectorAll(".alerta-bloque-card[data-clave]").forEach(btn => {
    const clave = btn.dataset.clave;
    // Solo los bloques que el usuario creó (bloque_N) se pueden arrastrar
    // para reordenar -- los fijos (Activos/Pasados/Gastos fijos/Otros)
    // siempre van primero, en ese orden (pedido explícito: no mezclarlos).
    if (clave.startsWith("bloque_")) {
      crearManejadorArrastrable(btn, grid, '.alerta-bloque-card[data-clave^="bloque_"]', {
        onCorto: () => abrir(clave),
        onReordenar: () => _reordenarBloquesAlertaDesdeGrid(grid)
      });
    } else {
      btn.addEventListener("click", () => abrir(clave));
    }
  });

  document.getElementById("btn-nuevo-bloque")?.addEventListener("click", () => {
    document.getElementById("bloque-alerta-nombre").value = "";
    document.getElementById("bloque-alerta-icono").value = "";
    document.getElementById("modal-bloque-alerta")?.classList.remove("hidden");
  });
}

// ---- Pantalla de detalle de un bloque (se abre al tocar su tarjeta) ----
function renderBloqueAlertaDetalle(lista, grupo, clave) {
  // "Activos" es la lista de lo que le toca justo hoy -- ahí no tiene
  // sentido editar/eliminar la alerta, solo confirmar que ya se atendió.
  const esActivos = clave === "activos";
  // De la que se activa más pronto a la que se activa más tarde -- por la
  // PRÓXIMA ocurrencia real, no el ancla cruda (ver _proximaOcurrencia).
  const itemsOrdenados = [...grupo.items].sort((a, b) => {
    const fa = _proximaOcurrencia(a);
    const fb = _proximaOcurrencia(b);
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fa.getTime() - fb.getTime();
  });
  const itemsHTML = itemsOrdenados.length > 0
    ? itemsOrdenados.map(n => renderItemNotificacion(n, esActivos, grupo.icono)).join("")
    : `<div class="notif-bloque-vacio">No hay alertas acá todavía.</div>`;

  lista.innerHTML = `
    <div class="alerta-bloque-detalle-header">
      <button type="button" class="btn-volver" id="btn-volver-bloque-alerta" title="Volver" aria-label="Volver">‹</button>
      <span class="alerta-bloque-detalle-titulo">${grupo.icono} ${escapeHtml(grupo.titulo)} (${grupo.items.length})</span>
      ${grupo.eliminable ? `<button type="button" class="notif-btn-borrar-bloque" title="Eliminar bloque">🗑️</button>` : ""}
    </div>
    ${grupo.esBloque ? `<button type="button" class="btn-primary btn-franja" id="btn-nueva-notificacion-bloque">+ Nueva</button>` : ""}
    ${itemsHTML}`;

  document.getElementById("btn-volver-bloque-alerta")?.addEventListener("click", () => cerrarPantallaActual());

  document.getElementById("btn-nueva-notificacion-bloque")?.addEventListener("click", () => {
    abrirNuevaNotificacionEnBloque(grupo.valorBloque);
  });

  lista.querySelector(".notif-btn-borrar-bloque")?.addEventListener("click", async () => {
    const nombre = grupo.nombreBloque;
    if (!confirm(`¿Eliminar el bloque "${nombre}"?\n\nLas alertas que tenía pasan a "Activas" -- no se borran.`)) return;
    try {
      await borrarBloqueAlerta(nombre);
    } catch (err) {
      alert("Error borrando el bloque: " + err.message);
      return;
    }
    bloqueAlertaAbierto = null;
    renderNotificaciones();
  });

  // Mantener presionada abre Editar/Eliminar (ver abrirMenuEditarBorrar en
  // gestos.js) -- salvo en "Activos", donde no aplica (ver comentario
  // arriba: ahí solo se puede confirmar que ya se atendió).
  if (!esActivos) {
    lista.querySelectorAll(".notificacion-item[data-id]").forEach(item => {
      const id = item.dataset.id;
      const n = itemsOrdenados.find(x => x.id === id);
      if (!n) return;
      crearManejadorPresionSostenida(item, {
        onLargo: () => abrirMenuEditarBorrar({
          titulo: n.titulo,
          onEditar: () => abrirEditarNotificacion(id),
          onBorrar: () => borrarNotificacion(id)
        })
      });
    });
  }
}

// Notificaciones de una sola vez no se cancelan solas al dispararse (ver
// worker/src/push.js) -- se quedan en "enviada" (o "activa" si el Cron
// todavía no llegó a mandarlas) hasta que alguien las revisa acá. Ya no
// existe un bloque "Canceladas": una vez aprobada, una "unica" ya cumplió
// su único propósito y se borra directo (pedido explícito del usuario --
// antes quedaba en estado "cancelada" y el Worker recién la borraba 15
// días después). Una recurrente solo estaba en revisión por tener
// "recordar_en_dias" activado (ver debeQuedarEnRevision en
// worker/src/push.js) -- al revisarla vuelve a "activa", lista para su
// próximo ciclo normal, no se borra.
async function marcarNotificacionRevisada(id) {
  const n = notificaciones.find(x => x.id === id);
  if (!n) return;
  try {
    if (n.tipo === "unica") {
      await Sheets.borrarNotificacion(id);
    } else {
      await Sheets.editarNotificacion(id, { estado: "activa" });
    }
    await cargarNotificaciones();
    SyncManager.mostrarToast(`✅ "${n.titulo}" revisada`);
  } catch (err) {
    alert("Error marcando la alerta como revisada: " + err.message);
  }
}

async function borrarNotificacion(id) {
  const n = notificaciones.find(x => x.id === id);
  if (!n) return;
  if (!confirm(`¿Eliminar "${n.titulo}" definitivamente?`)) return;
  try {
    await Sheets.borrarNotificacion(id);
    await cargarNotificaciones();
  } catch (err) {
    alert("Error borrando la alerta: " + err.message);
  }
}

// GASTOS_FIJOS (definida en app.js) crece con el tiempo -- se repuebla
// cada vez que se abre el modal en vez de una sola vez al cargar la página.
function poblarSelectGastoFijo() {
  const sel = document.getElementById("notif-gasto-fijo");
  if (!sel || typeof GASTOS_FIJOS === "undefined") return;
  const valorActual = sel.value;
  sel.innerHTML = `<option value="">— Ninguno —</option>` +
    GASTOS_FIJOS.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join("");
  sel.value = GASTOS_FIJOS.includes(valorActual) ? valorActual : "";
}

// El "recordar de nuevo" solo tiene sentido para notificaciones "unica":
// son las únicas que quedan en estado "enviada" esperando revisión (ver
// tocaRecordatorioDeSeguimiento en worker/src/push.js) -- también aplica a
// recurrentes: si se activa ahí, esa notificación pasa por "revisar" en
// cada ciclo antes de volver a su repetición normal (ver
// marcarNotificacionRevisada). Por eso el campo queda siempre visible, sin
// importar la repetición elegida.

function limpiarFormNotificacion() {
  document.getElementById("notif-texto").value = "";
  document.getElementById("notif-repetir-preset").value = "no";
  document.getElementById("notif-repetir-intervalo").value = "1";
  document.getElementById("notif-repetir-unidad").value = "dia";
  document.getElementById("notif-repetir-custom-row")?.classList.add("hidden");
  document.getElementById("notif-recordar-dias").value = "";
  document.getElementById("notif-destinatario").value = "yo";
  poblarSelectBloque();
  document.getElementById("notif-bloque").value = "";
  document.getElementById("notif-bloque-row")?.classList.remove("hidden");
  document.getElementById("notif-gasto-fijo-row")?.classList.add("hidden");
  poblarSelectGastoFijo();
  const ahora = new Date(Date.now() + 5 * 60000); // +5 min, para que no quede en el pasado por defecto
  document.getElementById("notif-fecha-hora").value = ahora.toISOString().slice(0, 16);
  document.getElementById("notif-fecha-limite").value = "";

  const modal = document.getElementById("modal-notificacion");
  delete modal.dataset.editId;
  modal.querySelector(".modal-title").textContent = "Nueva alerta";
  document.getElementById("btn-guardar-notificacion").textContent = "Guardar";
}

// Convierte un ISO en UTC (como se guarda en la hoja) al formato que
// espera un <input type="datetime-local"> -- en hora LOCAL del navegador,
// igual que el input la interpreta al leerla de vuelta con `new Date(...)`.
function _isoAFechaHoraLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- Nueva alerta DESDE un bloque (único lugar donde se puede crear una
// alerta -- ver conversación: ya no hay "+ Nueva" suelto en la pantalla
// principal). El bloque ya viene decidido por dónde se entró, así que ni
// tiene sentido mostrar el selector: se precarga y se oculta.
function abrirNuevaNotificacionEnBloque(valorBloque) {
  limpiarFormNotificacion();
  document.getElementById("notif-bloque").value = valorBloque;
  document.getElementById("notif-bloque-row")?.classList.add("hidden");
  const esGastosFijos = valorBloque === "__gastos_fijos__";
  document.getElementById("notif-gasto-fijo-row")?.classList.toggle("hidden", !esGastosFijos);
  if (esGastosFijos) poblarSelectGastoFijo();
  document.getElementById("modal-notificacion").classList.remove("hidden");
}

// ---- Editar (reusa el modal de "Nueva alerta") -- acá sí se ve y se
// puede cambiar el bloque, a diferencia de crear una alerta nueva. ----
function abrirEditarNotificacion(id) {
  const n = notificaciones.find(x => x.id === id);
  if (!n) return;

  document.getElementById("notif-bloque-row")?.classList.remove("hidden");
  document.getElementById("notif-texto").value = n.titulo;
  document.getElementById("notif-destinatario").value = n.destinatario;
  document.getElementById("notif-fecha-hora").value = _isoAFechaHoraLocalInput(n.fechaHora);
  document.getElementById("notif-fecha-limite").value = n.fechaLimite || "";
  document.getElementById("notif-recordar-dias").value = n.recordarEnDias || "";

  const presetSelect = document.getElementById("notif-repetir-preset");
  if (n.tipo === "unica") {
    presetSelect.value = "no";
    document.getElementById("notif-repetir-custom-row")?.classList.add("hidden");
  } else {
    const unidad = n.unidad || UNIDAD_LEGADO_NOTIF[n.tipo] || "dia";
    const intervalo = parseInt(n.intervalo, 10) || 1;
    const presetEquivalente = `${unidad}:${intervalo}`;
    const esPreset = [...presetSelect.options].some(o => o.value === presetEquivalente);
    if (esPreset) {
      presetSelect.value = presetEquivalente;
      document.getElementById("notif-repetir-custom-row")?.classList.add("hidden");
    } else {
      presetSelect.value = "custom";
      document.getElementById("notif-repetir-custom-row")?.classList.remove("hidden");
      document.getElementById("notif-repetir-intervalo").value = intervalo;
      document.getElementById("notif-repetir-unidad").value = unidad;
    }
  }

  poblarSelectBloque();
  const bloqueValor = n.gastoFijo ? "__gastos_fijos__" : (n.categoria || "");
  document.getElementById("notif-bloque").value = bloqueValor;
  document.getElementById("notif-gasto-fijo-row")?.classList.toggle("hidden", bloqueValor !== "__gastos_fijos__");

  poblarSelectGastoFijo();
  const selGastoFijo = document.getElementById("notif-gasto-fijo");
  if (selGastoFijo) selGastoFijo.value = n.gastoFijo || "";

  const modal = document.getElementById("modal-notificacion");
  modal.dataset.editId = id;
  modal.querySelector(".modal-title").textContent = "Editar alerta";
  document.getElementById("btn-guardar-notificacion").textContent = "Guardar cambios";
  modal.classList.remove("hidden");
}

// Traduce el picker "Repetir" (presets + Personalizado, mismo patrón que
// Recordatorios de iPhone) a { tipo, intervalo, unidad } para guardar.
function _leerRepeticionDelForm() {
  const preset = document.getElementById("notif-repetir-preset").value;
  if (preset === "no") return { tipo: "unica", intervalo: "", unidad: "" };
  if (preset === "custom") {
    const intervalo = Math.max(1, parseInt(document.getElementById("notif-repetir-intervalo").value, 10) || 1);
    const unidad = document.getElementById("notif-repetir-unidad").value;
    return { tipo: "recurrente", intervalo, unidad };
  }
  const [unidad, intervalo] = preset.split(":");
  return { tipo: "recurrente", intervalo: parseInt(intervalo, 10) || 1, unidad };
}

async function guardarNotificacion() {
  const texto          = document.getElementById("notif-texto").value.trim();
  const { tipo, intervalo, unidad } = _leerRepeticionDelForm();
  const fechaHoraLocal  = document.getElementById("notif-fecha-hora").value;
  const fechaLimite     = document.getElementById("notif-fecha-limite").value;
  const destinatario    = document.getElementById("notif-destinatario").value;
  const bloqueSel       = document.getElementById("notif-bloque")?.value || "";
  const gastoFijo       = bloqueSel === "__gastos_fijos__" ? (document.getElementById("notif-gasto-fijo")?.value || "") : "";
  const categoria       = (bloqueSel && bloqueSel !== "__gastos_fijos__") ? bloqueSel : "";
  const recordarEnDias  = parseInt(document.getElementById("notif-recordar-dias")?.value, 10) || "";

  if (!texto || !fechaHoraLocal) {
    alert("Completa al menos el texto y la fecha/hora");
    return;
  }

  const fechaHoraISO = new Date(fechaHoraLocal).toISOString();
  const modal = document.getElementById("modal-notificacion");
  const editId = modal.dataset.editId;

  const btn = document.getElementById("btn-guardar-notificacion");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    if (!editId) {
      const estadoPush = await estadoSuscripcionPush();
      if (estadoPush !== "activo") {
        const activar = confirm("Todavía no activaste las alertas push en este dispositivo. ¿Activarlas ahora? (Sin esto, esta alerta se guarda pero no te va a avisar.)");
        if (activar) await activarNotificacionesPush();
      }
    }

    if (editId) {
      await Sheets.editarNotificacion(editId, {
        titulo: texto, tipo, fechaHora: fechaHoraISO, fechaLimite,
        destinatario, intervalo, unidad, gastoFijo, recordarEnDias, categoria
      });
    } else {
      await Sheets.agregarNotificacion(texto, tipo, fechaHoraISO, fechaLimite, destinatario, currentUser?.email || "", intervalo, unidad, gastoFijo, recordarEnDias, categoria);
    }
    modal.classList.add("hidden");
    limpiarFormNotificacion();
    await cargarNotificaciones();
    SyncManager.mostrarToast(`✅ "${texto}" ${editId ? "actualizada" : "programada"}`);
  } catch (err) {
    alert("Error guardando la alerta: " + err.message);
  } finally {
    btn.textContent = editId ? "Guardar cambios" : "Guardar"; btn.disabled = false;
  }
}

// =============================================
// BADGE + PANEL EN LA TOPBAR (mismo patrón que Recordatorios) — muestra
// las notificaciones "enviada" (ya dispararon, esperando revisión)
// =============================================

function renderNotificacionesBadge() {
  const btn   = document.getElementById("btn-notificaciones-badge");
  const count = document.getElementById("notificaciones-count");
  if (!btn || !count) return;
  const porRevisar = notificaciones.filter(n => n.estado === "enviada").length;
  count.textContent = porRevisar;
  btn.classList.toggle("hidden", porRevisar === 0);
  if (porRevisar === 0) document.getElementById("notificaciones-panel")?.classList.add("hidden");
}

function toggleNotificacionesPanel() {
  const panel = document.getElementById("notificaciones-panel");
  if (!panel) return;
  document.getElementById("dropdown-menu")?.classList.add("hidden");
  document.getElementById("recordatorios-panel")?.classList.add("hidden");
  const abierto = !panel.classList.contains("hidden");
  panel.classList.toggle("hidden", abierto);
  if (!abierto) renderNotificacionesPanel();
}

function renderNotificacionesPanel() {
  const panel = document.getElementById("notificaciones-panel");
  if (!panel) return;

  const porRevisar = notificaciones.filter(n => n.estado === "enviada");
  if (porRevisar.length === 0) {
    panel.innerHTML = `<div class="recordatorio-panel-vacio">No tienes alertas por revisar.</div>`;
    return;
  }

  panel.innerHTML = porRevisar.map(n => `
    <div class="recordatorio-item">
      <span class="recordatorio-item-icon">🔔</span>
      <div class="recordatorio-item-body">
        <div class="recordatorio-item-texto">${escapeHtml(n.titulo)}</div>
        <div class="recordatorio-item-fecha">${n.ultimoEnvio ? _formatoFechaHoraLocal(n.ultimoEnvio) : ""}</div>
      </div>
      <button class="btn-accion" title="Marcar como revisada" onclick="event.stopPropagation(); marcarNotificacionRevisada('${n.id}')">✅</button>
    </div>`).join("");
}

function setupNotificacionesListeners() {
  document.getElementById("btn-notificaciones-badge")?.addEventListener("click", toggleNotificacionesPanel);

  document.addEventListener("click", (e) => {
    const panel = document.getElementById("notificaciones-panel");
    const btn   = document.getElementById("btn-notificaciones-badge");
    if (!panel || panel.classList.contains("hidden")) return;
    if (panel.contains(e.target) || e.target === btn || btn?.contains(e.target)) return;
    panel.classList.add("hidden");
  });

  document.getElementById("btn-cancelar-notificacion")
    ?.addEventListener("click", () => {
      document.getElementById("modal-notificacion").classList.add("hidden");
      limpiarFormNotificacion();
    });

  document.getElementById("btn-guardar-notificacion")
    ?.addEventListener("click", guardarNotificacion);

  document.getElementById("notif-repetir-preset")
    ?.addEventListener("change", (e) => {
      document.getElementById("notif-repetir-custom-row")?.classList.toggle("hidden", e.target.value !== "custom");
    });

  document.getElementById("notif-bloque")
    ?.addEventListener("change", (e) => {
      document.getElementById("notif-gasto-fijo-row")?.classList.toggle("hidden", e.target.value !== "__gastos_fijos__");
    });

  // Elegir un gasto fijo pre-llena texto/destinatario/repetición con
  // valores sensatos (mensual, familia) -- todo sigue siendo editable
  // después, esto es solo para no partir de un formulario en blanco.
  document.getElementById("notif-gasto-fijo")
    ?.addEventListener("change", (e) => {
      const concepto = e.target.value;
      if (!concepto) return;
      const texto = document.getElementById("notif-texto");
      if (!texto.value.trim()) texto.value = `Pagar ${concepto}`;
      document.getElementById("notif-destinatario").value = "familia";
      const preset = document.getElementById("notif-repetir-preset");
      if (preset.value === "no") {
        preset.value = "mes:1";
        document.getElementById("notif-repetir-custom-row")?.classList.add("hidden");
      }
    });

  document.getElementById("btn-activar-push")
    ?.addEventListener("click", activarNotificacionesPush);

  document.getElementById("btn-suscribir-calendario")
    ?.addEventListener("click", suscribirCalendario);

  // Cerrar tocando el fondo ya lo cubre el listener genérico de app.js
  // (ver cerrarModal, que ya sabe llamar a limpiarFormNotificacion para este modal).

  document.getElementById("btn-guardar-bloque-alerta")
    ?.addEventListener("click", async () => {
      const nombre = document.getElementById("bloque-alerta-nombre").value.trim();
      const icono  = document.getElementById("bloque-alerta-icono").value.trim();
      if (!nombre) { alert("Ponle un nombre al bloque"); return; }
      if (nombre === "Gastos fijos") { alert('"Gastos fijos" ya existe y es fijo -- elige otro nombre.'); return; }
      const btn = document.getElementById("btn-guardar-bloque-alerta");
      const textoOriginal = btn.textContent;
      btn.disabled = true; btn.textContent = "Guardando...";
      try {
        const ok = await agregarBloqueAlerta(nombre, icono);
        if (!ok) { alert("Ya existe un bloque con ese nombre"); return; }
        document.getElementById("modal-bloque-alerta")?.classList.add("hidden");
        renderNotificaciones();
      } catch (err) {
        alert("Error guardando el bloque: " + err.message);
      } finally {
        btn.disabled = false; btn.textContent = textoOriginal;
      }
    });

  document.getElementById("btn-cancelar-bloque-alerta")
    ?.addEventListener("click", () => {
      document.getElementById("modal-bloque-alerta")?.classList.add("hidden");
    });

  document.getElementById("btn-resumen-revisado")
    ?.addEventListener("click", () => {
      const id = document.getElementById("modal-resumen-notificacion")?.dataset.id;
      document.getElementById("modal-resumen-notificacion")?.classList.add("hidden");
      if (id) marcarNotificacionRevisada(id);
    });

  document.getElementById("btn-cerrar-resumen-notificacion")
    ?.addEventListener("click", () => {
      document.getElementById("modal-resumen-notificacion")?.classList.add("hidden");
    });

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupNotificacionesListeners);
} else {
  setTimeout(setupNotificacionesListeners, 0);
}

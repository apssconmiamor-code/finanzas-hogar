// =============================================
// MÓDULO RECORDATORIOS — notas rápidas de movimiento (texto/foto/audio)
// =============================================
// Hoja "Recordatorios" en Google Sheets:
// A: id | B: fecha | C: autor | D: texto | E: imageUrl | F: audioUrl
// G: categoria (opcional) — bloque asociado al recordatorio, si lo trae
//    (ver el parámetro "categoria" de abrirModalCrearRecordatorio).
// Un recordatorio puede tener foto Y audio al mismo tiempo (no son excluyentes).
// La foto/audio en sí se sube a Google Drive (Sheets no soporta binarios);
// en la hoja solo quedan los links. El archivo en Drive queda con permiso
// "cualquiera con el link puede ver", para que se pueda ver desde cualquier
// dispositivo sin importar con qué cuenta de Google se inició sesión.

// ---- EXTENSIÓN DE Sheets PARA RECORDATORIOS ----

Sheets._recordatoriosHojaLista = false;

Sheets._asegurarHojaRecordatorios = async function () {
  if (this._recordatoriosHojaLista) return;
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const existe = meta.sheets.some(s => s.properties.title === CONFIG.SHEETS.RECORDATORIOS);

  if (!existe) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CONFIG.SHEETS.RECORDATORIOS } } }] })
      }
    );
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.RECORDATORIOS + "!A1")}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["id", "fecha", "autor", "texto", "imageUrl", "audioUrl", "categoria"]] })
      }
    );
  } else {
    // Migración liviana (mismo patrón que Notificaciones): hojas creadas
    // antes de que existiera "categoria" no la tienen en el encabezado.
    const encabezado = await this.leer(`${CONFIG.SHEETS.RECORDATORIOS}!G1`);
    if (!encabezado[0] || !encabezado[0][0]) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.RECORDATORIOS + "!G1")}?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [["categoria"]] })
        }
      );
    }
  }
  this._recordatoriosHojaLista = true;
};

Sheets.getRecordatorios = async function () {
  await this._asegurarHojaRecordatorios();
  const rows = await this.leer(`${CONFIG.SHEETS.RECORDATORIOS}!A2:G`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:       r[0] || "",
    fecha:    Sheets._serialToDate(r[1]),
    autor:    r[2] || "",
    texto:    r[3] || "",
    imageUrl: r[4] || "",
    audioUrl: r[5] || "",
    categoria: r[6] || ""
  }));
};

// Bug real reportado: crear un recordatorio sin conexión tiraba un error
// 503 sin manejar — a diferencia de movimientos/presupuesto (ver
// sheets-offline.js), agregarRecordatorio nunca estaba conectado al
// sistema de cola offline. Se corrige acá (no en sheets-offline.js) porque
// ese archivo carga ANTES que este en index.html — Sheets.agregarRecordatorio
// todavía no existiría para parchear en ese momento.
Sheets._agregarRecordatorioDirecto = async function (id, autor, fecha, texto, imageUrl = "", audioUrl = "", categoria = "") {
  await this._asegurarHojaRecordatorios();
  await this.agregar(CONFIG.SHEETS.RECORDATORIOS, [id, fecha, autor, texto, imageUrl, audioUrl, categoria]);
  return id;
};

// mediaPendiente (opcional): { foto: {data,type}|null, audio: {data,type}|null } —
// foto/audio que no se pudieron subir a Drive por falta de conexión. Igual
// que con movimientos, se guardan en la cola de IndexedDB tal cual
// (dataURL) y sync.js las sube de verdad cuando vuelve la conexión, antes
// de escribir la fila (ver ejecutarOperacion en sync.js).
Sheets.agregarRecordatorio = async function (id, autor, fecha, texto, imageUrl = "", audioUrl = "", mediaPendiente = null, categoria = "") {
  return Sheets._intentarOEncolar(
    () => Sheets._agregarRecordatorioDirecto(id, autor, fecha, texto, imageUrl, audioUrl, categoria),
    { tipo: "AGREGAR_RECORDATORIO", id, autor, fecha, texto, imageUrl, audioUrl, mediaPendiente, categoria }
  );
};

Sheets.borrarRecordatorio = async function (id) {
  const rows = await this.leer(`${CONFIG.SHEETS.RECORDATORIOS}!A2:A`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) return;
  const sheetRowIndex = rowIndex + 1;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === CONFIG.SHEETS.RECORDATORIOS);
  if (!sheet) return;
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
  if (!res.ok) throw new Error(`Error borrando recordatorio: ${res.status}`);
  return res.json();
};

// =============================================
// ESTADO Y CARGA
// =============================================

window.recordatorios = window.recordatorios || [];

async function cargarRecordatorios() {
  try {
    recordatorios = await Sheets.getRecordatorios();
    localStorage.setItem("cache_recordatorios", JSON.stringify(recordatorios));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem("cache_recordatorios");
    if (cache) { try { recordatorios = JSON.parse(cache); } catch {} }
  }
  renderRecordatorioBadge();
}

// =============================================
// BADGE + PANEL (pantalla de Inicio / Cuentas)
// =============================================

function renderRecordatorioBadge() {
  const btn   = document.getElementById("btn-recordatorios-badge");
  const count = document.getElementById("recordatorios-count");
  if (!btn || !count) return;
  const pendientes = recordatorios.length;
  count.textContent = pendientes;
  btn.classList.toggle("hidden", pendientes === 0);
  if (pendientes === 0) document.getElementById("recordatorios-panel")?.classList.add("hidden");
}

function toggleRecordatoriosPanel() {
  const panel = document.getElementById("recordatorios-panel");
  if (!panel) return;
  document.getElementById("dropdown-menu")?.classList.add("hidden");
  const abierto = !panel.classList.contains("hidden");
  panel.classList.toggle("hidden", abierto);
  if (!abierto) renderRecordatoriosPanel();
}

function renderRecordatoriosPanel() {
  const panel = document.getElementById("recordatorios-panel");
  if (!panel) return;

  if (recordatorios.length === 0) {
    panel.innerHTML = `<div class="recordatorio-panel-vacio">No tienes recordatorios guardados.</div>`;
    return;
  }

  const orden = [...recordatorios].sort((a, b) => b.fecha.localeCompare(a.fecha));

  panel.innerHTML = orden.map(r => {
    const iconos = `${r.imageUrl ? "📷" : ""}${r.audioUrl ? "🎤" : ""}` || "📝";
    const resumen = r.texto
      ? (r.texto.length > 60 ? r.texto.slice(0, 60) + "…" : r.texto)
      : [r.imageUrl && "Foto adjunta", r.audioUrl && "Audio adjunto"].filter(Boolean).join(" · ");
    return `
      <div class="recordatorio-item" onclick="abrirRecordatorioComoMovimiento('${r.id}')">
        <span class="recordatorio-item-icon">${iconos}</span>
        <div class="recordatorio-item-body">
          <div class="recordatorio-item-texto">${escapeHtml(resumen)}</div>
          <div class="recordatorio-item-fecha">${escapeHtml(r.fecha)}</div>
        </div>
        <button class="btn-accion btn-borrar" title="Eliminar" onclick="event.stopPropagation(); borrarRecordatorio('${r.id}')">🗑️</button>
      </div>`;
  }).join("");
}

// Borra en Drive la foto y/o el audio de un recordatorio (los que existan)
async function borrarMediaRecordatorio(r) {
  if (!r) return;
  if (r.imageUrl) await Sheets.borrarArchivoDrive(Sheets.idDesdeUrlDrive(r.imageUrl));
  if (r.audioUrl) await Sheets.borrarArchivoDrive(Sheets.idDesdeUrlDrive(r.audioUrl));
}

async function borrarRecordatorio(id) {
  if (!confirm("¿Eliminar este recordatorio?")) return;
  const r = recordatorios.find(x => x.id === id);
  try {
    await Sheets.borrarRecordatorio(id);
  } catch (err) {
    console.warn("No se pudo borrar el recordatorio de Sheets:", err);
  }
  await borrarMediaRecordatorio(r);
  recordatorios = recordatorios.filter(r => r.id !== id);
  localStorage.setItem("cache_recordatorios", JSON.stringify(recordatorios));
  renderRecordatorioBadge();
  renderRecordatoriosPanel();
}

// =============================================
// MODAL CREAR RECORDATORIO (texto / imagen / audio)
// =============================================

// La ventana de crear un recordatorio (texto / foto / audio) es React: react/src/recordatorios/Recordatorios.jsx.
// Acá quedan el permiso del micrófono y guardar (subir a Drive + Sheets).
let recAudioStream = null; // se reutiliza mientras la ventana está abierta para no repetir el permiso

// { texto, categoria } opcionales -- permiten pre-llenar el recordatorio
// (ej. con el bloque de una alerta) al invocar esta función desde otro módulo.
function abrirModalCrearRecordatorio({ texto = "", categoria = "" } = {}) {
  document.dispatchEvent(new CustomEvent("recordatorios:abrir", { detail: { texto, categoria } }));
}

// Suelta el micrófono (la ventana lo llama al cerrarse).
function liberarMicrofono() {
  if (recAudioStream) {
    recAudioStream.getTracks().forEach(t => t.stop());
    recAudioStream = null;
  }
}

// Consigue el stream del micrófono pidiendo permiso una sola vez por sesión:
// reutiliza el stream mientras siga vivo y, si el navegador permite consultar
// el estado del permiso sin disparar el diálogo, lo hace primero para no
// llamar a getUserMedia de más. Una vez el usuario concede el permiso, ni el
// navegador ni esta función vuelven a pedirlo mientras la app siga abierta.
// (En iPhone, que dentro de la MISMA sesión no repita el permiso depende de
// esto; que no lo repita al cerrar y volver a abrir la app depende de que
// iOS recuerde el permiso del sitio — eso ya es una decisión del sistema
// operativo, no algo que el código de la app pueda forzar.)
async function obtenerStreamMicrofono() {
  const activo = recAudioStream?.getAudioTracks().some(t => t.readyState === "live");
  if (activo) return recAudioStream;

  try {
    if (navigator.permissions?.query) {
      const estado = await navigator.permissions.query({ name: "microphone" });
      if (estado.state === "denied") {
        throw Object.assign(new Error("Permiso de micrófono denegado"), { name: "NotAllowedError" });
      }
    }
  } catch (e) {
    if (e.name === "NotAllowedError") throw e;
    // Safari/iOS no soporta consultar "microphone" con la Permissions API — seguimos igual
  }

  recAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStorage.setItem("mic_permiso_otorgado", "1");
  return recAudioStream;
}

// Guarda un recordatorio (la ventana ya validó que haya algo). Devuelve true si quedó guardado; si
// falla avisa acá mismo y devuelve false (la ventana se queda abierta).
async function guardarRecordatorioDatos({ texto, foto, audio, categoria }) {
  const id    = "R" + Date.now();
  const fecha = new Date().toISOString().split("T")[0];
  let imageUrl = "";
  let audioUrl = "";
  let mediaPendiente = null;

  try {
    if ((foto || audio) && !navigator.onLine) {
      // Sin conexión: la foto/audio se guardan tal cual (dataURL) en la cola
      // de sincronización — sync.js las sube de verdad a Drive apenas
      // vuelve la conexión, antes de escribir la fila (ver ejecutarOperacion
      // en sync.js). Antes esto tiraba un error 503 sin manejar porque
      // agregarRecordatorio nunca estaba conectado a esa cola.
      mediaPendiente = {
        foto: foto ? { data: foto.data, type: foto.type } : null,
        audio: audio ? { data: audio.data, type: audio.type } : null
      };
      SyncManager.mostrarToast("💾 Sin conexión — la foto/audio se guardaron localmente y se subirán al reconectar", "warn");
    } else {
      if (foto) {
        const ext = foto.type.includes("png") ? "png" : "jpg";
        const { url } = await Sheets.subirArchivoDrive(foto.data, `recordatorio-${id}-foto.${ext}`, foto.type);
        imageUrl = url;
      }
      if (audio) {
        const { url } = await Sheets.subirArchivoDrive(audio.data, `recordatorio-${id}-audio.webm`, audio.type);
        audioUrl = url;
      }
    }
    await Sheets.agregarRecordatorio(id, currentUser.email, fecha, texto, imageUrl, audioUrl, mediaPendiente, categoria);

    recordatorios.unshift({ id, fecha, autor: currentUser.email, texto, imageUrl, audioUrl, categoria });
    localStorage.setItem("cache_recordatorios", JSON.stringify(recordatorios));

    renderRecordatorioBadge();
    SyncManager.mostrarToast("✅ Recordatorio guardado");
    return true;
  } catch (err) {
    if (err.message === "DRIVE_SIN_PERMISO") {
      alert("Necesitas volver a iniciar sesión para subir archivos a Drive (se agregó un permiso nuevo). Cierra sesión y entra de nuevo.");
    } else if (err.message === "DRIVE_SIN_PERMISO_PUBLICO") {
      alert("El archivo se subió a Drive, pero Google no dejó hacerlo visible con el link (puede ser una restricción de tu cuenta/organización). No se guardó el recordatorio — intenta de nuevo o guárdalo solo con texto.");
    } else {
      alert("Error guardando el recordatorio: " + err.message);
    }
    return false;
  }
}

function renderRecordatoriosReact() {
  if (!window.RecordatoriosReact) return;
  window.RecordatoriosReact.render({
    obtenerStream: obtenerStreamMicrofono,
    liberarMicrofono,
    onGuardar: guardarRecordatorioDatos,
  });
}

// =============================================
// ABRIR RECORDATORIO COMO MOVIMIENTO
// =============================================

async function abrirRecordatorioComoMovimiento(id) {
  const r = recordatorios.find(x => x.id === id);
  if (!r) return;

  document.getElementById("recordatorios-panel")?.classList.add("hidden");
  if (typeof window.navegarATab === "function") window.navegarATab("movimientos");

  // El formulario de movimiento (React) se abre con la fecha y el texto del recordatorio, y con un
  // bloque que muestra el recordatorio (texto, foto, audio). Al guardarlo, el recordatorio se elimina.
  document.dispatchEvent(new CustomEvent("movimiento:abrir", { detail: {
    modo: "nuevo",
    inicial: { fecha: r.fecha, descripcion: r.texto || "" },
    titulo: "Nuevo movimiento (desde recordatorio)",
    bloqueInfo: { html: htmlInfoRecordatorio(r), alMontar: bloque => cargarMediaInfoRecordatorio(bloque, r) },
    despuesDeGuardar: async () => {
      try {
        await Sheets.borrarRecordatorio(id);
      } catch (err) {
        console.warn("No se pudo borrar el recordatorio de Sheets:", err);
      }
      await borrarMediaRecordatorio(r);
      recordatorios = recordatorios.filter(x => x.id !== id);
      localStorage.setItem("cache_recordatorios", JSON.stringify(recordatorios));
      renderRecordatorioBadge();
      SyncManager.mostrarToast("✅ Movimiento registrado y recordatorio eliminado");
    },
  } }));
}

function htmlInfoRecordatorio(r) {
  return `
    <div class="recordatorio-info-titulo">📝 Recordatorio del ${escapeHtml(r.fecha)}</div>
    ${r.texto ? `<div class="recordatorio-info-texto">${escapeHtml(r.texto)}</div>` : ""}
    ${r.imageUrl ? `<img class="recordatorio-info-imagen" alt="foto del recordatorio"/>` : ""}
    ${r.imageUrl ? `<div class="recordatorio-media-status" data-media="imagen">Cargando foto…</div>` : ""}
    ${r.audioUrl ? `<audio controls class="recordatorio-info-audio"></audio>` : ""}
    ${r.audioUrl ? `<div class="recordatorio-media-status" data-media="audio">Cargando audio…</div>` : ""}
  `;
}

// La foto y el audio del recordatorio se bajan de Drive una vez que el bloque ya está en pantalla.
async function cargarMediaInfoRecordatorio(bloque, r) {
  if (r.imageUrl) {
    const img = bloque.querySelector(".recordatorio-info-imagen");
    const status = bloque.querySelector('[data-media="imagen"]');
    try {
      img.src = await Sheets.obtenerBlobUrlDrive(Sheets.idDesdeUrlDrive(r.imageUrl));
      status.remove();
    } catch (err) {
      status.textContent = "No se pudo cargar la foto (" + err.message + ")";
    }
  }
  if (r.audioUrl) {
    const audio = bloque.querySelector(".recordatorio-info-audio");
    const status = bloque.querySelector('[data-media="audio"]');
    try {
      audio.src = await Sheets.obtenerBlobUrlDrive(Sheets.idDesdeUrlDrive(r.audioUrl));
      status.remove();
    } catch (err) {
      status.textContent = "No se pudo cargar el audio (" + err.message + ")";
    }
  }
}

// =============================================
// SETUP LISTENERS
// =============================================

function setupRecordatoriosListeners() {
  document.getElementById("btn-recordatorios-badge")?.addEventListener("click", toggleRecordatoriosPanel);

  // Las acciones rápidas (menú, usar, configurar) y la ventana de crear recordatorio son React.
  renderAccionesReact();
  renderRecordatoriosReact();

  // Cerrar el panel de recordatorios al tocar afuera -- pointerup, no
  // click (mismo motivo que el panel de Alertas en notificaciones.js: el
  // bloqueo de zoom en index.html suprime la síntesis de click de un
  // toque puntual en iOS Safari real).
  document.addEventListener("pointerup", (e) => {
    const panel = document.getElementById("recordatorios-panel");
    const btn   = document.getElementById("btn-recordatorios-badge");
    if (!panel || panel.classList.contains("hidden")) return;
    if (panel.contains(e.target) || e.target === btn || btn?.contains(e.target)) return;
    panel.classList.add("hidden");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupRecordatoriosListeners);
} else {
  setTimeout(setupRecordatoriosListeners, 0);
}

// =============================================
// ACCIONES RÁPIDAS — movimientos preconfigurados (categoría + concepto + caja),
// que solo piden el monto al usarse. La interfaz (menú, usar y configurar)
// ahora es React (react/src/acciones); acá quedan los datos y Sheets. Se
// pueden agregar tantas como se quiera (ya no hay tope de 3). Se guardan
// del lado del servidor (Sheets, ver Sheets.getConfigUsuario/
// guardarConfigUsuario), por email de quien las creó -- así si Royer las
// configura en su celular y después abre la app en otro dispositivo, las
// ve exactamente igual (antes vivían solo en el localStorage de un
// dispositivo puntual -- bug real reportado). Se cachea en memoria +
// localStorage como respaldo para no depender de la red en cada toque.
// =============================================

let accionesRapidas = []; // cache en memoria, la llena cargarAccionesRapidas() al abrir la app

function _accionesRapidasCacheKey() {
  return `cache_acciones_rapidas_${currentUser?.email || "anon"}`;
}

async function cargarAccionesRapidas() {
  try {
    let valor = await Sheets.getConfigUsuario(currentUser.email, "acciones_rapidas");
    if (valor === null) {
      // Antes de esta función, las acciones rápidas vivían en localStorage
      // bajo una clave fija (sin email, sin servidor) -- si hay algo ahí y
      // Sheets todavía no tiene nada para este usuario, es la primera vez
      // que corre este código: se migran una sola vez para no perder lo
      // que la familia ya tenía configurado.
      const viejo = localStorage.getItem("acciones_rapidas");
      if (viejo) {
        try {
          const arr = JSON.parse(viejo).filter(Boolean);
          if (arr.length > 0) { valor = arr; await Sheets.guardarConfigUsuario(currentUser.email, "acciones_rapidas", arr); }
        } catch {}
      }
    }
    accionesRapidas = Array.isArray(valor) ? valor : [];
    localStorage.setItem(_accionesRapidasCacheKey(), JSON.stringify(accionesRapidas));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem(_accionesRapidasCacheKey());
    if (cache) { try { accionesRapidas = JSON.parse(cache); } catch { accionesRapidas = []; } }
  }
  renderAccionesReact();
}

function obtenerAccionesRapidas() {
  return accionesRapidas;
}

async function _guardarAccionesRapidas(lista) {
  accionesRapidas = lista;
  localStorage.setItem(_accionesRapidasCacheKey(), JSON.stringify(lista));
  renderAccionesReact();   // la interfaz ya ve la lista nueva sin esperar a Sheets
  await Sheets.guardarConfigUsuario(currentUser.email, "acciones_rapidas", lista);
}

// ---- Interfaz en React (react/src/acciones) ----
// El menú del rayo ⚡ "Nuevo movimiento" de Inicio abre las acciones rápidas.
function abrirMenuAcciones() {
  document.dispatchEvent(new CustomEvent("acciones:abrir"));
}

function renderAccionesReact() {
  if (!window.AccionesReact) return;
  window.AccionesReact.render({
    acciones: obtenerAccionesRapidas(),
    // Se leen al abrir (no una copia vieja): "cajas" puede llegar de la red después.
    getCajas: () => {
      if (typeof cajas !== "undefined" && cajas.length === 0) {
        try {
          const cache = localStorage.getItem("cache_cajas");
          if (cache) cajas = JSON.parse(cache);
        } catch {}
      }
      return typeof cajas !== "undefined" ? cajas : [];
    },
    cajaVisible: (c) => cajaVisibleParaUsuario(c, currentUser?.email),
    getConceptos: (categoria) =>
      categoria === "Gasto fijo" ? GASTOS_FIJOS
      : categoria === "Gasto variable" ? GASTOS_VARIABLES
      : categoria === "Ingreso" ? FUENTES_INGRESO
      : [],
    iconoCaja: (nombre) => (typeof iconoCajaImagen === "function" ? iconoCajaImagen(nombre) : null),
    evaluarMonto: (texto) => (typeof evaluarMonto === "function" ? evaluarMonto(texto) : parseFloat(texto)),
    onGuardarLista: _guardarAccionesRapidas,
    onRegistrar: registrarAccionRapida,
    onAbrirRecordatorio: () => abrirModalCrearRecordatorio(),
  });
}

// Crea el/los movimiento(s) de una acción rápida. "datos" viene de la ventana de usar:
//   { monto, descripcion, tipoCambio, foto, caja, origen, destino }
// (caja: la elegida en Ingreso/Gasto; origen/destino: las elegidas en una Transferencia).
async function registrarAccionRapida(accion, { monto, descripcion, tipoCambio, foto, caja, origen, destino }) {
  const hoy = new Date().toISOString().split("T")[0];
  let recibo = "";
  if (accion.camara && foto) {
    const ext = foto.type.includes("png") ? "png" : "jpg";
    const { url } = await Sheets.subirArchivoDrive(foto.data, `accion-${accion.nombre}-${Date.now()}.${ext}`, foto.type);
    recibo = url;
  }
  if (accion.categoria === "Transferencia") {
    const montoDestino = tipoCambio ? monto * tipoCambio : monto;
    const descOrigen = tipoCambio
      ? `TC: 1 = ${tipoCambio}${descripcion ? " — " + descripcion : ""}`
      : descripcion;
    await Sheets.agregarMovimiento(
      currentUser.email, hoy, `Transferencia → ${destino}`,
      "Transferencia", origen, monto, descOrigen, recibo
    );
    await Sheets.agregarMovimientoIngreso(
      currentUser.email, hoy, `Transferencia ← ${origen}`,
      "Transferencia", destino, montoDestino, descOrigen
    );
  } else if (accion.categoria === "Ingreso") {
    await Sheets.agregarMovimientoIngreso(currentUser.email, hoy, accion.concepto, accion.categoria, caja, monto, descripcion, recibo);
  } else {
    await Sheets.agregarMovimiento(currentUser.email, hoy, accion.concepto, accion.categoria, caja, monto, descripcion, recibo);
  }
  // Lo siguiente no demora el cierre de la ventana de usar.
  Promise.resolve().then(async () => {
    if (typeof SyncManager !== "undefined") SyncManager.mostrarToast(`✅ ${accion.nombre} registrado`);
    if (typeof cargarTodo === "function") await cargarTodo();
  });
}

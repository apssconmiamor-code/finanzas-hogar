// =============================================
// MÓDULO NOTIFICACIONES — recordatorios por Web Push
// =============================================
// Hoja "Notificaciones" en Google Sheets (se crea sola, igual que
// Suscripciones/Recordatorios):
// A: id | B: titulo | C: mensaje | D: tipo (unica/diaria/semanal/mensual)
// E: fecha_hora (ISO UTC — el ancla: para "unica" es cuándo dispara, para
//    las recurrentes de ahí se sacan la hora y el día-de-semana/mes)
// F: fecha_limite (YYYY-MM-DD, opcional — solo aplica a las recurrentes)
// G: destinatario ("yo" | "familia") | H: autor | I: estado (activa/cancelada)
// J: ultimo_envio (ISO UTC, lo actualiza el Worker — no se toca desde acá)
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
        body: JSON.stringify({ values: [["id", "titulo", "mensaje", "tipo", "fecha_hora", "fecha_limite", "destinatario", "autor", "estado", "ultimo_envio"]] })
      }
    );
  }
  this._notificacionesHojaLista = true;
};

Sheets.getNotificaciones = async function () {
  await this._asegurarHojaNotificaciones();
  const rows = await this.leer(`${CONFIG.SHEETS.NOTIFICACIONES}!A2:J`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:           r[0] || "",
    titulo:       r[1] || "",
    mensaje:      r[2] || "",
    tipo:         r[3] || "unica",
    fechaHora:    r[4] || "",
    fechaLimite:  r[5] || "",
    destinatario: r[6] || "yo",
    autor:        r[7] || "",
    estado:       r[8] || "activa",
    ultimoEnvio:  r[9] || ""
  }));
};

Sheets.agregarNotificacion = async function (titulo, mensaje, tipo, fechaHoraISO, fechaLimite, destinatario, autor) {
  await this._asegurarHojaNotificaciones();
  const id = "N" + Date.now();
  await this.agregar(CONFIG.SHEETS.NOTIFICACIONES, [id, titulo, mensaje, tipo, fechaHoraISO, fechaLimite || "", destinatario, autor, "activa", ""]);
  return id;
};

Sheets._escribirFilaNotificacion = async function (id, campos) {
  const rows = await this.leer(`${CONFIG.SHEETS.NOTIFICACIONES}!A2:J`);
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
    actual[9] || ""
  ];
  const range = `${CONFIG.SHEETS.NOTIFICACIONES}!A${sheetRow}:J${sheetRow}`;
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
    alert("Este navegador no soporta notificaciones push.");
    return false;
  }
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    SyncManager.mostrarToast("🔕 No se activaron las notificaciones (permiso no concedido)", "warn");
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

    SyncManager.mostrarToast("🔔 Notificaciones activadas en este dispositivo");
    return true;
  } catch (err) {
    console.warn("Error activando notificaciones push:", err);
    alert("No se pudo activar las notificaciones: " + err.message);
    return false;
  }
}

// =============================================
// LÓGICA DE UI
// =============================================

window.notificaciones = window.notificaciones || [];

const TIPOS_NOTIFICACION = {
  unica:   "Única vez",
  diaria:  "Diaria",
  semanal: "Semanal",
  mensual: "Mensual"
};

async function cargarNotificaciones() {
  try {
    notificaciones = await Sheets.getNotificaciones();
    localStorage.setItem("cache_notificaciones", JSON.stringify(notificaciones));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem("cache_notificaciones");
    if (cache) { try { notificaciones = JSON.parse(cache); } catch {} }
  }
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

function renderNotificaciones() {
  const lista = document.getElementById("notificaciones-list");
  if (!lista) return;

  const porRevisar  = notificaciones.filter(n => n.estado === "enviada");
  const activas     = notificaciones.filter(n => n.estado === "activa");
  const canceladas  = notificaciones.filter(n => n.estado === "cancelada");

  if (notificaciones.length === 0) {
    lista.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔔</div>
        <div class="empty-state-text">No tienes notificaciones programadas. Crea una para que te avise aunque la app esté cerrada.</div>
      </div>`;
    return;
  }

  const renderItem = (n) => `
    <div class="notificacion-item" data-id="${n.id}">
      <div class="notif-body">
        <div class="notif-top">
          <div class="notif-info">
            <span class="notif-titulo">${escapeHtml(n.titulo)}</span>
            <span class="notif-tipo-badge">${TIPOS_NOTIFICACION[n.tipo] || n.tipo}</span>
            <span class="notif-dest-badge">${n.destinatario === "familia" ? "👨‍👩‍👧 Familia" : "👤 Solo yo"}</span>
            ${n.estado === "enviada" ? `<span class="notif-dest-badge notif-enviada-badge">📩 Por revisar</span>` : ""}
            ${n.estado === "cancelada" ? `<span class="notif-dest-badge notif-cancelada-badge">Cancelada</span>` : ""}
          </div>
        </div>
        ${n.mensaje ? `<div class="notif-mensaje">${escapeHtml(n.mensaje)}</div>` : ""}
        <div class="notif-fechas">
          <span>🗓️ ${n.tipo === "unica" ? "Dispara" : "Empieza"}: ${_formatoFechaHoraLocal(n.fechaHora)}</span>
          ${n.fechaLimite ? `<span>⏳ Hasta: ${escapeHtml(n.fechaLimite)}</span>` : ""}
          ${n.ultimoEnvio ? `<span>✅ Último envío: ${_formatoFechaHoraLocal(n.ultimoEnvio)}</span>` : ""}
        </div>
        <div class="notif-acciones">
          ${n.estado === "activa" ? `<button class="btn-secondary" onclick="cancelarNotificacion('${n.id}')">🚫 Cancelar</button>` : ""}
          ${n.estado === "enviada" ? `<button class="btn-primary" onclick="marcarNotificacionRevisada('${n.id}')">✅ Revisado</button>` : ""}
          <button class="btn-accion btn-borrar" title="Eliminar" onclick="borrarNotificacion('${n.id}')">🗑️</button>
        </div>
      </div>
    </div>`;

  let html = "";
  if (porRevisar.length > 0) {
    html += `<div class="prestamos-seccion-title">Por revisar (${porRevisar.length})</div>`;
    html += porRevisar.map(renderItem).join("");
  }
  html += activas.map(renderItem).join("");
  if (canceladas.length > 0) {
    html += `<div class="prestamos-seccion-title pagados-title">Canceladas (${canceladas.length})</div>`;
    html += canceladas.map(renderItem).join("");
  }
  lista.innerHTML = html;
}

async function cancelarNotificacion(id) {
  const n = notificaciones.find(x => x.id === id);
  if (!n) return;
  if (!confirm(`¿Cancelar "${n.titulo}"? Ya no te va a avisar.`)) return;
  try {
    await Sheets.editarNotificacion(id, { estado: "cancelada" });
    await cargarNotificaciones();
    SyncManager.mostrarToast(`🚫 "${n.titulo}" cancelada`);
  } catch (err) {
    alert("Error cancelando la notificación: " + err.message);
  }
}

// Notificaciones de una sola vez no se cancelan solas al dispararse (ver
// worker/src/push.js) -- se quedan en "enviada" hasta que alguien las
// revisa acá. Recién ahí pasan a "cancelada" (su estado final).
async function marcarNotificacionRevisada(id) {
  const n = notificaciones.find(x => x.id === id);
  if (!n) return;
  try {
    await Sheets.editarNotificacion(id, { estado: "cancelada" });
    await cargarNotificaciones();
    SyncManager.mostrarToast(`✅ "${n.titulo}" revisada`);
  } catch (err) {
    alert("Error marcando la notificación como revisada: " + err.message);
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
    alert("Error borrando la notificación: " + err.message);
  }
}

function limpiarFormNotificacion() {
  document.getElementById("notif-titulo").value = "";
  document.getElementById("notif-mensaje").value = "";
  document.getElementById("notif-tipo").value = "unica";
  document.getElementById("notif-destinatario").value = "yo";
  const ahora = new Date(Date.now() + 5 * 60000); // +5 min, para que no quede en el pasado por defecto
  document.getElementById("notif-fecha-hora").value = ahora.toISOString().slice(0, 16);
  document.getElementById("notif-fecha-limite").value = "";
}

async function guardarNotificacion() {
  const titulo         = document.getElementById("notif-titulo").value.trim();
  const mensaje         = document.getElementById("notif-mensaje").value.trim();
  const tipo            = document.getElementById("notif-tipo").value;
  const fechaHoraLocal  = document.getElementById("notif-fecha-hora").value;
  const fechaLimite     = document.getElementById("notif-fecha-limite").value;
  const destinatario    = document.getElementById("notif-destinatario").value;

  if (!titulo || !fechaHoraLocal) {
    alert("Completa al menos el título y la fecha/hora");
    return;
  }

  const fechaHoraISO = new Date(fechaHoraLocal).toISOString();

  const btn = document.getElementById("btn-guardar-notificacion");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    const estadoPush = await estadoSuscripcionPush();
    if (estadoPush !== "activo") {
      const activar = confirm("Todavía no activaste las notificaciones push en este dispositivo. ¿Activarlas ahora? (Sin esto, esta notificación se guarda pero no te va a avisar.)");
      if (activar) await activarNotificacionesPush();
    }

    await Sheets.agregarNotificacion(titulo, mensaje, tipo, fechaHoraISO, fechaLimite, destinatario, currentUser?.email || "");
    document.getElementById("modal-notificacion").classList.add("hidden");
    limpiarFormNotificacion();
    await cargarNotificaciones();
    SyncManager.mostrarToast(`✅ "${titulo}" programada`);
  } catch (err) {
    alert("Error guardando la notificación: " + err.message);
  } finally {
    btn.textContent = "Guardar"; btn.disabled = false;
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
    panel.innerHTML = `<div class="recordatorio-panel-vacio">No tienes notificaciones por revisar.</div>`;
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

  document.getElementById("btn-nueva-notificacion")
    ?.addEventListener("click", () => {
      limpiarFormNotificacion();
      document.getElementById("modal-notificacion").classList.remove("hidden");
    });

  document.getElementById("btn-cancelar-notificacion")
    ?.addEventListener("click", () => {
      document.getElementById("modal-notificacion").classList.add("hidden");
      limpiarFormNotificacion();
    });

  document.getElementById("btn-guardar-notificacion")
    ?.addEventListener("click", guardarNotificacion);

  document.getElementById("btn-activar-push")
    ?.addEventListener("click", activarNotificacionesPush);

  document.getElementById("modal-notificacion")
    ?.addEventListener("click", (e) => {
      if (e.target === document.getElementById("modal-notificacion")) {
        document.getElementById("modal-notificacion").classList.add("hidden");
        limpiarFormNotificacion();
      }
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupNotificacionesListeners);
} else {
  setTimeout(setupNotificacionesListeners, 0);
}

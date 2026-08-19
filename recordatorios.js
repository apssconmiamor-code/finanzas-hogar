// =============================================
// MÓDULO RECORDATORIOS — notas rápidas de movimiento (texto/foto/audio)
// =============================================
// Hoja "Recordatorios" en Google Sheets:
// A: id | B: fecha | C: autor | D: texto | E: imageUrl | F: audioUrl
// G: categoria (opcional) — cuando el recordatorio nace de un doble clic
//    sobre una alerta (ver abrirRecordatorioDesdeAlerta en notificaciones.js),
//    guarda el bloque de esa alerta ("Gastos fijos" o el bloque personalizado).
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
  if (typeof actualizarBadgeApp === "function") actualizarBadgeApp();
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

// Una foto y un audio pueden coexistir en el mismo recordatorio — slots independientes
let recordatorioFotoData  = null; // { data: dataURL, type: mime }
let recordatorioAudioData = null; // { data: dataURL, type: mime }
let recMediaRecorder = null;
let recAudioChunks = [];
let recGrabando = false;
let recAudioStream = null; // se reutiliza mientras el modal está abierto para no repetir el permiso
let recordatorioCategoriaActual = ""; // set por abrirRecordatorioDesdeAlerta() en notificaciones.js

// { texto, categoria } opcionales -- los usa abrirRecordatorioDesdeAlerta()
// en notificaciones.js (doble clic sobre una alerta) para pre-llenar el
// recordatorio con el bloque de esa alerta.
function abrirModalCrearRecordatorio({ texto = "", categoria = "" } = {}) {
  document.getElementById("recordatorio-texto").value = texto;
  recordatorioFotoData  = null;
  recordatorioAudioData = null;
  recordatorioCategoriaActual = categoria;
  renderRecordatorioMediaPreview();
  const status = document.getElementById("recordatorio-audio-status");
  if (status) status.textContent = "";
  resetBotonAudio();
  const badge = document.getElementById("recordatorio-categoria-badge");
  if (badge) {
    badge.textContent = categoria ? `🏷️ ${categoria}` : "";
    badge.classList.toggle("hidden", !categoria);
  }
  document.getElementById("modal-recordatorio-crear")?.classList.remove("hidden");
}

function resetBotonAudio() {
  const btn = document.getElementById("btn-recordatorio-audio");
  if (!btn) return;
  btn.textContent = "🎤";
  btn.classList.remove("grabando");
}

// Convierte el audio grabado en el dataURL que se guarda/sube; devuelve una
// promesa para poder esperar a que termine antes de continuar con el guardado.
function procesarBlobAudio(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      recordatorioAudioData = { data: e.target.result, type: blob.type };
      renderRecordatorioMediaPreview();
      resolve();
    };
    reader.readAsDataURL(blob);
  });
}

// Si hay una grabación en curso, la detiene y espera a que el audio quede
// listo antes de continuar — así "Guardar" nunca pierde el audio por no
// haber tocado primero el botón de detener.
function detenerGrabacionYEsperar() {
  return new Promise((resolve) => {
    if (!recGrabando || !recMediaRecorder) { resolve(); return; }
    const recorder = recMediaRecorder;
    const chunksFinales = recAudioChunks;
    recorder.onstop = () => {
      const blob = new Blob(chunksFinales, { type: recorder.mimeType || "audio/webm" });
      procesarBlobAudio(blob).then(resolve);
    };
    recGrabando = false;
    resetBotonAudio();
    const status = document.getElementById("recordatorio-audio-status");
    if (status) status.textContent = "";
    recorder.stop();
  });
}

function cerrarModalCrearRecordatorio() {
  if (recGrabando && recMediaRecorder) {
    try { recMediaRecorder.stop(); } catch {}
    recGrabando = false;
    resetBotonAudio();
  }
  if (recAudioStream) {
    recAudioStream.getTracks().forEach(t => t.stop());
    recAudioStream = null;
  }
  recordatorioCategoriaActual = "";
  document.getElementById("modal-recordatorio-crear")?.classList.add("hidden");
}

function cargarMediaRecordatorio(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    recordatorioFotoData = { data: e.target.result, type: file.type };
    renderRecordatorioMediaPreview();
  };
  reader.readAsDataURL(file);
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

async function toggleGrabacionAudio() {
  const btn    = document.getElementById("btn-recordatorio-audio");
  const status = document.getElementById("recordatorio-audio-status");

  if (!recGrabando) {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      alert("Este navegador no soporta grabación de audio.");
      return;
    }
    try {
      await obtenerStreamMicrofono();
      recAudioChunks = [];
      recMediaRecorder = new MediaRecorder(recAudioStream);
      recMediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recAudioChunks.push(e.data); };
      // El stream NO se detiene aquí a propósito: se mantiene vivo mientras
      // el modal siga abierto por si el usuario graba de nuevo.
      recMediaRecorder.onstop = () => {
        const blob = new Blob(recAudioChunks, { type: recMediaRecorder.mimeType || "audio/webm" });
        procesarBlobAudio(blob);
      };
      recMediaRecorder.start();
      recGrabando = true;
      btn.textContent = "⏹";
      btn.classList.add("grabando");
      if (status) status.textContent = "Grabando…";
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        alert(
          "El navegador tiene bloqueado el micrófono para esta página.\n\n" +
          "En iPhone: toca el ícono \"aA\" en la barra de direcciones → " +
          "Configuración del sitio web → Micrófono → Permitir. Si no aparece esa opción, " +
          "ve a Ajustes del iPhone → Safari → Micrófono y revisa que no esté en \"Denegar\".\n\n" +
          "Luego vuelve a intentar."
        );
      } else if (err.name === "NotFoundError") {
        alert("No se encontró un micrófono disponible en este dispositivo.");
      } else {
        alert("No se pudo acceder al micrófono: " + err.message);
      }
    }
  } else {
    recMediaRecorder.stop();
    recGrabando = false;
    btn.textContent = "🎤";
    btn.classList.remove("grabando");
    if (status) status.textContent = "";
  }
}

function renderRecordatorioMediaPreview() {
  const preview = document.getElementById("recordatorio-media-preview");
  if (!preview) return;

  let html = "";
  if (recordatorioFotoData) {
    html += `
      <div class="foto-thumb">
        <img src="${recordatorioFotoData.data}" class="foto-thumb-img" alt="foto adjunta"/>
        <button class="foto-thumb-remove" type="button" onclick="quitarFotoRecordatorio()">×</button>
      </div>`;
  }
  if (recordatorioAudioData) {
    html += `
      <div class="recordatorio-audio-preview">
        <audio controls src="${recordatorioAudioData.data}"></audio>
        <button class="foto-thumb-remove" type="button" onclick="quitarAudioRecordatorio()">×</button>
      </div>`;
  }
  preview.innerHTML = html;
}

window.quitarFotoRecordatorio = function () {
  recordatorioFotoData = null;
  renderRecordatorioMediaPreview();
};

window.quitarAudioRecordatorio = function () {
  recordatorioAudioData = null;
  renderRecordatorioMediaPreview();
};

async function guardarRecordatorio() {
  // Si el usuario le da Guardar sin haber tocado "detener", la grabación se
  // corta y se procesa aquí para no perder el audio.
  await detenerGrabacionYEsperar();

  const texto = document.getElementById("recordatorio-texto").value.trim();
  if (!texto && !recordatorioFotoData && !recordatorioAudioData) {
    alert("Escribe una nota o adjunta una foto/audio");
    return;
  }

  const btn = document.getElementById("btn-guardar-recordatorio-crear");
  btn.textContent = "Guardando..."; btn.disabled = true;

  const id    = "R" + Date.now();
  const fecha = new Date().toISOString().split("T")[0];
  let imageUrl = "";
  let audioUrl = "";
  let mediaPendiente = null;

  try {
    if ((recordatorioFotoData || recordatorioAudioData) && !navigator.onLine) {
      // Sin conexión: la foto/audio se guardan tal cual (dataURL) en la cola
      // de sincronización — sync.js las sube de verdad a Drive apenas
      // vuelve la conexión, antes de escribir la fila (ver ejecutarOperacion
      // en sync.js). Antes esto tiraba un error 503 sin manejar porque
      // agregarRecordatorio nunca estaba conectado a esa cola.
      mediaPendiente = {
        foto: recordatorioFotoData ? { data: recordatorioFotoData.data, type: recordatorioFotoData.type } : null,
        audio: recordatorioAudioData ? { data: recordatorioAudioData.data, type: recordatorioAudioData.type } : null
      };
      SyncManager.mostrarToast("💾 Sin conexión — la foto/audio se guardaron localmente y se subirán al reconectar", "warn");
    } else {
      if (recordatorioFotoData) {
        const ext = recordatorioFotoData.type.includes("png") ? "png" : "jpg";
        const { url } = await Sheets.subirArchivoDrive(recordatorioFotoData.data, `recordatorio-${id}-foto.${ext}`, recordatorioFotoData.type);
        imageUrl = url;
      }
      if (recordatorioAudioData) {
        const { url } = await Sheets.subirArchivoDrive(recordatorioAudioData.data, `recordatorio-${id}-audio.webm`, recordatorioAudioData.type);
        audioUrl = url;
      }
    }
    const categoria = recordatorioCategoriaActual;
    await Sheets.agregarRecordatorio(id, currentUser.email, fecha, texto, imageUrl, audioUrl, mediaPendiente, categoria);

    recordatorios.unshift({ id, fecha, autor: currentUser.email, texto, imageUrl, audioUrl, categoria });
    localStorage.setItem("cache_recordatorios", JSON.stringify(recordatorios));

    cerrarModalCrearRecordatorio();
    renderRecordatorioBadge();
    SyncManager.mostrarToast("✅ Recordatorio guardado");
  } catch (err) {
    if (err.message === "DRIVE_SIN_PERMISO") {
      alert("Necesitas volver a iniciar sesión para subir archivos a Drive (se agregó un permiso nuevo). Cierra sesión y entra de nuevo.");
    } else if (err.message === "DRIVE_SIN_PERMISO_PUBLICO") {
      alert("El archivo se subió a Drive, pero Google no dejó hacerlo visible con el link (puede ser una restricción de tu cuenta/organización). No se guardó el recordatorio — intenta de nuevo o guárdalo solo con texto.");
    } else {
      alert("Error guardando el recordatorio: " + err.message);
    }
  } finally {
    btn.textContent = "Guardar"; btn.disabled = false;
  }
}

// =============================================
// ABRIR RECORDATORIO COMO MOVIMIENTO
// =============================================

async function abrirRecordatorioComoMovimiento(id) {
  const r = recordatorios.find(x => x.id === id);
  if (!r) return;

  document.getElementById("recordatorios-panel")?.classList.add("hidden");
  if (typeof window.navegarATab === "function") window.navegarATab("movimientos");

  const modal = document.getElementById("modal-movimiento");
  modal.classList.remove("hidden");
  modal.dataset.fromRecordatorioId = id;
  delete modal.dataset.editId;

  poblarSelectCajas("mov-caja");
  document.getElementById("mov-fecha").value = r.fecha;
  document.getElementById("mov-descripcion").value = r.texto || "";

  const titulo = modal.querySelector(".modal-title");
  if (titulo) titulo.textContent = "Nuevo movimiento (desde recordatorio)";

  await renderRecordatorioInfoEnModal(r);
}

async function renderRecordatorioInfoEnModal(r) {
  const modal = document.getElementById("modal-movimiento");
  if (!modal) return;
  let bloque = modal.querySelector(".recordatorio-info-bloque");
  if (!bloque) {
    bloque = document.createElement("div");
    bloque.className = "recordatorio-info-bloque";
    modal.querySelector(".modal-card").insertBefore(bloque, modal.querySelector(".form-group"));
  }

  bloque.innerHTML = `
    <div class="recordatorio-info-titulo">📝 Recordatorio del ${escapeHtml(r.fecha)}</div>
    ${r.texto ? `<div class="recordatorio-info-texto">${escapeHtml(r.texto)}</div>` : ""}
    ${r.imageUrl ? `<img class="recordatorio-info-imagen" alt="foto del recordatorio"/>` : ""}
    ${r.imageUrl ? `<div class="recordatorio-media-status" data-media="imagen">Cargando foto…</div>` : ""}
    ${r.audioUrl ? `<audio controls class="recordatorio-info-audio"></audio>` : ""}
    ${r.audioUrl ? `<div class="recordatorio-media-status" data-media="audio">Cargando audio…</div>` : ""}
  `;

  if (r.imageUrl) {
    const img = bloque.querySelector(".recordatorio-info-imagen");
    const status = bloque.querySelector('[data-media="imagen"]');
    try {
      img.src = await Sheets.obtenerBlobUrlDrive(Sheets.idDesdeUrlDrive(r.imageUrl));
      status.remove();
    } catch (err) {
      status.textContent = "⚠️ No se pudo cargar la foto (" + err.message + ")";
    }
  }
  if (r.audioUrl) {
    const audio = bloque.querySelector(".recordatorio-info-audio");
    const status = bloque.querySelector('[data-media="audio"]');
    try {
      audio.src = await Sheets.obtenerBlobUrlDrive(Sheets.idDesdeUrlDrive(r.audioUrl));
      status.remove();
    } catch (err) {
      status.textContent = "⚠️ No se pudo cargar el audio (" + err.message + ")";
    }
  }
}

function _limpiarRecordatorioContexto() {
  const modal = document.getElementById("modal-movimiento");
  if (!modal) return;
  delete modal.dataset.fromRecordatorioId;
  const titulo = modal.querySelector(".modal-title");
  if (titulo) titulo.textContent = "Nuevo movimiento";
  const bloque = modal.querySelector(".recordatorio-info-bloque");
  if (bloque) bloque.remove();
}

// ---- INTERCEPTAR guardarMovimiento (igual patrón que compras.js) ----
function inicializarInterceptorRecordatorios() {
  if (typeof guardarMovimiento === "undefined") {
    setTimeout(inicializarInterceptorRecordatorios, 100);
    return;
  }

  const _guardarMovimientoOriginalR = guardarMovimiento;

  window.guardarMovimiento = async function () {
    const modal = document.getElementById("modal-movimiento");
    const fromRecordatorioId = modal.dataset.fromRecordatorioId;
    const btn = document.getElementById("btn-guardar-mov");

    try {
      await _guardarMovimientoOriginalR();
    } catch (err) {
      if (!err.message.includes("Cannot set properties of null")) {
        alert("Error guardando el movimiento: " + err.message);
      }
    } finally {
      if (btn) { btn.textContent = "Guardar"; btn.disabled = false; }
    }

    if (fromRecordatorioId && modal.classList.contains("hidden")) {
      _limpiarRecordatorioContexto();
      const rBorrado = recordatorios.find(r => r.id === fromRecordatorioId);
      try {
        await Sheets.borrarRecordatorio(fromRecordatorioId);
      } catch (err) {
        console.warn("No se pudo borrar el recordatorio de Sheets:", err);
      }
      await borrarMediaRecordatorio(rBorrado);
      recordatorios = recordatorios.filter(r => r.id !== fromRecordatorioId);
      localStorage.setItem("cache_recordatorios", JSON.stringify(recordatorios));
      renderRecordatorioBadge();
      SyncManager.mostrarToast("✅ Movimiento registrado y recordatorio eliminado");
    }
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inicializarInterceptorRecordatorios);
} else {
  setTimeout(inicializarInterceptorRecordatorios, 100);
}

// =============================================
// SETUP LISTENERS
// =============================================

function setupRecordatoriosListeners() {
  document.getElementById("btn-recordatorios-badge")?.addEventListener("click", toggleRecordatoriosPanel);

  document.getElementById("recordatorio-foto-file")?.addEventListener("change", (e) => cargarMediaRecordatorio(e.target.files[0]));
  document.getElementById("btn-recordatorio-audio")?.addEventListener("click", toggleGrabacionAudio);
  document.getElementById("btn-cancelar-recordatorio-crear")?.addEventListener("click", cerrarModalCrearRecordatorio);
  document.getElementById("btn-guardar-recordatorio-crear")?.addEventListener("click", guardarRecordatorio);

  document.getElementById("modal-recordatorio-crear")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-recordatorio-crear")) cerrarModalCrearRecordatorio();
  });

  document.getElementById("btn-cancelar-mov")?.addEventListener("click", _limpiarRecordatorioContexto);

  // Acciones rápidas (menú del botón flotante) — se cierra tocando fuera
  // (backdrop) o con el gesto de deslizar; ya no tiene botón "Cerrar" propio.
  document.getElementById("modal-menu-acciones")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-menu-acciones")) cerrarMenuAcciones();
  });
  document.getElementById("config-accion-categoria")?.addEventListener("change", actualizarConceptoAccion);
  document.getElementById("btn-guardar-config-accion")?.addEventListener("click", guardarConfigAccion);
  document.getElementById("btn-borrar-accion")?.addEventListener("click", borrarConfigAccion);
  document.getElementById("btn-cancelar-config-accion")?.addEventListener("click", cerrarConfigAccion);
  document.getElementById("btn-guardar-usar-accion")?.addEventListener("click", guardarUsarAccion);
  document.getElementById("btn-cancelar-usar-accion")?.addEventListener("click", cerrarUsarAccion);
  document.getElementById("usar-accion-camara-file")?.addEventListener("change", (e) => cargarFotoAccion(e.target.files[0]));
  document.getElementById("btn-usar-accion-camara")?.addEventListener("click", () => document.getElementById("usar-accion-camara-file")?.click());

  // Cerrar el panel de recordatorios al hacer clic afuera
  document.addEventListener("click", (e) => {
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
// ACCIONES RÁPIDAS — movimientos preconfigurados desde el botón flotante
// (categoría + concepto + caja), que solo piden el monto al usarse. Se
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
}

function obtenerAccionesRapidas() {
  return accionesRapidas;
}

async function _guardarAccionesRapidas(lista) {
  accionesRapidas = lista;
  localStorage.setItem(_accionesRapidasCacheKey(), JSON.stringify(lista));
  await Sheets.guardarConfigUsuario(currentUser.email, "acciones_rapidas", lista);
}

let accionSlotActual = null; // índice dentro de accionesRapidas, o -1 = configurando una nueva
let accionFotoData = null; // { data: dataURL, type: mime } -- foto opcional al usar una acción con cámara activada

function abrirMenuAcciones() {
  renderMenuAcciones();
  document.getElementById("modal-menu-acciones")?.classList.remove("hidden");
}

function cerrarMenuAcciones() {
  document.getElementById("modal-menu-acciones")?.classList.add("hidden");
}

function renderMenuAcciones() {
  const grid = document.getElementById("acciones-rapidas-grid");
  if (!grid) return;
  const acciones = obtenerAccionesRapidas();

  // "Agregar" siempre va al final -- de nada sirve como referencia de
  // posición fija si las acciones ya configuradas lo van corriendo cada
  // vez que se agrega una nueva (pedido explícito del usuario).
  grid.innerHTML = acciones.map((accion, i) => `
    <button class="accion-rapida-card" data-slot="${i}">
      <span class="accion-rapida-icono">${escapeHtml(accion.icono || "⚡")}</span>
      <span class="accion-rapida-nombre">${escapeHtml(accion.nombre)}</span>
    </button>`).join("") + `
    <button class="accion-rapida-card" id="accion-recordatorio">
      <span class="accion-rapida-icono">📝</span>
      <span class="accion-rapida-nombre">Recordatorio</span>
    </button>
    <button class="accion-rapida-card accion-rapida-vacia" id="btn-agregar-accion">
      <span class="accion-rapida-icono">➕</span>
      <span class="accion-rapida-nombre">Agregar</span>
    </button>`;

  // Toque corto = usar la acción; mantener presionado ~500ms = configurarla.
  grid.querySelectorAll(".accion-rapida-card[data-slot]").forEach((card) => {
    const slot = parseInt(card.dataset.slot, 10);
    let esPressLargo = false;
    let timeoutId = null;

    const iniciar = () => {
      esPressLargo = false;
      timeoutId = setTimeout(() => {
        esPressLargo = true;
        abrirConfigAccion(slot);
      }, 500);
    };
    const cancelar = () => clearTimeout(timeoutId);

    card.addEventListener("pointerdown", iniciar);
    card.addEventListener("pointerup", () => {
      cancelar();
      if (esPressLargo) return;
      const accion = obtenerAccionesRapidas()[slot];
      if (accion) abrirUsarAccion(slot, accion);
    });
    card.addEventListener("pointerleave", cancelar);
    card.addEventListener("pointercancel", cancelar);
  });

  document.getElementById("btn-agregar-accion")?.addEventListener("click", () => abrirConfigAccion(-1));

  document.getElementById("accion-recordatorio")?.addEventListener("click", () => {
    cerrarMenuAcciones();
    abrirModalCrearRecordatorio();
  });
}

// ---- Configurar una acción rápida ----

function actualizarConceptoAccion() {
  const categoria = document.getElementById("config-accion-categoria").value;
  const sel = document.getElementById("config-accion-concepto");
  if (!sel) return;
  let lista = [];
  if (categoria === "Gasto fijo") lista = GASTOS_FIJOS;
  else if (categoria === "Gasto variable") lista = GASTOS_VARIABLES;
  else if (categoria === "Ingreso") lista = FUENTES_INGRESO;
  sel.innerHTML = lista.map(c => `<option value="${c}">${c}</option>`).join("");
}

// slot: índice a editar dentro de accionesRapidas, o -1 para crear una nueva.
function abrirConfigAccion(slot) {
  accionSlotActual = slot;
  const accion = slot >= 0 ? obtenerAccionesRapidas()[slot] : null;

  document.getElementById("config-accion-nombre").value = accion?.nombre || "";
  document.getElementById("config-accion-icono").value  = accion?.icono || "";
  document.getElementById("config-accion-categoria").value = accion?.categoria || "Gasto fijo";
  actualizarConceptoAccion();
  if (accion?.concepto) document.getElementById("config-accion-concepto").value = accion.concepto;
  if (typeof poblarSelectCajas === "function") poblarSelectCajas("config-accion-caja");
  if (accion?.caja) document.getElementById("config-accion-caja").value = accion.caja;
  document.getElementById("config-accion-camara").checked = !!accion?.camara;

  const btnBorrar = document.getElementById("btn-borrar-accion");
  if (btnBorrar) btnBorrar.style.display = accion ? "" : "none";

  cerrarMenuAcciones();
  document.getElementById("modal-config-accion")?.classList.remove("hidden");
}

function cerrarConfigAccion() {
  document.getElementById("modal-config-accion")?.classList.add("hidden");
  abrirMenuAcciones();
}

async function guardarConfigAccion() {
  const nombre    = document.getElementById("config-accion-nombre").value.trim();
  const icono     = document.getElementById("config-accion-icono").value.trim() || "⚡";
  const categoria = document.getElementById("config-accion-categoria").value;
  const concepto  = document.getElementById("config-accion-concepto").value;
  const caja      = document.getElementById("config-accion-caja").value;
  const camara    = document.getElementById("config-accion-camara").checked;

  if (!nombre || !categoria || !concepto || !caja) {
    alert("Completa todos los campos");
    return;
  }

  const btn = document.getElementById("btn-guardar-config-accion");
  const textoOriginal = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    const acciones = [...obtenerAccionesRapidas()];
    const nuevaAccion = { nombre, icono, categoria, concepto, caja, camara };
    if (accionSlotActual >= 0) acciones[accionSlotActual] = nuevaAccion;
    else acciones.push(nuevaAccion);
    await _guardarAccionesRapidas(acciones);
    document.getElementById("modal-config-accion")?.classList.add("hidden");
    abrirMenuAcciones();
  } catch (err) {
    alert("Error guardando la acción: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginal || "Guardar"; }
  }
}

async function borrarConfigAccion() {
  if (accionSlotActual === null || accionSlotActual < 0) return;
  try {
    const acciones = [...obtenerAccionesRapidas()];
    acciones.splice(accionSlotActual, 1);
    await _guardarAccionesRapidas(acciones);
    document.getElementById("modal-config-accion")?.classList.add("hidden");
    abrirMenuAcciones();
  } catch (err) {
    alert("Error borrando la acción: " + err.message);
  }
}

// ---- Usar una acción rápida ya configurada ----

function abrirUsarAccion(slot, accion) {
  accionSlotActual = slot;
  document.getElementById("usar-accion-titulo").textContent = `${accion.icono || "⚡"} ${accion.nombre}`;
  document.getElementById("usar-accion-monto").value = "";
  accionFotoData = null;
  renderFotoAccionPreview();
  const wrapCamara = document.getElementById("usar-accion-camara-wrap");
  if (wrapCamara) wrapCamara.style.display = accion.camara ? "" : "none";
  cerrarMenuAcciones();
  document.getElementById("modal-usar-accion")?.classList.remove("hidden");
  setTimeout(() => document.getElementById("usar-accion-monto")?.focus(), 150);
}

function cerrarUsarAccion() {
  document.getElementById("modal-usar-accion")?.classList.add("hidden");
}

function cargarFotoAccion(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    accionFotoData = { data: e.target.result, type: file.type };
    renderFotoAccionPreview();
  };
  reader.readAsDataURL(file);
}

function renderFotoAccionPreview() {
  const preview = document.getElementById("usar-accion-foto-preview");
  if (!preview) return;
  preview.innerHTML = accionFotoData ? `
    <div class="foto-thumb">
      <img src="${accionFotoData.data}" alt="foto adjunta" class="foto-thumb-img"/>
      <button class="foto-thumb-remove" type="button" onclick="quitarFotoAccion()">×</button>
    </div>` : "";
}

window.quitarFotoAccion = function() {
  accionFotoData = null;
  renderFotoAccionPreview();
};

async function guardarUsarAccion() {
  const accion = obtenerAccionesRapidas()[accionSlotActual];
  if (!accion) { cerrarUsarAccion(); return; }

  const montoInput = document.getElementById("usar-accion-monto");
  const monto = typeof evaluarMonto === "function" ? evaluarMonto(montoInput.value) : parseFloat(montoInput.value);
  if (!monto) { alert("Ingresa un monto"); return; }

  const btn = document.getElementById("btn-guardar-usar-accion");
  btn.textContent = "Guardando..."; btn.disabled = true;
  try {
    const hoy = new Date().toISOString().split("T")[0];
    let recibo = "";
    if (accion.camara && accionFotoData) {
      const ext = accionFotoData.type.includes("png") ? "png" : "jpg";
      const { url } = await Sheets.subirArchivoDrive(accionFotoData.data, `accion-${accion.nombre}-${Date.now()}.${ext}`, accionFotoData.type);
      recibo = url;
    }
    if (accion.categoria === "Ingreso") {
      await Sheets.agregarMovimientoIngreso(currentUser.email, hoy, accion.concepto, accion.categoria, accion.caja, monto, "", recibo);
    } else {
      await Sheets.agregarMovimiento(currentUser.email, hoy, accion.concepto, accion.categoria, accion.caja, monto, "", recibo);
    }
    cerrarUsarAccion();
    if (typeof SyncManager !== "undefined") SyncManager.mostrarToast(`✅ ${accion.nombre} registrado`);
    if (typeof cargarTodo === "function") await cargarTodo();
  } catch (err) {
    alert("Error guardando: " + err.message);
  } finally {
    btn.textContent = "Guardar"; btn.disabled = false;
  }
}

// =============================================
// BOTÓN FLOTANTE — abre "Nuevo recordatorio" desde cualquier pestaña
// =============================================
// Circular, semitransparente, arrastrable con el dedo/mouse a cualquier
// parte de la pantalla. Un toque sin arrastrar abre el modal; la posición
// elegida por el usuario se recuerda entre sesiones.

function setupFabRecordatorio() {
  const fab = document.getElementById("fab-recordatorio");
  if (!fab) return;

  const MARGEN = 14;
  const POS_KEY = "fab_recordatorio_pos";
  let arrastrando = false;
  let seMovio = false;
  let startX = 0, startY = 0, origX = 0, origY = 0;

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  function limites() {
    return {
      maxX: window.innerWidth  - fab.offsetWidth  - MARGEN,
      maxY: window.innerHeight - fab.offsetHeight - MARGEN
    };
  }

  function ubicar(x, y, guardar) {
    const { maxX, maxY } = limites();
    x = clamp(x, MARGEN, Math.max(MARGEN, maxX));
    y = clamp(y, MARGEN, Math.max(MARGEN, maxY));
    fab.style.left = x + "px";
    fab.style.top  = y + "px";
    if (guardar) localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
  }

  function posicionInicial() {
    const guardada = localStorage.getItem(POS_KEY);
    if (guardada) {
      try {
        const { x, y } = JSON.parse(guardada);
        ubicar(x, y, false);
        return;
      } catch {}
    }
    // Lado derecho, centrado verticalmente
    const x = window.innerWidth - fab.offsetWidth - MARGEN;
    const y = (window.innerHeight - fab.offsetHeight) / 2;
    ubicar(x, y, false);
  }

  fab.addEventListener("pointerdown", (e) => {
    arrastrando = true;
    seMovio = false;
    fab.classList.add("arrastrando");
    fab.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    const rect = fab.getBoundingClientRect();
    origX = rect.left;
    origY = rect.top;
  });

  fab.addEventListener("pointermove", (e) => {
    if (!arrastrando) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) seMovio = true;
    if (!seMovio) return;
    ubicar(origX + dx, origY + dy, false);
  });

  function terminarArrastre(e) {
    if (!arrastrando) return;
    arrastrando = false;
    fab.classList.remove("arrastrando");
    try { fab.releasePointerCapture(e.pointerId); } catch {}
    if (seMovio) {
      const rect = fab.getBoundingClientRect();
      ubicar(rect.left, rect.top, true);
    } else {
      abrirMenuAcciones();
    }
  }

  fab.addEventListener("pointerup", terminarArrastre);
  fab.addEventListener("pointercancel", terminarArrastre);

  // Si rota la pantalla o cambia el tamaño, que no quede fuera de la vista
  window.addEventListener("resize", () => {
    const rect = fab.getBoundingClientRect();
    ubicar(rect.left, rect.top, true);
  });

  posicionInicial();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupFabRecordatorio);
} else {
  setTimeout(setupFabRecordatorio, 0);
}

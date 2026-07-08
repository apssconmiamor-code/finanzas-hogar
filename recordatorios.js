// =============================================
// MÓDULO RECORDATORIOS — notas rápidas de movimiento (texto/foto/audio)
// =============================================
// Hoja "Recordatorios" en Google Sheets:
// A: id | B: fecha | C: autor | D: texto | E: imageUrl | F: audioUrl
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
        body: JSON.stringify({ values: [["id", "fecha", "autor", "texto", "imageUrl", "audioUrl"]] })
      }
    );
  }
  this._recordatoriosHojaLista = true;
};

Sheets.getRecordatorios = async function () {
  await this._asegurarHojaRecordatorios();
  const rows = await this.leer(`${CONFIG.SHEETS.RECORDATORIOS}!A2:F`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:       r[0] || "",
    fecha:    Sheets._serialToDate(r[1]),
    autor:    r[2] || "",
    texto:    r[3] || "",
    imageUrl: r[4] || "",
    audioUrl: r[5] || ""
  }));
};

Sheets.agregarRecordatorio = async function (id, autor, fecha, texto, imageUrl = "", audioUrl = "") {
  await this._asegurarHojaRecordatorios();
  await this.agregar(CONFIG.SHEETS.RECORDATORIOS, [id, fecha, autor, texto, imageUrl, audioUrl]);
  return id;
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
          <div class="recordatorio-item-texto">${resumen}</div>
          <div class="recordatorio-item-fecha">${r.fecha}</div>
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
// PROMPT AL ABRIR: "¿Quieres hacer un recordatorio de movimiento?"
// =============================================

function mostrarPromptRecordatorio() {
  document.getElementById("modal-recordatorio-prompt")?.classList.remove("hidden");
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

function abrirModalCrearRecordatorio() {
  document.getElementById("recordatorio-texto").value = "";
  recordatorioFotoData  = null;
  recordatorioAudioData = null;
  renderRecordatorioMediaPreview();
  const status = document.getElementById("recordatorio-audio-status");
  if (status) status.textContent = "";
  resetBotonAudio();
  document.getElementById("modal-recordatorio-crear")?.classList.remove("hidden");
}

function resetBotonAudio() {
  const btn = document.getElementById("btn-recordatorio-audio");
  if (!btn) return;
  btn.textContent = "▶️";
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

async function toggleGrabacionAudio() {
  const btn    = document.getElementById("btn-recordatorio-audio");
  const status = document.getElementById("recordatorio-audio-status");

  if (!recGrabando) {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      alert("Este navegador no soporta grabación de audio.");
      return;
    }
    try {
      // Reutiliza el stream si ya lo teníamos abierto en esta misma sesión del
      // modal, para no volver a pedir permiso de micrófono en cada grabación.
      const streamActivo = recAudioStream?.getAudioTracks().some(t => t.readyState === "live");
      if (!streamActivo) {
        recAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
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
    btn.textContent = "▶️";
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

  try {
    if ((recordatorioFotoData || recordatorioAudioData) && !navigator.onLine) {
      alert("Sin conexión — no se puede subir la foto/audio a Drive. Se guardará solo la nota de texto.");
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
    await Sheets.agregarRecordatorio(id, currentUser.email, fecha, texto, imageUrl, audioUrl);

    recordatorios.unshift({ id, fecha, autor: currentUser.email, texto, imageUrl, audioUrl });
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
    <div class="recordatorio-info-titulo">📝 Recordatorio del ${r.fecha}</div>
    ${r.texto ? `<div class="recordatorio-info-texto">${r.texto}</div>` : ""}
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

  document.getElementById("btn-aceptar-recordatorio-prompt")?.addEventListener("click", () => {
    document.getElementById("modal-recordatorio-prompt").classList.add("hidden");
    abrirModalCrearRecordatorio();
  });

  document.getElementById("recordatorio-foto-file")?.addEventListener("change", (e) => cargarMediaRecordatorio(e.target.files[0]));
  document.getElementById("btn-recordatorio-audio")?.addEventListener("click", toggleGrabacionAudio);
  document.getElementById("btn-cancelar-recordatorio-crear")?.addEventListener("click", cerrarModalCrearRecordatorio);
  document.getElementById("btn-guardar-recordatorio-crear")?.addEventListener("click", guardarRecordatorio);

  document.getElementById("modal-recordatorio-crear")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-recordatorio-crear")) cerrarModalCrearRecordatorio();
  });

  document.getElementById("btn-cancelar-mov")?.addEventListener("click", _limpiarRecordatorioContexto);

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

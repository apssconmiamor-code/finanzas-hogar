// =============================================
// MÓDULO SUSCRIPCIONES Y RENOVACIONES
// =============================================
// Hoja "Suscripciones" en Google Sheets (se crea sola la primera vez que se
// use este módulo, igual que Recordatorios — ver Sheets._asegurarHojaSuscripciones):
// A: id | B: nombre | C: frecuencia | D: fecha_inicio | E: fecha_fin_contrato
// F: fecha_renovacion | G: estado (activa/cancelada) | H: autor

// ---- EXTENSIÓN DE Sheets PARA SUSCRIPCIONES ----

Sheets._suscripcionesHojaLista = false;

Sheets._asegurarHojaSuscripciones = async function () {
  if (this._suscripcionesHojaLista) return;
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const existe = meta.sheets.some(s => s.properties.title === CONFIG.SHEETS.SUSCRIPCIONES);

  if (!existe) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CONFIG.SHEETS.SUSCRIPCIONES } } }] })
      }
    );
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.SUSCRIPCIONES + "!A1")}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["id", "nombre", "frecuencia", "fecha_inicio", "fecha_fin_contrato", "fecha_renovacion", "estado", "autor"]] })
      }
    );
  }
  this._suscripcionesHojaLista = true;
};

Sheets.getSuscripciones = async function () {
  await this._asegurarHojaSuscripciones();
  const rows = await this.leer(`${CONFIG.SHEETS.SUSCRIPCIONES}!A2:H`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:               r[0] || "",
    nombre:           r[1] || "",
    frecuencia:       r[2] || "Mensual",
    fechaInicio:      Sheets._serialToDate(r[3]),
    fechaFinContrato: Sheets._serialToDate(r[4]),
    fechaRenovacion:  Sheets._serialToDate(r[5]),
    estado:           r[6] || "activa",
    autor:            r[7] || ""
  }));
};

Sheets.agregarSuscripcion = async function (nombre, frecuencia, fechaInicio, fechaFinContrato, fechaRenovacion, autor) {
  await this._asegurarHojaSuscripciones();
  const id = "SU" + Date.now();
  await this.agregar(CONFIG.SHEETS.SUSCRIPCIONES, [id, nombre, frecuencia, fechaInicio, fechaFinContrato, fechaRenovacion, "activa", autor]);
  return id;
};

// Reescribe la fila completa (usado por editar/renovar/cancelar) — más simple
// que tocar columnas sueltas cuando puede cambiar más de un campo a la vez.
Sheets._escribirFilaSuscripcion = async function (id, campos) {
  const rows = await this.leer(`${CONFIG.SHEETS.SUSCRIPCIONES}!A2:H`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Suscripción no encontrada");
  const sheetRow = rowIndex + 2;
  const actual = rows[rowIndex];
  const nueva = [
    id,
    campos.nombre           ?? actual[1],
    campos.frecuencia       ?? actual[2],
    campos.fechaInicio      ?? actual[3],
    campos.fechaFinContrato ?? actual[4],
    campos.fechaRenovacion  ?? actual[5],
    campos.estado           ?? actual[6],
    actual[7] || ""
  ];
  const range = `${CONFIG.SHEETS.SUSCRIPCIONES}!A${sheetRow}:H${sheetRow}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [nueva] })
    }
  );
  if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!res.ok) throw new Error(`Error actualizando suscripción: ${res.status}`);
  return res.json();
};

Sheets.editarSuscripcion = function (id, campos) {
  return this._escribirFilaSuscripcion(id, campos);
};

Sheets.borrarSuscripcion = async function (id) {
  const rows = await this.leer(`${CONFIG.SHEETS.SUSCRIPCIONES}!A2:A`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Suscripción no encontrada");
  const sheetRowIndex = rowIndex + 1;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === CONFIG.SHEETS.SUSCRIPCIONES);
  if (!sheet) throw new Error("Hoja de suscripciones no encontrada");
  const sheetId = sheet.properties.sheetId;

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: sheetRowIndex, endIndex: sheetRowIndex + 1 }
          }
        }]
      })
    }
  );
  if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!res.ok) throw new Error(`Error borrando suscripción: ${res.status}`);
  return res.json();
};

// =============================================
// LÓGICA DE UI PARA SUSCRIPCIONES
// =============================================

window.suscripciones = window.suscripciones || [];

const FRECUENCIAS_SUSCRIPCION = ["Mensual", "Trimestral", "Semestral", "Anual", "Otro"];

// ---- Fechas: días de diferencia hasta una fecha (positivo = futuro) ----
function diasHastaFecha(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaStr + "T00:00:00");
  if (isNaN(f.getTime())) return null;
  return Math.round((f - hoy) / 86400000);
}

// ---- Suma un intervalo de frecuencia a una fecha (para "Renovar") ----
function sumarIntervaloFecha(fechaStr, frecuencia) {
  const d = new Date((fechaStr || new Date().toISOString().split("T")[0]) + "T00:00:00");
  switch (frecuencia) {
    case "Trimestral": d.setMonth(d.getMonth() + 3); break;
    case "Semestral":  d.setMonth(d.getMonth() + 6); break;
    case "Anual":      d.setFullYear(d.getFullYear() + 1); break;
    default:           d.setMonth(d.getMonth() + 1); // Mensual / Otro
  }
  return d.toISOString().split("T")[0];
}

// ---- CARGA ----
async function cargarSuscripciones() {
  try {
    suscripciones = await Sheets.getSuscripciones();
    localStorage.setItem("cache_suscripciones", JSON.stringify(suscripciones));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem("cache_suscripciones");
    if (cache) { try { suscripciones = JSON.parse(cache); } catch {} }
  }
  renderSuscripciones();
  renderAlertasSuscripciones();
}

// ---- RENDER LISTA ----
function renderSuscripciones() {
  const lista = document.getElementById("suscripciones-list");
  if (!lista) return;

  const activas   = suscripciones.filter(s => s.estado !== "cancelada")
    .sort((a, b) => (diasHastaFecha(a.fechaRenovacion) ?? 9e9) - (diasHastaFecha(b.fechaRenovacion) ?? 9e9));
  const canceladas = suscripciones.filter(s => s.estado === "cancelada");

  if (suscripciones.length === 0) {
    lista.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔁</div>
        <div class="empty-state-text">No tienes suscripciones registradas. Agrega una para hacerle seguimiento a sus fechas de renovación.</div>
      </div>`;
    return;
  }

  const renderItem = (s) => {
    const dias = diasHastaFecha(s.fechaRenovacion);
    let claseDias = "susc-dias-normal";
    let textoDias = dias === null ? "" : (dias >= 0 ? `Renueva en ${dias} día${dias === 1 ? "" : "s"}` : `Venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`);
    if (s.estado === "cancelada") { claseDias = "susc-dias-cancelada"; textoDias = "Cancelada"; }
    else if (dias !== null && dias <= 15) claseDias = "susc-dias-urgente";
    else if (dias !== null && dias <= 30) claseDias = "susc-dias-proxima";

    return `
      <div class="suscripcion-item" data-id="${s.id}">
        <div class="susc-body">
          <div class="susc-top">
            <div class="susc-info">
              <span class="susc-nombre">${escapeHtml(s.nombre)}</span>
              <span class="susc-frecuencia-badge">${escapeHtml(s.frecuencia)}</span>
              <span class="susc-dias-badge ${claseDias}">${textoDias}</span>
            </div>
          </div>
          <div class="susc-fechas">
            <span>🟢 Inicio: ${s.fechaInicio || "—"}</span>
            <span>📄 Fin de contrato: ${s.fechaFinContrato || "—"}</span>
            <span>🔁 Renovación: ${s.fechaRenovacion || "—"}</span>
          </div>
          <div class="susc-acciones">
            ${s.estado !== "cancelada" ? `
              <button class="btn-secondary btn-susc-renovar" onclick="renovarSuscripcion('${s.id}')">🔁 Renovar</button>
              <button class="btn-secondary btn-susc-cancelar" onclick="cancelarSuscripcion('${s.id}')">🚫 Cancelar</button>
            ` : ""}
            <button class="btn-accion" title="Editar" onclick="abrirEditarSuscripcion('${s.id}')">✏️</button>
            <button class="btn-accion btn-borrar" title="Eliminar" onclick="borrarSuscripcion('${s.id}')">🗑️</button>
          </div>
        </div>
      </div>`;
  };

  let html = activas.map(renderItem).join("");
  if (canceladas.length > 0) {
    html += `<div class="prestamos-seccion-title pagados-title">Canceladas (${canceladas.length})</div>`;
    html += canceladas.map(renderItem).join("");
  }
  lista.innerHTML = html;
}

// ---- ALERTAS: 30 días antes (una vez) + a diario desde los 15 días (incluye vencidas) ----
function suscripcionesConAlerta() {
  return suscripciones.filter(s => {
    if (s.estado === "cancelada") return false;
    const dias = diasHastaFecha(s.fechaRenovacion);
    if (dias === null) return false;
    return dias === 30 || dias <= 15;
  });
}

function _claveAlertaVistaHoy() {
  return "susc_alertas_vistas_" + new Date().toISOString().split("T")[0];
}

function renderAlertasSuscripciones() {
  const bar    = document.getElementById("suscripciones-alerta-bar");
  const lista  = document.getElementById("suscripciones-alerta-lista");
  if (!bar || !lista) return;

  const pendientes = suscripcionesConAlerta();
  if (pendientes.length === 0) {
    bar.classList.add("hidden");
    return;
  }

  // Descartable por hoy: si ya se cerró el aviso hoy, no lo vuelve a mostrar
  // solo — pero sigue disponible entrando a la pestaña Suscripciones.
  const vistoHoy = localStorage.getItem(_claveAlertaVistaHoy()) === "1";
  if (vistoHoy) { bar.classList.add("hidden"); return; }

  lista.innerHTML = pendientes.map(s => {
    const dias = diasHastaFecha(s.fechaRenovacion);
    const texto = dias >= 0 ? `renueva en ${dias} día${dias === 1 ? "" : "s"}` : `venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
    return `
      <div class="susc-alerta-fila">
        <span>${escapeHtml(s.nombre)} — ${texto}</span>
        <div class="susc-alerta-botones">
          <button class="btn-primary" onclick="renovarSuscripcion('${s.id}')">Renovar</button>
          <button class="btn-secondary" onclick="cancelarSuscripcion('${s.id}')">Cancelar</button>
        </div>
      </div>`;
  }).join("");

  bar.classList.remove("hidden");
}

// ---- RENOVAR (avanza fechas un intervalo de frecuencia) ----
async function renovarSuscripcion(id) {
  const s = suscripciones.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`¿Marcar "${s.nombre}" como renovada? Se actualizarán sus fechas automáticamente.`)) return;

  const nuevaFechaInicio      = s.fechaRenovacion || new Date().toISOString().split("T")[0];
  const nuevaFechaFinContrato = sumarIntervaloFecha(s.fechaFinContrato || s.fechaRenovacion, s.frecuencia);
  const nuevaFechaRenovacion  = sumarIntervaloFecha(s.fechaRenovacion, s.frecuencia);

  try {
    await Sheets.editarSuscripcion(id, {
      fechaInicio: nuevaFechaInicio,
      fechaFinContrato: nuevaFechaFinContrato,
      fechaRenovacion: nuevaFechaRenovacion,
      estado: "activa"
    });
    await cargarSuscripciones();
    SyncManager.mostrarToast(`✅ "${s.nombre}" renovada — próxima renovación: ${nuevaFechaRenovacion}`);
  } catch (err) {
    alert("Error renovando la suscripción: " + err.message);
  }
}

// ---- CANCELAR ----
async function cancelarSuscripcion(id) {
  const s = suscripciones.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`¿Marcar "${s.nombre}" como cancelada? Dejará de avisarte sobre su renovación.`)) return;
  try {
    await Sheets.editarSuscripcion(id, { estado: "cancelada" });
    await cargarSuscripciones();
    SyncManager.mostrarToast(`🚫 "${s.nombre}" marcada como cancelada`);
  } catch (err) {
    alert("Error cancelando la suscripción: " + err.message);
  }
}

// ---- BORRAR ----
async function borrarSuscripcion(id) {
  const s = suscripciones.find(x => x.id === id);
  if (!s) return;
  if (!confirm(`¿Eliminar "${s.nombre}" definitivamente?`)) return;
  try {
    await Sheets.borrarSuscripcion(id);
    await cargarSuscripciones();
  } catch (err) {
    alert("Error borrando la suscripción: " + err.message);
  }
}

// ---- CREAR / EDITAR (mismo modal) ----
function limpiarFormSuscripcion() {
  document.getElementById("susc-nombre").value = "";
  document.getElementById("susc-frecuencia").value = "Mensual";
  const hoy = new Date().toISOString().split("T")[0];
  document.getElementById("susc-fecha-inicio").value = hoy;
  document.getElementById("susc-fecha-fin").value = "";
  document.getElementById("susc-fecha-renovacion").value = "";
  delete document.getElementById("modal-suscripcion").dataset.editId;
  document.getElementById("modal-suscripcion").querySelector(".modal-title").textContent = "Nueva suscripción";
  document.getElementById("btn-guardar-suscripcion").textContent = "Guardar";
}

function abrirEditarSuscripcion(id) {
  const s = suscripciones.find(x => x.id === id);
  if (!s) return;
  document.getElementById("susc-nombre").value = s.nombre;
  document.getElementById("susc-frecuencia").value = s.frecuencia;
  document.getElementById("susc-fecha-inicio").value = s.fechaInicio;
  document.getElementById("susc-fecha-fin").value = s.fechaFinContrato;
  document.getElementById("susc-fecha-renovacion").value = s.fechaRenovacion;
  const modal = document.getElementById("modal-suscripcion");
  modal.dataset.editId = id;
  modal.querySelector(".modal-title").textContent = "Editar suscripción";
  document.getElementById("btn-guardar-suscripcion").textContent = "Guardar cambios";
  modal.classList.remove("hidden");
}

async function guardarSuscripcion() {
  const nombre           = document.getElementById("susc-nombre").value.trim();
  const frecuencia       = document.getElementById("susc-frecuencia").value;
  const fechaInicio      = document.getElementById("susc-fecha-inicio").value;
  const fechaFinContrato = document.getElementById("susc-fecha-fin").value;
  const fechaRenovacion  = document.getElementById("susc-fecha-renovacion").value;

  if (!nombre || !fechaInicio || !fechaRenovacion) {
    alert("Completa al menos el nombre, la fecha de inicio y la fecha de renovación");
    return;
  }

  const modal  = document.getElementById("modal-suscripcion");
  const editId = modal.dataset.editId;
  const btn    = document.getElementById("btn-guardar-suscripcion");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    if (editId) {
      await Sheets.editarSuscripcion(editId, { nombre, frecuencia, fechaInicio, fechaFinContrato, fechaRenovacion });
    } else {
      await Sheets.agregarSuscripcion(nombre, frecuencia, fechaInicio, fechaFinContrato, fechaRenovacion, currentUser?.email || "");
    }
    modal.classList.add("hidden");
    limpiarFormSuscripcion();
    await cargarSuscripciones();
    SyncManager.mostrarToast(`✅ "${nombre}" guardada`);
  } catch (err) {
    alert("Error guardando la suscripción: " + err.message);
  } finally {
    btn.textContent = editId ? "Guardar cambios" : "Guardar"; btn.disabled = false;
  }
}

// ---- SETUP LISTENERS ----
function setupSuscripcionesListeners() {
  document.getElementById("btn-nueva-suscripcion")
    ?.addEventListener("click", () => {
      limpiarFormSuscripcion();
      document.getElementById("modal-suscripcion").classList.remove("hidden");
    });

  document.getElementById("btn-cancelar-suscripcion")
    ?.addEventListener("click", () => {
      document.getElementById("modal-suscripcion").classList.add("hidden");
      limpiarFormSuscripcion();
    });

  document.getElementById("btn-guardar-suscripcion")
    ?.addEventListener("click", guardarSuscripcion);

  document.getElementById("modal-suscripcion")
    ?.addEventListener("click", (e) => {
      if (e.target === document.getElementById("modal-suscripcion")) {
        document.getElementById("modal-suscripcion").classList.add("hidden");
        limpiarFormSuscripcion();
      }
    });

  document.getElementById("btn-cerrar-alerta-susc")
    ?.addEventListener("click", () => {
      localStorage.setItem(_claveAlertaVistaHoy(), "1");
      document.getElementById("suscripciones-alerta-bar")?.classList.add("hidden");
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupSuscripcionesListeners);
} else {
  setTimeout(setupSuscripcionesListeners, 0);
}

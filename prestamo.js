// =============================================
// MÓDULO PRÉSTAMOS
// =============================================
// Hoja "Prestamo" en Google Sheets:
// A: id | B: nombre | C: monto | D: cuotas | E: fecha_inicio | F: pagado | G: descripcion

// ---- EXTENSIÓN DE Sheets PARA PRÉSTAMOS ----

Sheets.getPrestamos = async function () {
  const rows = await this.leer(`${CONFIG.SHEETS.PRESTAMO}!A2:G`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:           r[0] || "",
    nombre:       r[1] || "",
    monto:        isNaN(parseFloat(r[2])) ? 0 : parseFloat(r[2]),
    cuotas:       isNaN(parseInt(r[3]))   ? 0 : parseInt(r[3]),
    fechaInicio:  Sheets._serialToDate(r[4]),
    pagado:       String(r[5]).toLowerCase() === "true",
    descripcion:  r[6] || ""
  }));
};

Sheets.agregarPrestamo = async function (nombre, monto, cuotas, fechaInicio, descripcion = "") {
  const id = "P" + Date.now();
  await this.agregar(CONFIG.SHEETS.PRESTAMO, [id, nombre, monto, cuotas, fechaInicio, "false", descripcion]);
  return id;
};

Sheets.marcarPrestamoPagado = async function (id) {
  const rows = await this.leer(`${CONFIG.SHEETS.PRESTAMO}!A2:A`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Préstamo no encontrado");
  const sheetRow = rowIndex + 2;
  const range = `${CONFIG.SHEETS.PRESTAMO}!F${sheetRow}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [["true"]] })
    }
  );
  if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!res.ok) throw new Error(`Error marcando préstamo: ${res.status}`);
  return res.json();
};

Sheets.borrarPrestamo = async function (id) {
  const rows = await this.leer(`${CONFIG.SHEETS.PRESTAMO}!A2:A`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Préstamo no encontrado");
  const sheetRowIndex = rowIndex + 1;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === CONFIG.SHEETS.PRESTAMO);
  if (!sheet) throw new Error("Hoja de préstamos no encontrada");
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
  if (!res.ok) throw new Error(`Error borrando préstamo: ${res.status}`);
  return res.json();
};

// =============================================
// LÓGICA DE UI PARA PRÉSTAMOS
// =============================================

let prestamos = [];

// ---- Concepto canónico para un préstamo ----
function conceptoPrestamo(nombre) {
  return `Prestamo ${nombre}`;
}

// ---- Cuánto se ha pagado de un préstamo (suma movimientos con ese concepto) ----
function calcularPagadoPrestamo(nombre) {
  const concepto = conceptoPrestamo(nombre);
  return movimientos
    .filter(m => m.concepto === concepto && m.categoria !== "Ingreso" && m.categoria !== "Transferencia")
    .reduce((s, m) => s + Math.abs(m.monto), 0);
}

// ---- Porcentaje pagado ----
function pctPrestamo(prestamo) {
  if (prestamo.pagado) return 100;
  if (prestamo.monto <= 0) return 0;
  const pagado = calcularPagadoPrestamo(prestamo.nombre);
  return Math.min(Math.round((pagado / prestamo.monto) * 100), 100);
}

// ---- CARGA ----
async function cargarPrestamos() {
  try {
    prestamos = await Sheets.getPrestamos();
    localStorage.setItem("cache_prestamos", JSON.stringify(prestamos));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem("cache_prestamos");
    if (cache) { try { prestamos = JSON.parse(cache); } catch {} }
  }
  renderPrestamos();
  await verificarPrestamosCompletados();
}

// ---- Verificar si algún préstamo no pagado llegó al 100% ----
async function verificarPrestamosCompletados() {
  const pendientes = prestamos.filter(p => !p.pagado);
  for (const p of pendientes) {
    const pct = pctPrestamo(p);
    if (pct >= 100) {
      try {
        await Sheets.marcarPrestamoPagado(p.id);
        p.pagado = true;
        // Eliminar el concepto de la lista dinámica (ya no aplica en nuevos movimientos)
        SyncManager.mostrarToast(`✅ Préstamo "${p.nombre}" completado al 100%`);
      } catch (err) {
        console.warn("Error marcando préstamo como pagado:", err);
      }
    }
  }
  renderPrestamos();
  actualizarConceptosPrestamo();
}

// ---- Inyectar/quitar conceptos de préstamos activos en la lista de gastos variables ----
function actualizarConceptosPrestamo() {
  const datalist = document.getElementById("lista-variables");
  if (!datalist) return;

  // Remover opciones de préstamos anteriores
  datalist.querySelectorAll("[data-prestamo]").forEach(o => o.remove());

  // Agregar solo préstamos NO pagados
  prestamos
    .filter(p => !p.pagado)
    .forEach(p => {
      const opt = document.createElement("option");
      opt.value = conceptoPrestamo(p.nombre);
      opt.dataset.prestamo = "1";
      datalist.appendChild(opt);
    });

  // También actualizar el select de gastos variables si está abierto

  // Agregar préstamos activos también al select de gastos fijos
  const selectFijo = document.getElementById("mov-concepto-fijo");
  if (selectFijo) {
    selectFijo.querySelectorAll("[data-prestamo]").forEach(o => o.remove());
    prestamos
      .filter(p => !p.pagado)
      .forEach(p => {
        const opt = document.createElement("option");
        opt.value = conceptoPrestamo(p.nombre);
        opt.textContent = conceptoPrestamo(p.nombre);
        opt.dataset.prestamo = "1";
        selectFijo.appendChild(opt);
      });
  }
}

// ---- RENDER ----
function renderPrestamos() {
  const grid = document.getElementById("prestamos-grid");
  if (!grid) return;

  const activos  = prestamos.filter(p => !p.pagado);
  const pagados  = prestamos.filter(p => p.pagado);

  if (prestamos.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">🏦</div>
        <div class="empty-state-text">No tienes préstamos registrados. Crea uno para empezar a hacer seguimiento.</div>
      </div>`;
    return;
  }

  const renderCard = (p) => {
    const pagado    = p.pagado ? p.monto : calcularPagadoPrestamo(p.nombre);
    const pendiente = Math.max(p.monto - pagado, 0);
    const pct       = pctPrestamo(p);
    const barColor  = pct >= 100 ? "var(--green)" : "var(--blue)";

    return `
      <div class="prestamo-card ${p.pagado ? "prestamo-pagado" : ""}" data-id="${p.id}" onpointerup="tapPrestamo('${p.id}')">
        <div class="prest-left-bar" style="background:${p.pagado ? "var(--green)" : "var(--red)"}"></div>
        <div class="prest-body">
          <div class="prest-header">
            <span class="prestamo-nombre">${escapeHtml(p.nombre)}</span>
            ${p.pagado
              ? `<span class="prestamo-badge pagado-badge">✅ Pagado</span>`
              : `<span class="prestamo-badge activo-badge">En curso</span>`}
          </div>

          <div class="prest-progress-row">
            <div class="prest-bar-bg">
              <div class="prest-bar-fill" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <span class="prest-pct">${pct}%</span>
          </div>

          <div class="prest-montos">
            <div class="prest-monto-item">
              <span class="prest-monto-label">Total</span>
              <span class="prest-monto-val">${formatMonto(p.monto)}</span>
            </div>
            <div class="prest-monto-item">
              <span class="prest-monto-label">Pagado</span>
              <span class="prest-monto-val" style="color:var(--green)">${formatMonto(pagado)}</span>
            </div>
            <div class="prest-monto-item">
              <span class="prest-monto-label">Por pagar</span>
              <span class="prest-monto-val" style="color:var(--red)">${formatMonto(pendiente)}</span>
            </div>
          </div>

          ${p.cuotas > 0 ? `<div class="prest-meta-row">🗓️ ${p.cuotas} cuota${p.cuotas > 1 ? "s" : ""} · Inicio: ${p.fechaInicio || "—"}</div>` : ""}
          ${p.descripcion ? `<div class="prest-meta-row prest-desc">${p.descripcion}</div>` : ""}

          <div class="prestamo-acciones">
            ${!p.pagado ? `
              <button class="btn-primary btn-prest-pago"
                onclick="event.stopPropagation();abrirPagoRapido('${p.id}', '${escapeAttr(p.nombre)}', ${pendiente})"
                onpointerup="event.stopPropagation()">
                💳 Registrar pago
              </button>` : ""}
          </div>
        </div>
      </div>`;
  };

  let html = "";

  if (activos.length > 0) {
    html += `<div class="prestamos-seccion-title">En curso (${activos.length})</div>`;
    html += activos.map(renderCard).join("");
  }

  if (pagados.length > 0) {
    html += `<div class="prestamos-seccion-title pagados-title">Pagados (${pagados.length})</div>`;
    html += pagados.map(renderCard).join("");
  }

  grid.innerHTML = html;

  // Actualizar resumen
  renderResumenPrestamos(activos);

  _conectarLargoPresionPrestamos(grid);
}

// Doble toque abre un resumen de solo lectura; mantener presionada abre
// Eliminar (no hay "Editar" para un préstamo -- nunca existió esa
// función, solo crear/borrar/registrar pago). Mismo criterio único de
// gestos que el resto de la app, ver gestos.js.
const tapPrestamo = crearManejadorDobleToque(id => id, id => abrirResumenPrestamo(id));

function abrirResumenPrestamo(id) {
  const p = prestamos.find(x => x.id === id);
  if (!p) return;
  const pagado    = p.pagado ? p.monto : calcularPagadoPrestamo(p.nombre);
  const pendiente = Math.max(p.monto - pagado, 0);

  document.getElementById("resumen-prestamo-titulo").textContent = p.nombre;
  const cuerpo = document.getElementById("resumen-prestamo-cuerpo");
  if (cuerpo) {
    cuerpo.innerHTML = [
      ["Estado", p.pagado ? "✅ Pagado" : "En curso"],
      ["Total", formatMonto(p.monto)],
      ["Pagado", formatMonto(pagado)],
      ["Por pagar", formatMonto(pendiente)],
      ["Cuotas", p.cuotas > 0 ? String(p.cuotas) : "—"],
      ["Inicio", p.fechaInicio || "—"],
      ...(p.descripcion ? [["Descripción", p.descripcion]] : [])
    ].map(([label, valor]) => `
      <div class="detalle-notif-fila">
        <span class="detalle-notif-label">${label}</span>
        <span class="detalle-notif-valor">${escapeHtml(String(valor))}</span>
      </div>`).join("");
  }
  document.getElementById("modal-resumen-prestamo")?.classList.remove("hidden");
}

function _conectarLargoPresionPrestamos(contenedor) {
  contenedor.querySelectorAll(".prestamo-card[data-id]").forEach(card => {
    const id = card.dataset.id;
    const p = prestamos.find(x => x.id === id);
    if (!p) return;
    crearManejadorPresionSostenida(card, {
      onLargo: () => abrirMenuEditarBorrar({
        titulo: p.nombre,
        onBorrar: () => borrarPrestamo(id)
      })
    });
  });
}

function renderResumenPrestamos(activos) {
  const totalDeuda  = activos.reduce((s, p) => s + p.monto, 0);
  const totalPagado = activos.reduce((s, p) => s + calcularPagadoPrestamo(p.nombre), 0);
  const totalPend   = Math.max(totalDeuda - totalPagado, 0);

  const elDeuda  = document.getElementById("prest-total-deuda");
  const elPagado = document.getElementById("prest-total-pagado");
  const elPend   = document.getElementById("prest-total-pendiente");

  if (elDeuda)  elDeuda.textContent  = formatMonto(totalDeuda);
  if (elPagado) elPagado.textContent = formatMonto(totalPagado);
  if (elPend)   elPend.textContent   = formatMonto(totalPend);
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// ---- CREAR PRÉSTAMO ----
async function guardarPrestamo() {
  const nombre      = document.getElementById("prest-nombre").value.trim();
  const monto       = evaluarMonto(document.getElementById("prest-monto").value);
  const cuotas      = parseInt(document.getElementById("prest-cuotas").value) || 0;
  const fechaInicio = document.getElementById("prest-fecha").value;
  const descripcion = document.getElementById("prest-descripcion").value.trim();

  if (!nombre || !monto || !fechaInicio) {
    alert("Completa nombre, monto y fecha de inicio");
    return;
  }

  const btn = document.getElementById("btn-guardar-prestamo");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    await Sheets.agregarPrestamo(nombre, monto, cuotas, fechaInicio, descripcion);
    document.getElementById("modal-prestamo").classList.add("hidden");
    limpiarFormPrestamo();
    await cargarPrestamos();
    SyncManager.mostrarToast(`✅ Préstamo "${nombre}" creado — concepto disponible en movimientos`);
  } catch (err) {
    alert("Error guardando préstamo: " + err.message);
  } finally {
    btn.textContent = "Crear préstamo"; btn.disabled = false;
  }
}

function limpiarFormPrestamo() {
  document.getElementById("prest-nombre").value       = "";
  document.getElementById("prest-monto").value        = "";
  document.getElementById("prest-cuotas").value       = "";
  document.getElementById("prest-fecha").value        = new Date().toISOString().split("T")[0];
  document.getElementById("prest-descripcion").value  = "";
}

// ---- PAGO RÁPIDO ----
function abrirPagoRapido(id, nombre, pendiente) {
  const modal = document.getElementById("modal-pago-rapido");
  modal.dataset.prestId    = id;
  modal.dataset.prestNombre = nombre;
  document.getElementById("pago-concepto-display").textContent = conceptoPrestamo(nombre);
  document.getElementById("pago-monto").value = "";
  document.getElementById("pago-fecha").value  = new Date().toISOString().split("T")[0];
  document.getElementById("pago-pendiente").textContent = formatMonto(pendiente);

  // Poblar selector de cajas
  poblarSelectCajas("pago-caja");

  modal.classList.remove("hidden");
}

async function guardarPagoRapido() {
  const modal     = document.getElementById("modal-pago-rapido");
  const prestId   = modal.dataset.prestId;
  const nombre    = modal.dataset.prestNombre;
  const monto     = evaluarMonto(document.getElementById("pago-monto").value);
  const fecha     = document.getElementById("pago-fecha").value;
  const caja      = document.getElementById("pago-caja").value;
  const desc      = document.getElementById("pago-desc").value.trim();

  if (!monto || !fecha || !caja) {
    alert("Completa monto, fecha y caja");
    return;
  }

  const btn = document.getElementById("btn-guardar-pago");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    const concepto = conceptoPrestamo(nombre);
    await Sheets.agregarMovimiento(
      currentUser.email, fecha, concepto, "Gasto variable", caja, monto,
      desc || `Pago préstamo ${nombre}`
    );

    modal.classList.add("hidden");

    // Recargar movimientos y verificar si se completó
    await cargarTodo();
    await cargarPrestamos();
  } catch (err) {
    alert("Error registrando pago: " + err.message);
  } finally {
    btn.textContent = "Registrar pago"; btn.disabled = false;
  }
}

// ---- BORRAR PRÉSTAMO ----
async function borrarPrestamo(id) {
  const p = prestamos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar el préstamo "${p.nombre}"? Los movimientos asociados no se borrarán.`)) return;
  try {
    await Sheets.borrarPrestamo(id);
    await cargarPrestamos();
    actualizarConceptosPrestamo();
  } catch (err) {
    alert("Error borrando préstamo: " + err.message);
  }
}

// ---- SETUP LISTENERS PRÉSTAMOS ----
function setupPrestamoListeners() {
  document.getElementById("btn-nuevo-prestamo")
    .addEventListener("click", () => {
      document.getElementById("prest-fecha").value = new Date().toISOString().split("T")[0];
      document.getElementById("modal-prestamo").classList.remove("hidden");
    });

  document.getElementById("btn-cancelar-prestamo")
    .addEventListener("click", () => {
      document.getElementById("modal-prestamo").classList.add("hidden");
      limpiarFormPrestamo();
    });

  document.getElementById("btn-guardar-prestamo")
    .addEventListener("click", guardarPrestamo);

  document.getElementById("btn-cancelar-pago")
    .addEventListener("click", () => {
      document.getElementById("modal-pago-rapido").classList.add("hidden");
    });

  document.getElementById("btn-guardar-pago")
    .addEventListener("click", guardarPagoRapido);

  // Separadores de miles en campos de monto de préstamos
  const prestMonto = document.getElementById("prest-monto");
  if (prestMonto) prestMonto.addEventListener("input", () => formatearInputMiles(prestMonto));
  const pagoMonto = document.getElementById("pago-monto");
  if (pagoMonto) pagoMonto.addEventListener("input", () => formatearInputMiles(pagoMonto));

  // Cerrar tocando el fondo ya lo cubre el listener genérico de app.js (ver cerrarModal).
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupPrestamoListeners);
} else {
  setTimeout(setupPrestamoListeners, 0);
}

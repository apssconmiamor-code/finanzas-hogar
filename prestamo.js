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
}

// ---- RENDER ----
// La pantalla de Compromisos (Préstamos + Lista de compras) es React (PantallaCompromisos.jsx); acá se
// arma lo que muestra a partir de los datos de los dos módulos.
function renderPrestamos() {
  renderCompromisosPantalla();
}

function renderCompromisosPantalla() {
  if (!window.PantallaCompromisosReact) return;
  const activos = prestamos.filter(p => !p.pagado);
  const vmPrestamos = prestamos.map(p => {
    const pagadoMonto = p.pagado ? p.monto : calcularPagadoPrestamo(p.nombre);
    return {
      id: p.id, nombre: p.nombre, pagado: p.pagado, monto: p.monto, pagadoMonto,
      pendiente: Math.max(p.monto - pagadoMonto, 0), pct: pctPrestamo(p),
      cuotas: p.cuotas, fechaInicio: p.fechaInicio, descripcion: p.descripcion,
    };
  });
  const deuda = activos.reduce((s, p) => s + p.monto, 0);
  const pagado = activos.reduce((s, p) => s + calcularPagadoPrestamo(p.nombre), 0);

  // Compras: de la más urgente a la menos, y luego por fecha (la más reciente primero)
  const orden = { "Alta": 0, "Media": 1, "Baja": 2 };
  const vmCompras = [...(window.compras || [])].sort((a, b) => {
    const diff = (orden[a.urgencia] ?? 1) - (orden[b.urgencia] ?? 1);
    return diff !== 0 ? diff : b.fecha.localeCompare(a.fecha);
  });

  window.PantallaCompromisosReact.render({
    prestamos: vmPrestamos,
    totales: { deuda, pagado, pendiente: Math.max(deuda - pagado, 0) },
    compras: vmCompras,
    urgencias: URGENCIA_CONFIG,
    formatMonto: n => formatMonto(n),
    onNuevoPrestamo: () => document.dispatchEvent(new CustomEvent("compromisos:abrir", { detail: { t: "prestamo" } })),
    onNuevaCompra: () => document.dispatchEvent(new CustomEvent("compromisos:abrir", { detail: { t: "compra" } })),
    onPago: p => abrirPagoRapido(p.id, p.nombre, p.pendiente),
    onResumenPrestamo: abrirResumenPrestamo,
    onBorrarPrestamo: borrarPrestamo,
    onComprar: abrirComprarAhora,
    onResumenCompra: abrirResumenCompra,
    onBorrarCompra: borrarCompra,
  });
}

// Doble toque abre un resumen de solo lectura; mantener presionada abre
// Eliminar (no hay "Editar" para un préstamo -- nunca existió esa
// función, solo crear/borrar/registrar pago). Mismo criterio único de
// gestos que el resto de la app, ver gestos.js.
function abrirResumenPrestamo(id) {
  const p = prestamos.find(x => x.id === id);
  if (!p) return;
  const pagado    = p.pagado ? p.monto : calcularPagadoPrestamo(p.nombre);
  const pendiente = Math.max(p.monto - pagado, 0);

  mostrarDetalle({
    id: "modal-resumen-prestamo", idTitulo: "resumen-prestamo-titulo", titulo: p.nombre, icono: "prestamo",
    cuerpos: [{ id: "resumen-prestamo-cuerpo", clase: "detalle-notif-cuerpo", html: [
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
      </div>`).join("") }],
  });
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// ---- CREAR PRÉSTAMO / REGISTRAR PAGO ---- (las ventanas son React, ver
// react/src/compromisos/Compromisos.jsx; acá solo se guarda. Si algo falla, lanzan: la ventana
// avisa y se queda abierta.)
async function guardarPrestamoDatos({ nombre, monto, cuotas, fechaInicio, descripcion }) {
  await Sheets.agregarPrestamo(nombre, monto, cuotas, fechaInicio, descripcion);
  await cargarPrestamos();
  SyncManager.mostrarToast(`✅ Préstamo "${nombre}" creado — concepto disponible en movimientos`);
}

function abrirPagoRapido(id, nombre, pendiente) {
  document.dispatchEvent(new CustomEvent("compromisos:abrir", { detail: { t: "pago", id, nombre, pendiente } }));
}

async function guardarPagoRapidoDatos({ nombre, monto, fecha, caja, desc }) {
  const concepto = conceptoPrestamo(nombre);
  await Sheets.agregarMovimiento(
    currentUser.email, fecha, concepto, "Gasto variable", caja, monto,
    desc || `Pago préstamo ${nombre}`
  );
  // Recargar movimientos y verificar si se completó
  await cargarTodo();
  await cargarPrestamos();
}

function renderCompromisosReact() {
  if (!window.CompromisosReact) return;
  window.CompromisosReact.render({
    getCategoriasCompra: () => (typeof GASTOS_VARIABLES !== "undefined" ? GASTOS_VARIABLES : []),
    getCajas: () => {
      if (typeof cajas !== "undefined" && cajas.length === 0) {
        try { const cache = localStorage.getItem("cache_cajas"); if (cache) cajas = JSON.parse(cache); } catch {}
      }
      return typeof cajas !== "undefined" ? cajas : [];
    },
    evaluarMonto: texto => (typeof evaluarMonto === "function" ? evaluarMonto(texto) : parseFloat(texto)),
    formatMonto: n => formatMonto(n),
    conceptoPrestamo: nombre => conceptoPrestamo(nombre),
    onGuardarCompra: d => guardarCompraDatos(d),
    onGuardarPrestamo: guardarPrestamoDatos,
    onGuardarPago: guardarPagoRapidoDatos,
  });
}

// ---- BORRAR PRÉSTAMO ----
async function borrarPrestamo(id) {
  const p = prestamos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar el préstamo "${p.nombre}"? Los movimientos asociados no se borrarán.`)) return;
  try {
    await Sheets.borrarPrestamo(id);
    await cargarPrestamos();
    } catch (err) {
    alert("Error borrando préstamo: " + err.message);
  }
}

// ---- SETUP LISTENERS PRÉSTAMOS ----
function setupPrestamoListeners() {
  renderCompromisosReact();
  renderCompromisosPantalla();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupPrestamoListeners);
} else {
  setTimeout(setupPrestamoListeners, 0);
}

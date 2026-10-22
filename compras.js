// =============================================
// MÓDULO COMPRAS — Lista de deseos / pendientes
// =============================================
// Hoja "Compras" en Google Sheets:
// A: id | B: fecha | C: autor | D: concepto | E: categoria | F: monto_destinado | G: urgencia

// ---- EXTENSIÓN DE Sheets PARA COMPRAS ----

Sheets.getCompras = async function () {
  const rows = await this.leer(`${CONFIG.SHEETS.COMPRAS}!A2:G`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:             r[0] || "",
    fecha:          Sheets._serialToDate(r[1]),
    autor:          r[2] || "",
    concepto:       r[3] || "",
    categoria:      r[4] || "",
    montoDestinado: isNaN(parseFloat(r[5])) ? 0 : parseFloat(r[5]),
    urgencia:       r[6] || "Media"
  }));
};

Sheets.agregarCompra = async function (autor, fecha, concepto, categoria, montoDestinado, urgencia) {
  const id = "CP" + Date.now();
  await this.agregar(CONFIG.SHEETS.COMPRAS, [id, fecha, autor, concepto, categoria, montoDestinado, urgencia]);
  return id;
};

Sheets.borrarCompra = async function (id) {
  const rows = await this.leer(`${CONFIG.SHEETS.COMPRAS}!A2:A`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Compra no encontrada");
  const sheetRowIndex = rowIndex + 1;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === CONFIG.SHEETS.COMPRAS);
  if (!sheet) throw new Error("Hoja de compras no encontrada");
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
  if (!res.ok) throw new Error(`Error borrando compra: ${res.status}`);
  return res.json();
};

// =============================================
// LÓGICA DE UI PARA COMPRAS
// =============================================

window.compras = window.compras || [];

const URGENCIA_CONFIG = {
  "Alta":  { color: "var(--red)",    bg: "var(--red-bg)",    icon: "🔴", clase: "ic-rojo" },
  "Media": { color: "var(--yellow)", bg: "#fef3c7",          icon: "🟡", clase: "ic-amarillo" },
  "Baja":  { color: "var(--green)",  bg: "var(--green-bg)",  icon: "🟢", clase: "ic-verde" }
};

// ---- CARGA ----
async function cargarCompras() {
  try {
    compras = await Sheets.getCompras();
    localStorage.setItem("cache_compras", JSON.stringify(compras));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem("cache_compras");
    if (cache) { try { compras = JSON.parse(cache); } catch {} }
  }
  renderCompras();
}

// ---- RENDER LISTA ----
// La pantalla de Compromisos (Préstamos + Lista de compras) es React: ver renderCompromisosPantalla en
// prestamo.js, que dibuja las dos listas juntas.
function renderCompras() {
  renderCompromisosPantalla();
}

// Doble toque abre un resumen de solo lectura; mantener presionada abre
// Eliminar (no hay "Editar" para una compra -- nunca existió esa
// función, solo crear/borrar). Mismo criterio único de gestos que el
// resto de la app, ver gestos.js (los conecta PantallaCompromisos.jsx).
function abrirResumenCompra(id) {
  const c = compras.find(x => x.id === id);
  if (!c) return;
  const urg = URGENCIA_CONFIG[c.urgencia] || URGENCIA_CONFIG["Media"];

  mostrarDetalle({
    id: "modal-resumen-compra", idTitulo: "resumen-compra-titulo", titulo: c.concepto, icono: "bolsa",
    cuerpos: [{ id: "resumen-compra-cuerpo", clase: "detalle-notif-cuerpo", html: [
      ["Urgencia", `${urg.icon} ${c.urgencia}`],
      ["Categoría", c.categoria || "—"],
      ["Monto destinado", c.montoDestinado > 0 ? formatMonto(c.montoDestinado) : "—"],
      ["Fecha", c.fecha]
    ].map(([label, valor]) => `
      <div class="detalle-notif-fila">
        <span class="detalle-notif-label">${label}</span>
        <span class="detalle-notif-valor">${escapeHtml(String(valor))}</span>
      </div>`).join("") }],
  });
}

// ---- ABRIR "COMPRAR AHORA" → pre-llena el modal de movimiento ----
function abrirComprarAhora(id) {
  const compra = compras.find(c => c.id === id);
  if (!compra) return;

  // Cambiar a la pestaña de movimientos
  document.querySelectorAll(".nav-item").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === "movimientos"));
  document.querySelectorAll(".tab-section").forEach(s => s.classList.add("hidden"));
  document.getElementById("tab-movimientos").classList.remove("hidden");

  // El formulario de movimiento (React) se abre ya armado como Gasto variable con los datos de la
  // compra; al guardarlo se elimina la compra de la lista.
  const categoriaValida = GASTOS_VARIABLES.includes(compra.categoria);
  document.dispatchEvent(new CustomEvent("movimiento:abrir", { detail: {
    modo: "nuevo",
    inicial: {
      categoria: "Gasto variable",
      concepto: categoriaValida ? compra.categoria : "Otros",
      descripcion: compra.concepto,
      monto: compra.montoDestinado > 0 ? compra.montoDestinado : 0,
    },
    titulo: `Comprar: ${compra.concepto}`,
    nota: "Al guardar, se registrará como Gasto variable y se eliminará de tu lista de compras.",
    despuesDeGuardar: async () => {
      try {
        await Sheets.borrarCompra(id);
        window.compras = window.compras.filter(c => c.id !== id);
        localStorage.setItem("cache_compras", JSON.stringify(window.compras));
        renderCompras();
        SyncManager.mostrarToast("✅ Movimiento registrado y compra eliminada de la lista");
      } catch (err) {
        console.warn("No se pudo borrar la compra de Sheets:", err);
        SyncManager.mostrarToast("✅ Movimiento registrado — borra la compra manualmente si quieres");
      }
    },
  } }));
}

// ---- GUARDAR NUEVA COMPRA ---- (la ventana es React, ver react/src/compromisos/Compromisos.jsx;
// acá solo se guarda. Si algo falla, lanza: la ventana avisa y se queda abierta.)
async function guardarCompraDatos({ concepto, categoria, montoDestinado, urgencia, fecha }) {
  await Sheets.agregarCompra(currentUser.email, fecha, concepto, categoria, montoDestinado, urgencia);

  compras.push({
    id: "CP_local_" + Date.now(),
    fecha, autor: currentUser.email,
    concepto, categoria, montoDestinado, urgencia
  });
  localStorage.setItem("cache_compras", JSON.stringify(compras));

  if (navigator.onLine) {
    await cargarCompras();
  } else {
    renderCompras();
    SyncManager.mostrarToast("💾 Guardado localmente — se sincronizará al conectarse");
  }
  SyncManager.mostrarToast(`✅ "${concepto}" agregado a la lista`);
}

// ---- BORRAR COMPRA ----
async function borrarCompra(id) {
  const c = compras.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`¿Eliminar "${c.concepto}" de la lista?`)) return;
  try {
    await Sheets.borrarCompra(id);
    compras = compras.filter(x => x.id !== id);
    localStorage.setItem("cache_compras", JSON.stringify(compras));
    renderCompras();
  } catch (err) {
    alert("Error borrando la compra: " + err.message);
  }
}

// ---- SETUP LISTENERS ----
function setupComprasListeners() {
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupComprasListeners);
} else {
  setTimeout(setupComprasListeners, 0);
}

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
  "Alta":  { color: "var(--red)",    bg: "var(--red-bg)",    icon: "🔴" },
  "Media": { color: "var(--yellow)", bg: "#fef3c7",          icon: "🟡" },
  "Baja":  { color: "var(--green)",  bg: "var(--green-bg)",  icon: "🟢" }
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
function renderCompras() {
  const lista = document.getElementById("compras-list");
  if (!lista) return;

  // Ordenar: Alta → Media → Baja, luego por fecha desc
  const orden = { "Alta": 0, "Media": 1, "Baja": 2 };
  const filtradas = [...compras].sort((a, b) => {
    const diff = (orden[a.urgencia] ?? 1) - (orden[b.urgencia] ?? 1);
    if (diff !== 0) return diff;
    return b.fecha.localeCompare(a.fecha);
  });

  // Resumen de monto total
  const totalDestinado = filtradas.reduce((s, c) => s + c.montoDestinado, 0);
  const elTotal = document.getElementById("compras-total-destinado");
  if (elTotal) elTotal.textContent = formatMonto(totalDestinado);
  const elCount = document.getElementById("compras-count");
  if (elCount) elCount.textContent = filtradas.length;

  if (filtradas.length === 0) {
    lista.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛍️</div>
        <div class="empty-state-text">No hay compras pendientes. ¡Agrega lo que quieres comprar!</div>
      </div>`;
    return;
  }

  lista.innerHTML = filtradas.map(c => {
    const urg = URGENCIA_CONFIG[c.urgencia] || URGENCIA_CONFIG["Media"];
    const tienePresupuesto = c.montoDestinado > 0;

    return `
      <div class="compra-item" data-id="${c.id}" onpointerup="tapCompra('${c.id}', event)">
        <div class="compra-urg-bar" style="background:${urg.color}"></div>
        <div class="compra-body">
          <div class="compra-top">
            <div class="compra-info">
              <span class="compra-concepto">${escapeHtml(c.concepto)}</span>
              <span class="compra-urgencia-badge" style="background:${urg.bg};color:${urg.color}">
                ${urg.icon} ${escapeHtml(c.urgencia)}
              </span>
              ${c.categoria ? `<span class="compra-cat-badge">${escapeHtml(c.categoria)}</span>` : ""}
            </div>
            <div class="compra-monto-wrap">
              ${tienePresupuesto
                ? `<span class="compra-monto">${formatMonto(c.montoDestinado)}</span>`
                : `<span class="compra-monto-vacio">Sin monto</span>`}
            </div>
          </div>
          <div class="compra-acciones">
            <button class="btn-comprar btn-primary"
              onclick="event.stopPropagation();abrirComprarAhora('${c.id}')" onpointerup="event.stopPropagation()">
              🛒 Comprar ahora
            </button>
          </div>
        </div>
      </div>`;
  }).join("");

  _conectarLargoPresionCompras(lista, filtradas);
}

// Doble toque abre un resumen de solo lectura; mantener presionada abre
// Eliminar (no hay "Editar" para una compra -- nunca existió esa
// función, solo crear/borrar). Mismo criterio único de gestos que el
// resto de la app, ver gestos.js.
const tapCompra = crearManejadorDobleToque(id => id, id => abrirResumenCompra(id));

function abrirResumenCompra(id) {
  const c = compras.find(x => x.id === id);
  if (!c) return;
  const urg = URGENCIA_CONFIG[c.urgencia] || URGENCIA_CONFIG["Media"];

  document.getElementById("resumen-compra-titulo").textContent = c.concepto;
  const cuerpo = document.getElementById("resumen-compra-cuerpo");
  if (cuerpo) {
    cuerpo.innerHTML = [
      ["Urgencia", `${urg.icon} ${c.urgencia}`],
      ["Categoría", c.categoria || "—"],
      ["Monto destinado", c.montoDestinado > 0 ? formatMonto(c.montoDestinado) : "—"],
      ["Fecha", c.fecha]
    ].map(([label, valor]) => `
      <div class="detalle-notif-fila">
        <span class="detalle-notif-label">${label}</span>
        <span class="detalle-notif-valor">${escapeHtml(String(valor))}</span>
      </div>`).join("");
  }
  document.getElementById("modal-resumen-compra")?.classList.remove("hidden");
}

function _conectarLargoPresionCompras(contenedor, lista) {
  contenedor.querySelectorAll(".compra-item").forEach(item => {
    const id = item.dataset.id;
    const c = lista.find(x => x.id === id);
    if (!c) return;
    crearManejadorPresionSostenida(item, {
      onLargo: () => abrirMenuEditarBorrar({
        titulo: c.concepto,
        onBorrar: () => borrarCompra(id)
      })
    });
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

  // Abrir el modal de movimiento
  const modal = document.getElementById("modal-movimiento");
  modal.classList.remove("hidden");
  modal.dataset.fromCompraId = id;

  // Pre-llenar campos
  poblarSelectCajaMovimiento();
  actualizarConceptosPrestamo();

  // Fecha hoy
  document.getElementById("mov-fecha").value = new Date().toISOString().split("T")[0];

  // Categoría: Gasto variable
  document.getElementById("mov-categoria").value = "Gasto variable";
  document.querySelectorAll(".cat-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.value === "Gasto variable"));
  actualizarCampoConcepto();

  // Concepto: nombre de la compra
const categoriaValida = GASTOS_VARIABLES.includes(compra.categoria);
if (categoriaValida) {
  document.getElementById("mov-concepto-variable").value = compra.categoria;
} else {
  document.getElementById("mov-concepto-variable").value = "Otros";
}
document.getElementById("mov-descripcion").value = compra.concepto;
  

  // Monto si tiene destinado
  if (compra.montoDestinado > 0) {
    document.getElementById("mov-monto").value = compra.montoDestinado.toLocaleString("es-CO");
  }

  // Actualizar título del modal para dar contexto
  const titulo = modal.querySelector(".modal-title");
  if (titulo) titulo.textContent = `Comprar: ${compra.concepto}`;

  // Mostrar nota informativa si no existe ya
  let nota = modal.querySelector(".compra-nota");
  if (!nota) {
    nota = document.createElement("p");
    nota.className = "compra-nota modal-subtitle";
    modal.querySelector(".modal-card").insertBefore(nota, modal.querySelector(".form-row"));
  }
  nota.textContent = `Al guardar, se registrará como Gasto variable y se eliminará de tu lista de compras.`;
}

// ---- LIMPIAR CONTEXTO DE COMPRA ----
function _limpiarCompraContexto() {
  const modal = document.getElementById("modal-movimiento");
  if (!modal) return;
  delete modal.dataset.fromCompraId;
  const titulo = modal.querySelector(".modal-title");
  if (titulo) titulo.textContent = "Nuevo movimiento";
  const nota = modal.querySelector(".compra-nota");
  if (nota) nota.remove();
}

// ---- INTERCEPTAR guardarMovimiento ----
function inicializarInterceptorCompras() {
  if (typeof guardarMovimiento === "undefined") {
    setTimeout(inicializarInterceptorCompras, 100);
    return;
  }

  const _guardarMovimientoOriginal = guardarMovimiento;

  window.guardarMovimiento = async function () {
    const modal        = document.getElementById("modal-movimiento");
    const fromCompraId = modal.dataset.fromCompraId;
    const btn          = document.getElementById("btn-guardar-mov");

    try {
      await _guardarMovimientoOriginal();
    } catch (err) {
      if (!err.message.includes("Cannot set properties of null")) {
        alert("Error guardando el movimiento: " + err.message);
      }
    } finally {
      if (btn) { btn.textContent = "Guardar"; btn.disabled = false; }
    }

    if (fromCompraId && modal.classList.contains("hidden")) {
      delete modal.dataset.fromCompraId;
      const titulo = modal.querySelector(".modal-title");
      if (titulo) titulo.textContent = "Nuevo movimiento";
      const nota = modal.querySelector(".compra-nota");
      if (nota) nota.remove();

      try {
        await Sheets.borrarCompra(fromCompraId);
        window.compras = window.compras.filter(c => c.id !== fromCompraId);
        localStorage.setItem("cache_compras", JSON.stringify(window.compras));
        renderCompras();
        SyncManager.mostrarToast("✅ Movimiento registrado y compra eliminada de la lista");
      } catch (err) {
        console.warn("No se pudo borrar la compra de Sheets:", err);
        SyncManager.mostrarToast("✅ Movimiento registrado — borra la compra manualmente si quieres");
      }
    }
  };
}

// Arrancar el interceptor cuando el DOM esté listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inicializarInterceptorCompras);
} else {
  setTimeout(inicializarInterceptorCompras, 100);
}

// ---- GUARDAR NUEVA COMPRA ----
async function guardarCompra() {
  const concepto       = document.getElementById("compra-concepto").value.trim();
  const categoria      = document.getElementById("compra-categoria").value.trim();
  const montoDestinado = evaluarMonto(document.getElementById("compra-monto").value) || 0;
  const urgencia       = document.getElementById("compra-urgencia").value;
  const fecha          = document.getElementById("compra-fecha").value;

  if (!concepto) { alert("Escribe el nombre de lo que quieres comprar"); return; }
  if (!fecha)    { alert("Selecciona una fecha"); return; }

  const btn = document.getElementById("btn-guardar-compra");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    await Sheets.agregarCompra(currentUser.email, fecha, concepto, categoria, montoDestinado, urgencia);

    compras.push({
      id: "CP_local_" + Date.now(),
      fecha, autor: currentUser.email,
      concepto, categoria, montoDestinado, urgencia
    });
    localStorage.setItem("cache_compras", JSON.stringify(compras));

    document.getElementById("modal-compra").classList.add("hidden");
    limpiarFormCompra();

    if (navigator.onLine) {
      await cargarCompras();
    } else {
      renderCompras();
      SyncManager.mostrarToast("💾 Guardado localmente — se sincronizará al conectarse");
    }
    SyncManager.mostrarToast(`✅ "${concepto}" agregado a la lista`);
  } catch (err) {
    alert("Error guardando la compra: " + err.message);
  } finally {
    btn.textContent = "Agregar"; btn.disabled = false;
  }
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

// ---- LIMPIAR FORM ----
function limpiarFormCompra() {
  document.getElementById("compra-concepto").value  = "";
  document.getElementById("compra-categoria").value = "";
  document.getElementById("compra-monto").value     = "";
  document.getElementById("compra-urgencia").value  = "Media";
  document.getElementById("compra-fecha").value     = new Date().toISOString().split("T")[0];
}

// ---- SETUP LISTENERS ----
function setupComprasListeners() {
 document.getElementById("btn-nueva-compra")
  .addEventListener("click", () => {
    const sel = document.getElementById("compra-categoria");
    if (sel && sel.options.length <= 1) {
      GASTOS_VARIABLES.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
      });
    }
    document.getElementById("compra-fecha").value = new Date().toISOString().split("T")[0];
    document.getElementById("modal-compra").classList.remove("hidden");
  });

  document.getElementById("btn-cancelar-compra")
    .addEventListener("click", () => {
      document.getElementById("modal-compra").classList.add("hidden");
      limpiarFormCompra();
    });

  document.getElementById("btn-guardar-compra")
    .addEventListener("click", guardarCompra);

  // Separadores de miles en monto de compra
  const compraMonto = document.getElementById("compra-monto");
  if (compraMonto) compraMonto.addEventListener("input", () => formatearInputMiles(compraMonto));

  // Cerrar tocando el fondo ya lo cubre el listener genérico de app.js
  // (ver cerrarModal, que ya sabe llamar a limpiarFormCompra para este modal).

  document.getElementById("btn-cancelar-mov")
    .addEventListener("click", _limpiarCompraContexto, { capture: false });

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupComprasListeners);
} else {
  setTimeout(setupComprasListeners, 0);
}

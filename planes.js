// =============================================
// MÓDULO PLANES — lista de ideas/lugares para salir o viajar
// =============================================
// Hoja "Planes" en Google Sheets (se crea sola, mismo patrón que
// Notificaciones/Recordatorios):
// A: id | B: nombre | C: ubicacion | D: fecha (YYYY-MM-DD, opcional) |
// E: tipo (gratis/pago) | F: inversion (monto, solo si tipo=pago) |
// G: categoria (bloque, ver bloquesPlanes más abajo) | H: autor
//
// A propósito SIN estado ni fecha/hora obligatoria como Alertas -- esto es
// una lista de ideas/deseos (pedido explícito: "lista de ideas/lugares",
// sin seguimiento de hecho/pendiente), no un recordatorio programado. No
// dispara push ni depende del Worker para nada.

// ---- EXTENSIÓN DE Sheets PARA PLANES ----

Sheets._planesHojaLista = false;

Sheets._asegurarHojaPlanes = async function () {
  if (this._planesHojaLista) return;
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const existe = meta.sheets.some(s => s.properties.title === CONFIG.SHEETS.PLANES);

  if (!existe) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CONFIG.SHEETS.PLANES } } }] })
      }
    );
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.PLANES + "!A1")}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["id", "nombre", "ubicacion", "fecha", "tipo", "inversion", "categoria", "autor"]] })
      }
    );
  }
  this._planesHojaLista = true;
};

Sheets.getPlanes = async function () {
  await this._asegurarHojaPlanes();
  const rows = await this.leer(`${CONFIG.SHEETS.PLANES}!A2:H`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:         r[0] || "",
    nombre:     r[1] || "",
    ubicacion:  r[2] || "",
    fecha:      r[3] || "",
    tipo:       r[4] || "gratis",
    inversion:  r[5] || "",
    categoria:  r[6] || "",
    autor:      r[7] || ""
  }));
};

Sheets.agregarPlan = async function (nombre, ubicacion, fecha, tipo, inversion, categoria, autor) {
  await this._asegurarHojaPlanes();
  const id = "P" + Date.now();
  await this.agregar(CONFIG.SHEETS.PLANES, [id, nombre, ubicacion || "", fecha || "", tipo || "gratis", inversion || "", categoria || "", autor || ""]);
  return id;
};

Sheets.editarPlan = async function (id, campos) {
  const rows = await this.leer(`${CONFIG.SHEETS.PLANES}!A2:H`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Plan no encontrado");
  const sheetRow = rowIndex + 2;
  const actual = rows[rowIndex];
  const nueva = [
    id,
    campos.nombre ?? actual[1],
    campos.ubicacion ?? actual[2] ?? "",
    campos.fecha ?? actual[3] ?? "",
    campos.tipo ?? actual[4],
    campos.inversion ?? actual[5] ?? "",
    campos.categoria ?? actual[6] ?? "",
    actual[7] || ""
  ];
  const range = `${CONFIG.SHEETS.PLANES}!A${sheetRow}:H${sheetRow}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [nueva] })
    }
  );
  if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!res.ok) throw new Error(`Error actualizando plan: ${res.status}`);
  return res.json();
};

Sheets.borrarPlan = async function (id) {
  const rows = await this.leer(`${CONFIG.SHEETS.PLANES}!A2:A`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Plan no encontrado");
  const sheetRowIndex = rowIndex + 1;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === CONFIG.SHEETS.PLANES);
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
  if (!res.ok) throw new Error(`Error borrando plan: ${res.status}`);
};

// =============================================
// BLOQUES (categorías personalizadas) -- mismo patrón que
// bloquesAlertas/obtenerBloquesAlertas en notificaciones.js: se guardan del
// lado del servidor (Sheets, ConfigUsuario) por email de quien las creó,
// así cargan igual en cualquier dispositivo. A diferencia de Alertas, acá
// no hay bloques fijos como "Gastos fijos" -- solo "Otros" (fijo, para los
// planes sin categoría) más los que el usuario cree.
// =============================================

let planes = []; // cache en memoria, la llena cargarPlanes()
let bloquesPlanes = []; // cache en memoria, la llena cargarBloquesPlanes()

function _planesCacheKey() {
  return `cache_planes_${currentUser?.email || "anon"}`;
}

function _bloquesPlanesCacheKey() {
  return `cache_planes_bloques_${currentUser?.email || "anon"}`;
}

async function cargarPlanes() {
  try {
    planes = await Sheets.getPlanes();
    localStorage.setItem(_planesCacheKey(), JSON.stringify(planes));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem(_planesCacheKey());
    if (cache) { try { planes = JSON.parse(cache); } catch { planes = []; } }
  }
  renderPlanes();
}

function _normalizarBloquesPlanes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(b => typeof b === "string" ? { nombre: b, icono: "🗂️" } : b);
}

async function cargarBloquesPlanes() {
  try {
    const valor = await Sheets.getConfigUsuario(currentUser.email, "planes_bloques");
    bloquesPlanes = _normalizarBloquesPlanes(valor);
    localStorage.setItem(_bloquesPlanesCacheKey(), JSON.stringify(bloquesPlanes));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem(_bloquesPlanesCacheKey());
    if (cache) { try { bloquesPlanes = JSON.parse(cache); } catch { bloquesPlanes = []; } }
  }
}

function obtenerBloquesPlanes() {
  return bloquesPlanes;
}

async function _guardarBloquesPlanes(bloques) {
  bloquesPlanes = bloques;
  localStorage.setItem(_bloquesPlanesCacheKey(), JSON.stringify(bloques));
  await Sheets.guardarConfigUsuario(currentUser.email, "planes_bloques", bloques);
}

async function agregarBloquePlan(nombre, icono) {
  const bloques = obtenerBloquesPlanes();
  if (!nombre || bloques.some(b => b.nombre === nombre)) return false;
  await _guardarBloquesPlanes([...bloques, { nombre, icono: icono || "🗂️" }]);
  return true;
}

async function borrarBloquePlan(nombre) {
  await _guardarBloquesPlanes(obtenerBloquesPlanes().filter(b => b.nombre !== nombre));
}

// Se llama al soltar tras arrastrar una tarjeta de categoría a un lugar
// nuevo (ver crearManejadorArrastrable en gestos.js) -- mismo patrón que
// _reordenarBloquesAlertaDesdeGrid en notificaciones.js.
function _reordenarBloquesPlanesDesdeGrid(grid) {
  const bloques = obtenerBloquesPlanes();
  const nuevoOrden = Array.from(grid.querySelectorAll('.alerta-bloque-card[data-clave^="bloque_"]'))
    .map(btn => bloques[parseInt(btn.dataset.clave.slice("bloque_".length), 10)])
    .filter(Boolean);
  _guardarBloquesPlanes(nuevoOrden);
  renderPlanes();
}

// =============================================
// RENDER — cuadrícula de categorías / detalle de una categoría
// =============================================

// clave del bloque cuya pantalla de detalle está abierta -- null = se ve
// la cuadrícula. Vive fuera de renderPlanes() para sobrevivir a que la
// lista se repinte entera cada vez que llegan datos nuevos.
let bloquePlanAbierto = null;

function renderPlanes() {
  const lista = document.getElementById("planes-list");
  if (!lista) return;

  const bloquesPersonalizados = obtenerBloquesPlanes();
  const porBloque = {};
  bloquesPersonalizados.forEach(b => { porBloque[b.nombre] = []; });
  const otros = [];
  planes.forEach(p => {
    if (p.categoria && porBloque[p.categoria]) porBloque[p.categoria].push(p);
    else otros.push(p);
  });

  const grupos = {};
  grupos.otros = { titulo: "Otros", icono: "🔖", items: otros, eliminable: false, valorBloque: "" };
  bloquesPersonalizados.forEach((b, i) => {
    grupos[`bloque_${i}`] = { titulo: b.nombre, icono: b.icono, items: porBloque[b.nombre] || [], eliminable: true, nombreBloque: b.nombre, valorBloque: b.nombre };
  });

  if (bloquePlanAbierto && !grupos[bloquePlanAbierto]) bloquePlanAbierto = null; // se borró el bloque que estaba abierto

  if (bloquePlanAbierto) {
    renderBloquePlanDetalle(lista, grupos[bloquePlanAbierto], bloquePlanAbierto);
  } else {
    renderBloquesPlanGrid(lista, grupos);
  }
}

// ---- Cuadrícula de categorías (2 columnas, estilo Acciones rápidas/Alertas) ----
function renderBloquesPlanGrid(lista, grupos) {
  const tarjetas = Object.entries(grupos).map(([clave, g]) => `
    <button type="button" class="alerta-bloque-card" data-clave="${clave}">
      ${g.items.length > 0 ? `<span class="alerta-bloque-cantidad">${g.items.length}</span>` : ""}
      <span class="alerta-bloque-icono">${g.icono}</span>
      <span class="alerta-bloque-nombre">${escapeHtml(g.titulo)}</span>
    </button>`).join("");

  lista.innerHTML = `
    <div class="alertas-bloques-grid">
      ${tarjetas}
      <button type="button" class="alerta-bloque-card alerta-bloque-agregar" id="btn-nueva-categoria-plan">
        <span class="alerta-bloque-icono">➕</span>
        <span class="alerta-bloque-nombre">Agregar categoría</span>
      </button>
    </div>`;

  const grid = lista.querySelector(".alertas-bloques-grid");
  const abrir = (clave) => { bloquePlanAbierto = clave; renderPlanes(); };

  lista.querySelectorAll(".alerta-bloque-card[data-clave]").forEach(btn => {
    const clave = btn.dataset.clave;
    // Solo las categorías que el usuario creó (bloque_N) se pueden
    // arrastrar para reordenar -- "Otros" siempre va primero.
    if (clave.startsWith("bloque_")) {
      crearManejadorArrastrable(btn, grid, '.alerta-bloque-card[data-clave^="bloque_"]', {
        onCorto: () => abrir(clave),
        onReordenar: () => _reordenarBloquesPlanesDesdeGrid(grid)
      });
    } else {
      btn.addEventListener("click", () => abrir(clave));
    }
  });

  document.getElementById("btn-nueva-categoria-plan")?.addEventListener("click", () => {
    document.getElementById("bloque-plan-nombre").value = "";
    document.getElementById("bloque-plan-icono").value = "";
    document.getElementById("modal-bloque-plan")?.classList.remove("hidden");
  });
}

// "10/9/2026" en vez de un formato con hora -- un plan no tiene hora,
// solo una fecha (o ninguna, si todavía es solo una idea sin definir).
function _formatoFechaPlan(fechaISO) {
  if (!fechaISO) return "";
  const d = new Date(fechaISO + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

// ---- Tarjeta de un plan (nombre + tag arriba, ubicación/fecha/inversión abajo) ----
function renderItemPlan(p) {
  const esPago = p.tipo === "pago";
  const tagClase = esPago ? "plan-tag-pago" : "plan-tag-gratis";
  const tagTexto = esPago ? "💰 Pago" : "🆓 Gratis";
  const fechaTexto = _formatoFechaPlan(p.fecha);
  const detalles = [
    p.ubicacion ? `<span>📍 ${escapeHtml(p.ubicacion)}</span>` : "",
    fechaTexto ? `<span>🗓️ ${fechaTexto}</span>` : "",
    esPago && p.inversion ? `<span>💵 $${Number(p.inversion).toLocaleString("es-CO")}</span>` : ""
  ].filter(Boolean).join("");

  return `
    <div class="notificacion-item" data-id="${p.id}" onpointerup="tapPlan('${p.id}', event)">
      <div class="notif-card-grid">
        <div class="notif-card-fila-superior">
          <span class="notif-card-nombre">${escapeHtml(p.nombre)}</span>
          <span class="plan-tag ${tagClase}">${tagTexto}</span>
        </div>
        ${detalles ? `<div class="plan-card-detalle">${detalles}</div>` : ""}
      </div>
    </div>`;
}

// ---- Pantalla de detalle de una categoría (se abre al tocar su tarjeta) ----
function renderBloquePlanDetalle(lista, grupo, clave) {
  // De más próximo a más lejano -- los sin fecha (todavía solo una idea)
  // van al final.
  const itemsOrdenados = [...grupo.items].sort((a, b) => {
    if (!a.fecha && !b.fecha) return 0;
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    return a.fecha.localeCompare(b.fecha);
  });
  const itemsHTML = itemsOrdenados.length > 0
    ? itemsOrdenados.map(p => renderItemPlan(p)).join("")
    : `<div class="notif-bloque-vacio">No hay planes acá todavía.</div>`;

  lista.innerHTML = `
    <div class="alerta-bloque-detalle-header">
      <button type="button" class="btn-volver" id="btn-volver-bloque-plan" title="Volver" aria-label="Volver">‹</button>
      <span class="alerta-bloque-detalle-titulo">${grupo.icono} ${escapeHtml(grupo.titulo)} (${grupo.items.length})</span>
      ${grupo.eliminable ? `<button type="button" class="notif-btn-borrar-bloque" title="Eliminar categoría">🗑️</button>` : ""}
    </div>
    <button type="button" class="btn-primary btn-franja" id="btn-nuevo-plan-bloque">+ Nuevo plan</button>
    ${itemsHTML}`;

  document.getElementById("btn-volver-bloque-plan")?.addEventListener("click", () => cerrarPantallaActual());

  document.getElementById("btn-nuevo-plan-bloque")?.addEventListener("click", () => {
    abrirNuevoPlanEnBloque(grupo.valorBloque);
  });

  lista.querySelector(".notif-btn-borrar-bloque")?.addEventListener("click", async () => {
    const nombre = grupo.nombreBloque;
    if (!confirm(`¿Eliminar la categoría "${nombre}"?\n\nLos planes que tenía pasan a "Otros" -- no se borran.`)) return;
    try {
      await borrarBloquePlan(nombre);
    } catch (err) {
      alert("Error borrando la categoría: " + err.message);
      return;
    }
    bloquePlanAbierto = null;
    renderPlanes();
  });

  lista.querySelectorAll(".notificacion-item[data-id]").forEach(item => {
    const id = item.dataset.id;
    const p = itemsOrdenados.find(x => x.id === id);
    if (!p) return;
    crearManejadorPresionSostenida(item, {
      onLargo: () => abrirMenuEditarBorrar({
        titulo: p.nombre,
        onEditar: () => abrirEditarPlan(id),
        onBorrar: () => borrarPlan(id)
      })
    });
  });
}

// Doble tap/clic manual -- mismo patrón que tapNotificacion en
// notificaciones.js (onpointerup, no ondblclick/onclick: ver ese
// comentario para el porqué, bug real ya resuelto ahí).
const tapPlan = crearManejadorDobleToque(id => id, id => abrirResumenPlan(id));

// ---- Resumen de un plan (doble toque sobre su tarjeta) ----
function abrirResumenPlan(id) {
  const p = planes.find(x => x.id === id);
  if (!p) return;

  const bloqueLabel = p.categoria ? `🗂️ ${p.categoria}` : "🔖 Otros";
  const filas = [
    ["Categoría", bloqueLabel],
    ["Ubicación", p.ubicacion || "—"],
    ["Fecha", _formatoFechaPlan(p.fecha) || "—"],
    ["Tipo", p.tipo === "pago" ? "💰 Pago" : "🆓 Gratis"]
  ];
  if (p.tipo === "pago") filas.push(["Inversión", p.inversion ? `$${Number(p.inversion).toLocaleString("es-CO")}` : "—"]);

  document.getElementById("resumen-plan-titulo").textContent = p.nombre;
  const cuerpo = document.getElementById("resumen-plan-cuerpo");
  if (cuerpo) {
    cuerpo.innerHTML = filas.map(([label, valor]) => `
      <div class="detalle-notif-fila">
        <span class="detalle-notif-label">${escapeHtml(label)}</span>
        <span class="detalle-notif-valor">${escapeHtml(String(valor))}</span>
      </div>`).join("");
  }

  document.getElementById("modal-resumen-plan")?.classList.remove("hidden");
}

// =============================================
// CREAR / EDITAR un plan -- solo se puede crear DESDE una categoría (ver
// conversación: mismo criterio que Alertas), así que el selector de
// categoría queda oculto al crear y solo se muestra al editar.
// =============================================

let planIdActual = null; // id en edición, o null = creando uno nuevo

function actualizarTipoPlanForm(tipo) {
  document.getElementById("plan-tipo-gratis")?.classList.toggle("active", tipo !== "pago");
  document.getElementById("plan-tipo-pago")?.classList.toggle("active", tipo === "pago");
  document.getElementById("plan-inversion-row")?.classList.toggle("hidden", tipo !== "pago");
}

function poblarSelectBloquePlan() {
  const sel = document.getElementById("plan-bloque");
  if (!sel) return;
  const valorActual = sel.value;
  const bloques = obtenerBloquesPlanes();
  sel.innerHTML = `<option value="">🔖 Otros</option>` +
    bloques.map(b => `<option value="${escapeAttr(b.nombre)}">${escapeHtml(b.icono)} ${escapeHtml(b.nombre)}</option>`).join("");
  sel.value = ["", ...bloques.map(b => b.nombre)].includes(valorActual) ? valorActual : "";
}

function limpiarFormPlan() {
  document.getElementById("plan-nombre").value = "";
  document.getElementById("plan-ubicacion").value = "";
  document.getElementById("plan-fecha").value = "";
  document.getElementById("plan-inversion").value = "";
  actualizarTipoPlanForm("gratis");

  const modal = document.getElementById("modal-plan");
  planIdActual = null;
  modal.dataset.categoria = "";
  modal.querySelector(".modal-title").textContent = "Nuevo plan";
  document.getElementById("btn-guardar-plan").textContent = "Guardar";
  document.getElementById("plan-bloque-row")?.classList.add("hidden");
}

// valorBloque: categoría del bloque desde el que se crea -- ya viene
// decidida, no tiene sentido mostrar el selector (mismo criterio que
// abrirNuevaNotificacionEnBloque en notificaciones.js).
function abrirNuevoPlanEnBloque(valorBloque) {
  limpiarFormPlan();
  document.getElementById("modal-plan").dataset.categoria = valorBloque || "";
  document.getElementById("modal-plan")?.classList.remove("hidden");
}

// ---- Editar (reusa el modal de "Nuevo plan") -- acá sí se ve y se puede
// cambiar la categoría, a diferencia de crear uno nuevo. ----
function abrirEditarPlan(id) {
  const p = planes.find(x => x.id === id);
  if (!p) return;

  document.getElementById("plan-nombre").value = p.nombre;
  document.getElementById("plan-ubicacion").value = p.ubicacion || "";
  document.getElementById("plan-fecha").value = p.fecha || "";
  document.getElementById("plan-inversion").value = p.inversion || "";
  actualizarTipoPlanForm(p.tipo);

  poblarSelectBloquePlan();
  document.getElementById("plan-bloque").value = p.categoria || "";
  document.getElementById("plan-bloque-row")?.classList.remove("hidden");

  const modal = document.getElementById("modal-plan");
  planIdActual = id;
  modal.querySelector(".modal-title").textContent = "Editar plan";
  document.getElementById("btn-guardar-plan").textContent = "Guardar cambios";
  modal.classList.remove("hidden");
}

async function guardarPlan() {
  const nombre = document.getElementById("plan-nombre").value.trim();
  const ubicacion = document.getElementById("plan-ubicacion").value.trim();
  const fecha = document.getElementById("plan-fecha").value;
  const tipo = document.getElementById("plan-tipo-pago")?.classList.contains("active") ? "pago" : "gratis";
  const inversion = tipo === "pago" ? (evaluarMonto(document.getElementById("plan-inversion").value) || "") : "";

  if (!nombre) { alert("Ponle un nombre al plan"); return; }

  const modal = document.getElementById("modal-plan");
  const categoria = planIdActual
    ? (document.getElementById("plan-bloque")?.value || "")
    : (modal.dataset.categoria || "");

  const btn = document.getElementById("btn-guardar-plan");
  const textoOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = "Guardando...";

  try {
    if (planIdActual) {
      await Sheets.editarPlan(planIdActual, { nombre, ubicacion, fecha, tipo, inversion, categoria });
    } else {
      await Sheets.agregarPlan(nombre, ubicacion, fecha, tipo, inversion, categoria, currentUser?.email || "");
    }
    modal.classList.add("hidden");
    limpiarFormPlan();
    await cargarPlanes();
    SyncManager.mostrarToast(`✅ "${nombre}" ${planIdActual ? "actualizado" : "guardado"}`);
  } catch (err) {
    alert("Error guardando el plan: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = textoOriginal;
  }
}

async function borrarPlan(id) {
  const p = planes.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.nombre}" definitivamente?`)) return;
  try {
    await Sheets.borrarPlan(id);
    await cargarPlanes();
  } catch (err) {
    alert("Error borrando el plan: " + err.message);
  }
}

// =============================================
// LISTENERS
// =============================================

function setupPlanesListeners() {
  document.getElementById("plan-tipo-gratis")?.addEventListener("click", () => actualizarTipoPlanForm("gratis"));
  document.getElementById("plan-tipo-pago")?.addEventListener("click", () => actualizarTipoPlanForm("pago"));

  document.getElementById("btn-cancelar-plan")?.addEventListener("click", () => {
    document.getElementById("modal-plan")?.classList.add("hidden");
    limpiarFormPlan();
  });

  document.getElementById("btn-guardar-plan")?.addEventListener("click", guardarPlan);

  document.getElementById("btn-cerrar-resumen-plan")?.addEventListener("click", () => {
    document.getElementById("modal-resumen-plan")?.classList.add("hidden");
  });

  document.getElementById("btn-guardar-bloque-plan")?.addEventListener("click", async () => {
    const nombre = document.getElementById("bloque-plan-nombre").value.trim();
    const icono  = document.getElementById("bloque-plan-icono").value.trim();
    if (!nombre) { alert("Ponle un nombre a la categoría"); return; }
    const btn = document.getElementById("btn-guardar-bloque-plan");
    const textoOriginal = btn.textContent;
    btn.disabled = true; btn.textContent = "Guardando...";
    try {
      const ok = await agregarBloquePlan(nombre, icono);
      if (!ok) { alert("Ya existe una categoría con ese nombre"); return; }
      document.getElementById("modal-bloque-plan")?.classList.add("hidden");
      renderPlanes();
    } catch (err) {
      alert("Error guardando la categoría: " + err.message);
    } finally {
      btn.disabled = false; btn.textContent = textoOriginal;
    }
  });

  document.getElementById("btn-cancelar-bloque-plan")?.addEventListener("click", () => {
    document.getElementById("modal-bloque-plan")?.classList.add("hidden");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupPlanesListeners);
} else {
  setTimeout(setupPlanesListeners, 0);
}

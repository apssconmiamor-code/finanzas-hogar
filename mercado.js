// =============================================
// MÓDULO MERCADO — catálogo de productos para el supermercado
// =============================================
// Hoja "Mercado" en Google Sheets:
// A: id | B: nombre | C: categoria | D: subcategoria | E: hay_que_comprar | F: autor
//
// A diferencia del resto de la app (doble toque = ver un resumen de solo
// lectura, mantener presionado = único camino a Editar/Eliminar -- ver
// gestos.js), acá el doble toque hace la acción central del módulo:
// marcar/desmarcar un producto en gris = "hay que comprarlo en la próxima
// compra de mercado" (pedido explícito). No hay un resumen de solo
// lectura separado -- mantener presionado sigue siendo el único camino a
// Editar/Eliminar, igual que siempre.

// ---- EXTENSIÓN DE Sheets PARA MERCADO ----

Sheets._mercadoHojaLista = false;

Sheets._asegurarHojaMercado = async function () {
  if (this._mercadoHojaLista) return;
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const existe = meta.sheets.some(s => s.properties.title === CONFIG.SHEETS.MERCADO);

  if (!existe) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CONFIG.SHEETS.MERCADO } } }] })
      }
    );
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.MERCADO + "!A1")}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["id", "nombre", "categoria", "subcategoria", "hay_que_comprar", "autor"]] })
      }
    );
  }
  this._mercadoHojaLista = true;
};

Sheets.getMercadoProductos = async function () {
  await this._asegurarHojaMercado();
  const rows = await this.leer(`${CONFIG.SHEETS.MERCADO}!A2:F`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:            r[0] || "",
    nombre:        r[1] || "",
    categoria:     r[2] || "",
    subcategoria:  r[3] || "",
    hayQueComprar: r[4] === true || r[4] === "true" || r[4] === "TRUE",
    autor:         r[5] || ""
  }));
};

Sheets.agregarProductoMercado = async function (autor, nombre, categoria, subcategoria) {
  await this._asegurarHojaMercado();
  const id = "MK" + Date.now();
  await this.agregar(CONFIG.SHEETS.MERCADO, [id, nombre, categoria, subcategoria, "false", autor]);
  return id;
};

Sheets._escribirFilaMercado = async function (id, campos) {
  const rows = await this.leer(`${CONFIG.SHEETS.MERCADO}!A2:F`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Producto no encontrado");
  const sheetRow = rowIndex + 2;
  const actual = rows[rowIndex];
  const nueva = [
    id,
    campos.nombre ?? actual[1],
    campos.categoria ?? actual[2],
    campos.subcategoria ?? actual[3],
    campos.hayQueComprar !== undefined ? String(campos.hayQueComprar) : (actual[4] ?? "false"),
    actual[5] || ""
  ];
  const range = `${CONFIG.SHEETS.MERCADO}!A${sheetRow}:F${sheetRow}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [nueva] })
    }
  );
  if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!res.ok) throw new Error(`Error editando producto: ${res.status}`);
  return res.json();
};

Sheets.editarProductoMercado = function (id, campos) {
  return this._escribirFilaMercado(id, campos);
};

Sheets.borrarProductoMercado = async function (id) {
  const rows = await this.leer(`${CONFIG.SHEETS.MERCADO}!A2:A`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Producto no encontrado");
  const sheetRowIndex = rowIndex + 1;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === CONFIG.SHEETS.MERCADO);
  if (!sheet) throw new Error("Hoja de mercado no encontrada");
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
  if (!res.ok) throw new Error(`Error borrando producto: ${res.status}`);
  return res.json();
};

// =============================================
// LÓGICA DE UI
// =============================================

window.productosMercado = window.productosMercado || [];

// ---- CARGA ----
async function cargarMercado() {
  try {
    productosMercado = await Sheets.getMercadoProductos();
    localStorage.setItem("cache_mercado", JSON.stringify(productosMercado));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem("cache_mercado");
    if (cache) { try { productosMercado = JSON.parse(cache); } catch {} }
  }
  renderMercado();
}

// ---- RENDER: agrupado por categoría -> subcategoría, cada nivel A-Z ----
function renderMercado() {
  const cont = document.getElementById("mercado-list");
  if (!cont) return;

  if (productosMercado.length === 0) {
    cont.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛒</div>
        <div class="empty-state-text">No hay productos todavía. Agrega los que compras seguido.</div>
      </div>`;
    return;
  }

  // Sin categoría/subcategoría cae en "Sin categoría"/"Sin subcategoría" en
  // vez de desaparecer -- un producto siempre tiene que verse en algún lado.
  const porCategoria = {};
  [...productosMercado]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(p => {
      const cat = p.categoria || "Sin categoría";
      const sub = p.subcategoria || "Sin subcategoría";
      porCategoria[cat] = porCategoria[cat] || {};
      porCategoria[cat][sub] = porCategoria[cat][sub] || [];
      porCategoria[cat][sub].push(p);
    });

  const categoriasOrdenadas = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b));

  cont.innerHTML = categoriasOrdenadas.map(cat => {
    const subcats = porCategoria[cat];
    const subcatsOrdenadas = Object.keys(subcats).sort((a, b) => a.localeCompare(b));
    return `
      <div class="mercado-categoria">
        <div class="mercado-categoria-titulo">${escapeHtml(cat)}</div>
        ${subcatsOrdenadas.map(sub => `
          <div class="mercado-subcategoria">
            <div class="mercado-subcategoria-titulo">${escapeHtml(sub)}</div>
            <div class="mercado-productos-grid">
              ${subcats[sub].map(p => `
                <div class="mercado-item${p.hayQueComprar ? " mercado-item-comprar" : ""}" data-id="${p.id}" onpointerup="tapProductoMercado('${p.id}', event)">${escapeHtml(p.nombre)}</div>`).join("")}
            </div>
          </div>`).join("")}
      </div>`;
  }).join("");

  _conectarLargoPresionMercado(cont);
}

// Doble toque = alternar "hay que comprarlo" (ver cabecera del archivo --
// único módulo donde el doble toque muta algo en vez de solo mostrar un
// resumen de solo lectura).
const tapProductoMercado = crearManejadorDobleToque(id => id, id => alternarHayQueComprarMercado(id));

// Optimista: se ve al toque, antes de que Sheets confirme -- se revierte
// solo si falla, para no dejar mostrando algo que no se guardó.
async function alternarHayQueComprarMercado(id) {
  const p = productosMercado.find(x => x.id === id);
  if (!p) return;
  const nuevoValor = !p.hayQueComprar;

  p.hayQueComprar = nuevoValor;
  localStorage.setItem("cache_mercado", JSON.stringify(productosMercado));
  renderMercado();

  try {
    await Sheets.editarProductoMercado(id, { hayQueComprar: nuevoValor });
  } catch (err) {
    p.hayQueComprar = !nuevoValor;
    localStorage.setItem("cache_mercado", JSON.stringify(productosMercado));
    renderMercado();
    if (err.message !== "TOKEN_EXPIRADO") alert("No se pudo guardar el cambio: " + err.message);
  }
}

function _conectarLargoPresionMercado(cont) {
  cont.querySelectorAll(".mercado-item[data-id]").forEach(item => {
    const id = item.dataset.id;
    const p = productosMercado.find(x => x.id === id);
    if (!p) return;
    crearManejadorPresionSostenida(item, {
      onLargo: () => abrirMenuEditarBorrar({
        titulo: p.nombre,
        onEditar: () => abrirEditarProductoMercado(id),
        onBorrar: () => borrarProductoMercado(id)
      })
    });
  });
}

// ---- Panel de sugerencias de categoría/subcategoría: mismo look que el
// selector de Caja/Concepto de Movimientos (.caja-picker-panel) -- evita
// <datalist> nativo, poco confiable en iOS Safari (ver comentario junto a
// PANELES_CONCEPTO en app.js). A propósito NO se engancha al sistema
// compartido de esos campos (PANELES_CONCEPTO, que reabre el panel solo
// con cada tecla escrita): acá el panel solo se abre con el botón ▾, a
// pedido -- bug real encontrado armando este módulo: al escribir una
// categoría nueva sin coincidencias, el panel (posición absoluta, encima
// del resto del formulario) se quedaba abierto tapando Guardar, y el
// toque no llegaba al botón. Las opciones son las categorías/
// subcategorías que el usuario ya escribió antes en otros productos, se
// recalculan cada vez que se abre el panel.
function _listaCategoriasMercado() {
  return [...new Set(productosMercado.map(p => p.categoria).filter(Boolean))].sort();
}
function _listaSubcategoriasMercado() {
  return [...new Set(productosMercado.map(p => p.subcategoria).filter(Boolean))].sort();
}

function _renderPanelMercado(inputId, panelId, opciones) {
  const input = document.getElementById(inputId);
  const panel = document.getElementById(panelId);
  if (!input || !panel) return;
  panel.innerHTML = opciones.length > 0
    ? opciones.map(o => `<button type="button" class="caja-picker-option" data-value="${escapeAttr(o)}">${escapeHtml(o)}</button>`).join("")
    : `<div class="caja-picker-empty">Sin coincidencias</div>`;
  panel.querySelectorAll(".caja-picker-option").forEach(btn => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.value;
      panel.classList.add("hidden");
    });
  });
}

function _abrirPanelMercado(inputId, panelId, opciones) {
  _renderPanelMercado(inputId, panelId, opciones);
  document.querySelectorAll(".caja-picker-panel").forEach(p => { if (p.id !== panelId) p.classList.add("hidden"); });
  document.getElementById(panelId)?.classList.remove("hidden");
}

// ---- MODAL NUEVO/EDITAR PRODUCTO (mismo modal para las dos cosas, ver
// dataset.editId -- mismo patrón que modal-movimiento) ----
function abrirNuevoProductoMercado() {
  document.getElementById("mercado-producto-titulo").textContent = "Nuevo producto";
  document.getElementById("modal-mercado-producto").dataset.editId = "";
  limpiarFormMercado();
  document.getElementById("btn-guardar-mercado-producto").textContent = "Agregar";
  document.getElementById("modal-mercado-producto").classList.remove("hidden");
}

function abrirEditarProductoMercado(id) {
  const p = productosMercado.find(x => x.id === id);
  if (!p) return;
  document.getElementById("mercado-producto-titulo").textContent = "Editar producto";
  document.getElementById("modal-mercado-producto").dataset.editId = id;
  document.getElementById("mercado-nombre").value = p.nombre;
  document.getElementById("mercado-categoria").value = p.categoria;
  document.getElementById("mercado-subcategoria").value = p.subcategoria;
  document.getElementById("btn-guardar-mercado-producto").textContent = "Guardar";
  document.getElementById("modal-mercado-producto").classList.remove("hidden");
}

async function guardarProductoMercado() {
  const nombre       = document.getElementById("mercado-nombre").value.trim();
  const categoria    = document.getElementById("mercado-categoria").value.trim();
  const subcategoria = document.getElementById("mercado-subcategoria").value.trim();
  const editId       = document.getElementById("modal-mercado-producto").dataset.editId;

  if (!nombre)    { alert("Escribe el nombre del producto"); return; }
  if (!categoria) { alert("Escribe una categoría"); return; }

  const btn = document.getElementById("btn-guardar-mercado-producto");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    if (editId) {
      await Sheets.editarProductoMercado(editId, { nombre, categoria, subcategoria });
    } else {
      await Sheets.agregarProductoMercado(currentUser?.email || "", nombre, categoria, subcategoria);
    }
    document.getElementById("modal-mercado-producto").classList.add("hidden");
    limpiarFormMercado();
    await cargarMercado();
    SyncManager.mostrarToast(`✅ "${nombre}" ${editId ? "actualizado" : "agregado"}`);
  } catch (err) {
    alert("Error guardando el producto: " + err.message);
  } finally {
    btn.textContent = editId ? "Guardar" : "Agregar"; btn.disabled = false;
  }
}

async function borrarProductoMercado(id) {
  const p = productosMercado.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar "${p.nombre}" del catálogo?`)) return;
  try {
    await Sheets.borrarProductoMercado(id);
    productosMercado = productosMercado.filter(x => x.id !== id);
    localStorage.setItem("cache_mercado", JSON.stringify(productosMercado));
    renderMercado();
  } catch (err) {
    alert("Error borrando el producto: " + err.message);
  }
}

function limpiarFormMercado() {
  document.getElementById("mercado-nombre").value = "";
  document.getElementById("mercado-categoria").value = "";
  document.getElementById("mercado-subcategoria").value = "";
}

// ---- SETUP LISTENERS ----
function setupMercadoListeners() {
  document.getElementById("btn-nuevo-producto-mercado")
    ?.addEventListener("click", abrirNuevoProductoMercado);

  document.querySelector('.btn-desplegar-concepto[data-target="mercado-categoria"]')
    ?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      _abrirPanelMercado("mercado-categoria", "panel-mercado-categoria", _listaCategoriasMercado());
    });

  document.querySelector('.btn-desplegar-concepto[data-target="mercado-subcategoria"]')
    ?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      _abrirPanelMercado("mercado-subcategoria", "panel-mercado-subcategoria", _listaSubcategoriasMercado());
    });

  document.getElementById("btn-cancelar-mercado-producto")
    ?.addEventListener("click", () => {
      document.getElementById("modal-mercado-producto").classList.add("hidden");
      limpiarFormMercado();
    });

  document.getElementById("btn-guardar-mercado-producto")
    ?.addEventListener("click", guardarProductoMercado);

  // Cerrar tocando el fondo ya lo cubre el listener genérico de app.js
  // (ver cerrarModal).
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupMercadoListeners);
} else {
  setTimeout(setupMercadoListeners, 0);
}

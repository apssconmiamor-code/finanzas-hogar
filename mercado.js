// =============================================
// MÓDULO MERCADO — catálogo de productos, agrupados en categorías
// =============================================
// Hoja "Mercado" en Google Sheets:
// A: id | B: nombre | C: categoria | D: subcategoria (legado, ya no se usa
//    ni se muestra -- se deja la columna para no romper filas viejas) |
// E: hay_que_comprar | F: autor
//
// Hoja "MercadoCategorias":
// A: id | B: nombre | C: icono | D: autor
//
// Pantalla principal = cuadrícula de categorías (2 columnas, tarjetas),
// mismo patrón que los bloques de Alertas -- tocar una entra a su detalle
// (la lista de productos de esa categoría), mantener presionada la
// tarjeta ofrece Editar/Eliminar la categoría misma. "Sin categoría" es
// una tarjeta más (si hay productos sueltos), no editable ni borrable.
//
// A diferencia del resto de la app (doble toque = ver un resumen de solo
// lectura, mantener presionado = único camino a Editar/Eliminar -- ver
// gestos.js), el doble toque sobre un PRODUCTO hace la acción central del
// módulo: marcar/desmarcar en gris = "hay que comprarlo en la próxima
// compra de mercado" (pedido explícito). Mantener presionado un producto
// sigue siendo el único camino a Editar/Eliminar el producto, igual que
// siempre.

// ---- EXTENSIÓN DE Sheets PARA MERCADO (productos) ----

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
    hayQueComprar: r[4] === true || r[4] === "true" || r[4] === "TRUE",
    autor:         r[5] || ""
  }));
};

Sheets.agregarProductoMercado = async function (autor, nombre, categoria) {
  await this._asegurarHojaMercado();
  const id = "MK" + Date.now();
  await this.agregar(CONFIG.SHEETS.MERCADO, [id, nombre, categoria, "", "false", autor]);
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
    actual[3] || "", // subcategoria legado: nunca se vuelve a escribir
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

// ---- EXTENSIÓN DE Sheets PARA MERCADO (categorías) ----
// Hoja aparte (no ConfigUsuario, que es por usuario/dispositivo): las
// categorías de Mercado las ve y las usa toda la familia, igual que los
// productos mismos -- ver getMercadoProductos, sin filtro de autor.

Sheets._mercadoCategoriasHojaLista = false;

Sheets._asegurarHojaMercadoCategorias = async function () {
  if (this._mercadoCategoriasHojaLista) return;
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const existe = meta.sheets.some(s => s.properties.title === CONFIG.SHEETS.MERCADO_CATEGORIAS);

  if (!existe) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CONFIG.SHEETS.MERCADO_CATEGORIAS } } }] })
      }
    );
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.MERCADO_CATEGORIAS + "!A1")}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["id", "nombre", "icono", "autor"]] })
      }
    );
  }
  this._mercadoCategoriasHojaLista = true;
};

Sheets.getMercadoCategorias = async function () {
  await this._asegurarHojaMercadoCategorias();
  const rows = await this.leer(`${CONFIG.SHEETS.MERCADO_CATEGORIAS}!A2:D`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:     r[0] || "",
    nombre: r[1] || "",
    icono:  r[2] || "🗂️",
    autor:  r[3] || ""
  }));
};

Sheets.agregarMercadoCategoria = async function (autor, nombre, icono) {
  await this._asegurarHojaMercadoCategorias();
  const id = "MKC" + Date.now();
  await this.agregar(CONFIG.SHEETS.MERCADO_CATEGORIAS, [id, nombre, icono, autor]);
  return id;
};

Sheets._escribirFilaMercadoCategoria = async function (id, campos) {
  const rows = await this.leer(`${CONFIG.SHEETS.MERCADO_CATEGORIAS}!A2:D`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Categoría no encontrada");
  const sheetRow = rowIndex + 2;
  const actual = rows[rowIndex];
  const nueva = [id, campos.nombre ?? actual[1], campos.icono ?? actual[2], actual[3] || ""];
  const range = `${CONFIG.SHEETS.MERCADO_CATEGORIAS}!A${sheetRow}:D${sheetRow}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [nueva] })
    }
  );
  if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!res.ok) throw new Error(`Error editando categoría: ${res.status}`);
  return res.json();
};

Sheets.editarMercadoCategoria = function (id, campos) {
  return this._escribirFilaMercadoCategoria(id, campos);
};

Sheets.borrarMercadoCategoria = async function (id) {
  const rows = await this.leer(`${CONFIG.SHEETS.MERCADO_CATEGORIAS}!A2:A`);
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error("Categoría no encontrada");
  const sheetRowIndex = rowIndex + 1;

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${this.token}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find(s => s.properties.title === CONFIG.SHEETS.MERCADO_CATEGORIAS);
  if (!sheet) throw new Error("Hoja de categorías de mercado no encontrada");
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
  if (!res.ok) throw new Error(`Error borrando categoría: ${res.status}`);
  return res.json();
};

// =============================================
// LÓGICA DE UI
// =============================================

window.productosMercado = window.productosMercado || [];
window.mercadoCategorias = window.mercadoCategorias || [];

// null = cuadrícula de categorías; "" = detalle de "Sin categoría";
// cualquier otro string = nombre de la categoría abierta.
let categoriaMercadoAbierta = null;

// ---- ORDEN DE LAS CATEGORÍAS (arrastrar para reordenar, pedido explícito)
// ----
// Las categorías en sí (Sheets "MercadoCategorias") son compartidas por
// toda la familia, pero el orden en que cada quien las quiere ver es
// personal -- se guarda por usuario en ConfigUsuario, mismo patrón que
// acciones_rapidas/alertas_bloques (ver recordatorios.js/notificaciones.js).
// Guarda IDs (no nombres) para no desordenarse si alguien renombra una
// categoría.
let ordenMercadoCategorias = [];

function _ordenMercadoCategoriasCacheKey() {
  return `cache_orden_mercado_categorias_${currentUser?.email || "anon"}`;
}

async function cargarOrdenMercadoCategorias() {
  try {
    const valor = await Sheets.getConfigUsuario(currentUser.email, "orden_mercado_categorias");
    ordenMercadoCategorias = Array.isArray(valor) ? valor : [];
    localStorage.setItem(_ordenMercadoCategoriasCacheKey(), JSON.stringify(ordenMercadoCategorias));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem(_ordenMercadoCategoriasCacheKey());
    if (cache) { try { ordenMercadoCategorias = JSON.parse(cache); } catch { ordenMercadoCategorias = []; } }
  }
}

// Categorías nuevas (todavía sin entrar en ordenMercadoCategorias) quedan al
// final, en el orden en que ya venían de Sheets -- así una categoría recién
// creada no se cuela al principio.
function _aplicarOrdenMercadoCategorias() {
  if (ordenMercadoCategorias.length === 0) return;
  const indice = new Map(ordenMercadoCategorias.map((id, i) => [id, i]));
  mercadoCategorias.sort((a, b) => {
    const ia = indice.has(a.id) ? indice.get(a.id) : Infinity;
    const ib = indice.has(b.id) ? indice.get(b.id) : Infinity;
    return ia - ib;
  });
}

// Se llama al soltar tras arrastrar una categoría a un lugar nuevo. No
// espera a que Sheets confirme para re-renderizar -- el orden ya vive en
// memoria+localStorage de una.
function _guardarOrdenMercadoCategorias(nuevoOrdenIds) {
  ordenMercadoCategorias = nuevoOrdenIds;
  localStorage.setItem(_ordenMercadoCategoriasCacheKey(), JSON.stringify(nuevoOrdenIds));
  Sheets.guardarConfigUsuario(currentUser.email, "orden_mercado_categorias", nuevoOrdenIds);
}

function _reordenarCategoriasMercadoDesdeGrid(grid) {
  const nuevoOrdenIds = Array.from(grid.querySelectorAll('.alerta-bloque-card[data-categoria]:not([data-categoria=""])'))
    .map(btn => mercadoCategorias.find(c => c.nombre === btn.dataset.categoria)?.id)
    .filter(Boolean);
  _guardarOrdenMercadoCategorias(nuevoOrdenIds);
  // El arrastre ya reordenó el DOM en pantalla, pero mercadoCategorias (la
  // fuente de la que se reconstruye la cuadrícula) todavía no -- sin esto,
  // el render de abajo la regresa a como estaba antes del arrastre.
  _aplicarOrdenMercadoCategorias();
  renderMercado();
}

// ---- CARGA ----
async function cargarMercado() {
  try {
    const [productos, categorias] = await Promise.all([
      Sheets.getMercadoProductos(),
      Sheets.getMercadoCategorias(),
      cargarOrdenMercadoCategorias()
    ]);
    productosMercado = productos;
    mercadoCategorias = categorias;
    _aplicarOrdenMercadoCategorias();
    localStorage.setItem("cache_mercado", JSON.stringify(productosMercado));
    localStorage.setItem("cache_mercado_categorias", JSON.stringify(mercadoCategorias));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cacheProductos = localStorage.getItem("cache_mercado");
    if (cacheProductos) { try { productosMercado = JSON.parse(cacheProductos); } catch {} }
    const cacheCategorias = localStorage.getItem("cache_mercado_categorias");
    if (cacheCategorias) { try { mercadoCategorias = JSON.parse(cacheCategorias); } catch {} }
    _aplicarOrdenMercadoCategorias();
  }
  renderMercado();
}

// ---- RENDER: despacha entre la cuadrícula y el detalle de una categoría ----
function renderMercado() {
  const cont = document.getElementById("mercado-list");
  if (!cont) return;

  // Si la categoría abierta se borró mientras tanto, vuelve sola a la cuadrícula.
  if (categoriaMercadoAbierta && !mercadoCategorias.some(c => c.nombre === categoriaMercadoAbierta)) {
    categoriaMercadoAbierta = null;
  }

  if (categoriaMercadoAbierta !== null) {
    renderMercadoCategoriaDetalle(cont, categoriaMercadoAbierta);
  } else {
    renderMercadoGrid(cont);
  }
}

// No hay una acción propia si se toca justo después de mantener
// presionado la misma tarjeta (ver _vieneDePresionLarga en gestos.js) --
// mismo criterio que evita que el resumen se abra encima de Editar/
// Eliminar en el resto de la app, aplicado acá a la navegación.
function tapCategoriaMercado(nombre, event) {
  if (typeof _vieneDePresionLarga === "function" && _vieneDePresionLarga([event])) return;
  categoriaMercadoAbierta = nombre;
  renderMercado();
}

// ---- Cuadrícula de categorías (2 columnas, mismo componente que los
// bloques de Alertas -- ver renderBloquesAlertaGrid en notificaciones.js) ----
function renderMercadoGrid(cont) {
  const cantidadPorCategoria = {};
  let sinCategoria = [];
  productosMercado.forEach(p => {
    if (!p.categoria) { sinCategoria.push(p); return; }
    if (p.hayQueComprar) cantidadPorCategoria[p.categoria] = (cantidadPorCategoria[p.categoria] || 0) + 1;
  });
  const cantidadSinCategoria = sinCategoria.filter(p => p.hayQueComprar).length;

  const tarjetasCategorias = mercadoCategorias.map(c => `
    <button type="button" class="alerta-bloque-card" data-categoria="${escapeAttr(c.nombre)}">
      ${cantidadPorCategoria[c.nombre] ? `<span class="alerta-bloque-cantidad">${cantidadPorCategoria[c.nombre]}</span>` : ""}
      <span class="alerta-bloque-icono">${escapeHtml(c.icono)}</span>
      <span class="alerta-bloque-nombre">${escapeHtml(c.nombre)}</span>
    </button>`).join("");

  const tarjetaSinCategoria = sinCategoria.length > 0 ? `
    <button type="button" class="alerta-bloque-card" data-categoria="" onpointerup="tapCategoriaMercado('', event)">
      ${cantidadSinCategoria ? `<span class="alerta-bloque-cantidad">${cantidadSinCategoria}</span>` : ""}
      <span class="alerta-bloque-icono">🔖</span>
      <span class="alerta-bloque-nombre">Sin categoría</span>
    </button>` : "";

  const totalParaComprar = productosMercado.filter(p => p.hayQueComprar).length;

  cont.innerHTML = `
    <div class="alertas-bloques-grid">
      ${tarjetasCategorias}
      ${tarjetaSinCategoria}
      <button type="button" class="alerta-bloque-card alerta-bloque-agregar" id="btn-nueva-categoria-mercado">
        <span class="alerta-bloque-icono">➕</span>
        <span class="alerta-bloque-nombre">Agregar categoría</span>
      </button>
    </div>
    ${totalParaComprar > 0 ? `
      <button type="button" class="btn-primary btn-franja mercado-btn-whatsapp" id="btn-whatsapp-mercado">
        💬 Enviar lista por WhatsApp (${totalParaComprar})
      </button>` : ""}`;

  document.getElementById("btn-nueva-categoria-mercado")?.addEventListener("click", abrirNuevaCategoriaMercado);
  document.getElementById("btn-whatsapp-mercado")?.addEventListener("click", enviarListaMercadoPorWhatsapp);

  // Mantener presionada una tarjeta de categoría ofrece Editar/Eliminar, y
  // arrastrarla desde ahí la reordena (ver crearManejadorArrastrable en
  // gestos.js) -- "Sin categoría" no es una categoría real (no se puede
  // editar/borrar/reordenar), así que se salta y sigue con su onpointerup
  // inline de siempre (tapCategoriaMercado, ver el template más arriba).
  const grid = cont.querySelector(".alertas-bloques-grid");
  cont.querySelectorAll(".alerta-bloque-card[data-categoria]").forEach(btn => {
    const nombre = btn.dataset.categoria;
    if (!nombre) return;
    const cat = mercadoCategorias.find(c => c.nombre === nombre);
    if (!cat) return;
    crearManejadorArrastrable(btn, grid, '.alerta-bloque-card[data-categoria]:not([data-categoria=""])', {
      onCorto: () => { categoriaMercadoAbierta = nombre; renderMercado(); },
      onLargo: () => abrirMenuEditarBorrar({
        titulo: cat.nombre,
        onEditar: () => abrirEditarCategoriaMercado(cat.id),
        onBorrar: () => confirmarBorrarCategoriaMercado(cat)
      }),
      onReordenar: () => _reordenarCategoriasMercadoDesdeGrid(grid)
    });
  });
}

// ---- Compartir la lista de "hay que comprar" por WhatsApp ----
// Enlace público de "click to chat" (wa.me) -- no la API de Negocios de
// verdad (esa pide número verificado por Meta, credenciales y factura por
// mensaje; no tiene sentido para una lista casera). Este link abre
// WhatsApp con el mensaje ya escrito, listo para elegir a quién mandárselo
// y tocar enviar -- ni cuenta ni configuración de por medio.
function _generarTextoListaMercado() {
  const porComprar = productosMercado.filter(p => p.hayQueComprar);
  if (porComprar.length === 0) return null;

  const porCategoria = {};
  porComprar.forEach(p => {
    const cat = p.categoria || "Sin categoría";
    (porCategoria[cat] = porCategoria[cat] || []).push(p);
  });
  const categoriasOrdenadas = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b));

  let texto = "🛒 *Lista del mercado*\n";
  categoriasOrdenadas.forEach(cat => {
    const icono = cat === "Sin categoría" ? "🔖" : (mercadoCategorias.find(c => c.nombre === cat)?.icono || "🗂️");
    texto += `\n${icono} *${cat}*\n`;
    [...porCategoria[cat]].sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach(p => {
      texto += `• ${p.nombre}\n`;
    });
  });
  return texto;
}

// Número fijo (Colombia, +57) al que se manda la lista -- pedido explícito.
const MERCADO_WHATSAPP_NUMERO = "573122132279";

function enviarListaMercadoPorWhatsapp() {
  const texto = _generarTextoListaMercado();
  if (!texto) { alert("No hay productos marcados para comprar todavía."); return; }
  window.open(`https://wa.me/${MERCADO_WHATSAPP_NUMERO}?text=${encodeURIComponent(texto)}`, "_blank");
}

// ---- Detalle de una categoría (o "Sin categoría") ----
// Pantalla dividida en dos: arriba los productos normales, abajo los
// marcados "hay que comprarlo" (pedido explícito) -- doble toque los pasa
// de una sección a la otra, en cualquier sentido.
function _chipProductoMercado(p) {
  return `<div class="mercado-item${p.hayQueComprar ? " mercado-item-comprar" : ""}" data-id="${p.id}" onpointerup="tapProductoMercado('${p.id}', event)">${escapeHtml(p.nombre)}</div>`;
}

function renderMercadoCategoriaDetalle(cont, categoria) {
  const cat = categoria ? mercadoCategorias.find(c => c.nombre === categoria) : null;
  const titulo = categoria ? (cat ? cat.nombre : categoria) : "Sin categoría";
  const icono = categoria ? (cat ? cat.icono : "🗂️") : "🔖";
  const items = productosMercado
    .filter(p => (p.categoria || "") === categoria)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const pendientes   = items.filter(p => !p.hayQueComprar);
  const paraComprar  = items.filter(p => p.hayQueComprar);

  const seccionPendientes = items.length > 0
    ? `<div class="mercado-productos-grid">${pendientes.map(_chipProductoMercado).join("")}</div>`
    : `<div class="notif-bloque-vacio">No hay productos acá todavía.</div>`;

  const seccionParaComprar = paraComprar.length > 0
    ? `<div class="mercado-seccion-comprar">
        <div class="mercado-seccion-comprar-header">
          <span class="mercado-seccion-comprar-titulo">🛒 Para comprar (${paraComprar.length})</span>
          <button type="button" class="btn-secondary mercado-btn-compra-realizada" id="btn-compra-realizada-mercado">✅ Compra realizada</button>
        </div>
        <div class="mercado-productos-grid">${paraComprar.map(_chipProductoMercado).join("")}</div>
      </div>`
    : "";

  cont.innerHTML = `
    <div class="alerta-bloque-detalle-header">
      <button type="button" class="btn-volver" id="btn-volver-mercado-categoria" title="Volver" aria-label="Volver">‹</button>
      <span class="alerta-bloque-detalle-titulo">${icono} ${escapeHtml(titulo)} (${items.length})</span>
      <button type="button" class="btn-sutil" id="btn-nuevo-producto-mercado-categoria">+ Nuevo producto</button>
    </div>
    ${seccionPendientes}
    ${seccionParaComprar}`;

  document.getElementById("btn-volver-mercado-categoria")?.addEventListener("click", () => cerrarPantallaActual());

  document.getElementById("btn-nuevo-producto-mercado-categoria")
    ?.addEventListener("click", () => abrirNuevoProductoMercado(categoria));

  document.getElementById("btn-compra-realizada-mercado")
    ?.addEventListener("click", () => confirmarCompraRealizadaMercado(categoria));

  _conectarLargoPresionMercado(cont);
}

// "Compra realizada": marca de un toque TODOS los productos "para
// comprar" de esta categoría como ya no pendientes (vuelven arriba) --
// pedido explícito, con confirmación antes de aplicarlo porque no se
// puede deshacer de un toque como el marcado individual.
async function confirmarCompraRealizadaMercado(categoria) {
  const items = productosMercado.filter(p => (p.categoria || "") === categoria && p.hayQueComprar);
  if (items.length === 0) return;
  if (!confirm(`¿Confirmar que ya compraste los ${items.length} producto(s) marcados?\n\nVuelven a la lista de arriba, sin marcar.`)) return;

  items.forEach(p => { p.hayQueComprar = false; });
  renderMercado();

  try {
    for (const p of items) {
      await Sheets.editarProductoMercado(p.id, { hayQueComprar: false });
    }
    localStorage.setItem("cache_mercado", JSON.stringify(productosMercado));
  } catch (err) {
    // Si falló a mitad de camino, algunos ya pueden haber quedado
    // guardados en Sheets -- se recarga desde el servidor en vez de
    // revertir a ciegas, para no mostrar algo que ya no es cierto.
    alert("Algo no se guardó bien: " + err.message);
    await cargarMercado();
  }
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

// ---- Select de categoría del formulario de producto -- categorías ya
// creadas de antemano (ver modal-mercado-categoria), no texto libre --
// evita categorías duplicadas por una letra de diferencia. ----
function poblarSelectMercadoCategoria(seleccionActual) {
  const sel = document.getElementById("mercado-categoria");
  if (!sel) return;
  sel.innerHTML = `<option value="">🔖 Sin categoría</option>` +
    mercadoCategorias.map(c => `<option value="${escapeAttr(c.nombre)}">${escapeHtml(c.icono)} ${escapeHtml(c.nombre)}</option>`).join("");
  const valores = ["", ...mercadoCategorias.map(c => c.nombre)];
  sel.value = valores.includes(seleccionActual) ? seleccionActual : "";
}

// ---- MODAL NUEVO/EDITAR PRODUCTO (mismo modal para las dos cosas, ver
// dataset.editId -- mismo patrón que modal-movimiento). "categoriaInicial"
// pre-selecciona la categoría desde la que se abrió "+ Nuevo producto",
// pero se puede cambiar antes de guardar. ----
function abrirNuevoProductoMercado(categoriaInicial) {
  document.getElementById("mercado-producto-titulo").textContent = "Nuevo producto";
  document.getElementById("modal-mercado-producto").dataset.editId = "";
  limpiarFormMercado();
  poblarSelectMercadoCategoria(categoriaInicial || "");
  document.getElementById("btn-guardar-mercado-producto").textContent = "Agregar";
  document.getElementById("modal-mercado-producto").classList.remove("hidden");
}

function abrirEditarProductoMercado(id) {
  const p = productosMercado.find(x => x.id === id);
  if (!p) return;
  document.getElementById("mercado-producto-titulo").textContent = "Editar producto";
  document.getElementById("modal-mercado-producto").dataset.editId = id;
  document.getElementById("mercado-nombre").value = p.nombre;
  poblarSelectMercadoCategoria(p.categoria);
  document.getElementById("btn-guardar-mercado-producto").textContent = "Guardar";
  document.getElementById("modal-mercado-producto").classList.remove("hidden");
}

async function guardarProductoMercado() {
  const nombre    = document.getElementById("mercado-nombre").value.trim();
  const categoria = document.getElementById("mercado-categoria").value;
  const editId    = document.getElementById("modal-mercado-producto").dataset.editId;

  if (!nombre) { alert("Escribe el nombre del producto"); return; }

  const btn = document.getElementById("btn-guardar-mercado-producto");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    if (editId) {
      await Sheets.editarProductoMercado(editId, { nombre, categoria });
    } else {
      await Sheets.agregarProductoMercado(currentUser?.email || "", nombre, categoria);
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
}

// ---- MODAL NUEVA/EDITAR CATEGORÍA ----
function abrirNuevaCategoriaMercado() {
  document.getElementById("mercado-categoria-titulo").textContent = "Nueva categoría";
  document.getElementById("modal-mercado-categoria").dataset.editId = "";
  document.getElementById("mercado-categoria-nombre").value = "";
  document.getElementById("mercado-categoria-icono").value = "";
  document.getElementById("btn-guardar-mercado-categoria").textContent = "Guardar";
  document.getElementById("modal-mercado-categoria").classList.remove("hidden");
}

function abrirEditarCategoriaMercado(id) {
  const c = mercadoCategorias.find(x => x.id === id);
  if (!c) return;
  document.getElementById("mercado-categoria-titulo").textContent = "Editar categoría";
  document.getElementById("modal-mercado-categoria").dataset.editId = id;
  document.getElementById("mercado-categoria-nombre").value = c.nombre;
  document.getElementById("mercado-categoria-icono").value = c.icono;
  document.getElementById("btn-guardar-mercado-categoria").textContent = "Guardar";
  document.getElementById("modal-mercado-categoria").classList.remove("hidden");
}

async function guardarCategoriaMercado() {
  const nombre = document.getElementById("mercado-categoria-nombre").value.trim();
  const icono  = document.getElementById("mercado-categoria-icono").value.trim() || "🗂️";
  const editId = document.getElementById("modal-mercado-categoria").dataset.editId;

  if (!nombre) { alert("Escribe el nombre de la categoría"); return; }
  const yaExiste = mercadoCategorias.some(c => c.nombre === nombre && c.id !== editId);
  if (yaExiste) { alert("Ya existe una categoría con ese nombre"); return; }

  const btn = document.getElementById("btn-guardar-mercado-categoria");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    if (editId) {
      const actual = mercadoCategorias.find(c => c.id === editId);
      // La categoría de un producto se guarda por NOMBRE, no por id (mismo
      // criterio que "categoria" en Notificaciones/Compras) -- si el
      // nombre cambia, hay que migrar los productos que ya apuntaban al
      // nombre viejo para que no queden huérfanos en "Sin categoría".
      if (actual && actual.nombre !== nombre) {
        const afectados = productosMercado.filter(p => p.categoria === actual.nombre);
        for (const p of afectados) await Sheets.editarProductoMercado(p.id, { categoria: nombre });
      }
      await Sheets.editarMercadoCategoria(editId, { nombre, icono });
      if (categoriaMercadoAbierta === actual?.nombre) categoriaMercadoAbierta = nombre;
    } else {
      await Sheets.agregarMercadoCategoria(currentUser?.email || "", nombre, icono);
    }
    document.getElementById("modal-mercado-categoria").classList.add("hidden");
    await cargarMercado();
    SyncManager.mostrarToast(`✅ Categoría "${nombre}" ${editId ? "actualizada" : "creada"}`);
  } catch (err) {
    alert("Error guardando la categoría: " + err.message);
  } finally {
    btn.textContent = "Guardar"; btn.disabled = false;
  }
}

async function confirmarBorrarCategoriaMercado(cat) {
  if (!confirm(`¿Eliminar la categoría "${cat.nombre}"?\n\nLos productos que tenía pasan a "Sin categoría" -- no se borran.`)) return;
  try {
    const afectados = productosMercado.filter(p => p.categoria === cat.nombre);
    for (const p of afectados) await Sheets.editarProductoMercado(p.id, { categoria: "" });
    await Sheets.borrarMercadoCategoria(cat.id);
  } catch (err) {
    alert("Error borrando la categoría: " + err.message);
    return;
  }
  if (categoriaMercadoAbierta === cat.nombre) categoriaMercadoAbierta = null;
  await cargarMercado();
}

// ---- SETUP LISTENERS ----
function setupMercadoListeners() {
  document.getElementById("btn-cancelar-mercado-producto")
    ?.addEventListener("click", () => {
      document.getElementById("modal-mercado-producto").classList.add("hidden");
      limpiarFormMercado();
    });

  document.getElementById("btn-guardar-mercado-producto")
    ?.addEventListener("click", guardarProductoMercado);

  document.getElementById("btn-cancelar-mercado-categoria")
    ?.addEventListener("click", () => {
      document.getElementById("modal-mercado-categoria").classList.add("hidden");
    });

  document.getElementById("btn-guardar-mercado-categoria")
    ?.addEventListener("click", guardarCategoriaMercado);

  // Cerrar tocando el fondo ya lo cubre el listener genérico de app.js
  // (ver cerrarModal).
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupMercadoListeners);
} else {
  setTimeout(setupMercadoListeners, 0);
}

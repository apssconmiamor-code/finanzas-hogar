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

// ---- RENDER ----
// La pantalla de Mercado (cuadrícula de categorías + detalle de una categoría) es React
// (react/src/mercado/PantallaMercado.jsx); acá se arma lo que muestra y las acciones de siempre.
function renderMercado() {
  if (!window.PantallaMercadoReact) return;

  // Si la categoría abierta se borró mientras tanto, vuelve sola a la cuadrícula.
  if (categoriaMercadoAbierta && !mercadoCategorias.some(c => c.nombre === categoriaMercadoAbierta)) {
    categoriaMercadoAbierta = null;
  }

  const cantidadPorCategoria = {};
  const sinCategoria = [];
  productosMercado.forEach(p => {
    if (!p.categoria) { sinCategoria.push(p); return; }
    if (p.hayQueComprar) cantidadPorCategoria[p.categoria] = (cantidadPorCategoria[p.categoria] || 0) + 1;
  });

  let detalle = null;
  if (categoriaMercadoAbierta !== null) {
    const categoria = categoriaMercadoAbierta;
    const cat = categoria ? mercadoCategorias.find(c => c.nombre === categoria) : null;
    const items = productosMercado
      .filter(p => (p.categoria || "") === categoria)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    // Pantalla dividida en dos: arriba los productos normales, abajo los marcados "hay que comprarlo"
    // (pedido explícito) -- el doble toque los pasa de una sección a la otra, en cualquier sentido.
    detalle = {
      titulo: categoria ? (cat ? cat.nombre : categoria) : "Sin categoría",
      icono: categoria ? (cat ? cat.icono : "🗂️") : "🔖",
      total: items.length,
      pendientes: items.filter(p => !p.hayQueComprar).map(p => ({ id: p.id, nombre: p.nombre })),
      paraComprar: items.filter(p => p.hayQueComprar).map(p => ({ id: p.id, nombre: p.nombre })),
    };
  }

  window.PantallaMercadoReact.render({
    categoriaAbierta: categoriaMercadoAbierta,
    categorias: mercadoCategorias.map(c => ({ id: c.id, nombre: c.nombre, icono: c.icono, cantidad: cantidadPorCategoria[c.nombre] || 0 })),
    sinCategoria: { existe: sinCategoria.length > 0, cantidad: sinCategoria.filter(p => p.hayQueComprar).length },
    totalParaComprar: productosMercado.filter(p => p.hayQueComprar).length,
    detalle,
    onAbrirCategoria: nombre => { categoriaMercadoAbierta = nombre; renderMercado(); },
    onVolver: () => cerrarPantallaActual(),
    onNuevaCategoria: abrirNuevaCategoriaMercado,
    onWhatsapp: enviarListaMercadoPorWhatsapp,
    onEditarCategoria: cat => abrirEditarCategoriaMercado(cat.id),
    onBorrarCategoria: cat => confirmarBorrarCategoriaMercado(cat),
    onReordenar: grid => _reordenarCategoriasMercadoDesdeGrid(grid),
    onNuevoProducto: categoria => abrirNuevoProductoMercado(categoria),
    onCompraRealizada: categoria => confirmarCompraRealizadaMercado(categoria),
    onAlternarProducto: id => alternarHayQueComprarMercado(id),
    onEditarProducto: id => abrirEditarProductoMercado(id),
    onBorrarProducto: id => borrarProductoMercado(id),
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

  let texto = "*Lista del mercado*\n";
  categoriasOrdenadas.forEach(cat => {
    texto += `\n*${cat}*\n`;
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
// resumen de solo lectura). Lo conecta PantallaMercado.jsx.
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


// ---- NUEVO/EDITAR PRODUCTO: la ventana es React (react/src/mercado/Mercado.jsx). "categoriaInicial"
// pre-selecciona la categoría desde la que se abrió "+ Nuevo producto", pero se puede cambiar. ----
function abrirNuevoProductoMercado(categoriaInicial) {
  document.dispatchEvent(new CustomEvent("mercado:abrir", { detail: { t: "producto", categoria: categoriaInicial || "" } }));
}

function abrirEditarProductoMercado(id) {
  if (!productosMercado.find(x => x.id === id)) return;
  document.dispatchEvent(new CustomEvent("mercado:abrir", { detail: { t: "producto", editId: id } }));
}

// Guarda un producto nuevo o editado; si algo falla, lanza (la ventana avisa y se queda abierta).
async function guardarProductoMercadoDatos({ nombre, categoria }, editId) {
  if (editId) {
    await Sheets.editarProductoMercado(editId, { nombre, categoria });
  } else {
    await Sheets.agregarProductoMercado(currentUser?.email || "", nombre, categoria);
  }
  await cargarMercado();
  SyncManager.mostrarToast(`✅ "${nombre}" ${editId ? "actualizado" : "agregado"}`);
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

// ---- NUEVA/EDITAR CATEGORÍA (ventana React, ver Mercado.jsx) ----
function abrirNuevaCategoriaMercado() {
  document.dispatchEvent(new CustomEvent("mercado:abrir", { detail: { t: "categoria" } }));
}

function abrirEditarCategoriaMercado(id) {
  if (!mercadoCategorias.find(x => x.id === id)) return;
  document.dispatchEvent(new CustomEvent("mercado:abrir", { detail: { t: "categoria", editId: id } }));
}

async function guardarCategoriaMercadoDatos({ nombre, icono }, editId) {
  icono = icono || "🗂️";
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
  await cargarMercado();
  SyncManager.mostrarToast(`✅ Categoría "${nombre}" ${editId ? "actualizada" : "creada"}`);
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

// ---- SETUP ----
function renderMercadoReact() {
  if (!window.MercadoReact) return;
  window.MercadoReact.render({
    getCategorias: () => mercadoCategorias,
    getProducto: id => productosMercado.find(x => x.id === id) || null,
    getCategoria: id => mercadoCategorias.find(x => x.id === id) || null,
    onGuardarProducto: guardarProductoMercadoDatos,
    onGuardarCategoria: guardarCategoriaMercadoDatos,
  });
}

function setupMercadoListeners() {
  renderMercadoReact();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupMercadoListeners);
} else {
  setTimeout(setupMercadoListeners, 0);
}

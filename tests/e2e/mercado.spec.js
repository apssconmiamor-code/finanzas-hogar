// Mercado: catálogo de productos agrupados en categorías creadas por el
// usuario (sin subcategorías -- se sacaron, pedido explícito). La pantalla
// principal es una cuadrícula de categorías de 2 columnas, mismo
// componente que los bloques de Alertas (ver notificaciones.spec.js) --
// tocar una entra a su detalle (la lista de productos), mantener
// presionada la tarjeta ofrece Editar/Eliminar la categoría misma.
//
// A diferencia del resto de la app, el doble toque sobre un PRODUCTO no
// abre un resumen de solo lectura -- alterna "hay que comprarlo" (se pone
// gris), pedido explícito del usuario. Mantener presionado un producto
// sigue siendo el único camino a Editar/Eliminar el producto.
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

async function abrirMercado(page) {
  await page.locator('#btn-menu, #btn-bottom-menu').first().click();
  await page.locator('[data-tab-nav="mercado"]').click();
  await expect(page.locator('#tab-mercado')).toBeVisible();
}

async function crearCategoria(page, nombre, icono) {
  await page.locator('#btn-nueva-categoria-mercado').click();
  await expect(page.locator('#modal-mercado-categoria')).toBeVisible();
  await page.locator('#mercado-categoria-nombre').fill(nombre);
  if (icono) await page.locator('#mercado-categoria-icono').fill(icono);
  await page.locator('#btn-guardar-mercado-categoria').click();
  await expect(page.locator('#modal-mercado-categoria')).toBeHidden();
}

async function abrirCategoria(page, nombre) {
  await page.locator('#mercado-list .alerta-bloque-card', { hasText: nombre }).click();
  await expect(page.locator('#mercado-list .alerta-bloque-detalle-titulo', { hasText: nombre })).toBeVisible();
}

async function agregarProducto(page, nombre, categoria) {
  await page.locator('#btn-nuevo-producto-mercado-categoria').click();
  await expect(page.locator('#modal-mercado-producto')).toBeVisible();
  await page.locator('#mercado-nombre').fill(nombre);
  if (categoria !== undefined) await page.locator('#mercado-categoria').selectOption(categoria);
  await page.locator('#btn-guardar-mercado-producto').click();
  await expect(page.locator('#modal-mercado-producto')).toBeHidden();
}

// Mismo gesto que el resto de la app para volver de una pantalla de
// detalle sin botón (ver deslizarParaVolver en notificaciones.spec.js).
async function deslizarParaVolver(page) {
  await page.evaluate(() => {
    const crearToque = (x, y) => new Touch({ identifier: Date.now(), target: document.body, clientX: x, clientY: y });
    const inicio = crearToque(10, 300);
    document.dispatchEvent(new TouchEvent('touchstart', { touches: [inicio], changedTouches: [inicio], bubbles: true, cancelable: true }));
    const fin = crearToque(160, 300);
    document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [fin], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(250);
}

test.describe('Mercado', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirMercado(page);
  });

  test('sin categorías todavía, la cuadrícula solo ofrece "Agregar categoría"', async ({ page }) => {
    await expect(page.locator('#mercado-list .alerta-bloque-card')).toHaveCount(1);
    await expect(page.locator('#btn-nueva-categoria-mercado')).toBeVisible();
  });

  test('crear una categoría la agrega a la cuadrícula; tocarla entra a su detalle vacío', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');

    const tarjeta = page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Alimentos' });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.locator('.alerta-bloque-icono')).toHaveText('🥦');

    await abrirCategoria(page, 'Alimentos');
    await expect(page.locator('#btn-nuevo-producto-mercado-categoria')).toBeVisible();
    await expect(page.locator('#mercado-list')).toContainText('No hay productos acá todavía');
  });

  test('crear un producto dentro de una categoría lo agrega ahí', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Leche');

    await expect(page.locator('.mercado-item', { hasText: 'Leche' })).toBeVisible();

    // Persiste de verdad -- recargar y seguir viéndolo en su categoría.
    await page.reload();
    await esperarAppLista(page);
    await abrirMercado(page);
    await abrirCategoria(page, 'Alimentos');
    await expect(page.locator('.mercado-item', { hasText: 'Leche' })).toBeVisible();
  });

  test('un producto sin categoría cae en "Sin categoría", que solo aparece si hay alguno', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');

    // "Sin categoría" todavía no existe como tarjeta -- no hay productos ahí.
    await deslizarParaVolver(page);
    await expect(page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Sin categoría' })).toHaveCount(0);

    // Se crea un producto y se cambia su categoría a "Sin categoría" antes de guardar.
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Cosa suelta', '');
    await deslizarParaVolver(page);

    const tarjetaSinCategoria = page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Sin categoría' });
    await expect(tarjetaSinCategoria).toBeVisible();
    await tarjetaSinCategoria.click();
    await expect(page.locator('.mercado-item', { hasText: 'Cosa suelta' })).toBeVisible();
  });

  test('un solo toque no hace nada -- el doble toque alterna "hay que comprarlo" y pone en gris', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Leche');
    const item = page.locator('.mercado-item', { hasText: 'Leche' });

    await item.click();
    await expect(item).not.toHaveClass(/mercado-item-comprar/);

    await page.waitForTimeout(500);
    await item.dblclick();
    await expect(item).toHaveClass(/mercado-item-comprar/);

    // Se refleja como cantidad en la tarjeta de la categoría, en la cuadrícula.
    await deslizarParaVolver(page);
    await expect(page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Alimentos' }).locator('.alerta-bloque-cantidad')).toHaveText('1');
  });

  test('marcar "hay que comprarlo" mueve el producto a la sección de abajo, y un segundo doble toque lo vuelve a subir', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Leche');
    await agregarProducto(page, 'Pan');

    // Todavía no hay sección "Para comprar" -- nada está marcado.
    await expect(page.locator('.mercado-seccion-comprar')).toHaveCount(0);

    const leche = page.locator('.mercado-item', { hasText: 'Leche' });
    await leche.dblclick();
    await expect(page.locator('.mercado-seccion-comprar')).toBeVisible();
    await expect(page.locator('.mercado-seccion-comprar-titulo')).toContainText('Para comprar (1)');
    // "Leche" ahora vive DENTRO de la sección de abajo, "Pan" sigue arriba.
    await expect(page.locator('.mercado-seccion-comprar .mercado-item', { hasText: 'Leche' })).toBeVisible();
    await expect(page.locator('.mercado-seccion-comprar .mercado-item', { hasText: 'Pan' })).toHaveCount(0);

    // Segundo doble toque (pasada la ventana del primero): vuelve arriba,
    // la sección de abajo desaparece del todo (no queda vacía y visible).
    await page.waitForTimeout(500);
    await page.locator('.mercado-seccion-comprar .mercado-item', { hasText: 'Leche' }).dblclick();
    await expect(page.locator('.mercado-seccion-comprar')).toHaveCount(0);
    await expect(page.locator('.mercado-item', { hasText: 'Leche' })).not.toHaveClass(/mercado-item-comprar/);
  });

  test('"+ Nuevo producto" vive arriba, justo después del título de la categoría', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Leche');
    await page.locator('.mercado-item', { hasText: 'Leche' }).dblclick();
    await page.waitForTimeout(300);

    const hijos = page.locator('#mercado-list > *');
    // Segundo elemento de la pantalla (justo después del header), antes de
    // las secciones de productos.
    await expect(hijos.nth(1)).toHaveId('btn-nuevo-producto-mercado-categoria');
  });

  test('"Compra realizada" pide confirmación y sube todo lo marcado de vuelta arriba', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Leche');
    await agregarProducto(page, 'Pan');
    await agregarProducto(page, 'Huevos');

    await page.locator('.mercado-item', { hasText: 'Leche' }).dblclick();
    await page.waitForTimeout(300);
    await page.locator('.mercado-item', { hasText: 'Pan' }).dblclick();
    await page.waitForTimeout(300);
    // "Huevos" queda sin marcar a propósito -- no debe verse afectado.

    await expect(page.locator('.mercado-seccion-comprar-titulo')).toContainText('Para comprar (2)');
    const btnCompraRealizada = page.locator('#btn-compra-realizada-mercado');
    await expect(btnCompraRealizada).toBeVisible();

    // Cancelar el diálogo no cambia nada.
    page.once('dialog', (d) => d.dismiss());
    await btnCompraRealizada.click();
    await expect(page.locator('.mercado-seccion-comprar-titulo')).toContainText('Para comprar (2)');

    // Confirmar lo sube todo -- la sección desaparece, "Huevos" sigue como estaba.
    let mensajeDialogo = null;
    page.once('dialog', (d) => { mensajeDialogo = d.message(); d.accept(); });
    await btnCompraRealizada.click();
    await expect.poll(() => mensajeDialogo).not.toBeNull();
    expect(mensajeDialogo).toContain('2');
    await expect(page.locator('.mercado-seccion-comprar')).toHaveCount(0);
    await expect(page.locator('.mercado-item', { hasText: 'Leche' })).not.toHaveClass(/mercado-item-comprar/);
    await expect(page.locator('.mercado-item', { hasText: 'Pan' })).not.toHaveClass(/mercado-item-comprar/);
    await expect(page.locator('.mercado-item', { hasText: 'Huevos' })).not.toHaveClass(/mercado-item-comprar/);

    // Persiste de verdad -- recargar y seguir viéndolo sin marcar.
    await page.reload();
    await esperarAppLista(page);
    await abrirMercado(page);
    await abrirCategoria(page, 'Alimentos');
    await expect(page.locator('.mercado-seccion-comprar')).toHaveCount(0);
  });

  test('el botón de WhatsApp solo aparece con algo marcado, y abre wa.me con el número y la lista agrupada por categoría', async ({ page }) => {
    // Sin nada marcado, el botón no está.
    await expect(page.locator('#btn-whatsapp-mercado')).toHaveCount(0);

    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Leche');
    await agregarProducto(page, 'Pan');
    await page.locator('.mercado-item', { hasText: 'Leche' }).dblclick();
    await page.waitForTimeout(300);

    // Sigue sin aparecer en la cuadrícula: "Pan" no está marcado, solo "Leche".
    await deslizarParaVolver(page);
    await expect(page.locator('#btn-whatsapp-mercado')).toContainText('(1)');

    // wa.me es un servicio real (redirige a api.whatsapp.com) -- se
    // responde localmente para no depender de red real ni de a dónde
    // termine redirigiendo (abort() tampoco sirve: la navegación falla y
    // popup.url() pasa a ser la página de error de Chrome, no el link
    // original). page.route() no alcanza -- el link abre una PESTAÑA
    // nueva, otro Page -- hace falta interceptar a nivel de contexto.
    await page.context().route('**://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: '' }));

    const [popup] = await Promise.all([
      page.context().waitForEvent('page'),
      page.locator('#btn-whatsapp-mercado').click()
    ]);
    const url = new URL(popup.url());
    expect(url.hostname).toBe('wa.me');
    expect(url.pathname).toBe('/573122132279');
    const texto = decodeURIComponent(url.search.replace('?text=', ''));
    expect(texto).toContain('Lista del mercado');
    expect(texto).toContain('Alimentos');
    expect(texto).toContain('Leche');
    expect(texto).not.toContain('Pan'); // no está marcado, no entra a la lista
    await popup.close();
  });

  test('mantener presionado un producto abre Editar/Eliminar', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Leche');
    const item = page.locator('.mercado-item', { hasText: 'Leche' });

    const box = await item.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await page.locator('#btn-editar-borrar-editar').click();
    await expect(page.locator('#modal-mercado-producto')).toBeVisible();
    await expect(page.locator('#mercado-producto-titulo')).toHaveText('Editar producto');
    await expect(page.locator('#mercado-nombre')).toHaveValue('Leche');
  });

  test('mantener presionada una tarjeta de categoría ofrece Editar/Eliminar', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    const tarjeta = page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Alimentos' });

    const box = await tarjeta.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await expect(page.locator('#btn-editar-borrar-editar')).toBeVisible();
    await expect(page.locator('#btn-editar-borrar-eliminar')).toBeVisible();
    // No navegó a la categoría solo por mantener presionado.
    await expect(page.locator('#mercado-list .alerta-bloque-detalle-titulo')).toHaveCount(0);
  });

  test('editar una categoría le cambia nombre/ícono y migra los productos que la usaban', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Leche');
    await deslizarParaVolver(page);

    const tarjeta = page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Alimentos' });
    const box = await tarjeta.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.locator('#btn-editar-borrar-editar').click();

    await expect(page.locator('#modal-mercado-categoria')).toBeVisible();
    await expect(page.locator('#mercado-categoria-titulo')).toHaveText('Editar categoría');
    await expect(page.locator('#mercado-categoria-nombre')).toHaveValue('Alimentos');
    await page.locator('#mercado-categoria-nombre').fill('Despensa');
    await page.locator('#mercado-categoria-icono').fill('🧺');
    await page.locator('#btn-guardar-mercado-categoria').click();
    await expect(page.locator('#modal-mercado-categoria')).toBeHidden();

    await expect(page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Despensa' })).toBeVisible();
    await expect(page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Alimentos' })).toHaveCount(0);

    await page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Despensa' }).click();
    await expect(page.locator('.mercado-item', { hasText: 'Leche' })).toBeVisible();
  });

  test('eliminar una categoría no borra sus productos -- pasan a "Sin categoría"', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await agregarProducto(page, 'Leche');
    await deslizarParaVolver(page);

    const tarjeta = page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Alimentos' });
    const box = await tarjeta.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    page.once('dialog', (d) => d.accept());
    await page.locator('#btn-editar-borrar-eliminar').click();
    await expect(page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Alimentos' })).toHaveCount(0);

    const tarjetaSinCategoria = page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Sin categoría' });
    await expect(tarjetaSinCategoria).toBeVisible();
    await tarjetaSinCategoria.click();
    await expect(page.locator('.mercado-item', { hasText: 'Leche' })).toBeVisible();
  });

  test('el gesto de deslizar desde el borde vuelve de una categoría a la cuadrícula', async ({ page }) => {
    await crearCategoria(page, 'Alimentos', '🥦');
    await abrirCategoria(page, 'Alimentos');
    await deslizarParaVolver(page);
    await expect(page.locator('#mercado-list .alerta-bloque-detalle-titulo')).toHaveCount(0);
    await expect(page.locator('#mercado-list .alerta-bloque-card', { hasText: 'Alimentos' })).toBeVisible();
  });
});

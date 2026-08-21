// Mercado: catálogo de productos de supermercado, agrupados por
// categoría/subcategoría (libres, las crea el usuario). A diferencia del
// resto de la app, el doble toque no abre un resumen de solo lectura --
// alterna "hay que comprarlo" (se pone gris), pedido explícito del
// usuario. Mantener presionado sigue siendo el único camino a
// Editar/Eliminar, igual que en los demás módulos.
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

async function abrirMercado(page) {
  await page.locator('#btn-menu, #btn-bottom-menu').first().click();
  await page.locator('[data-tab-nav="mercado"]').click();
  await expect(page.locator('#tab-mercado')).toBeVisible();
}

async function agregarProducto(page, nombre, categoria, subcategoria) {
  await page.locator('#btn-nuevo-producto-mercado').click();
  await expect(page.locator('#modal-mercado-producto')).toBeVisible();
  await page.locator('#mercado-nombre').fill(nombre);
  await page.locator('#mercado-categoria').fill(categoria);
  if (subcategoria) await page.locator('#mercado-subcategoria').fill(subcategoria);
  await page.locator('#btn-guardar-mercado-producto').click();
  await expect(page.locator('#modal-mercado-producto')).toBeHidden();
}

test.describe('Mercado', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirMercado(page);
  });

  test('sin productos todavía, muestra el estado vacío', async ({ page }) => {
    await expect(page.locator('#mercado-list .empty-state')).toBeVisible();
    await expect(page.locator('#mercado-list')).toContainText('No hay productos todavía');
  });

  test('crear un producto lo agrupa por categoría y subcategoría', async ({ page }) => {
    await agregarProducto(page, 'Leche', 'Alimentos', 'Lácteos');

    await expect(page.locator('.mercado-categoria-titulo', { hasText: 'Alimentos' })).toBeVisible();
    await expect(page.locator('.mercado-subcategoria-titulo', { hasText: 'Lácteos' })).toBeVisible();
    await expect(page.locator('.mercado-item', { hasText: 'Leche' })).toBeVisible();
  });

  test('un producto sin subcategoría cae en "Sin subcategoría", no desaparece', async ({ page }) => {
    await agregarProducto(page, 'Detergente', 'Aseo', '');

    await expect(page.locator('.mercado-categoria-titulo', { hasText: 'Aseo' })).toBeVisible();
    await expect(page.locator('.mercado-subcategoria-titulo', { hasText: 'Sin subcategoría' })).toBeVisible();
    await expect(page.locator('.mercado-item', { hasText: 'Detergente' })).toBeVisible();
  });

  test('categoría es obligatoria para guardar', async ({ page }) => {
    await page.locator('#btn-nuevo-producto-mercado').click();
    await page.locator('#mercado-nombre').fill('Pan');
    page.once('dialog', (d) => d.accept());
    await page.locator('#btn-guardar-mercado-producto').click();
    // Sin categoría, no se guarda -- el modal se queda abierto.
    await expect(page.locator('#modal-mercado-producto')).toBeVisible();
  });

  test('un solo toque no hace nada -- el doble toque alterna "hay que comprarlo" y se guarda', async ({ page }) => {
    await agregarProducto(page, 'Leche', 'Alimentos', 'Lácteos');
    const item = page.locator('.mercado-item', { hasText: 'Leche' });

    await item.click();
    await expect(item).not.toHaveClass(/mercado-item-comprar/);

    await item.dblclick();
    await expect(item).toHaveClass(/mercado-item-comprar/);

    // Persiste de verdad -- recargar la página y seguir viéndolo marcado.
    await page.reload();
    await esperarAppLista(page);
    await abrirMercado(page);
    await expect(page.locator('.mercado-item', { hasText: 'Leche' })).toHaveClass(/mercado-item-comprar/);

    // Un segundo doble toque (pasada la ventana del primero) lo desmarca.
    const itemDeNuevo = page.locator('.mercado-item', { hasText: 'Leche' });
    await page.waitForTimeout(500);
    await itemDeNuevo.dblclick();
    await expect(itemDeNuevo).not.toHaveClass(/mercado-item-comprar/);
  });

  test('mantener presionado abre Editar/Eliminar -- Editar actualiza categoría, Eliminar borra', async ({ page }) => {
    await agregarProducto(page, 'Leche', 'Alimentos', 'Lácteos');
    const item = page.locator('.mercado-item', { hasText: 'Leche' });

    const box = await item.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await expect(page.locator('#btn-editar-borrar-editar')).toBeVisible();
    await expect(page.locator('#btn-editar-borrar-eliminar')).toBeVisible();

    await page.locator('#btn-editar-borrar-editar').click();
    await expect(page.locator('#modal-mercado-producto')).toBeVisible();
    await expect(page.locator('#mercado-producto-titulo')).toHaveText('Editar producto');
    await expect(page.locator('#mercado-nombre')).toHaveValue('Leche');

    await page.locator('#mercado-categoria').fill('Refrigerados');
    await page.locator('#btn-guardar-mercado-producto').click();
    await expect(page.locator('#modal-mercado-producto')).toBeHidden();

    await expect(page.locator('.mercado-categoria-titulo', { hasText: 'Refrigerados' })).toBeVisible();
    await expect(page.locator('.mercado-categoria-titulo', { hasText: 'Alimentos' })).toHaveCount(0);

    // Eliminar
    const itemActualizado = page.locator('.mercado-item', { hasText: 'Leche' });
    const box2 = await itemActualizado.boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    page.once('dialog', (d) => d.accept());
    await page.locator('#btn-editar-borrar-eliminar').click();
    await expect(page.locator('.mercado-item', { hasText: 'Leche' })).toHaveCount(0);
    await expect(page.locator('#mercado-list .empty-state')).toBeVisible();
  });

  test('el selector de categoría sugiere categorías ya usadas antes (sin datalist nativo)', async ({ page }) => {
    await agregarProducto(page, 'Detergente', 'Aseo', 'Cocina');

    await page.locator('#btn-nuevo-producto-mercado').click();
    await page.locator('.btn-desplegar-concepto[data-target="mercado-categoria"]').click();
    await expect(page.locator('#panel-mercado-categoria')).toBeVisible();
    await page.locator('#panel-mercado-categoria .caja-picker-option', { hasText: 'Aseo' }).click();
    await expect(page.locator('#mercado-categoria')).toHaveValue('Aseo');
  });
});

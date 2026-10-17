// Archivar conceptos duplicados ("Internet hogar" teniendo "Internet"): el concepto
// archivado deja de mostrarse en todas partes (listas, Configurar mes, tabla,
// totales) pero su historial de movimientos no se toca, y se puede restaurar.
// También: aviso al crear un concepto que se parece a uno existente.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, irATab } = require('./helpers/googleMock');

async function abrirApp(page, presupuesto) {
  const hoy = new Date().toISOString().slice(0, 10);
  await mockGoogleApis(page, {
    Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    Presupuesto: presupuesto || [
      ['Gasto fijo', 'Internet', 100000, 0, ''],
      ['Gasto fijo', 'Internet hogar', 90000, 0, ''],
    ],
    // Un pago registrado con el nombre duplicado.
    'Movimiento de Caja': [
      ['M1', hoy, 'prueba@example.com', 'Internet hogar', 'Gasto fijo', 'Efectivo', 90000, '', ''],
    ],
  });
  await iniciarSesionFalsa(page);
  await page.goto('/index.html');
  await esperarAppLista(page);
  await irATab(page, 'proyeccion');
}

async function archivar(page, concepto) {
  await page.locator('#btn-menu-proyeccion').click();
  await page.locator('#btn-archivar-conceptos').click();
  await expect(page.locator('#modal-archivar')).toBeVisible();
  await page.locator('#archivar-concepto').selectOption(concepto);
  await page.locator('#btn-confirmar-archivar').click();
  await expect(page.locator('#modal-archivar')).toBeHidden();
}

const fila = (page, concepto) =>
  page.locator(`#proy-tabla-body .proy-tabla-row[data-concepto="${concepto}"]`);

test.describe('Archivar conceptos', () => {
  test('el menú ⋯ ofrece Archivar conceptos (y ya no Unificar)', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#btn-menu-proyeccion').click();
    await expect(page.locator('#btn-archivar-conceptos')).toHaveText(/Archivar conceptos/);
    await expect(page.locator('#btn-archivar-conceptos .dd-icon svg')).toHaveCount(1);
    await expect(page.locator('#btn-unificar-conceptos')).toHaveCount(0);
  });

  test('archivar un concepto lo saca de la tabla y de los totales, y el modal se cierra', async ({ page }) => {
    await abrirApp(page);
    await expect(fila(page, 'Internet')).toHaveCount(1);
    await expect(fila(page, 'Internet hogar')).toHaveCount(1);
    // Antes: gastos estimados del mes = 100.000 + 90.000.
    await expect(page.locator('.proy-4m-card').first()).toContainText('Gas. $ 190.000');

    await page.locator('#btn-menu-proyeccion').click();
    await page.locator('#btn-archivar-conceptos').click();
    await page.locator('#archivar-concepto').selectOption('Internet hogar');
    // Vista previa: cuántos movimientos tiene (no se tocan).
    await expect(page.locator('#archivar-resumen')).toContainText('Sus 1 movimiento ya registrado no se tocan');
    await page.locator('#btn-confirmar-archivar').click();

    // Se cierra el formulario y la pantalla de Proyección queda a la vista.
    await expect(page.locator('#modal-archivar')).toBeHidden();
    await expect(page.locator('#tab-proyeccion')).toBeVisible();
    await expect(fila(page, 'Internet hogar')).toHaveCount(0);
    await expect(fila(page, 'Internet')).toHaveCount(1);
    await expect(page.locator('.proy-4m-card').first()).toContainText('Gas. $ 100.000');

    // El historial no se toca: el movimiento sigue en Movimientos.
    await irATab(page, 'movimientos');
    await expect(page.locator('#movimientos-list')).toContainText('Internet hogar');
  });

  test('el archivado desaparece de Configurar mes y sigue así al recargar', async ({ page }) => {
    await abrirApp(page);
    await archivar(page, 'Internet hogar');
    await expect(page.locator('#sync-toast')).not.toHaveClass(/visible/);

    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet"]')).toHaveCount(1);
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet hogar"]')).toHaveCount(0);
    await page.locator('#btn-cancelar-config-mes').click();

    // Persiste en la hoja Presupuesto (columna F).
    await page.reload();
    await esperarAppLista(page);
    await irATab(page, 'proyeccion');
    await expect(fila(page, 'Internet hogar')).toHaveCount(0);
    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet hogar"]')).toHaveCount(0);
  });

  // Caso real: "Internet" es de fábrica (no tiene fila en Presupuesto); aun así debe poder
  // archivarse, y seguir archivado tras recargar (las listas de fábrica se reconstruyen).
  test('archiva también un concepto de fábrica (sin fila en Presupuesto) y sigue archivado al recargar', async ({ page }) => {
    await abrirApp(page, [['Gasto fijo', 'Internet hogar', 90000, 0, '']]);   // "Internet" solo existe de fábrica
    await archivar(page, 'Internet');
    await expect(page.locator('#tab-proyeccion')).toBeVisible();

    await page.reload();
    await esperarAppLista(page);
    await irATab(page, 'proyeccion');
    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet"]')).toHaveCount(0);
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet hogar"]')).toHaveCount(1);
  });

  test('Restaurar devuelve el concepto', async ({ page }) => {
    await abrirApp(page);
    await archivar(page, 'Internet hogar');

    await page.locator('#btn-menu-proyeccion').click();
    await page.locator('#btn-archivar-conceptos').click();
    await expect(page.locator('#archivar-existentes')).toContainText('Internet hogar');
    await page.locator('#archivar-existentes [data-restaurar-concepto="Internet hogar"]').click();
    await expect(page.locator('#archivar-existentes')).toHaveText('');
    await page.locator('#btn-cerrar-archivar').click();

    await expect(fila(page, 'Internet hogar')).toHaveCount(1);
  });

  test('no deja crear de nuevo un concepto archivado', async ({ page }) => {
    await abrirApp(page);
    await archivar(page, 'Internet hogar');
    await expect(page.locator('#sync-toast')).not.toHaveClass(/visible/);

    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await page.locator('#btn-config-nuevo-concepto').click();
    await page.locator('#nuevo-concepto-nombre').fill('Internet hogar');
    await expect(page.locator('#nuevo-concepto-duplicado')).toBeVisible();
    await expect(page.locator('#nuevo-concepto-duplicado')).toContainText('archivado');

    await page.locator('#nuevo-concepto-cat-group .cat-btn[data-value="Gasto fijo"]').click();
    await page.locator('#nuevo-concepto-monto').fill('50000');
    await page.locator('#btn-guardar-nuevo-concepto').click();
    await expect(page.locator('#modal-nuevo-concepto')).toBeVisible();   // no se creó
  });

  test('al crear un concepto, avisa si se parece a uno existente y deja usar el existente', async ({ page }) => {
    await abrirApp(page);
    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await page.locator('#btn-config-nuevo-concepto').click();
    await expect(page.locator('#modal-nuevo-concepto')).toBeVisible();

    await page.locator('#nuevo-concepto-nombre').fill('Gimnasio');
    await expect(page.locator('#nuevo-concepto-parecido')).toBeHidden();

    await page.locator('#nuevo-concepto-nombre').fill('Internet fibra');
    await expect(page.locator('#nuevo-concepto-parecido')).toBeVisible();
    await expect(page.locator('#nuevo-concepto-parecido')).toContainText('¿es el mismo gasto?');
    await page.locator('#nuevo-concepto-parecido [data-usar-concepto="Internet"]').click();

    // Se vuelve a Configurar mes con el cursor en el concepto que ya existe.
    await expect(page.locator('#modal-nuevo-concepto')).toBeHidden();
    await expect(page.locator('#modal-config-mes')).toBeVisible();
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet"]')).toBeFocused();
  });
});

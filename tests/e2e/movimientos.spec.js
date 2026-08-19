const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');
const { seleccionarCaja } = require('./helpers/uiHelpers');

test.describe('Movimientos', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page, {
      // Una caja ya existente, para no depender de crearla en cada test.
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();
    await expect(page.locator('#tab-movimientos')).toBeVisible();
  });

  test('registrar un ingreso lo muestra en la lista', async ({ page }) => {
    await page.locator('#btn-nuevo-movimiento').click();
    await expect(page.locator('#modal-movimiento')).toBeVisible();

    await page.locator('.cat-btn[data-value="Ingreso"]').click();
    await page.locator('#mov-concepto-ingreso').fill('SURA');
    await seleccionarCaja(page, 'mov-caja', 'Efectivo (COP)');
    await page.locator('#mov-monto').fill('500000');
    await page.locator('#btn-guardar-mov').click();

    await expect(page.locator('#modal-movimiento')).toBeHidden();
    await expect(page.locator('#movimientos-list')).toContainText('SURA');
    await expect(page.locator('#movimientos-list')).toContainText('500.000');
  });

  test('no deja guardar un movimiento sin monto', async ({ page }) => {
    await page.locator('#btn-nuevo-movimiento').click();
    await page.locator('.cat-btn[data-value="Ingreso"]').click();
    await page.locator('#mov-concepto-ingreso').fill('SURA');

    let dialogo = null;
    page.once('dialog', async (d) => { dialogo = d.message(); await d.accept(); });
    await page.locator('#btn-guardar-mov').click();
    await page.waitForTimeout(200);

    expect(dialogo).toContain('Completa todos los campos obligatorios');
    await expect(page.locator('#modal-movimiento')).toBeVisible();
  });

  test('doble clic en un movimiento abre su resumen', async ({ page }) => {
    // Ingreso porque no valida saldo suficiente (a diferencia de un gasto,
    // que necesitaría fondos ya cargados en la caja de prueba).
    await page.locator('#btn-nuevo-movimiento').click();
    await page.locator('.cat-btn[data-value="Ingreso"]').click();
    await page.locator('#mov-concepto-ingreso').fill('SURA');
    await seleccionarCaja(page, 'mov-caja', 'Efectivo (COP)');
    await page.locator('#mov-monto').fill('80000');
    await page.locator('#btn-guardar-mov').click();
    await expect(page.locator('#modal-movimiento')).toBeHidden();

    await page.locator('.mov-card', { hasText: 'SURA' }).dblclick();
    await expect(page.locator('#modal-resumen-movimiento')).toBeVisible();
    await expect(page.locator('#resumen-mov-titulo')).toContainText('SURA');
    await expect(page.locator('#resumen-mov-body')).toContainText('Ingreso');
    await expect(page.locator('#resumen-mov-body')).toContainText('80.000');
  });
});

test.describe('Movimientos — filtro de subcategoría', () => {
  test.beforeEach(async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [
        ['M1', hoy, 'prueba@example.com', 'Alquiler', 'Gasto fijo', 'Efectivo', 500000, '', ''],
        ['M2', hoy, 'prueba@example.com', 'Internet', 'Gasto fijo', 'Efectivo', 80000, '', ''],
        ['M3', hoy, 'prueba@example.com', 'Mercado', 'Gasto variable', 'Efectivo', 120000, '', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();
    await expect(page.locator('#tab-movimientos')).toBeVisible();
  });

  test('la subcategoría depende de la categoría elegida', async ({ page }) => {
    const subSel = page.locator('#filtro-subcategoria');

    // Sin categoría elegida: aparecen conceptos de todas las categorías.
    await expect(subSel.locator('option[value="Alquiler"]')).toHaveCount(1);
    await expect(subSel.locator('option[value="Mercado"]')).toHaveCount(1);

    // Gasto fijo: solo sus propios conceptos.
    await page.locator('#filtro-concepto').selectOption('Gasto fijo');
    await expect(subSel.locator('option[value="Alquiler"]')).toHaveCount(1);
    await expect(subSel.locator('option[value="Internet"]')).toHaveCount(1);
    await expect(subSel.locator('option[value="Mercado"]')).toHaveCount(0);

    // Elegir la subcategoría filtra la lista de movimientos.
    await subSel.selectOption('Alquiler');
    await expect(page.locator('#movimientos-list')).toContainText('Alquiler');
    await expect(page.locator('#movimientos-list')).not.toContainText('Internet');
  });

  test('la tarjeta no tiene botones sueltos -- Editar/Borrar viven en el resumen (doble toque)', async ({ page }) => {
    const tarjeta = page.locator('.mov-card', { hasText: 'Alquiler' });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.locator('button')).toHaveCount(0);

    await tarjeta.dblclick();
    await expect(page.locator('#modal-resumen-movimiento')).toBeVisible();
    await expect(page.locator('#resumen-mov-acciones')).toBeVisible();

    await page.locator('#btn-resumen-mov-editar').click();
    await expect(page.locator('#modal-resumen-movimiento')).toBeHidden();
    await expect(page.locator('#modal-movimiento')).toBeVisible();
    await expect(page.locator('#mov-monto')).toHaveValue('500.000');
  });

  test('borrar desde el resumen quita el movimiento de la lista', async ({ page }) => {
    const tarjeta = page.locator('.mov-card', { hasText: 'Mercado' });
    await tarjeta.dblclick();
    await expect(page.locator('#modal-resumen-movimiento')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.locator('#btn-resumen-mov-borrar').click();

    await expect(page.locator('#movimientos-list')).not.toContainText('Mercado');
  });
});

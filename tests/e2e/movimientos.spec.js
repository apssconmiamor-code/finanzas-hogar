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
});

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Cajas', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await expect(page.locator('#tab-cajas')).toBeVisible();
  });

  test('crear una caja nueva la muestra en la grilla', async ({ page }) => {
    await page.locator('#btn-nueva-caja').click();
    await expect(page.locator('#modal-caja')).toBeVisible();

    await page.locator('#caja-nombre').fill('Ahorro Vacaciones');
    await page.locator('#caja-moneda').selectOption('USD');
    await page.locator('#btn-guardar-caja').click();

    await expect(page.locator('#modal-caja')).toBeHidden();
    await expect(page.locator('#cajas-grid')).toContainText('Ahorro Vacaciones');
  });

  test('no deja crear dos cajas con el mismo nombre', async ({ page }) => {
    await page.locator('#btn-nueva-caja').click();
    await page.locator('#caja-nombre').fill('Efectivo');
    await page.locator('#btn-guardar-caja').click();
    await expect(page.locator('#modal-caja')).toBeHidden();

    let dialogo = null;
    page.once('dialog', async (d) => { dialogo = d.message(); await d.accept(); });

    await page.locator('#btn-nueva-caja').click();
    await page.locator('#caja-nombre').fill('efectivo'); // mismo nombre, otras mayúsculas
    await page.locator('#btn-guardar-caja').click();
    await page.waitForTimeout(200);

    expect(dialogo).toContain('Ya existe una caja');
  });
});

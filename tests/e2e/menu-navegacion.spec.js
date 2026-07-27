// Préstamos y Lista de compras ya no viven en la barra de pestañas
// principal — se separaron de la antigua pestaña "Compromisos" y ahora
// solo se llega a ellos desde el menú de los tres puntos (⋯), igual que
// "Resumen".

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Navegación desde el menú ⋯', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
  });

  test('Préstamos y Lista de compras no están en la barra de pestañas principal', async ({ page }) => {
    await expect(page.locator('.nav-item[data-tab="compromisos"]')).toHaveCount(0);
    await expect(page.locator('.nav-item[data-tab="prestamos"]')).toHaveCount(0);
    await expect(page.locator('.nav-item[data-tab="compras"]')).toHaveCount(0);
  });

  test('el menú ⋯ abre Préstamos y Lista de compras', async ({ page }) => {
    const btnMenu = page.locator('#btn-menu, #btn-bottom-menu').first();
    await btnMenu.click();
    await expect(page.locator('#dropdown-menu')).toBeVisible();

    await page.locator('[data-tab-nav="prestamos"]').click();
    await expect(page.locator('#tab-prestamos')).toBeVisible();
    await expect(page.locator('#tab-cajas')).toHaveClass(/hidden/);

    await btnMenu.click();
    await page.locator('[data-tab-nav="compras"]').click();
    await expect(page.locator('#tab-compras')).toBeVisible();
    await expect(page.locator('#tab-prestamos')).toHaveClass(/hidden/);
  });
});

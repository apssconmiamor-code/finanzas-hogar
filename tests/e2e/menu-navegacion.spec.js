// Préstamos y Lista de compras viven juntos en una sola pestaña
// "Compromisos" (dos bloques separados, uno debajo del otro) — no están
// en la barra de pestañas principal, solo se llega desde el menú de los
// tres puntos (⋯), igual que "Resumen".

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Navegación desde el menú ⋯', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
  });

  test('Compromisos no está en la barra de pestañas principal', async ({ page }) => {
    await expect(page.locator('.nav-item[data-tab="compromisos"]')).toHaveCount(0);
    await expect(page.locator('.nav-item[data-tab="prestamos"]')).toHaveCount(0);
    await expect(page.locator('.nav-item[data-tab="compras"]')).toHaveCount(0);
  });

  test('el menú ⋯ abre Compromisos, con Préstamos y Lista de compras como dos bloques adentro', async ({ page }) => {
    const btnMenu = page.locator('#btn-menu, #btn-bottom-menu').first();
    await btnMenu.click();
    await expect(page.locator('#dropdown-menu')).toBeVisible();

    await page.locator('[data-tab-nav="compromisos"]').click();
    await expect(page.locator('#tab-compromisos')).toBeVisible();
    await expect(page.locator('#tab-cajas')).toHaveClass(/hidden/);

    // Los dos bloques están ahí, cada uno con su propio "+ Nuevo".
    await expect(page.locator('#tab-compromisos')).toContainText('Préstamos');
    await expect(page.locator('#btn-nuevo-prestamo')).toBeVisible();
    await expect(page.locator('#tab-compromisos')).toContainText('Lista de compras');
    await expect(page.locator('#btn-nueva-compra')).toBeVisible();
  });
});

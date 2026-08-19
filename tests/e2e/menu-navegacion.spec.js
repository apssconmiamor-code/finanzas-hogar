// Préstamos y Lista de compras viven juntos en una sola pestaña
// "Compromisos" (dos bloques separados, uno debajo del otro) — no están
// en la barra de pestañas principal, solo se llega desde el menú de los
// tres puntos (⋯), igual que "Análisis".

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

  // Los tests corren con serviceWorkers:'block' (ver playwright.config.js),
  // así que no hay una suscripción real que actualizar -- esto solo prueba
  // que el botón existe y que, sin Service Worker registrado, avisa en vez
  // de romper la app (bug real reportado: en iOS el chequeo automático de
  // actualización de una PWA "agregada a inicio" no siempre nota sola que
  // hay versión nueva, aunque se cierre y abra la app varias veces).
  test('"Buscar actualización" del menú ⋯ no rompe la app sin un Service Worker real', async ({ page }) => {
    const btnMenu = page.locator('#btn-menu, #btn-bottom-menu').first();
    await btnMenu.click();
    await expect(page.locator('#dd-buscar-actualizacion')).toBeVisible();

    let dialogo = null;
    page.once('dialog', (d) => { dialogo = d.message(); d.accept(); });
    await page.locator('#dd-buscar-actualizacion').click();

    await expect.poll(() => dialogo).not.toBeNull();
    expect(dialogo).toContain('Service Worker');
    // La app sigue funcionando después del aviso.
    await expect(page.locator('#app')).toBeVisible();
  });
});

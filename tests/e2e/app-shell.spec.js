const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('App con sesión iniciada', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
  });

  test('entra directo a la app (sin pantalla de login) y muestra Cuentas', async ({ page }) => {
    await expect(page.locator('#app')).not.toHaveClass(/hidden/);
    await expect(page.locator('#login-screen')).toHaveClass(/hidden/);
    await expect(page.locator('#tab-cajas')).toBeVisible();
  });

  test('la navegación entre pestañas cambia la sección visible', async ({ page }) => {
    // Hay dos botones por pestaña (sidebar de escritorio + barra inferior de
    // móvil); solo uno está visible según el viewport — :visible filtra al correcto.
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();
    await expect(page.locator('#tab-movimientos')).toBeVisible();
    await expect(page.locator('#tab-cajas')).toHaveClass(/hidden/);

    await page.locator('.nav-item[data-tab="proyeccion"]:visible').first().click();
    await expect(page.locator('#tab-proyeccion')).toBeVisible();
  });
});

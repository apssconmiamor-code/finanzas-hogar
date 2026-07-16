const { test, expect } = require('@playwright/test');
const { mockGoogleApis } = require('./helpers/googleMock');

test.describe('Pantalla de inicio sin sesión', () => {
  test('muestra el botón de Google y no la app', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');

    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#btn-login')).toBeVisible();
    await expect(page.locator('#btn-login')).toContainText('Entrar con Google');
    await expect(page.locator('#app')).toHaveClass(/hidden/);
  });

  test('no lanza errores de JS al cargar', async ({ page }) => {
    const erroresConsola = [];
    page.on('pageerror', (err) => erroresConsola.push(err.message));

    await mockGoogleApis(page);
    await page.goto('/index.html');
    await page.waitForTimeout(500);

    expect(erroresConsola).toEqual([]);
  });
});

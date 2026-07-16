const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Seguridad — texto de usuario no debe ejecutarse como HTML', () => {
  test('una descripción con HTML se muestra como texto, no se renderiza', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const marcador = 'INYECCION_XSS_' + Date.now();

    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [
        ['M1', hoy, 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', '10000',
          `<img src=x onerror="window.__xss='${marcador}'">`, ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();
    await expect(page.locator('#tab-movimientos')).toBeVisible();
    await page.waitForTimeout(300);

    // Si el HTML se interpretó, la imagen rota dispararía onerror y setearía esto.
    const xssEjecutado = await page.evaluate(() => window.__xss);
    expect(xssEjecutado).toBeUndefined();

    // El texto debe seguir visible (como texto plano), no desaparecer.
    await expect(page.locator('#movimientos-list')).toContainText('img src=x onerror');
  });
});

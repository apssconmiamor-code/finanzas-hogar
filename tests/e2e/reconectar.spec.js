// Cuando no hay forma de renovar la sesión automáticamente (dispositivo
// nuevo, o el sessionToken/refresh_token guardado en el Worker ya no
// sirve), la app no debe dejar al usuario sin salida: debe aparecer un
// botón fijo de "Reconectar" que, con un solo toque (el popup de
// conectarConGooglePopup + el Worker), recupera la sesión y carga los
// datos reales.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');
const { mockConexionGooglePopup } = require('./helpers/workerMock');

test.describe('Reconectar — cuando no hay forma de renovar la sesión sola', () => {
  test('aparece un botón de Reconectar y con un toque recupera la sesión', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    // Sin worker_session en localStorage: simula un dispositivo que nunca
    // se conectó (o cuyo sessionToken ya no sirve) — renovarTokenDesdeWorker
    // falla de inmediato, sin red, que es justo el caso a probar.
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [['M1', hoy, 'prueba@example.com', 'Salario', 'Ingreso', 'Efectivo', 1000000, '', '']],
    });
    await mockConexionGooglePopup(page); // el popup de "Reconectar" sí funciona

    // Todo GET a Sheets devuelve 401 hasta que se reconecte con el popup.
    let tokenRenovado = false;
    await page.route('**sheets.googleapis.com/**/values/**', async (route) => {
      if (route.request().method() === 'GET' && !tokenRenovado) {
        return route.fulfill({ status: 401, json: { error: { code: 401 } } });
      }
      await route.fallback();
    });
    // Cuando llega el token que entrega el popup mockeado, se marca como
    // renovado para que las siguientes lecturas ya respondan bien.
    await page.route('**sheets.googleapis.com/**', async (route) => {
      const auth = route.request().headers()['authorization'] || '';
      if (auth.includes('FAKE_ACCESS_TOKEN_WORKER')) tokenRenovado = true;
      await route.fallback();
    });

    await page.goto('/');
    await esperarAppLista(page);

    // Debe aparecer el botón de Reconectar (no quedarse en blanco/colgado).
    await expect(page.locator('#reconectar-bar')).toBeVisible({ timeout: 15000 });

    // Un solo toque debe bastar para recuperar la sesión y los datos.
    await page.click('#reconectar-bar .btn-reconectar');

    await expect(page.locator('#reconectar-bar')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#cajas-grid')).toContainText('Efectivo');
    await expect(page.locator('#movimientos-list')).toContainText('Salario');

    // El sessionToken que entregó el popup queda guardado para la próxima vez.
    const sessionGuardado = await page.evaluate(() => localStorage.getItem('worker_session'));
    expect(sessionGuardado).toBe('FAKE_SESSION_TOKEN');
  });
});

// Reportado: si la red se cae mientras la app muestra "Reconectar" (sesión
// sin renovar), volver a tener internet no arreglaba nada solo —
// window.addEventListener("online", ...) en sync.js solo llamaba a
// sincronizar() (cola de cambios offline pendientes), que no toca la
// sesión para nada. Había que tocar el botón "Reconectar" a mano incluso
// después de que la conexión ya hubiera vuelto. Ahora, si la barra de
// Reconectar sigue visible cuando vuelve la conexión, se reintenta la
// reconexión sola.
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, esperarAppLista } = require('./helpers/googleMock');

test.describe('Reconexión automática al volver la conexión', () => {
  test('si se cae la red mientras muestra "Reconectar", al volver el internet se reconecta sola sin tocar el botón', async ({ page, context }) => {
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    });
    await page.addInitScript(() => {
      localStorage.setItem('guser', JSON.stringify({ name: 'Usuario Prueba', email: 'prueba@example.com', picture: '' }));
      localStorage.setItem('gtoken', 'FAKE_TOKEN_VIEJO');
      localStorage.setItem('worker_session', 'FAKE_SESSION_TOKEN');
    });

    // Sheets responde 401 (token vencido) hasta que se renueve.
    let accesoOk = false;
    await page.route('**sheets.googleapis.com/**/values/**', async (route) => {
      if (route.request().method() === 'GET' && !accesoOk) {
        return route.fulfill({ status: 401, json: { error: { code: 401 } } });
      }
      await route.fallback();
    });

    // El Worker empieza fallando (simula que ni la carga inicial ni el
    // primer intento de reconexión pudieron completarse por el corte de red).
    let workerDisponible = false;
    await page.route('**finanzas-hogar-token.byco85.workers.dev/token**', (route) => {
      if (!workerDisponible) {
        return route.fulfill({ status: 502, json: { error: 'fetch_failed' } });
      }
      accesoOk = true;
      return route.fulfill({ json: { access_token: 'FAKE_TOKEN_NUEVO', expires_in: 3600 } });
    });

    await page.goto('/');
    await esperarAppLista(page);

    await expect(page.locator('#reconectar-bar')).toBeVisible({ timeout: 20000 });

    // "Vuelve" la conexión — el Worker ya responde bien — sin tocar el botón.
    workerDisponible = true;
    await context.setOffline(true);
    await context.setOffline(false);

    await expect(page.locator('#reconectar-bar')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#cajas-grid')).toContainText('Efectivo');
  });
});

// Cuando la renovación SILENCIOSA del token falla (el escenario reportado:
// "no se pudo renovar la sesión" cada vez que se reabre la app — típico en
// una PWA instalada en pantalla de inicio de iOS, donde el WKWebView no
// comparte la sesión de Google con Safari), la app ya no debe dejar al
// usuario sin salida: debe aparecer un botón fijo de "Reconectar" que, con
// un solo toque (renovación CON interacción, no prompt:"none"), recupera la
// sesión y carga los datos reales.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Reconectar — cuando la renovación silenciosa siempre falla', () => {
  test('aparece un botón de Reconectar y con un toque recupera la sesión', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [['M1', hoy, 'prueba@example.com', 'Salario', 'Ingreso', 'Efectivo', 1000000, '', '']],
    });

    // Stub de Google Identity: initTokenClient con prompt:"none" SIEMPRE
    // falla (simula el caso real reportado); sin prompt:"none" (la
    // reconexión manual con interacción) SIEMPRE funciona.
    await page.addInitScript(() => {
      window.google = {
        accounts: {
          id: { initialize: () => {}, prompt: () => {} },
          oauth2: {
            initTokenClient: (cfg) => ({
              requestAccessToken: () => {
                setTimeout(() => {
                  if (cfg.prompt === 'none') {
                    cfg.callback({ error: 'interaction_required' });
                  } else {
                    cfg.callback({ access_token: 'TOKEN_RENOVADO_MANUAL' });
                  }
                }, 10);
              }
            })
          }
        }
      };
    });

    // Todo GET a Sheets devuelve 401 hasta que se reconecte manualmente.
    let tokenRenovado = false;
    await page.route('**sheets.googleapis.com/**/values/**', async (route) => {
      if (route.request().method() === 'GET' && !tokenRenovado) {
        return route.fulfill({ status: 401, json: { error: { code: 401 } } });
      }
      await route.fallback();
    });
    // Cuando llega el token renovado (vía el header Authorization), se marca
    // como renovado para que las siguientes lecturas ya respondan bien.
    await page.route('**sheets.googleapis.com/**', async (route) => {
      const auth = route.request().headers()['authorization'] || '';
      if (auth.includes('TOKEN_RENOVADO_MANUAL')) tokenRenovado = true;
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
  });
});

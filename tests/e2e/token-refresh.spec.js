// Reproduce el bug reportado: tras un rato sin usar la app, el token de
// Google vence (primer GET devuelve 401). La app intenta renovar el token
// en silencio con Google Identity Services — pero en PWAs instaladas en la
// pantalla de inicio de iOS ese callback a veces JAMÁS se dispara (ni éxito
// ni error), dejando la app "pegada" en la barra "Conectando…" para
// siempre. Este test simula exactamente ese cuelgue y comprueba que la app
// se recupera igual, en vez de quedarse pegada.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Renovación de token — token vencido al reabrir la app', () => {
  test('si el refresh silencioso de Google se cuelga, la app igual se recupera (no se queda en "Conectando" para siempre)', async ({ page }) => {
    await iniciarSesionFalsa(page);

    // Stub de Google Identity Services que simula el cuelgue real: el
    // objeto "google" existe y expone initTokenClient, pero requestAccessToken()
    // nunca invoca el callback — ni con éxito ni con error.
    await page.addInitScript(() => {
      window.google = {
        accounts: {
          id: { initialize: () => {}, prompt: () => {} },
          oauth2: {
            initTokenClient: () => ({
              requestAccessToken: () => { /* nunca llama al callback: simula el cuelgue */ }
            })
          }
        }
      };
    });

    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [['M1', 45658, 'prueba@example.com', 'Salario', 'Ingreso', 'Efectivo', 1000000, '', '']],
    });

    // El primer GET a cualquier hoja de Sheets devuelve 401 (token vencido);
    // los siguientes ya no, para que si la app reintenta con otro mecanismo
    // (ej. Sheets._renovarToken de sheets.js) logre cargar datos igual.
    let primerGetHecho = false;
    await page.route('**sheets.googleapis.com/**/values/**', async (route) => {
      if (route.request().method() === 'GET' && !primerGetHecho) {
        primerGetHecho = true;
        return route.fulfill({ status: 401, json: { error: { code: 401 } } });
      }
      await route.fallback();
    });

    await page.goto('/');
    await esperarAppLista(page);

    // Debe recuperarse dentro del tiempo del test (bien por debajo de los
    // 30s de timeout de Playwright) — la barra "Conectando…" no debe
    // quedarse pegada para siempre.
    await page.waitForFunction(() => {
      const el = document.getElementById('conectando-bar');
      return el && el.classList.contains('hidden');
    }, { timeout: 20000 });

    // Y la app debe mostrar ALGO (la caché local, aunque la renovación
    // silenciosa se haya colgado) en vez de quedar en blanco.
    await expect(page.locator('#app')).not.toHaveClass(/hidden/);
  });
});

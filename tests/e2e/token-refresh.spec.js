// Verifica la renovación de sesión vía el Worker (finanzas-hogar-token):
// cuando el access_token de Google vence (primer GET a Sheets devuelve
// 401), la app debe pedirle uno nuevo al Worker usando el sessionToken
// guardado — sin ningún toque del usuario — y solo si ESO también falla
// debe caer al botón fijo de "Reconectar".

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');
const { mockWorkerToken } = require('./helpers/workerMock');

// Simula un dispositivo que ya se conectó antes con Google: además de
// guser/gtoken (iniciarSesionFalsa), tiene un sessionToken del Worker
// guardado en localStorage.
async function conSessionTokenGuardado(page) {
  await page.addInitScript(() => {
    localStorage.setItem('worker_session', 'FAKE_SESSION_TOKEN');
  });
}

function mockPrimerGet401(page) {
  let primerGetHecho = false;
  return page.route('**sheets.googleapis.com/**/values/**', async (route) => {
    if (route.request().method() === 'GET' && !primerGetHecho) {
      primerGetHecho = true;
      return route.fulfill({ status: 401, json: { error: { code: 401 } } });
    }
    await route.fallback();
  });
}

test.describe('Renovación de token vía Worker', () => {
  test('token vencido + Worker responde bien → se recupera solo, sin mostrar Reconectar', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await iniciarSesionFalsa(page);
    await conSessionTokenGuardado(page);
    await mockWorkerToken(page, { disponible: true });
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [['M1', hoy, 'prueba@example.com', 'Salario', 'Ingreso', 'Efectivo', 1000000, '', '']],
    });
    await mockPrimerGet401(page);

    await page.goto('/');
    await esperarAppLista(page);

    await page.waitForFunction(() => {
      const el = document.getElementById('conectando-bar');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });

    // Se recuperó solo: no debería estar pidiendo reconectar.
    await expect(page.locator('#reconectar-bar')).toBeHidden();
    await expect(page.locator('#cajas-grid')).toContainText('Efectivo');
    await expect(page.locator('#movimientos-list')).toContainText('Salario');
  });

  test('token vencido + Worker no responde (timeout) → la app se recupera igual, mostrando Reconectar', async ({ page }) => {
    // El presupuesto real de reintento (7s + 1.5s de pausa + 7s del segundo
    // intento = 15.5s, ver renovarTokenDesdeWorker en app.js) más el arranque
    // normal de la página puede acercarse al timeout por defecto de 30s bajo
    // carga (varios tests en paralelo) — se le da más margen a la prueba en
    // vez de acortar la tolerancia real de la app a cortes de red.
    test.setTimeout(60000);

    await iniciarSesionFalsa(page);
    await conSessionTokenGuardado(page);
    // El Worker nunca responde (simula timeout/caída) — la app no debe
    // quedarse colgada esperando para siempre gracias al AbortController.
    await page.context().route('https://finanzas-hogar-token.byco85.workers.dev/token**', () => {
      /* no fulfill, no fallback: la petición nunca resuelve */
    });
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [],
    });
    await mockPrimerGet401(page);

    await page.goto('/');
    await esperarAppLista(page);

    // Debe recuperarse dentro del tiempo del test — la barra "Conectando…"
    // no debe quedarse pegada para siempre.
    await page.waitForFunction(() => {
      const el = document.getElementById('conectando-bar');
      return el && el.classList.contains('hidden');
    }, { timeout: 45000 });

    await expect(page.locator('#app')).not.toHaveClass(/hidden/);
    await expect(page.locator('#reconectar-bar')).toBeVisible();
  });
});

// Bug real confirmado con logs del Worker en producción (agosto 2026):
// cuando el dispositivo pierde su worker_session (el vaciado de
// almacenamiento de iOS de siempre) pero Google todavía recuerda la sesión
// del navegador, el One Tap de Google Identity Services se dispara SOLO — sin
// que la persona toque nada — y antes, _onOneTapCredential() llamaba a
// mostrarApp() sin importar si logró renovar el token. Eso dejaba a la
// persona viendo la app con un banner de error de la nada ("sin_session" en
// los logs), en vez de la pantalla de login normal donde un solo toque
// resuelve todo. Ahora, si la renovación falla, se deshace el guser que puso
// One Tap y se queda en la pantalla de login.
const { test, expect } = require('@playwright/test');
const { mockGoogleApis } = require('./helpers/googleMock');
const { mockWorkerToken } = require('./helpers/workerMock');

function base64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Sustituye el Google Identity Services real (mockeado como no-op en
// mockGoogleApis) por uno falso que dispara el callback de One Tap
// automáticamente al llamar prompt() — simula que Google "auto-selecciona"
// una cuenta con sesión activa en el navegador, sin interacción del usuario.
async function mockOneTapAutoSelect(page, perfil) {
  const credential = `header.${base64urlEncode(perfil)}.firma`;
  await page.addInitScript((cred) => {
    window.google = {
      accounts: {
        id: {
          initialize: (cfg) => { window.__oneTapCallback = cfg.callback; },
          prompt: () => {
            if (window.__oneTapCallback) window.__oneTapCallback({ credential: cred });
          }
        }
      }
    };
  }, credential);
}

test.describe('One Tap con sesión propia rota (sin worker_session)', () => {
  test('si la renovación falla, se queda en la pantalla de login (no en la app rota)', async ({ page }) => {
    await mockGoogleApis(page);
    await mockOneTapAutoSelect(page, { name: 'Usuario Prueba', email: 'prueba@example.com', picture: '' });
    // Sin worker_session en localStorage/cookie: la renovación que dispara
    // One Tap debe fallar con "sin_session", igual que en los logs reales.

    await page.goto('/index.html');
    await page.waitForFunction(() => typeof window.__oneTapCallback === 'function');
    await page.waitForTimeout(300); // deja correr el callback async de One Tap

    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#app')).toHaveClass(/hidden/);

    const guser = await page.evaluate(() => localStorage.getItem('guser'));
    expect(guser).toBeNull();
  });

  test('si SÍ hay worker_session guardado, One Tap renueva y entra directo a la app', async ({ page }) => {
    await mockGoogleApis(page, { Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']] });
    await mockOneTapAutoSelect(page, { name: 'Usuario Prueba', email: 'prueba@example.com', picture: '' });
    await mockWorkerToken(page, { accessToken: 'FAKE_ACCESS_TOKEN_WORKER' });
    await page.addInitScript(() => {
      localStorage.setItem('worker_session', 'FAKE_SESSION_TOKEN');
    });

    await page.goto('/index.html');
    await page.waitForFunction(() => typeof window.__oneTapCallback === 'function');
    await page.waitForFunction(() => typeof window.navegarATab === 'function', { timeout: 10000 });

    await expect(page.locator('#login-screen')).toHaveClass(/hidden/);
    await expect(page.locator('#app')).not.toHaveClass(/hidden/);
    await expect(page.locator('#cajas-grid')).toContainText('Efectivo');
  });
});

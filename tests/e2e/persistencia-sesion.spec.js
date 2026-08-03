// Reportado: en iPhone, la app pide iniciar sesión con Google de nuevo cada
// vez que se abre (no solo el botón "Reconectar" — el login completo). Solo
// pasa si localStorage.guser desaparece por completo entre aperturas, algo
// documentado en iOS (limpieza de almacenamiento de una PWA instalada, sin
// que la app haga nada raro — confirmado que el código solo borra esas
// claves en el logout explícito). _guardarSesion()/_restaurarSesionDesdeCookieSiHaceFalta()
// en app.js guardan guser/gtoken/worker_session también en una cookie de
// primera parte (más resistente a ese tipo de limpieza en iOS) y restauran
// localStorage desde ahí si aparece vacío al abrir la app.
const { test, expect } = require('@playwright/test');
const { mockGoogleApis } = require('./helpers/googleMock');

test.describe('Persistencia de sesión (respaldo en cookie)', () => {
  test('si localStorage se vacía (ej. limpieza de iOS), la sesión se restaura sola desde la cookie de respaldo', async ({ page, context }) => {
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    });

    // Simula que _guardarSesion() ya corrió en una apertura anterior: los
    // mismos 3 datos están tanto en localStorage como en la cookie.
    const guser = JSON.stringify({ name: 'Usuario Prueba', email: 'prueba@example.com', picture: '' });
    await page.addInitScript((guserJson) => {
      localStorage.setItem('guser', guserJson);
      localStorage.setItem('gtoken', 'FAKE_TOKEN');
      localStorage.setItem('worker_session', 'FAKE_SESSION_TOKEN');
    }, guser);
    await context.addCookies([
      { name: 'guser', value: encodeURIComponent(guser), domain: '127.0.0.1', path: '/' },
      { name: 'gtoken', value: 'FAKE_TOKEN', domain: '127.0.0.1', path: '/' },
      { name: 'worker_session', value: 'FAKE_SESSION_TOKEN', domain: '127.0.0.1', path: '/' },
    ]);

    await page.goto('/index.html');
    await page.waitForFunction(() => typeof window.navegarATab === 'function');
    // Con localStorage aún intacto, entra directo (sanity check antes de vaciarlo).
    await expect(page.locator('#app')).not.toHaveClass(/hidden/);
    await expect(page.locator('#login-screen')).toHaveClass(/hidden/);

    // === El evento real: iOS vacía localStorage (la cookie sobrevive) ===
    await page.evaluate(() => localStorage.clear());
    const clavesTrasVaciar = await page.evaluate(() => ({
      guser: localStorage.getItem('guser'),
      gtoken: localStorage.getItem('gtoken'),
    }));
    expect(clavesTrasVaciar.guser).toBeNull();

    await page.reload();
    await page.waitForFunction(() => typeof window.navegarATab === 'function');

    // Debe entrar directo — NO mostrar la pantalla de login — porque
    // _restaurarSesionDesdeCookieSiHaceFalta() repuebla localStorage desde
    // la cookie antes de que window.onload decida qué pantalla mostrar.
    await expect(page.locator('#login-screen')).toHaveClass(/hidden/);
    await expect(page.locator('#app')).not.toHaveClass(/hidden/);
    await expect(page.locator('#user-name')).toHaveText('Usuario Prueba');

    const clavesRestauradas = await page.evaluate(() => ({
      guser: localStorage.getItem('guser'),
      gtoken: localStorage.getItem('gtoken'),
      worker_session: localStorage.getItem('worker_session'),
    }));
    expect(JSON.parse(clavesRestauradas.guser).email).toBe('prueba@example.com');
    expect(clavesRestauradas.gtoken).toBe('FAKE_TOKEN');
    expect(clavesRestauradas.worker_session).toBe('FAKE_SESSION_TOKEN');
  });

  test('sin cookie de respaldo tampoco (primera vez real, nunca hubo sesión) → sí muestra login', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof window.navegarATab !== 'function' || true);
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#app')).toHaveClass(/hidden/);
  });

  test('cerrar sesión borra también la cookie de respaldo (no revive sola en la próxima apertura)', async ({ page, context }) => {
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    });
    const guser = JSON.stringify({ name: 'Usuario Prueba', email: 'prueba@example.com', picture: '' });
    // A propósito NO usa addInitScript acá (a diferencia del test anterior):
    // addInitScript se re-ejecuta en CADA navegación/reload de la página, lo
    // que re-sembraría localStorage después del logout y del reload de más
    // abajo, tapando el propio comportamiento que este test quiere probar.
    // Solo necesita existir para ESTA carga inicial, así que se hace con
    // evaluate() después de goto().
    await context.addCookies([
      { name: 'guser', value: encodeURIComponent(guser), domain: '127.0.0.1', path: '/' },
      { name: 'gtoken', value: 'FAKE_TOKEN', domain: '127.0.0.1', path: '/' },
      { name: 'worker_session', value: 'FAKE_SESSION_TOKEN', domain: '127.0.0.1', path: '/' },
    ]);

    await page.goto('/index.html');
    await page.evaluate((guserJson) => {
      localStorage.setItem('guser', guserJson);
      localStorage.setItem('gtoken', 'FAKE_TOKEN');
      localStorage.setItem('worker_session', 'FAKE_SESSION_TOKEN');
    }, guser);
    await page.reload();
    await page.waitForFunction(() => typeof window.navegarATab === 'function');
    // #btn-logout vive en el sidebar de escritorio, oculto en el viewport
    // mobile del proyecto "iphone" — el menú ⋯ (topbar, visible en ambos)
    // es el camino real para cerrar sesión desde el teléfono.
    await page.locator('#btn-menu').click();
    await page.locator('#dd-logout').click();

    const cookiesTrasLogout = await context.cookies('http://127.0.0.1:4173');
    const nombresConValor = cookiesTrasLogout.filter(c => ['guser', 'gtoken', 'worker_session'].includes(c.name) && c.value);
    expect(nombresConValor).toEqual([]);

    // Con la cookie también borrada, un reload debe mostrar login (no
    // revivir la sesión cerrada por un respaldo que quedó vivo).
    await page.reload();
    await page.waitForFunction(() => typeof window.navegarATab !== 'function' || true);
    await expect(page.locator('#login-screen')).toBeVisible();
  });
});

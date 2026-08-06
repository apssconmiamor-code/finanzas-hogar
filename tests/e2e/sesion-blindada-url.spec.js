// Caso real (agosto 2026): a alguien le volvió a pedir el login completo
// AUN con el ícono bien anclado desde Safari — localStorage y la cookie de
// respaldo (persistencia-sesion.spec.js) pueden desaparecer juntos igual,
// porque ambos viven en el mismo almacenamiento de WebKit que iOS puede
// vaciar. El único dato que sobrevive de verdad es el propio start_url que
// iOS guarda al crear el ícono (fuera de ese almacenamiento). Tras conectar
// con Google en Safari, app.js mete el sessionToken + perfil en la URL y
// pide anclar el ícono desde ahí — así cada apertura trae la sesión en la
// propia dirección de arranque y puede repoblar localStorage sola.
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, esperarAppLista } = require('./helpers/googleMock');
const { mockConexionGooglePopup } = require('./helpers/workerMock');

const BASE_URL = 'http://127.0.0.1:4173';
const UA_SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';
const UA_CHROME_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function base64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlEncodeStr(str) {
  return Buffer.from(str, 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test.describe('Sesión blindada en el start_url (sobrevive a un vaciado total de storage)', () => {
  test('conectar con Google en Safari de iPhone mete la sesión en la URL y ofrece anclar el ícono', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, userAgent: UA_SAFARI_IOS });
    const page = await context.newPage();
    await mockGoogleApis(page, { Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']] });
    await mockConexionGooglePopup(page);

    await page.goto('/index.html');
    await page.locator('#btn-login').click();
    await esperarAppLista(page);

    await expect(page.locator('#instalar-blindado-bar')).toBeVisible();
    expect(page.url()).toContain('u=FAKE_SESSION_TOKEN');
    expect(page.url()).toContain('g=');

    await context.close();
  });

  test('abrir con la sesión metida en la URL entra directo aunque localStorage y cookies estén vacíos', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await mockGoogleApis(page, { Cajas: [['C1', 'blindado@example.com', 'Efectivo', 'COP']] });

    const g = base64urlEncode({ name: 'Persona Blindada', email: 'blindado@example.com', picture: '' });
    await page.goto(`/index.html?u=FAKE_SESSION_TOKEN&g=${g}`);
    await esperarAppLista(page);

    await expect(page.locator('#login-screen')).toHaveClass(/hidden/);
    await expect(page.locator('#app')).not.toHaveClass(/hidden/);
    await expect(page.locator('#cajas-grid')).toContainText('Efectivo');

    const claves = await page.evaluate(() => ({
      worker_session: localStorage.getItem('worker_session'),
      guser: JSON.parse(localStorage.getItem('guser') || 'null'),
    }));
    expect(claves.worker_session).toBe('FAKE_SESSION_TOKEN');
    expect(claves.guser.email).toBe('blindado@example.com');

    await context.close();
  });

  test('sin perfil (g ausente) en la URL, reconstruye el email directo del propio JWT', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await mockGoogleApis(page);

    const payload = base64urlEncodeStr(JSON.stringify({ email: 'soloemail@example.com' }));
    const jwtFalso = `header.${payload}.firma`;
    await page.goto(`/index.html?u=${jwtFalso}`);
    await page.waitForFunction(() => typeof window.navegarATab !== 'function' || true);

    const guser = await page.evaluate(() => JSON.parse(localStorage.getItem('guser') || 'null'));
    expect(guser.email).toBe('soloemail@example.com');

    await context.close();
  });

  test('el aviso de anclar NO se muestra en Chrome-iOS (ahí primero hay que resolver lo de Chrome)', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, userAgent: UA_CHROME_IOS });
    const page = await context.newPage();
    await mockGoogleApis(page);
    await mockConexionGooglePopup(page);

    await page.goto('/index.html');
    await page.locator('#btn-login').click();
    await esperarAppLista(page);

    await expect(page.locator('#instalar-blindado-bar')).toHaveClass(/hidden/);
    await context.close();
  });

  test('el aviso de anclar NO se muestra en escritorio (no aplica fuera de iOS)', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, userAgent: UA_CHROME_DESKTOP });
    const page = await context.newPage();
    await mockGoogleApis(page);
    await mockConexionGooglePopup(page);

    await page.goto('/index.html');
    await page.locator('#btn-login').click();
    await esperarAppLista(page);

    await expect(page.locator('#instalar-blindado-bar')).toHaveClass(/hidden/);
    await context.close();
  });

  test('cerrar sesión limpia la URL (aunque no puede tocar el ícono ya anclado)', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await mockGoogleApis(page, { Cajas: [['C1', 'blindado@example.com', 'Efectivo', 'COP']] });

    const g = base64urlEncode({ name: 'Persona Blindada', email: 'blindado@example.com', picture: '' });
    await page.goto(`/index.html?u=FAKE_SESSION_TOKEN&g=${g}`);
    await esperarAppLista(page);

    await page.locator('#btn-menu').click();
    await page.locator('#dd-logout').click();

    await expect(page.locator('#login-screen')).toBeVisible();
    const url = new URL(page.url());
    expect(url.search).toBe('');

    await context.close();
  });
});

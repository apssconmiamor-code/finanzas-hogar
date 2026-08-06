// Reportado: varias personas de la familia veían la pantalla de login
// completa "muchas veces al día" en iPhone, pese a que localStorage + cookie
// de respaldo (ver persistencia-sesion.spec.js) ya estaban implementados.
// Causa real confirmada con los logs del Worker (ningún intento de renovación
// llegaba al servidor cuando pasaba): el ícono de esas personas estaba
// anclado a la pantalla de inicio desde CHROME, no Safari. En iOS solo un
// ícono anclado desde Safari es una PWA real reconocida por el sistema — uno
// anclado desde Chrome no recibe la exención contra el borrado automático de
// almacenamiento, así que guser/gtoken/worker_session desaparecen mucho más
// seguido. index.html detecta "CriOS" en el user agent (Chrome en iOS) y
// avisa con un banner para que la persona vuelva a crear el ícono desde Safari.
const { test, expect } = require('@playwright/test');
const { mockGoogleApis } = require('./helpers/googleMock');

const BASE_URL = 'http://127.0.0.1:4173';
const UA_CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';
const UA_SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_CHROME_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

test.describe('Aviso de ícono anclado desde Chrome en iOS', () => {
  test('se muestra con user agent de Chrome en iPhone (CriOS)', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, userAgent: UA_CHROME_IOS });
    const page = await context.newPage();
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await expect(page.locator('#chrome-ios-warning')).toBeVisible();
    await context.close();
  });

  test('no se muestra con Safari en iPhone', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, userAgent: UA_SAFARI_IOS });
    const page = await context.newPage();
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await expect(page.locator('#chrome-ios-warning')).toHaveClass(/hidden/);
    await context.close();
  });

  test('no se muestra con Chrome de escritorio (no es iOS)', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, userAgent: UA_CHROME_DESKTOP });
    const page = await context.newPage();
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await expect(page.locator('#chrome-ios-warning')).toHaveClass(/hidden/);
    await context.close();
  });

  test('cerrarlo lo oculta y no vuelve a aparecer tras recargar', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, userAgent: UA_CHROME_IOS });
    const page = await context.newPage();
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await expect(page.locator('#chrome-ios-warning')).toBeVisible();

    await page.locator('#btn-cerrar-aviso-chrome').click();
    await expect(page.locator('#chrome-ios-warning')).toHaveClass(/hidden/);

    await page.reload();
    await expect(page.locator('#chrome-ios-warning')).toHaveClass(/hidden/);
    await context.close();
  });
});

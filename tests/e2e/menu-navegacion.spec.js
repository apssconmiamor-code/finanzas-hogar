// Préstamos y Lista de compras viven juntos en una sola pestaña
// "Compromisos" (dos bloques separados, uno debajo del otro) — no están
// en la barra de pestañas principal, solo se llega desde el atajo redondo
// "Compromisos" de la pantalla de Inicio (ya no está en el menú ⋯).

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, opcionDeVista } = require('./helpers/googleMock');

test.describe('Navegación a Compromisos y menú ⋯', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
  });

  test('Compromisos no está en la barra de pestañas principal', async ({ page }) => {
    await expect(page.locator('.nav-item[data-tab="compromisos"]')).toHaveCount(0);
    await expect(page.locator('.nav-item[data-tab="prestamos"]')).toHaveCount(0);
    await expect(page.locator('.nav-item[data-tab="compras"]')).toHaveCount(0);
  });

  test('el atajo "Compromisos" de Inicio abre Compromisos, con Préstamos y Lista de compras como dos bloques adentro', async ({ page }) => {
    await page.locator('#atajo-compromisos').click();
    await expect(page.locator('#tab-compromisos')).toBeVisible();
    await expect(page.locator('#tab-cajas')).toHaveClass(/hidden/);

    // Los dos bloques están ahí, cada uno con su propio "+ Nuevo".
    await expect(page.locator('#tab-compromisos')).toContainText('Préstamos');
    await expect(await opcionDeVista(page, 'btn-nuevo-prestamo', { hayOpcion: true })).toContain('Nuevo préstamo');
    await expect(page.locator('#tab-compromisos')).toContainText('Lista de compras');
    await expect(await opcionDeVista(page, 'btn-nueva-compra', { hayOpcion: true })).toContain('Nueva compra');
  });

  // Se quitó la barra superior (título, foto de la cuenta y menú principal): la
  // navegación es por los botones de Inicio y cada vista lleva su menú en la franja
  // inferior.
  test('ya no hay barra superior ni menú principal', async ({ page }) => {
    for (const id of ['topbar', 'btn-menu', 'dropdown-menu', 'topbar-avatar', 'topbar-title']) {
      await expect(page.locator('#' + id)).toHaveCount(0);
    }
  });

  // La versión vive en la franja inferior de Inicio. Mantenerla presionada FUERZA la
  // búsqueda de una actualización; un toque corto solo avisa cómo se hace. (Los tests
  // corren con serviceWorkers:'block', así que no hay un SW real: lo que se prueba
  // es que el gesto dispara la búsqueda y que, sin SW registrado, avisa en vez de
  // romper la app.)
  test('la versión se ve en la franja inferior de Inicio', async ({ page }) => {
    const version = await page.evaluate(() => CONFIG.VERSION);
    await expect(page.locator('.barra-inferior #campo-version')).toHaveText('v' + version);
  });

  test('un toque corto en la versión solo avisa cómo forzar la actualización', async ({ page }) => {
    let dialogo = null;
    page.on('dialog', (d) => { dialogo = d.message(); d.dismiss(); });
    await page.locator('#campo-version').click();
    await expect(page.locator('#sync-toast')).toContainText('Mantén presionada la versión');
    expect(dialogo).toBeNull();   // no se disparó ninguna búsqueda
  });

  test('mantener presionada la versión busca una actualización y no rompe la app sin Service Worker real', async ({ page }) => {
    let dialogo = null;
    page.once('dialog', (d) => { dialogo = d.message(); d.accept(); });
    const caja = await page.locator('#campo-version').boundingBox();
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();

    await expect.poll(() => dialogo).not.toBeNull();
    expect(dialogo).toContain('Service Worker');
    // Terminó la búsqueda: el campo vuelve a mostrar la versión y la app sigue funcionando.
    const version = await page.evaluate(() => CONFIG.VERSION);
    await expect(page.locator('#campo-version')).toHaveText('v' + version);
    await expect(page.locator('#app')).toBeVisible();
  });
});

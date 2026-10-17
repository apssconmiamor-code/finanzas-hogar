// El gesto de volver (deslizar desde el borde izquierdo) lleva a la pantalla
// principal (Inicio/Cajas) desde cualquier módulo. Si hay algo abierto
// (modal, detalle de un bloque...), primero cierra eso -- un nivel atrás.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

async function deslizarParaVolver(page) {
  await page.evaluate(() => {
    const crearToque = (x, y) => new Touch({ identifier: Date.now(), target: document.body, clientX: x, clientY: y });
    const inicio = crearToque(10, 300);
    document.dispatchEvent(new TouchEvent('touchstart', { touches: [inicio], changedTouches: [inicio], bubbles: true, cancelable: true }));
    const fin = crearToque(160, 300);
    document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [fin], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
}

// WebKit no deja crear TouchEvent sintéticos ("Illegal constructor"), así que
// el gesto solo se puede simular en Chromium.
test.describe('Gesto de volver lleva a Inicio', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'TouchEvent sintético no disponible en WebKit');

  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page, { 'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']] });
    await iniciarSesionFalsa(page);
    await page.goto('/');
    await esperarAppLista(page);
  });

  for (const [tab, atajo] of [['movimientos', '#atajo-movimientos'], ['proyeccion', '#atajo-proyeccion'], ['notificaciones', '#atajo-alertas']]) {
    test(`desde ${tab} vuelve a la pantalla principal`, async ({ page }) => {
      await page.locator(atajo).click();
      await expect(page.locator(`#tab-${tab}`)).toBeVisible();
      await deslizarParaVolver(page);
      await expect(page.locator('#tab-cajas')).toBeVisible();
      await expect(page.locator(`#tab-${tab}`)).toBeHidden();
      await expect(page.locator('.nav-item[data-tab="cajas"]:visible').first()).toHaveClass(/active/);
    });
  }

  test('con un modal abierto, el gesto cierra el modal primero y recién el siguiente vuelve a Inicio', async ({ page }) => {
    await page.locator('#atajo-movimientos').click();
    await page.locator('#btn-nuevo-gasto').click();
    await expect(page.locator('#modal-movimiento')).toBeVisible();
    await deslizarParaVolver(page);
    await expect(page.locator('#modal-movimiento')).toBeHidden();
    await expect(page.locator('#tab-movimientos')).toBeVisible();
    await deslizarParaVolver(page);
    await expect(page.locator('#tab-cajas')).toBeVisible();
  });

  test('estando en Inicio el gesto no hace nada', async ({ page }) => {
    await deslizarParaVolver(page);
    await expect(page.locator('#tab-cajas')).toBeVisible();
  });
});

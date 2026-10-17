// Franja inferior estática de cada vista: aloja el menú ⋯ de esa vista (y, en Inicio,
// la versión). Sin barra superior.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, irATab } = require('./helpers/googleMock');

test.beforeEach(async ({ page }) => {
  await mockGoogleApis(page, {
    Cajas: ['Efectivo', 'Nequi', 'Ahorro', 'Choco'].map((n, i) => ['C' + i, 'prueba@example.com', n, 'COP']),
  });
  await iniciarSesionFalsa(page);
  await page.goto('/');
  await esperarAppLista(page);
});

test('Inicio: franja pegada al borde inferior con el menú ⋯ a la izquierda y la versión a la derecha', async ({ page }) => {
  const barra = page.locator('.barra-inferior[data-barra="cajas"]');
  await expect(barra).toBeVisible();
  const caja = await barra.boundingBox();
  // Pegada al borde de abajo del área de contenido (en escritorio la app es una ventana
  // flotante con margen, así que se mide contra ella y no contra el navegador).
  const area = await page.locator(".main-content").boundingBox();
  expect(Math.abs((caja.y + caja.height) - (area.y + area.height))).toBeLessThan(3);

  const menu = await barra.locator('#btn-menu-cajas').boundingBox();
  const version = await barra.locator('#campo-version').boundingBox();
  expect(menu.x).toBeLessThan(version.x);
  expect(menu.y).toBeGreaterThan(caja.y);
});

test("el menú ⋯ es un círculo y queda centrado en la franja", async ({ page }) => {
  const barra = page.locator(".barra-inferior[data-barra=\"cajas\"]");
  await expect(barra).toBeVisible();
  const caja = await barra.boundingBox();
  const btn = page.locator("#btn-menu-cajas");
  const b = await btn.boundingBox();
  // Redondo: ancho = alto y radio del 50%.
  expect(Math.abs(b.width - b.height)).toBeLessThan(1);
  await expect(btn).toHaveCSS("border-top-left-radius", "50%");
  // Centrado horizontalmente en la franja.
  expect(Math.abs((b.x + b.width / 2) - (caja.x + caja.width / 2))).toBeLessThan(3);

  // El panel que se abre queda centrado sobre el botón.
  await btn.click();
  const p = await page.locator(".barra-inferior .cajas-menu-panel").boundingBox();
  expect(Math.abs((p.x + p.width / 2) - (b.x + b.width / 2))).toBeLessThan(3);
});

test('la franja es estática: no se mueve aunque la pantalla se desplace', async ({ page }) => {
  const barra = page.locator('.barra-inferior[data-barra="cajas"]');
  await expect(barra).toBeVisible();
  const antes = (await barra.boundingBox()).y;
  await page.evaluate(() => { document.querySelector('.main-content').scrollTop = 99999; });
  await page.waitForTimeout(200);
  const despues = (await barra.boundingBox()).y;
  expect(Math.abs(despues - antes)).toBeLessThan(2);
});

test('el menú ⋯ de la franja se abre hacia arriba y trae Cerrar sesión', async ({ page }) => {
  const btn = page.locator('#btn-menu-cajas');
  await btn.click();
  const panel = page.locator('.barra-inferior .cajas-menu-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#btn-cerrar-sesion')).toBeVisible();
  const pb = await panel.boundingBox();
  const bb = await btn.boundingBox();
  expect(pb.y + pb.height).toBeLessThanOrEqual(bb.y + 1);   // el panel queda encima del botón
});

test('cada vista tiene su propia franja: la de Proyección reemplaza a la de Inicio', async ({ page }) => {
  await irATab(page, 'proyeccion');
  await expect(page.locator('.barra-inferior[data-barra="proyeccion"]')).toBeVisible();
  await expect(page.locator('.barra-inferior[data-barra="cajas"]')).toHaveCount(0);
  await expect(page.locator('.barra-inferior [id="campo-version"]')).toHaveCount(0);   // la versión es solo de Inicio

  const barra = page.locator('.barra-inferior[data-barra="proyeccion"]');
  const caja = await barra.boundingBox();
  const area = await page.locator(".main-content").boundingBox();
  expect(Math.abs((caja.y + caja.height) - (area.y + area.height))).toBeLessThan(3);

  await irATab(page, 'cajas');
  await expect(page.locator('.barra-inferior[data-barra="cajas"]')).toBeVisible();
  await expect(page.locator('.barra-inferior[data-barra="proyeccion"]')).toHaveCount(0);
});

test('en modo Sumar la franja de Inicio cambia la versión por el total', async ({ page }) => {
  await page.locator('#btn-menu-cajas').click();
  await page.locator('#btn-sumar-cajas').click();
  const barra = page.locator('.barra-inferior[data-barra="cajas"]');
  await expect(barra.locator('#btn-sumar-cajas-listo')).toBeVisible();
  await expect(barra.locator('#sumar-cajas-barra')).toBeVisible();
  await expect(barra.locator('#campo-version')).toHaveCount(0);

  await barra.locator('#btn-sumar-cajas-listo').click();
  await expect(barra.locator('#campo-version')).toBeVisible();
});

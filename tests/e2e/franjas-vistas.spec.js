// Cada vista lleva su propia franja inferior con el menú ⋯ y SUS acciones, todas iguales entre
// sí (mismo ancho, alto y botón redondo central) y siempre a la vista, aunque la lista o la
// tabla de la vista sea larguísima.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, irATab, abrirMenuVista, usarAccionVista } = require('./helpers/googleMock');

const hoy = new Date().toISOString().slice(0, 10);
const MUCHOS = Array.from({ length: 60 }, (_, i) => ['M' + i, hoy, 'prueba@example.com', 'Mercado', 'Gasto variable', 'Efectivo', 1000 * (i + 1), '', '']);

test.beforeEach(async ({ page }) => {
  await mockGoogleApis(page, {
    Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    'Movimiento de Caja': MUCHOS,
  });
  await iniciarSesionFalsa(page);
  await page.goto('/index.html');
  await esperarAppLista(page);
});

const VISTAS = ['cajas', 'movimientos', 'proyeccion', 'compromisos', 'notificaciones', 'mercado', 'planes', 'resumen'];

test('todas las vistas tienen su franja, con el mismo ancho, alto y botón redondo central', async ({ page }) => {
  const medidas = [];
  for (const vista of VISTAS) {
    await irATab(page, vista);
    const barra = page.locator(`.barra-inferior[data-barra="${vista}"]`);
    await expect(barra).toBeVisible();
    const b = await barra.boundingBox();
    const btn = page.locator(`#btn-menu-${vista}`);
    const bb = await btn.boundingBox();
    // Botón redondo y centrado en la franja.
    expect(Math.abs(bb.width - bb.height)).toBeLessThan(1);
    await expect(btn).toHaveCSS('border-top-left-radius', '50%');
    expect(Math.abs((bb.x + bb.width / 2) - (b.x + b.width / 2))).toBeLessThan(3);
    // Panel del menú: mismo ancho en todas.
    await btn.click();
    // offsetWidth (no boundingBox): el panel entra con una animación de escala y medirlo a mitad
    // de camino daría un ancho menor.
    const anchoPanel = await page.locator('.barra-inferior .cajas-menu-panel').evaluate(e => e.offsetWidth);
    await page.keyboard.press('Escape');
    medidas.push({ vista, ancho: Math.round(b.width), alto: Math.round(b.height), panel: anchoPanel, x: Math.round(b.x) });
  }
  const primera = medidas[0];
  for (const m of medidas) {
    expect(m.ancho, `ancho de la franja en ${m.vista}`).toBe(primera.ancho);
    expect(m.alto, `alto de la franja en ${m.vista}`).toBe(primera.alto);
    expect(m.panel, `ancho del menú en ${m.vista}`).toBe(primera.panel);
    expect(m.x, `posición de la franja en ${m.vista}`).toBe(primera.x);
  }
});

test('cada vista ofrece sus propias acciones en el menú', async ({ page }) => {
  const opciones = async (vista) => {
    await irATab(page, vista);
    await abrirMenuVista(page);
    const textos = await page.locator('.barra-inferior .cajas-menu-panel .dropdown-item').allTextContents();
    await page.keyboard.press('Escape');
    return textos.map(t => t.trim());
  };
  expect(await opciones('movimientos')).toEqual(['Nuevo ingreso', 'Nuevo gasto', 'Nueva transferencia', 'Sumar movimientos', 'Ir a Inicio']);
  expect(await opciones('compromisos')).toEqual(['Nuevo préstamo', 'Nueva compra', 'Ir a Inicio']);
  expect(await opciones('mercado')).toEqual(['Nueva categoría', 'Ir a Inicio']);
  expect(await opciones('planes')).toEqual(['Nueva categoría', 'Ir a Inicio']);
  expect(await opciones('resumen')).toEqual(['Actualizar datos', 'Ir a Inicio']);
  const alertas = await opciones('notificaciones');
  expect(alertas).toContain('Nuevo bloque');
  expect(alertas[alertas.length - 1]).toBe('Ir a Inicio');
});

test('los botones de acción de la página quedan ocultos: las acciones viven en el menú', async ({ page }) => {
  await irATab(page, 'movimientos');
  for (const id of ['btn-nuevo-ingreso', 'btn-nuevo-gasto', 'btn-nueva-transferencia', 'btn-sumar-mov']) {
    await expect(page.locator('#' + id)).toBeHidden();
  }
  await irATab(page, 'compromisos');
  await expect(page.locator('#btn-nuevo-prestamo')).toBeHidden();
  await expect(page.locator('#btn-nueva-compra')).toBeHidden();
});

test('las opciones del menú hacen lo mismo que los botones de siempre', async ({ page }) => {
  await irATab(page, 'movimientos');
  await usarAccionVista(page, 'btn-nuevo-gasto');
  await expect(page.locator('#modal-movimiento')).toBeVisible();
  await page.locator('#btn-cancelar-mov').click();
  await expect(page.locator('#modal-movimiento')).toBeHidden();

  await irATab(page, 'compromisos');
  await usarAccionVista(page, 'btn-nuevo-prestamo');
  await expect(page.locator('.modal:not(.hidden)')).toHaveCount(1);
});

test('"Ir a Inicio" lleva a la pantalla principal desde cualquier vista', async ({ page }) => {
  await irATab(page, 'mercado');
  await abrirMenuVista(page);
  await page.locator('#franja-inicio').click();
  await expect(page.locator('#tab-cajas')).toBeVisible();
  await expect(page.locator('.barra-inferior[data-barra="cajas"]')).toBeVisible();
});

test('con una lista larguísima la franja se ve de una vez, sin bajar la lista, y sigue ahí al desplazarla', async ({ page }) => {
  await irATab(page, 'movimientos');
  const barra = page.locator('.barra-inferior[data-barra="movimientos"]');
  await expect(barra).toBeVisible();
  // Muchísimo más largo que la pantalla, y aun así sin bajar nada la franja ya está a la vista.
  const largo = await page.evaluate(() => { const m = document.querySelector('.main-content'); return m.scrollHeight - m.clientHeight; });
  expect(largo).toBeGreaterThan(1500);
  const area = await page.locator('.main-content').boundingBox();
  const antes = await barra.boundingBox();
  expect(Math.abs((antes.y + antes.height) - (area.y + area.height))).toBeLessThan(3);

  // Desplazando a la mitad y al final, la franja no se mueve.
  for (const pos of [largo / 2, largo]) {
    await page.evaluate((p) => { document.querySelector('.main-content').scrollTop = p; }, pos);
    await page.waitForTimeout(150);
    const despues = await barra.boundingBox();
    expect(Math.abs(despues.y - antes.y)).toBeLessThan(2);
  }

  // Y no tapa el final de la lista: el último movimiento queda por encima de la franja.
  const ultimo = await page.locator('.mov-card').last().boundingBox();
  expect(ultimo.y + ultimo.height).toBeLessThanOrEqual(antes.y + 1);
});

test('Sumar movimientos: la franja muestra "Listo" y el total, y ya no hay barra flotante', async ({ page }) => {
  await irATab(page, 'movimientos');
  await usarAccionVista(page, 'btn-sumar-mov');
  const barra = page.locator('.barra-inferior[data-barra="movimientos"]');
  await expect(barra.locator('#btn-movimientos-listo')).toBeVisible();
  await expect(barra.locator('#sumar-movimientos-total')).toContainText('Tocá los movimientos');
  await expect(page.locator('#sumar-mov-barra')).toHaveCount(0);

  await page.locator('.mov-card').first().click();
  await expect(barra.locator('.sumar-cajas-barra-total')).toHaveCount(1);
  await expect(barra.locator('.sumar-cajas-barra-total')).toContainText('60.000');   // el más reciente

  await barra.locator('#btn-movimientos-listo').click();
  await expect(barra.locator('#btn-menu-movimientos')).toBeVisible();
});

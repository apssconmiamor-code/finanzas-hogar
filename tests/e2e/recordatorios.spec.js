// Recordatorios guardados: se listan en el menú de Acciones rápidas (el ⚡ de Inicio). Tocar uno lo
// pasa a movimiento; mantenerlo presionado ofrece Editar / Eliminar (como el resto de tarjetas de la app).
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

const hoy = () => new Date().toISOString().slice(0, 10);

async function abrirMenu(page) {
  await mockGoogleApis(page, {
    Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    Recordatorios: [
      ['R1', hoy(), 'prueba@example.com', 'Pagué el mercado', '', '', ''],
      ['R2', hoy(), 'prueba@example.com', 'Llamar al plomero', '', '', ''],
    ],
  });
  await iniciarSesionFalsa(page);
  await page.goto('/index.html');
  await esperarAppLista(page);
  await page.waitForFunction(() => window.recordatorios && window.recordatorios.length === 2);
  await page.locator('#fab-recordatorio').click();
  await expect(page.locator('#modal-menu-acciones')).toBeVisible();
  await page.waitForTimeout(450);   // la hoja sube con una animación corta
}

async function mantener(page, fila) {
  const box = await fila.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test.describe('Recordatorios guardados', () => {
  test('el menú de Acciones rápidas los lista, con su texto y fecha', async ({ page }) => {
    await abrirMenu(page);
    const filas = page.locator('#recordatorios-guardados .recordatorio-fila');
    await expect(filas).toHaveCount(2);
    await expect(filas.first()).toContainText('Pagué el mercado');
  });

  test('mantener presionado un recordatorio ofrece Editar y permite cambiar su texto', async ({ page }) => {
    await abrirMenu(page);
    await mantener(page, page.locator('.recordatorio-fila', { hasText: 'Pagué el mercado' }));

    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await expect(page.locator('#btn-editar-borrar-eliminar')).toBeVisible();
    await page.locator('#btn-editar-borrar-editar').click();

    await expect(page.locator('#modal-recordatorio-crear .hoja-titulo')).toHaveText('Editar recordatorio');
    await expect(page.locator('#recordatorio-texto')).toHaveValue('Pagué el mercado');
    await page.locator('#recordatorio-texto').fill('Pagué el mercado y la leche');
    await expect(page.locator('#btn-guardar-recordatorio-crear')).toHaveText('Guardar cambios');
    await page.locator('#btn-guardar-recordatorio-crear').click();
    await expect(page.locator('#modal-recordatorio-crear')).toBeHidden({ timeout: 10000 });

    // Quedó cambiado en la lista y en la hoja de Sheets (y es el mismo, no uno nuevo).
    const guardados = await page.evaluate(() => Sheets.getRecordatorios());
    expect(guardados.length).toBe(2);
    expect(guardados.find(r => r.id === 'R1').texto).toBe('Pagué el mercado y la leche');
    expect(guardados.find(r => r.id === 'R2').texto).toBe('Llamar al plomero');

    await page.locator('#fab-recordatorio').click();
    await expect(page.locator('#recordatorios-guardados')).toContainText('Pagué el mercado y la leche');
  });

  test('mantener presionado y elegir Eliminar lo quita de la lista', async ({ page }) => {
    await abrirMenu(page);
    await mantener(page, page.locator('.recordatorio-fila', { hasText: 'Llamar al plomero' }));
    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    page.once('dialog', d => d.accept());
    await page.locator('#btn-editar-borrar-eliminar').click();

    await expect.poll(() => page.evaluate(() => window.recordatorios.length)).toBe(1);
    await page.locator('#fab-recordatorio').click();
    await expect(page.locator('#recordatorios-guardados .recordatorio-fila')).toHaveCount(1);
  });

  test('un toque corto lo pasa a movimiento (con su texto y fecha)', async ({ page }) => {
    await abrirMenu(page);
    await page.locator('.recordatorio-fila', { hasText: 'Llamar al plomero' }).click();
    await expect(page.locator('#modal-movimiento-titulo')).toHaveText('Nuevo movimiento (desde recordatorio)');
    await expect(page.locator('#mov-descripcion')).toHaveValue('Llamar al plomero');
  });
});

// Préstamos nunca había tenido cobertura de tests -- se agrega junto con
// el paso 3 del criterio único de gestos: doble toque abre un resumen de
// solo lectura, mantener presionada abre Eliminar (no existe "Editar"
// para un préstamo, nunca la hubo -- solo crear/borrar/registrar pago).
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, irATab, usarAccionVista } = require('./helpers/googleMock');

test.describe('Préstamos', () => {
  test.beforeEach(async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await mockGoogleApis(page, {
      Prestamo: [['P1', 'Carro', 20000000, 24, hoy, 'false', 'Tasa fija']],
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    // Compromisos (Préstamos + Lista de compras) solo se llega desde el
    // menú ⋯, no está en la barra de pestañas principal.
    await irATab(page, 'compromisos');
    await expect(page.locator('#tab-compromisos')).toBeVisible();
  });

  test('doble toque abre un resumen de solo lectura, sin botón de Eliminar suelto', async ({ page }) => {
    const tarjeta = page.locator('.prestamo-card', { hasText: 'Carro' });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.locator('.btn-borrar')).toHaveCount(0);

    await tarjeta.dblclick();
    await expect(page.locator('#modal-resumen-prestamo')).toBeVisible();
    await expect(page.locator('#resumen-prestamo-titulo')).toHaveText('Carro');
    await expect(page.locator('#resumen-prestamo-cuerpo')).toContainText('20.000.000');
    await expect(page.locator('#resumen-prestamo-cuerpo')).toContainText('Tasa fija');
    // Sin botones de acción -- solo la ✕ de cerrar.
    await expect(page.locator('#modal-resumen-prestamo button')).toHaveCount(1);
  });

  test('mantener presionada abre Eliminar (sin Editar, esa acción no existe para un préstamo)', async ({ page }) => {
    const tarjeta = page.locator('.prestamo-card', { hasText: 'Carro' });
    const box = await tarjeta.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await expect(page.locator('#btn-editar-borrar-editar')).toBeHidden();
    await expect(page.locator('#btn-editar-borrar-eliminar')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.locator('#btn-editar-borrar-eliminar').click();
    await expect(page.locator('.prestamo-card')).toHaveCount(0);
  });

  test('"Registrar pago" sigue funcionando y no dispara el doble toque de la tarjeta', async ({ page }) => {
    const tarjeta = page.locator('.prestamo-card', { hasText: 'Carro' });
    await tarjeta.locator('.btn-prest-pago').click();

    await expect(page.locator('#modal-pago-rapido')).toBeVisible();
    await expect(page.locator('#pago-concepto-display')).toContainText('Carro');
    // Un solo toque en el botón no debe abrir el resumen de la tarjeta de atrás.
    await expect(page.locator('#modal-resumen-prestamo')).toBeHidden();
  });

  test('"Nuevo préstamo" (hoja) crea el préstamo con monto formateado y lo muestra en la lista', async ({ page }) => {
    await usarAccionVista(page, 'btn-nuevo-prestamo');
    await expect(page.locator('#modal-prestamo')).toBeVisible();

    // Sin completar nombre y monto no deja guardar.
    let aviso = null;
    page.once('dialog', (d) => { aviso = d.message(); d.accept(); });
    await page.locator('#btn-guardar-prestamo').click();
    await expect.poll(() => aviso).toContain('Completa nombre, monto y fecha de inicio');
    await expect(page.locator('#modal-prestamo')).toBeVisible();

    await page.locator('#prest-nombre').fill('Moto');
    await page.locator('#prest-monto').fill('5000000');
    await expect(page.locator('#prest-monto')).toHaveValue('5.000.000');   // separador de miles
    await page.locator('#prest-cuotas').fill('12');
    await page.locator('#btn-guardar-prestamo').click();

    await expect(page.locator('#modal-prestamo')).toBeHidden();
    await expect(page.locator('.prestamo-card', { hasText: 'Moto' })).toBeVisible();
  });

  test('"Registrar pago" (hoja) guarda el movimiento del pago en la caja elegida', async ({ page }) => {
    await page.locator('.prestamo-card', { hasText: 'Carro' }).locator('.btn-prest-pago').click();
    await expect(page.locator('#modal-pago-rapido')).toBeVisible();

    let aviso = null;
    page.once('dialog', (d) => { aviso = d.message(); d.accept(); });
    await page.locator('#btn-guardar-pago').click();
    await expect.poll(() => aviso).toContain('Completa monto, fecha y caja');

    await page.locator('#pago-monto').fill('300000');
    await page.locator('#pago-caja').selectOption('Efectivo');
    await page.locator('#pago-desc').fill('Cuota 1');
    await page.locator('#btn-guardar-pago').click();
    await expect(page.locator('#modal-pago-rapido')).toBeHidden({ timeout: 10000 });

    const movs = await page.evaluate(() => Sheets.getMovimientos());
    const pago = movs.find(m => m.concepto === 'Prestamo Carro');
    expect(pago).toBeDefined();
    expect(pago.caja).toBe('Efectivo');
    expect(Math.abs(pago.monto)).toBe(300000);
    expect(pago.descripcion).toBe('Cuota 1');
  });
});

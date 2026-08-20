// Préstamos nunca había tenido cobertura de tests -- se agrega junto con
// el paso 3 del criterio único de gestos: doble toque abre un resumen de
// solo lectura, mantener presionada abre Eliminar (no existe "Editar"
// para un préstamo, nunca la hubo -- solo crear/borrar/registrar pago).
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Préstamos', () => {
  test.beforeEach(async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await mockGoogleApis(page, {
      Prestamo: [['P1', 'Carro', 20000000, 24, hoy, 'false', 'Tasa fija']],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    // Compromisos (Préstamos + Lista de compras) solo se llega desde el
    // menú ⋯, no está en la barra de pestañas principal.
    await page.locator('#btn-menu, #btn-bottom-menu').first().click();
    await page.locator('[data-tab-nav="compromisos"]').click();
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
});

// Compras nunca había tenido cobertura de tests -- se agrega junto con el
// paso 3 del criterio único de gestos (ver ARQUITECTURA.txt / el plan de
// la conversación): doble toque abre un resumen de solo lectura, mantener
// presionada abre Eliminar (no existe "Editar" para una compra, nunca la
// hubo -- solo se puede crear o borrar).
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Compras', () => {
  test.beforeEach(async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await mockGoogleApis(page, {
      Compras: [['CP1', hoy, 'prueba@example.com', 'Auriculares Sony', 'Tecnología', 300000, 'Alta']],
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
    const tarjeta = page.locator('.compra-item', { hasText: 'Auriculares Sony' });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.locator('.btn-borrar')).toHaveCount(0);

    await tarjeta.dblclick();
    await expect(page.locator('#modal-resumen-compra')).toBeVisible();
    await expect(page.locator('#resumen-compra-titulo')).toHaveText('Auriculares Sony');
    await expect(page.locator('#resumen-compra-cuerpo')).toContainText('Alta');
    await expect(page.locator('#resumen-compra-cuerpo')).toContainText('300.000');
    // Sin botones de acción -- solo la ✕ de cerrar.
    await expect(page.locator('#modal-resumen-compra button')).toHaveCount(1);
  });

  test('mantener presionada abre Eliminar (sin Editar, esa acción no existe para una compra)', async ({ page }) => {
    const tarjeta = page.locator('.compra-item', { hasText: 'Auriculares Sony' });
    // Sobre el nombre, no el centro de toda la tarjeta -- el centro puede
    // caer sobre "Comprar ahora" (bug real: ahí el botón corta el gesto).
    const box = await tarjeta.locator('.compra-concepto').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await expect(page.locator('#btn-editar-borrar-editar')).toBeHidden();
    await expect(page.locator('#btn-editar-borrar-eliminar')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.locator('#btn-editar-borrar-eliminar').click();
    await expect(page.locator('.compra-item')).toHaveCount(0);
  });

  test('"Comprar ahora" sigue funcionando y no dispara el doble toque de la tarjeta', async ({ page }) => {
    const tarjeta = page.locator('.compra-item', { hasText: 'Auriculares Sony' });
    await tarjeta.locator('.btn-comprar').click();

    await expect(page.locator('#modal-movimiento')).toBeVisible();
    await expect(page.locator('#modal-movimiento .modal-title')).toContainText('Comprar: Auriculares Sony');
    // Un solo toque en el botón no debe abrir el resumen de la tarjeta de atrás.
    await expect(page.locator('#modal-resumen-compra')).toBeHidden();
  });
});

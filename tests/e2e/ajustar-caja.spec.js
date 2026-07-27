// Cuando una caja queda con saldo negativo ("⚠️ Requiere ajuste"), su
// detalle debe ofrecer un botón "Ajustar" que crea un movimiento de Ingreso
// por la diferencia exacta, dejando el saldo en $0 sin tener que armar el
// movimiento a mano.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Ajustar caja', () => {
  test('nivela una caja con saldo negativo a $0 y quita el aviso de "Requiere ajuste"', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      // Un solo gasto, sin ingresos → saldo negativo (-100000).
      'Movimiento de Caja': [
        ['M1', hoy, 'prueba@example.com', 'Renta', 'Gasto fijo', 'Efectivo', 100000, '', ''],
      ],
    });

    await page.goto('/');
    await esperarAppLista(page);

    // La tarjeta muestra el aviso de que requiere ajuste.
    const tarjeta = page.locator('.caja-card', { hasText: 'Efectivo' });
    await expect(tarjeta.locator('.caja-alerta-ajuste')).toBeVisible();

    // Abre el detalle y confirma el saldo negativo + el botón Ajustar.
    await tarjeta.click();
    await expect(page.locator('#modal-detalle-caja')).toBeVisible();
    await expect(page.locator('#detalle-caja-resumen')).toContainText('Saldo: -$ 100.000');
    const btnAjustar = page.locator('.btn-ajustar');
    await expect(btnAjustar).toBeVisible();

    await btnAjustar.click();

    // El modal se cierra y, tras recargar, la caja ya no requiere ajuste.
    await expect(page.locator('#modal-detalle-caja')).toBeHidden({ timeout: 10000 });
    await expect(tarjeta.locator('.caja-alerta-ajuste')).toBeHidden();

    // Reabrir el detalle debe mostrar el saldo ya en $0 y sin botón Ajustar.
    await tarjeta.click();
    await expect(page.locator('#detalle-caja-resumen')).toContainText('Saldo: $ 0');
    await expect(page.locator('.btn-ajustar')).toBeHidden();

    // El movimiento de ajuste quedó registrado con la descripción esperada.
    await expect(page.locator('#detalle-caja-body')).toContainText('Ajuste');
  });
});

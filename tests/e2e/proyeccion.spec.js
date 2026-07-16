const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Proyección', () => {
  test('los movimientos sin concepto conocido se agrupan en UNA sola fila "Otros"', async ({ page }) => {
    // Regresión: antes, si "Otros" ya tenía su propio estimado configurado
    // ese mes Y además había otros movimientos con concepto desconocido,
    // aparecían DOS filas separadas llamadas "Otros" en vez de una sola.
    const mesActual = new Date().toISOString().slice(0, 7);
    const hoy = new Date().toISOString().slice(0, 10);

    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [
        ['M1', hoy, 'prueba@example.com', 'Otros', 'Gasto variable', 'Efectivo', '20000', 'algo suelto', ''],
        ['M2', hoy, 'prueba@example.com', 'Concepto Desconocido', 'Gasto variable', 'Efectivo', '15000', '', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.addInitScript((mes) => {
      localStorage.setItem('gastos_por_mes', JSON.stringify({ [mes]: { Otros: 50000 } }));
    }, mesActual);

    await page.goto('/index.html');
    await esperarAppLista(page);
    await page.locator('.nav-item[data-tab="proyeccion"]:visible').first().click();
    await expect(page.locator('#tab-proyeccion')).toBeVisible();

    const filasOtros = page.locator('#proy-tabla-body .proy-concepto-nombre', { hasText: 'Otros' });
    await expect(filasOtros).toHaveCount(1);
  });

  test('agregar un concepto nuevo lo muestra en la tabla y evita duplicados', async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await page.locator('.nav-item[data-tab="proyeccion"]:visible').first().click();
    await expect(page.locator('#tab-proyeccion')).toBeVisible();

    await page.locator('#btn-agregar-concepto').click();
    await expect(page.locator('#modal-nuevo-concepto')).toBeVisible();

    await page.locator('#nuevo-concepto-nombre').fill('Gimnasio');
    await page.locator('#nuevo-concepto-cat-group .cat-btn[data-value="Gasto variable"]').click();
    await page.locator('#nuevo-concepto-monto').fill('80000');
    await page.locator('#btn-guardar-nuevo-concepto').click();

    await expect(page.locator('#modal-nuevo-concepto')).toBeHidden();
    await expect(page.locator('#proy-tabla-body')).toContainText('Gimnasio');

    // Intentar agregarlo de nuevo debe avisar que ya existe, no duplicarlo.
    await page.locator('#btn-agregar-concepto').click();
    await page.locator('#nuevo-concepto-nombre').fill('Gimnasio');
    await expect(page.locator('#nuevo-concepto-duplicado')).toBeVisible();
  });
});

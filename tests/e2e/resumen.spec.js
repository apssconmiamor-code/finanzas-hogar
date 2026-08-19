// Pestaña Resumen: "Salud del mes" y la tabla de Cronología mensual.
// Cronología se cierra sola (verificarYGuardarCronologia en app.js) para
// cualquier mes anterior al actual que tenga movimientos y todavía no
// tenga fila -- estos tests seedean movimientos de "el mes pasado" para
// que ese cierre pase de verdad al abrir la app, y verifican los 5 datos
// pedidos (ingreso total, gasto fijo, gasto variable, asertividad
// mensual, balance de cierre) más los 6 bloques de "Salud del mes".
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

async function abrirResumen(page) {
  const btnMenu = page.locator('#btn-menu, #btn-bottom-menu').first();
  await btnMenu.click();
  await page.locator('[data-tab-nav="resumen"]').click();
  await expect(page.locator('#tab-resumen')).toBeVisible();
}

test.describe('Resumen: Salud del mes y Cronología', () => {
  test('cierra solo el mes pasado y muestra ingreso/gasto fijo/gasto variable/asertividad/balance en Cronología y en Salud del mes', async ({ page }) => {
    const hoy = new Date();
    const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 10);
    const fechaMesPasado = mesPasado.toISOString().slice(0, 10);

    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [
        ['M1', fechaMesPasado, 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', 2000000, '', ''],
        ['M2', fechaMesPasado, 'prueba@example.com', 'Alquiler', 'Gasto fijo', 'Efectivo', 800000, '', ''],
        ['M3', fechaMesPasado, 'prueba@example.com', 'Mercado', 'Gasto variable', 'Efectivo', 300000, '', ''],
      ],
      Presupuesto: [
        ['Gasto fijo', 'Alquiler', 800000, 0, ''],
        ['Gasto variable', 'Mercado', 250000, 0, ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);

    // El cierre de Cronología corre solo al cargar la app -- se espera a
    // que la fila deje de decir "Cargando" en vez de fijar un timeout.
    await abrirResumen(page);
    await expect(page.locator('#cronologia-wrap table')).toBeVisible({ timeout: 10000 });

    const fila = page.locator('#cronologia-wrap tbody tr').first();
    await expect(fila).toContainText('2.000.000'); // ingreso total
    await expect(fila).toContainText('800.000');   // gasto fijo
    await expect(fila).toContainText('300.000');   // gasto variable
    await expect(fila).toContainText('105%');      // asertividad mensual: 1.100.000/1.050.000
    await expect(fila).toContainText('900.000');   // balance de cierre: 2.000.000 - 1.100.000

    // "Salud del mes" toma esos mismos datos del mes ya cerrado -- no
    // depende de qué mes esté eligiendo el selector de arriba.
    await expect(page.locator('#kpi-asertividad-val')).toHaveText('105%');
    await expect(page.locator('#kpi-balance-neto-val')).toContainText('900.000');
    await expect(page.locator('#kpi-gasto-fijo-val')).toContainText('800.000');
    await expect(page.locator('#kpi-gasto-var-val')).toContainText('300.000');
    // Mercado se pasó del presupuesto (300.000 vs 250.000 estimados) -- es
    // el único desvío positivo, así que es "el mayor".
    await expect(page.locator('#kpi-desvio-val')).toHaveText('Mercado');
    await expect(page.locator('#kpi-desvio-meta')).toContainText('50.000');
    // Sin préstamos seedeados, el pago del mes cerrado es 0.
    await expect(page.locator('#kpi-pago-prestamo-val')).toContainText('0');

    // La tendencia de ahorro se quitó -- no debe quedar rastro en la pestaña.
    await expect(page.locator('#tab-resumen')).not.toContainText('Tendencia');
  });
});

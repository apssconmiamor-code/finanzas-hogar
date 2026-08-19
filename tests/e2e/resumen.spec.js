// Pestaña Resumen: "Salud del mes" y la tabla de Cronología mensual.
// Cronología se cierra sola (verificarYGuardarCronologia en app.js) para
// cualquier mes anterior al actual que tenga movimientos y todavía no
// tenga fila completa -- estos tests seedean movimientos de "el mes
// pasado" para que ese cierre pase de verdad al abrir la app, y verifican
// los 5 datos pedidos (ingreso total, gasto fijo, gasto variable,
// asertividad mensual, balance de cierre -- saldo acumulado de las cajas
// COP hasta el cierre de ese mes, no el neto del mes solo) más los 6
// bloques de "Salud del mes".
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
    // Balance de cierre = saldo acumulado de la caja hasta fin de ese mes.
    // Como no hay movimientos antes ni saldo archivado, acá coincide con
    // el neto del mes (2.000.000 - 1.100.000), pero es un cálculo distinto
    // (ver el segundo test: si hubiera movimientos de un mes posterior no
    // deberían sumarse acá).
    await expect(fila).toContainText('900.000');

    // "Salud del mes" toma esos mismos datos del mes ya cerrado -- no
    // depende de qué mes esté eligiendo el selector de arriba. El título
    // del bloque muestra el nombre de ese mes.
    const nombreMesPasado = mesPasado.toLocaleDateString('es-CO', { month: 'long' });
    const nombreMesPasadoCap = nombreMesPasado[0].toUpperCase() + nombreMesPasado.slice(1);
    await expect(page.locator('#salud-mes-titulo')).toContainText(nombreMesPasadoCap);
    // Siempre 2 columnas, ni importa el ancho de pantalla (bug real
    // reportado: en algunos celulares se veía apilado en 1 sola columna).
    await expect(page.locator('#salud-mes-titulo + .kpi-grid')).toHaveClass(/kpi-grid-2col/);

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

  test('pone al día una fila vieja de Cronología (de antes de ingresoTotal/balanceCierre) en vez de dejarla en 0 para siempre', async ({ page }) => {
    const hoy = new Date();
    const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 10);
    const fechaMesPasado = mesPasado.toISOString().slice(0, 10);
    const mesPasadoStr = fechaMesPasado.slice(0, 7);

    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [
        ['M1', fechaMesPasado, 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', 2000000, '', ''],
        ['M2', fechaMesPasado, 'prueba@example.com', 'Alquiler', 'Gasto fijo', 'Efectivo', 800000, '', ''],
      ],
      Presupuesto: [
        ['Gasto fijo', 'Alquiler', 800000, 0, ''],
      ],
      // Fila "vieja": solo tiene las 6 columnas de antes de este cambio --
      // sin ingresoTotal/asertividadMensual/balanceCierre/etc. (columnas
      // G en adelante vacías, ni siquiera "0").
      Cronologia: [['CR1', mesPasadoStr, 0, 0, 0, 0]],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirResumen(page);
    await expect(page.locator('#cronologia-wrap table')).toBeVisible({ timeout: 10000 });

    // Se actualizó la MISMA fila (mismo id, no se duplicó el mes) con los
    // datos reales -- no se quedó en 0 para siempre.
    const cronologia = await page.evaluate(() => Sheets.getCronologia());
    expect(cronologia).toHaveLength(1);
    expect(cronologia[0].id).toBe('CR1');
    expect(cronologia[0].ingresoTotal).toBe(2000000);
    expect(cronologia[0].gastoFijo).toBe(800000);
    expect(cronologia[0].completa).toBe(true);

    await expect(page.locator('#kpi-asertividad-val')).not.toHaveText('0%');
  });

  test('con montos grandes, "Salud del mes" y Cronología no fuerzan scroll horizontal de la página (bug real: se salía del ancho en celulares angostos)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    const hoy = new Date();
    const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 10);
    const fechaMesPasado = mesPasado.toISOString().slice(0, 10);

    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [
        ['M1', fechaMesPasado, 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', 123456789, '', ''],
        ['M2', fechaMesPasado, 'prueba@example.com', 'Alquiler', 'Gasto fijo', 'Efectivo', 45678900, '', ''],
        ['M3', fechaMesPasado, 'prueba@example.com', 'Mercado', 'Gasto variable', 'Efectivo', 12345000, '', ''],
      ],
      Presupuesto: [
        ['Gasto fijo', 'Alquiler', 45678900, 0, ''],
        ['Gasto variable', 'Mercado', 5000000, 0, ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirResumen(page);
    await expect(page.locator('#cronologia-wrap table')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#kpi-balance-neto-val')).toContainText('65.432.889');

    // El body ya recorta cualquier desborde de página (overflow-x:hidden),
    // así que un monto largo sin espacios donde cortar no se ve como
    // scroll horizontal -- se ve como la tarjeta cortada/tapada en el
    // borde derecho. Por eso se mide el borde de cada tarjeta contra el
    // ancho real de la pantalla, no el scrollWidth del documento.
    const algunaTarjetaSeSale = await page.evaluate(() => {
      const anchoPantalla = window.innerWidth;
      return Array.from(document.querySelectorAll('.kpi-card')).some(
        (card) => card.getBoundingClientRect().right > anchoPantalla + 1
      );
    });
    expect(algunaTarjetaSeSale).toBe(false);
  });

  test('un mes duplicado en Cronología (dos filas, distinto ingreso) se limpia solo y queda una sola fila', async ({ page }) => {
    // Simula el bug real reportado: el mismo mes con dos filas en la hoja
    // (pudo pasar con una versión vieja que agregaba en vez de actualizar).
    // Sin movimientos vivos para ese mes -- ya archivados, como sería en la
    // realidad para un mes tan viejo -- así que la limpieza tiene que
    // funcionar sin depender de volver a calcular nada.
    const hoy = new Date();
    const mesViejo = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 10);
    const mesViejoStr = mesViejo.toISOString().slice(0, 7);

    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      Cronologia: [
        ['CR1000000000000', mesViejoStr, 0, 800000, 0, 300000, 2000000, 105, 900000, 0, '', 0],
        ['CR2000000000000', mesViejoStr, 0, 800000, 0, 300000, 5000000, 110, 950000, 0, '', 0],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirResumen(page);
    await expect(page.locator('#cronologia-wrap table')).toBeVisible({ timeout: 10000 });

    const cronologia = await page.evaluate(() => Sheets.getCronologia());
    const filasDeEseMes = cronologia.filter(c => c.mes === mesViejoStr);
    expect(filasDeEseMes).toHaveLength(1);
    // Se quedó con la más reciente (id más nuevo) de las dos.
    expect(filasDeEseMes[0].id).toBe('CR2000000000000');
    expect(filasDeEseMes[0].ingresoTotal).toBe(5000000);

    // Y la tabla solo la muestra una vez.
    const nombreMes = mesViejo.toLocaleDateString('es-CO', { month: 'long' });
    const nombreMesCap = nombreMes[0].toUpperCase() + nombreMes.slice(1);
    await expect(page.locator('#cronologia-wrap tbody tr', { hasText: nombreMesCap })).toHaveCount(1);
  });
});

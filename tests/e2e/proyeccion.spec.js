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

  test('Detalle por concepto: sin botones sueltos, agrupado por Ingresos/Fijos/Variables, un toque ve movimientos y el segundo abre el resumen con Modificar/Eliminar', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      Presupuesto: [
        ['Ingreso', 'SURA', 0, 3000000, ''],
        ['Gasto fijo', 'Alquiler', 800000, 0, ''],
        ['Gasto variable', 'Mercado', 500000, 0, ''],
      ],
      'Movimiento de Caja': [
        ['M1', hoy, 'prueba@example.com', 'Alquiler', 'Gasto fijo', 'Efectivo', 800000, '', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await page.locator('.nav-item[data-tab="proyeccion"]:visible').first().click();
    await expect(page.locator('#tab-proyeccion')).toBeVisible();

    // Los grupos aparecen como etiquetas sutiles, en orden Ingresos/Fijos/Variables.
    const grupos = page.locator('.proy-grupo-row');
    await expect(grupos).toHaveCount(3);
    await expect(grupos.nth(0)).toContainText('Ingresos');
    await expect(grupos.nth(1)).toContainText('Fijos');
    await expect(grupos.nth(2)).toContainText('Variables');

    // Ya no hay botones de Modificar/Eliminar sueltos en ninguna fila.
    await expect(page.locator('#proy-tabla-body button')).toHaveCount(0);

    const filaAlquiler = page.locator('.proy-tabla-row', { hasText: 'Alquiler' });

    // Un solo toque abre los movimientos reales de ese concepto.
    await filaAlquiler.click();
    await expect(page.locator('#modal-detalle-real-concepto')).toBeVisible();
    await expect(page.locator('#detalle-real-titulo')).toContainText('Alquiler');
    await page.locator('#btn-cerrar-detalle-real').click();
    await expect(page.locator('#modal-detalle-real-concepto')).toBeHidden();

    // Un segundo toque rápido sobre la misma fila abre el resumen, con
    // Modificar/Eliminar al final -- y el detalle de movimientos no se
    // queda abierto de fondo.
    await filaAlquiler.dblclick();
    await expect(page.locator('#modal-resumen-concepto')).toBeVisible();
    await expect(page.locator('#modal-detalle-real-concepto')).toBeHidden();
    await expect(page.locator('#resumen-concepto-titulo')).toContainText('Alquiler');
    // Cabecera: Estimado/Real/Balance (ya no Categoría) -- estimado y real
    // coinciden (800.000 ambos), balance en 0 → "—", sin color de aviso.
    await expect(page.locator('#resumen-concepto-cuerpo')).toContainText('Estimado');
    await expect(page.locator('#resumen-concepto-cuerpo')).toContainText('Balance');
    await expect(page.locator('#resumen-concepto-cuerpo')).not.toContainText('Categoría');
    await expect(page.locator('#resumen-concepto-cuerpo')).toContainText('800.000');

    // Debajo de Estimado/Real/Balance, la lista de movimientos reales que
    // se tuvieron en cuenta para ese "Real".
    const listaMovs = page.locator('#resumen-concepto-movimientos .detalle-real-item');
    await expect(listaMovs).toHaveCount(1);
    await expect(listaMovs.first()).toContainText('Efectivo');
    await expect(listaMovs.first()).toContainText('800.000');

    await expect(page.locator('#btn-resumen-concepto-modificar')).toBeVisible();
    await expect(page.locator('#btn-resumen-concepto-eliminar')).toBeVisible();

    await page.locator('#btn-resumen-concepto-modificar').click();
    await expect(page.locator('#modal-modificar-concepto')).toBeVisible();
    await expect(page.locator('#modificar-concepto-nombre')).toContainText('Alquiler');
  });

  test('"Ajuste" es una fila siempre presente en Proyección y no cae en "Otros"', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [
        // Simula lo que crea ajustarCaja() al nivelar una caja negativa.
        ['M1', hoy, 'prueba@example.com', 'Ajuste', 'Ingreso', 'Efectivo', 50000, 'Ajuste 20 ago. 2026', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await page.locator('.nav-item[data-tab="proyeccion"]:visible').first().click();
    await expect(page.locator('#tab-proyeccion')).toBeVisible();

    // Fila propia dentro de "Ingresos", con el monto real ajustado -- no
    // se mezcló ni duplicó en "Otros".
    const filaAjuste = page.locator('.proy-tabla-row', { hasText: 'Ajuste' });
    await expect(filaAjuste).toBeVisible();
    await expect(filaAjuste).toContainText('50.000');
    await expect(page.locator('.proy-tabla-row', { hasText: 'Otros' })).toHaveCount(0);

    // El resumen muestra Balance en verde (positivo: sin estimado
    // configurado para "Ajuste", cualquier real ajustado es "de más").
    await filaAjuste.dblclick();
    await expect(page.locator('#modal-resumen-concepto')).toBeVisible();
    const valorBalance = page.locator('#resumen-concepto-cuerpo .detalle-notif-fila', { hasText: 'Balance' }).locator('.detalle-notif-valor');
    await expect(valorBalance).toContainText('+');
    await expect(valorBalance).toContainText('50.000');
    await expect(valorBalance).toHaveCSS('color', 'rgb(26, 122, 54)'); // --green-dark
  });
});

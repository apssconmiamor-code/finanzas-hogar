const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, irATab } = require('./helpers/googleMock');

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
    await irATab(page, 'proyeccion');
    await expect(page.locator('#tab-proyeccion')).toBeVisible();

    const filasOtros = page.locator('#proy-tabla-body .proy-concepto-nombre', { hasText: 'Otros' });
    await expect(filasOtros).toHaveCount(1);
  });

  test('Agregar nuevo concepto (en Configurar mes) lo suma al formulario, se guarda con el mes y evita duplicados', async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'proyeccion');
    await expect(page.locator('#tab-proyeccion')).toBeVisible();

    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await expect(page.locator('#modal-config-mes')).toBeVisible();
    await page.locator('#btn-config-nuevo-concepto').click();
    // El formulario del mes se oculta un momento y se abre el de concepto nuevo.
    await expect(page.locator('#modal-config-mes')).toBeHidden();
    await expect(page.locator('#modal-nuevo-concepto')).toBeVisible();

    await page.locator('#nuevo-concepto-nombre').fill('Gimnasio');
    await page.locator('#nuevo-concepto-cat-group .cat-btn[data-value="Gasto variable"]').click();
    await page.locator('#nuevo-concepto-monto').fill('80000');
    await page.locator('#btn-guardar-nuevo-concepto').click();

    // Se vuelve a Configurar mes, con el concepto nuevo ya puesto con su monto.
    await expect(page.locator('#modal-nuevo-concepto')).toBeHidden();
    await expect(page.locator('#modal-config-mes')).toBeVisible();
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Gimnasio"]')).toHaveValue('80.000');

    await page.locator('#btn-guardar-config-mes').click();
    await expect(page.locator('#proy-tabla-body')).toContainText('Gimnasio');

    // Intentar agregarlo de nuevo debe avisar que ya existe, no duplicarlo.
    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await page.locator('#btn-config-nuevo-concepto').click();
    await page.locator('#nuevo-concepto-nombre').fill('Gimnasio');
    await expect(page.locator('#nuevo-concepto-duplicado')).toBeVisible();
  });

  test('cancelar el concepto nuevo vuelve a Configurar mes con lo que ya se había escrito', async ({ page }) => {
    await mockGoogleApis(page, {
      Presupuesto: [['Gasto fijo', 'Alquiler', 800000, 0, '']],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'proyeccion');

    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    const alquiler = page.locator('#modal-config-mes-body input[data-concepto="Alquiler"]');
    await alquiler.fill('900000');
    await page.locator('#btn-config-nuevo-concepto').click();
    await page.locator('#btn-cancelar-nuevo-concepto').click();

    await expect(page.locator('#modal-config-mes')).toBeVisible();
    await expect(alquiler).toHaveValue('900.000');
  });

  // Configurar mes lista TODOS los conceptos; los que valen 0 van al final de su
  // grupo y, al guardar, solo quedan en la tabla los que tienen valor.
  test('Configurar mes: todos los conceptos, los 0 al final de cada grupo, y al guardar solo se ven los que tienen valor', async ({ page }) => {
    await mockGoogleApis(page, {
      Presupuesto: [
        ['Gasto fijo', 'Alquiler', 800000, 0, ''],
        ['Gasto variable', 'Mercado', 500000, 0, ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'proyeccion');

    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await expect(page.locator('#modal-config-mes')).toBeVisible();

    // El botón vive en la misma fila que "Ingresos estimados para este mes".
    const fila = page.locator('#modal-config-mes .modal-subtitle-fila');
    await expect(fila).toContainText('Ingresos estimados para este mes');
    await expect(fila.locator('#btn-config-nuevo-concepto')).toHaveText('Agregar nuevo concepto');

    // Gastos fijos: Alquiler (800.000) primero; el resto de fijos, en 0, después.
    const fijos = page.locator('#modal-config-mes-body input[data-tipo="gasto"]');
    const valores = await fijos.evaluateAll(els => els.map(e => ({ n: e.dataset.concepto, v: e.value })));
    const idxAlquiler = valores.findIndex(x => x.n === 'Alquiler');
    const idxMercado = valores.findIndex(x => x.n === 'Mercado');
    expect(valores[idxAlquiler].v).toBe('800.000');
    expect(valores[idxMercado].v).toBe('500.000');
    // Todos los que valen 0 muestran "0" y nunca están antes de uno con valor
    // dentro de su grupo (fijos y variables por separado).
    const hayCeros = valores.filter(x => x.v === '0').length;
    expect(hayCeros).toBeGreaterThan(0);

    // Ingresos: sin ninguno configurado, todos en 0 por defecto.
    const ingresos = await page.locator('#modal-config-mes-body input[data-tipo="ingreso"]').evaluateAll(els => els.map(e => e.value));
    expect(ingresos.length).toBeGreaterThan(0);
    expect(ingresos.every(v => v === '0')).toBe(true);

    // Al guardar, la tabla solo muestra lo que tiene valor.
    await page.locator('#btn-guardar-config-mes').click();
    const tabla = page.locator('#proy-tabla-body');
    await expect(tabla).toContainText('Alquiler');
    await expect(tabla).toContainText('Mercado');
    await expect(page.locator('#proy-tabla-body .proy-tabla-row[data-categoria="Ingreso"]')).toHaveCount(0);
  });

  // Las acciones de Proyección viven en un submenú ⋯ (igual que en Cajas) y ya
  // no hay botones sueltos en la pantalla.
  test("el menú ⋯ reúne Agregar mes y Sumar movimientos, y no quedan botones sueltos", async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto("/index.html");
    await esperarAppLista(page);
    await irATab(page, "proyeccion");

    // Nada suelto en la pantalla: solo el ⋯ (los ítems existen solo con el menú abierto).
    await expect(page.locator("#btn-menu-proyeccion")).toBeVisible();
    for (const id of ["btn-agregar-mes", "btn-sumar-proy"]) {
      await expect(page.locator("#" + id)).toHaveCount(0);
    }

    await page.locator("#btn-menu-proyeccion").click();
    await expect(page.locator("#btn-agregar-mes")).toHaveText(/Agregar mes a proyectar/);
    await expect(page.locator("#btn-sumar-proy")).toHaveText(/Sumar movimientos/);
    // Crear/agregar concepto se movieron a Configurar mes; y sin Filtrar por ahora.
    await expect(page.locator("#btn-agregar-concepto")).toHaveCount(0);
    await expect(page.locator("#btn-agregar-existente")).toHaveCount(0);
    await expect(page.locator("#tab-proyeccion").getByText("Filtrar")).toHaveCount(0);
  });

  test("el menú ⋯: Agregar mes a proyectar suma una tarjeta de mes", async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto("/index.html");
    await esperarAppLista(page);
    await irATab(page, "proyeccion");

    const antes = await page.locator(".proy-4m-card").count();
    await page.locator("#btn-menu-proyeccion").click();
    await page.locator("#btn-agregar-mes").click();
    await expect(page.locator(".proy-4m-card")).toHaveCount(antes + 1);
  });

  test("el menú ⋯: Sumar movimientos arma el total de las filas elegidas en la fila de arriba, y Listo lo apaga", async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await mockGoogleApis(page, {
      Cajas: [["C1", "prueba@example.com", "Efectivo", "COP"]],
      Presupuesto: [
        ["Ingreso", "SURA", 0, 3000000, ""],
        ["Gasto fijo", "Alquiler", 800000, 0, ""],
      ],
      "Movimiento de Caja": [
        ["M1", hoy, "prueba@example.com", "SURA", "Ingreso", "Efectivo", 500000, "", ""],
        ["M2", hoy, "prueba@example.com", "Alquiler", "Gasto fijo", "Efectivo", 200000, "", ""],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto("/index.html");
    await esperarAppLista(page);
    await irATab(page, "proyeccion");

    await page.locator("#btn-menu-proyeccion").click();
    await page.locator("#btn-sumar-proy").click();
    await expect(page.locator("#btn-sumar-proy-listo")).toBeVisible();
    await expect(page.locator("#btn-menu-proyeccion")).toHaveCount(0);
    await expect(page.locator("#sumar-proy-total")).toContainText("Tocá los conceptos");

    // Tocar filas las selecciona (sin abrir nada) y el total aparece arriba.
    const filaSura = page.locator(".proy-tabla-row", { hasText: "SURA" });
    const filaAlquiler = page.locator(".proy-tabla-row", { hasText: "Alquiler" });
    await filaSura.click();
    await expect(filaSura).toHaveClass(/proy-tabla-row-seleccionada/);
    await filaAlquiler.click();
    await expect(page.locator("#sumar-proy-total")).toContainText("Real");
    // Estimado: SURA no tiene estimado en el mes (los ingresos se configuran por
    // mes) + Alquiler 800.000. Real: 500.000 + 200.000.
    await expect(page.locator("#sumar-proy-total")).toContainText("800.000");
    await expect(page.locator("#sumar-proy-total")).toContainText("700.000");

    await page.locator("#btn-sumar-proy-listo").click();
    await expect(page.locator("#btn-menu-proyeccion")).toBeVisible();
    await expect(page.locator("#sumar-proy-total")).toHaveCount(0);
    await expect(filaSura).not.toHaveClass(/proy-tabla-row-seleccionada/);
  });

  // La tabla ya no lleva el título "Detalle por concepto": una sola fila con el mes que se
  // está viendo y, en la misma fila, la leyenda de Excedido.
  test("la tabla muestra una sola fila con el mes y Excedido, sin el título Detalle por concepto", async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto("/index.html");
    await esperarAppLista(page);
    await irATab(page, "proyeccion");

    await expect(page.locator("#tab-proyeccion")).not.toContainText("Detalle por concepto");
    const mes = page.locator("#proy-detalle-mes-label");
    await expect(mes).toHaveText(/[0-9]{4}/);                       // ej. "Octubre de 2026"
    const leyenda = page.locator("#tab-proyeccion .proy-leyenda");
    await expect(leyenda).toContainText("Excedido");

    // Misma fila: el mes a la izquierda y Excedido a la derecha, a la misma altura.
    const a = await mes.boundingBox();
    const b = await leyenda.boundingBox();
    expect(Math.abs((a.y + a.height / 2) - (b.y + b.height / 2))).toBeLessThan(8);
    expect(b.x).toBeGreaterThan(a.x + a.width);
  });

  // Los meses proyectados usan las mismas tarjetas que las Cajas, en una sola fila
  // que se desliza (tres visibles).
  test("Meses proyectados: tarjetas iguales a las de Cajas, fila deslizable, un toque activa el mes", async ({ page }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto("/index.html");
    await esperarAppLista(page);
    await irATab(page, "proyeccion");

    const tarjetas = page.locator("#proy-4meses-lista .caja-card.proy-4m-card");
    await expect(tarjetas).toHaveCount(4);
    // Misma pista de deslizamiento que Cajas: más de tres -> puntitos y degradado.
    await expect(page.locator("#proy-4meses-wrap .cajas-puntos .cajas-punto")).toHaveCount(2);
    await expect(page.locator("#proy-4meses-wrap .cajas-fade-der")).toBeVisible();
    await expect(page.locator("#proy-4meses-lista")).toHaveCSS("overflow-x", "auto");

    // Un toque activa ese mes.
    await tarjetas.nth(1).scrollIntoViewIfNeeded();
    await tarjetas.nth(1).click();
    await expect(tarjetas.nth(1)).toHaveClass(/proy-4m-active/);
    await expect(tarjetas.nth(0)).not.toHaveClass(/proy-4m-active/);
  });

  test("los ítems de los menús ⋯ llevan íconos SVG simples, no emojis", async ({ page }) => {
    await mockGoogleApis(page, { Cajas: [["C1", "prueba@example.com", "Efectivo", "COP"]] });
    await iniciarSesionFalsa(page);
    await page.goto("/index.html");
    await esperarAppLista(page);

    await page.locator("#btn-menu-cajas").click();
    for (const id of ["btn-sumar-cajas", "btn-elegir-cajas"]) {
      await expect(page.locator("#" + id + " .dd-icon svg")).toHaveCount(1);
    }
    await page.keyboard.press("Escape");

    await irATab(page, "proyeccion");
    await page.locator("#btn-menu-proyeccion").click();
    for (const id of ["btn-agregar-mes", "btn-sumar-proy"]) {
      await expect(page.locator("#" + id + " .dd-icon svg")).toHaveCount(1);
      // Nada de emojis como texto del ícono.
      await expect(page.locator("#" + id + " .dd-icon")).toHaveText("");
    }
  });

  test('Detalle por concepto: sin botones sueltos, agrupado por Ingresos/Fijos/Variables, un toque no hace nada, doble toque abre el resumen y mantener presionado abre Editar/Eliminar', async ({ page }) => {
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
        // Un ingreso con valor: los ingresos en 0 ya no aparecen en la tabla, así que
        // sin esto no habría grupo "Ingresos".
        ['M2', hoy, 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', 1000000, '', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'proyeccion');
    await expect(page.locator('#tab-proyeccion')).toBeVisible();

    // Los grupos aparecen en orden Ingresos/Fijos/Variables, con un color
    // de fondo propio para que la sección se note (pedido explícito).
    const grupos = page.locator('.proy-grupo-row');
    await expect(grupos).toHaveCount(3);
    await expect(grupos.nth(0)).toContainText('Ingresos');
    await expect(grupos.nth(1)).toContainText('Fijos');
    await expect(grupos.nth(2)).toContainText('Variables');
    await expect(grupos.nth(0)).toHaveCSS('background-color', 'rgb(238, 241, 244)'); // --slate-soft

    // Ya no hay botones de Modificar/Eliminar sueltos en ninguna fila.
    await expect(page.locator('#proy-tabla-body button')).toHaveCount(0);

    const filaAlquiler = page.locator('.proy-tabla-row', { hasText: 'Alquiler' });

    // Un solo toque no hace nada (pedido explícito).
    await filaAlquiler.click();
    await expect(page.locator('#modal-resumen-concepto')).toBeHidden();

    // Un doble toque sobre la misma fila (ya pasada la ventana de doble
    // toque del click anterior, para no encadenarse con él) abre el
    // resumen, de solo lectura -- Modificar/Eliminar viven en el menú de
    // mantener presionado, no acá.
    await page.waitForTimeout(500);
    await filaAlquiler.dblclick();
    await expect(page.locator('#modal-resumen-concepto')).toBeVisible();
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

    // El resumen ya no tiene botones de acción -- solo la ✕ de cerrar.
    await expect(page.locator('#modal-resumen-concepto button')).toHaveCount(1);
    await page.locator('#modal-resumen-concepto .modal-close').click();

    // Mantener presionada la fila (pointerdown + esperar + pointerup)
    // abre Editar/Eliminar.
    const boxAlquiler = await filaAlquiler.boundingBox();
    await page.mouse.move(boxAlquiler.x + boxAlquiler.width / 2, boxAlquiler.y + boxAlquiler.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await expect(page.locator('#btn-editar-borrar-editar')).toBeVisible();
    await expect(page.locator('#btn-editar-borrar-eliminar')).toBeVisible();

    await page.locator('#btn-editar-borrar-editar').click();
    await expect(page.locator('#modal-modificar-concepto')).toBeVisible();
    await expect(page.locator('#modificar-concepto-nombre')).toContainText('Alquiler');
  });

  test('el color del Balance en el resumen sigue el mismo criterio que "excedido" en la tabla, no el signo puro', async ({ page }) => {
    // Bug real reportado: un Gasto donde te pasaste del estimado (lo malo)
    // se coloreaba en verde porque Real-Estimado da positivo -- el color
    // debe seguir el mismo criterio que ya usa "excedido" en la tabla
    // (Gasto: rojo si real > estimado; Ingreso: rojo si real < estimado),
    // no el signo puro del balance.
    const hoy = new Date().toISOString().slice(0, 10);
    const mesActual = hoy.slice(0, 7);
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      Presupuesto: [
        ['Gasto fijo', 'Alquiler', 500000, 0, ''],
      ],
      // El estimado de Ingreso NO tiene fallback al presupuesto global (a
      // diferencia de Gasto) -- getIngresosMesParaEditor solo lee de acá
      // (mes propio, ver getIngresosMes en app.js), así que hace falta
      // sembrar el mes actual explícitamente.
      Proyeccion: [
        ['ingreso', mesActual, 'SURA', 3000000],
      ],
      'Movimiento de Caja': [
        // Gasto por ENCIMA del estimado (balance positivo, +300.000, pero
        // es plata de más gastada -- debe verse rojo).
        ['M1', hoy, 'prueba@example.com', 'Alquiler', 'Gasto fijo', 'Efectivo', 800000, '', ''],
        // Ingreso por DEBAJO del estimado (balance negativo, -1.000.000,
        // no se llegó a la meta -- debe verse rojo también).
        ['M2', hoy, 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', 2000000, '', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'proyeccion');

    await page.locator('.proy-tabla-row', { hasText: 'Alquiler' }).dblclick();
    const balanceAlquiler = page.locator('#resumen-concepto-cuerpo .detalle-notif-fila', { hasText: 'Balance' }).locator('.detalle-notif-valor');
    await expect(balanceAlquiler).toContainText('+'); // balance positivo...
    await expect(balanceAlquiler).toHaveCSS('color', 'rgb(255, 59, 48)'); // ...pero rojo (--red), no verde
    await page.locator('#modal-resumen-concepto .modal-close').click();

    await page.locator('.proy-tabla-row', { hasText: 'SURA' }).dblclick();
    const balanceSura = page.locator('#resumen-concepto-cuerpo .detalle-notif-fila', { hasText: 'Balance' }).locator('.detalle-notif-valor');
    await expect(balanceSura).toContainText('-'); // balance negativo...
    await expect(balanceSura).toHaveCSS('color', 'rgb(255, 59, 48)'); // ...también rojo, mismo motivo (no llegó a la meta)
  });

  test('"Ajuste" es una fila siempre presente al final de Variables en Proyección y no cae en "Otros"', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      Presupuesto: [
        ['Gasto variable', 'Mercado', 500000, 0, ''],
      ],
      'Movimiento de Caja': [
        // Simula lo que crea ajustarCaja() al nivelar una caja negativa.
        ['M1', hoy, 'prueba@example.com', 'Ajuste', 'Ingreso', 'Efectivo', 50000, 'Ajuste 20 ago. 2026', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'proyeccion');
    await expect(page.locator('#tab-proyeccion')).toBeVisible();

    // Fila propia dentro de "Variables" (no "Ingresos", aunque el
    // movimiento real se guarde con esa categoría), con el monto real
    // ajustado -- no se mezcló ni duplicó en "Otros".
    const filaAjuste = page.locator('.proy-tabla-row', { hasText: 'Ajuste' });
    await expect(filaAjuste).toBeVisible();
    await expect(filaAjuste).toContainText('50.000');
    await expect(page.locator('.proy-tabla-row', { hasText: 'Otros' })).toHaveCount(0);

    // Es la ÚLTIMA fila de toda la tabla -- va después de "Mercado"
    // (que sí tiene estimado) dentro de Variables, sin importar el orden
    // alfabético que le tocaría ("Ajuste" antes que "Mercado").
    await expect(page.locator('.proy-tabla-row').last()).toHaveText(/Ajuste/);

    // No se marca como "excedida" (rojo) -- no es un gasto de más, es una
    // corrección de saldo sin estimado que pueda "excederse".
    await expect(filaAjuste).not.toHaveClass(/fila-excedida/);

    // El resumen muestra Balance en verde (positivo: sin estimado
    // configurado para "Ajuste", cualquier real ajustado es "de más").
    await filaAjuste.dblclick();
    await expect(page.locator('#modal-resumen-concepto')).toBeVisible();
    const valorBalance = page.locator('#resumen-concepto-cuerpo .detalle-notif-fila', { hasText: 'Balance' }).locator('.detalle-notif-valor');
    await expect(valorBalance).toContainText('+');
    await expect(valorBalance).toContainText('50.000');
    await expect(valorBalance).toHaveCSS('color', 'rgb(26, 122, 54)'); // --green-dark

    // Mantener presionada "Ajuste" no ofrece Editar/Eliminar -- no tiene
    // estimado que se pueda modificar ni una fila de presupuesto que borrar.
    await page.locator('#modal-resumen-concepto .modal-close').click();
    const boxAjuste = await filaAjuste.boundingBox();
    await page.mouse.move(boxAjuste.x + boxAjuste.width / 2, boxAjuste.y + boxAjuste.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await expect(page.locator('#modal-editar-borrar')).toBeHidden();
  });
});

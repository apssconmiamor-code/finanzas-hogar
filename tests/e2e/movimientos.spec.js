const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, irATab, usarAccionVista } = require('./helpers/googleMock');
const { seleccionarCaja } = require('./helpers/uiHelpers');

test.describe('Movimientos', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page, {
      // Una caja ya existente, para no depender de crearla en cada test.
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'movimientos');
    await expect(page.locator('#tab-movimientos')).toBeVisible();
  });

  test('registrar un ingreso lo muestra en la lista', async ({ page }) => {
    await usarAccionVista(page, 'btn-nuevo-ingreso');
    await expect(page.locator('#modal-movimiento')).toBeVisible();

    await page.locator('#mov-concepto-ingreso').fill('SURA');
    await seleccionarCaja(page, 'mov-caja', 'Efectivo (COP)');
    await page.locator('#mov-monto').fill('500000');
    await page.locator('#btn-guardar-mov').click();

    await expect(page.locator('#modal-movimiento')).toBeHidden();
    await expect(page.locator('#movimientos-list')).toContainText('SURA');
    await expect(page.locator('#movimientos-list')).toContainText('500.000');
  });

  test('no deja guardar un movimiento sin monto', async ({ page }) => {
    await usarAccionVista(page, 'btn-nuevo-ingreso');
    await page.locator('#mov-concepto-ingreso').fill('SURA');

    let dialogo = null;
    page.once('dialog', async (d) => { dialogo = d.message(); await d.accept(); });
    await page.locator('#btn-guardar-mov').click();
    await page.waitForTimeout(200);

    expect(dialogo).toContain('Completa todos los campos obligatorios');
    await expect(page.locator('#modal-movimiento')).toBeVisible();
  });

  test('doble clic en un movimiento abre su resumen', async ({ page }) => {
    // Ingreso porque no valida saldo suficiente (a diferencia de un gasto,
    // que necesitaría fondos ya cargados en la caja de prueba).
    await usarAccionVista(page, 'btn-nuevo-ingreso');
    await page.locator('#mov-concepto-ingreso').fill('SURA');
    await seleccionarCaja(page, 'mov-caja', 'Efectivo (COP)');
    await page.locator('#mov-monto').fill('80000');
    await page.locator('#btn-guardar-mov').click();
    await expect(page.locator('#modal-movimiento')).toBeHidden();

    await page.locator('.mov-card', { hasText: 'SURA' }).dblclick();
    await expect(page.locator('#modal-resumen-movimiento')).toBeVisible();
    await expect(page.locator('#resumen-mov-titulo')).toContainText('SURA');
    await expect(page.locator('#resumen-mov-body')).toContainText('Ingreso');
    await expect(page.locator('#resumen-mov-body')).toContainText('80.000');
  });

  test('"Nuevo ingreso" preselecciona la categoría y oculta el selector', async ({ page }) => {
    await usarAccionVista(page, 'btn-nuevo-ingreso');
    await expect(page.locator('#modal-movimiento-titulo')).toHaveText('Nuevo ingreso');
    await expect(page.locator('#grupo-categoria')).toBeHidden();
    await expect(page.locator('#mov-categoria')).toHaveValue('Ingreso');
    await expect(page.locator('#wrap-concepto-ingreso')).toBeVisible();
  });

  test('"Nuevo gasto" no asume categoría -- solo deja elegir Fijo o Variable', async ({ page }) => {
    await usarAccionVista(page, 'btn-nuevo-gasto');
    await expect(page.locator('#modal-movimiento-titulo')).toHaveText('Nuevo gasto');
    await expect(page.locator('#grupo-categoria')).toBeVisible();
    await expect(page.locator('#mov-categoria')).toHaveValue('');
    await expect(page.locator('#cat-btn-group .cat-btn[data-value="Gasto fijo"]')).toBeVisible();
    await expect(page.locator('#cat-btn-group .cat-btn[data-value="Gasto variable"]')).toBeVisible();
    await expect(page.locator('#cat-btn-group .cat-btn[data-value="Ingreso"]')).toBeHidden();
    await expect(page.locator('#cat-btn-group .cat-btn[data-value="Transferencia"]')).toBeHidden();

    // Sin elegir Fijo/Variable, sigue faltando la categoría -- mismo error de siempre.
    let dialogo = null;
    page.once('dialog', async (d) => { dialogo = d.message(); await d.accept(); });
    await page.locator('#mov-monto').fill('10000');
    await page.locator('#btn-guardar-mov').click();
    await page.waitForTimeout(200);
    expect(dialogo).toContain('Completa todos los campos obligatorios');

    await page.locator('#cat-btn-group .cat-btn[data-value="Gasto variable"]').click();
    await expect(page.locator('#mov-categoria')).toHaveValue('Gasto variable');
    await expect(page.locator('#wrap-concepto-variable')).toBeVisible();
  });

  test('"Nueva transferencia" preselecciona la categoría y va directo al bloque origen/destino', async ({ page }) => {
    await usarAccionVista(page, 'btn-nueva-transferencia');
    await expect(page.locator('#modal-movimiento-titulo')).toHaveText('Nueva transferencia');
    await expect(page.locator('#grupo-categoria')).toBeHidden();
    await expect(page.locator('#mov-categoria')).toHaveValue('Transferencia');
    await expect(page.locator('#row-transferencia')).toBeVisible();
    await expect(page.locator('#grupo-concepto')).toBeHidden();
  });

  test('en Transferencia, el panel de Origen/Destino se despliega al ancho completo del modal, no de su columna angosta', async ({ page }) => {
    await mockGoogleApis(page, {
      Cajas: [
        ['C1', 'prueba@example.com', 'Efectivo', 'COP'],
        ['C2', 'prueba@example.com', 'Ahorros', 'COP'],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'movimientos');

    await usarAccionVista(page, 'btn-nueva-transferencia');
    const toggleOrigen = page.locator('#mov-caja-origen + .caja-picker .caja-picker-toggle');
    await toggleOrigen.click();

    const panel = page.locator('#mov-caja-origen + .caja-picker .caja-picker-panel');
    await expect(panel).toBeVisible();

    const anchoPanel = await panel.evaluate(el => el.getBoundingClientRect().width);
    const anchoCard  = await page.locator('#modal-movimiento .hoja').evaluate(el => el.getBoundingClientRect().width);
    const anchoColumna = await page.locator('#mov-caja-origen').evaluate(el => el.getBoundingClientRect().width);

    // El panel debe acercarse al ancho de la tarjeta del modal (menos el
    // padding interno), no quedarse angosto como la columna del <select>.
    expect(anchoPanel).toBeGreaterThan(anchoColumna * 1.5);
    expect(anchoPanel).toBeGreaterThan(anchoCard * 0.8);
  });

  test('en Ingreso/Gasto la caja solo muestra las que este usuario puede manejar; en Transferencia se ven todas', async ({ page }) => {
    await mockGoogleApis(page, {
      Cajas: [
        // Sin nada en la columna F (usuarios_permitidos) -- visible para todos.
        ['C1', 'prueba@example.com', 'Efectivo', 'COP'],
        // Restringida a otro email -- prueba@example.com no debe verla en Ingreso/Gasto.
        ['C2', 'prueba@example.com', 'Nequi de otra persona', 'COP', 0, 'otra.persona@example.com'],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'movimientos');

    await usarAccionVista(page, 'btn-nuevo-ingreso');
    let opciones = await page.locator('#mov-caja option').allTextContents();
    expect(opciones.some(t => t.includes('Efectivo'))).toBe(true);
    expect(opciones.some(t => t.includes('Nequi de otra persona'))).toBe(false);
    await page.locator('#btn-cancelar-mov').click();

    await usarAccionVista(page, 'btn-nueva-transferencia');
    const opcionesOrigen  = await page.locator('#mov-caja-origen option').allTextContents();
    const opcionesDestino = await page.locator('#mov-caja-destino option').allTextContents();
    expect(opcionesOrigen.some(t => t.includes('Nequi de otra persona'))).toBe(true);
    expect(opcionesDestino.some(t => t.includes('Nequi de otra persona'))).toBe(true);
  });

  test('editar un movimiento vuelve a mostrar el selector de categoría completo', async ({ page }) => {
    // "Nuevo gasto" deja el selector recortado (Ingreso/Transferencia
    // ocultos) -- se cancela sin guardar y se registra un ingreso aparte,
    // para comprobar que ese recorte no queda pegado al editar después
    // cualquier movimiento (independiente de si el gasto llegó a guardarse).
    await usarAccionVista(page, 'btn-nuevo-gasto');
    await expect(page.locator('#cat-btn-group .cat-btn[data-value="Ingreso"]')).toBeHidden();
    await page.locator('#btn-cancelar-mov').click();

    await usarAccionVista(page, 'btn-nuevo-ingreso');
    await page.locator('#mov-concepto-ingreso').fill('SURA');
    await seleccionarCaja(page, 'mov-caja', 'Efectivo (COP)');
    await page.locator('#mov-monto').fill('50000');
    await page.locator('#btn-guardar-mov').click();
    await expect(page.locator('#modal-movimiento')).toBeHidden();

    // Editar ya no vive en el resumen del doble toque -- lo abre mantener
    // presionada la tarjeta (pointerdown + esperar + pointerup).
    const tarjetaSura = page.locator('.mov-card', { hasText: 'SURA' });
    const box = await tarjetaSura.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await page.locator('#btn-editar-borrar-editar').click();

    await expect(page.locator('#modal-movimiento-titulo')).toHaveText('Editar movimiento');
    await expect(page.locator('#grupo-categoria')).toBeVisible();
    await expect(page.locator('#cat-btn-group .cat-btn[data-value="Gasto fijo"]')).toBeVisible();
    await expect(page.locator('#cat-btn-group .cat-btn[data-value="Transferencia"]')).toBeVisible();
    await expect(page.locator('#cat-btn-group .cat-btn[data-value="Ingreso"]')).toHaveClass(/active/);
  });
});

test.describe('Movimientos — formulario (hoja)', () => {
  async function abrir(page, cajas, movs) {
    await mockGoogleApis(page, { Cajas: cajas, ...(movs ? { 'Movimiento de Caja': movs } : {}) });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'movimientos');
  }
  const hoy = () => new Date().toISOString().slice(0, 10);

  test('el monto se formatea con puntos de miles y calcula expresiones ("4000+5000" = 9.000)', async ({ page }) => {
    await abrir(page, [['C1', 'prueba@example.com', 'Efectivo', 'COP']]);
    await usarAccionVista(page, 'btn-nuevo-ingreso');
    await page.locator('#mov-monto').fill('1500000');
    await expect(page.locator('#mov-monto')).toHaveValue('1.500.000');
    await page.locator('#mov-monto').fill('4000+5000');
    await expect(page.locator('#mov-monto-calc')).toHaveText('= 9.000');
    await page.locator('#mov-monto').blur();
    await expect(page.locator('#mov-monto')).toHaveValue('9.000');
  });

  test('un gasto con monto mayor al saldo de la caja avisa y no se guarda', async ({ page }) => {
    await abrir(page, [['C1', 'prueba@example.com', 'Efectivo', 'COP']], [
      ['M1', hoy(), 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', 100000, '', ''],
    ]);
    await usarAccionVista(page, 'btn-nuevo-gasto');
    await page.locator('#cat-btn-group .cat-btn[data-value="Gasto variable"]').click();
    await page.locator('#mov-concepto-variable').fill('Mercado');
    await seleccionarCaja(page, 'mov-caja', 'Efectivo (COP)');
    await expect(page.locator('#mov-saldo-disponible')).toContainText('100.000');
    await page.locator('#mov-monto').fill('250000');
    await expect(page.locator('#mov-fondos-warn')).toContainText('Fondos insuficientes');

    let dialogo = null;
    page.once('dialog', async (d) => { dialogo = d.message(); await d.accept(); });
    await page.locator('#btn-guardar-mov').click();
    await expect.poll(() => dialogo).toContain('Fondos insuficientes en "Efectivo"');
    await expect(page.locator('#modal-movimiento')).toBeVisible();
  });

  test('un gasto variable con un concepto escrito a mano se guarda como "Otros" con el texto en la descripción', async ({ page }) => {
    await abrir(page, [['C1', 'prueba@example.com', 'Efectivo', 'COP']], [
      ['M1', hoy(), 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', 500000, '', ''],
    ]);
    await usarAccionVista(page, 'btn-nuevo-gasto');
    await page.locator('#cat-btn-group .cat-btn[data-value="Gasto variable"]').click();
    await page.locator('#mov-concepto-variable').fill('Regalo para Juli');
    await seleccionarCaja(page, 'mov-caja', 'Efectivo (COP)');
    await page.locator('#mov-monto').fill('30000');
    await page.locator('#btn-guardar-mov').click();
    await expect(page.locator('#modal-movimiento')).toBeHidden();

    const movs = await page.evaluate(() => Sheets.getMovimientos());
    const gasto = movs.find(m => m.categoria === 'Gasto variable');
    expect(gasto.concepto).toBe('Otros');
    expect(gasto.descripcion).toBe('Regalo para Juli');
  });

  test('las opciones de concepto se despliegan con ▾ y elegir una llena el campo', async ({ page }) => {
    await abrir(page, [['C1', 'prueba@example.com', 'Efectivo', 'COP']]);
    await usarAccionVista(page, 'btn-nuevo-gasto');
    await page.locator('#cat-btn-group .cat-btn[data-value="Gasto fijo"]').click();
    await expect(page.locator('#panel-concepto-fijo')).toBeHidden();
    await page.locator('#wrap-concepto-fijo .btn-desplegar-concepto').click();
    await expect(page.locator('#panel-concepto-fijo')).toBeVisible();
    await page.locator('#panel-concepto-fijo .caja-picker-option', { hasText: 'Alquiler' }).click();
    await expect(page.locator('#mov-concepto-fijo')).toHaveValue('Alquiler');
    await expect(page.locator('#panel-concepto-fijo')).toBeHidden();
  });

  test('una transferencia entre monedas distintas pide el tipo de cambio y guarda las dos patas', async ({ page }) => {
    await abrir(page, [
      ['C1', 'prueba@example.com', 'Efectivo', 'COP'],
      ['C2', 'prueba@example.com', 'Dólares', 'USD'],
    ], [
      ['M1', hoy(), 'prueba@example.com', 'Ahorro', 'Ingreso', 'Dólares', 1000, '', ''],
    ]);
    await usarAccionVista(page, 'btn-nueva-transferencia');
    await expect(page.locator('#row-tipo-cambio')).toHaveCount(0);

    await seleccionarCaja(page, 'mov-caja-origen', 'Dólares (USD)');
    await seleccionarCaja(page, 'mov-caja-destino', 'Efectivo (COP)');
    await expect(page.locator('#row-tipo-cambio')).toBeVisible();
    await page.locator('#mov-monto-transferencia').fill('100');

    let aviso = null;
    page.once('dialog', async (d) => { aviso = d.message(); await d.accept(); });
    await page.locator('#btn-guardar-mov').click();
    await expect.poll(() => aviso).toContain('monedas diferentes');
    await expect(page.locator('#modal-movimiento')).toBeVisible();

    await page.locator('#mov-tipo-cambio').fill('4000');
    await expect(page.locator('#tc-preview')).toContainText('Se acreditarán');
    await page.locator('#btn-guardar-mov').click();
    await expect(page.locator('#modal-movimiento')).toBeHidden();

    const movs = await page.evaluate(() => Sheets.getMovimientos());
    const salida = movs.find(m => m.categoria === 'Transferencia' && m.caja === 'Dólares');
    const entrada = movs.find(m => m.categoria === 'Transferencia' && m.caja === 'Efectivo');
    expect(Math.abs(salida.monto)).toBe(100);
    expect(Math.abs(entrada.monto)).toBe(400000);
  });

  test('editar un movimiento cambia su monto y su descripción', async ({ page }) => {
    await abrir(page, [['C1', 'prueba@example.com', 'Efectivo', 'COP']]);
    await usarAccionVista(page, 'btn-nuevo-ingreso');
    await page.locator('#mov-concepto-ingreso').fill('SURA');
    await seleccionarCaja(page, 'mov-caja', 'Efectivo (COP)');
    await page.locator('#mov-monto').fill('50000');
    await page.locator('#btn-guardar-mov').click();
    await expect(page.locator('#modal-movimiento')).toBeHidden();

    await page.evaluate(() => abrirEditarMovimiento(movimientos.find(m => m.concepto === 'SURA').id));
    await expect(page.locator('#modal-movimiento-titulo')).toHaveText('Editar movimiento');
    await expect(page.locator('#mov-concepto-ingreso')).toHaveValue('SURA');
    await expect(page.locator('#mov-monto')).toHaveValue('50.000');
    await expect(page.locator('#btn-guardar-mov')).toHaveText('Actualizar');
    await page.locator('#mov-monto').fill('75000');
    await page.locator('#mov-descripcion').fill('Quincena corregida');
    await page.locator('#btn-guardar-mov').click();
    await expect(page.locator('#modal-movimiento')).toBeHidden();

    const movs = await page.evaluate(() => Sheets.getMovimientos());
    const m = movs.find(x => x.concepto === 'SURA');
    expect(m.monto).toBe(75000);
    expect(m.descripcion).toBe('Quincena corregida');
  });
});

test.describe('Movimientos — filtro de subcategoría', () => {
  test.beforeEach(async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [
        ['M1', hoy, 'prueba@example.com', 'Alquiler', 'Gasto fijo', 'Efectivo', 500000, '', ''],
        ['M2', hoy, 'prueba@example.com', 'Internet', 'Gasto fijo', 'Efectivo', 80000, '', ''],
        ['M3', hoy, 'prueba@example.com', 'Mercado', 'Gasto variable', 'Efectivo', 120000, '', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await irATab(page, 'movimientos');
    await expect(page.locator('#tab-movimientos')).toBeVisible();
  });

  test('la subcategoría depende de la categoría elegida', async ({ page }) => {
    const subSel = page.locator('#filtro-subcategoria');

    // Sin categoría elegida: aparecen conceptos de todas las categorías.
    await expect(subSel.locator('option[value="Alquiler"]')).toHaveCount(1);
    await expect(subSel.locator('option[value="Mercado"]')).toHaveCount(1);

    // Gasto fijo: solo sus propios conceptos.
    await page.locator('#filtro-concepto').selectOption('Gasto fijo');
    await expect(subSel.locator('option[value="Alquiler"]')).toHaveCount(1);
    await expect(subSel.locator('option[value="Internet"]')).toHaveCount(1);
    await expect(subSel.locator('option[value="Mercado"]')).toHaveCount(0);

    // Elegir la subcategoría filtra la lista de movimientos.
    await subSel.selectOption('Alquiler');
    await expect(page.locator('#movimientos-list')).toContainText('Alquiler');
    await expect(page.locator('#movimientos-list')).not.toContainText('Internet');
  });

  test('la tarjeta no tiene botones sueltos -- doble toque abre un resumen de solo lectura, sin Editar/Borrar', async ({ page }) => {
    const tarjeta = page.locator('.mov-card', { hasText: 'Alquiler' });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta.locator('button')).toHaveCount(0);

    await tarjeta.dblclick();
    await expect(page.locator('#modal-resumen-movimiento')).toBeVisible();
    await expect(page.locator('#modal-resumen-movimiento button')).toHaveCount(1); // solo la ✕ de cerrar
  });

  test('mantener presionada una tarjeta abre Editar/Eliminar', async ({ page }) => {
    const tarjeta = page.locator('.mov-card', { hasText: 'Alquiler' });
    const box = await tarjeta.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await expect(page.locator('#modal-resumen-movimiento')).toBeHidden(); // no abrió el resumen de paso

    await page.locator('#btn-editar-borrar-editar').click();
    await expect(page.locator('#modal-editar-borrar')).toBeHidden();
    await expect(page.locator('#modal-movimiento')).toBeVisible();
    await expect(page.locator('#mov-monto')).toHaveValue('500.000');
  });

  test('borrar desde el menú de mantener presionado quita el movimiento de la lista', async ({ page }) => {
    const tarjeta = page.locator('.mov-card', { hasText: 'Mercado' });
    const box = await tarjeta.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await expect(page.locator('#modal-editar-borrar')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.locator('#btn-editar-borrar-eliminar').click();

    await expect(page.locator('#movimientos-list')).not.toContainText('Mercado');
  });
});

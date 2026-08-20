const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');
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
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();
    await expect(page.locator('#tab-movimientos')).toBeVisible();
  });

  test('registrar un ingreso lo muestra en la lista', async ({ page }) => {
    await page.locator('#btn-nuevo-ingreso').click();
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
    await page.locator('#btn-nuevo-ingreso').click();
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
    await page.locator('#btn-nuevo-ingreso').click();
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
    await page.locator('#btn-nuevo-ingreso').click();
    await expect(page.locator('#modal-movimiento-titulo')).toHaveText('Nuevo ingreso');
    await expect(page.locator('#grupo-categoria')).toBeHidden();
    await expect(page.locator('#mov-categoria')).toHaveValue('Ingreso');
    await expect(page.locator('#wrap-concepto-ingreso')).toBeVisible();
  });

  test('"Nuevo gasto" no asume categoría -- solo deja elegir Fijo o Variable', async ({ page }) => {
    await page.locator('#btn-nuevo-gasto').click();
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
    await page.locator('#btn-nueva-transferencia').click();
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
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();

    await page.locator('#btn-nueva-transferencia').click();
    const toggleOrigen = page.locator('#mov-caja-origen + .caja-picker .caja-picker-toggle');
    await toggleOrigen.click();

    const panel = page.locator('#mov-caja-origen + .caja-picker .caja-picker-panel');
    await expect(panel).toBeVisible();

    const anchoPanel = await panel.evaluate(el => el.getBoundingClientRect().width);
    const anchoCard  = await page.locator('#modal-movimiento .modal-card').evaluate(el => el.getBoundingClientRect().width);
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
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();

    await page.locator('#btn-nuevo-ingreso').click();
    let opciones = await page.locator('#mov-caja option').allTextContents();
    expect(opciones.some(t => t.includes('Efectivo'))).toBe(true);
    expect(opciones.some(t => t.includes('Nequi de otra persona'))).toBe(false);
    await page.locator('#btn-cancelar-mov').click();

    await page.locator('#btn-nueva-transferencia').click();
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
    await page.locator('#btn-nuevo-gasto').click();
    await expect(page.locator('#cat-btn-group .cat-btn[data-value="Ingreso"]')).toBeHidden();
    await page.locator('#btn-cancelar-mov').click();

    await page.locator('#btn-nuevo-ingreso').click();
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
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();
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

// El botón flotante abre un menú de pantalla completa con las "acciones
// rápidas" que el usuario haya configurado (sin límite de cantidad) + un
// tile fijo "Agregar" + la opción de siempre "Recordatorio". Una acción
// rápida guarda categoría+concepto+una o más cajas (chips de selección
// múltiple, pedido explícito); usarla solo pide el monto -- y, si tiene
// más de una caja configurada, primero cuál de esas usar. Mantener
// presionada una acción ya configurada la abre para reconfigurarla.
// Se guardan del lado del servidor (Sheets, hoja ConfigUsuario) por email,
// así que cargan igual en cualquier dispositivo donde ese usuario inicie
// sesión.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

const FOTO_FALSA = { name: 'recibo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };

// Chips de selección múltiple (checkbox) en vez del <select> de antes --
// ver poblarCajasConfigAccion en recordatorios.js.
async function elegirCajaAccion(page, nombre) {
  await page.locator('#config-accion-cajas .accion-caja-chip', { hasText: nombre }).click();
}

test.describe('Acciones rápidas (botón flotante)', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
  });

  test('un toque sin arrastrar abre el menú vacío con Agregar + Recordatorio', async ({ page }) => {
    await page.locator('#fab-recordatorio').click();
    await expect(page.locator('#modal-menu-acciones')).toBeVisible();

    await expect(page.locator('.accion-rapida-card[data-slot]')).toHaveCount(0);
    await expect(page.locator('#btn-agregar-accion')).toBeVisible();
    await expect(page.locator('#accion-recordatorio')).toBeVisible();
  });

  test('agregar una acción rápida desde "Agregar" y usarla registra el movimiento', async ({ page }) => {
    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();

    await expect(page.locator('#modal-config-accion')).toBeVisible();
    await expect(page.locator('#btn-borrar-accion')).toBeHidden();
    await page.locator('#config-accion-nombre').fill('Salario');
    await page.locator('#config-accion-icono').fill('💰');
    await page.locator('#config-accion-categoria').selectOption('Ingreso');
    await page.locator('#config-accion-concepto').selectOption('SURA');
    await elegirCajaAccion(page, 'Efectivo');
    await page.locator('#btn-guardar-config-accion').click();

    // Vuelve al menú y ya aparece como slot 0.
    await expect(page.locator('#modal-menu-acciones')).toBeVisible();
    const slot0 = page.locator('.accion-rapida-card[data-slot="0"]');
    await expect(slot0).toContainText('Salario');

    // Usarla: un toque corto solo pide el monto.
    await slot0.click();
    await expect(page.locator('#modal-usar-accion')).toBeVisible();
    await expect(page.locator('#usar-accion-titulo')).toContainText('Salario');
    await page.locator('#usar-accion-monto').fill('3000000');
    await page.locator('#btn-guardar-usar-accion').click();
    await expect(page.locator('#modal-usar-accion')).toBeHidden({ timeout: 10000 });

    // El movimiento quedó registrado.
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();
    await expect(page.locator('#movimientos-list')).toContainText('SURA');
    await expect(page.locator('#movimientos-list')).toContainText('3.000.000');
  });

  test('Transferencia rápida: cajas origen/destino fijas al configurar, usarla solo pide el monto', async ({ page }) => {
    await mockGoogleApis(page, {
      Cajas: [
        ['C1', 'prueba@example.com', 'Efectivo', 'COP'],
        ['C2', 'prueba@example.com', 'Ahorros', 'COP'],
      ],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);

    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Guardar en ahorros');
    await page.locator('#config-accion-icono').fill('🔁');
    await page.locator('#config-accion-categoria').selectOption('Transferencia');

    // El concepto y las cajas de gasto/ingreso se esconden; el par
    // origen/destino aparece en su lugar.
    await expect(page.locator('#config-accion-concepto-wrap')).toBeHidden();
    await expect(page.locator('#config-accion-cajas-wrap')).toBeHidden();
    await expect(page.locator('#config-accion-transferencia-wrap')).toBeVisible();
    await page.locator('#config-accion-caja-origen').selectOption('Efectivo');
    await page.locator('#config-accion-caja-destino').selectOption('Ahorros');
    await page.locator('#btn-guardar-config-accion').click();

    const slot0 = page.locator('.accion-rapida-card[data-slot="0"]');
    await expect(slot0).toContainText('Guardar en ahorros');

    // Usarla: origen/destino ya vienen fijos, no hay que elegir caja --
    // solo se ve la referencia y se pide el monto.
    await slot0.click();
    await expect(page.locator('#modal-usar-accion')).toBeVisible();
    await expect(page.locator('#usar-accion-caja-wrap')).toBeHidden();
    await expect(page.locator('#usar-accion-transferencia-info')).toBeVisible();
    await expect(page.locator('#usar-accion-transferencia-origen')).toHaveText('Efectivo');
    await expect(page.locator('#usar-accion-transferencia-destino')).toHaveText('Ahorros');
    await expect(page.locator('#usar-accion-tipo-cambio-wrap')).toBeHidden();
    await page.locator('#usar-accion-monto').fill('50000');
    await page.locator('#btn-guardar-usar-accion').click();
    await expect(page.locator('#modal-usar-accion')).toBeHidden({ timeout: 10000 });

    // Quedaron las dos patas de la transferencia, cada una en su caja.
    const movimientos = await page.evaluate(() => Sheets.getMovimientos());
    const salida  = movimientos.find(m => m.categoria === 'Transferencia' && m.caja === 'Efectivo');
    const entrada = movimientos.find(m => m.categoria === 'Transferencia' && m.caja === 'Ahorros');
    expect(salida).toBeDefined();
    expect(entrada).toBeDefined();
    expect(Math.abs(salida.monto)).toBe(50000);
    expect(Math.abs(entrada.monto)).toBe(50000);
  });

  test('Transferencia rápida entre cajas de distinta moneda pide el tipo de cambio', async ({ page }) => {
    await mockGoogleApis(page, {
      Cajas: [
        ['C1', 'prueba@example.com', 'Efectivo COP', 'COP'],
        ['C2', 'prueba@example.com', 'Cuenta USD', 'USD'],
      ],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);

    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Cambio de dólares');
    await page.locator('#config-accion-categoria').selectOption('Transferencia');
    await page.locator('#config-accion-caja-origen').selectOption('Cuenta USD');
    await page.locator('#config-accion-caja-destino').selectOption('Efectivo COP');
    await page.locator('#btn-guardar-config-accion').click();

    await page.locator('.accion-rapida-card[data-slot="0"]').click();
    await expect(page.locator('#usar-accion-tipo-cambio-wrap')).toBeVisible();
    await page.locator('#usar-accion-monto').fill('100');

    // Sin tipo de cambio no deja guardar.
    page.once('dialog', d => d.accept());
    await page.locator('#btn-guardar-usar-accion').click();
    await expect(page.locator('#modal-usar-accion')).toBeVisible();

    await page.locator('#usar-accion-tipo-cambio').fill('4000');
    await page.locator('#btn-guardar-usar-accion').click();
    await expect(page.locator('#modal-usar-accion')).toBeHidden({ timeout: 10000 });

    const movimientos = await page.evaluate(() => Sheets.getMovimientos());
    const entrada = movimientos.find(m => m.categoria === 'Transferencia' && m.caja === 'Efectivo COP');
    expect(entrada).toBeDefined();
    expect(Math.abs(entrada.monto)).toBe(400000); // 100 USD * 4000
  });

  test('se pueden agregar más de 3 acciones rápidas', async ({ page }) => {
    const nombres = ['Salario', 'Mercado', 'Salud', 'Transporte'];
    await page.locator('#fab-recordatorio').click();
    for (const nombre of nombres) {
      // El menú ya queda abierto tras guardar cada una -- no hace falta
      // volver a tocar el botón flotante entre acciones.
      await page.locator('#btn-agregar-accion').click();
      await page.locator('#config-accion-nombre').fill(nombre);
      await page.locator('#config-accion-categoria').selectOption('Gasto variable');
      await page.locator('#config-accion-concepto').selectOption('Mercado');
      await elegirCajaAccion(page, 'Efectivo');
      await page.locator('#btn-guardar-config-accion').click();
      await expect(page.locator('#modal-menu-acciones')).toBeVisible();
    }

    await expect(page.locator('.accion-rapida-card[data-slot]')).toHaveCount(4);
    await expect(page.locator('#btn-agregar-accion')).toBeVisible();
    for (const nombre of nombres) {
      await expect(page.locator('.acciones-rapidas-grid')).toContainText(nombre);
    }

    // "Agregar" siempre al final, después de las acciones configuradas Y
    // después de "Recordatorio" -- no se corre de lugar a medida que se
    // agregan más acciones.
    const ultimaTarjeta = page.locator('.acciones-rapidas-grid > *').last();
    await expect(ultimaTarjeta).toHaveId('btn-agregar-accion');
  });

  test('acción configurada con "Pedir foto con cámara" muestra el botón de cámara al usarla y sube la foto', async ({ page }) => {
    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();

    await page.locator('#config-accion-nombre').fill('Mercado');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Mercado');
    await elegirCajaAccion(page, 'Efectivo');
    await page.locator('#config-accion-camara').check();
    await page.locator('#btn-guardar-config-accion').click();

    // Otra acción SIN cámara para confirmar que el botón no aparece cuando no se pidió.
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Salud');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Salud');
    await elegirCajaAccion(page, 'Efectivo');
    await page.locator('#btn-guardar-config-accion').click();

    await page.locator('.accion-rapida-card[data-slot="1"]').click();
    await expect(page.locator('#usar-accion-camara-wrap')).toBeHidden();
    await page.locator('#btn-cancelar-usar-accion').click();

    // La acción con cámara sí muestra el botón, y la foto queda adjunta.
    await page.locator('#fab-recordatorio').click();
    const slot0 = page.locator('.accion-rapida-card[data-slot="0"]');
    await slot0.click();
    await expect(page.locator('#usar-accion-camara-wrap')).toBeVisible();
    await page.locator('#usar-accion-camara-file').setInputFiles(FOTO_FALSA);
    await expect(page.locator('#usar-accion-foto-preview .foto-thumb')).toHaveCount(1);

    await page.locator('#usar-accion-monto').fill('50000');
    await page.locator('#btn-guardar-usar-accion').click();
    await expect(page.locator('#modal-usar-accion')).toBeHidden({ timeout: 10000 });

    await expect.poll(async () => {
      const frescos = await page.evaluate(() => Sheets.getMovimientos());
      return frescos.find((m) => m.concepto === 'Mercado')?.recibo || '';
    }, { timeout: 10000 }).toContain('drive.google.com');
  });

  test('acción configurada con "Pedir descripción" muestra el campo al usarla y la guarda en el movimiento', async ({ page }) => {
    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();

    await page.locator('#config-accion-nombre').fill('Mercado');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Mercado');
    await elegirCajaAccion(page, 'Efectivo');
    await page.locator('#config-accion-descripcion').check();
    await page.locator('#btn-guardar-config-accion').click();

    // Otra acción SIN pedir descripción para confirmar que el campo no aparece cuando no se pidió.
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Salud');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Salud');
    await elegirCajaAccion(page, 'Efectivo');
    await page.locator('#btn-guardar-config-accion').click();

    await page.locator('.accion-rapida-card[data-slot="1"]').click();
    await expect(page.locator('#usar-accion-descripcion-wrap')).toBeHidden();
    await page.locator('#btn-cancelar-usar-accion').click();

    // La acción con "Pedir descripción" sí muestra el campo, y queda guardado en el movimiento.
    await page.locator('#fab-recordatorio').click();
    const slot0 = page.locator('.accion-rapida-card[data-slot="0"]');
    await slot0.click();
    await expect(page.locator('#usar-accion-descripcion-wrap')).toBeVisible();
    await page.locator('#usar-accion-descripcion').fill('Compra de la semana');
    await page.locator('#usar-accion-monto').fill('50000');
    await page.locator('#btn-guardar-usar-accion').click();
    await expect(page.locator('#modal-usar-accion')).toBeHidden({ timeout: 10000 });

    await expect.poll(async () => {
      const frescos = await page.evaluate(() => Sheets.getMovimientos());
      return frescos.find((m) => m.concepto === 'Mercado')?.descripcion || '';
    }, { timeout: 10000 }).toBe('Compra de la semana');
  });

  test('mantener presionada una acción ya configurada la abre para reconfigurar, y borrarla la quita del menú', async ({ page }) => {
    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Mercado');
    await page.locator('#config-accion-icono').fill('🛒');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Mercado');
    await elegirCajaAccion(page, 'Efectivo');
    await page.locator('#btn-guardar-config-accion').click();
    await expect(page.locator('#modal-menu-acciones')).toBeVisible();

    // Mantener presionado (pointerdown + esperar + pointerup) abre configurar,
    // no el formulario de "usar".
    const slot0 = page.locator('.accion-rapida-card[data-slot="0"]');
    const box = await slot0.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#modal-config-accion')).toBeVisible();
    await expect(page.locator('#modal-usar-accion')).toBeHidden();
    await expect(page.locator('#config-accion-nombre')).toHaveValue('Mercado');
    await expect(page.locator('#btn-borrar-accion')).toBeVisible();

    // Y desde ahí se puede borrar la configuración -- la tarjeta desaparece
    // por completo del menú (ya no queda un slot "vacío" en su lugar).
    await page.locator('#btn-borrar-accion').click();
    await expect(page.locator('#modal-menu-acciones')).toBeVisible();
    await expect(page.locator('.accion-rapida-card[data-slot]')).toHaveCount(0);
  });

  test('la tarjeta "Recordatorio" abre el flujo de siempre', async ({ page }) => {
    await page.locator('#fab-recordatorio').click();
    await page.locator('#accion-recordatorio').click();
    await expect(page.locator('#modal-menu-acciones')).toBeHidden();
    await expect(page.locator('#modal-recordatorio-crear')).toBeVisible();
  });

  test('al configurar una acción, la caja solo muestra las que este usuario puede manejar', async ({ page }) => {
    await mockGoogleApis(page, {
      Cajas: [
        // Sin nada en la columna F (usuarios_permitidos) -- visible para todos.
        ['C1', 'prueba@example.com', 'Efectivo', 'COP'],
        // Restringida a otro email -- prueba@example.com no debe verla.
        ['C2', 'prueba@example.com', 'Nequi de otra persona', 'COP', 0, 'otra.persona@example.com'],
        // Restringida, pero incluye a prueba@example.com -- sí debe verla.
        ['C3', 'prueba@example.com', 'Bancolombia compartida', 'COP', 0, 'otra.persona@example.com, prueba@example.com'],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);

    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();

    const chips = page.locator('#config-accion-cajas .accion-caja-chip');
    await expect(chips).toHaveCount(2); // solo las 2 visibles, no la restringida a otra persona
    const textos = await chips.allTextContents();
    expect(textos.some(t => t.includes('Efectivo'))).toBe(true);
    expect(textos.some(t => t.includes('Bancolombia compartida'))).toBe(true);
    expect(textos.some(t => t.includes('Nequi de otra persona'))).toBe(false);
  });

  test('una caja nueva llamada "Luni ..." o "Choco ..." se completa sola con quién puede manejarla', async ({ page }) => {
    await mockGoogleApis(page, {
      Cajas: [
        ['C1', 'royer.sanabria1685@gmail.com', 'Choco - Efectivo', 'COP'],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);

    await expect.poll(async () => {
      const cajas = await page.evaluate(() => Sheets.getCajas());
      return cajas.find(c => c.id === 'C1')?.usuariosPermitidos;
    }, { timeout: 10000 }).toEqual([
      'apssconmiamor@gmail.com', 'blanjor1685@gmail.com', 'byco85@gmail.com',
      'royer.sanabria1685@gmail.com', 'sabogaldario427@gmail.com'
    ]);
  });

  test('una acción rápida configurada en otro dispositivo carga igual acá (sincronizada por Sheets)', async ({ page }) => {
    // Simula que este usuario ya configuró una acción rápida desde otro
    // dispositivo: la hoja ConfigUsuario ya trae esa fila, pero ESTE
    // navegador nunca tuvo nada en su localStorage.
    const accionGuardada = [{ nombre: 'Mercado', icono: '🛒', categoria: 'Gasto variable', concepto: 'Mercado', caja: 'C1', camara: false }];
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      ConfigUsuario: [['CFG1', 'prueba@example.com', 'acciones_rapidas', JSON.stringify(accionGuardada)]],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);

    await page.locator('#fab-recordatorio').click();
    const slot0 = page.locator('.accion-rapida-card[data-slot="0"]');
    await expect(slot0).toContainText('Mercado');
  });

  test('la tarjeta de una acción rápida muestra el logo de su caja junto al ícono elegido', async ({ page }) => {
    await mockGoogleApis(page, {
      Cajas: [
        ['C1', 'prueba@example.com', 'Nequi', 'COP'],
        // Sin entidad/propósito conocido en el nombre -- sin logo.
        ['C2', 'prueba@example.com', 'Caja rara', 'COP'],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);

    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Recarga');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Mercado');
    await elegirCajaAccion(page, 'Nequi');
    await page.locator('#btn-guardar-config-accion').click();

    const slot0 = page.locator('.accion-rapida-card[data-slot="0"]');
    await expect(slot0.locator('.accion-rapida-caja-icono')).toHaveAttribute('src', 'nequi.png');

    // Otra acción en "Caja rara" (sin entidad/propósito conocido) -- sin logo.
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Varios');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Mercado');
    await elegirCajaAccion(page, 'Caja rara');
    await page.locator('#btn-guardar-config-accion').click();

    const slot1 = page.locator('.accion-rapida-card[data-slot="1"]');
    await expect(slot1.locator('.accion-rapida-caja-icono')).toHaveCount(0);
  });

  test('con más de una caja elegida, usar la acción pregunta con cuál -- y guarda el movimiento en la elegida', async ({ page }) => {
    await mockGoogleApis(page, {
      Cajas: [
        ['C1', 'prueba@example.com', 'Efectivo', 'COP'],
        ['C2', 'prueba@example.com', 'Nequi', 'COP'],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);

    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Café');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Mercado');
    await elegirCajaAccion(page, 'Efectivo');
    await elegirCajaAccion(page, 'Nequi');
    // Con dos cajas elegidas, no hay un logo único que mostrar en la tarjeta.
    await page.locator('#btn-guardar-config-accion').click();

    const slot0 = page.locator('.accion-rapida-card[data-slot="0"]');
    await expect(slot0.locator('.accion-rapida-caja-icono')).toHaveCount(0);

    await slot0.click();
    await expect(page.locator('#modal-usar-accion')).toBeVisible();
    await expect(page.locator('#usar-accion-caja-wrap')).toBeVisible();
    const opcionesCaja = page.locator('#usar-accion-caja-opciones .accion-caja-chip');
    await expect(opcionesCaja).toHaveCount(2);

    // Sin elegir caja, no deja guardar aunque ya haya un monto.
    await page.locator('#usar-accion-monto').fill('15000');
    await page.locator('#btn-guardar-usar-accion').click();
    await expect(page.locator('#modal-usar-accion')).toBeVisible();

    await opcionesCaja.filter({ hasText: 'Nequi' }).click();
    await page.locator('#btn-guardar-usar-accion').click();
    await expect(page.locator('#modal-usar-accion')).toBeHidden({ timeout: 10000 });

    // Se registró en Nequi -- se ve en el detalle de esa caja, no en Efectivo.
    await page.locator('.nav-item[data-tab="cajas"]:visible').first().click();
    await page.locator('.caja-card', { hasText: 'Nequi' }).dblclick();
    await expect(page.locator('#modal-detalle-caja')).toContainText('Mercado');
  });

  test('con una sola caja elegida, usar la acción no pregunta -- sigue como antes', async ({ page }) => {
    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Mercado');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Mercado');
    await elegirCajaAccion(page, 'Efectivo');
    await page.locator('#btn-guardar-config-accion').click();

    const slot0 = page.locator('.accion-rapida-card[data-slot="0"]');
    await slot0.click();
    await expect(page.locator('#modal-usar-accion')).toBeVisible();
    await expect(page.locator('#usar-accion-caja-wrap')).toBeHidden();
  });

  test('sin elegir ninguna caja, no deja guardar la configuración', async ({ page }) => {
    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Mercado');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Mercado');

    page.once('dialog', (d) => d.accept());
    await page.locator('#btn-guardar-config-accion').click();
    await expect(page.locator('#modal-config-accion')).toBeVisible();
  });
});

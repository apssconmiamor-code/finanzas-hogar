// El botón flotante abre un menú de pantalla completa con las "acciones
// rápidas" que el usuario haya configurado (sin límite de cantidad) + un
// tile fijo "Agregar" + la opción de siempre "Recordatorio". Una acción
// rápida guarda categoría+concepto+caja; usarla solo pide el monto.
// Mantener presionada una acción ya configurada la abre para reconfigurarla.
// Se guardan del lado del servidor (Sheets, hoja ConfigUsuario) por email,
// así que cargan igual en cualquier dispositivo donde ese usuario inicie
// sesión.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');
const { seleccionarCaja } = require('./helpers/uiHelpers');

const FOTO_FALSA = { name: 'recibo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };

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
    await seleccionarCaja(page, 'config-accion-caja', 'Efectivo (COP)');
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
      await seleccionarCaja(page, 'config-accion-caja', 'Efectivo (COP)');
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
    await seleccionarCaja(page, 'config-accion-caja', 'Efectivo (COP)');
    await page.locator('#config-accion-camara').check();
    await page.locator('#btn-guardar-config-accion').click();

    // Otra acción SIN cámara para confirmar que el botón no aparece cuando no se pidió.
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Salud');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Salud');
    await seleccionarCaja(page, 'config-accion-caja', 'Efectivo (COP)');
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

  test('mantener presionada una acción ya configurada la abre para reconfigurar, y borrarla la quita del menú', async ({ page }) => {
    await page.locator('#fab-recordatorio').click();
    await page.locator('#btn-agregar-accion').click();
    await page.locator('#config-accion-nombre').fill('Mercado');
    await page.locator('#config-accion-icono').fill('🛒');
    await page.locator('#config-accion-categoria').selectOption('Gasto variable');
    await page.locator('#config-accion-concepto').selectOption('Mercado');
    await seleccionarCaja(page, 'config-accion-caja', 'Efectivo (COP)');
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
});

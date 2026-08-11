// Pedido: poder adjuntar foto/audio sin conexión (en movimientos y en
// recordatorios) sin perderlas — que se guarden localmente y se suban solas
// a Drive al reconectar. De paso, corrige un bug real reportado: crear un
// recordatorio con foto/audio estando offline tiraba un error 503 sin
// manejar, porque a diferencia de movimientos/presupuesto,
// Sheets.agregarRecordatorio nunca había estado conectado al sistema de
// cola offline (sheets-offline.js / sync.js).
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');
const { seleccionarCaja } = require('./helpers/uiHelpers');

const FOTO_FALSA = { name: 'recibo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };

test.describe('Adjuntar foto/audio sin conexión', () => {
  test('un movimiento con foto adjunta sin conexión no pierde la foto — se sube sola al reconectar', async ({ page, context }) => {
    await mockGoogleApis(page, {
      Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();

    await page.locator('#btn-nuevo-movimiento').click();
    await page.locator('.cat-btn[data-value="Ingreso"]').first().click();
    await page.locator('#mov-concepto-ingreso').fill('SURA');
    await seleccionarCaja(page, 'mov-caja', 'Efectivo (COP)');
    await page.locator('#mov-monto').fill('500000');
    await page.locator('#recibo-file').setInputFiles(FOTO_FALSA);
    await expect(page.locator('#fotos-preview .foto-thumb')).toHaveCount(1);

    await context.setOffline(true);
    await page.locator('#btn-guardar-mov').click();

    await expect(page.locator('#modal-movimiento')).toBeHidden();
    await expect(page.locator('#movimientos-list')).toContainText('SURA');

    // Vuelve la conexión — sync.js reintenta solo (listener "online").
    await context.setOffline(false);

    await expect.poll(async () => {
      const frescos = await page.evaluate(() => Sheets.getMovimientos());
      return frescos.find((m) => m.concepto === 'SURA')?.recibo || '';
    }, { timeout: 10000 }).toContain('drive.google.com');
  });

  test('crear un recordatorio con foto sin conexión no tira error — se sube sola al reconectar', async ({ page, context }) => {
    await mockGoogleApis(page);
    await iniciarSesionFalsa(page);
    await page.goto('/index.html');
    await esperarAppLista(page);

    const erroresConsola = [];
    page.on('pageerror', (e) => erroresConsola.push(e.message));

    await page.evaluate(() => abrirModalCrearRecordatorio());
    await expect(page.locator('#modal-recordatorio-crear')).toBeVisible();

    await page.locator('#recordatorio-texto').fill('Comprar pan');
    await page.locator('#recordatorio-foto-file').setInputFiles(FOTO_FALSA);
    await expect(page.locator('#recordatorio-media-preview .foto-thumb')).toHaveCount(1);

    await context.setOffline(true);
    await page.locator('#btn-guardar-recordatorio-crear').click();

    await expect(page.locator('#modal-recordatorio-crear')).toBeHidden();
    expect(erroresConsola).toEqual([]);

    await context.setOffline(false);

    await expect.poll(async () => {
      const frescos = await page.evaluate(() => Sheets.getRecordatorios());
      return frescos.find((r) => r.texto === 'Comprar pan')?.imageUrl || '';
    }, { timeout: 10000 }).toContain('drive.google.com');
  });
});

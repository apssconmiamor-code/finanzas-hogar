// Automatiza (lo que se puede automatizar sin un iPhone físico) el checklist
// de diagnóstico de "abrir la app": tiempo hasta la pantalla de Face ID,
// que Face ID se dispare SOLO (sin tocar nada), y tiempo desde el login
// hasta que los datos reales están en pantalla.
//
// Lo que este test NO puede medir (requiere el dispositivo real):
// - El tiempo entre tocar el ícono en la pantalla de inicio y que iOS
//   termine de abrir el WKWebView de la PWA (eso es tiempo del SO, no de
//   la app — no corre JS nuestro todavía).
// - El prompt biométrico real de Face ID (Playwright no tiene sensor de
//   rostro; se simula con un WebAuthn stub que resuelve al instante).
// Estos dos son overhead constante del dispositivo/SO que no cambia con el
// código de la app, así que no aportan señal para "diagnosticar y corregir".

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Checklist de apertura — Face ID → datos visibles', () => {
  test('Face ID se dispara solo y los datos cargan sin pasos extra', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [['M1', hoy, 'prueba@example.com', 'Salario', 'Ingreso', 'Efectivo', 1000000, '', '']],
    });

    // Simula: credencial de Face ID ya registrada + plataforma disponible +
    // verificación instantánea y exitosa (sin sensor real). Reemplaza
    // faceid.js completo para no depender de WebAuthn real en el navegador
    // headless (que no tiene autenticador de plataforma).
    await page.route('**/faceid.js', route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.__faceidVerificarLlamado = false;
        const FaceAuth = {
          CRED_KEY: "faceid_cred_id_v2",
          soportado() { return true; },
          async disponiblePlataforma() { return true; },
          tieneCredencial() { return true; },
          borrarCredencial() {},
          async registrar() { return true; },
          async verificar() {
            window.__faceidVerificarLlamado = true;
            return true;
          }
        };
      `
    }));

    const t0 = Date.now();
    await page.goto('/');

    // Paso 1+2: la pantalla de Face ID debe aparecer y disparar la
    // verificación SOLA, sin que el test toque ningún botón.
    await page.waitForFunction(() => window.__faceidVerificarLlamado === true, { timeout: 10000 });
    const tFaceIdLlamado = Date.now() - t0;

    // Confirma que no se necesitó el botón de reintento (2+ pasos) — si
    // apareciera, significa que la llamada automática falló y tocó caer al
    // flujo manual.
    const btnRetryVisible = await page.locator('#btn-faceid-retry').isVisible().catch(() => false);

    // Paso 3: tras el login biométrico, los datos reales deben aparecer.
    await esperarAppLista(page);
    await page.waitForFunction(() => {
      const el = document.getElementById('conectando-bar');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    const tDatosListos = Date.now() - t0;

    await expect(page.locator('#cajas-grid')).toContainText('Efectivo');
    await expect(page.locator('#movimientos-list')).toContainText('Salario');

    const resultado = {
      'Paso 2 — Face ID se dispara solo (ms hasta la llamada)': tFaceIdLlamado,
      'Paso 2 — requirió botón de reintento (2+ toques)': btnRetryVisible,
      'Paso 3+4 — datos visibles tras login (ms totales)': tDatosListos,
    };
    console.log('[checklist]', JSON.stringify(resultado, null, 2));

    // Indicador Paso 2: debe dispararse solo, sin caer al botón manual.
    expect(btnRetryVisible).toBe(false);
    // Indicador Paso 3 (adaptado): en este entorno de prueba (latencia de
    // red simulada ~0ms), "cargar en <3s" debe cumplirse con margen amplio.
    expect(tDatosListos).toBeLessThan(5000);
  });
});

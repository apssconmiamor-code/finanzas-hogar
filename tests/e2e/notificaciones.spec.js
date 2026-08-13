// Módulo Notificaciones: recordatorios que avisan por Web Push aunque la
// app esté cerrada. El envío real lo hace el Cron Trigger del Worker (ver
// worker/src/push.test.mjs para la lógica de fechas) — acá se prueba lo
// que sí vive en el navegador: crear/cancelar/borrar, y que "Activar en
// este dispositivo" registre la suscripción en el Worker con los datos
// correctos. No se puede probar la entrega real de un push en un test
// headless (necesitaría un servicio de push real).
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

async function abrirNotificaciones(page) {
  const btnMenu = page.locator('#btn-menu, #btn-bottom-menu').first();
  await btnMenu.click();
  await page.locator('[data-tab-nav="notificaciones"]').click();
  await expect(page.locator('#tab-notificaciones')).toBeVisible();
}

// Simula soporte de Push completo: Notification.requestPermission(),
// navigator.serviceWorker.ready y pushManager.subscribe() — sin esto el
// navegador de pruebas headless no tiene un service worker real activo
// (los tests corren con serviceWorkers:'block', ver playwright.config.js).
async function mockPushManager(page) {
  await page.addInitScript(() => {
    window.Notification = window.Notification || {};
    Notification.permission = 'default';
    Notification.requestPermission = async () => { Notification.permission = 'granted'; return 'granted'; };

    const fakeSubscription = {
      endpoint: 'https://fcm.googleapis.com/fake/endpoint123',
      keys: { p256dh: 'FAKE_P256DH', auth: 'FAKE_AUTH' },
      toJSON() { return { endpoint: this.endpoint, keys: this.keys }; }
    };
    const fakeRegistration = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => fakeSubscription
      }
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve(fakeRegistration) },
      configurable: true
    });
    window.__pushManagerMockeado = true;
  });
}

test.describe('Notificaciones (Web Push)', () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesionFalsa(page);
  });

  test('crear una notificación nueva la muestra en la lista', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await page.locator('#btn-nueva-notificacion').click();
    await expect(page.locator('#modal-notificacion')).toBeVisible();

    await page.locator('#notif-texto').fill('Pagar arriendo');
    await page.locator('#notif-repetir-preset').selectOption('mes:1');
    await page.locator('#notif-destinatario').selectOption('familia');
    // No se toca la fecha (ya viene con un valor por defecto al abrir el modal).

    // No activar push ahora (queda "inactivo" en este dispositivo de prueba)
    // — debe poder guardar igual, solo con una confirmación.
    page.once('dialog', (d) => d.dismiss());
    await page.locator('#btn-guardar-notificacion').click();

    await expect(page.locator('#modal-notificacion')).toBeHidden();
    await expect(page.locator('.notificacion-item')).toContainText('Pagar arriendo');
    await expect(page.locator('.notificacion-item')).toContainText('Cada mes');
    await expect(page.locator('.notificacion-item')).toContainText('Familia');
  });

  test('repetición personalizada (cada N unidad, estilo Recordatorios de iPhone)', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await page.locator('#btn-nueva-notificacion').click();
    await page.locator('#notif-texto').fill('Regar las plantas');
    await page.locator('#notif-repetir-preset').selectOption('custom');
    await expect(page.locator('#notif-repetir-custom-row')).toBeVisible();
    await page.locator('#notif-repetir-intervalo').fill('3');
    await page.locator('#notif-repetir-unidad').selectOption('semana');

    page.once('dialog', (d) => d.dismiss());
    await page.locator('#btn-guardar-notificacion').click();

    await expect(page.locator('#modal-notificacion')).toBeHidden();
    await expect(page.locator('.notificacion-item')).toContainText('Regar las plantas');
    await expect(page.locator('.notificacion-item')).toContainText('Cada 3 semanas');
  });

  test('cancelar una notificación la mueve a "Canceladas"', async ({ page }) => {
    const enUnaHora = new Date(Date.now() + 3600000).toISOString();
    await mockGoogleApis(page, {
      Notificaciones: [['N1', 'Sacar la basura', '', 'unica', enUnaHora, '', 'yo', 'prueba@example.com', 'activa', '']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await expect(page.locator('.notificacion-item')).toContainText('Sacar la basura');

    page.once('dialog', (d) => d.accept());
    await page.locator('.notif-acciones .btn-secondary', { hasText: 'Cancelar' }).click();

    await expect(page.locator('.prestamos-seccion-title')).toContainText('Canceladas');
    await expect(page.locator('.notif-cancelada-badge')).toBeVisible();
  });

  test('borrar una notificación la quita de la lista', async ({ page }) => {
    const enUnaHora = new Date(Date.now() + 3600000).toISOString();
    await mockGoogleApis(page, {
      Notificaciones: [['N2', 'Revisar el correo', '', 'unica', enUnaHora, '', 'yo', 'prueba@example.com', 'activa', '']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await expect(page.locator('.notificacion-item')).toContainText('Revisar el correo');
    page.once('dialog', (d) => d.accept());
    await page.locator('.btn-borrar').click();

    await expect(page.locator('#notificaciones-list')).not.toContainText('Revisar el correo');
  });

  test('"Activar en este dispositivo" registra la suscripción en el Worker', async ({ page, browserName }) => {
    // El mock de navigator.serviceWorker/PushManager (necesario porque los
    // tests corren con serviceWorkers:'block', sin uno real activo) no es
    // confiable en el motor WebKit del proyecto "iphone" — el resto de la
    // suite ya corre en WebKit igual, esto es una limitación puntual del
    // mock, no de la lógica de la app (que sí queda cubierta en Chromium).
    test.skip(browserName === 'webkit', 'mock de PushManager poco confiable en WebKit headless');
    await mockGoogleApis(page);
    await mockPushManager(page);
    await page.addInitScript(() => {
      localStorage.setItem('worker_session', 'FAKE_SESSION_TOKEN');
    });

    let cuerpoRecibido = null;
    await page.route('**finanzas-hogar-token.byco85.workers.dev/push/subscribe', async (route) => {
      cuerpoRecibido = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, dispositivos: 1 } });
    });

    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await page.locator('#btn-activar-push').click();
    await expect.poll(() => cuerpoRecibido).not.toBeNull();

    expect(cuerpoRecibido.subscription.endpoint).toBe('https://fcm.googleapis.com/fake/endpoint123');
    expect(cuerpoRecibido.subscription.keys.p256dh).toBe('FAKE_P256DH');
  });

  test('si el dispositivo ya está activado, no muestra "Activar en este dispositivo"', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'mock de PushManager poco confiable en WebKit headless');
    await mockGoogleApis(page);
    // A diferencia de mockPushManager() de arriba, acá getSubscription()
    // devuelve una suscripción YA existente -- simula un dispositivo que ya
    // activó las notificaciones antes.
    await page.addInitScript(() => {
      // Notification.permission es un getter de solo lectura en el navegador
      // real -- una asignación directa (Notification.permission = 'granted')
      // no tiene efecto y se queda en el valor nativo por defecto.
      if (!window.Notification) window.Notification = function () {};
      Object.defineProperty(window.Notification, 'permission', { value: 'granted', configurable: true });
      const fakeSubscription = {
        endpoint: 'https://fcm.googleapis.com/fake/endpoint123',
        keys: { p256dh: 'FAKE_P256DH', auth: 'FAKE_AUTH' },
        toJSON() { return { endpoint: this.endpoint, keys: this.keys }; }
      };
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => fakeSubscription } }) },
        configurable: true
      });
    });

    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await expect(page.locator('#btn-activar-push')).toBeHidden();
  });
});

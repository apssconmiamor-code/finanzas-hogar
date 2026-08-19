// Módulo Notificaciones: recordatorios que avisan por Web Push aunque la
// app esté cerrada. El envío real lo hace el Cron Trigger del Worker (ver
// worker/src/push.test.mjs para la lógica de fechas) — acá se prueba lo
// que sí vive en el navegador: crear (solo se puede desde dentro de un
// bloque)/revisar/editar/borrar, la cuadrícula de bloques y agrupaciones
// (y su pantalla de detalle), y que "Activar en este dispositivo" registre
// la suscripción en el Worker con los datos correctos. No se puede probar
// la entrega real de un push en un test headless (necesitaría un servicio
// de push real).
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

async function abrirNotificaciones(page) {
  const btnMenu = page.locator('#btn-menu, #btn-bottom-menu').first();
  await btnMenu.click();
  await page.locator('[data-tab-nav="notificaciones"]').click();
  await expect(page.locator('#tab-notificaciones')).toBeVisible();
}

// La cuadrícula muestra tarjetas -- Activos/Pasados (agrupaciones, por
// estado) y Gastos fijos/Otros/los del usuario (bloques, por categoría);
// tocar una abre su pantalla de detalle con la lista de esas alertas.
async function abrirBloqueAlerta(page, nombre) {
  await page.locator('.alerta-bloque-card', { hasText: nombre }).click();
}

// Una alerta solo se puede crear DESDE un bloque (Gastos fijos/Otros/uno
// del usuario) -- no hay "+ Nueva" suelto en la pantalla principal.
async function nuevaAlertaEnBloque(page, nombreBloque) {
  await abrirBloqueAlerta(page, nombreBloque);
  await page.locator('#btn-nueva-notificacion-bloque').click();
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

  test('la cuadrícula trae fija Activos/Pasados/Gastos fijos/Otros, sin ningún bloque del usuario', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await expect(page.locator('.alerta-bloque-card', { hasText: 'Activos' })).toBeVisible();
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Pasados' })).toBeVisible();
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Gastos fijos' })).toBeVisible();
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Otros' })).toBeVisible();
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Agregar bloque' })).toBeVisible();
    await expect(page.locator('.alerta-bloque-card')).toHaveCount(5);
  });

  test('crear una notificación nueva sin bloque (desde "Otros") cae ahí', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await nuevaAlertaEnBloque(page, 'Otros');
    await expect(page.locator('#modal-notificacion')).toBeVisible();
    // Se crea DESDE el bloque -- el selector de bloque no se ve.
    await expect(page.locator('#notif-bloque-row')).toBeHidden();

    await page.locator('#notif-texto').fill('Pagar arriendo');
    await page.locator('#notif-repetir-preset').selectOption('mes:1');
    await page.locator('#notif-destinatario').selectOption('familia');
    // No se toca la fecha (ya viene con un valor por defecto al abrir el modal).

    // No activar push ahora (queda "inactivo" en este dispositivo de prueba)
    // — debe poder guardar igual, solo con una confirmación.
    page.once('dialog', (d) => d.dismiss());
    await page.locator('#btn-guardar-notificacion').click();
    await expect(page.locator('#modal-notificacion')).toBeHidden();

    // Sigue dentro de la pantalla de "Otros" -- no hace falta volver a entrar.
    await expect(page.locator('.notificacion-item')).toContainText('Pagar arriendo');
    await expect(page.locator('.notificacion-item')).toContainText('Cada mes');
    await expect(page.locator('.notificacion-item')).toContainText('Familia');
  });

  test('repetición personalizada (cada N unidad, estilo Recordatorios de iPhone)', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await nuevaAlertaEnBloque(page, 'Otros');
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

  test('"recordar de nuevo en X días" está disponible tanto para "No se repite" como para recurrentes', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await nuevaAlertaEnBloque(page, 'Otros');
    await expect(page.locator('#notif-recordar-row')).toBeVisible();

    await page.locator('#notif-texto').fill('Pagar la luz');
    await page.locator('#notif-recordar-dias').fill('3');

    // También sigue disponible al elegir una repetición (ej. mensual) --
    // una recurrente puede optar por "insistir" igual que una única.
    await page.locator('#notif-repetir-preset').selectOption('mes:1');
    await expect(page.locator('#notif-recordar-row')).toBeVisible();
    await expect(page.locator('#notif-recordar-dias')).toHaveValue('3');

    page.once('dialog', (d) => d.dismiss());
    await page.locator('#btn-guardar-notificacion').click();
    await expect(page.locator('#modal-notificacion')).toBeHidden();

    await expect(page.locator('.notificacion-item')).toContainText('Pagar la luz');
    await expect(page.locator('.notificacion-item')).toContainText('Insiste cada 3 días');
  });

  test('crear desde "Gastos fijos": no se ve el selector de bloque, y elegir un gasto fijo pre-llena texto/destinatario/repetición', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await nuevaAlertaEnBloque(page, 'Gastos fijos');
    await expect(page.locator('#notif-bloque-row')).toBeHidden();
    await expect(page.locator('#notif-gasto-fijo-row')).toBeVisible();

    await page.locator('#notif-gasto-fijo').selectOption('Alquiler');
    await expect(page.locator('#notif-texto')).toHaveValue('Pagar Alquiler');
    await expect(page.locator('#notif-destinatario')).toHaveValue('familia');
    await expect(page.locator('#notif-repetir-preset')).toHaveValue('mes:1');

    page.once('dialog', (d) => d.dismiss());
    await page.locator('#btn-guardar-notificacion').click();
    await expect(page.locator('#modal-notificacion')).toBeHidden();

    await expect(page.locator('.notificacion-item')).toContainText('Pagar Alquiler');
    await expect(page.locator('.notificacion-item')).toContainText('📌 Alquiler');
    // Bloque fijo: no tiene botón de borrar en su pantalla de detalle.
    await expect(page.locator('.notif-btn-borrar-bloque')).toHaveCount(0);
  });

  test('una alerta "Solo yo" de otra persona no aparece en mi lista', async ({ page }) => {
    const enUnaHora = new Date(Date.now() + 3600000).toISOString();
    await mockGoogleApis(page, {
      Notificaciones: [
        // "Solo yo" de otra persona (Royer) -- NO debe verla prueba@example.com.
        ['N5', 'Cita médica de Royer', '', 'unica', enUnaHora, '', 'yo', 'royer@example.com', 'activa', ''],
        // "Solo yo" de la propia sesión -- esta sí debe verse.
        ['N6', 'Recordatorio propio', '', 'unica', enUnaHora, '', 'yo', 'prueba@example.com', 'activa', ''],
        // "Toda la familia" -- se ve sin importar quién la creó.
        ['N7', 'Pagar el condominio', '', 'unica', enUnaHora, '', 'familia', 'royer@example.com', 'activa', ''],
      ],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    // Ninguna de las dos visibles tiene bloque -> ambas caen en "Otros",
    // y "Activos" (cruza todos los bloques) también las cuenta a ambas.
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Activos' }).locator('.alerta-bloque-cantidad')).toHaveText('2');
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Otros' }).locator('.alerta-bloque-cantidad')).toHaveText('2');
    await abrirBloqueAlerta(page, 'Otros');
    await expect(page.locator('.notificacion-item')).toContainText(['Recordatorio propio', 'Pagar el condominio']);
    await expect(page.locator('#notificaciones-list')).not.toContainText('Cita médica de Royer');
  });

  test('no muestra botón de Cancelar; marcar como revisada mueve de "Pasados" a "Canceladas"', async ({ page }) => {
    const haceUnaHora = new Date(Date.now() - 3600000).toISOString();
    await mockGoogleApis(page, {
      // estado "enviada": simula una que ya disparó y está por revisar.
      Notificaciones: [['N1', 'Sacar la basura', '', 'unica', haceUnaHora, '', 'yo', 'prueba@example.com', 'enviada', haceUnaHora]],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await abrirBloqueAlerta(page, 'Pasados');
    await expect(page.locator('.notificacion-item')).toContainText('Sacar la basura');
    await expect(page.locator('.notif-acciones')).not.toContainText('Cancelar');
    // "Pasados" es una agrupación, no un bloque -- no se puede crear desde acá.
    await expect(page.locator('#btn-nueva-notificacion-bloque')).toHaveCount(0);

    await page.locator('.notif-btn-ancho', { hasText: 'Revisado' }).click();
    await expect(page.locator('.notificacion-item')).toHaveCount(0);

    await page.locator('#btn-volver-bloque').click();
    await abrirBloqueAlerta(page, 'Canceladas');
    await expect(page.locator('.notificacion-item')).toContainText('Sacar la basura');
    await expect(page.locator('.notif-cancelada-badge')).toBeVisible();
  });

  test('doble clic en una alarma abre "Nuevo recordatorio" con su texto y bloque pre-llenados', async ({ page }) => {
    const enUnaHora = new Date(Date.now() + 3600000).toISOString();
    await mockGoogleApis(page, {
      // Fila con gasto_fijo (columna M) puesto -- vive en el bloque fijo "Gastos fijos".
      Notificaciones: [['N3', 'Pagar internet', '', 'unica', enUnaHora, '', 'yo', 'prueba@example.com', 'activa', '', '', '', 'Internet']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await abrirBloqueAlerta(page, 'Gastos fijos');
    await expect(page.locator('.notificacion-item')).toContainText('Pagar internet');

    await page.locator('.notificacion-item').dblclick();
    await expect(page.locator('#modal-recordatorio-crear')).toBeVisible();
    await expect(page.locator('#recordatorio-texto')).toHaveValue('Pagar internet');
    await expect(page.locator('#recordatorio-categoria-badge')).toContainText('Gastos fijos');

    await page.locator('#btn-guardar-recordatorio-crear').click();
    await expect(page.locator('#modal-recordatorio-crear')).toBeHidden();

    const categoriaGuardada = await page.evaluate(async () => {
      const lista = await Sheets.getRecordatorios();
      return lista.find(r => r.texto === 'Pagar internet')?.categoria;
    });
    expect(categoriaGuardada).toBe('Gastos fijos');
  });

  test('Editar sigue funcionando desde el botón de la tarjeta, y ahí sí se ve el selector de bloque', async ({ page }) => {
    const enUnaHora = new Date(Date.now() + 3600000).toISOString();
    await mockGoogleApis(page, {
      Notificaciones: [['N3b', 'Pagar internet', '', 'unica', enUnaHora, '', 'yo', 'prueba@example.com', 'activa', '']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await abrirBloqueAlerta(page, 'Otros');
    await page.locator('.notif-acciones-fila button', { hasText: 'Editar' }).click();
    await expect(page.locator('#modal-notificacion .modal-title')).toHaveText('Editar alerta');
    await expect(page.locator('#notif-bloque-row')).toBeVisible();
    await expect(page.locator('#notif-texto')).toHaveValue('Pagar internet');

    await page.locator('#notif-texto').fill('Pagar internet fibra');
    await page.locator('#btn-guardar-notificacion').click();
    await expect(page.locator('#modal-notificacion')).toBeHidden();

    // Sigue dentro de la pantalla de "Otros" (recargar no te saca de ahí).
    await expect(page.locator('.notificacion-item')).toContainText('Pagar internet fibra');
  });

  test('bloques personalizados: se ven como tarjetas en la cuadrícula, se les crea alertas desde adentro, y borrarlos las vuelve a "Otros"', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    // Antes de crear ningún bloque propio: Activos, Pasados, Gastos fijos,
    // Otros y "Agregar bloque".
    await expect(page.locator('.alerta-bloque-card')).toHaveCount(5);

    // Crea el bloque "Servicios".
    await page.locator('.alerta-bloque-card', { hasText: 'Agregar bloque' }).click();
    await page.locator('#bloque-alerta-nombre').fill('Servicios');
    await page.locator('#btn-guardar-bloque-alerta').click();
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Servicios' })).toBeVisible();
    await expect(page.locator('.alerta-bloque-card')).toHaveCount(6);

    // Crea una alerta DESDE ese bloque (no hace falta elegirlo, ya viene puesto).
    await nuevaAlertaEnBloque(page, 'Servicios');
    await expect(page.locator('#notif-bloque-row')).toBeHidden();
    await page.locator('#notif-texto').fill('Pagar Netflix');
    page.once('dialog', (d) => d.dismiss());
    await page.locator('#btn-guardar-notificacion').click();
    await expect(page.locator('#modal-notificacion')).toBeHidden();

    await expect(page.locator('.notificacion-item')).toContainText('Pagar Netflix');
    // Bloque personalizado: sí tiene botón de borrar en su pantalla de detalle.
    await expect(page.locator('.notif-btn-borrar-bloque')).toHaveCount(1);

    // Borrar el bloque -- la alerta no se pierde, cae en "Otros", y vuelve
    // solo a la cuadrícula (el bloque abierto ya no existe).
    page.once('dialog', (d) => d.accept());
    await page.locator('.notif-btn-borrar-bloque').click();
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Servicios' })).toHaveCount(0);

    await abrirBloqueAlerta(page, 'Otros');
    await expect(page.locator('.notificacion-item')).toContainText('Pagar Netflix');
  });

  test('borrar una notificación la quita de la lista', async ({ page }) => {
    const enUnaHora = new Date(Date.now() + 3600000).toISOString();
    await mockGoogleApis(page, {
      Notificaciones: [['N2', 'Revisar el correo', '', 'unica', enUnaHora, '', 'yo', 'prueba@example.com', 'activa', '']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await abrirBloqueAlerta(page, 'Otros');
    await expect(page.locator('.notificacion-item')).toContainText('Revisar el correo');
    page.once('dialog', (d) => d.accept());
    await page.locator('.notif-btn-eliminar').click();

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

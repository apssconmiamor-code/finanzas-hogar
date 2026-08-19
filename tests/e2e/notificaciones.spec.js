// Módulo Notificaciones: recordatorios que avisan por Web Push aunque la
// app esté cerrada. El envío real lo hace el Cron Trigger del Worker (ver
// worker/src/push.test.mjs para la lógica de fechas) — acá se prueba lo
// que sí vive en el navegador: crear (solo se puede desde dentro de un
// bloque)/revisar/editar/borrar, la cuadrícula de bloques y agrupaciones
// (con su pantalla de detalle, a la que se vuelve con el gesto de deslizar
// -- sin botón), el resumen de una alarma (doble clic), y que "Activar en
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

// La pantalla de detalle de un bloque no tiene botón de "Volver" -- se
// cierra con el gesto de iPhone (deslizar desde el borde izquierdo hacia
// la derecha, ver setupGestoVolver en app.js). Se simulan los mismos
// TouchEvent que esa función escucha, en vez de usar el touchscreen de
// Playwright (que requeriría habilitar hasTouch en todo el navegador).
async function deslizarParaVolver(page) {
  await page.evaluate(() => {
    const crearToque = (x, y) => new Touch({ identifier: Date.now(), target: document.body, clientX: x, clientY: y });
    const inicio = crearToque(10, 300);
    document.dispatchEvent(new TouchEvent('touchstart', { touches: [inicio], changedTouches: [inicio], bubbles: true, cancelable: true }));
    const fin = crearToque(160, 300);
    document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [fin], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(250); // ANIM_CIERRE_MS (180ms) + margen
}

// Simula soporte de Push completo: Notification.requestPermission(),
// navigator.serviceWorker.ready y pushManager.subscribe() — sin esto el
// navegador de pruebas headless no tiene un service worker real activo
// (los tests corren con serviceWorkers:'block', ver playwright.config.js).
async function mockPushManager(page) {
  await page.addInitScript(() => {
    window.Notification = window.Notification || {};
    // Notification.permission es un getter de solo lectura en el navegador
    // real (y en Chromium headless suele arrancar en "denied", no
    // "default") -- una asignación directa no tiene efecto, hay que
    // redefinirla como escribible para que requestPermission() de abajo sí
    // pueda cambiarla (mismo problema ya resuelto en el test de "si el
    // dispositivo ya está activado" más abajo).
    Object.defineProperty(window.Notification, 'permission', { value: 'default', writable: true, configurable: true });
    Notification.requestPermission = async () => { Notification.permission = 'granted'; return 'granted'; };

    const fakeSubscription = {
      endpoint: 'https://fcm.googleapis.com/fake/endpoint123',
      keys: { p256dh: 'FAKE_P256DH', auth: 'FAKE_AUTH' },
      toJSON() { return { endpoint: this.endpoint, keys: this.keys }; }
    };
    // Con estado -- igual que el PushManager real, una vez que subscribe()
    // corrió, getSubscription() tiene que devolver esa misma suscripción
    // (si no, la app nunca detecta que este dispositivo ya quedó activado).
    let suscripcionActual = null;
    const fakeRegistration = {
      pushManager: {
        getSubscription: async () => suscripcionActual,
        subscribe: async () => { suscripcionActual = fakeSubscription; return fakeSubscription; }
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

  test('"Activos" solo cuenta las de hoy; dentro de un bloque se ordena por fecha y se tiñe según hoy/pasada/futura', async ({ page }) => {
    const hoy    = new Date(Date.now() + 3600000).toISOString();      // en 1 hora, sigue siendo hoy
    const pasada = new Date(Date.now() - 3 * 86400000).toISOString(); // hace 3 días
    const futura = new Date(Date.now() + 5 * 86400000).toISOString(); // en 5 días

    await mockGoogleApis(page, {
      Notificaciones: [
        ['N1', 'Alarma futura', '', 'unica', futura, '', 'yo', 'prueba@example.com', 'activa', ''],
        ['N2', 'Alarma de hoy', '', 'unica', hoy, '', 'yo', 'prueba@example.com', 'activa', ''],
        ['N3', 'Alarma pasada', '', 'unica', pasada, '', 'yo', 'prueba@example.com', 'activa', ''],
      ],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    // "Activos" solo cuenta la de hoy -- la futura y la pasada no entran ahí.
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Activos' }).locator('.alerta-bloque-cantidad')).toHaveText('1');
    await abrirBloqueAlerta(page, 'Activos');
    await expect(page.locator('.notificacion-item')).toHaveCount(1);
    await expect(page.locator('.notificacion-item')).toContainText('Alarma de hoy');

    // Las tres siguen viviendo en "Otros" (ninguna tiene bloque asignado),
    // ordenadas de la que se activa antes a la que se activa después, cada
    // una teñida según su día.
    await deslizarParaVolver(page);
    await abrirBloqueAlerta(page, 'Otros');
    const items = page.locator('.notificacion-item');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('Alarma pasada');
    await expect(items.nth(0)).toHaveClass(/notificacion-item-pasada/);
    await expect(items.nth(1)).toContainText('Alarma de hoy');
    await expect(items.nth(1)).toHaveClass(/notificacion-item-hoy/);
    await expect(items.nth(2)).toContainText('Alarma futura');
    const claseFutura = await items.nth(2).getAttribute('class');
    expect(claseFutura).not.toMatch(/notificacion-item-(hoy|pasada)/);
  });

  test('una alerta recurrente usa la PRÓXIMA ocurrencia real para el color, no el ancla vieja (bug real: se veía roja para siempre)', async ({ page }) => {
    // Ancla: mismo día del mes que hoy, pero hace 2 meses -- con "cada 1
    // mes" la próxima ocurrencia real cae justo hoy. El ancla en sí (hace
    // 2 meses) es una fecha PASADA, así que si el color comparara contra
    // el ancla cruda (el bug reportado) se vería roja para siempre.
    const hoy = new Date();
    const ancla = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 2, hoy.getUTCDate(), 10, 0, 0)).toISOString();

    await mockGoogleApis(page, {
      Notificaciones: [
        ['N1', 'Pago mensual', '', 'recurrente', ancla, '', 'yo', 'prueba@example.com', 'activa', '', '1', 'mes'],
      ],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    // Le toca hoy -> cuenta en "Activos", NO en "Pasados" (no se disparó,
    // sigue "activa" -- "Pasados" es solo lo que ya se envió y no se revisó).
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Activos' }).locator('.alerta-bloque-cantidad')).toHaveText('1');
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Pasados' }).locator('.alerta-bloque-cantidad')).toHaveCount(0);

    await abrirBloqueAlerta(page, 'Otros');
    const tarjeta = page.locator('.notificacion-item');
    await expect(tarjeta).toContainText('Pago mensual');
    await expect(tarjeta).toHaveClass(/notificacion-item-hoy/);
    await expect(tarjeta).not.toHaveClass(/notificacion-item-pasada/);
  });

  test('la tarjeta de una alarma solo muestra nombre, próximo recordatorio, Editar y Eliminar', async ({ page }) => {
    const enUnaHora = new Date(Date.now() + 3600000).toISOString();
    await mockGoogleApis(page, {
      Notificaciones: [['N9', 'Pagar seguro', 'Un mensaje cualquiera', 'mensual', enUnaHora, '', 'familia', 'prueba@example.com', 'activa', '', '1', 'mes']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await abrirBloqueAlerta(page, 'Otros');
    const tarjeta = page.locator('.notificacion-item');
    await expect(tarjeta).toContainText('Pagar seguro');
    await expect(tarjeta.locator('button')).toHaveCount(2); // Editar + Eliminar, nada más
    await expect(tarjeta.locator('button').nth(0)).toContainText('Editar');
    await expect(tarjeta.locator('button').nth(1)).toContainText('Eliminar');
    // El resto de la info (mensaje, destinatario, repetición...) va solo en el resumen.
    await expect(tarjeta).not.toContainText('Un mensaje cualquiera');
    await expect(tarjeta).not.toContainText('Toda la familia');
    await expect(tarjeta).not.toContainText('Cada mes');
  });

  test('para volver de un bloque a la cuadrícula no hay botón -- se hace con el gesto de deslizar desde el borde', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await abrirBloqueAlerta(page, 'Otros');
    await expect(page.locator('.alerta-bloque-detalle-titulo')).toContainText('Otros');
    await expect(page.locator('#btn-volver-bloque')).toHaveCount(0);

    await deslizarParaVolver(page);
    await expect(page.locator('.alertas-bloques-grid')).toBeVisible();
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

    // Repetición/destinatario ya no van en la tarjeta -- se ven en el resumen.
    await page.locator('.notificacion-item').dblclick();
    await expect(page.locator('#modal-resumen-notificacion')).toBeVisible();
    await expect(page.locator('#resumen-notificacion-cuerpo')).toContainText('Cada mes');
    await expect(page.locator('#resumen-notificacion-cuerpo')).toContainText('Toda la familia');
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

    await page.locator('.notificacion-item').dblclick();
    await expect(page.locator('#resumen-notificacion-cuerpo')).toContainText('Cada 3 semanas');
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

    await page.locator('.notificacion-item').dblclick();
    await expect(page.locator('#resumen-notificacion-cuerpo')).toContainText('3 día(s)');
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
    // Bloque fijo: no tiene botón de borrar en su pantalla de detalle.
    await expect(page.locator('.notif-btn-borrar-bloque')).toHaveCount(0);

    await page.locator('.notificacion-item').dblclick();
    await expect(page.locator('#resumen-notificacion-cuerpo')).toContainText('Gastos fijos (Alquiler)');
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
    // Solo Activos/Pasados llevan contador en su tarjeta -- los bloques
    // (Gastos fijos/Otros/los del usuario) no.
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Activos' }).locator('.alerta-bloque-cantidad')).toHaveText('2');
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Otros' }).locator('.alerta-bloque-cantidad')).toHaveCount(0);
    await abrirBloqueAlerta(page, 'Otros');
    await expect(page.locator('.notificacion-item')).toContainText(['Recordatorio propio', 'Pagar el condominio']);
    await expect(page.locator('#notificaciones-list')).not.toContainText('Cita médica de Royer');
  });

  test('no muestra botón de Cancelar; marcar como revisada (desde el resumen) mueve de "Pasados" a "Canceladas"', async ({ page }) => {
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
    // "Pasados" es una agrupación, no un bloque -- no se puede crear desde acá.
    await expect(page.locator('#btn-nueva-notificacion-bloque')).toHaveCount(0);

    await page.locator('.notificacion-item').dblclick();
    await expect(page.locator('#modal-resumen-notificacion')).toBeVisible();
    await expect(page.locator('#btn-resumen-revisado')).toBeVisible();
    await page.locator('#btn-resumen-revisado').click();
    await expect(page.locator('#modal-resumen-notificacion')).toBeHidden();
    await expect(page.locator('.notificacion-item')).toHaveCount(0);

    await deslizarParaVolver(page);
    await abrirBloqueAlerta(page, 'Canceladas');
    await expect(page.locator('.notificacion-item')).toContainText('Sacar la basura');
    await page.locator('.notificacion-item').dblclick();
    await expect(page.locator('#resumen-notificacion-cuerpo')).toContainText('Cancelada');
    await expect(page.locator('#btn-resumen-revisado')).toBeHidden();
  });

  test('doble clic en una alarma abre un resumen, con un botón para crear un recordatorio en su bloque', async ({ page }) => {
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
    await expect(page.locator('#modal-resumen-notificacion')).toBeVisible();
    await expect(page.locator('#resumen-notificacion-titulo')).toHaveText('Pagar internet');
    await expect(page.locator('#resumen-notificacion-cuerpo')).toContainText('Gastos fijos');

    await page.locator('#btn-resumen-crear-recordatorio').click();
    await expect(page.locator('#modal-resumen-notificacion')).toBeHidden();
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

  test('el resumen no desborda el ancho de la pantalla ni con textos largos (bug real: se salía en celulares angostos)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    const enUnaHora = new Date(Date.now() + 3600000).toISOString();
    const mensajeLargo = 'Un mensaje bastante largo para probar que la fila no fuerza el ancho del modal más allá de la pantalla en un celular angosto de verdad';
    await mockGoogleApis(page, {
      Notificaciones: [['N8', 'Pagar internet', mensajeLargo, 'unica', enUnaHora, '', 'yo', 'prueba@example.com', 'activa', '', '', '', 'Internet']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirNotificaciones(page);

    await abrirBloqueAlerta(page, 'Gastos fijos');
    await page.locator('.notificacion-item').dblclick();
    await expect(page.locator('#modal-resumen-notificacion')).toBeVisible();
    await expect(page.locator('#resumen-notificacion-cuerpo')).toContainText(mensajeLargo);

    const desbordaAncho = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(desbordaAncho).toBe(false);
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
    await page.locator('.notificacion-item button', { hasText: 'Editar' }).click();
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

    // Crea el bloque "Servicios" con un ícono elegido por el usuario -- no
    // debe quedar con el 🗂️ de respaldo.
    await page.locator('.alerta-bloque-card', { hasText: 'Agregar bloque' }).click();
    await page.locator('#bloque-alerta-nombre').fill('Servicios');
    await page.locator('#bloque-alerta-icono').fill('🧾');
    await page.locator('#btn-guardar-bloque-alerta').click();
    const tarjetaServicios = page.locator('.alerta-bloque-card', { hasText: 'Servicios' });
    await expect(tarjetaServicios).toBeVisible();
    await expect(tarjetaServicios.locator('.alerta-bloque-icono')).toHaveText('🧾');
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

    // Aunque ya tiene una alerta, su tarjeta en la cuadrícula sigue sin
    // contador -- eso es solo para Activos/Pasados.
    await deslizarParaVolver(page);
    await expect(page.locator('.alerta-bloque-card', { hasText: 'Servicios' }).locator('.alerta-bloque-cantidad')).toHaveCount(0);
    await abrirBloqueAlerta(page, 'Servicios');

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

    await expect(page.locator('#notif-header-nota')).toBeVisible();

    await page.locator('#btn-activar-push').click();
    await expect.poll(() => cuerpoRecibido).not.toBeNull();

    expect(cuerpoRecibido.subscription.endpoint).toBe('https://fcm.googleapis.com/fake/endpoint123');
    expect(cuerpoRecibido.subscription.keys.p256dh).toBe('FAKE_P256DH');

    // Ya quedó activada en este dispositivo -- la explicación de "cada
    // dispositivo necesita activarlas" deja de tener sentido y desaparece
    // sola, sin esperar a un recargue.
    await expect(page.locator('#notif-header-nota')).toBeHidden();
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
    // La explicación de "cada dispositivo necesita activarlas" tampoco
    // tiene sentido si este dispositivo ya las activó.
    await expect(page.locator('#notif-header-nota')).toBeHidden();
  });
});

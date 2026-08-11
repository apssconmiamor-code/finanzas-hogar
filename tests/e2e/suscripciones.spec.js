// Módulo Suscripciones y Renovaciones: registra nombre, frecuencia y 3
// fechas (inicio, fin de contrato, renovación automática), y avisa dentro
// de la app 1 mes antes (una vez) y a diario desde los 15 días antes de la
// renovación (incluidas las vencidas), hasta que se decida Renovar o
// Cancelar.
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

function fechaOffset(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

// Misma lógica que sumarIntervaloFecha() en suscripciones.js — calendario
// real (setMonth), no una aproximación de +30 días, para que la prueba no
// sea frágil según el mes en que se corra.
function sumarUnMes(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00');
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

async function abrirSuscripciones(page) {
  const btnMenu = page.locator('#btn-menu, #btn-bottom-menu').first();
  await btnMenu.click();
  await page.locator('[data-tab-nav="suscripciones"]').click();
  await expect(page.locator('#tab-suscripciones')).toBeVisible();
}

test.describe('Suscripciones y renovaciones', () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesionFalsa(page);
  });

  test('crear una suscripción nueva la muestra en la lista', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirSuscripciones(page);

    await page.locator('#btn-nueva-suscripcion').click();
    await expect(page.locator('#modal-suscripcion')).toBeVisible();

    await page.locator('#susc-nombre').fill('Netflix');
    await page.locator('#susc-frecuencia').selectOption('Mensual');
    await page.locator('#susc-fecha-inicio').fill(fechaOffset(-30));
    await page.locator('#susc-fecha-renovacion').fill(fechaOffset(60));
    await page.locator('#btn-guardar-suscripcion').click();

    await expect(page.locator('#modal-suscripcion')).toHaveClass(/hidden/);
    await expect(page.locator('.suscripcion-item')).toContainText('Netflix');
    await expect(page.locator('.suscripcion-item')).toContainText('Mensual');
  });

  test('renovar una suscripción avanza fecha_renovacion un intervalo de frecuencia', async ({ page }) => {
    const hoy = fechaOffset(0);
    const renovacionVieja = fechaOffset(5);
    await mockGoogleApis(page, {
      Suscripciones: [['SU1', 'Spotify', 'Mensual', hoy, renovacionVieja, renovacionVieja, 'activa', 'prueba@example.com']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirSuscripciones(page);

    await expect(page.locator('.suscripcion-item')).toContainText('Spotify');

    page.once('dialog', (d) => d.accept());
    await page.locator('.btn-susc-renovar').click();

    await expect(page.locator('.susc-fechas')).toContainText(sumarUnMes(renovacionVieja));
  });

  test('cancelar una suscripción la mueve a "Canceladas" y detiene su alerta', async ({ page }) => {
    const rentaProxima = fechaOffset(10); // dentro de la ventana de alerta diaria (≤15 días)
    await mockGoogleApis(page, {
      Suscripciones: [['SU2', 'Gimnasio', 'Mensual', fechaOffset(-20), rentaProxima, rentaProxima, 'activa', 'prueba@example.com']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);

    // La alerta debe aparecer sola al cargar (sin entrar a la pestaña).
    await expect(page.locator('#suscripciones-alerta-bar')).toBeVisible();
    await expect(page.locator('#suscripciones-alerta-lista')).toContainText('Gimnasio');

    await abrirSuscripciones(page);
    page.once('dialog', (d) => d.accept());
    await page.locator('.btn-susc-cancelar').click();

    await expect(page.locator('.prestamos-seccion-title')).toContainText('Canceladas');
    await expect(page.locator('#suscripciones-alerta-bar')).toHaveClass(/hidden/);
  });

  test('borrar una suscripción la quita de la lista', async ({ page }) => {
    await mockGoogleApis(page, {
      Suscripciones: [['SU3', 'Seguro auto', 'Anual', fechaOffset(-100), fechaOffset(265), fechaOffset(265), 'activa', 'prueba@example.com']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirSuscripciones(page);

    await expect(page.locator('.suscripcion-item')).toContainText('Seguro auto');
    page.once('dialog', (d) => d.accept());
    await page.locator('.btn-borrar').click();

    await expect(page.locator('#suscripciones-list')).not.toContainText('Seguro auto');
  });

  test('el aviso NO aparece si faltan más de 30 días para renovar', async ({ page }) => {
    await mockGoogleApis(page, {
      Suscripciones: [['SU4', 'Dominio web', 'Anual', fechaOffset(-30), fechaOffset(45), fechaOffset(45), 'activa', 'prueba@example.com']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);

    await expect(page.locator('#suscripciones-alerta-bar')).toHaveClass(/hidden/);
  });

  test('cerrar el aviso lo oculta por hoy y no vuelve a aparecer solo tras recargar', async ({ page }) => {
    await mockGoogleApis(page, {
      Suscripciones: [['SU5', 'iCloud', 'Mensual', fechaOffset(-25), fechaOffset(5), fechaOffset(5), 'activa', 'prueba@example.com']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);

    await expect(page.locator('#suscripciones-alerta-bar')).toBeVisible();
    await page.locator('#btn-cerrar-alerta-susc').click();
    await expect(page.locator('#suscripciones-alerta-bar')).toHaveClass(/hidden/);

    await page.reload();
    await esperarAppLista(page);
    await expect(page.locator('#suscripciones-alerta-bar')).toHaveClass(/hidden/);

    // Pero sigue visible entrando a la pestaña (no se pierde el dato, solo
    // se deja de insistir con el banner por hoy).
    await abrirSuscripciones(page);
    await expect(page.locator('.suscripcion-item')).toContainText('iCloud');
  });
});

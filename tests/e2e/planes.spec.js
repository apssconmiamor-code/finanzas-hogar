// Módulo Planes: lista de ideas/lugares para salir o viajar (sin
// seguimiento de hecho/pendiente, a diferencia de Alertas). Mismo estilo
// que Alertas -- cuadrícula de categorías (creadas por el usuario, más
// "Otros" fija para lo sin categoría) + "Agregar categoría"; un plan solo
// se puede crear DESDE una categoría, y guarda nombre, ubicación, fecha,
// tipo (gratis/pago) e inversión (si es de pago).
const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

async function abrirPlanes(page) {
  const btnMenu = page.locator('#btn-menu, #btn-bottom-menu').first();
  await btnMenu.click();
  await page.locator('[data-tab-nav="planes"]').click();
  await expect(page.locator('#tab-planes')).toBeVisible();
}

// Escopado a #planes-list a propósito: .alerta-bloque-card/.notificacion-item
// son clases compartidas con Alertas, y cargarNotificaciones() se llama
// una vez al arrancar la app (para el badge de la campanita) sin importar
// qué pestaña esté activa -- sin este scope, un "Otros" también presente
// en #notificaciones-list (oculto, pero igual en el DOM) rompe el modo
// estricto de Playwright (2 elementos con el mismo texto).
function listaPlanes(page) {
  return page.locator('#planes-list');
}

async function abrirCategoriaPlan(page, nombre) {
  await listaPlanes(page).locator('.alerta-bloque-card', { hasText: nombre }).click();
}

test.describe('Planes', () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesionFalsa(page);
  });

  test('la cuadrícula trae fija "Otros" más "Agregar categoría", sin ninguna categoría del usuario', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await expect(listaPlanes(page).locator('.alerta-bloque-card', { hasText: 'Otros' })).toBeVisible();
    await expect(page.locator('#btn-nueva-categoria-plan')).toBeVisible();
    await expect(listaPlanes(page).locator('.alerta-bloque-card[data-clave^="bloque_"]')).toHaveCount(0);
  });

  test('crear una categoría nueva y un plan adentro -- gratis no pide inversión', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await page.locator('#btn-nueva-categoria-plan').click();
    await expect(page.locator('#modal-bloque-plan')).toBeVisible();
    await page.locator('#bloque-plan-nombre').fill('Restaurantes');
    await page.locator('#bloque-plan-icono').fill('🍽️');
    await page.locator('#btn-guardar-bloque-plan').click();
    await expect(page.locator('#modal-bloque-plan')).toBeHidden();

    const card = listaPlanes(page).locator('.alerta-bloque-card', { hasText: 'Restaurantes' });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page.locator('#modal-plan')).toBeHidden();
    await page.locator('#btn-nuevo-plan-bloque').click();
    await expect(page.locator('#modal-plan')).toBeVisible();
    // Al crear (a diferencia de editar) no se ve el selector de categoría --
    // ya viene decidida por el bloque desde el que se creó.
    await expect(page.locator('#plan-bloque-row')).toBeHidden();
    // Gratis es el tipo por defecto -- la inversión no se pide.
    await expect(page.locator('#plan-inversion-row')).toBeHidden();

    await page.locator('#plan-nombre').fill('Cena en La Provincia');
    await page.locator('#plan-ubicacion').fill('Cali, Centro');
    await page.locator('#plan-url').fill('https://laprovincia.example.com/reserva');
    await page.locator('#plan-fecha-inicio').fill('2026-12-24');
    await page.locator('#plan-fecha-fin').fill('2026-12-24');
    await page.locator('#btn-guardar-plan').click();
    await expect(page.locator('#modal-plan')).toBeHidden();

    const item = listaPlanes(page).locator('.notificacion-item');
    await expect(item).toContainText('Cena en La Provincia');
    await expect(item).toContainText('Cali, Centro');
    await expect(item).toContainText('Gratis');

    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes).toHaveLength(1);
    expect(planes[0]).toMatchObject({
      nombre: 'Cena en La Provincia', ubicacion: 'Cali, Centro',
      fechaInicio: '2026-12-24', fechaFin: '2026-12-24',
      tipo: 'gratis', categoria: 'Restaurantes', url: 'https://laprovincia.example.com/reserva'
    });
  });

  test('con solo fecha de inicio, la tarjeta muestra "Desde …"; con rango completo muestra las dos puntas', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await abrirCategoriaPlan(page, 'Otros');
    await page.locator('#btn-nuevo-plan-bloque').click();
    await page.locator('#plan-nombre').fill('Solo con inicio');
    await page.locator('#plan-fecha-inicio').fill('2026-11-01');
    await page.locator('#btn-guardar-plan').click();
    await expect(listaPlanes(page).locator('.notificacion-item')).toContainText('Desde');

    await page.locator('#btn-nuevo-plan-bloque').click();
    await page.locator('#plan-nombre').fill('Con rango');
    await page.locator('#plan-fecha-inicio').fill('2026-11-05');
    await page.locator('#plan-fecha-fin').fill('2026-11-10');
    await page.locator('#btn-guardar-plan').click();

    const conRango = listaPlanes(page).locator('.notificacion-item', { hasText: 'Con rango' });
    await expect(conRango).toContainText('nov');
    await expect(conRango).not.toContainText('Desde');
  });

  test('fecha fin anterior a fecha inicio no deja guardar', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await abrirCategoriaPlan(page, 'Otros');
    await page.locator('#btn-nuevo-plan-bloque').click();
    await page.locator('#plan-nombre').fill('Fechas al revés');
    await page.locator('#plan-fecha-inicio').fill('2026-12-10');
    await page.locator('#plan-fecha-fin').fill('2026-12-01');

    page.once('dialog', d => d.accept());
    await page.locator('#btn-guardar-plan').click();
    await expect(page.locator('#modal-plan')).toBeVisible();

    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes).toHaveLength(0);
  });

  test('tipo "Pago" pide la inversión y la guarda', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await page.locator('#btn-nueva-categoria-plan').click();
    await page.locator('#bloque-plan-nombre').fill('Viajes');
    await page.locator('#btn-guardar-bloque-plan').click();
    await abrirCategoriaPlan(page, 'Viajes');
    await page.locator('#btn-nuevo-plan-bloque').click();

    await page.locator('#plan-nombre').fill('Cartagena');
    await page.locator('#plan-tipo-pago').click();
    await expect(page.locator('#plan-inversion-row')).toBeVisible();
    await page.locator('#plan-inversion').fill('1500000');
    await page.locator('#btn-guardar-plan').click();
    await expect(page.locator('#modal-plan')).toBeHidden();

    const item = listaPlanes(page).locator('.notificacion-item');
    await expect(item).toContainText('Pago');
    await expect(item).toContainText('1.500.000');

    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes[0].tipo).toBe('pago');
    expect(Number(planes[0].inversion)).toBe(1500000);
  });

  test('un plan sin categoría (creado desde "Otros") cae en "Otros"', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await abrirCategoriaPlan(page, 'Otros');
    await page.locator('#btn-nuevo-plan-bloque').click();
    await page.locator('#plan-nombre').fill('Alguna idea suelta');
    await page.locator('#btn-guardar-plan').click();
    await expect(page.locator('#modal-plan')).toBeHidden();

    await expect(listaPlanes(page).locator('.notificacion-item')).toContainText('Alguna idea suelta');
    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes[0].categoria).toBe('');
  });

  test('doble toque abre el resumen de solo lectura; mantener presionado abre Editar/Eliminar', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await abrirCategoriaPlan(page, 'Otros');
    await page.locator('#btn-nuevo-plan-bloque').click();
    await page.locator('#plan-nombre').fill('Eje Cafetero');
    await page.locator('#plan-ubicacion').fill('Salento');
    await page.locator('#plan-tipo-pago').click();
    await page.locator('#plan-inversion').fill('300000');
    await page.locator('#btn-guardar-plan').click();

    const item = listaPlanes(page).locator('.notificacion-item');
    await item.dblclick();
    await expect(page.locator('#modal-resumen-plan')).toBeVisible();
    await expect(page.locator('#resumen-plan-titulo')).toHaveText('Eje Cafetero');
    await expect(page.locator('#resumen-plan-cuerpo')).toContainText('Salento');
    await expect(page.locator('#resumen-plan-cuerpo')).toContainText('300.000');
    await page.locator('#btn-cerrar-resumen-plan').click();
    await expect(page.locator('#modal-resumen-plan')).toBeHidden();

    // Mantener presionado (pointerdown + esperar + pointerup) abre
    // Editar/Eliminar, no el resumen.
    const box = await item.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await expect(page.locator('#modal-resumen-plan')).toBeHidden();
    await page.locator('#btn-editar-borrar-editar').click();

    await expect(page.locator('#modal-plan')).toBeVisible();
    await expect(page.locator('#plan-bloque-row')).toBeVisible(); // al editar sí se ve la categoría
    await expect(page.locator('#plan-nombre')).toHaveValue('Eje Cafetero');
    await expect(page.locator('#plan-inversion-row')).toBeVisible();
    await expect(page.locator('#plan-inversion')).toHaveValue('300000');
  });

  test('"Sin reserva" es el valor por defecto -- la tarjeta no dice nada al respecto', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await abrirCategoriaPlan(page, 'Otros');
    await page.locator('#btn-nuevo-plan-bloque').click();
    await expect(page.locator('#plan-reserva-no')).toHaveClass(/active/);
    await page.locator('#plan-nombre').fill('Paseo improvisado');
    await page.locator('#btn-guardar-plan').click();

    const item = listaPlanes(page).locator('.notificacion-item');
    await expect(item).toContainText('Paseo improvisado');
    await expect(item).not.toContainText('reserva', { ignoreCase: true });

    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes[0].reserva).toBe('no');
  });

  test('"Con reserva" se guarda y se ve en la tarjeta y el resumen', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await abrirCategoriaPlan(page, 'Otros');
    await page.locator('#btn-nuevo-plan-bloque').click();
    await page.locator('#plan-nombre').fill('Concierto');
    await page.locator('#plan-reserva-si').click();
    await page.locator('#btn-guardar-plan').click();

    const item = listaPlanes(page).locator('.notificacion-item');
    await expect(item).toContainText('Con reserva');
    await item.dblclick();
    await expect(page.locator('#resumen-plan-cuerpo')).toContainText('Con reserva');

    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes[0].reserva).toBe('si');
  });

  test('la URL del resumen es un link tocable que abre en pestaña nueva', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await abrirCategoriaPlan(page, 'Otros');
    await page.locator('#btn-nuevo-plan-bloque').click();
    await page.locator('#plan-nombre').fill('Con reserva online');
    await page.locator('#plan-url').fill('https://reservas.example.com/mesa/123');
    await page.locator('#btn-guardar-plan').click();

    await listaPlanes(page).locator('.notificacion-item').dblclick();
    const link = page.locator('#resumen-plan-cuerpo a.detalle-notif-url-texto');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://reservas.example.com/mesa/123');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('borrar un plan (desde mantener presionado) lo quita de la lista', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await abrirCategoriaPlan(page, 'Otros');
    await page.locator('#btn-nuevo-plan-bloque').click();
    await page.locator('#plan-nombre').fill('Idea a borrar');
    await page.locator('#btn-guardar-plan').click();

    const item = listaPlanes(page).locator('.notificacion-item');
    const box = await item.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    page.once('dialog', d => d.accept());
    await page.locator('#btn-editar-borrar-eliminar').click();
    await expect(listaPlanes(page).locator('.notificacion-item')).toHaveCount(0);

    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes).toHaveLength(0);
  });

  test('borrar una categoría no borra los planes que tenía -- pasan a "Otros"', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await page.locator('#btn-nueva-categoria-plan').click();
    await page.locator('#bloque-plan-nombre').fill('Cine');
    await page.locator('#btn-guardar-bloque-plan').click();
    await abrirCategoriaPlan(page, 'Cine');
    await page.locator('#btn-nuevo-plan-bloque').click();
    await page.locator('#plan-nombre').fill('Estreno de diciembre');
    await page.locator('#btn-guardar-plan').click();
    await expect(listaPlanes(page).locator('.notificacion-item')).toHaveCount(1);

    page.once('dialog', d => d.accept());
    await listaPlanes(page).locator('.notif-btn-borrar-bloque').click();

    // Vuelve solo a la cuadrícula -- "Cine" ya no existe.
    await expect(listaPlanes(page).locator('.alerta-bloque-card', { hasText: 'Cine' })).toHaveCount(0);
    await abrirCategoriaPlan(page, 'Otros');
    await expect(listaPlanes(page).locator('.notificacion-item')).toContainText('Estreno de diciembre');

    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes[0].categoria).toBe('Cine'); // el dato del plan no se toca, solo cambia dónde cae visualmente
  });

  test('una categoría configurada en otro dispositivo carga igual acá (sincronizada por Sheets)', async ({ page }) => {
    await mockGoogleApis(page, {
      ConfigUsuario: [['CFG1', 'prueba@example.com', 'planes_bloques', JSON.stringify([{ nombre: 'Playas', icono: '🏖️' }])]],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await expect(listaPlanes(page).locator('.alerta-bloque-card', { hasText: 'Playas' })).toBeVisible();
  });

  test('los planes vencidos se borran solos al cargar, y los vigentes se ordenan del más cercano al más lejano', async ({ page }) => {
    const hoy = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const ayer = fmt(new Date(hoy.getTime() - 86400000));
    const enDosDias = fmt(new Date(hoy.getTime() + 2 * 86400000));
    const enDiezDias = fmt(new Date(hoy.getTime() + 10 * 86400000));

    await mockGoogleApis(page, {
      // Columnas: id, nombre, ubicacion, fecha_inicio, fecha_fin, tipo,
      // inversion, categoria, autor, url.
      Planes: [
        ['P1', 'Ya caducado', '', '', ayer, 'gratis', '', '', 'prueba@example.com', ''],
        ['P2', 'Más lejano', '', enDiezDias, '', 'gratis', '', '', 'prueba@example.com', ''],
        ['P3', 'Más cercano', '', enDosDias, '', 'gratis', '', '', 'prueba@example.com', ''],
      ],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);
    await abrirCategoriaPlan(page, 'Otros');

    const items = listaPlanes(page).locator('.notificacion-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('Más cercano');
    await expect(items.nth(1)).toContainText('Más lejano');

    // El caducado no solo desaparece de la vista -- se borró de verdad.
    const planesRestantes = await page.evaluate(() => Sheets.getPlanes());
    expect(planesRestantes.map(p => p.nombre).sort()).toEqual(['Más cercano', 'Más lejano']);
  });

  test('planes creados con el esquema viejo (antes de fecha_fin/url) se reparan solos al cargar (bug real reportado)', async ({ page }) => {
    // Fila cruda tal como quedó grabada ANTES de que existiera fecha_fin/url
    // -- 8 columnas: id, nombre, ubicacion, fecha, tipo, inversion, categoria, autor.
    // Sin la reparación, fecha_fin se leería "pago" (bug real: la columna
    // nueva se insertó en el medio, no al final, corriendo los datos).
    await mockGoogleApis(page, {
      Planes: [['P1', 'Viaje viejo', 'Cartagena', '2026-12-01', 'pago', '500000', 'Viajes', 'prueba@example.com']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes).toHaveLength(1);
    expect(planes[0]).toMatchObject({
      nombre: 'Viaje viejo', ubicacion: 'Cartagena',
      fechaInicio: '2026-12-01', fechaFin: '',
      tipo: 'pago', inversion: '500000', categoria: 'Viajes', autor: 'prueba@example.com'
    });

    // Sin bloque "Viajes" creado, cae en "Otros" -- pero con los datos ya
    // bien, no con "pago" mostrándose como si fuera una fecha.
    await abrirCategoriaPlan(page, 'Otros');
    const item = listaPlanes(page).locator('.notificacion-item');
    await expect(item).toContainText('Pago');
    await expect(item).toContainText('500.000');
  });

  test('un plan sin ninguna fecha nunca caduca', async ({ page }) => {
    await mockGoogleApis(page, {
      Planes: [['P1', 'Idea sin fecha todavía', '', '', '', 'gratis', '', '', 'prueba@example.com', '']],
    });
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    const planes = await page.evaluate(() => Sheets.getPlanes());
    expect(planes).toHaveLength(1);
  });

  test('el botón de volver ("‹") regresa a la cuadrícula de categorías (bug real reportado)', async ({ page }) => {
    await mockGoogleApis(page);
    await page.goto('/index.html');
    await esperarAppLista(page);
    await abrirPlanes(page);

    await abrirCategoriaPlan(page, 'Otros');
    await expect(page.locator('#btn-volver-bloque-plan')).toBeVisible();
    await page.locator('#btn-volver-bloque-plan').click();

    await expect(listaPlanes(page).locator('.alertas-bloques-grid')).toBeVisible();
    await expect(page.locator('#btn-volver-bloque-plan')).toHaveCount(0);
  });
});

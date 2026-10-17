// Dos nombres para el mismo gasto ("Internet" e "Internet hogar"):
//  - Unificar: el alias se retira de las listas y lo ya registrado con su nombre
//    cuenta en el concepto que se queda (sin reescribir nada en Sheets).
//  - Al crear un concepto, avisa si se parece a uno existente.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, irATab } = require('./helpers/googleMock');

async function abrirApp(page) {
  const hoy = new Date().toISOString().slice(0, 10);
  await mockGoogleApis(page, {
    Cajas: [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
    Presupuesto: [
      ['Gasto fijo', 'Internet', 100000, 0, ''],
      ['Gasto fijo', 'Internet hogar', 90000, 0, ''],
    ],
    // Un pago registrado con el nombre "viejo".
    'Movimiento de Caja': [
      ['M1', hoy, 'prueba@example.com', 'Internet hogar', 'Gasto fijo', 'Efectivo', 90000, '', ''],
    ],
  });
  await iniciarSesionFalsa(page);
  await page.goto('/index.html');
  await esperarAppLista(page);
  await irATab(page, 'proyeccion');
}

async function unificar(page) {
  await page.locator('#btn-menu-proyeccion').click();
  await page.locator('#btn-unificar-conceptos').click();
  await expect(page.locator('#modal-unificar')).toBeVisible();
  await page.locator('#unificar-alias').selectOption('Internet hogar');
  await page.locator('#unificar-canonico').selectOption('Internet');
}

test.describe('Unificar conceptos', () => {
  test('el menú ⋯ ofrece Unificar conceptos', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#btn-menu-proyeccion').click();
    await expect(page.locator('#btn-unificar-conceptos')).toHaveText(/Unificar conceptos/);
    await expect(page.locator('#btn-unificar-conceptos .dd-icon svg')).toHaveCount(1);
  });

  test('antes de unificar hay dos filas; al unificar queda una y lo registrado cuenta en ella', async ({ page }) => {
    await abrirApp(page);
    const tabla = page.locator('#proy-tabla-body');
    await expect(tabla.locator('.proy-tabla-row[data-concepto="Internet"]')).toHaveCount(1);
    await expect(tabla.locator('.proy-tabla-row[data-concepto="Internet hogar"]')).toHaveCount(1);

    await unificar(page);
    // Vista previa: cuántos movimientos pasan a contar en el que se queda.
    await expect(page.locator('#unificar-resumen')).toContainText('1 movimiento de «Internet hogar» pasarán a contarse como «Internet»');
    await page.locator('#btn-confirmar-unificar').click();
    await expect(page.locator('#modal-unificar')).toBeHidden();

    await expect(tabla.locator('.proy-tabla-row[data-concepto="Internet hogar"]')).toHaveCount(0);
    const fila = tabla.locator('.proy-tabla-row[data-concepto="Internet"]');
    await expect(fila).toHaveCount(1);
    // Estimado 100.000 (el del que se queda) y Real 90.000 (lo pagado como "Internet hogar").
    await expect(fila.locator('.proy-cell-estimado')).toContainText('100.000');
    await expect(fila.locator('.proy-cell-real')).toContainText('90.000');
  });

  test('el alias desaparece de Configurar mes y de la lista de movimientos, y sigue así al recargar', async ({ page }) => {
    await abrirApp(page);
    await unificar(page);
    await page.locator('#btn-confirmar-unificar').click();
    await expect(page.locator('#modal-unificar')).toBeHidden();

    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet"]')).toHaveCount(1);
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet hogar"]')).toHaveCount(0);
    // El aviso de "ahora cuenta como…" puede tapar los botones en pantallas grandes: se espera a que se vaya.
    await expect(page.locator('#sync-toast')).not.toHaveClass(/visible/);
    await page.locator('#btn-cancelar-config-mes').click();

    // Persiste en la hoja (columna alias_de): recargando sigue unificado.
    await page.reload();
    await esperarAppLista(page);
    await irATab(page, 'proyeccion');
    await expect(page.locator('#proy-tabla-body .proy-tabla-row[data-concepto="Internet hogar"]')).toHaveCount(0);
    await expect(page.locator('#proy-tabla-body .proy-tabla-row[data-concepto="Internet"] .proy-cell-real')).toContainText('90.000');
  });

  test('no deja unificar un concepto consigo mismo ni un ingreso con un gasto', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#btn-menu-proyeccion').click();
    await page.locator('#btn-unificar-conceptos').click();
    await expect(page.locator('#btn-confirmar-unificar')).toBeDisabled();

    await page.locator('#unificar-alias').selectOption('Internet');
    await page.locator('#unificar-canonico').selectOption('Internet');
    await expect(page.locator('#unificar-resumen')).toContainText('distintos');
    await expect(page.locator('#btn-confirmar-unificar')).toBeDisabled();

    await page.locator('#unificar-canonico').selectOption('SURA');   // una fuente de ingreso
    await expect(page.locator('#unificar-resumen')).toContainText('mismo tipo');
    await expect(page.locator('#btn-confirmar-unificar')).toBeDisabled();
  });

  test('Separar devuelve el concepto a las listas', async ({ page }) => {
    await abrirApp(page);
    await unificar(page);
    await page.locator('#btn-confirmar-unificar').click();
    await expect(page.locator('#modal-unificar')).toBeHidden();

    await page.locator('#btn-menu-proyeccion').click();
    await page.locator('#btn-unificar-conceptos').click();
    await expect(page.locator('#unificar-existentes')).toContainText('Internet hogar');
    await page.locator('#unificar-existentes [data-separar-concepto="Internet hogar"]').click();
    await expect(page.locator('#unificar-existentes')).toHaveText('');
    await page.locator('#btn-cerrar-unificar').click();

    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet hogar"]')).toHaveCount(1);
  });

  test('al crear un concepto, avisa si se parece a uno existente y deja usar el existente', async ({ page }) => {
    await abrirApp(page);
    await page.locator('.proy-4m-card .proy-4m-config').first().click();
    await page.locator('#btn-config-nuevo-concepto').click();
    await expect(page.locator('#modal-nuevo-concepto')).toBeVisible();

    // Sin parecidos: no hay aviso.
    await page.locator('#nuevo-concepto-nombre').fill('Gimnasio');
    await expect(page.locator('#nuevo-concepto-parecido')).toBeHidden();

    // "Internet fibra" se parece a "Internet".
    await page.locator('#nuevo-concepto-nombre').fill('Internet fibra');
    await expect(page.locator('#nuevo-concepto-parecido')).toBeVisible();
    await expect(page.locator('#nuevo-concepto-parecido')).toContainText('¿es el mismo gasto?');
    await page.locator('#nuevo-concepto-parecido [data-usar-concepto="Internet"]').click();

    // Se vuelve a Configurar mes con el cursor en el concepto que ya existe.
    await expect(page.locator('#modal-nuevo-concepto')).toBeHidden();
    await expect(page.locator('#modal-config-mes')).toBeVisible();
    await expect(page.locator('#modal-config-mes-body input[data-concepto="Internet"]')).toBeFocused();
  });

  test('registrar un movimiento con el nombre del alias lo guarda con el concepto que se quedó', async ({ page }) => {
    await abrirApp(page);
    await unificar(page);
    await page.locator('#btn-confirmar-unificar').click();

    // La lista de movimientos del concepto viejo se agrupa bajo "Internet": el
    // filtro por "Internet" muestra el pago hecho como "Internet hogar".
    await irATab(page, 'movimientos');
    await expect(page.locator('#movimientos-list')).toContainText('Internet hogar');
    await page.locator('#filtro-concepto').selectOption('Gasto fijo');
    await expect(page.locator('#filtro-subcategoria option[value="Internet hogar"]')).toHaveCount(0);
    await expect(page.locator('#filtro-subcategoria option[value="Internet"]')).toHaveCount(1);
    await page.locator('#filtro-subcategoria').selectOption('Internet');
    await expect(page.locator('#movimientos-list')).toContainText('Internet hogar');
  });
});

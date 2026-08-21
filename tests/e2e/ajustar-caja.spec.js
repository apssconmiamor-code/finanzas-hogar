// Cuando una caja queda con saldo negativo ("⚠️ Requiere ajuste"), su
// detalle debe ofrecer un botón "Ajustar" que crea un movimiento de Ingreso
// por la diferencia exacta, dejando el saldo en $0 sin tener que armar el
// movimiento a mano.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

test.describe('Ajustar caja', () => {
  test('nivela una caja con saldo negativo a $0 y quita el aviso de "Requiere ajuste"', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      // Un solo gasto, sin ingresos → saldo negativo (-100000).
      'Movimiento de Caja': [
        ['M1', hoy, 'prueba@example.com', 'Renta', 'Gasto fijo', 'Efectivo', 100000, '', ''],
      ],
    });

    await page.goto('/');
    await esperarAppLista(page);

    // La tarjeta muestra el aviso de que requiere ajuste.
    const tarjeta = page.locator('.caja-card', { hasText: 'Efectivo' });
    await expect(tarjeta.locator('.caja-alerta-ajuste')).toBeVisible();

    // Doble toque abre el detalle y confirma el saldo negativo + el botón Ajustar.
    await tarjeta.dblclick();
    await expect(page.locator('#modal-detalle-caja')).toBeVisible();
    await expect(page.locator('#detalle-caja-resumen')).toContainText('Saldo: -$ 100.000');
    const btnAjustar = page.locator('.btn-ajustar');
    await expect(btnAjustar).toBeVisible();

    await btnAjustar.click();

    // El modal se cierra y, tras recargar, la caja ya no requiere ajuste.
    await expect(page.locator('#modal-detalle-caja')).toBeHidden({ timeout: 10000 });
    await expect(tarjeta.locator('.caja-alerta-ajuste')).toBeHidden();

    // Reabrir el detalle debe mostrar el saldo ya en $0 y sin botón Ajustar.
    await tarjeta.dblclick();
    await expect(page.locator('#detalle-caja-resumen')).toContainText('Saldo: $ 0');
    await expect(page.locator('.btn-ajustar')).toBeHidden();

    // El movimiento de ajuste quedó registrado con la descripción esperada.
    await expect(page.locator('#detalle-caja-body')).toContainText('Ajuste');
  });

  test('mantener presionada una tarjeta que requiere ajuste ofrece "Ajustar" directo, sin pasar por el detalle', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [
        ['M1', hoy, 'prueba@example.com', 'Renta', 'Gasto fijo', 'Efectivo', 100000, '', ''],
      ],
    });
    await page.goto('/');
    await esperarAppLista(page);

    const tarjeta = page.locator('.caja-card', { hasText: 'Efectivo' });
    await expect(tarjeta.locator('.caja-alerta-ajuste')).toBeVisible();

    const box = await tarjeta.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#modal-editar-borrar')).toBeVisible();
    await expect(page.locator('#editar-borrar-titulo')).toHaveText('Efectivo');
    await expect(page.locator('#btn-editar-borrar-eliminar')).toBeHidden();
    const btnAjustar = page.locator('#btn-editar-borrar-editar');
    await expect(btnAjustar).toBeVisible();
    await expect(btnAjustar).toHaveText('⚖️ Ajustar');
    // El detalle no se abrió solo por mantener presionado.
    await expect(page.locator('#modal-detalle-caja')).toBeHidden();

    await btnAjustar.click();
    await expect(page.locator('#modal-editar-borrar')).toBeHidden();
    await expect(tarjeta.locator('.caja-alerta-ajuste')).toBeHidden({ timeout: 10000 });
  });

  test('un solo toque no hace nada -- ni en una tarjeta normal ni en una que requiere ajuste', async ({ page }) => {
    const hoy = new Date().toISOString().slice(0, 10);
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [
        ['C1', 'prueba@example.com', 'Efectivo', 'COP'],
        ['C2', 'prueba@example.com', 'Nequi', 'COP'],
      ],
      'Movimiento de Caja': [
        ['M1', hoy, 'prueba@example.com', 'Renta', 'Gasto fijo', 'Efectivo', 100000, '', ''],
      ],
    });
    await page.goto('/');
    await esperarAppLista(page);

    // Tarjeta que requiere ajuste: un solo toque no abre el detalle.
    const tarjetaEfectivo = page.locator('.caja-card', { hasText: 'Efectivo' });
    await tarjetaEfectivo.click();
    await expect(page.locator('#modal-detalle-caja')).toBeHidden();
    await expect(page.locator('#modal-editar-borrar')).toBeHidden();

    // Tarjeta sin problemas: tampoco.
    const tarjetaNequi = page.locator('.caja-card', { hasText: 'Nequi' });
    await tarjetaNequi.click();
    await expect(page.locator('#modal-detalle-caja')).toBeHidden();

    // Doble toque (ya pasada la ventana de doble toque del click anterior,
    // para no encadenarse con él) sí lo abre.
    await page.waitForTimeout(500);
    await tarjetaNequi.dblclick();
    await expect(page.locator('#modal-detalle-caja')).toBeVisible();
  });

  test('la tarjeta muestra el logo de la entidad en la misma fila del nombre, sin la moneda', async ({ page }) => {
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [
        ['C1', 'prueba@example.com', 'Nequi', 'COP'],
        // Nombre sin ninguna entidad/propósito conocido -- sin ícono.
        ['C2', 'prueba@example.com', 'Caja rara', 'COP'],
      ],
    });
    await page.goto('/');
    await esperarAppLista(page);

    const tarjetaNequi = page.locator('.caja-card', { hasText: 'Nequi' });
    // Pedido explícito: ya no se muestra la moneda (COP/USD/EUR) suelta.
    await expect(tarjetaNequi).not.toContainText('COP');
    const iconoNequi = tarjetaNequi.locator('.caja-nombre-fila .caja-card-icono');
    await expect(iconoNequi).toHaveAttribute('src', 'nequi.png');

    const tarjetaRara = page.locator('.caja-card', { hasText: 'Caja rara' });
    await expect(tarjetaRara.locator('.caja-card-icono')).toHaveCount(0);
  });

  test('un nombre de caja muy largo envuelve en dos líneas en vez de salirse del ancho de la pantalla', async ({ page }) => {
    // Bug real reportado: la grilla de Cuentas se salía del 100% del
    // ancho de la pantalla con un nombre largo sin cortes.
    const nombreLargo = 'Cuenta de Ahorros Programados Bancolombia Familiar';
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', nombreLargo, 'COP']],
    });
    await page.goto('/');
    await esperarAppLista(page);

    // Sin scroll horizontal de la página.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1); // tolerancia de redondeo de subpíxel

    // El nombre efectivamente envolvió a más de una línea (no quedó
    // comprimido en una sola con overflow).
    const nombreEl = page.locator('.caja-card', { hasText: 'Cuenta de Ahorros' }).locator('.caja-nombre');
    const alturaLinea = await nombreEl.evaluate(el => parseFloat(getComputedStyle(el).lineHeight));
    const alturaReal  = await nombreEl.evaluate(el => el.getBoundingClientRect().height);
    expect(alturaReal).toBeGreaterThan(alturaLinea * 1.3);
  });
});

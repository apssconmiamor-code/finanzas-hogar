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

  // Inicio muestra solo las cajas que el usuario elige (botón "Cajas",
  // #btn-elegir-cajas). Ocultar una no la borra: solo sale de Inicio.
  test("Elegir qué cajas ver: ocultar una la saca de Inicio, y se vuelve a mostrar al marcarla", async ({ page }) => {
    await mockGoogleApis(page, {
      "Cajas": [
        ["C1", "prueba@example.com", "Efectivo", "COP"],
        ["C2", "prueba@example.com", "Nequi", "COP"],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto("/");
    await esperarAppLista(page);

    const tarjetaEfectivo = page.locator(".caja-card", { hasText: "Efectivo" });
    const tarjetaNequi = page.locator(".caja-card", { hasText: "Nequi" });
    await expect(tarjetaEfectivo).toBeVisible();
    await expect(tarjetaNequi).toBeVisible();

    await page.locator("#btn-menu-cajas").click();
    await page.locator("#btn-elegir-cajas").click();
    const panel = page.locator("#modal-elegir-cajas");
    await expect(panel).toBeVisible();
    await panel.getByLabel("Nequi").uncheck();
    await expect(tarjetaNequi).toHaveCount(0);
    await expect(tarjetaEfectivo).toBeVisible();

    // La elección se recuerda al recargar.
    await page.reload();
    await esperarAppLista(page);
    await expect(tarjetaNequi).toHaveCount(0);
    await expect(tarjetaEfectivo).toBeVisible();

    await page.locator("#btn-menu-cajas").click();
    await page.locator("#btn-elegir-cajas").click();
    await page.locator("#modal-elegir-cajas").getByLabel("Nequi").check();
    await expect(tarjetaNequi).toBeVisible();
    await page.locator("#btn-cerrar-elegir-cajas").click();
    await expect(page.locator("#modal-elegir-cajas")).toHaveCount(0);

    // Con todas ocultas, Inicio explica cómo recuperarlas.
    await page.locator("#btn-menu-cajas").click();
    await page.locator("#btn-elegir-cajas").click();
    await page.locator("#modal-elegir-cajas").getByLabel("Efectivo").uncheck();
    await page.locator("#modal-elegir-cajas").getByLabel("Nequi").uncheck();
    await page.locator("#btn-cerrar-elegir-cajas").click();
    await expect(page.locator("#cajas-grid")).toContainText("No tienes cajas visibles");
  });

  // Con más de tres cajas la fila se desliza: una pista sutil (degradado en
  // el borde con más cajas + puntitos de página) avisa que hay más.
  test("más de tres cajas: hay pista de que se desliza, y desaparece si caben todas", async ({ page }) => {
    await mockGoogleApis(page, {
      "Cajas": ["Efectivo", "Nequi", "Ahorro", "Choco", "Luni"].map((n, i) => ["C" + i, "prueba@example.com", n, "COP"]),
    });
    await iniciarSesionFalsa(page);
    await page.goto("/");
    await esperarAppLista(page);

    await expect(page.locator(".cajas-puntos .cajas-punto")).toHaveCount(2);
    await expect(page.locator(".cajas-fade-der")).toBeVisible();
    await expect(page.locator(".cajas-fade-izq")).toHaveCount(0);

    await page.locator("#cajas-grid").evaluate(g => { g.scrollLeft = g.scrollWidth; });
    await expect(page.locator(".cajas-fade-izq")).toBeVisible();
    await expect(page.locator(".cajas-fade-der")).toHaveCount(0);
    await expect(page.locator(".cajas-punto").last()).toHaveClass(/activo/);

    // Ocultando dos (quedan tres) ya no hay nada que deslizar.
    await page.locator("#btn-menu-cajas").click();
    await page.locator("#btn-elegir-cajas").click();
    await page.locator("#modal-elegir-cajas").getByLabel("Luni").uncheck();
    await page.locator("#modal-elegir-cajas").getByLabel("Choco").uncheck();
    await expect(page.locator(".cajas-puntos")).toHaveCount(0);
    await expect(page.locator(".cajas-fade")).toHaveCount(0);
  });

  // Botones redondos de acceso rápido debajo de las cajas.
  test("atajos redondos: llevan a Movimientos, a Proyección y a Alertas", async ({ page }) => {
    await mockGoogleApis(page, {
      "Cajas": [["C1", "prueba@example.com", "Efectivo", "COP"]],
    });
    await iniciarSesionFalsa(page);
    await page.goto("/");
    await esperarAppLista(page);

    await expect(page.locator(".cajas-atajos-titulo")).toHaveText("Más opciones");
    await expect(page.locator(".cajas-atajo")).toHaveCount(3);
    await page.locator("#atajo-movimientos").click();
    await expect(page.locator("#tab-movimientos")).toBeVisible();
    await expect(page.locator("#tab-cajas")).toBeHidden();

    await page.locator(".nav-item[data-tab=\"cajas\"]:visible").first().click();
    await page.locator("#atajo-proyeccion").click();
    await expect(page.locator("#tab-proyeccion")).toBeVisible();

    await page.locator(".nav-item[data-tab=\"cajas\"]:visible").first().click();
    await page.locator("#atajo-alertas").click();
    await expect(page.locator("#tab-notificaciones")).toBeVisible();
  });

  // "Sumar cajas": botón sutil arriba de la cuadrícula (#btn-sumar-cajas)
  // que arma un modo selección -- tocar una caja la suma/resta del total,
  // que aparece en una barra flotante abajo (#sumar-cajas-barra). Nada de
  // mantener presionado ni ventana aparte (pedido explícito).
  test('Sumar cajas: tocar tarjetas en modo selección arma el total, y "Listo" lo apaga', async ({ page }) => {
    await mockGoogleApis(page, {
      'Cajas': [
        ['C1', 'prueba@example.com', 'Efectivo', 'COP'],
        ['C2', 'prueba@example.com', 'Nequi', 'COP'],
      ],
      'Movimiento de Caja': [
        ['M1', '2024-01-01', 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', 100000, '', ''],
        ['M2', '2024-01-01', 'prueba@example.com', 'SURA', 'Ingreso', 'Nequi', 50000, '', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/');
    await esperarAppLista(page);

    const barra = page.locator('#sumar-cajas-barra');
    const tarjetaEfectivo = page.locator('.caja-card', { hasText: 'Efectivo' });
    const tarjetaNequi = page.locator('.caja-card', { hasText: 'Nequi' });

    await expect(barra).toBeHidden();
    await page.locator('#btn-menu-cajas').click();
    await page.locator('#btn-sumar-cajas').click();
    await expect(page.locator('#btn-sumar-cajas-listo')).toHaveText('Listo');
    await expect(barra).toBeVisible();
    await expect(barra).toContainText('Tocá las cajas');

    // Un solo toque selecciona -- no abre el detalle ni nada más.
    await tarjetaEfectivo.click();
    await expect(tarjetaEfectivo).toHaveClass(/caja-card-seleccionada/);
    await expect(page.locator('#modal-detalle-caja')).toBeHidden();
    await expect(barra).toContainText('100.000');

    await tarjetaNequi.click();
    await expect(barra).toContainText('150.000');

    // Destocar Efectivo deja solo el saldo de Nequi.
    await tarjetaEfectivo.click();
    await expect(tarjetaEfectivo).not.toHaveClass(/caja-card-seleccionada/);
    await expect(barra).toContainText('50.000');
    await expect(barra).not.toContainText('150.000');

    // "Listo" apaga el modo, esconde la barra y limpia la selección.
    await page.locator('#btn-sumar-cajas-listo').click();
    await expect(page.locator('#btn-menu-cajas')).toBeVisible();
    await expect(barra).toBeHidden();
    await expect(tarjetaNequi).not.toHaveClass(/caja-card-seleccionada/);

    // Fuera del modo, el toque simple vuelve a no hacer nada (y el doble
    // toque abre el detalle, como siempre).
    await tarjetaNequi.click();
    await expect(page.locator('#modal-detalle-caja')).toBeHidden();
  });

  test('Sumar cajas: con monedas distintas muestra un total por cada moneda', async ({ page }) => {
    await mockGoogleApis(page, {
      'Cajas': [
        ['C1', 'prueba@example.com', 'Efectivo', 'COP'],
        ['C2', 'prueba@example.com', 'Dólares', 'USD'],
      ],
      'Movimiento de Caja': [
        ['M1', '2024-01-01', 'prueba@example.com', 'SURA', 'Ingreso', 'Efectivo', 100000, '', ''],
        ['M2', '2024-01-01', 'prueba@example.com', 'SURA', 'Ingreso', 'Dólares', 200, '', ''],
      ],
    });
    await iniciarSesionFalsa(page);
    await page.goto('/');
    await esperarAppLista(page);

    await page.locator('#btn-menu-cajas').click();
    await page.locator('#btn-sumar-cajas').click();
    await page.locator('.caja-card', { hasText: 'Efectivo' }).click();
    await page.locator('.caja-card', { hasText: 'Dólares' }).click();

    const barra = page.locator('#sumar-cajas-barra');
    await expect(barra.locator('.sumar-cajas-barra-total')).toHaveCount(2);
    await expect(barra).toContainText('100.000');
    await expect(barra).toContainText('200');
  });

  test('Sumar cajas: cambiar de pestaña con el modo activo lo apaga solo', async ({ page }) => {
    await mockGoogleApis(page, { 'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']] });
    await iniciarSesionFalsa(page);
    await page.goto('/');
    await esperarAppLista(page);

    await page.locator('#btn-menu-cajas').click();
    await page.locator('#btn-sumar-cajas').click();
    await page.locator('.caja-card', { hasText: 'Efectivo' }).click();
    await expect(page.locator('#sumar-cajas-barra')).toBeVisible();

    await page.locator('.nav-item[data-tab="movimientos"]:visible').first().click();
    await expect(page.locator('#sumar-cajas-barra')).toBeHidden();

    await page.locator('.nav-item[data-tab="cajas"]:visible').first().click();
    await expect(page.locator('#btn-menu-cajas')).toBeVisible();
    await expect(page.locator('.caja-card', { hasText: 'Efectivo' })).not.toHaveClass(/caja-card-seleccionada/);
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

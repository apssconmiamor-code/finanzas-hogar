// El gesto de volver (deslizar desde el borde izquierdo) lleva a la pantalla
// principal (Inicio/Cajas) desde cualquier módulo. Si hay algo abierto
// (modal, detalle de un bloque...), primero cierra eso -- un nivel atrás.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, usarAccionVista } = require('./helpers/googleMock');

async function deslizarParaVolver(page) {
  await page.evaluate(() => {
    const crearToque = (x, y) => new Touch({ identifier: Date.now(), target: document.body, clientX: x, clientY: y });
    const inicio = crearToque(10, 300);
    document.dispatchEvent(new TouchEvent('touchstart', { touches: [inicio], changedTouches: [inicio], bubbles: true, cancelable: true }));
    const fin = crearToque(160, 300);
    document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [fin], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
}

// WebKit no deja crear TouchEvent sintéticos ("Illegal constructor"), así que
// el gesto solo se puede simular en Chromium.
test.describe('Gesto de volver lleva a Inicio', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'TouchEvent sintético no disponible en WebKit');

  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page, { 'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']] });
    await iniciarSesionFalsa(page);
    await page.goto('/');
    await esperarAppLista(page);
  });

  for (const [tab, atajo] of [['movimientos', '#atajo-movimientos'], ['proyeccion', '#atajo-proyeccion'], ['notificaciones', '#atajo-alertas']]) {
    test(`desde ${tab} vuelve a la pantalla principal`, async ({ page }) => {
      await page.locator(atajo).click();
      await expect(page.locator(`#tab-${tab}`)).toBeVisible();
      await deslizarParaVolver(page);
      await expect(page.locator('#tab-cajas')).toBeVisible();
      await expect(page.locator(`#tab-${tab}`)).toBeHidden();
      await expect(page.locator('.nav-item[data-tab="cajas"]').first()).toHaveClass(/active/);
    });
  }

  test('con un modal abierto, el gesto cierra el modal primero y recién el siguiente vuelve a Inicio', async ({ page }) => {
    await page.locator('#atajo-movimientos').click();
    await usarAccionVista(page, 'btn-nuevo-gasto');
    await expect(page.locator('#modal-movimiento')).toBeVisible();
    await deslizarParaVolver(page);
    await expect(page.locator('#modal-movimiento')).toBeHidden();
    await expect(page.locator('#tab-movimientos')).toBeVisible();
    await deslizarParaVolver(page);
    await expect(page.locator('#tab-cajas')).toBeVisible();
  });

  test('estando en Inicio el gesto no hace nada', async ({ page }) => {
    await deslizarParaVolver(page);
    await expect(page.locator('#tab-cajas')).toBeVisible();
  });
});

// Arrastre en vivo: las dos pantallas siguen al dedo (a mitad de camino, 50%
// de cada una) y al soltar se confirma o se deshace. El ancho de la pantalla
// define el umbral, por eso se usa un viewport de celular.
test.describe("Gesto de volver: arrastre en vivo", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "TouchEvent sintético no disponible en WebKit");
  test.use({ viewport: { width: 390, height: 780 } });

  test.beforeEach(async ({ page }) => {
    await mockGoogleApis(page, { "Cajas": [["C1", "prueba@example.com", "Efectivo", "COP"]] });
    await iniciarSesionFalsa(page);
    await page.goto("/");
    await esperarAppLista(page);
    await page.locator("#atajo-movimientos").click();
    await expect(page.locator("#tab-movimientos")).toBeVisible();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const mk = (x, y) => new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y });
      window.__toque = {
        inicio: (x, y) => document.dispatchEvent(new TouchEvent("touchstart", { touches: [mk(x, y)], changedTouches: [mk(x, y)], bubbles: true, cancelable: true })),
        mover: (x, y) => document.dispatchEvent(new TouchEvent("touchmove", { touches: [mk(x, y)], changedTouches: [mk(x, y)], bubbles: true, cancelable: true })),
        fin: (x, y) => document.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [mk(x, y)], bubbles: true, cancelable: true })),
      };
    });
  });

  // Con pausas entre movimientos: eventos sintéticos sin tiempo entre sí se
  // leerían como un barrido ultrarrápido (que confirma sin importar la distancia).
  const arrastrarHasta = async (page, x) => {
    await page.evaluate(() => { window.__toque.inicio(10, 300); window.__toque.mover(40, 302); });
    await page.waitForTimeout(150);
    await page.evaluate((xf) => window.__toque.mover(xf, 305), x);
    await page.waitForTimeout(150);
  };

  test("a mitad de camino se ven las dos pantallas, mitad y mitad, sin cambiar de módulo todavía", async ({ page }) => {
    await arrastrarHasta(page, 205); // dx = 195 = la mitad de 390
    const estado = await page.evaluate(() => ({
      sale: document.getElementById("tab-movimientos").style.transform,
      entra: document.getElementById("tab-cajas").style.transform,
      inicioOculto: document.getElementById("tab-cajas").classList.contains("hidden"),
      activo: document.querySelector(".nav-item.active")?.dataset.tab,
    }));
    expect(estado.sale).toBe("translateX(195px)");
    expect(estado.entra).toBe("translateX(-195px)");
    expect(estado.inicioOculto).toBe(false);
    // Nada cambió de verdad todavía: la pestaña activa sigue siendo Movimientos.
    expect(estado.activo).toBe("movimientos");

    // Sigue al dedo: más a la derecha, más Inicio.
    await page.evaluate(() => window.__toque.mover(305, 305));
    await expect.poll(() => page.evaluate(() => document.getElementById("tab-cajas").style.transform)).toBe("translateX(-95px)");
  });

  test("soltar antes del umbral deshace: se queda en el módulo y nada queda a medias", async ({ page }) => {
    await arrastrarHasta(page, 80);   // dx = 70, bien por debajo del 40%
    await page.evaluate(() => window.__toque.fin(80, 305));
    await expect(page.locator("#tab-movimientos")).toBeVisible();
    await expect(page.locator("#tab-cajas")).toBeHidden();
    await expect(page.locator("#tab-movimientos")).toHaveCSS("position", "static");
    await expect(page.locator(".nav-item.active").first()).toHaveAttribute("data-tab", "movimientos");
  });

  test("soltar pasado el umbral completa: queda en Inicio y sin estilos de la transición", async ({ page }) => {
    await arrastrarHasta(page, 260);  // dx = 250, más del 40%
    await page.evaluate(() => window.__toque.fin(260, 305));
    await expect(page.locator("#tab-cajas")).toBeVisible();
    await expect(page.locator("#tab-movimientos")).toBeHidden();
    await expect(page.locator("#tab-cajas")).toHaveCSS("position", "static");
    await expect(page.locator(".nav-item.active").first()).toHaveAttribute("data-tab", "cajas");
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("un barrido rápido confirma aunque la distancia sea corta", async ({ page }) => {
    await page.evaluate(() => {
      window.__toque.inicio(10, 300);
      window.__toque.mover(40, 302);
      window.__toque.mover(110, 304);   // sin pausa: velocidad alta
      window.__toque.fin(110, 304);
    });
    await expect(page.locator("#tab-cajas")).toBeVisible();
    await expect(page.locator("#tab-movimientos")).toBeHidden();
  });
});

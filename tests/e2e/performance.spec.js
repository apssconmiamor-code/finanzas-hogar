// Verifica que la carga inicial de datos (cargarTodo) dispare sus lecturas
// independientes a Google Sheets EN PARALELO en vez de una por una. Antes,
// cajas/movimientos/presupuesto/proyeccion/prestamos se pedían en cadena
// (un await tras otro), así que con N llamadas de C ms cada una la carga
// tardaba ~N*C.
//
// La señal que se mide es la HORA DE INICIO de cada petición relativa a las
// demás (no el tiempo total de principio a fin): si dos peticiones son
// independientes y van en paralelo, arrancan casi al mismo instante; si van
// en cadena, la segunda arranca ~LATENCIA_MS después de la primera. Medir
// así evita que el test sea inestable por overhead del navegador/CI (carga
// de la página, inicialización de Face ID, etc.), que no tiene nada que ver
// con lo que se está probando.

const { test, expect } = require('@playwright/test');
const { mockGoogleApis, iniciarSesionFalsa, esperarAppLista } = require('./helpers/googleMock');

const LATENCIA_MS = 300;
const MARGEN_PARALELO_MS = 150; // peticiones que arrancan con menos de esto de diferencia se consideran "a la vez"

function nombreHoja(url) {
  const decoded = decodeURIComponent(url);
  const m = decoded.match(/\/values\/([^:?]+)/);
  return m ? m[1].split('!')[0] : null;
}

test.describe('Performance — carga inicial de datos', () => {
  test('las lecturas independientes a Sheets arrancan en paralelo', async ({ page }) => {
    await iniciarSesionFalsa(page);
    await mockGoogleApis(page, {
      'Cajas': [['C1', 'prueba@example.com', 'Efectivo', 'COP']],
      'Movimiento de Caja': [],
    });

    const inicios = {}; // nombre de hoja -> timestamp relativo de inicio
    let t0 = 0;

    // Se registra DESPUÉS del mock: Playwright prueba los handlers en orden
    // inverso de registro, así que este corre primero, espera, y con
    // route.fallback() deja que el handler del mock responda de verdad.
    await page.route('**sheets.googleapis.com/**', async (route) => {
      const hoja = nombreHoja(route.request().url());
      if (hoja && !(hoja in inicios)) inicios[hoja] = Date.now() - t0;
      await new Promise(r => setTimeout(r, LATENCIA_MS));
      await route.fallback();
    });

    t0 = Date.now();
    await page.goto('/');
    await esperarAppLista(page);
    // Espera a que la barra "Conectando…" desaparezca → cargarTodo() terminó.
    await page.waitForFunction(() => {
      const el = document.getElementById('conectando-bar');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });

    console.log('[perf] inicio de cada petición (ms desde goto):', inicios);

    // Wave 1: Cajas y Movimientos son lecturas independientes → deben arrancar
    // casi juntas, no una ~LATENCIA_MS después de la otra.
    expect(inicios['Cajas']).toBeDefined();
    expect(inicios['Movimiento de Caja']).toBeDefined();
    expect(Math.abs(inicios['Cajas'] - inicios['Movimiento de Caja'])).toBeLessThan(MARGEN_PARALELO_MS);

    // Wave 2: Presupuesto, Proyeccion y Prestamo no dependen entre sí →
    // deben arrancar casi juntas también, y su ola debe empezar DESPUÉS de
    // que cajas/movimientos ya hayan arrancado (respetan el orden real),
    // pero sin esperar LATENCIA_MS extra entre cada una de las tres.
    expect(inicios['Presupuesto']).toBeDefined();
    expect(inicios['Proyeccion']).toBeDefined();
    expect(inicios['Prestamo']).toBeDefined();
    expect(Math.abs(inicios['Presupuesto'] - inicios['Proyeccion'])).toBeLessThan(MARGEN_PARALELO_MS);
    expect(Math.abs(inicios['Presupuesto'] - inicios['Prestamo'])).toBeLessThan(MARGEN_PARALELO_MS);

    // La segunda ola no debería arrancar todavía en cadena separada por
    // LATENCIA_MS respecto a cada miembro de la primera — debe estar
    // claramente más cerca de "cajas+latencia" que de "cajas+3*latencia"
    // (que sería el caso si todo fuera secuencial).
    expect(inicios['Presupuesto'] - inicios['Cajas']).toBeLessThan(LATENCIA_MS * 2);
  });
});

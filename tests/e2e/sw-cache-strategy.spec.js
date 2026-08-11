// Bug real confirmado en producción (agosto 2026): el fetch handler de
// sw.js no excluía el dominio del Worker de sesión (finanzas-hogar-token)
// de la estrategia "cache-first" reservada para assets estáticos de la
// app. Como /token?email=... es siempre la MISMA url para la misma
// persona, el Service Worker guardaba la primera respuesta buena y la
// repetía para siempre — aunque el access_token real ya hubiera vencido
// (dura ~1h) — sin volver a tocar la red. Por eso "Reconectar" podía
// seguir fallando sin que apareciera NADA nuevo en los logs en vivo del
// Worker: la app nunca llegaba a preguntarle de verdad.
//
// No se puede probar esto como un e2e normal con page.route(): con el
// Service Worker activo, page.route() no intercepta lo que el propio SW
// pide desde su contexto (ver el comentario sobre serviceWorkers:'block'
// en playwright.config.js — ya mordió los mocks de Google antes por esto
// mismo). En vez de eso, esta prueba carga sw.js en un entorno mínimo
// simulado (sin navegador) y verifica el comportamiento real del handler.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cargarFetchHandler() {
  const codigo = fs.readFileSync(path.join(__dirname, '../../sw.js'), 'utf-8');
  const llamadas = { cachesMatch: [], fetch: [] };
  let fetchHandler = null;

  const fakeCache = {
    match: (req) => { llamadas.cachesMatch.push(req.url); return Promise.resolve(undefined); },
    put: () => Promise.resolve(),
    add: () => Promise.resolve(),
  };

  const sandbox = {
    self: { addEventListener: (tipo, handler) => { if (tipo === 'fetch') fetchHandler = handler; } },
    caches: {
      match: (req) => { llamadas.cachesMatch.push(req.url); return Promise.resolve(undefined); },
      open: () => Promise.resolve(fakeCache),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(),
    },
    fetch: (req) => {
      const url = typeof req === 'string' ? req : req.url;
      llamadas.fetch.push(url);
      return Promise.resolve({ clone: () => ({}) });
    },
    URL,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox, { filename: 'sw.js' });
  return { fetchHandler, llamadas };
}

async function dispararFetch(fetchHandler, url) {
  let respondWithPromise = null;
  fetchHandler({
    request: { url },
    respondWith: (p) => { respondWithPromise = p; },
  });
  await respondWithPromise;
}

test.describe('Estrategia de caché del Service Worker', () => {
  test('las peticiones al Worker de sesión nunca pasan por caches.match (siempre red)', async () => {
    const { fetchHandler, llamadas } = cargarFetchHandler();
    expect(fetchHandler).toBeTruthy();

    await dispararFetch(fetchHandler, 'https://finanzas-hogar-token.byco85.workers.dev/token?email=prueba@example.com');

    expect(llamadas.cachesMatch).toEqual([]);
    expect(llamadas.fetch).toContain('https://finanzas-hogar-token.byco85.workers.dev/token?email=prueba@example.com');
  });

  test('dos pedidos seguidos al Worker con la misma URL hacen DOS fetch reales (no uno cacheado)', async () => {
    const { fetchHandler, llamadas } = cargarFetchHandler();
    const url = 'https://finanzas-hogar-token.byco85.workers.dev/token?email=prueba@example.com';

    await dispararFetch(fetchHandler, url);
    await dispararFetch(fetchHandler, url);

    expect(llamadas.fetch.filter((u) => u === url)).toHaveLength(2);
    expect(llamadas.cachesMatch).toEqual([]);
  });

  test('los assets propios de la app siguen siendo cache-first (sin regresión)', async () => {
    const { fetchHandler, llamadas } = cargarFetchHandler();

    await dispararFetch(fetchHandler, 'http://127.0.0.1:4173/app.js');

    expect(llamadas.cachesMatch).toContain('http://127.0.0.1:4173/app.js');
  });

  test('Sheets sigue siendo network-first sin caché (sin regresión)', async () => {
    const { fetchHandler, llamadas } = cargarFetchHandler();

    await dispararFetch(fetchHandler, 'https://sheets.googleapis.com/v4/spreadsheets/ID/values/Cajas');

    expect(llamadas.cachesMatch).toEqual([]);
    expect(llamadas.fetch).toContain('https://sheets.googleapis.com/v4/spreadsheets/ID/values/Cajas');
  });
});

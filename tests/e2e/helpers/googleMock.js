// Mockea Google Sheets/Drive para que los tests E2E puedan ejercitar la app
// de verdad (crear cajas, movimientos, conceptos...) sin una cuenta de
// Google real. Guarda estado en memoria por hoja, así que un GET después de
// un POST/PUT refleja los cambios (igual que la hoja real).

const SHEET_NAMES = [
  'Cajas', 'Movimiento de Caja', 'Presupuesto', 'Cronologia',
  'Prestamo', 'Compras', 'Proyeccion', 'Recordatorios', 'Metas', 'Suscripciones',
  'Notificaciones',
];

function nombreHojaDesdeUrl(url) {
  const decoded = decodeURIComponent(url);
  const m = decoded.match(/\/values\/([^:?]+)/);
  if (!m) return null;
  const range = m[1];
  const nombre = range.split('!')[0];
  return SHEET_NAMES.find(n => n === nombre) || nombre;
}

/**
 * Intercepta las llamadas a Sheets/Drive/userinfo. `seed` puede traer filas
 * iniciales por hoja, ej: { 'Movimiento de Caja': [[...fila...]] }.
 * Devuelve el estado mutable (para inspeccionar en el propio test si hace falta).
 */
async function mockGoogleApis(page, seed = {}) {
  const estado = {};
  for (const nombre of SHEET_NAMES) estado[nombre] = (seed[nombre] || []).map(f => [...f]);

  // El beacon de diagnóstico (_diagBeacon en app.js, endpoint /diag del
  // Worker) no lo mockea ningún helper específico — sin esto, cualquier test
  // que dispare una renovación de token fallida manda tráfico real al Worker
  // en producción (pasó de verdad: contaminó los logs de Observability con
  // "sin_session"/"red_dos_intentos" para prueba@example.com). Se intercepta
  // acá porque es la función que llaman casi todos los tests, sin pisar los
  // mocks específicos de /token u /oauth/callback (rutas distintas).
  await page.route('**://finanzas-hogar-token.byco85.workers.dev/diag**', route =>
    route.fulfill({ status: 204 })
  );

  await page.route('**://accounts.google.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* google identity services mock: no-op */' })
  );

  await page.route('**://oauth2.googleapis.com/**', route => route.fulfill({ json: {} }));

  await page.route('**://www.googleapis.com/oauth2/v3/userinfo**', route =>
    route.fulfill({ json: { name: 'Usuario Prueba', email: 'prueba@example.com', picture: '' } })
  );

  await page.route('**://www.googleapis.com/upload/drive/**', route =>
    route.fulfill({ json: { id: 'FAKE_DRIVE_ID', webContentLink: 'https://example.com/fake.jpg' } })
  );

  await page.route('**://www.googleapis.com/drive/v3/files/**', route =>
    route.fulfill({ json: { id: 'FAKE_DRIVE_ID' } })
  );

  await page.route('**://sheets.googleapis.com/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // Metadata de la spreadsheet (existencia de hojas, sheetId para borrar filas)
    if (url.includes('fields=sheets.properties')) {
      return route.fulfill({
        json: { sheets: SHEET_NAMES.map((title, i) => ({ properties: { title, sheetId: i + 1 } })) }
      });
    }

    const hoja = nombreHojaDesdeUrl(url);

    if (method === 'GET') {
      return route.fulfill({ json: { values: estado[hoja] || [] } });
    }

    if (method === 'POST' && url.includes(':append')) {
      const body = JSON.parse(req.postData() || '{}');
      const fila = body.values && body.values[0];
      if (fila && estado[hoja]) estado[hoja].push(fila);
      return route.fulfill({ json: {} });
    }

    if (method === 'POST' && url.includes(':clear')) {
      if (estado[hoja]) estado[hoja].length = 0;
      return route.fulfill({ json: {} });
    }

    if (method === 'POST' && url.includes(':batchUpdate')) {
      // deleteDimension (borrar fila por índice) sí se aplica de verdad al
      // estado en memoria — necesario para probar "borrar X" de cualquier
      // módulo. La URL de :batchUpdate no trae el nombre de la hoja (no pasa
      // por /values/), así que se identifica por sheetId usando el mismo
      // índice que la metadata de arriba (sheetId = índice en SHEET_NAMES + 1).
      // Crear hoja nueva sigue sin ser crítico para los tests: se responde OK.
      const body = JSON.parse(req.postData() || '{}');
      for (const r of (body.requests || [])) {
        if (r.deleteDimension?.range?.dimension === 'ROWS') {
          const { sheetId, startIndex, endIndex } = r.deleteDimension.range;
          const nombreHoja = SHEET_NAMES[sheetId - 1];
          // startIndex/endIndex son índices de grilla (0 = fila de encabezado);
          // estado[hoja] solo tiene las filas de datos (sin encabezado), así
          // que hay que restar 1 para que coincida con la fila real a borrar.
          if (nombreHoja && estado[nombreHoja]) {
            estado[nombreHoja].splice(startIndex - 1, endIndex - startIndex);
          }
        }
      }
      return route.fulfill({ json: {} });
    }

    if (method === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      if (body.values && estado[hoja]) {
        estado[hoja].length = 0;
        estado[hoja].push(...body.values);
      }
      return route.fulfill({ json: {} });
    }

    return route.fulfill({ json: {} });
  });

  return estado;
}

// Simula que el usuario ya inició sesión (mismo mecanismo que usa la app:
// localStorage.guser + gtoken) para saltarse la pantalla de login/Face ID.
async function iniciarSesionFalsa(page) {
  await page.addInitScript(() => {
    localStorage.setItem('guser', JSON.stringify({
      name: 'Usuario Prueba', email: 'prueba@example.com', picture: ''
    }));
    localStorage.setItem('gtoken', 'FAKE_TOKEN');
  });
}

// window.onload de la app es async (varias await antes de setupEventListeners,
// que es lo que conecta los listeners de clic de toda la UI). goto() resuelve
// en cuanto dispara el evento "load", que puede ser ANTES de que esa cadena
// async termine — clicks hechos justo después no hacen nada. navegarATab solo
// existe una vez que setupEventListeners ya corrió, así que es una señal
// confiable de que la app ya está lista para interactuar.
async function esperarAppLista(page) {
  await page.waitForFunction(() => typeof window.navegarATab === 'function');
}

module.exports = { mockGoogleApis, iniciarSesionFalsa, esperarAppLista, SHEET_NAMES };

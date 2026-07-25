// Mockea el Worker (finanzas-hogar-token) para los tests E2E: el endpoint
// /token (renovación de sesión con el sessionToken guardado) y el flujo de
// popup + /oauth/callback (conexión inicial / "Reconectar").
//
// El popup NO se manda a accounts.google.com de verdad (no hay cuenta real
// en los tests) — se sobreescribe window.open() para que vaya directo al
// callback del Worker, que a su vez se mockea con la páginita HTML que hace
// postMessage, igual que el Worker real. Así el chequeo de
// `event.origin === new URL(CONFIG.WORKER_URL).origin` en
// conectarConGooglePopup() se cumple de verdad (el mensaje sale desde ese
// origin real, no uno simulado a mano).

const WORKER_URL = 'https://finanzas-hogar-token.byco85.workers.dev';

function htmlPostMessage(payload) {
  const json = JSON.stringify(Object.assign({ type: 'finanzas-oauth' }, payload));
  // El Worker real manda postMessage al origin de LA APP (env.ALLOWED_ORIGIN),
  // no al suyo propio — acá se usa "*" porque el server estático de los
  // tests corre en un puerto que puede variar; no afecta la seguridad real
  // (eso lo valida app.js del lado de RECEPCIÓN, comprobando que
  // event.origin sea el origin del Worker, que en este mock sigue siendo
  // el real gracias a que la respuesta se sirve desde esa URL interceptada).
  return `<!doctype html><html><body><script>
    if (window.opener) { window.opener.postMessage(${json}, "*"); }
    window.close();
  </script></body></html>`;
}

// Intercepta GET /token?email=... con éxito (200) o fallo (401).
async function mockWorkerToken(page, { disponible = true, accessToken = 'FAKE_ACCESS_TOKEN_WORKER' } = {}) {
  await page.context().route(`${WORKER_URL}/token**`, (route) => {
    if (disponible) {
      return route.fulfill({ json: { access_token: accessToken, expires_in: 3600 } });
    }
    return route.fulfill({ status: 401, json: { error: 'session_invalida' } });
  });
}

// Redirige cualquier popup abierto por conectarConGooglePopup() directo al
// callback del Worker (se salta la pantalla de consentimiento real de
// Google) y simula una conexión EXITOSA.
async function mockConexionGooglePopup(page, perfil = {}) {
  await page.addInitScript((workerUrl) => {
    const abrirReal = window.open.bind(window);
    window.open = (url, name, features) => abrirReal(`${workerUrl}/oauth/callback?code=FAKE_CODE`, name, features);
  }, WORKER_URL);

  const datos = Object.assign({
    access_token: 'FAKE_ACCESS_TOKEN_WORKER',
    expires_in: 3600,
    email: 'prueba@example.com',
    name: 'Usuario Prueba',
    picture: '',
    sessionToken: 'FAKE_SESSION_TOKEN'
  }, perfil);

  await page.context().route(`${WORKER_URL}/oauth/callback**`, (route) => {
    return route.fulfill({ status: 200, contentType: 'text/html', body: htmlPostMessage(datos) });
  });
}

// Igual, pero simula que el usuario canceló/falló el login con Google.
async function mockConexionGooglePopupFalla(page, error = 'access_denied') {
  await page.addInitScript((workerUrl) => {
    const abrirReal = window.open.bind(window);
    window.open = (url, name, features) => abrirReal(`${workerUrl}/oauth/callback?code=FAKE_CODE`, name, features);
  }, WORKER_URL);

  await page.context().route(`${WORKER_URL}/oauth/callback**`, (route) => {
    return route.fulfill({ status: 200, contentType: 'text/html', body: htmlPostMessage({ error }) });
  });
}

module.exports = { WORKER_URL, mockWorkerToken, mockConexionGooglePopup, mockConexionGooglePopupFalla };

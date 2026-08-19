// =============================================
// SERVICE WORKER — Finanzas Luni-Chuni
// =============================================

const CACHE_NAME = "finanzas-v128";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./sheets.js",
  "./sheets-offline.js",
  "./sync.js",
  "./prestamo.js",
  "./compras.js",
  "./recordatorios.js",
  "./notificaciones.js",
  "./badge.js",
  "./config.js",
  "./manifest.json",
  "./icono.png",
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap"
];

// ---- INSTALL: cachea todos los assets estáticos ----
// OJO: ya NO hace self.skipWaiting() automático — la nueva versión se
// queda "esperando" hasta que el usuario toque "Sincronizar" en la app
// (ver mensaje SKIP_WAITING más abajo), para que el usuario decida cuándo
// actualizar en vez de recargarse solo sin avisar.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cachea uno por uno para no fallar todo si uno falla
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch(() => console.warn("SW: no se pudo cachear", url))
        )
      );
    })
  );
});

// ---- ACTIVATE: limpia caches viejos ----
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- FETCH: estrategia según tipo de request ----
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Google Sheets / Gemini API → network-first, sin fallback de caché
  if (
    url.hostname === "sheets.googleapis.com" ||
    url.hostname === "generativelanguage.googleapis.com" ||
    url.hostname === "www.googleapis.com"
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Offline: devuelve respuesta vacía con flag para que la app sepa
        return new Response(
          JSON.stringify({ _offline: true }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // Worker de sesión (finanzas-hogar-token) → SIEMPRE red, nunca caché.
  // Bug real confirmado (agosto 2026): al no estar excluido acá, /token y
  // /diag caían en la regla "assets estáticos → cache-first" de más abajo.
  // Como /token?email=... siempre es la misma URL para la misma persona, el
  // Service Worker guardaba la PRIMERA respuesta buena y la repetía para
  // siempre — incluso después de que el access_token real ya había vencido
  // (dura ~1h) — sin volver a tocar la red. Por eso "Reconectar" podía
  // fallar una y otra vez sin que apareciera NADA nuevo en los logs del
  // Worker: la app nunca llegaba a preguntarle de verdad.
  if (url.hostname === "finanzas-hogar-token.byco85.workers.dev") {
    event.respondWith(fetch(event.request));
    return;
  }

  // Google fonts / scripts externos → stale-while-revalidate
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    url.hostname === "accounts.google.com"
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkPromise = fetch(event.request)
          .then((res) => { cache.put(event.request, res.clone()); return res; })
          .catch(() => null);
        return cached || await networkPromise;
      })
    );
    return;
  }

  // Assets estáticos propios → cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      });
    })
  );
});

// ---- BACKGROUND SYNC (cuando vuelve el internet) ----
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-movimientos") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "SYNC_REQUESTED" })
        );
      })
    );
  }
});

// ---- MENSAJE desde la app ----
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ---- PUSH: notificaciones del bloque "Notificaciones" ----
// El Cron Trigger del Worker (worker/src/push.js) manda el payload como
// JSON: { title, body }. Si por lo que sea no viene JSON válido, se
// muestra igual con un texto genérico en vez de fallar en silencio.
self.addEventListener("push", (event) => {
  let datos = { title: "Finanzas Luni-Chuni", body: "Tienes una notificación nueva" };
  try {
    if (event.data) datos = Object.assign(datos, event.data.json());
  } catch (e) { /* payload no era JSON — se usa el texto genérico de arriba */ }

  // setAppBadge() se llama SINCRÓNICO acá, en el mismo tick en el que llega
  // el evento push -- ni siquiera un microtask de por medio (a diferencia
  // del intento anterior, que lo hacía dentro de un .then() de
  // getNotifications() antes de mostrar la notificación). Sospecha: iOS
  // puede exigir que el badge se actualice en el mismo turno de ejecución
  // que produce la notificación visible, no en una promesa que se resuelve
  // después. El ejemplo oficial de WebKit hace exactamente esto.
  const tieneBadge = "setAppBadge" in self.navigator;
  const promesaBadge = tieneBadge ? self.navigator.setAppBadge(1).catch(() => {}) : Promise.resolve();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(datos.title, {
        body: datos.body,
        icon: "./icono.png",
        badge: "./icono.png",
        tag: datos.tag || undefined
      }),
      promesaBadge,
      // Corrección del número real (puede haber más de una notificación
      // pendiente) una vez que ya se disparó el badge inicial de arriba.
      tieneBadge
        ? self.registration.getNotifications().then((lista) => self.navigator.setAppBadge(lista.length).catch(() => {}))
        : Promise.resolve()
    ])
  );
});

// Al tocar la notificación, enfoca una pestaña ya abierta de la app o abre una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    Promise.all([
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
        const existente = clientsArr.find((c) => c.url.includes(self.registration.scope));
        if (existente) return existente.focus();
        return self.clients.openWindow("./index.html");
      }),
      _actualizarBadgeDesdeNotificaciones()
    ])
  );
});

// ---- BADGE DEL ÍCONO mientras la app está cerrada ----
// badge.js (ver index.html) recalcula el número sumando 4 módulos, pero
// solo corre cuando la app está ABIERTA — con la app cerrada nadie llama a
// esa función. Acá, en cambio, usamos la cantidad de notificaciones que
// ya están mostrándose en el centro de notificaciones del sistema como
// proxy en tiempo real: cada push nuevo sube el número, y al tocar/cerrar
// una notificación (arriba) baja solo. La API de badges cuelga de
// NavigatorBadge, que implementan Navigator Y WorkerNavigator -- dentro de
// un Service Worker es "self.navigator.setAppBadge()", NO
// "self.registration.setAppBadge()" (esa no existe ahí; el intento
// anterior fallaba en silencio por el catch de abajo). Cuando la app se
// vuelva a abrir, actualizarBadgeApp() en badge.js pisa este número con el
// total real (los otros 3 módulos que el Service Worker no puede ver).
function _actualizarBadgeDesdeNotificaciones() {
  if (!("setAppBadge" in self.navigator)) return Promise.resolve();
  return self.registration.getNotifications().then((lista) => {
    return lista.length > 0
      ? self.navigator.setAppBadge(lista.length)
      : self.navigator.clearAppBadge();
  }).catch(() => {});
}

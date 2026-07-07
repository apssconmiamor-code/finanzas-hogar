// =============================================
// SERVICE WORKER — Finanzas Hogar
// =============================================

const CACHE_NAME = "finanzas-v22";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./sheets.js",
  "./sheets-offline.js",
  "./gemini.js",
  "./sync.js",
  "./prestamo.js",
  "./compras.js",
  "./recordatorios.js",
  "./config.js",
  "./manifest.json",
  "./icon.png",
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap"
];

// ---- INSTALL: cachea todos los assets estáticos ----
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cachea uno por uno para no fallar todo si uno falla
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch(() => console.warn("SW: no se pudo cachear", url))
        )
      );
    }).then(() => self.skipWaiting())
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

// =============================================
// SW REGISTER — pegar en app.js al inicio de window.onload
// =============================================

// ---- REGISTRO DEL SERVICE WORKER ----
// Se auto-actualiza sola, pero solo en un momento seguro: recién al abrir
// la app "en frío" (recién se entró desde el ícono, todavía no se tocó
// nada) — nunca mientras la app ya está abierta y en uso, para no
// interrumpir algo a medio llenar (ej. un modal de movimiento). Por eso
// hay dos casos bien distintos más abajo:
//   1. reg.waiting YA existe apenas se registra el Service Worker -> quedó
//      lista de una sesión anterior (se cerró la app antes de aplicarla).
//      Este es el momento seguro: se aplica de una.
//   2. La versión nueva se instala DURANTE esta sesión (updatefound) -> NO
//      se aplica ahora aunque técnicamente sea "la misma carga de página",
//      porque para cuando termina de instalar (unos segundos después) el
//      usuario ya pudo haber empezado a tocar algo. Se guarda el momento
//      en que quedó lista y se aplica sola recién la próxima vez que se
//      abra la app de cero (que entonces cae en el caso 1).
if ("serviceWorker" in navigator) {
  const CLAVE_TS_LISTA = "sw_actualizacion_lista_en";

  let __swRefrescando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (__swRefrescando) return;
    __swRefrescando = true;
    location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      console.info("SW registrado:", reg.scope);

      if (reg.waiting && navigator.serviceWorker.controller) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            try { localStorage.setItem(CLAVE_TS_LISTA, String(Date.now())); } catch {}
          }
        });
      });

      // Revisa contra el servidor si hay una versión más nueva cada vez
      // que se abre la app (además del chequeo automático del navegador).
      reg.update().catch(() => {});
    } catch (err) {
      console.warn("SW no se pudo registrar:", err);
    }

    // DIAGNÓSTICO TEMPORAL (agosto 2026) -- ver el bloque espejo en el
    // handler "push" de sw.js. caches.match() busca en TODAS las caches
    // sin necesidad de saber el nombre versionado actual. Se avisa una
    // sola vez por dato nuevo (comparando el timestamp contra el último ya
    // mostrado) para no repetir el mismo alert en cada apertura.
    try {
      const CLAVE_ULTIMO_DEBUG_TS = "badge_debug_ultimo_ts";
      const resp = await caches.match("/__badge-debug__");
      if (resp) {
        const datos = await resp.json();
        const yaVisto = localStorage.getItem(CLAVE_ULTIMO_DEBUG_TS);
        if (String(datos.ts) !== yaVisto) {
          localStorage.setItem(CLAVE_ULTIMO_DEBUG_TS, String(datos.ts));
          console.info("[badge-debug]", datos);
          alert("🔍 Diagnóstico badge:\n" + JSON.stringify(datos, null, 2));
        }
      }
    } catch (e) {}
  });
}

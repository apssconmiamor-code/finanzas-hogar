// =============================================
// SW REGISTER — pegar en app.js al inicio de window.onload
// =============================================

// ---- REGISTRO DEL SERVICE WORKER ----
// Se auto-actualiza sola: cuando encuentra una versión nueva la aplica en cuanto
// hay un momento seguro, sin que nadie tenga que pedirlo (mantener presionada la
// versión en Inicio solo FUERZA la búsqueda ya mismo).
//
// "Momento seguro" = no hay un formulario/ventana abierta ni se está escribiendo
// en un campo -- recargar justo ahí perdería lo que se está llenando. Mientras no
// lo sea, la actualización queda lista y se aplica en cuanto se cierre la ventana
// o se salga del campo (se revisa cada pocos segundos).
//
// Cuándo se busca una versión nueva:
//   - al abrir la app,
//   - cada vez que la app vuelve a primer plano o recupera la conexión,
//   - y cada 15 minutos mientras está abierta.
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

      // ¿Es un buen momento para recargar? (ver el comentario de arriba)
      const esMomentoSeguro = () => {
        if (document.hidden) return true;                              // en segundo plano: nadie lo nota
        if (document.querySelector(".modal:not(.hidden)")) return false;  // hay una ventana/formulario abierto
        const a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false; // se está escribiendo
        return true;
      };
      const aplicarSiHayUna = () => {
        if (reg.waiting && navigator.serviceWorker.controller && esMomentoSeguro()) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      };

      aplicarSiHayUna();                       // quedó lista de una sesión anterior
      setInterval(aplicarSiHayUna, 4000);      // o termina de instalarse mientras se usa

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            try { localStorage.setItem(CLAVE_TS_LISTA, String(Date.now())); } catch {}
            aplicarSiHayUna();
          }
        });
      });

      // Revisa contra el servidor si hay una versión más nueva: al abrir, al volver
      // a primer plano, al recuperar conexión y cada 15 minutos (además del chequeo
      // automático del navegador, que en iOS es poco confiable).
      const revisar = () => { reg.update().catch(() => {}); };
      revisar();
      document.addEventListener("visibilitychange", () => { if (!document.hidden) revisar(); });
      window.addEventListener("online", revisar);
      setInterval(revisar, 15 * 60 * 1000);
    } catch (err) {
      console.warn("SW no se pudo registrar:", err);
    }
  });
}

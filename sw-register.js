// =============================================
// SW REGISTER — pegar en app.js al inicio de window.onload
// =============================================

// ---- REGISTRO DEL SERVICE WORKER ----
if ("serviceWorker" in navigator) {
  // Cuando el SW nuevo toma control (porque el usuario tocó "Sincronizar"),
  // recarga sola la página para que se vean los archivos actualizados.
  let __swRefrescando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (__swRefrescando) return;
    __swRefrescando = true;
    location.reload();
  });

  let __swEnEspera = null;

  window.__swSincronizarAhora = () => {
    if (__swEnEspera) __swEnEspera.postMessage({ type: "SKIP_WAITING" });
  };

  const notificarNuevaVersion = (worker) => {
    __swEnEspera = worker;
    if (typeof marcarActualizacionDisponible === "function") marcarActualizacionDisponible();
  };

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      console.info("SW registrado:", reg.scope);

      // Si ya había una versión nueva descargada de una visita anterior
      // (esperando a que el usuario la aplique), avisa de una vez.
      if (reg.waiting && navigator.serviceWorker.controller) {
        notificarNuevaVersion(reg.waiting);
      }

      // Detecta una versión nueva instalándose ahora
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            notificarNuevaVersion(newWorker);
          }
        });
      });

      // Revisa contra el servidor si hay una versión más nueva cada vez
      // que se abre la app (además del chequeo automático del navegador).
      reg.update().catch(() => {});
    } catch (err) {
      console.warn("SW no se pudo registrar:", err);
    }
  });
}

// =============================================
// SW REGISTER — pegar en app.js al inicio de window.onload
// =============================================

// ---- REGISTRO DEL SERVICE WORKER ----
if ("serviceWorker" in navigator) {
  // Cuando el SW nuevo toma control, recarga sola la página para que
  // se vean los archivos actualizados sin depender de que el usuario
  // note el aviso y recargue manualmente.
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

      // Detecta nueva versión disponible
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            SyncManager.mostrarToast("🔄 Actualizando a la última versión…");
          }
        });
      });
    } catch (err) {
      console.warn("SW no se pudo registrar:", err);
    }
  });
}

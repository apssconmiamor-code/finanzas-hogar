// =============================================
// SYNC — Cola offline + sincronización automática
// =============================================
// Guarda operaciones fallidas en IndexedDB y las
// reintenta cuando vuelve la conexión.

const SyncManager = (() => {
  const DB_NAME    = "finanzas-sync";
  const DB_VERSION = 1;
  const STORE      = "pendientes";

  let db = null;

  // ---- INIT IndexedDB ----
  async function initDB() {
    if (db) return db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const store = e.target.result.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
      };
      req.onsuccess  = (e) => { db = e.target.result; resolve(db); };
      req.onerror    = ()  => reject(new Error("No se pudo abrir IndexedDB"));
    });
  }

  // ---- ENCOLAR operación ----
  async function encolar(operacion) {
    await initDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req   = store.add({
        ...operacion,
        timestamp: Date.now(),
        intentos:  0
      });
      req.onsuccess = () => { resolve(req.result); actualizarBadge(); };
      req.onerror   = () => reject(new Error("Error encolando operación"));
    });
  }

  // ---- OBTENER pendientes ----
  async function getPendientes() {
    await initDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req   = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(new Error("Error leyendo pendientes"));
    });
  }

  // ---- BORRAR operación procesada ----
  async function borrarPendiente(id) {
    await initDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req   = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(new Error("Error borrando pendiente"));
    });
  }

  // ---- CONTAR pendientes ----
  async function contarPendientes() {
    await initDB();
    return new Promise((resolve) => {
      const tx    = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req   = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(0);
    });
  }

  // ---- ACTUALIZAR badge en UI ----
  async function actualizarBadge() {
    const n   = await contarPendientes();
    const el  = document.getElementById("sync-badge");
    const bar = document.getElementById("sync-bar");
    if (!el || !bar) return;

    if (n > 0) {
      el.textContent  = n;
      el.classList.remove("hidden");
      bar.classList.remove("hidden");
      bar.querySelector("#sync-pendientes-count").textContent =
        `${n} cambio${n > 1 ? "s" : ""} pendiente${n > 1 ? "s" : ""} de sincronizar`;
    } else {
      el.classList.add("hidden");
      bar.classList.add("hidden");
    }
  }

  // ---- SINCRONIZAR todos los pendientes ----
  async function sincronizar() {
    if (!navigator.onLine) return;

    const pendientes = await getPendientes();
    if (pendientes.length === 0) return;

    const bar = document.getElementById("sync-bar");
    if (bar) {
      bar.querySelector("#sync-pendientes-count").textContent =
        `Sincronizando ${pendientes.length} cambio${pendientes.length > 1 ? "s" : ""}...`;
    }

    let ok = 0;
    let fail = 0;

    for (const op of pendientes) {
      try {
        await ejecutarOperacion(op);
        await borrarPendiente(op.id);
        ok++;
      } catch (err) {
        console.warn("Sync: error en operación", op.tipo, err.message);
        fail++;
      }
    }

    await actualizarBadge();

    if (ok > 0) {
      mostrarToast(`✅ ${ok} cambio${ok > 1 ? "s" : ""} sincronizado${ok > 1 ? "s" : ""}`);
      // Recargar datos frescos desde Sheets
      if (typeof cargarTodo === "function") await cargarTodo();
    }

    if (fail > 0) {
      mostrarToast(`⚠️ ${fail} cambio${fail > 1 ? "s" : ""} no se pudieron sincronizar`, "warn");
    }
  }

  // ---- EJECUTAR operación según tipo ----
  async function ejecutarOperacion(op) {
    switch (op.tipo) {
      case "AGREGAR_MOVIMIENTO":
        return Sheets.agregarMovimiento(
          op.autor, op.fecha, op.concepto,
          op.categoria, op.caja, op.monto, op.descripcion
        );
      case "AGREGAR_MOVIMIENTO_INGRESO":
        return Sheets.agregarMovimientoIngreso(
          op.autor, op.fecha, op.concepto,
          op.categoria, op.caja, op.monto, op.descripcion
        );
      case "EDITAR_MOVIMIENTO":
        return Sheets.editarMovimiento(
          op.remoteId, op.fecha, op.concepto,
          op.categoria, op.caja, op.monto, op.descripcion
        );
      case "BORRAR_MOVIMIENTO":
        return Sheets.borrarMovimiento(op.remoteId);
      case "GUARDAR_PRESUPUESTO":
        return Sheets.guardarPresupuesto(op.filas);
      default:
        throw new Error("Tipo de operación desconocido: " + op.tipo);
    }
  }

  // ---- TOAST de notificación ----
  function mostrarToast(msg, tipo = "ok") {
    let toast = document.getElementById("sync-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "sync-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className   = `sync-toast sync-toast-${tipo} visible`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("visible"), 3500);
  }

  // ---- SETUP: listeners de conectividad ----
  function setup() {
    window.addEventListener("online",  () => {
      mostrarToast("🌐 Conexión restaurada — sincronizando...");
      // Pequeño delay para que la red estabilice antes de reintentar nada.
      setTimeout(() => {
        sincronizar();
        // Si se cayó la red mientras la app mostraba "Reconectar" (sesión sin
        // renovar), no hacía falta que la persona tocara el botón ella misma
        // al volver la conexión — sincronizar() solo atiende cambios
        // offline pendientes, no la sesión. Si el aviso sigue visible,
        // reintenta la reconexión sola apenas vuelve internet.
        const reconectarBar = document.getElementById("reconectar-bar");
        if (reconectarBar && !reconectarBar.classList.contains("hidden") &&
            typeof reconectarGoogle === "function") {
          reconectarGoogle();
        }
      }, 1000);
    });

    window.addEventListener("offline", () => {
      mostrarToast("📴 Sin conexión — los cambios se guardarán localmente", "warn");
    });

    // Escucha mensajes del Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SYNC_REQUESTED") sincronizar();
      });
    }

    // Actualiza badge al cargar
    actualizarBadge();
  }

  return { encolar, sincronizar, actualizarBadge, mostrarToast, setup, contarPendientes };
})();

// ---- Inicializar cuando el DOM esté listo ----
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", SyncManager.setup);
} else {
  SyncManager.setup();
}

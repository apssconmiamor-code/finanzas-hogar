// =============================================
// SHEETS OFFLINE PATCH
// =============================================
// Añade este archivo DESPUÉS de sheets.js en el HTML.
// Envuelve los métodos de escritura de Sheets para que,
// cuando no haya internet, encolen la operación en IndexedDB
// y la ejecuten cuando vuelva la conexión.
//
// También añade una capa de caché local (sessionStorage)
// para lecturas, de modo que la app funcione offline.

(function patchSheetsOffline() {

  // ---- CACHÉ DE LECTURA (sessionStorage) ----
  const CACHE_KEYS = {
    cajas:       "cache_cajas",
    movimientos: "cache_movimientos",
    presupuesto: "cache_presupuesto",
    cronologia:  "cache_cronologia",
  };

  function guardarCache(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify(data)); } catch {}
  }

  function leerCache(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ---- PARCHE getCajas ----
  const _getCajas = Sheets.getCajas.bind(Sheets);
  Sheets.getCajas = async function () {
    try {
      const data = await _getCajas();
      guardarCache(CACHE_KEYS.cajas, data);
      return data;
    } catch (err) {
      if (err.message === "TOKEN_EXPIRADO") throw err;
      const cached = leerCache(CACHE_KEYS.cajas);
      if (cached) { console.info("Sheets offline: usando caché de cajas"); return cached; }
      throw err;
    }
  };

  // ---- PARCHE getMovimientos ----
  const _getMovimientos = Sheets.getMovimientos.bind(Sheets);
  Sheets.getMovimientos = async function () {
    try {
      const data = await _getMovimientos();
      guardarCache(CACHE_KEYS.movimientos, data);
      return data;
    } catch (err) {
      if (err.message === "TOKEN_EXPIRADO") throw err;
      const cached = leerCache(CACHE_KEYS.movimientos);
      if (cached) { console.info("Sheets offline: usando caché de movimientos"); return cached; }
      throw err;
    }
  };

  // ---- PARCHE getPresupuesto ----
  const _getPresupuesto = Sheets.getPresupuesto.bind(Sheets);
  Sheets.getPresupuesto = async function () {
    try {
      const data = await _getPresupuesto();
      guardarCache(CACHE_KEYS.presupuesto, data);
      return data;
    } catch (err) {
      if (err.message === "TOKEN_EXPIRADO") throw err;
      const cached = leerCache(CACHE_KEYS.presupuesto);
      if (cached) { console.info("Sheets offline: usando caché de presupuesto"); return cached; }
      return [];
    }
  };

  // ---- PARCHE getCronologia ----
  const _getCronologia = Sheets.getCronologia.bind(Sheets);
  Sheets.getCronologia = async function () {
    try {
      const data = await _getCronologia();
      guardarCache(CACHE_KEYS.cronologia, data);
      return data;
    } catch (err) {
      if (err.message === "TOKEN_EXPIRADO") throw err;
      const cached = leerCache(CACHE_KEYS.cronologia);
      if (cached) { console.info("Sheets offline: usando caché de cronología"); return cached; }
      return [];
    }
  };

  // ---- HELPER: intenta online, si falla encola ----
  async function intentarOEncolar(operacionOnline, operacionCola) {
    if (!navigator.onLine) {
      await SyncManager.encolar(operacionCola);
      SyncManager.mostrarToast("💾 Guardado localmente — se sincronizará al reconectar", "warn");
      return "_OFFLINE_" + Date.now();
    }
    try {
      return await operacionOnline();
    } catch (err) {
      if (err.message === "TOKEN_EXPIRADO") throw err;
      // Fallo de red aunque onLine=true → encolar
      await SyncManager.encolar(operacionCola);
      SyncManager.mostrarToast("💾 Guardado localmente — se sincronizará al reconectar", "warn");
      return "_OFFLINE_" + Date.now();
    }
  }

  // ---- PARCHE agregarMovimiento ----
  const _agregarMovimiento = Sheets.agregarMovimiento.bind(Sheets);
  Sheets.agregarMovimiento = async function (autor, fecha, concepto, categoria, caja, monto, descripcion = "", recibo = "") {
    return intentarOEncolar(
      () => _agregarMovimiento(autor, fecha, concepto, categoria, caja, monto, descripcion, recibo),
      { tipo: "AGREGAR_MOVIMIENTO", autor, fecha, concepto, categoria, caja, monto, descripcion }
    );
  };

  // ---- PARCHE agregarMovimientoIngreso ----
  const _agregarMovimientoIngreso = Sheets.agregarMovimientoIngreso.bind(Sheets);
  Sheets.agregarMovimientoIngreso = async function (autor, fecha, concepto, categoria, caja, monto, descripcion = "", recibo = "") {
    return intentarOEncolar(
      () => _agregarMovimientoIngreso(autor, fecha, concepto, categoria, caja, monto, descripcion, recibo),
      { tipo: "AGREGAR_MOVIMIENTO_INGRESO", autor, fecha, concepto, categoria, caja, monto, descripcion }
    );
  };

  // ---- PARCHE editarMovimiento ----
  const _editarMovimiento = Sheets.editarMovimiento.bind(Sheets);
  Sheets.editarMovimiento = async function (id, fecha, concepto, categoria, caja, monto, descripcion = "") {
    return intentarOEncolar(
      () => _editarMovimiento(id, fecha, concepto, categoria, caja, monto, descripcion),
      { tipo: "EDITAR_MOVIMIENTO", remoteId: id, fecha, concepto, categoria, caja, monto, descripcion }
    );
  };

  // ---- PARCHE borrarMovimiento ----
  const _borrarMovimiento = Sheets.borrarMovimiento.bind(Sheets);
  Sheets.borrarMovimiento = async function (id) {
    return intentarOEncolar(
      () => _borrarMovimiento(id),
      { tipo: "BORRAR_MOVIMIENTO", remoteId: id }
    );
  };

  // ---- PARCHE guardarPresupuesto ----
  const _guardarPresupuesto = Sheets.guardarPresupuesto.bind(Sheets);
  Sheets.guardarPresupuesto = async function (filas) {
    return intentarOEncolar(
      () => _guardarPresupuesto(filas),
      { tipo: "GUARDAR_PRESUPUESTO", filas }
    );
  };

  console.info("✅ Sheets offline patch aplicado");
})();

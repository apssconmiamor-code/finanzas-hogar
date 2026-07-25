// =============================================
// GOOGLE SHEETS — Lectura y escritura
// =============================================
// Columnas hoja Movimientos:
// A: id | B: fecha | C: autor | D: concepto | E: categoria | F: caja | G: monto | H: descripcion | I: recibo

const Sheets = {
  token: null,
  setToken(t) { this.token = t; },

  url(range) {
    return `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  },

  async leer(rango) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(this.url(rango) + "?valueRenderOption=UNFORMATTED_VALUE", {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
      if (!res.ok) throw new Error(`Error leyendo ${rango}: ${res.status}`);
      const data = await res.json();
      return data.values || [];
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") throw new Error("TIMEOUT");
      throw err;
    }
  },

  // Renovación fire-and-forget disparada por cualquier llamada a Sheets que
  // reciba un 401 fuera del flujo principal de cargarTodo() (ej. cargarPrestamos,
  // cargarCompras). Usa el mismo backend que renovarTokenSilencioso() de
  // app.js (Worker con refresh_token guardado por usuario) — ya trae su
  // propio timeout, así que esta función no necesita el suyo.
  _renovarToken() {
    const raw = localStorage.getItem("guser");
    if (!raw) {
      document.getElementById("app")?.classList.add("hidden");
      document.getElementById("faceid-screen")?.classList.add("hidden");
      document.getElementById("login-screen")?.classList.remove("hidden");
      return;
    }
    let user;
    try { user = JSON.parse(raw); } catch (e) { return; }

    if (typeof renovarTokenDesdeWorker !== "function") return;
    renovarTokenDesdeWorker(user.email).then((ok) => {
      if (ok) {
        cargarTodo();
      } else {
        if (typeof SyncManager !== "undefined")
          SyncManager.mostrarToast("📴 Sin conexión con Google — mostrando datos guardados", "warn");
        if (typeof mostrarReconectar === "function") mostrarReconectar();
      }
    });
  },

  async agregar(hoja, fila) {
    const range = `${hoja}!A1`;
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [fila] })
      }
    );
    if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
    if (!res.ok) throw new Error(`Error guardando en ${hoja}: ${res.status}`);
    return res.json();
  },

  _serialToDate(valor) {
    if (!valor) return "";
    if (typeof valor === "string" && valor.includes("-")) return valor;
    const serial = Number(valor);
    if (isNaN(serial)) return String(valor);
    return new Date((serial - 25569) * 86400 * 1000).toISOString().split("T")[0];
  },

  // ---- CAJAS ----
  async getCajas() {
    const rows = await this.leer(`${CONFIG.SHEETS.CAJAS}!A2:D`);
    return rows.filter(r => r && r[0]).map(r => ({
      id: r[0] || "", usuario: r[1] || "", nombre: r[2] || "", moneda: r[3] || "COP"
    }));
  },

  async agregarCaja(usuario, nombre, moneda) {
    const id = "C" + Date.now();
    await this.agregar(CONFIG.SHEETS.CAJAS, [id, usuario, nombre, moneda]);
    return id;
  },

  // ---- MOVIMIENTOS ----
  async getMovimientos() {
    const rows = await this.leer(`${CONFIG.SHEETS.MOVIMIENTOS}!A2:I`);
    return rows.filter(r => r && r[0]).map(r => ({
      id:          r[0] || "",
      fecha:       Sheets._serialToDate(r[1]),
      autor:       r[2] || "",
      concepto:    r[3] || "",
      categoria:   r[4] || "",
      caja:        r[5] || "",
      monto:       isNaN(parseFloat(r[6])) ? 0 : parseFloat(r[6]),
      descripcion: r[7] || "",
      recibo:      r[8] || ""
    }));
  },

  async agregarMovimiento(autor, fecha, concepto, categoria, caja, monto, descripcion = "", recibo = "") {
    const id = "M" + Date.now();
    await this.agregar(CONFIG.SHEETS.MOVIMIENTOS, [id, fecha, autor, concepto, categoria, caja, monto, descripcion, recibo]);
    return id;
  },

  async agregarMovimientoIngreso(autor, fecha, concepto, categoria, caja, monto, descripcion = "", recibo = "") {
    await new Promise(r => setTimeout(r, 5));
    const id = "M" + Date.now();
    await this.agregar(CONFIG.SHEETS.MOVIMIENTOS, [id, fecha, autor, concepto, categoria, caja, monto, descripcion, recibo]);
    return id;
  },

  // ---- EDITAR MOVIMIENTO ----
  async editarMovimiento(id, fecha, concepto, categoria, caja, monto, descripcion = "", recibo = null) {
    const rows = await this.leer(`${CONFIG.SHEETS.MOVIMIENTOS}!A2:I`);
    const rowIndex = rows.findIndex(r => r[0] === id);
    if (rowIndex === -1) throw new Error("Movimiento no encontrado");
    const sheetRow = rowIndex + 2;
    const autor = rows[rowIndex][2] || "";
    // Si no se pasa recibo explícito, conserva el que ya estaba guardado
    const reciboFinal = recibo === null ? (rows[rowIndex][8] || "") : recibo;
    const range = `${CONFIG.SHEETS.MOVIMIENTOS}!B${sheetRow}:I${sheetRow}`;
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [[fecha, autor, concepto, categoria, caja, monto, descripcion, reciboFinal]] })
      }
    );
    if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
    if (!res.ok) throw new Error(`Error editando: ${res.status}`);
    return res.json();
  },

  // ---- BORRAR MOVIMIENTO ----
  async borrarMovimiento(id) {
    const rows = await this.leer(`${CONFIG.SHEETS.MOVIMIENTOS}!A2:A`);
    const rowIndex = rows.findIndex(r => r[0] === id);
    if (rowIndex === -1) throw new Error("Movimiento no encontrado");
    const sheetRowIndex = rowIndex + 1;

    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
    const meta = await metaRes.json();
    const sheet = meta.sheets.find(s => s.properties.title === CONFIG.SHEETS.MOVIMIENTOS);
    if (!sheet) throw new Error("Hoja de movimientos no encontrada");
    const sheetId = sheet.properties.sheetId;

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: sheetRowIndex,
                endIndex: sheetRowIndex + 1
              }
            }
          }]
        })
      }
    );
    if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
    if (!res.ok) throw new Error(`Error borrando: ${res.status}`);
    return res.json();
  }
};

// ---- GOOGLE DRIVE (fotos y audios de recordatorios/movimientos) ----
// Requiere el scope drive.file — solo da acceso a archivos que la app misma crea.
Sheets.subirArchivoDrive = async function (dataURL, nombreArchivo, mimeType) {
  const blob = await (await fetch(dataURL)).blob();
  const tipoFinal = mimeType || blob.type || "application/octet-stream";
  const metadata = { name: nombreArchivo, mimeType: tipoFinal };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webContentLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: form
    }
  );
  if (uploadRes.status === 401 || uploadRes.status === 403) {
    throw new Error("DRIVE_SIN_PERMISO");
  }
  if (!uploadRes.ok) throw new Error(`Error subiendo archivo a Drive: ${uploadRes.status}`);
  const archivo = await uploadRes.json();

  // Editable para cualquiera que tenga el link, sin importar la cuenta de Google.
  // Tiene que ser "writer" y no "reader": si otra persona de la familia (con
  // una cuenta distinta a la que subió el archivo) borra el recordatorio o el
  // movimiento, necesita permiso de escritura para poder borrar el archivo de
  // Drive — con solo "ver" el borrado le sería rechazado en silencio y el
  // archivo quedaría huérfano en la cuenta original.
  // Si esto falla (p. ej. la cuenta de Google es de una organización que bloquea
  // compartir "cualquiera con el link"), el archivo queda privado y no se podrá
  // ver desde otro dispositivo — por eso se revisa la respuesta en vez de ignorarla.
  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${archivo.id}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "writer", type: "anyone" })
  });
  if (!permRes.ok) {
    const detalle = await permRes.text().catch(() => "");
    console.warn("No se pudo hacer público el archivo en Drive:", permRes.status, detalle);
    throw new Error("DRIVE_SIN_PERMISO_PUBLICO");
  }

  // Este link público sirve como referencia/backup, pero para mostrarlo dentro
  // de la app se usa obtenerBlobUrlDrive (descarga autenticada) porque el link
  // directo de Drive no siempre carga bien dentro de <img>/<audio>.
  const url = `https://drive.google.com/uc?export=view&id=${archivo.id}`;
  return { id: archivo.id, url };
};

// Descarga el archivo autenticado (con el token del usuario actual) y lo
// entrega como blob: URL local — mucho más confiable para <img>/<audio> que
// enlazar directo a drive.google.com, que a veces devuelve una página de
// Google en vez de los bytes reales del archivo.
Sheets.obtenerBlobUrlDrive = async function (fileId) {
  if (!fileId) return null;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${this.token}` }
  });
  if (res.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!res.ok) throw new Error(`Error descargando archivo de Drive: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

Sheets.borrarArchivoDrive = async function (fileId) {
  if (!fileId) return;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.token}` }
    });
    // No se lanza error (es una limpieza best-effort que no debe bloquear el
    // flujo principal), pero sí se deja registro para poder diagnosticar
    // archivos huérfanos si el borrado es rechazado por permisos.
    if (!res.ok && res.status !== 404) {
      console.warn(`No se pudo borrar el archivo de Drive ${fileId}: ${res.status}`);
    }
  } catch (err) {
    console.warn(`Error de red borrando archivo de Drive ${fileId}:`, err);
  }
};

Sheets.idDesdeUrlDrive = function (url) {
  if (!url) return null;
  const m = url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
};

// ---- PRESUPUESTO ----
Sheets.getPresupuesto = async function() {
  const rows = await this.leer(`${CONFIG.SHEETS.PRESUPUESTO}!A2:E`);
  return rows.filter(r => r && r[0]).map(r => ({
    categoria:        r[0] || "",
    concepto:         r[1] || "",
    montoEstimado:    isNaN(parseFloat(r[2])) ? 0 : parseFloat(r[2]),
    ingresoEstimado:  isNaN(parseFloat(r[3])) ? 0 : parseFloat(r[3]),
    icono:            r[4] || "",
  }));
};

Sheets.guardarPresupuesto = async function(filas) {
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.PRESUPUESTO + "!A2:E")}:clear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }
    }
  );
  if (!clearRes.ok) throw new Error(`Error limpiando presupuesto: ${clearRes.status}`);
  if (filas.length === 0) return;
  const values = filas.map(f => [f.categoria, f.concepto, f.montoEstimado, f.ingresoEstimado || 0, f.icono || ""]);
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.PRESUPUESTO + "!A2")}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values })
    }
  );
  if (!writeRes.ok) throw new Error(`Error guardando presupuesto: ${writeRes.status}`);
  return writeRes.json();
};

// ---- CRONOLOGIA ----
Sheets.getCronologia = async function() {
  const rows = await this.leer(`${CONFIG.SHEETS.CRONOLOGIA}!A2:F`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:              r[0] || "",
    mes:             r[1] || "",
    fijoAsertividad: isNaN(parseFloat(r[2])) ? 0 : parseFloat(r[2]),
    fijoCantidad:    isNaN(parseFloat(r[3])) ? 0 : parseFloat(r[3]),
    varAsertividad:  isNaN(parseFloat(r[4])) ? 0 : parseFloat(r[4]),
    varCantidad:     isNaN(parseFloat(r[5])) ? 0 : parseFloat(r[5]),
  }));
};

Sheets.guardarCronologia = async function(mes, fijoAser, fijoCant, varAser, varCant) {
  const id = "CR" + Date.now();
  await this.agregar(CONFIG.SHEETS.CRONOLOGIA, [id, mes, fijoAser, fijoCant, varAser, varCant]);
  return id;
};

// ---- PROYECCION ----
// Estructura hoja Proyeccion:
// A: tipo ("mes_lista" | "ingreso" | "gasto")
// B: mes  ("2026-06")
// C: clave (fuente o concepto)
// D: valor (monto numérico)
Sheets.getProyeccion = async function() {
  const rows = await this.leer(`${CONFIG.SHEETS.PROYECCION}!A2:D`);
  const meses    = [];
  const ingresos = {};
  const gastos   = {};

  rows.filter(r => r && r[0]).forEach(r => {
    const tipo  = r[0];
    const mes   = r[1] || "";
    const clave = r[2] || "";
    const valor = isNaN(parseFloat(r[3])) ? 0 : parseFloat(r[3]);

    if (tipo === "mes_lista" && mes) {
      meses.push(mes);
    } else if (tipo === "ingreso" && mes && clave && valor > 0) {
      if (!ingresos[mes]) ingresos[mes] = {};
      ingresos[mes][clave] = valor;
    } else if (tipo === "gasto" && mes && clave && valor > 0) {
      if (!gastos[mes]) gastos[mes] = {};
      gastos[mes][clave] = valor;
    }
  });

  return { meses, ingresos, gastos };
};

Sheets.guardarProyeccion = async function(meses, ingresos, gastos) {
  const values = [];
  meses.forEach(mes => values.push(["mes_lista", mes, "", ""]));
  Object.entries(ingresos).forEach(([mes, fuentes]) => {
    Object.entries(fuentes).forEach(([fuente, monto]) => {
      if (monto > 0) values.push(["ingreso", mes, fuente, monto]);
    });
  });
  Object.entries(gastos).forEach(([mes, conceptos]) => {
    Object.entries(conceptos || {}).forEach(([concepto, monto]) => {
      if (monto > 0) values.push(["gasto", mes, concepto, monto]);
    });
  });

  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.PROYECCION + "!A2:D")}:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" } }
  );
  if (clearRes.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!clearRes.ok) throw new Error(`Error limpiando proyeccion: ${clearRes.status}`);
  if (values.length === 0) return;

  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.PROYECCION + "!A2")}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values })
    }
  );
  if (!writeRes.ok) throw new Error(`Error guardando proyeccion: ${writeRes.status}`);
  return writeRes.json();
};

// ---- METAS DE AHORRO ----
// Columnas: A=id | B=nombre | C=icono | D=cajaId | E=objetivo | F=fechaLimite | G=estrategia | H=estrategiaValor
Sheets.getMetas = async function() {
  const rows = await this.leer(`${CONFIG.SHEETS.METAS}!A2:H`);
  return rows.filter(r => r && r[0]).map(r => ({
    id:              r[0] || "",
    nombre:          r[1] || "",
    icono:           r[2] || "🎯",
    cajaId:          r[3] || "",
    objetivo:        isNaN(parseFloat(r[4])) ? 0 : parseFloat(r[4]),
    fechaLimite:     r[5] || "",
    estrategia:      r[6] || "calculada",
    estrategiaValor: isNaN(parseFloat(r[7])) ? 0 : parseFloat(r[7]),
    submetas:        []
  }));
};

Sheets.guardarMetas = async function(metas) {
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.METAS + "!A2:H")}:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" } }
  );
  if (clearRes.status === 401) { Sheets._renovarToken(); throw new Error("TOKEN_EXPIRADO"); }
  if (!clearRes.ok) throw new Error(`Error limpiando metas: ${clearRes.status}`);
  if (metas.length === 0) return;

  const values = metas.map(m => [
    m.id, m.nombre, m.icono || "🎯", m.cajaId,
    m.objetivo || 0, m.fechaLimite || "",
    m.estrategia || "calculada", m.estrategiaValor || 0
  ]);

  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.METAS + "!A2")}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values })
    }
  );
  if (!writeRes.ok) throw new Error(`Error guardando metas: ${writeRes.status}`);
  return writeRes.json();
};

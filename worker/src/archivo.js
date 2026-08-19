// =============================================
// ARCHIVO — mueve movimientos viejos fuera de la hoja principal
// =============================================
// Pedido real: la hoja "Movimiento de Caja" crece para siempre y la app
// lee TODA la hoja en cada apertura (Sheets.getMovimientos()); con años de
// uso familiar eso se vuelve cada vez más pesado de cargar. Solución
// acordada: la app solo necesita ver el detalle de los últimos 3 meses —
// lo anterior se resume y se saca de la hoja activa.
//
// El Cron Trigger (cada 5 min, ver scheduled() en index.js) revisa si hay
// movimientos con fecha anterior al corte de 3 meses:
//   1. Los copia tal cual a la hoja "Movimiento de Caja - Archivo" (nada
//      se pierde — solo cambia de hoja).
//   2. Sube el "saldo_archivado" de cada caja afectada en la hoja "Cajas"
//      con el neto (entradas - salidas) de lo que se archiva, para que el
//      saldo de la caja siga siendo exacto sin tener que sumar el
//      historial completo (ver calcularSaldoCaja en app.js).
//   3. Borra esas filas de la hoja activa.
//
// Salvaguarda importante: un mes SOLO se archiva si ya tiene una fila en
// la hoja "Cronologia" (el cierre mensual que arma la app al abrirla, ver
// verificarYGuardarCronologia() en app.js). Así, si por lo que sea nadie
// abrió la app en meses, el archivado espera en vez de borrar datos de un
// mes que la app todavía no alcanzó a resumir.

import { obtenerAccessTokenAutonomo } from "./push.js";

const HOJA_MOVIMIENTOS = "Movimiento de Caja";
const HOJA_ARCHIVO = "Movimiento de Caja - Archivo";
const HOJA_CAJAS = "Cajas";
const HOJA_CRONOLOGIA = "Cronologia";
const MESES_A_RETENER = 3;

// ---- Funciones puras (sin red) ----

// Corte = primer día del mes que queda MÁS ATRÁS entre los que se retienen.
// Con mesesARetener=3 y "ahora" en agosto, retiene jun/jul/ago -> corta en
// 1 de junio (todo lo anterior a esa fecha es candidato a archivar).
export function calcularFechaCorte(ahora, mesesARetener = MESES_A_RETENER) {
  const anio = ahora.getUTCFullYear();
  const mes = ahora.getUTCMonth();
  return new Date(Date.UTC(anio, mes - (mesesARetener - 1), 1)).toISOString().slice(0, 10);
}

// Solo se archiva lo anterior al corte Y cuyo mes ya quedó resumido en Cronologia.
export function filasElegiblesParaArchivar(filas, fechaCorte, mesesConCronologia) {
  return filas.filter((f) => f.fecha < fechaCorte && mesesConCronologia.has(f.fecha.slice(0, 7)));
}

// Mismo criterio que calcularSaldoCaja() en app.js: entrada si es Ingreso o
// el lado "que llega" de una Transferencia; salida en cualquier otro caso.
export function calcularDeltasPorCaja(filas) {
  const deltas = {};
  for (const f of filas) {
    const esEntrada = f.categoria === "Ingreso" ||
      (f.categoria === "Transferencia" && String(f.concepto).startsWith("Transferencia ←"));
    const monto = esEntrada ? f.monto : -Math.abs(f.monto);
    deltas[f.caja] = (deltas[f.caja] || 0) + monto;
  }
  return deltas;
}

// ---- Orquestación (con red) ----

export async function archivarMovimientosViejos(env) {
  const auth = await obtenerAccessTokenAutonomo(env);
  if (!auth) {
    console.log("archivo_movimientos: sin ningún refresh_token utilizable, se salta este ciclo");
    return;
  }

  let filas;
  try {
    filas = await leerMovimientos(auth.accessToken, env);
  } catch (e) {
    console.log("archivo_movimientos: no se pudo leer Movimiento de Caja:", e.message);
    return;
  }
  if (filas.length === 0) return;

  let cronologia;
  try {
    cronologia = await leerCronologia(auth.accessToken, env);
  } catch (e) {
    console.log("archivo_movimientos: no se pudo leer Cronologia:", e.message);
    return;
  }
  const mesesConCronologia = new Set(cronologia.map((c) => c.mes));

  const fechaCorte = calcularFechaCorte(new Date());
  const elegibles = filasElegiblesParaArchivar(filas, fechaCorte, mesesConCronologia);
  if (elegibles.length === 0) return;

  const deltas = calcularDeltasPorCaja(elegibles);

  try {
    await agregarFilasArchivo(auth.accessToken, env, elegibles);
    await aplicarDeltasSaldoArchivado(auth.accessToken, env, deltas);
    await borrarFilasMovimientos(auth.accessToken, env, elegibles);
    console.log(`archivo_movimientos: ${elegibles.length} movimiento(s) archivado(s) (corte ${fechaCorte})`);
  } catch (e) {
    console.log("archivo_movimientos: error archivando:", e.message);
  }
}

// ---- Lectura/escritura directa a Sheets (el Worker no tiene acceso a sheets.js del frontend) ----

async function leerMovimientos(accessToken, env) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(HOJA_MOVIMIENTOS + "!A2:I")}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Error leyendo Movimiento de Caja: ${res.status}`);
  const data = await res.json();
  const rows = data.values || [];
  return rows.filter((r) => r && r[0]).map((r, i) => ({
    id: r[0] || "", fecha: r[1] || "", autor: r[2] || "", concepto: r[3] || "",
    categoria: r[4] || "", caja: r[5] || "",
    monto: isNaN(parseFloat(r[6])) ? 0 : parseFloat(r[6]),
    descripcion: r[7] || "", recibo: r[8] || "",
    _fila: i, _raw: r
  }));
}

async function leerCronologia(accessToken, env) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(HOJA_CRONOLOGIA + "!A2:B")}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  // La hoja puede no existir todavía (nadie cerró un mes aún) — no hay nada que archivar entonces.
  if (!res.ok) return [];
  const data = await res.json();
  const rows = data.values || [];
  return rows.filter((r) => r && r[0]).map((r) => ({ id: r[0] || "", mes: r[1] || "" }));
}

async function obtenerMetadataHojas(accessToken, env) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Error obteniendo metadata: ${res.status}`);
  const meta = await res.json();
  return meta.sheets;
}

async function asegurarHojaArchivo(accessToken, env) {
  const hojas = await obtenerMetadataHojas(accessToken, env);
  if (hojas.some((s) => s.properties.title === HOJA_ARCHIVO)) return;

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: HOJA_ARCHIVO } } }] })
    }
  );
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(HOJA_ARCHIVO + "!A1")}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [["id", "fecha", "autor", "concepto", "categoria", "caja", "monto", "descripcion", "recibo"]] })
    }
  );
}

async function agregarFilasArchivo(accessToken, env, elegibles) {
  await asegurarHojaArchivo(accessToken, env);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(HOJA_ARCHIVO + "!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: elegibles.map((f) => f._raw) })
    }
  );
  if (!res.ok) throw new Error(`Error copiando a ${HOJA_ARCHIVO}: ${res.status}`);
}

// Sube (o crea) la columna E "saldo_archivado" de cada caja afectada.
async function aplicarDeltasSaldoArchivado(accessToken, env, deltas) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(HOJA_CAJAS + "!A2:E")}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Error leyendo Cajas: ${res.status}`);
  const data = await res.json();
  const rows = data.values || [];

  for (const [nombreCaja, delta] of Object.entries(deltas)) {
    const idx = rows.findIndex((r) => r && r[2] === nombreCaja);
    if (idx === -1) continue; // caja borrada de Cajas pero con movimientos viejos -- no hay dónde anclar el saldo
    const saldoActual = isNaN(parseFloat(rows[idx][4])) ? 0 : parseFloat(rows[idx][4]);
    const sheetRow = idx + 2;
    const putRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(`${HOJA_CAJAS}!E${sheetRow}`)}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [[saldoActual + delta]] })
      }
    );
    if (!putRes.ok) throw new Error(`Error actualizando saldo_archivado de ${nombreCaja}: ${putRes.status}`);
  }
}

async function borrarFilasMovimientos(accessToken, env, elegibles) {
  const hojas = await obtenerMetadataHojas(accessToken, env);
  const sheet = hojas.find((s) => s.properties.title === HOJA_MOVIMIENTOS);
  if (!sheet) return;
  const sheetId = sheet.properties.sheetId;

  // De mayor a menor índice para que borrar una fila no corra los índices
  // de las que todavía faltan borrar dentro del mismo batchUpdate.
  const indices = elegibles.map((f) => f._fila + 1).sort((a, b) => b - a); // +1 por encabezado
  const requests = indices.map((sheetRowIndex) => ({
    deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: sheetRowIndex, endIndex: sheetRowIndex + 1 } }
  }));

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests })
    }
  );
  if (!res.ok) throw new Error(`Error borrando movimientos archivados: ${res.status}`);
}

// =============================================
// PUSH — Suscripciones y envío de notificaciones (Web Push + VAPID)
// =============================================
// Tres piezas:
//  - POST /push/subscribe   → guarda la suscripción push de un dispositivo
//  - POST /push/unsubscribe → la borra
//  - scheduled() (Cron Trigger, cada 5 min) → lee la hoja "Notificaciones"
//    del Sheets compartido, ve cuáles ya vencieron, y les manda el push a
//    quien corresponda (el creador o toda la familia).
//
// El Worker no tiene sesión de ningún usuario en particular cuando corre
// por el Cron — para poder leer/escribir la hoja usa el refresh_token de
// CUALQUIER persona de la familia ya guardado en REFRESH_TOKENS (todas
// comparten la misma hoja, así que cualquier token sirve).

import { deserializeVapidKeys, sendPushNotification, fromBase64Url } from "web-push-browser";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const HOJA_NOTIFICACIONES = "Notificaciones";
// SIN "mailto:" -- sendPushNotification (web-push-browser) se lo agrega
// solo adentro de createJWT(). Ponerlo acá también producía un claim "sub"
// con "mailto:mailto:..." -- Apple lo rechazaba con 403 BadJwtToken (bug
// real, causa raíz de que las notificaciones nunca llegaran).
const VAPID_CONTACTO = "byco85@gmail.com";
// Cuántos días se deja una notificación "cancelada" (revisada) en la hoja
// antes de borrarla sola -- así la lista de Notificaciones no se llena de
// filas viejas ya resueltas, pero igual queda un rato por si hace falta
// consultarla.
const DIAS_ANTES_DE_BORRAR_REVISADAS = 15;

// ---- /push/subscribe: guarda la suscripción de este dispositivo ----
export async function handlePushSubscribe(request, env, payload) {
  const body = await request.json().catch(() => null);
  if (!body?.subscription?.endpoint || !body.subscription.keys) {
    return jsonResponse({ error: "falta_subscription" }, 400);
  }

  const email = payload.email;
  const actuales = await obtenerSuscripciones(env, email);
  const sinDuplicado = actuales.filter((s) => s.endpoint !== body.subscription.endpoint);
  sinDuplicado.push({
    endpoint: body.subscription.endpoint,
    keys: body.subscription.keys,
    guardadoEl: Date.now()
  });
  await env.PUSH_SUBS.put(email, JSON.stringify(sinDuplicado));
  return jsonResponse({ ok: true, dispositivos: sinDuplicado.length });
}

// ---- /push/unsubscribe: borra la suscripción de este dispositivo ----
export async function handlePushUnsubscribe(request, env, payload) {
  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return jsonResponse({ error: "falta_endpoint" }, 400);

  const email = payload.email;
  const actuales = await obtenerSuscripciones(env, email);
  const restantes = actuales.filter((s) => s.endpoint !== endpoint);
  if (restantes.length > 0) {
    await env.PUSH_SUBS.put(email, JSON.stringify(restantes));
  } else {
    await env.PUSH_SUBS.delete(email);
  }
  return jsonResponse({ ok: true });
}

// DIAGNÓSTICO TEMPORAL (agosto 2026): dispara un push real a este mismo
// dispositivo sin esperar al Cron ni depender de la hoja Notificaciones --
// ver el botón espejo "Enviar notificación de prueba" en notificaciones.js.
// Sacar junto con ese botón y el bloque de debug en sw.js/sw-register.js en
// cuanto se identifique por qué no aparece el badge en iOS.
export async function handlePushTest(request, env, payload) {
  const email = payload.email;
  const cuerpo = JSON.stringify({ title: "🔔 Prueba de badge", body: "Notificación de prueba manual" });
  const huboExito = await enviarPushATodos(env, [email], cuerpo);
  return jsonResponse({ ok: huboExito });
}

async function obtenerSuscripciones(env, email) {
  const raw = await env.PUSH_SUBS.get(email);
  if (!raw) return [];
  try { return JSON.parse(raw) || []; } catch { return []; }
}

// =============================================
// CRON: revisa notificaciones vencidas y las manda
// =============================================

export async function revisarYEnviarNotificaciones(env) {
  const auth = await obtenerAccessTokenAutonomo(env);
  if (!auth) {
    console.log("cron_notificaciones: sin ningún refresh_token utilizable, se salta este ciclo");
    return;
  }

  let filas;
  try {
    filas = await leerNotificaciones(auth.accessToken, env);
  } catch (e) {
    // La hoja puede no existir todavía si nadie usó el bloque de
    // Notificaciones — no es un error real, solo no hay nada que revisar.
    console.log("cron_notificaciones: no se pudo leer la hoja (probablemente no existe aún):", e.message);
    return;
  }

  const ahora = new Date();
  let enviadas = 0;

  for (const fila of filas) {
    let esRecordatorioDeSeguimiento = false;

    if (fila.estado === "activa") {
      if (!estaVencida(fila, ahora)) continue;
    } else if (fila.estado === "enviada" && fila.recordar_en_dias) {
      // Campo opcional "recordar_en_dias": si quedó sin revisar, insiste
      // cada tantos días en vez de desaparecer para siempre en silencio.
      // Aplica tanto a "unica" como a recurrentes que lo hayan activado.
      if (!tocaRecordatorioDeSeguimiento(fila, ahora)) continue;
      esRecordatorioDeSeguimiento = true;
    } else {
      continue;
    }

    const destinatarios = fila.destinatario === "familia"
      ? await todosLosEmailsConSuscripcion(env)
      : [fila.autor];

    const payload = JSON.stringify({
      title: (esRecordatorioDeSeguimiento ? "🔁 " : "") + (fila.titulo || "Finanzas Luni-Chuni"),
      body: fila.mensaje || ""
    });

    const huboExito = await enviarPushATodos(env, destinatarios, payload);
    // Si el envío falló para todos los destinatarios (ej. VAPID mal configurado),
    // no se marca como enviada — así el Cron la vuelve a intentar en el próximo
    // ciclo en vez de darla por hecha en silencio.
    if (!huboExito) continue;
    enviadas++;

    const cambios = { ultimo_envio: ahora.toISOString() };
    // "enviada", no "cancelada"/"activa" todavía: se queda esperando a que
    // alguien la marque como revisada desde la app (ver
    // marcarNotificacionRevisada en notificaciones.js) — así no desaparece
    // ni vuelve a su ciclo sin que nadie se entere de que ya disparó. Un
    // recordatorio de seguimiento no cambia el estado, solo actualiza
    // ultimo_envio (reinicia la cuenta de "recordar_en_dias").
    //
    // Las "unica" SIEMPRE pasan por revisión (es lo único que las saca de
    // en medio). Las recurrentes solo pasan por "enviada" si activaron
    // "recordar_en_dias" -- si no, se quedan "activa" y disparan solas en
    // su próximo ciclo como siempre, sin depender de que nadie las revise
    // (si dependieran de eso, olvidarse de revisar una rompería la
    // repetición para siempre).
    if (!esRecordatorioDeSeguimiento && debeQuedarEnRevision(fila)) cambios.estado = "enviada";
    await actualizarNotificacion(auth.accessToken, env, fila, cambios);
  }

  if (enviadas > 0) console.log(`cron_notificaciones: ${enviadas} notificación(es) enviada(s)`);

  // Limpieza: notificaciones "cancelada" (ya revisadas) hace más de
  // DIAS_ANTES_DE_BORRAR_REVISADAS días se borran solas de la hoja. Se
  // borra de atrás para adelante (mayor _fila primero) porque borrar una
  // fila corre hacia arriba el índice de todas las que están debajo --
  // borrando de atrás para adelante, el índice de las que faltan por
  // borrar no cambia.
  const paraBorrar = filas
    .filter((f) => debeBorrarsePorRevisada(f, ahora))
    .sort((a, b) => b._fila - a._fila);
  for (const fila of paraBorrar) {
    try {
      await borrarNotificacionPorFila(auth.accessToken, env, fila);
    } catch (e) {
      console.log("cron_notificaciones: error borrando revisada vieja", fila.id, e.message);
    }
  }
  if (paraBorrar.length > 0) {
    console.log(`cron_notificaciones: ${paraBorrar.length} notificación(es) revisada(s) borrada(s) tras ${DIAS_ANTES_DE_BORRAR_REVISADAS} días`);
  }
}

// ---- ¿Ya pasaron los días suficientes desde que se revisó como para
// borrarla sola? Solo aplica a "cancelada" (ver debeQuedarEnRevision +
// marcarNotificacionRevisada en notificaciones.js) -- usa "revisado_en" si
// existe, o "ultimo_envio" como respaldo para filas viejas que se
// cancelaron antes de que existiera ese campo. Exportada para pruebas
// unitarias, igual que las demás. ----
export function debeBorrarsePorRevisada(fila, ahora) {
  if (fila.estado !== "cancelada") return false;
  const referencia = fila.revisado_en || fila.ultimo_envio;
  if (!referencia) return false;
  const fecha = new Date(referencia);
  if (isNaN(fecha.getTime())) return false;
  const limite = new Date(fecha.getTime() + DIAS_ANTES_DE_BORRAR_REVISADAS * 86400000);
  return ahora >= limite;
}

// ---- ¿Esta notificación debe quedar "enviada" (pendiente de revisión) en
// vez de volver directo a su ciclo normal? ----
// "unica" siempre (es lo único que la saca de en medio, ver
// marcarNotificacionRevisada). Una recurrente SOLO si activó
// "recordar_en_dias" -- si no, seguiría exactamente igual que antes de que
// existiera este campo: dispara y se queda "activa", lista para su
// próximo ciclo, sin depender de que nadie la revise.
export function debeQuedarEnRevision(fila) {
  return fila.tipo === "unica" || !!fila.recordar_en_dias;
}

// ---- ¿Toca reenviar como recordatorio de seguimiento? ----
// Campo opcional "recordar_en_dias": una notificación "unica" que quedó
// en "enviada" (sin que nadie la marcara como revisada) se vuelve a
// mandar cada tantos días desde el último envío -- reinicia la cuenta en
// cada reenvío, así que sigue insistiendo hasta que se revise o se borre.
// Exportada para poder probarla con pruebas unitarias, igual que estaVencida.
export function tocaRecordatorioDeSeguimiento(fila, ahora) {
  const dias = parseInt(fila.recordar_en_dias, 10);
  if (!dias || dias <= 0) return false;
  if (!fila.ultimo_envio) return false;
  const ultimo = new Date(fila.ultimo_envio);
  if (isNaN(ultimo.getTime())) return false;
  const proximo = new Date(ultimo.getTime() + dias * 86400000);
  return ahora >= proximo;
}

// Mapeo de los tipos viejos (de antes de que existiera repetición
// personalizada tipo Recordatorios de iPhone) a la nueva pareja
// intervalo+unidad -- así las filas que ya existían en la hoja antes de
// este cambio siguen funcionando exactamente igual, sin necesitar migrar
// datos. "unica" no pasa por acá.
const UNIDAD_LEGADO = { diaria: "dia", semanal: "semana", mensual: "mes" };

function _normalizarRecurrencia(fila) {
  const unidad = fila.unidad || UNIDAD_LEGADO[fila.tipo] || "dia";
  const intervalo = Math.max(1, parseInt(fila.intervalo, 10) || 1);
  return { unidad, intervalo };
}

// ---- ¿Ya toca mandar esta notificación? ----
// Exportada (además de usarse internamente) para poder probar la lógica de
// fechas con pruebas unitarias reales — es la parte con más riesgo de bugs
// silenciosos de todo este módulo.
export function estaVencida(fila, ahora) {
  const anchor = new Date(fila.fecha_hora);
  if (isNaN(anchor.getTime())) return false;

  if (fila.fecha_limite) {
    const limite = new Date(fila.fecha_limite + "T23:59:59Z");
    if (!isNaN(limite.getTime()) && ahora > limite) return false;
  }

  if (fila.tipo === "unica") {
    return !fila.ultimo_envio && ahora >= anchor;
  }

  // Recurrentes: ya pasada la hora del ancla, todavía no enviada hoy, y le
  // toca según intervalo+unidad (equivalente al picker "Repetir cada N
  // día/semana/mes/año" de Recordatorios de iPhone).
  const yaEnviadaHoy = fila.ultimo_envio &&
    new Date(fila.ultimo_envio).toISOString().slice(0, 10) === ahora.toISOString().slice(0, 10);
  if (yaEnviadaHoy) return false;

  const horaYaLlego =
    ahora.getUTCHours() > anchor.getUTCHours() ||
    (ahora.getUTCHours() === anchor.getUTCHours() && ahora.getUTCMinutes() >= anchor.getUTCMinutes());
  if (!horaYaLlego) return false;

  const { unidad, intervalo } = _normalizarRecurrencia(fila);
  const diaAncla   = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  const diaAhora   = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  const diasDesdeAncla = Math.round((diaAhora - diaAncla) / 86400000);
  if (diasDesdeAncla < 0) return false;

  if (unidad === "dia") {
    return diasDesdeAncla % intervalo === 0;
  }
  if (unidad === "semana") {
    if (ahora.getUTCDay() !== anchor.getUTCDay()) return false;
    return Math.round(diasDesdeAncla / 7) % intervalo === 0;
  }
  if (unidad === "mes") {
    const mesesDesdeAncla = (ahora.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (ahora.getUTCMonth() - anchor.getUTCMonth());
    if (mesesDesdeAncla % intervalo !== 0) return false;
    const ultimoDiaMesActual = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 0)).getUTCDate();
    const diaObjetivo = Math.min(anchor.getUTCDate(), ultimoDiaMesActual);
    return ahora.getUTCDate() === diaObjetivo;
  }
  if (unidad === "anio") {
    const aniosDesdeAncla = ahora.getUTCFullYear() - anchor.getUTCFullYear();
    if (aniosDesdeAncla % intervalo !== 0) return false;
    return ahora.getUTCMonth() === anchor.getUTCMonth() && ahora.getUTCDate() === anchor.getUTCDate();
  }
  return false;
}

// ---- Consigue un access_token sin depender de ningún usuario conectado
// en ese momento — prueba los refresh_token guardados hasta que uno sirva. ----
export async function obtenerAccessTokenAutonomo(env) {
  const lista = await env.REFRESH_TOKENS.list();
  for (const clave of lista.keys) {
    const refreshToken = await env.REFRESH_TOKENS.get(clave.name);
    if (!refreshToken) continue;
    try {
      const res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          grant_type: "refresh_token"
        })
      });
      const data = await res.json();
      if (res.ok && data.access_token) return { accessToken: data.access_token, email: clave.name };
    } catch (e) { /* prueba con el siguiente */ }
  }
  return null;
}

// ---- Leer/escribir la hoja Notificaciones directo (el Worker no tiene
// acceso a sheets.js del frontend, así que repite las llamadas mínimas). ----
async function leerNotificaciones(accessToken, env) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(HOJA_NOTIFICACIONES + "!A2:P")}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Error leyendo Notificaciones: ${res.status}`);
  const data = await res.json();
  const rows = data.values || [];
  return rows.filter((r) => r && r[0]).map((r) => ({
    id: r[0] || "", titulo: r[1] || "", mensaje: r[2] || "", tipo: r[3] || "unica",
    fecha_hora: r[4] || "", fecha_limite: r[5] || "", destinatario: r[6] || "yo",
    autor: r[7] || "", estado: r[8] || "activa", ultimo_envio: r[9] || "",
    intervalo: r[10] || "", unidad: r[11] || "", gasto_fijo: r[12] || "",
    recordar_en_dias: r[13] || "", revisado_en: r[14] || "", categoria: r[15] || "",
    _fila: rows.indexOf(r)
  }));
}

async function actualizarNotificacion(accessToken, env, fila, cambios) {
  const sheetRow = fila._fila + 2; // +1 por encabezado, +1 porque A2 es índice 0
  const nuevaFila = [
    fila.id, fila.titulo, fila.mensaje, fila.tipo, fila.fecha_hora, fila.fecha_limite,
    fila.destinatario, fila.autor,
    cambios.estado ?? fila.estado,
    cambios.ultimo_envio ?? fila.ultimo_envio,
    fila.intervalo, fila.unidad, fila.gasto_fijo, fila.recordar_en_dias, fila.revisado_en,
    fila.categoria
  ];
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(`${HOJA_NOTIFICACIONES}!A${sheetRow}:P${sheetRow}`)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [nuevaFila] })
    }
  );
}

// ---- Borra definitivamente una fila de la hoja Notificaciones (limpieza
// de revisadas viejas, ver DIAS_ANTES_DE_BORRAR_REVISADAS). ----
async function borrarNotificacionPorFila(accessToken, env, fila) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) throw new Error(`Error obteniendo metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const sheet = meta.sheets.find((s) => s.properties.title === HOJA_NOTIFICACIONES);
  if (!sheet) return;
  const sheetId = sheet.properties.sheetId;
  const sheetRowIndex = fila._fila + 1; // +1 por encabezado (índices de grid, base 0)

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: sheetRowIndex, endIndex: sheetRowIndex + 1 } }
        }]
      })
    }
  );
  if (!res.ok) throw new Error(`Error borrando notificación: ${res.status}`);
}

async function todosLosEmailsConSuscripcion(env) {
  const lista = await env.PUSH_SUBS.list();
  return lista.keys.map((k) => k.name);
}

// ---- Manda el push de verdad a cada dispositivo de cada email dado.
// Si el navegador ya no reconoce la suscripción (404/410 = se desinstaló o
// se revocó el permiso), la borra sola en vez de seguir intentando para
// siempre. Devuelve true si al menos un dispositivo recibió el push. ----
export async function enviarPushATodos(env, emails, payloadJson) {
  const vapidKeys = await deserializeVapidKeys({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  });

  let huboExito = false;

  for (const email of emails) {
    const subs = await obtenerSuscripciones(env, email);
    if (subs.length === 0) continue;

    const vivas = [];
    for (const sub of subs) {
      try {
        const res = await sendPushNotification(
          vapidKeys,
          { endpoint: sub.endpoint, keys: sub.keys },
          VAPID_CONTACTO,
          payloadJson
        );
        if (res.ok || res.status === 201) {
          vivas.push(sub);
          huboExito = true;
        } else if (res.status !== 404 && res.status !== 410) {
          // Error temporal (5xx, etc.) — no la borramos, puede servir la próxima vez.
          vivas.push(sub);
          const cuerpo = await res.text().catch(() => "");
          console.log("push_fallo_temporal", email, res.status, cuerpo.slice(0, 300));
        } else {
          console.log("push_suscripcion_vencida_borrada", email);
        }
      } catch (e) {
        vivas.push(sub); // error de red del propio Worker — no culpa de la suscripción
        console.log("push_error_envio", email, e.message);
      }
    }
    if (vivas.length !== subs.length) {
      if (vivas.length > 0) await env.PUSH_SUBS.put(email, JSON.stringify(vivas));
      else await env.PUSH_SUBS.delete(email);
    }
  }

  return huboExito;
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

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
const VAPID_CONTACTO = "mailto:byco85@gmail.com";

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
    if (fila.estado !== "activa") continue;
    if (!estaVencida(fila, ahora)) continue;

    const destinatarios = fila.destinatario === "familia"
      ? await todosLosEmailsConSuscripcion(env)
      : [fila.autor];

    const payload = JSON.stringify({
      title: fila.titulo || "Finanzas Luni-Chuni",
      body: fila.mensaje || ""
    });

    const huboExito = await enviarPushATodos(env, destinatarios, payload);
    // Si el envío falló para todos los destinatarios (ej. VAPID mal configurado),
    // no se marca como enviada — así el Cron la vuelve a intentar en el próximo
    // ciclo en vez de darla por hecha en silencio.
    if (!huboExito) continue;
    enviadas++;

    const cambios = { ultimo_envio: ahora.toISOString() };
    if (fila.tipo === "unica") cambios.estado = "cancelada"; // ya cumplió su único propósito
    await actualizarNotificacion(auth.accessToken, env, fila, cambios);
  }

  if (enviadas > 0) console.log(`cron_notificaciones: ${enviadas} notificación(es) enviada(s)`);
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

  const yaEnviadaHoy = fila.ultimo_envio &&
    new Date(fila.ultimo_envio).toISOString().slice(0, 10) === ahora.toISOString().slice(0, 10);

  if (fila.tipo === "unica") {
    return !fila.ultimo_envio && ahora >= anchor;
  }

  // Recurrentes: mismo día-de-la-semana / día-del-mes que el ancla, ya
  // pasada la hora, y todavía no enviada hoy.
  if (yaEnviadaHoy) return false;
  const horaYaLlego =
    ahora.getUTCHours() > anchor.getUTCHours() ||
    (ahora.getUTCHours() === anchor.getUTCHours() && ahora.getUTCMinutes() >= anchor.getUTCMinutes());
  if (!horaYaLlego) return false;

  if (fila.tipo === "diaria") return true;
  if (fila.tipo === "semanal") return ahora.getUTCDay() === anchor.getUTCDay();
  if (fila.tipo === "mensual") {
    const ultimoDiaMesActual = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 0)).getUTCDate();
    const diaObjetivo = Math.min(anchor.getUTCDate(), ultimoDiaMesActual);
    return ahora.getUTCDate() === diaObjetivo;
  }
  return false;
}

// ---- Consigue un access_token sin depender de ningún usuario conectado
// en ese momento — prueba los refresh_token guardados hasta que uno sirva. ----
async function obtenerAccessTokenAutonomo(env) {
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
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(HOJA_NOTIFICACIONES + "!A2:J")}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Error leyendo Notificaciones: ${res.status}`);
  const data = await res.json();
  const rows = data.values || [];
  return rows.filter((r) => r && r[0]).map((r) => ({
    id: r[0] || "", titulo: r[1] || "", mensaje: r[2] || "", tipo: r[3] || "unica",
    fecha_hora: r[4] || "", fecha_limite: r[5] || "", destinatario: r[6] || "yo",
    autor: r[7] || "", estado: r[8] || "activa", ultimo_envio: r[9] || "",
    _fila: rows.indexOf(r)
  }));
}

async function actualizarNotificacion(accessToken, env, fila, cambios) {
  const sheetRow = fila._fila + 2; // +1 por encabezado, +1 porque A2 es índice 0
  const nuevaFila = [
    fila.id, fila.titulo, fila.mensaje, fila.tipo, fila.fecha_hora, fila.fecha_limite,
    fila.destinatario, fila.autor,
    cambios.estado ?? fila.estado,
    cambios.ultimo_envio ?? fila.ultimo_envio
  ];
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(`${HOJA_NOTIFICACIONES}!A${sheetRow}:J${sheetRow}`)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [nuevaFila] })
    }
  );
}

async function todosLosEmailsConSuscripcion(env) {
  const lista = await env.PUSH_SUBS.list();
  return lista.keys.map((k) => k.name);
}

// ---- Manda el push de verdad a cada dispositivo de cada email dado.
// Si el navegador ya no reconoce la suscripción (404/410 = se desinstaló o
// se revocó el permiso), la borra sola en vez de seguir intentando para
// siempre. Devuelve true si al menos un dispositivo recibió el push. ----
async function enviarPushATodos(env, emails, payloadJson) {
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

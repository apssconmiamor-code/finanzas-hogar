// =============================================
// CALENDARIO — feed .ics suscribible con las alertas (Notificaciones)
// =============================================
// Dos piezas:
//  - GET /calendario/link  → autenticado con el sessionToken normal (igual
//    que /push/subscribe), le arma al frontend la URL webcal:// lista para
//    suscribir.
//  - GET /calendario.ics   → el feed en sí. Lo pide el propio Calendar del
//    iPhone solo, sin el usuario ni la app de por medio, así que NO puede
//    depender del sessionToken normal (expira, y Calendar no sabe
//    renovarlo) -- usa en cambio un "token" de calendario: una firma HMAC
//    estable del email, calculada sobre la marcha con WORKER_SESSION_SECRET
//    y sin guardar nada nuevo en KV. Mismo email+secreto = mismo token
//    siempre, así el link de suscripción no caduca.
//
// Trae TODAS las alertas del email pedido: las "individuales" (autor ===
// email) y las "grupales" (destinatario === "familia", de cualquier autor)
// -- mismo criterio que ya usa el frontend para decidir qué le muestra a
// cada quién (ver notificaciones.js, filtro de la lista).

import { obtenerAccessTokenAutonomo, leerNotificaciones } from "./push.js";

const textEncoder = new TextEncoder();

// ---- GET /calendario/link (autenticado) ----
export async function handleCalendarioLink(request, url, env, auth) {
  const email = auth.email;
  const token = await firmarTokenCalendario(email, env.WORKER_SESSION_SECRET);
  const feedUrl = `${url.origin}/calendario.ics?email=${encodeURIComponent(email)}&token=${token}`;
  // webcal:// (no https://) es lo que hace que iOS lo reconozca como una
  // suscripción de calendario y abra el picker nativo en vez de descargar
  // el archivo o abrirlo en el navegador.
  const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");
  return jsonResponse({ url: webcalUrl, httpsUrl: feedUrl });
}

// ---- GET /calendario.ics (público, protegido por el token de la URL) ----
export async function handleCalendarioFeed(url, env) {
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");
  if (!email || !token) return new Response("Faltan parámetros", { status: 400 });

  const esperado = await firmarTokenCalendario(email, env.WORKER_SESSION_SECRET);
  if (token !== esperado) return new Response("Token inválido", { status: 401 });

  const auth = await obtenerAccessTokenAutonomo(env);
  if (!auth) return new Response("Sin conexión con Google Sheets todavía", { status: 503 });

  let filas;
  try {
    filas = await leerNotificaciones(auth.accessToken, env);
  } catch (e) {
    filas = [];
  }

  const propias = filas.filter(f => f.destinatario === "familia" || f.autor === email);
  const ics = generarICS(propias);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="finanzas-alertas.ics"',
      "Cache-Control": "no-cache"
    }
  });
}

// ---- Token de calendario: HMAC-SHA256(email) con WORKER_SESSION_SECRET,
// en hex y recortado a 32 caracteres (16 bytes ya alcanza para que no se
// pueda adivinar por fuerza bruta) -- a propósito NO lleva expiración
// (exp), a diferencia del sessionToken normal: Calendar vuelve a pedir este
// mismo link cada tanto por su cuenta, sin que nadie lo renueve. ----
export async function firmarTokenCalendario(email, secret) {
  const key = await crypto.subtle.importKey(
    "raw", textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const firma = await crypto.subtle.sign("HMAC", key, textEncoder.encode(email));
  return bytesToHex(new Uint8Array(firma)).slice(0, 32);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---- Armado del .ics ----

// Mismo mapeo que _normalizarRecurrencia en push.js (tipos viejos
// diaria/semanal/mensual de antes de la recurrencia personalizada) --
// repetido acá porque push.js no lo exporta (es un detalle interno de
// estaVencida, no del modelo de datos en sí).
const UNIDAD_LEGADO = { diaria: "dia", semanal: "semana", mensual: "mes" };
const UNIDAD_A_FREQ = { dia: "DAILY", semana: "WEEKLY", mes: "MONTHLY", anio: "YEARLY" };

export function generarICS(filas) {
  const dtstamp = formatearFechaICS(new Date().toISOString());
  const eventos = filas.map(f => generarEvento(f, dtstamp)).filter(Boolean);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finanzas Luni-Chuni//Alertas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Finanzas Luni-Chuni",
    // Ambos son "pedidos" no vinculantes -- cada Calendar decide su propio
    // intervalo real de todos modos, pero no está de más declarar uno.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...eventos,
    "END:VCALENDAR"
  ].join("\r\n") + "\r\n";
}

// Exportada para pruebas unitarias -- arma un VEVENT por fila, o null si la
// fila no tiene una fecha_hora utilizable (no debería pasar en la práctica,
// pero una fila corrupta no debe tumbar el feed entero).
export function generarEvento(f, dtstamp) {
  const inicio = new Date(f.fecha_hora);
  if (isNaN(inicio.getTime())) return null;

  const dtstart = formatearFechaICS(f.fecha_hora);
  // Las alertas no tienen "duración" real -- 30 minutos es solo para que
  // el evento se vea como un bloque angosto en la vista de Calendario, no
  // el propio horario de la alerta.
  const dtend = formatearFechaICS(new Date(inicio.getTime() + 30 * 60000).toISOString());

  const lineas = [
    "BEGIN:VEVENT",
    `UID:${f.id}@finanzas-hogar`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escaparTextoICS(f.titulo || "Alerta")}`
  ];
  if (f.mensaje) lineas.push(`DESCRIPTION:${escaparTextoICS(f.mensaje)}`);

  if (f.tipo !== "unica") {
    const unidad = f.unidad || UNIDAD_LEGADO[f.tipo] || "dia";
    const freq = UNIDAD_A_FREQ[unidad] || "DAILY";
    const intervalo = Math.max(1, parseInt(f.intervalo, 10) || 1);
    let rrule = `FREQ=${freq};INTERVAL=${intervalo}`;
    if (f.fecha_limite) {
      const limite = new Date(f.fecha_limite + "T23:59:59Z");
      if (!isNaN(limite.getTime())) rrule += `;UNTIL=${formatearFechaICS(limite.toISOString())}`;
    }
    lineas.push(`RRULE:${rrule}`);
  }

  lineas.push("END:VEVENT");
  return lineas.join("\r\n");
}

// "2026-08-25T14:30:00.000Z" -> "20260825T143000Z" (formato UTC de RFC5545).
export function formatearFechaICS(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// Escapa los caracteres que RFC5545 reserva en valores de texto (SUMMARY/
// DESCRIPTION) -- sin esto, una alerta con coma o punto y coma en el título
// rompe el parseo del .ics en el Calendar que lo lee.
export function escaparTextoICS(texto) {
  return String(texto)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

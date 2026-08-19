// =============================================
// FINANZAS HOGAR — Worker de renovación de sesión
// =============================================
// Backend mínimo (sin base de datos externa, solo Cloudflare KV) que
// guarda un refresh_token de Google POR USUARIO (email) y lo usa para
// entregar access tokens frescos bajo demanda — sin depender de que el
// navegador tenga una cookie de sesión de Google activa (eso es lo que
// falla siempre en una PWA instalada en la pantalla de inicio de iOS).
//
// Dos endpoints:
//  - GET /oauth/callback  → recibe el "code" del flujo de autorización de
//    Google (abierto en un popup desde el frontend), lo cambia por tokens,
//    guarda el refresh_token, y le devuelve todo al frontend vía
//    postMessage (pensado para popup, no para navegación de página completa).
//  - GET /token?email=... → con un sessionToken propio (ver abajo) válido,
//    entrega un access_token fresco usando el refresh_token guardado.

import { handlePushSubscribe, handlePushUnsubscribe, revisarYEnviarNotificaciones } from "./push.js";
import { archivarMovimientosViejos } from "./archivo.js";

const TOKEN_ENDPOINT     = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT  = "https://www.googleapis.com/oauth2/v3/userinfo";
const SESSION_TTL_SEGUNDOS = 60 * 60 * 24 * 180; // ~180 días

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), env);
    }

    if (url.pathname === "/oauth/callback") {
      return handleCallback(url, env);
    }

    if (url.pathname === "/token") {
      return withCors(await handleToken(request, url, env), env);
    }

    if (url.pathname === "/diag") {
      return withCors(handleDiag(url), env);
    }

    if (url.pathname === "/push/subscribe" || url.pathname === "/push/unsubscribe") {
      const auth = await autenticarPeticion(request, env);
      if (!auth) return withCors(jsonResponse({ error: "session_invalida" }, 401), env);
      const resultado = url.pathname === "/push/subscribe"
        ? await handlePushSubscribe(request, env, auth)
        : await handlePushUnsubscribe(request, env, auth);
      return withCors(resultado, env);
    }

    return withCors(new Response("Not found", { status: 404 }), env);
  },

  // Cron Trigger (ver [triggers] en wrangler.toml) — revisa la hoja
  // "Notificaciones" cada 5 minutos y manda los push que ya vencieron, y de
  // paso archiva los movimientos de más de 3 meses (ver archivo.js). No
  // depende de que nadie tenga la app abierta en ese momento.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(revisarYEnviarNotificaciones(env));
    ctx.waitUntil(archivarMovimientosViejos(env));
  }
};

// Mismo sessionToken (JWT propio) que ya usa /token — reutilizado acá para
// autenticar quién está registrando/borrando una suscripción push.
async function autenticarPeticion(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const sessionToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!sessionToken) return null;
  const payload = await verificarSessionToken(sessionToken, env.WORKER_SESSION_SECRET);
  return payload; // { email, iat, exp } o null si no es válido
}

function withCors(response, env) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// Envuelve fetch() con un timeout propio del Worker — sin esto, si Google
// tarda en responder, el Worker se queda esperando indefinidamente y quien
// llama (el celular) se rinde por su cuenta antes, sin saber que el
// verdadero cuello de botella estaba acá y no en su propia red.
async function fetchConTimeout(url, options, ms = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---- /oauth/callback: intercambia el code por tokens y registra al usuario ----

async function handleCallback(url, env) {
  const code  = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) return htmlPopupResult({ error }, env);
  if (!code)  return new Response("Falta el parámetro code", { status: 400 });

  const redirectUri = `${url.origin}/oauth/callback`;

  let tokenData;
  try {
    const tokenRes = await fetchConTimeout(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.log("token_exchange_failed", tokenRes.status, JSON.stringify(tokenData));
      return htmlPopupResult({ error: tokenData.error || "token_exchange_failed" }, env);
    }
  } catch (e) {
    console.log("token_exchange_failed (excepción)", e.name === "AbortError" ? "timeout_google" : e.message);
    return htmlPopupResult({ error: "token_exchange_failed" }, env);
  }

  let perfil;
  try {
    const perfilRes = await fetchConTimeout(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    perfil = await perfilRes.json();
    if (!perfilRes.ok || !perfil.email) {
      console.log("userinfo_failed", perfilRes.status, JSON.stringify(perfil));
      return htmlPopupResult({ error: "userinfo_failed" }, env);
    }
  } catch (e) {
    console.log("userinfo_failed (excepción)", e.name === "AbortError" ? "timeout_google" : e.message);
    return htmlPopupResult({ error: "userinfo_failed" }, env);
  }

  console.log("callback OK para", perfil.email, "trajo refresh_token:", !!tokenData.refresh_token);

  if (tokenData.refresh_token) {
    await env.REFRESH_TOKENS.put(perfil.email, tokenData.refresh_token);
  } else if (!(await env.REFRESH_TOKENS.get(perfil.email))) {
    // Google no mandó refresh_token (raro, dado que siempre se pide con
    // prompt=consent+access_type=offline) y tampoco había uno guardado de
    // antes — sin refresh_token no hay forma de renovar luego.
    console.log("no_refresh_token para", perfil.email);
    return htmlPopupResult({ error: "no_refresh_token" }, env);
  }

  const sessionToken = await firmarSessionToken(perfil.email, env.WORKER_SESSION_SECRET);

  return htmlPopupResult({
    access_token: tokenData.access_token,
    expires_in: tokenData.expires_in,
    email: perfil.email,
    name: perfil.name || "",
    picture: perfil.picture || "",
    sessionToken
  }, env);
}

// ---- /token: entrega un access_token fresco usando el refresh_token guardado ----

async function handleToken(request, url, env) {
  const email = url.searchParams.get("email");
  const auth  = request.headers.get("Authorization") || "";
  const sessionToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!email || !sessionToken) {
    return jsonResponse({ error: "faltan_parametros" }, 400);
  }

  const payload = await verificarSessionToken(sessionToken, env.WORKER_SESSION_SECRET);
  if (!payload || payload.email !== email) {
    console.log("session_invalida para", email, "— payload:", payload ? JSON.stringify(payload) : "null (firma/formato inválido o expirado)");
    return jsonResponse({ error: "session_invalida" }, 401);
  }

  const refreshToken = await env.REFRESH_TOKENS.get(email);
  if (!refreshToken) {
    console.log("sin_refresh_token para", email);
    return jsonResponse({ error: "sin_refresh_token" }, 404);
  }

  const t0 = Date.now();
  let tokenData;
  try {
    const tokenRes = await fetchConTimeout(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token"
      })
    });
    tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      // El refresh token dejó de servir (revocado, contraseña cambiada, etc.)
      console.log("refresh_token_invalido para", email, "— Google respondió", tokenRes.status, JSON.stringify(tokenData), `(${Date.now() - t0}ms)`);
      await env.REFRESH_TOKENS.delete(email);
      return jsonResponse({ error: "refresh_token_invalido" }, 401);
    }
  } catch (e) {
    const motivo = e.name === "AbortError" ? "timeout_google" : "fetch_failed";
    console.log(motivo, "para", email, "— excepción:", e.message, `(${Date.now() - t0}ms)`);
    return jsonResponse({ error: motivo }, 502);
  }

  console.log("token renovado OK para", email, `(${Date.now() - t0}ms)`);
  return jsonResponse({
    access_token: tokenData.access_token,
    expires_in: tokenData.expires_in
  });
}

// ---- /diag: breadcrumb sin autenticar desde el frontend cuando la renovación
// silenciosa ni siquiera llega a intentar el fetch a /token (falta el email
// o el sessionToken guardado en el dispositivo) — sin esto, ese caso se ve
// idéntico en los logs a un corte de red (cero rastro en el servidor). ----

function handleDiag(url) {
  const reason = url.searchParams.get("reason") || "desconocido";
  const email = url.searchParams.get("email") || "(sin email)";
  console.log("diag_cliente:", reason, "para", email);
  return new Response(null, { status: 204 });
}

// ---- Página HTML mínima para el popup: entrega el resultado por postMessage ----

function htmlPopupResult(payload, env) {
  const json = JSON.stringify(Object.assign({ type: "finanzas-oauth" }, payload));
  const html = `<!doctype html>
<html><body>
<script>
  if (window.opener) {
    window.opener.postMessage(${json}, ${JSON.stringify(env.ALLOWED_ORIGIN)});
  }
  window.close();
</script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

// ---- JWT propio (HMAC-SHA256) para el sessionToken — sin dependencias externas ----

function base64urlEncode(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"]
  );
}

async function firmarSessionToken(email, secret) {
  const header  = { alg: "HS256", typ: "JWT" };
  const now     = Math.floor(Date.now() / 1000);
  const payload = { email, iat: now, exp: now + SESSION_TTL_SEGUNDOS };

  const headerB64  = base64urlEncode(textEncoder.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(textEncoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(signingInput));
  const sigB64 = base64urlEncode(new Uint8Array(sig));

  return `${signingInput}.${sigB64}`;
}

async function verificarSessionToken(token, secret) {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = partes;

  try {
    const key = await hmacKey(secret);
    const valido = await crypto.subtle.verify(
      "HMAC", key,
      base64urlDecode(sigB64),
      textEncoder.encode(`${headerB64}.${payloadB64}`)
    );
    if (!valido) return null;

    const payload = JSON.parse(textDecoder.decode(base64urlDecode(payloadB64)));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

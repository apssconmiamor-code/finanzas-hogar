// =============================================
// BADGE DEL ÍCONO — Badging API (navigator.setAppBadge)
// =============================================
// Pone un número sobre el ícono de la app (pantalla de inicio / dock) con
// la cantidad de Notificaciones (Alertas) que ya dispararon y están
// "enviada" (esperando que alguien las revise en la app — ver
// marcarNotificacionRevisada en notificaciones.js). Las "activa" son solo
// programadas a futuro, no necesitan atención todavía. A propósito NO
// suma Recordatorios ni Préstamos (pedido explícito: esos ya tienen su
// propio badge dentro de la app, este es solo para Alertas).
//
// Soporte: Chrome/Edge de escritorio y Android, y Safari de iPhone/iPad
// SOLO si la app está anclada a la pantalla de inicio desde Safari (iOS
// 16.4+, el mismo requisito que ya aplica para Web Push) — en una pestaña
// normal del navegador la Badging API no existe. En iOS además el número
// solo se ve si ya se concedió el permiso de notificaciones.
//
// Se recalcula leyendo directo el cache en localStorage (cache_notificaciones)
// en vez de la variable global en memoria — así no importa si esta sesión
// todavía no visitó la pestaña Notificaciones: se usa el último dato
// conocido igual. cargarNotificaciones() llama a actualizarBadgeApp() al
// final, después de refrescar ese cache.

function _badgeLeerCache(clave) {
  try {
    const raw = localStorage.getItem(clave);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function actualizarBadgeApp() {
  if (!("setAppBadge" in navigator)) return;

  const total = _badgeLeerCache("cache_notificaciones").filter(n => n.estado === "enviada").length;

  // clearAppBadge() antes de volver a poner el número: en iOS, pasar de un
  // valor a otro >0 directo con setAppBadge() a veces no repinta el ícono
  // (bug conocido de WebKit) y se queda pegado en el número anterior.
  navigator.clearAppBadge().catch(() => {}).then(() => {
    if (total > 0) navigator.setAppBadge(total).catch(() => {});
  });
}

function limpiarBadgeApp() {
  if ("clearAppBadge" in navigator) navigator.clearAppBadge().catch(() => {});
}

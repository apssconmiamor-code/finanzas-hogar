// =============================================
// BADGE DEL ÍCONO — Badging API (navigator.setAppBadge)
// =============================================
// Pone un número sobre el ícono de la app (pantalla de inicio / dock) con
// la suma de lo que necesita atención en tres módulos:
//   - Notificaciones: las que ya dispararon y están "enviada" (esperando
//     que alguien las revise en la app — ver marcarNotificacionRevisada en
//     notificaciones.js). Las "activa" son solo programadas a futuro, no
//     necesitan atención todavía.
//   - Recordatorios: todos los guardados (mismo criterio que ya usa su
//     propio badge interno, ver renderRecordatorioBadge en recordatorios.js)
//   - Préstamos: los que todavía no están "pagado" (no hay cuotas
//     individuales en la hoja Prestamo, así que se cuenta el préstamo
//     completo mientras siga en curso)
//
// Soporte: Chrome/Edge de escritorio y Android, y Safari de iPhone/iPad
// SOLO si la app está anclada a la pantalla de inicio desde Safari (iOS
// 16.4+, el mismo requisito que ya aplica para Web Push) — en una pestaña
// normal del navegador la Badging API no existe. En iOS además el número
// solo se ve si ya se concedió el permiso de notificaciones.
//
// Se recalcula leyendo directo el cache en localStorage de cada módulo
// (cache_notificaciones, cache_recordatorios, cache_prestamos) en vez de
// las variables globales en memoria — así no importa si esta sesión
// todavía no visitó una pestaña en particular (ej. Notificaciones se carga
// solo al entrar a esa pestaña): se usa el último dato conocido igual.
// Cada cargar*() de los tres módulos llama a actualizarBadgeApp() al
// final, después de refrescar su propio cache.

function _badgeLeerCache(clave) {
  try {
    const raw = localStorage.getItem(clave);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function _badgeContarNotificaciones() {
  return _badgeLeerCache("cache_notificaciones").filter(n => n.estado === "enviada").length;
}

function _badgeContarRecordatorios() {
  return _badgeLeerCache("cache_recordatorios").length;
}

function _badgeContarPrestamos() {
  return _badgeLeerCache("cache_prestamos").filter(p => !p.pagado).length;
}

function actualizarBadgeApp() {
  if (!("setAppBadge" in navigator)) return;

  const total = _badgeContarNotificaciones()
    + _badgeContarRecordatorios()
    + _badgeContarPrestamos();

  if (total > 0) navigator.setAppBadge(total).catch(() => {});
  else navigator.clearAppBadge().catch(() => {});
}

function limpiarBadgeApp() {
  if ("clearAppBadge" in navigator) navigator.clearAppBadge().catch(() => {});
}

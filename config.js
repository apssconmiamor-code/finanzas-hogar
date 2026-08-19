// =============================================
// CONFIGURACIÓN DE LA APP
// =============================================

const CONFIG = {
  VERSION: "3.55.0",
  GOOGLE_CLIENT_ID: "610428004631-cmp0hujrbltla9b9j03vfa8ih47dulsj.apps.googleusercontent.com",
  SPREADSHEET_ID: "1g2pyTgEc-BQ1mv2wr91klk58oy1L-2CRIJb9BoLGk6o",

  // Backend mínimo (Cloudflare Worker) que guarda un refresh token de Google
  // por usuario y entrega access tokens frescos bajo demanda — así la sesión
  // se puede renovar aunque el navegador no tenga cookie de sesión de Google
  // (lo que pasa siempre en una PWA instalada en la pantalla de inicio de iOS).
  WORKER_URL: "https://finanzas-hogar-token.byco85.workers.dev",

  // Clave pública VAPID — identifica a esta app ante el navegador al pedir
  // permiso de notificaciones push. No es secreta (viaja igual al
  // navegador); la privada vive solo en el Worker (wrangler secret).
  VAPID_PUBLIC_KEY: "BBaO4zGUoUgNSwZo-yOurnDy_eZqgIAeGbdzdI6J70ELt2Iut8PVjD-bjNlFTGsiVu1dgiL2unG4322J3vB7ur0",

  // Nombres de las hojas en Google Sheets
  SHEETS: {
    CAJAS: "Cajas",
    MOVIMIENTOS: "Movimiento de Caja",
    MOVIMIENTOS_ARCHIVO: "Movimiento de Caja - Archivo",
  PRESUPUESTO: "Presupuesto",
    CRONOLOGIA: "Cronologia",
    PRESTAMO: "Prestamo",
    COMPRAS: "Compras",
    PROYECCION: "Proyeccion",
    METAS: "Metas",
    RECORDATORIOS: "Recordatorios",
    NOTIFICACIONES: "Notificaciones"
  }
};

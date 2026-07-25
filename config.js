// =============================================
// CONFIGURACIÓN DE LA APP
// =============================================

const CONFIG = {
  VERSION: "3.14.0",
  GOOGLE_CLIENT_ID: "610428004631-cmp0hujrbltla9b9j03vfa8ih47dulsj.apps.googleusercontent.com",
  SPREADSHEET_ID: "1g2pyTgEc-BQ1mv2wr91klk58oy1L-2CRIJb9BoLGk6o",

  // Backend mínimo (Cloudflare Worker) que guarda un refresh token de Google
  // por usuario y entrega access tokens frescos bajo demanda — así la sesión
  // se puede renovar aunque el navegador no tenga cookie de sesión de Google
  // (lo que pasa siempre en una PWA instalada en la pantalla de inicio de iOS).
  WORKER_URL: "https://finanzas-hogar-token.byco85.workers.dev",

  // Nombres de las hojas en Google Sheets
  SHEETS: {
    CAJAS: "Cajas",
    MOVIMIENTOS: "Movimiento de Caja",
  PRESUPUESTO: "Presupuesto",
    CRONOLOGIA: "Cronologia",
    PRESTAMO: "Prestamo",
    COMPRAS: "Compras",
    PROYECCION: "Proyeccion",
    METAS: "Metas",
    RECORDATORIOS: "Recordatorios"
  }
};

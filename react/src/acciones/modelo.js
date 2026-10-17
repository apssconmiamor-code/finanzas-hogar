// Modelo de una acción rápida (se guarda tal cual en ConfigUsuario, ver
// Sheets.guardarConfigUsuario). Las acciones guardadas por versiones anteriores
// se leen igual, sin migrar nada en Sheets:
//   - Ingreso / Gasto: "cajas": [...] (antes solo "caja": "...").
//   - Transferencia:   "cajasOrigen": [...] y "cajasDestino": [...]
//                      (antes solo "cajaOrigen" / "cajaDestino", una sola de cada una).

export function cajasDeAccion(accion) {
  if (!accion) return [];
  if (Array.isArray(accion.cajas)) return accion.cajas;
  return accion.caja ? [accion.caja] : [];
}

export function origenesDeAccion(accion) {
  if (!accion) return [];
  if (Array.isArray(accion.cajasOrigen)) return accion.cajasOrigen;
  return accion.cajaOrigen ? [accion.cajaOrigen] : [];
}

export function destinosDeAccion(accion) {
  if (!accion) return [];
  if (Array.isArray(accion.cajasDestino)) return accion.cajasDestino;
  return accion.cajaDestino ? [accion.cajaDestino] : [];
}

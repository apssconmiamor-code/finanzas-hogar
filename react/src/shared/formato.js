// Formatea un monto con separadores de miles (es-CO: punto de miles) mientras se escribe -- lo
// mismo que formatearInputMiles de app.js, pero sobre el texto (para campos controlados de React).
// Las expresiones ("4000+5000") se dejan tal cual: se evalúan al guardar.
export function conMiles(valor) {
  if (/[+\-*/()]/.test(valor)) return valor;
  const crudo = valor.replace(/\./g, "").replace(/,/g, "");
  if (!crudo) return valor;
  const numero = parseInt(crudo, 10);
  if (isNaN(numero)) return valor;
  return numero.toLocaleString("es-CO");
}

export const hoyISO = () => new Date().toISOString().split("T")[0];

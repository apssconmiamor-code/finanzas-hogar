import { generarICS, generarEvento, formatearFechaICS, escaparTextoICS, firmarTokenCalendario } from "./calendario.js";

let fallos = 0;
function assert(desc, actual, esperado) {
  const ok = actual === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "OK  " : "FAIL"} ${desc} -> esperado=${JSON.stringify(esperado)} actual=${JSON.stringify(actual)}`);
}

const DTSTAMP = formatearFechaICS("2026-08-20T10:00:00.000Z");

// ---- formatearFechaICS ----
assert("formatearFechaICS: ISO con milisegundos -> formato compacto UTC",
  formatearFechaICS("2026-08-25T14:30:00.000Z"), "20260825T143000Z");

// ---- escaparTextoICS ----
assert("escaparTextoICS: coma, punto y coma, salto de línea y backslash escapados",
  escaparTextoICS("Pago; renta, casa\nsegundo piso \\ ok"),
  "Pago\\; renta\\, casa\\nsegundo piso \\\\ ok");

// ---- generarEvento: alerta única ----
const unica = generarEvento({
  id: "N1", titulo: "Pagar arriendo", mensaje: "Antes del día 5",
  tipo: "unica", fecha_hora: "2026-09-05T13:00:00.000Z"
}, DTSTAMP);
assert("unica: incluye UID con el id de la fila", unica.includes("UID:N1@finanzas-hogar"), true);
assert("unica: DTSTART formateado en UTC", unica.includes("DTSTART:20260905T130000Z"), true);
assert("unica: SUMMARY con el título", unica.includes("SUMMARY:Pagar arriendo"), true);
assert("unica: DESCRIPTION con el mensaje", unica.includes("DESCRIPTION:Antes del día 5"), true);
assert("unica: sin RRULE (no se repite)", unica.includes("RRULE"), false);

// ---- generarEvento: alerta recurrente mensual con fecha límite ----
const recurrente = generarEvento({
  id: "N2", titulo: "Pago tarjeta", mensaje: "",
  tipo: "recurrente", unidad: "mes", intervalo: 1,
  fecha_hora: "2026-01-10T15:00:00.000Z", fecha_limite: "2026-12-31"
}, DTSTAMP);
assert("recurrente mensual: RRULE con FREQ=MONTHLY;INTERVAL=1",
  recurrente.includes("RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL="), true);
assert("recurrente mensual: UNTIL toma el fin del día de fecha_limite en UTC",
  recurrente.includes("UNTIL=20261231T235959Z"), true);
assert("recurrente sin mensaje: no agrega DESCRIPTION", recurrente.includes("DESCRIPTION"), false);

// ---- generarEvento: tipo legado ("semanal" sin campo unidad) ----
const legado = generarEvento({
  id: "N3", titulo: "Reunión familiar", tipo: "semanal",
  fecha_hora: "2026-08-01T12:00:00.000Z"
}, DTSTAMP);
assert("tipo legado 'semanal': se traduce a FREQ=WEEKLY",
  legado.includes("RRULE:FREQ=WEEKLY;INTERVAL=1"), true);

// ---- generarEvento: fecha_hora inválida -> null (no tumba el feed) ----
assert("fecha_hora inválida -> null",
  generarEvento({ id: "N4", titulo: "x", tipo: "unica", fecha_hora: "no-es-una-fecha" }, DTSTAMP), null);

// ---- generarICS: estructura general ----
const ics = generarICS([
  { id: "N1", titulo: "Pagar arriendo", tipo: "unica", fecha_hora: "2026-09-05T13:00:00.000Z" }
]);
assert("generarICS: empieza con BEGIN:VCALENDAR", ics.startsWith("BEGIN:VCALENDAR"), true);
assert("generarICS: termina con END:VCALENDAR\\r\\n", ics.endsWith("END:VCALENDAR\r\n"), true);
assert("generarICS: usa saltos de línea CRLF (RFC5545)", ics.includes("\r\n"), true);
assert("generarICS: incluye el VEVENT de la fila", ics.includes("UID:N1@finanzas-hogar"), true);

// ---- generarICS: una fila corrupta no tumba las demás ----
const icsConCorrupta = generarICS([
  { id: "N1", titulo: "Ok", tipo: "unica", fecha_hora: "2026-09-05T13:00:00.000Z" },
  { id: "N2", titulo: "Corrupta", tipo: "unica", fecha_hora: "no-es-una-fecha" }
]);
assert("generarICS: la fila válida sigue apareciendo aunque otra sea inválida",
  icsConCorrupta.includes("UID:N1@finanzas-hogar"), true);
assert("generarICS: la fila corrupta simplemente no aparece",
  icsConCorrupta.includes("UID:N2@finanzas-hogar"), false);

// ---- firmarTokenCalendario: determinístico y sensible al email ----
const SECRETO = "un-secreto-de-prueba";
const t1 = await firmarTokenCalendario("ana@example.com", SECRETO);
const t2 = await firmarTokenCalendario("ana@example.com", SECRETO);
const t3 = await firmarTokenCalendario("beto@example.com", SECRETO);
assert("firmarTokenCalendario: mismo email+secreto -> mismo token siempre", t1, t2);
assert("firmarTokenCalendario: emails distintos -> tokens distintos", t1 === t3, false);
assert("firmarTokenCalendario: longitud fija de 32 caracteres hex", t1.length, 32);

console.log(fallos === 0 ? "\nTodos los tests de calendario.js pasaron." : `\n${fallos} test(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);

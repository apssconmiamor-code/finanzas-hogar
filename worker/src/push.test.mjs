import { estaVencida, tocaRecordatorioDeSeguimiento, debeQuedarEnRevision, debeBorrarsePorRevisada, tocaInsistenciaCalendario } from "./push.js";

let fallos = 0;
function assert(desc, actual, esperado) {
  const ok = actual === esperado;
  if (!ok) fallos++;
  console.log(`${ok ? "OK  " : "FAIL"} ${desc} -> esperado=${esperado} actual=${actual}`);
}

const AHORA = new Date("2026-08-15T14:30:00Z"); // sábado

// ---- unica ----
assert("unica: ancla en el pasado, nunca enviada -> true",
  estaVencida({ tipo: "unica", fecha_hora: "2026-08-15T14:00:00Z", ultimo_envio: "" }, AHORA), true);

assert("unica: ancla en el futuro -> false",
  estaVencida({ tipo: "unica", fecha_hora: "2026-08-15T15:00:00Z", ultimo_envio: "" }, AHORA), false);

assert("unica: ya se envió antes -> false (no se repite)",
  estaVencida({ tipo: "unica", fecha_hora: "2026-08-15T14:00:00Z", ultimo_envio: "2026-08-15T14:05:00Z" }, AHORA), false);

// ---- diaria ----
assert("diaria: hora ya pasó hoy, nunca enviada hoy -> true",
  estaVencida({ tipo: "diaria", fecha_hora: "2000-01-01T14:00:00Z", ultimo_envio: "" }, AHORA), true);

assert("diaria: hora ya pasó, pero ya se envió HOY -> false",
  estaVencida({ tipo: "diaria", fecha_hora: "2000-01-01T14:00:00Z", ultimo_envio: "2026-08-15T14:00:00Z" }, AHORA), false);

assert("diaria: ya se envió AYER (no hoy) -> true (toca de nuevo)",
  estaVencida({ tipo: "diaria", fecha_hora: "2000-01-01T14:00:00Z", ultimo_envio: "2026-08-14T14:00:00Z" }, AHORA), true);

assert("diaria: hora todavía no llega hoy -> false",
  estaVencida({ tipo: "diaria", fecha_hora: "2000-01-01T18:00:00Z", ultimo_envio: "" }, AHORA), false);

// ---- semanal ---- (AHORA es sábado = getUTCDay() 6)
assert("semanal: mismo día de la semana (sábado), hora pasada -> true",
  estaVencida({ tipo: "semanal", fecha_hora: "2026-08-08T14:00:00Z", ultimo_envio: "" }, AHORA), true); // 2026-08-08 también es sábado

assert("semanal: día de la semana distinto (domingo=ancla) -> false",
  estaVencida({ tipo: "semanal", fecha_hora: "2026-08-09T14:00:00Z", ultimo_envio: "" }, AHORA), false); // 2026-08-09 es domingo

// ---- mensual ----
assert("mensual: mismo día del mes -> true",
  estaVencida({ tipo: "mensual", fecha_hora: "2000-01-15T14:00:00Z", ultimo_envio: "" }, AHORA), true);

assert("mensual: día del mes distinto -> false",
  estaVencida({ tipo: "mensual", fecha_hora: "2000-01-20T14:00:00Z", ultimo_envio: "" }, AHORA), false);

// mensual con clamping: ancla día 31, mes con menos días -> dispara el último día de ese mes
const AHORA_FEB = new Date("2026-02-28T14:30:00Z"); // 2026 no es bisiesto, feb tiene 28 días
assert("mensual: ancla día 31, febrero de 28 días -> dispara el día 28 (último día)",
  estaVencida({ tipo: "mensual", fecha_hora: "2000-01-31T14:00:00Z", ultimo_envio: "" }, AHORA_FEB), true);

// ---- fecha_limite ----
assert("fecha_limite ya pasada -> false aunque sería su turno",
  estaVencida({ tipo: "diaria", fecha_hora: "2000-01-01T14:00:00Z", fecha_limite: "2026-08-10", ultimo_envio: "" }, AHORA), false);

assert("fecha_limite todavía no llega -> normal (true)",
  estaVencida({ tipo: "diaria", fecha_hora: "2000-01-01T14:00:00Z", fecha_limite: "2026-08-20", ultimo_envio: "" }, AHORA), true);

// ---- recurrencia personalizada (intervalo + unidad, estilo Recordatorios de iPhone) ----
assert("recurrente cada 2 días: ancla hoy-2 -> true",
  estaVencida({ tipo: "recurrente", unidad: "dia", intervalo: 2, fecha_hora: "2026-08-13T14:00:00Z", ultimo_envio: "" }, AHORA), true);

assert("recurrente cada 2 días: ancla hoy-1 (día impar) -> false",
  estaVencida({ tipo: "recurrente", unidad: "dia", intervalo: 2, fecha_hora: "2026-08-14T14:00:00Z", ultimo_envio: "" }, AHORA), false);

assert("recurrente cada 2 semanas: mismo día-de-semana, 2 semanas exactas -> true",
  estaVencida({ tipo: "recurrente", unidad: "semana", intervalo: 2, fecha_hora: "2026-08-01T14:00:00Z", ultimo_envio: "" }, AHORA), true); // 2026-08-01 es sábado, 14 días antes

assert("recurrente cada 2 semanas: mismo día-de-semana pero solo 1 semana antes -> false",
  estaVencida({ tipo: "recurrente", unidad: "semana", intervalo: 2, fecha_hora: "2026-08-08T14:00:00Z", ultimo_envio: "" }, AHORA), false);

assert("recurrente cada 3 meses: mismo día, 3 meses exactos -> true",
  estaVencida({ tipo: "recurrente", unidad: "mes", intervalo: 3, fecha_hora: "2026-05-15T14:00:00Z", ultimo_envio: "" }, AHORA), true);

assert("recurrente cada 3 meses: mismo día, solo 2 meses -> false",
  estaVencida({ tipo: "recurrente", unidad: "mes", intervalo: 3, fecha_hora: "2026-06-15T14:00:00Z", ultimo_envio: "" }, AHORA), false);

assert("recurrente cada año: mismo mes/día, 1 año antes -> true",
  estaVencida({ tipo: "recurrente", unidad: "anio", intervalo: 1, fecha_hora: "2025-08-15T14:00:00Z", ultimo_envio: "" }, AHORA), true);

assert("recurrente cada 2 años: solo 1 año antes -> false",
  estaVencida({ tipo: "recurrente", unidad: "anio", intervalo: 2, fecha_hora: "2025-08-15T14:00:00Z", ultimo_envio: "" }, AHORA), false);

// ---- recordatorio de seguimiento (campo opcional "recordar_en_dias") ----
assert("recordar en 3 días: pasaron 4 días desde el último envío -> true",
  tocaRecordatorioDeSeguimiento({ recordar_en_dias: 3, ultimo_envio: "2026-08-11T14:00:00Z" }, AHORA), true);

assert("recordar en 3 días: pasó solo 1 día -> false",
  tocaRecordatorioDeSeguimiento({ recordar_en_dias: 3, ultimo_envio: "2026-08-14T14:00:00Z" }, AHORA), false);

assert("recordar_en_dias vacío -> false aunque haya pasado tiempo",
  tocaRecordatorioDeSeguimiento({ recordar_en_dias: "", ultimo_envio: "2026-08-01T14:00:00Z" }, AHORA), false);

assert("recordar_en_dias puesto pero sin ultimo_envio todavía -> false",
  tocaRecordatorioDeSeguimiento({ recordar_en_dias: 3, ultimo_envio: "" }, AHORA), false);

// ---- ¿debe quedar "enviada" (pendiente de revisión) tras enviarse? ----
assert("unica siempre queda en revisión, tenga o no recordar_en_dias",
  debeQuedarEnRevision({ tipo: "unica", recordar_en_dias: "" }), true);

assert("recurrente SIN recordar_en_dias -> no queda en revisión (sigue su ciclo solo)",
  debeQuedarEnRevision({ tipo: "recurrente", recordar_en_dias: "" }), false);

assert("recurrente CON recordar_en_dias -> sí queda en revisión",
  debeQuedarEnRevision({ tipo: "recurrente", recordar_en_dias: 3 }), true);

// ---- limpieza: borrar "cancelada" (revisada) 15 días después ----
assert("cancelada hace 16 días (revisado_en) -> true, se borra",
  debeBorrarsePorRevisada({ estado: "cancelada", revisado_en: "2026-07-30T14:00:00Z", ultimo_envio: "" }, AHORA), true);

assert("cancelada hace solo 10 días -> false, todavía no",
  debeBorrarsePorRevisada({ estado: "cancelada", revisado_en: "2026-08-05T14:00:00Z", ultimo_envio: "" }, AHORA), false);

assert("no está cancelada -> false aunque sea vieja",
  debeBorrarsePorRevisada({ estado: "activa", revisado_en: "2026-07-30T14:00:00Z", ultimo_envio: "" }, AHORA), false);

assert("cancelada sin revisado_en (fila vieja) -> usa ultimo_envio como respaldo",
  debeBorrarsePorRevisada({ estado: "cancelada", revisado_en: "", ultimo_envio: "2026-07-30T14:00:00Z" }, AHORA), true);

assert("cancelada sin revisado_en NI ultimo_envio -> false (no hay de dónde contar)",
  debeBorrarsePorRevisada({ estado: "cancelada", revisado_en: "", ultimo_envio: "" }, AHORA), false);

// ---- insistencia de Calendar (👀 Revisada / MINUTOS_ENTRE_INSISTENCIAS_CALENDAR) ----
assert("enviada, nunca insistió, ultimo_envio hace 31 min, no vista -> true",
  tocaInsistenciaCalendario({ estado: "enviada", ultimo_envio: "2026-08-15T13:59:00Z", ultimo_evento_cal: "", visto_en: "" }, AHORA), true);

assert("enviada, ultimo_envio hace solo 10 min -> false (no toca todavía)",
  tocaInsistenciaCalendario({ estado: "enviada", ultimo_envio: "2026-08-15T14:20:00Z", ultimo_evento_cal: "", visto_en: "" }, AHORA), false);

assert("enviada, ya insistió hace 31 min (ultimo_evento_cal manda sobre ultimo_envio) -> true",
  tocaInsistenciaCalendario({ estado: "enviada", ultimo_envio: "2026-08-10T14:00:00Z", ultimo_evento_cal: "2026-08-15T13:59:00Z", visto_en: "" }, AHORA), true);

assert("enviada, insistió hace solo 10 min -> false",
  tocaInsistenciaCalendario({ estado: "enviada", ultimo_envio: "2026-08-10T14:00:00Z", ultimo_evento_cal: "2026-08-15T14:20:00Z", visto_en: "" }, AHORA), false);

assert("enviada, vencida hace rato pero YA vista hoy -> false, no insiste más por hoy",
  tocaInsistenciaCalendario({ estado: "enviada", ultimo_envio: "2026-08-15T10:00:00Z", ultimo_evento_cal: "", visto_en: "2026-08-15T11:00:00Z" }, AHORA), false);

assert("enviada, vista AYER (no hoy) -> true, vuelve a insistir",
  tocaInsistenciaCalendario({ estado: "enviada", ultimo_envio: "2026-08-15T10:00:00Z", ultimo_evento_cal: "", visto_en: "2026-08-14T11:00:00Z" }, AHORA), true);

assert("estado 'activa' (todavía no se disparó) -> false, la insistencia es solo para 'enviada'",
  tocaInsistenciaCalendario({ estado: "activa", ultimo_envio: "2026-08-15T13:00:00Z", ultimo_evento_cal: "", visto_en: "" }, AHORA), false);

console.log(fallos === 0 ? "\n✅ TODO OK" : `\n❌ ${fallos} prueba(s) fallaron`);
process.exit(fallos === 0 ? 0 : 1);

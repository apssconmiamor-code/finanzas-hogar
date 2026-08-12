import { estaVencida } from "./push.js";

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

console.log(fallos === 0 ? "\n✅ TODO OK" : `\n❌ ${fallos} prueba(s) fallaron`);
process.exit(fallos === 0 ? 0 : 1);

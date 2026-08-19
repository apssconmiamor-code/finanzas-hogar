import { calcularFechaCorte, filasElegiblesParaArchivar, calcularDeltasPorCaja } from "./archivo.js";

let fallos = 0;
function assert(desc, actual, esperado) {
  const ok = JSON.stringify(actual) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "OK  " : "FAIL"} ${desc} -> esperado=${JSON.stringify(esperado)} actual=${JSON.stringify(actual)}`);
}

// ---- calcularFechaCorte ----
assert("corte por defecto (3 meses): agosto -> retiene jun/jul/ago, corta en 1 de junio",
  calcularFechaCorte(new Date("2026-08-18T12:00:00Z")), "2026-06-01");

assert("corte cruzando año: febrero, retener 3 -> corta en 1 de diciembre del año anterior",
  calcularFechaCorte(new Date("2026-02-10T12:00:00Z")), "2025-12-01");

assert("corte con mesesARetener=1: solo retiene el mes actual",
  calcularFechaCorte(new Date("2026-08-18T12:00:00Z"), 1), "2026-08-01");

// ---- filasElegiblesParaArchivar ----
const filas = [
  { fecha: "2026-05-15", concepto: "Mercado" },  // antes del corte, mayo YA tiene cronología
  { fecha: "2026-06-02", concepto: "Salario" },  // dentro de la ventana retenida (>= corte)
  { fecha: "2026-04-01", concepto: "Renta" },    // antes del corte, abril NO tiene cronología todavía
];
const mesesConCronologia = new Set(["2026-05"]);

assert("solo archiva lo anterior al corte Y con cronología ya cerrada",
  filasElegiblesParaArchivar(filas, "2026-06-01", mesesConCronologia).map(f => f.concepto),
  ["Mercado"]);

assert("sin meses en Cronologia, no archiva nada (salvaguarda activa)",
  filasElegiblesParaArchivar(filas, "2026-06-01", new Set()).map(f => f.concepto),
  []);

// ---- calcularDeltasPorCaja ----
assert("ingreso suma, gasto resta, transferencia que llega suma",
  calcularDeltasPorCaja([
    { caja: "Efectivo", categoria: "Ingreso", concepto: "SURA", monto: 1000 },
    { caja: "Efectivo", categoria: "Gasto variable", concepto: "Mercado", monto: 300 },
    { caja: "Ahorros", categoria: "Transferencia", concepto: "Transferencia ← Efectivo", monto: 200 },
    { caja: "Efectivo", categoria: "Transferencia", concepto: "Transferencia → Ahorros", monto: 200 },
  ]),
  { Efectivo: 1000 - 300 - 200, Ahorros: 200 });

console.log(fallos === 0 ? "\n✅ TODO OK" : `\n❌ ${fallos} prueba(s) fallaron`);
process.exit(fallos === 0 ? 0 : 1);

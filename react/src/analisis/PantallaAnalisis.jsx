import { Icono } from "../shared/Iconos.jsx";

// Pantalla de Análisis: "Salud del mes" (el último mes cerrado, de la Cronología), el avance de las
// deudas y la tabla de la Cronología mensual. app.js sigue siendo dueño de los datos y de los cálculos
// (qué mes está cerrado, cuánto se excedió, etc.); acá solo se dibuja.
//
// Props (ver renderAnalisisReact en app.js):
//   saludTitulo   "Salud del mes (Julio)"
//   salud         { asertividad, balance, gastoFijo, gastoVar, pagoPrestamo, desvio }
//                 cada uno { valor, meta, color?, estado?: "verde"|"amarillo"|"rojo"|"gris" }
//   deuda         { valor, meta, color?, estado? }   % pagado de los préstamos
//   cronologia[]  { id, mes, ingreso, fijo, variable, asertividad, asertividadColor, balance, balanceColor }

const CLASE_ESTADO = { verde: "ic-verde", amarillo: "ic-amarillo", rojo: "ic-rojo", gris: "ic-gris" };

function Estado({ id, estado }) {
  return (
    <div className="kpi-estado" id={id}>
      {estado && <Icono nombre="punto" size={16} clase={"ic " + CLASE_ESTADO[estado]} />}
    </div>
  );
}

function Tarjeta({ id, etiqueta, d, conEstado, icono }) {
  return (
    <div className="kpi-card" id={id}>
      {icono && <div className="kpi-icon"><Icono nombre={icono} size={22} /></div>}
      <div className="kpi-body">
        <div className="kpi-label">{etiqueta}</div>
        <div className="kpi-valor" id={id ? id + "-val" : undefined} style={d.color ? { color: d.color } : undefined}>{d.valor}</div>
        <div className="kpi-meta" id={id ? id + "-meta" : undefined}>{d.meta}</div>
      </div>
      {conEstado && <Estado id={id ? id + "-estado" : undefined} estado={d.estado} />}
    </div>
  );
}

export function PantallaAnalisis({ saludTitulo, salud, deuda, cronologia }) {
  return (
    <>
      <div className="resumen-bloque-titulo" id="salud-mes-titulo"><Icono nombre="corazon" size={16} /> {saludTitulo}</div>
      <div className="kpi-grid kpi-grid-2col">
        <Tarjeta id="kpi-asertividad" etiqueta="Asertividad" d={salud.asertividad} conEstado />
        <Tarjeta id="kpi-balance-neto" etiqueta="Balance" d={salud.balance} conEstado />
        <Tarjeta id="kpi-gasto-fijo" etiqueta="Gasto fijo" d={salud.gastoFijo} />
        <Tarjeta id="kpi-gasto-var" etiqueta="Gasto variable" d={salud.gastoVar} />
        <Tarjeta id="kpi-pago-prestamo" etiqueta="Pago de préstamo" d={salud.pagoPrestamo} />
        <Tarjeta id="kpi-desvio" etiqueta="Desvío mayor" d={salud.desvio} conEstado />
      </div>

      <div className="resumen-bloque-titulo"><Icono nombre="tarjeta" size={16} /> Deudas</div>
      <div className="kpi-grid">
        <Tarjeta id="kpi-deuda-pct" etiqueta="% pagado préstamos" d={deuda} conEstado icono="baja" />
      </div>

      <div className="card-section" style={{ marginTop: 20 }}>
        <div className="card-section-header">
          <span className="card-section-title"><Icono nombre="calendario" size={16} /> Cronología mensual</span>
        </div>
        <div id="cronologia-wrap">
          <div style={{ overflowX: "auto" }}>
            <table className="proy-tabla cronologia-tabla">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th style={{ textAlign: "right" }}>Ingreso total</th>
                  <th style={{ textAlign: "right" }}>Gasto fijo</th>
                  <th style={{ textAlign: "right" }}>Gasto variable</th>
                  <th style={{ textAlign: "right" }}>Asertividad mensual</th>
                  <th style={{ textAlign: "right" }}>Balance de cierre</th>
                </tr>
              </thead>
              <tbody>
                {cronologia === null ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-4)" }}>Cargando cronología…</td></tr>
                ) : cronologia.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 32, color: "var(--text-light)", fontStyle: "italic" }}>
                    Aún no hay registros. El primer día de cada mes se guarda automáticamente el cierre del mes anterior.
                  </td></tr>
                ) : cronologia.map(d => (
                  <tr key={d.id || d.mes} className="proy-fila">
                    <td className="proy-concepto" style={{ fontWeight: 600 }}>{d.mes}</td>
                    <td className="proy-num">{d.ingreso}</td>
                    <td className="proy-num">{d.fijo}</td>
                    <td className="proy-num">{d.variable}</td>
                    <td className="proy-num" style={{ color: d.asertividadColor }}>{d.asertividad}</td>
                    <td className="proy-num" style={{ color: d.balanceColor }}>{d.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

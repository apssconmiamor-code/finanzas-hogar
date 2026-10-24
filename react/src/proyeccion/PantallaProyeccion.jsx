import { useEffect, useRef } from "react";
import { IconoDe } from "../shared/Iconos.jsx";

// Detalle por concepto de Proyección: la tabla Concepto / Estimado / Real del mes. app.js sigue siendo
// dueño de los datos (estimados, reales, orden y totales por grupo, modo Sumar); acá solo se dibuja y se
// manejan los gestos de las filas:
//   toque simple = nada · doble toque = resumen del concepto · mantener presionado = Editar / Eliminar
//   (en el modo "Sumar": un toque suma / resta la fila del total).
//
// Props (ver renderTablaComparacion en app.js):
//   renderId
//   mesLabel     "Octubre de 2026"
//   modoSuma     true mientras se está sumando conceptos
//   grupos[]     { etiqueta, estimado, real }  (textos ya formateados) con filas[]
//                fila: { concepto, categoria, esOtros, estimado, real, estimadoTxt, realTxt, icono,
//                        excedida, seleccionada, puedeModificar, puedeEliminar }
//   onToggleFila(concepto) / onResumen(concepto, categoria, esOtros, evento)
//   onEditar(concepto, categoria) / onBorrar(concepto, categoria)

export function PantallaProyeccion(props) {
  return <Contenido key={props.renderId} {...props} />;
}

function Contenido(props) {
  const cuerpo = useRef(null);
  const { mesLabel, modoSuma, grupos } = props;

  useEffect(() => {
    const filas = {};
    grupos.forEach(g => g.filas.forEach(f => { filas[f.concepto] = f; }));
    cuerpo.current?.querySelectorAll(".proy-tabla-row[data-concepto]").forEach(row => {
      const f = filas[row.dataset.concepto];
      if (!f) return;
      if (modoSuma) {
        row.addEventListener("pointerup", () => {
          row.classList.toggle("proy-tabla-row-seleccionada");
          props.onToggleFila(f.concepto);
        });
        return;
      }
      row.addEventListener("pointerup", e => props.onResumen(f.concepto, f.categoria, f.esOtros, e));
      if (!f.puedeModificar && !f.puedeEliminar) return;
      window.crearManejadorPresionSostenida(row, {
        onLargo: () => window.abrirMenuEditarBorrar({
          titulo: `${f.icono} ${f.concepto}`,
          onEditar: f.puedeModificar ? () => props.onEditar(f.concepto, f.categoria) : null,
          onBorrar: f.puedeEliminar ? () => props.onBorrar(f.concepto, f.categoria) : null,
          labelBorrar: f.categoria === "Ingreso" ? undefined : "➖ Quitar de este mes",
        }),
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card-section">
      <div className="card-section-header">
        <span className="card-section-title" id="proy-detalle-mes-label">{mesLabel}</span>
        <div className="proy-leyenda">
          <span className="leyenda-item"><span className="leyenda-dot estado-mal"></span>Excedido</span>
        </div>
      </div>
      <table className="proy-tabla proy-tabla-detalle">
        <thead>
          <tr><th>Concepto</th><th>Estimado</th><th>Real</th></tr>
        </thead>
        <tbody id="proy-tabla-body" ref={cuerpo}>
          {grupos.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", padding: 32, color: "var(--text-light)" }}>
                No hay datos — agrega un presupuesto para ver la comparación.
              </td>
            </tr>
          )}
          {grupos.map(g => [
            <tr key={"g-" + g.etiqueta} className="proy-grupo-row">
              <td>{g.etiqueta}</td>
              <td className="proy-grupo-total">{g.estimado}</td>
              <td className="proy-grupo-total">{g.real}</td>
            </tr>,
            ...g.filas.map(f => (
              <tr key={f.concepto}
                className={"proy-tabla-row" + (f.excedida ? " fila-excedida" : "") + (f.seleccionada ? " proy-tabla-row-seleccionada" : "")}
                data-concepto={f.concepto} data-categoria={f.categoria} data-es-otros={f.esOtros ? "true" : "false"}
                data-estimado={f.estimadoNum} data-real={f.realNum}>
                <td>
                  <div className="proy-cell-concepto">
                    <span className="proy-concepto-nombre"><IconoDe valor={f.icono} size={14} /> {f.concepto}</span>
                  </div>
                </td>
                <td className="proy-cell-num proy-cell-estimado">{f.estimadoTxt}</td>
                <td className="proy-cell-num proy-cell-real">{f.realTxt}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

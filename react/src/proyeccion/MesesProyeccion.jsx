import { useEffect, useRef } from "react";
import { FilaDeslizable } from "../shared/FilaDeslizable.jsx";

// Meses proyectados: mismas tarjetas que las Cajas (.caja-card), en una sola fila
// que se desliza con tres visibles.
//
// Props que arma app.js (ver render4MesesResumen):
//   meses[]            { mes, label, ingresos, gastos, excedente, activo }
//   puedeQuitar        false si queda un solo mes (no se puede dejar vacío)
//   formatMonto(n)     formateador de la app
//   onSeleccionar(mes) un toque: activa ese mes y baja a la tabla de detalle
//   onConfigurar(mes)  el engranaje (o Editar al mantener presionado)
//   onQuitar(mes)      Eliminar al mantener presionado
//   renderId           cambia en cada render() de app.js
export function MesesProyeccion({ meses, puedeQuitar, formatMonto, onSeleccionar, onConfigurar, onQuitar, renderId }) {
  const scrollRef = useRef(0);
  return (
    <Fila key={renderId} scrollRef={scrollRef} meses={meses} puedeQuitar={puedeQuitar} formatMonto={formatMonto}
      onSeleccionar={onSeleccionar} onConfigurar={onConfigurar} onQuitar={onQuitar} />
  );
}

// Se remonta en cada render de app.js (key) por lo mismo que Cajas: los gestos
// de gestos.js mutan el DOM y no tienen cómo desengancharse.
function Fila({ scrollRef, meses, puedeQuitar, formatMonto, onSeleccionar, onConfigurar, onQuitar }) {
  const gridRef = useRef(null);

  // Mantener presionado una tarjeta: Editar (configurar el mes) / Eliminar
  // (quitarlo), el criterio de gestos de toda la app.
  useEffect(() => {
    gridRef.current.querySelectorAll(".proy-4m-card[data-mes]").forEach(card => {
      const m = meses.find(x => x.mes === card.dataset.mes);
      if (!m) return;
      window.crearManejadorPresionSostenida(card, {
        onLargo: () => window.abrirMenuEditarBorrar({
          titulo: m.label,
          labelEditar: "⚙️ Configurar mes",
          onEditar: () => onConfigurar(m.mes),
          onBorrar: puedeQuitar ? () => onQuitar(m.mes) : null,
          labelBorrar: "➖ Quitar mes",
        }),
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // onPointerUpCapture: corre ANTES que el pointerup de crearManejadorPresionSostenida,
  // que borra el flag gestoPresionLarga -- así un mantener-presionado no cuenta como toque.
  const alSoltar = (e, mes) => {
    if (e.target.closest(".proy-4m-config")) return;   // el engranaje tiene su propio manejador
    if (e.currentTarget.dataset.gestoPresionLarga === "1") return;
    onSeleccionar(mes);
  };

  return (
    <FilaDeslizable id="proy-4meses-lista" cantidad={meses.length} scrollRef={scrollRef} gridRef={gridRef}>
      {meses.map(m => (
        <div key={m.mes} data-mes={m.mes}
          className={"caja-card proy-4m-card" + (m.activo ? " proy-4m-active" : "")}
          onPointerUpCapture={e => alSoltar(e, m.mes)}>
          <div className="caja-nombre-fila">
            <span className="caja-nombre">{m.label}</span>
            <button type="button" className="proy-4m-config" title="Configurar este mes" aria-label={"Configurar " + m.label}
              onClick={e => { e.stopPropagation(); onConfigurar(m.mes); }}>⚙️</button>
          </div>
          <div className={"caja-saldo " + (m.excedente >= 0 ? "positivo" : "negativo")}>{formatMonto(m.excedente)}</div>
          <div className="proy-mes-detalle">
            <span>Ing. {formatMonto(m.ingresos)}</span>
            <span>Gas. {formatMonto(m.gastos)}</span>
          </div>
        </div>
      ))}
    </FilaDeslizable>
  );
}

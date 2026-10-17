import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Props que arma app.js (ver renderCajas):
//   cajas[]            { nombre, moneda, saldoReal, colorFondo, icono }
//   verificadaEnRed    false -> aviso de "no se pudieron cargar"
//   formatMonto(n, m)  formateador de la app
//   onAbrirDetalle(n)  doble toque (tapCaja) sobre una tarjeta
//   onAjustar(n)       mantener presionado, solo con saldo negativo
//   onReordenar(nombres[])  tras arrastrar una tarjeta
//   renderId           cambia en cada render() de app.js
// Las clases/ids son los de siempre (style.css + tests E2E no cambian).

export function Cajas({ cajas, verificadaEnRed, formatMonto, onAbrirDetalle, onAjustar, onReordenar, renderId }) {
  const [modoSuma, setModoSuma] = useState(false);
  const [seleccion, setSeleccion] = useState(() => new Set());

  // Cambiar de pestaña oculta #tab-cajas: el modo se apaga solo (antes lo
  // hacía navegarATab). Se detecta mirando la clase "hidden" de la sección.
  useEffect(() => {
    const sec = document.getElementById("tab-cajas");
    if (!sec) return;
    const obs = new MutationObserver(() => {
      if (sec.classList.contains("hidden")) { setModoSuma(false); setSeleccion(new Set()); }
    });
    obs.observe(sec, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const alternarModo = () => { setModoSuma(m => !m); setSeleccion(new Set()); };
  const alternarCaja = (nombre) => setSeleccion(prev => {
    const sig = new Set(prev);
    if (sig.has(nombre)) sig.delete(nombre); else sig.add(nombre);
    return sig;
  });

  return (
    <>
      <div className="cajas-header">
        <button type="button" className={"btn-sumar-cajas" + (modoSuma ? " active" : "")}
          id="btn-sumar-cajas" onClick={alternarModo}>
          {modoSuma ? "Listo" : "Sumar"}
        </button>
      </div>
      {cajas.length === 0
        ? <div id="cajas-grid" className="cajas-grid"><EstadoVacio verificadaEnRed={verificadaEnRed} /></div>
        : <Grilla key={`${renderId}-${modoSuma}`} cajas={cajas} modoSuma={modoSuma} seleccion={seleccion}
            alternarCaja={alternarCaja} formatMonto={formatMonto}
            onAbrirDetalle={onAbrirDetalle} onAjustar={onAjustar} onReordenar={onReordenar} />}
      {createPortal(
        <BarraSuma activa={modoSuma} cajas={cajas} seleccion={seleccion} formatMonto={formatMonto} />,
        document.body)}
    </>
  );
}

function EstadoVacio({ verificadaEnRed }) {
  return verificadaEnRed
    ? <div className="empty-state" style={{ gridColumn: "1/-1" }}>
        <div className="empty-state-icon">🏦</div>
        <div className="empty-state-text">No tienes cajas aún. Crea una para empezar.</div></div>
    : <div className="empty-state" style={{ gridColumn: "1/-1" }}>
        <div className="empty-state-icon">📡</div>
        <div className="empty-state-text">No se pudieron cargar tus cajas — revisa tu conexión o toca Reconectar.</div></div>;
}

// La grilla se remonta (key) en cada render de app.js y al cambiar de modo:
// los gestos de gestos.js (mantener presionado / arrastrar) mutan el DOM y
// no tienen cómo desengancharse, así que cada montaje parte de nodos nuevos,
// igual que cuando renderCajas() reescribía el innerHTML.
function Grilla({ cajas, modoSuma, seleccion, alternarCaja, formatMonto, onAbrirDetalle, onAjustar, onReordenar }) {
  const gridRef = useRef(null);

  useEffect(() => {
    if (modoSuma) return; // en modo Sumar el toque simple solo selecciona
    const grid = gridRef.current;
    grid.querySelectorAll(".caja-card[data-nombre]").forEach(card => {
      const caja = cajas.find(c => c.nombre === card.dataset.nombre);
      window.crearManejadorArrastrable(card, grid, ".caja-card[data-nombre]", {
        onLargo: caja && caja.saldoReal < 0 ? () => window.abrirMenuEditarBorrar({
          titulo: caja.nombre, labelEditar: "⚖️ Ajustar", onEditar: () => onAjustar(caja.nombre),
        }) : undefined,
        // El arrastre ya reordenó el DOM; se lee ese orden y app.js lo guarda.
        onReordenar: () => onReordenar(
          Array.from(grid.querySelectorAll(".caja-card[data-nombre]")).map(c => c.dataset.nombre)),
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Doble toque -> detalle. onPointerUpCapture (no onPointerUp): corre ANTES
  // que el pointerup propio de crearManejadorArrastrable, que borra el flag
  // gestoPresionLarga -- así un mantener-presionado no cuenta como toque.
  const alSoltar = (e, nombre) => {
    if (modoSuma) { alternarCaja(nombre); return; }
    if (e.currentTarget.dataset.gestoPresionLarga === "1") return;
    onAbrirDetalle(nombre);
  };

  return (
    <div id="cajas-grid" className="cajas-grid" ref={gridRef}>
      {cajas.map(c => {
        const seleccionada = modoSuma && seleccion.has(c.nombre);
        return (
          <div key={c.nombre} data-nombre={c.nombre}
            className={"caja-card" + (seleccionada ? " caja-card-seleccionada" : "")}
            style={{ backgroundColor: c.colorFondo }}
            onPointerUpCapture={e => alSoltar(e, c.nombre)}>
            {c.saldoReal < 0 && (
              <div className="caja-card-top">
                <span className="caja-alerta-ajuste" title="El saldo real es negativo">⚠️ Requiere ajuste</span>
              </div>
            )}
            <div className="caja-nombre-fila">
              <span className="caja-nombre">{c.nombre}</span>
              {c.icono && <img className="caja-card-icono" src={c.icono} alt="" />}
            </div>
            <div className="caja-saldo positivo">{formatMonto(Math.max(0, c.saldoReal), c.moneda)}</div>
          </div>
        );
      })}
    </div>
  );
}

// Un total por moneda -- sumar COP con USD en un solo número no tendría
// sentido. Usa el saldo tal como se ve en la tarjeta (nunca negativo).
function BarraSuma({ activa, cajas, seleccion, formatMonto }) {
  const porMoneda = {};
  seleccion.forEach(nombre => {
    const c = cajas.find(x => x.nombre === nombre);
    if (!c) return;
    porMoneda[c.moneda] = (porMoneda[c.moneda] || 0) + Math.max(0, c.saldoReal);
  });
  const totales = Object.entries(porMoneda);
  return (
    <div id="sumar-cajas-barra" className={"sumar-cajas-barra" + (activa ? "" : " hidden")}>
      {activa && (totales.length === 0
        ? <span className="sumar-cajas-barra-vacio">Tocá las cajas que querés sumar</span>
        : totales.map(([moneda, total]) =>
            <span key={moneda} className="sumar-cajas-barra-total">{formatMonto(total, moneda)}</span>))}
    </div>
  );
}

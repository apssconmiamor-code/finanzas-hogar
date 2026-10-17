import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Props que arma app.js (ver renderCajas):
//   cajas[]            { id, nombre, moneda, saldoReal, icono } (TODAS)
//   ocultas[]          ids que el usuario no quiere ver en Inicio
//   onCambiarOcultas(ids[])  guarda la elección (app.js la persiste)
//   verificadaEnRed    false -> aviso de "no se pudieron cargar"
//   formatMonto(n, m)  formateador de la app
//   onAbrirDetalle(n)  doble toque (tapCaja) sobre una tarjeta
//   onAjustar(n)       mantener presionado, solo con saldo negativo
//   onReordenar(nombres[])  tras arrastrar una tarjeta
//   renderId           cambia en cada render() de app.js
// Las clases/ids son los de siempre (style.css + tests E2E no cambian).

export function Cajas({ cajas: todas, ocultas = [], onCambiarOcultas, verificadaEnRed, formatMonto, onAbrirDetalle, onAjustar, onReordenar, renderId }) {
  const [modoSuma, setModoSuma] = useState(false);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [eligiendo, setEligiendo] = useState(false);
  // La grilla se remonta en cada render (ver Grilla) y perdería su posición
  // de scroll horizontal: se recuerda acá para restaurarla.
  const scrollRef = useRef(0);
  // Inicio solo muestra las que el usuario eligió ver; las demás siguen
  // existiendo en el resto de la app.
  const cajas = todas.filter(c => !ocultas.includes(c.id));

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
        <div className="cajas-header-izq">
          {modoSuma && <SumaCajas cajas={cajas} seleccion={seleccion} formatMonto={formatMonto} />}
        </div>
        {modoSuma
          ? <button type="button" className="btn-sumar-cajas active" id="btn-sumar-cajas-listo"
              onClick={alternarModo}>Listo</button>
          : <MenuCajas onSumar={alternarModo} onElegir={() => setEligiendo(true)} />}
      </div>
      {cajas.length === 0
        ? <div id="cajas-grid" className="cajas-grid">
            <EstadoVacio verificadaEnRed={verificadaEnRed} hayOcultas={todas.length > 0} />
          </div>
        : <Grilla key={`${renderId}-${modoSuma}`} scrollRef={scrollRef} cajas={cajas} modoSuma={modoSuma} seleccion={seleccion}
            alternarCaja={alternarCaja} formatMonto={formatMonto}
            onAbrirDetalle={onAbrirDetalle} onAjustar={onAjustar} onReordenar={onReordenar} />}
      {eligiendo && createPortal(
        <ElegirCajas todas={todas} ocultas={ocultas} onCambiar={onCambiarOcultas}
          onCerrar={() => setEligiendo(false)} />,
        document.body)}
    </>
  );
}

// Submenú de Cajas: un solo botón ⋯ que despliega las acciones. Se cierra al
// elegir una, al tocar fuera o con Escape. Mismo estilo que el menú de la
// barra superior (.dropdown-menu / .dropdown-item).
function MenuCajas({ onSumar, onElegir }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const elegir = (accion) => { setAbierto(false); accion(); };

  return (
    <div className="cajas-menu" ref={ref}>
      <button type="button" className={"btn-sutil cajas-menu-btn" + (abierto ? " active" : "")}
        id="btn-menu-cajas" aria-haspopup="menu" aria-expanded={abierto} aria-label="Opciones de cajas"
        onClick={() => setAbierto(a => !a)}>⋯</button>
      {abierto && (
        <div className="dropdown-menu cajas-menu-panel" role="menu">
          <button type="button" role="menuitem" className="dropdown-item" id="btn-sumar-cajas"
            onClick={() => elegir(onSumar)}><span className="dd-icon">➕</span>Sumar cajas</button>
          <button type="button" role="menuitem" className="dropdown-item" id="btn-elegir-cajas"
            onClick={() => elegir(onElegir)}><span className="dd-icon">👁</span>Elegir cajas</button>
        </div>
      )}
    </div>
  );
}

// Panel "¿Qué cajas quieres ver?". Cada casilla guarda al instante.
function ElegirCajas({ todas, ocultas, onCambiar, onCerrar }) {
  const alternar = (id) => onCambiar(
    ocultas.includes(id) ? ocultas.filter(x => x !== id) : [...ocultas, id]);
  return (
    <div id="modal-elegir-cajas" className="modal" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal-card">
        <h3 className="modal-title">¿Qué cajas quieres ver?</h3>
        <p className="modal-subtitle">Solo cambia lo que ves en Inicio. Las demás siguen disponibles en el resto de la app.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "8px 0" }}>
          {todas.map(c => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", cursor: "pointer" }}>
              <input type="checkbox" checked={!ocultas.includes(c.id)} onChange={() => alternar(c.id)} />
              <span>{c.nombre}</span>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-primary" id="btn-cerrar-elegir-cajas" onClick={onCerrar}>Listo</button>
        </div>
      </div>
    </div>
  );
}

function EstadoVacio({ verificadaEnRed, hayOcultas }) {
  if (hayOcultas) {
    return <div className="empty-state" style={{ gridColumn: "1/-1" }}>
      <div className="empty-state-icon">🙈</div>
      <div className="empty-state-text">No tienes cajas visibles — toca "Cajas" para elegir cuáles ver.</div></div>;
  }
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
function Grilla({ scrollRef, cajas, modoSuma, seleccion, alternarCaja, formatMonto, onAbrirDetalle, onAjustar, onReordenar }) {
  const gridRef = useRef(null);
  // Pista de que hay más cajas: degradados en los bordes que tienen más
  // contenido y puntitos de "página" (una por cada tres cajas).
  const [borde, setBorde] = useState({ izq: false, der: false, pagina: 0 });
  const paginas = Math.ceil(cajas.length / 3);

  const medirScroll = () => {
    const g = gridRef.current;
    if (!g) return;
    scrollRef.current = g.scrollLeft;
    const max = g.scrollWidth - g.clientWidth;
    setBorde({
      izq: g.scrollLeft > 4,
      der: g.scrollLeft < max - 4,
      pagina: max > 0 ? Math.round((g.scrollLeft / max) * (paginas - 1)) : 0,
    });
  };

  useLayoutEffect(() => {
    gridRef.current.scrollLeft = scrollRef.current;
    medirScroll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="cajas-fila">
    <div id="cajas-grid" className="cajas-grid" ref={gridRef} onScroll={medirScroll}>
      {cajas.map(c => {
        const seleccionada = modoSuma && seleccion.has(c.nombre);
        return (
          <div key={c.nombre} data-nombre={c.nombre}
            className={"caja-card" + (seleccionada ? " caja-card-seleccionada" : "")}
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
    {borde.izq && <div className="cajas-fade cajas-fade-izq" aria-hidden="true" />}
    {borde.der && <div className="cajas-fade cajas-fade-der" aria-hidden="true" />}
    {paginas > 1 && (
      <div className="cajas-puntos" aria-hidden="true">
        {Array.from({ length: paginas }, (_, i) =>
          <span key={i} className={"cajas-punto" + (i === borde.pagina ? " activo" : "")} />)}
      </div>
    )}
    </div>
  );
}

// Total de las cajas elegidas, uno por moneda -- sumar COP con USD en un solo
// número no tendría sentido. Usa el saldo tal como se ve en la tarjeta (nunca
// negativo).
function SumaCajas({ cajas, seleccion, formatMonto }) {
  const porMoneda = {};
  seleccion.forEach(nombre => {
    const c = cajas.find(x => x.nombre === nombre);
    if (!c) return;
    porMoneda[c.moneda] = (porMoneda[c.moneda] || 0) + Math.max(0, c.saldoReal);
  });
  const totales = Object.entries(porMoneda);
  // Vive en la fila de arriba, a la izquierda (frente al ⋯/Listo de la
  // derecha), en vez de una barra flotante.
  return (
    <div id="sumar-cajas-barra" className="cajas-suma">
      {totales.length === 0
        ? <span className="sumar-cajas-barra-vacio">Tocá las cajas que querés sumar</span>
        : totales.map(([moneda, total]) =>
            <span key={moneda} className="sumar-cajas-barra-total">{formatMonto(total, moneda)}</span>)}
    </div>
  );
}

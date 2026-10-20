import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MenuOpciones } from "../shared/MenuOpciones.jsx";
import { FilaDeslizable } from "../shared/FilaDeslizable.jsx";
import { Icono, LogoCaja } from "../shared/Iconos.jsx";
import { BarraInferior } from "../shared/BarraInferior.jsx";
import { crearManejadorLargo } from "../shared/gestos.js";

// Props que arma app.js (ver renderCajas):
//   cajas[]            { id, nombre, moneda, saldoReal, icono } (TODAS)
//   ocultas[]          ids que el usuario no quiere ver en Inicio
//   onCambiarOcultas(ids[])  guarda la elección (app.js la persiste)
//   verificadaEnRed    false -> aviso de "no se pudieron cargar"
//   formatMonto(n, m)  formateador de la app
//   onAbrirDetalle(n)  doble toque (tapCaja) sobre una tarjeta
//   onAjustar(n)       mantener presionado, solo con saldo negativo
//   onReordenar(nombres[])  tras arrastrar una tarjeta
//   alertasPendientes  número (Activos + Pasados) que se muestra sobre el atajo Alertas
//   onAccionesRapidas() el rayo ⚡ de la zona Widgets y acciones rápidas
//   onIrATab(tab)      atajos redondos: movimientos, proyeccion, notificaciones (Alertas),
//                      mercado, planes, compromisos, resumen (Análisis)
//   version            versión de la app, en la franja inferior de Inicio
//   onBuscarActualizacion()  devuelve una promesa: mantener presionada la versión
//   onMostrarAyudaVersion()  un toque corto en la versión: avisa cómo se fuerza
//   onCerrarSesion()   ítem "Cerrar sesión" del menú de la franja
//   renderId           cambia en cada render() de app.js
// Las clases/ids son los de siempre (style.css + tests E2E no cambian).

export function Cajas({ cajas: todas, ocultas = [], onCambiarOcultas, verificadaEnRed, formatMonto, onAbrirDetalle, onAjustar, onReordenar, onIrATab, onAccionesRapidas, alertasPendientes = 0, version, onBuscarActualizacion, onMostrarAyudaVersion, onCerrarSesion, renderId }) {
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
      <BarraInferior tab="cajas">
        <div className="barra-lado barra-lado-izq" />
        <div className="barra-centro">
          {modoSuma
            ? <button type="button" className="btn-sumar-cajas active" id="btn-sumar-cajas-listo"
                onClick={alternarModo}>Listo</button>
            : <MenuOpciones id="btn-menu-cajas" etiqueta="Opciones de cajas" items={[
                { id: "btn-sumar-cajas", icono: "sumar", texto: "Sumar cajas", accion: alternarModo },
                { id: "btn-elegir-cajas", icono: "elegir", texto: "Elegir cajas", accion: () => setEligiendo(true) },
                { id: "btn-cerrar-sesion", icono: "salir", texto: "Cerrar sesión", accion: onCerrarSesion },
              ]} />}
        </div>
        <div className="barra-lado barra-lado-der">
          {modoSuma
            ? <SumaCajas cajas={cajas} seleccion={seleccion} formatMonto={formatMonto} />
            : <CampoVersion version={version} onBuscar={onBuscarActualizacion} onAyuda={onMostrarAyudaVersion} />}
        </div>
      </BarraInferior>
      {cajas.length === 0
        ? <div id="cajas-grid" className="cajas-grid">
            <EstadoVacio verificadaEnRed={verificadaEnRed} hayOcultas={todas.length > 0} />
          </div>
        : <Grilla key={`${renderId}-${modoSuma}`} scrollRef={scrollRef} cajas={cajas} modoSuma={modoSuma} seleccion={seleccion}
            alternarCaja={alternarCaja} formatMonto={formatMonto}
            onAbrirDetalle={onAbrirDetalle} onAjustar={onAjustar} onReordenar={onReordenar} />}
      <Atajos onIrATab={onIrATab} alertasPendientes={alertasPendientes} />
      <Widgets onAccionesRapidas={onAccionesRapidas} />
      {eligiendo && createPortal(
        <ElegirCajas todas={todas} ocultas={ocultas} onCambiar={onCambiarOcultas}
          onCerrar={() => setEligiendo(false)} />,
        document.body)}
    </>
  );
}

// Botones redondos de acceso rápido, dentro de una caja contenedora debajo de
// las cajas.
function Atajos({ onIrATab, alertasPendientes }) {
  const atajos = [
    { id: "atajo-movimientos", icono: "movimientos", texto: "Movimientos", accion: () => onIrATab("movimientos") },
    { id: "atajo-proyeccion", icono: "proyeccion", texto: "Proyección", accion: () => onIrATab("proyeccion") },
    { id: "atajo-alertas", icono: "alertas", texto: "Alertas", accion: () => onIrATab("notificaciones"), contador: alertasPendientes },
    { id: "atajo-mercado", icono: "mercado", texto: "Mercado", accion: () => onIrATab("mercado") },
    { id: "atajo-planes", icono: "planes", texto: "Planes", accion: () => onIrATab("planes") },
    { id: "atajo-compromisos", icono: "compromisos", texto: "Compromisos", accion: () => onIrATab("compromisos") },
    { id: "atajo-analisis", icono: "analisis", texto: "Análisis", accion: () => onIrATab("resumen") },
  ];
  return (
    <>
    <div className="cajas-atajos-titulo">Más opciones</div>
    <div className="cajas-atajos">
      {atajos.map(a => (
        <button key={a.id} type="button" id={a.id} className="cajas-atajo" onClick={a.accion}>
          <span className="cajas-atajo-circulo" aria-hidden="true">
            <Icono nombre={a.icono} />
            {a.contador > 0 && <span className="cajas-atajo-badge">{a.contador > 99 ? "99+" : a.contador}</span>}
          </span>
          <span className="cajas-atajo-texto">{a.texto}</span>
        </button>
      ))}
    </div>
    </>
  );
}

// Zona de widgets y acciones rápidas, debajo de "Más opciones". El primero es el
// rayo ⚡ "Nuevo movimiento", que abre el menú de Acciones rápidas (antes era un
// botón flotante que seguía a todas las pantallas). Esta zona va en morado
// y en cuadritos (la otra caja, en azul y círculos) para distinguirlas. Mantiene el id fab-recordatorio de siempre.
function Widgets({ onAccionesRapidas }) {
  return (
    <>
      <div className="cajas-atajos-titulo">Widgets y acciones rápidas</div>
      <div className="cajas-atajos cajas-atajos-morado">
        <button type="button" id="fab-recordatorio" className="cajas-atajo" onClick={onAccionesRapidas}>
          <span className="cajas-atajo-circulo" aria-hidden="true"><Icono nombre="rayo" /></span>
          <span className="cajas-atajo-texto">Nuevo movimiento</span>
        </button>
      </div>
    </>
  );
}

// Versión de la app, en la franja inferior de Inicio. Mantenerla presionada FUERZA la
// búsqueda de una actualización (si no, la app se actualiza sola cuando encuentra una
// nueva). Un toque corto solo recuerda cómo se fuerza, para que un roce no dispare nada.
function CampoVersion({ version, onBuscar, onAyuda }) {
  const [buscando, setBuscando] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    return crearManejadorLargo(ref.current, {
      onLargo: async () => {
        setBuscando(true);
        try { await onBuscar(); } finally { setBuscando(false); }
      },
      onCorto: () => onAyuda && onAyuda(),
    });
  }, [onBuscar, onAyuda]);

  return (
    <button type="button" id="campo-version" ref={ref} className={"campo-version" + (buscando ? " buscando" : "")}
      title="Mantén presionada para buscar una actualización" aria-label={"Versión " + version + ". Mantén presionada para buscar una actualización"}>
      {buscando ? "Buscando…" : "v" + version}
    </button>
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
      <div className="empty-state-icon"><Icono nombre="ojoOff" size={40} /></div>
      <div className="empty-state-text">No tienes cajas visibles — toca "Cajas" para elegir cuáles ver.</div></div>;
  }
  return verificadaEnRed
    ? <div className="empty-state" style={{ gridColumn: "1/-1" }}>
        <div className="empty-state-icon"><Icono nombre="banco" size={40} /></div>
        <div className="empty-state-text">No tienes cajas aún. Crea una para empezar.</div></div>
    : <div className="empty-state" style={{ gridColumn: "1/-1" }}>
        <div className="empty-state-icon"><Icono nombre="wifi" size={40} /></div>
        <div className="empty-state-text">No se pudieron cargar tus cajas — revisa tu conexión o toca Reconectar.</div></div>;
}

// La grilla se remonta (key) en cada render de app.js y al cambiar de modo:
// los gestos de gestos.js (mantener presionado / arrastrar) mutan el DOM y
// no tienen cómo desengancharse, así que cada montaje parte de nodos nuevos,
// igual que cuando renderCajas() reescribía el innerHTML.
function Grilla({ scrollRef, cajas, modoSuma, seleccion, alternarCaja, formatMonto, onAbrirDetalle, onAjustar, onReordenar }) {
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
    <FilaDeslizable id="cajas-grid" cantidad={cajas.length} scrollRef={scrollRef} gridRef={gridRef}>
      {cajas.map(c => {
        const seleccionada = modoSuma && seleccion.has(c.nombre);
        return (
          <div key={c.nombre} data-nombre={c.nombre}
            className={"caja-card" + (seleccionada ? " caja-card-seleccionada" : "")}
            onPointerUpCapture={e => alSoltar(e, c.nombre)}>
            {c.saldoReal < 0 && (
              <div className="caja-card-top">
                <span className="caja-alerta-ajuste" title="El saldo real es negativo"><Icono nombre="alerta" size={14} /> Requiere ajuste</span>
              </div>
            )}
            <div className="caja-nombre-fila">
              <span className="caja-nombre">{c.nombre}</span>
              <LogoCaja icono={c.icono} clase="caja-card-icono" />
            </div>
            <div className="caja-saldo positivo">{formatMonto(Math.max(0, c.saldoReal), c.moneda)}</div>
          </div>
        );
      })}
    </FilaDeslizable>
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
  // Vive en la fila de arriba, a la derecha (frente al ⋯/Listo de la
  // izquierda), en vez de una barra flotante.
  return (
    <div id="sumar-cajas-barra" className="cajas-suma">
      {totales.length === 0
        ? <span className="sumar-cajas-barra-vacio">Tocá las cajas que querés sumar</span>
        : totales.map(([moneda, total]) =>
            <span key={moneda} className="sumar-cajas-barra-total">{formatMonto(total, moneda)}</span>)}
    </div>
  );
}

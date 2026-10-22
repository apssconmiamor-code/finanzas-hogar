import { useEffect, useMemo, useRef } from "react";
import { Icono } from "../shared/Iconos.jsx";

// Pantalla de Compromisos: Préstamos arriba y la Lista de compras abajo. app.js / prestamo.js /
// compras.js siguen siendo dueños de los datos (Sheets, cálculo de lo pagado); acá solo se dibuja
// y se manejan los gestos de las tarjetas:
//   doble toque = resumen de solo lectura · mantener presionado = menú con Eliminar.
//
// Props (ver renderCompromisosPantalla en prestamo.js):
//   renderId
//   prestamos[]   { id, nombre, pagado, monto, pagadoMonto, pendiente, pct, cuotas, fechaInicio, descripcion }
//   totales       { deuda, pagado, pendiente }  de los préstamos en curso
//   compras[]     { id, concepto, urgencia, categoria, montoDestinado }  ya ordenadas
//   urgencias     { Alta|Media|Baja: { color, bg, clase } }
//   formatMonto(n)
//   onNuevoPrestamo() / onNuevaCompra()           botones "+ Nuevo" (la franja inferior los pulsa)
//   onPago(prestamo) / onResumenPrestamo(id) / onBorrarPrestamo(id)
//   onComprar(id) / onResumenCompra(id) / onBorrarCompra(id)

// Se remonta en cada render de afuera (key): los gestos se conectan al DOM recién dibujado, como en Cajas.
export function PantallaCompromisos(props) {
  return <Contenido key={props.renderId} {...props} />;
}

function Contenido(props) {
  const { prestamos, totales, compras, formatMonto, onNuevoPrestamo, onNuevaCompra } = props;
  const rootPrest = useRef(null);
  const rootCompras = useRef(null);

  // Gestos de las tarjetas (mismos manejadores de gestos.js que usa el resto de la app).
  useEffect(() => {
    const quitar = [];
    const conectar = (contenedor, selector, abrirResumen, borrar, titulo) => {
      if (!contenedor) return;
      const tap = window.crearManejadorDobleToque(id => id, id => abrirResumen(id));
      contenedor.querySelectorAll(selector).forEach(card => {
        const id = card.dataset.id;
        window.crearManejadorPresionSostenida(card, {
          onLargo: () => window.abrirMenuEditarBorrar({ titulo: titulo(id), onBorrar: () => borrar(id) }),
        });
        // Un toque sobre un botón de la tarjeta ("Registrar pago", "Comprar ahora") no cuenta como toque de la tarjeta.
        card.addEventListener("pointerup", e => { if (!e.target.closest("button")) tap(id, e); });
      });
    };
    conectar(rootPrest.current, ".prestamo-card[data-id]", props.onResumenPrestamo, props.onBorrarPrestamo,
      id => prestamos.find(p => p.id === id)?.nombre || "");
    conectar(rootCompras.current, ".compra-item[data-id]", props.onResumenCompra, props.onBorrarCompra,
      id => compras.find(c => c.id === id)?.concepto || "");
    return () => quitar.forEach(f => f());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activos = useMemo(() => prestamos.filter(p => !p.pagado), [prestamos]);
  const pagados = useMemo(() => prestamos.filter(p => p.pagado), [prestamos]);

  const tarjeta = p => {
    const colorBarra = p.pct >= 100 ? "var(--green)" : "var(--blue)";
    return (
      <div key={p.id} className={"prestamo-card" + (p.pagado ? " prestamo-pagado" : "")} data-id={p.id}>
        <div className="prest-left-bar" style={{ background: p.pagado ? "var(--green)" : "var(--red)" }} />
        <div className="prest-body">
          <div className="prest-header">
            <span className="prestamo-nombre">{p.nombre}</span>
            {p.pagado
              ? <span className="prestamo-badge pagado-badge"><Icono nombre="hecho" size={14} /> Pagado</span>
              : <span className="prestamo-badge activo-badge">En curso</span>}
          </div>

          <div className="prest-progress-row">
            <div className="prest-bar-bg">
              <div className="prest-bar-fill" style={{ width: p.pct + "%", background: colorBarra }} />
            </div>
            <span className="prest-pct">{p.pct}%</span>
          </div>

          <div className="prest-montos">
            <div className="prest-monto-item">
              <span className="prest-monto-label">Total</span>
              <span className="prest-monto-val">{formatMonto(p.monto)}</span>
            </div>
            <div className="prest-monto-item">
              <span className="prest-monto-label">Pagado</span>
              <span className="prest-monto-val" style={{ color: "var(--green)" }}>{formatMonto(p.pagadoMonto)}</span>
            </div>
            <div className="prest-monto-item">
              <span className="prest-monto-label">Por pagar</span>
              <span className="prest-monto-val" style={{ color: "var(--red)" }}>{formatMonto(p.pendiente)}</span>
            </div>
          </div>

          {p.cuotas > 0 && (
            <div className="prest-meta-row">
              <Icono nombre="calendario" size={14} /> {p.cuotas} cuota{p.cuotas > 1 ? "s" : ""} · Inicio: {p.fechaInicio || "—"}
            </div>
          )}
          {p.descripcion && <div className="prest-meta-row prest-desc">{p.descripcion}</div>}

          <div className="prestamo-acciones">
            {!p.pagado && (
              <button className="btn-primary btn-prest-pago" type="button"
                onClick={e => { e.stopPropagation(); props.onPago(p); }}>
                <Icono nombre="tarjeta" size={16} /> Registrar pago
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="resumen-bloque-titulo"><Icono nombre="corazon" size={16} /> Préstamos</div>
      <div id="planes-panel-prestamos" className="planes-panel">
        <button className="btn-secondary btn-franja" id="btn-nuevo-prestamo" type="button" onClick={onNuevoPrestamo}>+ Nuevo</button>
        <div className="prestamos-resumen">
          <div className="resumen-item deuda"><span className="resumen-label">Deuda activa</span><span id="prest-total-deuda" className="resumen-valor">{formatMonto(totales.deuda)}</span></div>
          <div className="resumen-item pagado"><span className="resumen-label">Total pagado</span><span id="prest-total-pagado" className="resumen-valor">{formatMonto(totales.pagado)}</span></div>
          <div className="resumen-item pendiente"><span className="resumen-label">Por pagar</span><span id="prest-total-pendiente" className="resumen-valor">{formatMonto(totales.pendiente)}</span></div>
        </div>
        <div id="prestamos-grid" className="prestamos-grid" ref={rootPrest}>
          {prestamos.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: "1/-1" }}>
              <div className="empty-state-icon"><Icono nombre="banco" size={40} /></div>
              <div className="empty-state-text">No tienes préstamos registrados. Crea uno para empezar a hacer seguimiento.</div>
            </div>
          ) : (
            <>
              {activos.length > 0 && <div className="prestamos-seccion-title">En curso ({activos.length})</div>}
              {activos.map(tarjeta)}
              {pagados.length > 0 && <div className="prestamos-seccion-title pagados-title">Pagados ({pagados.length})</div>}
              {pagados.map(tarjeta)}
            </>
          )}
        </div>
      </div>

      <div className="resumen-bloque-titulo" style={{ marginTop: 24 }}><Icono nombre="carrito" size={16} /> Lista de compras</div>
      <div id="planes-panel-compras" className="planes-panel">
        <button className="btn-secondary btn-franja" id="btn-nueva-compra" type="button" onClick={onNuevaCompra}>+ Nuevo</button>
        <div id="compras-list" ref={rootCompras}>
          {compras.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Icono nombre="bolsa" size={40} /></div>
              <div className="empty-state-text">No hay compras pendientes. ¡Agrega lo que quieres comprar!</div>
            </div>
          ) : compras.map(c => {
            const urg = props.urgencias[c.urgencia] || props.urgencias.Media;
            return (
              <div key={c.id} className="compra-item" data-id={c.id}>
                <div className="compra-urg-bar" style={{ background: urg.color }} />
                <div className="compra-body">
                  <div className="compra-top">
                    <div className="compra-info">
                      <span className="compra-concepto">{c.concepto}</span>
                      <span className="compra-urgencia-badge" style={{ background: urg.bg, color: urg.color }}>
                        <Icono nombre="punto" size={12} clase={"ic " + urg.clase} /> {c.urgencia}
                      </span>
                      {c.categoria && <span className="compra-cat-badge">{c.categoria}</span>}
                    </div>
                    <div className="compra-monto-wrap">
                      {c.montoDestinado > 0
                        ? <span className="compra-monto">{formatMonto(c.montoDestinado)}</span>
                        : <span className="compra-monto-vacio">Sin monto</span>}
                    </div>
                  </div>
                  <div className="compra-acciones">
                    <button className="btn-comprar btn-primary" type="button"
                      onClick={e => { e.stopPropagation(); props.onComprar(c.id); }}>
                      <Icono nombre="carrito" size={16} /> Comprar ahora
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

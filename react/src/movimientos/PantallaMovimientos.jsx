import { useEffect, useRef, useState } from "react";
import { Icono, IconoDe } from "../shared/Iconos.jsx";

// Pantalla de Movimientos: filtros, resumen (ingresos / gastos / balance), la franja del mes y la lista
// de movimientos. app.js sigue siendo dueño de los datos (Sheets, filtros elegidos, cálculos, mes
// archivado); acá solo se dibuja y se manejan los gestos de las tarjetas:
//   doble toque = resumen de solo lectura · mantener presionado = Editar / Eliminar
//   (en el modo "Sumar": un toque suma / resta la tarjeta del total).
//
// Props (ver renderMovimientos en app.js):
//   renderId
//   filtros         { mes, categoria, subcategoria }
//   subOpciones[]   conceptos entre los que se puede filtrar (según la categoría)
//   resumen         { ingresos, gastos, balance, balanceColor }   textos ya formateados
//   franjaMes       "octubre de 2026" | "todos los meses"
//   modoSuma        true mientras se está sumando movimientos
//   lista           { tipo: "tarjetas", tarjetas[] } | { tipo: "vacio" } | { tipo: "buscando" }
//                   | { tipo: "archivado", cantidad, tarjetas[] }  (un mes ya archivado: solo lectura)
//                   tarjeta: { id, caja, fecha, concepto, descripcion, monto, cls, icono, foto, seleccionada }
//   onFiltro(campo, valor) / onNuevo(tipo) / onToggleSuma()
//   onSeleccionar(id) / onResumen(id) / onEditar(id) / onBorrar(id) / onFoto(url)

export function PantallaMovimientos(props) {
  return <Contenido key={props.renderId} {...props} />;
}

// Conecta los gestos de las tarjetas de un contenedor (mismos manejadores de gestos.js de siempre).
function conectarTarjetas(cont, { modoSuma, conMenu, tarjetas, props }) {
  const tap = window.crearManejadorDobleToque(id => id, id => props.onResumen(id));
  cont.querySelectorAll(".mov-card[data-id]").forEach(card => {
    const id = card.dataset.id;
    // El clip de "tiene foto o audio" abre el archivo; no cuenta como toque de la tarjeta.
    card.querySelectorAll(".mov-card-foto-icono").forEach(clip => {
      clip.addEventListener("pointerup", e => e.stopPropagation());
    });
    if (modoSuma) {
      card.addEventListener("pointerup", () => {
        card.classList.toggle("mov-card-seleccionada");
        props.onSeleccionar(id);
      });
      return;
    }
    if (conMenu) {
      const t = tarjetas.find(x => x.id === id);
      window.crearManejadorPresionSostenida(card, {
        onLargo: () => window.abrirMenuEditarBorrar({
          titulo: t?.concepto || "Movimiento",
          onEditar: () => props.onEditar(id),
          onBorrar: () => props.onBorrar(id),
        }),
      });
    }
    card.addEventListener("pointerup", e => tap(id, e));
  });
}

function Tarjeta({ t, onFoto }) {
  return (
    <div className={"mov-card" + (t.seleccionada ? " mov-card-seleccionada" : "")} data-id={t.id}>
      <div className="mov-card-row1">
        <span className="mov-card-caja">{t.caja}</span>
        <span className="mov-card-fecha">{t.fecha}</span>
      </div>
      <div className="mov-card-row2">
        <div className="mov-card-left">
          <span className="mov-card-icono"><IconoDe valor={t.icono} size={16} /></span>
          <div className="mov-card-texto">
            <span className="mov-card-concepto">
              {t.concepto || "Sin concepto"}
              {t.foto && (
                <span className="mov-card-foto-icono" title="Tiene foto o audio adjunto"
                  onClick={e => { e.stopPropagation(); onFoto(t.foto); }}>
                  <Icono nombre="clip" size={12} />
                </span>
              )}
            </span>
            {t.descripcion && <span className="mov-desc-inline">· {t.descripcion}</span>}
          </div>
        </div>
        <div className="mov-card-right">
          <span className={"mov-card-monto " + t.cls}>{t.monto}</span>
        </div>
      </div>
    </div>
  );
}

function Contenido(props) {
  const { filtros, subOpciones, resumen, franjaMes, modoSuma, lista } = props;
  const listaRef = useRef(null);
  const detalleRef = useRef(null);
  const [verDetalle, setVerDetalle] = useState(false);

  useEffect(() => {
    if (lista.tipo === "tarjetas" && listaRef.current) {
      conectarTarjetas(listaRef.current, { modoSuma, conMenu: true, tarjetas: lista.tarjetas, props });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Un mes ya archivado se ve de solo lectura: el detalle aparece al tocar "Ver detalle".
  useEffect(() => {
    if (verDetalle && detalleRef.current) conectarTarjetas(detalleRef.current, { modoSuma: false, conMenu: false, tarjetas: [], props });
  }, [verDetalle]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrar = campo => e => props.onFiltro(campo, e.target.value);

  return (
    <>
      <div className="tipo-mov-btn-group" id="tipo-mov-btn-group">
        <button type="button" className="tipo-mov-btn" id="btn-nuevo-ingreso" onClick={() => props.onNuevo("Ingreso")}>Ingreso</button>
        <button type="button" className="tipo-mov-btn" id="btn-nuevo-gasto" onClick={() => props.onNuevo("Gasto")}>Gasto</button>
        <button type="button" className="tipo-mov-btn" id="btn-nueva-transferencia" onClick={() => props.onNuevo("Transferencia")}>Transferencia</button>
      </div>

      <div className="filtros-bar">
        <span className="filtros-icono" title="Filtros" aria-hidden="true"><Icono nombre="filtro" size={16} /></span>
        <input id="filtro-mes" type="month" className="input-sm" value={filtros.mes} onChange={filtrar("mes")} />
        <select id="filtro-concepto" className="input-sm" value={filtros.categoria} onChange={filtrar("categoria")}>
          <option value="">Todas las categorías</option>
          <option value="Ingreso">Ingreso</option>
          <option value="Gasto fijo">Gasto fijo</option>
          <option value="Gasto variable">Gasto variable</option>
          <option value="Transferencia">Transferencia</option>
        </select>
        <select id="filtro-subcategoria" className="input-sm" value={filtros.subcategoria} disabled={subOpciones.length === 0}
          onChange={filtrar("subcategoria")}>
          <option value="">Todas</option>
          {subOpciones.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div id="resumen-bar" className="resumen-bar">
        <div className="resumen-item ingreso">
          <span className="resumen-label">Ingresos</span>
          <span id="total-ingresos" className="resumen-valor">{resumen.ingresos}</span>
        </div>
        <div className="resumen-item gasto">
          <span className="resumen-label">Gastos</span>
          <span id="total-gastos" className="resumen-valor">{resumen.gastos}</span>
        </div>
        <div className="resumen-item balance">
          <span className="resumen-label">Balance</span>
          <span id="total-balance" className="resumen-valor" style={{ color: resumen.balanceColor }}>{resumen.balance}</span>
        </div>
      </div>

      <div id="movimientos-franja" className="movimientos-franja">Movimientos de <span id="movimientos-franja-mes">{franjaMes}</span></div>
      <div className="cajas-header">
        <button type="button" className={"btn-sutil" + (modoSuma ? " active" : "")} id="btn-sumar-mov"
          onClick={props.onToggleSuma}>{modoSuma ? "Listo" : "Sumar"}</button>
      </div>

      <div id="movimientos-list" className="movimientos-list" ref={listaRef}>
        {lista.tipo === "buscando" && (
          <div className="empty-state">
            <div className="empty-state-icon"><Icono nombre="arena" size={40} /></div>
            <div className="empty-state-text">Buscando en el archivo…</div>
          </div>
        )}
        {lista.tipo === "vacio" && (
          <div className="empty-state">
            <div className="empty-state-icon"><Icono nombre="lista" size={40} /></div>
            <div className="empty-state-text">No hay movimientos para este período.</div>
          </div>
        )}
        {lista.tipo === "tarjetas" && lista.tarjetas.map(t => <Tarjeta key={t.id} t={t} onFoto={props.onFoto} />)}
        {lista.tipo === "archivado" && (
          <>
            <div className="mes-archivado-resumen">
              <span className="mes-archivado-icono"><Icono nombre="archivo" size={20} /></span>
              <span>Este mes ya se archivó para aligerar la app — se ve un resumen; el detalle completo sigue disponible.</span>
            </div>
            <button type="button" className="btn-secondary mes-archivado-btn-detalle" id="btn-ver-detalle-archivado"
              onClick={() => setVerDetalle(v => !v)}>
              {verDetalle ? "Ocultar detalle" : `Ver detalle (${lista.cantidad})`}
            </button>
            {verDetalle && (
              <div id="detalle-archivado-lista" ref={detalleRef}>
                {lista.tarjetas.map(t => <Tarjeta key={t.id} t={t} onFoto={props.onFoto} />)}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

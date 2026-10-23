import { useEffect, useRef } from "react";
import { Icono, IconoDe } from "../shared/Iconos.jsx";

// Pantalla de Alertas: la cuadrícula de bloques (Activos, Pasados, Gastos fijos, Otros y los del usuario) y,
// al tocar uno, la lista de sus alertas. notificaciones.js sigue siendo dueño de los datos (Sheets,
// fechas, qué bloque está abierto); acá solo se dibuja y se manejan los gestos:
//   bloque propio: toque = abrirlo · mantener presionado = Editar / Eliminar · mantener y arrastrar = reordenar
//   alerta:        doble toque = resumen de solo lectura · mantener presionado = Editar / Eliminar
//                  (menos en "Activos", donde solo se confirma que ya se atendió)
//
// Props (ver renderNotificaciones en notificaciones.js):
//   renderId
//   bloqueAbierto   null = la cuadrícula; o la clave del bloque abierto
//   grupos[]        { clave, titulo, icono, cantidad, esAgrupacion }  (cantidad solo en Activos / Pasados)
//   detalle         { titulo, icono, total, esBloque, eliminable, nombreBloque, valorBloque, esActivos,
//                     conBotonesRevisar, items[] }  items: { id, titulo, claseDia, proximaTexto }
//   onAbrir(clave) / onVolver() / onNuevoBloque() / onReordenar(grid)
//   onEditarBloque(nombre) / onBorrarBloque(nombre)
//   onNuevaAlerta(valorBloque) / onResumen(id) / onEditar(id) / onBorrar(id) / onVista(id) / onRealizada(id)

// Íconos de los bloques fijos; los bloques del usuario traen su propio ícono (un emoji guardado).
const ICONO_FIJO = { activos: "campana", pasados: "reloj", gastosFijos: "pin", otros: "etiqueta" };

function IconoBloque({ clave, icono, size }) {
  return ICONO_FIJO[clave] ? <Icono nombre={ICONO_FIJO[clave]} size={size} /> : <IconoDe valor={icono} size={size} />;
}

export function PantallaAlertas(props) {
  return <Contenido key={props.renderId} {...props} />;
}

function Contenido(props) {
  const raiz = useRef(null);
  const { bloqueAbierto } = props;

  useEffect(() => {
    const cont = raiz.current;
    if (!cont) return;
    if (bloqueAbierto === null) {
      const grid = cont.querySelector(".alertas-bloques-grid");
      cont.querySelectorAll(".alerta-bloque-card[data-clave]").forEach(btn => {
        const clave = btn.dataset.clave;
        // Solo los bloques que el usuario creó (bloque_N) se pueden editar y reordenar: los fijos
        // (Activos / Pasados / Gastos fijos / Otros) van siempre primero, en ese orden.
        if (!clave.startsWith("bloque_")) return;
        const g = props.grupos.find(x => x.clave === clave);
        window.crearManejadorArrastrable(btn, grid, '.alerta-bloque-card[data-clave^="bloque_"]', {
          onCorto: () => props.onAbrir(clave),
          onLargo: () => g && window.abrirMenuEditarBorrar({
            titulo: g.titulo,
            onEditar: () => props.onEditarBloque(g.titulo),
            onBorrar: () => props.onBorrarBloque(g.titulo),
          }),
          onReordenar: () => props.onReordenar(grid),
        });
      });
    } else {
      const tap = window.crearManejadorDobleToque(id => id, id => props.onResumen(id));
      cont.querySelectorAll(".notificacion-item[data-id]").forEach(item => {
        const id = item.dataset.id;
        // Un toque sobre "Revisada" / "Realizada" no cuenta como toque (ni como mantener presionado) de la tarjeta.
        item.querySelectorAll("button").forEach(b => {
          b.addEventListener("pointerdown", e => e.stopPropagation());
          b.addEventListener("pointerup", e => e.stopPropagation());
        });
        if (!props.detalle.esActivos) {
          const titulo = props.detalle.items.find(n => n.id === id)?.titulo || "";
          window.crearManejadorPresionSostenida(item, {
            onLargo: () => window.abrirMenuEditarBorrar({
              titulo, onEditar: () => props.onEditar(id), onBorrar: () => props.onBorrar(id),
            }),
          });
        }
        item.addEventListener("pointerup", e => tap(id, e));
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (bloqueAbierto !== null) return <Detalle {...props} raiz={raiz} />;

  return (
    <div id="notificaciones-list" ref={raiz}>
      <div className="alertas-bloques-grid">
        {props.grupos.map(g => (
          <button key={g.clave} type="button" data-clave={g.clave}
            className={"alerta-bloque-card" + (g.esAgrupacion ? " alerta-bloque-card-agrupacion" : "")}
            onClick={g.clave.startsWith("bloque_") ? undefined : () => props.onAbrir(g.clave)}>
            {g.esAgrupacion && g.cantidad > 0 && <span className="alerta-bloque-cantidad">{g.cantidad}</span>}
            <span className="alerta-bloque-icono"><IconoBloque clave={g.clave} icono={g.icono} size={40} /></span>
            <span className="alerta-bloque-nombre">{g.titulo}</span>
          </button>
        ))}
        <button type="button" className="alerta-bloque-card alerta-bloque-agregar" id="btn-nuevo-bloque" onClick={props.onNuevoBloque}>
          <span className="alerta-bloque-icono"><Icono nombre="sumar" size={40} /></span>
          <span className="alerta-bloque-nombre">Agregar bloque</span>
        </button>
      </div>
    </div>
  );
}

function Detalle({ raiz, bloqueAbierto, detalle, onVolver, onNuevaAlerta, onBorrarBloque, onVista, onRealizada }) {
  return (
    <div id="notificaciones-list" ref={raiz}>
      <div className="alerta-bloque-detalle-header">
        <button type="button" className="btn-volver" id="btn-volver-bloque-alerta" title="Volver" aria-label="Volver" onClick={onVolver}>‹</button>
        <span className="alerta-bloque-detalle-titulo">
          <IconoBloque clave={bloqueAbierto} icono={detalle.icono} size={18} /> {detalle.titulo} ({detalle.total})
        </span>
        {detalle.eliminable && (
          <button type="button" className="notif-btn-borrar-bloque" title="Eliminar bloque" onClick={() => onBorrarBloque(detalle.nombreBloque)}>
            <Icono nombre="papelera" size={18} />
          </button>
        )}
      </div>
      {detalle.esBloque && (
        <button type="button" className="btn-primary btn-franja" id="btn-nueva-notificacion-bloque"
          onClick={() => onNuevaAlerta(detalle.valorBloque)}>+ Nueva</button>
      )}
      {detalle.items.length === 0
        ? <div className="notif-bloque-vacio">No hay alertas acá todavía.</div>
        : detalle.items.map(n => (
          <div key={n.id} className={"notificacion-item" + n.claseDia} data-id={n.id}>
            <div className="notif-card-grid">
              <div className="notif-card-fila-superior">
                <span className="notif-card-nombre">
                  <span className="notif-card-icon"><IconoBloque clave={bloqueAbierto} icono={detalle.icono} size={16} /></span>{n.titulo}
                </span>
                <span className="notif-card-proximo"><Icono nombre="calendario" size={14} /> {n.proximaTexto}</span>
              </div>
              {detalle.conBotonesRevisar && (
                <div className="notif-card-botones">
                  <button className="btn-secondary" type="button" onClick={() => onVista(n.id)}><Icono nombre="ojo" size={16} /> Revisada</button>
                  <button className="btn-primary" type="button" onClick={() => onRealizada(n.id)}><Icono nombre="hecho" size={16} /> Realizada</button>
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

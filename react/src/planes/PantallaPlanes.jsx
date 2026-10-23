import { useEffect, useRef } from "react";
import { Icono, IconoDe } from "../shared/Iconos.jsx";

// Pantalla de Planes: la cuadrícula de categorías (2 columnas, igual que Alertas y Mercado) y, al
// tocar una, la lista de sus planes. planes.js sigue siendo dueño de los datos (Sheets, qué categoría
// está abierta); acá solo se dibuja y se manejan los gestos:
//   categoría: toque = abrirla · mantener presionado = Editar / Eliminar · mantener y arrastrar = reordenar
//   plan:      doble toque = resumen de solo lectura · mantener presionado = Editar / Eliminar
//
// Props (ver renderPlanes en planes.js):
//   renderId
//   bloqueAbierto   null = la cuadrícula; o la clave de la categoría abierta ("otros", "bloque_0"...)
//   grupos[]        { clave, titulo, icono, cantidad }
//   detalle         { titulo, icono, total, eliminable, nombreBloque, valorBloque, items[] }
//                   items: { id, nombre, esPago, ubicacion, fechaTexto, inversion, reserva }
//   onAbrir(clave) / onVolver() / onNuevaCategoria() / onReordenar(grid)
//   onEditarBloque(nombre) / onBorrarBloque(nombre)
//   onNuevoPlan(valorBloque) / onResumenPlan(id) / onEditarPlan(id) / onBorrarPlan(id)

export function PantallaPlanes(props) {
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
        // Solo las categorías que el usuario creó (bloque_N) se pueden editar y reordenar: "Otros" va siempre primero.
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
      const tap = window.crearManejadorDobleToque(id => id, id => props.onResumenPlan(id));
      cont.querySelectorAll(".notificacion-item[data-id]").forEach(item => {
        const id = item.dataset.id;
        const nombre = props.detalle.items.find(p => p.id === id)?.nombre || "";
        window.crearManejadorPresionSostenida(item, {
          onLargo: () => window.abrirMenuEditarBorrar({
            titulo: nombre,
            onEditar: () => props.onEditarPlan(id),
            onBorrar: () => props.onBorrarPlan(id),
          }),
        });
        item.addEventListener("pointerup", e => tap(id, e));
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (bloqueAbierto !== null) return <Detalle {...props} raiz={raiz} />;

  return (
    <div id="planes-list" ref={raiz}>
      <div className="alertas-bloques-grid">
        {props.grupos.map(g => (
          <button key={g.clave} type="button" className="alerta-bloque-card" data-clave={g.clave}
            onClick={g.clave.startsWith("bloque_") ? undefined : () => props.onAbrir(g.clave)}>
            {g.cantidad > 0 && <span className="alerta-bloque-cantidad">{g.cantidad}</span>}
            <span className="alerta-bloque-icono">
              {g.clave === "otros" ? <Icono nombre="etiqueta" size={40} /> : <IconoDe valor={g.icono} size={40} />}
            </span>
            <span className="alerta-bloque-nombre">{g.titulo}</span>
          </button>
        ))}
        <button type="button" className="alerta-bloque-card alerta-bloque-agregar" id="btn-nueva-categoria-plan" onClick={props.onNuevaCategoria}>
          <span className="alerta-bloque-icono"><Icono nombre="sumar" size={40} /></span>
          <span className="alerta-bloque-nombre">Agregar categoría</span>
        </button>
      </div>
    </div>
  );
}

function Detalle({ raiz, detalle, onVolver, onNuevoPlan, onBorrarBloque }) {
  return (
    <div id="planes-list" ref={raiz}>
      <div className="alerta-bloque-detalle-header">
        <button type="button" className="btn-volver" id="btn-volver-bloque-plan" title="Volver" aria-label="Volver" onClick={onVolver}>‹</button>
        <span className="alerta-bloque-detalle-titulo">
          {detalle.nombreBloque === undefined ? <Icono nombre="etiqueta" size={18} /> : <IconoDe valor={detalle.icono} size={18} />} {detalle.titulo} ({detalle.total})
        </span>
        {detalle.eliminable && (
          <button type="button" className="notif-btn-borrar-bloque" title="Eliminar categoría" onClick={() => onBorrarBloque(detalle.nombreBloque)}>
            <Icono nombre="papelera" size={18} />
          </button>
        )}
      </div>
      <button type="button" className="btn-primary btn-franja" id="btn-nuevo-plan-bloque" onClick={() => onNuevoPlan(detalle.valorBloque)}>+ Nuevo plan</button>
      {detalle.items.length === 0
        ? <div className="notif-bloque-vacio">No hay planes acá todavía.</div>
        : detalle.items.map(p => (
          <div key={p.id} className="notificacion-item" data-id={p.id}>
            <div className="notif-card-grid">
              <div className="notif-card-fila-superior">
                <span className="notif-card-nombre">{p.nombre}</span>
                <span className={"plan-tag " + (p.esPago ? "plan-tag-pago" : "plan-tag-gratis")}>
                  <Icono nombre={p.esPago ? "monedas" : "etiqueta"} size={14} /> {p.esPago ? "Pago" : "Gratis"}
                </span>
              </div>
              {(p.ubicacion || p.fechaTexto || (p.esPago && p.inversion) || p.reserva) && (
                <div className="plan-card-detalle">
                  {p.ubicacion && <span><Icono nombre="ubicacion" size={14} /> {p.ubicacion}</span>}
                  {p.fechaTexto && <span><Icono nombre="calendario" size={14} /> {p.fechaTexto}</span>}
                  {p.esPago && p.inversion && <span><Icono nombre="billete" size={14} /> ${Number(p.inversion).toLocaleString("es-CO")}</span>}
                  {p.reserva && <span><Icono nombre="ticket" size={14} /> Con reserva</span>}
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

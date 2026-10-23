import { useEffect, useRef } from "react";
import { Icono, IconoDe } from "../shared/Iconos.jsx";

// Pantalla de Mercado: la cuadrícula de categorías (2 columnas, igual que los bloques de Alertas) y,
// al tocar una, el detalle con sus productos. mercado.js sigue siendo dueño de los datos (Sheets, qué
// categoría está abierta); acá solo se dibuja y se manejan los gestos:
//   categoría: toque = abrirla · mantener presionado = Editar / Eliminar · mantener y arrastrar = reordenar
//   producto:  doble toque = marcar / desmarcar "hay que comprarlo" · mantener presionado = Editar / Eliminar
//
// Props (ver renderMercado en mercado.js):
//   renderId
//   categoriaAbierta   null = la cuadrícula; "" = "Sin categoría"; o el nombre de una categoría
//   categorias[]       { id, nombre, icono, cantidad }  (cantidad = productos marcados para comprar)
//   sinCategoria       { existe, cantidad }
//   totalParaComprar
//   detalle            { titulo, icono, total, pendientes[], paraComprar[] }   productos { id, nombre }
//   onAbrirCategoria(nombre) / onVolver() / onNuevaCategoria() / onWhatsapp()
//   onEditarCategoria(cat) / onBorrarCategoria(cat) / onReordenar(grid)
//   onNuevoProducto(categoria) / onCompraRealizada(categoria)
//   onAlternarProducto(id) / onEditarProducto(id) / onBorrarProducto(id)

export function PantallaMercado(props) {
  return <Contenido key={props.renderId} {...props} />;
}

function Contenido(props) {
  const raiz = useRef(null);
  const { categoriaAbierta } = props;

  // Gestos (mismos manejadores de gestos.js que usa el resto de la app).
  useEffect(() => {
    const cont = raiz.current;
    if (!cont) return;
    if (categoriaAbierta === null) {
      const grid = cont.querySelector(".alertas-bloques-grid");
      cont.querySelectorAll(".alerta-bloque-card[data-categoria]").forEach(btn => {
        const nombre = btn.dataset.categoria;
        if (!nombre) return;   // "Sin categoría" no se edita ni se reordena
        const cat = props.categorias.find(c => c.nombre === nombre);
        if (!cat) return;
        window.crearManejadorArrastrable(btn, grid, '.alerta-bloque-card[data-categoria]:not([data-categoria=""])', {
          onCorto: () => props.onAbrirCategoria(nombre),
          onLargo: () => window.abrirMenuEditarBorrar({
            titulo: cat.nombre,
            onEditar: () => props.onEditarCategoria(cat),
            onBorrar: () => props.onBorrarCategoria(cat),
          }),
          onReordenar: () => props.onReordenar(grid),
        });
      });
    } else {
      const tap = window.crearManejadorDobleToque(id => id, id => props.onAlternarProducto(id));
      cont.querySelectorAll(".mercado-item[data-id]").forEach(item => {
        const id = item.dataset.id;
        const nombre = [...props.detalle.pendientes, ...props.detalle.paraComprar].find(p => p.id === id)?.nombre || "";
        window.crearManejadorPresionSostenida(item, {
          onLargo: () => window.abrirMenuEditarBorrar({
            titulo: nombre,
            onEditar: () => props.onEditarProducto(id),
            onBorrar: () => props.onBorrarProducto(id),
          }),
        });
        item.addEventListener("pointerup", e => tap(id, e));
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (categoriaAbierta !== null) return <Detalle {...props} raiz={raiz} />;

  const { categorias, sinCategoria, totalParaComprar } = props;
  return (
    <div id="mercado-list" ref={raiz}>
      {totalParaComprar > 0 && (
        <div className="cajas-header">
          <button type="button" className="btn-sutil" id="btn-whatsapp-mercado" onClick={props.onWhatsapp}>
            <Icono nombre="comentario" size={16} /> Enviar lista por WhatsApp ({totalParaComprar})
          </button>
        </div>
      )}
      <div className="alertas-bloques-grid">
        {categorias.map(c => (
          <button key={c.id} type="button" className="alerta-bloque-card" data-categoria={c.nombre}>
            {c.cantidad > 0 && <span className="alerta-bloque-cantidad">{c.cantidad}</span>}
            <span className="alerta-bloque-icono"><IconoDe valor={c.icono} size={40} /></span>
            <span className="alerta-bloque-nombre">{c.nombre}</span>
          </button>
        ))}
        {sinCategoria.existe && (
          <button type="button" className="alerta-bloque-card" data-categoria="" onClick={() => props.onAbrirCategoria("")}>
            {sinCategoria.cantidad > 0 && <span className="alerta-bloque-cantidad">{sinCategoria.cantidad}</span>}
            <span className="alerta-bloque-icono"><Icono nombre="etiqueta" size={40} /></span>
            <span className="alerta-bloque-nombre">Sin categoría</span>
          </button>
        )}
        <button type="button" className="alerta-bloque-card alerta-bloque-agregar" id="btn-nueva-categoria-mercado" onClick={props.onNuevaCategoria}>
          <span className="alerta-bloque-icono"><Icono nombre="sumar" size={40} /></span>
          <span className="alerta-bloque-nombre">Agregar categoría</span>
        </button>
      </div>
    </div>
  );
}

function Detalle({ raiz, categoriaAbierta, detalle, onVolver, onNuevoProducto, onCompraRealizada }) {
  const chip = p => (
    <div key={p.id} className={"mercado-item" + (p.hayQueComprar ? " mercado-item-comprar" : "")} data-id={p.id}>{p.nombre}</div>
  );
  return (
    <div id="mercado-list" ref={raiz}>
      <div className="alerta-bloque-detalle-header">
        <button type="button" className="btn-volver" id="btn-volver-mercado-categoria" title="Volver" aria-label="Volver" onClick={onVolver}>‹</button>
        <span className="alerta-bloque-detalle-titulo">
          {detalle.icono && <IconoDe valor={detalle.icono} size={18} />} {detalle.titulo} ({detalle.total})
        </span>
        <button type="button" className="btn-sutil" id="btn-nuevo-producto-mercado-categoria"
          onClick={() => onNuevoProducto(categoriaAbierta)}>+ Nuevo producto</button>
      </div>
      {detalle.total > 0
        ? <div className="mercado-productos-grid">{detalle.pendientes.map(chip)}</div>
        : <div className="notif-bloque-vacio">No hay productos acá todavía.</div>}
      {detalle.paraComprar.length > 0 && (
        <div className="mercado-seccion-comprar">
          <div className="mercado-seccion-comprar-header">
            <span className="mercado-seccion-comprar-titulo"><Icono nombre="carrito" size={16} /> Para comprar ({detalle.paraComprar.length})</span>
            <button type="button" className="btn-secondary mercado-btn-compra-realizada" id="btn-compra-realizada-mercado"
              onClick={() => onCompraRealizada(categoriaAbierta)}><Icono nombre="hecho" size={16} /> Compra realizada</button>
          </div>
          <div className="mercado-productos-grid">{detalle.paraComprar.map(p => chip({ ...p, hayQueComprar: true }))}</div>
        </div>
      )}
    </div>
  );
}

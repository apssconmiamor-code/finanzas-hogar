import { Modal } from "./Modal.jsx";
import { Icono } from "./Iconos.jsx";

// Sistema de diseño de las ventanas de agregar/editar ("hojas"): una hoja inferior con
// esquinas muy redondeadas, asa, encabezado con ícono + título + cerrar, campos redondeados
// -- DOS por fila -- y botones tipo píldora. Estilos en style.css, sección "HOJAS".
//
// Piezas:
//   <Hoja>          la ventana (usa Modal: se cierra tocando el fondo y con el gesto de volver)
//   <Cuadricula>    rejilla de 2 columnas para los campos
//   <Campo>         etiqueta + control; "completo" lo extiende a las 2 columnas
//   <Interruptor>   casilla estilo interruptor (sigue siendo un <input type="checkbox">)
//   <PieHoja>       fila de botones de abajo (Cancelar / Guardar...)

export function Hoja({ id, titulo, idTitulo, icono, subtitulo, alta = false, onCerrar, children, pie }) {
  return (
    <Modal id={id} variante="hoja" claseTarjeta={alta ? "hoja-alta" : ""} onCerrar={onCerrar}>
      <div className="hoja-asa" aria-hidden="true" />
      <div className="hoja-encabezado">
        {icono && <span className="hoja-icono" aria-hidden="true">{icono}</span>}
        <div className="hoja-titulos">
          <h3 className="hoja-titulo" id={idTitulo}>{titulo}</h3>
          {subtitulo && <p className="hoja-subtitulo">{subtitulo}</p>}
        </div>
        <button type="button" className="hoja-cerrar" aria-label="Cerrar" onClick={onCerrar}>
          <Icono nombre="cerrar" size={18} />
        </button>
      </div>
      <div className="hoja-cuerpo">{children}</div>
      {pie && <div className="hoja-pie">{pie}</div>}
    </Modal>
  );
}

export function Cuadricula({ children }) {
  return <div className="hoja-grid">{children}</div>;
}

export function Campo({ etiqueta, opcional = false, completo = false, id, children }) {
  return (
    <div className={"campo" + (completo ? " campo-completo" : "")} id={id}>
      {etiqueta && <label className="campo-etiqueta">{etiqueta}{opcional && <span className="label-opcional"> (opcional)</span>}</label>}
      {children}
    </div>
  );
}

export function Interruptor({ id, texto, checked, onChange }) {
  return (
    <label className="interruptor" htmlFor={id}>
      <span className="interruptor-texto">{texto}</span>
      <input type="checkbox" id={id} className="interruptor-control" checked={checked}
        onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

export function PieHoja({ children }) {
  return <>{children}</>;
}

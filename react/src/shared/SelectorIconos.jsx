import { IconoDe } from "./Iconos.jsx";

// Selector de ícono: una cuadrícula de íconos (nunca emojis a la vista). El valor guardado sigue
// siendo un emoji representativo, para que lo lean igual los demás dispositivos. La lista de
// opciones vive en iconos.js (window.OPCIONES_ICONO).
export function SelectorIconos({ id, valor, alCambiar }) {
  const opciones = window.OPCIONES_ICONO || [];
  const limpio = s => String(s || "").replace(/[️‍]/g, "");
  return (
    <div id={id} className="selector-iconos">
      {opciones.map(e => (
        <button key={e} type="button" data-emoji={e}
          className={"selector-icono" + (limpio(valor) === limpio(e) ? " active" : "")}
          onClick={() => alCambiar(limpio(valor) === limpio(e) ? "" : e)}>
          <IconoDe valor={e} size={22} />
        </button>
      ))}
    </div>
  );
}

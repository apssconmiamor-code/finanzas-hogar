import { Icono } from "./Iconos.jsx";

// Flecha a la izquierda de la franja inferior de cada vista (menos Inicio, que es a donde se
// vuelve). Hace exactamente lo que el gesto de volver: primero cierra lo que esté abierto (un
// detalle, un panel...) y, si no hay nada, lleva a la pantalla principal con la misma transición.
// app.js expone esa lógica en window.volverAtras.
export function BotonVolver() {
  return (
    <button type="button" className="btn-volver-franja" id="btn-volver-franja"
      aria-label="Volver" title="Volver"
      onClick={() => window.volverAtras && window.volverAtras()}>
      <Icono nombre="flecha" size={22} />
    </button>
  );
}

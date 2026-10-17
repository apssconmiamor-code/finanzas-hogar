// Mantener presionado (mismo umbral que gestos.js de la app: 500 ms) con limpieza,
// para usarlo dentro de efectos de React. onCorto se llama si se soltó antes de que
// dispare onLargo. Devuelve la función que quita los listeners.
const LONG_PRESS_MS = 500;

export function crearManejadorLargo(el, { onLargo, onCorto } = {}) {
  if (!el) return () => {};
  let timeoutId = null;
  let fueLargo = false;

  const iniciar = () => {
    fueLargo = false;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => { fueLargo = true; if (onLargo) onLargo(); }, LONG_PRESS_MS);
  };
  const soltar = () => {
    clearTimeout(timeoutId);
    if (!fueLargo && onCorto) onCorto();
    fueLargo = false;
  };
  const cancelar = () => { clearTimeout(timeoutId); fueLargo = true; };   // se salió: ni corto ni largo
  const sinMenu = (e) => e.preventDefault();                              // evita el menú contextual al mantener

  el.addEventListener("pointerdown", iniciar);
  el.addEventListener("pointerup", soltar);
  el.addEventListener("pointerleave", cancelar);
  el.addEventListener("pointercancel", cancelar);
  el.addEventListener("contextmenu", sinMenu);
  return () => {
    clearTimeout(timeoutId);
    el.removeEventListener("pointerdown", iniciar);
    el.removeEventListener("pointerup", soltar);
    el.removeEventListener("pointerleave", cancelar);
    el.removeEventListener("pointercancel", cancelar);
    el.removeEventListener("contextmenu", sinMenu);
  };
}

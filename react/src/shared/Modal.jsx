import { useEffect, useRef } from "react";

// Ventana modal con el mismo marcado de siempre (.modal > .modal-card). Se cierra:
//   - tocando el fondo (fuera de la tarjeta), y
//   - con el gesto de volver de la app: app.js (cerrarModal) le manda el evento
//     "finanzas:cerrar" a cualquier .modal marcado con data-react="1".
// Quien la usa decide qué significa cerrar (onCerrar).
// variante="hoja": el diseño nuevo de hoja inferior redondeada (ver Hoja.jsx).
export function Modal({ id, variante, claseTarjeta = "", estiloTarjeta, onCerrar, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const alCerrar = () => onCerrar();
    el.addEventListener("finanzas:cerrar", alCerrar);
    return () => el.removeEventListener("finanzas:cerrar", alCerrar);
  }, [onCerrar]);

  return (
    <div id={id} ref={ref} className={"modal" + (variante === "hoja" ? " modal-hoja" : "")} data-react="1"
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className={((variante === "hoja" ? "hoja " : "modal-card ") + claseTarjeta).trim()} style={estiloTarjeta}>{children}</div>
    </div>
  );
}

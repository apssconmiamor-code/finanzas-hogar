import { useEffect, useRef } from "react";

// Ventana modal con el mismo marcado de siempre (.modal > .modal-card). Se cierra:
//   - tocando el fondo (fuera de la tarjeta), y
//   - con el gesto de volver de la app: app.js (cerrarModal) le manda el evento
//     "finanzas:cerrar" a cualquier .modal marcado con data-react="1".
// Quien la usa decide qué significa cerrar (onCerrar).
export function Modal({ id, claseTarjeta = "", estiloTarjeta, onCerrar, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const alCerrar = () => onCerrar();
    el.addEventListener("finanzas:cerrar", alCerrar);
    return () => el.removeEventListener("finanzas:cerrar", alCerrar);
  }, [onCerrar]);

  return (
    <div id={id} ref={ref} className="modal" data-react="1"
      onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className={("modal-card " + claseTarjeta).trim()} style={estiloTarjeta}>{children}</div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Icono } from "./Iconos.jsx";

// Submenú ⋯ compartido por Cajas y Proyección: un solo botón que despliega las
// acciones del módulo. Se cierra al elegir una, al tocar fuera o con Escape.
// Mismo estilo que el menú de la barra superior (.dropdown-menu / .dropdown-item).
//
//   id          id del botón ⋯ (los tests lo usan)
//   etiqueta    aria-label del botón
//   items       [{ id, icono (nombre en Iconos.jsx), texto, accion }], o una función que lo
//               devuelva (se evalúa al abrir: las opciones pueden depender del momento)
//   arriba      el panel se abre hacia arriba (los menús viven en la franja inferior)
export function MenuOpciones({ id, etiqueta, items, arriba = true }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const elegir = (accion) => { setAbierto(false); accion(); };

  return (
    <div className="cajas-menu" ref={ref}>
      <button type="button" className={"btn-sutil cajas-menu-btn" + (abierto ? " active" : "")}
        id={id} aria-haspopup="menu" aria-expanded={abierto} aria-label={etiqueta}
        onClick={() => setAbierto(a => !a)}>
        {/* Tres puntos dibujados (no el carácter ⋯): quedan exactamente centrados en el círculo. */}
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
          strokeWidth="3.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
      </button>
      {abierto && (
        <div className={"dropdown-menu cajas-menu-panel" + (arriba ? " cajas-menu-panel-arriba" : "")} role="menu">
          {(typeof items === "function" ? items() : items).map(it => (
            <button key={it.id} type="button" role="menuitem" className="dropdown-item" id={it.id}
              onClick={() => elegir(it.accion)}>
              <span className="dd-icon"><Icono nombre={it.icono} size={18} /></span>{it.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

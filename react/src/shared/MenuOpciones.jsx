import { useEffect, useRef, useState } from "react";

// Submenú ⋯ compartido por Cajas y Proyección: un solo botón que despliega las
// acciones del módulo. Se cierra al elegir una, al tocar fuera o con Escape.
// Mismo estilo que el menú de la barra superior (.dropdown-menu / .dropdown-item).
//
//   id          id del botón ⋯ (los tests lo usan)
//   etiqueta    aria-label del botón
//   items[]     { id, icono, texto, accion }
export function MenuOpciones({ id, etiqueta, items }) {
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
        onClick={() => setAbierto(a => !a)}>⋯</button>
      {abierto && (
        <div className="dropdown-menu cajas-menu-panel" role="menu">
          {items.map(it => (
            <button key={it.id} type="button" role="menuitem" className="dropdown-item" id={it.id}
              onClick={() => elegir(it.accion)}>
              <span className="dd-icon">{it.icono}</span>{it.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useLayoutEffect, useState } from "react";

// Fila de tarjetas de una sola línea: se ven tres a la vez y el resto se
// desliza con el dedo. Compartida por Cajas y los meses de Proyección (mismo
// estilo: .cajas-grid / .caja-card en style.css).
//
// Pista sutil de que hay más: degradado en el borde que tiene más contenido y
// puntitos de "página" (uno por cada tres tarjetas).
//
//   id          id del contenedor que se desliza (los tests lo usan)
//   cantidad    cuántas tarjetas hay (define los puntitos)
//   scrollRef   ref donde se recuerda el scroll horizontal: quien usa esto se
//               remonta en cada render y, si no, la fila volvería al inicio
//   gridRef     ref al contenedor, por si quien lo usa le conecta gestos
export function FilaDeslizable({ id, cantidad, scrollRef, gridRef, children }) {
  const [borde, setBorde] = useState({ izq: false, der: false, pagina: 0 });
  const paginas = Math.ceil(cantidad / 3);

  const medirScroll = () => {
    const g = gridRef.current;
    if (!g) return;
    scrollRef.current = g.scrollLeft;
    const max = g.scrollWidth - g.clientWidth;
    setBorde({
      izq: g.scrollLeft > 4,
      der: g.scrollLeft < max - 4,
      pagina: max > 0 ? Math.round((g.scrollLeft / max) * (paginas - 1)) : 0,
    });
  };

  useLayoutEffect(() => {
    gridRef.current.scrollLeft = scrollRef.current;
    medirScroll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cajas-fila">
      <div id={id} className="cajas-grid" ref={gridRef} onScroll={medirScroll}>
        {children}
      </div>
      {borde.izq && <div className="cajas-fade cajas-fade-izq" aria-hidden="true" />}
      {borde.der && <div className="cajas-fade cajas-fade-der" aria-hidden="true" />}
      {paginas > 1 && (
        <div className="cajas-puntos" aria-hidden="true">
          {Array.from({ length: paginas }, (_, i) =>
            <span key={i} className={"cajas-punto" + (i === borde.pagina ? " activo" : "")} />)}
        </div>
      )}
    </div>
  );
}

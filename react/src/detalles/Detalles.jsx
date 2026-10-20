import { useEffect, useRef, useState } from "react";
import { Hoja } from "../shared/Hoja.jsx";
import { Icono } from "../shared/Iconos.jsx";

// Ventanas de solo lectura (resúmenes del doble toque, detalle de una caja) y el menú de
// Editar/Eliminar, con el diseño de hojas (ver shared/Hoja.jsx). Un solo componente para todas: los
// módulos de JS plano arman el contenido (filas, listas) y esta hoja lo muestra.
//
// Se abre con el evento "detalle:abrir" y un descriptor:
//   {
//     id,                     id de la ventana (ej. "modal-resumen-movimiento")
//     idTitulo, titulo,       el título, como TEXTO (puede llevar emojis de datos viejos: se muestran como ícono)
//     icono,                  nombre del ícono del encabezado
//     idCerrar,               id del botón de cerrar (opcional)
//     cuerpos: [{ id, clase, html }]   bloques de HTML ya armado (y ya escapado) por el módulo
//     acciones: [{ id, texto, icono, primaria, onClick }]   botones de abajo
//     alMontar(raiz),         se llama cuando la ventana ya está en pantalla (para enganchar eventos)
//     alCerrar(),             se llama al cerrarla (opcional)
//   }
// y se cierra con el evento "detalle:cerrar".
//
// Los emojis que traigan los textos (de datos guardados antes de que existieran los íconos) se
// convierten acá, porque el observador de iconos.js no mira dentro de las ventanas de React.

const escapar = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const aIconos = html => (window.reemplazarEmojisHtml ? window.reemplazarEmojisHtml(String(html ?? "")) : String(html ?? ""));

export function Detalles() {
  const [d, setD] = useState(null);

  useEffect(() => {
    const abrir = e => setD({ ...e.detail, n: Date.now() });
    const cerrar = () => setD(null);
    document.addEventListener("detalle:abrir", abrir);
    document.addEventListener("detalle:cerrar", cerrar);
    return () => {
      document.removeEventListener("detalle:abrir", abrir);
      document.removeEventListener("detalle:cerrar", cerrar);
    };
  }, []);

  if (!d) return null;
  return <HojaDetalle key={d.n} d={d} alCerrar={() => { setD(null); d.alCerrar?.(); }} />;
}

function HojaDetalle({ d, alCerrar }) {
  const raiz = useRef(null);

  useEffect(() => {
    if (d.alMontar && raiz.current) d.alMontar(raiz.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accion = a => () => { alCerrar(); a.onClick?.(); };

  return (
    <Hoja id={d.id} idTitulo={d.idTitulo} idCerrar={d.idCerrar} icono={<Icono nombre={d.icono || "nota"} size={22} />}
      titulo={<span dangerouslySetInnerHTML={{ __html: aIconos(escapar(d.titulo)) }} />}
      onCerrar={alCerrar}
      pie={d.acciones && d.acciones.length > 0 ? d.acciones.map(a => (
        <button key={a.id} id={a.id} type="button" className={a.primaria ? "btn-primary" : "btn-secondary"} onClick={accion(a)}>
          {a.icono && <Icono nombre={a.icono} size={16} />}{a.icono ? " " : ""}
          <span dangerouslySetInnerHTML={{ __html: aIconos(escapar(a.texto)) }} />
        </button>
      )) : null}>
      <div ref={raiz} className="hoja-detalle">
        {(d.cuerpos || []).map(c => (
          <div key={c.id} id={c.id} className={c.clase} dangerouslySetInnerHTML={{ __html: aIconos(c.html) }} />
        ))}
      </div>
    </Hoja>
  );
}

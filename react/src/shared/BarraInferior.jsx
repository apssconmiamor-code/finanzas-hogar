import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Franja inferior estática de una vista: aloja el menú ⋯ de esa vista (y, en
// Inicio, la versión). Se pinta DENTRO de .main-content como último hijo con
// position:sticky (ver .barra-inferior en style.css), así queda pegada abajo
// sin importar el scroll y respeta el sidebar y el marco en escritorio.
//
// Solo se muestra mientras su pestaña es la activa: app.js avisa cada cambio
// con el evento "finanzas:tab" (ver navegarATab).
function useTabActiva(tab) {
  const [activa, setActiva] = useState(() => (window.__tabActiva || "cajas") === tab);
  useEffect(() => {
    const alCambiar = (e) => setActiva(e.detail === tab);
    document.addEventListener("finanzas:tab", alCambiar);
    setActiva((window.__tabActiva || "cajas") === tab);
    return () => document.removeEventListener("finanzas:tab", alCambiar);
  }, [tab]);
  return activa;
}

export function BarraInferior({ tab, children }) {
  const activa = useTabActiva(tab);
  const [anfitrion, setAnfitrion] = useState(null);
  useEffect(() => { setAnfitrion(document.querySelector(".main-content")); }, []);
  if (!activa || !anfitrion) return null;
  return createPortal(
    <div className="barra-inferior" data-barra={tab} role="toolbar">{children}</div>,
    anfitrion
  );
}

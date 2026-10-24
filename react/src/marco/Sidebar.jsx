import { useEffect, useState } from "react";
import { Icono } from "../shared/Iconos.jsx";

// Barra lateral de escritorio (en el teléfono está oculta): marca, navegación y usuario.
// La pestaña activa la anuncia app.js con el evento "finanzas:tab".
// Props: nombre · foto · onCerrarSesion()
const PESTANAS = [
  { tab: "cajas", icono: "banco", texto: "Cuentas" },
  { tab: "movimientos", icono: "monedas", texto: "Movimientos" },
  { tab: "proyeccion", icono: "barras", texto: "Proyección" },
  null,
  { tab: "resumen", icono: "tendencia", texto: "Análisis" },
];

export function Sidebar({ nombre, foto, onCerrarSesion }) {
  const [activa, setActiva] = useState(window.__tabActiva || "cajas");
  useEffect(() => {
    const alCambiar = e => setActiva(e.detail);
    document.addEventListener("finanzas:tab", alCambiar);
    return () => document.removeEventListener("finanzas:tab", alCambiar);
  }, []);

  return (
    <>
      <div className="traffic-lights" aria-hidden="true">
        <span className="traffic-dot traffic-red"></span>
        <span className="traffic-dot traffic-yellow"></span>
        <span className="traffic-dot traffic-green"></span>
      </div>
      <div className="sidebar-brand">
        <span className="brand-icon"><Icono nombre="monedas" size={20} /></span>
        <span className="brand-name">Finanzas</span>
      </div>
      <nav className="sidebar-nav">
        {PESTANAS.map((p, i) => p === null
          ? <div key={i} className="sidebar-divider"></div>
          : (
            <button key={p.tab} className={"nav-item" + (activa === p.tab ? " active" : "")} data-tab={p.tab}
              onClick={() => window.navegarATab(p.tab)}>
              <span className="nav-icon"><Icono nombre={p.icono} size={18} /></span><span>{p.texto}</span>
            </button>
          ))}
      </nav>
      <div className="sidebar-footer">
        <img id="user-avatar" src={foto || ""} alt="avatar" className="user-avatar" />
        <div className="user-info">
          <span id="user-name" className="user-name">{nombre}</span>
          <button id="btn-logout" className="btn-logout" onClick={onCerrarSesion}>Cerrar sesión</button>
        </div>
        <button id="btn-menu-desktop" className="btn-icon-sm" title="Más opciones">⋯</button>
      </div>
    </>
  );
}

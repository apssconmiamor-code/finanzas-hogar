// Puente entre app.js (JS plano) y los módulos React. Un solo bundle
// (react-dist/react-app.js) con una "isla" por módulo migrado:
//   CajasReact.render(props)      -> pestaña Inicio (#cajas-root)
//   ProyeccionReact.render(props) -> fila de arriba de Proyección (#proy-menu-root)
//   MesesProyeccionReact.render(props) -> tarjetas de meses (#proy-4meses-grid)
//   AccionesReact.render(props)   -> ventanas de acciones rápidas (#acciones-root)
//   AlertasReact.render(props)    -> ventanas de nueva alerta y nuevo bloque (#alertas-root)
//   MercadoReact.render(props)    -> ventanas de producto y categoría de Mercado (#mercado-root)
//   PlanesReact.render(props)     -> ventanas de plan y categoría de Planes (#planes-root)
//   CompromisosReact.render(props) -> ventanas de compra, préstamo y pago (#compromisos-root)
//   RecordatoriosReact.render(props) -> ventana de crear recordatorio (#recordatorios-root)
//   FranjasReact.render(props)    -> franja inferior de las vistas aún en JS plano (#franjas-root)
// app.js sigue dueño de los datos; React solo dibuja y maneja el estado de UI
// propio de cada isla (selección de "Sumar" en Cajas, etc.).
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Cajas } from "./cajas/Cajas.jsx";
import { ProyeccionBarra } from "./proyeccion/Proyeccion.jsx";
import { MesesProyeccion } from "./proyeccion/MesesProyeccion.jsx";
import { Acciones } from "./acciones/Acciones.jsx";
import { FranjasVistas } from "./franjas/FranjasVistas.jsx";
import { Alertas } from "./alertas/Alertas.jsx";
import { Mercado } from "./mercado/Mercado.jsx";
import { Planes } from "./planes/Planes.jsx";
import { Compromisos } from "./compromisos/Compromisos.jsx";
import { Recordatorios } from "./recordatorios/Recordatorios.jsx";

function crearIsla(idContenedor, Componente, conRenderId) {
  let root = null;
  let renderId = 0;
  return {
    render(props) {
      const el = document.getElementById(idContenedor);
      if (!el) return;
      if (!root) root = createRoot(el);
      renderId += 1;
      root.render(createElement(Componente, conRenderId ? { ...props, renderId } : props));
    },
  };
}

window.CajasReact = crearIsla("cajas-root", Cajas, true);
window.ProyeccionReact = crearIsla("proy-menu-root", ProyeccionBarra, false);
window.MesesProyeccionReact = crearIsla("proy-4meses-grid", MesesProyeccion, true);
window.AccionesReact = crearIsla("acciones-root", Acciones, true);
window.FranjasReact = crearIsla("franjas-root", FranjasVistas, false);
window.AlertasReact = crearIsla("alertas-root", Alertas, false);
window.MercadoReact = crearIsla("mercado-root", Mercado, false);
window.PlanesReact = crearIsla("planes-root", Planes, false);
window.CompromisosReact = crearIsla("compromisos-root", Compromisos, false);
window.RecordatoriosReact = crearIsla("recordatorios-root", Recordatorios, false);

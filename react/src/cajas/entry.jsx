// Puente entre app.js (JS plano) y el módulo React de Cajas.
//   CajasReact.render(props) -> monta (la primera vez) y actualiza.
// app.js sigue dueño de los datos (cajas, saldos, movimientos); React solo
// dibuja y maneja la selección de "Sumar".
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Cajas } from "./Cajas.jsx";

let root = null;
let renderId = 0;

window.CajasReact = {
  render(props) {
    const el = document.getElementById("cajas-root");
    if (!el) return;
    if (!root) root = createRoot(el);
    renderId += 1;
    root.render(createElement(Cajas, { ...props, renderId }));
  },
};

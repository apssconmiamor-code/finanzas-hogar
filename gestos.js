// =============================================
// CRITERIO ÚNICO DE GESTOS (toda la app)
// =============================================
// Doble toque = ver un resumen de solo lectura. Mantener presionado = el
// único camino a Editar/Eliminar. Antes cada módulo mezclaba las dos
// cosas en el doble toque (el resumen tenía los botones de Editar/Borrar
// adentro) -- pedido explícito: separarlos.
//
// Carga ANTES que prestamo.js/compras.js/recordatorios.js/notificaciones.js/
// app.js a propósito -- todos esos usan crearManejadorDobleToque en una
// declaración de nivel superior (ej. "const tapNotificacion = ..."), que
// se ejecuta apenas el navegador carga ese <script>, no dentro de una
// función. Si este archivo cargara después (como badge.js o app.js),
// esos "const" tirarían ReferenceError apenas se ejecutaran y romperían
// el resto del archivo entero silenciosamente (bug real: toda la
// cuadrícula de Alertas dejaba de aparecer).

const DOBLE_TOQUE_MS = 400;
const LONG_PRESS_MS  = 500;

// Arma un manejador de doble toque reusable. "clave(...)" calcula la
// clave que identifica al ítem tocado (para saber si el segundo toque
// cayó sobre EL MISMO ítem, no cualquiera); "alSegundoToque(...)" es lo
// que abre el resumen. "alPrimerToque(...)" es opcional -- solo
// Proyección lo usa (el primer toque abre la lista de movimientos
// reales, con un timer que el segundo toque cancela si llega a tiempo).
// El bloqueo de zoom (touchend -> preventDefault en index.html) suprime
// la síntesis nativa de click/dblclick en iOS Safari real, por eso hay
// que armarlo a mano comparando Date.now() contra el toque anterior en
// vez de usar ondblclick.
function crearManejadorDobleToque(clave, alSegundoToque, { alPrimerToque } = {}) {
  let ultimo = { key: null, tiempo: 0 };
  let timerPrimero = null;
  return (...args) => {
    const key = clave(...args);
    const ahora = Date.now();
    if (ultimo.key === key && ahora - ultimo.tiempo < DOBLE_TOQUE_MS) {
      clearTimeout(timerPrimero);
      ultimo = { key: null, tiempo: 0 };
      alSegundoToque(...args);
    } else {
      ultimo = { key, tiempo: ahora };
      if (alPrimerToque) timerPrimero = setTimeout(() => alPrimerToque(...args), DOBLE_TOQUE_MS);
    }
  };
}

// Conecta el gesto de mantener presionado a un elemento ya en el DOM
// (a diferencia del doble toque, que se referencia desde un atributo
// onpointerup en el HTML armado con template strings, esto necesita
// addEventListener de verdad porque hace falta arrancar/cancelar un
// timer -- mismo patrón que ya usaba en solitario el long-press de
// Acciones Rápidas, ahora reusable). "onCorto" es opcional: la mayoría
// de los ítems ya tienen su propio onpointerup para el toque simple/doble
// (ver arriba), así que acá alcanza con no hacer nada si se soltó rápido.
function crearManejadorPresionSostenida(el, { onLargo, onCorto } = {}) {
  let esPressLargo = false;
  let timeoutId = null;
  const iniciar = () => {
    esPressLargo = false;
    timeoutId = setTimeout(() => { esPressLargo = true; onLargo(); }, LONG_PRESS_MS);
  };
  const cancelar = () => clearTimeout(timeoutId);
  el.addEventListener("pointerdown", iniciar);
  el.addEventListener("pointerup", () => {
    cancelar();
    if (!esPressLargo && onCorto) onCorto();
  });
  el.addEventListener("pointerleave", cancelar);
  el.addEventListener("pointercancel", cancelar);
}

// Menú chico de Editar/Eliminar que dispara cualquier mantener-presionado
// de la app -- un solo modal compartido en vez de uno por módulo. Si
// falta onEditar u onBorrar (ej. "Otros" en Proyección no se puede
// editar) el botón correspondiente se oculta en vez de mostrarse roto.
function abrirMenuEditarBorrar({ titulo, onEditar, onBorrar }) {
  const modal = document.getElementById("modal-editar-borrar");
  if (!modal) return;
  const tituloEl    = document.getElementById("editar-borrar-titulo");
  const btnEditar   = document.getElementById("btn-editar-borrar-editar");
  const btnEliminar = document.getElementById("btn-editar-borrar-eliminar");
  if (tituloEl) tituloEl.textContent = titulo || "";
  if (btnEditar) {
    btnEditar.classList.toggle("hidden", !onEditar);
    btnEditar.onclick = () => { modal.classList.add("hidden"); if (onEditar) onEditar(); };
  }
  if (btnEliminar) {
    btnEliminar.classList.toggle("hidden", !onBorrar);
    btnEliminar.onclick = () => { modal.classList.add("hidden"); if (onBorrar) onBorrar(); };
  }
  modal.classList.remove("hidden");
}

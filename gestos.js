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
// El último argumento, si es el Event del pointerup (ver más abajo por qué
// hace falta pasarlo), se usa para detectar si ESTE MISMO toque ya disparó
// un mantener-presionado sobre el mismo elemento (ver
// crearManejadorPresionSostenida) -- si es así, no cuenta como toque para
// el resumen. Bug real reportado: al soltar el dedo después de mantener
// presionado, se abría Editar/Eliminar Y ADEMÁS el resumen -- el atributo
// onpointerup del HTML (este manejador) y el addEventListener del long
// press están los dos escuchando el mismo pointerup, sin enterarse uno del
// otro.
function _vieneDePresionLarga(args) {
  const ultimo = args[args.length - 1];
  return ultimo instanceof Event && ultimo.currentTarget?.dataset.gestoPresionLarga === "1";
}

function crearManejadorDobleToque(clave, alSegundoToque, { alPrimerToque } = {}) {
  let ultimo = { key: null, tiempo: 0 };
  let timerPrimero = null;
  return (...args) => {
    if (_vieneDePresionLarga(args)) return;
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
//
// dataset.gestoPresionLarga se marca DURANTE el sostenido (apenas onLargo
// dispara, no al soltar) -- así, cuando el dedo se levanta y dispara el
// pointerup, tanto este manejador como el onpointerup inline del HTML (que
// corre primero, ver crearManejadorDobleToque) ya ven el flag en "1", sin
// importar el orden en que el navegador los llame.
function crearManejadorPresionSostenida(el, { onLargo, onCorto } = {}) {
  let esPressLargo = false;
  let timeoutId = null;
  const iniciar = () => {
    esPressLargo = false;
    delete el.dataset.gestoPresionLarga;
    timeoutId = setTimeout(() => {
      esPressLargo = true;
      el.dataset.gestoPresionLarga = "1";
      onLargo();
    }, LONG_PRESS_MS);
  };
  const cancelar = () => clearTimeout(timeoutId);
  el.addEventListener("pointerdown", iniciar);
  el.addEventListener("pointerup", () => {
    cancelar();
    if (!esPressLargo && onCorto) onCorto();
    delete el.dataset.gestoPresionLarga;
  });
  el.addEventListener("pointerleave", cancelar);
  el.addEventListener("pointercancel", cancelar);
}

// Menú chico de Editar/Eliminar que dispara cualquier mantener-presionado
// de la app -- un solo modal compartido en vez de uno por módulo. Si
// falta onEditar u onBorrar (ej. "Otros" en Proyección no se puede
// editar) el botón correspondiente se oculta en vez de mostrarse roto.
// "labelEditar" es opcional -- Cajas lo usa para mostrar "⚖️ Ajustar" en
// vez de "✏️ Editar" (mismo botón/slot, la acción no es literalmente
// "editar" pero sigue siendo la única acción de mantener-presionado ahí).
function abrirMenuEditarBorrar({ titulo, onEditar, onBorrar, labelEditar }) {
  const modal = document.getElementById("modal-editar-borrar");
  if (!modal) return;
  const tituloEl    = document.getElementById("editar-borrar-titulo");
  const btnEditar   = document.getElementById("btn-editar-borrar-editar");
  const btnEliminar = document.getElementById("btn-editar-borrar-eliminar");
  if (tituloEl) tituloEl.textContent = titulo || "";
  if (btnEditar) {
    btnEditar.classList.toggle("hidden", !onEditar);
    btnEditar.textContent = labelEditar || "✏️ Editar";
    btnEditar.onclick = () => { modal.classList.add("hidden"); if (onEditar) onEditar(); };
  }
  if (btnEliminar) {
    btnEliminar.classList.toggle("hidden", !onBorrar);
    btnEliminar.onclick = () => { modal.classList.add("hidden"); if (onBorrar) onBorrar(); };
  }
  modal.classList.remove("hidden");
}

// Deslizar hacia abajo desde arriba de la lista = "Refrescar" -- el
// overscroll-behavior-y:contain del body bloquea el pull-to-refresh nativo
// de iOS a propósito (evita el rebote raro del layout fijo de la app), así
// que hace falta reimplementarlo a mano, igual que los demás gestos.
//
// A diferencia de Movimientos/Cajas/Alertas siendo "3 listas", en el DOM
// real hay UN solo contenedor con scroll compartido por todas las pestañas
// (.main-content -- cada <section class="tab-section"> de adentro solo se
// muestra/oculta, no tiene su propio scroll). Por eso este helper no toma
// "una lista" sino el contenedor de scroll real más una función que decide,
// en el momento de soltar el dedo, qué pestaña está activa y qué acción de
// refresco le corresponde (o null si esta pestaña no tiene refresco propio).
const PULL_REFRESH_UMBRAL_PX = 70;
const PULL_REFRESH_MAX_PX = 90;

function activarPullToRefresh(contenedor, indicador, obtenerAccionRefrescar) {
  if (!contenedor || !indicador) return;
  let arrastrando = false;
  let inicioY = 0;
  let distancia = 0;
  let accion = null;

  const soltar = () => {
    arrastrando = false;
    indicador.classList.remove("visible", "listo", "arrastrando");
    indicador.style.opacity = "";
    indicador.style.transform = "";
  };

  contenedor.addEventListener("touchstart", (e) => {
    // Algunos modales viven adentro de .main-content -- sin este chequeo,
    // deslizar hacia abajo DENTRO de un modal abierto (ej. arrastrando un
    // formulario) podía disparar el refresco de fondo por error.
    if (e.touches.length !== 1 || contenedor.scrollTop > 0 || document.querySelector(".modal:not(.hidden)")) {
      arrastrando = false;
      return;
    }
    accion = obtenerAccionRefrescar();
    if (!accion) { arrastrando = false; return; }
    arrastrando = true;
    inicioY = e.touches[0].clientY;
    distancia = 0;
    indicador.classList.add("arrastrando");
  }, { passive: true });

  contenedor.addEventListener("touchmove", (e) => {
    if (!arrastrando) return;
    const dy = e.touches[0].clientY - inicioY;
    if (dy <= 0 || contenedor.scrollTop > 0) { soltar(); return; }
    // Resistencia: el dedo se mueve más de lo que avanza el indicador,
    // mismo criterio "elástico" que el pull-to-refresh nativo de iOS.
    distancia = Math.min(dy / 1.6, PULL_REFRESH_MAX_PX);
    indicador.classList.add("visible");
    indicador.style.opacity = Math.min(distancia / 40, 1);
    indicador.style.transform = `translateY(${distancia - 40}px)`;
    indicador.classList.toggle("listo", distancia >= PULL_REFRESH_UMBRAL_PX);
  }, { passive: true });

  contenedor.addEventListener("touchend", () => {
    if (!arrastrando) return;
    const disparar = distancia >= PULL_REFRESH_UMBRAL_PX;
    const accionAEjecutar = accion;
    soltar();
    if (!disparar || !accionAEjecutar) return;
    indicador.classList.add("visible", "cargando");
    Promise.resolve(accionAEjecutar()).finally(() => indicador.classList.remove("visible", "cargando"));
  });

  contenedor.addEventListener("touchcancel", soltar);
}

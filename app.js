// =============================================
// APP PRINCIPAL
// =============================================

// Evalúa expresiones simples en campos de monto (ej: "4000+5000+1000" → 10000)
// También soporta valores pre-formateados con puntos de miles (ej: "1.000.000")
function evaluarMonto(str) {
  const clean = String(str || "")
    .replace(/\s/g, "")
    .replace(/\./g, "")   // strip puntos usados como separadores de miles (es-CO)
    .replace(/,/g, ".");  // normalizar coma decimal a punto JS
  if (!clean) return 0;
  if (!/^[\d+\-*/().]+$/.test(clean)) return parseFloat(clean) || 0;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function("return (" + clean + ")")();
    if (typeof result === "number" && isFinite(result)) return Math.round(result * 100) / 100;
  } catch (e) {}
  return parseFloat(clean) || 0;
}

// Formatea un input numérico con separadores de miles (es-CO: punto de miles)
function formatearInputMiles(input) {
  const val = input.value;
  if (/[+\-*/()]/.test(val)) return; // no formatear expresiones
  const raw = val.replace(/\./g, "").replace(/,/g, "");
  if (!raw) return;
  const num = parseInt(raw, 10);
  if (isNaN(num)) return;
  const formatted = num.toLocaleString("es-CO");
  if (formatted === val) return;
  const sel = input.selectionStart;
  const prevLen = val.length;
  input.value = formatted;
  const diff = formatted.length - prevLen;
  try { input.setSelectionRange(Math.max(0, sel + diff), Math.max(0, sel + diff)); } catch (e) {}
}

// Activa el cálculo en tiempo real en un input de monto + separadores de miles
function activarCalculoMonto(inputId, hintId) {
  const input = document.getElementById(inputId);
  const hint  = document.getElementById(hintId);
  if (!input || !hint) return;

  input.addEventListener("input", () => {
    const val = input.value;
    const tieneOp = /[+\-*/]/.test(val);
    if (tieneOp && val.trim()) {
      const result = evaluarMonto(val);
      if (result > 0) {
        hint.textContent = "= " + result.toLocaleString("es-CO");
        hint.classList.remove("hidden");
      } else {
        hint.classList.add("hidden");
      }
    } else {
      hint.classList.add("hidden");
      formatearInputMiles(input);
    }
  });

  input.addEventListener("blur", () => {
    const val = input.value;
    if (/[+\-*/]/.test(val)) {
      const result = evaluarMonto(val);
      if (result > 0) input.value = result.toLocaleString("es-CO");
    }
    hint.classList.add("hidden");
  });
}

let currentUser = null;
let cajas = [];
let movimientos = [];

// ---- ORDEN DE LAS CAJAS (arrastrar para reordenar, pedido explícito) ----
// Las cajas en sí (hoja "Cajas") son compartidas por toda la familia, pero
// el orden en que cada quien las quiere ver es personal -- se guarda por
// usuario en ConfigUsuario, mismo patrón que acciones_rapidas/
// alertas_bloques/orden_mercado_categorias. Guarda IDs (no nombres) para no
// desordenarse si alguien renombra una caja.
let ordenCajas = [];

function _ordenCajasCacheKey() {
  return `cache_orden_cajas_${currentUser?.email || "anon"}`;
}

async function cargarOrdenCajas() {
  try {
    const valor = await Sheets.getConfigUsuario(currentUser.email, "orden_cajas");
    ordenCajas = Array.isArray(valor) ? valor : [];
    localStorage.setItem(_ordenCajasCacheKey(), JSON.stringify(ordenCajas));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    const cache = localStorage.getItem(_ordenCajasCacheKey());
    if (cache) { try { ordenCajas = JSON.parse(cache); } catch { ordenCajas = []; } }
  }
}

// Qué cajas NO se muestran en Inicio (elección personal, botón "Cajas" -- ver
// react/src/cajas). Se guardan las ocultas y no las visibles a propósito: una
// caja nueva aparece sola, sin que el usuario tenga que activarla. Ocultar
// solo afecta a Inicio; la caja sigue existiendo en movimientos, selectores,
// Proyección, etc.
let cajasOcultas = [];

function _cajasOcultasCacheKey() {
  return `cache_cajas_ocultas_${currentUser?.email || "anon"}`;
}

function _leerCajasOcultasDeCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(_cajasOcultasCacheKey()) || "[]");
    cajasOcultas = Array.isArray(cache) ? cache : [];
  } catch { cajasOcultas = []; }
}

async function cargarCajasOcultas() {
  try {
    const valor = await Sheets.getConfigUsuario(currentUser.email, "cajas_ocultas");
    cajasOcultas = Array.isArray(valor) ? valor : [];
    localStorage.setItem(_cajasOcultasCacheKey(), JSON.stringify(cajasOcultas));
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    _leerCajasOcultasDeCache();
  }
}

// No espera a Sheets para re-renderizar -- igual que el orden, ya vive en
// memoria+localStorage de una.
function _guardarCajasOcultas(ids) {
  cajasOcultas = ids;
  localStorage.setItem(_cajasOcultasCacheKey(), JSON.stringify(ids));
  Sheets.guardarConfigUsuario(currentUser.email, "cajas_ocultas", ids);
  renderCajas();
}

// Cajas nuevas (todavía sin entrar en ordenCajas) quedan al final, en el
// orden en que ya venían de Sheets -- así una caja recién creada no se
// cuela al principio.
function _aplicarOrdenCajas() {
  if (ordenCajas.length === 0) return;
  const indice = new Map(ordenCajas.map((id, i) => [id, i]));
  cajas.sort((a, b) => {
    const ia = indice.has(a.id) ? indice.get(a.id) : Infinity;
    const ib = indice.has(b.id) ? indice.get(b.id) : Infinity;
    return ia - ib;
  });
}

// Se llama al soltar tras arrastrar una caja a un lugar nuevo. No espera a
// que Sheets confirme para re-renderizar -- el orden ya vive en
// memoria+localStorage de una.
function _guardarOrdenCajas(nuevoOrdenIds) {
  ordenCajas = nuevoOrdenIds;
  localStorage.setItem(_ordenCajasCacheKey(), JSON.stringify(nuevoOrdenIds));
  Sheets.guardarConfigUsuario(currentUser.email, "orden_cajas", nuevoOrdenIds);
}

// Si sw-register.js aplicó una actualización que había quedado lista de
// una sesión anterior, avisa UNA sola vez cuánto tiempo pasó desde que
// quedó lista hasta que se aplicó -- después borra la marca, así no vuelve
// a aparecer en la próxima apertura normal.
function avisarSiSeActualizoSola() {
  const CLAVE_TS_LISTA = "sw_actualizacion_lista_en";
  let ts;
  try {
    const raw = localStorage.getItem(CLAVE_TS_LISTA);
    if (!raw) return;
    localStorage.removeItem(CLAVE_TS_LISTA);
    ts = parseInt(raw, 10);
  } catch { return; }
  if (!ts || isNaN(ts)) return;

  const minutos = Math.round((Date.now() - ts) / 60000);
  let transcurrido;
  if (minutos < 1) transcurrido = "hace unos segundos";
  else if (minutos === 1) transcurrido = "hace 1 minuto";
  else if (minutos < 60) transcurrido = `hace ${minutos} minutos`;
  else {
    const horas = Math.round(minutos / 60);
    if (horas < 24) transcurrido = horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
    else {
      const dias = Math.round(horas / 24);
      transcurrido = dias === 1 ? "hace 1 día" : `hace ${dias} días`;
    }
  }
  if (typeof SyncManager !== "undefined") SyncManager.mostrarToast(`✅ Actualizado ${transcurrido}`);
}

// Chequeo manual (mantener presionada la versión en la franja inferior de Inicio). A diferencia del
// automático de sw-register.js -- que espera a un arranque en frío para no
// interrumpir nada -- acá SÍ se aplica de una si encuentra algo nuevo,
// porque lo pidió el usuario a propósito. Existe porque en iOS el chequeo
// automático en segundo plano de una app "agregada a inicio" es poco
// confiable: a veces nunca nota sola que hay versión nueva por más que se
// cierre y abra la app varias veces (bug real reportado).
// Espera de verdad a que un Service Worker en instalación termine (evento
// "statechange" -> "installed"), en vez de un tiempo fijo adivinado --
// bug real reportado: con un tiempo fijo corto, en una red lenta la
// descarga todavía no había terminado cuando se revisaba, y el botón
// avisaba "ya estás al día" aunque en realidad la actualización seguía
// bajando. Devuelve true si terminó de instalar, false si se agotó el
// tiempo (generoso: 20s) sin terminar.
function _esperarWorkerInstalado(worker, msTimeout = 20000) {
  return new Promise((resolve) => {
    if (!worker) { resolve(false); return; }
    if (worker.state === "installed" || worker.state === "redundant") { resolve(worker.state === "installed"); return; }
    const timeout = setTimeout(() => {
      worker.removeEventListener("statechange", onChange);
      resolve(false);
    }, msTimeout);
    function onChange() {
      if (worker.state === "installed" || worker.state === "redundant") {
        clearTimeout(timeout);
        worker.removeEventListener("statechange", onChange);
        resolve(worker.state === "installed");
      }
    }
    worker.addEventListener("statechange", onChange);
  });
}

async function buscarActualizacionManual() {
  if (!("serviceWorker" in navigator)) {
    alert("Este navegador no soporta actualizaciones automáticas.");
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { alert("No se encontró el Service Worker registrado."); return; }

    // Se arma la espera de "¿aparece algo nuevo?" ANTES de pedir update(),
    // para no perderse el evento "updatefound" si dispara justo entre
    // medio. Si ya había una instalación en curso de un intento anterior,
    // se espera esa misma en vez de perderla.
    const encontroInstalacion = reg.installing
      ? Promise.resolve(reg.installing)
      : new Promise((resolve) => {
          const onUpdateFound = () => { reg.removeEventListener("updatefound", onUpdateFound); resolve(reg.installing); };
          reg.addEventListener("updatefound", onUpdateFound);
          setTimeout(() => { reg.removeEventListener("updatefound", onUpdateFound); resolve(null); }, 8000);
        });

    await reg.update();
    const workerNuevo = await encontroInstalacion;
    const instalada = workerNuevo ? await _esperarWorkerInstalado(workerNuevo) : false;

    if (reg.waiting) {
      if (typeof SyncManager !== "undefined") SyncManager.mostrarToast("⬇️ Instalando la última versión…");
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      // El "controllerchange" de sw-register.js recarga la página sola en
      // cuanto la nueva versión toma control -- no hace falta hacer nada más.
    } else if (workerNuevo && !instalada) {
      if (typeof SyncManager !== "undefined") SyncManager.mostrarToast("⬇️ Sigue descargando la actualización — esperá un momento y volvé a intentar");
    } else {
      // No apareció ningún Service Worker nuevo -- puede ser genuinamente
      // la última versión, o que el chequeo del navegador no esté
      // detectando el cambio (bug real reportado: en iOS a veces reg.update()
      // no nota que sw.js cambió aunque sí cambió). Se ofrece una opción más
      // fuerte: dar de baja el Service Worker actual y recargar de cero,
      // sin tener que borrar/reinstalar la app.
      const forzar = confirm(
        `No se encontró una versión nueva (estás en v${CONFIG.VERSION}).\n\n` +
        `Si sabés que hay una versión más reciente, tocá Aceptar para forzar un reinicio completo del caché de la app (recarga sola después).`
      );
      if (forzar) {
        await reg.unregister();
        location.reload();
      }
    }
  } catch (err) {
    alert("No se pudo buscar la actualización: " + err.message);
  }
}

// ---- LISTAS DE CONCEPTOS ----

const GASTOS_FIJOS = [
  "Alquiler",
  "Emcali",
  "Gas",
  "Internet",
  "Celular",
  "Netflix",
  "Susc. Adobe",
  "Susc. Claude",
  "Seguridad Social",
  "Póliza",
  "RH Juli",
  "Transporte"
];

const GASTOS_VARIABLES = [
  "Mercado",
  "Ahorro",
  "Inversiones",
  "Salud",
  "Educación",
  "Belleza",
  "Deporte",
  "Ocio",
  "Entretenimiento",
  "Vacaciones",
  "Ropa",
  "Compras online",
  "Regalos",
  "Hogar",
  "Reparaciones hogar",
  "Tecnología",
  "Pasaje Mio",
  "Uber-Didi-Taxi",
  "Mascotas",
  "Cursos y certificaciones",
  "Congresos",
  "Donaciones",
  "Otros"
];

const FUENTES_INGRESO = ["SURA", "MEDFAN", "TATEQUIETO", "OTRO"];

// Quiénes pueden manejar las cajas "de Luni" y "de Choco" en Acciones
// rápidas (pedido explícito del usuario) -- se usa solo para completar la
// columna "usuarios_permitidos" de la hoja Cajas la primera vez que hace
// falta (ver verificarYCompletarUsuariosPermitidosCajas), identificando el
// grupo de cada caja por si su nombre contiene "luni" o "choco". Una vez
// completada, la hoja manda -- esto no se vuelve a mirar para una caja que
// ya tenga algo en esa columna, así que editarla ahí después sí tiene efecto.
const USUARIOS_PERMITIDOS_POR_NOMBRE = {
  luni: [
    "apssconmiamor@gmail.com", "byco85@gmail.com", "gastropediatra.evacol@gmail.com",
    "sabogaldario427@gmail.com", "yeinyco@gmail.com"
  ],
  choco: [
    "apssconmiamor@gmail.com", "blanjor1685@gmail.com", "byco85@gmail.com",
    "royer.sanabria1685@gmail.com", "sabogaldario427@gmail.com"
  ]
};

const ICONOS = {
  // Ingresos
  "Ingreso": "💰",

  // Gastos fijos
  "Alquiler": "🔑",
  "Mercado": "🛒",
  "Emcali": "💡",
  "Gas": "🔥",
  "Internet": "📡",
  "Celular": "📱",
  "Netflix": "📺",
  "Susc. Adobe": "🎨",
  "Susc. Claude": "🤖",
  "Seguridad Social": "🏥",
  "Póliza": "🛡️",
  "RH Juli": "🥳",
  "Transporte": "🚌",

  // Gastos variables
  "Mercado": "🛒",
  "Ahorro": "🐷",
  "Inversiones": "📈",
  "Salud": "💊",
  "Educación": "📚",
  "Belleza": "✂️",
  "Deporte": "🏋️",
  "Ocio": "🎮",
  "Entretenimiento": "🎵",
  "Vacaciones": "✈️",
  "Ropa": "👕",
  "Compras online": "🏪",
  "Regalos": "🎁",
  "Hogar": "🏡",
  "Reparaciones hogar": "🔧",
  "Tecnología": "💻",
  "Pasaje Mio": "🚍",
  "Uber-Didi-Taxi": "🚕",
  "Mascotas": "🐶",
  "Cursos y certificaciones": "🎓",
  "Congresos": "🎤",
  "Donaciones": "🤝",
  "Otros": "📌",

  // Automático (ver ajustarCaja) -- nivela una caja con saldo negativo.
  "Ajuste": "⚖️"
};

// Ícono de un concepto: el que tenga asignado; si no, uno según su nombre (agua, arriendo,
// gasolina, mascota...); y si tampoco, el genérico (ingreso o gasto).
function iconoDeConcepto(concepto, esIngreso) {
  return ICONOS[concepto]
    || (window.iconoPorNombre && window.iconoPorNombre(concepto))
    || (esIngreso ? "💰" : "📌");
}

// ---- PERSISTENCIA DE SESIÓN (localStorage + respaldo en cookie) ----
//
// Reportado: en iPhone, la app pide iniciar sesión con Google de nuevo cada
// vez que se abre — no solo "Reconectar", el login completo. Eso solo pasa
// si localStorage.guser desapareció por completo entre aperturas. Es un
// problema documentado de iOS/Safari: el almacenamiento de una PWA instalada
// en pantalla de inicio puede vaciarse solo (limpieza de almacenamiento del
// sistema, ITP, etc.), sin que la propia app haga nada raro (confirmado:
// guser/gtoken/worker_session solo se borran en el logout explícito, en
// ningún otro lado del código).
//
// Las cookies de primera parte normales sobreviven mejor que localStorage a
// ese tipo de limpieza en iOS (ITP apunta principalmente al almacenamiento
// "script-writable" de rastreo entre sitios, no a cookies simples de sesión
// del propio sitio). Estas 3 claves (identidad, token, sesión del Worker)
// se guardan en AMBOS lugares; si al abrir la app localStorage aparece vacío
// pero la cookie sigue teniendo el dato, se restaura localStorage antes de
// decidir si hay que mostrar login — así una limpieza de localStorage deja
// de significar "pedir todo de nuevo".
const _CLAVES_SESION = ["guser", "gtoken", "worker_session"];
const _SESION_MAX_AGE_SEGUNDOS = 60 * 60 * 24 * 180; // ~180 días, igual que el Worker

function _guardarSesion(clave, valor) {
  localStorage.setItem(clave, valor);
  try {
    document.cookie = `${clave}=${encodeURIComponent(valor)}; max-age=${_SESION_MAX_AGE_SEGUNDOS}; path=/; SameSite=Lax`;
  } catch (e) { /* cookies deshabilitadas — sin respaldo, pero no rompe nada */ }
}

function _borrarSesionGuardada(clave) {
  localStorage.removeItem(clave);
  try {
    document.cookie = `${clave}=; max-age=0; path=/; SameSite=Lax`;
  } catch (e) {}
}

function _leerCookie(clave) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + clave + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function _restaurarSesionDesdeCookieSiHaceFalta() {
  for (const clave of _CLAVES_SESION) {
    if (!localStorage.getItem(clave)) {
      const backup = _leerCookie(clave);
      if (backup) localStorage.setItem(clave, backup);
    }
  }
}

// ---- PERSISTENCIA DE SESIÓN — nivel 2: dato metido en el propio start_url ----
//
// Caso real confirmado (agosto 2026): a alguien le volvió a pasar el login
// completo AUN con el ícono bien anclado desde Safari — o sea, localStorage
// Y la cookie de respaldo de arriba pueden desaparecer juntos igual. Ningún
// truco de almacenamiento del sitio (localStorage, cookie, IndexedDB, Cache
// API — todos viven en el mismo contenedor de WebKit) puede blindarse contra
// eso del todo.
//
// El único dato que sobrevive de verdad es el propio start_url que iOS
// guarda al crear el ícono de pantalla de inicio: vive en la configuración
// del ícono (SpringBoard), FUERA del almacenamiento del sitio, así que no lo
// toca ninguna limpieza de WebKit. _ofrecerInstalacionBlindada() (más abajo)
// mete el sessionToken y el perfil ahí cuando la persona conecta con Google
// y le pide crear el ícono desde esa URL exacta — así CADA apertura del
// ícono trae la sesión adentro de la propia URL de arranque y puede
// repoblar localStorage sola, pase lo que pase con el almacenamiento.
function _base64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function _base64urlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64)));
}

function _restaurarSesionDesdeURLSiHaceFalta() {
  const params = new URLSearchParams(location.search);
  const u = params.get("u");
  if (!u) return;

  _guardarSesion("worker_session", u);
  localStorage.setItem("gtoken_ts", "0"); // access_token no viaja en la URL: pide uno fresco ya mismo

  const g = params.get("g");
  if (g) {
    try {
      const guser = JSON.parse(_base64urlDecode(g));
      if (guser && guser.email) _guardarSesion("guser", JSON.stringify(guser));
    } catch (e) { /* perfil corrupto — sigue con lo que haya en storage */ }
  } else if (!localStorage.getItem("guser")) {
    // Sin perfil en la URL: el email viaja en texto plano en el propio JWT
    // (sin verificar firma acá, solo para tener a quién mostrarle la app;
    // el Worker sí la valida de verdad al pedir el access_token).
    try {
      const payload = JSON.parse(_base64urlDecode(u.split(".")[1]));
      if (payload?.email) {
        _guardarSesion("guser", JSON.stringify({ name: payload.email, email: payload.email, picture: "" }));
      }
    } catch (e) {}
  }

  // Dentro del ícono instalado no hay barra de direcciones que preservar —
  // limpia la URL visible por prolijidad (no afecta el start_url que iOS ya
  // tiene guardado para el ícono, eso no cambia por esto).
  if (window.navigator.standalone) {
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  }
}

// ---- INIT ----

// Pide al navegador que NO trate el almacenamiento de este sitio como
// descartable bajo presión de espacio — mitigación estándar para el vaciado
// de localStorage/cookies documentado arriba en PWAs instaladas en iOS.
// Best-effort: iOS puede ignorar el pedido, pero no cuesta nada intentarlo.
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

window.onload = async () => {
  _restaurarSesionDesdeURLSiHaceFalta();
  _restaurarSesionDesdeCookieSiHaceFalta();
  const userRaw = localStorage.getItem("guser");
  const token   = localStorage.getItem("gtoken");

  let usuarioValido = null;
  if (userRaw) {
    try { usuarioValido = JSON.parse(userRaw); } catch (e) { usuarioValido = null; }
  }

  if (usuarioValido) {
    currentUser = usuarioValido;
    if (token) Sheets.setToken(token);
    mostrarApp();
  } else {
    // Sin usuario → intentar One Tap (auto-selecciona sin popup si hay sesión activa)
    try {
      google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        auto_select: true,
        cancel_on_tap_outside: false,
        callback: _onOneTapCredential
      });
      google.accounts.id.prompt();
    } catch (e) { /* sin conexión — login manual */ }
  }

  setupEventListeners();
};

// Pide al Worker (finanzas-hogar-token) un access_token fresco usando el
// sessionToken guardado (emitido la última vez que se conectó con Google
// vía conectarConGooglePopup). Esto reemplaza el viejo flujo silencioso de
// Google Identity Services (prompt:"none"), que dependía de una cookie de
// sesión de Google en el navegador — algo que las PWAs instaladas en la
// pantalla de inicio de iOS NUNCA tienen (WKWebView aislado de Safari), así
// que ese flujo fallaba siempre, no solo a veces.
//
// El Worker guarda un refresh_token real de Google por usuario y lo usa acá
// para pedir un access_token nuevo — no depende de nada del navegador, así
// que funciona igual de bien recién abierta la app que después de semanas.
// Tiene su propio timeout (AbortController, 7s) para nunca dejar a quien la
// llama esperando para siempre.
//
// Un solo intento devuelve `reintentable: true` cuando el fetch nunca llegó
// a completarse (sin conexión, timeout) — a diferencia de un 401/404 real
// del Worker, que no vale la pena reintentar. Confirmado con logs reales del
// Worker (Observability): un corte de red del lado del teléfono (cambio de
// wifi a datos, etc.) hace que el pedido nunca llegue al servidor, así que
// un solo reintento tras una pausa corta evita mostrar "Reconectar" por un
// corte de un par de segundos.
async function _pedirTokenAlWorker(email, sessionToken) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/token?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { ok: false, reintentable: false };
    const data = await res.json();
    if (!data.access_token) return { ok: false, reintentable: false };
    return { ok: true, data };
  } catch (e) {
    clearTimeout(timeoutId);
    return { ok: false, reintentable: true };
  }
}

// Breadcrumb sin autenticar al Worker (ver /diag ahí) — solo para los casos
// donde ni siquiera se intenta el fetch a /token o donde los dos intentos
// se pierden en el camino, que de otra forma no dejan ningún rastro en el
// servidor (se ven idénticos a "todo bien, nadie llamó").
function _diagBeacon(reason, email) {
  try {
    const params = new URLSearchParams({ reason, email: email || "" });
    fetch(`${CONFIG.WORKER_URL}/diag?${params.toString()}`).catch(() => {});
  } catch (e) {}
}

// Cuando el token vence, Cajas y Movimientos (Promise.all en cargarTodo) más
// el catch de cargarTodo() más cualquier otra lectura suelta (préstamos,
// compras, recordatorios) pueden disparar esta función CASI AL MISMO TIEMPO,
// cada una por su cuenta. Confirmado con logs reales del Worker: dos pedidos
// a /token en el mismo milisegundo, ambos exitosos — pero como cada llamador
// procesaba "su" resultado por separado (sin coordinarse), uno terminaba
// pisando al otro y el usuario se quedaba viendo "Reconectar" pese a que el
// token sí se había renovado bien. Este guard hace que todas las llamadas
// que lleguen mientras ya hay una renovación en curso esperen ESA MISMA
// promesa en vez de cada una ir por la suya — un solo pedido a /token, un
// solo resultado, todos los llamadores de acuerdo.
let _renovacionEnCurso = null;

// Pausas entre reintentos cuando el fallo es de red (nunca cuando el Worker
// respondió con un error real — ahí reintentar no cambia nada). Antes solo
// había UN reintento tras 1.5s (~15.5s de presupuesto total); reportado que
// el botón "Reconectar" seguía saliendo varias veces al día — un corte de
// red real (el teléfono reconectándose a wifi/datos) puede durar más que
// eso. Como esto corre en el fondo mientras la app ya muestra datos en
// caché (cargarInicial no espera más de 15s por esto), ser más paciente acá
// no cuesta nada en percepción de velocidad, solo reduce falsos positivos.
const ESPERAS_REINTENTO_MS = [3000, 8000, 15000, 20000];

async function renovarTokenDesdeWorker(email) {
  if (_renovacionEnCurso) return _renovacionEnCurso;

  _renovacionEnCurso = (async () => {
    const sessionToken = localStorage.getItem("worker_session");
    if (!email || !sessionToken) {
      _diagBeacon(!email ? "sin_email" : "sin_session", email);
      return false;
    }

    let resultado = await _pedirTokenAlWorker(email, sessionToken);
    for (let i = 0; i < ESPERAS_REINTENTO_MS.length && !resultado.ok && resultado.reintentable; i++) {
      await new Promise((r) => setTimeout(r, ESPERAS_REINTENTO_MS[i]));
      resultado = await _pedirTokenAlWorker(email, sessionToken);
    }
    if (!resultado.ok && resultado.reintentable) _diagBeacon("red_reintentos_agotados", email);
    if (!resultado.ok) return false; // sin conexión persistente, sesión inválida, etc.

    Sheets.setToken(resultado.data.access_token);
    _guardarSesion("gtoken", resultado.data.access_token);
    localStorage.setItem("gtoken_ts", String(Date.now()));
    marcarTokenValidoAhora();
    return true;
  })();

  try {
    return await _renovacionEnCurso;
  } finally {
    _renovacionEnCurso = null;
  }
}

// Nombre histórico usado por cargarTodo() para el reintento tras
// TOKEN_EXPIRADO — se mantiene como wrapper fino para no tocar esa lógica.
function renovarTokenSilencioso() {
  return renovarTokenDesdeWorker(currentUser?.email);
}

// ---- RENOVACIÓN PROACTIVA (adelantarse al 401 en vez de reaccionar a él) ----
//
// El access_token de Google dura ~1h. Hasta ahora la única renovación era
// REACTIVA: esperar a que un pedido a Sheets devuelva 401 y ahí recién
// intentar renovar — con presupuesto de reintentos (~46s, ver
// ESPERAS_REINTENTO_MS) para cubrir cortes de red cortos. Problema
// confirmado con logs reales del Worker: un corte de señal del celular que
// dure MÁS que ese presupuesto (típico con poca cobertura) hace que los
// reintentos se agoten sin que ni uno solo llegue al Worker — ningún error
// real, solo silencio — y el usuario se queda viendo "Reconectar" aunque el
// refresh_token esté perfectamente sano.
//
// Renovar por adelantado (bastante antes de que el token expire) no elimina
// los cortes de red, pero cambia el momento en que se intenta: en vez de
// que la ÚNICA oportunidad de renovar sea el instante justo en que el token
// ya expiró (y el usuario está esperando ver sus datos), se reintenta cada
// vez que se abre la app y cada rato mientras sigue abierta — así un corte
// puntual en un intento no dejar sin margen: el token viejo todavía sirve
// varios minutos más y hay más intentos en camino antes de que eso se acabe.
const TOKEN_RENOVACION_PROACTIVA_MS = 45 * 60 * 1000; // 45 min (el token dura ~60)

function _tokenNecesitaRenovacionProactiva() {
  const ts = parseInt(localStorage.getItem("gtoken_ts") || "0", 10);
  return (Date.now() - ts) > TOKEN_RENOVACION_PROACTIVA_MS;
}

async function renovarTokenProactivoSiHaceFalta() {
  if (!currentUser || !_tokenNecesitaRenovacionProactiva()) return;
  await renovarTokenSilencioso();
}

// Arranca el chequeo periódico + el chequeo al volver del segundo plano.
// Se llama una sola vez (guard) porque mostrarApp() puede correr más de
// una vez en la misma sesión (ej. tras reconectarGoogle()).
let _renovacionProactivaActiva = false;
function iniciarRenovacionProactiva() {
  if (_renovacionProactivaActiva) return;
  _renovacionProactivaActiva = true;

  setInterval(renovarTokenProactivoSiHaceFalta, 10 * 60 * 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") renovarTokenProactivoSiHaceFalta();
  });
}

// Callback de One Tap: identifica al usuario que vuelve (nombre/email/foto)
// y, si ya se conectó antes con Google (hay un sessionToken guardado para
// ese email), pide un access_token directo al Worker.
//
// Bug real confirmado con logs (agosto 2026): antes, esta función llamaba a
// mostrarApp() SIN IMPORTAR si la renovación funcionó — así que cuando el
// dispositivo había perdido su worker_session (el mismo vaciado de
// almacenamiento de iOS de siempre) pero Google seguía recordando la sesión
// del navegador, One Tap se disparaba SOLO, en silencio, sin que el usuario
// tocara nada, rellenaba currentUser/guser, la renovación fallaba
// ("sin_session" en los logs del Worker) y aun así se mostraba la app —
// dejando a la persona viendo un banner de error de la nada, en vez de la
// pantalla de login normal donde un solo toque resuelve todo. Ahora, si la
// renovación no funciona, se deshace el guser que puso One Tap y se deja la
// pantalla de login visible (el estado por defecto de window.onload).
async function _onOneTapCredential(credentialResponse) {
  try {
    const parts = credentialResponse.credential.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    currentUser = { name: payload.name, email: payload.email, picture: payload.picture };
    _guardarSesion("guser", JSON.stringify(currentUser));
  } catch (e) { return; }

  const renovado = await renovarTokenDesdeWorker(currentUser.email);
  if (renovado) {
    mostrarApp();
  } else {
    currentUser = null;
    _borrarSesionGuardada("guser");
  }
}

// ---- AUTH ----

// Abre un popup al flujo de autorización de Google con
// access_type=offline + prompt=consent, y el Worker
// (worker/src/index.js, endpoint /oauth/callback) captura el refresh_token
// del lado del servidor. El popup se cierra solo y manda el resultado por
// postMessage — esta función espera ese mensaje y lo devuelve.
//
// Reemplaza el flujo implícito de Google Identity Services para login y
// reconexión: ese flujo nunca entrega un refresh_token (solo un access_token
// de 1 hora), así que no había forma de renovar la sesión más adelante sin
// depender de la cookie de sesión del navegador — que es justo lo que falla
// en una PWA instalada en iOS.
function conectarConGooglePopup() {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      redirect_uri: `${CONFIG.WORKER_URL}/oauth/callback`,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events"
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    const popup = window.open(authUrl, "finanzas-google-oauth", "width=480,height=640");
    if (!popup) { resolve({ error: "popup_bloqueado" }); return; }

    let resuelto = false;
    const limpiar = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(intervalId);
    };
    const onMessage = (event) => {
      if (event.origin !== new URL(CONFIG.WORKER_URL).origin) return;
      if (!event.data || event.data.type !== "finanzas-oauth") return;
      if (resuelto) return;
      resuelto = true;
      limpiar();
      resolve(event.data);
    };
    window.addEventListener("message", onMessage);

    // Si el usuario cierra el popup sin terminar, no dejar la promesa
    // esperando para siempre.
    const intervalId = setInterval(() => {
      if (popup.closed && !resuelto) {
        resuelto = true;
        limpiar();
        resolve({ error: "popup_cerrado" });
      }
    }, 500);
  });
}

// Aplica el resultado de conectarConGooglePopup(): guarda el access_token,
// el sessionToken del Worker y el perfil del usuario. Comparte lógica entre
// el login inicial y el botón "Reconectar". Devuelve true si quedó todo listo.
function completarConexionGoogle(resultado) {
  if (!resultado || resultado.error || !resultado.access_token) {
    SyncManager.mostrarToast("No se pudo conectar con Google. Intenta de nuevo.", "warn");
    return false;
  }
  Sheets.setToken(resultado.access_token);
  _guardarSesion("gtoken", resultado.access_token);
  _guardarSesion("worker_session", resultado.sessionToken);
  localStorage.setItem("gtoken_ts", String(Date.now()));
  currentUser = { name: resultado.name, email: resultado.email, picture: resultado.picture };
  _guardarSesion("guser", JSON.stringify(currentUser));
  marcarTokenValidoAhora();
  _ofrecerInstalacionBlindadaSiHaceFalta();
  return true;
}

// Solo tiene sentido en Safari de iOS/iPadOS, y solo fuera del ícono ya
// instalado (adentro no hay Compartir → Añadir a pantalla de inicio que
// ofrecer, y ya se instaló como sea que se llegó hasta ahí).
function _debeOfrecerInstalacionBlindada() {
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const esChromeIOS = /CriOS/.test(navigator.userAgent);
  return esIOS && !esChromeIOS && !window.navigator.standalone;
}

// URL de arranque personalizada: lleva el sessionToken y el perfil metidos
// en la propia dirección, para que quien la use en "Añadir a pantalla de
// inicio" deje esos datos guardados en la config del ícono (ver
// _restaurarSesionDesdeURLSiHaceFalta más arriba para el porqué).
function _linkInstalacionBlindado() {
  const sessionToken = localStorage.getItem("worker_session");
  if (!currentUser || !sessionToken) return null;
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("u", sessionToken);
  url.searchParams.set("g", _base64urlEncode(JSON.stringify(currentUser)));
  return url.toString();
}

function _ofrecerInstalacionBlindadaSiHaceFalta() {
  if (!_debeOfrecerInstalacionBlindada()) return;
  const link = _linkInstalacionBlindado();
  if (!link) return;
  // Reescribe la barra de direcciones actual (sin recargar) para que el
  // gesto de "Añadir a pantalla de inicio" tome esta URL, no la original.
  try { history.replaceState(null, "", link); } catch (e) {}
  document.getElementById("instalar-blindado-bar")?.classList.remove("hidden");
}

document.getElementById("btn-login").addEventListener("click", async () => {
  const btn = document.getElementById("btn-login");
  btn.disabled = true;
  const resultado = await conectarConGooglePopup();
  btn.disabled = false;
  if (!completarConexionGoogle(resultado)) return;
  mostrarApp();
});

document.getElementById("btn-logout").addEventListener("click", () => {
  // Al cerrar sesión limpiamos auth, NO el caché de datos
  _borrarSesionGuardada("gtoken");
  _borrarSesionGuardada("guser");
  _borrarSesionGuardada("worker_session");
  if (typeof limpiarBadgeApp === "function") limpiarBadgeApp();
  currentUser = null;
  cajas = [];
  movimientos = [];
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  // Si esta pestaña llegó con la sesión metida en la URL (ver
  // _restaurarSesionDesdeURLSiHaceFalta), quitarla de la barra de
  // direcciones — OJO: esto NO borra lo que iOS ya guardó como start_url
  // del ícono anclado; si ese ícono se creó con "Añadir a pantalla de
  // inicio" mientras tenía la sesión en la URL, seguirá reconectando solo
  // la próxima vez que se abra. Para negarle acceso de verdad a ese
  // dispositivo hay que borrar y recrear el ícono, no solo cerrar sesión acá.
  if (location.search) {
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  }
});

// ---- BARRA "CONECTANDO…" (mientras se cargan los datos reales tras abrir la app) ----

function mostrarConectando() {
  document.getElementById("conectando-bar")?.classList.remove("hidden");
}
function ocultarConectando() {
  document.getElementById("conectando-bar")?.classList.add("hidden");
}

// ---- BARRA "RECONECTAR" (cuando la renovación silenciosa del token falla) ----

// Se actualiza cada vez que se confirma un token válido (reconexión manual
// o renovación silenciosa exitosa) — ver marcarTokenValidoAhora().
let _ultimoTokenOkTs = 0;
function marcarTokenValidoAhora() {
  _ultimoTokenOkTs = Date.now();
}

// `origen` viaja al Worker como breadcrumb (ver /diag) — permite ver en los
// logs persistentes CUÁNDO y DESDE DÓNDE se pidió mostrar el botón.
//
// Antes esta función se AUTO-SUPRIMÍA si un token se había confirmado válido
// en los últimos 5s, asumiendo que un aviso de fallo tan cercano a un éxito
// tenía que ser ruido de un intento de fondo ya superado. Confirmado con
// logs reales del Worker que esa suposición es falsa: un renovador paralelo
// (ej. el 401 de getMovimientos disparando su propio Sheets._renovarToken())
// puede tener éxito y marcar el token como válido justo antes de que OTRO
// intento — el que de verdad importa, el que el usuario está mirando —
// falle y quiera mostrar el botón. Resultado real: pantalla de "no se
// pudieron cargar tus cajas" sin ningún botón para salir de ahí. Mejor
// mostrar el botón siempre (ocultarReconectar() ya lo esconde en cuanto una
// carga completa con éxito) que arriesgarse a dejar al usuario sin salida.
function mostrarReconectar(origen) {
  if (origen && typeof _diagBeacon === "function") {
    const superado = Date.now() - _ultimoTokenOkTs < 5000;
    _diagBeacon("mostrar_reconectar:" + origen + (superado ? ":superado" : ""), currentUser?.email);
  }
  document.getElementById("reconectar-bar")?.classList.remove("hidden");
}
function ocultarReconectar() {
  document.getElementById("reconectar-bar")?.classList.add("hidden");
}

// Reconexión con interacción del usuario. Reportado (y confirmado con logs
// reales): la mayoría de las veces que aparece este botón, la sesión guardada
// sigue siendo válida — lo que falló fue un intento puntual de red — y un
// simple reintento con el sessionToken que ya existe (lo mismo que pasa
// solo al recargar tras "Sincronizar") alcanza para resolverlo SIN pedir
// cuenta de Google. Por eso el primer intento es liviano
// (renovarTokenSilencioso + cargarTodo, sin popup); solo si eso de verdad
// no alcanza (sessionToken perdido, refresh_token revocado, etc.) se
// escala al popup real de Google (conectarConGooglePopup), que es el único
// camino que funciona si nunca hubo sesión guardada en este dispositivo.
async function reconectarGoogle() {
  const btn = document.querySelector("#reconectar-bar .btn-reconectar");
  if (btn) { btn.textContent = "Reintentando..."; btn.disabled = true; }

  const renovadoSilencioso = await renovarTokenSilencioso();
  if (renovadoSilencioso) {
    await cargarTodo();
    if (document.getElementById("reconectar-bar")?.classList.contains("hidden")) {
      if (btn) { btn.textContent = "Reconectar"; btn.disabled = false; }
      return; // resuelto sin popup
    }
  }

  if (btn) { btn.textContent = "Conectando..."; }
  const resultado = await conectarConGooglePopup();
  if (btn) { btn.textContent = "Reconectar"; btn.disabled = false; }
  if (!completarConexionGoogle(resultado)) return;

  ocultarReconectar();
  await cargarTodo();
}

// Carga inicial tras abrir la app: muestra "Conectando…" mientras trae los
// datos reales de Google Sheets, para que nunca se quede en silencio con
// la caché vieja sin que el usuario sepa que algo está pasando.
//
// Red de seguridad extra: si por lo que sea cargarTodo() se queda colgada
// (algún fetch sin timeout que nunca responde, etc.), esta carrera contra un
// límite de tiempo garantiza que la barra "Conectando…" desaparezca igual —
// la UI ya tiene la caché en pantalla, así que es mejor mostrar eso que
// quedarse pegado indefinidamente.
async function cargarInicial() {
  mostrarConectando();
  let seColgo = true;
  try {
    await Promise.race([
      cargarTodo().then(() => { seColgo = false; }),
      new Promise(r => setTimeout(r, 15000))
    ]);
    if (seColgo) {
      SyncManager.mostrarToast("⏱️ La carga está tardando demasiado — mostrando datos guardados", "warn");
    }
  } finally {
    ocultarConectando();
  }
}

// ---- MOSTRAR APP (sin bloquear en red) ----

async function mostrarApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  avisarSiSeActualizoSola();
  document.getElementById("user-name").textContent = currentUser.name;
  document.getElementById("user-avatar").src = currentUser.picture;
  const mesCorriente = new Date().toISOString().slice(0, 7);
  document.getElementById("filtro-mes").value  = mesCorriente;
  // Cargar caché SIEMPRE antes de tocar la red
  const cacheC    = localStorage.getItem("cache_cajas");
  const cacheM    = localStorage.getItem("cache_movimientos");
  const cacheP    = localStorage.getItem("cache_presupuesto");
  const cacheCron = localStorage.getItem("cache_cronologia");

  if (cacheC) { try { cajas        = JSON.parse(cacheC); } catch {} }
  if (cacheM) { try { movimientos  = JSON.parse(cacheM); } catch {} }
  if (cacheP) { try { presupuesto  = JSON.parse(cacheP); } catch {} }

  _leerCajasOcultasDeCache();

  // Renderizar INMEDIATAMENTE con lo que haya en caché
  renderCajas();
  renderMovimientos();
  renderFranjas();
  poblarFiltrosCajas();
  if (presupuesto && presupuesto.length > 0) renderProyeccion();
  if (cacheCron) { try { renderCronologia(JSON.parse(cacheCron)); } catch {} }

  // Renovación proactiva: adelantarse al 401 en vez de esperarlo (ver
  // comentario en iniciarRenovacionProactiva). No bloquea — corre en
  // paralelo con cargarInicial().
  renovarTokenProactivoSiHaceFalta();
  iniciarRenovacionProactiva();

  // Intentar sincronizar con la red SIN bloquear la UI (la caché ya está
  // en pantalla) — pero SÍ mostrar "Conectando…" mientras tanto, para que
  // quede claro que la info real está en camino y no se quede pegado en
  // datos viejos sin ningún aviso.
  cargarInicial();

  // Recordatorios: cargar badge (el botón flotante es ahora la forma de crear uno nuevo)
  if (typeof cargarRecordatorios === "function") {
    const cacheR = localStorage.getItem("cache_recordatorios");
    if (cacheR) { try { recordatorios = JSON.parse(cacheR); } catch {} }
    renderRecordatorioBadge();
    cargarRecordatorios();
  }

  // Notificaciones: igual que Recordatorios arriba — se carga sola al abrir
  // la app (no solo al entrar a esa pestaña) para que el número del
  // atajo "Alertas" de Inicio esté al día de una vez.
  if (typeof cargarNotificaciones === "function") {
    const cacheN = localStorage.getItem("cache_notificaciones");
    if (cacheN) { try { notificaciones = JSON.parse(cacheN); } catch {} }
    renderNotificacionesBadge();
    cargarNotificaciones();
  }
}

// ---- GESTO DE "VOLVER" ESTILO iPHONE (deslizar de izquierda a derecha desde el borde) ----

// Anima la salida (mismo efecto para los 3 casos que maneja
// cerrarPantallaActual) y solo después ejecuta el cierre real —
// así no hay que tocar la lógica propia de cada uno (ej. el modal de
// recordatorio apagando el micrófono).
const ANIM_CIERRE_MS = 180;
function animarYCerrar(el, cerrarDeVerdad) {
  el.classList.add("cerrando-swipe");
  setTimeout(() => {
    el.classList.remove("cerrando-swipe");
    cerrarDeVerdad();
  }, ANIM_CIERRE_MS);
}

// Limpieza especial al cerrar un modal en particular (frenar el
// micrófono si estaba grabando, limpiar un formulario a medio llenar...)
// -- UN solo lugar para que TODO camino de cierre (deslizar, tocar el
// fondo, X, Cancelar) haga la misma limpieza. Antes cada camino tenía su
// propia copia de esta lógica (o directamente no la tenía) -- bug real:
// tocar el fondo de "Nuevo movimiento" mientras se grababa audio podía
// dejar el micrófono prendido, porque esa limpieza solo vivía en el
// gesto de deslizar.
function cerrarModal(modalEl) {
  if (!modalEl) return;
  // Modales de React (data-react="1"): ellos deciden qué es "cerrar" (ver shared/Modal.jsx).
  if (modalEl.dataset.react === "1") {
    modalEl.dispatchEvent(new CustomEvent("finanzas:cerrar"));
    return;
  }
  modalEl.classList.add("hidden");
}

function cerrarPantallaActual() {
  const modalAbierto = document.querySelector(".modal:not(.hidden)");
  if (modalAbierto) {
    animarYCerrar(modalAbierto, () => cerrarModal(modalAbierto));
    return true;
  }
  const recPanel = document.getElementById("recordatorios-panel");
  if (recPanel && !recPanel.classList.contains("hidden")) {
    animarYCerrar(recPanel, () => recPanel.classList.add("hidden"));
    return true;
  }
  // Pantalla de detalle de un bloque de Alertas (ver notificaciones.js) --
  // no tiene modal ni panel propio, solo cambia lo que hay adentro de
  // #notificaciones-list, así que se anima y se cierra igual que los demás.
  if (typeof bloqueAlertaAbierto !== "undefined" && bloqueAlertaAbierto) {
    const listaNotif = document.getElementById("notificaciones-list");
    if (listaNotif) {
      animarYCerrar(listaNotif, () => {
        bloqueAlertaAbierto = null;
        if (typeof renderNotificaciones === "function") renderNotificaciones();
      });
      return true;
    }
  }
  // Detalle de una categoría de Mercado (ver mercado.js) -- mismo criterio
  // que el bloque de Alertas de arriba.
  if (typeof categoriaMercadoAbierta !== "undefined" && categoriaMercadoAbierta !== null) {
    const listaMercado = document.getElementById("mercado-list");
    if (listaMercado) {
      animarYCerrar(listaMercado, () => {
        categoriaMercadoAbierta = null;
        if (typeof renderMercado === "function") renderMercado();
      });
      return true;
    }
  }
  // Detalle de una categoría de Planes (ver planes.js) -- mismo criterio
  // que el bloque de Alertas/Mercado de arriba (bug real reportado: el
  // botón "‹" no hacía nada porque esta función no sabía de Planes).
  if (typeof bloquePlanAbierto !== "undefined" && bloquePlanAbierto) {
    const listaPlanes = document.getElementById("planes-list");
    if (listaPlanes) {
      animarYCerrar(listaPlanes, () => {
        bloquePlanAbierto = null;
        if (typeof renderPlanes === "function") renderPlanes();
      });
      return true;
    }
  }
  return false;
}

// ---- GESTO DE VOLVER ----
// Deslizar desde el borde izquierdo = volver un nivel. Si hay algo abierto
// (modal, panel, detalle de un bloque...) lo cierra; si no, y se está en otro
// módulo (Movimientos, Proyección, Alertas, Mercado, Planes, Análisis...),
// lleva a la pantalla principal (Inicio/Cajas). Estando ya en Inicio no hace
// nada.
//
// Volver a Inicio es un arrastre interactivo, tipo iOS: la pantalla actual y
// la de Inicio se mueven pegadas al dedo (a mitad de camino se ve 50% de
// cada una). Al soltar, si pasó de ~40% del ancho (o fue un barrido rápido)
// se completa; si no, regresa a donde estaba -- sin haber cambiado nada de
// verdad hasta confirmar.
//
// Durante el movimiento las dos pantallas se fijan (position:fixed) en el
// rectángulo donde estaban. Al terminar se limpian en el mismo instante en
// que se cancelan las animaciones -- si no, quedaba un parpadeo al final.
const ANIM_VOLVER_MS = 300;
const UMBRAL_CONFIRMAR = 0.4;      // fracción del ancho que confirma el volver
const VELOCIDAD_CONFIRMAR = 0.5;   // px/ms de un barrido rápido que también confirma
let _arrastreVolver = null;

// ¿Hay algo superpuesto que el gesto cerraría antes que cambiar de módulo?
// (mismos casos que cerrarPantallaActual, sin cerrar nada).
function _hayAlgoQueCerrar() {
  if (document.querySelector(".modal:not(.hidden)")) return true;
  for (const id of ["recordatorios-panel"]) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains("hidden")) return true;
  }
  if (typeof bloqueAlertaAbierto !== "undefined" && bloqueAlertaAbierto) return true;
  if (typeof categoriaMercadoAbierta !== "undefined" && categoriaMercadoAbierta !== null) return true;
  if (typeof bloquePlanAbierto !== "undefined" && bloquePlanAbierto) return true;
  return false;
}

function _movimientoReducido() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function _fijarParaVolver(el, r) {
  el.style.position = "fixed";
  el.style.top = r.top + "px";
  el.style.left = r.left + "px";
  el.style.width = r.width + "px";
  el.style.margin = "0";
  el.style.zIndex = "1";
  el.style.animation = "none";   // sin la entrada de pestaña de siempre
}

function _soltarDeVolver(el) {
  ["position", "top", "left", "width", "margin", "zIndex", "transform"].forEach(k => { el.style[k] = ""; });
}

// Deja listas las dos pantallas para moverlas. No cambia el estado de la app
// (pestaña activa, título...) hasta confirmar.
function _prepararArrastreVolver() {
  if (_arrastreVolver) return false;
  if (_movimientoReducido()) return false;
  if (typeof window.navegarATab !== "function") return false;
  const saliente = document.querySelector(".tab-section:not(.hidden)");
  const inicio = document.getElementById("tab-cajas");
  if (!saliente || !inicio || saliente === inicio) return false;
  if (typeof saliente.animate !== "function") return false;

  const contenedor = document.querySelector(".main-content");
  const scrollPrevio = contenedor ? contenedor.scrollTop : 0;

  // La saliente se queda exactamente donde está, fuera del flujo...
  _fijarParaVolver(saliente, saliente.getBoundingClientRect());
  // ...e Inicio se muestra (sigue siendo su contenido ya dibujado) desde el
  // tope, también fijo.
  inicio.classList.remove("hidden");
  if (contenedor) contenedor.scrollTop = 0;
  _fijarParaVolver(inicio, inicio.getBoundingClientRect());

  _arrastreVolver = { saliente, inicio, contenedor, scrollPrevio, ancho: window.innerWidth, dx: 0, terminando: false };
  _moverArrastreVolver(0);
  return true;
}

function _moverArrastreVolver(dx) {
  const a = _arrastreVolver;
  if (!a || a.terminando) return;
  a.dx = Math.min(Math.max(dx, 0), a.ancho);
  a.saliente.style.transform = `translateX(${a.dx}px)`;
  a.inicio.style.transform = `translateX(${a.dx - a.ancho}px)`;
}

// Completa (confirmar) o deshace el movimiento, animando desde donde quedó el
// dedo hasta el extremo. La duración es proporcional a lo que falta recorrer.
function _terminarArrastreVolver(confirmar) {
  const a = _arrastreVolver;
  if (!a || a.terminando) return;
  a.terminando = true;
  const { saliente, inicio, ancho, dx } = a;
  const falta = confirmar ? ancho - dx : dx;
  const duration = Math.max(120, Math.round((falta / ancho) * ANIM_VOLVER_MS));
  const opciones = { duration, easing: "cubic-bezier(.32,.72,0,1)", fill: "forwards" };
  const finSale = confirmar ? ancho : 0;
  const finEntra = confirmar ? 0 : -ancho;

  const animSale = saliente.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${finSale}px)` }], opciones);
  const animEntra = inicio.animate([{ transform: `translateX(${dx - ancho}px)` }, { transform: `translateX(${finEntra}px)` }], opciones);

  Promise.all([animSale.finished, animEntra.finished]).catch(() => {}).then(() => {
    if (confirmar) {
      // Recién ahora cambia de verdad: pestaña activa, título, cargas...
      // navegarATab oculta todas las secciones y limpia su animation inline;
      // se vuelve a poner "none" en Inicio en el mismo instante (si no, su
      // entrada de pestaña se reiniciaría = parpadeo).
      window.navegarATab("cajas");
      inicio.style.animation = "none";
      saliente.style.animation = "";   // oculta: no dispara nada
    } else {
      inicio.classList.add("hidden");
      // La saliente sigue visible: conserva animation:none para no repetir
      // su entrada (navegarATab lo limpia en la próxima navegación).
      if (a.contenedor) a.contenedor.scrollTop = a.scrollPrevio;
    }
    _soltarDeVolver(saliente);
    _soltarDeVolver(inicio);
    animSale.cancel();
    animEntra.cancel();
    _arrastreVolver = null;
  });
}

// Botón de flecha de la franja inferior: lo mismo que el gesto de volver (primero cierra lo que
// esté abierto, un nivel hacia atrás; si no hay nada, vuelve a Inicio con la transición).
window.volverAtras = function () {
  if (!cerrarPantallaActual()) volverAInicio();
};

// Camino sin dedo (tests, o un barrido sin movimientos intermedios): el
// mismo movimiento, pero animado de principio a fin.
function volverAInicio() {
  const visible = document.querySelector(".tab-section:not(.hidden)");
  if (!visible || visible.id === "tab-cajas") return false;
  if (typeof window.navegarATab !== "function") return false;
  if (_arrastreVolver) return true;
  if (!_prepararArrastreVolver()) {
    window.navegarATab("cajas");   // movimiento reducido o sin animaciones
    return true;
  }
  _terminarArrastreVolver(true);
  return true;
}

(function setupGestoVolver() {
  const BORDE_PX = 28;     // debe iniciar cerca del borde izquierdo, como el gesto de iOS
  const SWIPE_MIN_PX = 70; // distancia horizontal mínima para contar como "volver"
  const DESVIO_MAX_PX = 60; // tolerancia vertical antes de descartarlo como scroll
  const FIJAR_DIRECCION_PX = 8; // desde acá se decide si el dedo va en horizontal o vertical
  let inicioX = null, inicioY = null, valido = false;
  let direccion = null;          // "h" | "v" | null (aún sin decidir)
  let puedeArrastrar = false;    // ¿este toque puede arrastrar la pantalla hacia Inicio?
  let ultimoX = 0, ultimoT = 0, velocidad = 0;

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { valido = false; return; }
    const t = e.touches[0];
    valido = t.clientX <= BORDE_PX;
    inicioX = t.clientX;
    inicioY = t.clientY;
    direccion = null;
    ultimoX = t.clientX; ultimoT = e.timeStamp; velocidad = 0;
    const visible = document.querySelector(".tab-section:not(.hidden)");
    puedeArrastrar = valido && !_arrastreVolver && !_hayAlgoQueCerrar() &&
      !!visible && visible.id !== "tab-cajas";
  }, { passive: true });

  // No pasivo a propósito: una vez que se sabe que el dedo va en horizontal
  // hay que frenar el scroll vertical nativo de la pantalla.
  document.addEventListener("touchmove", (e) => {
    if (!valido || inicioX === null) return;
    const t = e.touches[0];
    const dx = t.clientX - inicioX;
    const dy = t.clientY - inicioY;
    if (direccion === null && (Math.abs(dx) > FIJAR_DIRECCION_PX || Math.abs(dy) > FIJAR_DIRECCION_PX)) {
      direccion = Math.abs(dx) > Math.abs(dy) && dx > 0 ? "h" : "v";
    }
    if (direccion !== "h" || !puedeArrastrar) return;
    if (!_arrastreVolver && !_prepararArrastreVolver()) { puedeArrastrar = false; return; }
    if (e.cancelable) e.preventDefault();
    const dt = e.timeStamp - ultimoT;
    if (dt > 0) velocidad = (t.clientX - ultimoX) / dt;
    ultimoX = t.clientX; ultimoT = e.timeStamp;
    _moverArrastreVolver(dx);
  }, { passive: false });

  document.addEventListener("touchend", (e) => {
    if (!valido || inicioX === null) return;
    valido = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - inicioX;
    const dy = Math.abs(t.clientY - inicioY);
    if (_arrastreVolver && !_arrastreVolver.terminando) {
      const ancho = _arrastreVolver.ancho;
      const confirmar = _arrastreVolver.dx > ancho * UMBRAL_CONFIRMAR ||
        (velocidad > VELOCIDAD_CONFIRMAR && _arrastreVolver.dx > 30);
      _terminarArrastreVolver(confirmar);
      return;
    }
    if (dx > SWIPE_MIN_PX && dy < DESVIO_MAX_PX) {
      // Sin arrastre en vivo (hay algo abierto que cerrar, o el toque no
      // generó movimientos): primero cierra lo que esté abierto, un nivel
      // hacia atrás; si no hay nada, vuelve a Inicio.
      if (!cerrarPantallaActual()) volverAInicio();
    }
  }, { passive: true });

  document.addEventListener("touchcancel", () => {
    valido = false;
    if (_arrastreVolver && !_arrastreVolver.terminando) _terminarArrastreVolver(false);
  }, { passive: true });
})();

// Criterio único de gestos (doble toque / mantener presionado) — ver gestos.js,
// cargado antes que este archivo a propósito.

// ---- NAVEGACIÓN ----

function setupEventListeners() {
function navegarATab(tab) {
    // Los modos "Sumar" de Movimientos y Proyección (y sus barras flotantes,
    // que viven fuera de sus pestañas) no tendrían cómo apagarse solos si el
    // usuario cambia de pestaña con el modo activo -- se resetean acá. El de
    // Cajas ya lo resuelve su propio componente React.
    if (tab !== "movimientos" && typeof modoSumaMovActivo !== "undefined" && modoSumaMovActivo) {
      modoSumaMovActivo = false;
      movimientosSeleccionadosParaSumar = new Set();
      renderMovimientos();
    }
    if (tab !== "proyeccion" && typeof modoSumaProyActivo !== "undefined" && modoSumaProyActivo) {
      modoSumaProyActivo = false;
      conceptosSeleccionadosParaSumar = new Set();
      renderProyeccion();
    }
    document.querySelectorAll(".nav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-section").forEach(s => { s.classList.add("hidden"); s.style.animation = ""; });
    const sec = document.getElementById(`tab-${tab}`);
    if (sec) sec.classList.remove("hidden");
    if (tab === "compromisos") { cargarPrestamos(); cargarCompras(); }
    if (tab === "notificaciones") cargarNotificaciones();
    if (tab === "planes" && typeof cargarPlanes === "function") cargarPlanes();
    if (tab === "mercado" && typeof cargarMercado === "function") cargarMercado();
    if (tab === "resumen") renderResumen();
    if (tab === "proyeccion") renderProyBarra();
    // La franja inferior de cada vista (React) se muestra solo en su pestaña.
    window.__tabActiva = tab;
    document.dispatchEvent(new CustomEvent("finanzas:tab", { detail: tab }));
  }
  window.navegarATab = navegarATab;

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navegarATab(btn.dataset.tab));
  });

document.getElementById("btn-refrescar")?.addEventListener("click", cargarTodo);
  document.getElementById("btn-refrescar-mov")?.addEventListener("click", cargarTodo);

  // Deslizar hacia abajo para refrescar (ver activarPullToRefresh en
  // gestos.js) -- Cajas y Movimientos comparten cargarTodo (la misma carga
  // ya trae ambas); Alertas tiene su propia carga más liviana.
  if (typeof activarPullToRefresh === "function") {
    activarPullToRefresh(
      document.querySelector(".main-content"),
      document.getElementById("pull-refresh-indicator"),
      () => {
        if (document.getElementById("tab-cajas")?.classList.contains("hidden") === false) return cargarTodo;
        if (document.getElementById("tab-movimientos")?.classList.contains("hidden") === false) return cargarTodo;
        if (document.getElementById("tab-notificaciones")?.classList.contains("hidden") === false
          && typeof cargarNotificaciones === "function") return cargarNotificaciones;
        return null;
      }
    );
  }

  // Movimientos

document.getElementById("btn-nuevo-ingreso").addEventListener("click", () => abrirNuevoMovimiento("Ingreso"));
  document.getElementById("btn-nuevo-gasto").addEventListener("click", () => abrirNuevoMovimiento("Gasto"));
  document.getElementById("btn-nueva-transferencia").addEventListener("click", () => abrirNuevoMovimiento("Transferencia"));

  document.getElementById("filtro-mes").addEventListener("change", renderMovimientos);
  document.getElementById("filtro-concepto").addEventListener("change", () => {
    actualizarFiltroSubcategoria();
    renderMovimientos();
  });
  document.getElementById("filtro-subcategoria")?.addEventListener("change", renderMovimientos);
  actualizarFiltroSubcategoria();

  // Separadores de miles: delegación para inputs de presupuesto/proyección (dinámicos)
  document.addEventListener("input", (e) => {
    if (e.target.classList.contains("pres-input")) {
      formatearInputMiles(e.target);
    }
  });

  renderMovimientoReact();

  // Cerrar modal al clic fuera (misma limpieza que el gesto de deslizar,
  // ver cerrarModal)
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) cerrarModal(modal);
    });
  });
}

// ---- NUEVO / EDITAR MOVIMIENTO ----
// La ventana es React (react/src/movimiento/Movimiento.jsx); acá quedan los datos: qué opciones
// ofrecer, y guardar en Sheets / Drive.

// Abre el formulario desde uno de los 3 botones de la pestaña Movimientos (Ingreso / Gasto /
// Transferencia): el tipo ya viene elegido de afuera.
//   - Ingreso/Transferencia: la categoría se preselecciona sola y no se ve el selector de categoría.
//   - Gasto: la categoría NO se asume (puede ser fijo o variable) -- el selector se recorta a esas dos.
function abrirNuevoMovimiento(tipo) {
  document.dispatchEvent(new CustomEvent("movimiento:abrir", { detail: { modo: "nuevo", tipo } }));
}

// Gastos fijos para elegir, marcando los ya registrados en el mes de la fecha del formulario.
// {value, label}: el label lleva "(ya registrado)" pero el valor guardado es el nombre solo.
function opcionesGastosFijosMovimiento(fecha, editId) {
  const mesFecha = fecha ? fecha.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const pagadosEnFecha = new Set(
    movimientos
      .filter(m => {
        if (m.categoria !== "Gasto fijo") return false;
        if (!m.fecha.startsWith(mesFecha)) return false;
        if (editId && m.id === editId) return false;
        return true;
      })
      .map(m => m.concepto)
  );
  const conceptosPrestamos = prestamos
    ? prestamos.filter(p => !p.pagado).map(p => conceptoPrestamo(p.nombre))
    : [];
  return [...GASTOS_FIJOS, ...conceptosPrestamos].map(c => ({
    value: c, label: pagadosEnFecha.has(c) ? `${c} (ya registrado)` : c
  }));
}

function renderMovimientoReact() {
  if (!window.MovimientoReact) return;
  window.MovimientoReact.render({
    getCajas: () => {
      if (cajas.length === 0) {
        try { const cache = localStorage.getItem("cache_cajas"); if (cache) cajas = JSON.parse(cache); } catch {}
      }
      return cajas;
    },
    cajaVisible: c => cajaVisibleParaUsuario(c, currentUser?.email),
    saldoDe: nombre => calcularSaldoCaja(nombre),
    iconoCaja: nombre => iconoCajaImagen(nombre),
    colorCaja: nombre => cajaColorFondo(nombre),
    opcionesFijo: opcionesGastosFijosMovimiento,
    gastosVariables: () => GASTOS_VARIABLES,
    fuentesIngreso: () => FUENTES_INGRESO,
    getMovimiento: id => movimientos.find(x => x.id === id) || null,
    evaluarMonto: texto => evaluarMonto(texto),
    formatMonto: (n, moneda) => formatMonto(n, moneda),
    obtenerStream: obtenerStreamMicrofonoMov,
    liberarMicrofono: liberarMicrofonoMov,
    cargarMedia: cargarMediaDrive,
    onGuardar: guardarMovimientoDatos,
  });
}

// ---- FILTRO SUBCATEGORÍA DINÁMICO (depende de la categoría elegida) ----

function actualizarFiltroSubcategoria() {
  const categoria = document.getElementById("filtro-concepto").value;
  const sel = document.getElementById("filtro-subcategoria");
  if (!sel) return;

  let lista = [];
  if (categoria === "Gasto fijo") {
    lista = GASTOS_FIJOS;
  } else if (categoria === "Gasto variable") {
    lista = GASTOS_VARIABLES;
  } else if (categoria === "Ingreso") {
    lista = FUENTES_INGRESO;
  } else if (categoria === "Transferencia") {
    lista = [...new Set(
      movimientos.filter(m => m.categoria === "Transferencia").map(m => m.concepto)
    )].sort();
  } else {
    lista = [...new Set([...GASTOS_FIJOS, ...GASTOS_VARIABLES, ...FUENTES_INGRESO])].sort();
  }

  const valorAnterior = sel.value;
  sel.innerHTML = `<option value="">Todas</option>` +
    lista.map(c => `<option value="${c}">${c}</option>`).join("");
  // Conserva la subcategoría elegida si sigue siendo válida para la nueva categoría
  if (lista.includes(valorAnterior)) sel.value = valorAnterior;
  sel.disabled = lista.length === 0;
}

// ---- CARGA DE DATOS ----

// Varios caminos disparan cargarTodo() por su cuenta cuando el token se
// renueva (el retry de este mismo catch, más el .then() de
// Sheets._renovarToken() por cada lectura suelta que haya recibido un 401 —
// confirmado con logs reales: getCajas Y getMovimientos pueden 401 en el
// mismo Promise.all, cada uno disparando su propio "cargarTodo() de nuevo").
// Sin este guard, eso son 2-3 recargas completas concurrentes innecesarias
// por cada renovación — y si una de esas recargas redundantes tropieza con
// algo (rate limit de Sheets por el burst de pedidos, etc.), puede terminar
// mostrando "Reconectar" pese a que los datos ya estaban al día. El guard
// hace que toda llamada que llegue mientras ya hay una carga en curso
// comparta ESA MISMA promesa en vez de disparar la suya.
let _cargaEnCurso = null;

// Distingue "confirmado que no hay cajas" (mostrar el onboarding "crea una
// para empezar") de "todavía no se pudo confirmar nada por red" (mostrar un
// aviso de carga/conexión en vez de invitar a crear cajas que en realidad ya
// existen en la hoja pero no cargaron — típico tras el vaciado de
// localStorage de iOS, ver _restaurarSesionDesdeCookieSiHaceFalta arriba).
let _cajasVerificadasEnRed = false;

async function cargarTodo(reintentando = false) {
  if (_cargaEnCurso) return _cargaEnCurso;
  _cargaEnCurso = _cargarTodoInterno(reintentando);
  try {
    return await _cargaEnCurso;
  } finally {
    _cargaEnCurso = null;
  }
}

async function _cargarTodoInterno(reintentando) {
  try {
    // Cajas y movimientos son lecturas independientes → en paralelo (antes
    // eran 2 round-trips secuenciales a la API de Sheets). El orden personal
    // de las cajas (arrastrar para reordenar) viaja en el mismo Promise.all.
    [cajas, movimientos] = await Promise.all([Sheets.getCajas(), Sheets.getMovimientos(), cargarOrdenCajas(), cargarCajasOcultas()]);
    _aplicarOrdenCajas();
    _cajasVerificadasEnRed = true;
    renderCajas();
    renderMovimientos();
    poblarFiltrosCajas();
    // Sin await a propósito -- son escrituras a Sheets que no deben demorar
    // el arranque; si hace falta completar algo, se refleja sola apenas
    // termine (recién importa cuando se abre Acciones rápidas).
    verificarYCompletarUsuariosPermitidosCajas();

    // Presupuesto, proyección y préstamos tampoco dependen entre sí → en
    // paralelo. Cada una atrapa sus propios errores internamente, así que
    // un fallo aislado no tumba a las demás. Cronología sí depende de que
    // el presupuesto ya esté cargado, así que va después de este bloque.
    await Promise.all([
      cargarPresupuesto(),
      cargarProyeccion(),
      cargarPrestamos(),
      typeof cargarAccionesRapidas === "function" ? cargarAccionesRapidas() : Promise.resolve(),
      typeof cargarBloquesAlertas === "function" ? cargarBloquesAlertas() : Promise.resolve(),
      typeof cargarBloquesPlanes === "function" ? cargarBloquesPlanes() : Promise.resolve()
    ]);
    await verificarYGuardarCronologia();
    await cargarYRenderCronologia();
    renderResumen();
    ocultarReconectar();

  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") {
      // Primer intento: el token guardado venció (típico al volver a abrir
      // la app tras un buen rato). Renovamos en silencio y reintentamos UNA
      // vez, en vez de rendirnos y dejar al usuario con datos viejos hasta
      // que por casualidad navegue a otra pestaña.
      if (!reintentando) {
        const renovado = await renovarTokenSilencioso();
        if (renovado) { await _cargarTodoInterno(true); return; }
      }
      // La renovación vía Worker puede fallar si este dispositivo nunca se
      // conectó con Google (sin sessionToken guardado) o si el refresh_token
      // guardado dejó de servir (contraseña cambiada, acceso revocado). En
      // vez de un toast que desaparece y deja a la app sin forma de
      // recuperarse, se deja un botón fijo para reconectar con un toque.
      SyncManager.mostrarToast("📴 No se pudo renovar la sesión — mostrando datos guardados", "warn");
      mostrarReconectar("cargarTodo");
      return;
    }

    if (err.message === "TIMEOUT") {
      SyncManager.mostrarToast("⏱️ Conexión lenta — mostrando datos en caché", "warn");
    } else {
      SyncManager.mostrarToast("📴 Sin conexión — mostrando datos guardados", "warn");
    }
    // Cualquier mensaje de "toca Reconectar" que se muestre en la UI (ej. el
    // empty-state de renderCajas cuando no hay caché) debe tener SIEMPRE un
    // botón real detrás — antes solo aparecía para TOKEN_EXPIRADO, dejando al
    // usuario viendo un aviso que invita a tocar un botón inexistente cuando
    // el fallo era timeout o error de red genérico.
    mostrarReconectar("cargarTodo:" + (err.message || "desconocido"));

    // Cargar desde caché localStorage (persiste entre sesiones)
    try {
      const cacheC    = localStorage.getItem("cache_cajas");
      const cacheM    = localStorage.getItem("cache_movimientos");
      const cacheP    = localStorage.getItem("cache_presupuesto");
      const cacheCron = localStorage.getItem("cache_cronologia");

      if (cacheC) cajas       = JSON.parse(cacheC);
      if (cacheM) movimientos = JSON.parse(cacheM);
      if (cacheP) presupuesto = JSON.parse(cacheP);

      renderCajas();
      renderMovimientos();
      poblarFiltrosCajas();
      renderProyeccion();
      if (cacheCron) renderCronologia(JSON.parse(cacheCron));
    } catch (cacheErr) {
      console.warn("Error leyendo caché:", cacheErr);
    }
  }
}

// ---- RENDER CAJAS ----

// Color de fondo pastel según el nombre de la caja (tarjetas y selects de caja)
function cajaColorFondo(nombre) {
  const n = (nombre || "").toLowerCase();
  if (n.includes("luni"))  return "rgba(241,176,255,0.1)"; // rosa/lila pastel, muy transparente
  if (n.includes("choco")) return "rgba(215,255,218,0.1)"; // verde pastel, muy transparente
  return "#ffffff";
}

// Ícono según el nombre de la caja (lista desplegable del selector de
// caja, pedido explícito del usuario) -- null si el nombre no menciona
// ninguno de los que tienen ícono. El logo de la entidad (Nequi,
// Bancolombia...) manda sobre el ícono de propósito (Ahorro, Efectivo...)
// si una caja menciona ambos (ej. "Nequi - Ahorro"), porque identifica
// mejor DÓNDE está la plata.
function iconoCajaImagen(nombre) {
  const n = (nombre || "").toLowerCase();
  if (n.includes("nequi"))        return "nequi.png";
  if (n.includes("bancolombia"))  return "bancolombia.png";
  if (n.includes("mercado pago")) return "mercado-pago.png";
  if (n.includes("falabella"))    return "falabella.png";
  if (n.includes("ahorro"))       return "svg:alcancia";
  if (n.includes("emergencia"))   return "svg:escudoMas";
  if (n.includes("efectivo"))     return "svg:billete";
  return null;
}

// Doble toque abre el detalle de la caja (resumen de solo lectura, mismo
// criterio que el resto de la app -- pedido explícito: un solo toque ya no
// debe hacer nada, antes abría el detalle directo).
const tapCaja = crearManejadorDobleToque(nombre => nombre, nombre => abrirDetalleCaja(nombre));

// Cajas ya se dibuja con React (react/src/cajas, bundle en react-dist/react-app.js):
// grilla, modo "Sumar" y barra flotante viven allá. Acá solo se arma el
// "view-model" -- los saldos y el orden siguen siendo de este archivo -- y se
// le pasan los callbacks que usan lo que todavía es JS plano (detalle, ajuste,
// guardado de orden).
// Alertas que necesitan atención (Activos de hoy + Pasados): lo calcula
// notificaciones.js (renderNotificacionesBadge) y se muestra como número en el
// atajo redondo "Alertas" de Inicio.
let _alertasPendientes = 0;
function actualizarAlertasAtajo(n) {
  if (n === _alertasPendientes) return;
  _alertasPendientes = n;
  renderCajas();
}

function renderCajas() {
  if (!window.CajasReact) return;
  window.CajasReact.render({
    cajas: cajas.map(c => ({
      id: c.id,
      nombre: c.nombre,
      moneda: c.moneda,
      saldoReal: calcularSaldoCaja(c.nombre),
      icono: iconoCajaImagen(c.nombre),
    })),
    // Sin confirmación por red todavía (recién abierta, caché vacía, o la
    // carga falló) → no invitar a "crear una" cuando en realidad puede que
    // ya existan y solo no hayan cargado, para no sugerir que se perdieron.
    ocultas: cajasOcultas,
    alertasPendientes: _alertasPendientes,
    onCambiarOcultas: _guardarCajasOcultas,
    verificadaEnRed: _cajasVerificadasEnRed,
    formatMonto,
    onAbrirDetalle: tapCaja,
    onAjustar: ajustarCaja,
    onReordenar: _reordenarCajas,
    onIrATab: tab => window.navegarATab(tab),
    // El rayo ⚡ de Inicio: abre el menú de Acciones rápidas (recordatorios.js).
    onAccionesRapidas: () => abrirMenuAcciones(),
    // Franja inferior de Inicio: versión (mantener presionada = buscar actualización) y cerrar sesión.
    version: CONFIG.VERSION,
    onBuscarActualizacion: buscarActualizacionManual,
    onMostrarAyudaVersion: () => SyncManager.mostrarToast("Mantén presionada la versión para buscar una actualización"),
    onCerrarSesion: () => document.getElementById("btn-logout")?.click(),
  });
}

// Se llama al soltar tras arrastrar una caja a un lugar nuevo. Igual que
// Mercado (ver _guardarOrdenMercadoCategorias), el orden es personal por
// usuario -- guarda IDs en ConfigUsuario para no desordenarse si alguien
// renombra una caja.
function _reordenarCajas(nombres) {
  const nuevoOrdenIds = nombres
    .map(nombre => cajas.find(c => c.nombre === nombre)?.id)
    .filter(Boolean);
  // Las ocultas no estaban en pantalla: conservan su lugar relativo al final
  // en vez de perder el orden que ya tenían.
  ordenCajas.filter(id => !nuevoOrdenIds.includes(id)).forEach(id => nuevoOrdenIds.push(id));
  _guardarOrdenCajas(nuevoOrdenIds);
  // El arrastre ya reordenó el DOM en pantalla, pero "cajas" (la fuente de
  // la que se arma la vista) todavía no -- sin esto, el render de abajo la
  // regresa a como estaba antes del arrastre.
  _aplicarOrdenCajas();
  renderCajas();
}


function abrirDetalleCaja(nombre) {
  const caja = cajas.find(c => c.nombre === nombre);
  const moneda = caja ? caja.moneda : "COP";

  const movs = movimientos
    .filter(m => m.caja === nombre)
    .sort((a, b) => {
      const porFecha = b.fecha.localeCompare(a.fecha);
      if (porFecha !== 0) return porFecha;
      const idA = parseInt(String(a.id).replace(/\D/g, ""), 10) || 0;
      const idB = parseInt(String(b.id).replace(/\D/g, ""), 10) || 0;
      return idB - idA;
    });

  const totalEntradas = movs.filter(m =>
    m.categoria === "Ingreso" || (m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"))
  ).reduce((s, m) => s + m.monto, 0);

  const totalSalidas = movs.filter(m =>
    m.categoria !== "Ingreso" && !(m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"))
  ).reduce((s, m) => s + Math.abs(m.monto), 0);

  // Entradas/salidas se calculan con el historial completo; la lista solo
  // muestra los últimos 50 movimientos (mismo formato que el detalle de
  // una fila en Proyección).
  const movsMostrados = movs.slice(0, 50);
  const filas = movsMostrados.map(m => {
    const esEntrada = m.categoria === "Ingreso" || (m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"));
    const fechaFmt = new Date(m.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
    return `<div class="detalle-real-item">
      <div class="detalle-real-item-texto">
        <span class="detalle-real-item-caja">${iconoDeConcepto(m.concepto, esEntrada)} ${m.concepto}</span>
        ${m.descripcion ? `<span class="detalle-real-item-desc">${m.descripcion}</span>` : ""}
        <span class="detalle-real-item-fecha">${fechaFmt}</span>
      </div>
      <span class="detalle-real-item-monto" style="color:${esEntrada ? "var(--green-dark)" : "var(--text)"}">${esEntrada ? "+" : "-"}${formatMonto(Math.abs(m.monto), moneda)}</span>
    </div>`;
  }).join("");

  const aviso = movs.length > 50
    ? `<p class="modal-subtitle" style="margin:-4px 0 0">Mostrando los últimos 50 de ${movs.length} movimientos</p>` : "";

  const cuerpo = movs.length === 0
    ? `<div class="detalle-real-vacio">Sin movimientos registrados</div>`
    : `${aviso}<div class="detalle-caja-scroll"><div class="detalle-real-lista">${filas}</div></div>`;

  const nombreEscapado = nombre.replace(/'/g, "\\'");
  const botonAjustar = totalEntradas < totalSalidas
    ? `<button class="btn-ajustar" onclick="ajustarCaja('${nombreEscapado}')">Ajustar</button>`
    : "";

  mostrarDetalle({
    id: "modal-detalle-caja", idTitulo: "detalle-caja-titulo", titulo: nombre, icono: "banco",
    cuerpos: [
      { id: "detalle-caja-resumen", clase: "detalle-caja-resumen", html: `
        <span style="color:var(--green)">▲ Entradas: ${formatMonto(totalEntradas, moneda)}</span>
        <span style="color:var(--red)">▼ Salidas: ${formatMonto(totalSalidas, moneda)}</span>
        <span style="font-weight:700">Saldo: ${formatMonto(totalEntradas - totalSalidas, moneda)}</span>
        ${botonAjustar}` },
      { id: "detalle-caja-body", clase: "", html: cuerpo },
    ],
  });
}

// Nivela una caja con saldo negativo: agrega UN movimiento de Ingreso por la
// diferencia exacta entre entradas y salidas, para que el saldo quede en 0
// en vez de tener que armar el ajuste a mano.
async function ajustarCaja(nombre) {
  const movs = movimientos.filter(m => m.caja === nombre);
  const totalEntradas = movs.filter(m =>
    m.categoria === "Ingreso" || (m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"))
  ).reduce((s, m) => s + m.monto, 0);
  const totalSalidas = movs.filter(m =>
    m.categoria !== "Ingreso" && !(m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"))
  ).reduce((s, m) => s + Math.abs(m.monto), 0);

  const diferencia = totalSalidas - totalEntradas;
  if (diferencia <= 0) return;

  const btn = document.querySelector(`#detalle-caja-resumen .btn-ajustar`);
  if (btn) { btn.textContent = "Ajustando..."; btn.disabled = true; }

  try {
    const hoy = new Date();
    const fechaISO = hoy.toISOString().split("T")[0];
    const fechaFmt = hoy.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
    await Sheets.agregarMovimientoIngreso(
      currentUser.email, fechaISO, "Ajuste", "Ingreso", nombre, diferencia, `Ajuste ${fechaFmt}`
    );
    cerrarDetalle();
    await cargarTodo();
  } catch (err) {
    alert("Error ajustando la caja: " + err.message);
    if (btn) { btn.textContent = "Ajustar"; btn.disabled = false; }
  }
}

// El Worker archiva solo (ver worker/src/archivo.js) los movimientos de más
// de 3 meses hacia otra hoja, y deja el neto de lo archivado en
// caja.saldoArchivado -- sumado acá, el saldo sigue exacto sin tener que
// cargar el historial completo de movimientos.
function calcularSaldoCaja(nombreCaja) {
  const caja = cajas.find(c => c.nombre === nombreCaja);
  const base = caja ? (caja.saldoArchivado || 0) : 0;
  return base + movimientos
    .filter(m => m.caja === nombreCaja)
    .reduce((sum, m) => {
      const esEntrada = m.categoria === "Ingreso" ||
        (m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"));
      return sum + (esEntrada ? m.monto : -Math.abs(m.monto));
    }, 0);
}

// ---- RENDER MOVIMIENTOS ----

function renderMovimientos() {
  const filtroM = document.getElementById("filtro-mes")?.value || "";
  const filtroK = document.getElementById("filtro-concepto")?.value || "";
  const filtroS = document.getElementById("filtro-subcategoria")?.value || "";

  let filtrados = movimientos.filter(m => {
    if (filtroK && m.categoria !== filtroK) return false;
    if (filtroS && m.concepto !== filtroS) return false;
    if (filtroM && !m.fecha.startsWith(filtroM)) return false;
    return true;
  });

  filtrados.sort((a, b) => {
    const porFecha = b.fecha.localeCompare(a.fecha);
    if (porFecha !== 0) return porFecha;
    // Mismo día: el último ingresado (id más reciente) va primero
    const idA = parseInt(String(a.id).replace(/\D/g, ""), 10) || 0;
    const idB = parseInt(String(b.id).replace(/\D/g, ""), 10) || 0;
    return idB - idA;
  });

  // Franja gris entre el resumen y la lista: de qué mes son los movimientos que se están viendo.
  const franjaMes = document.getElementById("movimientos-franja-mes");
  if (franjaMes) {
    franjaMes.textContent = filtroM
      ? new Date(filtroM + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" })
      : "todos los meses";
  }

  const subEl = document.getElementById("mov-section-sub");
  if (subEl) subEl.textContent = `${filtrados.length} movimiento${filtrados.length !== 1 ? "s" : ""}`;

  let ingresos = 0, gastos = 0;
  filtrados.forEach(m => {
    const cja = cajas.find(c => c.nombre === m.caja);
    if (cja && cja.moneda !== "COP") return;
    if (m.categoria === "Ingreso") ingresos += m.monto;
    else if (m.categoria !== "Transferencia") gastos += Math.abs(m.monto);
  });
  document.getElementById("total-ingresos").textContent = formatMonto(ingresos);
  document.getElementById("total-gastos").textContent   = formatMonto(gastos);
  const balance = ingresos - gastos;
  const balEl = document.getElementById("total-balance");
  balEl.textContent = formatMonto(balance);
  balEl.style.color = balance >= 0 ? "var(--green)" : "var(--red)";

  const list = document.getElementById("movimientos-list");
  if (filtrados.length === 0) {
    // El mes elegido no tiene movimientos activos -- puede ser que
    // simplemente no haya, o que ya se haya archivado (más de 3 meses,
    // ver worker/src/archivo.js). Solo vale la pena revisar el archivo si
    // es un mes pasado real, no uno futuro vacío.
    const mesActual = new Date().toISOString().slice(0, 7);
    if (filtroM && filtroM < mesActual && !movimientos.some(m => m.fecha.startsWith(filtroM))) {
      renderMesArchivado(filtroM);
      return;
    }
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-text">No hay movimientos para este período.</div></div>`;
    return;
  }

  list.innerHTML = filtrados.map(m => renderTarjetaMovimiento(m, true)).join("");
  if (modoSumaMovActivo) _conectarSeleccionMovimientos(list);
  else _conectarLargoPresionListaMovimientos(list, filtrados);
  renderSumarMovBarra();
}

// ---- Sumar movimientos ----
// Mismo patrón que "Sumar cajas"/"Sumar" de Proyección: un toque en una
// tarjeta la suma/resta del total (neto: entradas suman, salidas restan) en
// una barra flotante. Un total por moneda (ver renderSumarCajasBarra).
let modoSumaMovActivo = false;
let movimientosSeleccionadosParaSumar = new Set();

function toggleModoSumaMov() {
  modoSumaMovActivo = !modoSumaMovActivo;
  movimientosSeleccionadosParaSumar = new Set();
  renderMovimientos();
  renderFranjas();   // renderMovimientos no siempre llega a repintar la franja (mes archivado, lista vacía)
}

function renderBotonSumarMov() {
  const btn = document.getElementById("btn-sumar-mov");
  if (!btn) return;
  btn.textContent = modoSumaMovActivo ? "Listo" : "Sumar";
  btn.classList.toggle("active", modoSumaMovActivo);
}

function _conectarSeleccionMovimientos(list) {
  list.querySelectorAll(".mov-card[data-id]").forEach(card => {
    card.addEventListener("pointerup", () => {
      const id = card.dataset.id;
      if (movimientosSeleccionadosParaSumar.has(id)) movimientosSeleccionadosParaSumar.delete(id);
      else movimientosSeleccionadosParaSumar.add(id);
      card.classList.toggle("mov-card-seleccionada");
      renderSumarMovBarra();
    });
  });
}

// Estado del modo Sumar para la franja inferior de Movimientos (ver renderFranjas).
function _estadoSumaMov() {
  const porMoneda = {};
  movimientosSeleccionadosParaSumar.forEach(id => {
    const m = movimientos.find(x => x.id === id);
    if (!m) return;
    const caja = cajas.find(c => c.nombre === m.caja);
    const moneda = caja ? caja.moneda : "COP";
    const esEntrada = m.categoria === "Ingreso" || (m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"));
    porMoneda[moneda] = (porMoneda[moneda] || 0) + (esEntrada ? 1 : -1) * Math.abs(m.monto);
  });
  return {
    activo: modoSumaMovActivo,
    botonListo: "btn-sumar-mov",
    vacio: movimientosSeleccionadosParaSumar.size === 0,
    textoVacio: "Tocá los movimientos que querés sumar",
    textos: Object.entries(porMoneda).map(([moneda, total]) => formatMonto(total, moneda)),
  };
}

function renderSumarMovBarra() {
  renderBotonSumarMov();
  renderFranjas();
}

// ---- Franja inferior de las vistas en JS plano ----
// Cada vista lleva su menú ⋯ en una franja fija abajo (React: react/src/franjas). Sus
// acciones son los botones de siempre, que quedan ocultos en la página: el menú los
// pulsa. Una opción solo sale si su botón existe en ese momento (ej. "Nuevo producto"
// existe solo dentro de una categoría de Mercado).
const FRANJA_ACCIONES = {
  movimientos: [
    { boton: "btn-nuevo-ingreso", texto: "Nuevo ingreso", icono: "ingreso" },
    { boton: "btn-nuevo-gasto", texto: "Nuevo gasto", icono: "gasto" },
    { boton: "btn-nueva-transferencia", texto: "Nueva transferencia", icono: "movimientos" },
    { boton: "btn-sumar-mov", texto: "Sumar movimientos", icono: "sumar" },
  ],
  compromisos: [
    { boton: "btn-nuevo-prestamo", texto: "Nuevo préstamo", icono: "prestamo" },
    { boton: "btn-nueva-compra", texto: "Nueva compra", icono: "mercado" },
  ],
  notificaciones: [
    { boton: "btn-nueva-notificacion-bloque", texto: "Nueva alerta", icono: "alertas" },
    { boton: "btn-nuevo-bloque", texto: "Nuevo bloque", icono: "agregar" },
    { boton: "btn-activar-push", texto: "Activar en este dispositivo", icono: "alertas" },
    { boton: "btn-suscribir-calendario", texto: "Ver en el Calendario", icono: "mes" },
  ],
  mercado: [
    { boton: "btn-nuevo-producto-mercado-categoria", texto: "Nuevo producto", icono: "sumar" },
    { boton: "btn-compra-realizada-mercado", texto: "Compra realizada", icono: "check" },
    { boton: "btn-nueva-categoria-mercado", texto: "Nueva categoría", icono: "agregar" },
    { boton: "btn-whatsapp-mercado", texto: "Enviar lista por WhatsApp", icono: "enviar", conConteo: true },
  ],
  planes: [
    { boton: "btn-nuevo-plan-bloque", texto: "Nuevo plan", icono: "sumar" },
    { boton: "btn-nueva-categoria-plan", texto: "Nueva categoría", icono: "agregar" },
  ],
  resumen: [],
};

function _botonDisponible(id) {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains("hidden") && !el.closest(".hidden");
}

function renderFranjas() {
  if (!window.FranjasReact) return;
  window.FranjasReact.render({
    acciones: FRANJA_ACCIONES,
    estado: { movimientos: _estadoSumaMov() },
    hayBoton: _botonDisponible,
    pulsar: (id) => document.getElementById(id)?.click(),
    // El botón de WhatsApp trae el conteo entre paréntesis: "... (3)".
    etiquetaDe: (a) => {
      if (!a.conConteo) return a.texto;
      const n = /\((\d+)\)/.exec(document.getElementById(a.boton)?.textContent || "");
      return n ? `${a.texto} (${n[1]})` : a.texto;
    },
    irAInicio: () => { if (!volverAInicio()) window.navegarATab("cajas"); },
    actualizar: async () => {
      await cargarTodo();
      if (typeof renderResumen === "function") renderResumen();
    },
  });
}

// Mantener presionada una tarjeta de movimiento abre Editar/Eliminar (ver
// abrirMenuEditarBorrar en gestos.js) -- SOLO para la lista activa. Un mes
// archivado reusa renderTarjetaMovimiento pero de solo lectura (no está
// en la hoja activa, abrirEditarMovimiento/borrarMovimiento no lo
// encontrarían), así que renderMesArchivado nunca llama a esto.
function _conectarLargoPresionListaMovimientos(contenedor, lista) {
  contenedor.querySelectorAll(".mov-card").forEach(card => {
    const id = card.dataset.id;
    const m = lista.find(x => x.id === id);
    if (!m) return;
    crearManejadorPresionSostenida(card, {
      onLargo: () => abrirMenuEditarBorrar({
        titulo: m.concepto || "Movimiento",
        onEditar: () => abrirEditarMovimiento(id),
        onBorrar: () => borrarMovimiento(id)
      })
    });
  });
}

// Editar/Borrar ya no van sueltos en la tarjeta -- se ven en el resumen del
// doble toque (mostrarResumenMovimiento), igual que en Alertas y Proyección.
function renderTarjetaMovimiento(m, sumable = false) {
  const esIngreso  = m.categoria === "Ingreso";
  const esTransfer = m.categoria === "Transferencia";
  const esEntrada  = esIngreso || (esTransfer && m.concepto.startsWith("Transferencia ←"));
  const cls   = esEntrada ? "ingreso" : "gasto";
  const signo = esEntrada ? "+" : "-";
  const icono = iconoDeConcepto(m.concepto, esIngreso);
  const fechaFmt = new Date(m.fecha + "T12:00:00").toLocaleDateString("es-CO",
    { day: "2-digit", month: "short", year: "numeric" });
  const catCls = m.categoria.toLowerCase().replace(/ /g,"");
  const descHTML = m.descripcion
    ? `<span class="mov-desc-inline">· ${escapeHtml(m.descripcion)}</span>` : "";
  const primeraFoto = m.recibo ? m.recibo.split(",")[0].trim() : "";
  const fotoHTML = primeraFoto
    ? `<span class="mov-card-foto-icono" title="Tiene foto o audio adjunto" onclick="event.stopPropagation();abrirFotoMovimiento('${primeraFoto}')" onpointerup="event.stopPropagation()">📎</span>`
    : "";

  const seleccionada = sumable && modoSumaMovActivo && movimientosSeleccionadosParaSumar.has(m.id);
  const tapNormal = sumable && modoSumaMovActivo ? "" : ` onpointerup="tapMovimiento('${m.id}', event)"`;
  return `<div class="mov-card${seleccionada ? " mov-card-seleccionada" : ""}" data-id="${m.id}"${tapNormal}>
      <div class="mov-card-row1">
        <span class="mov-card-caja">${escapeHtml(m.caja)}</span>
        <span class="mov-card-fecha">${fechaFmt}</span>
      </div>
      <div class="mov-card-row2">
        <div class="mov-card-left">
          <span class="mov-card-icono mov-cat-${catCls}">${icono}</span>
          <div class="mov-card-texto">
            <span class="mov-card-concepto">${escapeHtml(m.concepto) || "Sin concepto"}${fotoHTML}</span>
            ${descHTML}
          </div>
        </div>
        <div class="mov-card-right">
          <span class="mov-card-monto ${cls}">${signo}${formatMonto(Math.abs(m.monto))}</span>
        </div>
      </div>
    </div>`;
}

// ---- MES ARCHIVADO (más de 3 meses -- ver worker/src/archivo.js) ----
// Se lee bajo demanda, solo cuando el mes elegido no tiene nada en los
// movimientos activos, y se guarda en memoria para no repetir la lectura
// si el usuario va y vuelve entre meses viejos en la misma sesión.
let movimientosArchivadosCache = null;

async function renderMesArchivado(mes) {
  const list = document.getElementById("movimientos-list");
  list.innerHTML = `<div class="empty-state">
    <div class="empty-state-icon">⏳</div>
    <div class="empty-state-text">Buscando en el archivo…</div></div>`;

  if (movimientosArchivadosCache === null) {
    try {
      movimientosArchivadosCache = await Sheets.getMovimientosArchivados();
    } catch (err) {
      movimientosArchivadosCache = [];
    }
  }

  // El filtro de mes pudo haber cambiado mientras esperábamos la red.
  if (document.getElementById("filtro-mes")?.value !== mes) return;

  const movsDelMes = movimientosArchivadosCache
    .filter(m => m.fecha.startsWith(mes))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const subEl = document.getElementById("mov-section-sub");
  if (movsDelMes.length === 0) {
    if (subEl) subEl.textContent = "0 movimientos";
    document.getElementById("total-ingresos").textContent = formatMonto(0);
    document.getElementById("total-gastos").textContent   = formatMonto(0);
    const balEl = document.getElementById("total-balance");
    balEl.textContent = formatMonto(0);
    balEl.style.color = "var(--text)";
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-text">No hay movimientos para este período.</div></div>`;
    return;
  }

  let ingresos = 0, gastos = 0;
  movsDelMes.forEach(m => {
    const cja = cajas.find(c => c.nombre === m.caja);
    if (cja && cja.moneda !== "COP") return;
    if (m.categoria === "Ingreso") ingresos += m.monto;
    else if (m.categoria !== "Transferencia") gastos += Math.abs(m.monto);
  });
  document.getElementById("total-ingresos").textContent = formatMonto(ingresos);
  document.getElementById("total-gastos").textContent   = formatMonto(gastos);
  const balance = ingresos - gastos;
  const balEl = document.getElementById("total-balance");
  balEl.textContent = formatMonto(balance);
  balEl.style.color = balance >= 0 ? "var(--green)" : "var(--red)";
  if (subEl) subEl.textContent = `${movsDelMes.length} movimiento${movsDelMes.length !== 1 ? "s" : ""} · archivado`;

  list.innerHTML = `
    <div class="mes-archivado-resumen">
      <span class="mes-archivado-icono">🗄️</span>
      <span>Este mes ya se archivó para aligerar la app — se ve un resumen; el detalle completo sigue disponible.</span>
    </div>
    <button type="button" class="btn-secondary mes-archivado-btn-detalle" id="btn-ver-detalle-archivado">Ver detalle (${movsDelMes.length})</button>
    <div id="detalle-archivado-lista" class="hidden"></div>`;

  document.getElementById("btn-ver-detalle-archivado")?.addEventListener("click", (e) => {
    const cont = document.getElementById("detalle-archivado-lista");
    if (cont.classList.contains("hidden")) {
      cont.innerHTML = movsDelMes.map(renderTarjetaMovimiento).join("");
      cont.classList.remove("hidden");
      e.target.textContent = "Ocultar detalle";
    } else {
      cont.classList.add("hidden");
      e.target.textContent = `Ver detalle (${movsDelMes.length})`;
    }
  });
}

// Doble tap/clic manual sobre una tarjeta de movimiento: no se puede usar
// ondblclick porque el bloqueo de zoom (touchend -> preventDefault en index.html)
// suprime la síntesis nativa de click/dblclick en Safari iOS real, aunque
// funcione con .dblclick() de Playwright (que no pasa por ese camino táctil).
const tapMovimiento = crearManejadorDobleToque(id => id, id => mostrarResumenMovimiento(id));

// Resumen de un movimiento (doble toque sobre su tarjeta) -- solo lectura;
// Editar/Borrar viven en el menú de mantener presionado, no acá (ver
// _conectarLargoPresionListaMovimientos, criterio único de gestos de
// gestos.js). Un movimiento ARCHIVADO (más de 3 meses, ver
// worker/src/archivo.js) se puede seguir consultando en este resumen,
// pero nunca ofrece el mantener-presionado -- no vive en la hoja
// "Movimiento de Caja" activa, así que abrirEditarMovimiento/
// borrarMovimiento no lo encontrarían.
function mostrarResumenMovimiento(id) {
  const m = movimientos.find(x => x.id === id) || (movimientosArchivadosCache || []).find(x => x.id === id);
  if (!m) return;
  const caja = cajas.find(c => c.nombre === m.caja);
  const moneda = caja ? caja.moneda : "COP";

  const esIngreso  = m.categoria === "Ingreso";
  const esTransfer = m.categoria === "Transferencia";
  const esEntrada  = esIngreso || (esTransfer && m.concepto.startsWith("Transferencia ←"));
  const fechaFmt = new Date(m.fecha + "T12:00:00").toLocaleDateString("es-CO",
    { day: "2-digit", month: "long", year: "numeric" });

  const primeraFoto = m.recibo ? m.recibo.split(",")[0].trim() : "";
  const fotoHTML = primeraFoto
    ? `<div class="resumen-mov-foto-wrap"><span class="foto-thumb" title="Cargando…"></span></div>`
    : "";

  mostrarDetalle({
    id: "modal-resumen-movimiento", idTitulo: "resumen-mov-titulo", titulo: m.concepto || "Sin concepto", icono: "movimientos",
    cuerpos: [{ id: "resumen-mov-body", clase: "detalle-real-lista", html: `
    <div class="detalle-real-item"><span class="detalle-real-item-caja">Caja</span><span>${escapeHtml(m.caja)}</span></div>
    <div class="detalle-real-item"><span class="detalle-real-item-caja">Fecha</span><span>${fechaFmt}</span></div>
    <div class="detalle-real-item"><span class="detalle-real-item-caja">Categoría</span><span>${escapeHtml(m.categoria)}</span></div>
    <div class="detalle-real-item"><span class="detalle-real-item-caja">Monto</span>
      <span class="detalle-real-item-monto" style="color:${esEntrada ? "var(--green-dark)" : "var(--text)"}">${esEntrada ? "+" : "-"}${formatMonto(Math.abs(m.monto), moneda)}</span>
    </div>
    ${m.descripcion ? `<div class="detalle-real-item"><span class="detalle-real-item-caja">Descripción</span><span>${escapeHtml(m.descripcion)}</span></div>` : ""}
    ${fotoHTML}` }],
    // La foto/audio adjunto se carga de Drive una vez que la ventana ya está en pantalla.
    alMontar: primeraFoto ? () => {
      const slot = document.querySelector(".resumen-mov-foto-wrap .foto-thumb");
      const fileId = Sheets.idDesdeUrlDrive(primeraFoto);
      Promise.all([Sheets.obtenerBlobUrlDrive(fileId), _esArchivoDeAudioDrive(fileId)]).then(([blobUrl, esAudio]) => {
        if (!slot) return;
        if (esAudio) {
          slot.outerHTML = `<div class="recordatorio-audio-preview"><audio controls src="${blobUrl}"></audio></div>`;
        } else {
          slot.outerHTML = `
            <a class="foto-thumb resumen-mov-foto" href="${blobUrl}" target="_blank" rel="noopener" title="Ver foto completa">
              <img class="foto-thumb-img" alt="foto del movimiento" src="${blobUrl}"/>
            </a>`;
        }
      }).catch((err) => {
        if (slot) { slot.title = "No se pudo cargar: " + err.message; slot.innerHTML = window.iconoSvg("alerta"); }
      });
    } : null,
  });
}

// ---- GUARDAR / ACTUALIZAR MOVIMIENTO ----

// Sube fotos pendientes a Drive (si hay conexión) y arma el valor final del campo "recibo".
// reciboExistente: lo que ya tenía el movimiento (para conservarlo al editar).
// Devuelve { recibo, mediaPendiente }:
//   - recibo: string con los links nuevos (+ existentes) si se subieron ya, o null si no hay que tocar el recibo todavía.
//   - mediaPendiente: si no hay conexión, las fotos quedan acá (dataURL tal cual, sin perderlas) para que
//     sync.js las suba de verdad y complete el recibo apenas vuelva la conexión (ver ejecutarOperacion en sync.js).
async function resolverReciboConNuevasFotos(fotos, fecha, concepto, caja, reciboExistente = "") {
  if (fotos.length === 0) return { recibo: null, mediaPendiente: null };

  if (!navigator.onLine) {
    const slug = `${fecha}-${String(concepto).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_")}-${String(caja).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_")}`;
    const mediaPendiente = {
      fotos: fotos.map(f => ({ data: f.data, type: f.type })),
      slug
    };
    SyncManager.mostrarToast("💾 Sin conexión — la foto se guardó localmente y se subirá al reconectar", "warn");
    return { recibo: reciboExistente || null, mediaPendiente };
  }

  try {
    const nuevos = await subirFotosADrive(fotos, fecha, concepto, caja);
    return { recibo: reciboExistente ? `${reciboExistente},${nuevos}` : nuevos, mediaPendiente: null };
  } catch (err) {
    if (err.message === "DRIVE_SIN_PERMISO") {
      alert("Necesitas volver a iniciar sesión para subir archivos a Drive (se agregó un permiso nuevo). Cierra sesión y entra de nuevo — el movimiento se guardará sin la foto por ahora.");
    } else if (err.message === "DRIVE_SIN_PERMISO_PUBLICO") {
      alert("La foto se subió a Drive, pero Google no dejó hacerla visible con el link (puede ser una restricción de tu cuenta/organización). El movimiento se guardará sin la foto por ahora.");
    } else {
      alert("No se pudo subir la foto a Drive — el movimiento se guardará sin la foto nueva.");
    }
    return { recibo: null, mediaPendiente: null };
  }
}

// Guarda un movimiento nuevo o editado. "d" viene ya validado de la ventana de React; si algo falla,
// lanza (la ventana avisa y se queda abierta).
//   d = { fecha, categoria, descripcion, concepto, caja, monto, origen, destino, montoTransf, tipoCambio, fotos }
async function guardarMovimientoDatos(d, editId) {
  const { fecha, categoria, descripcion, fotos } = d;

  if (editId) {
    const { concepto, caja, monto } = d;
    const movActual = movimientos.find(x => x.id === editId);
    const { recibo, mediaPendiente } = await resolverReciboConNuevasFotos(fotos, fecha, concepto, caja, movActual?.recibo || "");
    await Sheets.editarMovimiento(editId, fecha, concepto, categoria, caja, monto, descripcion, recibo, mediaPendiente);

    if (!navigator.onLine) {
      const idx = movimientos.findIndex(m => m.id === editId);
      if (idx !== -1) {
        movimientos[idx] = {
          ...movimientos[idx], fecha, concepto, categoria, caja, monto, descripcion,
          ...(recibo !== null ? { recibo } : {})
        };
        localStorage.setItem("cache_movimientos", JSON.stringify(movimientos));
        renderMovimientos();
      }
    } else {
      await cargarTodo();
    }
    return;
  }

  let recibo = "";
  let mediaPendiente = null;
  if (fotos.length > 0) {
    const fotoConc = categoria === "Transferencia" ? `Transferencia-${d.origen}` : d.concepto;
    const fotoCaja = categoria === "Transferencia" ? d.origen : d.caja;
    const resultado = await resolverReciboConNuevasFotos(fotos, fecha, fotoConc, fotoCaja);
    recibo = resultado.recibo || "";
    mediaPendiente = resultado.mediaPendiente;
  }

  if (categoria === "Transferencia") {
    const { origen, destino, montoTransf: monto, tipoCambio } = d;
    const cajaOrigen  = cajas.find(c => c.nombre === origen);
    const cajaDestino = cajas.find(c => c.nombre === destino);
    const monedasDiferentes = cajaOrigen && cajaDestino && cajaOrigen.moneda !== cajaDestino.moneda;

    const montoDestino = monedasDiferentes ? monto * tipoCambio : monto;
    const descOrigen   = monedasDiferentes
      ? `TC: 1 ${cajaOrigen.moneda} = ${tipoCambio} ${cajaDestino.moneda}${descripcion ? " — " + descripcion : ""}`
      : descripcion;

    await Sheets.agregarMovimiento(
      currentUser.email, fecha,
      `Transferencia → ${destino}`,
      "Transferencia", origen, monto, descOrigen, recibo, mediaPendiente
    );
    await Sheets.agregarMovimientoIngreso(
      currentUser.email, fecha,
      `Transferencia ← ${origen}`,
      "Transferencia", destino, montoDestino, descOrigen
    );
  } else {
    const { concepto, caja, monto } = d;
    // Si es gasto variable y el concepto no está en la lista, guardar "Otros" y mover a descripción
    if (categoria === "Gasto variable" && !GASTOS_VARIABLES.includes(concepto)) {
      const descripcionFinal = descripcion ? concepto + " — " + descripcion : concepto;
      await Sheets.agregarMovimiento(currentUser.email, fecha, "Otros", categoria, caja, monto, descripcionFinal, recibo, mediaPendiente);
    } else {
      await Sheets.agregarMovimiento(currentUser.email, fecha, concepto, categoria, caja, monto, descripcion, recibo, mediaPendiente);
    }

    if (!navigator.onLine) {
      const nuevoMov = {
        id: "M_local_" + Date.now(),
        fecha, autor: currentUser.email, concepto, categoria, caja, monto, descripcion, recibo
      };
      movimientos.push(nuevoMov);
      localStorage.setItem("cache_movimientos", JSON.stringify(movimientos));
    }
  }

  if (!navigator.onLine) {
    renderMovimientos();
    renderCajas();
  } else {
    await cargarTodo();
  }
}

// ---- EDITAR MOVIMIENTO ---- (la ventana es React; ofrece siempre el selector de categoría completo)
function abrirEditarMovimiento(id) {
  if (!movimientos.find(x => x.id === id)) return;
  document.dispatchEvent(new CustomEvent("movimiento:abrir", { detail: { modo: "editar", id } }));
}

// Una foto o audio ya guardado en Drive: el enlace + si es audio (para mostrarlo bien).
async function cargarMediaDrive(url) {
  const fileId = Sheets.idDesdeUrlDrive(url);
  const [blobUrl, esAudio] = await Promise.all([Sheets.obtenerBlobUrlDrive(fileId), _esArchivoDeAudioDrive(fileId)]);
  return { blobUrl, esAudio };
}

// Abre una foto adjunta en pestaña nueva (descarga autenticada, no el link directo de Drive)
async function abrirFotoMovimiento(url) {
  const nuevaPestana = window.open("", "_blank");
  try {
    const blobUrl = await Sheets.obtenerBlobUrlDrive(Sheets.idDesdeUrlDrive(url));
    if (nuevaPestana) nuevaPestana.location.href = blobUrl;
  } catch (err) {
    if (nuevaPestana) nuevaPestana.close();
    alert("No se pudo cargar la foto: " + err.message);
  }
}

// El link de Drive no dice por sí solo si es foto o audio -- se consulta
// el mimeType real del archivo (metadata liviana, sin bajar el contenido).
async function _esArchivoDeAudioDrive(fileId) {
  if (!fileId) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType`, {
      headers: { Authorization: `Bearer ${Sheets.token}` }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return (data.mimeType || "").startsWith("audio/");
  } catch { return false; }
}

// ---- BORRAR MOVIMIENTO ----

// Encuentra la otra pata de una transferencia (egreso <-> ingreso)
function encontrarParTransferencia(m) {
  if (!m || m.categoria !== "Transferencia") return null;

  let candidatos;
  if (m.concepto.startsWith("Transferencia → ")) {
    const destino = m.concepto.slice("Transferencia → ".length);
    candidatos = movimientos.filter(x =>
      x.id !== m.id && x.categoria === "Transferencia" &&
      x.caja === destino && x.concepto === `Transferencia ← ${m.caja}`
    );
  } else if (m.concepto.startsWith("Transferencia ← ")) {
    const origen = m.concepto.slice("Transferencia ← ".length);
    candidatos = movimientos.filter(x =>
      x.id !== m.id && x.categoria === "Transferencia" &&
      x.caja === origen && x.concepto === `Transferencia → ${m.caja}`
    );
  } else {
    return null;
  }

  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0];

  // Varias transferencias iguales el mismo día: desempatar por el id más cercano
  // (ambas patas se crean con pocos milisegundos de diferencia)
  const idNum = parseInt(String(m.id).replace(/\D/g, ""), 10);
  candidatos.sort((a, b) =>
    Math.abs(parseInt(String(a.id).replace(/\D/g, ""), 10) - idNum) -
    Math.abs(parseInt(String(b.id).replace(/\D/g, ""), 10) - idNum)
  );
  return candidatos[0];
}

async function borrarMovimiento(id) {
  const m   = movimientos.find(x => x.id === id);
  const par = encontrarParTransferencia(m);

  const mensaje = par
    ? "¿Seguro que quieres borrar esta transferencia? Se eliminarán el egreso y el ingreso."
    : "¿Seguro que quieres borrar este movimiento?";
  if (!confirm(mensaje)) return;

  const idsABorrar = par ? [id, par.id] : [id];

  try {
    for (const idBorrar of idsABorrar) {
      await Sheets.borrarMovimiento(idBorrar);
    }

    if (!navigator.onLine) {
      movimientos = movimientos.filter(x => !idsABorrar.includes(x.id));
      localStorage.setItem("cache_movimientos", JSON.stringify(movimientos));
      renderMovimientos();
      renderCajas();
    } else {
      await cargarTodo();
    }
  } catch (err) {
    alert("Error borrando: " + err.message);
  }
}

// ---- HELPERS ----

// Una caja sin usuarios_permitidos configurados (columna F en Cajas, ver
// sheets.js) es visible para todos -- la restricción solo aplica a las que
// sí tienen algo ahí. Se usa en Acciones rápidas y en el campo "Caja" de
// Ingreso/Gasto en "Nuevo movimiento" (ver Movimiento.jsx) --
// NO en Origen/Destino de Transferencia, que a propósito sigue mostrando
// todas (pedido explícito: una transferencia puede mover plata hacia/desde
// una caja que uno no "maneja" a diario).
function cajaVisibleParaUsuario(caja, email) {
  return caja.usuariosPermitidos.length === 0 || caja.usuariosPermitidos.includes(email);
}


// Completa sola la columna "usuarios_permitidos" (F) de las cajas que
// todavía no la tengan, identificando el grupo por si su nombre contiene
// "luni" o "choco" (ver USUARIOS_PERMITIDOS_POR_NOMBRE). Una caja que no
// matchea ninguno de los dos, o que ya tiene algo escrito ahí (así sea
// distinto), se deja tal cual -- esto es solo para arrancar la columna la
// primera vez, no para pisar lo que alguien ya haya configurado a mano.
async function verificarYCompletarUsuariosPermitidosCajas() {
  for (const caja of cajas) {
    if (caja.usuariosPermitidos.length > 0) continue;
    const nombreMin = caja.nombre.toLowerCase();
    const grupo = nombreMin.includes("luni") ? "luni" : nombreMin.includes("choco") ? "choco" : null;
    if (!grupo) continue;
    const usuarios = USUARIOS_PERMITIDOS_POR_NOMBRE[grupo];
    try {
      await Sheets.actualizarUsuariosPermitidosCaja(caja.id, usuarios);
      caja.usuariosPermitidos = usuarios;
    } catch (err) {
      console.error(`Error completando usuarios permitidos de "${caja.nombre}":`, err);
    }
  }
}


// ---- SELECTOR DE CAJA CON COLOR (reemplazo visual del <select> nativo) ----



function poblarFiltrosCajas() {
  // categorias son fijas, nada que poblar dinámicamente
}

function formatMonto(n, moneda = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: moneda,
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(n);
}

// Escapa texto de usuario antes de insertarlo en innerHTML — sin esto,
// un concepto/descripción/caja/nota con HTML (ej. "<img onerror=...>")
// se ejecuta como código en la sesión de cualquiera que lo vea, con
// acceso a su token de Google guardado en localStorage.
function escapeHtml(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}



// =============================================
// MÓDULO PROYECCIÓN
// =============================================

let presupuesto = [];

// ---- CARGA PRESUPUESTO ----

async function cargarPresupuesto() {
  try {
    presupuesto = await Sheets.getPresupuesto();
    renderProyeccion();
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    console.error("Error cargando presupuesto:", err);
  }
}

async function cargarProyeccion() {
  try {
    const data = await Sheets.getProyeccion();
    // Persistir en localStorage como caché offline
    localStorage.setItem("cache_proyeccion", JSON.stringify(data));

    if (data.meses && data.meses.length > 0) {
      mesesProyeccion = data.meses;
      localStorage.setItem("proy_meses_list", JSON.stringify(data.meses));
    }
    if (Object.keys(data.ingresos).length > 0) {
      localStorage.setItem("ingresos_por_mes", JSON.stringify(data.ingresos));
    }
    if (Object.keys(data.gastos).length > 0) {
      localStorage.setItem("gastos_por_mes", JSON.stringify(data.gastos));
    }
    renderProyeccion();
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    console.error("Error cargando proyeccion:", err);
    // Usar caché localStorage como fallback
    const cached = localStorage.getItem("cache_proyeccion");
    if (cached) {
      try {
        const data = JSON.parse(cached);
        if (data.meses?.length > 0) { mesesProyeccion = data.meses; }
      } catch {}
    }
  }
}

async function guardarTodaProyeccion() {
  try {
    const meses    = getMesesProyeccion();
    const ingresos = JSON.parse(localStorage.getItem("ingresos_por_mes") || "{}");
    const gastos   = JSON.parse(localStorage.getItem("gastos_por_mes")   || "{}");
    await Sheets.guardarProyeccion(meses, ingresos, gastos);
    // Actualizar caché
    localStorage.setItem("cache_proyeccion", JSON.stringify({ meses, ingresos, gastos }));
  } catch (err) {
    if (err.message !== "TOKEN_EXPIRADO") console.error("Error guardando proyeccion:", err);
  }
}

// ---- INGRESOS POR MES (localStorage) ----
// Estructura: { "2025-06": { SURA: 3000000, MEDFAN: 1500000, ... }, ... }
function getIngresosMes(mes) {
  try {
    const raw = localStorage.getItem("ingresos_por_mes");
    const data = raw ? JSON.parse(raw) : {};
    return _sinArchivados(data[mes]) || {};
  } catch { return {}; }
}

function setIngresosMes(mes, fuentes) {
  try {
    const raw = localStorage.getItem("ingresos_por_mes");
    const data = raw ? JSON.parse(raw) : {};
    data[mes] = fuentes;
    localStorage.setItem("ingresos_por_mes", JSON.stringify(data));
  } catch {}
  guardarTodaProyeccion();
}

// Usa la misma resolución que el editor/tabla (propio mes → mes anterior
// como referencia) para que el bloque de resumen del mes coincida con lo
// que la tabla ya está mostrando, en vez de mostrar 0 hasta que el usuario
// toque algo.
function totalIngresosMes(mes) {
  const fuentes = getIngresosMesParaEditor(mes);
  return Object.values(fuentes).reduce((s, v) => s + (parseFloat(v) || 0), 0);
}

// ---- GASTOS POR MES (localStorage) ----
// Estructura: { "2026-06": { "Alquiler": 1500000, "Netflix": 55000, ... } }
function getGastosMes(mes) {
  try {
    const raw = localStorage.getItem("gastos_por_mes");
    const data = raw ? JSON.parse(raw) : {};
    return _sinArchivados(data[mes]) || null; // null = usar presupuesto global
  } catch { return null; }
}

function setGastosMes(mes, gastos) {
  try {
    const raw = localStorage.getItem("gastos_por_mes");
    const data = raw ? JSON.parse(raw) : {};
    data[mes] = gastos;
    localStorage.setItem("gastos_por_mes", JSON.stringify(data));
  } catch {}
  guardarTodaProyeccion();
}

function totalGastosMes(mes) {
  const gastos = getGastosMesParaEditor(mes);
  return Object.values(gastos).reduce((s, v) => s + (parseFloat(v) || 0), 0);
}

function getMesAnterior(mes) {
  const [y, m] = mes.split("-").map(Number);
  const prev = new Date(y, m - 2, 1);
  return prev.toISOString().slice(0, 7);
}

// Devuelve gastos para el editor: propia config del mes, luego mes anterior, luego global
function getGastosMesParaEditor(mes) {
  const propio = getGastosMes(mes);
  if (propio) return propio;
  const anterior = getGastosMes(getMesAnterior(mes));
  if (anterior) return anterior;
  // Fallback: presupuesto global
  const result = {};
  presupuesto.filter(p => p.montoEstimado > 0 && !p.archivado).forEach(p => { result[p.concepto] = p.montoEstimado; });
  return result;
}

// Devuelve ingresos para el editor: propio mes, luego mes anterior
function getIngresosMesParaEditor(mes) {
  const propio = getIngresosMes(mes);
  if (Object.keys(propio).length > 0) return propio;
  const anterior = getIngresosMes(getMesAnterior(mes));
  if (Object.keys(anterior).length > 0) return anterior;
  return {};
}

// ---- MESES DINÁMICOS DE PROYECCIÓN ----
let mesesProyeccion = null;

// OJO: getMesesProyeccion() se llama también desde renderProyeccion() (parte
// del camino de solo-lectura de la carga inicial), y puede correr ANTES de
// que cargarProyeccion() haya traído los meses reales desde Sheets — sobre
// todo en un dispositivo nuevo o con caché borrada, donde "proy_meses_list"
// todavía no existe en localStorage. Por eso los ajustes automáticos de acá
// (generar meses por defecto, recortar meses pasados) solo persisten en
// localStorage y NUNCA disparan una escritura a la red: hacerlo podía
// sobreescribir la Proyeccion real del usuario con meses por defecto justo
// antes de que la lectura real llegara. El guardado en red (saveMesesProyeccion)
// queda reservado para cuando el usuario agrega/quita un mes a propósito.
function getMesesProyeccion() {
  if (!mesesProyeccion) {
    try {
      const raw = localStorage.getItem("proy_meses_list");
      mesesProyeccion = raw ? JSON.parse(raw) : null;
    } catch {}
  }
  if (!mesesProyeccion || mesesProyeccion.length === 0) {
    const hoy = new Date();
    mesesProyeccion = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      mesesProyeccion.push(d.toISOString().slice(0, 7));
    }
    guardarMesesProyeccionLocal();
  }
  // Eliminar meses anteriores al mes actual
  const mesActual = new Date().toISOString().slice(0, 7);
  const sinPasados = mesesProyeccion.filter(m => m >= mesActual);
  if (sinPasados.length !== mesesProyeccion.length) {
    mesesProyeccion = sinPasados;
    guardarMesesProyeccionLocal();
  }
  return mesesProyeccion;
}

function guardarMesesProyeccionLocal() {
  try { localStorage.setItem("proy_meses_list", JSON.stringify(mesesProyeccion)); } catch {}
}

function saveMesesProyeccion() {
  guardarMesesProyeccionLocal();
  guardarTodaProyeccion();
}

function getMesesFaltantes() {
  const meses = getMesesProyeccion();
  if (meses.length === 0) return [];
  const hoy  = new Date();
  const hoyStr = hoy.toISOString().slice(0, 7);
  const ultimo = meses[meses.length - 1];
  const faltantes = [];
  let cy = hoy.getFullYear(), cm = hoy.getMonth() + 1;
  const [ly, lm] = ultimo.split("-").map(Number);
  while (cy < ly || (cy === ly && cm < lm)) {
    const mesStr = `${cy}-${String(cm).padStart(2, "0")}`;
    if (!meses.includes(mesStr)) faltantes.push(mesStr);
    cm++; if (cm > 12) { cm = 1; cy++; }
  }
  return faltantes;
}

function agregarMesProyeccion() {
  const meses    = getMesesProyeccion();
  const ultimo   = meses[meses.length - 1];
  const [y, m]   = ultimo.split("-").map(Number);
  const nextStr  = new Date(y, m, 1).toISOString().slice(0, 7);
  const faltantes = getMesesFaltantes();

  if (faltantes.length === 0) {
    // Sin huecos: agregar directamente el siguiente
    if (!meses.includes(nextStr)) {
      mesesProyeccion = [...meses, nextStr];
      saveMesesProyeccion();
    }
    render4MesesResumen();
    return;
  }

  // Hay huecos: se elige cuál agregar (ventana React, ver react/src/conceptos/Conceptos.jsx).
  document.dispatchEvent(new CustomEvent("conceptos:abrir", { detail: { t: "agregarMes", faltantes, ultimo, siguiente: nextStr } }));
}

// Agrega ese mes a la proyección (lo llama la ventana de "¿Qué mes agregar?").
function elegirMesProyeccion(mesAdd) {
  const meses = getMesesProyeccion();
  if (!meses.includes(mesAdd)) {
    mesesProyeccion = [...meses, mesAdd].sort();
    saveMesesProyeccion();
  }
  render4MesesResumen();
}

function eliminarMesProyeccion(mes) {
  const meses = getMesesProyeccion();
  if (meses.length <= 1) return;
  const label = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  if (!confirm(`¿Quitar ${label} de la proyección?`)) return;
  mesesProyeccion = meses.filter(m => m !== mes);
  saveMesesProyeccion();
  render4MesesResumen();
  renderTablaComparacion(movimientos.filter(m => m.fecha.startsWith(proyMesActivo)));
  renderIngresosMesPanel(proyMesActivo);
}

// compat: usado en otras secciones (resumen, metas)
function obtener4Meses() {
  return getMesesProyeccion();
}

// mes activo en proyección
let proyMesActivo = new Date().toISOString().slice(0, 7);

// ---- RENDER PROYECCIÓN ----
// Mantiene GASTOS_FIJOS/GASTOS_VARIABLES sincronizados con los conceptos
// guardados en el presupuesto (hoja "Presupuesto"). Las mutamos en el lugar
// (push/splice, sin reasignar) para que un concepto nuevo — o uno borrado —
// aparezca o desaparezca automáticamente en TODOS los lugares que usan estas
// dos constantes: el modal de nuevo movimiento, los filtros, el presupuesto
// mensual, la configuración de mes, los KPIs de resumen, etc.
function sincronizarListasConceptos() {
  presupuesto.forEach(p => {
    if (!p.concepto) return;
    // Un concepto archivado no se ofrece en ninguna lista. Se quita también de las
    // listas de fábrica (Internet, Gas...), que se reconstruyen en cada carga.
    if (p.archivado) {
      for (const lista of [GASTOS_FIJOS, GASTOS_VARIABLES, FUENTES_INGRESO]) {
        const i = lista.indexOf(p.concepto);
        if (i !== -1) lista.splice(i, 1);
      }
      return;
    }
    if (p.categoria === "Gasto fijo" && !GASTOS_FIJOS.includes(p.concepto)) {
      GASTOS_FIJOS.push(p.concepto);
    } else if (p.categoria === "Gasto variable" && !GASTOS_VARIABLES.includes(p.concepto)) {
      GASTOS_VARIABLES.push(p.concepto);
    } else if (p.categoria === "Ingreso" && !FUENTES_INGRESO.includes(p.concepto)) {
      FUENTES_INGRESO.push(p.concepto);
    }
    if (p.icono) ICONOS[p.concepto] = p.icono;
  });
}

// ---- CONCEPTOS ARCHIVADOS ----
// Archivar un concepto duplicado ("Internet hogar" teniendo "Internet") lo saca de
// TODO: listas para registrar, Configurar mes, tabla de Proyección y totales. Su
// historial de movimientos no se toca, y se puede restaurar. Se guarda en la hoja
// Presupuesto (columna F), así que vale en todos los dispositivos.
let _archivadosSet = null;
let _archivadosDe = null;
function _conceptosArchivados() {
  if (_archivadosDe !== presupuesto) {
    _archivadosDe = presupuesto;
    _archivadosSet = new Set(presupuesto.filter(p => p.archivado).map(p => p.concepto));
  }
  return _archivadosSet;
}
function conceptoArchivado(nombre) {
  return _conceptosArchivados().has((nombre || "").trim());
}
// Quita de un mapa {concepto: monto} los conceptos archivados (sin tocar el guardado).
function _sinArchivados(mapa) {
  if (!mapa) return mapa;
  const arch = _conceptosArchivados();
  if (arch.size === 0) return mapa;
  const limpio = {};
  Object.keys(mapa).forEach(k => { if (!arch.has(k)) limpio[k] = mapa[k]; });
  return limpio;
}

function _normalizarNombreConcepto(n) {
  return (n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function _distanciaEdicion(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = temp;
    }
  }
  return fila[b.length];
}

// Conceptos existentes que se parecen al nombre que se está escribiendo:
// uno contiene al otro ("Internet" / "Internet hogar"), comparten alguna palabra
// o difieren en pocas letras ("Emcali" / "Emcal"). No incluye el idéntico
// (eso ya lo avisa conceptoYaExiste).
function conceptosParecidos(nombre) {
  const n = _normalizarNombreConcepto(nombre);
  if (n.length < 3) return [];
  const palabras = n.split(" ").filter(w => w.length >= 4);
  return [...GASTOS_FIJOS, ...GASTOS_VARIABLES, ...FUENTES_INGRESO].filter(c => {
    const cn = _normalizarNombreConcepto(c);
    if (cn === n) return false;
    if (cn.includes(n) || n.includes(cn)) return true;
    if (palabras.some(w => cn.split(" ").includes(w))) return true;
    const largo = Math.max(cn.length, n.length);
    return largo >= 5 && _distanciaEdicion(cn, n) / largo <= 0.25;
  });
}

function conceptoYaExiste(nombre) {
  const n = (nombre || "").trim().toLowerCase();
  if (!n) return false;
  return GASTOS_FIJOS.some(c => c.toLowerCase() === n) ||
    GASTOS_VARIABLES.some(c => c.toLowerCase() === n) ||
    FUENTES_INGRESO.some(c => c.toLowerCase() === n);
}

function renderProyeccion() {
  sincronizarListasConceptos();
  const mes = proyMesActivo;
  document.getElementById("proyeccion-mes").value = mes;

  const label = document.getElementById("proy-detalle-mes-label");
  if (label) {
    const mesLabel = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    label.textContent = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
  }

  const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mes));
  renderTablaComparacion(movsDelMes);
  render4MesesResumen();
  renderProyBarra();
}

// ---- PANEL DE INGRESOS POR MES (obsoleto, conservado por compatibilidad) ----
function renderIngresosMesPanel(mes) {
  let panel = document.getElementById("proy-ingresos-mes-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "proy-ingresos-mes-panel";
    panel.className = "proy-ingresos-panel";
    const ref = document.querySelector(".proy-resumen-grid");
    if (ref) ref.parentNode.insertBefore(panel, ref.nextSibling);
  }

  const mesLabel = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const fuentes = getIngresosMes(mes);
  const FUENTES = FUENTES_INGRESO;

  panel.innerHTML = `
    <div class="proy-ingresos-header">
      <span class="proy-dashboard-title">💰 Ingresos de ${mesLabel}</span>
      <button class="btn-sm btn-secondary" id="btn-toggle-ingresos-mes">
        ${Object.keys(fuentes).some(k => fuentes[k] > 0) ? "✏️ Editar" : "+ Configurar"}
      </button>
    </div>
    <div id="proy-ingresos-mes-form" class="proy-ingresos-form hidden">
      ${FUENTES.map(f => `
        <div class="pres-fila">
          <span class="pres-concepto">💰 ${f}</span>
          <input class="input pres-input" type="number" placeholder="0"
            data-fuente="${f}" value="${fuentes[f] || ""}"/>
        </div>`).join("")}
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn-primary btn-sm" id="btn-guardar-ingresos-mes">Guardar</button>
        <button class="btn-secondary btn-sm" id="btn-cancelar-ingresos-mes">Cancelar</button>
      </div>
    </div>
    <div id="proy-ingresos-mes-display" class="proy-ingresos-display">
      ${FUENTES.filter(f => fuentes[f] > 0).map(f =>
        `<div class="proy-ingreso-chip">
          <span>${f}</span>
          <strong>${formatMonto(fuentes[f])}</strong>
        </div>`
      ).join("") || `<span class="empty-hint">Sin ingresos configurados para este mes. Se usa el presupuesto global.</span>`}
    </div>`;

  document.getElementById("btn-toggle-ingresos-mes").addEventListener("click", () => {
    document.getElementById("proy-ingresos-mes-form").classList.toggle("hidden");
    document.getElementById("proy-ingresos-mes-display").classList.toggle("hidden");
  });
  document.getElementById("btn-guardar-ingresos-mes")?.addEventListener("click", () => {
    const inputs = panel.querySelectorAll(".pres-input[data-fuente]");
    const nuevasFuentes = {};
    inputs.forEach(inp => {
      const v = parseFloat(inp.value);
      if (v > 0) nuevasFuentes[inp.dataset.fuente] = v;
    });
    setIngresosMes(mes, nuevasFuentes);
    renderProyeccion();
    SyncManager.mostrarToast("✅ Ingresos de " + new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long" }) + " guardados");
  });
  document.getElementById("btn-cancelar-ingresos-mes")?.addEventListener("click", () => {
    document.getElementById("proy-ingresos-mes-form").classList.add("hidden");
    document.getElementById("proy-ingresos-mes-display").classList.remove("hidden");
  });
}

// ---- RESUMEN MESES DINÁMICO ----
// Tarjetas de meses: se dibujan con React (react/src/proyeccion/MesesProyeccion.jsx),
// iguales a las de Cajas y en una fila que se desliza. Acá solo se arma lo que
// muestra cada una y se le pasan las acciones de siempre.
function render4MesesResumen() {
  if (!window.MesesProyeccionReact) return;
  const meses = getMesesProyeccion();

  const bajarATabla = () =>
    document.querySelector(".card-section:has(#proy-tabla-body)")?.scrollIntoView({ behavior: "smooth", block: "start" });

  window.MesesProyeccionReact.render({
    meses: meses.map(mes => {
      const ingresos = totalIngresosMes(mes) || presupuesto.filter(p => p.ingresoEstimado > 0 && !p.archivado).reduce((s, p) => s + p.ingresoEstimado, 0);
      const gastos = totalGastosMes(mes);
      const mesCorto = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "short" }).replace(".", "");
      return {
        mes,
        label: `${mesCorto.charAt(0).toUpperCase()}${mesCorto.slice(1)} ${mes.slice(2, 4)}`,
        ingresos, gastos, excedente: ingresos - gastos,
        activo: mes === proyMesActivo,
      };
    }),
    puedeQuitar: meses.length > 1,
    formatMonto,
    // Un toque activa ese mes de una vez y baja a la tabla -- sin depender de
    // doble clic/temporizadores, que fallaban si una sincronización de fondo
    // volvía a dibujar las tarjetas justo entre el primer y el segundo toque.
    onSeleccionar: (mes) => { proyMesActivo = mes; renderProyeccion(); bajarATabla(); },
    // Configurar mes (⚙️ o Editar al mantener presionado): activa ese mes y
    // abre su configuración.
    onConfigurar: (mes) => { proyMesActivo = mes; renderProyeccion(); abrirConfigMes(mes); bajarATabla(); },
    onQuitar: eliminarMesProyeccion,
  });
}

// ---- CONFIG DE MES / MODIFICAR CONCEPTO ----
// Las ventanas son React (react/src/conceptos/Conceptos.jsx); acá quedan los datos.

// Configurar mes: lista TODOS los conceptos (ingresos, gastos fijos y gastos variables). Los que el
// mes no tiene (ni el anterior de referencia) quedan en 0 y van al final de su grupo; al guardar solo
// se conservan los que tengan un valor mayor que 0, que son los que muestra la tabla.
function abrirConfigMes(mes) {
  document.dispatchEvent(new CustomEvent("conceptos:abrir", { detail: { t: "config", mes } }));
}

function datosConfigMes(mes) {
  const hayDatosMesAnterior = Object.keys(getGastosMes(getMesAnterior(mes)) || {}).length > 0
    || Object.keys(getIngresosMes(getMesAnterior(mes))).length > 0;
  return {
    fuentes: getIngresosMesParaEditor(mes),
    gastos: getGastosMesParaEditor(mes),
    ingresos: FUENTES_INGRESO, fijos: GASTOS_FIJOS, variables: GASTOS_VARIABLES,
    hayDatosMesAnterior,
    esValorReferencial: !getGastosMes(mes) && !Object.keys(getIngresosMes(mes)).length,
    mesPrevLabel: new Date(getMesAnterior(mes) + "-15").toLocaleDateString("es-CO", { month: "long" }),
  };
}

function guardarConfigMesDatos(mes, nuevosIngresos, nuevosGastos) {
  setIngresosMes(mes, nuevosIngresos);
  setGastosMes(mes, Object.keys(nuevosGastos).length ? nuevosGastos : null);
  renderProyeccion();
  SyncManager.mostrarToast("✅ Proyección de " + new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long" }) + " guardada");
}

// Editar el estimado de un solo concepto (gasto o ingreso) del mes activo.
function abrirModificarConcepto(concepto, categoria) {
  document.dispatchEvent(new CustomEvent("conceptos:abrir", { detail: { t: "modificar", concepto, categoria } }));
}

function valorEstimadoConcepto(concepto, categoria) {
  const datos = categoria === "Ingreso" ? getIngresosMesParaEditor(proyMesActivo) : getGastosMesParaEditor(proyMesActivo);
  return datos[concepto] || 0;
}

function guardarModificarConceptoDatos(concepto, categoria, nuevoValor) {
  const mes = proyMesActivo;
  const esIngreso = categoria === "Ingreso";
  const datosActuales = esIngreso ? getIngresosMesParaEditor(mes) : getGastosMesParaEditor(mes);
  const nuevosDatos = { ...datosActuales };
  if (nuevoValor > 0) nuevosDatos[concepto] = nuevoValor;
  else delete nuevosDatos[concepto];

  if (esIngreso) {
    setIngresosMes(mes, nuevosDatos);
  } else {
    setGastosMes(mes, Object.keys(nuevosDatos).length ? nuevosDatos : null);
  }
  renderProyeccion();
  SyncManager.mostrarToast(`✅ ${concepto} actualizado`);
}

// ---- TABLA COMPARACIÓN ----

function renderTablaComparacion(movsDelMes) {
  const tbody = document.getElementById("proy-tabla-body");
  if (!tbody) return;

  // Se acumula con signo (ingreso resta, gasto suma) para poder mezclar
  // ambos correctamente en la fila "Otros" más abajo. Para las filas de un
  // solo concepto (que en la práctica son siempre de una sola categoría)
  // se usa el valor absoluto al armar cada fila, así que no cambian.
  const realesPorConcepto = {};
  movsDelMes
    .filter(m => m.categoria !== "Transferencia")
    .forEach(m => {
      const signo = m.categoria === "Ingreso" ? 1 : -1;
      realesPorConcepto[m.concepto] = (realesPorConcepto[m.concepto] || 0) + signo * Math.abs(m.monto);
    });

  // Mes propio → mes anterior como referencia → presupuesto global. Misma
  // resolución que usa el editor y el bloque de resumen del mes, para que
  // tabla y resumen siempre muestren el mismo estimado.
  const gastosMes = getGastosMesParaEditor(proyMesActivo);
  const todasCat  = [
    ...GASTOS_FIJOS.map(c => ({ categoria: "Gasto fijo", concepto: c })),
    ...GASTOS_VARIABLES.map(c => ({ categoria: "Gasto variable", concepto: c })),
  ];

  const filas = Object.entries(gastosMes)
    .filter(([, v]) => v > 0)
    .map(([concepto, estimado]) => {
      const cat = todasCat.find(c => c.concepto === concepto);
      return { categoria: cat ? cat.categoria : "Gasto variable", concepto, estimado, real: Math.abs(realesPorConcepto[concepto] || 0) };
    });

  // Ingresos estimados del mes (fuentes) — van primero en la tabla. Solo se
  // muestran los que tienen algún valor (estimado > 0 o algo real); los que
  // están en 0 se ven y se editan en Configurar mes.
  const ingresosMes = getIngresosMesParaEditor(proyMesActivo);
  FUENTES_INGRESO.forEach(fuente => {
    if (!(ingresosMes[fuente] > 0) && !realesPorConcepto[fuente]) return;
    filas.push({
      categoria: "Ingreso", concepto: fuente,
      estimado: ingresosMes[fuente] || 0,
      real: Math.abs(realesPorConcepto[fuente] || 0)
    });
  });

  // "Ajuste" (ver ajustarCaja): movimiento automático que nivela una caja
  // con saldo negativo -- se guarda con categoría real "Ingreso" en la
  // hoja (Sheets.agregarMovimientoIngreso), pero acá se agrupa como Gasto
  // variable a propósito: pedido explícito de que viva al final de esa
  // sección, no mezclado entre las fuentes de Ingreso. Nunca tiene
  // estimado (no es algo que se presupueste). Fila siempre presente
  // (mismo criterio que las 4 fuentes de arriba). Empujada ANTES del
  // bloque de "Otros" de abajo a propósito: ese bloque solo suma a
  // "Otros" lo que no encuentra ya en "filas", así que esta fila lo
  // excluye de ahí sola.
  filas.push({
    categoria: "Gasto variable", concepto: "Ajuste",
    estimado: 0,
    real: Math.abs(realesPorConcepto["Ajuste"] || 0)
  });

  // Movimientos reales cuyo concepto no está en la lista de este mes se
  // suman al concepto "Otros" de categoría Gasto variable — SIEMPRE una
  // sola fila. realesPorConcepto usa la convención ingreso=+/gasto=-, así
  // que para mostrarlo como un "gasto neto" (positivo = se gastó de más,
  // negativo = en realidad entró más plata de la que salió) hay que
  // invertir el signo — igual que Math.abs() hace para las filas de un
  // solo concepto, pero sin perder la resta cuando hay ingresos mezclados.
  let otrosInterno = 0;
  Object.entries(realesPorConcepto).forEach(([concepto, real]) => {
    if (!filas.find(f => f.concepto === concepto)) otrosInterno += real;
  });
  const filaOtros = filas.find(f => f.concepto === "Otros");
  if (filaOtros) {
    otrosInterno += (realesPorConcepto["Otros"] || 0);
  }
  const otrosGastoNeto = -otrosInterno;
  if (filaOtros) {
    filaOtros.categoria = "Gasto variable";
    filaOtros.real = otrosGastoNeto;
    filaOtros.esOtros = true;
  } else if (otrosGastoNeto !== 0) {
    filas.push({ categoria: "Gasto variable", concepto: "Otros", estimado: 0, real: otrosGastoNeto, esOtros: true });
  }

  if (filas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-light)">
      No hay datos — agrega un presupuesto para ver la comparación.</td></tr>`;
    return;
  }

  // Se agrupa primero por categoría (Ingresos / Fijos / Variables) -- antes
  // el "tiene estimado" pesaba más que la categoría en el orden, así que un
  // gasto fijo sin presupuesto ese mes se mezclaba entre los variables.
  // Dentro de cada grupo, los que sí tienen estimado van primero.
  const ORDEN_CATEGORIA = { "Ingreso": 0, "Gasto fijo": 1, "Gasto variable": 2 };
  const ETIQUETA_GRUPO  = { "Ingreso": "Ingresos", "Gasto fijo": "Fijos", "Gasto variable": "Variables" };
  filas.sort((a, b) => {
    const catA = ORDEN_CATEGORIA[a.categoria] ?? 3;
    const catB = ORDEN_CATEGORIA[b.categoria] ?? 3;
    if (catA !== catB) return catA - catB;
    // "Ajuste" siempre al final de Variables, sin importar estimado ni
    // orden alfabético (pedido explícito).
    if (a.concepto === "Ajuste") return 1;
    if (b.concepto === "Ajuste") return -1;
    if (a.estimado > 0 && b.estimado === 0) return -1;
    if (a.estimado === 0 && b.estimado > 0) return 1;
    return a.concepto.localeCompare(b.concepto);
  });

  const totalesGrupo = {};
  filas.forEach(f => {
    const t = totalesGrupo[f.categoria] || (totalesGrupo[f.categoria] = { estimado: 0, real: 0 });
    t.estimado += f.estimado;
    t.real     += f.real;
  });

  let categoriaAnterior = null;
  tbody.innerHTML = filas.map(f => {
    // Gastos: rojo si te pasaste de lo estimado. Ingresos: al revés — rojo
    // si no llegaste a lo estimado (la meta de ingreso no se cumplió).
    // "Ajuste" nunca se marca así -- no tiene estimado que "excederse",
    // es una corrección de saldo, no un gasto de más.
    const excedido = f.concepto === "Ajuste"
      ? false
      : (f.categoria === "Ingreso" ? f.real < f.estimado : f.real > f.estimado);

    // Separador sutil entre Ingresos/Fijos/Variables -- solo el nombre del
    // grupo, sin línea ni fondo fuerte (pedido explícito: "la separación
    // debe ser sutil").
    const cabeceraGrupo = f.categoria !== categoriaAnterior
      ? `<tr class="proy-grupo-row"><td>${ETIQUETA_GRUPO[f.categoria] || f.categoria}</td>
          <td class="proy-grupo-total">${totalesGrupo[f.categoria].estimado !== 0 ? formatMonto(totalesGrupo[f.categoria].estimado) : "—"}</td>
          <td class="proy-grupo-total">${totalesGrupo[f.categoria].real !== 0 ? formatMonto(totalesGrupo[f.categoria].real) : "—"}</td></tr>`
      : "";
    categoriaAnterior = f.categoria;

    // Sin botones sueltos -- un toque abre los movimientos reales (como
    // siempre), un segundo toque rápido abre el resumen de solo lectura
    // (ver tapConcepto más abajo), y mantener presionada abre Editar/
    // Eliminar (ver conexión después de armar la tabla).
    const conceptoJs  = f.concepto.replace(/'/g, "\\'");
    const categoriaJs = f.categoria.replace(/'/g, "\\'");
    const conceptoAttr  = f.concepto.replace(/"/g, "&quot;");
    const categoriaAttr = f.categoria.replace(/"/g, "&quot;");
    const seleccionada = modoSumaProyActivo && conceptosSeleccionadosParaSumar.has(f.concepto);
    const tapNormal = modoSumaProyActivo ? "" : ` onpointerup="tapConcepto('${conceptoJs}', '${categoriaJs}', ${f.esOtros ? "true" : "false"}, event)"`;
    return cabeceraGrupo + `<tr class="proy-tabla-row${excedido ? " fila-excedida" : ""}${seleccionada ? " proy-tabla-row-seleccionada" : ""}" data-concepto="${conceptoAttr}" data-categoria="${categoriaAttr}" data-es-otros="${f.esOtros ? "true" : "false"}" data-estimado="${f.estimado}" data-real="${f.real}"${tapNormal}>
      <td>
        <div class="proy-cell-concepto">
          <span class="proy-concepto-nombre">${iconoDeConcepto(f.concepto)} ${f.concepto}</span>
        </div>
      </td>
      <td class="proy-cell-num proy-cell-estimado">${f.estimado > 0 ? formatMonto(f.estimado) : "—"}</td>
      <td class="proy-cell-num proy-cell-real">${f.real !== 0 ? formatMonto(f.real) : "—"}</td>
    </tr>`;
  }).join("");

  if (modoSumaProyActivo) _conectarSeleccionTablaProy();
  else _conectarLargoPresionTablaComparacion();
}

// ---- Sumar conceptos (Proyección) ----
// Mismo patrón que "Sumar cajas": botón sutil que arma un modo selección --
// tocar una fila la suma/resta del total (Estimado y Real) en una barra
// flotante, sin abrir su resumen ni el menú de mantener presionado.
let modoSumaProyActivo = false;
let conceptosSeleccionadosParaSumar = new Set();

function toggleModoSumaProy() {
  modoSumaProyActivo = !modoSumaProyActivo;
  conceptosSeleccionadosParaSumar = new Set();
  renderProyeccion();
}

function _conectarSeleccionTablaProy() {
  document.querySelectorAll("#proy-tabla-body .proy-tabla-row[data-concepto]").forEach(row => {
    row.addEventListener("pointerup", () => {
      const concepto = row.dataset.concepto;
      if (conceptosSeleccionadosParaSumar.has(concepto)) conceptosSeleccionadosParaSumar.delete(concepto);
      else conceptosSeleccionadosParaSumar.add(concepto);
      row.classList.toggle("proy-tabla-row-seleccionada");
      renderProyBarra();
    });
  });
}

// Fila de arriba de Proyección (menú ⋯ y, en modo Sumar, "Listo" + el total).
// Se dibuja con React (react/src/proyeccion); acá solo se arma lo que muestra
// y se le pasan las acciones de siempre. El total sale de las filas elegidas
// en la tabla (data-estimado / data-real).
function renderProyBarra() {
  if (!window.ProyeccionReact) return;
  let estimado = 0, real = 0;
  document.querySelectorAll("#proy-tabla-body .proy-tabla-row-seleccionada").forEach(row => {
    estimado += Number(row.dataset.estimado) || 0;
    real     += Number(row.dataset.real) || 0;
  });
  window.ProyeccionReact.render({
    modoSuma: modoSumaProyActivo,
    seleccionados: conceptosSeleccionadosParaSumar.size,
    totales: { estimado, real },
    formatMonto,
    onToggleSuma: toggleModoSumaProy,
    onAgregarMes: agregarMesProyeccion,
    onArchivar: abrirModalArchivar,
  });
}

// Mantener presionada una fila abre Editar/Eliminar (ver abrirMenuEditarBorrar
// en gestos.js) -- mismo criterio que ya usaban los botones sueltos que
// existían antes: Modificar no aplica a "Otros" (agregado, no un concepto
// con estimado propio) ni a "Ajuste" (automático, nunca tiene estimado
// editable); Eliminar solo aplica a las tres categorías presupuestables, y
// tampoco a "Ajuste".
function _conectarLargoPresionTablaComparacion() {
  document.querySelectorAll("#proy-tabla-body .proy-tabla-row[data-concepto]").forEach(row => {
    const concepto  = row.dataset.concepto;
    const categoria = row.dataset.categoria;
    const esOtros   = row.dataset.esOtros === "true";
    const puedeModificar = !esOtros && concepto !== "Ajuste";
    const puedeEliminar  = concepto !== "Ajuste" &&
      (categoria === "Gasto fijo" || categoria === "Gasto variable" || categoria === "Ingreso");
    if (!puedeModificar && !puedeEliminar) return;
    crearManejadorPresionSostenida(row, {
      onLargo: () => abrirMenuEditarBorrar({
        titulo: `${iconoDeConcepto(concepto)} ${concepto}`,
        onEditar: puedeModificar ? () => abrirModificarConcepto(concepto, categoria) : null,
        // Gastos: por defecto solo se quitan de ESTE mes (ver
        // quitarConceptoDelMes); el borrado definitivo queda detrás de una
        // segunda confirmación. Ingresos: siempre definitivo, como antes.
        onBorrar: puedeEliminar
          ? () => categoria === "Ingreso"
              ? eliminarConceptoPresupuesto(concepto, categoria)
              : quitarConceptoDelMes(concepto, categoria)
          : null,
        labelBorrar: categoria === "Ingreso" ? undefined : "➖ Quitar de este mes"
      })
    });
  });
}

// Doble toque en una fila de "Detalle por concepto" abre el resumen con
// Modificar/Eliminar -- un solo toque no hace nada (pedido explícito). No
// se puede usar ondblclick -- el bloqueo de zoom (touchend ->
// preventDefault en index.html) suprime la síntesis nativa de dblclick en
// iOS Safari real (mismo bug ya resuelto para Alertas y Movimientos, ver
// tapNotificacion/tapMovimiento). Tampoco alcanza con onclick: ese mismo
// preventDefault() en el touchend del SEGUNDO toque también suprime la
// síntesis del click de ESE toque puntual -- por eso la fila usa
// onpointerup, no onclick (bug real reportado: con onclick, el segundo
// toque nunca llegaba a registrarse en el celular real, así que siempre
// caía en el toque simple).
const tapConcepto = crearManejadorDobleToque(
  (concepto, categoria) => concepto + "|" + categoria,
  (concepto, categoria, esOtros) => abrirResumenConcepto(concepto, categoria, esOtros)
);

// ---- DETALLE DE MOVIMIENTOS REALES (resumen de una fila) ----

// Movimientos reales del mes que cuentan para un concepto de Proyección --
// usado por abrirResumenConcepto (total + la misma lista, debajo de Categoría/
// Estimado/Real). "esOtros" agrupa distinto: mismo criterio que
// renderTablaComparacion usa para armar esa fila -- conceptos que no
// tienen estimado este mes ni son fuente de ingreso, más los movimientos
// con el concepto "Otros" en sí (que siempre caen ahí, tenga o no
// estimado propio configurado). "concepto" se ignora en ese caso.
function _movimientosRealesDeConcepto(mes, concepto, esOtros) {
  const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mes) && m.categoria !== "Transferencia");
  if (!esOtros) return movsDelMes.filter(m => m.concepto === concepto);

  const gastosMes = getGastosMesParaEditor(mes);
  const conocidos = new Set([
    ...Object.entries(gastosMes).filter(([, v]) => v > 0).map(([c]) => c),
    ...FUENTES_INGRESO,
    "Ajuste" // fila propia siempre presente (ver renderTablaComparacion) -- no cae en "Otros"
  ]);
  conocidos.delete("Otros");
  return movsDelMes.filter(m => !conocidos.has(m.concepto));
}

// Arma el HTML de una lista de movimientos reales (.detalle-real-item)
// para el resumen de un concepto -- ver _movimientosRealesDeConcepto.
function _renderListaMovimientosReales(lista, esOtros) {
  const ordenados = [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return ordenados.map(m => {
    const fechaFmt = new Date(m.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
    const esIngreso = m.categoria === "Ingreso";
    const etiqueta = esOtros ? `${iconoDeConcepto(m.concepto)} ${m.concepto}` : m.caja;
    const metaFecha = esOtros ? `${fechaFmt} · ${m.caja}` : fechaFmt;
    return `<div class="detalle-real-item">
      <div class="detalle-real-item-texto">
        <span class="detalle-real-item-caja">${etiqueta}</span>
        ${m.descripcion ? `<span class="detalle-real-item-desc">${m.descripcion}</span>` : ""}
        <span class="detalle-real-item-fecha">${metaFecha}</span>
      </div>
      <span class="detalle-real-item-monto" style="color:${esIngreso ? "var(--green-dark)" : "var(--text)"}">${esIngreso ? "+" : "-"}${formatMonto(Math.abs(m.monto))}</span>
    </div>`;
  }).join("");
}

// Resumen de un concepto (doble toque sobre su fila) -- acá viven
// Modificar/Eliminar, ya no sueltos en la tabla (mismo patrón que Alertas y
// Movimientos). "Otros" es un cajón agregador, no un concepto propio -- no
// tiene sentido modificarlo/eliminarlo desde acá.
function abrirResumenConcepto(concepto, categoria, esOtros) {
  const mes = proyMesActivo;
  const lista = _movimientosRealesDeConcepto(mes, concepto, esOtros);
  const real = lista.reduce((s, m) => s + Math.abs(m.monto), 0);
  const estimado = categoria === "Ingreso"
    ? (getIngresosMesParaEditor(mes)[concepto] || 0)
    : (getGastosMesParaEditor(mes)[concepto] || 0);

  // Balance = Real - Estimado. El COLOR no es simplemente "positivo=verde"
  // -- sigue el mismo criterio que ya usa "excedido" en la tabla: para un
  // Gasto, gastar de más es rojo (aunque el balance en sí dé positivo);
  // para un Ingreso, quedarse corto es rojo. Bug real reportado: la
  // primera versión coloreaba por el signo del balance solo, así que un
  // Gasto donde te pasaste del estimado (lo malo) se veía en verde.
  // "Ajuste" nunca se marca en rojo -- no tiene estimado que "excederse".
  const excedido = concepto === "Ajuste"
    ? false
    : (categoria === "Ingreso" ? real < estimado : real > estimado);
  const balance = real - estimado;
  const balanceColor = balance === 0 ? "var(--text)" : (excedido ? "var(--red)" : "var(--green-dark)");
  const balanceTexto = balance === 0 ? "—" : `${balance > 0 ? "+" : "-"}${formatMonto(Math.abs(balance))}`;

  const filasResumen = [
    ["Estimado", estimado > 0 ? formatMonto(estimado) : "—", null],
    ["Real", real !== 0 ? formatMonto(real) : "—", null],
    ["Balance", balanceTexto, balanceColor]
  ].map(([label, valor, color]) => `
      <div class="detalle-notif-fila">
        <span class="detalle-notif-label">${label}</span>
        <span class="detalle-notif-valor"${color ? ` style="color:${color}"` : ""}>${valor}</span>
      </div>`).join("");

  mostrarDetalle({
    id: "modal-resumen-concepto", idTitulo: "resumen-concepto-titulo", idCerrar: "btn-cerrar-resumen-concepto",
    titulo: `${iconoDeConcepto(concepto, categoria === "Ingreso")} ${concepto}`, icono: "barras",
    cuerpos: [
      { id: "resumen-concepto-cuerpo", clase: "detalle-notif-cuerpo", html: filasResumen },
      { id: "", clase: "resumen-concepto-movs-titulo", html: "Movimientos reales" },
      { id: "resumen-concepto-movimientos", clase: "detalle-real-lista", html: lista.length === 0
        ? `<div class="detalle-real-vacio">Sin movimientos reales este mes.</div>`
        : _renderListaMovimientosReales(lista, esOtros) },
    ],
  });
}

// ---- DASHBOARD DONUTS ----

function renderDashboardDonuts() {
  const container = document.getElementById("proy-donuts");
  if (!container) return;

  const mes = proyMesActivo || new Date().toISOString().slice(0, 7);
  const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mes));

  const fijoEst = presupuesto
    .filter(p => p.categoria === "Gasto fijo" && p.montoEstimado > 0 && !p.archivado)
    .reduce((s, p) => s + p.montoEstimado, 0);

  const variableEst = presupuesto
    .filter(p => p.categoria === "Gasto variable" && p.montoEstimado > 0 && !p.archivado)
    .reduce((s, p) => s + p.montoEstimado, 0);

  const fijoReal = movsDelMes
    .filter(m => m.categoria === "Gasto fijo")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const variableReal = movsDelMes
    .filter(m => m.categoria === "Gasto variable")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const activos = {};
  document.querySelectorAll(".proy-toggle").forEach(btn => {
    activos[btn.dataset.serie] = btn.classList.contains("active");
  });

  const SERIES = [
    {
      id:    "fijo-est",
      label: "Fijo estimado",
      valor: fijoEst,
      total: fijoEst + variableEst,
      tipo:  "fijo",
      color: "#5b4cf5",
      track: "#c7c2fc"
    },
    {
      id:    "variable-est",
      label: "Variable estimado",
      valor: variableEst,
      total: fijoEst + variableEst,
      tipo:  "variable",
      color: "#f59e0b",
      track: "#fde68a"
    },
    {
      id:    "fijo-real",
      label: "Fijo real",
      valor: fijoReal,
      total: fijoReal + variableReal,
      tipo:  "fijo",
      color: "#16a34a",
      track: "#bbf7d0"
    },
    {
      id:    "variable-real",
      label: "Variable real",
      valor: variableReal,
      total: fijoReal + variableReal,
      tipo:  "variable",
      color: "#dc2626",
      track: "#fecaca"
    }
  ];

  const seriesActivas = SERIES.filter(s => activos[s.id]);

  if (seriesActivas.length === 0) {
    container.innerHTML = `<div class="donut-empty-msg">Activa al menos una serie con los botones de arriba.</div>`;
    return;
  }

  const r = 48, cx = 60, cy = 60, stroke = 11;
  const circ = 2 * Math.PI * r;

  container.innerHTML = seriesActivas.map(s => {
    const pct        = s.total > 0 ? Math.round((s.valor / s.total) * 100) : 0;
    const dash       = s.total > 0 ? (s.valor / s.total) * circ : 0;
    const pctLabel   = s.total > 0 ? `${pct}%` : "—";
    const montoLabel = formatMonto(s.valor);
    const totalLabel = s.total > 0 ? formatMonto(s.total) : "Sin datos";
    const trackColor = s.total === 0 ? "#e4e7ef" : s.track;
    const textColor  = s.total === 0 ? "#9ca3af" : "#111827";

    return `<div class="donut-item">
      <svg class="donut-svg" width="120" height="120" viewBox="0 0 120 120">
        <circle
          cx="${cx}" cy="${cy}" r="${r}"
          fill="none"
          stroke="${trackColor}"
          stroke-width="${stroke}"
          transform="rotate(-90 ${cx} ${cy})"/>
        ${s.total > 0 ? `
        <circle
          cx="${cx}" cy="${cy}" r="${r}"
          fill="none"
          stroke="${s.color}"
          stroke-width="${stroke}"
          stroke-dasharray="${dash} ${circ - dash}"
          stroke-linecap="round"
          transform="rotate(-90 ${cx} ${cy})"
          style="transition:stroke-dasharray 0.5s ease"/>
        ` : ""}
        <text
          x="${cx}" y="${cy - 5}"
          text-anchor="middle"
          style="font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;fill:${textColor}">
          ${pctLabel}
        </text>
        <text
          x="${cx}" y="${cy + 11}"
          text-anchor="middle"
          style="font-size:9px;fill:#6b7280;font-family:'Inter',sans-serif">
          ${s.tipo}
        </text>
      </svg>
      <div class="donut-label">${s.label}</div>
      <div class="donut-sublabel">${montoLabel} / ${totalLabel}</div>
    </div>`;
  }).join("");
}

// =============================================
// CRONOLOGÍA MENSUAL
// =============================================

// Saldo acumulado de todas las cajas COP hasta el último día de mesStr
// (inclusive) -- NO el neto de ese mes solo. Es el mismo cálculo que
// calcularSaldoCaja() (saldoArchivado + entradas/salidas), pero cortando
// los movimientos justo al cierre de ese mes en vez de sumar todo hasta
// hoy, para que el "balance de cierre" de un mes viejo no incluya
// movimientos de meses posteriores.
function calcularBalanceCierreHastaMes(mesStr) {
  const [anio, mes] = mesStr.split("-").map(Number);
  const primerDiaMesSiguiente = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10);

  return cajas
    .filter(c => c.moneda === "COP")
    .reduce((total, c) => {
      const saldoHastaElMes = movimientos
        .filter(m => m.caja === c.nombre && m.fecha < primerDiaMesSiguiente)
        .reduce((s, m) => {
          const esEntrada = m.categoria === "Ingreso" ||
            (m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"));
          return s + (esEntrada ? m.monto : -Math.abs(m.monto));
        }, 0);
      return total + (c.saldoArchivado || 0) + saldoHastaElMes;
    }, 0);
}

// Todos los números de un mes cerrado para Cronología -- factorizado
// aparte porque se necesita tanto para meses nuevos (INSERT) como para
// filas viejas que quedaron incompletas de antes de que existieran
// ingresoTotal/asertividadMensual/etc. (UPDATE, ver verificarYGuardarCronologia).
function calcularMetricasCronologia(mesStr) {
  const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mesStr));

  const ingresoTotal = movsDelMes
    .filter(m => m.categoria === "Ingreso")
    .reduce((s, m) => s + m.monto, 0);

  const fijoReal = movsDelMes
    .filter(m => m.categoria === "Gasto fijo")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const varReal = movsDelMes
    .filter(m => m.categoria === "Gasto variable")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const fijoEst = presupuesto
    .filter(p => p.categoria === "Gasto fijo" && p.montoEstimado > 0 && !p.archivado)
    .reduce((s, p) => s + p.montoEstimado, 0);

  const varEst = presupuesto
    .filter(p => p.categoria === "Gasto variable" && p.montoEstimado > 0 && !p.archivado)
    .reduce((s, p) => s + p.montoEstimado, 0);

  const fijoAser = fijoEst > 0 ? Math.round(((fijoReal - fijoEst) / fijoEst) * 100) : 0;
  const varAser  = varEst  > 0 ? Math.round(((varReal  - varEst)  / varEst)  * 100) : 0;

  const gastoTotal         = fijoReal + varReal;
  const gastoEstimadoTotal = fijoEst + varEst;
  const asertividadMensual = gastoEstimadoTotal > 0
    ? Math.round((gastoTotal / gastoEstimadoTotal) * 100) : 0;

  const balanceCierre = calcularBalanceCierreHastaMes(mesStr);

  // Cuánto de ese gasto fijo fue específicamente cuotas de préstamo (usa
  // la lista de préstamos ACTUAL -- misma limitación que ya tiene el
  // resto del resumen: un préstamo borrado más adelante ya no se puede
  // identificar en meses viejos).
  const gastoPrestamos = (prestamos || []).reduce((s, p) => {
    const concepto = conceptoPrestamo(p.nombre);
    return s + movsDelMes
      .filter(m => m.concepto === concepto)
      .reduce((x, m) => x + Math.abs(m.monto), 0);
  }, 0);

  // Concepto con mayor sobregasto real vs. presupuesto ese mes.
  const realesPorConcepto = {};
  movsDelMes.forEach(m => {
    if (m.categoria === "Ingreso") return;
    realesPorConcepto[m.concepto] = (realesPorConcepto[m.concepto] || 0) + Math.abs(m.monto);
  });
  const desvios = presupuesto
    .filter(p => p.montoEstimado > 0 && !p.archivado)
    .map(p => ({ concepto: p.concepto, desviacion: (realesPorConcepto[p.concepto] || 0) - p.montoEstimado }))
    .filter(d => d.desviacion > 0)
    .sort((a, b) => b.desviacion - a.desviacion);
  const mayorDesvioConcepto = desvios.length > 0 ? desvios[0].concepto : "";
  const mayorDesvioMonto    = desvios.length > 0 ? desvios[0].desviacion : 0;

  return {
    fijoAser, fijoReal, varAser, varReal, ingresoTotal,
    asertividadMensual, balanceCierre, gastoPrestamos,
    mayorDesvioConcepto, mayorDesvioMonto
  };
}

// Limpia meses duplicados en Cronología -- bug real reportado: un mismo
// mes (ej. junio) aparecía dos veces en la tabla, cada fila con un
// "ingreso total" distinto. Vino de una versión vieja de
// verificarYGuardarCronologia que en algún momento agregó una fila nueva
// en vez de actualizar la que ya existía para ese mes, así que ambas
// quedaron viviendo en la hoja (la función de acá abajo, al buscar
// "¿existe ya este mes?" con un Map, solo ve la última y la otra queda
// huérfana para siempre -- se sigue leyendo y mostrando igual). Se queda
// con la fila "completa" más reciente para cada mes (o la más reciente a
// secas si ninguna está completa) y borra el resto. Corre en cada arranque
// de la app, así que sirve tanto para datos nuevos como para limpiar lo
// que ya haya quedado duplicado de antes.
async function _limpiarCronologiaDuplicada(cronologia) {
  const porMes = new Map();
  cronologia.forEach(c => {
    if (!porMes.has(c.mes)) porMes.set(c.mes, []);
    porMes.get(c.mes).push(c);
  });

  const limpia = [];
  for (const filas of porMes.values()) {
    if (filas.length === 1) { limpia.push(filas[0]); continue; }
    const ordenadas = [...filas].sort((a, b) => {
      if (a.completa !== b.completa) return a.completa ? -1 : 1;
      return b.id.localeCompare(a.id); // id = "CR" + timestamp -> más reciente primero
    });
    const [principal, ...sobrantes] = ordenadas;
    limpia.push(principal);
    for (const sobra of sobrantes) {
      try { await Sheets.borrarCronologia(sobra.id); } catch (err) { console.error("Error borrando fila duplicada de cronología:", err); }
    }
  }
  return limpia.sort((a, b) => a.mes.localeCompare(b.mes));
}

// Se revisa CADA VEZ que se abre la app (no solo el día 1 del mes): busca
// todos los meses ya cerrados (anteriores al actual) que tengan movimientos
// reales pero todavía no tengan registro en la cronología, y los completa.
// Así, si no abriste la app justo el día 1, el mes anterior no se queda
// sin guardar para siempre — se pone al día en la próxima visita.
//
// También pone al día las filas VIEJAS que ya existían de antes de que
// Cronología guardara ingresoTotal/asertividadMensual/balanceCierre/etc.
// (bug real reportado: "Ingreso total" siempre daba 0 -- esas filas viejas
// nunca se volvían a tocar, solo se guardaban meses nuevos). Solo se puede
// poner al día un mes viejo si sus movimientos siguen en el array
// `movimientos` (no se archivaron todavía, ver worker/src/archivo.js) --
// si ya se archivaron, esa fila se queda como está para siempre.
async function verificarYGuardarCronologia() {
  try {
    const cronologiaExistente = await _limpiarCronologiaDuplicada(await Sheets.getCronologia());

    const mesActual = new Date().toISOString().slice(0, 7);

    const mesesConDatos = [...new Set(movimientos.map(m => m.fecha.slice(0, 7)))]
      .filter(mes => mes < mesActual)
      .sort();
    if (mesesConDatos.length === 0) return;

    const porMes = new Map(cronologiaExistente.map(c => [c.mes, c]));

    for (const mesStr of mesesConDatos) {
      const existente = porMes.get(mesStr);
      if (existente && existente.completa) continue; // ya está al día

      const m = calcularMetricasCronologia(mesStr);

      if (existente) {
        await Sheets.actualizarCronologia(
          existente.id, mesStr, m.fijoAser, m.fijoReal, m.varAser, m.varReal,
          m.ingresoTotal, m.asertividadMensual, m.balanceCierre, m.gastoPrestamos,
          m.mayorDesvioConcepto, m.mayorDesvioMonto
        );
        console.log(`Cronología actualizada (fila vieja puesta al día) para ${mesStr}`);
      } else {
        await Sheets.guardarCronologia(
          mesStr, m.fijoAser, m.fijoReal, m.varAser, m.varReal,
          m.ingresoTotal, m.asertividadMensual, m.balanceCierre, m.gastoPrestamos,
          m.mayorDesvioConcepto, m.mayorDesvioMonto
        );
        console.log(`Cronología guardada para ${mesStr}`);
      }
    }
  } catch (err) {
    console.error("Error guardando cronología:", err);
  }
}

async function cargarYRenderCronologia() {
  try {
    const cronologia = await Sheets.getCronologia();
    renderCronologia(cronologia);
    renderSaludMesCerrado(cronologia);
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    console.error("Error cargando cronología:", err);
  }
}

// "Salud del mes" muestra el MES YA CERRADO (el último con fila en
// Cronología) -- no el mes en curso, que puede estar todavía sin cerrar.
// Por eso se llena una sola vez acá, aparte de renderResumen().
// La pantalla de Análisis es React (react/src/analisis/PantallaAnalisis.jsx); acá se arma lo que muestra.
let cronologiaAnalisis = null;   // null = todavía no cargó

function renderSaludMesCerrado(cronologia) {
  cronologiaAnalisis = cronologia || [];
  renderAnalisisReact();
}

function renderCronologia(datos) {
  cronologiaAnalisis = datos || [];
  renderAnalisisReact();
}

function renderAnalisisReact() {
  if (!window.PantallaAnalisisReact) return;
  const verdeRojo = ok => ok ? "verde" : "rojo";

  // ---- Salud del mes: el último mes CERRADO (el último con fila en Cronología) ----
  const ordenados = (cronologiaAnalisis || []).slice().sort((a, b) => b.mes.localeCompare(a.mes));
  const ultimo = ordenados[0] || null;
  const mesLabel = ultimo
    ? new Date(ultimo.mes + "-15").toLocaleDateString("es-CO", { year: "numeric", month: "long" })
    : "Todavía no hay un mes cerrado";
  // Solo el nombre del mes (sin año) para el título del bloque, ej. "Salud del mes (Julio)" -- el año
  // sigue apareciendo abajo, en el detalle de cada tarjeta.
  const nombreMes = ultimo ? new Date(ultimo.mes + "-15").toLocaleDateString("es-CO", { month: "long" }) : null;
  const saludTitulo = `Salud del mes${nombreMes ? ` (${nombreMes[0].toUpperCase() + nombreMes.slice(1)})` : ""}`;

  let salud;
  if (!ultimo) {
    salud = {
      asertividad: { valor: "—", meta: mesLabel, estado: "gris" },
      balance: { valor: "—", meta: mesLabel, estado: "gris" },
      gastoFijo: { valor: "—", meta: mesLabel },
      gastoVar: { valor: "—", meta: mesLabel },
      pagoPrestamo: { valor: "—", meta: mesLabel },
      desvio: { valor: "—", meta: mesLabel, estado: "gris" },
    };
  } else {
    // Solo verde/rojo (sin amarillo intermedio): verde = no se excedió el presupuesto, y el número es
    // directamente "% de lo estimado que se usó" (ej. 22% = usó el 22% de lo presupuestado). Rojo = se
    // excedió, y ahí el número le resta 100 para que diga cuánto de MÁS gastó (ej. asertividadMensual=125
    // -> "25%" = gastó un 25% más de lo estimado), en vez del 125% crudo que confundía.
    const seExcedio = ultimo.asertividadMensual > 100;
    salud = {
      asertividad: {
        valor: (seExcedio ? ultimo.asertividadMensual - 100 : ultimo.asertividadMensual) + "%",
        color: seExcedio ? "var(--red)" : "var(--green)", meta: mesLabel, estado: verdeRojo(!seExcedio),
      },
      balance: {
        valor: formatMonto(ultimo.balanceCierre), color: ultimo.balanceCierre >= 0 ? "var(--green)" : "var(--red)",
        meta: mesLabel, estado: verdeRojo(ultimo.balanceCierre >= 0),
      },
      gastoFijo: { valor: formatMonto(ultimo.gastoFijo), meta: mesLabel },
      gastoVar: { valor: formatMonto(ultimo.gastoVariable), meta: mesLabel },
      pagoPrestamo: { valor: formatMonto(ultimo.gastoPrestamos), meta: mesLabel },
      desvio: ultimo.mayorDesvioConcepto
        ? { valor: ultimo.mayorDesvioConcepto, color: "var(--red)", estado: "rojo",
            meta: `+${formatMonto(ultimo.mayorDesvioMonto)} sobre lo estimado (${mesLabel})` }
        : { valor: "Ninguno", color: "var(--green)", estado: "verde", meta: `Todo dentro del presupuesto (${mesLabel})` },
    };
  }

  // ---- Deudas: qué parte de los préstamos en curso ya está pagada ----
  const activos = (prestamos || []).filter(p => !p.pagado);
  const totalDeuda = activos.reduce((s, p) => s + p.monto, 0);
  const totalPagado = activos.reduce((s, p) => s + calcularPagadoPrestamo(p.nombre), 0);
  const pct = totalDeuda > 0 ? Math.round((totalPagado / totalDeuda) * 100) : null;
  const deuda = pct === null
    ? { valor: "Sin deudas", meta: "¡Excelente!", estado: "verde" }
    : {
        valor: pct + "%", meta: `${formatMonto(totalPagado)} de ${formatMonto(totalDeuda)}`,
        estado: pct >= 75 ? "verde" : pct >= 40 ? "amarillo" : "rojo",
        color: pct >= 75 ? "var(--green)" : pct >= 40 ? "var(--yellow)" : "var(--red)",
      };

  // ---- Cronología mensual ----
  const cronologia = cronologiaAnalisis === null ? null : [...cronologiaAnalisis]
    .sort((a, b) => b.mes.localeCompare(a.mes))
    .map(d => {
      // Mismo criterio que "Salud del mes": rojo = se excedió el presupuesto y el número le resta 100
      // (cuánto de MÁS gastó), verde = no se excedió y el número es directo (% de lo estimado que usó).
      const excedida = d.asertividadMensual > 100;
      const nombre = new Date(d.mes + "-15").toLocaleDateString("es-CO", { month: "long" });
      return {
        id: d.id, mes: nombre[0].toUpperCase() + nombre.slice(1),
        ingreso: formatMonto(d.ingresoTotal), fijo: formatMonto(d.gastoFijo), variable: formatMonto(d.gastoVariable),
        asertividad: (excedida ? d.asertividadMensual - 100 : d.asertividadMensual) + "%",
        asertividadColor: excedida ? "var(--red)" : "var(--green)",
        balance: formatMonto(d.balanceCierre), balanceColor: d.balanceCierre >= 0 ? "var(--green)" : "var(--red)",
      };
    });

  window.PantallaAnalisisReact.render({ saludTitulo, salud, deuda, cronologia });
}

// ---- NUEVO CONCEPTO (agregar fila al presupuesto) ----
// La ventana es React (se abre desde Configurar mes, ver Conceptos.jsx); acá quedan los datos.

function nombresDeConceptos() {
  return [...GASTOS_FIJOS, ...GASTOS_VARIABLES, ...FUENTES_INGRESO];
}

// ¿Ya existe (o está archivado)? Y conceptos que se parecen, para avisar sin bloquear: evita crear
// "Internet hogar" teniendo "Internet".
function estadoNuevoConcepto(nombre) {
  const archivado = conceptoArchivado(nombre);
  const existe = conceptoYaExiste(nombre) || archivado;
  return { existe: !!existe && !archivado, archivado: !!archivado, parecidos: existe ? [] : conceptosParecidos(nombre) };
}

async function guardarNuevoConceptoDatos({ nombre, categoria, icono, monto }, desdeConfigMes) {
  const esIngreso = categoria === "Ingreso";
  const nuevaLista = [...presupuesto, {
    categoria, concepto: nombre, icono,
    montoEstimado:   esIngreso ? 0 : monto,
    ingresoEstimado: esIngreso ? monto : 0
  }];
  await Sheets.guardarPresupuesto(nuevaLista);
  presupuesto = nuevaLista;
  sincronizarListasConceptos();
  renderProyeccion();
  // Desde Configurar mes se vuelve al formulario con el concepto ya puesto: el aviso sobraría y,
  // en pantallas grandes, taparía el botón Guardar.
  if (!desdeConfigMes) SyncManager.mostrarToast(`✅ "${nombre}" agregado al presupuesto`);
}

// ---- ARCHIVAR CONCEPTOS ----
function _categoriaDeConcepto(n) {
  return FUENTES_INGRESO.includes(n) ? "Ingreso" : GASTOS_FIJOS.includes(n) ? "Gasto fijo" : "Gasto variable";
}

// La ventana es React (ver Conceptos.jsx); acá quedan los datos.
function abrirModalArchivar() {
  document.dispatchEvent(new CustomEvent("conceptos:abrir", { detail: { t: "archivar" } }));
}

function datosArchivar() {
  return {
    ingresos: FUENTES_INGRESO, fijos: GASTOS_FIJOS, variables: GASTOS_VARIABLES,
    archivados: presupuesto.filter(p => p.archivado).map(p => p.concepto),
    movimientosDe: nombre => movimientos.filter(m => m.concepto === nombre).length,
  };
}

// Si algo falla, restaura lo anterior y lanza (la ventana avisa y se queda abierta).
async function archivarConcepto(nombre) {
  if (!nombre) return;
  // Los conceptos "de fábrica" (Internet, Gas...) viven en las listas de la app pero no
  // tienen fila en la hoja Presupuesto hasta que alguien los guarda: si falta, se crea.
  let base = presupuesto;
  if (!base.some(p => p.concepto === nombre)) {
    base = [...base, { categoria: _categoriaDeConcepto(nombre), concepto: nombre, montoEstimado: 0, ingresoEstimado: 0, icono: "", archivado: false }];
  }
  const original = presupuesto;
  const nueva = base.map(p => p.concepto === nombre ? { ...p, archivado: true } : p);
  try {
    await Sheets.guardarPresupuesto(nueva);
  } catch (err) {
    presupuesto = original;
    throw err;
  }
  presupuesto = nueva;
  sincronizarListasConceptos();   // lo saca de las listas
  renderProyeccion();
  if (typeof renderMovimientos === "function") renderMovimientos();
  SyncManager.mostrarToast(`📦 «${nombre}» archivado`);
}

async function restaurarConcepto(nombre) {
  const original = presupuesto;
  const nueva = presupuesto.map(p => p.concepto === nombre ? { ...p, archivado: false } : p);
  try {
    await Sheets.guardarPresupuesto(nueva);
  } catch (err) {
    presupuesto = original;
    throw err;
  }
  presupuesto = nueva;
  sincronizarListasConceptos();   // vuelve a las listas
  renderProyeccion();
  SyncManager.mostrarToast(`↩️ «${nombre}» restaurado`);
}

// Saca un gasto SOLO del mes activo: el concepto sigue existiendo y se puede
// volver a poner desde Configurar mes. Como un mes sin configuración propia
// hereda la del mes anterior, antes de quitarlo se "congela" el mes
// siguiente (si está en la proyección y no tiene la suya) con lo que
// heredaría hoy -- así el concepto sigue estando ahí en adelante.
function quitarConceptoDelMes(concepto, categoria) {
  const mes = proyMesActivo;
  const label = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long" });
  if (!confirm(`¿Quitar "${concepto}" solo de ${label}?\n\nSigue existiendo y lo puedes volver a agregar desde Configurar mes ().\n\n(Cancelar te deja borrarlo definitivamente de todos los meses.)`)) {
    // Salida al borrado definitivo, con su propia confirmación.
    eliminarConceptoPresupuesto(concepto, categoria);
    return;
  }
  const actuales = { ...getGastosMesParaEditor(mes) };

  const meses = getMesesProyeccion();
  const siguiente = meses.filter(m => m > mes).sort()[0];
  if (siguiente && !getGastosMes(siguiente)) {
    const seguro = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1).toISOString().slice(0, 7);
    // Solo si es el mes inmediato: uno más lejano hereda de uno intermedio.
    if (siguiente === seguro) setGastosMes(siguiente, { ...actuales });
  }

  delete actuales[concepto];
  setGastosMes(mes, actuales);
  renderProyeccion();
  SyncManager.mostrarToast(`➖ "${concepto}" quitado de ${label}`);
}

// Quita un concepto del presupuesto (y de los selectores de la app). Los
// movimientos ya registrados con ese concepto NO se tocan ni se borran.
async function eliminarConceptoPresupuesto(concepto, categoria) {
  if (!confirm(`¿Eliminar "${concepto}" del presupuesto?\n\nLos movimientos ya registrados con este concepto no se borran.`)) return;

  const listaOriginal = presupuesto;
  const nuevaLista = presupuesto.filter(p => p.concepto !== concepto);

  try {
    await Sheets.guardarPresupuesto(nuevaLista);
    presupuesto = nuevaLista;
    if (categoria === "Gasto fijo") {
      const i = GASTOS_FIJOS.indexOf(concepto);
      if (i !== -1) GASTOS_FIJOS.splice(i, 1);
    } else if (categoria === "Gasto variable") {
      const i = GASTOS_VARIABLES.indexOf(concepto);
      if (i !== -1) GASTOS_VARIABLES.splice(i, 1);
    } else if (categoria === "Ingreso") {
      const i = FUENTES_INGRESO.indexOf(concepto);
      if (i !== -1) FUENTES_INGRESO.splice(i, 1);
    }
    renderProyeccion();
    SyncManager.mostrarToast(`🗑️ "${concepto}" eliminado del presupuesto`);
  } catch (err) {
    presupuesto = listaOriginal;
    alert("Error eliminando el concepto: " + err.message);
  }
}

// ---- SETUP LISTENERS PROYECCIÓN ----

function renderConceptosReact() {
  if (!window.ConceptosReact) return;
  window.ConceptosReact.render({
    elegirMes: elegirMesProyeccion,
    datosConfigMes,
    onGuardarConfigMes: guardarConfigMesDatos,
    iconoDe: iconoDeConcepto,
    nombresConceptos: nombresDeConceptos,
    estadoNombre: estadoNuevoConcepto,
    onGuardarConcepto: guardarNuevoConceptoDatos,
    valorConcepto: valorEstimadoConcepto,
    onGuardarModificar: guardarModificarConceptoDatos,
    datosArchivar,
    onArchivar: archivarConcepto,
    onRestaurar: restaurarConcepto,
    evaluarMonto: texto => evaluarMonto(texto),
  });
}

function setupProyeccionListeners() {
  renderConceptosReact();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupProyeccionListeners);
} else {
  setTimeout(setupProyeccionListeners, 0);
}

// =============================================
// MÓDULO RESUMEN — KPIs financieros
// =============================================

// Ya no toma un mes elegido por el usuario -- el selector de mes se quitó
// (no cumplía ninguna función real: nada de lo que sigue mostrando en la
// pestaña depende del mes elegido, ver renderSaludMesCerrado() para lo que
// sí varía por mes). Lo que queda acá (Deudas) es global, no por mes.
function renderResumen() {
  renderAnalisisReact();
}


// =============================================
// TOPBAR: actualizar título según tab activa
// =============================================
const TAB_TITLES = {
  cajas: "Cuentas", movimientos: "Ingresos / Gastos", proyeccion: "Proyección",
  compromisos: "Compromisos", notificaciones: "Alertas", mercado: "Mercado",
  planes: "Planes", resumen: "Análisis"
};


// =============================================
// SOPORTE EN MOVIMIENTOS (fotos + audio) -- la ventana (React) arma las fotos y los audios; acá quedan
// la subida a Drive y el permiso del micrófono.
// =============================================

// Sube las fotos/audios a Google Drive y devuelve los links separados por coma
async function subirFotosADrive(fotos, fecha, concepto, caja) {
  if (fotos.length === 0) return "";
  const slug = `${fecha}-${String(concepto).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_")}-${String(caja).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_")}`;
  const urls = [];
  for (let i = 0; i < fotos.length; i++) {
    const foto = fotos[i];
    const esAudio = (foto.type || "").startsWith("audio/");
    const ext = esAudio ? "webm" : (foto.type.includes("png") ? "png" : "jpg");
    const { url } = await Sheets.subirArchivoDrive(foto.data, `${slug}-${i + 1}.${ext}`, foto.type);
    urls.push(url);
  }
  return urls.join(",");
}

// Micrófono (mismo patrón que recordatorios.js, con nombres propios para no pisar sus variables
// globales -- ambos módulos cargan como scripts sueltos en el mismo scope).
let movAudioStream = null;

async function obtenerStreamMicrofonoMov() {
  const activo = movAudioStream?.getAudioTracks().some(t => t.readyState === "live");
  if (activo) return movAudioStream;

  try {
    if (navigator.permissions?.query) {
      const estado = await navigator.permissions.query({ name: "microphone" });
      if (estado.state === "denied") {
        throw Object.assign(new Error("Permiso de micrófono denegado"), { name: "NotAllowedError" });
      }
    }
  } catch (e) {
    if (e.name === "NotAllowedError") throw e;
    // Safari/iOS no soporta consultar "microphone" con la Permissions API — seguimos igual
  }

  movAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return movAudioStream;
}

// Suelta el micrófono al cerrar la ventana.
function liberarMicrofonoMov() {
  if (movAudioStream) {
    movAudioStream.getTracks().forEach(t => t.stop());
    movAudioStream = null;
  }
}


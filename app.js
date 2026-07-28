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
let actualizacionDisponible = false; // true cuando el service worker ya descargó una versión nueva

// Cambia "Finanzas Hogar vX.Y.Z" por "Sincronizar" (y viceversa) en el
// menú ⋯ — es lo único que se toca, sin tocar el resto de la UI.
function actualizarTextoVersion() {
  const ddVersion = document.getElementById("dropdown-version");
  if (!ddVersion) return;
  if (actualizacionDisponible) {
    ddVersion.textContent = "🔄 Sincronizar";
    ddVersion.classList.add("dropdown-version-sync");
  } else {
    ddVersion.textContent = `Finanzas Hogar v${CONFIG.VERSION}`;
    ddVersion.classList.remove("dropdown-version-sync");
  }
}

// Llamado por sw-register.js cuando detecta una versión nueva ya descargada
function marcarActualizacionDisponible() {
  actualizacionDisponible = true;
  actualizarTextoVersion();
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

const ICONOS = {
  // Ingresos
  "Ingreso": "💰",

  // Gastos fijos
  "Alquiler": "🏠",
  "Mercado": "🛒",
  "Emcali": "💡",
  "Gas": "🔥",
  "Internet": "📡",
  "Celular": "📱",
  "Netflix": "🎬",
  "Susc. Adobe": "🎨",
  "Susc. Claude": "🤖",
  "Seguridad Social": "🏥",
  "Póliza": "🛡️",
  "RH Juli": "🥳",
  "Transporte": "🚌",

  // Gastos variables
  "Mercado": "🛒",
  "Ahorro": "🏦",
  "Inversiones": "📈",
  "Salud": "🩺",
  "Educación": "📚",
  "Belleza": "💅",
  "Deporte": "⚽",
  "Ocio": "🎮",
  "Entretenimiento": "🎉",
  "Vacaciones": "✈️",
  "Ropa": "👕",
  "Compras online": "📦",
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
  "Otros": "📌"
};

// ---- INIT ----

window.onload = async () => {
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
async function renovarTokenDesdeWorker(email) {
  const sessionToken = localStorage.getItem("worker_session");
  if (!email || !sessionToken) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/token?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.access_token) return false;
    Sheets.setToken(data.access_token);
    localStorage.setItem("gtoken", data.access_token);
    return true;
  } catch (e) {
    clearTimeout(timeoutId);
    return false; // sin conexión, timeout, etc. — la app sigue con caché
  }
}

// Nombre histórico usado por cargarTodo() para el reintento tras
// TOKEN_EXPIRADO — se mantiene como wrapper fino para no tocar esa lógica.
function renovarTokenSilencioso() {
  return renovarTokenDesdeWorker(currentUser?.email);
}

// Callback de One Tap: identifica al usuario que vuelve (nombre/email/foto)
// y, si ya se conectó antes con Google (hay un sessionToken guardado para
// ese email), pide un access_token directo al Worker. Si nunca se conectó
// desde este dispositivo, no hay nada que renovar todavía — mostrarApp()
// deja la app con la caché, y el flujo normal de "Reconectar" se encarga.
async function _onOneTapCredential(credentialResponse) {
  try {
    const parts = credentialResponse.credential.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    currentUser = { name: payload.name, email: payload.email, picture: payload.picture };
    localStorage.setItem("guser", JSON.stringify(currentUser));
  } catch (e) { return; }

  await renovarTokenDesdeWorker(currentUser.email);
  mostrarApp();
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
      scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email"
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
  localStorage.setItem("gtoken", resultado.access_token);
  localStorage.setItem("worker_session", resultado.sessionToken);
  currentUser = { name: resultado.name, email: resultado.email, picture: resultado.picture };
  localStorage.setItem("guser", JSON.stringify(currentUser));
  return true;
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
  localStorage.removeItem("gtoken");
  localStorage.removeItem("guser");
  localStorage.removeItem("worker_session");
  currentUser = null;
  cajas = [];
  movimientos = [];
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
});

// ---- BARRA "CONECTANDO…" (mientras se cargan los datos reales tras abrir la app) ----

function mostrarConectando() {
  document.getElementById("conectando-bar")?.classList.remove("hidden");
}
function ocultarConectando() {
  document.getElementById("conectando-bar")?.classList.add("hidden");
}

// ---- BARRA "RECONECTAR" (cuando la renovación silenciosa del token falla) ----

function mostrarReconectar() {
  document.getElementById("reconectar-bar")?.classList.remove("hidden");
}
function ocultarReconectar() {
  document.getElementById("reconectar-bar")?.classList.add("hidden");
}

// Reconexión con interacción del usuario: a diferencia de
// renovarTokenSilencioso()/renovarTokenDesdeWorker(), esta pasa por el popup
// de Google de verdad (conectarConGooglePopup), así que funciona aunque
// nunca haya habido un sessionToken guardado en este dispositivo — es el
// botón de "Reconectar" que aparece cuando todo lo demás falló, y un solo
// toque siempre debe poder devolver la sesión.
async function reconectarGoogle() {
  const btn = document.querySelector("#reconectar-bar .btn-reconectar");
  if (btn) { btn.textContent = "Conectando..."; btn.disabled = true; }

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
  document.getElementById("user-name").textContent = currentUser.name;
  document.getElementById("user-avatar").src = currentUser.picture;
  document.getElementById("mov-fecha").value = new Date().toISOString().split("T")[0];
  const mesCorriente = new Date().toISOString().slice(0, 7);
  document.getElementById("filtro-mes").value  = mesCorriente;
  // topbar avatar
  const ta = document.getElementById("topbar-avatar");
  if (ta && currentUser?.picture) ta.src = currentUser.picture;

  // Cargar caché SIEMPRE antes de tocar la red
  const cacheC    = localStorage.getItem("cache_cajas");
  const cacheM    = localStorage.getItem("cache_movimientos");
  const cacheP    = localStorage.getItem("cache_presupuesto");
  const cacheCron = localStorage.getItem("cache_cronologia");

  if (cacheC) { try { cajas        = JSON.parse(cacheC); } catch {} }
  if (cacheM) { try { movimientos  = JSON.parse(cacheM); } catch {} }
  if (cacheP) { try { presupuesto  = JSON.parse(cacheP); } catch {} }

  // Renderizar INMEDIATAMENTE con lo que haya en caché
  renderCajas();
  renderMovimientos();
  poblarFiltrosCajas();
  if (presupuesto && presupuesto.length > 0) renderProyeccion();
  if (cacheCron) { try { renderCronologia(JSON.parse(cacheCron)); } catch {} }

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

function cerrarPantallaActual() {
  const modalAbierto = document.querySelector(".modal:not(.hidden)");
  if (modalAbierto) {
    // El modal de grabar recordatorio necesita apagar el micrófono al cerrarse,
    // no solo ocultarse — usa su propio cierre en vez del genérico.
    animarYCerrar(modalAbierto, () => {
      if (modalAbierto.id === "modal-recordatorio-crear" && typeof cerrarModalCrearRecordatorio === "function") {
        cerrarModalCrearRecordatorio();
      } else {
        modalAbierto.classList.add("hidden");
      }
    });
    return true;
  }
  const dropdown = document.getElementById("dropdown-menu");
  if (dropdown && !dropdown.classList.contains("hidden")) {
    animarYCerrar(dropdown, () => dropdown.classList.add("hidden"));
    return true;
  }
  const recPanel = document.getElementById("recordatorios-panel");
  if (recPanel && !recPanel.classList.contains("hidden")) {
    animarYCerrar(recPanel, () => recPanel.classList.add("hidden"));
    return true;
  }
  return false;
}

(function setupGestoVolver() {
  const BORDE_PX = 28;    // debe iniciar cerca del borde izquierdo, como el gesto de iOS
  const SWIPE_MIN_PX = 70; // distancia horizontal mínima para contar como "volver"
  const DESVIO_MAX_PX = 60; // tolerancia vertical antes de descartarlo como scroll
  let inicioX = null, inicioY = null, valido = false;

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { valido = false; return; }
    const t = e.touches[0];
    valido = t.clientX <= BORDE_PX;
    inicioX = t.clientX;
    inicioY = t.clientY;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!valido || inicioX === null) return;
    valido = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - inicioX;
    const dy = Math.abs(t.clientY - inicioY);
    if (dx > SWIPE_MIN_PX && dy < DESVIO_MAX_PX) cerrarPantallaActual();
  }, { passive: true });
})();

// ---- NAVEGACIÓN ----

function setupEventListeners() {
function navegarATab(tab) {
    document.querySelectorAll(".nav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-section").forEach(s => s.classList.add("hidden"));
    const sec = document.getElementById(`tab-${tab}`);
    if (sec) sec.classList.remove("hidden");
    if (tab === "prestamos") cargarPrestamos();
    if (tab === "compras") cargarCompras();
    if (tab === "resumen") renderResumen();
    if (typeof actualizarTopbarTitulo === "function") actualizarTopbarTitulo(tab);
    // update topbar avatar
    const ta = document.getElementById("topbar-avatar");
    if (ta && currentUser?.picture) ta.src = currentUser.picture;
  }
  window.navegarATab = navegarATab;

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navegarATab(btn.dataset.tab));
  });

  // Dropdown tab navigation
  document.querySelectorAll("[data-tab-nav]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tabNav;
      document.getElementById("dropdown-menu").classList.add("hidden");
      navegarATab(tab);
    });
  });
document.getElementById("btn-refrescar")?.addEventListener("click", cargarTodo);
  document.getElementById("btn-refrescar-mov")?.addEventListener("click", cargarTodo);

  // Bottom nav "Más" button — opens dropdown menu
  document.getElementById("btn-bottom-menu")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById("dropdown-menu");
    const btn = document.getElementById("btn-menu");
    const abierto = !dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", abierto);
    if (btn) btn.setAttribute("aria-expanded", String(!abierto));
    if (typeof actualizarDropdownUsuario === "function") actualizarDropdownUsuario();
  });

  // Movimientos

document.getElementById("btn-nuevo-movimiento").addEventListener("click", () => {
    document.getElementById("modal-movimiento").classList.remove("hidden");
    poblarSelectCajas("mov-caja");
    actualizarConceptosPrestamo();
  });
  
  document.getElementById("btn-cancelar-mov").addEventListener("click", () => {
    document.getElementById("modal-movimiento").classList.add("hidden");
    limpiarFormMov();
  });
  document.getElementById("btn-guardar-mov").addEventListener("click", guardarMovimiento);

  // Cálculo de expresiones en campos de monto (ej: 4000+5000 → 9000)
  activarCalculoMonto("mov-monto", "mov-monto-calc");
  activarCalculoMonto("mov-monto-transferencia", "mov-monto-transf-calc");

  // Repoblar gastos fijos cuando cambia la fecha (el check usa el mes de la fecha seleccionada)
  document.getElementById("mov-fecha")?.addEventListener("change", () => {
    if (document.getElementById("mov-categoria").value === "Gasto fijo") {
      poblarSelectGastosFijos();
    }
  });

  // Live validation: filtrar cajas con fondos suficientes al escribir el monto
  document.getElementById("mov-monto")?.addEventListener("input", () => {
    const catVal = document.getElementById("mov-categoria").value;
    const monto  = evaluarMonto(document.getElementById("mov-monto").value) || 0;
    const warn   = document.getElementById("mov-fondos-warn");

    if (catVal !== "Ingreso" && catVal !== "Transferencia") {
      // Repoblar select mostrando solo cajas con fondos suficientes
      poblarSelectCajas("mov-caja", monto > 0 ? monto : 0);
    }

    const cajaId = document.getElementById("mov-caja").value;
    if (!cajaId || catVal === "Ingreso" || catVal === "Transferencia") {
      if (warn) warn.classList.add("hidden");
      return;
    }
    const saldo = Math.max(0, calcularSaldoCaja(cajaId));
    if (warn) {
      if (monto > saldo) {
        warn.textContent = `⚠️ Fondos insuficientes · Disponible: ${formatMonto(saldo)}`;
        warn.classList.remove("hidden");
      } else {
        warn.classList.add("hidden");
      }
    }
  });

  document.getElementById("mov-caja")?.addEventListener("change", () => {
    const cajaId = document.getElementById("mov-caja").value;
    const catVal = document.getElementById("mov-categoria").value;
    const montoEl = document.getElementById("mov-monto");
    const saldoEl = document.getElementById("mov-saldo-disponible");
    const warn    = document.getElementById("mov-fondos-warn");
    if (!cajaId || catVal === "Ingreso" || catVal === "Transferencia") {
      if (saldoEl) saldoEl.classList.add("hidden");
      return;
    }
    const saldo = Math.max(0, calcularSaldoCaja(cajaId));
    if (saldoEl) {
      saldoEl.textContent = `Disponible: ${formatMonto(saldo)}`;
      saldoEl.classList.remove("hidden");
    }
    if (warn) warn.classList.add("hidden");
    // Cap existing value
    if (montoEl && parseFloat(montoEl.value) > saldo) {
      montoEl.value = "";
      if (warn) { warn.textContent = `⚠️ Fondos insuficientes · Disponible: ${formatMonto(saldo)}`; warn.classList.remove("hidden"); }
    }
  });

  document.getElementById("cat-btn-group").addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-btn");
    if (!btn) return;
    document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("mov-categoria").value = btn.dataset.value;
    actualizarCampoConcepto();
    // Al cambiar categoría, resetear el filtro de cajas según monto actual
    const cat   = btn.dataset.value;
    const monto = evaluarMonto(document.getElementById("mov-monto").value) || 0;
    if (cat === "Ingreso" || cat === "Transferencia") {
      poblarSelectCajas("mov-caja");
    } else {
      poblarSelectCajas("mov-caja", monto > 0 ? monto : 0);
    }
  });

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

  // Fotos en nuevo movimiento
  setupFotosListeners();

  // Cerrar modal al clic fuera
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  });
  setupTopbarMenu();
}

// ---- LÓGICA CONCEPTO DINÁMICO ----
function poblarSelectGastosFijos() {
  const sel = document.getElementById("mov-concepto-fijo");
  const editId = document.getElementById("modal-movimiento").dataset.editId;

  // Usar el mes de la fecha seleccionada en el formulario, no el mes de hoy
  const fechaInput = document.getElementById("mov-fecha");
  const mesFecha = fechaInput && fechaInput.value ? fechaInput.value.slice(0, 7) : new Date().toISOString().slice(0, 7);

  // Conceptos ya registrados en el mes de la fecha seleccionada
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

  const todosLosFijos = [...GASTOS_FIJOS, ...conceptosPrestamos];

  sel.innerHTML = `<option value="">Selecciona un gasto fijo...</option>` +
    todosLosFijos.map(c => {
      const yaPagado = pagadosEnFecha.has(c);
      // No bloquear: solo mostrar indicador visual de que ya está registrado este mes
      return `<option value="${c}">${yaPagado ? "✓ " : ""}${c}${yaPagado ? " (ya registrado)" : ""}</option>`;
    }).join("");
}

function actualizarCampoConcepto() {
  const cat = document.getElementById("mov-categoria").value;
  const fijo         = document.getElementById("mov-concepto-fijo");
  const variable     = document.getElementById("wrap-concepto-variable");
  const ingreso      = document.getElementById("mov-concepto-ingreso");
  const placeholder  = document.getElementById("concepto-placeholder");
  const rowNormal    = document.getElementById("row-caja-normal");
  const rowTransfer  = document.getElementById("row-transferencia");
  const grupoConcept = document.getElementById("grupo-concepto");

  fijo.classList.add("hidden");
  variable.classList.add("hidden");
  ingreso.classList.add("hidden");
  placeholder.classList.add("hidden");

if (cat === "Transferencia") {
    rowNormal.classList.add("hidden");
    rowTransfer.classList.remove("hidden");
    grupoConcept.classList.add("hidden");
  poblarSelectCajas("mov-caja-origen");
poblarSelectCajas("mov-caja-destino");
document.getElementById("row-tipo-cambio").style.display = "none";
document.getElementById("mov-tipo-cambio").value = "";
document.getElementById("tc-preview").textContent = "";
setupTipoCambioListeners();
  }
  else {
    rowNormal.classList.remove("hidden");
    rowTransfer.classList.add("hidden");
    grupoConcept.classList.remove("hidden");
  if (cat === "Gasto fijo") {
      fijo.classList.remove("hidden");
      poblarSelectGastosFijos();
      fijo.focus();
    }
    
else if (cat === "Gasto variable") {
  variable.classList.remove("hidden");
  // Poblar datalist con GASTOS_VARIABLES
  const dl = document.getElementById("lista-variables");
  dl.innerHTML = GASTOS_VARIABLES.map(v => `<option value="${v}"/>`).join("");
  document.getElementById("mov-concepto-variable").focus();
}
  
  else if (cat === "Ingreso") {
      ingreso.classList.remove("hidden");
      ingreso.focus();
    } else {
      placeholder.classList.remove("hidden");
    }
  }
}

function getConceptoActivo() {
  const cat = document.getElementById("mov-categoria").value;
  if (cat === "Gasto fijo")     return document.getElementById("mov-concepto-fijo").value;
  if (cat === "Gasto variable") return document.getElementById("mov-concepto-variable").value.trim();
  if (cat === "Ingreso")        return document.getElementById("mov-concepto-ingreso").value.trim();
  return "";
}

function setConceptoActivo(valor) {
  const cat = document.getElementById("mov-categoria").value;
  if (cat === "Gasto fijo")     document.getElementById("mov-concepto-fijo").value = valor;
  if (cat === "Gasto variable") document.getElementById("mov-concepto-variable").value = valor;
  if (cat === "Ingreso")        document.getElementById("mov-concepto-ingreso").value = valor;
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

async function cargarTodo(reintentando = false) {
  try {
    // Cajas y movimientos son lecturas independientes → en paralelo (antes
    // eran 2 round-trips secuenciales a la API de Sheets).
    [cajas, movimientos] = await Promise.all([Sheets.getCajas(), Sheets.getMovimientos()]);
    renderCajas();
    renderMovimientos();
    poblarFiltrosCajas();

    // Presupuesto, proyección y préstamos tampoco dependen entre sí → en
    // paralelo. Cada una atrapa sus propios errores internamente, así que
    // un fallo aislado no tumba a las demás. Cronología sí depende de que
    // el presupuesto ya esté cargado, así que va después de este bloque.
    await Promise.all([
      cargarPresupuesto(),
      cargarProyeccion(),
      cargarPrestamos()
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
        if (renovado) { await cargarTodo(true); return; }
      }
      // La renovación vía Worker puede fallar si este dispositivo nunca se
      // conectó con Google (sin sessionToken guardado) o si el refresh_token
      // guardado dejó de servir (contraseña cambiada, acceso revocado). En
      // vez de un toast que desaparece y deja a la app sin forma de
      // recuperarse, se deja un botón fijo para reconectar con un toque.
      SyncManager.mostrarToast("📴 No se pudo renovar la sesión — mostrando datos guardados", "warn");
      mostrarReconectar();
      return;
    }

    if (err.message === "TIMEOUT") {
      SyncManager.mostrarToast("⏱️ Conexión lenta — mostrando datos en caché", "warn");
    } else {
      SyncManager.mostrarToast("📴 Sin conexión — mostrando datos guardados", "warn");
    }

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

// Clasifica la caja por nombre y retorna la clase de color del badge
function cajaBadgeClass(nombre) {
  const n = nombre.toLowerCase();
  if (/luni|bonita|yei/.test(n))                    return "badge-persona-luni";
  if (/ahorro|meta|objetivo/.test(n))                return "badge-ahorro";
  if (/choco|roy|royer/.test(n))                   return "badge-persona-roy";
  if (/emergencia|imprevisto/.test(n))               return "badge-emergencia";
  return "badge-otro";
}

// Color de fondo pastel según el nombre de la caja (tarjetas y selects de caja)
function cajaColorFondo(nombre) {
  const n = (nombre || "").toLowerCase();
  if (n.includes("luni"))  return "rgba(241,176,255,0.1)"; // rosa/lila pastel, muy transparente
  if (n.includes("choco")) return "rgba(215,255,218,0.1)"; // verde pastel, muy transparente
  return "#ffffff";
}

function renderCajas() {
  const grid = document.getElementById("cajas-grid");
  if (cajas.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🏦</div>
      <div class="empty-state-text">No tienes cajas aún. Crea una para empezar.</div></div>`;
    return;
  }
  grid.innerHTML = cajas.map(c => {
    const saldoReal = calcularSaldoCaja(c.nombre);
    const saldo     = Math.max(0, saldoReal);
    const badgeClass = cajaBadgeClass(c.nombre);
    const colorFondo = cajaColorFondo(c.nombre);
    const requiereAjuste = saldoReal < 0;
    return `<div class="caja-card" style="background-color:${colorFondo}" onclick="abrirDetalleCaja('${c.nombre.replace(/'/g, "\\'")}')" title="Ver movimientos de esta caja">
      <div class="caja-card-top">
        <span class="caja-moneda-badge ${badgeClass}">${c.moneda}</span>
        ${requiereAjuste ? `<span class="caja-alerta-ajuste" title="El saldo real es negativo">⚠️ Requiere ajuste</span>` : ""}
      </div>
      <div class="caja-nombre">${c.nombre}</div>
      <div class="caja-saldo positivo">${formatMonto(saldo, c.moneda)}</div>
    </div>`;
  }).join("");
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
        <span class="detalle-real-item-caja">${ICONOS[m.concepto] || (esEntrada ? "💰" : "📌")} ${m.concepto}</span>
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

  document.getElementById("detalle-caja-titulo").textContent = nombre;
  document.getElementById("detalle-caja-resumen").innerHTML = `
    <span style="color:var(--green)">▲ Entradas: ${formatMonto(totalEntradas, moneda)}</span>
    <span style="color:var(--red)">▼ Salidas: ${formatMonto(totalSalidas, moneda)}</span>
    <span style="font-weight:700">Saldo: ${formatMonto(totalEntradas - totalSalidas, moneda)}</span>
    ${botonAjustar}
  `;
  document.getElementById("detalle-caja-body").innerHTML = cuerpo;
  document.getElementById("modal-detalle-caja").classList.remove("hidden");
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
    document.getElementById("modal-detalle-caja").classList.add("hidden");
    await cargarTodo();
  } catch (err) {
    alert("Error ajustando la caja: " + err.message);
    if (btn) { btn.textContent = "Ajustar"; btn.disabled = false; }
  }
}

function calcularSaldoCaja(nombreCaja) {
  return movimientos
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
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-text">No hay movimientos para este período.</div></div>`;
    return;
  }

  list.innerHTML = filtrados.map(m => {
    const esIngreso  = m.categoria === "Ingreso";
    const esTransfer = m.categoria === "Transferencia";
    const esEntrada  = esIngreso || (esTransfer && m.concepto.startsWith("Transferencia ←"));
    const cls   = esEntrada ? "ingreso" : "gasto";
    const signo = esEntrada ? "+" : "-";
    const icono = ICONOS[m.concepto] || (esIngreso ? "💰" : "📌");
    const fechaFmt = new Date(m.fecha + "T12:00:00").toLocaleDateString("es-CO",
      { day: "2-digit", month: "short", year: "numeric" });
    const catCls = m.categoria.toLowerCase().replace(/ /g,"");
    const descHTML = m.descripcion
      ? `<span class="mov-desc-inline">· ${escapeHtml(m.descripcion)}</span>` : "";
    const primeraFoto = m.recibo ? m.recibo.split(",")[0].trim() : "";
    const fotoHTML = primeraFoto
      ? `<span class="mov-card-foto-icono" title="Tiene foto adjunta" onclick="event.stopPropagation();abrirFotoMovimiento('${primeraFoto}')" onpointerup="event.stopPropagation()">📎</span>`
      : "";

    return `<div class="mov-card" onpointerup="tapMovimiento('${m.id}')">
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
          <div class="mov-card-actions">
            <button class="btn-accion btn-editar" title="Editar" onclick="event.stopPropagation();abrirEditarMovimiento('${m.id}')" onpointerup="event.stopPropagation()">✏️</button>
            <button class="btn-accion btn-borrar" title="Borrar" onclick="event.stopPropagation();borrarMovimiento('${m.id}')" onpointerup="event.stopPropagation()">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

// Doble tap/clic manual sobre una tarjeta de movimiento: no se puede usar
// ondblclick porque el bloqueo de zoom (touchend -> preventDefault en index.html)
// suprime la síntesis nativa de click/dblclick en Safari iOS real, aunque
// funcione con .dblclick() de Playwright (que no pasa por ese camino táctil).
let ultimoTapMov = { id: null, tiempo: 0 };
function tapMovimiento(id) {
  const ahora = Date.now();
  if (ultimoTapMov.id === id && ahora - ultimoTapMov.tiempo < 400) {
    ultimoTapMov = { id: null, tiempo: 0 };
    mostrarResumenMovimiento(id);
  } else {
    ultimoTapMov = { id, tiempo: ahora };
  }
}

// Resumen de solo lectura de un movimiento (doble clic sobre su tarjeta).
function mostrarResumenMovimiento(id) {
  const m = movimientos.find(x => x.id === id);
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
    ? `<a class="foto-thumb resumen-mov-foto" href="#" title="Cargando…">
        <img class="foto-thumb-img" alt="foto del movimiento"/>
      </a>`
    : "";

  document.getElementById("resumen-mov-titulo").textContent = m.concepto || "Sin concepto";
  document.getElementById("resumen-mov-body").innerHTML = `
    <div class="detalle-real-item"><span class="detalle-real-item-caja">Caja</span><span>${escapeHtml(m.caja)}</span></div>
    <div class="detalle-real-item"><span class="detalle-real-item-caja">Fecha</span><span>${fechaFmt}</span></div>
    <div class="detalle-real-item"><span class="detalle-real-item-caja">Categoría</span><span>${escapeHtml(m.categoria)}</span></div>
    <div class="detalle-real-item"><span class="detalle-real-item-caja">Monto</span>
      <span class="detalle-real-item-monto" style="color:${esEntrada ? "var(--green-dark)" : "var(--text)"}">${esEntrada ? "+" : "-"}${formatMonto(Math.abs(m.monto), moneda)}</span>
    </div>
    ${m.descripcion ? `<div class="detalle-real-item"><span class="detalle-real-item-caja">Descripción</span><span>${escapeHtml(m.descripcion)}</span></div>` : ""}
    ${fotoHTML}
  `;
  document.getElementById("modal-resumen-movimiento").classList.remove("hidden");

  if (primeraFoto) {
    const link = document.querySelector(".resumen-mov-foto");
    Sheets.obtenerBlobUrlDrive(Sheets.idDesdeUrlDrive(primeraFoto)).then((blobUrl) => {
      if (!link) return;
      link.href = blobUrl; link.target = "_blank"; link.rel = "noopener";
      link.title = "Ver foto completa";
      link.querySelector("img").src = blobUrl;
    }).catch((err) => {
      if (link) link.title = "No se pudo cargar la foto: " + err.message;
    });
  }
}

// ---- GUARDAR / ACTUALIZAR MOVIMIENTO ----

function setupTipoCambioListeners() {
  const rowTC   = document.getElementById("row-tipo-cambio");
  const tcOrig  = document.getElementById("tc-moneda-origen");
  const tcDest  = document.getElementById("tc-moneda-destino");
  const tcInput = document.getElementById("mov-tipo-cambio");
  const preview = document.getElementById("tc-preview");
  const monto   = document.getElementById("mov-monto-transferencia");

  // Eliminar listeners duplicados clonando los selects
  const origenViejo  = document.getElementById("mov-caja-origen");
  const destinoViejo = document.getElementById("mov-caja-destino");
  const newOrigen    = origenViejo.cloneNode(true);
  const newDestino   = destinoViejo.cloneNode(true);
  origenViejo.parentNode.replaceChild(newOrigen, origenViejo);
  destinoViejo.parentNode.replaceChild(newDestino, destinoViejo);

  // Repoblar después de clonar
  poblarSelectCajas("mov-caja-origen");
  poblarSelectCajas("mov-caja-destino");

  function verificarMonedas() {
    const origenVal   = document.getElementById("mov-caja-origen").value;
    const destinoVal  = document.getElementById("mov-caja-destino").value;
    const cajaOrigen  = cajas.find(c => c.nombre === origenVal);
    const cajaDestino = cajas.find(c => c.nombre === destinoVal);
    if (!cajaOrigen || !cajaDestino) { rowTC.style.display = "none"; return; }
    if (cajaOrigen.moneda !== cajaDestino.moneda) {
      rowTC.style.display = "";
      tcOrig.textContent  = cajaOrigen.moneda;
      tcDest.textContent  = cajaDestino.moneda;
    } else {
      rowTC.style.display = "none";
    }
    actualizarPreview();
  }

  function actualizarPreview() {
    const origenVal   = document.getElementById("mov-caja-origen").value;
    const destinoVal  = document.getElementById("mov-caja-destino").value;
    const cajaOrigen  = cajas.find(c => c.nombre === origenVal);
    const cajaDestino = cajas.find(c => c.nombre === destinoVal);
    const m  = parseFloat(monto.value);
    const tc = parseFloat(tcInput.value);
    if (!cajaOrigen || !cajaDestino || !m || !tc) { preview.textContent = ""; return; }
    if (cajaOrigen.moneda === cajaDestino.moneda)  { preview.textContent = ""; return; }
    const resultado = m * tc;
    preview.textContent = `→ Se acreditarán ${new Intl.NumberFormat("es-CO", {
      style: "currency", currency: cajaDestino.moneda,
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(resultado)} en ${destinoVal}`;
  }

  document.getElementById("mov-caja-origen").addEventListener("change", verificarMonedas);
  document.getElementById("mov-caja-destino").addEventListener("change", verificarMonedas);
  tcInput.addEventListener("input", actualizarPreview);
  monto.addEventListener("input", actualizarPreview);
}

// Sube fotos pendientes a Drive (si hay conexión) y arma el valor final del campo "recibo".
// reciboExistente: lo que ya tenía el movimiento (para conservarlo al editar).
// Devuelve null si no hay que tocar el recibo (sin fotos nuevas, sin conexión, o falló la subida).
async function resolverReciboConNuevasFotos(fecha, concepto, caja, reciboExistente = "") {
  if (pendingFotos.length === 0) return null;
  if (!navigator.onLine) {
    SyncManager.mostrarToast("📴 Sin conexión — se guarda sin la foto nueva");
    return null;
  }
  try {
    const nuevos = await subirFotosPendientesADrive(fecha, concepto, caja);
    return reciboExistente ? `${reciboExistente},${nuevos}` : nuevos;
  } catch (err) {
    if (err.message === "DRIVE_SIN_PERMISO") {
      alert("Necesitas volver a iniciar sesión para subir archivos a Drive (se agregó un permiso nuevo). Cierra sesión y entra de nuevo — el movimiento se guardará sin la foto por ahora.");
    } else if (err.message === "DRIVE_SIN_PERMISO_PUBLICO") {
      alert("La foto se subió a Drive, pero Google no dejó hacerla visible con el link (puede ser una restricción de tu cuenta/organización). El movimiento se guardará sin la foto por ahora.");
    } else {
      alert("No se pudo subir la foto a Drive — el movimiento se guardará sin la foto nueva.");
    }
    return null;
  }
}

async function guardarMovimiento() {
  const editId = document.getElementById("modal-movimiento").dataset.editId;

  if (editId) {
    const fecha       = document.getElementById("mov-fecha").value;
    const categoria   = document.getElementById("mov-categoria").value;
    const descripcion = document.getElementById("mov-descripcion").value.trim();
    const concepto    = getConceptoActivo();
    const caja        = document.getElementById("mov-caja").value;
    const monto       = evaluarMonto(document.getElementById("mov-monto").value);

    if (!fecha || !categoria || !concepto || !caja || !monto) {
      alert("Completa todos los campos obligatorios");
      return;
    }


const btn = document.getElementById("btn-guardar-mov");
if (!btn) return;
btn.textContent = "Guardando..."; btn.disabled = true;

    try {
      const movActual = movimientos.find(x => x.id === editId);
      const recibo = await resolverReciboConNuevasFotos(fecha, concepto, caja, movActual?.recibo || "");
      await Sheets.editarMovimiento(editId, fecha, concepto, categoria, caja, monto, descripcion, recibo);
      delete document.getElementById("modal-movimiento").dataset.editId;
      document.getElementById("modal-movimiento").classList.add("hidden");
      limpiarFormMov();

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
    } catch (err) {
      alert("Error actualizando: " + err.message);

    }
    return;
  }

  const fecha       = document.getElementById("mov-fecha").value;
  const categoria   = document.getElementById("mov-categoria").value;
  const descripcion = document.getElementById("mov-descripcion").value.trim();

  if (!fecha || !categoria) { alert("Completa todos los campos obligatorios"); return; }


const btn = document.getElementById("btn-guardar-mov");
if (!btn) return;
btn.textContent = "Guardando..."; btn.disabled = true;

  try {

    let recibo = "";
    if (pendingFotos.length > 0) {
      const fotoConc = categoria === "Transferencia"
        ? `Transferencia-${document.getElementById("mov-caja-origen").value}`
        : getConceptoActivo();
      const fotoCaja = categoria === "Transferencia"
        ? document.getElementById("mov-caja-origen").value
        : document.getElementById("mov-caja").value;
      recibo = (await resolverReciboConNuevasFotos(fecha, fotoConc, fotoCaja)) || "";
    }

    if (categoria === "Transferencia") {
  const origen  = document.getElementById("mov-caja-origen").value;
  const destino = document.getElementById("mov-caja-destino").value;
  const monto   = evaluarMonto(document.getElementById("mov-monto-transferencia").value);
  const rowTC   = document.getElementById("row-tipo-cambio");
  const tipoCambio = parseFloat(document.getElementById("mov-tipo-cambio").value);
  const cajaOrigen  = cajas.find(c => c.nombre === origen);
  const cajaDestino = cajas.find(c => c.nombre === destino);

  if (!origen || !destino || !monto) {
    alert("Completa origen, destino y monto de la transferencia");
    return;
  }
  if (origen === destino) {
    alert("La caja origen y destino no pueden ser la misma");
    return;
  }

  const monedasDiferentes = cajaOrigen && cajaDestino && cajaOrigen.moneda !== cajaDestino.moneda;
  if (monedasDiferentes && (!tipoCambio || tipoCambio <= 0)) {
    alert("Las cuentas tienen monedas diferentes. Ingresa el tipo de cambio.");
    return;
  }

  const montoDestino = monedasDiferentes ? monto * tipoCambio : monto;
  const descOrigen   = monedasDiferentes
    ? `TC: 1 ${cajaOrigen.moneda} = ${tipoCambio} ${cajaDestino.moneda}${descripcion ? " — " + descripcion : ""}`
    : descripcion;

  await Sheets.agregarMovimiento(
    currentUser.email, fecha,
    `Transferencia → ${destino}`,
    "Transferencia", origen, monto, descOrigen, recibo
  );
  await Sheets.agregarMovimientoIngreso(
    currentUser.email, fecha,
    `Transferencia ← ${origen}`,
    "Transferencia", destino, montoDestino, descOrigen
  );
}

    else {

let concepto = getConceptoActivo();
const caja   = document.getElementById("mov-caja").value;
const monto  = evaluarMonto(document.getElementById("mov-monto").value);
if (!concepto || !caja || !monto) {
  alert("Completa todos los campos obligatorios");
  return;
}

// Validar fondos suficientes para gastos y transferencias
if (categoria !== "Ingreso") {
  const saldoCaja = Math.max(0, calcularSaldoCaja(caja));
  if (monto > saldoCaja) {
    alert(`⚠️ Fondos insuficientes en "${caja}"\nSaldo disponible: ${formatMonto(saldoCaja)}\nMonto solicitado: ${formatMonto(monto)}`);
    const btn2 = document.getElementById("btn-guardar-mov");
    if (btn2) { btn2.textContent = "Guardar"; btn2.disabled = false; }
    return;
  }
}

// Si es gasto variable y el concepto no está en la lista, guardar "Otros" y mover a descripción
if (categoria === "Gasto variable" && !GASTOS_VARIABLES.includes(concepto)) {
  const descripcionFinal = descripcion ? concepto + " — " + descripcion : concepto;
  await Sheets.agregarMovimiento(currentUser.email, fecha, "Otros", categoria, caja, monto, descripcionFinal, recibo);
} else {
  await Sheets.agregarMovimiento(currentUser.email, fecha, concepto, categoria, caja, monto, descripcion, recibo);
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

    document.getElementById("modal-movimiento").classList.add("hidden");
    limpiarFormMov();

    if (!navigator.onLine) {
      renderMovimientos();
      renderCajas();
    } else {
      await cargarTodo();
    }
  } catch (err) {
    if (err.message && !err.message.includes("Cannot set properties of null")) {
      alert("Error guardando el movimiento: " + err.message);
    }

  }
}

// ---- EDITAR MOVIMIENTO ----

function abrirEditarMovimiento(id) {
  const m = movimientos.find(x => x.id === id);
  if (!m) return;

  document.getElementById("modal-movimiento").classList.remove("hidden");
  poblarSelectCajas("mov-caja");

  document.getElementById("mov-fecha").value       = m.fecha;
  document.getElementById("mov-categoria").value = m.categoria;
  document.querySelectorAll(".cat-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.value === m.categoria);
  });
  document.getElementById("mov-descripcion").value = m.descripcion;
  actualizarCampoConcepto();
  setConceptoActivo(m.concepto);

  if (m.categoria !== "Transferencia") {
    document.getElementById("mov-caja").value  = m.caja;
    document.getElementById("mov-monto").value = Math.abs(m.monto).toLocaleString("es-CO");
    refrescarSelectorCaja("mov-caja");
  }

  renderFotosExistentes(m.recibo);

  document.getElementById("modal-movimiento").dataset.editId = id;
  document.getElementById("btn-guardar-mov").textContent = "Actualizar";
}

// Muestra las fotos ya guardadas en Drive (solo lectura) al editar un movimiento
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

async function renderFotosExistentes(recibo) {
  const cont = document.getElementById("fotos-existentes");
  if (!cont) return;
  const urls = (recibo || "").split(",").map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) { cont.innerHTML = ""; return; }

  cont.innerHTML = urls.map(() => `
    <a class="foto-thumb" href="#" title="Cargando…">
      <img class="foto-thumb-img" alt="foto guardada"/>
    </a>
  `).join("");

  const links = cont.querySelectorAll("a.foto-thumb");
  for (let i = 0; i < urls.length; i++) {
    try {
      const blobUrl = await Sheets.obtenerBlobUrlDrive(Sheets.idDesdeUrlDrive(urls[i]));
      links[i].href = blobUrl;
      links[i].target = "_blank";
      links[i].rel = "noopener";
      links[i].title = "Ver foto completa";
      links[i].querySelector("img").src = blobUrl;
    } catch (err) {
      links[i].title = "No se pudo cargar la foto: " + err.message;
    }
  }
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

function poblarSelectCajas(selectId, montoMinimo = 0) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  if (cajas.length === 0) {
    try {
      const cacheC = localStorage.getItem("cache_cajas");
      if (cacheC) cajas = JSON.parse(cacheC);
    } catch {}
  }

  const valorPrevio = sel.value;
  let cajasDisp = cajas;
  if (montoMinimo > 0) {
    cajasDisp = cajas.filter(c => calcularSaldoCaja(c.nombre) >= montoMinimo);
  }

  sel.innerHTML = `<option value="">Selecciona una caja</option>` +
    cajasDisp.map(c =>
      `<option value="${c.nombre}" style="background-color:${cajaColorFondo(c.nombre)}">${c.nombre} (${c.moneda})</option>`
    ).join("");

  if (valorPrevio && cajasDisp.find(c => c.nombre === valorPrevio)) {
    sel.value = valorPrevio;
  }

  // El <select> nativo no respeta el color de fondo de las <option> en iOS,
  // así que se arma un selector propio encima para que los colores sí se vean.
  refrescarSelectorCaja(selectId);
}

// ---- SELECTOR DE CAJA CON COLOR (reemplazo visual del <select> nativo) ----

function refrescarSelectorCaja(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;

  let picker = sel.nextElementSibling;
  if (!picker || !picker.classList.contains("caja-picker")) {
    sel.style.display = "none";
    picker = document.createElement("div");
    picker.className = "caja-picker";
    picker.innerHTML = `
      <button type="button" class="caja-picker-toggle input caja-picker-placeholder">Selecciona una caja</button>
      <div class="caja-picker-panel hidden"></div>
    `;
    sel.insertAdjacentElement("afterend", picker);

    picker.querySelector(".caja-picker-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      const panel = picker.querySelector(".caja-picker-panel");
      const abierto = !panel.classList.contains("hidden");
      document.querySelectorAll(".caja-picker-panel").forEach(p => p.classList.add("hidden"));
      panel.classList.toggle("hidden", abierto);
    });
  }

  const toggle = picker.querySelector(".caja-picker-toggle");
  const panel  = picker.querySelector(".caja-picker-panel");

  const opciones = Array.from(sel.options).filter(o => o.value !== "");
  panel.innerHTML = opciones.length
    ? opciones.map(o => `
        <button type="button" class="caja-picker-option" data-value="${o.value.replace(/"/g, "&quot;")}"
          style="background-color:${cajaColorFondo(o.value)}">${o.textContent}</button>
      `).join("")
    : `<div class="caja-picker-empty">Sin cajas disponibles</div>`;

  panel.querySelectorAll(".caja-picker-option").forEach(btn => {
    btn.addEventListener("click", () => {
      sel.value = btn.dataset.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      toggle.textContent = btn.textContent;
      toggle.classList.remove("caja-picker-placeholder");
      panel.classList.add("hidden");
    });
  });

  const opcionActual = opciones.find(o => o.value === sel.value);
  if (opcionActual) {
    toggle.textContent = opcionActual.textContent;
    toggle.classList.remove("caja-picker-placeholder");
  } else {
    toggle.textContent = "Selecciona una caja";
    toggle.classList.add("caja-picker-placeholder");
  }
}

// Cierra cualquier panel de selector de caja abierto al hacer clic afuera
document.addEventListener("click", () => {
  document.querySelectorAll(".caja-picker-panel").forEach(p => p.classList.add("hidden"));
});

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

function limpiarFormMov() {
  document.getElementById("mov-fecha").value = new Date().toISOString().split("T")[0];
  document.getElementById("mov-categoria").value = "";
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("mov-concepto-fijo").value = "";
  document.getElementById("mov-concepto-variable").value = "";
  document.getElementById("mov-concepto-ingreso").value = "";
  document.getElementById("mov-monto").value = "";
  document.getElementById("mov-caja").value = "";
  document.getElementById("mov-caja-origen").value = "";
  document.getElementById("mov-caja-destino").value = "";
  document.getElementById("mov-monto-transferencia").value = "";
  document.getElementById("mov-descripcion").value = "";
  refrescarSelectorCaja("mov-caja");
  refrescarSelectorCaja("mov-caja-origen");
  refrescarSelectorCaja("mov-caja-destino");

  // Limpiar fotos pendientes
  pendingFotos = [];
  renderFotosPreview();
  renderFotosExistentes("");
  const reciboFile = document.getElementById("recibo-file");
  if (reciboFile) reciboFile.value = "";
  const camaraFile = document.getElementById("camara-file");
  if (camaraFile) camaraFile.value = "";
  delete document.getElementById("modal-movimiento").dataset.editId;
  document.getElementById("btn-guardar-mov").textContent = "Guardar";
  actualizarCampoConcepto();
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
    return data[mes] || {};
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
    return data[mes] || null; // null = usar presupuesto global
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
  presupuesto.filter(p => p.montoEstimado > 0).forEach(p => { result[p.concepto] = p.montoEstimado; });
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

  // Hay huecos: mostrar modal de selección
  const modal    = document.getElementById("modal-agregar-mes");
  const opciones = document.getElementById("modal-agregar-mes-opciones");
  if (!modal || !opciones) return;

  const labelMes = (str) => new Date(str + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  opciones.innerHTML = `
    <p style="font-size:13px;color:var(--text-3);margin-bottom:4px">
      Hay ${faltantes.length} mes${faltantes.length > 1 ? "es" : ""} sin cubrir antes de ${labelMes(ultimo)}:
    </p>
    ${faltantes.map(f => `
      <button class="btn-secondary" style="justify-content:flex-start;gap:8px" data-mes-add="${f}">
        📅 Agregar <strong>${labelMes(f)}</strong>
      </button>`).join("")}
    <div style="height:1px;background:var(--border);margin:4px 0"></div>
    <button class="btn-primary" data-mes-add="${nextStr}">
      ➡️ Continuar con ${labelMes(nextStr)}
    </button>`;

  modal.classList.remove("hidden");

  opciones.querySelectorAll("[data-mes-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mesAdd = btn.dataset.mesAdd;
      if (!meses.includes(mesAdd)) {
        mesesProyeccion = [...meses, mesAdd].sort();
        saveMesesProyeccion();
      }
      modal.classList.add("hidden");
      render4MesesResumen();
    });
  });

  document.getElementById("btn-cancelar-agregar-mes").onclick = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); }, { once: true });
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
    if (p.categoria === "Gasto fijo" && !GASTOS_FIJOS.includes(p.concepto)) {
      GASTOS_FIJOS.push(p.concepto);
    } else if (p.categoria === "Gasto variable" && !GASTOS_VARIABLES.includes(p.concepto)) {
      GASTOS_VARIABLES.push(p.concepto);
    }
    if (p.icono) ICONOS[p.concepto] = p.icono;
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
function render4MesesResumen() {
  const wrap = document.getElementById("proy-4meses-wrap");
  const grid = document.getElementById("proy-4meses-grid");
  if (!wrap || !grid) return;

  const meses = getMesesProyeccion();

  grid.innerHTML = `<div class="proy-4m-grid">` + meses.map(mes => {
    const label = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
    const ingEst = totalIngresosMes(mes) || presupuesto.filter(p => p.ingresoEstimado > 0).reduce((s, p) => s + p.ingresoEstimado, 0);
    const gastosEstimados = totalGastosMes(mes);
    const excEst  = ingEst - gastosEstimados;
    const isActivo = mes === proyMesActivo;
    const puedeEliminar = meses.length > 1;

    return `<div class="proy-4m-card ${isActivo ? "proy-4m-active" : ""}" data-mes="${mes}">
      ${puedeEliminar ? `<button class="proy-4m-remove" data-mes-rm="${mes}" title="Quitar mes">×</button>` : ""}
      <button class="proy-4m-config" data-mes-config="${mes}" title="Configurar este mes">⚙️</button>
      <div class="proy-4m-mes">${label}</div>
      <div class="proy-4m-row"><span>Ingresos est.</span><strong>${formatMonto(ingEst)}</strong></div>
      <div class="proy-4m-row"><span>Gastos est.</span><strong>${formatMonto(gastosEstimados)}</strong></div>
      <div class="proy-4m-row" style="color:${excEst>=0?"var(--green)":"var(--red)"}">
        <span>Excedente</span><strong>${formatMonto(excEst)}</strong>
      </div>
    </div>`;
  }).join("") + "</div>";

  // Botón agregar mes
  const btnAgregar = document.getElementById("btn-agregar-mes");
  if (btnAgregar) {
    btnAgregar.onclick = agregarMesProyeccion;
  }

  // Eliminar mes (×)
  grid.querySelectorAll(".proy-4m-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      eliminarMesProyeccion(btn.dataset.mesRm);
    });
  });

  // Configurar mes (⚙️): activa ese mes y abre su configuración
  grid.querySelectorAll(".proy-4m-config").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const mesTocado = btn.dataset.mesConfig;
      proyMesActivo = mesTocado;
      renderProyeccion();
      abrirConfigMes(mesTocado);
      document.querySelector(".card-section:has(#proy-tabla-body)")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // Un toque en la tarjeta (fuera de los botones) activa ese mes de una vez
  // y baja a la tabla — sin depender de doble clic/temporizadores, que
  // fallaban si una sincronización de fondo volvía a dibujar las tarjetas
  // justo entre el primer y el segundo toque.
  grid.querySelectorAll(".proy-4m-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".proy-4m-remove, .proy-4m-config")) return;
      proyMesActivo = card.dataset.mes;
      renderProyeccion();
      document.querySelector(".card-section:has(#proy-tabla-body)")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// ---- CONFIG DE MES (doble clic) ----
function abrirConfigMes(mes) {
  const modal  = document.getElementById("modal-config-mes");
  const titulo = document.getElementById("modal-config-mes-titulo");
  const body   = document.getElementById("modal-config-mes-body");
  if (!modal) return;

  const mesLabel = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const mesPrevLabel = new Date(getMesAnterior(mes) + "-15").toLocaleDateString("es-CO", { month: "long" });
  titulo.textContent = `Proyección · ${mesLabel}`;

  const fuentes  = getIngresosMesParaEditor(mes);
  const gastosMes = getGastosMesParaEditor(mes);
  const FUENTES  = FUENTES_INGRESO;
  const todasCat = [
    ...GASTOS_FIJOS.map(c => ({ categoria: "Gasto fijo", concepto: c })),
    ...GASTOS_VARIABLES.map(c => ({ categoria: "Gasto variable", concepto: c })),
  ];

  const hayDatosMesAnterior = Object.keys(getGastosMes(getMesAnterior(mes)) || {}).length > 0
    || Object.keys(getIngresosMes(getMesAnterior(mes))).length > 0;
  const esValorReferencial = !getGastosMes(mes) && !Object.keys(getIngresosMes(mes)).length;

  body.innerHTML = `
    ${esValorReferencial && hayDatosMesAnterior ? `
      <div style="background:var(--blue-soft);border-radius:10px;padding:9px 13px;font-size:12px;color:var(--blue);margin-bottom:4px">
        📋 Valores cargados desde ${mesPrevLabel} como referencia
      </div>` : ""}
    <div class="pres-seccion-title">💰 Ingresos estimados</div>
    ${FUENTES.map(f => `
      <div class="pres-fila">
        <span class="pres-concepto">💰 ${f}</span>
        <input class="input pres-input" type="text" inputmode="decimal" placeholder="0"
          data-tipo="ingreso" data-fuente="${f}" value="${fuentes[f] ? Number(fuentes[f]).toLocaleString("es-CO") : ""}"/>
      </div>`).join("")}

    <div class="pres-seccion-title" style="margin-top:16px">📌 Gastos fijos</div>
    ${todasCat.filter(c => c.categoria === "Gasto fijo").map(c => `
      <div class="pres-fila">
        <span class="pres-concepto">${ICONOS[c.concepto] || "📌"} ${c.concepto}</span>
        <input class="input pres-input" type="text" inputmode="decimal" placeholder="0"
          data-tipo="gasto" data-concepto="${c.concepto}" value="${gastosMes[c.concepto] ? Number(gastosMes[c.concepto]).toLocaleString("es-CO") : ""}"/>
      </div>`).join("")}

    <div class="pres-seccion-title" style="margin-top:16px">🔀 Gastos variables</div>
    ${todasCat.filter(c => c.categoria === "Gasto variable").map(c => `
      <div class="pres-fila">
        <span class="pres-concepto">${ICONOS[c.concepto] || "🔀"} ${c.concepto}</span>
        <input class="input pres-input" type="text" inputmode="decimal" placeholder="0"
          data-tipo="gasto" data-concepto="${c.concepto}" value="${gastosMes[c.concepto] ? Number(gastosMes[c.concepto]).toLocaleString("es-CO") : ""}"/>
      </div>`).join("")}
  `;

  modal.classList.remove("hidden");

  document.getElementById("btn-guardar-config-mes").onclick = () => {
    const nuevosIngresos = {};
    const nuevosGastos   = {};
    body.querySelectorAll(".pres-input").forEach(inp => {
      const v = evaluarMonto(inp.value);
      if (v > 0) {
        if (inp.dataset.tipo === "ingreso") nuevosIngresos[inp.dataset.fuente] = v;
        else nuevosGastos[inp.dataset.concepto] = v;
      }
    });
    setIngresosMes(mes, nuevosIngresos);
    setGastosMes(mes, Object.keys(nuevosGastos).length ? nuevosGastos : null);
    modal.classList.add("hidden");
    renderProyeccion();
    SyncManager.mostrarToast("✅ Proyección de " + new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long" }) + " guardada");
  };

  document.getElementById("btn-cancelar-config-mes").onclick = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); }, { once: true });
}

// Abre un modal chico para editar el estimado de un solo concepto (gasto o ingreso)
function abrirModificarConcepto(concepto, categoria) {
  const modal  = document.getElementById("modal-modificar-concepto");
  const nombre = document.getElementById("modificar-concepto-nombre");
  const input  = document.getElementById("modificar-concepto-monto");
  if (!modal) return;

  const mes     = proyMesActivo;
  const esIngreso = categoria === "Ingreso";
  const datosActuales = esIngreso ? getIngresosMesParaEditor(mes) : getGastosMesParaEditor(mes);
  const valorActual = datosActuales[concepto] || 0;

  nombre.textContent = `${ICONOS[concepto] || (esIngreso ? "💰" : "📌")} ${concepto}`;
  input.value = valorActual ? Number(valorActual).toLocaleString("es-CO") : "";
  modal.classList.remove("hidden");
  setTimeout(() => { input.focus(); input.select(); }, 60);

  document.getElementById("btn-guardar-modificar-concepto").onclick = () => {
    const nuevoValor = evaluarMonto(input.value);
    const nuevosDatos = { ...datosActuales };
    if (nuevoValor > 0) nuevosDatos[concepto] = nuevoValor;
    else delete nuevosDatos[concepto];

    if (esIngreso) {
      setIngresosMes(mes, nuevosDatos);
    } else {
      setGastosMes(mes, Object.keys(nuevosDatos).length ? nuevosDatos : null);
    }
    modal.classList.add("hidden");
    renderProyeccion();
    SyncManager.mostrarToast(`✅ ${concepto} actualizado`);
  };

  document.getElementById("btn-cancelar-modificar-concepto").onclick = () => modal.classList.add("hidden");
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

  // Ingresos estimados del mes (fuentes) — van primero en la tabla, siempre las 4 aunque estén en $0
  const ingresosMes = getIngresosMesParaEditor(proyMesActivo);
  FUENTES_INGRESO.forEach(fuente => {
    filas.push({
      categoria: "Ingreso", concepto: fuente,
      estimado: ingresosMes[fuente] || 0,
      real: Math.abs(realesPorConcepto[fuente] || 0)
    });
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
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-light)">
      No hay datos — agrega un presupuesto para ver la comparación.</td></tr>`;
    return;
  }

  filas.sort((a, b) => {
    const aIngreso = a.categoria === "Ingreso";
    const bIngreso = b.categoria === "Ingreso";
    if (aIngreso !== bIngreso) return aIngreso ? -1 : 1;
    if (a.estimado > 0 && b.estimado === 0) return -1;
    if (a.estimado === 0 && b.estimado > 0) return 1;
    return a.categoria.localeCompare(b.categoria);
  });

  tbody.innerHTML = filas.map(f => {
    // Gastos: rojo si te pasaste de lo estimado. Ingresos: al revés — rojo
    // si no llegaste a lo estimado (la meta de ingreso no se cumplió).
    const excedido = f.categoria === "Ingreso"
      ? f.real < f.estimado
      : f.real > f.estimado;

    return `<tr class="proy-tabla-row${excedido ? " fila-excedida" : ""}" data-concepto="${f.concepto.replace(/"/g, "&quot;")}" data-categoria="${f.categoria.replace(/"/g, "&quot;")}" ${f.esOtros ? 'data-es-otros="1"' : ""}>
      <td>
        <div class="proy-cell-concepto">
          <span class="cat-badge cat-${f.categoria.toLowerCase().replace(/ /g,'')}">
            ${f.categoria === "Gasto fijo" ? "F" : f.categoria === "Gasto variable" ? "V" : f.categoria.charAt(0)}
          </span>
          <span class="proy-concepto-nombre">${ICONOS[f.concepto] || "📌"} ${f.concepto}</span>
        </div>
      </td>
      <td class="proy-cell-num">${f.estimado > 0 ? formatMonto(f.estimado) : "—"}</td>
      <td class="proy-cell-num">${f.real !== 0 ? formatMonto(f.real) : "—"}</td>
      <td>
        <div class="proy-cell-acciones">
          ${f.esOtros ? "" : `<button type="button" class="btn-icono-fila btn-modificar-fila" title="Modificar" onclick="abrirModificarConcepto('${f.concepto.replace(/'/g, "\\'")}', '${f.categoria.replace(/'/g, "\\'")}')">✏️</button>`}
          ${(f.categoria === "Gasto fijo" || f.categoria === "Gasto variable") ? `<button type="button" class="btn-icono-fila btn-eliminar-fila" title="Eliminar concepto" onclick="eliminarConceptoPresupuesto('${f.concepto.replace(/'/g, "\\'")}', '${f.categoria.replace(/'/g, "\\'")}')">🗑️</button>` : ""}
        </div>
      </td>
    </tr>`;
  }).join("");
}

// ---- DETALLE DE MOVIMIENTOS REALES (clic en una fila) ----

function abrirDetalleRealConcepto(concepto, categoria, esOtros) {
  const mes = proyMesActivo;
  const mesLabel = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mes) && m.categoria !== "Transferencia");

  let lista, titulo;
  if (esOtros) {
    // Mismo criterio que renderTablaComparacion usa para armar la fila
    // "Otros": conceptos que no tienen estimado este mes ni son fuente de
    // ingreso, más los movimientos con el concepto "Otros" en sí (que
    // siempre caen ahí, tenga o no estimado propio configurado).
    const gastosMes = getGastosMesParaEditor(mes);
    const conocidos = new Set([
      ...Object.entries(gastosMes).filter(([, v]) => v > 0).map(([c]) => c),
      ...FUENTES_INGRESO
    ]);
    conocidos.delete("Otros");
    lista = movsDelMes.filter(m => !conocidos.has(m.concepto));
    titulo = "🗂️ Otros";
  } else {
    lista = movsDelMes.filter(m => m.concepto === concepto);
    titulo = `${ICONOS[concepto] || (categoria === "Ingreso" ? "💰" : "📌")} ${concepto}`;
  }

  document.getElementById("detalle-real-titulo").textContent = titulo;
  document.getElementById("detalle-real-subtitulo").textContent = `Movimientos reales de ${mesLabel}`;

  const cont = document.getElementById("detalle-real-lista");
  if (lista.length === 0) {
    cont.innerHTML = `<div class="detalle-real-vacio">No hay movimientos reales de este concepto en ${mesLabel}.</div>`;
  } else {
    const ordenados = [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha));
    cont.innerHTML = ordenados.map(m => {
      const fechaFmt = new Date(m.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
      const esIngreso = m.categoria === "Ingreso";
      const etiqueta = esOtros ? `${ICONOS[m.concepto] || "📌"} ${m.concepto}` : m.caja;
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

  document.getElementById("modal-detalle-real-concepto")?.classList.remove("hidden");
}

// ---- DASHBOARD DONUTS ----

function renderDashboardDonuts() {
  const container = document.getElementById("proy-donuts");
  if (!container) return;

  const mes = proyMesActivo || new Date().toISOString().slice(0, 7);
  const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mes));

  const fijoEst = presupuesto
    .filter(p => p.categoria === "Gasto fijo" && p.montoEstimado > 0)
    .reduce((s, p) => s + p.montoEstimado, 0);

  const variableEst = presupuesto
    .filter(p => p.categoria === "Gasto variable" && p.montoEstimado > 0)
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

// ---- MODAL PRESUPUESTO ----

function abrirModalPresupuesto() {
  document.getElementById("modal-presupuesto").classList.remove("hidden");
  renderFormPresupuesto();
}

function cerrarModalPresupuesto() {
  document.getElementById("modal-presupuesto").classList.add("hidden");
}

function renderFormPresupuesto() {
  const container = document.getElementById("pres-form-body");

  const todasCategorias = [
    ...GASTOS_FIJOS.map(c => ({ categoria: "Gasto fijo", concepto: c })),
    ...GASTOS_VARIABLES.map(c => ({ categoria: "Gasto variable", concepto: c })),
  ];

  const filas = todasCategorias.map(base => {
    const guardado = presupuesto.find(p => p.concepto === base.concepto);
    return { ...base, montoEstimado: guardado ? guardado.montoEstimado : 0 };
  });

  container.innerHTML = `
    <p style="font-size:12px;color:var(--text-light);margin-bottom:12px">
      💡 Los ingresos se configuran por mes en la vista de Proyección.
    </p>
    <div class="pres-seccion-title" style="margin-top:4px">📌 Gastos fijos</div>
    ${filas.filter(f => f.categoria === "Gasto fijo").map(f => `
      <div class="pres-fila">
        <span class="pres-concepto">${ICONOS[f.concepto] || "📌"} ${f.concepto}</span>
        <input class="input pres-input" type="text" inputmode="decimal" placeholder="0"
          data-tipo="gasto" data-concepto="${f.concepto}" data-categoria="Gasto fijo"
          value="${f.montoEstimado ? Number(f.montoEstimado).toLocaleString("es-CO") : ""}"/>
      </div>`).join("")}

    <div class="pres-seccion-title" style="margin-top:20px">🔀 Gastos variables</div>
    ${filas.filter(f => f.categoria === "Gasto variable").map(f => `
      <div class="pres-fila">
        <span class="pres-concepto">${ICONOS[f.concepto] || "📌"} ${f.concepto}</span>
        <input class="input pres-input" type="text" inputmode="decimal" placeholder="0"
          data-tipo="gasto" data-concepto="${f.concepto}" data-categoria="Gasto variable"
          value="${f.montoEstimado ? Number(f.montoEstimado).toLocaleString("es-CO") : ""}"/>
      </div>`).join("")}
  `;
}

async function guardarPresupuesto() {
  const inputs = document.querySelectorAll(".pres-input");
  const filas = [];

  inputs.forEach(inp => {
    const val = evaluarMonto(inp.value);
    if (!val || val <= 0) return;
    filas.push({
      categoria:       inp.dataset.categoria,
      concepto:        inp.dataset.concepto,
      montoEstimado:   inp.dataset.tipo === "gasto"   ? val : 0,
      ingresoEstimado: inp.dataset.tipo === "ingreso" ? val : 0,
    });
  });

  const btn = document.getElementById("btn-guardar-presupuesto");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    await Sheets.guardarPresupuesto(filas);
    presupuesto = filas;
    cerrarModalPresupuesto();
    renderProyeccion();
  } catch (err) {
    alert("Error guardando presupuesto: " + err.message);

  } finally {
    const btnFinal = document.getElementById("btn-guardar-presupuesto");
    if (btnFinal) { btnFinal.textContent = "Guardar presupuesto"; btnFinal.disabled = false; }
  }
}

// =============================================
// CRONOLOGÍA MENSUAL
// =============================================

// Se revisa CADA VEZ que se abre la app (no solo el día 1 del mes): busca
// todos los meses ya cerrados (anteriores al actual) que tengan movimientos
// reales pero todavía no tengan registro en la cronología, y los completa.
// Así, si no abriste la app justo el día 1, el mes anterior no se queda
// sin guardar para siempre — se pone al día en la próxima visita.
async function verificarYGuardarCronologia() {
  try {
    const mesActual = new Date().toISOString().slice(0, 7);

    const mesesConDatos = [...new Set(movimientos.map(m => m.fecha.slice(0, 7)))]
      .filter(mes => mes < mesActual)
      .sort();
    if (mesesConDatos.length === 0) return;

    const cronologiaExistente = await Sheets.getCronologia();
    const mesesYaRegistrados = new Set(cronologiaExistente.map(c => c.mes));
    const mesesFaltantes = mesesConDatos.filter(mes => !mesesYaRegistrados.has(mes));
    if (mesesFaltantes.length === 0) return;

    for (const mesStr of mesesFaltantes) {
      const movsDelMes = movimientos.filter(m => m.fecha.startsWith(mesStr));

      const fijoReal = movsDelMes
        .filter(m => m.categoria === "Gasto fijo")
        .reduce((s, m) => s + Math.abs(m.monto), 0);

      const varReal = movsDelMes
        .filter(m => m.categoria === "Gasto variable")
        .reduce((s, m) => s + Math.abs(m.monto), 0);

      const fijoEst = presupuesto
        .filter(p => p.categoria === "Gasto fijo" && p.montoEstimado > 0)
        .reduce((s, p) => s + p.montoEstimado, 0);

      const varEst = presupuesto
        .filter(p => p.categoria === "Gasto variable" && p.montoEstimado > 0)
        .reduce((s, p) => s + p.montoEstimado, 0);

      const fijoAser = fijoEst > 0 ? Math.round(((fijoReal - fijoEst) / fijoEst) * 100) : 0;
      const varAser  = varEst  > 0 ? Math.round(((varReal  - varEst)  / varEst)  * 100) : 0;

      await Sheets.guardarCronologia(mesStr, fijoAser, fijoReal, varAser, varReal);
      console.log(`✅ Cronología guardada para ${mesStr}`);
    }
  } catch (err) {
    console.error("Error guardando cronología:", err);
  }
}

async function cargarYRenderCronologia() {
  try {
    const cronologia = await Sheets.getCronologia();
    renderCronologia(cronologia);
  } catch (err) {
    if (err.message === "TOKEN_EXPIRADO") return;
    console.error("Error cargando cronología:", err);
  }
}

function renderCronologia(datos) {
  const container = document.getElementById("cronologia-wrap");
  if (!container) return;

  const ordenados = datos && datos.length > 0
    ? [...datos].sort((a, b) => b.mes.localeCompare(a.mes))
    : [];

  const filasCuerpo = ordenados.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-light);font-style:italic">
        Aún no hay registros. El primer día de cada mes se guarda automáticamente el cierre del mes anterior.
       </td></tr>`
    : ordenados.map(d => {
        const fijoClass = d.fijoAsertividad <= 0 ? "estado-ok" : "estado-mal";
        const varClass  = d.varAsertividad  <= 0 ? "estado-ok" : "estado-mal";
        const mesLabel  = new Date(d.mes + "-15").toLocaleDateString("es-CO", {
          year: "numeric", month: "long"
        });
        return `<tr class="proy-fila">
          <td class="proy-concepto" style="font-weight:600">${mesLabel}</td>
          <td class="proy-num">${formatMonto(d.fijoCantidad)}</td>
          <td class="proy-pct-cell">
            <div class="pct-wrap">
              <div class="pct-bar-bg">
                <div class="pct-bar ${fijoClass}" style="width:${Math.min(Math.abs(d.fijoAsertividad), 100)}%"></div>
              </div>
              <span class="pct-label ${fijoClass}">${d.fijoAsertividad > 0 ? "↑" : "↓"}${Math.abs(d.fijoAsertividad)}%</span>
            </div>
          </td>
          <td class="proy-num">${formatMonto(d.varCantidad)}</td>
          <td class="proy-pct-cell">
            <div class="pct-wrap">
              <div class="pct-bar-bg">
                <div class="pct-bar ${varClass}" style="width:${Math.min(Math.abs(d.varAsertividad), 100)}%"></div>
              </div>
              <span class="pct-label ${varClass}">${d.varAsertividad > 0 ? "↑" : "↓"}${Math.abs(d.varAsertividad)}%</span>
            </div>
          </td>
        </tr>`;
      }).join("");

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="proy-tabla">
        <thead>
          <tr>
            <th>Mes</th>
            <th style="text-align:right">Fijo real</th>
            <th>Asertividad fijo</th>
            <th style="text-align:right">Variable real</th>
            <th>Asertividad variable</th>
          </tr>
        </thead>
        <tbody>${filasCuerpo}</tbody>
      </table>
    </div>
  `;
}

// ---- MODAL NUEVO CONCEPTO (agregar fila al presupuesto) ----

function abrirModalNuevoConcepto() {
  const modal = document.getElementById("modal-nuevo-concepto");
  if (!modal) return;

  document.getElementById("nuevo-concepto-nombre").value = "";
  document.getElementById("nuevo-concepto-monto").value = "";
  document.getElementById("nuevo-concepto-categoria").value = "";
  document.getElementById("nuevo-concepto-icono").value = "";
  document.getElementById("nuevo-concepto-duplicado").classList.add("hidden");
  document.querySelectorAll("#nuevo-concepto-cat-group .cat-btn").forEach(b => b.classList.remove("active"));

  const dl = document.getElementById("lista-conceptos-existentes");
  dl.innerHTML = [...GASTOS_FIJOS, ...GASTOS_VARIABLES].map(c => `<option value="${c}"/>`).join("");

  modal.classList.remove("hidden");
  setTimeout(() => document.getElementById("nuevo-concepto-nombre").focus(), 60);
}

function cerrarModalNuevoConcepto() {
  document.getElementById("modal-nuevo-concepto")?.classList.add("hidden");
}

function validarNombreNuevoConcepto() {
  const nombre = document.getElementById("nuevo-concepto-nombre").value;
  const existe = conceptoYaExiste(nombre);
  document.getElementById("nuevo-concepto-duplicado").classList.toggle("hidden", !existe);
  return existe;
}

async function guardarNuevoConcepto() {
  const nombre    = document.getElementById("nuevo-concepto-nombre").value.trim();
  const categoria = document.getElementById("nuevo-concepto-categoria").value;
  const icono     = document.getElementById("nuevo-concepto-icono").value.trim();
  const monto     = evaluarMonto(document.getElementById("nuevo-concepto-monto").value);

  if (!nombre) { alert("Escribe el nombre del concepto"); return; }
  if (validarNombreNuevoConcepto()) return;
  if (!categoria) { alert("Selecciona si es gasto fijo o gasto variable"); return; }
  if (!monto || monto <= 0) { alert("Escribe el monto estimado"); return; }

  const btn = document.getElementById("btn-guardar-nuevo-concepto");
  btn.textContent = "Guardando..."; btn.disabled = true;

  try {
    const nuevaLista = [...presupuesto, { categoria, concepto: nombre, montoEstimado: monto, ingresoEstimado: 0, icono }];
    await Sheets.guardarPresupuesto(nuevaLista);
    presupuesto = nuevaLista;
    sincronizarListasConceptos();
    cerrarModalNuevoConcepto();
    renderProyeccion();
    SyncManager.mostrarToast(`✅ "${nombre}" agregado al presupuesto`);
  } catch (err) {
    alert("Error guardando el concepto: " + err.message);
  } finally {
    btn.textContent = "Guardar"; btn.disabled = false;
  }
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
    }
    renderProyeccion();
    SyncManager.mostrarToast(`🗑️ "${concepto}" eliminado del presupuesto`);
  } catch (err) {
    presupuesto = listaOriginal;
    alert("Error eliminando el concepto: " + err.message);
  }
}

// ---- SETUP LISTENERS PROYECCIÓN ----

function setupProyeccionListeners() {
  document.getElementById("btn-cancelar-presupuesto")
    ?.addEventListener("click", cerrarModalPresupuesto);
  document.getElementById("btn-guardar-presupuesto")
    ?.addEventListener("click", guardarPresupuesto);

  document.getElementById("modal-presupuesto")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-presupuesto")) cerrarModalPresupuesto();
  });

  document.getElementById("btn-agregar-concepto")
    ?.addEventListener("click", abrirModalNuevoConcepto);
  document.getElementById("btn-cancelar-nuevo-concepto")
    ?.addEventListener("click", cerrarModalNuevoConcepto);
  document.getElementById("btn-guardar-nuevo-concepto")
    ?.addEventListener("click", guardarNuevoConcepto);
  document.getElementById("nuevo-concepto-nombre")
    ?.addEventListener("input", validarNombreNuevoConcepto);
  document.getElementById("nuevo-concepto-cat-group")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-btn");
    if (!btn) return;
    document.querySelectorAll("#nuevo-concepto-cat-group .cat-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("nuevo-concepto-categoria").value = btn.dataset.value;
  });

  // Toque/clic en una fila de "Detalle por concepto" → ver los movimientos
  // reales que la componen ese mes. Un solo clic, igual que las tarjetas de
  // Cajas (abrirDetalleCaja) — nada de temporizadores de doble clic, que en
  // touch son poco confiables.
  document.getElementById("proy-tabla-body")?.addEventListener("click", (e) => {
    const row = e.target.closest(".proy-tabla-row");
    if (!row || e.target.closest("button")) return;
    abrirDetalleRealConcepto(row.dataset.concepto, row.dataset.categoria, !!row.dataset.esOtros);
  });
  document.getElementById("btn-cerrar-detalle-real")?.addEventListener("click", () => {
    document.getElementById("modal-detalle-real-concepto").classList.add("hidden");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupProyeccionListeners);
} else {
  setTimeout(setupProyeccionListeners, 0);
}

function setupTopbarMenu() {
  const btn      = document.getElementById("btn-menu");
  const dropdown = document.getElementById("dropdown-menu");
  const ddLogout = document.getElementById("dd-logout");
  const ddLogin  = document.getElementById("dd-login");
  const ddVersion = document.getElementById("dropdown-version");

  if (!btn) return;

  actualizarTextoVersion();
  if (ddVersion) {
    ddVersion.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!actualizacionDisponible) return;
      ddVersion.textContent = "Sincronizando…";
      if (typeof window.__swSincronizarAhora === "function") window.__swSincronizarAhora();
    });
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("recordatorios-panel")?.classList.add("hidden");
    const abierto = !dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", abierto);
    btn.setAttribute("aria-expanded", String(!abierto));
    actualizarDropdownUsuario();
  });

  document.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  });

  dropdown.addEventListener("click", (e) => e.stopPropagation());

  ddLogout.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    document.getElementById("btn-logout").click();
  });

  ddLogin.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    document.getElementById("btn-login").click();
  });
}

function actualizarDropdownUsuario() {
  const info     = document.getElementById("dropdown-user-info");
  const ddLogout = document.getElementById("dd-logout");
  const ddLogin  = document.getElementById("dd-login");

  if (currentUser) {
    const initials = currentUser.name
      ? currentUser.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()
      : "?";
    info.innerHTML = `
      ${currentUser.picture
        ? `<img src="${currentUser.picture}" class="dropdown-avatar" alt="avatar"/>`
        : `<div class="dropdown-avatar-placeholder">${initials}</div>`
      }
      <div style="min-width:0">
        <div class="dropdown-user-name">${currentUser.name}</div>
        <div class="dropdown-user-email">${currentUser.email}</div>
      </div>
    `;
    ddLogout.style.display = "";
    ddLogin.style.display  = "none";
  } else {
    info.innerHTML = `
      <div style="font-size:13px;color:var(--text-light);width:100%;text-align:center">
        Sin sesión activa
      </div>
    `;
    ddLogout.style.display = "none";
    ddLogin.style.display  = "";
  }
}

// =============================================
// MÓDULO RESUMEN — KPIs financieros
// =============================================

function renderResumen(mesSeleccionado = null) {
  const mes = mesSeleccionado || new Date().toISOString().slice(0, 7);

  // — Selector de mes —
  const mesesDisponibles = [...new Set(
    movimientos.map(m => m.fecha.slice(0, 7))
  )].sort((a, b) => b.localeCompare(a));

  const selectorWrap = document.getElementById("resumen-mes-selector");
  if (selectorWrap) {
    selectorWrap.innerHTML = `
      <select id="resumen-mes-select" class="mes-select">
        ${mesesDisponibles.map(m => `
          <option value="${m}" ${m === mes ? "selected" : ""}>
            ${new Date(m + "-15").toLocaleDateString("es-CO", { year: "numeric", month: "long" })}
          </option>
        `).join("")}
      </select>`;
    document.getElementById("resumen-mes-select")
      .addEventListener("change", e => renderResumen(e.target.value));
  }

  const mesLabel = new Date(mes + "-15").toLocaleDateString("es-CO", {
    year: "numeric", month: "long"
  });
  const el = document.getElementById("resumen-mes-label");
  if (el) el.textContent = mesLabel;

  const movsDelMes = movimientos.filter(m =>
    m.fecha.startsWith(mes) && m.categoria !== "Transferencia"
  );

  const ingresos = movsDelMes
    .filter(m => m.categoria === "Ingreso")
    .reduce((s, m) => s + m.monto, 0);

  const gastoFijo = movsDelMes
    .filter(m => m.categoria === "Gasto fijo")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const gastoVar = movsDelMes
    .filter(m => m.categoria === "Gasto variable")
    .reduce((s, m) => s + Math.abs(m.monto), 0);

  const gastoTotal = gastoFijo + gastoVar;

  // ── KPI 1: Potencial de ahorro ──
  const tasaAhorro = ingresos > 0 ? ((ingresos - gastoTotal) / ingresos) * 100 : null;
  const taEl = document.getElementById("kpi-tasa-ahorro-val");
  const taMeta = document.getElementById("kpi-tasa-ahorro-meta");
  const taEstado = document.getElementById("kpi-tasa-ahorro-estado");
  if (taEl) {
    if (tasaAhorro === null) {
      taEl.textContent = "Sin ingresos";
      taEstado.textContent = "⚪";
    } else {
      taEl.textContent = Math.round(tasaAhorro) + "%";
      taEl.style.color = tasaAhorro >= 20
        ? "var(--green)" : tasaAhorro >= 0
        ? "var(--yellow)" : "var(--red)";
      taMeta.textContent = tasaAhorro >= 20
        ? "✅ Buen potencial de ahorro"
        : tasaAhorro >= 0
        ? "⚠️ Margen ajustado — meta: 20% de potencial"
        : "🚨 Gastos superan ingresos";
      taEstado.textContent = tasaAhorro >= 20 ? "🟢" : tasaAhorro >= 0 ? "🟡" : "🔴";
    }
  }

  // ── KPI 2: Ratio deuda/ingreso ──
  const activosConCuota = (prestamos || []).filter(p => !p.pagado);
  const cuotasMes = activosConCuota.reduce((s, p) => {
    const concepto = conceptoPrestamo(p.nombre);
    const pagosMes = movsDelMes
      .filter(m => m.concepto === concepto)
      .reduce((x, m) => x + Math.abs(m.monto), 0);
    return s + pagosMes;
  }, 0);
  const ratioDeuda = ingresos > 0 ? (cuotasMes / ingresos) * 100 : null;
  const rdEl    = document.getElementById("kpi-ratio-deuda-val");
  const rdMeta  = document.getElementById("kpi-ratio-deuda-meta");
  const rdEstado = document.getElementById("kpi-ratio-deuda-estado");
  if (rdEl) {
    if (ratioDeuda === null) {
      rdEl.textContent = "Sin ingresos";
      rdEstado.textContent = "⚪";
    } else {
      rdEl.textContent = Math.round(ratioDeuda) + "%";
      rdEl.style.color = ratioDeuda <= 35
        ? "var(--green)" : ratioDeuda <= 50
        ? "var(--yellow)" : "var(--red)";
      rdMeta.textContent = `${formatMonto(cuotasMes)} en cuotas este mes`;
      rdEstado.textContent = ratioDeuda <= 35 ? "🟢" : ratioDeuda <= 50 ? "🟡" : "🔴";
    }
  }

  // ── KPI 3: Asertividad presupuestal ──
  const gastosEstimados = (presupuesto || [])
    .filter(p => p.montoEstimado > 0)
    .reduce((s, p) => s + p.montoEstimado, 0);
  const asEl    = document.getElementById("kpi-asertividad-val");
  const asMeta  = document.getElementById("kpi-asertividad-meta");
  const asEstado = document.getElementById("kpi-asertividad-estado");
  if (asEl) {
    if (gastosEstimados === 0) {
      asEl.textContent = "Sin presupuesto";
      asMeta.textContent = "Define tu presupuesto en Proyección";
      asEstado.textContent = "⚪";
    } else {
      const ejecucion = Math.round((gastoTotal / gastosEstimados) * 100);
      asEl.textContent = ejecucion + "%";
      asEl.style.color = ejecucion <= 80
        ? "var(--green)" : ejecucion <= 100
        ? "var(--yellow)" : "var(--red)";
      asMeta.textContent = `${formatMonto(gastoTotal)} de ${formatMonto(gastosEstimados)} estimados`;
      asEstado.textContent = ejecucion <= 80 ? "🟢" : ejecucion <= 100 ? "🟡" : "🔴";
    }
  }

  // ── KPI 4: Balance neto (suma de todas las cajas COP) ──
  const balanceNeto = cajas
    .filter(c => c.moneda === "COP")
    .reduce((s, c) => s + calcularSaldoCaja(c.nombre), 0);
  const bnEl    = document.getElementById("kpi-balance-neto-val");
  const bnMeta  = document.getElementById("kpi-balance-neto-meta");
  const bnEstado = document.getElementById("kpi-balance-neto-estado");
  if (bnEl) {
    bnEl.textContent  = formatMonto(balanceNeto);
    bnEl.style.color  = balanceNeto >= 0 ? "var(--green)" : "var(--red)";
    bnMeta.textContent = `${cajas.filter(c => c.moneda === "COP").length} cajas COP`;
    bnEstado.textContent = balanceNeto >= 0 ? "🟢" : "🔴";
  }

  // ── KPI 5 & 6: Distribución fijo vs variable ──
  const pctFijo = gastoTotal > 0 ? Math.round((gastoFijo / gastoTotal) * 100) : 0;
  const pctVar  = gastoTotal > 0 ? Math.round((gastoVar  / gastoTotal) * 100) : 0;
  const gfEl    = document.getElementById("kpi-gasto-fijo-val");
  const gfMeta  = document.getElementById("kpi-gasto-fijo-meta");
  const gfEstado = document.getElementById("kpi-gasto-fijo-estado");
  const gvEl    = document.getElementById("kpi-gasto-var-val");
  const gvMeta  = document.getElementById("kpi-gasto-var-meta");
  const gvEstado = document.getElementById("kpi-gasto-var-estado");
  if (gfEl) {
    gfEl.textContent  = pctFijo + "% del gasto";
    gfMeta.textContent = formatMonto(gastoFijo);
    gfEstado.textContent = pctFijo <= 60 ? "🟢" : pctFijo <= 75 ? "🟡" : "🔴";
    gfEl.style.color = pctFijo <= 60 ? "var(--green)" : pctFijo <= 75 ? "var(--yellow)" : "var(--red)";
  }
  if (gvEl) {
    gvEl.textContent  = pctVar + "% del gasto";
    gvMeta.textContent = formatMonto(gastoVar);
    gvEstado.textContent = "⚪";
  }

  // ── KPI 7 & 8: Gestión de deudas ──
  const totalDeudaActiva = activosConCuota.reduce((s, p) => s + p.monto, 0);
  const totalPagadoDeuda = activosConCuota.reduce((s, p) => s + calcularPagadoPrestamo(p.nombre), 0);
  const pctPagadoTotal   = totalDeudaActiva > 0
    ? Math.round((totalPagadoDeuda / totalDeudaActiva) * 100) : null;
  const dpEl    = document.getElementById("kpi-deuda-pct-val");
  const dpMeta  = document.getElementById("kpi-deuda-pct-meta");
  const dpEstado = document.getElementById("kpi-deuda-pct-estado");
  if (dpEl) {
    if (pctPagadoTotal === null) {
      dpEl.textContent = "Sin deudas";
      dpMeta.textContent = "¡Excelente!";
      dpEstado.textContent = "🟢";
    } else {
      dpEl.textContent   = pctPagadoTotal + "%";
      dpMeta.textContent = `${formatMonto(totalPagadoDeuda)} de ${formatMonto(totalDeudaActiva)}`;
      dpEstado.textContent = pctPagadoTotal >= 75 ? "🟢" : pctPagadoTotal >= 40 ? "🟡" : "🔴";
      dpEl.style.color = pctPagadoTotal >= 75 ? "var(--green)" : pctPagadoTotal >= 40 ? "var(--yellow)" : "var(--red)";
    }
  }
  const cmEl    = document.getElementById("kpi-cuotas-mes-val");
  const cmMeta  = document.getElementById("kpi-cuotas-mes-meta");
  const cmEstado = document.getElementById("kpi-cuotas-mes-estado");
  if (cmEl) {
    const cuotasPagadas = activosConCuota.filter(p => {
      const concepto = conceptoPrestamo(p.nombre);
      return movsDelMes.some(m => m.concepto === concepto);
    }).length;
    cmEl.textContent   = `${cuotasPagadas} / ${activosConCuota.length}`;
    cmMeta.textContent = cuotasPagadas === activosConCuota.length
      ? "Todas al día" : `${activosConCuota.length - cuotasPagadas} préstamo(s) sin pago este mes`;
    cmEstado.textContent = cuotasPagadas === activosConCuota.length ? "🟢" : "🟡";
    cmEl.style.color = cuotasPagadas === activosConCuota.length ? "var(--green)" : "var(--yellow)";
  }

  // ── KPI 9: Tendencia ahorro 3 meses ──
  const cacheCron = localStorage.getItem("cache_cronologia");
  const tdEl    = document.getElementById("kpi-tendencia-val");
  const tdMeta  = document.getElementById("kpi-tendencia-meta");
  const tdEstado = document.getElementById("kpi-tendencia-estado");
  if (tdEl && cacheCron) {
    try {
      const cronData = JSON.parse(cacheCron);
      const ultimos3 = [...cronData]
        .sort((a, b) => b.mes.localeCompare(a.mes))
        .slice(0, 3);
      if (ultimos3.length >= 2) {
        const tendencia = ultimos3[0].fijoCantidad < ultimos3[1].fijoCantidad ? "mejorando" : "empeorando";
        tdEl.textContent = tendencia === "mejorando" ? "↓ Bajando" : "↑ Subiendo";
        tdEl.style.color = tendencia === "mejorando" ? "var(--green)" : "var(--red)";
        tdMeta.textContent = `Gasto fijo: ${ultimos3.map(d =>
          new Date(d.mes + "-15").toLocaleDateString("es-CO", { month: "short" }) +
          " " + formatMonto(d.fijoCantidad)
        ).reverse().join(" → ")}`;
        tdEstado.textContent = tendencia === "mejorando" ? "🟢" : "🔴";
      } else {
        tdEl.textContent = "Pocos datos";
        tdMeta.textContent = "Se necesitan al menos 2 meses";
        tdEstado.textContent = "⚪";
      }
    } catch { tdEl.textContent = "—"; }
  } else if (tdEl) {
    tdEl.textContent = "Sin historial";
    tdMeta.textContent = "Se registra el 1° de cada mes";
    tdEstado.textContent = "⚪";
  }

  // ── KPI 10: Mayor desvío del presupuesto ──
  const dvEl    = document.getElementById("kpi-desvio-val");
  const dvMeta  = document.getElementById("kpi-desvio-meta");
  const dvEstado = document.getElementById("kpi-desvio-estado");
  if (dvEl && presupuesto && presupuesto.length > 0) {
    const realesPorConcepto = {};
    movsDelMes.forEach(m => {
      if (m.categoria === "Ingreso") return;
      realesPorConcepto[m.concepto] = (realesPorConcepto[m.concepto] || 0) + Math.abs(m.monto);
    });
    const desvios = presupuesto
      .filter(p => p.montoEstimado > 0)
      .map(p => ({
        concepto: p.concepto,
        desviacion: (realesPorConcepto[p.concepto] || 0) - p.montoEstimado
      }))
      .filter(d => d.desviacion > 0)
      .sort((a, b) => b.desviacion - a.desviacion);
    if (desvios.length > 0) {
      dvEl.textContent   = desvios[0].concepto;
      dvMeta.textContent = `+${formatMonto(desvios[0].desviacion)} sobre lo estimado`;
      dvEstado.textContent = "🔴";
      dvEl.style.color = "var(--red)";
    } else {
      dvEl.textContent   = "Ninguno";
      dvMeta.textContent = "Todo dentro del presupuesto";
      dvEstado.textContent = "🟢";
      dvEl.style.color = "var(--green)";
    }
  } else if (dvEl) {
    dvEl.textContent = "—";
    dvMeta.textContent = "Define tu presupuesto";
    dvEstado.textContent = "⚪";
  }

  // ── ALERTAS ──
  const alertasWrap = document.getElementById("resumen-alertas");
  if (alertasWrap) {
    const alertas = [];

    const pagadosEsteMes = new Set(
      movsDelMes.filter(m => m.categoria === "Gasto fijo").map(m => m.concepto)
    );
    const fijosFaltantes = GASTOS_FIJOS.filter(f => !pagadosEsteMes.has(f));
    if (fijosFaltantes.length > 0) {
      alertas.push({
        tipo: "warn",
        icono: "📌",
        titulo: `${fijosFaltantes.length} gasto(s) fijo(s) sin registrar`,
        detalle: fijosFaltantes.join(", ")
      });
    }

    const prestamosSinPago = activosConCuota.filter(p => {
      const concepto = conceptoPrestamo(p.nombre);
      return !movsDelMes.some(m => m.concepto === concepto);
    });
    if (prestamosSinPago.length > 0) {
      alertas.push({
        tipo: "warn",
        icono: "💳",
        titulo: `${prestamosSinPago.length} préstamo(s) sin cuota este mes`,
        detalle: prestamosSinPago.map(p => p.nombre).join(", ")
      });
    }

    const totalCompras = (window.compras || []).reduce((s, c) => s + c.montoDestinado, 0);
    if (totalCompras > 0) {
      alertas.push({
        tipo: "info",
        icono: "🛍️",
        titulo: `${formatMonto(totalCompras)} comprometidos en lista de compras`,
        detalle: `${(window.compras || []).length} item(s) pendiente(s)`
      });
    }

    if (balanceNeto < 0) {
      alertas.push({
        tipo: "danger",
        icono: "🚨",
        titulo: "Balance neto negativo",
        detalle: `Debes ${formatMonto(Math.abs(balanceNeto))} en total`
      });
    }

    if (alertas.length === 0) {
      alertasWrap.innerHTML = `
        <div class="alerta-item alerta-ok">
          <span class="alerta-icono">✅</span>
          <div>
            <div class="alerta-titulo">Todo en orden</div>
            <div class="alerta-detalle">No hay alertas activas este mes</div>
          </div>
        </div>`;
    } else {
      alertasWrap.innerHTML = alertas.map(a => `
        <div class="alerta-item alerta-${a.tipo}">
          <span class="alerta-icono">${a.icono}</span>
          <div>
            <div class="alerta-titulo">${a.titulo}</div>
            <div class="alerta-detalle">${a.detalle}</div>
          </div>
        </div>`).join("");
    }
  }
}


// =============================================
// TOPBAR: actualizar título según tab activa
// =============================================
const TAB_TITLES = {
  cajas: "Cuentas", movimientos: "Ingresos / Gastos", proyeccion: "Proyección",
  prestamos: "Préstamos", compras: "Lista de compras", resumen: "Análisis"
};

function actualizarTopbarTitulo(tab) {
  const el = document.getElementById("topbar-title");
  if (el) el.textContent = TAB_TITLES[tab] || "";
}

// =============================================
// FOTOS EN MOVIMIENTOS
// =============================================

let pendingFotos = [];

function setupFotosListeners() {
  const fileInput   = document.getElementById("recibo-file");
  const camaraInput = document.getElementById("camara-file");
  if (fileInput)   fileInput.addEventListener("change",   (e) => agregarFotos(e.target.files));
  if (camaraInput) camaraInput.addEventListener("change", (e) => agregarFotos(e.target.files));
}

function agregarFotos(files) {
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      pendingFotos.push({ data: e.target.result, type: file.type });
      renderFotosPreview();
    };
    reader.readAsDataURL(file);
  });
}

function renderFotosPreview() {
  const preview = document.getElementById("fotos-preview");
  const status  = document.getElementById("recibo-status");
  if (!preview) return;
  preview.innerHTML = pendingFotos.map((f, i) => `
    <div class="foto-thumb">
      <img src="${f.data}" alt="foto ${i + 1}" class="foto-thumb-img"/>
      <button class="foto-thumb-remove" type="button" onclick="quitarFoto(${i})">×</button>
    </div>
  `).join("");
  if (status) {
    status.textContent = pendingFotos.length > 0
      ? `${pendingFotos.length} foto${pendingFotos.length !== 1 ? "s" : ""} adjunta${pendingFotos.length !== 1 ? "s" : ""}`
      : "";
  }
}

window.quitarFoto = function(idx) {
  pendingFotos.splice(idx, 1);
  renderFotosPreview();
};

// Guarda las fotos en IndexedDB con nombre Fecha-Concepto-Caja
// Sube las fotos pendientes a Google Drive y devuelve los links separados por coma
async function subirFotosPendientesADrive(fecha, concepto, caja) {
  if (pendingFotos.length === 0) return "";
  const slug = `${fecha}-${String(concepto).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_")}-${String(caja).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_")}`;
  const urls = [];
  for (let i = 0; i < pendingFotos.length; i++) {
    const foto = pendingFotos[i];
    const ext = foto.type.includes("png") ? "png" : "jpg";
    const { url } = await Sheets.subirArchivoDrive(foto.data, `${slug}-${i + 1}.${ext}`, foto.type);
    urls.push(url);
  }
  return urls.join(",");
}


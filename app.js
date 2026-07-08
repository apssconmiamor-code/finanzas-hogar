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

window.onload = () => {
  const userRaw = localStorage.getItem("guser");
  const token   = localStorage.getItem("gtoken");

  let usuarioValido = null;
  if (userRaw) {
    try { usuarioValido = JSON.parse(userRaw); } catch (e) { usuarioValido = null; }
  }

  if (usuarioValido) {
    // Usuario guardado → app inmediata con caché, sin ningún popup de Google
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

// Callback de One Tap: guarda usuario y obtiene token para Sheets en silencio
async function _onOneTapCredential(credentialResponse) {
  try {
    const parts = credentialResponse.credential.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    currentUser = { name: payload.name, email: payload.email, picture: payload.picture };
    localStorage.setItem("guser", JSON.stringify(currentUser));
  } catch (e) { return; }

  if (typeof google === "undefined") { mostrarApp(); return; }
  try {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
      prompt: "none",
      hint: currentUser.email,
      callback: (response) => {
        if (!response.error) {
          Sheets.setToken(response.access_token);
          localStorage.setItem("gtoken", response.access_token);
        }
        mostrarApp();
      }
    });
    client.requestAccessToken();
  } catch (e) { mostrarApp(); }
}

// ---- AUTH ----

document.getElementById("btn-login").addEventListener("click", () => {
  if (typeof google === "undefined") {
    alert("Sin conexión a Internet. Conéctate y vuelve a intentarlo.");
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
    callback: async (response) => {
      if (response.error) { alert("Error de autenticación"); return; }
      Sheets.setToken(response.access_token);
      localStorage.setItem("gtoken", response.access_token);
      const perfil = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${response.access_token}` }
      }).then(r => r.json());
      currentUser = { name: perfil.name, email: perfil.email, picture: perfil.picture };
      localStorage.setItem("guser", JSON.stringify(currentUser));
      mostrarApp();
    }
  });
  client.requestAccessToken();
});

document.getElementById("btn-logout").addEventListener("click", () => {
  // Al cerrar sesión limpiamos solo auth, NO el caché de datos
  localStorage.removeItem("gtoken");
  localStorage.removeItem("guser");
  currentUser = null;
  cajas = [];
  movimientos = [];
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
});

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
  // saludo
  const sal = document.getElementById("cajas-saludo");
  if (sal && currentUser?.name) sal.textContent = `Hola, ${currentUser.name.split(" ")[0]} 👋`;

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

  // Intentar sincronizar con la red SIN bloquear la UI
  // Si está offline o falla, la app ya funciona con el caché
  cargarTodo().catch(() => {
    // offline o token vencido — la UI ya está lista con la caché
  });

  // Recordatorios: cargar badge + preguntar si quiere dejar uno nuevo
  if (typeof cargarRecordatorios === "function") {
    const cacheR = localStorage.getItem("cache_recordatorios");
    if (cacheR) { try { recordatorios = JSON.parse(cacheR); } catch {} }
    renderRecordatorioBadge();
    cargarRecordatorios();
  }
  if (typeof mostrarPromptRecordatorio === "function") {
    setTimeout(mostrarPromptRecordatorio, 500);
  }
}

// ---- NAVEGACIÓN ----

function setupEventListeners() {
function navegarATab(tab) {
    document.querySelectorAll(".nav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-section").forEach(s => s.classList.add("hidden"));
    const sec = document.getElementById(`tab-${tab}`);
    if (sec) sec.classList.remove("hidden");
    if (tab === "compromisos") { cargarPrestamos(); cargarCompras(); }
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

  // Cajas
  document.getElementById("btn-nueva-caja").addEventListener("click", () =>
    document.getElementById("modal-caja").classList.remove("hidden"));
  document.getElementById("btn-cancelar-caja").addEventListener("click", () => {
    document.getElementById("modal-caja").classList.add("hidden");
    limpiarFormCaja();
  });
  document.getElementById("btn-guardar-caja").addEventListener("click", guardarCaja);

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
  document.getElementById("filtro-concepto").addEventListener("change", renderMovimientos);

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

// ---- FILTRO CONCEPTO DINÁMICO ----

function actualizarFiltroConcepto() {
  const tipo = document.getElementById("filtro-tipo").value;
  const sel  = document.getElementById("filtro-concepto");

  let lista = [];
  if (tipo === "Gasto fijo") {
    lista = GASTOS_FIJOS;
  } else if (tipo === "Gasto variable") {
    lista = GASTOS_VARIABLES;
  } else if (tipo === "Ingreso" || tipo === "Transferencia") {
    lista = [...new Set(
      movimientos.filter(m => m.categoria === tipo).map(m => m.concepto)
    )].sort();
  } else if (tipo === "") {
    lista = [...new Set(movimientos.map(m => m.concepto))].sort();
  }

  sel.innerHTML = `<option value="">Todos los conceptos</option>` +
    lista.map(c => `<option value="${c}">${c}</option>`).join("");
  sel.disabled = lista.length === 0;
}

// ---- CARGA DE DATOS ----

async function cargarTodo() {
  try {
    cajas       = await Sheets.getCajas();
    movimientos = await Sheets.getMovimientos();
    renderCajas();
    renderMovimientos();
    poblarFiltrosCajas();
    await cargarPresupuesto();
    await cargarProyeccion();
    await verificarYGuardarCronologia();
    await cargarYRenderCronologia();
    await cargarPrestamos();
    renderResumen();

  } catch (err) {    
    if (err.message === "TOKEN_EXPIRADO") return;

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

  const filas = movs.map(m => {
    const esEntrada = m.categoria === "Ingreso" || (m.categoria === "Transferencia" && m.concepto.startsWith("Transferencia ←"));
    const signo = esEntrada ? "+" : "-";
    const color = esEntrada ? "var(--green)" : "var(--red)";
    return `<tr>
      <td>${m.fecha}</td>
      <td>${m.concepto}</td>
      <td style="color:var(--text-light);font-size:0.82rem">${m.categoria}</td>
      <td style="text-align:right;color:${color};font-weight:600">${signo}${formatMonto(Math.abs(m.monto), moneda)}</td>
    </tr>`;
  }).join("");

  const cuerpo = movs.length === 0
    ? `<p style="text-align:center;color:var(--text-light);padding:24px">Sin movimientos registrados</p>`
    : `<div class="detalle-caja-scroll">
        <table class="detalle-caja-table">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th style="text-align:right">Monto</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
       </div>`;

  document.getElementById("detalle-caja-titulo").textContent = nombre;
  document.getElementById("detalle-caja-resumen").innerHTML = `
    <span style="color:var(--green)">▲ Entradas: ${formatMonto(totalEntradas, moneda)}</span>
    <span style="color:var(--red)">▼ Salidas: ${formatMonto(totalSalidas, moneda)}</span>
    <span style="font-weight:700">Saldo: ${formatMonto(totalEntradas - totalSalidas, moneda)}</span>
  `;
  document.getElementById("detalle-caja-body").innerHTML = cuerpo;
  document.getElementById("modal-detalle-caja").classList.remove("hidden");
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

  let filtrados = movimientos.filter(m => {
    if (filtroK && m.categoria !== filtroK) return false;
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
      ? `<span class="mov-desc-inline">· ${m.descripcion}</span>` : "";
    const primeraFoto = m.recibo ? m.recibo.split(",")[0].trim() : "";
    const fotoHTML = primeraFoto
      ? `<span class="mov-card-foto-icono" title="Tiene foto adjunta" onclick="event.stopPropagation();window.open('${primeraFoto}','_blank')">📎</span>`
      : "";

    return `<div class="mov-card">
      <div class="mov-card-row1">
        <span class="mov-card-caja">${m.caja}</span>
        <span class="mov-card-fecha">${fechaFmt}</span>
      </div>
      <div class="mov-card-row2">
        <div class="mov-card-left">
          <span class="mov-card-icono mov-cat-${catCls}">${icono}</span>
          <div class="mov-card-texto">
            <span class="mov-card-concepto">${m.concepto || "Sin concepto"}${fotoHTML}</span>
            ${descHTML}
          </div>
        </div>
        <div class="mov-card-right">
          <span class="mov-card-monto ${cls}">${signo}${formatMonto(Math.abs(m.monto))}</span>
          <div class="mov-card-actions">
            <button class="btn-accion btn-editar" title="Editar" onclick="abrirEditarMovimiento('${m.id}')">✏️</button>
            <button class="btn-accion btn-borrar" title="Borrar" onclick="borrarMovimiento('${m.id}')">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

// ---- GUARDAR CAJA ----

async function guardarCaja() {
  const nombre = document.getElementById("caja-nombre").value.trim();
  const moneda = document.getElementById("caja-moneda").value;
  if (!nombre) { alert("Escribe el nombre de la caja"); return; }
  if (cajas.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
    alert(`Ya existe una caja llamada "${nombre}". Usa un nombre diferente, por ejemplo "${nombre} USD" o "${nombre} EUR".`);
    return;  }
  const btn = document.getElementById("btn-guardar-caja");
  btn.textContent = "Guardando..."; btn.disabled = true;
  try {
    await Sheets.agregarCaja(currentUser.email, nombre, moneda);
    document.getElementById("modal-caja").classList.add("hidden");
    limpiarFormCaja();

    if (!navigator.onLine) {
      const nuevaCaja = { id: "C_local_" + Date.now(), usuario: currentUser.email, nombre, moneda };
      cajas.push(nuevaCaja);
      localStorage.setItem("cache_cajas", JSON.stringify(cajas));
      renderCajas();
      poblarFiltrosCajas();
    } else {
      await cargarTodo();
    }
  } catch (err) {
    alert("Error guardando la caja: " + err.message);
  } finally {
    btn.textContent = "Guardar"; btn.disabled = false;
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
function renderFotosExistentes(recibo) {
  const cont = document.getElementById("fotos-existentes");
  if (!cont) return;
  const urls = (recibo || "").split(",").map(u => u.trim()).filter(Boolean);
  cont.innerHTML = urls.map(url => `
    <a class="foto-thumb" href="${url}" target="_blank" rel="noopener" title="Ver foto completa">
      <img src="${url}" class="foto-thumb-img" alt="foto guardada"/>
    </a>
  `).join("");
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

function limpiarFormCaja() {
  document.getElementById("caja-nombre").value = "";
  document.getElementById("caja-moneda").value = "COP";
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

function totalIngresosMes(mes) {
  const fuentes = getIngresosMes(mes);
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
  const gastos = getGastosMes(mes);
  if (gastos) return Object.values(gastos).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  return presupuesto.filter(p => p.montoEstimado > 0).reduce((s, p) => s + p.montoEstimado, 0);
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
    saveMesesProyeccion();
  }
  // Eliminar meses anteriores al mes actual
  const mesActual = new Date().toISOString().slice(0, 7);
  const sinPasados = mesesProyeccion.filter(m => m >= mesActual);
  if (sinPasados.length !== mesesProyeccion.length) {
    mesesProyeccion = sinPasados;
    saveMesesProyeccion();
  }
  return mesesProyeccion;
}

function saveMesesProyeccion() {
  try { localStorage.setItem("proy_meses_list", JSON.stringify(mesesProyeccion)); } catch {}
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
  mesesProyeccion = meses.filter(m => m !== mes);
  if (proyMesActivo === mes) proyMesActivo = mesesProyeccion[0];
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
function renderProyeccion() {
  const mes = proyMesActivo;
  document.getElementById("proyeccion-mes").value = mes;
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

  // Variables para detectar doble clic
  let clickTimer = null;

  grid.querySelectorAll(".proy-4m-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("proy-4m-remove")) return;
      if (clickTimer) {
        // Doble clic: abrir configuración
        clearTimeout(clickTimer);
        clickTimer = null;
        abrirConfigMes(card.dataset.mes);
      } else {
        clickTimer = setTimeout(() => {
          clickTimer = null;
          // Clic simple: seleccionar mes
          proyMesActivo = card.dataset.mes;
          document.getElementById("proyeccion-mes").value = proyMesActivo;
          renderProyeccion();
          document.querySelector(".card-section:has(#proy-tabla-body)")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 220);
      }
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

  const realesPorConcepto = {};
  movsDelMes
    .filter(m => m.categoria !== "Transferencia")
    .forEach(m => {
      realesPorConcepto[m.concepto] = (realesPorConcepto[m.concepto] || 0) + Math.abs(m.monto);
    });

  // Usar gastos configurados para este mes específico, o caer al presupuesto global
  const gastosMes = getGastosMes(proyMesActivo);
  const todasCat  = [
    ...GASTOS_FIJOS.map(c => ({ categoria: "Gasto fijo", concepto: c })),
    ...GASTOS_VARIABLES.map(c => ({ categoria: "Gasto variable", concepto: c })),
  ];

  let filas;
  if (gastosMes) {
    filas = Object.entries(gastosMes)
      .filter(([, v]) => v > 0)
      .map(([concepto, estimado]) => {
        const cat = todasCat.find(c => c.concepto === concepto);
        return { categoria: cat ? cat.categoria : "Gasto variable", concepto, estimado, real: realesPorConcepto[concepto] || 0 };
      });
  } else {
    filas = presupuesto
      .filter(p => p.montoEstimado > 0)
      .map(p => ({ categoria: p.categoria, concepto: p.concepto, estimado: p.montoEstimado, real: realesPorConcepto[p.concepto] || 0 }));
  }

  // Ingresos estimados del mes (fuentes) — van primero en la tabla, siempre las 4 aunque estén en $0
  const ingresosMes = getIngresosMesParaEditor(proyMesActivo);
  FUENTES_INGRESO.forEach(fuente => {
    filas.push({
      categoria: "Ingreso", concepto: fuente,
      estimado: ingresosMes[fuente] || 0,
      real: realesPorConcepto[fuente] || 0
    });
  });

  Object.entries(realesPorConcepto).forEach(([concepto, real]) => {
    if (!filas.find(f => f.concepto === concepto)) {
      const mov = movimientos.find(m => m.concepto === concepto);
      filas.push({ categoria: mov ? mov.categoria : "Sin categoría", concepto, estimado: 0, real });
    }
  });

  if (filas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-light)">
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
    const desviacion = f.real - f.estimado;
    const pct = f.estimado > 0 ? (f.real / f.estimado) : (f.real > 0 ? 999 : 0);
    const pctNum = f.estimado > 0 ? Math.round(pct * 100) : (f.real > 0 ? null : 0);

    let estadoClass = "estado-ok";
    if (pct > 1)        estadoClass = "estado-mal";
    else if (pct > 0.8) estadoClass = "estado-alerta";
    if (f.estimado === 0 && f.real > 0) estadoClass = "estado-mal";

    const desvClass = desviacion > 0 ? "desv-positivo" : desviacion < 0 ? "desv-negativo" : "";
    const desvSigno = desviacion > 0 ? "+" : "";
    const pctLabel  = pctNum !== null ? pctNum + "%" : "—";
    const barW      = Math.min((pct > 0 ? pct : 0) * 100, 100);

    return `<tr class="proy-tabla-row">
      <td>
        <div class="proy-cell-concepto">
          <span class="cat-badge cat-${f.categoria.toLowerCase().replace(/ /g,'')}">
            ${f.categoria === "Gasto fijo" ? "F" : f.categoria === "Gasto variable" ? "V" : f.categoria.charAt(0)}
          </span>
          <span class="proy-concepto-nombre">${ICONOS[f.concepto] || "📌"} ${f.concepto}</span>
        </div>
      </td>
      <td class="proy-cell-num">${f.estimado > 0 ? formatMonto(f.estimado) : "—"}</td>
      <td class="proy-cell-num">${f.real > 0 ? formatMonto(f.real) : "—"}</td>
      <td class="proy-cell-estado">
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="width:48px;height:5px;background:var(--bg);border-radius:3px;overflow:hidden">
            <div style="width:${barW}%;height:100%;background:var(--${estadoClass === 'estado-ok' ? 'green' : estadoClass === 'estado-alerta' ? 'amber' : 'red'});border-radius:3px"></div>
          </div>
          <span class="pct-label ${estadoClass}" style="font-size:11px">${pctLabel}</span>
          ${desviacion !== 0 ? `<span class="proy-desv ${desvClass}" style="font-size:10px">${desvSigno}${formatMonto(Math.abs(desviacion))}</span>` : ""}
        </div>
      </td>
      <td>
        <button type="button" class="btn-modificar-fila" onclick="abrirModificarConcepto('${f.concepto.replace(/'/g, "\\'")}', '${f.categoria.replace(/'/g, "\\'")}')">✏️ Modificar</button>
      </td>
    </tr>`;
  }).join("");
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

async function verificarYGuardarCronologia() {
  try {
    const hoy = new Date();
    if (hoy.getDate() !== 1) return;

    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const mesStr = mesAnterior.toISOString().slice(0, 7);

    const yaExiste = await Sheets.existeCronologiaMes(mesStr);
    if (yaExiste) return;

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

// ---- SETUP LISTENERS PROYECCIÓN ----

function setupProyeccionListeners() {
  document.getElementById("btn-cancelar-presupuesto")
    ?.addEventListener("click", cerrarModalPresupuesto);
  document.getElementById("btn-guardar-presupuesto")
    ?.addEventListener("click", guardarPresupuesto);

  document.getElementById("modal-presupuesto")?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal-presupuesto")) cerrarModalPresupuesto();
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

  if (ddVersion) ddVersion.textContent = `Finanzas Hogar v${CONFIG.VERSION}`;

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
  compromisos: "Compromisos", resumen: "Análisis"
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


import { useEffect, useRef, useState } from "react";
import { Hoja, Cuadricula, Campo } from "../shared/Hoja.jsx";
import { Icono, LogoCaja } from "../shared/Iconos.jsx";
import { conMiles, hoyISO } from "../shared/formato.js";

// "Nuevo movimiento" (ingreso, gasto o transferencia) y "Editar movimiento", con el diseño de hojas
// (ver shared/Hoja.jsx). app.js sigue siendo dueño de los datos y de hablar con Sheets / Drive; acá
// se maneja el formulario, el selector de cajas, los conceptos, las fotos y el audio.
//
// Se abre con el evento "movimiento:abrir":
//   {
//     modo: "nuevo" | "editar",
//     tipo,                 nuevo: "Ingreso" | "Gasto" | "Transferencia" (sin tipo: formulario completo)
//     id,                   editar: el movimiento
//     inicial: { fecha, categoria, concepto, descripcion, monto },   valores de partida (compra, recordatorio)
//     titulo, nota,         título y nota propios (ej. "Comprar: Auriculares")
//     bloqueInfo: { html, alMontar(el) },   bloque informativo encima del formulario (recordatorio)
//     despuesDeGuardar(),   se llama cuando el movimiento ya quedó guardado
//   }
//
// Props (ver renderMovimientoReact en app.js):
//   getCajas() / cajaVisible(c) / saldoDe(nombre) / iconoCaja(nombre) / colorCaja(nombre)
//   opcionesFijo(fecha, editId)        gastos fijos [{ value, label }] (label marca los ya registrados)
//   gastosVariables() / fuentesIngreso()
//   getMovimiento(id)
//   evaluarMonto(texto) / formatMonto(n, moneda)
//   obtenerStream() / liberarMicrofono()      micrófono
//   cargarMedia(url)                   foto o audio ya guardado en Drive -> Promise<{ blobUrl, esAudio }>
//   onGuardar(datos, editId)           guarda (Promise; si falla, lanza)

export function Movimiento(props) {
  const [pedido, setPedido] = useState(null);

  useEffect(() => {
    const abrir = e => setPedido({ ...e.detail, n: Date.now() });
    document.addEventListener("movimiento:abrir", abrir);
    return () => document.removeEventListener("movimiento:abrir", abrir);
  }, []);

  if (!pedido) return null;
  return <HojaMovimiento key={pedido.n} {...props} pedido={pedido} alCerrar={() => setPedido(null)} />;
}

const CATEGORIAS = [
  ["Ingreso", "Ingreso", "monedas"],
  ["Gasto fijo", "Fijo", "pin"],
  ["Gasto variable", "Variable", "mezclar"],
  ["Transferencia", "Transf.", "repetir"],
];

const esAudio = f => (f.type || "").startsWith("audio/");
const leerComoDataUrl = blob => new Promise(resolve => {
  const lector = new FileReader();
  lector.onload = e => resolve({ data: e.target.result, type: blob.type });
  lector.readAsDataURL(blob);
});

function HojaMovimiento({
  getCajas, cajaVisible, saldoDe, iconoCaja, colorCaja, opcionesFijo, gastosVariables, fuentesIngreso,
  getMovimiento, evaluarMonto, formatMonto, obtenerStream, liberarMicrofono, cargarMedia, onGuardar,
  pedido, alCerrar,
}) {
  const editId = pedido.modo === "editar" ? pedido.id : null;
  const existente = editId ? getMovimiento(editId) : null;
  const inicial = pedido.inicial || {};
  const tipo = pedido.tipo;   // undefined = formulario completo

  const categoriaInicial = existente ? existente.categoria
    : (inicial.categoria ?? (tipo === "Ingreso" ? "Ingreso" : tipo === "Transferencia" ? "Transferencia" : ""));
  const conceptoInicial = existente ? existente.concepto : (inicial.concepto || "");
  const montoInicial = existente && existente.categoria !== "Transferencia"
    ? Math.abs(existente.monto).toLocaleString("es-CO")
    : (inicial.monto ? Number(inicial.monto).toLocaleString("es-CO") : "");

  const [fecha, setFecha] = useState(existente?.fecha || inicial.fecha || hoyISO());
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [conceptos, setConceptos] = useState({
    "Gasto fijo": categoriaInicial === "Gasto fijo" ? conceptoInicial : "",
    "Gasto variable": categoriaInicial === "Gasto variable" ? conceptoInicial : "",
    "Ingreso": categoriaInicial === "Ingreso" ? conceptoInicial : "",
  });
  const [monto, setMonto] = useState(montoInicial);
  const [montoCalc, setMontoCalc] = useState("");
  const [caja, setCaja] = useState(existente && existente.categoria !== "Transferencia" ? existente.caja : "");
  const [descripcion, setDescripcion] = useState(existente ? existente.descripcion : (inicial.descripcion || ""));
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [montoTransf, setMontoTransf] = useState("");
  const [montoTransfCalc, setMontoTransfCalc] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  const [fotos, setFotos] = useState([]);           // nuevas: fotos y audios { data, type }
  const [grabando, setGrabando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(null);     // selector / panel desplegado (solo uno a la vez)
  const [aviso, setAviso] = useState("");           // "Fondos insuficientes" al elegir una caja
  const grabadora = useRef(null);
  const trozos = useRef([]);

  // ---- qué se muestra según cómo se abrió ----
  const mostrarCategorias = !!editId || tipo === undefined || tipo === "Gasto";
  const soloGasto = !editId && tipo === "Gasto";
  const esTransf = categoria === "Transferencia";
  const sinFondos = categoria === "Gasto fijo" || categoria === "Gasto variable";
  const titulo = pedido.titulo || (editId ? "Editar movimiento"
    : tipo === "Ingreso" ? "Nuevo ingreso" : tipo === "Transferencia" ? "Nueva transferencia"
    : tipo === "Gasto" ? "Nuevo gasto" : "Nuevo movimiento");

  // ---- cajas ----
  const todas = getCajas();
  const montoNum = evaluarMonto(monto) || 0;
  const cajasNormal = todas
    .filter(c => editId ? true : cajaVisible(c))
    .filter(c => !sinFondos || montoNum <= 0 || saldoDe(c.nombre) >= montoNum || c.nombre === caja);
  const etiquetaCaja = c => `${c.nombre} (${c.moneda})`;
  const cajaEfectiva = cajasNormal.some(c => c.nombre === caja) ? caja : "";
  const monedaDe = n => todas.find(c => c.nombre === n)?.moneda;
  const saldoCaja = cajaEfectiva && sinFondos ? Math.max(0, saldoDe(cajaEfectiva)) : null;
  const faltaSaldo = saldoCaja !== null && montoNum > saldoCaja;
  const monedasDiferentes = esTransf && origen && destino && monedaDe(origen) && monedaDe(destino) && monedaDe(origen) !== monedaDe(destino);

  // Un clic fuera cierra cualquier selector o lista de conceptos abierta.
  useEffect(() => {
    const cerrar = () => setAbierto(null);
    document.addEventListener("click", cerrar);
    return () => document.removeEventListener("click", cerrar);
  }, []);

  // Al cerrar: se corta una grabación a medias (sin guardar un audio incompleto) y se suelta el micrófono.
  useEffect(() => () => {
    const rec = grabadora.current;
    if (rec && rec.state === "recording") { rec.onstop = null; try { rec.stop(); } catch {} }
    liberarMicrofono();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- monto con separador de miles y cálculo en vivo ("4000+5000" = 9.000) ----
  function escribirMonto(valor, poner, ponerCalc) {
    if (/[+\-*/]/.test(valor) && valor.trim()) {
      poner(valor);
      const r = evaluarMonto(valor);
      ponerCalc(r > 0 ? "= " + r.toLocaleString("es-CO") : "");
    } else {
      poner(conMiles(valor));
      ponerCalc("");
    }
  }
  function cerrarMonto(valor, poner, ponerCalc) {
    if (/[+\-*/]/.test(valor)) {
      const r = evaluarMonto(valor);
      if (r > 0) poner(r.toLocaleString("es-CO"));
    }
    ponerCalc("");
  }

  function elegirCategoria(valor) {
    setCategoria(valor);
    setAbierto(null);
  }

  function elegirCaja(nombre) {
    setCaja(nombre);
    setAviso("");
    if (!nombre || !sinFondos) return;
    // Un monto mayor al saldo de la caja elegida se borra y se avisa.
    const saldo = Math.max(0, saldoDe(nombre));
    if (montoNum > saldo) {
      setMonto("");
      setMontoCalc("");
      setAviso(`Fondos insuficientes · Disponible: ${formatMonto(saldo)}`);
    }
  }

  // ---- fotos y audio ----
  function agregarArchivos(files) {
    Array.from(files).forEach(file => leerComoDataUrl(file).then(f => setFotos(a => [...a, f])));
  }

  async function alternarGrabacion() {
    if (grabando) {
      grabadora.current.stop();
      setGrabando(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      alert("Este navegador no soporta grabación de audio.");
      return;
    }
    try {
      const stream = await obtenerStream();
      trozos.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = e => { if (e.data.size > 0) trozos.current.push(e.data); };
      rec.onstop = () => {
        leerComoDataUrl(new Blob(trozos.current, { type: rec.mimeType || "audio/webm" })).then(f => setFotos(a => [...a, f]));
      };
      rec.start();
      grabadora.current = rec;
      setGrabando(true);
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        alert(
          "El navegador tiene bloqueado el micrófono para esta página.\n\n" +
          "En iPhone: toca el ícono \"aA\" en la barra de direcciones → " +
          "Configuración del sitio web → Micrófono → Permitir. Si no aparece esa opción, " +
          "ve a Ajustes del iPhone → Safari → Micrófono y revisa que no esté en \"Denegar\".\n\n" +
          "Luego vuelve a intentar."
        );
      } else if (err.name === "NotFoundError") {
        alert("No se encontró un micrófono disponible en este dispositivo.");
      } else {
        alert("No se pudo acceder al micrófono: " + err.message);
      }
    }
  }

  // Guardar sin haber tocado "Detener": la grabación se corta y se procesa aquí para no perder el audio.
  function detenerYEsperar() {
    return new Promise(resolve => {
      const rec = grabadora.current;
      if (!grabando || !rec) { resolve([]); return; }
      rec.onstop = () => {
        leerComoDataUrl(new Blob(trozos.current, { type: rec.mimeType || "audio/webm" })).then(f => resolve([f]));
      };
      setGrabando(false);
      rec.stop();
    });
  }

  const nFotos = fotos.filter(f => !esAudio(f)).length;
  const nAudio = fotos.length - nFotos;
  const textoAdjuntos = (() => {
    const partes = [];
    if (nFotos > 0) partes.push(`${nFotos} foto${nFotos !== 1 ? "s" : ""}`);
    if (nAudio > 0) partes.push(`${nAudio} audio${nAudio !== 1 ? "s" : ""}`);
    return partes.length > 0 ? `${partes.join(" y ")} adjunto${fotos.length !== 1 ? "s" : ""}` : "";
  })();

  // ---- guardar ----
  async function guardar() {
    const grabadas = await detenerYEsperar();
    const fotosFinales = [...fotos, ...grabadas];
    const conceptoActivo = categoria === "Gasto fijo" ? conceptos["Gasto fijo"]
      : categoria === "Gasto variable" ? conceptos["Gasto variable"].trim()
      : categoria === "Ingreso" ? conceptos["Ingreso"].trim() : "";
    const montoFinal = evaluarMonto(monto);
    const datos = {
      fecha, categoria, descripcion: descripcion.trim(), concepto: conceptoActivo, caja: cajaEfectiva, monto: montoFinal,
      origen, destino, montoTransf: evaluarMonto(montoTransf), tipoCambio: parseFloat(tipoCambio),
      fotos: fotosFinales,
    };

    if (editId) {
      if (!fecha || !categoria || !conceptoActivo || !cajaEfectiva || !montoFinal) { alert("Completa todos los campos obligatorios"); return; }
    } else {
      if (!fecha || !categoria) { alert("Completa todos los campos obligatorios"); return; }
      if (esTransf) {
        if (!origen || !destino || !datos.montoTransf) { alert("Completa origen, destino y monto de la transferencia"); return; }
        if (origen === destino) { alert("La caja origen y destino no pueden ser la misma"); return; }
        if (monedasDiferentes && (!datos.tipoCambio || datos.tipoCambio <= 0)) {
          alert("Las cuentas tienen monedas diferentes. Ingresa el tipo de cambio.");
          return;
        }
      } else {
        if (!conceptoActivo || !cajaEfectiva || !montoFinal) { alert("Completa todos los campos obligatorios"); return; }
        // Validar fondos suficientes para gastos
        if (categoria !== "Ingreso") {
          const saldo = Math.max(0, saldoDe(cajaEfectiva));
          if (montoFinal > saldo) {
            alert(`Fondos insuficientes en "${cajaEfectiva}"\nSaldo disponible: ${formatMonto(saldo)}\nMonto solicitado: ${formatMonto(montoFinal)}`);
            return;
          }
        }
      }
    }

    setGuardando(true);
    try {
      await onGuardar(datos, editId);
    } catch (err) {
      alert((editId ? "Error actualizando: " : "Error guardando el movimiento: ") + err.message);
      setGuardando(false);
      return;
    }
    alCerrar();
    pedido.despuesDeGuardar?.();
  }

  // ---- conceptos ----
  const opcionesConcepto = {
    "Gasto fijo": opcionesFijo(fecha, editId),
    "Gasto variable": gastosVariables().map(v => ({ value: v, label: v })),
    "Ingreso": fuentesIngreso().map(v => ({ value: v, label: v })),
  };
  const config = {
    "Gasto fijo": { id: "fijo", lectura: true, ph: "Selecciona un gasto fijo…" },
    "Gasto variable": { id: "variable", lectura: false, ph: "Escribe o elige un gasto variable…" },
    "Ingreso": { id: "ingreso", lectura: false, ph: "Fuente de ingreso…" },
  };

  const campoConcepto = cat => {
    const { id, lectura, ph } = config[cat];
    const valor = conceptos[cat];
    const filtro = lectura ? "" : valor.trim().toLowerCase();
    const lista = filtro ? opcionesConcepto[cat].filter(o => o.label.toLowerCase().includes(filtro)) : opcionesConcepto[cat];
    const panelAbierto = abierto === id;
    return (
      <div className="campo-desplegable" id={"wrap-concepto-" + id}
        onDoubleClick={e => { e.stopPropagation(); setAbierto(id); }}>
        <input id={"mov-concepto-" + id} type="text" autoComplete="off" readOnly={lectura} placeholder={ph} className="input"
          value={valor} onClick={e => e.stopPropagation()}
          onChange={e => { setConceptos(c => ({ ...c, [cat]: e.target.value })); setAbierto(id); }} />
        <button type="button" className="btn-desplegar-concepto" aria-label="Mostrar opciones"
          onClick={e => { e.preventDefault(); e.stopPropagation(); setAbierto(panelAbierto ? null : id); }}>▾</button>
        <div className={"caja-picker-panel" + (panelAbierto ? "" : " hidden")} id={"panel-concepto-" + id}>
          {lista.length > 0
            ? lista.map(o => (
              <button key={o.value} type="button" className="caja-picker-option" data-value={o.value}
                onClick={e => { e.stopPropagation(); setConceptos(c => ({ ...c, [cat]: o.value })); setAbierto(null); }}>{o.label}</button>))
            : <div className="caja-picker-empty">Sin coincidencias</div>}
        </div>
      </div>
    );
  };

  const preview = (() => {
    const m = evaluarMonto(montoTransf), tc = parseFloat(tipoCambio);
    if (!monedasDiferentes || !m || !tc) return "";
    const cur = monedaDe(destino);
    return `→ Se acreditarán ${new Intl.NumberFormat("es-CO", { style: "currency", currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(m * tc)} en ${destino}`;
  })();

  const selector = (id, valor, opciones, alCambiar, ancho) => (
    <SelectorCaja id={id} valor={valor} opciones={opciones} alCambiar={alCambiar} abierto={abierto === id}
      alAlternar={cerrar => setAbierto(cerrar === false || abierto === id ? null : id)} ancho={ancho}
      iconoCaja={iconoCaja} colorCaja={colorCaja} />
  );

  return (
    <Hoja id="modal-movimiento" idTitulo="modal-movimiento-titulo" alta icono={<Icono nombre="movimientos" size={22} />}
      titulo={titulo} subtitulo={pedido.nota} onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-mov" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-mov" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : editId ? "Actualizar" : "Guardar"}
          </button>
        </>
      }>
      {pedido.bloqueInfo && <BloqueInfo info={pedido.bloqueInfo} />}
      <Cuadricula>
        <Campo etiqueta="Fecha" completo={esTransf}>
          <input id="mov-fecha" type="date" className="input" value={fecha} onChange={e => setFecha(e.target.value)} />
        </Campo>

        {!esTransf && (
          <Campo etiqueta="Monto" id="grupo-monto">
            <input id="mov-monto" type="text" inputMode="decimal" placeholder="0 ó 4000+5000" className="input"
              value={monto} onChange={e => escribirMonto(e.target.value, setMonto, setMontoCalc)}
              onBlur={() => cerrarMonto(monto, setMonto, setMontoCalc)} />
            {montoCalc && <span id="mov-monto-calc" className="mov-saldo-hint">{montoCalc}</span>}
            {(faltaSaldo || aviso) && (
              <span id="mov-fondos-warn" className="mov-fondos-warn">
                <Icono nombre="alerta" size={13} /> {faltaSaldo ? `Fondos insuficientes · Disponible: ${formatMonto(saldoCaja)}` : aviso}
              </span>
            )}
          </Campo>
        )}

        {!esTransf && (
          <Campo etiqueta="Caja" completo id="row-caja-normal">
            {selector("mov-caja", cajaEfectiva, cajasNormal.map(c => ({ nombre: c.nombre, etiqueta: etiquetaCaja(c) })), elegirCaja, false)}
            {saldoCaja !== null && <span id="mov-saldo-disponible" className="mov-saldo-hint">Disponible: {formatMonto(saldoCaja)}</span>}
          </Campo>
        )}

        {mostrarCategorias && (
          <Campo etiqueta="Categoría" completo id="grupo-categoria">
            <input type="hidden" id="mov-categoria" value={categoria} readOnly />
            <div className={"accion-caja-chips cat-btn-group" + (soloGasto ? " grupo-2" : "")} id="cat-btn-group">
              {CATEGORIAS
                .filter(([valor]) => !soloGasto || valor === "Gasto fijo" || valor === "Gasto variable")
                .map(([valor, texto, ic]) => (
                  <button key={valor} type="button" data-value={valor}
                    className={"accion-caja-chip cat-btn" + (categoria === valor ? " active" : "")}
                    onClick={() => elegirCategoria(valor)}><Icono nombre={ic} size={15} /> {texto}</button>
                ))}
            </div>
          </Campo>
        )}
        {!mostrarCategorias && <input type="hidden" id="mov-categoria" value={categoria} readOnly />}

        {!esTransf && (
          <Campo etiqueta="Concepto" completo id="grupo-concepto">
            {categoria === "" && <div id="concepto-placeholder" className="concepto-placeholder">Primero selecciona una categoría</div>}
            {config[categoria] && campoConcepto(categoria)}
          </Campo>
        )}

        {esTransf && (
          <div id="row-transferencia" className="campo-completo">
            <div className="transferencia-card">
              <div className="transferencia-row">
                <Cuadricula>
                  <Campo etiqueta={<>Origen <span className="label-origen">(resta)</span></>}>
                    {selector("mov-caja-origen", origen, todas.map(c => ({ nombre: c.nombre, etiqueta: etiquetaCaja(c) })), setOrigen, true)}
                  </Campo>
                  <Campo etiqueta={<>Destino <span className="label-destino">(suma)</span></>}>
                    {selector("mov-caja-destino", destino, todas.map(c => ({ nombre: c.nombre, etiqueta: etiquetaCaja(c) })), setDestino, true)}
                  </Campo>
                </Cuadricula>
              </div>
              <Cuadricula>
                <Campo etiqueta="Monto" completo={!monedasDiferentes}>
                  <input id="mov-monto-transferencia" type="text" inputMode="decimal" placeholder="0 ó 4000+5000" className="input"
                    value={montoTransf} onChange={e => escribirMonto(e.target.value, setMontoTransf, setMontoTransfCalc)}
                    onBlur={() => cerrarMonto(montoTransf, setMontoTransf, setMontoTransfCalc)} />
                  {montoTransfCalc && <span id="mov-monto-transf-calc" className="mov-saldo-hint">{montoTransfCalc}</span>}
                </Campo>
                {monedasDiferentes && (
                  <Campo etiqueta={<>Tipo de cambio (1 <span id="tc-moneda-origen">{monedaDe(origen)}</span> = ? <span id="tc-moneda-destino">{monedaDe(destino)}</span>)</>} id="row-tipo-cambio">
                    <input id="mov-tipo-cambio" type="number" inputMode="decimal" placeholder="Ej: 4200" className="input"
                      value={tipoCambio} onChange={e => setTipoCambio(e.target.value)} />
                    <div id="tc-preview" style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>{preview}</div>
                  </Campo>
                )}
              </Cuadricula>
            </div>
          </div>
        )}

        <Campo etiqueta="Descripción" opcional completo>
          <textarea id="mov-descripcion" rows={2} placeholder="Detalle, notas…" className="input"
            style={{ resize: "none", minHeight: 60, fontSize: 15, lineHeight: 1.4 }}
            value={descripcion} onChange={e => setDescripcion(e.target.value)} />
        </Campo>

        <Campo etiqueta="Soporte" opcional completo>
          <div className="fotos-actions-row">
            <label className="btn-secondary btn-sm fotos-btn" htmlFor="camara-file"><Icono nombre="camara" size={16} /> Cámara</label>
            <input id="camara-file" type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={e => { agregarArchivos(e.target.files); e.target.value = ""; }} />
            <button type="button" id="btn-mov-audio" className={"btn-secondary btn-sm fotos-btn" + (grabando ? " grabando" : "")}
              onClick={alternarGrabacion}>
              <Icono nombre={grabando ? "alto" : "micro"} size={16} /> {grabando ? "Detener" : "Grabar"}
            </button>
          </div>
          <div id="fotos-existentes" className="fotos-preview">
            {existente && <FotosExistentes recibo={existente.recibo} cargarMedia={cargarMedia} />}
          </div>
          <div id="fotos-preview" className="fotos-preview">
            {fotos.map((f, i) => esAudio(f) ? (
              <div key={i} className="recordatorio-audio-preview">
                <audio controls src={f.data}></audio>
                <button className="foto-thumb-remove" type="button" onClick={() => setFotos(a => a.filter((_, k) => k !== i))}>×</button>
              </div>
            ) : (
              <div key={i} className="foto-thumb">
                <img src={f.data} alt={"foto " + (i + 1)} className="foto-thumb-img" />
                <button className="foto-thumb-remove" type="button" onClick={() => setFotos(a => a.filter((_, k) => k !== i))}>×</button>
              </div>
            ))}
          </div>
          <span id="recibo-status" className="recibo-status">{textoAdjuntos}</span>
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

// Selector de caja con color y logo (reemplazo del <select> nativo, que en iOS no respeta los colores).
// Se deja el <select> escondido justo antes del selector, igual que siempre.
function SelectorCaja({ id, valor, opciones, alCambiar, abierto, alAlternar, ancho, iconoCaja, colorCaja }) {
  const botonRef = useRef(null);
  const [estilo, setEstilo] = useState(null);

  // Origen/Destino viven en dos columnas angostas: su lista se despliega al ancho completo de la hoja.
  useEffect(() => {
    if (!abierto || !ancho || !botonRef.current) { setEstilo(null); return; }
    const toggle = botonRef.current;
    const hoja = toggle.closest(".hoja");
    if (!hoja) return;
    const rHoja = hoja.getBoundingClientRect();
    const rToggle = toggle.getBoundingClientRect();
    const est = getComputedStyle(hoja);
    const padIzq = parseFloat(est.paddingLeft) || 0;
    const padDer = parseFloat(est.paddingRight) || 0;
    setEstilo({ position: "fixed", left: rHoja.left + padIzq, width: rHoja.width - padIzq - padDer, right: "auto", top: rToggle.bottom + 6 });
  }, [abierto, ancho]);

  const actual = opciones.find(o => o.nombre === valor);
  return (
    <>
      <select id={id} style={{ display: "none" }} value={actual ? valor : ""} onChange={e => alCambiar(e.target.value)}>
        <option value="">Selecciona una caja</option>
        {opciones.map(o => <option key={o.nombre} value={o.nombre}>{o.etiqueta}</option>)}
      </select>
      <div className="caja-picker">
        <button type="button" ref={botonRef} className={"caja-picker-toggle input" + (actual ? "" : " caja-picker-placeholder")}
          onClick={e => { e.stopPropagation(); alAlternar(); }}>
          {actual ? actual.etiqueta : "Selecciona una caja"}
        </button>
        <div className={"caja-picker-panel" + (abierto ? "" : " hidden")} style={estilo || undefined}>
          {opciones.length > 0
            ? opciones.map(o => (
              <button key={o.nombre} type="button" className="caja-picker-option" data-value={o.nombre}
                style={{ backgroundColor: colorCaja(o.nombre) }}
                onClick={e => { e.stopPropagation(); alCambiar(o.nombre); alAlternar(false); }}>
                <span className="caja-picker-option-texto">{o.etiqueta}</span>
                <LogoCaja icono={iconoCaja(o.nombre)} clase="caja-picker-option-icono" />
              </button>))
            : <div className="caja-picker-empty">Sin cajas disponibles</div>}
        </div>
      </div>
    </>
  );
}

// Bloque informativo encima del formulario (ej. el recordatorio desde el que se crea el movimiento).
function BloqueInfo({ info }) {
  const ref = useRef(null);
  useEffect(() => { if (info.alMontar && ref.current) info.alMontar(ref.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const html = window.reemplazarEmojisHtml ? window.reemplazarEmojisHtml(info.html) : info.html;
  return <div ref={ref} className="recordatorio-info-bloque" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Fotos y audios que el movimiento ya tenía guardados en Drive (solo lectura, al editar).
function FotosExistentes({ recibo, cargarMedia }) {
  const urls = (recibo || "").split(",").map(u => u.trim()).filter(Boolean);
  const [items, setItems] = useState(() => urls.map(() => ({ estado: "cargando" })));

  useEffect(() => {
    let vivo = true;
    urls.forEach(async (url, i) => {
      try {
        const { blobUrl, esAudio: audio } = await cargarMedia(url);
        if (vivo) setItems(a => a.map((x, k) => k === i ? { estado: audio ? "audio" : "foto", blobUrl } : x));
      } catch (err) {
        if (vivo) setItems(a => a.map((x, k) => k === i ? { estado: "error", mensaje: err.message } : x));
      }
    });
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return items.map((it, i) => {
    if (it.estado === "audio") return <div key={i} className="recordatorio-audio-preview"><audio controls src={it.blobUrl}></audio></div>;
    if (it.estado === "foto") {
      return (
        <a key={i} className="foto-thumb" href={it.blobUrl} target="_blank" rel="noopener" title="Ver foto completa">
          <img className="foto-thumb-img" alt="foto guardada" src={it.blobUrl} />
        </a>
      );
    }
    if (it.estado === "error") return <span key={i} className="foto-thumb" title={"No se pudo cargar: " + it.mensaje}><Icono nombre="alerta" size={18} /></span>;
    return <span key={i} className="foto-thumb" title="Cargando…"></span>;
  });
}

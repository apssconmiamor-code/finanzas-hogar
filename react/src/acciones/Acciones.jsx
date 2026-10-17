import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "../shared/Modal.jsx";
import { cajasDeAccion, origenesDeAccion, destinosDeAccion } from "./modelo.js";

// Acciones rápidas (antes en recordatorios.js, a mano sobre el DOM): movimientos
// preconfigurados que solo piden el monto al usarse. Tres ventanas -- el menú
// (cuadrícula de acciones), usar una acción y configurarla -- con los mismos ids y
// clases de siempre (style.css y los tests E2E no cambian).
//
// app.js / recordatorios.js siguen siendo dueños de los datos y de hablar con
// Sheets; acá solo se dibuja y se maneja el estado de las ventanas.
//
// Props (ver renderAccionesReact en recordatorios.js):
//   acciones[]              lista guardada del usuario
//   getCajas()              cajas actuales (se leen al abrir, no quedan viejas)
//   cajaVisible(caja)       ¿este usuario puede manejar esa caja? (Ingreso/Gasto)
//   getConceptos(categoria) conceptos de Gasto fijo / Gasto variable / Ingreso
//   iconoCaja(nombre)       logo de la entidad de una caja, o null
//   evaluarMonto(texto)     "4000+5000" -> 9000
//   onGuardarLista(lista)   guarda la lista completa (Promise)
//   onRegistrar(accion, datos)  crea el/los movimiento(s) en Sheets (Promise)
//   onAbrirRecordatorio()   tarjeta "Recordatorio" del menú
//   renderId                cambia en cada render() de afuera

export function Acciones(props) {
  const [vista, setVista] = useState(null);   // null | { t: "menu" } | { t: "usar"|"config", slot }

  useEffect(() => {
    const abrir = () => setVista({ t: "menu" });
    document.addEventListener("acciones:abrir", abrir);
    return () => document.removeEventListener("acciones:abrir", abrir);
  }, []);

  const cerrar = useCallback(() => setVista(null), []);
  const irAlMenu = useCallback(() => setVista({ t: "menu" }), []);

  if (!vista) return null;
  if (vista.t === "menu") {
    return <MenuAcciones key={props.renderId} {...props}
      alCerrar={cerrar}
      alUsar={slot => setVista({ t: "usar", slot })}
      alConfigurar={slot => setVista({ t: "config", slot })}
      alRecordatorio={() => { setVista(null); props.onAbrirRecordatorio(); }} />;
  }
  if (vista.t === "config") {
    return <ConfigAccion key={"c" + vista.slot} slot={vista.slot} {...props} alVolver={irAlMenu} />;
  }
  return <UsarAccion key={"u" + vista.slot} slot={vista.slot} {...props} alCerrar={cerrar} />;
}

// ---------------------------------------------------------------------------
// Menú: cuadrícula de acciones + Recordatorio + Agregar
// ---------------------------------------------------------------------------
function MenuAcciones({ acciones, iconoCaja, onGuardarLista, alCerrar, alUsar, alConfigurar, alRecordatorio }) {
  const gridRef = useRef(null);

  // Toque corto = usar la acción; mantener presionado ~500ms = configurarla; mantener y
  // ARRASTRAR = reordenarla (gestos.js, crearManejadorArrastrable -- pedido explícito de
  // poder acomodar las tarjetas). Los gestos mutan el DOM, así que el menú se remonta
  // (key) cuando cambia la lista, como Cajas.
  useEffect(() => {
    const grid = gridRef.current;
    grid.querySelectorAll(".accion-rapida-card[data-slot]").forEach(card => {
      const slot = parseInt(card.dataset.slot, 10);
      window.crearManejadorArrastrable(card, grid, ".accion-rapida-card[data-slot]", {
        onCorto: () => alUsar(slot),
        onLargo: () => alConfigurar(slot),
        onReordenar: () => {
          const nuevoOrden = Array.from(grid.querySelectorAll(".accion-rapida-card[data-slot]"))
            .map(c => acciones[parseInt(c.dataset.slot, 10)])
            .filter(Boolean);
          onGuardarLista(nuevoOrden);
        },
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal id="modal-menu-acciones" claseTarjeta="modal-card-fullscreen" onCerrar={alCerrar}>
      <div id="acciones-rapidas-grid" className="acciones-rapidas-grid" ref={gridRef}>
        {acciones.map((accion, i) => {
          // Logo de la entidad de la caja (Nequi/Bancolombia/...) junto al ícono elegido,
          // para identificar de un vistazo a qué caja va cada acción. Con más de una caja
          // no hay un logo único: se calla en vez de mostrar uno al azar.
          const cajasDeEsta = cajasDeAccion(accion);
          const logo = cajasDeEsta.length === 1 ? iconoCaja(cajasDeEsta[0]) : null;
          return (
            <button key={i} className="accion-rapida-card" data-slot={i}>
              <span className="accion-rapida-icono-fila">
                <span className="accion-rapida-icono">{accion.icono || "⚡"}</span>
                {logo && <img className="accion-rapida-caja-icono" src={logo} alt="" />}
              </span>
              <span className="accion-rapida-nombre">{accion.nombre}</span>
            </button>
          );
        })}
        <button className="accion-rapida-card" id="accion-recordatorio" onClick={alRecordatorio}>
          <span className="accion-rapida-icono">📝</span>
          <span className="accion-rapida-nombre">Recordatorio</span>
        </button>
        {/* "Agregar" siempre al final: de nada sirve como referencia fija si las
            acciones ya configuradas lo van corriendo (pedido explícito). */}
        <button className="accion-rapida-card accion-rapida-vacia" id="btn-agregar-accion" onClick={() => alConfigurar(-1)}>
          <span className="accion-rapida-icono">➕</span>
          <span className="accion-rapida-nombre">Agregar</span>
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Chips de cajas (multi-selección o elección única)
// ---------------------------------------------------------------------------
function Chips({ id, nombres, activos, alAlternar }) {
  if (nombres.length === 0) return <div id={id} className="accion-caja-chips"><span className="label-opcional">No hay cajas todavía</span></div>;
  return (
    <div id={id} className="accion-caja-chips">
      {nombres.map(n => (
        <button key={n} type="button" data-caja={n}
          className={"accion-caja-chip" + (activos.has(n) ? " active" : "")}
          onClick={() => alAlternar(n)}>{n}</button>
      ))}
    </div>
  );
}

const alternarEnSet = (set, n) => { const s = new Set(set); if (s.has(n)) s.delete(n); else s.add(n); return s; };

// ---------------------------------------------------------------------------
// Configurar una acción (slot -1 = nueva)
// ---------------------------------------------------------------------------
function ConfigAccion({ slot, acciones, getCajas, cajaVisible, getConceptos, onGuardarLista, alVolver }) {
  const accion = slot >= 0 ? acciones[slot] : null;
  const [nombre, setNombre] = useState(accion?.nombre || "");
  const [icono, setIcono] = useState(accion?.icono || "");
  const [categoria, setCategoria] = useState(accion?.categoria || "Gasto fijo");
  const [conceptoElegido, setConceptoElegido] = useState(accion?.concepto || "");
  const [cajasSel, setCajasSel] = useState(() => new Set(cajasDeAccion(accion)));
  const [origenes, setOrigenes] = useState(() => new Set(origenesDeAccion(accion)));
  const [destinos, setDestinos] = useState(() => new Set(destinosDeAccion(accion)));
  const [pedirDescripcion, setPedirDescripcion] = useState(!!accion?.pedirDescripcion);
  const [camara, setCamara] = useState(!!accion?.camara);
  const [guardando, setGuardando] = useState(false);

  const esTransferencia = categoria === "Transferencia";
  const conceptos = esTransferencia ? [] : getConceptos(categoria);
  const concepto = conceptos.includes(conceptoElegido) ? conceptoElegido : (conceptos[0] || "");

  const todas = getCajas();
  // Ingreso/Gasto: solo las cajas que este usuario puede manejar. Transferencia: TODAS --
  // una transferencia mueve plata ENTRE cajas, no depende de quién las administra (mismo
  // criterio que "Nueva transferencia" en el formulario normal).
  const nombresVisibles = todas.filter(cajaVisible).map(c => c.nombre);
  const nombresTodas = todas.map(c => c.nombre);

  async function guardar() {
    const nom = nombre.trim();
    const ico = icono.trim() || "⚡";
    let nueva;
    if (esTransferencia) {
      const cajasOrigen = nombresTodas.filter(n => origenes.has(n));
      const cajasDestino = nombresTodas.filter(n => destinos.has(n));
      if (!nom || cajasOrigen.length === 0 || cajasDestino.length === 0) {
        alert("Completa el nombre y elige al menos una caja de origen y una de destino");
        return;
      }
      if (cajasOrigen.length === 1 && cajasDestino.length === 1 && cajasOrigen[0] === cajasDestino[0]) {
        alert("La caja origen y destino no pueden ser la misma");
        return;
      }
      // Se guarda también cajaOrigen/cajaDestino (la primera de cada lista) para que una
      // versión anterior de la app en otro dispositivo siga entendiendo la acción.
      nueva = {
        nombre: nom, icono: ico, categoria, cajasOrigen, cajasDestino,
        cajaOrigen: cajasOrigen[0], cajaDestino: cajasDestino[0], pedirDescripcion, camara,
      };
    } else {
      const cajasElegidas = nombresVisibles.filter(n => cajasSel.has(n));
      if (!nom || !categoria || !concepto || cajasElegidas.length === 0) {
        alert("Completa todos los campos (elige al menos una caja)");
        return;
      }
      nueva = { nombre: nom, icono: ico, categoria, concepto, cajas: cajasElegidas, pedirDescripcion, camara };
    }

    setGuardando(true);
    try {
      const lista = [...acciones];
      if (slot >= 0) lista[slot] = nueva; else lista.push(nueva);
      await onGuardarLista(lista);
      alVolver();
    } catch (err) {
      alert("Error guardando la acción: " + err.message);
      setGuardando(false);
    }
  }

  async function borrar() {
    if (slot < 0) return;
    try {
      const lista = [...acciones];
      lista.splice(slot, 1);
      await onGuardarLista(lista);
      alVolver();
    } catch (err) {
      alert("Error borrando la acción: " + err.message);
    }
  }

  return (
    <Modal id="modal-config-accion" estiloTarjeta={{ maxWidth: 420 }} onCerrar={alVolver}>
      <h3 className="modal-title">Configurar acción rápida</h3>
      <div className="form-group">
        <input id="config-accion-nombre" type="text" placeholder="Nombre (ej: Mercado)" className="input"
          value={nombre} onChange={e => setNombre(e.target.value)} />
      </div>
      <div className="form-group">
        <input id="config-accion-icono" type="text" placeholder="Ícono (ej: 🛒)" className="input" maxLength={4}
          value={icono} onChange={e => setIcono(e.target.value)} />
      </div>
      <div className="form-group">
        <select id="config-accion-categoria" className="input" value={categoria}
          onChange={e => { setCategoria(e.target.value); setConceptoElegido(""); }}>
          <option value="Gasto fijo">📌 Gasto fijo</option>
          <option value="Gasto variable">🔀 Gasto variable</option>
          <option value="Ingreso">💰 Ingreso</option>
          <option value="Transferencia">🔁 Transferencia</option>
        </select>
      </div>

      {!esTransferencia && (
        <>
          <div className="form-group" id="config-accion-concepto-wrap">
            <select id="config-accion-concepto" className="input" value={concepto}
              onChange={e => setConceptoElegido(e.target.value)}>
              {conceptos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" id="config-accion-cajas-wrap">
            <label>Caja(s) -- si eliges más de una, se elige entre esas al usar la acción</label>
            <Chips id="config-accion-cajas" nombres={nombresVisibles} activos={cajasSel}
              alAlternar={n => setCajasSel(s => alternarEnSet(s, n))} />
          </div>
        </>
      )}

      {esTransferencia && (
        <div className="form-group" id="config-accion-transferencia-wrap">
          <label>Cajas -- puedes elegir más de una de origen y de destino; al usar la acción se elige entre ellas (con una sola de cada lado ya no se pregunta nada, solo el monto)</label>
          <div className="form-group">
            <label>Origen <span className="label-origen">(resta)</span></label>
            <Chips id="config-accion-origenes" nombres={nombresTodas} activos={origenes}
              alAlternar={n => setOrigenes(s => alternarEnSet(s, n))} />
          </div>
          <div className="form-group">
            <label>Destino <span className="label-destino">(suma)</span></label>
            <Chips id="config-accion-destinos" nombres={nombresTodas} activos={destinos}
              alAlternar={n => setDestinos(s => alternarEnSet(s, n))} />
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="config-accion-camara-label" htmlFor="config-accion-descripcion">
          <input type="checkbox" id="config-accion-descripcion" checked={pedirDescripcion}
            onChange={e => setPedirDescripcion(e.target.checked)} />
          <span>Pedir descripción al usar esta acción</span>
        </label>
      </div>
      <div className="form-group">
        <label className="config-accion-camara-label" htmlFor="config-accion-camara">
          <input type="checkbox" id="config-accion-camara" checked={camara}
            onChange={e => setCamara(e.target.checked)} />
          <span>Pedir foto con cámara al usar esta acción</span>
        </label>
      </div>
      <div className="modal-actions">
        {slot >= 0 && <button className="btn-secondary" id="btn-borrar-accion" onClick={borrar}>Borrar</button>}
        <button className="btn-secondary" id="btn-cancelar-config-accion" onClick={alVolver}>Cancelar</button>
        <button className="btn-primary" id="btn-guardar-config-accion" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Usar una acción ya configurada: solo pide el monto (y elegir caja si hay varias)
// ---------------------------------------------------------------------------
function UsarAccion({ slot, acciones, getCajas, evaluarMonto, onRegistrar, alCerrar }) {
  const accion = acciones[slot];
  const cajasAccion = cajasDeAccion(accion);
  const origenes = origenesDeAccion(accion);
  const destinos = destinosDeAccion(accion);
  const esTransferencia = accion?.categoria === "Transferencia";

  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipoCambio, setTipoCambio] = useState("");
  const [foto, setFoto] = useState(null);                    // { data, type }
  // Con una sola opción se usa directo, sin preguntar; con más de una hay que elegir.
  const [caja, setCaja] = useState(cajasAccion.length === 1 ? cajasAccion[0] : null);
  const [origen, setOrigen] = useState(origenes.length === 1 ? origenes[0] : null);
  const [destino, setDestino] = useState(destinos.length === 1 ? destinos[0] : null);
  const [guardando, setGuardando] = useState(false);
  const montoRef = useRef(null);
  const archivoRef = useRef(null);

  const hayQueElegir = esTransferencia ? (origenes.length > 1 || destinos.length > 1) : cajasAccion.length > 1;
  useEffect(() => {
    // Si hay que elegir caja primero, el teclado del monto no se adelanta a taparle los
    // chips: se enfoca recién cuando ya no hace falta elegir.
    if (hayQueElegir) return undefined;
    const t = setTimeout(() => montoRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [hayQueElegir]);

  if (!accion) return null;

  const todas = getCajas();
  const monedaDe = n => todas.find(c => c.nombre === n)?.moneda;
  const monedasDiferentes = esTransferencia && origen && destino
    && monedaDe(origen) && monedaDe(destino) && monedaDe(origen) !== monedaDe(destino);

  function cargarFoto(file) {
    if (!file) return;
    const lector = new FileReader();
    lector.onload = e => setFoto({ data: e.target.result, type: file.type });
    lector.readAsDataURL(file);
  }

  async function guardar() {
    let cajaElegida = null;
    if (esTransferencia) {
      if (origenes.length === 0 || destinos.length === 0) { alert("Esta acción no tiene cajas de origen y destino configuradas"); return; }
      if (!origen) { alert("Elige de qué caja sale"); return; }
      if (!destino) { alert("Elige a qué caja llega"); return; }
      if (origen === destino) { alert("La caja origen y destino no pueden ser la misma"); return; }
    } else {
      if (cajasAccion.length > 1 && !caja) { alert("Elige con qué caja"); return; }
      cajaElegida = caja || cajasAccion[0];
      if (!cajaElegida) { alert("Esta acción no tiene ninguna caja configurada"); return; }
    }

    const valor = evaluarMonto(monto);
    if (!valor) { alert("Ingresa un monto"); return; }

    let tc = null;
    if (monedasDiferentes) {
      tc = parseFloat(tipoCambio);
      if (!tc || tc <= 0) { alert("Las cajas tienen monedas diferentes. Ingresa el tipo de cambio."); return; }
    }

    setGuardando(true);
    try {
      await onRegistrar(accion, {
        monto: valor,
        descripcion: accion.pedirDescripcion ? descripcion.trim() : "",
        tipoCambio: tc,
        foto: accion.camara ? foto : null,
        caja: cajaElegida, origen, destino,
      });
      alCerrar();
    } catch (err) {
      alert("Error guardando: " + err.message);
      setGuardando(false);
    }
  }

  const elegirUno = (setter) => (n) => setter(n);

  return (
    <Modal id="modal-usar-accion" estiloTarjeta={{ maxWidth: 400 }} onCerrar={alCerrar}>
      <h3 className="modal-title" id="usar-accion-titulo">{`${accion.icono || "⚡"} ${accion.nombre}`}</h3>

      {!esTransferencia && cajasAccion.length > 1 && (
        <div className="form-group" id="usar-accion-caja-wrap">
          <label>¿Con qué caja?</label>
          <Chips id="usar-accion-caja-opciones" nombres={cajasAccion} activos={new Set(caja ? [caja] : [])}
            alAlternar={elegirUno(setCaja)} />
        </div>
      )}

      {esTransferencia && (
        <div className="form-group" id="usar-accion-transferencia-info">
          <div className="transferencia-card">
            <div className="transferencia-row">
              {origenes.length > 1
                ? <Chips id="usar-accion-origen-opciones" nombres={origenes} activos={new Set(origen ? [origen] : [])}
                    alAlternar={elegirUno(setOrigen)} />
                : <span id="usar-accion-transferencia-origen" className="accion-transferencia-caja">{origenes[0]}</span>}
              <div className="transferencia-arrow">→</div>
              {destinos.length > 1
                ? <Chips id="usar-accion-destino-opciones" nombres={destinos} activos={new Set(destino ? [destino] : [])}
                    alAlternar={elegirUno(setDestino)} />
                : <span id="usar-accion-transferencia-destino" className="accion-transferencia-caja">{destinos[0]}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="form-group">
        <input id="usar-accion-monto" ref={montoRef} type="text" inputMode="decimal" placeholder="Monto"
          className="input" style={{ fontSize: 22, textAlign: "center" }}
          value={monto} onChange={e => setMonto(e.target.value)} />
      </div>

      {monedasDiferentes && (
        <div className="form-group" id="usar-accion-tipo-cambio-wrap">
          <label>Tipo de cambio (1 <span id="usar-accion-tc-moneda-origen">{monedaDe(origen)}</span> = ? <span id="usar-accion-tc-moneda-destino">{monedaDe(destino)}</span>)</label>
          <input id="usar-accion-tipo-cambio" type="number" inputMode="decimal" placeholder="Ej: 4200" className="input"
            value={tipoCambio} onChange={e => setTipoCambio(e.target.value)} />
        </div>
      )}

      {accion.pedirDescripcion && (
        <div className="form-group" id="usar-accion-descripcion-wrap">
          <textarea id="usar-accion-descripcion" rows={2} placeholder="Detalle, notas…" className="input"
            style={{ resize: "none", minHeight: 60, fontSize: 15, lineHeight: 1.4 }}
            value={descripcion} onChange={e => setDescripcion(e.target.value)} />
        </div>
      )}

      {accion.camara && (
        <div className="form-group" id="usar-accion-camara-wrap">
          <input id="usar-accion-camara-file" ref={archivoRef} type="file" accept="image/*" capture="environment"
            style={{ display: "none" }} onChange={e => cargarFoto(e.target.files[0])} />
          <button type="button" className="fotos-btn" id="btn-usar-accion-camara"
            onClick={() => archivoRef.current?.click()}>📷 Cámara</button>
          <div id="usar-accion-foto-preview" className="fotos-preview">
            {foto && (
              <div className="foto-thumb">
                <img src={foto.data} alt="foto adjunta" className="foto-thumb-img" />
                <button className="foto-thumb-remove" type="button" onClick={() => setFoto(null)}>×</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="modal-actions">
        <button className="btn-secondary" id="btn-cancelar-usar-accion" onClick={alCerrar}>Cancelar</button>
        <button className="btn-primary" id="btn-guardar-usar-accion" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Hoja, Cuadricula, Campo, Interruptor } from "../shared/Hoja.jsx";
import { Icono } from "../shared/Iconos.jsx";
import { cajasDeAccion, origenesDeAccion, destinosDeAccion } from "./modelo.js";

// Acciones rápidas: movimientos preconfigurados que solo piden el monto al usarse. Tres hojas
// -- el menú (cuadrícula de acciones), usar una acción y configurarla -- con el diseño común de
// hojas (ver shared/Hoja.jsx) y los mismos ids de siempre (los tests E2E no cambian).
//
// app.js / recordatorios.js siguen siendo dueños de los datos y de hablar con Sheets; acá solo
// se dibuja y se maneja el estado de las ventanas.
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
    <Hoja id="modal-menu-acciones" alta titulo="Nuevo movimiento"
      icono={<Icono nombre="rayo" size={22} />}
      subtitulo="Toca una acción para usarla · mantenla presionada para editarla o moverla"
      onCerrar={alCerrar}>
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
          <span className="accion-rapida-icono accion-rapida-icono-svg"><Icono nombre="nota" size={32} /></span>
          <span className="accion-rapida-nombre">Recordatorio</span>
        </button>
        {/* "Agregar" siempre al final: de nada sirve como referencia fija si las
            acciones ya configuradas lo van corriendo (pedido explícito). */}
        <button className="accion-rapida-card accion-rapida-vacia" id="btn-agregar-accion" onClick={() => alConfigurar(-1)}>
          <span className="accion-rapida-icono accion-rapida-icono-svg"><Icono nombre="sumar" size={32} /></span>
          <span className="accion-rapida-nombre">Agregar</span>
        </button>
      </div>
    </Hoja>
  );
}

// Resumen "Sale de  A  ⇄  Llega a  B" con el botón sutil que intercambia las dos.
function ParCajas({ idBase, origen, destino, alIntercambiar }) {
  const puede = !!(origen && destino);
  return (
    <div className="par-cajas" id={idBase + "-par"}>
      <div className="par-cajas-lado">
        <span className="par-cajas-rotulo">Sale de</span>
        <span className="accion-transferencia-caja" id={idBase + "-origen-elegido"}>{origen || "—"}</span>
      </div>
      <button type="button" className="par-cajas-cambiar" id={idBase + "-intercambiar"}
        aria-label="Intercambiar origen y destino" title="Intercambiar" disabled={!puede}
        onClick={alIntercambiar}>
        <Icono nombre="intercambiar" size={18} />
      </button>
      <div className="par-cajas-lado par-cajas-lado-der">
        <span className="par-cajas-rotulo">Llega a</span>
        <span className="accion-transferencia-caja" id={idBase + "-destino-elegido"}>{destino || "—"}</span>
      </div>
    </div>
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
  // Transferencia: se eligen DOS cajas de una sola lista (la primera sale, la segunda llega) y
  // un botón intercambia cuál es cuál. Una acción guardada con varias cajas por lado conserva
  // solo la primera de cada una al editarla.
  const [origen, setOrigen] = useState(origenesDeAccion(accion)[0] || null);
  const [destino, setDestino] = useState(destinosDeAccion(accion)[0] || null);
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
      if (!nom || !origen || !destino) {
        alert("Completa el nombre y elige las dos cajas (de cuál sale y a cuál llega)");
        return;
      }
      if (origen === destino) {
        alert("La caja origen y destino no pueden ser la misma");
        return;
      }
      const cajasOrigen = [origen];
      const cajasDestino = [destino];
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
    <Hoja id="modal-config-accion" icono={<Icono nombre="rayo" size={22} />}
      titulo={slot >= 0 ? "Editar acción rápida" : "Nueva acción rápida"}
      subtitulo="Un movimiento ya armado: al usarla solo se pide el monto"
      onCerrar={alVolver}
      pie={
        <>
          {slot >= 0 && <button className="btn-secondary btn-peligro" id="btn-borrar-accion" onClick={borrar}>Borrar</button>}
          <button className="btn-secondary" id="btn-cancelar-config-accion" onClick={alVolver}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-config-accion" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Nombre">
          <input id="config-accion-nombre" type="text" placeholder="Ej: Mercado" className="input"
            value={nombre} onChange={e => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Ícono">
          <input id="config-accion-icono" type="text" placeholder="Ej: 🛒" className="input" maxLength={4}
            value={icono} onChange={e => setIcono(e.target.value)} />
        </Campo>

        <Campo etiqueta="Categoría" completo={esTransferencia}>
          <select id="config-accion-categoria" className="input" value={categoria}
            onChange={e => { setCategoria(e.target.value); setConceptoElegido(""); }}>
            <option value="Gasto fijo">📌 Gasto fijo</option>
            <option value="Gasto variable">🔀 Gasto variable</option>
            <option value="Ingreso">💰 Ingreso</option>
            <option value="Transferencia">🔁 Transferencia</option>
          </select>
        </Campo>
        {!esTransferencia && (
          <Campo etiqueta="Concepto" id="config-accion-concepto-wrap">
            <select id="config-accion-concepto" className="input" value={concepto}
              onChange={e => setConceptoElegido(e.target.value)}>
              {conceptos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
        )}

        {!esTransferencia && (
          <Campo etiqueta="Caja(s) — si eliges más de una, se elige entre ellas al usar la acción" completo id="config-accion-cajas-wrap">
            <Chips id="config-accion-cajas" nombres={nombresVisibles} activos={cajasSel}
              alAlternar={n => setCajasSel(s => alternarEnSet(s, n))} />
          </Campo>
        )}

        {esTransferencia && (
          <Campo etiqueta="Cajas — elige de cuál sale y a cuál llega" completo id="config-accion-transferencia-wrap">
            <Chips id="config-accion-transf-cajas" nombres={nombresTodas}
              activos={new Set([origen, destino].filter(Boolean))}
              alAlternar={n => {
                if (n === origen) setOrigen(null);
                else if (n === destino) setDestino(null);
                else if (!origen) setOrigen(n);
                else setDestino(n);   // la segunda; una tercera reemplaza a la segunda
              }} />
            <ParCajas idBase="config-accion" origen={origen} destino={destino}
              alIntercambiar={() => { setOrigen(destino); setDestino(origen); }} />
          </Campo>
        )}

        <Interruptor id="config-accion-descripcion" texto="Pedir descripción al usarla"
          checked={pedirDescripcion} onChange={setPedirDescripcion} />
        <Interruptor id="config-accion-camara" texto="Pedir foto con cámara al usarla"
          checked={camara} onChange={setCamara} />
      </Cuadricula>
    </Hoja>
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
  const subtitulo = esTransferencia ? "Transferencia" : [accion.categoria, accion.concepto].filter(Boolean).join(" · ");

  return (
    <Hoja id="modal-usar-accion" idTitulo="usar-accion-titulo" titulo={accion.nombre}
      icono={accion.icono || "⚡"} subtitulo={subtitulo} onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-usar-accion" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-usar-accion" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </>
      }>
      <Cuadricula>
        {!esTransferencia && cajasAccion.length > 1 && (
          <Campo etiqueta="¿Con qué caja?" completo id="usar-accion-caja-wrap">
            <Chips id="usar-accion-caja-opciones" nombres={cajasAccion} activos={new Set(caja ? [caja] : [])}
              alAlternar={elegirUno(setCaja)} />
          </Campo>
        )}

        {esTransferencia && (
          <Campo completo id="usar-accion-transferencia-info">
            {hayQueElegir ? (
              <Cuadricula>
                <Campo etiqueta="Sale de">
                  {origenes.length > 1
                    ? <Chips id="usar-accion-origen-opciones" nombres={origenes} activos={new Set(origen ? [origen] : [])}
                        alAlternar={elegirUno(setOrigen)} />
                    : <span className="accion-transferencia-caja">{origenes[0]}</span>}
                </Campo>
                <Campo etiqueta="Llega a">
                  {destinos.length > 1
                    ? <Chips id="usar-accion-destino-opciones" nombres={destinos} activos={new Set(destino ? [destino] : [])}
                        alAlternar={elegirUno(setDestino)} />
                    : <span className="accion-transferencia-caja">{destinos[0]}</span>}
                </Campo>
              </Cuadricula>
            ) : (
              <ParCajas idBase="usar-accion-transferencia" origen={origen} destino={destino}
                alIntercambiar={() => { setOrigen(destino); setDestino(origen); }} />
            )}
          </Campo>
        )}

        <Campo etiqueta="Monto" completo={!monedasDiferentes}>
          <input id="usar-accion-monto" ref={montoRef} type="text" inputMode="decimal" placeholder="0 ó 4000+5000"
            className="input" style={{ fontSize: 22, fontWeight: 700 }}
            value={monto} onChange={e => setMonto(e.target.value)} />
        </Campo>

        {monedasDiferentes && (
          <Campo etiqueta="Tipo de cambio" id="usar-accion-tipo-cambio-wrap">
            <input id="usar-accion-tipo-cambio" type="number" inputMode="decimal" placeholder="Ej: 4200" className="input"
              style={{ fontSize: 22, fontWeight: 700 }} value={tipoCambio} onChange={e => setTipoCambio(e.target.value)} />
            <span className="hoja-ayuda">1 <span id="usar-accion-tc-moneda-origen">{monedaDe(origen)}</span> = ? <span id="usar-accion-tc-moneda-destino">{monedaDe(destino)}</span></span>
          </Campo>
        )}

        {accion.pedirDescripcion && (
          <Campo etiqueta="Descripción" completo id="usar-accion-descripcion-wrap">
            <textarea id="usar-accion-descripcion" rows={2} placeholder="Detalle, notas…" className="input"
              style={{ resize: "none", minHeight: 64, lineHeight: 1.4 }}
              value={descripcion} onChange={e => setDescripcion(e.target.value)} />
          </Campo>
        )}

        {accion.camara && (
          <Campo etiqueta="Foto" completo id="usar-accion-camara-wrap">
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
          </Campo>
        )}
      </Cuadricula>
    </Hoja>
  );
}

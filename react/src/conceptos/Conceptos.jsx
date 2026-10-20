import { useEffect, useMemo, useRef, useState } from "react";
import { Hoja, Cuadricula, Campo } from "../shared/Hoja.jsx";
import { Icono, IconoDe } from "../shared/Iconos.jsx";
import { SelectorIconos } from "../shared/SelectorIconos.jsx";
import { conMiles } from "../shared/formato.js";

// Ventanas de Proyección y conceptos con el diseño de hojas (ver shared/Hoja.jsx): ¿qué mes
// agregar?, configurar un mes, nuevo concepto (se abre desde configurar un mes), modificar el
// estimado de un concepto y archivar conceptos. app.js sigue siendo dueño de los datos.
//
// Se abren con el evento "conceptos:abrir":
//   { t: "agregarMes", faltantes, ultimo, siguiente }
//   { t: "config", mes }                      configurar un mes
//   { t: "modificar", concepto, categoria }   el estimado de un solo concepto
//   { t: "archivar" }
//
// Props (ver renderConceptosReact en app.js):
//   elegirMes(mes)                          agrega ese mes a la proyección
//   datosConfigMes(mes)                     lo que muestra "configurar mes" (ver app.js)
//   onGuardarConfigMes(mes, ingresos, gastos)
//   iconoDe(concepto, esIngreso)            emoji del concepto (se muestra como ícono)
//   nombresConceptos()                      todos los conceptos (sugerencias)
//   estadoNombre(nombre)                    { existe, archivado, parecidos[] }
//   onGuardarConcepto(datos, desdeConfigMes)   (Promise; si falla, lanza)
//   valorConcepto(concepto, categoria)      estimado actual del mes activo
//   onGuardarModificar(concepto, categoria, valor)
//   datosArchivar()                         { ingresos[], fijos[], variables[], archivados[], movimientosDe(n) }
//   onArchivar(nombre) / onRestaurar(nombre)   (Promise; si falla, lanzan)
//   evaluarMonto(texto)

export function Conceptos(props) {
  const [vista, setVista] = useState(null);

  useEffect(() => {
    const abrir = e => setVista({ ...e.detail, n: Date.now() });
    document.addEventListener("conceptos:abrir", abrir);
    return () => document.removeEventListener("conceptos:abrir", abrir);
  }, []);

  const cerrar = () => setVista(null);
  if (!vista) return null;

  if (vista.t === "agregarMes") return <HojaAgregarMes key={vista.n} {...props} datos={vista} alCerrar={cerrar} />;
  if (vista.t === "modificar") return <HojaModificar key={vista.n} {...props} datos={vista} alCerrar={cerrar} />;
  if (vista.t === "archivar") return <HojaArchivar key={vista.n} {...props} alCerrar={cerrar} />;
  if (vista.t === "nuevo") {
    // Desde "Configurar mes": al guardar o cancelar se vuelve ahí con lo que ya estaba escrito.
    return <HojaNuevoConcepto key={vista.n} {...props}
      alVolver={(nuevo, enfocar) => setVista({ t: "config", mes: vista.mes, borrador: { valores: vista.valores, nuevo }, enfocar, n: Date.now() })}
      alCerrar={cerrar} />;
  }
  return <HojaConfigMes key={vista.n} {...props} mes={vista.mes} borrador={vista.borrador} enfocar={vista.enfocar}
    alNuevoConcepto={valores => setVista({ t: "nuevo", mes: vista.mes, valores, n: Date.now() })} alCerrar={cerrar} />;
}

// ---------------------------------------------------------------------------
// ¿Qué mes agregar?
// ---------------------------------------------------------------------------
function HojaAgregarMes({ elegirMes, datos, alCerrar }) {
  const { faltantes, ultimo, siguiente } = datos;
  const labelMes = s => new Date(s + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const elegir = mes => { elegirMes(mes); alCerrar(); };

  return (
    <Hoja id="modal-agregar-mes" icono={<Icono nombre="calendario" size={22} />} titulo="¿Qué mes agregar?"
      subtitulo="Hay meses sin cubrir en tu proyección." onCerrar={alCerrar}
      pie={<button className="btn-secondary" id="btn-cancelar-agregar-mes" onClick={alCerrar}>Cancelar</button>}>
      <div id="modal-agregar-mes-opciones" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
          Hay {faltantes.length} mes{faltantes.length > 1 ? "es" : ""} sin cubrir antes de {labelMes(ultimo)}:
        </p>
        {faltantes.map(f => (
          <button key={f} className="btn-secondary" style={{ justifyContent: "flex-start", gap: 8 }}
            data-mes-add={f} onClick={() => elegir(f)}>
            <Icono nombre="calendario" size={16} /> Agregar <strong>{labelMes(f)}</strong>
          </button>
        ))}
        <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
        <button className="btn-primary" data-mes-add={siguiente} onClick={() => elegir(siguiente)}>
          <Icono nombre="adelante" size={16} /> Continuar con {labelMes(siguiente)}
        </button>
      </div>
    </Hoja>
  );
}

// ---------------------------------------------------------------------------
// Configurar mes
// ---------------------------------------------------------------------------
function HojaConfigMes({ mes, borrador, enfocar, datosConfigMes, onGuardarConfigMes, iconoDe, evaluarMonto, alNuevoConcepto, alCerrar }) {
  const d = useMemo(() => datosConfigMes(mes), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Texto inicial de cada casilla: lo ya escrito (si se vuelve de crear un concepto) o lo guardado.
  const textoDe = (tipo, nombre, guardado) => {
    if (borrador?.nuevo && borrador.nuevo.tipo === tipo && borrador.nuevo.concepto === nombre) {
      return Number(borrador.nuevo.monto).toLocaleString("es-CO");
    }
    const clave = tipo + "|" + nombre;
    if (borrador?.valores && clave in borrador.valores) return borrador.valores[clave];
    return guardado ? Number(guardado).toLocaleString("es-CO") : "0";
  };
  // Con valor primero, los 0 al final de cada grupo (el orden original se conserva).
  const armar = (lista, tipo, base) => lista
    .map(nombre => {
      const texto = textoDe(tipo, nombre, base[nombre]);
      return { nombre, tipo, texto, conValor: evaluarMonto(texto) > 0 };
    })
    .sort((x, y) => Number(y.conValor) - Number(x.conValor));

  const grupos = useMemo(() => [
    { clave: "ingresos", titulo: "Ingresos estimados", icono: "monedas", filas: armar(d.ingresos, "ingreso", d.fuentes) },
    { clave: "fijos", titulo: "Gastos fijos", icono: "pin", filas: armar(d.fijos, "gasto", d.gastos) },
    { clave: "variables", titulo: "Gastos variables", icono: "mezclar", filas: armar(d.variables, "gasto", d.gastos) },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  const [valores, setValores] = useState(() => {
    const v = {};
    grupos.forEach(g => g.filas.forEach(f => { v[f.tipo + "|" + f.nombre] = f.texto; }));
    return v;
  });
  const cuerpoRef = useRef(null);

  // "Usar «Internet»": se vuelve acá y se deja el cursor en la casilla del concepto que ya existe.
  useEffect(() => {
    if (!enfocar) return;
    const inp = [...cuerpoRef.current.querySelectorAll(".pres-input")]
      .find(i => (i.dataset.fuente || i.dataset.concepto) === enfocar);
    if (inp) { inp.scrollIntoView({ block: "center" }); inp.focus(); inp.select(); }
  }, [enfocar]);

  function guardar() {
    const nuevosIngresos = {}, nuevosGastos = {};
    grupos.forEach(g => g.filas.forEach(f => {
      const v = evaluarMonto(valores[f.tipo + "|" + f.nombre]);
      if (v > 0) { if (f.tipo === "ingreso") nuevosIngresos[f.nombre] = v; else nuevosGastos[f.nombre] = v; }
    }));
    onGuardarConfigMes(mes, nuevosIngresos, nuevosGastos);
    alCerrar();
  }

  const mesLabel = new Date(mes + "-15").toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  return (
    <Hoja id="modal-config-mes" idTitulo="modal-config-mes-titulo" alta icono={<Icono nombre="calendario" size={22} />}
      titulo={`Proyección · ${mesLabel}`} onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-config-mes" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-config-mes" onClick={guardar}>Guardar</button>
        </>
      }>
      <div className="modal-subtitle-fila">
        <p className="modal-subtitle">Ingresos estimados para este mes</p>
        <button type="button" className="btn-sutil" id="btn-config-nuevo-concepto"
          onClick={() => alNuevoConcepto(valores)}>Agregar nuevo concepto</button>
      </div>
      <div id="modal-config-mes-body" ref={cuerpoRef} className="config-mes-cuerpo">
        {d.esValorReferencial && d.hayDatosMesAnterior && (
          <div className="config-mes-referencia">
            <Icono nombre="lista" size={14} /> Valores cargados desde {d.mesPrevLabel} como referencia
          </div>
        )}
        {grupos.map(g => (
          <div key={g.clave}>
            <div className="pres-seccion-title"><Icono nombre={g.icono} size={13} /> {g.titulo}</div>
            <Cuadricula>
              {g.filas.map(f => (
                <Campo key={f.tipo + f.nombre} etiqueta={<><IconoDe valor={iconoDe(f.nombre, f.tipo === "ingreso")} size={14} /> {f.nombre}</>}>
                  <input className="input pres-input" type="text" inputMode="decimal" placeholder="0"
                    data-tipo={f.tipo} {...(f.tipo === "ingreso" ? { "data-fuente": f.nombre } : { "data-concepto": f.nombre })}
                    onFocus={e => e.target.select()} value={valores[f.tipo + "|" + f.nombre]}
                    onChange={e => setValores(v => ({ ...v, [f.tipo + "|" + f.nombre]: conMiles(e.target.value) }))} />
                </Campo>
              ))}
            </Cuadricula>
          </div>
        ))}
      </div>
    </Hoja>
  );
}

// ---------------------------------------------------------------------------
// Nuevo concepto (se abre desde Configurar mes)
// ---------------------------------------------------------------------------
function HojaNuevoConcepto({ nombresConceptos, estadoNombre, onGuardarConcepto, evaluarMonto, alVolver, alCerrar }) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [icono, setIcono] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const estado = nombre.trim() ? estadoNombre(nombre) : { existe: false, archivado: false, parecidos: [] };
  const existe = estado.existe || estado.archivado;

  async function guardar() {
    const nom = nombre.trim();
    const valor = evaluarMonto(monto);
    if (!nom) { alert("Escribe el nombre del concepto"); return; }
    if (existe) return;
    if (!categoria) { alert("Selecciona una categoría"); return; }
    if (!valor || valor <= 0) { alert(categoria === "Ingreso" ? "Escribe el ingreso estimado" : "Escribe el monto estimado"); return; }
    setGuardando(true);
    try {
      await onGuardarConcepto({ nombre: nom, categoria, icono: icono.trim(), monto: valor }, true);
      alVolver({ tipo: categoria === "Ingreso" ? "ingreso" : "gasto", concepto: nom, monto: valor });
    } catch (err) {
      alert("Error guardando el concepto: " + err.message);
      setGuardando(false);
    }
  }

  const categorias = [["Ingreso", "monedas"], ["Gasto fijo", "pin"], ["Gasto variable", "mezclar"]];

  return (
    <Hoja id="modal-nuevo-concepto" alta icono={<Icono nombre="sumar" size={22} />} titulo="Nuevo concepto"
      onCerrar={() => alVolver(undefined)}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-nuevo-concepto" onClick={() => alVolver(undefined)}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-nuevo-concepto" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Concepto" completo>
          <input id="nuevo-concepto-nombre" type="text" list="lista-conceptos-existentes" autoFocus
            placeholder="Ej: Gimnasio, Parqueadero…" className="input" autoComplete="off"
            value={nombre} onChange={e => setNombre(e.target.value)} />
          <datalist id="lista-conceptos-existentes">
            {nombresConceptos().map(c => <option key={c} value={c} />)}
          </datalist>
          {existe && (
            <span id="nuevo-concepto-duplicado" className="nuevo-concepto-aviso">
              <Icono nombre={estado.archivado ? "caja" : "alerta"} size={14} />{" "}
              {estado.archivado ? "Ese concepto está archivado — restáuralo en Archivar conceptos" : "Ese concepto ya existe"}
            </span>
          )}
          {/* Aviso de parecidos (no bloquea): evita crear "Internet hogar" teniendo "Internet". */}
          {!existe && estado.parecidos.length > 0 && (
            <div id="nuevo-concepto-parecido" className="nuevo-concepto-aviso nuevo-concepto-parecido">
              <span>Se parece a lo que ya tienes — ¿es el mismo gasto?</span>
              <span className="nuevo-concepto-parecidos">
                {estado.parecidos.map(c => (
                  <button key={c} type="button" className="btn-sutil" data-usar-concepto={c}
                    onClick={() => alVolver(undefined, c)}>Usar «{c}»</button>
                ))}
              </span>
            </div>
          )}
        </Campo>

        <Campo etiqueta="Categoría" completo>
          <div className="accion-caja-chips" id="nuevo-concepto-cat-group">
            {categorias.map(([c, ic]) => (
              <button key={c} type="button" data-value={c}
                className={"accion-caja-chip cat-btn" + (categoria === c ? " active" : "")}
                onClick={() => setCategoria(c)}><Icono nombre={ic} size={15} /> {c}</button>
            ))}
          </div>
        </Campo>

        <Campo etiqueta="Ícono" opcional completo>
          <SelectorIconos id="nuevo-concepto-icono" valor={icono} alCambiar={setIcono} />
        </Campo>

        <Campo etiqueta={categoria === "Ingreso" ? "Ingreso estimado" : "Monto estimado"} completo>
          <input id="nuevo-concepto-monto" type="text" inputMode="decimal" placeholder="0" className="input pres-input"
            value={monto} onChange={e => setMonto(conMiles(e.target.value))} />
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

// ---------------------------------------------------------------------------
// Modificar el estimado de un solo concepto
// ---------------------------------------------------------------------------
function HojaModificar({ valorConcepto, onGuardarModificar, iconoDe, evaluarMonto, datos, alCerrar }) {
  const { concepto, categoria } = datos;
  const actual = valorConcepto(concepto, categoria);
  const [monto, setMonto] = useState(actual ? Number(actual).toLocaleString("es-CO") : "");
  const entrada = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => { entrada.current?.focus(); entrada.current?.select(); }, 60);
    return () => clearTimeout(t);
  }, []);

  function guardar() {
    onGuardarModificar(concepto, categoria, evaluarMonto(monto));
    alCerrar();
  }

  return (
    <Hoja id="modal-modificar-concepto" icono={<IconoDe valor={iconoDe(concepto, categoria === "Ingreso")} size={22} />}
      titulo="Modificar concepto" subtitulo={<span id="modificar-concepto-nombre">{concepto}</span>} onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-modificar-concepto" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-modificar-concepto" onClick={guardar}>Guardar</button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Monto estimado" completo>
          <input id="modificar-concepto-monto" ref={entrada} type="text" inputMode="decimal" placeholder="0"
            className="input pres-input" value={monto} onChange={e => setMonto(conMiles(e.target.value))} />
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

// ---------------------------------------------------------------------------
// Archivar conceptos
// ---------------------------------------------------------------------------
function HojaArchivar({ datosArchivar, onArchivar, onRestaurar, alCerrar }) {
  const [, refrescar] = useState(0);
  const [elegido, setElegido] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const d = datosArchivar();          // se vuelve a leer en cada dibujo: restaurar cambia las listas
  const n = elegido ? d.movimientosDe(elegido) : 0;
  const grupos = [["Ingresos", d.ingresos], ["Gastos fijos", d.fijos], ["Gastos variables", d.variables]];

  async function archivar() {
    setTrabajando(true);
    try {
      await onArchivar(elegido);
      alCerrar();
    } catch (err) {
      alert("No se pudo archivar: " + err.message);
      setTrabajando(false);
    }
  }

  async function restaurar(nombre) {
    try {
      await onRestaurar(nombre);
      if (elegido === nombre) setElegido("");
      refrescar(x => x + 1);
    } catch (err) {
      alert("No se pudo restaurar: " + err.message);
    }
  }

  return (
    <Hoja id="modal-archivar" alta icono={<Icono nombre="archivo" size={22} />} titulo="Archivar conceptos"
      subtitulo="Si tienes un concepto repetido, archívalo: deja de mostrarse en todas partes y solo te queda uno. Tus movimientos anteriores no se tocan."
      onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cerrar-archivar" onClick={alCerrar}>Cerrar</button>
          <button className="btn-primary" id="btn-confirmar-archivar" onClick={archivar} disabled={!elegido || trabajando}>
            {trabajando ? "Archivando…" : "Archivar"}
          </button>
        </>
      }>
      <Campo etiqueta="Concepto a archivar" completo>
        <select id="archivar-concepto" className="input" value={elegido} onChange={e => setElegido(e.target.value)}>
          <option value="">Elige un concepto…</option>
          {grupos.map(([titulo, lista]) => (
            <optgroup key={titulo} label={titulo}>
              {lista.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          ))}
        </select>
      </Campo>
      <div id="archivar-resumen" className="card-section-sub">
        {elegido
          ? `«${elegido}» dejará de mostrarse en Proyección, en Configurar mes y al registrar movimientos. ${n === 0 ? "No tiene movimientos registrados." : `Sus ${n} movimiento${n === 1 ? "" : "s"} ya registrado${n === 1 ? "" : "s"} no se tocan.`}`
          : ""}
      </div>
      <div id="archivar-existentes">
        {d.archivados.length > 0 && (
          <>
            <div className="pres-seccion-title" style={{ marginTop: 6 }}>Archivados</div>
            {d.archivados.map(c => (
              <div key={c} className="pres-fila">
                <span className="pres-concepto">{c}</span>
                <button type="button" className="btn-sutil" data-restaurar-concepto={c} onClick={() => restaurar(c)}>Restaurar</button>
              </div>
            ))}
          </>
        )}
      </div>
    </Hoja>
  );
}

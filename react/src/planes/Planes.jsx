import { useEffect, useState } from "react";
import { Hoja, Cuadricula, Campo } from "../shared/Hoja.jsx";
import { Icono } from "../shared/Iconos.jsx";
import { SelectorIconos } from "../shared/SelectorIconos.jsx";

// Ventanas de Planes con el diseño de hojas (ver shared/Hoja.jsx): nuevo/editar plan y nueva
// categoría. planes.js sigue siendo dueño de los datos y de hablar con Sheets.
//
// Se abren con el evento "planes:abrir":
//   { t: "plan", categoria }  nuevo plan dentro de una categoría ("" = Otros)
//   { t: "plan", editId }     editar un plan (acá sí se puede cambiar la categoría)
//   { t: "bloque" }           nueva categoría
//   { t: "bloque", editNombre }   editar una categoría (nombre e ícono)
//
// Props (ver renderPlanesReact en planes.js):
//   getBloques()                 categorías propias [{ nombre, icono }]
//   formularioDe(id)             los datos de un plan guardado, con la forma del formulario
//   evaluarMonto(texto)          "50000+20000" -> 70000
//   onGuardar(datos, editId)     guarda (Promise; si falla, lanza)
//   onGuardarBloque(nombre, icono, editNombre)  (Promise<boolean>: false = ya existía)

const FORM_VACIO = { nombre: "", ubicacion: "", url: "", fechaInicio: "", fechaFin: "", tipo: "gratis", inversion: "", reserva: "no", categoria: "" };

export function Planes(props) {
  const [vista, setVista] = useState(null);

  useEffect(() => {
    const abrir = e => setVista(e.detail);
    document.addEventListener("planes:abrir", abrir);
    return () => document.removeEventListener("planes:abrir", abrir);
  }, []);

  const cerrar = () => setVista(null);
  if (!vista) return null;
  if (vista.t === "bloque") return <HojaBloque key={vista.editNombre || "nueva"} {...props} editNombre={vista.editNombre} alCerrar={cerrar} />;
  return <HojaPlan key={vista.editId || "nuevo"} {...props} editId={vista.editId} categoriaInicial={vista.categoria} alCerrar={cerrar} />;
}

function Chip({ id, activo, icono, texto, onClick }) {
  return (
    <button type="button" id={id} className={"accion-caja-chip" + (activo ? " active" : "")} onClick={onClick}>
      {icono && <Icono nombre={icono} size={15} />}{icono ? " " : ""}{texto}
    </button>
  );
}

function HojaPlan({ getBloques, formularioDe, evaluarMonto, onGuardar, editId, categoriaInicial, alCerrar }) {
  const [f, setF] = useState(() => editId ? formularioDe(editId) : { ...FORM_VACIO, categoria: categoriaInicial || "" });
  const [guardando, setGuardando] = useState(false);
  const poner = campo => e => setF(a => ({ ...a, [campo]: e.target.value }));
  const bloques = getBloques();
  const categoria = ["", ...bloques.map(b => b.nombre)].includes(f.categoria) ? f.categoria : "";
  const esPago = f.tipo === "pago";

  async function guardar() {
    if (!f.nombre.trim()) { alert("Ponle un nombre al plan"); return; }
    if (f.fechaInicio && f.fechaFin && f.fechaFin < f.fechaInicio) {
      alert("La fecha fin no puede ser anterior a la fecha inicio");
      return;
    }
    const datos = {
      nombre: f.nombre.trim(), ubicacion: f.ubicacion.trim(), url: f.url.trim(),
      fechaInicio: f.fechaInicio, fechaFin: f.fechaFin, tipo: f.tipo,
      inversion: esPago ? (evaluarMonto(f.inversion) || "") : "", reserva: f.reserva,
      categoria,
    };
    setGuardando(true);
    try {
      await onGuardar(datos, editId);
      alCerrar();
    } catch (err) {
      alert("Error guardando el plan: " + err.message);
      setGuardando(false);
    }
  }

  return (
    <Hoja id="modal-plan" alta icono={<Icono nombre="avion" size={22} />} titulo={editId ? "Editar plan" : "Nuevo plan"}
      onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-plan" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-plan" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : editId ? "Guardar cambios" : "Guardar"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Nombre" completo>
          <input id="plan-nombre" type="text" placeholder="Ej: Cena en La Provincia" className="input"
            value={f.nombre} onChange={poner("nombre")} />
        </Campo>
        <Campo etiqueta="Ubicación" opcional>
          <input id="plan-ubicacion" type="text" placeholder="Ej: Cali, Centro" className="input"
            value={f.ubicacion} onChange={poner("ubicacion")} />
        </Campo>
        <Campo etiqueta="URL" opcional>
          <input id="plan-url" type="url" placeholder="https://…" className="input"
            value={f.url} onChange={poner("url")} />
        </Campo>
        <Campo etiqueta="Fecha inicio" opcional>
          <input id="plan-fecha-inicio" type="date" className="input" value={f.fechaInicio} onChange={poner("fechaInicio")} />
        </Campo>
        <Campo etiqueta="Fecha fin" opcional>
          <input id="plan-fecha-fin" type="date" className="input" value={f.fechaFin} onChange={poner("fechaFin")} />
        </Campo>

        <Campo etiqueta="Tipo" completo>
          <div className="accion-caja-chips">
            <Chip id="plan-tipo-gratis" activo={!esPago} icono="etiqueta" texto="Gratis" onClick={() => setF(a => ({ ...a, tipo: "gratis" }))} />
            <Chip id="plan-tipo-pago" activo={esPago} icono="monedas" texto="Pago" onClick={() => setF(a => ({ ...a, tipo: "pago" }))} />
          </div>
        </Campo>
        <Campo etiqueta="Reserva" completo>
          <div className="accion-caja-chips">
            <Chip id="plan-reserva-no" activo={f.reserva !== "si"} texto="Sin reserva" onClick={() => setF(a => ({ ...a, reserva: "no" }))} />
            <Chip id="plan-reserva-si" activo={f.reserva === "si"} icono="ticket" texto="Con reserva" onClick={() => setF(a => ({ ...a, reserva: "si" }))} />
          </div>
        </Campo>

        {esPago && (
          <Campo etiqueta="Inversión" completo={!editId} id="plan-inversion-row">
            <input id="plan-inversion" type="text" inputMode="decimal" placeholder="Monto" className="input"
              value={f.inversion} onChange={poner("inversion")} />
          </Campo>
        )}
        {/* Al crear desde una categoría ya viene decidida; al editar sí se puede cambiar. */}
        {editId && (
          <Campo etiqueta="Categoría" completo={!esPago} id="plan-bloque-row">
            <select id="plan-bloque" className="input" value={categoria} onChange={poner("categoria")}>
              <option value="">Otros</option>
              {bloques.map(b => <option key={b.nombre} value={b.nombre}>{b.nombre}</option>)}
            </select>
          </Campo>
        )}
      </Cuadricula>
    </Hoja>
  );
}

function HojaBloque({ getBloques, onGuardarBloque, editNombre, alCerrar }) {
  const existente = editNombre ? getBloques().find(b => b.nombre === editNombre) : null;
  const [nombre, setNombre] = useState(existente?.nombre || "");
  const [icono, setIcono] = useState(existente?.icono || "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const nom = nombre.trim();
    if (!nom) { alert("Ponle un nombre a la categoría"); return; }
    setGuardando(true);
    try {
      const ok = await onGuardarBloque(nom, icono.trim(), editNombre);
      if (!ok) { alert("Ya existe una categoría con ese nombre"); setGuardando(false); return; }
      alCerrar();
    } catch (err) {
      alert("Error guardando la categoría: " + err.message);
      setGuardando(false);
    }
  }

  return (
    <Hoja id="modal-bloque-plan" icono={<Icono nombre="carpeta" size={22} />} titulo={editNombre ? "Editar categoría" : "Nueva categoría"}
      subtitulo="Agrupa tus planes como quieras — solo lo ves vos en este dispositivo." onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-bloque-plan" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-bloque-plan" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Nombre" completo>
          <input id="bloque-plan-nombre" type="text" placeholder="Ej: Restaurantes, Viajes…" className="input"
            maxLength={30} value={nombre} onChange={e => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Ícono" completo>
          <SelectorIconos id="bloque-plan-icono" valor={icono} alCambiar={setIcono} />
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

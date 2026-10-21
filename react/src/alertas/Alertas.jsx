import { useEffect, useState } from "react";
import { Hoja, Cuadricula, Campo } from "../shared/Hoja.jsx";
import { Icono } from "../shared/Iconos.jsx";
import { SelectorIconos } from "../shared/SelectorIconos.jsx";

// Ventanas de Alertas con el diseño de hojas (ver shared/Hoja.jsx): la de nueva/editar alerta y
// la de nuevo bloque. notificaciones.js sigue siendo dueño de los datos y de hablar con Sheets;
// acá solo se dibuja y se maneja el formulario.
//
// Se abren con el evento "alertas:abrir":
//   { t: "alerta", valorBloque }  nueva alerta dentro de un bloque ("" = Otros, "__gastos_fijos__"...)
//   { t: "alerta", editId }       editar una alerta (se ve y se puede cambiar el bloque)
//   { t: "bloque" }               nuevo bloque
//   { t: "bloque", editNombre }   editar un bloque (nombre e ícono)
//
// Props (ver renderAlertasReact en notificaciones.js):
//   getBloques()               bloques propios del usuario [{ nombre, icono }]
//   getGastosFijos()           nombres de los gastos fijos
//   formularioDe(id)           los datos de una alerta ya guardada, con la forma del formulario
//   onGuardar(datos, editId)   guarda (Promise; si falla, lanza)
//   onGuardarBloque(nombre, icono, editNombre)  guarda un bloque (Promise<boolean>: false = ya existía)

const FORM_VACIO = () => ({
  texto: "", url: "", repetir: "no", intervalo: "1", unidad: "dia", recordarDias: "",
  destinatario: "yo", bloque: "", gastoFijo: "",
  // +5 min, para que no quede en el pasado por defecto
  fechaHora: new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16), fechaLimite: "",
});

export function Alertas(props) {
  const [vista, setVista] = useState(null);

  useEffect(() => {
    const abrir = e => setVista(e.detail);
    document.addEventListener("alertas:abrir", abrir);
    return () => document.removeEventListener("alertas:abrir", abrir);
  }, []);

  const cerrar = () => setVista(null);
  if (!vista) return null;
  if (vista.t === "bloque") return <HojaBloque key={vista.editNombre || "nuevo"} {...props} editNombre={vista.editNombre} alCerrar={cerrar} />;
  return <HojaAlerta key={vista.editId || "nueva"} {...props} editId={vista.editId}
    valorBloque={vista.valorBloque} alCerrar={cerrar} />;
}

// ---------------------------------------------------------------------------
// Nueva / editar alerta
// ---------------------------------------------------------------------------
function HojaAlerta({ getBloques, getGastosFijos, formularioDe, onGuardar, editId, valorBloque, alCerrar }) {
  const [f, setF] = useState(() => {
    if (editId) return formularioDe(editId);
    const nuevo = FORM_VACIO();
    if (valorBloque !== undefined) nuevo.bloque = valorBloque;
    return nuevo;
  });
  const [guardando, setGuardando] = useState(false);
  const poner = campo => e => setF(a => ({ ...a, [campo]: e.target.value }));

  const bloques = getBloques();
  const gastosFijos = getGastosFijos();
  // Desde un bloque ya viene decidido (se oculta el selector); al editar sí se puede cambiar.
  const mostrarBloque = !!editId || valorBloque === undefined;
  const esGastosFijos = f.bloque === "__gastos_fijos__";
  const opcionesBloque = ["", "__gastos_fijos__", ...bloques.map(b => b.nombre)];
  const bloque = opcionesBloque.includes(f.bloque) ? f.bloque : "";

  // Elegir un gasto fijo pre-llena texto/destinatario/repetición con valores sensatos (mensual,
  // familia) -- todo sigue siendo editable, esto es solo para no partir de un formulario en blanco.
  function elegirGastoFijo(e) {
    const concepto = e.target.value;
    setF(a => {
      const nuevo = { ...a, gastoFijo: concepto };
      if (!concepto) return nuevo;
      if (!a.texto.trim()) nuevo.texto = `Pagar ${concepto}`;
      nuevo.destinatario = "familia";
      if (a.repetir === "no") nuevo.repetir = "mes:1";
      return nuevo;
    });
  }

  async function guardar() {
    if (!f.texto.trim() || !f.fechaHora) {
      alert("Completa al menos el texto y la fecha/hora");
      return;
    }
    let tipo = "unica", intervalo = "", unidad = "";
    if (f.repetir === "custom") {
      tipo = "recurrente";
      intervalo = Math.max(1, parseInt(f.intervalo, 10) || 1);
      unidad = f.unidad;
    } else if (f.repetir !== "no") {
      const [u, n] = f.repetir.split(":");
      tipo = "recurrente"; intervalo = parseInt(n, 10) || 1; unidad = u;
    }
    const datos = {
      texto: f.texto.trim(), url: f.url.trim(), tipo, intervalo, unidad,
      fechaHoraISO: new Date(f.fechaHora).toISOString(), fechaLimite: f.fechaLimite,
      destinatario: f.destinatario,
      gastoFijo: bloque === "__gastos_fijos__" ? f.gastoFijo : "",
      categoria: bloque && bloque !== "__gastos_fijos__" ? bloque : "",
      recordarEnDias: parseInt(f.recordarDias, 10) || "",
    };
    setGuardando(true);
    try {
      await onGuardar(datos, editId);
      alCerrar();
    } catch (err) {
      alert("Error guardando la alerta: " + err.message);
      setGuardando(false);
    }
  }

  return (
    <Hoja id="modal-notificacion" alta icono={<Icono nombre="campana" size={22} />}
      titulo={editId ? "Editar alerta" : "Nueva alerta"}
      subtitulo="Te avisa aunque la app esté cerrada — cada dispositivo tiene que activarlas por su cuenta."
      onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-notificacion" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-notificacion" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : editId ? "Guardar cambios" : "Guardar"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Texto" completo>
          <input id="notif-texto" type="text" placeholder="Pagar arriendo, sacar la basura…" className="input"
            value={f.texto} onChange={poner("texto")} />
        </Campo>
        <Campo etiqueta="URL" opcional completo>
          <input id="notif-url" type="url" placeholder="https://…" className="input"
            value={f.url} onChange={poner("url")} />
        </Campo>

        <Campo etiqueta="Repetir">
          <select id="notif-repetir-preset" className="input" value={f.repetir} onChange={poner("repetir")}>
            <option value="no">No se repite</option>
            <option value="dia:1">Cada día</option>
            <option value="semana:1">Cada semana</option>
            <option value="semana:2">Cada 2 semanas</option>
            <option value="mes:1">Cada mes</option>
            <option value="anio:1">Cada año</option>
            <option value="custom">Personalizado…</option>
          </select>
        </Campo>
        <Campo etiqueta="Destinatario">
          <select id="notif-destinatario" className="input" value={f.destinatario} onChange={poner("destinatario")}>
            <option value="yo">Solo yo</option>
            <option value="familia">Toda la familia</option>
          </select>
        </Campo>

        {f.repetir === "custom" && (
          <Campo completo id="notif-repetir-custom-row">
            <Cuadricula>
              <Campo etiqueta="Cada">
                <input id="notif-repetir-intervalo" type="number" min="1" step="1" className="input"
                  value={f.intervalo} onChange={poner("intervalo")} />
              </Campo>
              <Campo etiqueta="Unidad">
                <select id="notif-repetir-unidad" className="input" value={f.unidad} onChange={poner("unidad")}>
                  <option value="dia">Día(s)</option>
                  <option value="semana">Semana(s)</option>
                  <option value="mes">Mes(es)</option>
                  <option value="anio">Año(s)</option>
                </select>
              </Campo>
            </Cuadricula>
          </Campo>
        )}

        {mostrarBloque && (
          <Campo etiqueta="Bloque" opcional completo={!esGastosFijos} id="notif-bloque-row">
            <select id="notif-bloque" className="input" value={bloque}
              onChange={e => setF(a => ({ ...a, bloque: e.target.value }))}>
              <option value="">Otros</option>
              <option value="__gastos_fijos__">Gastos fijos</option>
              {bloques.map(b => <option key={b.nombre} value={b.nombre}>{b.nombre}</option>)}
            </select>
          </Campo>
        )}
        {esGastosFijos && (
          <Campo etiqueta="Gasto fijo" opcional completo={!mostrarBloque} id="notif-gasto-fijo-row">
            <select id="notif-gasto-fijo" className="input" value={f.gastoFijo} onChange={elegirGastoFijo}>
              <option value="">— Ninguno —</option>
              {gastosFijos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
        )}

        <Campo etiqueta="Fecha y hora">
          <input id="notif-fecha-hora" type="datetime-local" className="input"
            value={f.fechaHora} onChange={poner("fechaHora")} />
        </Campo>
        <Campo etiqueta="Repetir hasta" opcional>
          <input id="notif-fecha-limite" type="date" className="input"
            value={f.fechaLimite} onChange={poner("fechaLimite")} />
        </Campo>

        {/* El "recordar de nuevo" solo tiene sentido para alertas que quedan "enviadas" esperando
            revisión; también aplica a recurrentes, por eso el campo queda siempre visible. */}
        <Campo etiqueta="Si no la revisás, recordar de nuevo en (días)" opcional completo id="notif-recordar-row">
          <input id="notif-recordar-dias" type="number" min="1" step="1" placeholder="ej. 3" className="input"
            value={f.recordarDias} onChange={poner("recordarDias")} />
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

// ---------------------------------------------------------------------------
// Nuevo bloque
// ---------------------------------------------------------------------------
function HojaBloque({ getBloques, onGuardarBloque, editNombre, alCerrar }) {
  const existente = editNombre ? getBloques().find(b => b.nombre === editNombre) : null;
  const [nombre, setNombre] = useState(existente?.nombre || "");
  const [icono, setIcono] = useState(existente?.icono || "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const nom = nombre.trim();
    if (!nom) { alert("Ponle un nombre al bloque"); return; }
    if (nom === "Gastos fijos") { alert('"Gastos fijos" ya existe y es fijo -- elige otro nombre.'); return; }
    setGuardando(true);
    try {
      const ok = await onGuardarBloque(nom, icono.trim(), editNombre);
      if (!ok) { alert("Ya existe un bloque con ese nombre"); setGuardando(false); return; }
      alCerrar();
    } catch (err) {
      alert("Error guardando el bloque: " + err.message);
      setGuardando(false);
    }
  }

  return (
    <Hoja id="modal-bloque-alerta" icono={<Icono nombre="carpeta" size={22} />} titulo={editNombre ? "Editar bloque" : "Nuevo bloque"}
      subtitulo="Agrupa tus alertas como quieras — solo lo ves vos en este dispositivo."
      onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-bloque-alerta" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-bloque-alerta" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Nombre" completo>
          <input id="bloque-alerta-nombre" type="text" placeholder="Ej: Servicios, Cumpleaños…" className="input"
            maxLength={30} value={nombre} onChange={e => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Ícono" completo>
          <SelectorIconos id="bloque-alerta-icono" valor={icono} alCambiar={setIcono} />
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

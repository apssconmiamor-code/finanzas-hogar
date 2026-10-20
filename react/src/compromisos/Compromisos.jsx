import { useEffect, useState } from "react";
import { Hoja, Cuadricula, Campo } from "../shared/Hoja.jsx";
import { Icono } from "../shared/Iconos.jsx";
import { conMiles, hoyISO } from "../shared/formato.js";

// Ventanas de Compromisos con el diseño de hojas (ver shared/Hoja.jsx): nueva compra, nuevo
// préstamo y registrar un pago. compras.js y prestamo.js siguen siendo dueños de los datos y de
// hablar con Sheets.
//
// Se abren con el evento "compromisos:abrir":
//   { t: "compra" }
//   { t: "prestamo" }
//   { t: "pago", id, nombre, pendiente }   registrar un pago de un préstamo
//
// Props (ver renderCompromisosReact en prestamo.js):
//   getCategoriasCompra()   categorías (gastos variables) para una compra
//   getCajas()              cajas [{ nombre, moneda }] para el pago
//   evaluarMonto(texto)     "4000+5000" -> 9000
//   formatMonto(n)          "$1.500"
//   conceptoPrestamo(nombre)
//   onGuardarCompra(datos) / onGuardarPrestamo(datos) / onGuardarPago(datos)   (Promise; si falla, lanza)

export function Compromisos(props) {
  const [vista, setVista] = useState(null);

  useEffect(() => {
    const abrir = e => setVista(e.detail);
    document.addEventListener("compromisos:abrir", abrir);
    return () => document.removeEventListener("compromisos:abrir", abrir);
  }, []);

  const cerrar = () => setVista(null);
  if (!vista) return null;
  if (vista.t === "prestamo") return <HojaPrestamo {...props} alCerrar={cerrar} />;
  if (vista.t === "pago") return <HojaPago key={vista.id} {...props} prestamo={vista} alCerrar={cerrar} />;
  return <HojaCompra {...props} alCerrar={cerrar} />;
}

// Guarda con "Guardando..." y deja la ventana abierta si falla.
function useGuardar(alCerrar, mensajeError) {
  const [guardando, setGuardando] = useState(false);
  const ejecutar = async tarea => {
    setGuardando(true);
    try {
      await tarea();
      alCerrar();
    } catch (err) {
      alert(mensajeError + err.message);
      setGuardando(false);
    }
  };
  return [guardando, ejecutar];
}

function HojaCompra({ getCategoriasCompra, evaluarMonto, onGuardarCompra, alCerrar }) {
  const [f, setF] = useState({ concepto: "", categoria: "", monto: "", urgencia: "Media", fecha: hoyISO() });
  const [guardando, ejecutar] = useGuardar(alCerrar, "Error guardando la compra: ");
  const poner = campo => e => setF(a => ({ ...a, [campo]: e.target.value }));

  function guardar() {
    const concepto = f.concepto.trim();
    if (!concepto) { alert("Escribe el nombre de lo que quieres comprar"); return; }
    if (!f.fecha) { alert("Selecciona una fecha"); return; }
    ejecutar(() => onGuardarCompra({
      concepto, categoria: f.categoria, montoDestinado: evaluarMonto(f.monto) || 0,
      urgencia: f.urgencia, fecha: f.fecha,
    }));
  }

  return (
    <Hoja id="modal-compra" icono={<Icono nombre="bolsa" size={22} />} titulo="Nueva compra" onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-compra" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-compra" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Agregar"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="¿Qué quieres comprar?" completo>
          <input id="compra-concepto" type="text" placeholder="Ej: Auriculares Sony" className="input"
            value={f.concepto} onChange={poner("concepto")} />
        </Campo>
        <Campo etiqueta="Categoría" opcional>
          <select id="compra-categoria" className="input" value={f.categoria} onChange={poner("categoria")}>
            <option value="">Sin categoría</option>
            {getCategoriasCompra().map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Monto" opcional>
          <input id="compra-monto" type="text" inputMode="decimal" placeholder="0" className="input"
            value={f.monto} onChange={e => setF(a => ({ ...a, monto: conMiles(e.target.value) }))} />
        </Campo>
        <Campo etiqueta="Urgencia">
          <select id="compra-urgencia" className="input" value={f.urgencia} onChange={poner("urgencia")}>
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        </Campo>
        <Campo etiqueta="Fecha">
          <input id="compra-fecha" type="date" className="input" value={f.fecha} onChange={poner("fecha")} />
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

function HojaPrestamo({ evaluarMonto, onGuardarPrestamo, alCerrar }) {
  const [f, setF] = useState({ nombre: "", monto: "", cuotas: "", fecha: hoyISO(), descripcion: "" });
  const [guardando, ejecutar] = useGuardar(alCerrar, "Error guardando préstamo: ");
  const poner = campo => e => setF(a => ({ ...a, [campo]: e.target.value }));

  function guardar() {
    const nombre = f.nombre.trim();
    const monto = evaluarMonto(f.monto);
    if (!nombre || !monto || !f.fecha) { alert("Completa nombre, monto y fecha de inicio"); return; }
    ejecutar(() => onGuardarPrestamo({
      nombre, monto, cuotas: parseInt(f.cuotas) || 0, fechaInicio: f.fecha, descripcion: f.descripcion.trim(),
    }));
  }

  return (
    <Hoja id="modal-prestamo" alta icono={<Icono nombre="prestamo" size={22} />} titulo="Nuevo préstamo"
      subtitulo={<>Se creará el concepto <strong>"Prestamo [nombre]"</strong> para registrar pagos.</>}
      onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-prestamo" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-prestamo" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Crear préstamo"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Nombre">
          <input id="prest-nombre" type="text" placeholder="Banco, Carro…" className="input"
            value={f.nombre} onChange={poner("nombre")} />
        </Campo>
        <Campo etiqueta="Monto total">
          <input id="prest-monto" type="text" inputMode="decimal" placeholder="0" className="input"
            value={f.monto} onChange={e => setF(a => ({ ...a, monto: conMiles(e.target.value) }))} />
        </Campo>
        <Campo etiqueta="Cuotas" opcional>
          <input id="prest-cuotas" type="number" inputMode="numeric" placeholder="Ej: 24" className="input"
            value={f.cuotas} onChange={poner("cuotas")} />
        </Campo>
        <Campo etiqueta="Fecha inicio">
          <input id="prest-fecha" type="date" className="input" value={f.fecha} onChange={poner("fecha")} />
        </Campo>
        <Campo etiqueta="Descripción" opcional completo>
          <textarea id="prest-descripcion" rows={2} placeholder="Banco, tasa, referencia…" className="input"
            style={{ resize: "none", minHeight: 56, fontSize: 15 }}
            value={f.descripcion} onChange={poner("descripcion")} />
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

function HojaPago({ getCajas, evaluarMonto, formatMonto, conceptoPrestamo, onGuardarPago, prestamo, alCerrar }) {
  const [f, setF] = useState({ fecha: hoyISO(), monto: "", caja: "", desc: "" });
  const [guardando, ejecutar] = useGuardar(alCerrar, "Error registrando pago: ");
  const poner = campo => e => setF(a => ({ ...a, [campo]: e.target.value }));

  function guardar() {
    const monto = evaluarMonto(f.monto);
    if (!monto || !f.fecha || !f.caja) { alert("Completa monto, fecha y caja"); return; }
    ejecutar(() => onGuardarPago({
      id: prestamo.id, nombre: prestamo.nombre, monto, fecha: f.fecha, caja: f.caja, desc: f.desc.trim(),
    }));
  }

  return (
    <Hoja id="modal-pago-rapido" icono={<Icono nombre="tarjeta" size={22} />} titulo="Registrar pago" onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-pago" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-pago" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Registrar pago"}
          </button>
        </>
      }>
      <div className="pago-concepto-info">
        <div className="pago-concepto-label">Se registrará como</div>
        <div className="pago-concepto-val" id="pago-concepto-display">{conceptoPrestamo(prestamo.nombre)}</div>
        <div className="pago-pendiente-info">Pendiente: <strong id="pago-pendiente">{formatMonto(prestamo.pendiente)}</strong></div>
      </div>
      <Cuadricula>
        <Campo etiqueta="Fecha">
          <input id="pago-fecha" type="date" className="input" value={f.fecha} onChange={poner("fecha")} />
        </Campo>
        <Campo etiqueta="Monto">
          <input id="pago-monto" type="text" inputMode="decimal" placeholder="0" className="input"
            value={f.monto} onChange={e => setF(a => ({ ...a, monto: conMiles(e.target.value) }))} />
        </Campo>
        <Campo etiqueta="Caja" completo>
          <select id="pago-caja" className="input" value={f.caja} onChange={poner("caja")}>
            <option value="">Selecciona una caja</option>
            {getCajas().map(c => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.moneda})</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Descripción" opcional completo>
          <input id="pago-desc" type="text" placeholder="Cuota 3, referencia…" className="input"
            value={f.desc} onChange={poner("desc")} />
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

import { useEffect, useState } from "react";
import { Hoja, Cuadricula, Campo } from "../shared/Hoja.jsx";
import { Icono } from "../shared/Iconos.jsx";
import { SelectorIconos } from "../shared/SelectorIconos.jsx";

// Ventanas de Mercado con el diseño de hojas (ver shared/Hoja.jsx): nuevo/editar producto y
// nueva/editar categoría. mercado.js sigue siendo dueño de los datos y de hablar con Sheets.
//
// Se abren con el evento "mercado:abrir":
//   { t: "producto", categoria }  nuevo producto (con la categoría desde la que se abrió)
//   { t: "producto", editId }     editar un producto
//   { t: "categoria" }            nueva categoría
//   { t: "categoria", editId }    editar una categoría
//
// Props (ver renderMercadoReact en mercado.js):
//   getCategorias()                  [{ id, nombre, icono }]
//   getProducto(id) / getCategoria(id)
//   onGuardarProducto({ nombre, categoria }, editId)   (Promise; si falla, lanza)
//   onGuardarCategoria({ nombre, icono }, editId)

export function Mercado(props) {
  const [vista, setVista] = useState(null);

  useEffect(() => {
    const abrir = e => setVista(e.detail);
    document.addEventListener("mercado:abrir", abrir);
    return () => document.removeEventListener("mercado:abrir", abrir);
  }, []);

  const cerrar = () => setVista(null);
  if (!vista) return null;
  if (vista.t === "categoria") return <HojaCategoria key={vista.editId || "nueva"} {...props} editId={vista.editId} alCerrar={cerrar} />;
  return <HojaProducto key={vista.editId || "nuevo"} {...props} editId={vista.editId} categoriaInicial={vista.categoria} alCerrar={cerrar} />;
}

function HojaProducto({ getCategorias, getProducto, onGuardarProducto, editId, categoriaInicial, alCerrar }) {
  const existente = editId ? getProducto(editId) : null;
  const categorias = getCategorias();
  const [nombre, setNombre] = useState(existente?.nombre || "");
  const inicial = existente ? existente.categoria : (categoriaInicial || "");
  const [categoria, setCategoria] = useState(["", ...categorias.map(c => c.nombre)].includes(inicial) ? inicial : "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const nom = nombre.trim();
    if (!nom) { alert("Escribe el nombre del producto"); return; }
    setGuardando(true);
    try {
      await onGuardarProducto({ nombre: nom, categoria }, editId);
      alCerrar();
    } catch (err) {
      alert("Error guardando el producto: " + err.message);
      setGuardando(false);
    }
  }

  return (
    <Hoja id="modal-mercado-producto" idTitulo="mercado-producto-titulo" icono={<Icono nombre="carrito" size={22} />}
      titulo={editId ? "Editar producto" : "Nuevo producto"} onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-mercado-producto" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-mercado-producto" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : editId ? "Guardar" : "Agregar"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Producto" completo>
          <input id="mercado-nombre" type="text" placeholder="Ej: Leche" className="input"
            value={nombre} onChange={e => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Categoría" completo>
          {/* Categorías ya creadas de antemano, no texto libre: evita duplicados por una letra. */}
          <select id="mercado-categoria" className="input" value={categoria} onChange={e => setCategoria(e.target.value)}>
            <option value="">Sin categoría</option>
            {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

function HojaCategoria({ getCategorias, getCategoria, onGuardarCategoria, editId, alCerrar }) {
  const existente = editId ? getCategoria(editId) : null;
  const [nombre, setNombre] = useState(existente?.nombre || "");
  const [icono, setIcono] = useState(existente?.icono || "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const nom = nombre.trim();
    if (!nom) { alert("Escribe el nombre de la categoría"); return; }
    if (getCategorias().some(c => c.nombre === nom && c.id !== editId)) { alert("Ya existe una categoría con ese nombre"); return; }
    setGuardando(true);
    try {
      await onGuardarCategoria({ nombre: nom, icono: icono.trim() }, editId);
      alCerrar();
    } catch (err) {
      alert("Error guardando la categoría: " + err.message);
      setGuardando(false);
    }
  }

  return (
    <Hoja id="modal-mercado-categoria" idTitulo="mercado-categoria-titulo" icono={<Icono nombre="carpeta" size={22} />}
      titulo={editId ? "Editar categoría" : "Nueva categoría"} onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-mercado-categoria" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-mercado-categoria" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </>
      }>
      <Cuadricula>
        <Campo etiqueta="Nombre" completo>
          <input id="mercado-categoria-nombre" type="text" placeholder="Ej: Alimentos, Aseo…" className="input"
            maxLength={30} value={nombre} onChange={e => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Ícono" completo>
          <SelectorIconos id="mercado-categoria-icono" valor={icono} alCambiar={setIcono} />
        </Campo>
      </Cuadricula>
    </Hoja>
  );
}

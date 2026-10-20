import { BarraInferior } from "../shared/BarraInferior.jsx";
import { MenuOpciones } from "../shared/MenuOpciones.jsx";

// Franja inferior (menú ⋯) de las vistas que todavía son JS plano: Movimientos,
// Compromisos, Alertas, Mercado, Planes y Análisis. Inicio y Proyección tienen la suya
// en su propio módulo React; todas usan el mismo BarraInferior y MenuOpciones, así que
// se ven exactamente iguales (mismo alto, ancho y botón redondo central).
//
// Las acciones de cada vista siguen siendo los botones de siempre (que ahora quedan
// ocultos en la página): el menú los pulsa. Qué opciones salen se decide al ABRIR el
// menú, porque algunas dependen de dónde esté el usuario (ej. "Nuevo producto" solo
// existe dentro de una categoría de Mercado).
//
// Props (ver renderFranjas en app.js):
//   acciones   { [vista]: [{ boton, texto, icono, conConteo? }] }
//   estado     { [vista]: { activo, botonListo, vacio, textos[] } } -- modo "Sumar" (Movimientos)
//   hayBoton(id)     ¿ese botón existe ahora y está disponible?
//   pulsar(id)       lo pulsa
//   etiquetaDe(acc)  texto de la opción (algunas llevan un conteo)
//   irAInicio(), actualizar()
const VISTAS = ["movimientos", "compromisos", "notificaciones", "mercado", "planes", "resumen"];

export function FranjasVistas(props) {
  return <>{VISTAS.map(vista => <Franja key={vista} vista={vista} {...props} />)}</>;
}

function Franja({ vista, acciones, estado, hayBoton, pulsar, etiquetaDe, irAInicio, actualizar }) {
  const suma = estado[vista];

  const items = () => {
    const propias = (acciones[vista] || [])
      .filter(a => hayBoton(a.boton))
      .map(a => ({ id: "franja-" + a.boton, icono: a.icono, texto: etiquetaDe(a), accion: () => pulsar(a.boton) }));
    const comunes = [];
    if (vista === "resumen") comunes.push({ id: "franja-actualizar", icono: "refrescar", texto: "Actualizar datos", accion: actualizar });
    comunes.push({ id: "franja-inicio", icono: "casa", texto: "Ir a Inicio", accion: irAInicio });
    return [...propias, ...comunes];
  };

  return (
    <BarraInferior tab={vista}>
      <div className="barra-lado barra-lado-izq" />
      <div className="barra-centro">
        {suma?.activo
          ? <button type="button" className="btn-sumar-cajas active" id={"btn-" + vista + "-listo"}
              onClick={() => pulsar(suma.botonListo)}>Listo</button>
          : <MenuOpciones id={"btn-menu-" + vista} etiqueta="Opciones de la vista" items={items} />}
      </div>
      <div className="barra-lado barra-lado-der">
        {suma?.activo && (
          <div id={"sumar-" + vista + "-total"} className="cajas-suma">
            {suma.vacio
              ? <span className="sumar-cajas-barra-vacio">{suma.textoVacio}</span>
              : suma.textos.map((t, i) => <span key={i} className="sumar-cajas-barra-total">{t}</span>)}
          </div>
        )}
      </div>
    </BarraInferior>
  );
}

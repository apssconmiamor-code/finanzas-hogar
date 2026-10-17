import { MenuOpciones } from "../shared/MenuOpciones.jsx";

// Fila de arriba de Proyección. Lo demás (tarjetas de meses, tabla de detalle)
// sigue siendo JS plano en app.js; esto solo reemplaza los botones sueltos por
// un submenú ⋯ -- igual que en Cajas.
//
// Props que arma app.js (ver renderProyBarra):
//   modoSuma            true -> en vez del ⋯ se ve "Listo" y, a la derecha, el total
//   seleccionados       cantidad de conceptos elegidos para sumar
//   totales             { estimado, real } de lo elegido
//   formatMonto(n)      formateador de la app
//   onToggleSuma()      entra/sale del modo "Sumar movimientos"
//   onAgregarMes()      "Agregar mes a proyectar"
//   onNuevoConcepto()   "Crear nuevo concepto"
//   onAgregarConcepto() "Agregar concepto" (uno ya creado que el mes no tiene)
export function ProyeccionBarra({
  modoSuma, seleccionados, totales, formatMonto,
  onToggleSuma, onAgregarMes, onNuevoConcepto, onAgregarConcepto,
}) {
  const items = [
    { id: "btn-agregar-mes", icono: "📅", texto: "Agregar mes a proyectar", accion: onAgregarMes },
    { id: "btn-agregar-concepto", icono: "🆕", texto: "Crear nuevo concepto", accion: onNuevoConcepto },
    { id: "btn-agregar-existente", icono: "📌", texto: "Agregar concepto", accion: onAgregarConcepto },
    { id: "btn-sumar-proy", icono: "➕", texto: "Sumar movimientos", accion: onToggleSuma },
  ];
  return (
    <div className="cajas-header">
      {modoSuma
        ? <button type="button" className="btn-sumar-cajas active" id="btn-sumar-proy-listo"
            onClick={onToggleSuma}>Listo</button>
        : <MenuOpciones id="btn-menu-proyeccion" etiqueta="Opciones de proyección" items={items} />}
      <div className="cajas-header-der">
        {modoSuma && (
          <div id="sumar-proy-total" className="cajas-suma proy-suma">
            {seleccionados === 0
              ? <span className="sumar-cajas-barra-vacio">Tocá los conceptos que querés sumar</span>
              : <>
                  <span className="proy-suma-item"><small>Estimado</small>
                    <span className="sumar-cajas-barra-total">{formatMonto(totales.estimado)}</span></span>
                  <span className="proy-suma-item"><small>Real</small>
                    <span className="sumar-cajas-barra-total">{formatMonto(totales.real)}</span></span>
                </>}
          </div>
        )}
      </div>
    </div>
  );
}

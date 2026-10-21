import { useEffect, useRef, useState } from "react";
import { Hoja } from "../shared/Hoja.jsx";
import { Icono } from "../shared/Iconos.jsx";

// Ventana de "Recordatorio" (texto, foto y/o audio) con el diseño de hojas (ver shared/Hoja.jsx).
// recordatorios.js sigue siendo dueño de los datos (subir a Drive, escribir en Sheets) y del
// permiso del micrófono; acá se maneja el formulario y la grabación.
//
// Se abre con el evento "recordatorios:abrir":
//   { texto, categoria }  nuevo (ambos opcionales: permiten pre-llenarlo, ej. con el bloque de una alerta)
//   { editId }            editar un recordatorio ya guardado (texto, y reemplazar o quitar su foto/audio)
//
// Props (ver renderRecordatoriosReact en recordatorios.js):
//   obtenerStream()   consigue el micrófono pidiendo permiso una sola vez por sesión (Promise<MediaStream>)
//   liberarMicrofono()  suelta el micrófono al cerrar la ventana
//   onGuardar({ texto, foto, audio, categoria, editId, quitarFoto, quitarAudio })  guarda (Promise<boolean>: false = falló y ya se avisó)
//   getRecordatorio(id) / cargarMedia(url)   al editar: el recordatorio y sus archivos de Drive ({ blobUrl })

export function Recordatorios(props) {
  const [vista, setVista] = useState(null);

  useEffect(() => {
    const abrir = e => setVista({ ...(e.detail || {}), n: Date.now() });
    document.addEventListener("recordatorios:abrir", abrir);
    return () => document.removeEventListener("recordatorios:abrir", abrir);
  }, []);

  if (!vista) return null;
  return <HojaRecordatorio key={vista.n} {...props} inicial={vista} alCerrar={() => setVista(null)} />;
}

function leerComoDataUrl(blob) {
  return new Promise(resolve => {
    const lector = new FileReader();
    lector.onload = e => resolve({ data: e.target.result, type: blob.type });
    lector.readAsDataURL(blob);
  });
}

function HojaRecordatorio({ obtenerStream, liberarMicrofono, onGuardar, getRecordatorio, cargarMedia, inicial, alCerrar }) {
  const editId = inicial.editId || null;
  const existente = editId ? getRecordatorio(editId) : null;
  const categoria = existente ? (existente.categoria || "") : (inicial.categoria || "");
  const [texto, setTexto] = useState(existente ? existente.texto : (inicial.texto || ""));
  // Al editar: la foto y el audio que ya tenía (se pueden quitar; subir uno nuevo lo reemplaza).
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [quitarAudio, setQuitarAudio] = useState(false);
  const [mediaExistente, setMediaExistente] = useState({});   // { foto: blobUrl, audio: blobUrl }
  useEffect(() => {
    if (!existente) return;
    let vivo = true;
    if (existente.imageUrl) cargarMedia(existente.imageUrl).then(m => vivo && setMediaExistente(a => ({ ...a, foto: m.blobUrl }))).catch(() => {});
    if (existente.audioUrl) cargarMedia(existente.audioUrl).then(m => vivo && setMediaExistente(a => ({ ...a, audio: m.blobUrl }))).catch(() => {});
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Una foto y un audio pueden coexistir en el mismo recordatorio: slots independientes.
  const [foto, setFoto] = useState(null);     // { data, type }
  const [audio, setAudio] = useState(null);   // { data, type }
  const [grabando, setGrabando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const grabadora = useRef(null);
  const trozos = useRef([]);
  const archivoRef = useRef(null);

  // Al cerrar: se corta la grabación en curso y se suelta el micrófono.
  useEffect(() => () => {
    if (grabadora.current && grabadora.current.state === "recording") {
      try { grabadora.current.stop(); } catch {}
    }
    liberarMicrofono();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function cargarFoto(file) {
    if (file) leerComoDataUrl(file).then(setFoto);
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
      // El stream NO se detiene aquí a propósito: se mantiene vivo mientras la ventana siga
      // abierta por si el usuario graba de nuevo.
      rec.onstop = () => {
        leerComoDataUrl(new Blob(trozos.current, { type: rec.mimeType || "audio/webm" })).then(setAudio);
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

  // Si hay una grabación en curso, la detiene y espera a que el audio quede listo -- así "Guardar"
  // nunca pierde el audio por no haber tocado primero el botón de detener.
  function detenerYEsperar() {
    return new Promise(resolve => {
      const rec = grabadora.current;
      if (!grabando || !rec) { resolve(audio); return; }
      rec.onstop = () => {
        leerComoDataUrl(new Blob(trozos.current, { type: rec.mimeType || "audio/webm" })).then(a => { setAudio(a); resolve(a); });
      };
      setGrabando(false);
      rec.stop();
    });
  }

  async function guardar() {
    const audioFinal = await detenerYEsperar();
    const t = texto.trim();
    const quedaFoto = foto || (existente?.imageUrl && !quitarFoto);
    const quedaAudio = audioFinal || (existente?.audioUrl && !quitarAudio);
    if (!t && !quedaFoto && !quedaAudio) {
      alert("Escribe una nota o adjunta una foto/audio");
      return;
    }
    setGuardando(true);
    const ok = await onGuardar({ texto: t, foto, audio: audioFinal, categoria, editId, quitarFoto, quitarAudio });
    if (ok) alCerrar(); else setGuardando(false);
  }

  return (
    <Hoja id="modal-recordatorio-crear" icono={<Icono nombre="nota" size={22} />} titulo={editId ? "Editar recordatorio" : "Recordatorio"}
      subtitulo={editId ? "Cambia el texto, o reemplaza o quita la foto y el audio." : "Una nota rápida, con foto o audio si quieres."} onCerrar={alCerrar}
      pie={
        <>
          <button className="btn-secondary" id="btn-cancelar-recordatorio-crear" onClick={alCerrar}>Cancelar</button>
          <button className="btn-primary" id="btn-guardar-recordatorio-crear" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : editId ? "Guardar cambios" : "Guardar"}
          </button>
        </>
      }>
      {categoria && (
        <span id="recordatorio-categoria-badge" className="notif-dest-badge">
          <Icono nombre="etiqueta" size={13} /> {categoria}
        </span>
      )}
      <div className="campo">
        <div className="recordatorio-adjuntar-grid">
          <label className="recordatorio-adjuntar-btn" htmlFor="recordatorio-foto-file" aria-label="Adjuntar foto">
            <Icono nombre="camara" size={24} />
          </label>
          <input id="recordatorio-foto-file" ref={archivoRef} type="file" accept="image/*" capture="environment"
            style={{ display: "none" }} onChange={e => cargarFoto(e.target.files[0])} />
          <button type="button" id="btn-recordatorio-audio" aria-label={grabando ? "Detener grabación" : "Grabar audio"}
            className={"recordatorio-adjuntar-btn" + (grabando ? " grabando" : "")} onClick={alternarGrabacion}>
            <Icono nombre={grabando ? "alto" : "micro"} size={24} />
          </button>
        </div>
        <div id="recordatorio-media-preview" className="fotos-preview">
          {existente?.imageUrl && !quitarFoto && !foto && (
            <div className="foto-thumb">
              {mediaExistente.foto ? <img src={mediaExistente.foto} className="foto-thumb-img" alt="foto del recordatorio" /> : null}
              <button className="foto-thumb-remove" type="button" onClick={() => setQuitarFoto(true)}>×</button>
            </div>
          )}
          {existente?.audioUrl && !quitarAudio && !audio && (
            <div className="recordatorio-audio-preview">
              {mediaExistente.audio ? <audio controls src={mediaExistente.audio}></audio> : <span className="recibo-status">Cargando audio…</span>}
              <button className="foto-thumb-remove" type="button" onClick={() => setQuitarAudio(true)}>×</button>
            </div>
          )}
          {foto && (
            <div className="foto-thumb">
              <img src={foto.data} className="foto-thumb-img" alt="foto adjunta" />
              <button className="foto-thumb-remove" type="button" onClick={() => setFoto(null)}>×</button>
            </div>
          )}
          {audio && (
            <div className="recordatorio-audio-preview">
              <audio controls src={audio.data}></audio>
              <button className="foto-thumb-remove" type="button" onClick={() => setAudio(null)}>×</button>
            </div>
          )}
        </div>
        <span id="recordatorio-audio-status" className="recibo-status">{grabando ? "Grabando…" : ""}</span>
      </div>
      <div className="campo">
        <textarea id="recordatorio-texto" rows={3} placeholder="Ej: Pagué el mercado, revisar monto exacto…" className="input"
          style={{ resize: "none", minHeight: 70, fontSize: 15, lineHeight: 1.4 }}
          value={texto} onChange={e => setTexto(e.target.value)} />
      </div>
    </Hoja>
  );
}

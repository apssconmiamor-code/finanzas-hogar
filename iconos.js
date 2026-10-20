// Íconos de la app (SVG de línea, ningún emoji a la vista).
//
// - window.ICONOS_SVG: nombre -> trazos SVG (24x24, trazo con currentColor). React los usa
//   desde Iconos.jsx; el JS plano, desde window.iconoSvg().
// - Los datos viejos guardan emojis (conceptos, categorías, bloques, acciones rápidas: el
//   campo "ícono" de cada uno). Siguen guardándose igual -- así los demás dispositivos y las
//   versiones anteriores los entienden --, pero NUNCA se muestran como emoji: window.EMOJI_ICONO
//   los traduce al ícono más parecido.
// - Un observador de DOM reemplaza cualquier emoji que aparezca en un texto de la página (toasts,
//   tarjetas, títulos...) por su ícono. Se salta las islas de React (ya no llevan emojis) y los
//   campos de formulario.
// - window.montarSelectorIconos(id): cambia un campo de texto de "ícono" por una cuadrícula de
//   íconos para elegir (el valor guardado sigue siendo un emoji representativo).
(function () {
  const P = {
    // ---- los de siempre (iguales a Iconos.jsx) ----
    movimientos: '<path d="M7 7h13"/><path d="m16 3 4 4-4 4"/><path d="M17 17H4"/><path d="m8 13-4 4 4 4"/>',
    tendencia: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    baja: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    barras: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    campanaOff: '<path d="M8.7 3A6 6 0 0 1 18 8c0 3.3.6 5.4 1.3 6.8"/><path d="M17 17H3s3-2 3-9c0-.9.2-1.7.5-2.5"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
    carrito: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    avion: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    lista: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    rayo: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    sumar: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    restar: '<path d="M5 12h14"/>',
    ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    ojoOff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 7 10 7a14 14 0 0 1-1.7 2.6"/><path d="M6.6 6.6A14 14 0 0 0 2 11s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="m2 2 20 20"/>',
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    archivo: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    casa: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    refrescar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    flecha: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    adelante: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    abajo: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    // ---- nuevos ----
    check: '<path d="M20 6 9 17l-5-5"/>',
    hecho: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    alerta: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    ubicacion: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    mezclar: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
    repetir: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    monedas: '<circle cx="12" cy="12" r="10"/><path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2.2 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5"/><path d="M12 5.5V7"/><path d="M12 17v1.5"/>',
    billete: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    banco: '<path d="M3 21h18"/><path d="M5 21V10"/><path d="M9.5 21V10"/><path d="M14.5 21V10"/><path d="M19 21V10"/><path d="m2 10 10-7 10 7z"/>',
    bolsa: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    objetivo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    carpeta: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
    etiqueta: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r=".6" fill="currentColor"/>',
    micro: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/>',
    camara: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    papelera: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    lapiz: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    engranaje: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    arena: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
    nota: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
    recibo: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    caja: '<path d="m7.5 4.3 9 5.2"/><path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    escudo: '<path d="M20 13c0 5-3.5 7.5-7.7 8.97a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
    candado: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    wifi: '<path d="M12 20h.01"/><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.9a10 10 0 0 1 14 0"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/>',
    wifiOff: '<path d="m2 2 20 20"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M10.7 5.1A15 15 0 0 1 22 8.8"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M13.9 10.1a10 10 0 0 1 5.1 2.8"/><path d="M12 20h.01"/>',
    disco: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    bombilla: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    balanza: '<path d="M12 3v18"/><path d="m5 8 7-5 7 5"/><path d="M2 14l3-6 3 6a3 3 0 0 1-6 0z"/><path d="m16 14 3-6 3 6a3 3 0 0 1-6 0z"/>',
    regalo: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    brillos: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
    corazon: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
    fuego: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.4 1-3 0 1.5 1 3 2.5 3z"/>',
    celular: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
    pelicula: '<rect x="2" y="2" width="20" height="20" rx="2.2"/><path d="M7 2v20"/><path d="M17 2v20"/><path d="M2 12h20"/><path d="M2 7h5"/><path d="M2 17h5"/><path d="M17 17h5"/><path d="M17 7h5"/>',
    paleta: '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.5-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H16c3.1 0 6-2.5 6-5.5C22 6 17.5 2 12 2z"/>',
    robot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><path d="M8 16h.01M16 16h.01"/>',
    salud: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8"/><path d="M8 12h8"/>',
    bus: '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
    carro: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    libro: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    birrete: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/>',
    balon: '<circle cx="12" cy="12" r="10"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 2v5"/><path d="m16 10 5.5-1"/><path d="M14.5 14.5 18 19"/><path d="M9.5 14.5 6 19"/><path d="M8 10 2.5 9"/>',
    juego: '<path d="M6 12h4"/><path d="M8 10v4"/><path d="M15 13h.01"/><path d="M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="4"/>',
    camiseta: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
    llave: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    huella: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
    cubiertos: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    hoja: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    pesa: '<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M3 9v6"/><path d="M21 9v6"/><path d="M6.5 12h11"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    alto: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    comentario: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    globo: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
    cerrar: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    intercambiar: '<path d="m17 3 4 4-4 4"/><path d="M21 7H8"/><path d="m7 21-4-4 4-4"/><path d="M3 17h13"/>',
    gota: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    tv: '<rect x="2" y="7" width="20" height="15" rx="2"/><path d="m17 2-5 5-5-5"/>',
    cafe: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
    musica: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    bici: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    gasolina: '<path d="M3 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M3 22h12"/><path d="M15 10h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V8l-3-3"/><path d="M6 8h6"/>',
    maleta: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect x="2" y="6" width="20" height="14" rx="2"/>',
    tijeras: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    pastilla: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z"/><path d="m8.5 8.5 7 7"/>',
    manzana: '<path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/>',
    llaveCasa: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    telefono: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    nube: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    tienda: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-2-.8 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
    alcancia: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',
    escudoMas: '<path d="M20 13c0 5-3.5 7.5-7.7 8.97a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 9v6"/><path d="M9 12h6"/>',
    estrella: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3L8 14.2 3 9.3l6.9-1z"/>',
    punto: '<circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>',
  };
  window.ICONOS_SVG = P;

  // Emoji -> [ícono, clase de color]. Lo que no esté acá cae en "estrella".
  const E = {
    "🏠": "casa", "🏡": "casa", "🛒": "carrito", "🛍": "bolsa", "💰": "monedas", "💸": "monedas", "💵": "billete",
    "💳": "tarjeta", "🏦": "banco", "📈": "tendencia", "📉": "baja", "📊": "barras", "🎯": "objetivo",
    "🗂": "carpeta", "🗄": "archivo", "📦": "caja", "🔖": "etiqueta", "🏷": "etiqueta", "🆓": "etiqueta",
    "📌": "pin", "📍": "ubicacion", "🔀": "mezclar", "🔁": "repetir", "🔄": "refrescar", "⚡": "rayo",
    "⚠": "alerta", "🚨": "alerta", "✅": "hecho", "✔": "check", "❌": "cerrar", "🔔": "campana", "🔕": "campanaOff", "⏰": "reloj", "⏱": "reloj", "⏳": "arena",
    "🎤": "micro", "📷": "camara", "🗑": "papelera", "✏": "lapiz", "⚙": "engranaje",
    "🗓": "calendario", "📅": "calendario", "📋": "lista", "📝": "nota", "🧾": "recibo",
    "👀": "ojo", "🙈": "ojoOff", "🛡": "escudo", "🔒": "candado", "📡": "wifi", "📴": "wifiOff", "🌐": "globo",
    "💾": "disco", "💡": "bombilla", "⚖": "balanza", "🎁": "regalo", "🎉": "brillos", "🥳": "brillos", "💅": "brillos",
    "🤝": "corazon", "💚": "corazon", "🔥": "fuego", "📱": "celular", "💻": "laptop", "🎬": "pelicula", "🎨": "paleta",
    "🤖": "robot", "🏥": "salud", "🩺": "salud", "🚌": "bus", "🚍": "bus", "🚕": "carro", "📚": "libro", "🎓": "birrete",
    "⚽": "balon", "🎮": "juego", "✈": "avion", "👕": "camiseta", "🔧": "llave", "🐶": "huella", "🍽": "cubiertos",
    "🥦": "hoja", "🏋": "pesa", "🎫": "ticket", "📎": "clip", "➡": "adelante", "↩": "deshacer", "⬇": "abajo",
    "➕": "sumar", "➖": "restar", "⏹": "alto", "💬": "comentario",
    "💧": "gota", "📺": "tv", "☕": "cafe", "🎵": "musica", "🚲": "bici", "⛽": "gasolina", "💼": "maleta", "✂": "tijeras",
    "💊": "pastilla", "🍎": "manzana", "🔑": "llaveCasa", "☎": "telefono", "☁": "nube", "🏪": "tienda", "🐷": "alcancia",
    "🟢": ["punto", "ic-verde"], "🟡": ["punto", "ic-amarillo"], "🔴": ["punto", "ic-rojo"], "⚪": ["punto", "ic-gris"],
  };
  const sinSelector = s => s.replace(/[️‍]/g, "");
  window.iconoDeEmoji = function (emoji) {
    const e = E[sinSelector(String(emoji || "")).slice(0, 2)] || E[sinSelector(String(emoji || ""))];
    return Array.isArray(e) ? { nombre: e[0], clase: e[1] } : { nombre: e || "estrella", clase: "" };
  };

  window.iconoSvg = function (nombre, clase) {
    const trazos = P[nombre] || P.estrella;
    return `<span class="ic${clase ? " " + clase : ""}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${trazos}</svg></span>`;
  };
  // HTML del ícono equivalente a un emoji (o a un nombre de ícono).
  window.iconoHtml = function (valor) {
    if (P[valor]) return window.iconoSvg(valor);
    const { nombre, clase } = window.iconoDeEmoji(valor);
    return window.iconoSvg(nombre, clase);
  };

  // ------------------------------------------------------------------
  // Observador: ningún emoji se queda a la vista
  // ------------------------------------------------------------------
  // Un emoji = un pictograma (menos © y ®) con su selector de variación, o una secuencia con ZWJ.
  const RE_EMOJI = /(?![©®])\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*/gu;
  const SALTAR = "script,style,textarea,option,select,input,title,svg,[data-react],[id$='-root'],[data-sin-emoji]";

  function convertirTexto(nodo) {
    const texto = nodo.nodeValue;
    if (!texto || !RE_EMOJI.test(texto)) { RE_EMOJI.lastIndex = 0; return; }
    RE_EMOJI.lastIndex = 0;
    const padre = nodo.parentElement;
    if (!padre || padre.closest(SALTAR)) return;
    const frag = document.createDocumentFragment();
    let ultimo = 0, m;
    while ((m = RE_EMOJI.exec(texto))) {
      if (m.index > ultimo) frag.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
      const tmp = document.createElement("template");
      tmp.innerHTML = window.iconoHtml(m[0]);
      frag.appendChild(tmp.content.firstChild);
      ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) frag.appendChild(document.createTextNode(texto.slice(ultimo)));
    // Sin el espacio que sobraba entre el emoji y el texto, el ícono queda pegado: el CSS de .ic
    // le da su propio margen.
    padre.replaceChild(frag, nodo);
  }

  function recorrer(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { convertirTexto(raiz); return; }
    if (raiz.nodeType !== 1 || raiz.closest?.(SALTAR)) return;
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const nodos = [];
    while (w.nextNode()) nodos.push(w.currentNode);
    nodos.forEach(convertirTexto);
  }

  let pendientes = new Set(), programado = false;
  function procesar() {
    programado = false;
    const lote = pendientes; pendientes = new Set();
    lote.forEach(n => { if (n.isConnected) recorrer(n); });
  }
  function iniciar() {
    recorrer(document.body);
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === "characterData") pendientes.add(m.target);
        else m.addedNodes.forEach(n => pendientes.add(n));
      }
      if (pendientes.size && !programado) { programado = true; queueMicrotask(procesar); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) iniciar(); else document.addEventListener("DOMContentLoaded", iniciar);

  // ------------------------------------------------------------------
  // Ícono por defecto según el NOMBRE de un concepto (cuando nadie le eligió uno): busca palabras
  // clave (agua, arriendo, gasolina, mascota...). Devuelve el emoji representativo, o null.
  // ------------------------------------------------------------------
  const CLAVES = [
    [/agua|acueducto|alcantarillado/, "💧"], [/luz|energia|electric|emcali|enel|codensa/, "💡"], [/\bgas\b|gasodomestico|gases/, "🔥"],
    [/internet|wifi|fibra|banda ancha/, "📡"], [/celular|movil|datos|claro|tigo|movistar|wom/, "📱"], [/telefon|linea fija/, "☎️"],
    [/netflix|disney|hbo|prime|streaming|television|cable|\btv\b|youtube/, "📺"], [/spotify|musica|concierto/, "🎵"],
    [/arriendo|alquiler|renta de|administracion|inmobiliaria/, "🔑"], [/hipoteca|vivienda|hogar|\bcasa\b|apartamento/, "🏡"],
    [/gasolina|combustible|tanque|acpm/, "⛽"], [/taxi|uber|didi|cabify|inDrive/i, "🚕"], [/parqueadero|peaje|carro|vehiculo|moto|mecanic/, "🚕"],
    [/bus\b|transporte|pasaje|\bmio\b|metro|transmilenio|tren/, "🚌"], [/bicicleta|\bbici\b/, "🚲"],
    [/mercado|supermercado|viveres|abarrotes|plaza de/, "🛒"], [/tienda|compras|shopping|centro comercial/, "🛍️"],
    [/restaurante|almuerzo|comida|domicilio|rappi|desayuno|cena\b|corrientazo/, "🍽️"], [/cafe|cafeteria|tinto/, "☕"], [/fruta|verdura|\bfrutas\b/, "🍎"],
    [/farmacia|droga|medicina|medicament|pastilla|vitamina/, "💊"], [/salud|eps|prepagada|hospital|clinica|doctor|medico|odont|examen/, "🏥"],
    [/gimnasio|\bgym\b|deporte|futbol|entrenamiento/, "🏋️"], [/belleza|peluquer|barber|spa\b|manicur|cabello|uñas|unas/, "✂️"],
    [/ropa|zapato|vestuario|calzado|moda/, "👕"], [/regalo|cumple|aniversario|detalle/, "🎁"],
    [/viaje|vacacion|vuelo|hotel|tiquete|turismo|paseo/, "✈️"], [/mascota|perro|gato|veterin|concentrado/, "🐶"],
    [/educacion|colegio|universidad|matricula|pension escolar|jardin|guarderia|utiles/, "📚"], [/curso|certificacion|diplomado|congreso|capacitacion/, "🎓"],
    [/seguro|poliza|soat/, "🛡️"], [/impuesto|predial|dian|retefuente|iva\b|declaracion/, "🧾"],
    [/prestamo|credito|deuda|cuota|tarjeta|financiaci|icetex/, "💳"], [/ahorro|alcancia|fondo de emergencia|emergencia/, "🐷"],
    [/inversion|cdt|accion|cripto|bolsa|dividendo|rendimiento/, "📈"], [/salario|sueldo|nomina|honorario|ingreso|comision|bono|prima|cesantia|pago de/, "💰"],
    [/donacion|diezmo|ofrenda|caridad|ayuda a/, "🤝"], [/trabajo|oficina|empresa|negocio|cliente/, "💼"],
    [/suscripcion|susc\.|software|hosting|dominio|nube|licencia|app\b/, "☁️"], [/tecnologia|computador|portatil|tecnico|celular nuevo|electronic/, "💻"],
    [/reparacion|mantenimiento|arreglo|plomer|electricista|ferreter/, "🔧"], [/juego|play\b|xbox|nintendo|ocio|diversion|entretenimiento|salida/, "🎮"],
    [/cine|pelicula|teatro/, "🎬"], [/fiesta|evento|celebracion|rumba/, "🎉"],
    [/ajuste|nivelacion/, "⚖️"], [/pasatiempo|arte|pintura|hobby/, "🎨"],
  ];
  window.iconoPorNombre = function (nombre) {
    const n = String(nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [re, emoji] of CLAVES) if (re.test(n)) return emoji;
    return null;
  };

  // ------------------------------------------------------------------
  // Selector de íconos para los campos de "ícono"
  // ------------------------------------------------------------------
  // [emoji que se guarda, nombre del ícono]. El valor guardado sigue siendo un emoji (así lo
  // leen igual los demás dispositivos), pero a la vista solo hay íconos.
  const OPCIONES = [
    "🛒", "🏠", "🍽️", "🥦", "🚌", "🚕", "✈️", "🎁", "🎮", "🎬", "📚", "🎓", "💻", "📱", "💡", "🔥",
    "🔧", "🏥", "💅", "⚽", "👕", "🐶", "🏋️", "💰", "💳", "🏦", "📈", "🎯", "🗂️", "🔖", "📌", "🧾",
    "🎤", "📦", "🤝", "🔔", "🗓️", "📋", "🎨", "🛍️",
    "💧", "📺", "☕", "🎵", "🚲", "⛽", "💼", "✂️", "💊", "🍎", "🔑", "☎️", "☁️", "🏪", "🐷",
  ];
  window.OPCIONES_ICONO = OPCIONES;

  window.montarSelectorIconos = function (idInput) {
    const input = document.getElementById(idInput);
    if (!input || input.dataset.selectorIconos) return;
    input.dataset.selectorIconos = "1";
    input.style.display = "none";
    const grid = document.createElement("div");
    grid.className = "selector-iconos";
    grid.setAttribute("data-sin-emoji", "1");
    grid.innerHTML = OPCIONES.map(e => `<button type="button" class="selector-icono" data-emoji="${e}" title="${window.iconoDeEmoji(e).nombre}">${window.iconoHtml(e)}</button>`).join("");
    input.insertAdjacentElement("afterend", grid);
    const marcar = () => {
      const v = sinSelector(input.value || "");
      grid.querySelectorAll(".selector-icono").forEach(b => b.classList.toggle("active", sinSelector(b.dataset.emoji) === v));
    };
    grid.addEventListener("click", e => {
      const b = e.target.closest(".selector-icono");
      if (!b) return;
      // Tocar el que ya estaba elegido lo quita (queda el ícono por defecto).
      input.value = sinSelector(input.value) === sinSelector(b.dataset.emoji) ? "" : b.dataset.emoji;
      marcar();
    });
    // El resto del código llena y vacía el campo con input.value = ...: se avisa al selector.
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", {
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v); marcar(); },
      configurable: true,
    });
    marcar();
  };
  const CAMPOS = ["nuevo-concepto-icono", "mercado-categoria-icono", "bloque-plan-icono"];
  const montarTodos = () => CAMPOS.forEach(window.montarSelectorIconos);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montarTodos); else montarTodos();
})();

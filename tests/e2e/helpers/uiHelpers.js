// La app reemplaza el <select> nativo de caja por un dropdown propio
// (refrescarSelectorCaja en app.js): oculta el <select> con display:none y
// arma un botón + panel de opciones al lado. Para elegir una caja en un
// test hay que interactuar con ese widget, no con el <select> escondido.
async function seleccionarCaja(page, selectId, textoOpcion) {
  const picker = page.locator(`#${selectId} + .caja-picker`);
  await picker.locator('.caja-picker-toggle').click();
  await picker.locator('.caja-picker-option', { hasText: textoOpcion }).click();
}

module.exports = { seleccionarCaja };

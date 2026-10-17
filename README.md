# finanzas-hogar-versiones

## Tests E2E

```
npm install
npx playwright install chromium webkit
npm run test:e2e
```

Corre los tests en Chromium (escritorio) y en un viewport de iPhone. La app
se sirve estática (sin build) y las llamadas a Google Sheets/Drive se
mockean (`tests/e2e/helpers/googleMock.js`) — no hace falta una cuenta de
Google real.

## Migración gradual a React

La app sigue siendo estática (GitHub Pages sirve la raíz del repo), pero los
módulos migrados se escriben en React y se compilan con Vite:

- Código fuente: `react/src/<modulo>/` (hoy: `cajas`, `proyeccion`), con lo compartido en
  `react/src/shared/` y el punto de entrada en `react/src/entry.jsx`.
- Bundle compilado: `react-dist/react-app.js` (uno solo, IIFE, **se commitea**), cargado
  con un `<script>` normal en `index.html` antes de `app.js` y listado en
  `sw.js` (subir `CACHE_NAME` al cambiarlo).
- Después de tocar algo en `react/src/`: `npm run build:react` y commitear
  `react-dist/`.
- `app.js` sigue dueño de los datos y de lo aún no migrado; le pasa a React un
  view-model y callbacks (ver `renderCajas`). Las clases CSS e ids se
  mantienen, así los tests E2E no cambian.

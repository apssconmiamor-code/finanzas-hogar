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

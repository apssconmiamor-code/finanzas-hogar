// Migración gradual a React: cada módulo migrado se compila a UN bundle IIFE
// en react-dist/ (se commitea, porque GitHub Pages sirve la raíz del repo tal
// cual, sin paso de build en el deploy) y se carga con un <script> normal
// antes de app.js. El resto de la app sigue siendo JS plano.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "react-dist",
    emptyOutDir: true,
    minify: true,
    lib: {
      entry: "react/src/cajas/entry.jsx",
      name: "CajasReact",
      formats: ["iife"],
      fileName: () => "cajas.js",
    },
  },
});

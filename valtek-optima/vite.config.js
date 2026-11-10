import { defineConfig } from 'vite';

// VITE_BASE permite publicar en subcarpeta (GitHub Pages: /valtek-optima/)
// o en la raíz del dominio (.cl en Cloudflare Pages: /).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  server: { port: 5173, open: true },
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});

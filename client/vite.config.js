import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `netlify dev` serves the API on 8888; the standalone server uses 4000.
const api = process.env.VITE_API_TARGET || 'http://localhost:8888';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: api,
        changeOrigin: true,
        // Image generation can take a few minutes for 7 images.
        proxyTimeout: 600000,
        timeout: 600000,
      },
    },
  },
});

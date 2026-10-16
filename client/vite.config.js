import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // Image generation can take a few minutes for 7 images.
        proxyTimeout: 600000,
        timeout: 600000,
      },
    },
  },
});

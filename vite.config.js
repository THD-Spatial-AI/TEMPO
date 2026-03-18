import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',   // relative paths so Electron can load dist/index.html from file://
  server: {
    proxy: {
      // Forward /tech/* to the opentech-db Python API (not directly reachable from browser)
      '/tech': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tech/, ''),
      },
    },
  },
  build: {
    // Target modern browsers for smaller, faster output
    target: 'esnext',
    // Warn on chunks > 1 MB
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split heavy vendor libraries into separate cacheable chunks
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-mui': [
            '@mui/material',
            '@mui/icons-material',
            '@emotion/react',
            '@emotion/styled',
          ],
          'vendor-map': [
            'maplibre-gl',
            '@deck.gl/core',
            '@deck.gl/layers',
            '@deck.gl/react',
          ],
        },
      },
    },
  },
})

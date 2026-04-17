import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read .env so we can use service URLs as proxy targets.
  // This way the URLs are never hard-coded here.
  const env = loadEnv(mode, process.cwd(), '')
  const h2Target = (env.VITE_H2_SERVICE_URL || 'http://localhost:8765').replace(/\/$/, '')
  const ccsTarget = (env.VITE_CCS_SERVICE_URL || 'http://localhost:8766').replace(/\/$/, '')

  return {
    plugins: [react()],
    assetsInclude: ['**/*.PNG'],
    base: './',   // relative paths so Electron can load dist/index.html from file://
    server: {
      proxy: {
        // ── Hydrogen Plant Simulation Service ─────────────────────────────────────
        // Proxies both HTTP and WebSocket so the browser never connects directly
        // to the VM (avoids CORS issues and Docker/firewall restrictions).
        '/h2-proxy': {
          target: h2Target,
          changeOrigin: true,
          ws: true,  // also proxy WebSocket upgrade requests
          rewrite: (path) => path.replace(/^\/h2-proxy/, ''),
        },
        // ── CCS Simulation Service ───────────────────────────────────────────────
        // Carbon Capture and Storage simulation service
        '/ccs-proxy': {
          target: ccsTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ccs-proxy/, ''),
        },
        // ── Go backend (dev only — avoids CORS from localhost:5174) ──────────
        '/api': {
          target: 'http://localhost:8082',
          changeOrigin: true,
        },
        // ── OpenTech-DB technology catalog ───────────────────────────────────
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
  }
})

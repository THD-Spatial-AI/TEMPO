import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read .env so we can use service URLs as proxy targets.
  // This way the URLs are never hard-coded here.
  const env = loadEnv(mode, process.cwd(), '')
  const techTarget = (env.VITE_TECH_API_URL || 'https://otdb.th-deg.de').replace(/\/$/, '')

  return {
    plugins: [react()],
    assetsInclude: ['**/*.PNG'],
    base: './',   // relative paths so Electron can load dist/index.html from file://
    server: {
      proxy: {
        // ── Go backend (dev only — avoids CORS from localhost:5174) ──────────
        '/api': {
          target: 'http://localhost:8082',
          changeOrigin: true,
        },
        // ── OpenTech-DB technology catalog ───────────────────────────────────
        '/tech': {
          target: techTarget,
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

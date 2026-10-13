import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.PNG'],
  // The Interoperability page imports ../python/*.json (the translators' own mapping files)
  server: { fs: { allow: ['..'] } },
})

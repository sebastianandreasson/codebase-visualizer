import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
    manifest: true,
    outDir: 'dist/standalone',
    rollupOptions: {
      input: resolve(__dirname, 'standalone.html'),
    },
  },
})

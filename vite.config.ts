import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { codebaseVisualizerPlugin } from './src/vite'

export default defineConfig({
  plugins: [react(), codebaseVisualizerPlugin()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'node/index': resolve(__dirname, 'src/node/index.ts'),
        vite: resolve(__dirname, 'src/vite.ts'),
      },
      formats: ['es'],
      fileName: (_, entryName) => `${entryName}.js`,
      cssFileName: 'style',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'vite',
        'node:fs/promises',
        'node:http',
        'node:path',
      ],
    },
  },
})

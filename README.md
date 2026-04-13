# codebase-visualizer

Scaffold for a publishable npm package that exposes:

- A React component for rendering a codebase tree and file preview.
- A Node API for reading the project folder the package is running in.
- A Vite plugin that exposes the current workspace as JSON to a frontend.

## Package surface

```ts
import { CodebaseVisualizer } from 'codebase-visualizer'
import { readProjectSnapshot } from 'codebase-visualizer/node'
import { codebaseVisualizerPlugin } from 'codebase-visualizer/vite'
```

## Local development

```bash
npm install
npm run dev
```

The demo app uses the Vite plugin endpoint to read this repository and render it in the browser.

## Build

```bash
npm run build
```

This emits ESM bundles and type declarations into `dist/`.

import { defineConfig } from 'vite';

export default defineConfig({
  root: 'testing',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    lib: { entry: '../src/fluid-glass.ts', formats: ['es'] },
  },
});

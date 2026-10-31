import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base './' — сборка работает на GitHub Pages под любым именем репозитория.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { target: 'es2020', sourcemap: true },
  test: { include: ['src/**/*.test.ts'] },
});

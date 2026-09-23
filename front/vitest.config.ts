import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vitest/config'

// Configuration distincte de `vite.config.ts` : on ne veut ni le plugin de
// routage (qui regenere routeTree.gen.ts) ni Tailwind pendant les tests.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})

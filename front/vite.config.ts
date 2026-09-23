import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  server: {
    port: 4270,
    // Sans strictPort, vite se rabat en silence sur le port suivant et le
    // CORS du back ne correspond plus : tout échoue en « Failed to fetch ».
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
      // Les tests colocalises avec les fichiers de route (ex.
      // `$serviceId.test.ts` a cote de `$serviceId.tsx`, pour verrouiller un
      // `beforeLoad`) ne sont pas des routes : sans ce filtre, le greffon
      // essaie d'y trouver un export `Route` et le build echoue.
      routeFileIgnorePattern: '\\.test\\.(ts|tsx)$',
    }),
    react(),
    tailwindcss(),
  ],
})

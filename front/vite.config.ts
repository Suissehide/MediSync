import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  server: {
    port: 4270,
    // Sans strictPort, vite se rabat en silence sur le port suivant et le
    // CORS du back ne correspond plus : tout échoue en « Failed to fetch ».
    strictPort: true,
  },
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
})

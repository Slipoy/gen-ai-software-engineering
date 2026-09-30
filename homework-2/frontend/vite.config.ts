import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The backend runs separately (http://localhost:3000). The app calls same-origin `/api/...`
 * and the dev server forwards those requests to the backend with the `/api` prefix removed:
 *
 *   browser → http://localhost:5173/api/tickets → proxy → http://localhost:3000/tickets
 *
 * The browser only ever talks to one origin, so no CORS setup is needed. In Docker (step C1)
 * nginx does the same forwarding in production.
 */
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})

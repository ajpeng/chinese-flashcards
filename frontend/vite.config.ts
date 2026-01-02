import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy /health requests during development to the backend running on port 3001
      '/health': {
        // Backend listens on 3000 (see backend/bin/www). Proxy should target 3000.
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

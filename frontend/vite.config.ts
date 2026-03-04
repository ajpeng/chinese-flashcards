import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// In dev the app is served at root (/); in production it lives under the
// GitHub Pages subdirectory /chinese-flashcards/.
const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  base: isProd ? '/chinese-flashcards/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

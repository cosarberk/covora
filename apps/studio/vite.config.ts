import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Geliştirmede API isteklerini (same-origin) server'a yönlendir.
const apiProxy = 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4100,
    proxy: {
      '/auth': apiProxy,
      '/reviews': apiProxy,
      '/projects': apiProxy,
      '/packs': apiProxy,
      '/providers': apiProxy,
      '/rules': apiProxy,
      '/webhooks': apiProxy,
      '/dashboard': apiProxy,
      '/chat': apiProxy,
      '/health': apiProxy
    }
  }
})

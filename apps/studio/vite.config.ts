import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Geliştirmede API isteklerini (same-origin) server'a yönlendir.
const apiProxy = 'http://localhost:4300'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    proxy: {
      '/auth': apiProxy,
      '/reviews': apiProxy,
      '/runs': apiProxy,
      '/projects': apiProxy,
      '/packs': apiProxy,
      '/providers': apiProxy,
      '/integrations': apiProxy,
      '/rules': apiProxy,
      '/checkers': apiProxy,
      '/webhooks': apiProxy,
      '/dashboard': apiProxy,
      '/chat': apiProxy,
      '/health': apiProxy
    }
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    open: true,
    // Proxy auth + PROP traffic to the local worker so the browser sees
    // everything as same-origin. Required so the HttpOnly headlo_refresh
    // cookie is accepted in dev (HTTP can't use SameSite=None; Secure).
    proxy: {
      '/oauth':       'http://127.0.0.1:8787',
      '/v1':          'http://127.0.0.1:8787',
      '/.well-known': 'http://127.0.0.1:8787',
    },
  },
})

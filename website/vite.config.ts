import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Allow accessing the dev/preview server through forwarded sandbox hosts
  // (e.g. *.vercel.run preview URLs) instead of only localhost.
  server: {
    allowedHosts: ['.vercel.run'],
  },
  preview: {
    allowedHosts: ['.vercel.run'],
  },
})

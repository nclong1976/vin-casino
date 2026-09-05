import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
  ],
  // Base44 preview: the app is served through a proxy hostname that changes
  // whenever the environment is recreated, so allow all hosts (Vite blocks
  // unknown Host headers even in middleware mode).
  server: {
    allowedHosts: true,
  },
});

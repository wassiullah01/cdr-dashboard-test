import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Proxy configuration for local development
    // In production, API calls use VITE_API_BASE_URL from .env
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // Local backend URL
        changeOrigin: true
      }
    }
  }
});
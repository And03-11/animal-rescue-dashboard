import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssCodeSplit: true,
    sourcemap: false,
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', '@mui/material'],
          muiIcons: ['@mui/icons-material'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@mui/material', '@mui/icons-material'],
    exclude: [],
  },
  server: {
    // Escucha en todas las interfaces de red, no solo en localhost.
    // Es una buena práctica para que contenedores o máquinas virtuales puedan acceder.
    host: true,
    // Permite que las peticiones que vienen del túnel de ngrok no sean bloqueadas.
    // El punto al inicio actúa como un comodín para todos los subdominios.
    allowedHosts: ['.ngrok-free.app'],
    // Mantenemos la configuración del proxy que ya tenías.
    proxy: {
      '/api': {
        // Use IPv4 explicitly. On Windows, localhost may resolve to the
        // unhealthy Docker/WSL listener on ::1 instead of the local backend.
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        // ✅ Añade esta línea para habilitar el proxy para WebSockets
        ws: true,
      },
    },
  },
});


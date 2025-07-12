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
    proxy: {
      '/api': 'http://localhost:8001',
    },
  },
});

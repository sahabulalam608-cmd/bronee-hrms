import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'BRONEE HRMS',
        short_name: 'BRONEE HR',
        description: 'BRONEE Limited — Employee & Human Resource Management System',
        theme_color: '#5C2D91',
        background_color: '#FAFAFB',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/app/dashboard',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//, /^\/app\//, /^\/hr\//],
        // The API lives on a separate origin (the Cloudflare Worker), so the
        // runtime cache rules have to be origin-aware. A path-only pattern
        // would also match the Worker and let the service worker answer API
        // requests with a cached page.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith('/api/') &&
              request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'bronee-api',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 8,
            },
          },
          {
            urlPattern: ({ url, request }) =>
              url.origin !== self.location.origin &&
              url.pathname.startsWith('/api/') &&
              request.method === 'GET',
            handler: 'NetworkOnly',
            options: { cacheName: 'bronee-api-remote' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@bronee/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          query: ['@tanstack/react-query'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});

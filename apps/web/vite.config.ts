import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['duckler-logo.svg'],
      manifest: {
        name: 'Duckler Library',
        short_name: 'Duckler',
        description: 'Local-first visual library for bookmarks, notes, images and capture queue items.',
        theme_color: '#141516',
        background_color: '#141516',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/duck-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          { src: '/icons/duck-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        share_target: {
          action: '/share-target/',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'files', accept: ['image/*', 'text/plain'] }],
          },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@visual-library/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5176,
  },
  preview: {
    port: 4176,
  },
});

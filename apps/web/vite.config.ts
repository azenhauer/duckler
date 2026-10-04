import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['library-icon.svg'],
      manifest: {
        name: 'Personal Visual Library',
        short_name: 'Visual Library',
        description: 'Local-first visual library for bookmarks, notes, images and capture queue items.',
        theme_color: '#141516',
        background_color: '#141516',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/library-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
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

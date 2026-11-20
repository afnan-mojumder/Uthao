import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeManifestIcons: false,
      manifest: {
        name: 'Uthao',
        short_name: 'Uthao',
        description: 'A narrative motorcycle ride-hailing simulation set in Dhaka',
        theme_color: '#111827',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,wasm,woff2}'],
        globIgnores: [
          '**/district-*.js',
          '**/locale-en-*.js',
          'og-cover.webp',
          'assets/audio/**',
          'assets/portraits/**',
          'icons/icon-192x192.png',
          'icons/icon-512x512.png',
          'icons/maskable-icon-*.png',
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/assets/district-') ||
              url.pathname.startsWith('/assets/locale-') ||
              url.pathname.startsWith('/assets/audio/') ||
              url.pathname.startsWith('/assets/portraits/') ||
              url.pathname.startsWith('/assets/models/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lazy-game-assets',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 700,
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => !dep.includes('vendor-three'));
      },
    },
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/preact') || id.includes('node_modules/@preact')) return 'vendor-preact';
          if (id.includes('/data/dialogue/en/')) return 'locale-en';
          const districtMatch = /\/data\/districts\/([a-z0-9_]+)\.json$/i.exec(id);
          if (districtMatch && districtMatch[1] !== 'mirpara') {
            return `district-${districtMatch[1]}`;
          }
          if (id.includes('/data/districts/mirpara.json') || id.includes('/data/world.json')) {
            return 'game-world-data';
          }
        },
      },
    },
  },
  server: {
    host: true,
  },
});

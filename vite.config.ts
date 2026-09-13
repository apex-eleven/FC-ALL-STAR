import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import repoStore from './vite-plugins/repo-store';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // repoStore is dev-only (apply: 'serve'): it lets the admin panel write the card
  // catalogue and the admin config into public/, so both survive a cleared browser
  // and travel with the repo to another machine.
  plugins: [react(), repoStore()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173 },
});

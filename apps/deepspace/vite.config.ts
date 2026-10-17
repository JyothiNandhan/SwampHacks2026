import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { deepspaceBuild } from 'deepspace/build';

export default defineConfig({
  plugins: [react(), cloudflare(), deepspaceBuild({ appDir: import.meta.dirname })]
});

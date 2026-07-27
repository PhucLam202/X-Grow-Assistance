import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Injects VITE_API_BASE_URL into manifest host_permissions at build time.
// Without the env var (dev), re-adds localhost for local API access.
function manifestPlugin(): Plugin {
  return {
    name: 'manifest-env',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      const manifestPath = path.join(outDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) return;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        host_permissions: string[];
      };
      const apiUrl = process.env.VITE_API_BASE_URL;
      if (apiUrl) {
        const origin = new URL(apiUrl).origin + '/*';
        if (!manifest.host_permissions.includes(origin)) {
          manifest.host_permissions.push(origin);
        }
      } else {
        manifest.host_permissions.push('http://127.0.0.1:3001/*', 'http://localhost:3001/*');
      }
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [react(), manifestPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'index.html',
        background: 'src/background.ts',
        contentScript: 'src/content/contentScript.ts',
      },
      output: {
        entryFileNames: 'assets/[name].js',
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
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

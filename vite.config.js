import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import symaPlugin from './vite-plugin-syma.js';

export default defineConfig({
    plugins: [
        tailwindcss(),
        symaPlugin({
            compiler: 'scripts/sym-2-json.js',
            pretty: true
        })
    ],
    server: {
        watch: {
            // Watch for changes in .lisp files
            usePolling: false,
            interval: 100
        }
    },
    optimizeDeps: {
        // Exclude .lisp files from dependency optimization
        exclude: ['*.lisp']
    },
    build: {
        target: 'esnext',
        minify: false // Keep readable for debugging
    }
});
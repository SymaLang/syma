import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import symaPlugin from './vite-plugin-syma.js';

export default defineConfig({
    plugins: [
        tailwindcss(),
        symaPlugin({
            entryModule: 'App/Main',
            modulesDir: 'src/modules',
            compiler: 'bin/syma-compile.js',
            pretty: true
        })
    ],
    server: {
        watch: {
            // Watch for changes in .syma module files
            usePolling: false,
            interval: 100
        }
    },
    optimizeDeps: {
        // Exclude virtual modules from dependency optimization
        exclude: ['virtual:*']
    },
    build: {
        target: 'esnext',
        minify: false // Keep readable for debugging
    }
});
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import symaPlugin from '@syma/vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        tailwindcss(),
        react(),
        // Only enable syma plugin if VITE_SYMA_ENTRY is set (demo/dev mode)
        ...(process.env.VITE_SYMA_ENTRY ? [
            symaPlugin({
                entryFile: process.env.VITE_SYMA_ENTRY,
                modulesDir: path.resolve(__dirname, '../demos/syma'),
                compiler: '@syma/cli/bin/syma-compile.js',
                pretty: true
            })
        ] : []),
        // Custom plugin to copy stdlib to dist on build
        {
            name: 'copy-stdlib',
            closeBundle() {
                const stdlibSrc = path.resolve(__dirname, '../../dist');
                const stdlibDest = path.resolve(__dirname, 'dist/stdlib');

                if (fs.existsSync(stdlibSrc)) {
                    fs.cpSync(stdlibSrc, stdlibDest, { recursive: true });
                    console.log('✓ Copied stdlib to dist/stdlib');
                }
            }
        }
    ],
    server: {
        watch: {
            // Watch for changes in .syma module files
            usePolling: false,
            interval: 100
        },
        fs: {
            // Allow serving files from monorepo packages
            allow: [
                path.resolve(__dirname, '../..'),  // Allow entire monorepo root
            ]
        }
    },
    // Note: /stdlib is served from public/stdlib symlink -> ../../dist
    optimizeDeps: {
        // Exclude virtual modules from dependency optimization
        exclude: ['virtual:*']
    },
    build: {
        target: 'esnext',
        minify: false, // Keep readable for debugging
        rollupOptions: {
            external: [
                'virtual:syma-universe',
                // Node.js built-ins
                'fs', 'path', 'child_process', 'glob', 'module',
                'fs/promises', 'node:fs', 'node:fs/promises',
                'node:path', 'node:url', 'node:events', 'node:stream',
                'node:string_decoder'
            ]
        }
    }
});
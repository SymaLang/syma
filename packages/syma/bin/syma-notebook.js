#!/usr/bin/env node

/*****************************************************************
 * Syma Notebook Launcher
 *
 * Serves the built notebook interface using npx serve
 * For development, use: npm run dev in packages/notebook
 ******************************************************************/

import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the notebook package directory
const notebookPath = path.resolve(__dirname, '../../notebook');
const distPath = path.join(notebookPath, 'dist');

// Check if dist folder exists
if (!fs.existsSync(distPath)) {
    console.error('Notebook not built yet. Please run: npm run build -w @syma/notebook');
    process.exit(1);
}

console.log('Starting Syma Notebook server...');
console.log('Serving from:', distPath);

// Resolve the serve package from node_modules
const servePath = path.resolve(__dirname, '../../../node_modules/.bin/serve');

// Serve the built notebook using the installed serve package
const serve = spawn(servePath, ['-s', distPath, '-p', '5173'], {
    stdio: 'inherit',
    shell: true
});

serve.on('error', (err) => {
    console.error('Failed to start notebook server:', err);
    console.error('Try reinstalling: npm install');
    process.exit(1);
});

serve.on('exit', (code) => {
    process.exit(code || 0);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    serve.kill('SIGINT');
});

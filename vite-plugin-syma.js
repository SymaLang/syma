import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { createFilter } from '@rollup/pluginutils';

/**
 * Vite plugin that enables direct importing of .syma files
 * They get compiled to JSON and exported as JavaScript modules
 */
export default function symaPlugin(options = {}) {
    const {
        // Compiler configuration
        compiler = 'scripts/sym-2-json.js',
        pretty = true,
        // File filtering
        include = /\.lisp$/,
        exclude = /node_modules/
    } = options;

    const filter = createFilter(include, exclude);
    let rootDir;

    // Compile .syma to JSON string
    async function compileSyma(filePath) {
        return new Promise((resolve, reject) => {
            const args = [
                path.resolve(rootDir, compiler),
                filePath
            ];

            if (pretty) {
                args.push('--pretty');
            }

            const child = spawn('node', args, {
                cwd: rootDir,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                reject(error);
            });

            child.on('close', (code) => {
                if (code === 0) {
                    // The compiler outputs JSON to stdout
                    resolve(stdout);
                } else {
                    reject(new Error(`Compilation failed: ${stderr || 'Unknown error'}`));
                }
            });
        });
    }

    return {
        name: 'vite-plugin-syma',

        configResolved(config) {
            rootDir = config.root;
        },

        async resolveId(source) {
            // Handle .syma imports
            if (source.endsWith('.syma')) {
                const resolved = path.resolve(rootDir, source);
                // Mark it as virtual so Vite knows we'll handle it
                return resolved;
            }
            return null;
        },

        async load(id) {
            if (!filter(id)) return null;

            try {
                // Check if file exists
                await fs.access(id);

                console.log(`[syma] Compiling ${path.relative(rootDir, id)}...`);

                // Compile the .syma file to JSON
                const jsonString = await compileSyma(id);

                // Parse to validate it's proper JSON
                const ast = JSON.parse(jsonString);

                console.log(`[syma] ✓ Compiled ${path.basename(id)}`);

                // Return as a JavaScript module that exports the AST
                return {
                    code: `export default ${jsonString};`,
                    map: null
                };
            } catch (error) {
                // Create an error module that will display in the browser
                const errorMessage = error.message.replace(/'/g, "\\'");
                console.error(`[syma] ✗ Failed to compile ${path.basename(id)}:`, error.message);

                return {
                    code: `
                        const error = new Error('Failed to compile ${path.basename(id)}: ${errorMessage}');
                        error.id = '${id}';
                        error.plugin = 'vite-plugin-syma';
                        throw error;
                    `,
                    map: null
                };
            }
        },

        handleHotUpdate({ file, server }) {
            if (filter(file)) {
                // Invalidate the module
                const modules = server.moduleGraph.getModulesByFile(file);
                if (modules) {
                    return Array.from(modules);
                }
            }
        }
    };
}
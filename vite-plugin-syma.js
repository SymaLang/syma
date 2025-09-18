import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { createFilter } from '@rollup/pluginutils';
import { glob } from 'glob';

/**
 * Vite plugin for Syma module system
 * Compiles and bundles .syma module files
 */
export default function symaPlugin(options = {}) {
    const {
        // Module configuration
        entryModule = 'App/Main',
        modulesDir = 'src/modules',

        // Compiler configuration
        compiler = 'scripts/syma-modules.js',
        pretty = true,

        // File filtering
        include = /\.syma$/,
        exclude = /node_modules/
    } = options;

    const filter = createFilter(include, exclude);
    let rootDir;
    let moduleMap = new Map();
    let compiledCache = null;

    // Parse module to extract dependencies
    async function parseModuleInfo(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');

        const moduleMatch = content.match(/\(Module\s+([A-Za-z0-9/_-]+)/);
        if (!moduleMatch) {
            throw new Error(`${filePath} is not a valid module file`);
        }

        const moduleName = moduleMatch[1];
        const imports = [];

        const importRegex = /\(Import\s+([A-Za-z0-9/_-]+)\s+as\s+([A-Za-z0-9]+)(?:\s+open)?\)/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }

        return { moduleName, imports, filePath };
    }

    // Scan all modules
    async function scanModules() {
        const pattern = path.join(rootDir, modulesDir, '**/*.syma');
        const files = await glob(pattern);

        moduleMap.clear();
        for (const file of files) {
            try {
                const info = await parseModuleInfo(file);
                moduleMap.set(info.moduleName, info);
            } catch (error) {
                console.warn(`[syma] Skipping ${file}: ${error.message}`);
            }
        }

        console.log(`[syma] Found ${moduleMap.size} modules`);
        return moduleMap;
    }

    // Get all dependencies for an entry module
    function getModuleDependencies(entryName, visited = new Set()) {
        if (visited.has(entryName)) return [];
        visited.add(entryName);

        const module = moduleMap.get(entryName);
        if (!module) {
            console.warn(`[syma] Module ${entryName} not found`);
            return [];
        }

        let deps = [module.filePath];

        for (const importName of module.imports) {
            deps = deps.concat(getModuleDependencies(importName, visited));
        }

        return [...new Set(deps)];
    }

    // Compile modules to universe
    async function compileModules(entryName = entryModule) {
        const moduleFiles = getModuleDependencies(entryName);

        if (moduleFiles.length === 0) {
            throw new Error(`No modules found for entry ${entryName}`);
        }

        return new Promise((resolve, reject) => {
            const args = [
                path.resolve(rootDir, compiler),
                ...moduleFiles,
                '--bundle',
                '--entry', entryName
            ];

            if (pretty) {
                args.push('--pretty');
            }

            console.log(`[syma] Bundling ${moduleFiles.length} modules with entry ${entryName}...`);

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
                    resolve(stdout);
                } else {
                    reject(new Error(`Compilation failed: ${stderr || 'Unknown error'}`));
                }
            });
        });
    }

    // Virtual module for the bundled universe
    const virtualModuleId = 'virtual:syma-universe';
    const resolvedVirtualModuleId = '\0' + virtualModuleId;

    return {
        name: 'vite-plugin-syma',

        async configResolved(config) {
            rootDir = config.root;
            await scanModules();
        },

        resolveId(id) {
            if (id === virtualModuleId) {
                return resolvedVirtualModuleId;
            }
            return null;
        },

        async load(id) {
            if (id === resolvedVirtualModuleId) {
                try {
                    if (!compiledCache) {
                        const jsonString = await compileModules(entryModule);
                        compiledCache = jsonString;
                    }

                    const ast = JSON.parse(compiledCache);
                    console.log(`[syma] ✓ Bundled universe for ${entryModule}`);

                    return {
                        code: `export default ${compiledCache};`,
                        map: null
                    };
                } catch (error) {
                    console.error(`[syma] ✗ Failed to bundle:`, error.message);
                    const errorMessage = error.message.replace(/'/g, "\\'");
                    return {
                        code: `throw new Error('Failed to bundle Syma modules: ${errorMessage}');`,
                        map: null
                    };
                }
            }
            return null;
        },

        async handleHotUpdate({ file, server }) {
            if (filter(file)) {
                console.log(`[syma] Module changed: ${path.basename(file)}`);

                // Clear cache and rescan
                compiledCache = null;
                await scanModules();

                // Invalidate virtual module
                const module = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
                if (module) {
                    server.moduleGraph.invalidateModule(module);
                    server.ws.send({
                        type: 'full-reload',
                        path: '*'
                    });
                    console.log(`[syma] Triggering reload...`);
                }
            }
        },

        config() {
            return {
                resolve: {
                    alias: {
                        'syma-universe': virtualModuleId
                    }
                }
            };
        }
    };
}
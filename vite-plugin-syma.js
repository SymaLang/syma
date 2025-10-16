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
        entryFile = null,  // Path to entry .syma file (overrides entryModule)
        modulesDir = 'src/modules',

        // Compiler configuration
        compiler = 'bin/syma-compile.js',
        pretty = true,

        // File filtering
        include = /\.syma$/,
        exclude = /node_modules/
    } = options;

    const filter = createFilter(include, exclude);
    let rootDir;
    let moduleMap = new Map();
    let compiledCache = null;
    let resolvedEntryModule = entryModule;
    let resolvedEntryFile = entryFile;
    let entryParseError = null;

    // ANSI color codes for console output
    const colors = {
        red: '\x1b[31m',
        yellow: '\x1b[33m',
        green: '\x1b[32m',
        reset: '\x1b[0m'
    };

    // Parse module to extract dependencies
    async function parseModuleInfo(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');

        // Try both syntaxes: {Module Name} and Module(Name, ...)
        let moduleMatch = content.match(/\{Module\s+([A-Za-z0-9/_-]+)/);
        if (!moduleMatch) {
            moduleMatch = content.match(/Module\s*\(\s*([A-Za-z0-9/_-]+)/);
        }
        if (!moduleMatch) {
            throw new Error(
                `${filePath} is not a valid module file.\n\n` +
                `File must start with a Module declaration:\n` +
                `  {Module Module/Name ...}  or  Module(Module/Name, ...)\n\n` +
                `Examples:\n` +
                `  {Module Demo/Counter\n` +
                `    {Export InitialState Inc Dec}\n` +
                `    {Rules ...}}\n\n` +
                `  Module(Demo/VM,\n` +
                `    Export(Run, Step),\n` +
                `    Rules(...))`
            );
        }

        const moduleName = moduleMatch[1];
        const imports = [];

        // Match both syntaxes for imports with optional 'from' clause
        // Brace syntax: {Import X/Y as Z [from "path"] [open] [macro]}
        // Now supports both 'open' and 'macro' modifiers in any order
        const importRegexBrace = /\{Import\s+([A-Za-z0-9/_-]+)\s+as\s+([A-Za-z0-9]+)(?:\s+from\s+"([^"]+)")?(?:\s+(?:open|macro))*\}/g;
        const importRegexFunc = /Import\s*\(\s*([A-Za-z0-9/_-]+)\s*,\s*as\s*,\s*([A-Za-z0-9]+)(?:\s*,\s*from\s*,\s*"([^"]+)")?(?:\s*,\s*(?:open|macro))*\s*\)/g;

        let match;
        // Check brace syntax imports
        while ((match = importRegexBrace.exec(content)) !== null) {
            imports.push({
                module: match[1],
                alias: match[2],
                fromPath: match[3] || null
            });
        }
        // Check function syntax imports
        while ((match = importRegexFunc.exec(content)) !== null) {
            imports.push({
                module: match[1],
                alias: match[2],
                fromPath: match[3] || null
            });
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
            console.warn(`${colors.yellow}[syma] ⚠ Module ${entryName} not found${colors.reset}`);
            return [];
        }

        let deps = [module.filePath];

        for (const imp of module.imports) {
            if (imp.fromPath) {
                // File-based import - resolve path relative to current module
                const currentDir = path.dirname(module.filePath);
                const resolvedPath = path.resolve(currentDir, imp.fromPath);

                // Try to find this module in our map by file path
                let foundModule = null;
                for (const [modName, modInfo] of moduleMap.entries()) {
                    if (path.resolve(modInfo.filePath) === resolvedPath) {
                        foundModule = modName;
                        break;
                    }
                }

                if (foundModule) {
                    deps = deps.concat(getModuleDependencies(foundModule, visited));
                } else {
                    console.warn(`${colors.yellow}[syma] ⚠ File import ${imp.fromPath} not found in module map${colors.reset}`);
                }
            } else {
                // Standard module import by name
                deps = deps.concat(getModuleDependencies(imp.module, visited));
            }
        }

        return [...new Set(deps)];
    }

    // Compile modules to universe
    async function compileModules(entryName = entryModule) {
        const moduleFiles = getModuleDependencies(entryName);

        if (moduleFiles.length === 0) {
            const availableModules = Array.from(moduleMap.keys()).sort();
            const suggestion = availableModules.length > 0
                ? `\n\nAvailable modules:\n  - ${availableModules.join('\n  - ')}`
                : '\n\nNo modules found in the module map. Make sure your .syma files are in the correct directory.';
            throw new Error(
                `No modules found for entry "${entryName}".\n` +
                `The module "${entryName}" was not found in the scanned modules.${suggestion}\n\n` +
                `Make sure:\n` +
                `  1. The module file exists and is properly formatted\n` +
                `  2. The module name in the file matches "${entryName}"\n` +
                `  3. The file is in a location that gets scanned (src/modules/ or entry file directory)`
            );
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

            // Check for VITE_SYMA_ENTRY environment variable
            const envEntry = config.env.VITE_SYMA_ENTRY || process.env.VITE_SYMA_ENTRY;
            if (envEntry) {
                resolvedEntryFile = path.resolve(rootDir, envEntry);
                console.log(`[syma] Using entry file from env: ${resolvedEntryFile}`);
            } else if (entryFile) {
                resolvedEntryFile = path.resolve(rootDir, entryFile);
            }

            await scanModules();

            // If entryFile is specified, resolve it to a module name and ensure it's in the map
            if (resolvedEntryFile) {
                try {
                    const entryInfo = await parseModuleInfo(resolvedEntryFile);
                    resolvedEntryModule = entryInfo.moduleName;

                    // Add the entry file and its directory to the module map if not already there
                    if (!moduleMap.has(resolvedEntryModule)) {
                        moduleMap.set(resolvedEntryModule, entryInfo);

                        // Also scan the entry file's directory for related modules
                        const entryDir = path.dirname(resolvedEntryFile);
                        const pattern = path.join(entryDir, '**/*.syma');
                        const files = await glob(pattern);

                        for (const file of files) {
                            if (file !== resolvedEntryFile) {
                                try {
                                    const info = await parseModuleInfo(file);
                                    if (!moduleMap.has(info.moduleName)) {
                                        moduleMap.set(info.moduleName, info);
                                    }
                                } catch (error) {
                                    console.warn(`${colors.yellow}[syma] Skipping ${file}: ${error.message}${colors.reset}`);
                                }
                            }
                        }
                    }

                    entryParseError = null;
                    console.log(`[syma] Resolved entry file to module: ${resolvedEntryModule}`);
                } catch (error) {
                    entryParseError = error;
                    console.error(`${colors.red}[syma] ✗ Error parsing entry file: ${error.message}${colors.reset}`);
                    // Don't set resolvedEntryModule - will show error in browser
                }
            }
        },

        resolveId(id) {
            if (id === virtualModuleId) {
                return resolvedVirtualModuleId;
            }
            return null;
        },

        async load(id) {
            if (id === resolvedVirtualModuleId) {
                // Check if there was a parse error for the entry file
                if (entryParseError) {
                    const errorMessage = entryParseError.message.replace(/'/g, "\\'");
                    console.error(`${colors.red}[syma] ✗ Cannot load: ${entryParseError.message}${colors.reset}`);
                    return {
                        code: `throw new Error('Failed to parse entry file: ${errorMessage}');`,
                        map: null
                    };
                }

                try {
                    if (!compiledCache) {
                        const jsonString = await compileModules(resolvedEntryModule);
                        compiledCache = jsonString;
                    }

                    const ast = JSON.parse(compiledCache);
                    console.log(`${colors.green}[syma] ✓ Bundled universe for ${resolvedEntryModule}${colors.reset}`);

                    return {
                        code: `export default ${compiledCache};`,
                        map: null
                    };
                } catch (error) {
                    console.error(`${colors.red}[syma] ✗ Failed to bundle: ${error.message}${colors.reset}`);
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
                entryParseError = null;
                await scanModules();

                // Re-resolve entry file if it was the changed file or if we're using an entry file
                if (resolvedEntryFile) {
                    try {
                        const entryInfo = await parseModuleInfo(resolvedEntryFile);
                        resolvedEntryModule = entryInfo.moduleName;

                        // Add the entry file and its directory to the module map if not already there
                        if (!moduleMap.has(resolvedEntryModule)) {
                            moduleMap.set(resolvedEntryModule, entryInfo);

                            // Also scan the entry file's directory for related modules
                            const entryDir = path.dirname(resolvedEntryFile);
                            const pattern = path.join(entryDir, '**/*.syma');
                            const files = await glob(pattern);

                            for (const file of files) {
                                if (file !== resolvedEntryFile) {
                                    try {
                                        const info = await parseModuleInfo(file);
                                        if (!moduleMap.has(info.moduleName)) {
                                            moduleMap.set(info.moduleName, info);
                                        }
                                    } catch (error) {
                                        console.warn(`${colors.yellow}[syma] Skipping ${file}: ${error.message}${colors.reset}`);
                                    }
                                }
                            }
                        }

                        entryParseError = null;
                    } catch (error) {
                        entryParseError = error;
                        console.error(`${colors.red}[syma] ✗ Error parsing entry file: ${error.message}${colors.reset}`);
                        // Continue with reload to show error in browser
                    }
                }

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
/*****************************************************************
 * Node.js Module Platform
 *
 * Node.js implementation of the module compiler platform.
 * Handles file system access for loading modules.
 ******************************************************************/

import * as fs from 'fs';
import * as path from 'path';
import { ModuleCompilerPlatform } from '../core/module-compiler.js';

export class NodeModulePlatform extends ModuleCompilerPlatform {
    constructor(options = {}) {
        super();
        this.stdlibPath = options.stdlibPath;
        this.parser = options.parser;
        this.loadedPaths = new Map(); // path -> module AST
        this.moduleNameToPath = new Map(); // module name -> file path
        this.moduleNameToAST = new Map(); // module name -> AST (for pre-loaded modules)
    }

    /**
     * Resolve module to file path
     */
    async resolveModulePath(moduleName, fromPath = null) {
        if (fromPath) {
            // Resolve relative to current file
            const currentDir = path.dirname(fromPath);
            const resolvedPath = path.resolve(currentDir, fromPath);

            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Cannot resolve module ${moduleName} from path: ${fromPath}`);
            }

            return resolvedPath;
        } else {
            // Standard module - look in stdlib directory
            if (!this.stdlibPath) {
                // Default stdlib locations to check
                const possiblePaths = [
                    path.join(path.dirname(import.meta.url.replace('file://', '')), '../../src/stdlib'),
                    path.join(process.cwd(), 'src/stdlib'),
                    path.join(process.cwd(), 'stdlib')
                ];

                for (const stdPath of possiblePaths) {
                    const modulePath = path.join(stdPath, `${moduleName.toLowerCase().replace(/\//g, '-')}.syma`);
                    if (fs.existsSync(modulePath)) {
                        return modulePath;
                    }
                }

                throw new Error(`Cannot find standard module ${moduleName}. Searched in: ${possiblePaths.join(', ')}`);
            }

            const modulePath = path.join(this.stdlibPath, `${moduleName.toLowerCase().replace(/\//g, '-')}.syma`);
            if (!fs.existsSync(modulePath)) {
                throw new Error(`Cannot find standard module ${moduleName} in ${this.stdlibPath}`);
            }

            return modulePath;
        }
    }

    /**
     * Check if a module exists
     */
    async moduleExists(moduleName) {
        // Check pre-loaded modules first
        if (this.moduleNameToAST.has(moduleName)) {
            return true;
        }

        // Check if we have a known path for this module
        if (this.moduleNameToPath.has(moduleName)) {
            return true;
        }

        try {
            await this.resolveModulePath(moduleName);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Load a module's AST
     */
    async loadModule(moduleName) {
        // Check pre-loaded modules first
        if (this.moduleNameToAST.has(moduleName)) {
            return this.moduleNameToAST.get(moduleName);
        }

        // Check if we have a known path for this module
        let modulePath;
        if (this.moduleNameToPath.has(moduleName)) {
            modulePath = this.moduleNameToPath.get(moduleName);
        } else {
            modulePath = await this.resolveModulePath(moduleName);
        }

        // Check cache
        if (this.loadedPaths.has(modulePath)) {
            return this.loadedPaths.get(modulePath);
        }

        // Parse the module
        const content = fs.readFileSync(modulePath, 'utf-8');
        const ast = this.parser.parseString(content, modulePath);

        // Cache it
        this.loadedPaths.set(modulePath, ast);
        this.moduleNameToAST.set(moduleName, ast);

        return ast;
    }

    /**
     * Load module from file path directly
     */
    async loadModuleFromPath(filePath) {
        // Normalize the path
        const normalizedPath = path.resolve(filePath);

        // Check cache
        if (this.loadedPaths.has(normalizedPath)) {
            return this.loadedPaths.get(normalizedPath);
        }

        // Parse the module
        const content = fs.readFileSync(normalizedPath, 'utf-8');
        const ast = this.parser.parseString(content, normalizedPath);

        // Validate it's a module
        if (!ast || !ast.k || ast.k !== 'Call' || !ast.h || ast.h.v !== 'Module') {
            throw new Error(`${normalizedPath}: Not a module file (must start with Module)`);
        }

        // Extract module name
        const nameNode = ast.a[0];
        if (nameNode && nameNode.k === 'Sym') {
            const moduleName = nameNode.v;
            // Register this module by its name
            this.moduleNameToPath.set(moduleName, normalizedPath);
            this.moduleNameToAST.set(moduleName, ast);
        }

        // Cache it by path
        this.loadedPaths.set(normalizedPath, ast);

        return ast;
    }

    /**
     * Resolve module dependencies
     */
    async resolveImport(importedName, importingModule) {
        // For now, just return the imported name
        // Could be enhanced to handle relative imports, aliases, etc.
        return importedName;
    }

    /**
     * Resolve a relative import path
     */
    async resolveImportPath(relativePath, importingModule) {
        // Find the file path of the importing module
        let importingPath = null;

        // Check if we have a path for this module
        if (this.moduleNameToPath.has(importingModule)) {
            importingPath = this.moduleNameToPath.get(importingModule);
        } else {
            // Try to find it in loaded paths
            for (const [filePath, ast] of this.loadedPaths.entries()) {
                if (ast && ast.a && ast.a[0] && ast.a[0].v === importingModule) {
                    importingPath = filePath;
                    break;
                }
            }
        }

        if (!importingPath) {
            throw new Error(`Cannot find path for importing module ${importingModule}`);
        }

        // Resolve the relative path
        const currentDir = path.dirname(importingPath);
        const resolvedPath = path.resolve(currentDir, relativePath);

        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Cannot find module at ${resolvedPath} (imported from ${importingModule})`);
        }

        return resolvedPath;
    }
}
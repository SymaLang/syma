/*****************************************************************
 * Notebook Module Platform
 *
 * Browser-based module platform for the notebook.
 * Stores notebook-defined modules in memory and fetches stdlib modules.
 ******************************************************************/

import { ModuleCompilerPlatform } from '../core/module-compiler.js';

export class NotebookModulePlatform extends ModuleCompilerPlatform {
    constructor() {
        super();
        this.notebookModules = new Map(); // name -> AST
        this.stdlibIndex = null;
        this.parser = null;
    }

    setParser(parser) {
        this.parser = parser;
    }

    /**
     * Add a notebook-defined module
     */
    addNotebookModule(name, ast) {
        this.notebookModules.set(name, ast);
    }

    /**
     * Remove a notebook-defined module
     */
    removeNotebookModule(name) {
        this.notebookModules.delete(name);
    }

    /**
     * Get all notebook module names
     */
    getNotebookModuleNames() {
        return Array.from(this.notebookModules.keys());
    }

    /**
     * Load stdlib index
     */
    async loadStdlibIndex() {
        if (!this.stdlibIndex) {
            try {
                const response = await fetch('/stdlib/index.json');
                if (!response.ok) {
                    throw new Error('Failed to load module index');
                }
                this.stdlibIndex = await response.json();
            } catch (error) {
                console.error('Failed to load stdlib index:', error);
                this.stdlibIndex = {};
            }
        }
        return this.stdlibIndex;
    }

    /**
     * Check if a module exists
     */
    async moduleExists(moduleName) {
        // Check notebook modules first
        if (this.notebookModules.has(moduleName)) {
            return true;
        }

        // Check stdlib
        const index = await this.loadStdlibIndex();
        return moduleName in index;
    }

    /**
     * Load a module's AST
     */
    async loadModule(moduleName) {
        // Check notebook modules first
        if (this.notebookModules.has(moduleName)) {
            return this.notebookModules.get(moduleName);
        }

        // Check stdlib
        const index = await this.loadStdlibIndex();
        const modulePath = index[moduleName];

        if (!modulePath) {
            // Try case variations
            const lowerName = moduleName.toLowerCase();
            const foundName = Object.keys(index).find(m => m.toLowerCase() === lowerName);

            if (foundName) {
                const path = index[foundName];
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`Failed to load module ${foundName}: HTTP ${response.status}`);
                }

                // The stdlib modules are pre-compiled JSON
                const compiledUniverse = await response.json();

                // We need to extract the module AST from the compiled universe
                // For now, we'll throw an error since we need the source AST
                throw new Error(`Cannot load pre-compiled module ${foundName} - need source AST`);
            }

            throw new Error(`Module ${moduleName} not found`);
        }

        // For stdlib modules, we need to fetch the source .syma file
        // The index currently points to compiled JSON, so we need to adjust the path
        const sourcePath = modulePath.replace('/stdlib/', '/stdlib-src/').replace('.json', '.syma');

        try {
            const response = await fetch(sourcePath);
            if (!response.ok) {
                // Fallback: try to load from the compiled JSON and reconstruct
                // This is a temporary solution
                const compiledResponse = await fetch(modulePath);
                if (!compiledResponse.ok) {
                    throw new Error(`Failed to load module ${moduleName}`);
                }
                const compiled = await compiledResponse.json();

                // For now, throw an error - we need source files
                throw new Error(`Module ${moduleName} requires source file at ${sourcePath}`);
            }

            const sourceCode = await response.text();
            if (!this.parser) {
                throw new Error('Parser not initialized');
            }

            return this.parser.parseString(sourceCode);
        } catch (error) {
            // If we can't get the source, try to work with compiled module
            // This requires extracting module structure from compiled universe
            throw new Error(`Cannot load module ${moduleName}: ${error.message}`);
        }
    }

    /**
     * Resolve module dependencies
     */
    async resolveImport(importedName, importingModule) {
        // For notebook modules, just return the name as-is
        if (this.notebookModules.has(importedName)) {
            return importedName;
        }

        // For stdlib modules, also return as-is
        const index = await this.loadStdlibIndex();
        if (importedName in index) {
            return importedName;
        }

        // Try case variations for stdlib
        const lowerName = importedName.toLowerCase();
        const foundName = Object.keys(index).find(m => m.toLowerCase() === lowerName);
        if (foundName) {
            return foundName;
        }

        throw new Error(`Cannot resolve import ${importedName} from ${importingModule}`);
    }
}
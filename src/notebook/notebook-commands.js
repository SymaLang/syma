/*****************************************************************
 * Notebook Command Processor
 *
 * Browser-compatible command processor for the notebook
 * Handles import of pre-compiled stdlib modules
 ******************************************************************/

import { Sym, Str, Num, Call, isSym, isCall, isStr } from '../ast-helpers.js';
import * as engine from '../core/engine.js';
import { foldPrims } from '../primitives.js';
import { DOMProjector } from '../projectors/dom.js';
import { NotebookModulePlatform } from './notebook-module-platform.js';
import { ModuleCompiler } from '../core/module-compiler.js';

export class NotebookCommands {
    constructor(repl) {
        this.repl = repl;
        this.moduleIndex = null; // Will be loaded lazily
        this.originalProcessCommand = null; // Will be set by notebook-engine
        this.globalSyntaxImported = false; // Track if Core/Syntax/Global has been auto-imported
        this.watchProjectors = new Map(); // Map of cellId -> {projector, mountDiv, nodeCode?}

        // Module system
        this.modulePlatform = new NotebookModulePlatform();
        this.modulePlatform.setParser(repl.parser);
        this.moduleCompiler = new ModuleCompiler(this.modulePlatform);
    }

    async loadModuleIndex() {
        if (!this.moduleIndex) {
            try {
                const response = await fetch('/stdlib/index.json');
                if (!response.ok) {
                    throw new Error('Failed to load module index');
                }
                this.moduleIndex = await response.json();
            } catch (error) {
                console.error('Failed to load stdlib index:', error);
                this.moduleIndex = {};
            }
        }
        return this.moduleIndex;
    }

    async processCommand(command) {
        const parts = command.slice(1).split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        switch (cmd) {
            case 'module':
                // Handle :module <name> or :module multiline
                if (args.length === 1 && args[0] !== 'multiline') {
                    // Single line module definition (just the name)
                    return this.defineModule(args[0], null);
                } else if (args[0] === 'multiline') {
                    // Multiline module will be handled by notebook-engine.js
                    // It will parse the content and call defineModule with the AST
                    return false; // Signal that this needs multiline handling
                } else {
                    this.repl.platform.printWithNewline('Usage: :module <name> or :module multiline');
                    return true;
                }
            case 'import':
                return await this.import(args);
            case 'save':
                return await this.save(args);
            case 'load':
                return await this.load(args);
            case 'help':
            case 'h':
                return this.help();
            case 'render-universe':
                // Check for watch modifier
                const universeWatch = args.includes('watch');
                return this.renderUniverse(universeWatch);
            case 'render':
                // Parse modifiers (watch, multiline)
                const renderArgs = command.slice(7).trim(); // Remove ':render '
                const hasWatch = renderArgs.startsWith('watch ') || renderArgs.includes(' watch');
                const nodeCode = renderArgs.replace(/\bwatch\b/g, '').trim();
                return this.renderNode(nodeCode, hasWatch);
            case 'universe':
            case 'u':
            case 'rules':
            case 'clear':
                // These commands should be handled by the original processor
                if (this.originalProcessCommand) {
                    return this.originalProcessCommand(command);
                }
                break;
            default:
                // Delegate to original REPL command processor for other commands
                if (this.originalProcessCommand) {
                    return this.originalProcessCommand(command);
                } else {
                    this.repl.platform.printWithNewline(`Unknown command: ${cmd}`);
                    return true;
                }
        }
    }

    defineModule(moduleCode) {
        try {
            // Parse the module code
            const moduleAst = this.repl.parser.parseString(moduleCode);

            // Validate it's a module
            if (!isCall(moduleAst) || !isSym(moduleAst.h) || moduleAst.h.v !== 'Module') {
                throw new Error('Invalid module format - must start with {Module ModuleName ...}');
            }

            const nameNode = moduleAst.a[0];
            if (!isSym(nameNode)) {
                throw new Error('Module name must be a symbol');
            }
            const moduleName = nameNode.v;

            // Add to notebook modules
            this.modulePlatform.addNotebookModule(moduleName, moduleAst);

            // Store just the AST - compilation happens on import
            // This ensures notebook modules are compiled in the same context as when they're imported,
            // including proper Core/Syntax/Global treatment if it's available at that time
            this.repl.platform.printWithNewline(`Module ${moduleName} defined successfully`);
            this.repl.platform.printWithNewline(`You can now import it with: :import ${moduleName}`);

            return true;
        } catch (error) {
            this.repl.platform.printWithNewline(`Error defining module: ${error.message}`);
            return true;
        }
    }

    mergeCompiledModule(compiledUniverse, moduleName) {
        // Extract rules and RuleRules from compiled universe
        const compiledRules = engine.findSection(compiledUniverse, "Rules");
        const compiledRuleRules = engine.findSection(compiledUniverse, "RuleRules");
        const compiledMacroScopes = engine.findSection(compiledUniverse, "MacroScopes");

        // Module is compiled as library, so we just store its rules for import
        // We don't merge immediately - wait for explicit import
        this.repl.platform.printWithNewline(`Module ${moduleName} is ready for import`);
    }

    async import(args) {
        const moduleName = args[0];

        // Parse modifiers (open, macro)
        const modifiers = {
            open: false,
            macro: false
        };

        for (let i = 1; i < args.length; i++) {
            if (args[i] === 'open') {
                modifiers.open = true;
            } else if (args[i] === 'macro') {
                modifiers.macro = true;
            }
        }

        if (!moduleName) {
            this.repl.platform.printWithNewline("Usage: :import <module-name> [open] [macro]");
            this.repl.platform.printWithNewline("Examples:");
            this.repl.platform.printWithNewline("  :import Core/String          # Normal import (qualified symbols)");
            this.repl.platform.printWithNewline("  :import Core/String open     # Open import (unqualified symbols)");
            this.repl.platform.printWithNewline("  :import Core/Fun macro       # Import with macro rules");
            this.repl.platform.printWithNewline("  :import Core/Plumb open macro # Both modifiers");

            // Show notebook modules
            const notebookModules = this.modulePlatform.getNotebookModuleNames();
            if (notebookModules.length > 0) {
                this.repl.platform.printWithNewline("\nNotebook modules:");
                for (const name of notebookModules.sort()) {
                    this.repl.platform.printWithNewline(`  ${name}`);
                }
            }

            // Show stdlib modules
            this.repl.platform.printWithNewline("\nStandard library modules:");
            const index = await this.loadModuleIndex();
            for (const name of Object.keys(index).sort()) {
                this.repl.platform.printWithNewline(`  ${name}`);
            }
            return true;
        }

        try {
            // Check notebook modules first
            if (this.modulePlatform.notebookModules.has(moduleName)) {
                return await this.importNotebookModule(moduleName, modifiers);
            }

            // Load stdlib module index
            const index = await this.loadModuleIndex();

            // First, ensure Core/Syntax/Global is imported (if it exists and not already imported)
            // This is imported into the MAIN UNIVERSE, not per-module
            const globalSyntaxName = 'Core/Syntax/Global';
            if (!this.globalSyntaxImported && index[globalSyntaxName] && moduleName !== globalSyntaxName) {
                this.repl.platform.printWithNewline(`Auto-importing ${globalSyntaxName}...`);
                await this.importModule(globalSyntaxName, index[globalSyntaxName], { open: false, macro: true });
                this.globalSyntaxImported = true;
            }

            // Check if module exists in stdlib
            const modulePath = index[moduleName];
            if (!modulePath) {
                // Try case variations
                const lowerName = moduleName.toLowerCase();
                const foundName = Object.keys(index).find(m => m.toLowerCase() === lowerName);

                if (foundName) {
                    return await this.importModule(foundName, index[foundName], modifiers);
                }

                this.repl.platform.printWithNewline(`Module '${moduleName}' not found.`);

                // Show available modules
                const notebookModules = this.modulePlatform.getNotebookModuleNames();
                if (notebookModules.length > 0) {
                    this.repl.platform.printWithNewline("\nNotebook modules:");
                    for (const name of notebookModules.sort()) {
                        this.repl.platform.printWithNewline(`  ${name}`);
                    }
                }

                this.repl.platform.printWithNewline("\nStandard library modules:");
                for (const name of Object.keys(index).sort()) {
                    this.repl.platform.printWithNewline(`  ${name}`);
                }
                return true;
            }

            return await this.importModule(moduleName, modulePath, modifiers);

        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to import ${moduleName}: ${error.message}`);
        }
        return true;
    }

    async importNotebookModule(moduleName, modifiers = {}) {
        const importDesc = modifiers.open ?
            (modifiers.macro ? `${moduleName} (open, with macros)` : `${moduleName} (open)`) :
            (modifiers.macro ? `${moduleName} (with macros)` : moduleName);
        this.repl.platform.printWithNewline(`Importing notebook module ${importDesc}...`);

        try {
            // Get the module AST
            const moduleAst = this.modulePlatform.notebookModules.get(moduleName);

            // Compile the module directly without trying to load Core/Syntax/Global
            // (since Core/Syntax/Global is already in the main universe if needed)
            const compiledUniverse = this.moduleCompiler.compileModuleAST(moduleAst, { libraryMode: true });

            // Process for open imports if needed
            let processedUniverse = compiledUniverse;
            if (modifiers.open) {
                processedUniverse = this.processOpenImport(compiledUniverse, moduleName);
            }

            // Merge into current universe
            this.mergeUniverses(processedUniverse, moduleName, modifiers);

            // Apply RuleRules to transform the Universe permanently after merge
            this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);

            this.repl.platform.printWithNewline(`Notebook module ${moduleName} imported successfully`);

            // Show what was imported
            const importedRules = engine.extractRules(processedUniverse);
            this.repl.platform.printWithNewline(`Added ${importedRules.length} rules from ${moduleName}`);

        } catch (error) {
            throw new Error(`Failed to import notebook module: ${error.message}`);
        }
        return true;
    }

    async importModule(moduleName, modulePath, modifiers = {}) {
        const importDesc = modifiers.open ?
            (modifiers.macro ? `${moduleName} (open, with macros)` : `${moduleName} (open)`) :
            (modifiers.macro ? `${moduleName} (with macros)` : moduleName);
        this.repl.platform.printWithNewline(`Importing module ${importDesc}...`);

        try {
            // Fetch the pre-compiled module
            const response = await fetch(modulePath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const compiledUniverse = await response.json();

            // Process the imported universe based on modifiers
            let processedUniverse = compiledUniverse;

            if (modifiers.open) {
                // For open imports, we need to unqualify the exported symbols
                // This means removing the module prefix from exported symbols
                processedUniverse = this.processOpenImport(compiledUniverse, moduleName);
            }

            // Merge into current universe
            this.mergeUniverses(processedUniverse, moduleName, modifiers);

            // Apply RuleRules to transform the Universe permanently after merge
            this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);

            this.repl.platform.printWithNewline(`Module ${moduleName} imported successfully`);

            // Show what was imported
            const importedRules = engine.extractRules(processedUniverse);
            this.repl.platform.printWithNewline(`Added ${importedRules.length} rules from ${moduleName} and its dependencies`);

        } catch (error) {
            throw new Error(`Failed to load module: ${error.message}`);
        }
        return true;
    }

    processOpenImport(universe, moduleName) {
        // For open imports, create duplicate rules without the module prefix
        // This makes symbols available both qualified and unqualified
        const processed = JSON.parse(JSON.stringify(universe)); // Deep clone

        const rules = engine.findSection(processed, "Rules");
        if (!rules || !isCall(rules)) return processed;

        const additionalRules = [];

        for (const rule of rules.a) {
            // Process TaggedRule
            if (isCall(rule) && isSym(rule.h) && rule.h.v === 'TaggedRule' && rule.a.length > 1) {
                const innerRule = rule.a[1];
                if (isCall(innerRule) && isSym(innerRule.h) && innerRule.h.v === 'R' && innerRule.a.length >= 3) {
                    const pattern = innerRule.a[1];
                    const replacement = innerRule.a[2];

                    // Check if pattern is a qualified symbol from this module
                    if (isSym(pattern) && pattern.v.startsWith(`${moduleName}/`)) {
                        const unqualifiedName = pattern.v.slice(moduleName.length + 1);

                        // Create an unqualified version of the rule
                        const unqualifiedRule = Call(
                            Sym('TaggedRule'),
                            Str(moduleName),
                            Call(
                                Sym('R'),
                                Str(`${unqualifiedName}/OpenImport`),
                                Sym(unqualifiedName),
                                replacement,
                                innerRule.a[3] || Num(500) // Priority
                            )
                        );
                        additionalRules.push(unqualifiedRule);
                    }
                }
            }
        }

        // Add the unqualified rules
        rules.a.push(...additionalRules);

        return processed;
    }

    updateAllWatchProjectors(excludeCellId = null) {
        // Update all watch projectors except the one that triggered the update
        for (const [cellId, info] of this.watchProjectors.entries()) {
            if (cellId === excludeCellId) continue;

            try {
                if (info.nodeCode) {
                    // Custom render node - rebuild temp universe with current state
                    const app = engine.getProgramApp(this.repl.universe);
                    if (app && app.a.length > 0) {
                        const node = this.repl.parser.parseString(info.nodeCode);
                        let tempUniverse = JSON.parse(JSON.stringify(this.repl.universe));
                        tempUniverse = engine.setProgramApp(tempUniverse,
                            Call(Sym("App"), app.a[0], Call(Sym("UI"), node))
                        );
                        info.projector.universe = tempUniverse;
                        info.projector.render(tempUniverse);
                    }
                } else {
                    // Universe render - just update with current universe
                    info.projector.universe = this.repl.universe;
                    info.projector.render(this.repl.universe);
                }
            } catch (error) {
                console.error(`Failed to update watch projector ${cellId}:`, error);
            }
        }
    }

    cleanupWatchProjector(cellId) {
        // Remove a watch projector when cell is re-executed or cleared
        if (this.watchProjectors.has(cellId)) {
            const info = this.watchProjectors.get(cellId);

            // Clean up the projector (removes event handlers, clears DOM, etc.)
            if (info.projector && typeof info.projector.cleanup === 'function') {
                info.projector.cleanup();
            }

            // Clean up DOM if needed (in case projector didn't do it)
            if (info.mountDiv && info.mountDiv.parentNode) {
                info.mountDiv.remove();
            }

            this.watchProjectors.delete(cellId);
        }
    }

    mergeUniverses(importedUniverse, moduleName, modifiers = {}) {
        // Save undo state if available
        if (this.repl.pushUndo) {
            this.repl.pushUndo();
        }

        // Extract rules from imported universe
        const importedRules = engine.findSection(importedUniverse, "Rules");
        const hasRules = importedRules && isCall(importedRules) && importedRules.a.length > 0;

        // Check for RuleRules as well
        const importedRuleRules = engine.findSection(importedUniverse, "RuleRules");
        const hasRuleRules = importedRuleRules && isCall(importedRuleRules) && importedRuleRules.a.length > 0;

        // If module has neither Rules nor RuleRules, warn and return
        if (!hasRules && !hasRuleRules) {
            this.repl.platform.printWithNewline(`Warning: No rules or meta-rules found in module ${moduleName}`);
            return;
        }

        // Get current rules section (or create if missing)
        let currentRules = engine.findSection(this.repl.universe, "Rules");

        if (!currentRules) {
            // Create Rules section if it doesn't exist
            if (!isCall(this.repl.universe)) {
                throw new Error("Invalid universe structure");
            }
            currentRules = Call(Sym("Rules"));
            this.repl.universe.a.push(currentRules);
        }

        // Process Rules if they exist
        if (hasRules) {
            // Build a set of existing rule names for conflict detection
            const existingRuleNames = new Set();
            for (const rule of currentRules.a) {
                if (isCall(rule) && isSym(rule.h) && rule.h.v === 'R' && rule.a.length > 0) {
                    const nameArg = rule.a[0];
                    if (isStr(nameArg)) {
                        existingRuleNames.add(nameArg.v);
                    }
                } else if (isCall(rule) && isSym(rule.h) && rule.h.v === 'TaggedRule' && rule.a.length > 1) {
                    // Handle tagged rules
                    const innerRule = rule.a[1];
                    if (isCall(innerRule) && isSym(innerRule.h) && innerRule.h.v === 'R' && innerRule.a.length > 0) {
                        const nameArg = innerRule.a[0];
                        if (isStr(nameArg)) {
                            existingRuleNames.add(nameArg.v);
                        }
                    }
                }
            }

            // Merge imported rules, checking for conflicts
            let addedCount = 0;
            let skippedCount = 0;

            for (const importedRule of importedRules.a) {
                let ruleName = null;

                // Extract rule name for conflict detection
                if (isCall(importedRule) && isSym(importedRule.h)) {
                    if (importedRule.h.v === 'R' && importedRule.a.length > 0 && isStr(importedRule.a[0])) {
                        ruleName = importedRule.a[0].v;
                    } else if (importedRule.h.v === 'TaggedRule' && importedRule.a.length > 1) {
                        const innerRule = importedRule.a[1];
                        if (isCall(innerRule) && isSym(innerRule.h) && innerRule.h.v === 'R' &&
                            innerRule.a.length > 0 && isStr(innerRule.a[0])) {
                            ruleName = innerRule.a[0].v;
                        }
                    }
                }

                // Skip if rule already exists
                if (ruleName && existingRuleNames.has(ruleName)) {
                    skippedCount++;
                    continue;
                }

                // Add the rule
                currentRules.a.push(importedRule);
                if (ruleName) {
                    existingRuleNames.add(ruleName);
                }
                addedCount++;
            }

            if (skippedCount > 0) {
                this.repl.platform.printWithNewline(`(Skipped ${skippedCount} rules that already exist)`);
            }
        }

        // Also merge RuleRules section if present (and macro modifier is set)
        if (modifiers.macro && hasRuleRules) {
            let currentRuleRules = engine.findSection(this.repl.universe, "RuleRules");

            if (!currentRuleRules) {
                // Create RuleRules section if it doesn't exist
                currentRuleRules = Call(Sym("RuleRules"));
                this.repl.universe.a.push(currentRuleRules);
            }

            // Add imported RuleRules
            for (const rr of importedRuleRules.a) {
                currentRuleRules.a.push(rr);
            }

            this.repl.platform.printWithNewline(`Added ${importedRuleRules.a.length} meta-rules`);
        }

        // Also merge MacroScopes if present
        const importedMacroScopes = engine.findSection(importedUniverse, "MacroScopes");
        if (importedMacroScopes && isCall(importedMacroScopes) && importedMacroScopes.a.length > 0) {
            let currentMacroScopes = engine.findSection(this.repl.universe, "MacroScopes");

            if (!currentMacroScopes) {
                // Create MacroScopes section if it doesn't exist
                currentMacroScopes = Call(Sym("MacroScopes"));
                this.repl.universe.a.push(currentMacroScopes);
            }

            // Build a map of existing module scopes to avoid duplicates
            const existingScopes = new Map();
            for (const entry of currentMacroScopes.a) {
                if (isCall(entry) && isSym(entry.h) && entry.h.v === "Module" &&
                    entry.a.length >= 2 && isStr(entry.a[0])) {
                    const modName = entry.a[0].v;
                    existingScopes.set(modName, entry);
                }
            }

            // Merge imported MacroScopes, avoiding duplicates
            for (const ms of importedMacroScopes.a) {
                if (isCall(ms) && isSym(ms.h) && ms.h.v === "Module" &&
                    ms.a.length >= 2 && isStr(ms.a[0])) {
                    const modName = ms.a[0].v;

                    if (!existingScopes.has(modName)) {
                        // Module not present yet, add it
                        currentMacroScopes.a.push(ms);
                        existingScopes.set(modName, ms);
                    } else if (ms.a.length >= 2 && isCall(ms.a[1])) {
                        // Module exists, merge the RuleRulesFrom if needed
                        const existingEntry = existingScopes.get(modName);
                        const importedRuleRules = ms.a[1];
                        const existingRuleRules = existingEntry.a[1];

                        if (isCall(importedRuleRules) && isSym(importedRuleRules.h) &&
                            importedRuleRules.h.v === "RuleRulesFrom" &&
                            isCall(existingRuleRules) && isSym(existingRuleRules.h) &&
                            existingRuleRules.h.v === "RuleRulesFrom") {

                            // Merge the RuleRulesFrom lists, avoiding duplicates
                            const existingModules = new Set(
                                existingRuleRules.a.filter(isStr).map(s => s.v)
                            );

                            for (const rrMod of importedRuleRules.a) {
                                if (isStr(rrMod) && !existingModules.has(rrMod.v)) {
                                    existingRuleRules.a.push(rrMod);
                                    existingModules.add(rrMod.v);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    async save(args) {
        // Default filename with timestamp
        const defaultFilename = () => {
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
            return `universe-${timestamp}.json`;
        };
        const filename = args[0] || defaultFilename();

        try {
            // Determine format from extension
            const format = filename.endsWith('.json') ? 'json' : 'syma';

            let content;
            if (format === 'json') {
                content = JSON.stringify(this.repl.universe, null, 2);
            } else {
                // Pretty-print as S-expression
                content = this.repl.parser.prettyPrint(this.repl.universe);
            }

            // Create a blob and trigger download
            const blob = new Blob([content], {
                type: format === 'json' ? 'application/json' : 'text/plain'
            });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.repl.platform.printWithNewline(`Universe saved to ${filename}`);
        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to save: ${error.message}`);
        }
        return true;
    }

    async load(args) {
        // Create a file input to load files
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.syma';

        this.repl.platform.printWithNewline('Opening file picker...');

        return new Promise((resolve) => {
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    this.repl.platform.printWithNewline('No file selected');
                    resolve(true);
                    return;
                }

                try {
                    const content = await file.text();

                    if (file.name.endsWith('.json')) {
                        // Load JSON AST directly
                        this.repl.universe = JSON.parse(content);
                        // Enrich with Effects structure if needed for compatibility
                        this.repl.universe = engine.enrichProgramWithEffects(this.repl.universe);
                        // Apply RuleRules to transform the Universe permanently
                        this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);
                    } else {
                        // Parse S-expression
                        this.repl.universe = this.repl.parser.parseString(content, file.name);
                        // Enrich with Effects structure if needed for compatibility
                        this.repl.universe = engine.enrichProgramWithEffects(this.repl.universe);
                        // Apply RuleRules to transform the Universe permanently
                        this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);
                    }

                    // Process any initial effects
                    const rules = engine.extractRules(this.repl.universe);
                    const program = engine.getProgram(this.repl.universe);
                    if (program) {
                        const normalized = engine.normalize(program, rules, this.repl.maxSteps || 10000, false, foldPrims);
                        this.repl.universe = engine.setProgram(this.repl.universe, normalized);
                    }

                    this.repl.platform.printWithNewline(`Universe loaded from ${file.name}`);

                    // Show summary
                    const rules = engine.extractRules(this.repl.universe);
                    this.repl.platform.printWithNewline(`Loaded ${rules.length} rules`);
                } catch (error) {
                    this.repl.platform.printWithNewline(`Failed to load: ${error.message}`);
                }
                resolve(true);
            };

            // Trigger the file input
            input.click();
        });
    }

    help() {
        this.repl.platform.printWithNewline(`
Available notebook commands:

  :save [filename]          Download universe (.json or .syma format)
  :load                     Load universe from file
  :module multiline         Define a module in the notebook (end with :end)
  :import <module>          Import a stdlib or notebook module
  :render-universe          Render the current universe's UI
  :render-universe watch    Render with live updates from other cells
  :render <ui-node>         Render an interactive UI (modifies global state!)
  :render watch <ui-node>   Render with live updates from other cells
  :universe                 Show current universe structure
  :rules                    List all rules
  :rule multiline           Start a multiline rule definition (end with :end)
  :render multiline         Start a multiline UI node (end with :end)
  :render watch multiline   Start a multiline watch UI node (end with :end)
  :help                     Show this help

Module System:
  Define modules directly in the notebook and import them like stdlib modules.
  Notebook modules can export symbols, import other modules, define rules, etc.

Watch Mode:
  When 'watch' is used, the rendered UI will automatically update when
  ANY other watch cell makes changes to the global state. This allows
  multiple UI cells to stay in sync.

Examples:
  :import Core/List
  :import Core/String

  ; Define a counter in the universe
  {R "Inc" {Apply Inc {State {Count n_}}} {State {Count {Add n_ 1}}}}

  ; Render with watch - will update when other cells change state
  :render watch {Div "Count: " {Show Count}}

  ; Another watch cell - both cells update together
  :render watch {Button "+" :onClick Inc}

  ; Multiline watch example
  :render watch multiline
  {Div
    :class "card"
    {H1 "Counter"}
    {P "Value: " {Show Count}}
    {Button
      :onClick Inc
      :class "btn"
      "Increment"
    }
  }
  :end

  ; Render universe with watch
  :render-universe watch

  ; Define a module in the notebook
  :module multiline
  {Module MyUtils
    {Export Double Triple}
    {Defs
      {Double {Mul 2}}
      {Triple {Mul 3}}
    }
    {Rules
      {R "Double/Apply" {Double x_} {Mul x_ 2} 500}
      {R "Triple/Apply" {Triple x_} {Mul x_ 3} 500}
    }
  }
  :end

  ; Import the notebook module
  :import MyUtils
  :import MyUtils open  ; Import with unqualified symbols

  ; Save and load universe
  :save                    ; Downloads as universe.json
  :save myapp.json         ; Downloads as JSON
  :save myapp.syma         ; Downloads as pretty-printed S-expression
  :load                    ; Opens file picker to load universe
`);
        return true;
    }

    clear() {
        // In notebook context, this would clear cell outputs
        // this.repl.platform.printWithNewline("Clear command is handled by the notebook UI");
        return true;
    }

    renderUniverse(watch = false) {
        try {
            // Get current cell ID for watch tracking
            const cellId = this.repl.platform.currentCellId;

            // Clean up any existing watch projector for this cell
            if (cellId) {
                this.cleanupWatchProjector(cellId);
            }

            // Validate universe structure
            let program = engine.findSection(this.repl.universe, "Program");
            if (!program) {
                this.repl.platform.printWithNewline("Error: No Program section found in universe");
                return true;
            }

            // Check if Program has an App
            let app = program.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "App");
            if (!app) {
                this.repl.platform.printWithNewline("Error: No App[...] found in Program. Use :render <ui-node> instead.");
                return true;
            }

            // Create a mount point
            const mountDiv = document.createElement('div');
            mountDiv.className = 'syma-render-output';
            mountDiv.style.cssText = 'border: 1px solid #444; border-radius: 8px; padding: 16px; margin-top: 8px; background: #1a1a1a;';

            // Extract rules once
            const rules = engine.extractRules(this.repl.universe);

            // Create projector
            const projector = new DOMProjector();
            projector.init({
                mount: mountDiv,
                onDispatch: (action) => {
                    // Use the core dispatch function - it handles everything
                    this.repl.universe = engine.dispatch(this.repl.universe, rules, action, foldPrims);

                    // Re-extract rules in case they changed
                    const updatedRules = engine.extractRules(this.repl.universe);

                    // Normalize the Program again to trigger any inbox processing or effect rules
                    const program = engine.getProgram(this.repl.universe);
                    const normalized = engine.normalize(program, updatedRules, 10000, false, foldPrims);
                    this.repl.universe = engine.setProgram(this.repl.universe, normalized);

                    // Update projector's universe and re-render
                    projector.universe = this.repl.universe;
                    projector.render(this.repl.universe);

                    // If this is a watch projector, update all other watch projectors
                    if (watch && cellId) {
                        this.updateAllWatchProjectors(cellId);
                    }
                },
                options: {
                    normalize: (expr, r) => engine.normalize(expr, r, 10000, false, foldPrims),
                    extractRules: engine.extractRules,
                    universe: this.repl.universe
                }
            });

            // Render the universe
            projector.render(this.repl.universe);

            // Store watch projector if watch mode is enabled
            if (watch && cellId) {
                this.watchProjectors.set(cellId, {
                    projector,
                    mountDiv,
                    nodeCode: null // null indicates this is a universe render
                });
            }

            // Return special DOM output
            const watchLabel = watch ? " (watching)" : "";
            this.repl.platform.printWithNewline(`Rendering universe UI${watchLabel}...`);

            // Special output type for DOM elements
            if (this.repl.platform.outputHandlers && this.repl.platform.currentCellId) {
                const handler = this.repl.platform.outputHandlers.get(this.repl.platform.currentCellId);
                if (handler) {
                    handler({ type: 'dom', element: mountDiv, volatile: true });
                }
            }

        } catch (error) {
            this.repl.platform.printWithNewline(`Error rendering universe: ${error.message}`);
        }
        return true;
    }

    renderNode(nodeCode, watch = false) {
        try {
            // Get current cell ID for watch tracking
            const cellId = this.repl.platform.currentCellId;

            // Clean up any existing watch projector for this cell
            if (cellId) {
                this.cleanupWatchProjector(cellId);
            }

            // Parse the node code
            const node = this.repl.parser.parseString(nodeCode);

            // Ensure we have a universe with an App
            let program = engine.findSection(this.repl.universe, "Program");
            let app = null;

            if (program) {
                // Look for App in the Program
                app = program.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "App");
            }

            // If no App exists, add it to the existing Program
            if (!app) {
                if (!program) {
                    // No Program at all, create a minimal universe with all necessary sections
                    this.repl.universe = Call(Sym("Universe"),
                        Call(Sym("Program"),
                            Call(Sym("App"),
                                Call(Sym("State")),  // Empty state
                                Call(Sym("UI"), Sym("_"))  // Placeholder UI
                            ),
                            Call(Sym("Effects"), Call(Sym("Pending")), Call(Sym("Inbox")))
                        ),
                        Call(Sym("Rules")),
                        Call(Sym("RuleRules"))
                    );
                } else {
                    // Program exists but no App - add App to it
                    const newApp = Call(Sym("App"),
                        Call(Sym("State")),  // Empty state
                        Call(Sym("UI"))  // Placeholder UI
                    );

                    // Add App as the first element (before Effects if present)
                    const newProgram = Call(Sym("Program"), newApp, ...program.a);
                    this.repl.universe = engine.setProgram(this.repl.universe, newProgram);
                }
                this.repl.platform.printWithNewline("Added App to universe");
            }

            // Create a temporary universe with the custom UI for rendering
            // We keep the real state but replace the UI
            let tempUniverse = JSON.parse(JSON.stringify(this.repl.universe)); // Deep clone
            const tempApp = engine.getProgramApp(tempUniverse);
            if (tempApp) {
                // Replace just the UI part (keep the state)
                tempUniverse = engine.setProgramApp(tempUniverse,
                    Call(Sym("App"), tempApp.a[0], Call(Sym("UI"), node))
                );
            }

            // Create a mount point
            const mountDiv = document.createElement('div');
            mountDiv.className = 'syma-render-output';
            mountDiv.style.cssText = 'border: 1px solid #444; border-radius: 8px; padding: 16px; margin-top: 8px; background: #1a1a1a;';

            // Extract rules once
            const rules = engine.extractRules(this.repl.universe);

            // Create projector
            const projector = new DOMProjector();
            projector.init({
                mount: mountDiv,
                onDispatch: (action) => {
                    this.repl.platform.printWithNewline(`Action: ${this.repl.parser.prettyPrint(action)}`);

                    // Use the core dispatch function - it handles everything
                    this.repl.universe = engine.dispatch(this.repl.universe, rules, action, foldPrims);

                    // Re-extract rules in case they changed
                    const updatedRules = engine.extractRules(this.repl.universe);

                    // Normalize the Program again to trigger any inbox processing or effect rules
                    const program = engine.getProgram(this.repl.universe);
                    const normalized = engine.normalize(program, updatedRules, 10000, false, foldPrims);
                    this.repl.universe = engine.setProgram(this.repl.universe, normalized);

                    // Get the updated state
                    const updatedApp = engine.getProgramApp(this.repl.universe);
                    if (updatedApp && updatedApp.a.length > 0) {
                        this.repl.platform.printWithNewline(`State updated: ${this.repl.parser.prettyPrint(updatedApp.a[0])}`);
                    }

                    // Update temp universe with new state for re-rendering
                    let tempUniverse2 = JSON.parse(JSON.stringify(this.repl.universe));
                    tempUniverse2 = engine.setProgramApp(tempUniverse2,
                        Call(Sym("App"), updatedApp.a[0], Call(Sym("UI"), node))
                    );

                    // Update projector's universe and re-render
                    projector.universe = tempUniverse2;
                    projector.render(tempUniverse2);

                    // If this is a watch projector, update all other watch projectors
                    if (watch && cellId) {
                        this.updateAllWatchProjectors(cellId);
                    }
                },
                options: {
                    normalize: (expr, r) => engine.normalize(expr, r, 10000, false, foldPrims),
                    extractRules: engine.extractRules,
                    universe: tempUniverse
                }
            });

            // Render the universe
            projector.render(tempUniverse);

            // Store watch projector if watch mode is enabled
            if (watch && cellId) {
                this.watchProjectors.set(cellId, {
                    projector,
                    mountDiv,
                    nodeCode: nodeCode // Store the original node code for re-rendering
                });
            }

            const watchLabel = watch ? " (watching)" : "";
            this.repl.platform.printWithNewline(`Rendering UI node${watchLabel}: ${nodeCode}`);

            // Special output type for DOM elements
            if (this.repl.platform.outputHandlers && this.repl.platform.currentCellId) {
                const handler = this.repl.platform.outputHandlers.get(this.repl.platform.currentCellId);
                if (handler) {
                    handler({ type: 'dom', element: mountDiv, volatile: true });
                }
            }

        } catch (error) {
            this.repl.platform.printWithNewline(`Error rendering node: ${error.message}`);
        }
        return true;
    }
}
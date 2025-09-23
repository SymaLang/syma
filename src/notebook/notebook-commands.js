/*****************************************************************
 * Notebook Command Processor
 *
 * Browser-compatible command processor for the notebook
 * Handles import of pre-compiled stdlib modules
 ******************************************************************/

import { Sym, Str, Num, Call, isSym, isCall, isStr } from '../ast-helpers.js';
import * as engine from '../core/engine.js';
import { foldPrims } from '../primitives.js';

export class NotebookCommands {
    constructor(repl) {
        this.repl = repl;
        this.moduleIndex = null; // Will be loaded lazily
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
            case 'import':
                return await this.import(args);
            case 'help':
            case 'h':
                return this.help();
            default:
                // Delegate to original REPL command processor for other commands
                return this.repl.commandProcessor.processCommand(command);
        }
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
            this.repl.platform.printWithNewline("\nAvailable modules:");

            const index = await this.loadModuleIndex();
            for (const name of Object.keys(index).sort()) {
                this.repl.platform.printWithNewline(`  ${name}`);
            }
            return true;
        }

        try {
            // Load module index
            const index = await this.loadModuleIndex();

            // Check if module exists
            const modulePath = index[moduleName];
            if (!modulePath) {
                // Try case variations
                const lowerName = moduleName.toLowerCase();
                const foundName = Object.keys(index).find(m => m.toLowerCase() === lowerName);

                if (foundName) {
                    return await this.importModule(foundName, index[foundName], modifiers);
                }

                this.repl.platform.printWithNewline(`Module '${moduleName}' not found.`);
                this.repl.platform.printWithNewline("\nAvailable modules:");
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

    mergeUniverses(importedUniverse, moduleName, modifiers = {}) {
        // Save undo state if available
        if (this.repl.pushUndo) {
            this.repl.pushUndo();
        }

        // Extract rules from imported universe
        const importedRules = engine.findSection(importedUniverse, "Rules");

        if (!importedRules || !isCall(importedRules) || importedRules.a.length === 0) {
            this.repl.platform.printWithNewline(`Warning: No rules found in module ${moduleName}`);
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

        // Also merge RuleRules section if present (and macro modifier is set)
        if (modifiers.macro) {
            const importedRuleRules = engine.findSection(importedUniverse, "RuleRules");
            if (importedRuleRules && isCall(importedRuleRules) && importedRuleRules.a.length > 0) {
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

            // Add imported MacroScopes
            for (const ms of importedMacroScopes.a) {
                currentMacroScopes.a.push(ms);
            }
        }
    }

    help() {
        this.repl.platform.printWithNewline(`
Available notebook commands:

  :import <module>   Import a stdlib module (e.g., :import Core/String)
  :universe          Show current universe structure
  :rules             List all rules
  :help              Show this help

Example:
  :import Core/List
  :import Core/String
`);
        return true;
    }

    clear() {
        // In notebook context, this would clear cell outputs
        // this.repl.platform.printWithNewline("Clear command is handled by the notebook UI");
        return true;
    }
}
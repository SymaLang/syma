/*****************************************************************
 * File Operations Commands
 *
 * Handles file-related REPL commands:
 * - save, load, bundle, reload
 * - export, import
 ******************************************************************/

import { isCall, isSym, isStr } from '../../ast-helpers.js';
import * as engine from '../../core/engine.js';
import { foldPrims } from '../../primitives.js';
import { parseProgramArgsToKV, parseArgsString } from '../../utils/args-parser.js';

export class FileCommands {
    constructor(repl) {
        this.repl = repl;
        this.lastFileOperation = null; // Track last :bundle or :load for :reload
    }

    async save(args, rawArgs) {
        const filename = args[0];
        if (!filename) {
            this.repl.platform.printWithNewline("Usage: :save <filename>\n");
            return true;
        }

        try {
            await this.repl.saveFile(filename);
            this.repl.platform.printWithNewline(`Universe saved to ${filename}`);
        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to save: ${error.message}`);
        }
        return true;
    }

    async load(args, rawArgs) {
        const filename = args[0];
        if (!filename) {
            this.repl.platform.printWithNewline("Usage: :load <filename>");
            return true;
        }

        try {
            await this.repl.loadFile(filename);
            this.repl.platform.printWithNewline(`Universe loaded from ${filename}`);

            // Save for :reload
            this.lastFileOperation = { command: 'load', filename };

            // Give effects processor a moment to process any pending effects
            await new Promise(resolve => this.repl.platform.setTimeout(resolve, 50));
        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to load: ${error.message}`);
        }
        return true;
    }

    async reload(args) {
        if (!this.lastFileOperation) {
            this.repl.platform.printWithNewline("No previous :bundle or :load command to reload");
            return true;
        }

        const { command, filename, programArgs } = this.lastFileOperation;

        // Reconstruct the command string for display
        let commandStr = `:${command} ${filename}`;
        if (programArgs && programArgs.length > 0) {
            commandStr += ` :args ${programArgs.join(' ')}`;
        }
        this.repl.platform.printWithNewline(`Reloading: ${commandStr}`);

        // Re-execute the last command
        if (command === 'load') {
            return await this.load([filename]);
        } else if (command === 'bundle') {
            // Reconstruct rawArgs with :args if needed
            let rawArgs = filename;
            if (programArgs && programArgs.length > 0) {
                rawArgs += ` :args ${programArgs.join(' ')}`;
            }
            return await this.bundle([filename], rawArgs);
        }
        return true;
    }

    async bundle(args, rawArgs) {
        if (args.length === 0) {
            this.repl.platform.printWithNewline("Usage: :bundle <module-file> [:args <arguments>]");
            this.repl.platform.printWithNewline("Example: :bundle src/modules/app-main.syma");
            this.repl.platform.printWithNewline("Example: :bundle demo.syma :args --input data.txt --verbose");
            return true;
        }

        // Check if :args is present in rawArgs
        const argsMarker = ':args';
        const argsIndex = rawArgs.indexOf(argsMarker);
        let filename = args[0];
        let programArgs = [];

        if (argsIndex !== -1) {
            // Extract filename (everything before :args)
            filename = rawArgs.substring(0, argsIndex).trim();

            // Extract and parse arguments after :args
            const argsString = rawArgs.substring(argsIndex + argsMarker.length).trim();
            if (argsString) {
                programArgs = parseArgsString(argsString);
            }
        }

        try {
            // Use child_process to run the compiler
            const { execSync } = await import('child_process');

            // Read the module to get its name
            const content = await this.repl.platform.readFile(filename);
            const ast = this.repl.parser.parseString(content, filename);

            if (!isCall(ast) || !isSym(ast.h) || ast.h.v !== 'Module') {
                throw new Error('File is not a module (must start with Module)');
            }

            const nameNode = ast.a[0];
            if (!isSym(nameNode)) {
                throw new Error('Module name must be a symbol');
            }
            const moduleName = nameNode.v;

            this.repl.platform.printWithNewline(`Bundling module ${moduleName}...\n`);

            // Find the directory containing the module
            const lastSlash = filename.lastIndexOf('/');
            const dir = lastSlash >= 0 ? filename.substring(0, lastSlash) : '.';

            // Use the compiler to bundle - look for all .syma files in the directory
            // First, gather all potential module files
            const glob = (await import('glob')).glob;
            const moduleFiles = await glob(`${dir}/*.syma`);

            // If there's a parent modules directory, include those too
            const parentDir = dir.substring(0, dir.lastIndexOf('/')) || '.';
            const parentModuleFiles = await glob(`${parentDir}/modules/*.syma`).catch(() => []);

            // Include stdlib files
            const stdlibFiles = await glob('src/stdlib/*.syma').catch(() => []);

            const allFiles = [...new Set([...moduleFiles, ...parentModuleFiles, ...stdlibFiles])];

            if (allFiles.length === 0) {
                throw new Error('No module files found');
            }

            const command = `node bin/syma-compile.js ${allFiles.join(' ')} --bundle --entry "${moduleName}" --stdlib src/stdlib`;

            const result = execSync(command, { encoding: 'utf8', cwd: process.cwd() });

            // Parse the resulting JSON
            const universe = JSON.parse(result);

            // Load the bundled universe
            this.repl.universe = universe;

            // Inject arguments if provided and program has {Args} section
            if (programArgs.length > 0) {
                const program = engine.getProgram(this.repl.universe);
                if (program) {
                    // Find the {Args} node in the program
                    const argsIndex = program.a.findIndex(n =>
                        isCall(n) && isSym(n.h) && n.h.v === 'Args'
                    );

                    if (argsIndex !== -1) {
                        // Parse arguments into KV nodes
                        const kvNodes = parseProgramArgsToKV(programArgs);

                        // Create new program with injected arguments
                        const newProgram = {
                            ...program,
                            a: [...program.a]
                        };

                        // Replace the Args node with Args containing the KV pairs
                        newProgram.a[argsIndex] = {
                            k: 'Call',
                            h: { k: 'Sym', v: 'Args' },
                            a: kvNodes
                        };

                        // Update universe with new program
                        this.repl.universe = engine.setProgram(this.repl.universe, newProgram);
                        this.repl.platform.printWithNewline(`Injected ${kvNodes.length} argument(s) into {Args} section`);
                    } else {
                        this.repl.platform.printWithNewline(`Note: Program has no {Args} section, skipping argument injection`);
                    }
                }
            }

            this.repl.universe = engine.enrichProgramWithEffects(this.repl.universe);
            // Apply RuleRules to transform the Universe permanently
            this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);

            // Validate the bundled universe
            const warnings = engine.validateUniverse(this.repl.universe);
            if (warnings.length > 0) {
                this.repl.platform.printWithNewline(`\n⚠️  Warning: Found pattern matching constructs in non-rule sections:`);
                for (const warning of warnings) {
                    for (const detail of warning.details) {
                        this.repl.platform.printWithNewline(`  ${detail.type} "${detail.name}" in ${detail.path}`);
                    }
                }
                this.repl.platform.printWithNewline(`\nPattern matching constructs (Var/VarRest) should only be used in Rules and RuleRules sections.`);
                this.repl.platform.printWithNewline(`These will cause errors during normalization.\n`);
            }

            this.repl.platform.printWithNewline(`Module ${moduleName} bundled and loaded successfully\n`);

            // Save for :reload (including args if present)
            this.lastFileOperation = {
                command: 'bundle',
                filename,
                programArgs: programArgs  // Save args for reload
            };

            // Don't automatically process effects on bundle - let :norm do that
            // This gives user control over when to run the program
        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to bundle: ${error.message}\n`);
            if (error.stderr) {
                this.repl.platform.printWithNewline(`Compiler error: ${error.stderr}\n`);
            }
        }
        return true;
    }

    async export(args, rawArgs) {
        const moduleName = args[0];
        const filename = args[1];

        if (!moduleName) {
            this.repl.platform.printWithNewline("Usage: :export <module> [filename]");
            return true;
        }

        this.repl.platform.printWithNewline("Module export not yet implemented");
        return true;
    }

    async import(args, rawArgs) {
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
            this.repl.platform.printWithNewline("       :import <file.syma> [open] [macro]");
            this.repl.platform.printWithNewline("");
            this.repl.platform.printWithNewline("Examples:");
            this.repl.platform.printWithNewline("  :import Core/String          # Normal import (qualified symbols)");
            this.repl.platform.printWithNewline("  :import Core/String open     # Open import (unqualified symbols)");
            this.repl.platform.printWithNewline("  :import Core/Fun macro       # Import with macro rules");
            this.repl.platform.printWithNewline("  :import Core/Plumb open macro # Both modifiers");
            this.repl.platform.printWithNewline("  :import ./my-module.syma    # Import from file");
            this.repl.platform.printWithNewline("");
            this.repl.platform.printWithNewline("Available stdlib modules:");

            // List available stdlib modules
            const stdlibModules = this.getStdlibModules();

            for (const [name] of Object.entries(stdlibModules).sort()) {
                this.repl.platform.printWithNewline(`  ${name}`);
            }
            return true;
        }

        try {
            // Check if it's a stdlib module or a file path
            const stdlibModules = this.getStdlibModules();

            let filename;
            let resolvedModuleName = moduleName;

            if (stdlibModules[moduleName]) {
                // It's a stdlib module - resolve to file path
                filename = `src/stdlib/${stdlibModules[moduleName]}`;
            } else if (moduleName.includes('/') || moduleName.endsWith('.syma')) {
                // It's a file path
                filename = moduleName;

                // Extract module name from the file
                const content = await this.repl.platform.readFile(filename);
                const ast = this.repl.parser.parseString(content, filename);

                if (!isCall(ast) || !isSym(ast.h) || ast.h.v !== 'Module') {
                    throw new Error('File is not a module (must start with Module)');
                }

                const nameNode = ast.a[0];
                if (!isSym(nameNode)) {
                    throw new Error('Module name must be a symbol');
                }
                resolvedModuleName = nameNode.v;
            } else {
                throw new Error(`Unknown module: ${moduleName}`);
            }

            const importDesc = modifiers.open ?
                (modifiers.macro ? `${resolvedModuleName} (open, with macros)` : `${resolvedModuleName} (open)`) :
                (modifiers.macro ? `${resolvedModuleName} (with macros)` : resolvedModuleName);
            this.repl.platform.printWithNewline(`Importing module ${importDesc}...`);

            // Use child_process to run the compiler in library mode
            const { execSync } = await import('child_process');
            const command = `node bin/syma-compile.js ${filename} --library --stdlib src/stdlib`;
            const result = execSync(command, { encoding: 'utf8', cwd: process.cwd() });

            // Parse the resulting Universe
            let compiledUniverse = JSON.parse(result);

            // Process for open imports if needed
            if (modifiers.open) {
                compiledUniverse = this.processOpenImport(compiledUniverse, resolvedModuleName);
            }

            // Merge the compiled universe into our current one
            this.mergeUniverses(compiledUniverse, resolvedModuleName, modifiers);

            // Apply RuleRules to transform the Universe permanently after merge
            this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);

            this.repl.platform.printWithNewline(`Module ${resolvedModuleName} imported successfully`);

            // Show what was imported
            const importedRules = engine.extractRules(compiledUniverse);
            this.repl.platform.printWithNewline(`Added ${importedRules.length} rules from ${resolvedModuleName} and its dependencies`);

        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to import: ${error.message}`);
            if (error.stderr) {
                this.repl.platform.printWithNewline(`Compiler error: ${error.stderr}`);
            }
        }
        return true;
    }

    getStdlibModules() {
        return {
            'Core/Main': 'core-main.syma',
            'Core/String': 'core-string.syma',
            'Core/List': 'core-list.syma',
            'Core/Fun': 'core-fun.syma',
            'Core/Fun/WithSugar': 'core-fun-withsugar.syma',
            'Core/KV': 'core-kv.syma',
            'Core/Plumb': 'core-plumb.syma',
            'Core/Zipper': 'core-zipper.syma',
            'Core/Set': 'core-set.syma',
            'Core/Effect': 'core-effect.syma',
            'Core/Syntax/Global': 'core-syntax-global.syma',
            'Core/Rope': 'core-rope.syma',
            'Core/Json': 'core-json.syma',
            'Core/ToJson': 'core-tojson.syma',
            'Core/FromJson/Lex': 'core-fromjson-lex.syma',
            'Core/FromJson': 'core-fromjson.syma',
            'Algebra/Simplify': 'algebra-simplify.syma',
            'Notebook/UI': 'notebook-ui.syma'
        };
    }

    // Process open imports (create unqualified versions of rules)
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
                        const unqualifiedRule = {
                            k: 'Call',
                            h: { k: 'Sym', v: 'TaggedRule' },
                            a: [
                                { k: 'Str', v: moduleName },
                                {
                                    k: 'Call',
                                    h: { k: 'Sym', v: 'R' },
                                    a: [
                                        { k: 'Str', v: `${unqualifiedName}/OpenImport` },
                                        { k: 'Sym', v: unqualifiedName },
                                        replacement,
                                        innerRule.a[3] || { k: 'Num', v: 500 } // Priority
                                    ]
                                }
                            ]
                        };
                        additionalRules.push(unqualifiedRule);
                    }
                }
            }
        }

        // Add the unqualified rules
        rules.a.push(...additionalRules);

        return processed;
    }

    // Helper method to merge universes
    mergeUniverses(importedUniverse, moduleName, modifiers = {}) {
        // Save undo state
        this.repl.pushUndo();

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

        // Process Rules if they exist
        if (hasRules) {
            // Get current rules section (or create if missing)
            let currentRules = engine.findSection(this.repl.universe, "Rules");

            if (!currentRules) {
                // Create Rules section if it doesn't exist
                if (!isCall(this.repl.universe)) {
                    throw new Error("Invalid universe structure");
                }
                currentRules = { k: 'Call', h: { k: 'Sym', v: 'Rules' }, a: [] };
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

            if (addedCount > 0) {
                this.repl.platform.printWithNewline(`  Added ${addedCount} new rules`);
            }
            if (skippedCount > 0) {
                this.repl.platform.printWithNewline(`  Skipped ${skippedCount} existing rules`);
            }
        }

        // Also merge RuleRules if present (and macro modifier is set)
        if (modifiers.macro && hasRuleRules) {
            let currentRuleRules = engine.findSection(this.repl.universe, "RuleRules");

            if (!currentRuleRules) {
                // Create RuleRules section if it doesn't exist
                currentRuleRules = { k: 'Call', h: { k: 'Sym', v: 'RuleRules' }, a: [] };
                this.repl.universe.a.push(currentRuleRules);
            }

            // Merge meta-rules
            let metaAdded = 0;
            for (const rule of importedRuleRules.a) {
                // For simplicity, just add all meta-rules (they're less likely to conflict)
                currentRuleRules.a.push(rule);
                metaAdded++;
            }
            if (metaAdded > 0) {
                this.repl.platform.printWithNewline(`  Added ${metaAdded} meta-rules`);
            }
        }

        // Also merge MacroScopes if present
        const importedMacroScopes = engine.findSection(importedUniverse, "MacroScopes");
        if (importedMacroScopes && isCall(importedMacroScopes) && importedMacroScopes.a.length > 0) {
            let currentMacroScopes = engine.findSection(this.repl.universe, "MacroScopes");

            if (!currentMacroScopes) {
                // Create MacroScopes section if it doesn't exist
                currentMacroScopes = { k: 'Call', h: { k: 'Sym', v: 'MacroScopes' }, a: [] };
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
}
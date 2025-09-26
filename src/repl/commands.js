/*****************************************************************
 * REPL Command Processor
 *
 * Handles all colon-prefixed commands in the REPL
 ******************************************************************/

import { Sym, Str, Num, Call, isSym, isCall, isStr, isNum, deq } from '../ast-helpers.js';
import * as engine from '../core/engine.js';
import { foldPrims } from '../primitives.js';
import { parseProgramArgsToKV, parseArgsString } from '../utils/args-parser.js';

export class CommandProcessor {
    constructor(repl) {
        this.repl = repl;
        this.lastFileOperation = null; // Track last :bundle or :load for :reload
        this.commands = {
            'help': this.help.bind(this),
            'h': this.help.bind(this),
            'quit': this.quit.bind(this),
            'q': this.quit.bind(this),
            'exit': this.quit.bind(this),
            'save': this.save.bind(this),
            'load': this.load.bind(this),
            'bundle': this.bundle.bind(this),
            'reload': this.reload.bind(this),
            'export': this.export.bind(this),
            'import': this.import.bind(this),
            'clear': this.clear.bind(this),
            'universe': this.showUniverse.bind(this),
            'u': this.showUniverse.bind(this),
            'rules': this.listRules.bind(this),
            'rule': this.showOrEditRule.bind(this),
            // 'apply': this.applyRule.bind(this),
            'exec': this.smartExecRule.bind(this),
            'trace': this.trace.bind(this),
            'why': this.explainStuck.bind(this),
            'apply': this.applyToState.bind(this),
            'drop': this.dropRule.bind(this),
            'edit': this.editRule.bind(this),
            'undo': this.undo.bind(this),
            'history': this.showHistory.bind(this),
            'set': this.setOption.bind(this),
            'norm': this.normalizeUniverse.bind(this),
            'program': this.showProgram.bind(this),
            'p': this.showProgram.bind(this),
            'macro-scopes': this.showMacroScopes.bind(this),
            'rules-section': this.showRulesSection.bind(this),
            'rs': this.showRulesSection.bind(this),
            'rulerules': this.showRuleRulesSection.bind(this),
            'rr': this.showRuleRulesSection.bind(this),
            'match': this.matchPattern.bind(this),
            'm': this.matchPattern.bind(this),
        };
    }

    async processCommand(input) {
        const parts = input.slice(1).split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        if (command in this.commands) {
            return await this.commands[command](args, input.slice(command.length + 2));
        } else {
            this.repl.platform.printWithNewline(`Unknown command: ${command}. Type :help for available commands.\n`);
            return true;
        }
    }

    // Command implementations

    async help(args) {
        this.repl.platform.printWithNewline(`
Syma REPL Commands:

Expression evaluation:
  <expr>                    Evaluate an expression
  <expr> \\                  Start multiline input (end with '.')

Commands:
  :help, :h                 Show this help message
  :quit, :q, :exit          Exit the REPL

File operations:
  :save <file>              Save universe to file (.syma or .json)
  :load <file>              Load universe from file
  :bundle <file> [:args ...]  Bundle module with optional arguments
                            Example: :bundle demo.syma :args --input data.txt
  :reload                   Re-run last :bundle or :load command (with args)
  :export <module>          Export single module to file
  :import <module> [open] [macro]  Import stdlib module or file
                            Examples: :import Core/String
                                     :import Core/Fun open
                                     :import Core/Plumb open macro

Universe management:
  :clear                    Reset universe to empty state
  :universe, :u             Show current universe (pretty printed)
  :undo                     Undo last modification
  :program, :p              Show current Program section
  :rules-section, :rs       Show raw Rules section
  :rulerules, :rr           Show RuleRules section

Rule management:
  :rules                    List all rules
  :rule                     Enter multiline rule definition mode
  :rule <name>              Show specific rule
  :rule <name> <pat> → <repl>  Define inline rule
  :drop <name>              Remove rule
  :edit <name> <pat> → <repl>  Replace existing rule

Evaluation:
  :apply <name> <expr>      Apply specific rule to expression
  :exec <name> <expr>       Smart execute: auto-wrap input to match rule
  :trace <expr>             Evaluate with step-by-step trace
  :trace verbose            Toggle verbose trace mode
  :trace verbose <expr>     Evaluate with verbose trace (shows patterns/rewrites)
  :trace diff               Toggle diff trace mode
  :trace diff <expr>        Evaluate with diff trace (shows only changes)
  :trace stats <expr>       Show only trace statistics (no step details)
  :why <expr>               Explain why evaluation got stuck
  :apply <action>           Apply action to current universe state
  :norm [show]              Normalize the universe Program section
  :match, :m <pattern>      Match pattern against universe and show bindings
  :match <pat> :target <expr>  Match pattern against arbitrary expression
  :match <pat> :norm <expr>    Normalize expression, then match pattern
  :match <pat> :rewrite <repl> ...  Apply matched bindings to replacement pattern

Settings:
  :set <option> <value>     Set REPL option
    trace on/off            Enable/disable automatic tracing
    maxsteps <n>            Set maximum normalization steps

History:
  :history [n]              Show last n history entries (default: 20)

Debugging:
  :macro-scopes             Show which modules can use which RuleRules
`);
        return true;
    }

    async quit(args) {
        return false; // Signal to exit REPL
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

            this.repl.platform.printWithNewline(`Module ${moduleName} bundled and loaded successfully\n`);
            // this.repl.platform.printWithNewline(`Found ${allFiles.length} module files\n`);

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
            const stdlibModules = {
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

            for (const [name] of Object.entries(stdlibModules).sort()) {
                this.repl.platform.printWithNewline(`  ${name}`);
            }
            return true;
        }

        try {
            // Check if it's a stdlib module or a file path
            const stdlibModules = {
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
                currentRuleRules = Call(Sym("RuleRules"));
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

    async clear(args) {
        this.repl.clearUniverse();
        this.repl.platform.printWithNewline("Universe cleared");
        return true;
    }

    async showUniverse(args) {
        const output = this.repl.formatResult(this.repl.universe);
        this.repl.platform.printWithNewline(output);
        return true;
    }

    async showProgram(args) {
        const program = engine.getProgram(this.repl.universe);
        if (!program) {
            this.repl.platform.printWithNewline("No Program section defined in the universe");
            return true;
        }
        const output = this.repl.formatResult(program);
        this.repl.platform.printWithNewline(output);
        return true;
    }

    async listRules(args) {
        const rules = this.repl.getRules();
        if (rules.length === 0) {
            this.repl.platform.printWithNewline("No rules defined");
        } else {
            this.repl.platform.printWithNewline(`Rules (${rules.length}):`);
            for (const rule of rules) {
                const priority = rule.prio !== 0 ? ` [${rule.prio}]` : '';
                this.repl.platform.printWithNewline(`  ${rule.name}${priority}`);
            }
        }
        return true;
    }

    async showOrEditRule(args, rawArgs) {
        if (args.length === 0) {
            // Enter multiline rule definition mode
            this.repl.platform.printWithNewline("Enter rule definition (end with '.' on a new line):");
            this.repl.multilineMode = true;
            this.repl.multilineBuffer = [];

            // Override multiline completion handler
            const originalProcess = this.repl.processCompleteInput;
            this.repl.processCompleteInput = async (input) => {
                try {
                    const ruleAst = this.repl.parser.parseString(input);
                    this.repl.addRule(ruleAst);
                    this.repl.platform.printWithNewline("Rule added");
                } catch (error) {
                    this.repl.platform.printWithNewline(`Failed to parse rule: ${error.message}`);
                }
                this.repl.processCompleteInput = originalProcess;
                return true;
            };
            return true;
        }

        const name = args[0];

        // Check if this is an inline rule definition
        if (rawArgs.includes('→') || rawArgs.includes('->')) {
            try {
                // Strip the name from the beginning of rawArgs to get just the pattern and replacement
                const ruleText = rawArgs.slice(name.length).trim();
                const ruleAst = this.repl.parser.parseInlineRule(name, ruleText);
                this.repl.addRule(ruleAst);
                this.repl.platform.printWithNewline(`Rule "${name}" added`);
            } catch (error) {
                this.repl.platform.printWithNewline(`Failed to parse rule: ${error.message}`);
            }
            return true;
        }

        // Show specific rule
        const rules = this.repl.getRules();
        const rule = rules.find(r => r.name === name);
        if (rule) {
            // Format rule for display using pretty print
            const lhsStr = this.repl.prettyPrint ?
                this.repl.parser.prettyPrint(rule.lhs, 1) :
                this.repl.parser.nodeToString(rule.lhs);
            const rhsStr = this.repl.prettyPrint ?
                this.repl.parser.prettyPrint(rule.rhs, 1) :
                this.repl.parser.nodeToString(rule.rhs);
            const prioStr = rule.prio !== 0 ? `,\n  ${rule.prio}` : '';
            const guardStr = rule.guard ? `,\n  :guard ${this.repl.prettyPrint ?
                this.repl.parser.prettyPrint(rule.guard, 1) :
                this.repl.parser.nodeToString(rule.guard)}` : '';
            const output = `R("${rule.name}",\n  ${lhsStr},\n  ${rhsStr}${guardStr}${prioStr})`;
            this.repl.platform.printWithNewline(output);
        } else {
            this.repl.platform.printWithNewline(`Rule "${name}" not found`);
        }
        return true;
    }

    async applyRule(args, rawArgs) {
        if (args.length < 2) {
            this.repl.platform.printWithNewline("Usage: :apply <rule-name> <expression>");
            return true;
        }

        const ruleName = args[0];
        const exprText = args.slice(1).join(' ');

        try {
            const expr = this.repl.parser.parseString(exprText);
            const rules = this.repl.getRules();
            const rule = rules.find(r => r.name === ruleName);

            if (!rule) {
                this.repl.platform.printWithNewline(`Rule "${ruleName}" not found`);
                return true;
            }

            // Try to apply the specific rule
            const env = engine.match(rule.lhs, expr);
            if (env) {
                const result = engine.subst(rule.rhs, env);
                const output = this.repl.formatResult(result);
                this.repl.platform.printWithNewline(`→ ${output}`);
            } else {
                this.repl.platform.printWithNewline(`Rule "${ruleName}" does not match expression`);
            }
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }

    async smartExecRule(args, rawArgs) {
        if (args.length < 2) {
            this.repl.platform.printWithNewline("Usage: :exec <rule-name> <expression>");
            return true;
        }

        const ruleName = args[0];
        const exprText = args.slice(1).join(' ');

        try {
            const expr = this.repl.parser.parseString(exprText);
            const rules = this.repl.getRules();
            const rule = rules.find(r => r.name === ruleName);

            if (!rule) {
                this.repl.platform.printWithNewline(`Rule "${ruleName}" not found`);
                return true;
            }

            // Extract the pattern structure from the rule's LHS
            const wrappedExpr = this.wrapExpressionForRule(rule.lhs, expr);

            if (!wrappedExpr) {
                this.repl.platform.printWithNewline(`Cannot adapt expression to match rule pattern`);
                return true;
            }

            // Show what we're doing
            const patternStr = this.repl.formatResult(rule.lhs);
            const wrappedStr = this.repl.formatResult(wrappedExpr);
            this.repl.platform.printWithNewline(`Wrapping to match pattern: ${patternStr}`);
            this.repl.platform.printWithNewline(`Wrapped expression: ${wrappedStr}`);

            // Now just normalize the wrapped expression normally
            const normalized = engine.normalize(wrappedExpr, rules, this.repl.maxSteps, false, foldPrims);
            const output = this.repl.formatResult(normalized);
            this.repl.platform.printWithNewline(`→ ${output}`);
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }

    // Helper to wrap an expression to match a rule's pattern
    wrapExpressionForRule(pattern, expr) {
        // If pattern is a variable, just return the expr
        if (isSym(pattern) && pattern.v.endsWith('_')) {
            return expr;
        }

        // If pattern is a Call, we need to understand its structure
        if (isCall(pattern)) {
            // Check if this is a unary application pattern like {F x_}
            if (pattern.a.length === 1) {
                const arg = pattern.a[0];
                if (isSym(arg) && arg.v.endsWith('_')) {
                    // This is a pattern like {F x_}, wrap expr with F
                    return Call(pattern.h, expr);
                }
            }
            // For more complex patterns, try to match the structure
            // This is a simplified approach - could be enhanced
            return Call(pattern.h, expr);
        }

        // For other cases, return null to indicate we can't wrap
        return null;
    }

    async trace(args, rawArgs) {
        if (args.length === 0) {
            // Toggle trace mode
            this.repl.trace = !this.repl.trace;
            this.repl.platform.printWithNewline(`Trace mode: ${this.repl.trace ? 'on' : 'off'}`);
        } else if (args[0] === 'verbose') {
            // Handle verbose mode toggle or expression
            if (args.length === 1) {
                // Toggle verbose mode
                this.repl.traceVerbose = !this.repl.traceVerbose;
                this.repl.traceDiff = false; // Turn off diff mode when enabling verbose
                this.repl.platform.printWithNewline(`Verbose trace mode: ${this.repl.traceVerbose ? 'on' : 'off'}`);
            } else {
                // Evaluate expression with verbose trace
                const exprText = args.slice(1).join(' ');
                const oldTrace = this.repl.trace;
                const oldVerbose = this.repl.traceVerbose;
                const oldDiff = this.repl.traceDiff;
                this.repl.trace = true;
                this.repl.traceVerbose = true;
                this.repl.traceDiff = false;
                await this.repl.evaluateExpression(exprText);
                this.repl.trace = oldTrace;
                this.repl.traceVerbose = oldVerbose;
                this.repl.traceDiff = oldDiff;
            }
        } else if (args[0] === 'diff') {
            // Handle diff mode toggle or expression
            if (args.length === 1) {
                // Toggle diff mode
                this.repl.traceDiff = !this.repl.traceDiff;
                this.repl.traceVerbose = false; // Turn off verbose mode when enabling diff
                this.repl.platform.printWithNewline(`Diff trace mode: ${this.repl.traceDiff ? 'on' : 'off'}`);
            } else {
                // Evaluate expression with diff trace
                const exprText = args.slice(1).join(' ');
                const oldTrace = this.repl.trace;
                const oldVerbose = this.repl.traceVerbose;
                const oldDiff = this.repl.traceDiff;
                this.repl.trace = true;
                this.repl.traceVerbose = false;
                this.repl.traceDiff = true;
                await this.repl.evaluateExpression(exprText);
                this.repl.trace = oldTrace;
                this.repl.traceVerbose = oldVerbose;
                this.repl.traceDiff = oldDiff;
            }
        } else if (args[0] === 'stats') {
            // Show only statistics
            if (args.length === 1) {
                this.repl.platform.printWithNewline('Usage: :trace stats <expression>');
            } else {
                // Evaluate and show only stats
                const exprText = args.slice(1).join(' ');
                const oldTrace = this.repl.trace;
                this.repl.trace = true;
                this.repl.traceStatsOnly = true; // Special flag for stats-only mode
                await this.repl.evaluateExpression(exprText);
                this.repl.trace = oldTrace;
                this.repl.traceStatsOnly = false;
            }
        } else {
            // Evaluate expression with trace
            const exprText = args.join(' ');
            const oldTrace = this.repl.trace;
            const oldVerbose = this.repl.traceVerbose;
            const oldDiff = this.repl.traceDiff;
            this.repl.trace = true;
            this.repl.traceVerbose = false; // Default trace is non-verbose
            this.repl.traceDiff = false;
            await this.repl.evaluateExpression(exprText);
            this.repl.trace = oldTrace;
            this.repl.traceVerbose = oldVerbose;
            this.repl.traceDiff = oldDiff;
        }
        return true;
    }

    async explainStuck(args, rawArgs) {
        if (args.length === 0) {
            this.repl.platform.printWithNewline("Usage: :why <expression>");
            return true;
        }

        const exprText = args.join(' ');
        try {
            const expr = this.repl.parser.parseString(exprText);
            const rules = this.repl.getRules();

            this.repl.platform.printWithNewline("Checking why expression is stuck...\n");

            let foundCandidates = false;
            for (const rule of rules) {
                // Try partial matching to see how close we are
                const analysis = this.analyzeRuleMatch(rule, expr);
                if (analysis.partial) {
                    foundCandidates = true;
                    this.repl.platform.printWithNewline(`Rule "${rule.name}" partially matches:`);
                    const pattern = this.repl.prettyPrint ?
                        this.repl.parser.prettyPrint(rule.lhs, 1) :
                        this.repl.parser.nodeToString(rule.lhs);
                    this.repl.platform.printWithNewline(`  Pattern:\n    ${pattern}`);
                    this.repl.platform.printWithNewline(`  Issue: ${analysis.reason}`);
                    this.repl.platform.printWithNewline("");
                }
            }

            if (!foundCandidates) {
                this.repl.platform.printWithNewline("No rules come close to matching this expression");
            }
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }

    analyzeRuleMatch(rule, expr) {
        // Simple analysis - check if heads match at least
        const lhs = rule.lhs;

        if (isCall(lhs) && isCall(expr)) {
            if (deq(lhs.h, expr.h)) {
                // Heads match, check arguments
                if (lhs.a.length !== expr.a.length) {
                    return {
                        partial: true,
                        reason: `Argument count mismatch (expected ${lhs.a.length}, got ${expr.a.length})`
                    };
                }
                return {
                    partial: true,
                    reason: `Arguments don't match pattern`
                };
            }
        }

        return { partial: false };
    }

    async applyToState(args, rawArgs) {
        if (args.length === 0) {
            this.repl.platform.printWithNewline("Usage: :apply <action>");
            return true;
        }

        const actionText = args.join(' ');
        try {
            const action = this.repl.parser.parseString(actionText);

            // Try to find a matching rule to get the qualified name
            const rules = this.repl.getRules();
            let qualifiedAction = action;

            // If action is a simple symbol, try to find a rule that matches it
            if (isSym(action)) {
                const actionName = action.v;
                // Look for a rule that ends with this action name
                const matchingRule = rules.find(r => {
                    // Check if rule name ends with the action name
                    // e.g., "Demo/Counter/Inc" ends with "Inc"
                    return r.name.endsWith('/' + actionName) || r.name === actionName;
                });

                if (matchingRule) {
                    // Extract the action symbol from the rule's LHS pattern
                    // The pattern should be {Apply SomeQualifiedName ...}
                    const lhs = matchingRule.lhs;
                    if (isCall(lhs) && isSym(lhs.h) && lhs.h.v === 'Apply') {
                        if (lhs.a.length > 0 && isSym(lhs.a[0])) {
                            qualifiedAction = lhs.a[0];
                            this.repl.platform.printWithNewline(`Using qualified action: ${lhs.a[0].v}`);
                        }
                    }
                }
            }

            await this.repl.applyAction(qualifiedAction);

            // Show the updated program state
            const program = engine.getProgram(this.repl.universe);
            const output = this.repl.formatResult(program);
            this.repl.platform.printWithNewline('Program updated:');
            this.repl.platform.printWithNewline(output);
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }

    async dropRule(args) {
        if (args.length === 0) {
            this.repl.platform.printWithNewline("Usage: :drop <rule-name>");
            return true;
        }

        const name = args[0];
        const rules = this.repl.getRules();
        const exists = rules.some(r => r.name === name);

        if (exists) {
            this.repl.removeRule(name);
            this.repl.platform.printWithNewline(`Rule "${name}" removed`);
        } else {
            this.repl.platform.printWithNewline(`Rule "${name}" not found`);
        }
        return true;
    }

    async editRule(args, rawArgs) {
        if (args.length < 1) {
            this.repl.platform.printWithNewline("Usage: :edit <name> <pattern> → <replacement>");
            return true;
        }

        const name = args[0];
        const ruleText = rawArgs.slice(name.length).trim();

        if (!ruleText.includes('→') && !ruleText.includes('->')) {
            this.repl.platform.printWithNewline("Rule must contain → or ->");
            return true;
        }

        try {
            // Remove old rule if exists
            this.repl.removeRule(name);

            // Add new rule
            const ruleAst = this.repl.parser.parseInlineRule(name, ruleText);
            this.repl.addRule(ruleAst);
            this.repl.platform.printWithNewline(`Rule "${name}" updated`);
        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to parse rule: ${error.message}`);
        }
        return true;
    }

    async undo(args) {
        try {
            this.repl.undo();
            this.repl.platform.printWithNewline("Last modification undone");
        } catch (error) {
            this.repl.platform.printWithNewline(error.message);
        }
        return true;
    }

    async showHistory(args) {
        const count = args[0] ? parseInt(args[0]) : 20;
        const start = Math.max(0, this.repl.history.length - count);
        const slice = this.repl.history.slice(start);

        if (slice.length === 0) {
            this.repl.platform.printWithNewline("No history");
        } else {
            this.repl.platform.printWithNewline(`History (last ${slice.length} entries):`);
            slice.forEach((entry, i) => {
                this.repl.platform.printWithNewline(`  ${start + i + 1}: ${entry}`);
            });
        }
        return true;
    }

    async setOption(args) {
        if (args.length < 2) {
            this.repl.platform.printWithNewline("Usage: :set <option> <value>");
            this.repl.platform.printWithNewline("Available options:");
            this.repl.platform.printWithNewline("  trace on/off       - Enable/disable trace mode");
            this.repl.platform.printWithNewline("  traceverbose on/off - Enable/disable verbose trace mode");
            this.repl.platform.printWithNewline("  tracediff on/off   - Enable/disable diff trace mode");
            this.repl.platform.printWithNewline("  maxsteps <n>       - Maximum normalization steps");
            this.repl.platform.printWithNewline("  prettyprint on/off - Enable/disable pretty printing");
            return true;
        }

        const option = args[0].toLowerCase();
        const value = args.slice(1).join(' ');

        switch (option) {
            case 'trace':
                this.repl.trace = value === 'on' || value === 'true';
                this.repl.platform.printWithNewline(`Trace mode: ${this.repl.trace ? 'on' : 'off'}`);
                break;

            case 'traceverbose':
            case 'trace-verbose':
                this.repl.traceVerbose = value === 'on' || value === 'true';
                if (this.repl.traceVerbose) this.repl.traceDiff = false; // Turn off diff mode
                this.repl.platform.printWithNewline(`Verbose trace mode: ${this.repl.traceVerbose ? 'on' : 'off'}`);
                break;

            case 'tracediff':
            case 'trace-diff':
                this.repl.traceDiff = value === 'on' || value === 'true';
                if (this.repl.traceDiff) this.repl.traceVerbose = false; // Turn off verbose mode
                this.repl.platform.printWithNewline(`Diff trace mode: ${this.repl.traceDiff ? 'on' : 'off'}`);
                break;

            case 'maxsteps':
                const steps = parseInt(value);
                if (isNaN(steps) || steps <= 0) {
                    this.repl.platform.printWithNewline("maxsteps must be a positive integer");
                } else {
                    this.repl.maxSteps = steps;
                    this.repl.platform.printWithNewline(`Max steps set to ${steps}`);
                }
                break;

            case 'prettyprint':
            case 'pretty':
                this.repl.prettyPrint = value === 'on' || value === 'true';
                this.repl.platform.printWithNewline(`Pretty print: ${this.repl.prettyPrint ? 'on' : 'off'}`);
                break;

            default:
                this.repl.platform.printWithNewline(`Unknown option: ${option}`);
        }
        return true;
    }

    async normalizeUniverse(args) {
        try {
            // Save undo state
            this.repl.pushUndo();

            // Get the current Program section
            const program = engine.findSection(this.repl.universe, "Program");

            if (!program) {
                this.repl.platform.printWithNewline("No Program section to normalize");
                return true;
            }

            // Get current rules
            const rules = this.repl.getRules();

            if (rules.length === 0) {
                this.repl.platform.printWithNewline("No rules to apply");
                return true;
            }

            // Normalize the Program
            this.repl.platform.printWithNewline("Normalizing universe...");

            const normalized = engine.normalize(program, rules, this.repl.maxSteps, false, foldPrims);

            // Update the universe with the normalized Program
            if (!isCall(this.repl.universe)) {
                throw new Error("Invalid universe structure");
            }

            // Find and replace the Program section
            for (let i = 0; i < this.repl.universe.a.length; i++) {
                const section = this.repl.universe.a[i];
                if (isCall(section) && isSym(section.h) && section.h.v === "Program") {
                    this.repl.universe.a[i] = normalized;
                    break;
                }
            }

            this.repl.platform.printWithNewline("Universe normalized");

            // Optionally show the normalized program
            if (args.length > 0 && args[0] === 'show') {
                const output = this.repl.formatResult(normalized);
                this.repl.platform.printWithNewline("Normalized Program:");
                this.repl.platform.printWithNewline(output);
            }

            // Wait for any effects generated by normalization
            await this.repl.waitForEffects();
        } catch (error) {
            this.repl.platform.printWithNewline(`Normalization failed: ${error.message}\n`);
        }
        return true;
    }

    async showMacroScopes(args) {
        // Extract MacroScopes section from the universe
        const macroScopesNode = engine.findSection(this.repl.universe, "MacroScopes");

        if (!macroScopesNode || !isCall(macroScopesNode) || macroScopesNode.a.length === 0) {
            this.repl.platform.printWithNewline("No macro scopes defined (modules may not use 'macro' imports)");
            return true;
        }

        this.repl.platform.printWithNewline("Macro Scopes (which modules can use which RuleRules):\n");

        // Each entry is {Module "ModName" {RuleRulesFrom "Mod1" "Mod2" ...}}
        for (const entry of macroScopesNode.a) {
            if (!isCall(entry) || !isSym(entry.h) || entry.h.v !== "Module") continue;
            if (entry.a.length < 2 || !isStr(entry.a[0])) continue;

            const moduleName = entry.a[0].v;
            const ruleRulesFrom = entry.a[1];

            // Special formatting for global scope
            const displayName = moduleName === "*" ? "* (Global - applies to ALL modules)" : moduleName;

            if (!isCall(ruleRulesFrom) || !isSym(ruleRulesFrom.h) ||
                ruleRulesFrom.h.v !== "RuleRulesFrom") continue;

            // Collect the allowed RuleRule source modules
            const allowedModules = [];
            for (const mod of ruleRulesFrom.a) {
                if (isStr(mod)) {
                    allowedModules.push(mod.v);
                }
            }

            if (allowedModules.length > 0) {
                this.repl.platform.printWithNewline(`  ${displayName}:`);
                for (const allowed of allowedModules) {
                    this.repl.platform.printWithNewline(`    - Can use RuleRules from: ${allowed}`);
                }
            } else {
                this.repl.platform.printWithNewline(`  ${displayName}: No RuleRules in scope`);
            }
        }

        // Also show which modules have RuleRules defined
        const ruleRulesNode = engine.findSection(this.repl.universe, "RuleRules");
        if (ruleRulesNode && isCall(ruleRulesNode) && ruleRulesNode.a.length > 0) {
            this.repl.platform.printWithNewline("\nModules with RuleRules defined:");

            const modulesWithRuleRules = new Set();
            for (const taggedRuleRule of ruleRulesNode.a) {
                if (isCall(taggedRuleRule) && isSym(taggedRuleRule.h) &&
                    taggedRuleRule.h.v === "TaggedRuleRule") {
                    if (taggedRuleRule.a.length >= 2 && isStr(taggedRuleRule.a[0])) {
                        modulesWithRuleRules.add(taggedRuleRule.a[0].v);
                    }
                }
            }

            for (const mod of modulesWithRuleRules) {
                this.repl.platform.printWithNewline(`  - ${mod}`);
            }
        }

        return true;
    }

    async showRulesSection(args) {
        const rulesSection = engine.findSection(this.repl.universe, "Rules");
        if (!rulesSection) {
            this.repl.platform.printWithNewline("No Rules section defined in the universe");
            return true;
        }

        this.repl.platform.printWithNewline("Rules Section:");
        const output = this.repl.formatResult(rulesSection);
        this.repl.platform.printWithNewline(output);
        return true;
    }

    async showRuleRulesSection(args) {
        const ruleRulesSection = engine.findSection(this.repl.universe, "RuleRules");
        if (!ruleRulesSection) {
            this.repl.platform.printWithNewline("No RuleRules section defined in the universe");
            return true;
        }

        this.repl.platform.printWithNewline("RuleRules Section:");
        const output = this.repl.formatResult(ruleRulesSection);
        this.repl.platform.printWithNewline(output);
        return true;
    }

    // Helper method to print match results
    printMatchResults(env, rewritePattern, normalizedInfo = null) {
        if (env) {
            // Check if we're in notebook mode
            const isNotebook = this.repl.platform.isNotebook === true;

            if (isNotebook && this.repl.platform.printStructured) {
                // In notebook mode, return structured output with collapsible sections
                const sections = [];

                // Success message (always shown as plain text)
                this.repl.platform.printWithNewline("Pattern matched successfully!");

                // Rewrite result (expanded by default, shown first)
                if (rewritePattern) {
                    const rewritten = engine.subst(rewritePattern, env);
                    const rewrittenStr = this.repl.formatResult(rewritten);
                    sections.push({
                        title: '✨ Rewrite Result',
                        content: rewrittenStr,
                        expanded: true,
                        className: 'rewrite-result'
                    });
                }

                // Normalization info (collapsed by default)
                if (normalizedInfo) {
                    const normContent = `From: ${this.repl.formatResult(normalizedInfo.original)}\nTo:   ${this.repl.formatResult(normalizedInfo.normalized)}`;
                    sections.push({
                        title: '🔄 Normalization',
                        content: normContent,
                        expanded: false,
                        className: 'normalization-info'
                    });
                }

                // Variable bindings (collapsed by default)
                const bindings = Object.keys(env).sort();
                if (bindings.length > 0) {
                    let bindingsContent = '';
                    for (const varName of bindings) {
                        const value = env[varName];
                        if (Array.isArray(value)) {
                            bindingsContent += `${varName}... = [\n`;
                            for (const item of value) {
                                const itemStr = this.repl.formatResult(item);
                                const indented = itemStr.split('\n').map(line => '  ' + line).join('\n');
                                bindingsContent += indented + '\n';
                            }
                            bindingsContent += ']\n\n';
                        } else {
                            const valueStr = this.repl.formatResult(value);
                            if (valueStr.includes('\n')) {
                                bindingsContent += `${varName}_ =\n`;
                                const indented = valueStr.split('\n').map(line => '  ' + line).join('\n');
                                bindingsContent += indented + '\n\n';
                            } else {
                                bindingsContent += `${varName}_ = ${valueStr}\n\n`;
                            }
                        }
                    }

                    sections.push({
                        title: `📎 Variable Bindings (${bindings.length})`,
                        content: bindingsContent.trim(),
                        expanded: false,
                        className: 'variable-bindings'
                    });
                }

                // Send ALL sections as a single accordion output
                if (sections.length > 0) {
                    this.repl.platform.printStructured({
                        type: 'accordion',
                        sections: sections
                    });
                } else {
                    // No special sections to show (shouldn't happen if match succeeded)
                    this.repl.platform.printWithNewline("(No additional details to show)");
                }

            } else {
                // Regular REPL mode - print everything as before
                this.repl.platform.printWithNewline("Pattern matched successfully!\n");

                // If rewritePattern is provided, show the result FIRST (this is what user cares about)
                if (rewritePattern) {
                    this.repl.platform.printWithNewline("Rewrite result:");
                    const rewritten = engine.subst(rewritePattern, env);
                    const rewrittenStr = this.repl.formatResult(rewritten);
                    this.repl.platform.printWithNewline(rewrittenStr);
                    this.repl.platform.printWithNewline("");
                }

                // If we normalized the target, show that info (as supporting detail)
                if (normalizedInfo) {
                    this.repl.platform.printWithNewline("Target was normalized:");
                    this.repl.platform.printWithNewline(`  From: ${this.repl.formatResult(normalizedInfo.original)}`);
                    this.repl.platform.printWithNewline(`  To:   ${this.repl.formatResult(normalizedInfo.normalized)}`);
                    this.repl.platform.printWithNewline("");
                }

                // Show all bindings (these are the details)
                const bindings = Object.keys(env).sort();
                if (bindings.length === 0) {
                    this.repl.platform.printWithNewline("No variable bindings (pattern matched exactly)");
                } else {
                    this.repl.platform.printWithNewline("Matched bindings:");
                    for (const varName of bindings) {
                        const value = env[varName];

                        // Handle VarRest bindings (arrays)
                        if (Array.isArray(value)) {
                            this.repl.platform.printWithNewline(`\n${varName}... = [`);
                            for (const item of value) {
                                const itemStr = this.repl.formatResult(item);
                                // Indent array items
                                const indented = itemStr.split('\\n').map(line => '  ' + line).join('\\n');
                                this.repl.platform.printWithNewline(indented);
                            }
                            this.repl.platform.printWithNewline(`]`);
                        } else {
                            // Regular variable binding
                            const valueStr = this.repl.formatResult(value);

                            // If the value is multiline, show it on the next line
                            if (valueStr.includes('\\n')) {
                                this.repl.platform.printWithNewline(`\n${varName}_ =`);
                                // Indent the value
                                const indented = valueStr.split('\\n').map(line => '  ' + line).join('\\n');
                                this.repl.platform.printWithNewline(indented);
                            } else {
                                this.repl.platform.printWithNewline(`\n${varName}_ = ${valueStr}`);
                            }
                        }
                    }
                }
            }
            return true;
        }
        return false;
    }

    async matchPattern(args, rawArgs) {
        // Check if entering multiline mode
        if (rawArgs.trim() === '') {
            // Enter multiline match mode
            this.repl.platform.printWithNewline("Enter multiline match (end with ':end'):");
            this.repl.platform.printWithNewline("  Pattern expression...");
            this.repl.platform.printWithNewline("  [:rewrite");
            this.repl.platform.printWithNewline("    Replacement expression...]");
            this.repl.platform.printWithNewline("  [:target or :norm or :universe");
            this.repl.platform.printWithNewline("    Target expression... (or :universe to match/rewrite the universe)]");
            this.repl.platform.printWithNewline("  :end");

            this.repl.multilineMode = true;
            this.repl.multilineBuffer = [];

            // Override multiline completion handler for match mode
            const originalProcess = this.repl.processCompleteInput;
            this.repl.processCompleteInput = async (input) => {
                // Check if this is the :end marker
                if (input.trim() === ':end') {
                    // Process the collected multiline match
                    this.repl.multilineMode = false;
                    const fullInput = this.repl.multilineBuffer.join('\n');
                    this.repl.multilineBuffer = [];
                    this.repl.processCompleteInput = originalProcess;

                    // Process as a match command with the collected input
                    return await this.matchPattern(['multiline'], fullInput);
                } else {
                    // Continue collecting lines
                    this.repl.multilineBuffer.push(input);
                    return true;
                }
            };
            return true;
        }

        if (args.length === 0 && rawArgs.trim() !== '') {
            // Show help if called with empty args but has rawArgs (shouldn't happen normally)
            args = ['help'];
        }

        if (args[0] === 'help') {
            this.repl.platform.printWithNewline("Usage: :match [<pattern> [:rewrite <replacement>] [:target/:norm/:universe <expression>]]");
            this.repl.platform.printWithNewline("\nMultiline mode:");
            this.repl.platform.printWithNewline("  :match                          - Enter multiline mode");
            this.repl.platform.printWithNewline("  {Complex Pattern}");
            this.repl.platform.printWithNewline("  :rewrite                        - Optional rewrite clause");
            this.repl.platform.printWithNewline("  {Complex Replacement}");
            this.repl.platform.printWithNewline("  :target                         - Target expression");
            this.repl.platform.printWithNewline("  {Complex Target}");
            this.repl.platform.printWithNewline("  :norm                           - Target expression (normalized)");
            this.repl.platform.printWithNewline("  {Expression to normalize}");
            this.repl.platform.printWithNewline("  :universe                       - Match/rewrite the universe itself");
            this.repl.platform.printWithNewline("  :end                            - End multiline input");
            this.repl.platform.printWithNewline("\nInline examples:");
            this.repl.platform.printWithNewline("  :match {Program p_}                    - Match against universe");
            this.repl.platform.printWithNewline("  :match {F x_ y_} :target {F 1 2}      - Match against expression");
            this.repl.platform.printWithNewline("  :match result_ :norm {+ 1 2}          - Match normalized expression");
            this.repl.platform.printWithNewline("  :match {F x_ y_} :rewrite {G y_ x_} :target {F 1 2}  - Rewrite with bindings");
            this.repl.platform.printWithNewline("  :match {Universe {Program p_} r...} :rewrite {Universe {Program {Modified p_}} r...} :universe");
            this.repl.platform.printWithNewline("                                         - Rewrite the universe structure");
            this.repl.platform.printWithNewline("\nPattern syntax:");
            this.repl.platform.printWithNewline("  x_    - Variable (matches any single expression)");
            this.repl.platform.printWithNewline("  x...  - Rest variable (matches zero or more expressions)");
            this.repl.platform.printWithNewline("  _     - Wildcard (matches anything without binding)");
            this.repl.platform.printWithNewline("\nNote: The :rewrite clause can be easily copied to create rules!");
            this.repl.platform.printWithNewline("      When matching against universe (no :target/:norm), automatically wraps in Universe[...]");
            return true;
        }

        try {
            // In multiline mode, rawArgs contains the full collected multiline input
            // We need to split it by section markers that appear at the start of lines
            if (args[0] === 'multiline') {
                // Split the multiline input by section markers
                const lines = rawArgs.split('\n');
                let currentSection = 'pattern';
                let sections = { pattern: [], rewrite: null, target: null, norm: null, universe: false };

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed === ':rewrite') {
                        currentSection = 'rewrite';
                        sections.rewrite = [];
                    } else if (trimmed === ':target') {
                        currentSection = 'target';
                        sections.target = [];
                    } else if (trimmed === ':norm') {
                        currentSection = 'norm';
                        sections.norm = [];
                    } else if (trimmed === ':universe') {
                        currentSection = 'universe';
                        sections.universe = true;
                    } else if (currentSection && currentSection !== 'universe' && sections[currentSection] !== null) {
                        sections[currentSection].push(line);
                    }
                }

                // Join each section and parse
                let pattern, target, rewritePattern = null, matchAgainstUniverse = true;
                let shouldNormalize = false;
                let rewriteUniverse = false;

                // Parse pattern (required)
                const patternText = sections.pattern.join('\n').trim();
                if (!patternText) {
                    this.repl.platform.printWithNewline("Error: Pattern is required");
                    return true;
                }
                pattern = this.repl.parser.parseString(patternText);

                // Parse rewrite if present
                if (sections.rewrite) {
                    const rewriteText = sections.rewrite.join('\n').trim();
                    if (!rewriteText) {
                        this.repl.platform.printWithNewline("Error: Rewrite replacement is required after :rewrite");
                        return true;
                    }
                    rewritePattern = this.repl.parser.parseString(rewriteText);
                }

                // Parse target or norm or universe if present
                if (sections.universe) {
                    // :universe mode - match/rewrite against a section of the universe
                    // Determine which section to target based on the pattern
                    if (isCall(pattern) && isSym(pattern.h)) {
                        const patternHead = pattern.h.v;

                        if (patternHead === 'Program') {
                            // Match against the Program section
                            target = engine.getProgram(this.repl.universe);
                        } else if (patternHead === 'Rules' || patternHead === 'RuleRules' || patternHead === 'MacroScopes') {
                            // Match against the specific section
                            const section = this.repl.universe.a.find(s =>
                                isCall(s) && isSym(s.h) && s.h.v === patternHead
                            );
                            target = section || { k: 'Call', h: { k: 'Sym', v: patternHead }, a: [] };
                        } else if (patternHead === 'Universe') {
                            // Match against the entire universe
                            target = this.repl.universe;
                        } else {
                            // Default: try matching against Program
                            target = engine.getProgram(this.repl.universe);
                        }
                    } else {
                        // Default: match against Program if pattern doesn't specify section
                        target = engine.getProgram(this.repl.universe);
                    }
                    matchAgainstUniverse = false;
                    rewriteUniverse = true;
                } else if (sections.target) {
                    const targetText = sections.target.join('\n').trim();
                    if (!targetText) {
                        this.repl.platform.printWithNewline("Error: Target expression is required after :target");
                        return true;
                    }
                    target = this.repl.parser.parseString(targetText);
                    matchAgainstUniverse = false;
                } else if (sections.norm) {
                    const targetText = sections.norm.join('\n').trim();
                    if (!targetText) {
                        this.repl.platform.printWithNewline("Error: Expression is required after :norm");
                        return true;
                    }
                    const targetExpr = this.repl.parser.parseString(targetText);

                    // Normalize the expression (but don't print yet - wait until after match)
                    const rules = this.repl.getRules();
                    if (this.repl.trace) {
                        const { result: normalized, trace } = engine.normalizeWithTrace(
                            targetExpr,
                            rules,
                            this.repl.maxSteps,
                            false,
                            foldPrims
                        );
                        target = normalized;
                        if (trace.length > 0) {
                            this.repl.platform.printWithNewline(`Normalizing... applied ${trace.length} steps\n`);
                        }
                    } else {
                        target = engine.normalize(targetExpr, rules, this.repl.maxSteps, false, foldPrims);
                    }

                    matchAgainstUniverse = false;
                    shouldNormalize = { original: targetExpr, normalized: target };
                } else {
                    // No target/norm specified, match against universe
                    // Process pattern for universe matching
                    const fragments = [];
                    let depth = 0;
                    let start = 0;

                    for (let i = 0; i < patternText.length; i++) {
                        const char = patternText[i];
                        if (char === '{' || char === '(') depth++;
                        else if (char === '}' || char === ')') depth--;
                        else if (char === ' ' && depth === 0) {
                            const fragment = patternText.substring(start, i).trim();
                            if (fragment) fragments.push(fragment);
                            start = i + 1;
                        }
                    }
                    const lastFragment = patternText.substring(start).trim();
                    if (lastFragment) fragments.push(lastFragment);

                    const hasRestPattern = fragments.length > 0 &&
                                           fragments[fragments.length - 1].endsWith('...');

                    let needsPrefixRest = false;
                    if (fragments.length > 0) {
                        const firstFragment = fragments[0];
                        if (firstFragment.startsWith('{') && !firstFragment.startsWith('{Program')) {
                            needsPrefixRest = true;
                        }
                    }

                    const innerPattern = needsPrefixRest ?
                        `... ${fragments.join(' ')}` :
                        fragments.join(' ');

                    const fullPatternText = hasRestPattern ?
                        `{Universe ${innerPattern}}` :
                        `{Universe ${innerPattern} ...}`;
                    pattern = this.repl.parser.parseString(fullPatternText);
                    target = this.repl.universe;
                }

                // Now perform the match with the parsed sections
                const env = engine.match(pattern, target);

                // If we're rewriting the universe and the match succeeded
                if (rewriteUniverse && env && rewritePattern) {
                    // Save undo state
                    this.repl.pushUndo();

                    // Apply the rewrite
                    const rewritten = engine.subst(rewritePattern, env);

                    // Determine which section we matched against based on the pattern
                    let matchedSection = 'Program'; // Default
                    if (isCall(pattern) && isSym(pattern.h)) {
                        matchedSection = pattern.h.v;
                    }

                    // Now update the appropriate section with the rewritten result
                    if (matchedSection === 'Program') {
                        // When matching against Program, the rewrite result IS the new program content
                        // We need to preserve the Program wrapper
                        const currentProgram = engine.getProgram(this.repl.universe);
                        if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === 'Program') {
                            // If rewrite produced a full Program node, use it directly
                            this.repl.universe = engine.setProgram(this.repl.universe, rewritten);
                        } else {
                            // Otherwise, wrap the result as the new Program content
                            // Preserve EffQueue and Effects from the original program
                            const effQueue = currentProgram.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'EffQueue');
                            const effects = currentProgram.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'Effects');
                            const newProgram = {
                                k: 'Call',
                                h: { k: 'Sym', v: 'Program' },
                                a: [
                                    effQueue || { k: 'Call', h: { k: 'Sym', v: 'EffQueue' }, a: [] },
                                    effects || { k: 'Call', h: { k: 'Sym', v: 'Effects' }, a: [
                                        { k: 'Call', h: { k: 'Sym', v: 'Pending' }, a: [] },
                                        { k: 'Call', h: { k: 'Sym', v: 'Inbox' }, a: [] }
                                    ]},
                                    rewritten
                                ]
                            };
                            this.repl.universe = engine.setProgram(this.repl.universe, newProgram);
                        }
                    } else if (matchedSection === 'Rules' || matchedSection === 'RuleRules' || matchedSection === 'MacroScopes') {
                        // For other sections, replace them directly
                        const universeIndex = this.repl.universe.a.findIndex(n =>
                            isCall(n) && isSym(n.h) && n.h.v === matchedSection
                        );
                        if (universeIndex !== -1) {
                            // Check if rewrite produced a full section node
                            if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === matchedSection) {
                                this.repl.universe.a[universeIndex] = rewritten;
                            } else {
                                // Wrap the result in the section
                                this.repl.universe.a[universeIndex] = {
                                    k: 'Call',
                                    h: { k: 'Sym', v: matchedSection },
                                    a: Array.isArray(rewritten.a) ? rewritten.a : [rewritten]
                                };
                            }
                        } else {
                            // Add new section
                            if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === matchedSection) {
                                this.repl.universe.a.push(rewritten);
                            } else {
                                this.repl.universe.a.push({
                                    k: 'Call',
                                    h: { k: 'Sym', v: matchedSection },
                                    a: Array.isArray(rewritten.a) ? rewritten.a : [rewritten]
                                });
                            }
                        }
                    } else if (matchedSection === 'Universe') {
                        // If we matched the entire universe, replace it entirely
                        if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === 'Universe') {
                            this.repl.universe = rewritten;
                        } else {
                            // This shouldn't happen, but handle it gracefully
                            this.repl.platform.printWithNewline("Error: Rewrite result is not a valid Universe");
                        }
                    } else {
                        // Unknown section - try to handle gracefully
                        this.repl.platform.printWithNewline(`Warning: Unknown section type: ${matchedSection}`);
                    }

                    // Apply RuleRules to transform the Universe permanently
                    this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);

                    this.repl.platform.printWithNewline("Universe successfully rewritten!");
                    this.repl.platform.printWithNewline("\nNew universe:");
                    const output = this.repl.formatResult(this.repl.universe);
                    this.repl.platform.printWithNewline(output);
                    return true;
                }

                // Use helper method to print results (pass normalization info if applicable)
                const normalizedInfo = (typeof shouldNormalize === 'object') ? shouldNormalize : null;
                if (this.printMatchResults(env, rewritePattern, normalizedInfo)) {
                    // Match succeeded, results printed
                } else {
                    this.repl.platform.printWithNewline("Pattern did not match");

                    // If we normalized, show what we tried to match against
                    if (normalizedInfo) {
                        this.repl.platform.printWithNewline("\nTarget was normalized:");
                        this.repl.platform.printWithNewline(`  From: ${this.repl.formatResult(normalizedInfo.original)}`);
                        this.repl.platform.printWithNewline(`  To:   ${this.repl.formatResult(normalizedInfo.normalized)}`);
                    }

                    // Provide helpful hints based on the matching context
                    if (matchAgainstUniverse) {
                        // ... (existing universe matching hints)
                        if (isCall(pattern) && pattern.a.length > 0) {
                            const universeSections = [];
                            for (const section of this.repl.universe.a) {
                                if (isCall(section) && isSym(section.h)) {
                                    universeSections.push(section.h.v);
                                }
                            }
                            if (universeSections.length > 0) {
                                this.repl.platform.printWithNewline(`\nAvailable sections in universe: ${universeSections.join(', ')}`);
                            }
                        }
                    } else {
                        this.repl.platform.printWithNewline("\nPattern structure:");
                        const patternStr = this.repl.formatResult(pattern);
                        this.repl.platform.printWithNewline(patternStr);

                        this.repl.platform.printWithNewline("\nTarget structure:");
                        const targetStr = this.repl.formatResult(target);
                        this.repl.platform.printWithNewline(targetStr);
                    }
                }

                return true;
            }

            // Regular (non-multiline) mode processing
            // Check for all possible markers and their positions
            const targetMarker = ':target';
            const normMarker = ':norm';
            const rewriteMarker = ':rewrite';
            const universeMarker = ':universe';
            const targetIndex = rawArgs.indexOf(targetMarker);
            const normIndex = rawArgs.indexOf(normMarker);
            const rewriteIndex = rawArgs.indexOf(rewriteMarker);
            const universeIndex = rawArgs.indexOf(universeMarker);

            let pattern, target, rewritePattern = null, matchAgainstUniverse = true;
            let shouldNormalize = false;
            let rewriteUniverse = false;

            // Parse the pattern first - it's always at the beginning
            let patternEndPos = rawArgs.length;
            if (rewriteIndex !== -1) patternEndPos = Math.min(patternEndPos, rewriteIndex);
            if (targetIndex !== -1) patternEndPos = Math.min(patternEndPos, targetIndex);
            if (normIndex !== -1) patternEndPos = Math.min(patternEndPos, normIndex);
            if (universeIndex !== -1) patternEndPos = Math.min(patternEndPos, universeIndex);

            const patternText = rawArgs.substring(0, patternEndPos).trim();
            if (!patternText) {
                this.repl.platform.printWithNewline("Error: Pattern is required");
                return true;
            }

            // Check if we have a :rewrite clause and extract it
            if (rewriteIndex !== -1) {
                let rewriteEndPos = rawArgs.length;
                if (targetIndex > rewriteIndex) rewriteEndPos = targetIndex;
                if (normIndex > rewriteIndex) rewriteEndPos = Math.min(rewriteEndPos, normIndex);
                if (universeIndex > rewriteIndex) rewriteEndPos = Math.min(rewriteEndPos, universeIndex);

                const rewriteText = rawArgs.substring(rewriteIndex + rewriteMarker.length, rewriteEndPos).trim();
                if (!rewriteText) {
                    this.repl.platform.printWithNewline("Error: Rewrite replacement is required after :rewrite");
                    return true;
                }
                rewritePattern = this.repl.parser.parseString(rewriteText);
            }

            if (universeIndex !== -1) {
                // :universe mode - match/rewrite against a section of the universe
                pattern = this.repl.parser.parseString(patternText);

                // Determine which section to target based on the pattern
                if (isCall(pattern) && isSym(pattern.h)) {
                    const patternHead = pattern.h.v;

                    if (patternHead === 'Program') {
                        // Match against the Program section
                        target = engine.getProgram(this.repl.universe);
                    } else if (patternHead === 'Rules' || patternHead === 'RuleRules' || patternHead === 'MacroScopes') {
                        // Match against the specific section
                        const section = this.repl.universe.a.find(s =>
                            isCall(s) && isSym(s.h) && s.h.v === patternHead
                        );
                        target = section || { k: 'Call', h: { k: 'Sym', v: patternHead }, a: [] };
                    } else if (patternHead === 'Universe') {
                        // Match against the entire universe
                        target = this.repl.universe;
                    } else {
                        // Default: try matching against Program
                        target = engine.getProgram(this.repl.universe);
                    }
                } else {
                    // Default: match against Program if pattern doesn't specify section
                    target = engine.getProgram(this.repl.universe);
                }

                matchAgainstUniverse = false; // We're explicitly targeting a section
                rewriteUniverse = true; // Flag to indicate we should update universe with rewrite result
            } else if (targetIndex !== -1 && (normIndex === -1 || targetIndex < normIndex)) {
                // :target mode - use expression as-is
                const targetText = rawArgs.substring(targetIndex + targetMarker.length).trim();

                if (!targetText) {
                    this.repl.platform.printWithNewline("Error: Target expression is required after :target");
                    return true;
                }

                // Parse pattern and target
                pattern = this.repl.parser.parseString(patternText);
                target = this.repl.parser.parseString(targetText);
                matchAgainstUniverse = false;
            } else if (normIndex !== -1) {
                // :norm mode - normalize expression before matching
                const targetText = rawArgs.substring(normIndex + normMarker.length).trim();

                if (!targetText) {
                    this.repl.platform.printWithNewline("Error: Target expression is required after :norm");
                    return true;
                }

                // Parse pattern and target
                pattern = this.repl.parser.parseString(patternText);
                const targetExpr = this.repl.parser.parseString(targetText);

                // Normalize the target expression using current rules (but don't display yet)
                const rules = this.repl.getRules();

                if (this.repl.trace) {
                    // If trace is on, show minimal normalization info
                    const { result: normalized, trace } = engine.normalizeWithTrace(
                        targetExpr,
                        rules,
                        this.repl.maxSteps,
                        false,
                        foldPrims
                    );
                    target = normalized;

                    if (trace.length > 0) {
                        this.repl.platform.printWithNewline(`Normalizing... applied ${trace.length} steps\n`);
                    }
                } else {
                    target = engine.normalize(targetExpr, rules, this.repl.maxSteps, false, foldPrims);
                }

                matchAgainstUniverse = false;
                shouldNormalize = { original: targetExpr, normalized: target };
            } else {
                // No :target or :norm, match against universe (existing behavior)
                // patternText was already extracted above

                // Parse as multiple expressions (space-separated patterns inside Universe)
                // This allows patterns like: :match {Program p_} {Rules r_} rest...
                const fragments = [];
                let depth = 0;
                let start = 0;

                // Simple parser to split on spaces at depth 0
                for (let i = 0; i < patternText.length; i++) {
                    const char = patternText[i];
                    if (char === '{' || char === '(') depth++;
                    else if (char === '}' || char === ')') depth--;
                    else if (char === ' ' && depth === 0) {
                        const fragment = patternText.substring(start, i).trim();
                        if (fragment) fragments.push(fragment);
                        start = i + 1;
                    }
                }
                // Add the last fragment
                const lastFragment = patternText.substring(start).trim();
                if (lastFragment) fragments.push(lastFragment);

                // Check if the last fragment is already a rest pattern (ends with ...)
                const hasRestPattern = fragments.length > 0 &&
                                       fragments[fragments.length - 1].endsWith('...');

                // Check if the first fragment is NOT Program and doesn't start with underscore/variable
                // If so, prepend ... to skip preceding sections
                let needsPrefixRest = false;
                if (fragments.length > 0) {
                    const firstFragment = fragments[0];
                    // Check if it's a Call pattern that doesn't start with Program
                    if (firstFragment.startsWith('{') && !firstFragment.startsWith('{Program')) {
                        needsPrefixRest = true;
                    }
                }

                // Build the full Universe pattern
                const innerPattern = needsPrefixRest ?
                    `... ${fragments.join(' ')}` :
                    fragments.join(' ');

                // If user didn't specify a rest pattern at the end, add ... to match remaining sections
                const fullPatternText = hasRestPattern ?
                    `{Universe ${innerPattern}}` :
                    `{Universe ${innerPattern} ...}`;
                pattern = this.repl.parser.parseString(fullPatternText);
                target = this.repl.universe;
            }

            // Perform the match
            const env = engine.match(pattern, target);

            // If we're rewriting the universe and the match succeeded
            if (rewriteUniverse && env && rewritePattern) {
                // Save undo state
                this.repl.pushUndo();

                // Apply the rewrite
                const rewritten = engine.subst(rewritePattern, env);

                // Determine which section we matched against based on the pattern
                let matchedSection = 'Program'; // Default
                if (isCall(pattern) && isSym(pattern.h)) {
                    matchedSection = pattern.h.v;
                }

                // Now update the appropriate section with the rewritten result
                if (matchedSection === 'Program') {
                    // When matching against Program, the rewrite result IS the new program content
                    // We need to preserve the Program wrapper
                    const currentProgram = engine.getProgram(this.repl.universe);
                    if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === 'Program') {
                        // If rewrite produced a full Program node, use it directly
                        this.repl.universe = engine.setProgram(this.repl.universe, rewritten);
                    } else {
                        // Otherwise, wrap the result as the new Program content
                        // Preserve EffQueue and Effects from the original program
                        const effQueue = currentProgram.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'EffQueue');
                        const effects = currentProgram.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'Effects');
                        const newProgram = {
                            k: 'Call',
                            h: { k: 'Sym', v: 'Program' },
                            a: [
                                effQueue || { k: 'Call', h: { k: 'Sym', v: 'EffQueue' }, a: [] },
                                effects || { k: 'Call', h: { k: 'Sym', v: 'Effects' }, a: [
                                    { k: 'Call', h: { k: 'Sym', v: 'Pending' }, a: [] },
                                    { k: 'Call', h: { k: 'Sym', v: 'Inbox' }, a: [] }
                                ]},
                                rewritten
                            ]
                        };
                        this.repl.universe = engine.setProgram(this.repl.universe, newProgram);
                    }
                } else if (matchedSection === 'Rules' || matchedSection === 'RuleRules' || matchedSection === 'MacroScopes') {
                    // For other sections, replace them directly
                    const universeIndex = this.repl.universe.a.findIndex(n =>
                        isCall(n) && isSym(n.h) && n.h.v === matchedSection
                    );
                    if (universeIndex !== -1) {
                        // Check if rewrite produced a full section node
                        if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === matchedSection) {
                            this.repl.universe.a[universeIndex] = rewritten;
                        } else {
                            // Wrap the result in the section
                            this.repl.universe.a[universeIndex] = {
                                k: 'Call',
                                h: { k: 'Sym', v: matchedSection },
                                a: Array.isArray(rewritten.a) ? rewritten.a : [rewritten]
                            };
                        }
                    } else {
                        // Add new section
                        if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === matchedSection) {
                            this.repl.universe.a.push(rewritten);
                        } else {
                            this.repl.universe.a.push({
                                k: 'Call',
                                h: { k: 'Sym', v: matchedSection },
                                a: Array.isArray(rewritten.a) ? rewritten.a : [rewritten]
                            });
                        }
                    }
                } else if (matchedSection === 'Universe') {
                    // If we matched the entire universe, replace it entirely
                    if (isCall(rewritten) && isSym(rewritten.h) && rewritten.h.v === 'Universe') {
                        this.repl.universe = rewritten;
                    } else {
                        // This shouldn't happen, but handle it gracefully
                        this.repl.platform.printWithNewline("Error: Rewrite result is not a valid Universe");
                    }
                } else {
                    // Unknown section - try to handle gracefully
                    this.repl.platform.printWithNewline(`Warning: Unknown section type: ${matchedSection}`);
                }

                // Apply RuleRules to transform the Universe permanently
                this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);

                this.repl.platform.printWithNewline("Universe successfully rewritten!");
                this.repl.platform.printWithNewline("\nNew universe:");
                const output = this.repl.formatResult(this.repl.universe);
                this.repl.platform.printWithNewline(output);
                return true;
            }

            // Use helper method to print results (pass normalization info if applicable)
            const normalizedInfo = (typeof shouldNormalize === 'object') ? shouldNormalize : null;
            if (!this.printMatchResults(env, rewritePattern, normalizedInfo)) {
                this.repl.platform.printWithNewline("Pattern did not match");

                // If we normalized, show what we tried to match against
                if (normalizedInfo) {
                    this.repl.platform.printWithNewline("\nTarget was normalized:");
                    this.repl.platform.printWithNewline(`  From: ${this.repl.formatResult(normalizedInfo.original)}`);
                    this.repl.platform.printWithNewline(`  To:   ${this.repl.formatResult(normalizedInfo.normalized)}`);
                }

                // Try to give a helpful hint about why it didn't match
                if (matchAgainstUniverse) {
                    // When matching against universe, check the inner patterns
                    if (isCall(pattern) && pattern.a.length > 0) {
                        // Show what sections are actually in the universe
                        const universeSections = [];
                        for (const section of this.repl.universe.a) {
                            if (isCall(section) && isSym(section.h)) {
                                universeSections.push(section.h.v);
                            }
                        }

                        if (universeSections.length > 0) {
                            this.repl.platform.printWithNewline(`\nAvailable sections in universe: ${universeSections.join(', ')}`);
                        }

                        // Check if the user is trying to match a non-existent section
                        const firstPattern = pattern.a[0];
                        if (isCall(firstPattern) && isSym(firstPattern.h)) {
                            const sectionName = firstPattern.h.v;
                            if (!universeSections.includes(sectionName)) {
                                this.repl.platform.printWithNewline(`\nHint: Section "${sectionName}" not found in universe`);
                            }
                        }
                    }
                } else {
                    // When matching against arbitrary target, show what we're trying to match
                    this.repl.platform.printWithNewline("\nPattern structure:");
                    const patternStr = this.repl.formatResult(pattern);
                    this.repl.platform.printWithNewline(patternStr);

                    this.repl.platform.printWithNewline("\nTarget structure:");
                    const targetStr = this.repl.formatResult(target);
                    this.repl.platform.printWithNewline(targetStr);

                    // Basic structure comparison
                    if (isCall(pattern) && !isCall(target)) {
                        this.repl.platform.printWithNewline("\nHint: Pattern expects a Call expression but target is not");
                    } else if (isCall(pattern) && isCall(target)) {
                        if (!deq(pattern.h, target.h)) {
                            const patternHead = isSym(pattern.h) ? pattern.h.v : this.repl.formatResult(pattern.h);
                            const targetHead = isSym(target.h) ? target.h.v : this.repl.formatResult(target.h);
                            this.repl.platform.printWithNewline(`\nHint: Heads don't match - pattern has "${patternHead}", target has "${targetHead}"`);
                        } else if (pattern.a.length !== target.a.length) {
                            // Check if pattern uses rest variables
                            const hasRest = pattern.a.some(arg => isSym(arg) && arg.v.endsWith('...'));
                            if (!hasRest) {
                                this.repl.platform.printWithNewline(`\nHint: Argument count mismatch - pattern expects ${pattern.a.length}, target has ${target.a.length}`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.repl.platform.printWithNewline(`Error: ${error.message}`);
        }
        return true;
    }
}
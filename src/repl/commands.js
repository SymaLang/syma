/*****************************************************************
 * REPL Command Processor
 *
 * Handles all colon-prefixed commands in the REPL
 ******************************************************************/

import { Sym, Str, Num, Call, isSym, isCall, isStr, isNum, deq } from '../ast-helpers.js';
import * as engine from '../core/engine.js';
import { foldPrims } from '../primitives.js';

export class CommandProcessor {
    constructor(repl) {
        this.repl = repl;
        this.commands = {
            'help': this.help.bind(this),
            'h': this.help.bind(this),
            'quit': this.quit.bind(this),
            'q': this.quit.bind(this),
            'exit': this.quit.bind(this),
            'save': this.save.bind(this),
            'load': this.load.bind(this),
            'bundle': this.bundle.bind(this),
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
  :bundle <file>            Bundle module and dependencies into universe
  :export <module>          Export single module to file
  :import <file>            Import module and dependencies into current universe

Universe management:
  :clear                    Reset universe to empty state
  :universe, :u             Show current universe (pretty printed)
  :undo                     Undo last modification
  :program                  Show current Program section

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
  :why <expr>               Explain why evaluation got stuck
  :apply <action>           Apply action to current universe state
  :norm [show]              Normalize the universe Program section

Settings:
  :set <option> <value>     Set REPL option
    trace on/off            Enable/disable automatic tracing
    maxsteps <n>            Set maximum normalization steps

History:
  :history [n]              Show last n history entries (default: 20)
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

            // Give effects processor a moment to process any pending effects
            await new Promise(resolve => this.repl.platform.setTimeout(resolve, 50));
        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to load: ${error.message}`);
        }
        return true;
    }

    async bundle(args, rawArgs) {
        if (args.length === 0) {
            this.repl.platform.printWithNewline("Usage: :bundle <module-file>");
            this.repl.platform.printWithNewline("Example: :bundle src/modules/app-main.syma");
            return true;
        }

        const filename = args[0];
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
            this.repl.universe = engine.enrichProgramWithEffects(this.repl.universe);
            // Apply RuleRules to transform the Universe permanently
            this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);

            this.repl.platform.printWithNewline(`Module ${moduleName} bundled and loaded successfully\n`);
            this.repl.platform.printWithNewline(`Found ${allFiles.length} module files\n`);

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
        const filename = args[0];
        // Note: 'open' parameter doesn't make sense for :import since we're not in a module context
        // All imports are effectively added to the global namespace

        if (!filename) {
            this.repl.platform.printWithNewline("Usage: :import <filename>");
            this.repl.platform.printWithNewline("Note: Imports a module and its dependencies into the current universe");
            return true;
        }

        try {
            // Use child_process to run the compiler (same as :bundle)
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

            this.repl.platform.printWithNewline(`Importing module ${moduleName}...`);

            // Run the compiler in library mode (no Program section required)
            // The compiler will handle dependency resolution automatically
            const command = `node bin/syma-compile.js ${filename} --library`;
            const result = execSync(command, { encoding: 'utf8', cwd: process.cwd() });

            // Parse the resulting Universe
            const compiledUniverse = JSON.parse(result);

            // Now merge the compiled universe into our current one
            this.mergeUniverses(compiledUniverse, moduleName);

            // Apply RuleRules to transform the Universe permanently after merge
            this.repl.universe = engine.applyRuleRules(this.repl.universe, foldPrims);

            this.repl.platform.printWithNewline(`Module ${moduleName} imported successfully`);

            // Show what was imported
            const importedRules = engine.extractRules(compiledUniverse);
            this.repl.platform.printWithNewline(`Added ${importedRules.length} rules from ${moduleName} and its dependencies`);

        } catch (error) {
            this.repl.platform.printWithNewline(`Failed to import: ${error.message}`);
            if (error.stderr) {
                this.repl.platform.printWithNewline(`Compiler error: ${error.stderr}`);
            }
        }
        return true;
    }

    // Helper method to merge universes
    mergeUniverses(importedUniverse, moduleName) {
        // Save undo state
        this.repl.pushUndo();

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
            }
        }

        // Merge imported rules, checking for conflicts
        let addedCount = 0;
        let skippedCount = 0;

        for (const rule of importedRules.a) {
            if (isCall(rule) && isSym(rule.h) && rule.h.v === 'R' && rule.a.length > 0) {
                const nameArg = rule.a[0];
                if (isStr(nameArg)) {
                    const ruleName = nameArg.v;
                    if (existingRuleNames.has(ruleName)) {
                        this.repl.platform.printWithNewline(`  Skipping rule "${ruleName}" (already exists)`);
                        skippedCount++;
                    } else {
                        currentRules.a.push(rule);
                        existingRuleNames.add(ruleName);
                        addedCount++;
                    }
                }
            }
        }

        if (addedCount > 0) {
            this.repl.platform.printWithNewline(`  Added ${addedCount} new rules`);
        }
        if (skippedCount > 0) {
            this.repl.platform.printWithNewline(`  Skipped ${skippedCount} existing rules`);
        }

        // Also merge RuleRules if present
        const importedRuleRules = engine.findSection(importedUniverse, "RuleRules");
        if (importedRuleRules && isCall(importedRuleRules) && importedRuleRules.a.length > 0) {
            let currentRuleRules = engine.findSection(this.repl.universe, "RuleRules");

            if (!currentRuleRules) {
                // Just add the entire RuleRules section if we don't have one
                this.repl.universe.a.push(importedRuleRules);
                this.repl.platform.printWithNewline(`  Added ${importedRuleRules.a.length} meta-rules`);
            } else {
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
        } else {
            // Evaluate expression with trace
            const exprText = args.join(' ');
            const oldTrace = this.repl.trace;
            this.repl.trace = true;
            await this.repl.evaluateExpression(exprText);
            this.repl.trace = oldTrace;
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
            this.repl.platform.printWithNewline("Normalizing universe...\n");

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

            this.repl.platform.printWithNewline("Universe normalized\n");

            // Optionally show the normalized program
            if (args.length > 0 && args[0] === 'show') {
                const output = this.repl.formatResult(normalized);
                this.repl.platform.printWithNewline("Normalized Program:\n");
                this.repl.platform.printWithNewline(output);
            }

            // Wait for any effects generated by normalization
            await this.repl.waitForEffects();
        } catch (error) {
            this.repl.platform.printWithNewline(`Normalization failed: ${error.message}\n`);
        }
        return true;
    }
}
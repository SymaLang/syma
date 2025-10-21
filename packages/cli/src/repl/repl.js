/*****************************************************************
 * Syma REPL Core
 *
 * Interactive Read-Eval-Print Loop for the Syma language
 ******************************************************************/

import * as engine from '@syma/core/engine';
import { foldPrims } from '@syma/core/primitives';
import { renderToString } from '@syma/projectors/string';
import { createParserSync, createParser } from '@syma/core/parser-factory';
import { getPlatform } from '@syma/core/platform';
import { createEffectsProcessor } from '@syma/core/effects/processor';
import { freshId } from '@syma/core/utils';
import { isCall, isStr, isSym } from '@syma/core/ast-helpers';
import { CommandProcessor } from './commands.js';

export class SymaREPL {
    constructor(platform, options = {}) {
        this.platform = platform || getPlatform();
        this.universe = engine.enrichProgramWithEffects(engine.createEmptyUniverse());
        this.history = [];

        // CommandProcessor is always available (platform-agnostic)
        // Autocompleter is optional (Node.js only)
        this.commandProcessor = options.commandProcessor || new CommandProcessor(this);
        this.autocompleter = options.autocompleter || null;

        this.parser = null; // Will be initialized asynchronously
        this.parserReady = this.initializeParser();
        this.effectsProcessor = null;

        // Options
        this.maxHistory = options.maxHistory || 1000;
        this.maxSteps = options.maxSteps || 10000;
        this.trace = options.trace || false;
        this.traceVerbose = options.traceVerbose || false;
        this.traceDiff = options.traceDiff || false;
        this.historyFile = options.historyFile;
        this.rcFile = options.rcFile;
        this.multilineBuffer = [];
        this.multilineMode = false;
        this.multilineExplicit = false; // Track if multiline was started explicitly with \
        this.prettyPrint = options.prettyPrint !== false; // Default to true
        this.inNormCommand = false; // Track if we're in a :norm command
        this.normCommandTraces = []; // Accumulate traces during :norm

        // Undo stack
        this.undoStack = [];
        this.maxUndo = options.maxUndo || 50;

        // Create context-aware foldPrims with renderToString support
        this.createFoldPrimsWithContext = () => (expr, skipFolds = []) => {
            const context = {
                universe: this.universe,
                normalizeFunc: (e, r, maxSteps = 10000, skipPrims = false) =>
                    engine.normalize(e, r, maxSteps, skipPrims, this.foldPrimsWithContext),
                extractRulesFunc: engine.extractRules,
                renderToString  // Inject renderToString for ProjectToString primitive
            };
            return foldPrims(expr, skipFolds, context);
        };
        this.foldPrimsWithContext = this.createFoldPrimsWithContext();

        // Bind methods
        this.processInput = this.processInput.bind(this);
        this.evaluateExpression = this.evaluateExpression.bind(this);
    }

    async initializeParser() {
        // try {
            // Try to use tree-sitter parser first
            // this.parser = await createParser({ useTreeSitter: true });
        // } catch (e) {
            // Fallback to original parser
            // console.warn('Tree-sitter parser not available, using original parser');
            // this.parser = createParserSync();
        // }

        // For now, let's always use the original parser
        this.parser = createParserSync();
    }

    async init() {
        // Wait for parser to be ready
        await this.parserReady;

        // Enable REPL mode on the platform (this creates the readline interface)
        if (this.platform.setReplMode) {
            // Pass the completer function to the platform if autocompleter is available
            const completer = this.autocompleter ? this.autocompleter.createCompleter() : null;
            this.platform.setReplMode(true, completer);
        }

        // Create a wrapper around the platform to intercept exit calls
        const platformWrapper = Object.create(this.platform);
        platformWrapper.exit = (exitCode) => {
            // Instead of actually exiting, just display the exit code
            this.platform.print(`\n[Exit effect received with code ${exitCode}]\n`);
        };

        // Initialize effects processor
        this.effectsProcessor = createEffectsProcessor(
            platformWrapper,
            () => engine.getProgram(this.universe),
            (newProg) => {
                // After effects update, normalize to trigger inbox processing rules
                const rules = engine.extractRules(this.universe);

                // If trace is enabled and we're in :norm context, collect trace
                if (this.trace && this.inNormCommand) {
                    const { result: normalized, trace } = engine.normalizeWithTrace(
                        newProg,
                        rules,
                        this.maxSteps,
                        false,
                        this.foldPrimsWithContext
                    );

                    if (trace.length > 0) {
                        // Accumulate the trace to show later
                        this.normCommandTraces.push({
                            label: 'Effects processing',
                            trace: trace
                        });
                    }

                    this.universe = engine.setProgram(this.universe, normalized);
                } else {
                    const normalized = engine.normalize(newProg, rules, this.maxSteps, false, this.foldPrimsWithContext);
                    this.universe = engine.setProgram(this.universe, normalized);
                }
            },
            () => {
                // No need to re-render in REPL context
                // Could print a notification if needed
            }
        );

        // Load history if available
        if (this.historyFile && await this.platform.fileExists(this.historyFile)) {
            try {
                const historyData = await this.platform.readFile(this.historyFile);
                this.history = historyData.split('\n').filter(line => line.trim());

                // Trim history to max size if needed
                if (this.history.length > this.maxHistory) {
                    // Keep only the most recent commands
                    this.history = this.history.slice(-this.maxHistory);
                    // Save the trimmed history back to file
                    await this.platform.writeFile(this.historyFile, this.history.join('\n'));
                }

                // Now that readline interface is created, populate its history
                if (this.platform.rl && this.platform.rl.history) {
                    // Readline expects most recent at index 0, but our file has oldest first
                    // So we need to reverse the order when adding to readline
                    this.history.slice().reverse().forEach(cmd => {
                        this.platform.rl.history.push(cmd);
                    });
                }
            } catch (error) {
                this.platform.print(`Warning: Could not load history: ${error.message}\n`);
            }
        }

        // Load RC file if available
        if (this.rcFile && await this.platform.fileExists(this.rcFile)) {
            try {
                await this.loadFile(this.rcFile);
                this.platform.print(`Loaded initialization file: ${this.rcFile}\n`);
            } catch (error) {
                this.platform.print(`Warning: Could not load RC file: ${error.message}\n`);
            }
        }
    }

    async run() {
        await this.init();

        this.platform.print("Syma REPL v1.0.0\n");
        this.platform.print("Type :help for commands, :quit to exit\n");
        this.platform.print("\n");

        // Main REPL loop
        while (true) {
            try {
                const prompt = this.multilineMode ? '... ' : 'syma> ';
                // For REPL, pass prompt to readLine for proper display
                const input = await this.platform.readLine(prompt);

                // Handle EOF (Ctrl+D)
                if (input === null || input === undefined) {
                    if (this.multilineMode) {
                        this.platform.print("Multiline input cancelled\n");
                        this.multilineMode = false;
                        this.multilineExplicit = false;
                        this.multilineBuffer = [];
                        continue;
                    } else {
                        break;
                    }
                }

                const shouldContinue = await this.processInput(input);
                if (!shouldContinue) break;

            } catch (error) {
                this.platform.print(`Error: ${error.message}\n`);
                if (error.stack && this.trace) {
                    this.platform.print(error.stack + "\n");
                }
            }
        }

        await this.shutdown();
    }

    async processInput(input) {
        // Handle multiline mode (either from backslash or incomplete expression)
        if (this.multilineMode) {
            if (input.trim() === '.') {
                // End multiline mode and process buffer
                this.multilineMode = false;
                this.multilineExplicit = false;
                const fullInput = this.multilineBuffer.join('\n');
                this.multilineBuffer = [];
                return await this.processCompleteInput(fullInput);
            } else {
                this.multilineBuffer.push(input);

                // Check if we have a complete expression now
                const currentInput = this.multilineBuffer.join('\n');
                if (this.isCompleteExpression(currentInput) && !this.multilineExplicit) {
                    // Auto-complete for pasted multiline content
                    this.multilineMode = false;
                    this.multilineExplicit = false;
                    this.multilineBuffer = [];
                    return await this.processCompleteInput(currentInput);
                }

                return true;
            }
        }

        // Check if input starts explicit multiline mode with backslash
        if (input.trim().endsWith('\\')) {
            this.multilineMode = true;
            this.multilineExplicit = true;  // Explicit mode requires '.' to end
            this.multilineBuffer.push(input.slice(0, -1).trimEnd());
            return true;
        }

        // Check if this is the start of an incomplete expression (likely pasted)
        if (!this.isCompleteExpression(input)) {
            // Enter implicit multiline mode
            this.multilineMode = true;
            this.multilineExplicit = false;  // Implicit mode auto-completes
            this.multilineBuffer.push(input);
            return true;
        }

        // Single complete expression - process normally
        return await this.processSingleLineInput(input);
    }

    // Helper to check if an expression is complete (balanced parens/braces)
    isCompleteExpression(input) {
        // Skip commands
        if (input.trim().startsWith(':')) {
            return true;
        }

        let depth = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < input.length; i++) {
            const char = input[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"' && !inString) {
                inString = true;
            } else if (char === '"' && inString) {
                inString = false;
            } else if (!inString) {
                if (char === '(' || char === '{' || char === '[') {
                    depth++;
                } else if (char === ')' || char === '}' || char === ']') {
                    depth--;
                    if (depth < 0) {
                        // More closing than opening - definitely wrong
                        return true;  // Let parser handle the error
                    }
                }
            }
        }

        // If we're still in a string or have unmatched opening parens, it's incomplete
        return depth === 0 && !inString;
    }

    async processSingleLineInput(input) {
        const trimmed = input.trim();

        // Don't save quit commands to history
        const isQuitCommand = trimmed === ':q' || trimmed === ':quit' || trimmed === ':exit';

        // Add to history (except quit commands)
        if (trimmed && !isQuitCommand) {
            this.history.push(input);

            // Trim history to max size
            while (this.history.length > this.maxHistory) {
                this.history.shift();
            }

            // Save trimmed history immediately after each command
            if (this.historyFile) {
                try {
                    await this.platform.writeFile(this.historyFile, this.history.join('\n'));
                } catch (error) {
                    // Silently ignore write errors to not disrupt REPL flow
                }
            }
        }

        // Still add quit commands to readline history for the current session
        if (trimmed && this.platform.addToReplHistory) {
            this.platform.addToReplHistory(input);
        }

        // At this point, we've already determined this is a complete single-line input
        // (multiline handling happens in processInput before we get here)
        // So just process it directly
        return await this.processCompleteInput(input);
    }

    async processCompleteInput(input) {
        const trimmed = input.trim();

        if (!trimmed) return true;

        // Check for commands
        if (trimmed.startsWith(':')) {
            if (this.commandProcessor) {
                return await this.commandProcessor.processCommand(trimmed);
            } else {
                this.platform.print('Commands not available (no command processor)\n');
                return true;
            }
        }

        // Otherwise evaluate as expression
        await this.evaluateExpression(trimmed);
        return true;
    }

    async evaluateExpression(input) {
        try {
            // Ensure parser is ready
            if (!this.parser) {
                await this.parserReady;
            }

            // Parse the expression
            const expr = this.parser.parseString(input);

            // Extract current rules
            const rules = engine.extractRules(this.universe);

            // Normalize the expression
            let result;
            if (this.trace) {
                const { result: normalized, trace } = engine.normalizeWithTrace(
                    expr,
                    rules,
                    this.maxSteps,
                    false,
                    this.foldPrimsWithContext
                );
                result = normalized;

                // Show trace
                if (trace.length > 0) {
                    if (this.traceStatsOnly) {
                        // Stats-only mode
                        const { getTraceStats, formatTraceStats } = await import('@syma/core/core/trace-utils.js');
                        this.platform.print("\nTrace Statistics:\n");
                        this.platform.print("─" + "─".repeat(40) + "\n");
                        const stats = getTraceStats(trace);
                        this.platform.print(formatTraceStats(stats) + '\n');
                        this.platform.print("─" + "─".repeat(40) + "\n\n");
                    } else if (this.traceDiff) {
                        // Diff trace mode: show only what changed
                        const { getFocusedDiff } = await import('@syma/core/core/ast-diff.js');
                        this.platform.print("\nDiff Trace:\n");
                        this.platform.print("═" + "═".repeat(60) + "\n");

                        for (const step of trace) {
                            this.platform.print(`\nStep ${step.i + 1}: Rule "${step.rule}"\n`);
                            this.platform.print("─" + "─".repeat(60) + "\n");

                            if (step.before && step.after) {
                                const diffOutput = getFocusedDiff(step.before, step.after, this.parser);
                                this.platform.print(diffOutput + "\n");
                            } else {
                                this.platform.print("(no diff available)\n");
                            }

                            if (step.path.length > 0) {
                                this.platform.print(`At path: [${step.path.join(' → ')}]\n`);
                            }
                        }

                        this.platform.print("═" + "═".repeat(60) + "\n\n");
                    } else if (this.traceVerbose) {
                        // Verbose trace mode: show pattern, matched part, and rewrite
                        this.platform.print("\nVerbose Trace:\n");
                        this.platform.print("═" + "═".repeat(60) + "\n");

                        for (const step of trace) {
                            // Find the rule to get its pattern and replacement (extract flat array from indexed structure)
                            const flatRules = rules.allRules || rules;
                            const rule = flatRules.find(r => r.name === step.rule);

                            this.platform.print(`\nStep ${step.i + 1}: Rule "${step.rule}"\n`);
                            this.platform.print("─" + "─".repeat(60) + "\n");

                            // Show the rule pattern and replacement if found
                            if (rule) {
                                const patternStr = this.parser.prettyPrint ?
                                    this.parser.prettyPrint(rule.lhs) :
                                    this.parser.nodeToString(rule.lhs);
                                const replacementStr = this.parser.prettyPrint ?
                                    this.parser.prettyPrint(rule.rhs) :
                                    this.parser.nodeToString(rule.rhs);

                                this.platform.print(`Pattern:     ${patternStr}\n`);
                                this.platform.print(`Replacement: ${replacementStr}\n`);

                                if (rule.guard) {
                                    const guardStr = this.parser.prettyPrint ?
                                        this.parser.prettyPrint(rule.guard) :
                                        this.parser.nodeToString(rule.guard);
                                    this.platform.print(`Guard:       ${guardStr}\n`);
                                }
                            }

                            // Show the matched expression and result if available
                            if (step.before && step.after) {
                                const beforeStr = this.parser.prettyPrint ?
                                    this.parser.prettyPrint(step.before) :
                                    this.parser.nodeToString(step.before);
                                const afterStr = this.parser.prettyPrint ?
                                    this.parser.prettyPrint(step.after) :
                                    this.parser.nodeToString(step.after);

                                this.platform.print(`\nMatched:     ${beforeStr}\n`);
                                this.platform.print(`Rewrote to:  ${afterStr}\n`);
                            }

                            this.platform.print(`At path:     [${step.path.join(' → ')}]\n`);
                        }

                        this.platform.print("═" + "═".repeat(60) + "\n\n");
                    } else {
                        // Simple trace mode - with collapsing
                        const { collapseConsecutiveRules, formatCollapsedTrace } = await import('@syma/core/core/trace-utils.js');
                        this.platform.print("\nTrace:\n");
                        const collapsed = collapseConsecutiveRules(trace);
                        const formatted = formatCollapsedTrace(collapsed);
                        this.platform.print(formatted + '\n');

                        // Show hot spots if there are many steps
                        if (trace.length > 20) {
                            const { getTraceStats } = await import('@syma/core/core/trace-utils.js');
                            const stats = getTraceStats(trace);
                            if (stats.hotRules.length > 0) {
                                this.platform.print('\nHot spots:\n');
                                for (const [rule, count] of stats.hotRules.slice(0, 5)) {
                                    this.platform.print(`  ${rule}: ${count}×\n`);
                                }
                            }
                        }
                        this.platform.print("\n");
                    }
                }
            } else {
                result = engine.normalize(expr, rules, this.maxSteps, false, this.foldPrimsWithContext);
            }

            // Display result
            const output = this.formatResult(result);
            this.platform.print(`→ ${output}\n`);

            // Store result in $it variable for future reference
            this.lastResult = result;

            // Wait for any pending effects to complete
            await this.waitForEffects();

        } catch (error) {
            this.platform.print(`Evaluation error: ${error.message}\n`);
        }
    }

    async waitForEffects(maxWaitMs = 30000) {
        // Check if there are pending effects or active I/O
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            const program = engine.getProgram(this.universe);
            const effects = program.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'Effects');

            let hasPending = false;
            if (effects && effects.a[0]) {
                const pending = effects.a[0];
                if (isCall(pending) && pending.a.length > 0) {
                    hasPending = true;
                }
            }

            // Check if effects processor has active I/O or timers
            const hasActiveIO = this.effectsProcessor?.hasActiveIO?.() || false;
            const hasActiveTimers = this.effectsProcessor?.hasActiveTimers?.() || false;

            if (!hasPending && !hasActiveIO && !hasActiveTimers) {
                break;
            }

            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    formatResult(node) {
        if (this.prettyPrint) {
            return this.parser.prettyPrint(node);
        }
        return this.parser.nodeToString(node);
    }

    async loadFile(path) {
        const content = await this.platform.readFile(path);

        if (path.endsWith('.json')) {
            // Load JSON AST directly
            this.universe = JSON.parse(content);
            // Enrich with Effects structure if needed for compatibility
            this.universe = engine.enrichProgramWithEffects(this.universe);
            // Apply RuleRules to transform the Universe permanently
            this.universe = engine.applyRuleRules(this.universe, this.foldPrimsWithContext);
        } else {
            // Parse S-expression
            this.universe = this.parser.parseString(content, path);
            // Enrich with Effects structure if needed for compatibility
            this.universe = engine.enrichProgramWithEffects(this.universe);
            // Apply RuleRules to transform the Universe permanently
            this.universe = engine.applyRuleRules(this.universe, this.foldPrimsWithContext);
        }

        // Process any initial effects (like EffQueue, Flow, etc.)
        // First normalize the program to trigger any effect-generating rules
        const rules = engine.extractRules(this.universe);
        const program = engine.getProgram(this.universe);
        const normalized = engine.normalize(program, rules, this.maxSteps, false, this.foldPrimsWithContext);
        this.universe = engine.setProgram(this.universe, normalized);

        // Now wait for effects to complete
        await this.waitForEffects();
    }

    async saveFile(path, format = 'auto') {
        if (format === 'auto') {
            format = path.endsWith('.json') ? 'json' : 'syma';
        }

        let content;
        if (format === 'json') {
            content = JSON.stringify(this.universe, null, 2);
        } else {
            content = this.parser.nodeToString(this.universe);
        }

        await this.platform.writeFile(path, content);
    }

    pushUndo() {
        this.undoStack.push(JSON.parse(JSON.stringify(this.universe)));
        if (this.undoStack.length > this.maxUndo) {
            this.undoStack.shift();
        }
    }

    undo() {
        if (this.undoStack.length === 0) {
            throw new Error("Nothing to undo");
        }
        this.universe = this.undoStack.pop();
    }

    async shutdown() {
        // Save history
        if (this.historyFile && this.history.length > 0) {
            try {
                await this.platform.writeFile(this.historyFile, this.history.join('\n'));
            } catch (error) {
                this.platform.print(`Warning: Could not save history: ${error.message}\n`);
            }
        }

        const possibleShutdownMessages = [
            "Goodbye!",
            "See you later!",
            "Have a great day!",
            "Farewell!",
            "Until next time!",
            "Bye!",
            "Take care!",
            "Stay safe!",
        ];

        const message = possibleShutdownMessages[Math.floor(Math.random() * possibleShutdownMessages.length)];

        this.platform.print(`\n✨ ${message}\n`);

        // Clean up effects processor
        if (this.effectsProcessor) {
            this.effectsProcessor.cleanup();
        }

        // Clean up platform resources
        if (this.platform.cleanup) {
            this.platform.cleanup();
        }
    }

    // Helper methods for commands
    getRules() {
        const indexedRules = engine.extractRules(this.universe);
        // Return the flat array for commands that expect it
        return indexedRules.allRules || [];
    }

    addRule(rule) {
        this.pushUndo();
        const rulesNode = engine.findSection(this.universe, "Rules");
        if (rulesNode) {
            rulesNode.a.push(rule);
            // Apply RuleRules to transform the Rules section after adding a new rule
            this.universe = engine.applyRuleRules(this.universe, this.foldPrimsWithContext);
        }
    }

    removeRule(name) {
        this.pushUndo();
        const rulesNode = engine.findSection(this.universe, "Rules");
        if (rulesNode) {
            rulesNode.a = rulesNode.a.filter(r => {
                // Check if this is a rule with matching name
                if (!isCall(r) || !isSym(r.h) || r.h.v !== "R") return true;
                if (r.a.length < 1 || !isStr(r.a[0])) return true;
                return r.a[0].v !== name;
            });
        }
    }

    clearUniverse() {
        this.pushUndo();
        this.universe = engine.enrichProgramWithEffects(engine.createEmptyUniverse());
    }

    async applyAction(action) {
        this.pushUndo();
        // engine.dispatch expects the indexed rules structure, not flat array
        const rules = engine.extractRules(this.universe);
        this.universe = engine.dispatch(
            this.universe,
            rules,
            action,
            this.foldPrimsWithContext,
            this.trace ? (action, trace) => {
                this.platform.print("\nDispatch trace:\n");
                for (const step of trace) {
                    this.platform.print(`  Step ${step.i + 1}: Rule "${step.rule}"\n`);
                }
            } : null
        );

        // Wait for any effects generated by the action
        await this.waitForEffects();
    }

    // Export freshId for command use
    freshId() {
        return freshId();
    }

    // Helper method to show trace output (extracted for reuse)
    async showTrace(trace, rules) {
        if (trace.length === 0) return;

        // Extract flat array if rules is an indexed structure
        const flatRules = rules.allRules || rules;

        if (this.traceStatsOnly) {
            // Stats-only mode
            const { getTraceStats, formatTraceStats } = await import('@syma/core/core/trace-utils.js');
            this.platform.print("\nTrace Statistics:\n");
            this.platform.print("─" + "─".repeat(40) + "\n");
            const stats = getTraceStats(trace);
            this.platform.print(formatTraceStats(stats) + '\n');
            this.platform.print("─" + "─".repeat(40) + "\n\n");
        } else if (this.traceDiff) {
            // Diff trace mode: show only what changed
            const { getFocusedDiff } = await import('@syma/core/core/ast-diff.js');
            this.platform.print("\nDiff Trace:\n");
            this.platform.print("═" + "═".repeat(60) + "\n");

            for (const step of trace) {
                this.platform.print(`\nStep ${step.i + 1}: Rule "${step.rule}"\n`);
                this.platform.print("─" + "─".repeat(60) + "\n");

                if (step.before && step.after) {
                    const diffOutput = getFocusedDiff(step.before, step.after, this.parser);
                    this.platform.print(diffOutput + "\n");
                } else {
                    this.platform.print("(no diff available)\n");
                }

                if (step.path.length > 0) {
                    this.platform.print(`At path: [${step.path.join(' → ')}]\n`);
                }
            }

            this.platform.print("═" + "═".repeat(60) + "\n\n");
        } else if (this.traceVerbose) {
            // Verbose trace mode: show pattern, matched part, and rewrite
            this.platform.print("\nVerbose Trace:\n");
            this.platform.print("═" + "═".repeat(60) + "\n");

            for (const step of trace) {
                // Find the rule to get its pattern and replacement
                const rule = flatRules.find(r => r.name === step.rule);

                this.platform.print(`\nStep ${step.i + 1}: Rule "${step.rule}"\n`);
                this.platform.print("─" + "─".repeat(60) + "\n");

                // Show the rule pattern and replacement if found
                if (rule) {
                    const patternStr = this.parser.prettyPrint ?
                        this.parser.prettyPrint(rule.lhs) :
                        this.parser.nodeToString(rule.lhs);
                    const replacementStr = this.parser.prettyPrint ?
                        this.parser.prettyPrint(rule.rhs) :
                        this.parser.nodeToString(rule.rhs);

                    this.platform.print(`Pattern:     ${patternStr}\n`);
                    this.platform.print(`Replacement: ${replacementStr}\n`);

                    if (rule.guard) {
                        const guardStr = this.parser.prettyPrint ?
                            this.parser.prettyPrint(rule.guard) :
                            this.parser.nodeToString(rule.guard);
                        this.platform.print(`Guard:       ${guardStr}\n`);
                    }
                }

                // Show the matched expression and result if available
                if (step.before && step.after) {
                    const beforeStr = this.parser.prettyPrint ?
                        this.parser.prettyPrint(step.before) :
                        this.parser.nodeToString(step.before);
                    const afterStr = this.parser.prettyPrint ?
                        this.parser.prettyPrint(step.after) :
                        this.parser.nodeToString(step.after);

                    this.platform.print(`\nMatched:     ${beforeStr}\n`);
                    this.platform.print(`Rewrote to:  ${afterStr}\n`);
                }

                this.platform.print(`At path:     [${step.path.join(' → ')}]\n`);
            }

            this.platform.print("═" + "═".repeat(60) + "\n\n");
        } else {
            // Simple trace mode - with collapsing
            const { collapseConsecutiveRules, formatCollapsedTrace } = await import('@syma/core/core/trace-utils.js');
            this.platform.print("\nTrace:\n");
            const collapsed = collapseConsecutiveRules(trace);
            const formatted = formatCollapsedTrace(collapsed);
            this.platform.print(formatted + '\n');

            // Show hot spots if there are many steps
            if (trace.length > 20) {
                const { getTraceStats } = await import('@syma/core/core/trace-utils.js');
                const stats = getTraceStats(trace);
                if (stats.hotRules.length > 0) {
                    this.platform.print('\nHot spots:\n');
                    for (const [rule, count] of stats.hotRules.slice(0, 5)) {
                        this.platform.print(`  ${rule}: ${count}×\n`);
                    }
                }
            }
            this.platform.print("\n");
        }
    }
}
import { SymaREPL } from '../repl/repl.js';
import * as engine from '../core/engine.js';
import { foldPrims } from '../primitives.js';
import { NotebookCommands } from './notebook-commands.js';

class NotebookPlatform {
    constructor() {
        this.outputHandlers = new Map();
        this.currentCellId = null;
        // Mark this as a notebook platform
        this.isNotebook = true;
    }

    setOutputHandler(cellId, handler) {
        this.outputHandlers.set(cellId, handler);
    }

    removeOutputHandler(cellId) {
        this.outputHandlers.delete(cellId);
    }

    setCurrentCell(cellId) {
        this.currentCellId = cellId;
    }

    print(output) {
        if (this.currentCellId && this.outputHandlers.has(this.currentCellId)) {
            this.outputHandlers.get(this.currentCellId)(output);
        }
        if (typeof output === 'string') {
            console.log(output);
        } else {
            console.log('DOM output:', output);
        }
    }

    readLine(prompt) {
        throw new Error('Interactive input not supported in notebook mode');
    }

    printWithNewline(text) {
        this.print(text + '\n');
    }

    // New method for structured output (like accordions)
    printStructured(data) {
        if (this.currentCellId && this.outputHandlers.has(this.currentCellId)) {
            // Send structured output to the handler
            this.outputHandlers.get(this.currentCellId)({
                type: 'structured',
                ...data
            });
        }
    }

    async fileExists(path) {
        try {
            const response = await fetch(path);
            return response.ok;
        } catch {
            return false;
        }
    }

    async readFile(path) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load file: ${path}`);
        return response.text();
    }

    async writeFile(path, content) {
        // In browser context, we'll use localStorage for now
        localStorage.setItem(`syma:file:${path}`, content);
    }

    cleanup() {
        this.outputHandlers.clear();
        this.currentCellId = null;
    }

    cleanupCell(cellId) {
        // Remove output handler for specific cell
        this.outputHandlers.delete(cellId);
        if (this.currentCellId === cellId) {
            this.currentCellId = null;
        }
    }
}

export class NotebookEngine {
    constructor() {
        this.platform = new NotebookPlatform();
        this.repl = new SymaREPL(this.platform, {
            maxHistory: 0,  // Disable history in notebook mode
            trace: false,
            prettyPrint: true
        });
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        await this.repl.initializeParser();

        // Replace command processor with browser-compatible version
        this.notebookCommands = new NotebookCommands(this.repl);
        // Store the original processCommand method before replacing it
        this.originalProcessCommand = this.repl.commandProcessor.processCommand.bind(this.repl.commandProcessor);
        this.notebookCommands.originalProcessCommand = this.originalProcessCommand;
        // Override the specific processCommand method
        this.repl.commandProcessor.processCommand = this.notebookCommands.processCommand.bind(this.notebookCommands);

        // Pre-import Core/Syntax/Global if available (for better notebook experience)
        try {
            const index = await this.notebookCommands.loadModuleIndex();
            const globalSyntaxName = 'Core/Syntax/Global';
            if (index[globalSyntaxName] && !this.notebookCommands.globalSyntaxImported) {
                console.log(`Pre-importing ${globalSyntaxName} for notebook...`);
                await this.notebookCommands.importModule(globalSyntaxName, index[globalSyntaxName], { open: false, macro: true });
                this.notebookCommands.globalSyntaxImported = true;
            }
        } catch (error) {
            console.warn('Could not pre-import Core/Syntax/Global:', error);
        }

        this.initialized = true;
    }

    async executeCode(cellId, code, onOutput = null) {
        await this.initialize();

        // Clean up any existing resources for this cell (e.g. from previous execution)
        this.cleanupCell(cellId);

        const outputs = [];
        let hasError = false;

        // Set up output handler
        if (onOutput) {
            this.platform.setOutputHandler(cellId, (text) => {
                onOutput({ type: 'text', content: text });
            });
        } else {
            this.platform.setOutputHandler(cellId, (text) => {
                outputs.push({ type: 'text', content: text });
            });
        }

        this.platform.setCurrentCell(cellId);

        try {
            // Parse the code
            const expr = this.repl.parser.parseString(code);

            // Extract current rules
            const rules = engine.extractRules(this.repl.universe);

            // Create context-aware foldPrims for this execution
            const createFoldPrimsWithContext = () => (expr, skipFolds = []) => {
                const context = {
                    universe: this.repl.universe,
                    normalizeFunc: (e, r, maxSteps = 10000, skipPrims = false) =>
                        engine.normalize(e, r, maxSteps, skipPrims, foldPrimsWithContext),
                    extractRulesFunc: engine.extractRules
                };
                return foldPrims(expr, skipFolds, context);
            };
            const foldPrimsWithContext = createFoldPrimsWithContext();

            // Normalize the expression with optional trace
            let result;
            let trace = null;
            let elapsedTime = null;

            if (this.repl.trace) {
                // Start timing
                const startTime = performance.now();

                const traceResult = engine.normalizeWithTrace(
                    expr,
                    rules,
                    this.repl.maxSteps,
                    false,
                    foldPrimsWithContext
                );
                result = traceResult.result;
                trace = traceResult.trace;

                // End timing
                const endTime = performance.now();
                elapsedTime = endTime - startTime;

                // Show trace if available
                if (trace && trace.length > 0) {
                    if (this.repl.traceDiff) {
                        // Diff trace mode - show only changes
                        const { getFocusedDiff } = await import('../core/ast-diff.js');
                        outputs.push({
                            type: 'text',
                            content: '\nDiff Trace:\n' + '═'.repeat(61) + '\n',
                            volatile: true
                        });

                        for (const step of trace) {
                            let traceOutput = `\nStep ${step.i + 1}: Rule "${step.rule}"\n`;
                            traceOutput += '─'.repeat(60) + '\n';

                            if (step.before && step.after) {
                                const diffOutput = getFocusedDiff(step.before, step.after, this.repl.parser);
                                traceOutput += diffOutput + '\n';
                            } else {
                                traceOutput += '(no diff available)\n';
                            }

                            if (step.path.length > 0) {
                                traceOutput += `At path: [${step.path.join(' → ')}]\n`;
                            }

                            outputs.push({ type: 'text', content: traceOutput, volatile: true });
                        }

                        outputs.push({ type: 'text', content: '═'.repeat(61) + '\n\n', volatile: true });
                    } else if (this.repl.traceVerbose) {
                        // Verbose trace mode
                        outputs.push({
                            type: 'text',
                            content: '\nVerbose Trace:\n' + '═'.repeat(61) + '\n',
                            volatile: true  // Don't persist trace output to localStorage
                        });

                        for (const step of trace) {
                            // Find the rule to get its pattern and replacement
                            const flatRules = rules.allRules || rules;
                            const rule = flatRules.find(r => r.name === step.rule);

                            let traceOutput = `\nStep ${step.i + 1}: Rule "${step.rule}"\n`;
                            traceOutput += '─'.repeat(60) + '\n';

                            // Show the rule pattern and replacement if found
                            if (rule) {
                                const patternStr = this.repl.parser.prettyPrint ?
                                    this.repl.parser.prettyPrint(rule.lhs) :
                                    this.repl.parser.nodeToString(rule.lhs);
                                const replacementStr = this.repl.parser.prettyPrint ?
                                    this.repl.parser.prettyPrint(rule.rhs) :
                                    this.repl.parser.nodeToString(rule.rhs);

                                traceOutput += `Pattern:     ${patternStr}\n`;
                                traceOutput += `Replacement: ${replacementStr}\n`;

                                if (rule.guard) {
                                    const guardStr = this.repl.parser.prettyPrint ?
                                        this.repl.parser.prettyPrint(rule.guard) :
                                        this.repl.parser.nodeToString(rule.guard);
                                    traceOutput += `Guard:       ${guardStr}\n`;
                                }
                            }

                            // Show the matched expression and result if available
                            if (step.before && step.after) {
                                const beforeStr = this.repl.parser.prettyPrint ?
                                    this.repl.parser.prettyPrint(step.before) :
                                    this.repl.parser.nodeToString(step.before);
                                const afterStr = this.repl.parser.prettyPrint ?
                                    this.repl.parser.prettyPrint(step.after) :
                                    this.repl.parser.nodeToString(step.after);

                                traceOutput += `\nMatched:     ${beforeStr}\n`;
                                traceOutput += `Rewrote to:  ${afterStr}\n`;
                            }

                            traceOutput += `At path:     [${step.path.join(' → ')}]\n`;
                            outputs.push({ type: 'text', content: traceOutput, volatile: true });
                        }

                        outputs.push({ type: 'text', content: '═'.repeat(61) + '\n\n', volatile: true });
                    } else {
                        // Simple trace mode - with collapsing, using accordion output
                        const { collapseConsecutiveRules, formatCollapsedTrace, getTraceStats } = await import('../core/trace-utils.js');

                        // Output a summary message
                        outputs.push({
                            type: 'text',
                            content: `Applied ${trace.length} rewrite steps:`,
                            volatile: true
                        });

                        // Build accordion sections
                        const sections = [];

                        // 1. Trace section (expanded by default)
                        const collapsed = collapseConsecutiveRules(trace);
                        const formatted = formatCollapsedTrace(collapsed);
                        sections.push({
                            title: `📊 Trace Steps`,
                            content: formatted,
                            expanded: true,
                            persistedExpanded: true
                        });

                        // 2. Hot spots section (only if > 20 steps, collapsed by default)
                        if (trace.length > 20) {
                            const stats = getTraceStats(trace);
                            if (stats.hotRules.length > 0) {
                                let hotSpotContent = '';
                                for (const [rule, count] of stats.hotRules.slice(0, 10)) {
                                    hotSpotContent += `${rule}: ${count}×\n`;
                                }
                                sections.push({
                                    title: '🔥 Hot spots',
                                    content: hotSpotContent.trim(),
                                    expanded: false,
                                    persistedExpanded: false
                                });
                            }
                        }

                        // 3. Performance metrics section
                        if (elapsedTime !== null) {
                            const flatRules = rules.allRules || rules;
                            const totalRules = flatRules.length;
                            const totalSteps = trace.length;
                            let metricsContent = `Total execution time: ${elapsedTime.toFixed(2)}ms\n`;
                            metricsContent += `Total rules in system: ${totalRules} rules\n`;
                            metricsContent += `Total rewrite steps: ${totalSteps} steps\n`;

                            if (totalSteps > 0) {
                                const avgTimePerStep = elapsedTime / totalSteps;
                                metricsContent += `Average time per step: ${avgTimePerStep.toFixed(3)}ms\n`;

                                // Estimate rules checked (with indexing optimization)
                                const avgRulesCheckedPerStep = Math.ceil(totalRules * 0.15); // Assume 15% selectivity
                                metricsContent += `Estimated avg rules checked per step: ~${avgRulesCheckedPerStep} (with indexing)`;
                            }

                            sections.push({
                                title: '📈 Performance Metrics',
                                content: metricsContent,
                                expanded: false,
                                persistedExpanded: false
                            });
                        }

                        // The result will be added later as a separate output
                        // For now, just output the trace sections as an accordion
                        outputs.push({
                            type: 'accordion',
                            sections: sections,
                            volatile: true
                        });
                    }
                } else if (trace) {
                    // No rewrite steps applied - expression was already in normal form
                    outputs.push({
                        type: 'text',
                        content: 'No rewrite steps applied (expression is already in normal form)',
                        volatile: true
                    });
                }
            } else {
                result = engine.normalize(expr, rules, this.repl.maxSteps, false, foldPrimsWithContext);
            }

            // Format the result
            const output = this.repl.formatResult(result);

            // Store result for reference
            this.repl.lastResult = result;

            // Wait for any effects
            await this.repl.waitForEffects();

            // If we have trace output, add the result to the accordion
            // Otherwise output it normally
            if (this.repl.trace && trace && trace.length > 0 && !this.repl.traceDiff && !this.repl.traceVerbose) {
                // Find the last accordion output and add the result section
                for (let i = outputs.length - 1; i >= 0; i--) {
                    if (outputs[i].type === 'accordion') {
                        // Add result as the last section (expanded)
                        outputs[i].sections.push({
                            title: '✅ Result',
                            content: output,
                            expanded: true,
                            persistedExpanded: true
                        });
                        break;
                    }
                }
            } else {
                // Normal result output
                outputs.push({
                    type: 'result',
                    content: output
                });
            }

        } catch (error) {
            hasError = true;
            outputs.push({
                type: 'error',
                content: error.message,
                traceback: error.stack
            });
        } finally {
            this.platform.removeOutputHandler(cellId);
        }

        return { outputs, hasError };
    }

    async executeCommand(cellId, command) {
        await this.initialize();

        // Clean up any existing resources for this cell (e.g. from previous execution)
        this.cleanupCell(cellId);

        const outputs = [];
        let hasError = false;

        // Set up output handler that can handle both text and DOM outputs
        this.platform.setOutputHandler(cellId, (output) => {
            if (typeof output === 'string') {
                outputs.push({ type: 'text', content: output });
            } else if (output && typeof output === 'object') {
                // Handle structured outputs (like DOM elements and accordions)
                if (output.type === 'structured') {
                    // Structured output like accordions
                    outputs.push({
                        type: 'accordion',
                        sections: output.sections || []
                    });
                } else {
                    // Other objects (like DOM elements)
                    outputs.push(output);
                }
            } else {
                outputs.push({ type: 'text', content: String(output) });
            }
        });
        this.platform.setCurrentCell(cellId);

        try {
            // Split by lines and process commands
            const lines = command.split('\n');
            let i = 0;

            while (i < lines.length) {
                const trimmedLine = lines[i].trim();
                if (!trimmedLine) {
                    i++;
                    continue; // Skip empty lines
                }

                if (trimmedLine.startsWith(';')) {
                    // It's a comment, skip it
                    i++;
                    continue;
                }

                if (trimmedLine.startsWith(':')) {
                    // Check if this is a multiline command
                    const isMultiline = trimmedLine === ':rule multiline' ||
                                       trimmedLine === ':render multiline' ||
                                       trimmedLine === ':render watch multiline' ||
                                       trimmedLine === ':render multiline watch' ||
                                       trimmedLine === ':module multiline' ||
                                       trimmedLine === ':match' ||
                                       trimmedLine === ':m' ||
                                       trimmedLine === ':trace';

                    if (isMultiline) {
                        // Parse the command type and modifiers
                        const parts = trimmedLine.split(' ');
                        const commandType = parts[0]; // :rule, :render, :module, :match, or :m
                        const hasWatch = parts.includes('watch');
                        const hasMultiline = parts.includes('multiline');

                        // Collect everything until :end
                        let contentLines = [];
                        let j = i + 1;
                        let foundEnd = false;

                        while (j < lines.length) {
                            const nextLine = lines[j].trim();

                            if (nextLine === ':end') {
                                foundEnd = true;
                                j++;
                                break;
                            }

                            // Add the line (preserving indentation for readability)
                            contentLines.push(lines[j]);
                            j++;
                        }

                        if (!foundEnd) {
                            outputs.push({
                                type: 'error',
                                content: 'Error: Multiline command missing :end marker'
                            });
                            hasError = true;
                            i = j;
                        } else {
                            // Handle different command types
                            if (commandType === ':module') {
                                // For module, join with newlines to preserve structure
                                const moduleContent = contentLines.join('\n').trim();

                                if (!moduleContent) {
                                    outputs.push({
                                        type: 'error',
                                        content: 'Error: Empty module definition'
                                    });
                                    hasError = true;
                                } else {
                                    try {
                                        // Call defineModule directly
                                        const result = this.notebookCommands.defineModule(moduleContent);
                                        if (result === false) {
                                            outputs.push({ type: 'text', content: 'Module definition would exit REPL (not allowed in notebook mode)' });
                                        }
                                    } catch (error) {
                                        hasError = true;
                                        outputs.push({
                                            type: 'error',
                                            content: `Error in module definition: ${error.message}`,
                                            traceback: error.stack
                                        });
                                    }
                                }
                            } else if (commandType === ':match' || commandType === ':m') {
                                // For match, join with newlines to preserve structure
                                const matchContent = contentLines.join('\n').trim();

                                if (!matchContent) {
                                    outputs.push({
                                        type: 'error',
                                        content: 'Error: Empty match pattern'
                                    });
                                    hasError = true;
                                } else {
                                    try {
                                        // Call processMultilineMatch
                                        const result = await this.notebookCommands.processMultilineMatch(matchContent);
                                        if (result === false) {
                                            outputs.push({ type: 'text', content: 'Match command would exit REPL (not allowed in notebook mode)' });
                                        }
                                    } catch (error) {
                                        hasError = true;
                                        outputs.push({
                                            type: 'error',
                                            content: `Error in match command: ${error.message}`,
                                            traceback: error.stack
                                        });
                                    }
                                }
                            } else if (commandType === ':trace') {
                                // For trace, join with newlines to preserve complex expressions
                                const traceContent = contentLines.join('\n').trim();

                                if (!traceContent) {
                                    outputs.push({
                                        type: 'error',
                                        content: 'Error: Empty expression to trace'
                                    });
                                    hasError = true;
                                } else {
                                    try {
                                        // Save current trace settings
                                        const oldTrace = this.repl.trace;
                                        const oldVerbose = this.repl.traceVerbose;
                                        const oldDiff = this.repl.traceDiff;

                                        // Enable trace mode
                                        this.repl.trace = true;
                                        this.repl.traceVerbose = false;
                                        this.repl.traceDiff = false;

                                        // Parse and evaluate the expression directly here
                                        // This ensures it goes through the notebook-engine's trace formatting
                                        const expr = this.repl.parser.parseString(traceContent);
                                        const rules = engine.extractRules(this.repl.universe);

                                        // Create context-aware foldPrims for this :trace execution
                                        const createTraceFoldPrimsWithContext = () => (expr, skipFolds = []) => {
                                            const context = {
                                                universe: this.repl.universe,
                                                normalizeFunc: (e, r, maxSteps = 10000, skipPrims = false) =>
                                                    engine.normalize(e, r, maxSteps, skipPrims, traceFoldPrimsWithContext),
                                                extractRulesFunc: engine.extractRules
                                            };
                                            return foldPrims(expr, skipFolds, context);
                                        };
                                        const traceFoldPrimsWithContext = createTraceFoldPrimsWithContext();

                                        // Start timing
                                        const startTime = performance.now();

                                        // Use normalizeWithTrace
                                        const { result, trace } = engine.normalizeWithTrace(
                                            expr,
                                            rules,
                                            this.repl.maxSteps || 10000,
                                            false,
                                            traceFoldPrimsWithContext
                                        );

                                        // End timing
                                        const endTime = performance.now();
                                        const elapsedTime = endTime - startTime;

                                        // Now format the trace output using accordion
                                        if (trace && trace.length > 0) {
                                            const { collapseConsecutiveRules, formatCollapsedTrace, getTraceStats } = await import('../core/trace-utils.js');

                                            // Output a summary message
                                            outputs.push({
                                                type: 'text',
                                                content: `Applied ${trace.length} rewrite steps:`,
                                                volatile: true
                                            });

                                            // Build accordion sections
                                            const sections = [];

                                            // 1. Trace section (expanded by default)
                                            const collapsed = collapseConsecutiveRules(trace);
                                            const formatted = formatCollapsedTrace(collapsed);
                                            sections.push({
                                                title: `📊 Trace Steps`,
                                                content: formatted,
                                                expanded: true,
                                                persistedExpanded: true
                                            });

                                            // 2. Hot spots section (only if > 20 steps, collapsed by default)
                                            if (trace.length > 20) {
                                                const stats = getTraceStats(trace);
                                                if (stats.hotRules.length > 0) {
                                                    let hotSpotContent = '';
                                                    for (const [rule, count] of stats.hotRules.slice(0, 10)) {
                                                        hotSpotContent += `${rule}: ${count}×\n`;
                                                    }
                                                    sections.push({
                                                        title: '🔥 Hot spots',
                                                        content: hotSpotContent.trim(),
                                                        expanded: false,
                                                        persistedExpanded: false
                                                    });
                                                }
                                            }

                                            // 3. Result section
                                            const resultStr = this.repl.formatResult(result);
                                            sections.push({
                                                title: '✅ Result',
                                                content: resultStr,
                                                expanded: true,
                                                persistedExpanded: true
                                            });

                                            // 4. Performance metrics section
                                            const flatRules = rules.allRules || rules;
                                            const totalRules = flatRules.length;
                                            const totalSteps = trace.length;
                                            let metricsContent = `Total execution time: ${elapsedTime.toFixed(2)}ms\n`;
                                            metricsContent += `Total rules in system: ${totalRules} rules\n`;
                                            metricsContent += `Total rewrite steps: ${totalSteps} steps\n`;

                                            if (totalSteps > 0) {
                                                const avgTimePerStep = elapsedTime / totalSteps;
                                                metricsContent += `Average time per step: ${avgTimePerStep.toFixed(3)}ms\n`;

                                                // Estimate rules checked (with indexing optimization)
                                                const avgRulesCheckedPerStep = Math.ceil(totalRules * 0.15); // Assume 15% selectivity
                                                metricsContent += `Estimated avg rules checked per step: ~${avgRulesCheckedPerStep} (with indexing)`;
                                            }

                                            sections.push({
                                                title: '📈 Performance Metrics',
                                                content: metricsContent,
                                                expanded: false,
                                                persistedExpanded: false
                                            });

                                            // Output the accordion
                                            outputs.push({
                                                type: 'accordion',
                                                sections: sections,
                                                volatile: true
                                            });
                                        } else {
                                            // No rewrite steps
                                            outputs.push({
                                                type: 'text',
                                                content: 'No rewrite steps applied (expression is already in normal form)',
                                                volatile: true
                                            });

                                            // Still show the result
                                            const resultStr = this.repl.formatResult(result);
                                            outputs.push({
                                                type: 'result',
                                                content: resultStr
                                            });
                                        }

                                        // Store result for reference
                                        this.repl.lastResult = result;

                                        // Restore trace settings
                                        this.repl.trace = oldTrace;
                                        this.repl.traceVerbose = oldVerbose;
                                        this.repl.traceDiff = oldDiff;
                                    } catch (error) {
                                        hasError = true;
                                        outputs.push({
                                            type: 'error',
                                            content: `Error in trace command: ${error.message}`,
                                            traceback: error.stack
                                        });
                                    }
                                }
                            } else {
                                // For other commands, join with spaces for the parser
                                const content = contentLines.join(' ').trim();

                                if (!content) {
                                    outputs.push({
                                        type: 'error',
                                        content: 'Error: Empty multiline command'
                                    });
                                    hasError = true;
                                } else {
                                    // Build the full command with modifiers
                                    let fullCommand = commandType;
                                    if (commandType === ':render' && hasWatch) {
                                        fullCommand += ' watch';
                                    }
                                    fullCommand += ' ' + content;

                                    try {
                                        const result = await this.repl.commandProcessor.processCommand(fullCommand);
                                        if (result === false) {
                                            outputs.push({ type: 'text', content: 'Command would exit REPL (not allowed in notebook mode)' });
                                        }
                                    } catch (error) {
                                        hasError = true;
                                        outputs.push({
                                            type: 'error',
                                            content: `Error in multiline command: ${error.message}`,
                                            traceback: error.stack
                                        });
                                    }
                                }
                            }
                            i = j;
                        }
                    } else {
                        // Regular single-line command
                        try {
                            const result = await this.repl.commandProcessor.processCommand(trimmedLine);
                            if (result === false) {
                                outputs.push({ type: 'text', content: 'Command would exit REPL (not allowed in notebook mode)' });
                            }
                        } catch (error) {
                            hasError = true;
                            outputs.push({
                                type: 'error',
                                content: `Error in command "${trimmedLine}": ${error.message}`,
                                traceback: error.stack
                            });
                        }
                        i++;
                    }
                } else {
                    // Line doesn't start with : or ;
                    // In a command context, non-command lines are an error
                    outputs.push({
                        type: 'error',
                        content: `Invalid line in command cell (commands must start with ':'): ${trimmedLine}`
                    });
                    hasError = true;
                    i++;
                }
            }
        } catch (error) {
            hasError = true;
            outputs.push({
                type: 'error',
                content: error.message,
                traceback: error.stack
            });
        } finally {
            this.platform.removeOutputHandler(cellId);
        }

        return { outputs, hasError };
    }

    getRules() {
        return this.repl.getRules();
    }


    async loadFile(path) {
        await this.repl.loadFile(path);
    }

    async saveFile(path, format = 'auto') {
        await this.repl.saveFile(path, format);
    }

    async getCompletions(text, position) {
        try {
            if (!this.repl.autocompleter) return [];

            // Get the current line up to the cursor
            const lineToPosition = text.slice(0, position);
            const lastLine = lineToPosition.split('\n').pop() || '';

            // Get the word being completed
            const words = lastLine.split(/\s+/);
            const currentWord = words[words.length - 1] || '';

            // If it's a command (starts with :)
            if (currentWord.startsWith(':')) {
                const commands = this.repl.autocompleter.getAllCommands();
                return commands.filter(cmd => cmd.startsWith(currentWord));
            }

            // For now, return basic Syma keywords/functions
            const keywords = [
                'Universe', 'Program', 'Rules', 'Module', 'Export', 'Import', 'Defs',
                'R', 'Apply', 'Effects', 'Flow', 'EffQueue', 'Inbox',
                'Lambda', 'Let', 'If', 'Match', 'Case', 'Quote', 'Unquote',
                'Var', 'VarRest', 'Project', 'true', 'false', 'nil',
                '+', '-', '*', '/', '=', '!=', '<', '>', '<=', '>=',
                'and', 'or', 'not', 'head', 'tail', 'cons', 'append'
            ];

            return keywords.filter(kw => kw.toLowerCase().startsWith(currentWord.toLowerCase()));
        } catch (error) {
            console.warn('Error getting completions:', error);
            return [];
        }
    }

    reset() {
        this.repl.clearUniverse();
    }

    cleanupCell(cellId) {
        // Clean up platform handlers
        this.platform.cleanupCell(cellId);

        // Clean up watch projectors for this cell
        if (this.notebookCommands) {
            this.notebookCommands.cleanupWatchProjector(cellId);
        }
    }

    dispose() {
        // Clean up all watch projectors
        if (this.notebookCommands && this.notebookCommands.watchProjectors) {
            for (const [cellId, info] of this.notebookCommands.watchProjectors.entries()) {
                this.notebookCommands.cleanupWatchProjector(cellId);
            }
        }

        this.platform.cleanup();
        if (this.repl.effectsProcessor) {
            this.repl.effectsProcessor.cleanup();
        }
    }
}

// Singleton instance
let engineInstance = null;

export function getNotebookEngine() {
    if (!engineInstance) {
        engineInstance = new NotebookEngine();
    }
    return engineInstance;
}
import { SymaREPL } from '../repl/repl.js';
import * as engine from '../core/engine.js';
import { foldPrims } from '../primitives.js';
import { NotebookCommands } from './notebook-commands.js';

class NotebookPlatform {
    constructor() {
        this.outputHandlers = new Map();
        this.currentCellId = null;
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

        this.initialized = true;
    }

    async executeCode(cellId, code, onOutput = null) {
        await this.initialize();

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

            // Normalize the expression
            const result = engine.normalize(expr, rules, this.repl.maxSteps, false, foldPrims);

            // Format the result
            const output = this.repl.formatResult(result);

            // Store result for reference
            this.repl.lastResult = result;

            // Wait for any effects
            await this.repl.waitForEffects();

            outputs.push({
                type: 'result',
                content: output
            });

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

        const outputs = [];
        let hasError = false;

        // Set up output handler that can handle both text and DOM outputs
        this.platform.setOutputHandler(cellId, (output) => {
            if (typeof output === 'string') {
                outputs.push({ type: 'text', content: output });
            } else if (output && typeof output === 'object') {
                // Handle structured outputs (like DOM elements)
                outputs.push(output);
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
                    if (trimmedLine === ':rule multiline' || trimmedLine === ':add multiline' || trimmedLine === ':render multiline') {
                        const commandType = trimmedLine.split(' ')[0]; // :rule, :add, or :render
                        // Collect everything until :end
                        let ruleLines = [];
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
                            ruleLines.push(lines[j]);
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
                            // Join the lines with spaces (not newlines) for the parser
                            const ruleContent = ruleLines.join(' ').trim();

                            if (!ruleContent) {
                                outputs.push({
                                    type: 'error',
                                    content: 'Error: Empty multiline command'
                                });
                                hasError = true;
                            } else {
                                // Process as a regular command
                                const fullCommand = commandType + ' ' + ruleContent;

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

    dispose() {
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
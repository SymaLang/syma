/*****************************************************************
 * REPL Command Processor
 *
 * Handles all colon-prefixed commands in the REPL
 ******************************************************************/

import * as engine from '@syma/core/engine';

// Import command modules
import { FileCommands } from './commands/file-commands.js';
import { RuleCommands } from './commands/rule-commands.js';
import { EvaluationCommands } from './commands/evaluation-commands.js';
import { MatchCommands } from './commands/match-commands.js';

export class CommandProcessor {
    constructor(repl) {
        this.repl = repl;

        // Initialize command modules
        this.fileCommands = new FileCommands(repl);
        this.ruleCommands = new RuleCommands(repl);
        this.evaluationCommands = new EvaluationCommands(repl);
        this.matchCommands = new MatchCommands(repl);

        this.commands = {
            // Basic commands
            'help': this.help.bind(this),
            'h': this.help.bind(this),
            'quit': this.quit.bind(this),
            'q': this.quit.bind(this),
            'exit': this.quit.bind(this),

            // File operations (delegated)
            'save': this.fileCommands.save.bind(this.fileCommands),
            'load': this.fileCommands.load.bind(this.fileCommands),
            'bundle': this.fileCommands.bundle.bind(this.fileCommands),
            'reload': this.fileCommands.reload.bind(this.fileCommands),
            'export': this.fileCommands.export.bind(this.fileCommands),
            'import': this.fileCommands.import.bind(this.fileCommands),

            // Universe management
            'clear': this.clear.bind(this),
            'universe': this.showUniverse.bind(this),
            'u': this.showUniverse.bind(this),
            'program': this.showProgram.bind(this),
            'p': this.showProgram.bind(this),
            'undo': this.undo.bind(this),
            'history': this.showHistory.bind(this),

            // Rule management (delegated)
            'rules': this.ruleCommands.listRules.bind(this.ruleCommands),
            'rule': this.ruleCommands.showOrEditRule.bind(this.ruleCommands),
            'drop': this.ruleCommands.dropRule.bind(this.ruleCommands),
            'edit': this.ruleCommands.editRule.bind(this.ruleCommands),
            'rules-section': this.ruleCommands.showRulesSection.bind(this.ruleCommands),
            'rs': this.ruleCommands.showRulesSection.bind(this.ruleCommands),
            'rulerules': this.ruleCommands.showRuleRulesSection.bind(this.ruleCommands),
            'rr': this.ruleCommands.showRuleRulesSection.bind(this.ruleCommands),
            'macro-scopes': this.ruleCommands.showMacroScopes.bind(this.ruleCommands),

            // Evaluation commands (delegated)
            'exec': this.evaluationCommands.smartExecRule.bind(this.evaluationCommands),
            'trace': this.evaluationCommands.trace.bind(this.evaluationCommands),
            'why': this.evaluationCommands.explainStuck.bind(this.evaluationCommands),
            'apply': this.evaluationCommands.applyToState.bind(this.evaluationCommands),
            'norm': this.evaluationCommands.normalizeUniverse.bind(this.evaluationCommands),

            // Pattern matching (delegated)
            'match': this.matchCommands.matchPattern.bind(this.matchCommands),
            'm': this.matchCommands.matchPattern.bind(this.matchCommands),

            // Settings
            'set': this.setOption.bind(this),
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

    // Command implementations for basic/core commands only

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
}
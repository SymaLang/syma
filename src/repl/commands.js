/*****************************************************************
 * REPL Command Processor
 *
 * Handles all colon-prefixed commands in the REPL
 ******************************************************************/

import { Sym, Str, Num, Call } from '../ast-helpers.js';
import * as engine from '../core/engine.js';

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
            'export': this.export.bind(this),
            'import': this.import.bind(this),
            'clear': this.clear.bind(this),
            'rules': this.listRules.bind(this),
            'rule': this.showOrEditRule.bind(this),
            'exec': this.execRule.bind(this),
            'trace': this.trace.bind(this),
            'why': this.explainStuck.bind(this),
            'apply': this.applyToState.bind(this),
            'drop': this.dropRule.bind(this),
            'edit': this.editRule.bind(this),
            'undo': this.undo.bind(this),
            'history': this.showHistory.bind(this),
            'set': this.setOption.bind(this)
        };
    }

    async processCommand(input) {
        const parts = input.slice(1).split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        if (command in this.commands) {
            return await this.commands[command](args, input.slice(command.length + 2));
        } else {
            this.repl.platform.print(`Unknown command: ${command}. Type :help for available commands.`);
            return true;
        }
    }

    // Command implementations

    async help(args) {
        this.repl.platform.print(`
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
  :export <module>          Export single module to file
  :import <file> [open]     Import module into universe

Universe management:
  :clear                    Reset universe to empty state
  :undo                     Undo last modification

Rule management:
  :rules                    List all rules
  :rule                     Enter multiline rule definition mode
  :rule <name>              Show specific rule
  :rule <name> <pat> → <repl>  Define inline rule
  :drop <name>              Remove rule
  :edit <name> <pat> → <repl>  Replace existing rule

Evaluation:
  :exec <name> <expr>       Apply specific rule to expression
  :trace <expr>             Evaluate with step-by-step trace
  :why <expr>               Explain why evaluation got stuck
  :apply <action>           Apply action to current universe state

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
            this.repl.platform.print("Usage: :save <filename>");
            return true;
        }

        try {
            await this.repl.saveFile(filename);
            this.repl.platform.print(`Universe saved to ${filename}`);
        } catch (error) {
            this.repl.platform.print(`Failed to save: ${error.message}`);
        }
        return true;
    }

    async load(args, rawArgs) {
        const filename = args[0];
        if (!filename) {
            this.repl.platform.print("Usage: :load <filename>");
            return true;
        }

        try {
            await this.repl.loadFile(filename);
            this.repl.platform.print(`Universe loaded from ${filename}`);
        } catch (error) {
            this.repl.platform.print(`Failed to load: ${error.message}`);
        }
        return true;
    }

    async export(args, rawArgs) {
        const moduleName = args[0];
        const filename = args[1];

        if (!moduleName) {
            this.repl.platform.print("Usage: :export <module> [filename]");
            return true;
        }

        this.repl.platform.print("Module export not yet implemented");
        return true;
    }

    async import(args, rawArgs) {
        const filename = args[0];
        const open = args[1] === 'open';

        if (!filename) {
            this.repl.platform.print("Usage: :import <filename> [open]");
            return true;
        }

        try {
            // Read and parse the module file
            const content = await this.repl.platform.readFile(filename);
            const module = this.repl.parser.parseString(content, filename);

            // TODO: Properly merge module into universe with symbol qualification
            this.repl.platform.print(`Module imported from ${filename}${open ? ' (open)' : ''}`);
        } catch (error) {
            this.repl.platform.print(`Failed to import: ${error.message}`);
        }
        return true;
    }

    async clear(args) {
        this.repl.clearUniverse();
        this.repl.platform.print("Universe cleared");
        return true;
    }

    async listRules(args) {
        const rules = this.repl.getRules();
        if (rules.length === 0) {
            this.repl.platform.print("No rules defined");
        } else {
            this.repl.platform.print(`Rules (${rules.length}):`);
            for (const rule of rules) {
                const priority = rule.prio !== 0 ? ` [${rule.prio}]` : '';
                this.repl.platform.print(`  ${rule.name}${priority}`);
            }
        }
        return true;
    }

    async showOrEditRule(args, rawArgs) {
        if (args.length === 0) {
            // Enter multiline rule definition mode
            this.repl.platform.print("Enter rule definition (end with '.' on a new line):");
            this.repl.multilineMode = true;
            this.repl.multilineBuffer = [];

            // Override multiline completion handler
            const originalProcess = this.repl.processCompleteInput;
            this.repl.processCompleteInput = async (input) => {
                try {
                    const ruleAst = this.repl.parser.parseString(input);
                    this.repl.addRule(ruleAst);
                    this.repl.platform.print("Rule added");
                } catch (error) {
                    this.repl.platform.print(`Failed to parse rule: ${error.message}`);
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
                const ruleText = rawArgs;
                const ruleAst = this.repl.parser.parseInlineRule(name, ruleText);
                this.repl.addRule(ruleAst);
                this.repl.platform.print(`Rule "${name}" added`);
            } catch (error) {
                this.repl.platform.print(`Failed to parse rule: ${error.message}`);
            }
            return true;
        }

        // Show specific rule
        const rules = this.repl.getRules();
        const rule = rules.find(r => r.name === name);
        if (rule) {
            // Format rule for display
            const lhsStr = this.repl.parser.nodeToString(rule.lhs);
            const rhsStr = this.repl.parser.nodeToString(rule.rhs);
            const prioStr = rule.prio !== 0 ? `, ${rule.prio}` : '';
            const guardStr = rule.guard ? `, :guard ${this.repl.parser.nodeToString(rule.guard)}` : '';
            const output = `R("${rule.name}",\n  ${lhsStr},\n  ${rhsStr}${guardStr}${prioStr})`;
            this.repl.platform.print(output);
        } else {
            this.repl.platform.print(`Rule "${name}" not found`);
        }
        return true;
    }

    async execRule(args, rawArgs) {
        if (args.length < 2) {
            this.repl.platform.print("Usage: :exec <rule-name> <expression>");
            return true;
        }

        const ruleName = args[0];
        const exprText = args.slice(1).join(' ');

        try {
            const expr = this.repl.parser.parseString(exprText);
            const rules = this.repl.getRules();
            const rule = rules.find(r => r.name === ruleName);

            if (!rule) {
                this.repl.platform.print(`Rule "${ruleName}" not found`);
                return true;
            }

            // Try to apply the specific rule
            const env = engine.match(rule.lhs, expr);
            if (env) {
                const result = engine.subst(rule.rhs, env);
                const output = this.repl.formatResult(result);
                this.repl.platform.print(`→ ${output}`);
            } else {
                this.repl.platform.print(`Rule "${ruleName}" does not match expression`);
            }
        } catch (error) {
            this.repl.platform.print(`Error: ${error.message}`);
        }
        return true;
    }

    async trace(args, rawArgs) {
        if (args.length === 0) {
            // Toggle trace mode
            this.repl.trace = !this.repl.trace;
            this.repl.platform.print(`Trace mode: ${this.repl.trace ? 'on' : 'off'}`);
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
            this.repl.platform.print("Usage: :why <expression>");
            return true;
        }

        const exprText = args.join(' ');
        try {
            const expr = this.repl.parser.parseString(exprText);
            const rules = this.repl.getRules();

            this.repl.platform.print("Checking why expression is stuck...\n");

            let foundCandidates = false;
            for (const rule of rules) {
                // Try partial matching to see how close we are
                const analysis = this.analyzeRuleMatch(rule, expr);
                if (analysis.partial) {
                    foundCandidates = true;
                    this.repl.platform.print(`Rule "${rule.name}" partially matches:`);
                    this.repl.platform.print(`  Pattern: ${this.repl.parser.nodeToString(rule.lhs)}`);
                    this.repl.platform.print(`  Issue: ${analysis.reason}`);
                    this.repl.platform.print("");
                }
            }

            if (!foundCandidates) {
                this.repl.platform.print("No rules come close to matching this expression");
            }
        } catch (error) {
            this.repl.platform.print(`Error: ${error.message}`);
        }
        return true;
    }

    analyzeRuleMatch(rule, expr) {
        // Simple analysis - check if heads match at least
        const lhs = rule.lhs;

        if (engine.isCall(lhs) && engine.isCall(expr)) {
            if (engine.deq(lhs.h, expr.h)) {
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
            this.repl.platform.print("Usage: :apply <action>");
            return true;
        }

        const actionText = args.join(' ');
        try {
            const action = this.repl.parser.parseString(actionText);
            this.repl.applyAction(action);

            // Show the updated program state
            const program = engine.getProgram(this.repl.universe);
            const output = this.repl.formatResult(program);
            this.repl.platform.print(`Program updated:\n${output}`);
        } catch (error) {
            this.repl.platform.print(`Error: ${error.message}`);
        }
        return true;
    }

    async dropRule(args) {
        if (args.length === 0) {
            this.repl.platform.print("Usage: :drop <rule-name>");
            return true;
        }

        const name = args[0];
        const rules = this.repl.getRules();
        const exists = rules.some(r => r.name === name);

        if (exists) {
            this.repl.removeRule(name);
            this.repl.platform.print(`Rule "${name}" removed`);
        } else {
            this.repl.platform.print(`Rule "${name}" not found`);
        }
        return true;
    }

    async editRule(args, rawArgs) {
        if (args.length < 1) {
            this.repl.platform.print("Usage: :edit <name> <pattern> → <replacement>");
            return true;
        }

        const name = args[0];
        const ruleText = rawArgs.slice(name.length).trim();

        if (!ruleText.includes('→') && !ruleText.includes('->')) {
            this.repl.platform.print("Rule must contain → or ->");
            return true;
        }

        try {
            // Remove old rule if exists
            this.repl.removeRule(name);

            // Add new rule
            const ruleAst = this.repl.parser.parseInlineRule(name, ruleText);
            this.repl.addRule(ruleAst);
            this.repl.platform.print(`Rule "${name}" updated`);
        } catch (error) {
            this.repl.platform.print(`Failed to parse rule: ${error.message}`);
        }
        return true;
    }

    async undo(args) {
        try {
            this.repl.undo();
            this.repl.platform.print("Last modification undone");
        } catch (error) {
            this.repl.platform.print(error.message);
        }
        return true;
    }

    async showHistory(args) {
        const count = args[0] ? parseInt(args[0]) : 20;
        const start = Math.max(0, this.repl.history.length - count);
        const slice = this.repl.history.slice(start);

        if (slice.length === 0) {
            this.repl.platform.print("No history");
        } else {
            this.repl.platform.print(`History (last ${slice.length} entries):`);
            slice.forEach((entry, i) => {
                this.repl.platform.print(`  ${start + i + 1}: ${entry}`);
            });
        }
        return true;
    }

    async setOption(args) {
        if (args.length < 2) {
            this.repl.platform.print("Usage: :set <option> <value>");
            this.repl.platform.print("Available options:");
            this.repl.platform.print("  trace on/off     - Enable/disable trace mode");
            this.repl.platform.print("  maxsteps <n>     - Maximum normalization steps");
            return true;
        }

        const option = args[0].toLowerCase();
        const value = args.slice(1).join(' ');

        switch (option) {
            case 'trace':
                this.repl.trace = value === 'on' || value === 'true';
                this.repl.platform.print(`Trace mode: ${this.repl.trace ? 'on' : 'off'}`);
                break;

            case 'maxsteps':
                const steps = parseInt(value);
                if (isNaN(steps) || steps <= 0) {
                    this.repl.platform.print("maxsteps must be a positive integer");
                } else {
                    this.repl.maxSteps = steps;
                    this.repl.platform.print(`Max steps set to ${steps}`);
                }
                break;

            default:
                this.repl.platform.print(`Unknown option: ${option}`);
        }
        return true;
    }
}
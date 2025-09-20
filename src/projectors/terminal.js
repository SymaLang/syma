/*****************************************************************
 * Terminal Projector
 *
 * Renders Syma AST to terminal-friendly text output
 ******************************************************************/

import { BaseProjector } from './base.js';
import { K, isSym, isNum, isStr, isCall } from '../ast-helpers.js';
import * as engine from '../core/engine.js';
import { escapeStringForDisplay } from '../core/parser.js';

export class TerminalProjector extends BaseProjector {
    constructor() {
        super();
        this.colorize = false; // Can be enabled for color output
        this.universe = null;
        this.normalizeFunc = null;
        this.extractRulesFunc = null;
    }

    init(config) {
        super.init(config);
        this.colorize = config.options?.color || false;

        // Store references to runtime functions (like DOM projector does)
        this.normalizeFunc = config.options?.normalize;
        this.extractRulesFunc = config.options?.extractRules;
        this.universe = config.options?.universe;

        return this;
    }

    render(universe) {
        // Store universe for /@ handling
        this.universe = universe;

        // For REPL, we typically want to show the result of evaluation
        // rather than the full universe structure
        if (this.mount && this.mount.write) {
            const output = this.formatUniverse(universe);
            this.mount.write(output + '\n');
        } else if (this.mount && this.mount.print) {
            const output = this.formatUniverse(universe);
            this.mount.print(output);
        }
    }

    formatUniverse(universe) {
        // In REPL context, usually we just want to show the program result
        try {
            const program = engine.getProgram(universe);
            if (program && program.a.length > 0) {
                // If it's an App structure, show just the state
                const app = program.a.find(n => isCall(n) && isSym(n.h) && n.h.v === 'App');
                if (app && app.a.length > 0) {
                    return this.prettyPrint(app.a[0]); // Show the state
                }
                // Otherwise show the first element of program
                return this.prettyPrint(program.a[0]);
            }
        } catch (e) {
            // If no program, just show the universe
        }
        return this.prettyPrint(universe);
    }

    project(node, state) {
        // Terminal projection is just pretty-printing
        return this.prettyPrint(node);
    }

    prettyPrint(node, indent = 0) {
        if (isNum(node)) return this.formatNum(node.v);
        if (isStr(node)) return this.formatStr(node.v);
        if (isSym(node)) return this.formatSym(node.v);

        if (isCall(node)) {
            const head = node.h;

            // Special formatting for certain constructs
            if (isSym(head)) {
                switch (head.v) {
                    case '/@':
                        // Handle projection operator by normalizing it
                        // This matches the DOM projector behavior
                        if (this.normalizeFunc && this.extractRulesFunc && this.universe) {
                            const currentRules = this.extractRulesFunc(this.universe);
                            const reduced = this.normalizeFunc(node, currentRules);
                            return this.prettyPrint(reduced, indent);
                        }
                        // If can't normalize, format as regular call
                        return this.formatBraceCall(node, indent);
                    case 'R':
                        return this.formatRule(node, indent);
                    case 'Var':
                    case 'VarRest':
                        return this.formatVar(node);
                    case 'Module':
                        return this.formatModule(node, indent);
                    case 'Universe':
                        return this.formatUniverse(node, indent);
                    case 'Rules':
                    case 'RuleRules':
                        return this.formatRules(node, indent);
                }

                // Check if this should use function syntax
                if (this.prefersFunctionSyntax(head.v)) {
                    return this.formatFunctionCall(node, indent);
                }
            }

            // Default Call formatting with braces
            return this.formatBraceCall(node, indent);
        }

        // Fallback for unknown node types
        return JSON.stringify(node);
    }

    formatNum(value) {
        if (this.colorize) {
            return `\x1b[33m${value}\x1b[0m`; // Yellow
        }
        return String(value);
    }

    formatStr(value) {
        // Use the shared escape function for consistency
        const str = `"${escapeStringForDisplay(value)}"`;
        if (this.colorize) {
            return `\x1b[32m${str}\x1b[0m`; // Green
        }
        return str;
    }

    formatSym(value) {
        if (this.colorize) {
            // Color built-ins differently
            const builtins = ['True', 'False', 'Add', 'Sub', 'Mul', 'Div', 'If'];
            if (builtins.includes(value)) {
                return `\x1b[35m${value}\x1b[0m`; // Magenta
            }
            return `\x1b[36m${value}\x1b[0m`; // Cyan
        }
        return value;
    }

    formatVar(node) {
        if (!node.a || node.a.length === 0) return '{Var}';
        const name = isStr(node.a[0]) ? node.a[0].v : this.prettyPrint(node.a[0]);

        if (isSym(node.h) && node.h.v === 'VarRest') {
            if (name === '_') return '...';
            return `${name}...`;
        }

        if (name === '_') return '_';
        return `${name}_`;
    }

    formatRule(node, indent) {
        if (node.a.length < 3) return this.formatBraceCall(node, indent);

        const [name, pattern, replacement, ...rest] = node.a;
        const spaces = ' '.repeat(indent);

        let output = `${spaces}R(${this.prettyPrint(name)},\n`;
        output += `${spaces}  ${this.prettyPrint(pattern, indent + 2)},\n`;
        output += `${spaces}  ${this.prettyPrint(replacement, indent + 2)}`;

        if (rest.length > 0) {
            output += rest.map(r => `,\n${spaces}  ${this.prettyPrint(r, indent + 2)}`).join('');
        }

        output += ')';
        return output;
    }

    formatModule(node, indent) {
        const spaces = ' '.repeat(indent);
        const args = node.a.map(a => this.prettyPrint(a, indent + 2));
        return `${spaces}Module(\n${spaces}  ${args.join(',\n' + spaces + '  ')}\n${spaces})`;
    }

    formatUniverse(node, indent) {
        const spaces = ' '.repeat(indent);
        const sections = node.a.map(a => this.prettyPrint(a, indent + 2));
        return `${spaces}Universe(\n${spaces}  ${sections.join(',\n' + spaces + '  ')}\n${spaces})`;
    }

    formatRules(node, indent) {
        const spaces = ' '.repeat(indent);
        const head = this.prettyPrint(node.h);

        if (node.a.length === 0) {
            return `${spaces}${head}()`;
        }

        const rules = node.a.map(r => this.prettyPrint(r, indent + 2));
        return `${spaces}${head}(\n${spaces}  ${rules.join(',\n' + spaces + '  ')}\n${spaces})`;
    }

    formatFunctionCall(node, indent) {
        const head = this.prettyPrint(node.h);

        if (node.a.length === 0) {
            return `${head}()`;
        }

        const args = node.a.map(a => this.prettyPrint(a));

        // Multi-line if complex
        if (this.isComplex(node) || args.some(a => a.includes('\n'))) {
            const spaces = ' '.repeat(indent);
            return `${head}(\n${spaces}  ${args.join(',\n' + spaces + '  ')}\n${spaces})`;
        }

        return `${head}(${args.join(', ')})`;
    }

    formatBraceCall(node, indent) {
        const head = this.prettyPrint(node.h);

        if (node.a.length === 0) {
            return `{${head}}`;
        }

        const args = node.a.map(a => this.prettyPrint(a));

        // Multi-line if complex
        if (this.isComplex(node) || args.some(a => a.includes('\n'))) {
            const spaces = ' '.repeat(indent);
            return `{${head}\n${spaces}  ${args.join('\n' + spaces + '  ')}\n${spaces}}`;
        }

        return `{${head} ${args.join(' ')}}`;
    }

    prefersFunctionSyntax(sym) {
        const functionLike = [
            'Add', 'Sub', 'Mul', 'Div', 'Mod', 'Pow', 'Sqrt', 'Abs',
            'Min', 'Max', 'Floor', 'Ceil', 'Round',
            'Concat', 'ToString', 'ToUpper', 'ToLower', 'Trim',
            'StrLen', 'Substring', 'IndexOf', 'Replace',
            'Eq', 'Neq', 'Lt', 'Gt', 'Lte', 'Gte',
            'And', 'Or', 'Not',
            'IsNum', 'IsStr', 'IsSym', 'IsTrue', 'IsFalse',
            'FreshId', 'Random', 'ParseNum', 'Debug'
        ];
        return functionLike.includes(sym);
    }

    isComplex(node) {
        if (!isCall(node)) return false;

        // Complex if has many args or nested calls
        if (node.a.length > 3) return true;

        return node.a.some(a => isCall(a) && a.a.length > 0);
    }
}
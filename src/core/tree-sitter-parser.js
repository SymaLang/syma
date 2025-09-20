/*****************************************************************
 * Tree-Sitter Based Syma Parser
 *
 * Drop-in replacement for the hand-written parser that uses
 * tree-sitter for parsing and converts to the same AST format.
 ******************************************************************/

import { K, Sym, Num, Str, Call } from '../ast-helpers.js';
import { escapeStringForDisplay } from './parser.js';

export class SymaTreeSitterParser {
    constructor() {
        this.parser = null;
        this.language = null;
        this.sourceText = '';
        this.filename = '<input>';
    }

    // Initialize tree-sitter (async for web, sync for Node.js)
    async initialize() {
        if (typeof window !== 'undefined') {
            // Browser environment - use web-tree-sitter
            const Parser = (await import('web-tree-sitter')).default;
            await Parser.init();

            this.parser = new Parser();
            const wasmPath = new URL('/tree-sitter-syma.wasm', import.meta.url).href;
            this.language = await Parser.Language.load(wasmPath);
            this.parser.setLanguage(this.language);
        } else {
            // Node.js environment
            try {
                const { createRequire } = await import('module');
                const require = createRequire(import.meta.url);

                const Parser = require('tree-sitter');
                const Language = require('../../tree-sitter-syma/build/Release/tree_sitter_syma_binding.node');

                this.parser = new Parser();
                this.parser.setLanguage(Language);
            } catch (e) {
                console.error('Failed to load tree-sitter:', e);
                throw new Error('Tree-sitter parser not built. Run: cd tree-sitter-syma && npx node-gyp rebuild');
            }
        }
    }

    // Error handling
    die(msg, node = null) {
        if (node && node.startPosition) {
            const pos = node.startPosition;
            throw new Error(`${msg} at ${this.filename}:${pos.row + 1}:${pos.column + 1}`);
        } else {
            throw new Error(msg);
        }
    }

    // Convert tree-sitter node to our AST format
    nodeToAST(node) {
        switch (node.type) {
            case 'number':
                const numStr = this.sourceText.substring(node.startIndex, node.endIndex);
                const num = Number(numStr);
                if (!Number.isFinite(num)) {
                    this.die(`Bad number: ${numStr}`, node);
                }
                return Num(num);

            case 'string':
                // Remove quotes and process escape sequences
                let str = this.sourceText.substring(node.startIndex + 1, node.endIndex - 1);
                str = str.replace(/\\n/g, '\n')
                         .replace(/\\r/g, '\r')
                         .replace(/\\t/g, '\t')
                         .replace(/\\"/g, '"')
                         .replace(/\\\\/g, '\\');
                return Str(str);

            case 'symbol':
                const sym = this.sourceText.substring(node.startIndex, node.endIndex);
                return Sym(sym);

            case 'var_pattern': {
                const pattern = this.sourceText.substring(node.startIndex, node.endIndex);
                if (pattern === '_') {
                    // Just _ is wildcard
                    return Call(Sym('Var'), Str('_'));
                } else {
                    // Remove trailing underscore to get the name
                    const name = pattern.slice(0, -1);
                    return Call(Sym('Var'), Str(name));
                }
            }

            case 'var_rest_pattern': {
                const pattern = this.sourceText.substring(node.startIndex, node.endIndex);
                if (pattern === '...' || pattern === '___') {
                    // Just ... or ___ is wildcard rest
                    return Call(Sym('VarRest'), Str('_'));
                } else if (pattern.endsWith('...')) {
                    // Remove ... suffix to get the name
                    let name = pattern.slice(0, -3);
                    // Also remove trailing underscore if present (e.g., xs_...)
                    if (name.endsWith('_')) {
                        name = name.slice(0, -1);
                    }
                    return Call(Sym('VarRest'), Str(name));
                } else if (pattern.endsWith('___')) {
                    // Remove ___ suffix to get the name
                    const name = pattern.slice(0, -3);
                    return Call(Sym('VarRest'), Str(name));
                }
                // Shouldn't reach here if grammar is correct
                return Sym(pattern);
            }

            case 'brace_call': {
                const head = node.childForFieldName('head');
                if (!head) {
                    this.die('Brace expression missing head', node);
                }

                const headAST = this.nodeToAST(head);
                const args = [];

                // Get all argument nodes
                const argNodes = node.childrenForFieldName('arguments');
                for (const argNode of argNodes) {
                    args.push(this.nodeToAST(argNode));
                }

                return Call(headAST, ...args);
            }

            case 'function_call': {
                const funcNode = node.childForFieldName('function');
                if (!funcNode) {
                    this.die('Function call missing function name', node);
                }

                const funcName = this.sourceText.substring(funcNode.startIndex, funcNode.endIndex);
                const args = [];

                // Parse arguments between parentheses
                for (let i = 0; i < node.childCount; i++) {
                    const child = node.child(i);
                    if (child && child.type === 'expression') {
                        args.push(this.nodeToAST(child));
                    }
                }

                return Call(Sym(funcName), ...args);
            }

            case 'expression':
                // Expression is a wrapper, delegate to its child
                if (node.childCount > 0) {
                    return this.nodeToAST(node.child(0));
                }
                this.die('Empty expression', node);
                break;

            case 'source_file':
                // Multiple top-level expressions
                const exprs = [];
                for (let i = 0; i < node.childCount; i++) {
                    const child = node.child(i);
                    if (child && child.type !== 'comment') {
                        exprs.push(this.nodeToAST(child));
                    }
                }

                if (exprs.length === 0) {
                    this.die('No expression found');
                } else if (exprs.length === 1) {
                    return exprs[0];
                } else {
                    // Multiple top-level expressions - wrap in a Bundle
                    return Call(Sym('Bundle'), ...exprs);
                }

            default:
                // Skip comments and other non-expression nodes
                if (node.type === 'comment') {
                    return null;
                }
                this.die(`Unexpected node type: ${node.type}`, node);
        }
    }

    // Parse string using tree-sitter
    parseString(src, filename = '<input>') {
        if (!this.parser) {
            throw new Error('Parser not initialized. Call initialize() first.');
        }

        this.sourceText = src;
        this.filename = filename;

        const tree = this.parser.parse(src);

        // Check for parsing errors
        if (tree.rootNode.hasError) {
            // Find the first error node
            const findError = (node) => {
                if (node.type === 'ERROR') {
                    return node;
                }
                for (let i = 0; i < node.childCount; i++) {
                    const errorNode = findError(node.child(i));
                    if (errorNode) return errorNode;
                }
                return null;
            };

            const errorNode = findError(tree.rootNode);
            if (errorNode) {
                const pos = errorNode.startPosition;
                const endPos = errorNode.endPosition;
                const errorText = src.substring(errorNode.startIndex, errorNode.endIndex);
                this.die(`Parse error near "${errorText}"`, errorNode);
            } else {
                this.die('Parse error');
            }
        }

        return this.nodeToAST(tree.rootNode);
    }

    // Compatibility with existing parser API
    parseFile(content, filename) {
        return this.parseString(content, filename);
    }

    // REPL-specific parsing (copied from original parser)
    parseInlineRule(name, ruleText) {
        // Parse inline rule syntax: pattern → replacement [priority]
        const arrow = ruleText.includes('→') ? '→' : '->';
        const parts = ruleText.split(arrow);
        if (parts.length !== 2) {
            throw new Error('Rule must have pattern and replacement separated by → or ->');
        }

        const pattern = this.parseString(parts[0].trim());
        const replacementAndPrio = parts[1].trim();

        // Check if there's a priority at the end (number)
        const lastSpace = replacementAndPrio.lastIndexOf(' ');
        let replacement, priority = null;

        if (lastSpace !== -1) {
            const lastPart = replacementAndPrio.slice(lastSpace + 1);
            if (/^\d+$/.test(lastPart)) {
                priority = parseInt(lastPart);
                replacement = this.parseString(replacementAndPrio.slice(0, lastSpace));
            } else {
                replacement = this.parseString(replacementAndPrio);
            }
        } else {
            replacement = this.parseString(replacementAndPrio);
        }

        // Build R[name, pattern, replacement, priority?]
        const ruleArgs = [Str(name), pattern, replacement];
        if (priority !== null) {
            ruleArgs.push(Num(priority));
        }

        return Call(Sym('R'), ...ruleArgs);
    }

    // AST to string conversion (copied from original parser)
    nodeToString(node, indent = 0) {
        const isSym = n => n && n.k === K.Sym;
        const isNum = n => n && n.k === K.Num;
        const isStr = n => n && n.k === K.Str;
        const isCall = n => n && n.k === K.Call;

        if (isNum(node)) return String(node.v);
        if (isStr(node)) return `"${escapeStringForDisplay(node.v)}"`;
        if (isSym(node)) return node.v;

        if (isCall(node)) {
            // Handle Var shorthand
            if (isSym(node.h) && node.h.v === 'Var' &&
                node.a.length === 1 && isStr(node.a[0])) {
                const name = node.a[0].v;
                if (name === '_') {
                    return '_';
                } else {
                    return `${name}_`;
                }
            }

            // Handle VarRest shorthand
            if (isSym(node.h) && node.h.v === 'VarRest' &&
                node.a.length === 1 && isStr(node.a[0])) {
                const name = node.a[0].v;
                if (name === '_') {
                    return '...';
                } else {
                    return `${name}...`;
                }
            }

            const head = this.nodeToString(node.h);
            const args = node.a.map(a => this.nodeToString(a, indent));

            // Check for special forms that should use function syntax
            if (isSym(node.h) && this.prefersFunctionSyntax(node.h.v)) {
                if (args.length === 0) return `${head}()`;
                return `${head}(${args.join(', ')})`;
            }

            // Default to brace syntax
            if (args.length === 0) return `{${head}}`;
            return `{${head} ${args.join(' ')}}`;
        }

        return JSON.stringify(node);
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
            'FreshId', 'Random', 'ParseNum', 'Debug',
            'R', 'Apply', '/@',
            'App', 'State'
        ];
        return functionLike.includes(sym);
    }

    // Pretty print (copied from original parser)
    prettyPrint(node, indent = 0, options = {}) {
        const defaultOptions = {
            indentSize: 2,
            maxInlineLength: 60,
            maxInlineArgs: 3,
            bracketStyle: 'auto',
        };
        const opts = { ...defaultOptions, ...options };

        const isSym = n => n && n.k === K.Sym;
        const isNum = n => n && n.k === K.Num;
        const isStr = n => n && n.k === K.Str;
        const isCall = n => n && n.k === K.Call;
        const spaces = ' '.repeat(indent * opts.indentSize);

        // Atoms
        if (isNum(node)) return String(node.v);
        if (isStr(node)) return `"${escapeStringForDisplay(node.v)}"`;
        if (isSym(node)) return node.v;

        // Calls
        if (isCall(node)) {
            // Handle Var shorthand
            if (isSym(node.h) && node.h.v === 'Var' &&
                node.a.length === 1 && isStr(node.a[0])) {
                const name = node.a[0].v;
                if (name === '_') {
                    return '_';
                } else {
                    return `${name}_`;
                }
            }

            // Handle VarRest shorthand
            if (isSym(node.h) && node.h.v === 'VarRest' &&
                node.a.length === 1 && isStr(node.a[0])) {
                const name = node.a[0].v;
                if (name === '_') {
                    return '...';
                } else {
                    return `${name}...`;
                }
            }

            const head = this.prettyPrint(node.h, 0, opts);

            // Special handling for attributes
            const hasAttributes = node.a.some(a => isSym(a) && a.v.startsWith(':'));

            // Determine if we should use function syntax
            const useFunctionSyntax = opts.bracketStyle === 'function' ||
                (opts.bracketStyle === 'auto' && isSym(node.h) && this.prefersFunctionSyntax(node.h.v));

            // Try inline format first
            const inlineArgs = node.a.map(a => this.nodeToString(a, 0));
            const inline = useFunctionSyntax
                ? `${head}(${inlineArgs.join(', ')})`
                : `{${head}${inlineArgs.length > 0 ? ' ' + inlineArgs.join(' ') : ''}}`;

            // Use inline if it's short enough
            const shouldInline = inline.length <= opts.maxInlineLength &&
                                node.a.length <= opts.maxInlineArgs &&
                                !hasAttributes &&
                                !node.a.some(a => isCall(a) && a.a.length > 2);

            if (shouldInline) {
                return inline;
            }

            // Otherwise use multiline format
            const nextIndent = indent + 1;
            const childSpaces = ' '.repeat(nextIndent * opts.indentSize);

            // Format arguments with proper indentation
            const formattedArgs = [];
            let i = 0;
            while (i < node.a.length) {
                const arg = node.a[i];

                // Handle attribute-value pairs
                if (isSym(arg) && arg.v.startsWith(':')) {
                    if (i + 1 < node.a.length) {
                        const value = this.nodeToString(node.a[i + 1], 0);
                        formattedArgs.push(`${arg.v} ${value}`);
                        i += 2;
                    } else {
                        formattedArgs.push(this.prettyPrint(arg, nextIndent, opts));
                        i++;
                    }
                } else {
                    formattedArgs.push(this.prettyPrint(arg, nextIndent, opts));
                    i++;
                }
            }

            if (useFunctionSyntax) {
                if (formattedArgs.length === 0) {
                    return `${head}()`;
                }
                return `${head}(\n${formattedArgs.map(a => childSpaces + a).join(',\n')}\n${spaces})`;
            } else {
                if (formattedArgs.length === 0) {
                    return `{${head}}`;
                }
                return `{${head}\n${formattedArgs.map(a => childSpaces + a).join('\n')}\n${spaces}}`;
            }
        }

        return JSON.stringify(node);
    }
}

// Factory function for creating parser with initialization
export async function createTreeSitterParser() {
    const parser = new SymaTreeSitterParser();
    await parser.initialize();
    return parser;
}

// For backward compatibility - synchronous version that requires pre-initialization
export class SymaParser extends SymaTreeSitterParser {
    constructor() {
        super();
        console.warn('SymaParser using tree-sitter requires async initialization. Use createTreeSitterParser() instead.');
    }
}
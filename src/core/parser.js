/*****************************************************************
 * Shared Syma Parser
 *
 * A single parser implementation used by both the compiler and REPL.
 * Supports both brace syntax {Head arg1 arg2} and function call
 * syntax Head(arg1, arg2).
 ******************************************************************/

import { K, Sym, Num, Str, Call } from '../ast-helpers.js';

export class SymaParser {
    constructor() {
        this.sourceText = '';
        this.filename = '<input>';
    }

    // =============== Error Handling ===============
    die(msg, pos = null) {
        if (pos) {
            throw new Error(`${msg} at ${pos.file}:${pos.line}:${pos.col}`);
        } else {
            throw new Error(msg);
        }
    }

    // =============== Tokenization ===============
    tokenize(src, filename = '<input>') {
        this.sourceText = src;
        this.filename = filename;

        const tokens = [];
        let i = 0;
        const len = src.length;
        let line = 1;
        let col = 1;

        const isWS = c => c === ' ' || c === '\t' || c === '\n' || c === '\r';
        const isDigit = c => c >= '0' && c <= '9';
        const isDelim = c => c === '{' || c === '}' || c === '(' || c === ')' || c === ',' || c === '"' || c === ';';

        const pos = () => ({ line, col, index: i, file: filename });

        const advance = () => {
            if (src[i] === '\n') {
                line++;
                col = 1;
            } else {
                col++;
            }
            i++;
        };

        while (i < len) {
            const c = src[i];
            const startPos = pos();

            if (isWS(c)) {
                advance();
                continue;
            }

            // Comments
            if (c === ';') {
                while (i < len && src[i] !== '\n') advance();
                continue;
            }

            // Delimiters
            if (c === '{' || c === '}' || c === '(' || c === ')' || c === ',') {
                tokens.push({ t: c, pos: startPos });
                advance();
                continue;
            }

            // Strings
            if (c === '"') {
                advance();
                let s = '';
                while (i < len) {
                    if (src[i] === '"') {
                        advance();
                        break;
                    }
                    if (src[i] === '\\') {
                        advance();
                        if (i >= len) this.die('Unterminated string escape', startPos);
                        const esc = src[i];
                        advance();
                        switch (esc) {
                            case 'n': s += '\n'; break;
                            case 'r': s += '\r'; break;
                            case 't': s += '\t'; break;
                            case '"': s += '"';  break;
                            case '\\': s += '\\'; break;
                            default: s += esc; break;
                        }
                    } else {
                        s += src[i];
                        advance();
                    }
                }
                if (i > len || src[i-1] !== '"') {
                    this.die('Unterminated string', startPos);
                }
                tokens.push({ t: 'str', v: s, pos: startPos });
                continue;
            }

            // Numbers
            if (isDigit(c) || (c === '-' && i + 1 < len && isDigit(src[i + 1]))) {
                let numStr = '';
                let sawDot = false;

                if (c === '-') {
                    numStr += c;
                    advance();
                }

                while (i < len) {
                    const ch = src[i];
                    if (isDigit(ch)) {
                        numStr += ch;
                        advance();
                    } else if (ch === '.' && !sawDot) {
                        sawDot = true;
                        numStr += ch;
                        advance();
                    } else {
                        break;
                    }
                }

                const num = Number(numStr);
                if (!Number.isFinite(num)) this.die(`Bad number: ${numStr}`, startPos);
                tokens.push({ t: 'num', v: num, pos: startPos });
                continue;
            }

            // Symbols (including special ones like →, _, ...)
            let sym = '';
            while (i < len) {
                const ch = src[i];
                if (isWS(ch) || isDelim(ch)) break;
                sym += ch;
                advance();
            }
            if (!sym.length) this.die(`Unexpected character: ${c}`, startPos);
            tokens.push({ t: 'sym', v: sym, pos: startPos });
        }
        return tokens;
    }

    // =============== Parsing ===============
    parse(tokens) {
        let i = 0;
        const braceStack = [];

        const peek = () => tokens[i] || null;
        const eat = () => tokens[i++] || null;

        const parseExpr = () => {
            const tok = peek();
            if (!tok) {
                if (braceStack.length > 0) {
                    const innermost = braceStack[braceStack.length - 1];
                    this.die(`Unexpected EOF - unclosed '{' from line ${innermost.pos.line}`, innermost.pos);
                }
                this.die('Unexpected EOF');
            }

            // Numbers
            if (tok.t === 'num') {
                eat();
                return Num(tok.v);
            }

            // Strings
            if (tok.t === 'str') {
                eat();
                return Str(tok.v);
            }

            // Symbols (may start function call)
            if (tok.t === 'sym') {
                const sym = eat();

                // Handle Var shorthand: name_ → {Var "name"}
                if (sym.v.endsWith('_') && !sym.v.endsWith('...')) {
                    const name = sym.v.slice(0, -1);
                    if (name === '') {
                        // Just _ is wildcard
                        return Call(Sym('Var'), Str('_'));
                    } else {
                        return Call(Sym('Var'), Str(name));
                    }
                }

                // Handle VarRest shorthand: name... or name___
                if (sym.v.endsWith('...') || sym.v.endsWith('___')) {
                    const suffix = sym.v.endsWith('...') ? '...' : '___';
                    const name = sym.v.slice(0, -suffix.length);

                    if (name === '') {
                        // Just ... or ___ is wildcard rest
                        return Call(Sym('VarRest'), Str('_'));
                    } else if (name.endsWith('_')) {
                        // Remove trailing underscore from name (e.g., xs_... → VarRest "xs")
                        return Call(Sym('VarRest'), Str(name.slice(0, -1)));
                    } else {
                        return Call(Sym('VarRest'), Str(name));
                    }
                }

                // Check if followed by '(' for function call syntax
                if (peek() && peek().t === '(') {
                    eat(); // consume '('
                    const args = [];

                    // Handle empty parens
                    if (peek() && peek().t === ')') {
                        eat();
                        return Call(Sym(sym.v));
                    }

                    // Parse comma-separated arguments
                    while (true) {
                        args.push(parseExpr());
                        const next = peek();
                        if (!next) this.die('Unterminated function call', sym.pos);
                        if (next.t === ',') {
                            eat(); // consume comma
                            continue;
                        }
                        if (next.t === ')') {
                            eat(); // consume closing paren
                            break;
                        }
                        this.die(`Expected ',' or ')' in function call`, next.pos);
                    }

                    return Call(Sym(sym.v), ...args);
                }

                return Sym(sym.v);
            }

            // Unexpected closing delimiters
            if (tok.t === '}') {
                if (braceStack.length === 0) {
                    this.die('Unexpected closing brace - no matching opening brace', tok.pos);
                }
                this.die('Unexpected closing brace', tok.pos);
            }

            if (tok.t === ')') {
                this.die('Unexpected closing parenthesis', tok.pos);
            }

            if (tok.t === '(') {
                this.die('Unexpected opening parenthesis - function calls must have a name', tok.pos);
            }

            if (tok.t === ',') {
                this.die('Unexpected comma outside of function call', tok.pos);
            }

            // Brace syntax {Head arg1 arg2 ...}
            if (tok.t === '{') {
                const openBrace = eat();
                braceStack.push(openBrace);

                // Handle empty braces
                if (peek() && peek().t === '}') {
                    eat();
                    braceStack.pop();
                    this.die('Empty brace expression', openBrace.pos);
                }

                const head = parseExpr();
                const args = [];

                // Parse space-separated arguments
                while (true) {
                    const next = peek();
                    if (!next) {
                        const innermost = braceStack[braceStack.length - 1];
                        this.die(`Unterminated brace expression - unclosed '{' from line ${innermost.pos.line}`, innermost.pos);
                    }
                    if (next.t === '}') {
                        eat();
                        braceStack.pop();
                        break;
                    }
                    args.push(parseExpr());
                }

                return Call(head, ...args);
            }

            this.die(`Unexpected token: ${tok.t}`, tok.pos);
        };

        // Parse expressions until EOF
        const exprs = [];
        while (peek()) {
            exprs.push(parseExpr());
        }

        if (braceStack.length > 0) {
            const innermost = braceStack[braceStack.length - 1];
            this.die(`Unclosed brace from line ${innermost.pos.line}`, innermost.pos);
        }

        if (exprs.length === 0) {
            this.die('No expression found');
        } else if (exprs.length === 1) {
            return exprs[0];
        } else {
            // Multiple top-level expressions - wrap in a Bundle
            return Call(Sym('Bundle'), ...exprs);
        }
    }

    // =============== Public API ===============

    parseString(src, filename = '<input>') {
        const tokens = this.tokenize(src, filename);
        return this.parse(tokens);
    }

    parseFile(content, filename) {
        return this.parseString(content, filename);
    }

    // =============== REPL-specific parsing ===============

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

    // =============== AST to String conversion ===============

    nodeToString(node, indent = 0) {
        const isSym = n => n && n.k === K.Sym;
        const isNum = n => n && n.k === K.Num;
        const isStr = n => n && n.k === K.Str;
        const isCall = n => n && n.k === K.Call;

        if (isNum(node)) return String(node.v);
        if (isStr(node)) return `"${node.v.replace(/"/g, '\\"')}"`;
        if (isSym(node)) return node.v;

        if (isCall(node)) {
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

        return JSON.stringify(node); // Fallback
    }

    prefersFunctionSyntax(sym) {
        // Symbols that look better with function call syntax
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
}
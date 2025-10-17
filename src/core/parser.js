/*****************************************************************
 * Shared Syma Parser
 *
 * A single parser implementation used by both the compiler and REPL.
 * Supports both brace syntax {Head arg1 arg2} and function call
 * syntax Head(arg1, arg2).
 ******************************************************************/

import { K, Sym, Num, Str, Call } from '../ast-helpers.js';

/**
 * Escape a string value for display - shows escape sequences literally
 * rather than interpreting them. Exported for use by projectors.
 */
export function escapeStringForDisplay(str) {
    return str
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/"/g, '\\"')     // Escape quotes
        .replace(/\n/g, '\\n')    // Show newlines as \n
        .replace(/\r/g, '\\r')    // Show carriage returns as \r
        .replace(/\t/g, '\\t')    // Show tabs as \t
        .replace(/\f/g, '\\f')    // Show form feeds as \f
}

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
        const isDelim = c => c === '{' || c === '}' || c === '(' || c === ')' || c === ',' || c === '"' || c === "'" || c === ';';

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
            // Single-line comment with semicolon
            if (c === ';') {
                while (i < len && src[i] !== '\n') advance();
                continue;
            }

            // Single-line comment with //
            if (c === '/' && i + 1 < len && src[i + 1] === '/') {
                advance(); // skip first /
                advance(); // skip second /
                while (i < len && src[i] !== '\n') advance();
                continue;
            }

            // Multiline comment with /* */
            if (c === '/' && i + 1 < len && src[i + 1] === '*') {
                advance(); // skip /
                advance(); // skip *

                // Look for closing */
                while (i < len - 1) {
                    if (src[i] === '*' && src[i + 1] === '/') {
                        advance(); // skip *
                        advance(); // skip /
                        break;
                    }
                    advance();
                }

                // Check if we reached EOF without finding closing */
                if (i >= len - 1 && !(i === len - 1 && src[i - 1] === '/' && src[i - 2] === '*')) {
                    this.die('Unterminated multiline comment', startPos);
                }

                continue;
            }

            // Delimiters
            if (c === '{' || c === '}' || c === '(' || c === ')' || c === ',') {
                tokens.push({ t: c, pos: startPos });
                advance();
                continue;
            }

            // Strings (both double and single quotes)
            if (c === '"' || c === "'") {
                const quoteChar = c;
                advance();
                let s = '';
                while (i < len) {
                    if (src[i] === quoteChar) {
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
                            case "'": s += "'";  break;
                            case '\\': s += '\\'; break;
                            default: s += esc; break;
                        }
                    } else {
                        s += src[i];
                        advance();
                    }
                }
                if (i > len || src[i-1] !== quoteChar) {
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
                    const opener = innermost.t === '(' ? '(' : '{';
                    this.die(`Unexpected EOF - unclosed '${opener}' from line ${innermost.pos.line}`, innermost.pos);
                }
                this.die('Unexpected EOF');
            }

            let expr;
            let startPos = tok.pos;

            // Numbers
            if (tok.t === 'num') {
                eat();
                expr = Num(tok.v);
            }

            // Strings
            else if (tok.t === 'str') {
                eat();
                expr = Str(tok.v);
            }

            // Symbols (may have shorthands)
            else if (tok.t === 'sym') {
                const sym = eat();

                // Handle VarRest shorthand FIRST: name... or name.. or name___
                // Must check this before Var to avoid catching ___ as Var
                if (sym.v.endsWith('...') || sym.v.endsWith('..') || sym.v.endsWith('___')) {
                    const suffix = sym.v.endsWith('...') ? '...' :
                                   sym.v.endsWith('___') ? '___' : '..';
                    const name = sym.v.slice(0, -suffix.length);

                    if (name === '') {
                        // Just ... or .. or ___ is wildcard rest
                        expr = Call(Sym('VarRest'), Str('_'));
                    } else if (name.endsWith('_')) {
                        // Remove trailing underscore from name (e.g., xs_... → VarRest "xs")
                        expr = Call(Sym('VarRest'), Str(name.slice(0, -1)));
                    } else {
                        expr = Call(Sym('VarRest'), Str(name));
                    }
                }

                // Handle Var shorthand: name_ → {Var "name"}
                // Check this AFTER VarRest to avoid incorrectly catching ___
                else if (sym.v.endsWith('_')) {
                    const name = sym.v.slice(0, -1);
                    if (name === '') {
                        // Just _ is wildcard
                        expr = Call(Sym('Var'), Str('_'));
                    } else {
                        expr = Call(Sym('Var'), Str(name));
                    }
                } else {
                    expr = Sym(sym.v);
                }
            }

            // Unexpected closing delimiters
            else if (tok.t === '}') {
                if (braceStack.length === 0) {
                    this.die('Unexpected closing brace - no matching opening brace', tok.pos);
                }
                this.die('Unexpected closing brace', tok.pos);
            }

            else if (tok.t === ')') {
                this.die('Unexpected closing parenthesis', tok.pos);
            }

            // Parenthesis syntax (Head arg1 arg2 ...) - like brace syntax or () for empty call
            else if (tok.t === '(') {
                const openParen = eat();
                braceStack.push(openParen);

                // Handle empty parens - create empty Call
                if (peek() && peek().t === ')') {
                    eat();
                    braceStack.pop();
                    expr = Call(); // Empty call with no head
                } else {
                    const head = parseExpr();
                    const args = [];

                    // Parse space-separated arguments (commas are allowed but treated as separators)
                    while (true) {
                        const next = peek();
                        if (!next) {
                            const innermost = braceStack[braceStack.length - 1];
                            this.die(`Unterminated parenthesis expression - unclosed '(' from line ${innermost.pos.line}`, innermost.pos);
                        }
                        if (next.t === ')') {
                            eat();
                            braceStack.pop();
                            break;
                        }
                        if (next.t === ',') {
                            eat(); // Skip commas in parenthesis syntax
                            continue;
                        }
                        args.push(parseExpr());
                    }

                    expr = Call(head, ...args);
                }
            }

            else if (tok.t === ',') {
                eat();
                expr = Sym(',');
            }

            // Brace syntax {Head arg1 arg2 ...} or {} for empty call
            else if (tok.t === '{') {
                const openBrace = eat();
                braceStack.push(openBrace);

                // Handle empty braces - create empty Call
                if (peek() && peek().t === '}') {
                    eat();
                    braceStack.pop();
                    expr = Call(); // Empty call with no head
                } else {
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

                    expr = Call(head, ...args);
                }
            }

            else {
                this.die(`Unexpected token: ${tok.t}`, tok.pos);
            }

            // Check for function call suffix: expr()
            if (peek() && peek().t === '(') {
                eat(); // consume '('
                const args = [];

                // Handle empty parens
                if (peek() && peek().t === ')') {
                    eat();
                    return Call(expr);
                }

                // Parse arguments (commas are optional)
                while (true) {
                    args.push(parseExpr());
                    const next = peek();
                    if (!next) this.die('Unterminated function call', startPos);
                    if (next.t === ')') {
                        eat(); // consume closing paren
                        break;
                    }
                    if (next.t === ',') {
                        eat(); // consume optional comma
                        // Check for trailing comma
                        if (peek() && peek().t === ')') {
                            eat(); // consume closing paren
                            break;
                        }
                        continue;
                    }
                    // If next token can start an expression, continue without comma
                    if (next.t === 'num' || next.t === 'str' || next.t === 'sym' || next.t === '{' || next.t === '(') {
                        continue;
                    }
                    this.die(`Expected ',' or ')' in function call`, next.pos);
                }

                return Call(expr, ...args);
            }

            return expr;
        };

        // Parse expressions until EOF
        const exprs = [];
        while (peek()) {
            exprs.push(parseExpr());
        }

        if (braceStack.length > 0) {
            const innermost = braceStack[braceStack.length - 1];
            const opener = innermost.t === '(' ? '(' : '{';
            this.die(`Unclosed '${opener}' from line ${innermost.pos.line}`, innermost.pos);
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
        // Parse inline rule syntax: pattern → replacement [:guard condition] [:scope Parent] [priority]
        const arrow = ruleText.includes('→') ? '→' : '->';
        const parts = ruleText.split(arrow);
        if (parts.length !== 2) {
            throw new Error('Rule must have pattern and replacement separated by → or ->');
        }

        const pattern = this.parseString(parts[0].trim());
        let remaining = parts[1].trim();

        // Extract modifiers: :guard, :scope, and priority
        let guard = null;
        let scope = null;
        let priority = null;

        // Helper to extract a :keyword value from text
        const extractKeyword = (text, keyword) => {
            const index = text.indexOf(keyword);
            if (index === -1) return { found: false, before: text, after: '' };

            const before = text.substring(0, index).trim();
            const after = text.substring(index + keyword.length).trim();
            return { found: true, before, after };
        };

        // Try to extract :guard
        const guardExtract = extractKeyword(remaining, ':guard');
        if (guardExtract.found) {
            // Parse everything after :guard up to :scope or priority
            let guardText = guardExtract.after;
            remaining = guardExtract.before;

            // Check if there's a :scope after the guard
            const scopeExtract = extractKeyword(guardText, ':scope');
            if (scopeExtract.found) {
                guard = this.parseString(scopeExtract.before.trim());
                guardText = scopeExtract.after;

                // Extract scope value (next token)
                const scopeTokens = guardText.trim().split(/\s+/);
                if (scopeTokens.length > 0 && scopeTokens[0] !== '') {
                    scope = scopeTokens[0];
                    // Rest might be priority
                    guardText = scopeTokens.slice(1).join(' ');
                }
            }

            // Check for priority at the end
            const tokens = guardText.trim().split(/\s+/);
            if (tokens.length > 0 && /^\d+$/.test(tokens[tokens.length - 1])) {
                priority = parseInt(tokens[tokens.length - 1]);
                if (guard === null) {
                    // Guard is everything except the priority
                    guard = this.parseString(tokens.slice(0, -1).join(' '));
                }
            } else if (guard === null && guardText.trim()) {
                guard = this.parseString(guardText.trim());
            }
        }

        // Try to extract :scope (if not already found)
        if (scope === null) {
            const scopeExtract = extractKeyword(remaining, ':scope');
            if (scopeExtract.found) {
                remaining = scopeExtract.before;
                const scopeTokens = scopeExtract.after.trim().split(/\s+/);
                if (scopeTokens.length > 0 && scopeTokens[0] !== '') {
                    scope = scopeTokens[0];
                    // Rest might be priority
                    const rest = scopeTokens.slice(1).join(' ').trim();
                    if (rest && /^\d+$/.test(rest)) {
                        priority = parseInt(rest);
                    }
                }
            }
        }

        // Check for standalone priority at the end (if not already found)
        if (priority === null) {
            const lastSpace = remaining.lastIndexOf(' ');
            if (lastSpace !== -1) {
                const lastPart = remaining.slice(lastSpace + 1);
                if (/^\d+$/.test(lastPart)) {
                    priority = parseInt(lastPart);
                    remaining = remaining.slice(0, lastSpace);
                }
            }
        }

        const replacement = this.parseString(remaining.trim());

        // Build R[name, pattern, replacement, :guard?, guard?, :scope?, scope?, priority?]
        const ruleArgs = [Str(name), pattern, replacement];

        if (guard !== null) {
            ruleArgs.push(Sym(':guard'));
            ruleArgs.push(guard);
        }

        if (scope !== null) {
            ruleArgs.push(Sym(':scope'));
            ruleArgs.push(Sym(scope));
        }

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
        const isSplice = n => n && n.__splice === true && Array.isArray(n.items);

        // Handle Splice objects (internal representation from Splat)
        if (isSplice(node)) {
            const items = node.items.map(item => this.nodeToString(item, indent));
            return `<splat> ${items.join(' ')}`;
        }

        if (isNum(node)) return String(node.v);
        if (isStr(node)) return `"${escapeStringForDisplay(node.v)}"`;
        if (isSym(node)) return node.v;

        if (isCall(node)) {
            // Handle empty call: {} or ()
            if (node.h === null) {
                if (node.a.length === 0) return '{}';
                const args = node.a.map(a => this.nodeToString(a, indent));
                return `{${args.join(' ')}}`;
            }

            // Handle VarRest shorthand FIRST: {VarRest "name"} → name..
            // Must check this before Var to generate correct output
            if (isSym(node.h) && node.h.v === 'VarRest' &&
                node.a.length === 1 && isStr(node.a[0])) {
                const name = node.a[0].v;
                if (name === '_') {
                    return '..';  // Wildcard rest
                } else {
                    return `${name}..`;
                }
            }

            // Handle Var shorthand: {Var "name"} → name_
            if (isSym(node.h) && node.h.v === 'Var' &&
                node.a.length === 1 && isStr(node.a[0])) {
                const name = node.a[0].v;
                if (name === '_') {
                    return '_';  // Wildcard
                } else {
                    return `${name}_`;
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

        return JSON.stringify(node); // Fallback
    }

    prefersFunctionSyntax(sym) {
        // Symbols that look better with function call syntax
        const functionLike = [
            'Add', 'Sub', 'Mul', 'Mod', 'Pow', 'Sqrt', 'Abs',
            'Min', 'Max', 'Floor', 'Ceil', 'Round',
            'Concat', 'ToString', 'ToUpper', 'ToLower', 'Trim',
            'StrLen', 'Substring', 'IndexOf', 'Replace',
            'Eq', 'Neq', 'Lt', 'Gt', 'Lte', 'Gte',
            'And', 'Or', 'Not',
            'IsNum', 'IsStr', 'IsSym', 'IsTrue', 'IsFalse',
            'Random', 'ParseNum', 'Debug',
            'R', 'Apply', '/@',
            'App', 'State'
        ];
        return functionLike.includes(sym);
    }

    prettyPrint(node, indent = 0, options = {}) {
        const defaultOptions = {
            indentSize: 2,
            maxInlineLength: 60,
            maxInlineArgs: 3,
            bracketStyle: 'auto', // 'brace', 'function', or 'auto'
        };
        const opts = { ...defaultOptions, ...options };

        const isSym = n => n && n.k === K.Sym;
        const isNum = n => n && n.k === K.Num;
        const isStr = n => n && n.k === K.Str;
        const isCall = n => n && n.k === K.Call;
        const isSplice = n => n && n.__splice === true && Array.isArray(n.items);
        const spaces = ' '.repeat(indent * opts.indentSize);

        // Handle Splice objects (internal representation from Splat)
        if (isSplice(node)) {
            const items = node.items.map(item => this.prettyPrint(item, indent, opts));
            return `<splat> ${items.join(' ')}`;
        }

        // Atoms
        if (isNum(node)) return String(node.v);
        if (isStr(node)) return `"${escapeStringForDisplay(node.v)}"`;
        if (isSym(node)) return node.v;

        // Calls
        if (isCall(node)) {
            // Handle empty call: {} or ()
            if (node.h === null) {
                if (node.a.length === 0) return '{}';
                const args = node.a.map(a => this.prettyPrint(a, indent, opts));
                // For empty calls with args, just show them inline
                return `{${args.join(' ')}}`;
            }

            // Handle VarRest shorthand FIRST: {VarRest "name"} → name..
            // Must check this before Var to generate correct output
            if (isSym(node.h) && node.h.v === 'VarRest' &&
                node.a.length === 1 && isStr(node.a[0])) {
                const name = node.a[0].v;
                if (name === '_') {
                    return '..';  // Wildcard rest
                } else {
                    return `${name}..`;
                }
            }

            // Handle Var shorthand: {Var "name"} → name_
            if (isSym(node.h) && node.h.v === 'Var' &&
                node.a.length === 1 && isStr(node.a[0])) {
                const name = node.a[0].v;
                if (name === '_') {
                    return '_';  // Wildcard
                } else {
                    return `${name}_`;
                }
            }
            const head = this.prettyPrint(node.h, 0, opts);

            // Special handling for attributes (symbols starting with ':')
            const hasAttributes = node.a.some(a => isSym(a) && a.v.startsWith(':'));

            // Determine if we should use function syntax
            const useFunctionSyntax = opts.bracketStyle === 'function' ||
                (opts.bracketStyle === 'auto' && isSym(node.h) && this.prefersFunctionSyntax(node.h.v));

            // Try inline format first
            const inlineArgs = node.a.map(a => this.nodeToString(a, 0));
            const inline = useFunctionSyntax
                ? `${head}(${inlineArgs.join(', ')})`
                : `{${head}${inlineArgs.length > 0 ? ' ' + inlineArgs.join(' ') : ''}}`;

            // Use inline if it's short enough and doesn't have too many args
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
                    // This is an attribute, next arg should be its value
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

        return JSON.stringify(node); // Fallback
    }
}
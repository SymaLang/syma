#!/usr/bin/env node

/**
 * sym-2-json.js
 * Tiny S-expression -> JSON AST converter for the symbolic runtime.
 *
 * AST shape produced:
 *   {k:"Sym",  v:string}
 *   {k:"Num",  v:number}
 *   {k:"Str",  v:string}
 *   {k:"Call", h:Expr, a:Expr[]}
 *
 * Lists become Call(head, ...args). Atoms:
 *   - numbers → Num
 *   - "strings" → Str
 *   - symbols → Sym
 *
 * Special cases:
 *   - (Var name) → Call(Sym("Var"), [Str(name)])
 *     The `name` can be a symbol or a string; it is stored as Str in the AST.
 *   - Shorthand syntax:
 *     - n_ → (Var "n")     - regular pattern variable
 *     - _ → (Var "_")      - wildcard
 *     - xs___ → (VarRest "xs") - rest pattern
 *     - ___ → (VarRest "_")    - wildcard rest
 *
 * Usage:
 *   node sym-2-json.js input.sym [--out out.json] [--pretty]
 *   cat input.sym | node sym-2-json.js --pretty
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------------- CLI args ---------------- */
const args = process.argv.slice(2);
let inFile = null;
let outFile = null;
let pretty = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out' || a === '-o') {
    outFile = args[++i] ?? die('Expected path after --out');
  } else if (a === '--pretty' || a === '-p') {
    pretty = true;
  } else if (a.startsWith('-')) {
    die(`Unknown flag: ${a}`);
  } else if (!inFile) {
    inFile = a;
  } else {
    die(`Unexpected argument: ${a}`);
  }
}

/* --------------- Read source --------------- */
async function readSource() {
  if (inFile) {
    return fs.readFileSync(inFile, 'utf8');
  }
  // stdin
  return await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/* --------------- Tokenizer ----------------- */
/**
 * Enhanced tokenizer with position tracking
 * Tokens now include line and column information for better error messages
 */
function tokenize(src, filename = '<input>') {
  const tokens = [];
  let i = 0;
  const len = src.length;
  let line = 1;
  let col = 1;

  const isWS = c => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const isDigit = c => c >= '0' && c <= '9';
  const isDelim = c => c === '(' || c === ')' || c === '"' || c === ';';

  // Helper to create position info
  const pos = () => ({ line, col, index: i, file: filename });

  // Helper to advance position
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

    // whitespace
    if (isWS(c)) { advance(); continue; }

    // line comment ; ....
    if (c === ';') {
      while (i < len && src[i] !== '\n') advance();
      continue;
    }

    // parens
    if (c === '(' || c === ')') {
      tokens.push({ t: c, pos: startPos });
      advance();
      continue;
    }

    // string
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
          if (i >= len) die('Unterminated string escape', startPos);
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
        die('Unterminated string', startPos);
      }
      tokens.push({ t: 'str', v: s, pos: startPos });
      continue;
    }

    // number (supports leading minus and optional decimal)
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
      if (!Number.isFinite(num)) die(`Bad number: ${numStr}`, startPos);
      tokens.push({ t: 'num', v: num, pos: startPos });
      continue;
    }

    // symbol: read until whitespace or delimiter
    let sym = '';
    while (i < len) {
      const ch = src[i];
      if (isWS(ch) || isDelim(ch)) break;
      sym += ch;
      advance();
    }
    if (!sym.length) die(`Unexpected character: ${c}`, startPos);
    tokens.push({ t: 'sym', v: sym, pos: startPos });
  }
  return tokens;
}

/* --------------- Parser with parenthesis tracking -------------------- */
function parse(tokens) {
  let i = 0;
  const parenStack = []; // Track open parens with their indentation
  let lastClosedParen = null; // Track the last successfully closed list

  const peek = () => tokens[i] || null;
  const eat  = () => tokens[i++] || null;

  // Helper to check if current position suggests a missing close paren
  function checkIndentationMismatch(tok) {
    if (!tok || !tok.pos || parenStack.length === 0) return null;

    // Only check indentation for specific patterns that are likely errors
    // Don't check if we're in deeply nested structures (common in UI code)
    if (parenStack.length > 3) return null;

    // Check if this token's indentation suggests missing closes
    // If we have nested parens and see a token at or before the parent's column,
    // it likely means the child should have been closed
    for (let i = parenStack.length - 1; i > 0; i--) {
      const current = parenStack[i];
      const parent = parenStack[i - 1];

      // If this token is at the same line as an open paren, it's probably fine
      if (tok.pos.line === current.pos.line) continue;

      // Only flag if there's a significant indentation mismatch
      // This needs to be very conservative to avoid false positives
      // Only check if token is at or BEFORE the grandparent's column (2 levels up)
      const grandparent = i > 1 ? parenStack[i - 2] : null;
      if (grandparent && tok.pos.col <= grandparent.pos.col) {
        // And only if the current list started on a different line than its parent
        if (current.pos.line !== parent.pos.line) {
          return {
            likelyMissing: current,
            newToken: tok,
            parent: parent
          };
        }
      }
    }
    return null;
  }

  function parseExpr() {
    const tok = peek();
    if (!tok) {
      if (parenStack.length > 0) {
        // Report the innermost (most recent) unclosed paren, not the outermost
        const innermost = parenStack[parenStack.length - 1];
        die(`Unexpected EOF - unclosed '(' from line ${innermost.pos.line}`, innermost.pos);
      }
      die('Unexpected EOF');
    }

    if (tok.t === 'num') { eat(); return { k: 'Num', v: tok.v }; }
    if (tok.t === 'str') { eat(); return { k: 'Str', v: tok.v }; }
    if (tok.t === 'sym') { eat(); return { k: 'Sym', v: tok.v }; }

    if (tok.t === ')') {
      if (parenStack.length === 0) {
        die('Unexpected closing parenthesis - no matching opening parenthesis', tok.pos);
      }
      // This will be caught by the list parser
      die('Unexpected closing parenthesis', tok.pos);
    }

    if (tok.t === '(') {
      const openParen = eat();
      parenStack.push(openParen);

      // Check for empty list ()
      if (peek() && peek().t === ')') {
        const closeParen = eat();
        parenStack.pop();
        // Return empty list as just Nil symbol
        return { k: 'Sym', v: 'Nil' };
      }

      const head = parseExpr();
      const args = [];
      while (true) {
        const t = peek();

        // Disabled indentation checking - it causes too many false positives
        // with valid nested UI structures. The parser will still catch
        // actual missing parens at EOF or when hitting unexpected tokens.
        /*
        if (t && (t.t === '(' || t.t === 'sym')) {
          const mismatch = checkIndentationMismatch(t);
          if (mismatch) {
            // ... indentation-based error reporting ...
          }
        }
        */

        if (!t) {
          // When we hit EOF, try to determine which paren is most likely missing its close
          let msg = 'Unterminated list - missing closing parenthesis';

          // If we have multiple unclosed, the problem is likely with one of the inner ones
          if (parenStack.length > 1) {
            msg += '\n\nLikely issue: Check these unclosed parentheses (most recent first):';
            // Show in reverse order - most recent first
            for (let i = parenStack.length - 1; i >= Math.max(0, parenStack.length - 3); i--) {
              const p = parenStack[i];
              const lineContent = SOURCE_TEXT.split('\n')[p.pos.line - 1];
              const preview = lineContent ? lineContent.substring(p.pos.col - 1, Math.min(p.pos.col + 40, lineContent.length)) : '';
              msg += `\n  Line ${p.pos.line}, col ${p.pos.col}: ${preview.trim()}`;
            }

            // Suggest checking the most recent non-root paren
            if (parenStack.length > 1) {
              const suspect = parenStack[parenStack.length - 1];
              msg += `\n\nHint: The unclosed '(' at line ${suspect.pos.line} may be missing its ')'`;
            }
          }

          // Still report position of the innermost for the error location
          const reportPos = parenStack[parenStack.length - 1].pos;
          die(msg, reportPos);
        }
        if (t.t === ')') {
          eat();
          parenStack.pop();
          break;
        }
        args.push(parseExpr());
      }
      return { k: 'Call', h: head, a: args };
    }

    die(`Unexpected token: ${JSON.stringify(tok)}`, tok.pos);
  }

  const exprs = [];
  while (i < tokens.length) {
    const tok = peek();
    if (tok && tok.t === ')') {
      die('Unexpected closing parenthesis - no matching opening parenthesis', tok.pos);
    }
    exprs.push(parseExpr());
  }

  // Check for unclosed parens - show all of them for context
  if (parenStack.length > 0) {
    // Show all unclosed parens to help debugging
    let msg = 'Unclosed parentheses detected:';
    for (let i = 0; i < parenStack.length; i++) {
      const p = parenStack[i];
      const lineContent = SOURCE_TEXT.split('\n')[p.pos.line - 1];
      const preview = lineContent ? lineContent.substring(p.pos.col - 1, p.pos.col + 20).replace(/\n/g, ' ') : '';
      msg += `\n  Line ${p.pos.line}, col ${p.pos.col}: ${preview}`;
    }

    // Report the last opened paren as most likely culprit
    const lastOpened = parenStack[parenStack.length - 1];
    die(msg, lastOpened.pos);
  }

  if (exprs.length === 1) return exprs[0];
  // If multiple top-level forms, wrap into (Bundle ...)
  return { k: 'Call', h: { k: 'Sym', v: 'Bundle' }, a: exprs };
}

/* --------------- Normalization passes --------------- */
/* --------------- AST helpers ----------------------- */
const K = { Sym: 'Sym', Num: 'Num', Str: 'Str', Call: 'Call' };
const Sym  = v => ({ k: K.Sym,  v });
const Num  = v => ({ k: K.Num,  v });
const Str  = v => ({ k: K.Str,  v });
const Call = (h, ...a) => ({ k: K.Call, h, a });

const isSym  = n => n && n.k === K.Sym;
const isNum  = n => n && n.k === K.Num;
const isStr  = n => n && n.k === K.Str;
const isCall = n => n && n.k === K.Call;

/**
 * Post-parse fixups so the AST matches runtime conventions:
 *  - (Var x) → Call(Sym("Var"), [Str(x)]) with x coerced to Str
 *  - Convert (Rules ...) / (R ...) etc. left as Calls — runtime already expects Calls.
 */
function desugarTagProps(node) {
  if (isCall(node)) {
    const head = desugarTagProps(node.h);
    const args = node.a.map(desugarTagProps);
    if (isSym(head) && head.v !== "Var") {
      const kvs = [], children = [];
      for (let i=0; i<args.length; i++) {
        const a = args[i];
        if (isSym(a) && a.v.startsWith(":")) {
          const key = a.v.slice(1);
          const val = args[++i];
          kvs.push(Call(Sym("KV"), Str(key), val));
        } else {
          children.push(a);
        }
      }
      if (kvs.length) return Call(head, Call(Sym("Props"), ...kvs), ...children);
    }
    return Call(head, ...args);
  }
  return node;
}

function postprocess(node) {
  if (!node || typeof node !== 'object') return node;

  // Handle shorthand for variables: n_ => (Var "n"), xs___ => (VarRest "xs")
  if (node.k === 'Sym') {
    const v = node.v;

    // Check for rest variable shorthand: xs___ => (VarRest "xs")
    // Special case: ___ alone becomes (VarRest "_")
    if (v === '___') {
      return { k: 'Call', h: { k: 'Sym', v: 'VarRest' }, a: [ { k: 'Str', v: '_' } ] };
    } else if (v.endsWith('___')) {
      const base = v.slice(0, -3);
      return { k: 'Call', h: { k: 'Sym', v: 'VarRest' }, a: [ { k: 'Str', v: base } ] };
    }

    // Check for regular variable shorthand: n_ => (Var "n")
    // Special case: _ alone becomes (Var "_")
    if (v === '_') {
      return { k: 'Call', h: { k: 'Sym', v: 'Var' }, a: [ { k: 'Str', v: '_' } ] };
    } else if (v.endsWith('_') && !v.endsWith('___')) {
      const base = v.slice(0, -1);
      return { k: 'Call', h: { k: 'Sym', v: 'Var' }, a: [ { k: 'Str', v: base } ] };
    }

    return node;
  }

  if (node.k === 'Call') {
    const head = postprocess(node.h);

    // Special handling for (Var ...) - process the argument WITHOUT recursive postprocess
    // to avoid transforming symbols inside (Var ...)
    if (head.k === 'Sym' && head.v === 'Var') {
      if (node.a.length !== 1) die('(Var ...) expects exactly one argument');
      const nameExpr = node.a[0]; // Use raw argument, not processed
      let nameStr;
      if (nameExpr.k === 'Str') nameStr = nameExpr.v;
      else if (nameExpr.k === 'Sym') nameStr = nameExpr.v;
      else die('(Var name) expects symbol or string');
      // Support rest-variable shorthand: (Var xs___) => (VarRest "xs")
      // Also support (Var ___) => (VarRest "_") for wildcard rest
      if (nameStr.endsWith('___')) {
        const base = nameStr.slice(0, -3);
        return { k: 'Call', h: { k: 'Sym', v: 'VarRest' }, a: [ { k: 'Str', v: base } ] };
      }
      return { k: 'Call', h: { k: 'Sym', v: 'Var' }, a: [ { k: 'Str', v: nameStr } ] };
    }

    // For all other calls, process arguments normally
    const args = node.a.map(postprocess);
    return { k: 'Call', h: head, a: args };
  }

  return node;
}

/* --------------- Error handling with context ---------------------- */
let SOURCE_TEXT = ''; // Store source for error context

function die(msg, pos = null) {
  let errorMsg = msg;

  if (pos && SOURCE_TEXT) {
    const lines = SOURCE_TEXT.split('\n');
    const lineNum = pos.line;
    const colNum = pos.col;
    const fileName = pos.file || '<input>';

    errorMsg = `${fileName}:${lineNum}:${colNum}: error: ${msg}`;

    // Show context (3 lines before and after)
    const startLine = Math.max(0, lineNum - 3);
    const endLine = Math.min(lines.length - 1, lineNum + 2);

    console.error('\n' + errorMsg + '\n');

    for (let i = startLine; i <= endLine; i++) {
      const isErrorLine = i === lineNum - 1;
      const lineNumStr = String(i + 1).padStart(4, ' ');
      const prefix = isErrorLine ? '>' : ' ';
      console.error(`${prefix} ${lineNumStr} | ${lines[i]}`);

      if (isErrorLine) {
        // Show caret pointing to error position
        const spaces = ' '.repeat(7 + colNum - 1);
        console.error(`       | ${spaces}^`);
      }
    }
    console.error();
  } else {
    console.error(`error: ${errorMsg}`);
  }

  process.exitCode = 1;
  const e = new Error(errorMsg);
  e.showStack = false; // Custom flag to suppress stack trace
  throw e;
}

/* --------------- Main ---------------------- */
(async () => {
  try {
    const src = await readSource();
    SOURCE_TEXT = src; // Store for error context
    const tokens = tokenize(src, inFile || '<stdin>');
    const ast = desugarTagProps(postprocess(parse(tokens)));
    const json = pretty ? JSON.stringify(ast, null, 2) : JSON.stringify(ast);
    if (outFile) {
      fs.writeFileSync(outFile, json);
    } else {
      process.stdout.write(json + '\n');
    }
  } catch (err) {
    if (err.showStack === false) {
      // Our errors with context already printed
      process.exit(1);
    } else {
      // Unexpected errors - show full stack
      console.error(err);
      process.exit(1);
    }
  }
})();

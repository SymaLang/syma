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
 * Tokens:
 *  - (  )  [paren]
 *  - "string with escapes"
 *  - number: -?\d+(\.\d+)?
 *  - symbol: everything else except whitespace and delimiters
 *  - comment: ; until end of line
 */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  const len = src.length;

  const isWS = c => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const isDigit = c => c >= '0' && c <= '9';
  const isDelim = c => c === '(' || c === ')' || c === '"' || c === ';';

  while (i < len) {
    const c = src[i];

    // whitespace
    if (isWS(c)) { i++; continue; }

    // line comment ; ....
    if (c === ';') {
      while (i < len && src[i] !== '\n') i++;
      continue;
    }

    // parens
    if (c === '(' || c === ')') {
      tokens.push({ t: c });
      i++;
      continue;
    }

    // string
    if (c === '"') {
      i++;
      let s = '';
      while (i < len) {
        const ch = src[i++];
        if (ch === '"') break;
        if (ch === '\\') {
          if (i >= len) die('Unterminated string escape');
          const esc = src[i++];
          switch (esc) {
            case 'n': s += '\n'; break;
            case 'r': s += '\r'; break;
            case 't': s += '\t'; break;
            case '"': s += '"';  break;
            case '\\': s += '\\'; break;
            default: s += esc; break;
          }
        } else {
          s += ch;
        }
      }
      tokens.push({ t: 'str', v: s });
      continue;
    }

    // number (supports leading minus and optional decimal)
    if (c === '-' && i + 1 < len && isDigit(src[i + 1])) {
      // fallthrough to number scan below
    }
    if (isDigit(c) || (c === '-' && isDigit(src[i + 1]))) {
      let j = i + 1;
      let sawDot = false;
      while (j < len) {
        const ch = src[j];
        if (isDigit(ch)) { j++; continue; }
        if (ch === '.' && !sawDot) { sawDot = true; j++; continue; }
        break;
      }
      const raw = src.slice(i, j);
      const num = Number(raw);
      if (!Number.isFinite(num)) die(`Bad number: ${raw}`);
      tokens.push({ t: 'num', v: num });
      i = j;
      continue;
    }

    // symbol: read until whitespace or delimiter
    let j = i;
    while (j < len) {
      const ch = src[j];
      if (isWS(ch) || ch === '(' || ch === ')' || ch === '"' || ch === ';') break;
      j++;
    }
    const sym = src.slice(i, j);
    if (!sym.length) die(`Unexpected character at ${i}: ${src[i]}`);
    tokens.push({ t: 'sym', v: sym });
    i = j;
  }
  return tokens;
}

/* --------------- Parser -------------------- */
function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i] || null;
  const eat  = () => tokens[i++] || null;

  function parseExpr() {
    const tok = peek();
    if (!tok) die('Unexpected EOF');

    if (tok.t === 'num') { eat(); return { k: 'Num', v: tok.v }; }
    if (tok.t === 'str') { eat(); return { k: 'Str', v: tok.v }; }
    if (tok.t === 'sym') { eat(); return { k: 'Sym', v: tok.v }; }

    if (tok.t === '(') {
      eat(); // '('
      const head = parseExpr();
      const args = [];
      while (true) {
        const t = peek();
        if (!t) die('Unterminated list');
        if (t.t === ')') { eat(); break; }
        args.push(parseExpr());
      }
      return { k: 'Call', h: head, a: args };
    }

    die(`Unexpected token: ${JSON.stringify(tok)}`);
  }

  const exprs = [];
  while (i < tokens.length) {
    exprs.push(parseExpr());
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

  if (node.k === 'Call') {
    const head = postprocess(node.h);
    const args = node.a.map(postprocess);

    // (Var name) sugar: ensure inner is Str
    if (head.k === 'Sym' && head.v === 'Var') {
      if (args.length !== 1) die('(Var ...) expects exactly one argument');
      const nameExpr = args[0];
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

    return { k: 'Call', h: head, a: args };
  }

  return node;
}

/* --------------- Main ---------------------- */
function die(msg) {
  const e = new Error(msg);
  console.error(msg);
  process.exitCode = 1;
  throw e;
}

(async () => {
  try {
    const src = await readSource();
    const tokens = tokenize(src);
    const ast = desugarTagProps(postprocess(parse(tokens)));
    const json = pretty ? JSON.stringify(ast, null, 2) : JSON.stringify(ast);
    if (outFile) {
      fs.writeFileSync(outFile, json);
    } else {
      process.stdout.write(json + '\n');
    }
  } catch (err) {
    // Errors already printed via die(); rethrow for non-zero exit in some environments
    // if (!(err instanceof Error)) console.error(err);
    console.error(err)
    process.exit(1);
  }
})();

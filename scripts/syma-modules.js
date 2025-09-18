#!/usr/bin/env node

/**
 * syma-modules.js
 * Module-aware S-expression -> JSON AST compiler for the symbolic runtime.
 * Supports module syntax with imports, exports, and symbol qualification.
 *
 * Module syntax:
 *   {Module Name/Path
 *     {Export ...}
 *     {Import X/Y as Z [open]}
 *     {Defs {Name expr} ...}
 *     {Rules ...}
 *     {RuleRules ...}}
 *
 * Usage:
 *   node syma-modules.js input.syma [--out out.json] [--pretty] [--entry Module/Name]
 *   node syma-modules.js *.syma --bundle --entry App/Main --out universe.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------------- AST helpers ----------------------- */
const K = { Sym: 'Sym', Num: 'Num', Str: 'Str', Call: 'Call' };
const Sym  = v => ({ k: K.Sym,  v });
const Num  = v => ({ k: K.Num,  v });
const Str  = v => ({ k: K.Str,  v });
const Call = (h, ...a) => ({ k: K.Call, h, a });

const isSym  = n => n && n.k === K.Sym;
const isNum  = n => n && n.k === K.Num;
const isStr  = n => n && n.k === K.Str;
const isCall = n => n && n.k === K.Call;

/* ---------------- Module representation ---------------- */
class Module {
  constructor(name, ast) {
    this.name = name;
    this.ast = ast;
    this.exports = [];
    this.imports = [];
    this.defs = {};
    this.rules = [];
    this.ruleRules = [];
    this.program = null;

    this.parseModule();
  }

  parseModule() {
    if (!isCall(this.ast) || !isSym(this.ast.h) || this.ast.h.v !== 'Module') {
      throw new Error('Invalid module format');
    }

    const [nameNode, ...sections] = this.ast.a;
    if (!isSym(nameNode)) throw new Error('Module name must be a symbol');
    if (nameNode.v !== this.name) throw new Error(`Module name mismatch: ${nameNode.v} vs ${this.name}`);

    for (const section of sections) {
      if (!isCall(section)) continue;
      const head = section.h;
      if (!isSym(head)) continue;

      switch (head.v) {
        case 'Export':
          this.parseExports(section.a);
          break;
        case 'Import':
          this.parseImports(section.a);
          break;
        case 'Defs':
          this.parseDefs(section.a);
          break;
        case 'Rules':
          this.rules = section.a;
          break;
        case 'RuleRules':
          this.ruleRules = section.a;
          break;
        case 'Program':
          this.program = section;
          break;
      }
    }
  }

  parseExports(nodes) {
    for (const node of nodes) {
      if (isSym(node)) {
        this.exports.push(node.v);
      }
    }
  }

  parseImports(nodes) {
    // Parse {Import X/Y as Z [open]}
    let i = 0;
    while (i < nodes.length) {
      const moduleNode = nodes[i++];
      if (!isSym(moduleNode)) throw new Error('Import module must be a symbol');

      if (i >= nodes.length || !isSym(nodes[i]) || nodes[i].v !== 'as') {
        throw new Error('Import must have "as" clause');
      }
      i++; // skip 'as'

      if (i >= nodes.length || !isSym(nodes[i])) {
        throw new Error('Import must have alias after "as"');
      }
      const alias = nodes[i++].v;

      let open = false;
      if (i < nodes.length && isSym(nodes[i]) && nodes[i].v === 'open') {
        open = true;
        i++;
      }

      this.imports.push({
        module: moduleNode.v,
        alias,
        open
      });
    }
  }

  parseDefs(nodes) {
    // Parse {Name expr} pairs
    for (const def of nodes) {
      if (!isCall(def) || def.a.length !== 1) continue;
      if (!isSym(def.h)) continue;
      this.defs[def.h.v] = def.a[0];
    }
  }
}

/* ---------------- Symbol Qualification ---------------- */
class SymbolQualifier {
  constructor(module, moduleMap) {
    this.module = module;
    this.moduleMap = moduleMap;
    this.importMap = new Map(); // alias -> module name
    this.openImports = new Set(); // set of module names imported open

    // Build import maps
    for (const imp of module.imports) {
      this.importMap.set(imp.alias, imp.module);
      if (imp.open) {
        this.openImports.add(imp.module);
      }
    }
  }

  qualifySymbol(sym) {
    // Already qualified?
    if (sym.includes('/')) return sym;

    // Special built-in symbols that should never be qualified
    const builtins = ['True', 'False', 'Nil', 'Add', 'Sub', 'Mul', 'Div', 'Mod',
                      'Pow', 'Sqrt', 'Abs', 'Min', 'Max', 'Floor', 'Ceil', 'Round',
                      'Concat', 'ToString', 'ToUpper', 'ToLower', 'Trim', 'StrLen',
                      'Substring', 'IndexOf', 'Replace', 'Eq', 'Neq', 'Lt', 'Gt',
                      'Lte', 'Gte', 'And', 'Or', 'Not', 'IsNum', 'IsStr', 'IsSym',
                      'IsTrue', 'IsFalse', 'FreshId', 'Random', 'ParseNum', 'Debug',
                      'If', 'Cons', 'IsNil', 'CharFromCode',
                      // Special forms that are part of the language
                      'R', 'Universe', 'Program', 'Rules', 'RuleRules', 'App', 'State',
                      'UI', 'Apply', 'Bundle', 'Module', 'Import', 'Export', 'Defs', 'Effects',
                      'Var', 'VarRest', '/@',
                      // Runtime operators
                      'Show', 'Project', 'Input',
                      // Event action combinators
                      'Seq', 'When', 'PreventDefault', 'StopPropagation', 'KeyIs',
                      'ClearInput', 'SetInput',
                      // HTML tags - MUST remain unqualified for DOM
                      'Div', 'Span', 'H1', 'H2', 'H3', 'P', 'Button', 'Input', 'Ul', 'Li', 'Fragment',
                      'A', 'Section', 'Header', 'Footer', 'Nav', 'Main', 'Article', 'Aside',
                      'Form', 'Label', 'Select', 'Option', 'Textarea', 'Table', 'Tr', 'Td', 'Th',
                      'Img', 'Video', 'Audio', 'Canvas', 'Svg', 'Path',
                      // Tag helper symbols
                      'KV', 'Props',
                      // Effect terms
                      'Pending', 'Inbox', 'Timer', 'Delay', 'TimerComplete', 'Print', 'Message',
                      'PrintComplete', 'AnimationFrame', 'AnimationFrameComplete', 'Now',
                      'StorageSet', 'StorageGet', 'StorageDel', 'Store', 'Local', 'Session',
                      'Key', 'Value', 'StorageSetComplete', 'StorageGetComplete', 'StorageDelComplete',
                      'Found', 'Missing', 'Ok', 'ClipboardWrite', 'ClipboardRead', 'Text',
                      'ClipboardWriteComplete', 'ClipboardReadComplete', 'Navigate', 'Url',
                      'NavigateComplete', 'ReadLocation', 'ReadLocationComplete', 'Location',
                      'Path', 'RandRequest', 'RandResponse'];
    if (builtins.includes(sym)) return sym;

    // Is it exported by an open import?
    for (const modName of this.openImports) {
      const mod = this.moduleMap.get(modName);
      if (mod && mod.exports.includes(sym)) {
        return `${modName}/${sym}`;
      }
    }

    // Is it one of our module's exports? If so, qualify it
    if (this.module.exports.includes(sym)) {
      return `${this.module.name}/${sym}`;
    }

    // Is it defined in our module's Defs? If so, qualify it
    if (this.module.defs && this.module.defs[sym] !== undefined) {
      return `${this.module.name}/${sym}`;
    }

    // Otherwise, it's a local domain constructor - keep unqualified
    // This allows pattern matching to work within the module
    return sym;
  }

  resolveAlias(sym) {
    // Handle Alias/Name -> Module/Name
    const slashIdx = sym.indexOf('/');
    if (slashIdx > 0) {
      const prefix = sym.substring(0, slashIdx);
      const suffix = sym.substring(slashIdx + 1);
      const resolved = this.importMap.get(prefix);
      if (resolved) {
        return `${resolved}/${suffix}`;
      }
    }
    return sym;
  }

  // Special handling for event handler expressions
  qualifyEventHandler(node) {
    if (!node) return node;

    if (isSym(node)) {
      // Action names in event handlers should not be qualified
      return node;
    }

    if (isCall(node)) {
      const head = node.h;

      // Common event handler combinators
      if (isSym(head)) {
        const headName = head.v;

        // These combinators take actions as arguments
        if (headName === 'Seq' || headName === 'When' || headName === 'If' ||
            headName === 'PreventDefault' || headName === 'StopPropagation') {
          // First argument might be a condition (for When/If) or action
          if (headName === 'When' || headName === 'If') {
            // When/If: first arg is condition, rest are actions
            return Call(
              head,
              this.qualify(node.a[0]), // Condition gets qualified
              ...node.a.slice(1).map(a => this.qualifyEventHandler(a))
            );
          } else {
            // Other combinators: all args are actions
            return Call(head, ...node.a.map(a => this.qualifyEventHandler(a)));
          }
        }

        // Input-related actions
        if (headName === 'ClearInput' || headName === 'SetInput') {
          return node; // Keep as-is
        }

        // This is an action call - don't qualify the head
        return Call(head, ...node.a.map(a => this.qualify(a)));
      }

      return Call(this.qualifyEventHandler(head), ...node.a.map(a => this.qualifyEventHandler(a)));
    }

    return this.qualify(node);
  }

  qualify(node) {
    if (!node) return node;

    if (isSym(node)) {
      // First resolve aliases
      let sym = this.resolveAlias(node.v);
      // Then qualify if needed
      sym = this.qualifySymbol(sym);
      return Sym(sym);
    }

    if (isCall(node)) {
      // Special case: don't qualify inside {Var ...} or {VarRest ...}
      if (isSym(node.h) && (node.h.v === 'Var' || node.h.v === 'VarRest')) {
        return node;
      }

      // Special case: Rule names (first arg of R) should not be qualified
      if (isSym(node.h) && node.h.v === 'R' && node.a.length >= 1) {
        // Don't qualify the rule name (first arg), but qualify everything else
        return Call(
          this.qualify(node.h),
          node.a[0], // Keep rule name as-is
          ...node.a.slice(1).map(a => this.qualify(a))
        );
      }

      // Special case: Apply action names (first arg) should not be qualified
      if (isSym(node.h) && node.h.v === 'Apply' && node.a.length >= 1) {
        const firstArg = node.a[0];
        // If the first arg is a symbol or a call with symbol head, don't qualify it
        if (isSym(firstArg)) {
          return Call(
            this.qualify(node.h),
            firstArg, // Keep action name as-is
            ...node.a.slice(1).map(a => this.qualify(a))
          );
        } else if (isCall(firstArg) && isSym(firstArg.h)) {
          // For calls like {AddTodoWithTitle ...}, keep the head unqualified
          return Call(
            this.qualify(node.h),
            Call(firstArg.h, ...firstArg.a.map(a => this.qualify(a))),
            ...node.a.slice(1).map(a => this.qualify(a))
          );
        }
      }

      // Special case: KV nodes for event handlers - don't qualify the action value
      if (isSym(node.h) && node.h.v === 'KV' && node.a.length >= 2) {
        const [key, value] = node.a;
        if (isStr(key) && (key.v === 'onClick' || key.v === 'onKeydown' || key.v === 'onSubmit' ||
                          key.v === 'onChange' || key.v === 'onInput' || key.v === 'onFocus' ||
                          key.v === 'onBlur')) {
          // For event handlers, don't qualify the action if it's a symbol or has a symbol head
          if (isSym(value)) {
            return Call(this.qualify(node.h), key, value);
          } else if (isCall(value)) {
            // For complex event handlers like {When ...}, recursively handle but preserve action names
            return Call(this.qualify(node.h), key, this.qualifyEventHandler(value));
          }
          return Call(this.qualify(node.h), key, this.qualify(value));
        }
      }

      return Call(this.qualify(node.h), ...node.a.map(a => this.qualify(a)));
    }

    return node;
  }
}

/* ---------------- Module Linker ---------------- */
class ModuleLinker {
  constructor(modules) {
    this.modules = modules;
    this.moduleMap = new Map();
    for (const mod of modules) {
      this.moduleMap.set(mod.name, mod);
    }
  }

  // Topological sort modules by dependencies
  topoSort() {
    const visited = new Set();
    const sorted = [];
    const visiting = new Set(); // For cycle detection

    const visit = (modName) => {
      if (visited.has(modName)) return;
      if (visiting.has(modName)) {
        throw new Error(`Circular dependency detected involving ${modName}`);
      }

      visiting.add(modName);
      const mod = this.moduleMap.get(modName);
      if (mod) {
        for (const imp of mod.imports) {
          visit(imp.module);
        }
        sorted.push(mod);
      }
      visiting.delete(modName);
      visited.add(modName);
    };

    for (const mod of this.modules) {
      visit(mod.name);
    }

    return sorted;
  }

  link(entryModuleName) {
    const sorted = this.topoSort();
    const allRules = [];
    const allRuleRules = [];

    // Process each module in dependency order
    for (const mod of sorted) {
      const qualifier = new SymbolQualifier(mod, this.moduleMap);

      // Qualify all rules
      const qualifiedRules = mod.rules.map(rule => qualifier.qualify(rule));
      allRules.push(...qualifiedRules);

      // Qualify meta-rules
      const qualifiedRuleRules = mod.ruleRules.map(rule => qualifier.qualify(rule));
      allRuleRules.push(...qualifiedRuleRules);

      // Expand defs - add as rules
      for (const [name, expr] of Object.entries(mod.defs)) {
        const qualName = `${mod.name}/${name}`;
        const qualExpr = qualifier.qualify(expr);
        // Add two rules: one for symbol, one for nullary call
        // {R "ModName/DefName/Sym" ModName/DefName <expanded-expr>}
        const defRuleSym = Call(
          Sym('R'),
          Str(`${qualName}/Def`),
          Sym(qualName),
          qualExpr,
          Num(1000)  // Very high priority
        );
        // {R "ModName/DefName/Call" {ModName/DefName} <expanded-expr>}
        const defRuleCall = Call(
          Sym('R'),
          Str(`${qualName}/DefCall`),
          Call(Sym(qualName)),  // Match nullary call
          qualExpr,
          Num(999)  // Slightly lower priority
        );
        allRules.unshift(defRuleCall); // Add both rules
        allRules.unshift(defRuleSym);
      }
    }

    // Get the entry module's program
    const entryMod = this.moduleMap.get(entryModuleName);
    if (!entryMod || !entryMod.program) {
      throw new Error(`Entry module ${entryModuleName} must have a Program section`);
    }

    const entryQualifier = new SymbolQualifier(entryMod, this.moduleMap);
    const qualifiedProgram = entryQualifier.qualify(entryMod.program);

    // Build the Universe
    return Call(
      Sym('Universe'),
      qualifiedProgram,
      Call(Sym('Rules'), ...allRules),
      Call(Sym('RuleRules'), ...allRuleRules)
    );
  }
}

/* --------------- Tokenizer (reuse from sym-2-json) ----------------- */
let SOURCE_TEXT = '';

function tokenize(src, filename = '<input>') {
  const tokens = [];
  let i = 0;
  const len = src.length;
  let line = 1;
  let col = 1;

  const isWS = c => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const isDigit = c => c >= '0' && c <= '9';
  const isDelim = c => c === '{' || c === '}' || c === '"' || c === ';';

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

    if (isWS(c)) { advance(); continue; }

    if (c === ';') {
      while (i < len && src[i] !== '\n') advance();
      continue;
    }

    if (c === '{' || c === '}') {
      tokens.push({ t: c, pos: startPos });
      advance();
      continue;
    }

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

/* --------------- Parser -------------------- */
function parse(tokens) {
  let i = 0;
  const braceStack = [];

  const peek = () => tokens[i] || null;
  const eat  = () => tokens[i++] || null;

  function parseExpr() {
    const tok = peek();
    if (!tok) {
      if (braceStack.length > 0) {
        const innermost = braceStack[braceStack.length - 1];
        die(`Unexpected EOF - unclosed '{' from line ${innermost.pos.line}`, innermost.pos);
      }
      die('Unexpected EOF');
    }

    if (tok.t === 'num') { eat(); return { k: 'Num', v: tok.v }; }
    if (tok.t === 'str') { eat(); return { k: 'Str', v: tok.v }; }
    if (tok.t === 'sym') { eat(); return { k: 'Sym', v: tok.v }; }

    if (tok.t === '}') {
      if (braceStack.length === 0) {
        die('Unexpected closing brace - no matching opening brace', tok.pos);
      }
      die('Unexpected closing brace', tok.pos);
    }

    if (tok.t === '{') {
      const openBrace = eat();
      braceStack.push(openBrace);

      if (peek() && peek().t === '}') {
        const closeBrace = eat();
        braceStack.pop();
        return { k: 'Sym', v: 'Nil' };
      }

      const head = parseExpr();
      const args = [];
      while (true) {
        const t = peek();

        if (!t) {
          let msg = 'Unterminated list - missing closing brace';
          if (braceStack.length > 1) {
            msg += '\n\nLikely issue: Check these unclosed braces (most recent first):';
            for (let i = braceStack.length - 1; i >= Math.max(0, braceStack.length - 3); i--) {
              const p = braceStack[i];
              const lineContent = SOURCE_TEXT.split('\n')[p.pos.line - 1];
              const preview = lineContent ? lineContent.substring(p.pos.col - 1, Math.min(p.pos.col + 40, lineContent.length)) : '';
              msg += `\n  Line ${p.pos.line}, col ${p.pos.col}: ${preview.trim()}`;
            }
          }
          const reportPos = braceStack[braceStack.length - 1].pos;
          die(msg, reportPos);
        }
        if (t.t === '}') {
          eat();
          braceStack.pop();
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
    if (tok && tok.t === '}') {
      die('Unexpected closing brace - no matching opening brace', tok.pos);
    }
    exprs.push(parseExpr());
  }

  if (braceStack.length > 0) {
    let msg = 'Unclosed braces detected:';
    for (let i = 0; i < braceStack.length; i++) {
      const p = braceStack[i];
      const lineContent = SOURCE_TEXT.split('\n')[p.pos.line - 1];
      const preview = lineContent ? lineContent.substring(p.pos.col - 1, p.pos.col + 20).replace(/\n/g, ' ') : '';
      msg += `\n  Line ${p.pos.line}, col ${p.pos.col}: ${preview}`;
    }
    const lastOpened = braceStack[braceStack.length - 1];
    die(msg, lastOpened.pos);
  }

  if (exprs.length === 1) return exprs[0];
  return { k: 'Call', h: { k: 'Sym', v: 'Bundle' }, a: exprs };
}

/* --------------- Postprocessing --------------- */
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

  if (node.k === 'Sym') {
    const v = node.v;

    // Check for rest variable shorthand
    if (v === '...') {
      return { k: 'Call', h: { k: 'Sym', v: 'VarRest' }, a: [ { k: 'Str', v: '_' } ] };
    } else if (v.endsWith('...')) {
      const base = v.slice(0, -3);
      return { k: 'Call', h: { k: 'Sym', v: 'VarRest' }, a: [ { k: 'Str', v: base } ] };
    }

      // Check for regular variable shorthand
    if (v === '_') {
      return { k: 'Call', h: { k: 'Sym', v: 'Var' }, a: [ { k: 'Str', v: '_' } ] };
    } else if (v.endsWith('_') && !v.endsWith('...')) {
      const base = v.slice(0, -1);
      return { k: 'Call', h: { k: 'Sym', v: 'Var' }, a: [ { k: 'Str', v: base } ] };
    }

    return node;
  }

  if (node.k === 'Call') {
    const head = postprocess(node.h);

    // Special handling for {Var ...} and {VarRest ...}
    if (head.k === 'Sym' && (head.v === 'Var' || head.v === 'VarRest')) {
      if (node.a.length !== 1) die(`{${head.v} ...} expects exactly one argument`);
      const nameExpr = node.a[0];
      let nameStr;
      if (nameExpr.k === 'Str') nameStr = nameExpr.v;
      else if (nameExpr.k === 'Sym') nameStr = nameExpr.v;
      else die(`{${head.v} name} expects symbol or string`);

      // Handle triple underscore in explicit Var
      if (head.v === 'Var' && nameStr.endsWith('...')) {
        const base = nameStr.slice(0, -3);
        return { k: 'Call', h: { k: 'Sym', v: 'VarRest' }, a: [ { k: 'Str', v: base } ] };
      }

      // Always convert to string argument
      return { k: 'Call', h: { k: 'Sym', v: head.v }, a: [ { k: 'Str', v: nameStr } ] };
    }

    const args = node.a.map(postprocess);
    return { k: 'Call', h: head, a: args };
  }

  return node;
}

/* --------------- Error handling ---------------------- */
function die(msg, pos = null) {
  let errorMsg = msg;

  if (pos && SOURCE_TEXT) {
    const lines = SOURCE_TEXT.split('\n');
    const lineNum = pos.line;
    const colNum = pos.col;
    const fileName = pos.file || '<input>';

    errorMsg = `${fileName}:${lineNum}:${colNum}: error: ${msg}`;

    const startLine = Math.max(0, lineNum - 3);
    const endLine = Math.min(lines.length - 1, lineNum + 2);

    console.error('\n' + errorMsg + '\n');

    for (let i = startLine; i <= endLine; i++) {
      const isErrorLine = i === lineNum - 1;
      const lineNumStr = String(i + 1).padStart(4, ' ');
      const prefix = isErrorLine ? '>' : ' ';
      console.error(`${prefix} ${lineNumStr} | ${lines[i]}`);

      if (isErrorLine) {
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
  e.showStack = false;
  throw e;
}

/* ---------------- CLI args ---------------- */
const args = process.argv.slice(2);
let inFiles = [];
let outFile = null;
let pretty = false;
let bundle = false;
let entryModule = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out' || a === '-o') {
    outFile = args[++i] ?? die('Expected path after --out');
  } else if (a === '--pretty' || a === '-p') {
    pretty = true;
  } else if (a === '--bundle') {
    bundle = true;
  } else if (a === '--entry' || a === '-e') {
    entryModule = args[++i] ?? die('Expected module name after --entry');
  } else if (a.startsWith('-')) {
    die(`Unknown flag: ${a}`);
  } else {
    // Support wildcards
    if (a.includes('*')) {
      const glob = await import('glob');
      const files = await glob.glob(a);
      inFiles.push(...files);
    } else {
      inFiles.push(a);
    }
  }
}

/* --------------- Main ---------------------- */
(async () => {
  try {
    if (!bundle) {
      // Single file mode - backward compatibility
      if (inFiles.length !== 1) {
        die('Single file mode requires exactly one input file');
      }
      const src = fs.readFileSync(inFiles[0], 'utf8');
      SOURCE_TEXT = src;
      const tokens = tokenize(src, inFiles[0]);
      const ast = desugarTagProps(postprocess(parse(tokens)));

      // If it's a Module, error
      if (isCall(ast) && isSym(ast.h) && ast.h.v === 'Module') {
        console.error('Warning: This file contains a Module. Use --bundle mode to link modules.');
        console.error('For backward compatibility, outputting the raw module AST.');
      }

      const json = pretty ? JSON.stringify(ast, null, 2) : JSON.stringify(ast);
      if (outFile) {
        fs.writeFileSync(outFile, json);
      } else {
        process.stdout.write(json + '\n');
      }
    } else {
      // Module bundling mode
      if (!entryModule) {
        die('Bundle mode requires --entry Module/Name');
      }

      const modules = [];

      for (const file of inFiles) {
        const src = fs.readFileSync(file, 'utf8');
        SOURCE_TEXT = src;
        const tokens = tokenize(src, file);
        const ast = desugarTagProps(postprocess(parse(tokens)));

        // Extract module name
        if (!isCall(ast) || !isSym(ast.h) || ast.h.v !== 'Module') {
          console.error(`Warning: ${file} does not contain a Module, skipping`);
          continue;
        }

        const nameNode = ast.a[0];
        if (!isSym(nameNode)) {
          die(`Module in ${file} must have a name`);
        }

        modules.push(new Module(nameNode.v, ast));
      }

      // Link modules
      const linker = new ModuleLinker(modules);
      const universe = linker.link(entryModule);

      const json = pretty ? JSON.stringify(universe, null, 2) : JSON.stringify(universe);
      if (outFile) {
        fs.writeFileSync(outFile, json);
        console.error(`✅ Bundled ${modules.length} modules into ${outFile}`);
      } else {
        process.stdout.write(json + '\n');
      }
    }
  } catch (err) {
    if (err.showStack === false) {
      process.exit(1);
    } else {
      console.error(err);
      process.exit(1);
    }
  }
})();
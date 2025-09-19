#!/usr/bin/env node

/*****************************************************************
 * Syma Module Compiler
 *
 * Compiles Syma source files (.syma) to JSON AST format.
 * Supports module system with imports, exports, and symbol qualification.
 ******************************************************************/

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import { SymaParser } from '../src/core/parser.js';
import { K, Sym, Num, Str, Call, isSym, isNum, isStr, isCall } from '../src/ast-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
                      'Path', 'RandRequest', 'RandResponse',
                      'HttpReq', 'HttpRes', 'Method', 'Body', 'Headers', 'Status', 'Json', 'Error',
                      'WsConnect', 'WsConnectComplete', 'WsSend', 'WsSendComplete', 'WsRecv',
                      'WsClose', 'WsCloseComplete', 'Opened', 'Closed', 'Ack', 'Code', 'Reason',
                      'Obj', 'List', 'Pair'];
    if (builtins.includes(sym)) return sym;

    // Is it exported by an open import?
    for (const modName of this.openImports) {
      const mod = this.moduleMap.get(modName);
      if (mod && mod.exports.includes(sym)) {
        return `${modName}/${sym}`;
      }
    }

    // Is it an alias for an imported module?
    if (this.importMap.has(sym)) {
      // When used as a prefix (e.g., KV/Get), don't qualify
      return sym;
    }

    // Otherwise qualify with current module name
    return `${this.module.name}/${sym}`;
  }

  qualify(node) {
    if (isSym(node)) {
      // Check if it's a module prefix (e.g., "KV" in "KV/Get")
      const v = node.v;
      if (v.includes('/')) {
        const [prefix, ...rest] = v.split('/');
        const suffix = rest.join('/');
        if (this.importMap.has(prefix)) {
          const realModule = this.importMap.get(prefix);
          return Sym(`${realModule}/${suffix}`);
        }
        return node; // Already qualified
      }
      return Sym(this.qualifySymbol(v));
    }

    if (isNum(node) || isStr(node)) {
      return node;
    }

    if (isCall(node)) {
      return Call(
        this.qualify(node.h),
        ...node.a.map(a => this.qualify(a))
      );
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
        const defRuleSym = Call(
          Sym('R'),
          Str(`${qualName}/Def`),
          Sym(qualName),
          qualExpr,
          Num(1000)  // Very high priority
        );
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

/* ---------------- Main Compiler ---------------- */
async function compile(options) {
  const { files, bundle, entry, output, pretty } = options;

  // Use our shared parser
  const parser = new SymaParser();

  if (bundle) {
    // Module bundling mode
    const modules = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const ast = parser.parseString(content, file);

      // Extract module name from AST
      if (!isCall(ast) || !isSym(ast.h) || ast.h.v !== 'Module') {
        throw new Error(`${file}: Not a module file (must start with Module)`);
      }

      const nameNode = ast.a[0];
      if (!isSym(nameNode)) {
        throw new Error(`${file}: Module name must be a symbol`);
      }

      modules.push(new Module(nameNode.v, ast));
    }

    if (!entry) {
      throw new Error('--entry is required when bundling modules');
    }

    const linker = new ModuleLinker(modules);
    const universe = linker.link(entry);

    const json = JSON.stringify(universe, null, pretty ? 2 : 0);
    if (output) {
      fs.writeFileSync(output, json);
    } else {
      console.log(json);
    }

  } else {
    // Single file mode (backward compatibility)
    if (files.length !== 1) {
      throw new Error('Single file mode requires exactly one input file');
    }

    const content = fs.readFileSync(files[0], 'utf-8');
    const ast = parser.parseString(content, files[0]);

    const json = JSON.stringify(ast, null, pretty ? 2 : 0);
    if (output) {
      fs.writeFileSync(output, json);
    } else {
      console.log(json);
    }
  }
}

/* ---------------- CLI ---------------- */
function printUsage() {
  console.log(`
Syma Module Compiler

Usage:
  syma-compile <file> [options]                     # Single file mode
  syma-compile <files...> --bundle --entry <name>   # Module bundling mode

Options:
  -o, --out <file>      Output file (default: stdout)
  --pretty              Pretty-print JSON output
  --bundle              Bundle multiple modules
  --entry <name>        Entry module name (required with --bundle)
  -h, --help            Show this help

Examples:
  # Compile single file
  syma-compile input.syma --out output.json --pretty

  # Bundle modules
  syma-compile src/*.syma --bundle --entry App/Main --out universe.json

  # Use with REPL
  syma-compile app.syma --out app.json && syma-repl --load app.json
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const options = {
    files: [],
    bundle: false,
    entry: null,
    output: null,
    pretty: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-o':
      case '--out':
        options.output = args[++i];
        break;

      case '--pretty':
        options.pretty = true;
        break;

      case '--bundle':
        options.bundle = true;
        break;

      case '--entry':
        options.entry = args[++i];
        break;

      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        // Expand globs
        const expanded = await glob(arg);
        if (expanded.length === 0) {
          console.error(`No files matching: ${arg}`);
          process.exit(1);
        }
        options.files.push(...expanded);
    }
  }

  if (options.files.length === 0) {
    console.error('No input files specified');
    process.exit(1);
  }

  try {
    await compile(options);
  } catch (error) {
    console.error(`Compilation failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
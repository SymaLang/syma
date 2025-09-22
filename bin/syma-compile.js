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
import { createParser } from '../src/core/parser-factory.js';
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
    // Parse {Import X/Y as Z [from "path"] [open]}
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

      let fromPath = null;
      let open = false;

      // Check for 'from' clause
      if (i < nodes.length && isSym(nodes[i]) && nodes[i].v === 'from') {
        i++; // skip 'from'
        if (i >= nodes.length || !isStr(nodes[i])) {
          throw new Error('Import "from" must be followed by a string path');
        }
        fromPath = nodes[i++].v;
      }

      // Check for 'open' modifier
      if (i < nodes.length && isSym(nodes[i]) && nodes[i].v === 'open') {
        open = true;
        i++;
      }

      this.imports.push({
        module: moduleNode.v,
        alias,
        fromPath,
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
    this.localSymbols = new Set(); // symbols defined in this module

    // Build import maps
    for (const imp of module.imports) {
      this.importMap.set(imp.alias, imp.module);
      if (imp.open) {
        this.openImports.add(imp.module);
      }
    }

    // Track symbols defined in this module
    // 1. Exported symbols
    for (const exp of module.exports) {
      this.localSymbols.add(exp);
    }

    // 2. Def names
    for (const name of Object.keys(module.defs)) {
      this.localSymbols.add(name);
    }

    // 3. Action symbols from rule patterns (Apply patterns)
    // Look for patterns like Apply(ActionName, ...) in rules
    for (const rule of module.rules) {
      if (isCall(rule) && isSym(rule.h) && rule.h.v === 'R' && rule.a.length >= 2) {
        const pattern = rule.a[1]; // The LHS pattern
        if (isCall(pattern) && isSym(pattern.h) && pattern.h.v === 'Apply') {
          if (pattern.a.length > 0 && isSym(pattern.a[0])) {
            // This is an action symbol that should be qualified
            this.localSymbols.add(pattern.a[0].v);
          }
        }
      }
    }
  }

  qualifySymbol(sym) {
    // Already qualified?
    if (sym.includes('/')) return sym;

    // HTML attributes (start with :) should NEVER be qualified
    if (sym.startsWith(':')) return sym;

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
                      'ReadLine', 'ReadLineComplete', 'GetChar', 'GetCharComplete', 'Char',
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

    // Is it a locally defined symbol in this module?
    if (this.localSymbols.has(sym)) {
      return `${this.module.name}/${sym}`;
    }

    // Otherwise it's a free variable - leave it unqualified
    // This includes mathematical variables, unbound symbols, etc.
    return sym;
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

  link(entryModuleName, libraryMode = false) {
    const sorted = this.topoSort();
    const allRules = [];
    const allRuleRules = [];

    // Process each module in dependency order
    for (const mod of sorted) {
      const qualifier = new SymbolQualifier(mod, this.moduleMap);

      // Qualify all rules
      const qualifiedRules = mod.rules.map(rule => qualifier.qualify(rule));
      allRules.push(...qualifiedRules);
      // To Claude: This was my idea to tag rules with their module, and then resolve RuleRules based on that
      // allRules.push(...qualifiedRules.map(r => Call(Sym('TaggedRule'), Str(mod.name), r)));

      // Qualify meta-rules
      const qualifiedRuleRules = mod.ruleRules.map(rule => qualifier.qualify(rule));
      allRuleRules.push(...qualifiedRuleRules);
      // allRuleRules.push(...qualifiedRuleRules.map(r => Call(Sym('TaggedRuleRule'), Str(mod.name), r)));

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

    if (libraryMode) {
      // In library mode, just return a Universe with Rules (no Program required)
      return Call(
        Sym('Universe'),
        Call(Sym('Rules'), ...allRules),
        Call(Sym('RuleRules'), ...allRuleRules)
      );
    } else {
      // Normal mode - require entry module with Program
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
}

/* ---------------- Module Resolution ---------------- */
async function resolveModule(importSpec, currentFile, stdlibPath = null) {
  const { module: moduleName, fromPath } = importSpec;

  if (fromPath) {
    // Resolve relative to current file
    const currentDir = path.dirname(currentFile);
    const resolvedPath = path.resolve(currentDir, fromPath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Cannot resolve module ${moduleName} from path: ${fromPath}`);
    }

    return resolvedPath;
  } else {
    // Standard module - look in stdlib directory
    if (!stdlibPath) {
      // Default stdlib locations to check
      const possiblePaths = [
        path.join(__dirname, '../src/stdlib'),
        path.join(process.cwd(), 'src/stdlib'),
        path.join(process.cwd(), 'stdlib')
      ];

      for (const stdPath of possiblePaths) {
        const modulePath = path.join(stdPath, `${moduleName.toLowerCase().replace(/\//g, '-')}.syma`);
        if (fs.existsSync(modulePath)) {
          return modulePath;
        }
      }

      throw new Error(`Cannot find standard module ${moduleName}. Searched in: ${possiblePaths.join(', ')}`);
    }

    const modulePath = path.join(stdlibPath, `${moduleName.toLowerCase().replace(/\//g, '-')}.syma`);
    if (!fs.existsSync(modulePath)) {
      throw new Error(`Cannot find standard module ${moduleName} in ${stdlibPath}`);
    }

    return modulePath;
  }
}

async function loadModuleRecursive(filePath, loadedModules = new Map(), stdlibPath = null, parser = null) {
  if (!parser) parser = await createParser({ useTreeSitter: true });

  // Normalize the path to avoid duplicates
  const normalizedPath = path.resolve(filePath);

  // Check if already loaded
  if (loadedModules.has(normalizedPath)) {
    return loadedModules.get(normalizedPath);
  }

  // Parse the module
  const content = fs.readFileSync(normalizedPath, 'utf-8');
  const ast = parser.parseString(content, normalizedPath);

  if (!isCall(ast) || !isSym(ast.h) || ast.h.v !== 'Module') {
    throw new Error(`${normalizedPath}: Not a module file (must start with Module)`);
  }

  const nameNode = ast.a[0];
  if (!isSym(nameNode)) {
    throw new Error(`${normalizedPath}: Module name must be a symbol`);
  }

  const module = new Module(nameNode.v, ast);
  module.filePath = normalizedPath;
  loadedModules.set(normalizedPath, module);

  // Load dependencies
  for (const imp of module.imports) {
    try {
      const depPath = await resolveModule(imp, normalizedPath, stdlibPath);
      await loadModuleRecursive(depPath, loadedModules, stdlibPath, parser);
    } catch (error) {
      console.warn(`Warning: Could not load dependency ${imp.module}: ${error.message}`);
    }
  }

  return module;
}

/* ---------------- Main Compiler ---------------- */
async function compile(options) {
  const { files, bundle, entry, output, pretty, format, stdlibPath, library } = options;

  // Use tree-sitter parser by default, fallback to original if it fails
  const parser = await createParser({ useTreeSitter: true });

  // Format mode - pretty print .syma files
  if (format) {
    if (files.length !== 1) {
      throw new Error('Format mode requires exactly one input file');
    }

    const content = fs.readFileSync(files[0], 'utf-8');

    // Use formatSource if available (tree-sitter parser), otherwise fallback to prettyPrint
    let formatted;
    if (parser.formatSource) {
      // Tree-sitter parser with comment preservation
      formatted = parser.formatSource(content, {
        preserveComments: true,
        preserveNewlines: true,
        preserveIndentation: false,
        indentSize: 2
      });
    } else {
      // Fallback to old method (loses comments)
      console.warn('Warning: Using legacy formatter that strips comments. Consider using tree-sitter parser.');
      const ast = parser.parseString(content, files[0]);
      formatted = parser.prettyPrint(ast);
    }

    if (output) {
      fs.writeFileSync(output, formatted);
    } else {
      console.log(formatted);
    }
    return;
  }

  if (bundle) {
    // Module bundling mode - now with proper dependency resolution
    const loadedModules = new Map();

    // Determine entry module
    let entryModuleName = entry;
    let entryFile = null;

    if (!entry && files.length === 1) {
      // If no entry specified and only one file, use that file's module as entry
      const content = fs.readFileSync(files[0], 'utf-8');
      const ast = parser.parseString(content, files[0]);

      if (isCall(ast) && isSym(ast.h) && ast.h.v === 'Module') {
        const nameNode = ast.a[0];
        if (isSym(nameNode)) {
          entryModuleName = nameNode.v;
          entryFile = files[0];
          console.error(`Using ${entryModuleName} as entry module`);
        }
      }

      if (!entryModuleName) {
        throw new Error('Could not determine entry module from single file');
      }
    } else if (!entry) {
      throw new Error('--entry is required when bundling multiple module files');
    } else {
      // Find the entry module file
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const ast = parser.parseString(content, file);

        if (isCall(ast) && isSym(ast.h) && ast.h.v === 'Module') {
          const nameNode = ast.a[0];
          if (isSym(nameNode) && nameNode.v === entryModuleName) {
            entryFile = file;
            break;
          }
        }
      }
    }

    if (!entryFile) {
      throw new Error(`Entry module ${entryModuleName} not found in provided files`);
    }

    // Load the entry module and all its dependencies
    await loadModuleRecursive(entryFile, loadedModules, stdlibPath, parser);

    // Convert Map to array for linker
    const modules = Array.from(loadedModules.values());
    console.error(`Bundling ${modules.length} modules (including dependencies)`);

    const linker = new ModuleLinker(modules);
    const universe = linker.link(entryModuleName, library);

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
  syma-compile <file> --bundle                      # Bundle with auto-detected entry
  syma-compile <files...> --bundle --entry <name>   # Bundle with explicit entry
  syma-compile <file> --library                    # Bundle as library (no Program required)
  syma-compile <file> --format                      # Format/pretty-print mode

Options:
  -o, --out <file>      Output file (default: stdout)
  --pretty              Pretty-print JSON output
  --bundle              Bundle modules with dependencies
  --library             Bundle as library (doesn't require Program section)
  --entry <name>        Entry module name (optional for single file)
  --stdlib <path>       Path to standard library modules
  --format, -f          Format/pretty-print .syma file
  -h, --help            Show this help

Examples:
  # Compile single file
  syma-compile input.syma --out output.json --pretty

  # Bundle single module with dependencies (auto-detects entry)
  syma-compile src/main.syma --bundle --out universe.json

  # Bundle multiple modules with explicit entry
  syma-compile src/*.syma --bundle --entry App/Main --out universe.json

  # Bundle library modules (no Program required)
  syma-compile src/stdlib/core-kv.syma --library --out kv-lib.json

  # Format/pretty-print a .syma file
  syma-compile messy.syma --format --out clean.syma
  syma-compile messy.syma -f  # Print to stdout

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
    library: false,
    entry: null,
    output: null,
    pretty: false,
    format: false,
    stdlibPath: null
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

      case '--library':
        options.bundle = true;  // Library mode is a type of bundling
        options.library = true;
        break;

      case '--entry':
        options.entry = args[++i];
        break;

      case '--stdlib':
        options.stdlibPath = args[++i];
        break;

      case '--format':
      case '-f':
        options.format = true;
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
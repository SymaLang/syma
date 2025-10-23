/*****************************************************************
 * Platform-Agnostic Module Compiler
 *
 * Core module compilation logic that works in both Node.js and browser.
 * Platform-specific file operations are injected through the platform interface.
 ******************************************************************/

import { K, Sym, Num, Str, Call, isSym, isNum, isStr, isCall } from '../ast-helpers.js';
import { BUILTINS } from './builtins-vocab.js';

/* ---------------- Module representation ---------------- */
export class Module {
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
      throw new Error(
        'Invalid module format. File must contain a Module declaration.\n\n' +
        'Valid syntax:\n' +
        '  Brace:    {Module Module/Name ...sections...}\n' +
        '  Function: Module(Module/Name, ...sections...)\n\n' +
        'Example:\n' +
        '  {Module App/Counter\n' +
        '    {Export InitialState View Inc Dec}\n' +
        '    {Import Core/KV as KV open}\n' +
        '    {Defs {InitialState {CounterState {KV Count 0}}}}\n' +
        '    {Program {App {State InitialState} {UI {Project View}}}}\n' +
        '    {Rules ...}}'
      );
    }

    const [nameNode, ...sections] = this.ast.a;
    if (!isSym(nameNode)) {
      throw new Error(
        'Module name must be a symbol.\n\n' +
        'Valid syntax:\n' +
        '  {Module Module/Name ...}  or  Module(Module/Name, ...)\n\n' +
        'Examples:\n' +
        '  {Module App/Counter ...}\n' +
        '  {Module Core/List ...}\n' +
        '  {Module Demo/VM ...}'
      );
    }
    if (nameNode.v !== this.name) {
      throw new Error(
        `Module name mismatch!\n` +
        `  Declared in file: ${nameNode.v}\n` +
        `  Expected by compiler: ${this.name}\n\n` +
        `The module name in your file must match the module name expected by the system.\n` +
        `Either:\n` +
        `  1. Rename the module in your file to: {Module ${this.name} ...}\n` +
        `  2. Or ensure the file is imported/loaded with the correct module name.`
      );
    }

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
    // Parse {Import X/Y [as Z] [from "path"] [open] [macro]}
    let i = 0;
    while (i < nodes.length) {
      const moduleNode = nodes[i++];
      if (!isSym(moduleNode)) {
        throw new Error(
          'Import module must be a symbol.\n' +
          'Valid syntax:\n' +
          '  {Import Module/Name [as Alias]}  or  Import(Module/Name, [as, Alias])\n' +
          'Examples:\n' +
          '  {Import Core/KV}               - Alias defaults to full name (Core/KV)\n' +
          '  {Import Core/KV as KV}         - Use short alias (KV)\n' +
          '  {Import Core/KV as KV open}\n' +
          '  {Import Core/Rules/Sugar as CRS macro}'
        );
      }

      // Check for optional 'as' clause
      let alias;
      if (i < nodes.length && isSym(nodes[i]) && nodes[i].v === 'as') {
        i++; // skip 'as'

        if (i >= nodes.length || !isSym(nodes[i])) {
          throw new Error(
            `Import must have an alias after "as".\n` +
            `Found: Import ${moduleNode.v} as ...\n` +
            `Expected: Import ${moduleNode.v} as AliasName\n\n` +
            'The alias is how you reference the imported module\'s symbols.\n' +
            'Examples:\n' +
            '  {Import Core/KV as KV}    - Use as KV/Get, KV/Set\n' +
            '  Import(Core/List, as, L)  - Use as L/Map, L/Filter'
          );
        }
        alias = nodes[i++].v;
      } else {
        // Use full module name as alias when no "as" clause is provided
        alias = moduleNode.v;
      }

      let fromPath = null;
      let open = false;
      let macro = false;

      // Check for 'from' clause
      if (i < nodes.length && isSym(nodes[i]) && nodes[i].v === 'from') {
        i++; // skip 'from'
        if (i >= nodes.length || !isStr(nodes[i])) {
          throw new Error(
            'Import "from" must be followed by a string path.\n' +
            'Valid syntax:\n' +
            '  {Import Module/Name as Alias from "./relative/path.syma"}\n' +
            '  Import(Module/Name, as, Alias, from, "../other.syma")\n\n' +
            'Examples:\n' +
            '  {Import Utils as U from "./utils.syma"}\n' +
            '  {Import Helper as H from "../shared/helper.syma"}'
          );
        }
        fromPath = nodes[i++].v;
      }

      // Check for 'open' and 'macro' modifiers (can have both in any order)
      while (i < nodes.length && isSym(nodes[i])) {
        if (nodes[i].v === 'open') {
          open = true;
          i++;
        } else if (nodes[i].v === 'macro') {
          macro = true;
          i++;
        } else {
          // Unknown modifier, stop parsing
          break;
        }
      }

      this.imports.push({
        module: moduleNode.v,
        alias,
        fromPath,
        open,
        macro
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
export class SymbolQualifier {
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

    // Track ALL symbols that appear in this module (qualify everything by default)
    // Recursively collect all symbols from all sections
    this.collectSymbols(module.ast);
  }

  /**
   * Recursively collect all symbols from an AST node
   * Skip pattern variables (Var/VarRest) - those should not be qualified
   */
  collectSymbols(node) {
    if (isSym(node)) {
      // Only collect unqualified symbols (no '/')
      if (!node.v.includes('/')) {
        this.localSymbols.add(node.v);
      }
    } else if (isCall(node)) {
      // Recursively collect from head and arguments
      if (node.h) {
        this.collectSymbols(node.h);
      }
      for (const arg of node.a) {
        this.collectSymbols(arg);
      }
    }
    // Num and Str nodes don't contain symbols
  }

  qualifySymbol(sym) {
    // Already qualified?
    if (sym.includes('/')) return sym;

    // HTML attributes (start with :) should NEVER be qualified
    if (sym.startsWith(':')) return sym;

    // Check against built-in vocabulary (imported from builtins-vocab.js)
    if (BUILTINS.includes(sym)) return sym;

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
export class ModuleLinker {
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

    // Check if Core/Syntax/Global is in our modules
    const hasGlobalSyntax = sorted.some(mod => mod.name === 'Core/Syntax/Global');

    // If we have Core/Syntax/Global but it's not in sorted (not imported), add it
    if (!hasGlobalSyntax && this.moduleMap.has('Core/Syntax/Global')) {
      const globalSyntaxMod = this.moduleMap.get('Core/Syntax/Global');
      sorted.unshift(globalSyntaxMod); // Add at the beginning
    }

    const allRules = [];
    const allRuleRules = [];

    // Build macro scopes map: which modules can use which RuleRules
    const macroScopes = new Map(); // module name -> Set of RuleRule module names

    for (const mod of sorted) {
      const scope = new Set();

      // Special case: Core/Syntax/Global applies to everyone
      if (this.moduleMap.has('Core/Syntax/Global')) {
        scope.add('Core/Syntax/Global');
      }

      // Module's own RuleRules always apply to its own rules
      if (mod.ruleRules.length > 0) {
        scope.add(mod.name);
      }

      // Add modules imported with 'macro' qualifier
      for (const imp of mod.imports) {
        if (imp.macro) {
          scope.add(imp.module);
        }
      }

      macroScopes.set(mod.name, scope);
    }

    // Add special "*" scope for Core/Syntax/Global if it exists
    if (hasGlobalSyntax || this.moduleMap.has('Core/Syntax/Global')) {
      macroScopes.set('*', new Set(['Core/Syntax/Global']));
    }

    // Process each module in dependency order
    for (const mod of sorted) {
      const qualifier = new SymbolQualifier(mod, this.moduleMap);

      // Tag and qualify all rules with their source module
      const qualifiedRules = mod.rules.map(rule => {
        const qualified = qualifier.qualify(rule);
        // Wrap rule with module tag
        return Call(Sym('TaggedRule'), Str(mod.name), qualified);
      });
      allRules.push(...qualifiedRules);

      // Tag and qualify meta-rules with their source module
      const qualifiedRuleRules = mod.ruleRules.map(rule => {
        const qualified = qualifier.qualify(rule);
        // Wrap rule with module tag
        return Call(Sym('TaggedRuleRule'), Str(mod.name), qualified);
      });
      allRuleRules.push(...qualifiedRuleRules);

      // Expand defs - add as rules (also tagged with module)
      for (const [name, expr] of Object.entries(mod.defs)) {
        const qualName = `${mod.name}/${name}`;
        const qualExpr = qualifier.qualify(expr);
        // Add two rules: one for symbol, one for nullary call
        const defRuleSym = Call(
          Sym('TaggedRule'),
          Str(mod.name),
          Call(
            Sym('R'),
            Str(`${qualName}/Def`),
            Sym(qualName),
            qualExpr,
            Num(1000)  // Very high priority
          )
        );
        const defRuleCall = Call(
          Sym('TaggedRule'),
          Str(mod.name),
          Call(
            Sym('R'),
            Str(`${qualName}/DefCall`),
            Call(Sym(qualName)),  // Match nullary call
            qualExpr,
            Num(999)  // Slightly lower priority
          )
        );
        allRules.unshift(defRuleCall); // Add both rules
        allRules.unshift(defRuleSym);
      }
    }

    // Serialize macro scopes for inclusion in Universe
    const macroScopesData = [];
    for (const [modName, scopeSet] of macroScopes) {
      // Each entry is {Module "ModName" {RuleRulesFrom "Mod1" "Mod2" ...}}
      macroScopesData.push(
        Call(
          Sym('Module'),
          Str(modName),
          Call(Sym('RuleRulesFrom'), ...Array.from(scopeSet).map(m => Str(m)))
        )
      );
    }

    if (libraryMode) {
      // In library mode, just return a Universe with Rules (no Program required)
      return Call(
        Sym('Universe'),
        Call(Sym('Rules'), ...allRules),
        Call(Sym('RuleRules'), ...allRuleRules),
        Call(Sym('MacroScopes'), ...macroScopesData)
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
        Call(Sym('RuleRules'), ...allRuleRules),
        Call(Sym('MacroScopes'), ...macroScopesData)
      );
    }
  }
}

/* ---------------- Platform Interface ---------------- */
export class ModuleCompilerPlatform {
  /**
   * Check if a module exists
   * @param {string} moduleName - Module name like "Core/List"
   * @returns {Promise<boolean>}
   */
  async moduleExists(moduleName) {
    throw new Error('moduleExists must be implemented by platform');
  }

  /**
   * Load a module's AST
   * @param {string} moduleName - Module name like "Core/List"
   * @returns {Promise<Object>} - Parsed AST
   */
  async loadModule(moduleName) {
    throw new Error('loadModule must be implemented by platform');
  }

  /**
   * Load a module's AST from a file path
   * @param {string} filePath - File path
   * @returns {Promise<Object>} - Parsed AST
   */
  async loadModuleFromPath(filePath) {
    throw new Error('loadModuleFromPath must be implemented by platform');
  }

  /**
   * Resolve module dependencies
   * @param {string} importedName - Imported module name
   * @param {string} importingModule - Module doing the import
   * @returns {Promise<string>} - Resolved module name
   */
  async resolveImport(importedName, importingModule) {
    // Default implementation - just return the imported name
    return importedName;
  }

  /**
   * Resolve a relative import path
   * @param {string} relativePath - Relative path from import statement
   * @param {string} importingModule - Module doing the import
   * @returns {Promise<string>} - Resolved absolute path
   */
  async resolveImportPath(relativePath, importingModule) {
    throw new Error('resolveImportPath must be implemented by platform');
  }
}

/* ---------------- Module Compiler ---------------- */
export class ModuleCompiler {
  constructor(platform) {
    this.platform = platform;
    this.loadedModules = new Map(); // name -> Module
  }

  /**
   * Load a module from a specific file path
   */
  async loadModuleFromPath(filePath, visited = new Set()) {
    // Load the module AST from the file
    const ast = await this.platform.loadModuleFromPath(filePath);

    // Extract module name from AST
    if (!isCall(ast) || !isSym(ast.h) || ast.h.v !== 'Module') {
      throw new Error(`Invalid module format in ${filePath}`);
    }
    const nameNode = ast.a[0];
    if (!isSym(nameNode)) {
      throw new Error(`Module name must be a symbol in ${filePath}`);
    }
    const moduleName = nameNode.v;

    // Now load it recursively with the extracted name
    if (!visited.has(moduleName)) {
      visited.add(moduleName);
      const module = new Module(moduleName, ast);
      this.loadedModules.set(moduleName, module);

      // Load its dependencies
      for (const imp of module.imports) {
        if (imp.fromPath) {
          try {
            const resolvedPath = await this.platform.resolveImportPath(imp.fromPath, moduleName);
            await this.loadModuleFromPath(resolvedPath, visited);
          } catch (error) {
            console.warn(`Warning: Could not load dependency ${imp.module} from ${imp.fromPath}: ${error.message}`);
          }
        } else {
          const resolvedName = await this.platform.resolveImport(imp.module, moduleName);
          try {
            await this.loadModuleRecursive(resolvedName, visited);
          } catch (error) {
            console.warn(`Warning: Could not load dependency ${imp.module}: ${error.message}`);
          }
        }
      }

      return module;
    }

    return this.loadedModules.get(moduleName);
  }

  /**
   * Load a module and all its dependencies
   */
  async loadModuleRecursive(moduleName, visited = new Set()) {
    if (visited.has(moduleName)) {
      return this.loadedModules.get(moduleName);
    }
    visited.add(moduleName);

    if (this.loadedModules.has(moduleName)) {
      return this.loadedModules.get(moduleName);
    }

    // Load the module AST
    const ast = await this.platform.loadModule(moduleName);
    const module = new Module(moduleName, ast);
    this.loadedModules.set(moduleName, module);

    // Load dependencies
    for (const imp of module.imports) {
      // If the import has a 'from' path, we need to load from that specific file
      if (imp.fromPath) {
        try {
          const resolvedPath = await this.platform.resolveImportPath(imp.fromPath, moduleName);
          await this.loadModuleFromPath(resolvedPath, visited);
        } catch (error) {
          console.warn(`Warning: Could not load dependency ${imp.module} from ${imp.fromPath}: ${error.message}`);
        }
      } else {
        // Standard module import without 'from' clause
        const resolvedName = await this.platform.resolveImport(imp.module, moduleName);
        try {
          await this.loadModuleRecursive(resolvedName, visited);
        } catch (error) {
          console.warn(`Warning: Could not load dependency ${imp.module}: ${error.message}`);
        }
      }
    }

    return module;
  }

  /**
   * Compile modules into a Universe
   */
  async compile(entryModuleName, options = {}) {
    const { libraryMode = false } = options;

    // Load entry module and all dependencies
    await this.loadModuleRecursive(entryModuleName);

    // Try to load Core/Syntax/Global if it exists
    try {
      if (await this.platform.moduleExists('Core/Syntax/Global')) {
        await this.loadModuleRecursive('Core/Syntax/Global');
      }
    } catch (error) {
      // Silently ignore if Core/Syntax/Global doesn't exist
    }

    // Link all loaded modules
    const modules = Array.from(this.loadedModules.values());
    const linker = new ModuleLinker(modules);
    return linker.link(entryModuleName, libraryMode);
  }

  /**
   * Compile a single module AST (for notebook use)
   */
  compileModuleAST(ast, options = {}) {
    const { libraryMode = true } = options;

    // Extract module name
    if (!isCall(ast) || !isSym(ast.h) || ast.h.v !== 'Module') {
      throw new Error('Invalid module format');
    }
    const nameNode = ast.a[0];
    if (!isSym(nameNode)) {
      throw new Error('Module name must be a symbol');
    }

    // Create module instance
    const module = new Module(nameNode.v, ast);

    // Create a simple linker with just this module
    const linker = new ModuleLinker([module]);
    return linker.link(nameNode.v, libraryMode);
  }
}
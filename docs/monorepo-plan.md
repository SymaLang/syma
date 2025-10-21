# Syma Monorepo Migration Plan

## Overview

The goal is to restructure Syma into a clean monorepo with these packages:
- `@syma/core` - Platform-independent runtime engine
- `@syma/platform-node` - Node.js platform adapter
- `@syma/platform-browser` - Browser platform adapter
- `@syma/projectors` - UI rendering to various targets
- `@syma/stdlib` - Standard library modules
- `@syma/cli` - REPL and compiler CLI tools
- `@syma/notebook` - Jupyter-style browser interface
- `@syma/vite-plugin` - Vite integration plugin
- `@syma/tree-sitter-syma` - Tree-sitter parser
- `@syma/vscode-extension` - VS Code extension
- `@syma/demos` - Example programs
- `syma` - Umbrella package for easy installation

## Key Insights from Analysis

1. **Clean Architecture**: The codebase already has good separation - `src/core/` is platform-independent, platforms are isolated, projectors are modular
2. **Dependency Flow**: Clear hierarchy - Core → Platforms → Applications (no circular dependencies)
3. **Shared Code**: Most sharing happens through `@syma/core` (engine, AST helpers, primitives, parser)
4. **Size**: ~24k LOC across ~140 files - manageable migration scope

## Proposed Package Structure

### Core Packages

#### **@syma/core** (Platform-independent runtime)
**Purpose:** Core symbolic evaluation engine, AST utilities, primitives

**Contents:**
- `src/core/engine.js` - Core normalization engine
- `src/core/parser.js` - Legacy parser
- `src/core/tree-sitter-parser.js` - Tree-sitter parser
- `src/core/parser-factory.js` - Parser selection
- `src/core/module-compiler.js` - Module compilation
- `src/core/ast-diff.js`, `text-diff.js`, `trace-utils.js` - Utilities
- `src/ast-helpers.js` - AST construction/manipulation
- `src/primitives.js` - Built-in operations
- `src/effects/processor.js` - Effects processing
- `src/platform/index.js` - Platform interface definition

**Key Exports:**
```javascript
// Engine
export {
  normalize, normalizeWithTrace,
  extractRules, match, subst,
  applyRuleRules, dispatch
}

// AST Helpers
export { Sym, Num, Str, Call, isSym, isNum, isStr, isCall, clone, deq, show }

// Primitives
export { foldPrims, getMetaSafePrimitives }

// Parser
export { createParser, createParserSync }

// Module Compiler
export { Module, ModuleCompiler, ModuleCompilerPlatform }

// Effects
export { createEffectsProcessor, freshId }
```

**Dependencies:**
- `tree-sitter` (peer dependency)
- `web-tree-sitter` (peer dependency, browser only)
- No platform-specific dependencies

**Size:** ~8k LOC

---

#### **@syma/platform-node** (Node.js platform implementation)
**Purpose:** Node.js-specific platform adapter

**Contents:**
- `src/platform/node.js` - Node platform implementation
- `src/platform/node-module-platform.js` - Module loading for Node

**Key Exports:**
```javascript
export { NodePlatform, NodeModulePlatform }
```

**Dependencies:**
- `@syma/core` (workspace)
- Node.js built-ins: `fs`, `readline`, `child_process`

**Size:** ~800 LOC

---

#### **@syma/platform-browser** (Browser platform implementation)
**Purpose:** Browser-specific platform adapter

**Contents:**
- `src/platform/browser.js` - Browser platform implementation
- `src/runtime.js` - Browser runtime bootstrapping
- `src/events.js` - Browser event handling

**Key Exports:**
```javascript
export { BrowserPlatform, boot }
```

**Dependencies:**
- `@syma/core` (workspace)
- `@syma/projectors` (workspace)
- Browser APIs

**Size:** ~600 LOC

---

#### **@syma/projectors** (UI rendering)
**Purpose:** Render symbolic UI to various targets

**Contents:**
- `src/projectors/base.js` - Base projector class
- `src/projectors/dom.js` - DOM projector
- `src/projectors/string.js` - String projector
- `src/projectors/terminal.js` - Terminal projector
- `src/projectors/trace.js` - Trace projector
- `src/projectors/index.js` - Factory

**Key Exports:**
```javascript
export {
  ProjectorFactory,
  BaseProjector,
  DOMProjector,
  StringProjector,
  TerminalProjector,
  TraceProjector
}
```

**Dependencies:**
- `@syma/core` (workspace)

**Size:** ~2k LOC

---

#### **@syma/stdlib** (Standard library)
**Purpose:** Standard library modules (.syma files)

**Contents:**
- `src/stdlib/*.syma` - All standard library modules
- Build script to compile to JSON

**Structure:**
```
stdlib/
├── core-fun.syma
├── core-list.syma
├── core-kv.syma
├── core-string.syma
├── core-effect.syma
├── core-json.syma
├── algebra-simplify.syma
└── ... (50+ files)
```

**Build Output:**
- Compiled JSON modules in `dist/`
- Module index

**Dependencies:**
- None (consumed by compiler)

---

### Application/Tool Packages

#### **@syma/cli** (Command-line tools)
**Purpose:** REPL, compiler, and runtime CLI

**Contents:**
- `bin/syma-repl.js` - REPL/runtime entry point
- `bin/syma-compile.js` - Compiler CLI
- `bin/build-stdlib.js` - Stdlib builder
- `src/repl/` - REPL implementation
  - `repl.js` - Core REPL logic
  - `commands.js` - Command processor
  - `autocomplete.js` - Autocomplete
  - `commands/` - Command implementations

**Binary Commands:**
```json
{
  "bin": {
    "syma": "./bin/syma-repl.js",
    "syma-repl": "./bin/syma-repl.js",
    "syma-compile": "./bin/syma-compile.js",
    "symc": "./bin/syma-compile.js"
  }
}
```

**Dependencies:**
- `@syma/core` (workspace)
- `@syma/platform-node` (workspace)
- `@syma/projectors` (workspace)
- `@syma/stdlib` (workspace, for module resolution)
- `glob` (for file patterns)

**Size:** ~4k LOC

---

#### **@syma/notebook** (Jupyter-style notebook)
**Purpose:** Interactive browser-based notebook interface

**Contents:**
- `src/notebook/` - All notebook code
  - `notebook-engine.js` - Engine integration
  - `notebook-store.js` - Zustand state management
  - `notebook-commands.js` - Notebook-specific commands
  - `notebook-io.js` - Save/load notebooks
  - `components/*.jsx` - React components
  - `utils/` - Utilities
- `src/App.jsx` - React app entry
- `src/main-notebook.js` - Notebook bootstrapping
- `index.html` - Entry HTML

**Key Features:**
- Cell-based execution (code + markdown)
- Monaco editor integration
- Live UI rendering
- Watch mode for synchronized cells
- Persistence to localStorage

**Dependencies:**
- `@syma/core` (workspace)
- `@syma/platform-browser` (workspace)
- `@syma/projectors` (workspace)
- `react`, `react-dom`
- `@monaco-editor/react`
- `zustand`
- `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`
- `@heroicons/react`
- `@floating-ui/react`
- `nanoid`, `clsx`, `katex`, `marked`

**Size:** ~5k LOC (JS + JSX)

---

#### **@syma/vite-plugin** (Vite integration)
**Purpose:** Vite plugin for .syma module bundling with HMR

**Contents:**
- `vite-plugin-syma.js` - Plugin implementation

**Key Features:**
- Compiles .syma modules on-the-fly
- Virtual module (`virtual:syma-universe`)
- Hot module replacement
- Module dependency scanning
- Supports both entry file and module name

**Key Exports:**
```javascript
export default function symaPlugin(options)
```

**Dependencies:**
- `@syma/core` (workspace, for module compiler)
- `@rollup/pluginutils`
- `glob`

**Size:** ~400 LOC

---

#### **@syma/tree-sitter-syma** (Tree-sitter parser)
**Purpose:** Tree-sitter grammar and parser for Syma

**Contents:**
- `tree-sitter-syma/` - Entire tree-sitter package
  - `grammar.js` - Grammar definition
  - `src/` - Generated C parser
  - `bindings/` - Language bindings
  - Build scripts for WASM and native

**Build Outputs:**
- `tree-sitter-syma.wasm` - Browser WASM
- Native bindings for Node.js

**Dependencies:**
- `tree-sitter-cli` (dev)

**Size:** ~2.4k LOC (grammar + generated)

---

#### **@syma/vscode-extension** (VS Code extension)
**Purpose:** Syntax highlighting, formatting, language support

**Contents:**
- `vscode-syma-extension/` - Entire extension
  - `src/*.ts` - TypeScript source
  - `syntaxes/` - TextMate grammar
  - `snippets/` - Code snippets
  - `language-configuration.json`

**Key Features:**
- Syntax highlighting
- Code formatting
- Snippets
- Language configuration

**Dependencies:**
- `@syma/tree-sitter-syma` (workspace, for formatting)
- VS Code APIs

**Size:** ~500 LOC

---

#### **syma** (Umbrella package)
**Purpose:** Top-level installable package that provides both CLI and notebook

**Contents:**
- Minimal package that re-exports binaries
- Documentation
- Entry point selection

**package.json:**
```json
{
  "name": "syma",
  "bin": {
    "syma": "./cli.js",
    "syma-repl": "./repl.js",
    "syma-compile": "./compile.js",
    "syma-notebook": "./notebook.js"
  },
  "dependencies": {
    "@syma/cli": "workspace:*",
    "@syma/notebook": "workspace:*"
  }
}
```

**Strategy:**
- `cli.js` → forwards to `@syma/cli/bin/syma-repl.js`
- `notebook.js` → starts local server for notebook

---

### Supporting Packages

#### **@syma/demos** (Example programs)
**Purpose:** Demo .syma programs

**Contents:**
- `src/demos/*.syma`
- `src/modules/*.syma`

**Size:** ~50 files

---

## Dependency Graph

```
                                ┌──────────────┐
                                │  @syma/core  │
                                └──────┬───────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
          ┌─────────▼──────────┐  ┌───▼──────────┐  ┌───▼────────────┐
          │ @syma/platform-    │  │  @syma/      │  │  @syma/stdlib  │
          │      node          │  │  projectors  │  │                │
          └─────────┬──────────┘  └───┬──────────┘  └────────────────┘
                    │                  │
          ┌─────────▼──────────┐  ┌───▼──────────┐
          │ @syma/platform-    │  │  @syma/      │
          │     browser        │  │  vite-plugin │
          └─────────┬──────────┘  └──────────────┘
                    │
          ┌─────────┴──────────┐
          │                    │
    ┌─────▼─────┐      ┌───────▼────────┐
    │ @syma/cli │      │ @syma/notebook │
    └─────┬─────┘      └───────┬────────┘
          │                    │
          └──────────┬─────────┘
                     │
                ┌────▼────┐
                │  syma   │  (umbrella)
                └─────────┘
```

**Independent Packages:**
- `@syma/tree-sitter-syma` (consumed by core)
- `@syma/vscode-extension` (uses tree-sitter)

---

## Migration Strategy

### **Phase 1: Foundation Setup** (Day 1-2)
1. Create workspace structure
2. Set up root package.json with workspaces
3. Configure build tooling (Rollup for libs, esbuild for CLI, Vite for notebook)

### **Phase 2: Core Extraction** (Day 2-4)
4. Extract `@syma/core` with engine, parser, primitives, AST helpers
5. Extract `@syma/projectors` (depends only on core)
6. Extract platform packages (`@syma/platform-node`, `@syma/platform-browser`)
7. Package `@syma/stdlib` with build process

### **Phase 3: Application Migration** (Day 4-7)
8. Migrate `@syma/cli` with REPL and compiler
9. Migrate `@syma/notebook` (most complex - React app)
10. Extract `@syma/vite-plugin`

### **Phase 4: Supporting Packages** (Day 7-9)
11. Package `@syma/tree-sitter-syma`
12. Update `@syma/vscode-extension`
13. Move `@syma/demos`
14. Create umbrella `syma` package

### **Phase 5: Testing & Documentation** (Day 9-11)
15. Update all import paths
16. Update documentation
17. Test installation flows
18. Verify all npm scripts work

---

## Directory Structure

```
syma-monorepo/
├── package.json (root workspace config)
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── src/ (from src/core/, src/primitives.js, src/ast-helpers.js, etc.)
│   │   └── rollup.config.js
│   ├── platform-node/
│   │   ├── package.json
│   │   └── src/ (from src/platform/node*.js)
│   ├── platform-browser/
│   │   ├── package.json
│   │   └── src/ (from src/platform/browser.js, src/runtime.js, src/events.js)
│   ├── projectors/
│   │   ├── package.json
│   │   └── src/ (from src/projectors/)
│   ├── stdlib/
│   │   ├── package.json
│   │   ├── syma/ (all .syma files)
│   │   └── build.js
│   ├── cli/
│   │   ├── package.json
│   │   ├── bin/ (syma-repl.js, syma-compile.js)
│   │   └── src/ (from src/repl/)
│   ├── notebook/
│   │   ├── package.json
│   │   ├── src/ (from src/notebook/, src/App.jsx, etc.)
│   │   ├── index.html
│   │   └── vite.config.js
│   ├── vite-plugin/
│   │   ├── package.json
│   │   └── src/ (vite-plugin-syma.js)
│   ├── tree-sitter-syma/
│   │   └── (existing tree-sitter-syma/)
│   ├── vscode-extension/
│   │   └── (existing vscode-syma-extension/)
│   ├── demos/
│   │   ├── package.json
│   │   └── syma/ (from src/demos/, src/modules/)
│   └── syma/
│       ├── package.json (umbrella)
│       └── bin/ (forwarding scripts)
└── README.md
```

---

## Key Implementation Details

### **1. Workspace Protocol**
Use `"workspace:*"` in dependencies for automatic linking:
```json
{
  "dependencies": {
    "@syma/core": "workspace:*",
    "@syma/platform-node": "workspace:*"
  }
}
```

### **2. Import Path Updates**
All imports change from relative to package-based:
```javascript
// Before
import { normalize } from '../core/engine.js';

// After
import { normalize } from '@syma/core/engine';
```

### **3. Build Outputs**
- Core libraries: Dual format (ESM + CJS) via Rollup
- CLI: ESM bundle via esbuild
- Notebook: Vite SPA build
- Plugins: Direct ESM files (no bundling)

### **4. Umbrella Package**
The `syma` package provides easy installation:
```bash
npm install -g syma
# Gets both CLI and notebook server
```

---

## Benefits

1. **Better Modularity**: Clear package boundaries, easier to understand and maintain
2. **Independent Versioning**: Core can have stable API while apps evolve faster
3. **Flexible Distribution**: Users can install just what they need
4. **Easier Development**: Workspace linking makes local development seamless
5. **Improved Reusability**: Other projects can depend on `@syma/core` without CLI/notebook
6. **Better CI/CD**: Can test/publish packages independently

---

## Risks & Mitigation

- **Risk**: Breaking changes during migration → **Mitigation**: Incremental migration, keep tests passing
- **Risk**: Circular dependencies → **Mitigation**: Clear hierarchy enforced by package structure
- **Risk**: Build complexity → **Mitigation**: Use standard tools, keep configs simple
- **Risk**: Version drift → **Mitigation**: Workspace protocol + CI checks

---

## File Counts & Complexity

| Package | Files | LOC | Complexity |
|---------|-------|-----|------------|
| @syma/core | 15 | ~8000 | High |
| @syma/platform-node | 2 | ~800 | Medium |
| @syma/platform-browser | 3 | ~600 | Medium |
| @syma/projectors | 6 | ~2000 | Medium |
| @syma/stdlib | 50+ | N/A (.syma) | Low |
| @syma/cli | 10 | ~4000 | Medium |
| @syma/notebook | 25 | ~5000 | High |
| @syma/vite-plugin | 1 | ~400 | Low |
| @syma/tree-sitter-syma | 5 | ~2400 | Medium |
| @syma/vscode-extension | 5 | ~500 | Low |
| @syma/demos | 50+ | N/A (.syma) | Low |
| syma (umbrella) | 5 | ~100 | Low |

**Total:** ~140 JS files, ~24k LOC

---

## Implementation Notes

### File Placement Decisions

#### **src/runtime.js → @syma/platform-browser**

**Decision:** Place `runtime.js` in `@syma/platform-browser` package alongside the platform adapter.

**Rationale:**
- Browser-specific initialization and bootstrapping code
- Uses `BrowserPlatform` class
- Includes browser-only features:
  - DOM mounting (`document.querySelector`)
  - Window API exposure (`window.SymbolicHost`)
  - Debug overlay (browser UI)
  - HMR support (Vite-specific)
- Provides high-level `boot()` function as the main browser entry point

**Package structure:**
```javascript
// @syma/platform-browser/
├── src/
│   ├── platform.js      // BrowserPlatform class (adapter interface)
│   ├── runtime.js       // boot() function (initialization & glue)
│   ├── events.js        // browser event utilities
│   └── index.js         // exports both platform and runtime

// @syma/platform-browser/package.json exports
{
  "exports": {
    ".": "./dist/index.js",           // Main: { BrowserPlatform, boot }
    "./platform": "./dist/platform.js",  // Low-level adapter
    "./runtime": "./dist/runtime.js",    // High-level boot
    "./events": "./dist/events.js"       // Utilities
  }
}
```

This mirrors how `@syma/platform-node` will work - both low-level adapter and high-level initialization in one package.

---

#### **src/primitives.js → @syma/core**

**Decision:** Place `primitives.js` in `@syma/core` package.

**Rationale:**
- Core functionality used during all normalization
- Platform-independent (pure JavaScript operations)
- Central to the language runtime (not platform-specific)
- Used by engine, REPL, notebook, all platforms

**Dependency handling:**

1. **`freshId()` utility:**
   - **Solution:** Move to `@syma/core/src/utils.js`
   - Currently in `effects/processor.js` but is a general utility
   - Simple counter-based ID generation, no platform dependencies

   ```javascript
   // @syma/core/src/utils.js
   let idCounter = 0;
   export function freshId() {
     return Str(`id_${Date.now()}_${idCounter++}`);
   }
   ```

2. **`renderToString()` for ProjectToString primitive:**
   - **Problem:** Creates circular dependency (core → projectors → core)
   - **Solution:** Make it context-injected, not imported
   - The `ProjectToString` primitive already accepts context parameter
   - Update it to use `renderToString` from context instead of importing

   ```javascript
   // @syma/core/src/primitives.js
   function foldProjectToString(args, context) {
       if (!context || !context.renderToString) {
           return null; // Can't fold without render function
       }

       const html = context.renderToString(
           uiNode,
           state,
           context.universe,
           context.normalizeFunc,
           context.extractRulesFunc
       );

       return Str(html);
   }
   ```

   Then platforms inject it:
   ```javascript
   // @syma/platform-browser/src/runtime.js
   import { renderToString } from '@syma/projectors/string';

   const createFoldPrimsWithContext = () => (expr, skipFolds = []) => {
       const context = {
           universe: GLOBAL_UNIVERSE,
           normalizeFunc: normalizeBound,
           extractRulesFunc: extractRules,
           renderToString  // Inject the render function!
       };
       return foldPrims(expr, skipFolds, context);
   };
   ```

**Result:**
- `@syma/core` has **zero circular dependencies**
- Maintains platform independence
- `ProjectToString` works across all platforms (browser, node, notebook)
- Clean separation of concerns

**Final @syma/core structure:**
```
@syma/core/
├── src/
│   ├── ast-helpers.js           # AST construction utilities
│   ├── primitives.js            # Primitive operations ✅
│   ├── utils.js                 # Utilities (freshId, etc.) ✅ NEW
│   ├── core/
│   │   ├── engine.js            # Normalization engine
│   │   ├── parser.js            # Parser
│   │   ├── module-compiler.js   # Module compilation
│   │   └── ...
│   ├── effects/
│   │   └── processor.js         # Effects processing
│   └── platform/
│       └── index.js             # Platform interface
└── package.json
```

---

## Next Steps

1. Create `packages/` directory structure
2. Set up root workspace configuration
3. Begin Phase 1: Extract `@syma/core`
   - Move `primitives.js` to core
   - Extract `freshId()` to `utils.js`
   - Update `ProjectToString` to use context-injected render function
4. Continue through phases incrementally
5. Update documentation throughout
6. Test at each major milestone

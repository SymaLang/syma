# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Syma is a symbolic programming language and multiplatform runtime based on S-expressions, pattern matching, and rewrite rules. Everything in Syma is a symbolic expression: code, data, and rules are all the same. Programs are transformed through declarative rewrite rules that evolve the program state.

## Commands

### Development
- `npm run dev` - Start Vite dev server with notebook interface (http://localhost:5173)
- `npm run build` - Build for production (compiles stdlib + vite build)
- `npm run preview` - Preview production build

### REPL
- `npm run repl` or `syma` - Start interactive REPL
- In REPL, use `:help` to see available commands

### Compilation
- `npm run compile` - Compile modules to `public/universe.json`
- `npm run watch` - Watch `.syma` files and auto-recompile
- `syma-compile input.syma --bundle --entry Module/Name --out output.json --pretty` - Compile individual files
- `npm run build:stdlib` - Build standard library modules

### Parser
- `npm run build:parser` - Build tree-sitter parser (WASM)
- `npm run build:parser:node` - Build tree-sitter parser (Node.js)
- `npm run test:parser` - Test tree-sitter parser

### Demos
- `npm run demo:counter` - Simple counter app
- `npm run demo:todo` - Todo list with persistence
- `npm run demo:math` - Symbolic algebra simplifier
- `npm run demo:effects` - Effects system demo
- `npm run demo:vm` - Virtual machine demo
- `npm run demo:bf` - Brainfuck interpreter
- `npm run demo:print` - Print effect demo
- `npm run demo:input` - Input effect demo

## Architecture

### Core Concepts

**Symbolic Expressions**: Everything is an S-expression AST represented in JSON:
- Atoms: `{k:"Sym", v:string}`, `{k:"Num", v:number}`, `{k:"Str", v:string}`
- Compounds: `{k:"Call", h:Expr, a:Expr[]}` - flat sequences where head is indexed for optimization

**Pattern Matching**: Rules use pattern variables to match and transform expressions:
- `{Var "x"}` or `x_` - matches single expression, binds to variable
- `{VarRest "xs"}` or `xs..` - matches zero or more expressions
- Patterns support deep nesting and structural matching

**Rewrite Rules**: Programs evolve through symbolic transformations:
```lisp
{R "RuleName" pattern replacement :guard guardExpr :prio N}
```
Rules are indexed by head symbol and arity for fast lookup. The engine applies rules using an outermost-first normalization strategy.

**RuleRules (Meta-rules)**: Rules that transform other rules before runtime. Enables building DSLs and syntactic sugar:
```lisp
{RuleRules {R ...}}
```

### Key Components

**1. Runtime Engine** (`src/runtime.js`, `src/core/engine.js`)
- Platform-independent core engine with browser/node adapters
- Loads Universe AST, compiles rules with pattern indexing
- Normalizes programs via rewrite rules (outermost-first strategy)
- Event handling: `Apply[action, Program]` → normalize → render

**2. Compiler** (`bin/syma-compile.js`, `src/core/module-compiler.js`)
- Converts S-expression source to JSON AST
- Module bundling with dependency resolution
- Supports both brace syntax `{Add 1 2}` and function syntax `Add(1, 2)`

**3. Parser** (`src/core/parser.js`, `src/core/tree-sitter-parser.js`)
- Tree-sitter parser preserves comments and formatting
- Fallback parser for compatibility
- Parser factory selects appropriate parser

**4. Module System**
Modules are namespaced units with exports/imports:
```lisp
{Module Module/Name
  {Export symbol1 symbol2}
  {Import Other/Module as Alias}
  {Defs ...}
  {Program ...}
  {Rules ...}}
```
Qualified symbols: `Module/Name/Symbol`

**5. Effects System** (`src/effects/processor.js`)
All I/O is symbolic - effects are data structures transformed by platform adapters:
```lisp
Program[
  App[State[...], UI[...]],
  Effects[Pending[...], Inbox[...]]]
```
Effects include: HTTP, Storage, Timers, File I/O, Print, Input. Platform-specific handlers process symbolic effect terms and inject responses into Inbox.

**6. Projectors** (`src/projectors/`)
Transform symbolic UI to platform output:
- `dom.js` - Render to browser DOM (React-like virtual DOM diffing)
- `string.js` - Render to string
- `terminal.js` - ANSI terminal rendering
- `trace.js` - Debug trace output

**7. Notebook Interface** (`src/notebook/`)
Browser-based Jupyter-style environment:
- Cell-based execution (code + markdown)
- Interactive UI rendering with live updates
- Watch mode for synchronized cells
- Module development and testing
- `notebook-engine.js` - Core engine
- `notebook-store.js` - Zustand state management
- `notebook-commands.js` - Cell commands

**8. REPL** (`src/repl/repl.js`)
Interactive development environment:
- Commands: `:eval`, `:rule`, `:match`, `:load`, `:show`, `:trace`, `:help`
- Autocomplete support
- Rule introspection and testing
- File loading and evaluation

**9. Primitives** (`src/primitives.js`)
Built-in operations for arithmetic, strings, comparison, list manipulation, type checking, etc. See `CHEATSHEET.md` for complete list.

### Program Structure

Universe contains Program and Rules:
```lisp
{Universe
  {Program
    {App
      {State ...}
      {UI ...}}
    {Effects
      {Pending ...}
      {Inbox ...}}}
  {Rules ...}
  {RuleRules ...}}
```

### Development Workflow

**Modifying Syma Programs:**
1. Edit `.syma` files in `src/modules/` or `src/demos/`
2. Compile: `npm run compile` or run specific demo
3. Runtime loads JSON AST and applies normalization

**Working with Modules:**
- Modules live in `src/modules/` or `src/stdlib/`
- Use qualified names: `Core/List/Map`
- Compiler bundles dependencies automatically

**Testing Patterns/Rules:**
- Use REPL: `syma` → `:match pattern expr` or `:rule "name" lhs rhs`
- Use notebook for interactive exploration

**Building Parser:**
- Tree-sitter grammar in `tree-sitter-syma/`
- After grammar changes: `npm run build:parser`
- Parser WASM used in browser, native in Node

### UI Rendering

Minimal declarative UI DSL:
```lisp
{Div {:class "container"}
  {H1 {} "Title"}
  {Button {:onClick Inc} "Click Me"}}
```

UI updates flow:
1. Event dispatches action: `:onClick Inc`
2. Engine applies: `Apply[Inc, Program]`
3. Rules transform state
4. Projector renders new UI
5. Virtual DOM diff updates browser

The `Project` operator enables dynamic content rendering and list mapping.

## Key Files

- `src/runtime.js` - Browser runtime, entry point for web apps
- `src/core/engine.js` - Platform-independent symbolic engine
- `src/core/parser.js` - Legacy S-expression parser
- `src/core/tree-sitter-parser.js` - Modern parser with comment preservation
- `src/core/module-compiler.js` - Module bundling and compilation
- `src/primitives.js` - Built-in primitive operations
- `src/effects/processor.js` - Platform-agnostic effects processing
- `src/projectors/dom.js` - DOM rendering with virtual DOM diffing
- `src/notebook/notebook-engine.js` - Notebook runtime
- `src/repl/repl.js` - Interactive REPL
- `bin/syma-compile.js` - Compiler CLI
- `bin/syma-repl.js` - REPL CLI
- `vite-plugin-syma.js` - Vite plugin for HMR
- `src/modules/*.syma` - Application modules
- `src/demos/*.syma` - Example programs
- `src/stdlib/*.syma` - Standard library
- `public/universe.json` - Compiled program (generated)

## Important Notes

- **Flat Compound Semantics**: `{Foo a b c}` is treated as flat sequence `[Foo, a, b, c]` during pattern matching, allowing `VarRest` to match across head boundary
- **Rule Priority**: Higher priority rules apply first. Same priority follows declaration order
- **Normalization Strategy**: Outermost-first - rules applied from root toward leaves. It can be redefined per rule with `:innermost` flag
- **Symbol Syntax**: Both `{Add 1 2}` and `Add(1, 2)` and `Add(1 2)` produce identical AST
- **Pattern Variables**: `x_` shorthand for `{Var "x"}`, `xs..` for `{VarRest "xs"}`
- **Effects are Pure**: All I/O operations are symbolic data structures - platform adapters handle actual execution
- **No Hidden State**: Everything visible in symbolic expressions, enabling time-travel debugging

## Documentation Files

- `README.md` - Project overview and quick start
- `LANGUAGE.md` - Complete language specification
- `TUTORIAL.md` - Learn symbolic programming from scratch
- `REPL.md` - REPL guide and commands
- `NOTEBOOK.md` - Notebook interface guide
- `RULERULES-TUTORIAL.md` - Meta-programming with RuleRules
- `CHEATSHEET.md` - Primitive operations reference

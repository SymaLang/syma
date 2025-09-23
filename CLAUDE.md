# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a symbolic programming language runtime and frontend application built with Vite. The project implements an S-expression-based language that compiles to JSON AST and uses rewrite rules for program normalization.

## Commands

- `npm run dev` - Start the development server (Vite)
- `npm run build` - Build the project for production
- `npm run preview` - Preview the production build locally
- `npm run compile` - Compile all Syma modules to universe.json
- `npm run watch` - Watch Syma files and auto-recompile
- `npm run repl` - Start interactive REPL
- `npm run demo:counter` - Run counter demo
- `npm run demo:todo` - Run todo list demo
- `npm run demo:math` - Run math demo with algebra simplification

## Architecture

### Core Components

1. **Symbolic Language (`.syma` files)**: Programs written in S-expression syntax with module support. Located in `src/modules/` and `src/demos/`.

2. **Runtime Engine (`src/runtime.js`)**: The core runtime that:
   - Loads Universe AST from JSON
   - Compiles rules with pattern matching (including `Var` and `VarRest` patterns)
   - Normalizes programs via rewrite rules using outermost-first strategy
   - Renders UI to DOM via projectors
   - Handles events via `Apply[action, Program]` + normalization

3. **Compiler (`bin/syma-compile.js`)**: Converts S-expression source files to JSON AST format. The AST structure uses:
   - `{k:"Sym", v:string}` for symbols
   - `{k:"Num", v:number}` for numbers
   - `{k:"Str", v:string}` for strings
   - `{k:"Call", h:Expr, a:Expr[]}` for function calls

4. **Entry Point (`src/main-syma.js`)**: Bootstraps the runtime with `boot(universe, '#app')`

### Program Structure

Programs follow the Universe structure:
```lisp
(Universe
  (Program ...)    ; Main program expressions
  (Rules ...))     ; Rewrite rules for normalization
```

Rules have the format: `(R "Name" pattern replacement priority?)`

### Module System

Modules are defined with:
```lisp
{Module ModuleName
  {Export symbol1 symbol2}          ; Exported symbols
  {Import Other/Module as Alias}    ; Import other modules
  {Defs ...}                        ; Definitions
  {Program ...}                     ; Program entry point
  {Rules ...}}                      ; Rewrite rules
```

### Development Workflow

When modifying symbolic programs:
1. Edit `.syma` files in `src/modules/` or `src/demos/`
2. Compile using: `npm run compile` or `bin/syma-compile.js src/file.syma --bundle --entry Module/Name --out public/universe.json --pretty`
3. The runtime loads the JSON AST and applies normalization rules

### UI Rendering

The runtime supports a minimal UI DSL with elements like `Div`, `Button`, `H1`, etc. UI updates happen through:
- Event handlers that dispatch actions (e.g., `:onClick Inc`)
- Rules that transform the program state
- The `Project` operator for rendering dynamic content

## Key Files

- `src/runtime.js` - Browser runtime engine
- `src/core/engine.js` - Platform-independent runtime core
- `src/core/parser.js` - Shared parser for compiler and REPL
- `bin/syma-compile.js` - S-expression to JSON compiler
- `bin/syma-repl.js` - Interactive REPL
- `vite-plugin-syma.js` - Vite plugin for HMR support
- `src/modules/*.syma` - Application modules
- `src/demos/*.syma` - Demo applications
- `public/universe.json` - Compiled program AST (generated)
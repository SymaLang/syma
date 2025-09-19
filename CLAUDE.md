# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a symbolic programming language runtime and frontend application built with Vite. The project implements an S-expression-based language that compiles to JSON AST and uses rewrite rules for program normalization.

## Commands

- `npm run dev` - Start the development server (Vite)
- `npm run build` - Build the project for production
- `npm run preview` - Preview the production build locally

## Architecture

### Core Components

1. **Symbolic Language (`.lisp` files)**: Programs written in S-expression syntax located in `src/`. Examples include `todo.lisp` and `counter.lisp`.

2. **Runtime Engine (`src/runtime.js`)**: The core runtime that:
   - Loads Universe AST from JSON
   - Compiles rules with pattern matching (including `Var` patterns)
   - Normalizes programs via rewrite rules using outermost-first strategy
   - Renders UI to DOM
   - Handles events via `Apply[action, Program]` + normalization

3. **Compiler (`scripts/syma-modules.js`)**: Converts S-expression source files to JSON AST format. The AST structure uses:
   - `{k:"Sym", v:string}` for symbols
   - `{k:"Num", v:number}` for numbers
   - `{k:"Str", v:string}` for strings
   - `{k:"Call", h:Expr, a:Expr[]}` for function calls

4. **Entry Point (`src/main.js`)**: Bootstraps the runtime with `boot('/universe.json', '#app')`

### Program Structure

Programs follow the Universe structure:
```lisp
(Universe
  (Program ...)    ; Main program expressions
  (Rules ...))     ; Rewrite rules for normalization
```

Rules have the format: `(R "Name" pattern replacement priority?)`

### Development Workflow

When modifying symbolic programs:
1. Edit `.lisp` files in `src/`
2. Compile to JSON using: `node scripts/syma-modules.js src/file.lisp --out public/universe.json --pretty`
3. The runtime loads the JSON AST and applies normalization rules

### UI Rendering

The runtime supports a minimal UI DSL with elements like `Div`, `Button`, `H1`, etc. UI updates happen through:
- Event handlers that dispatch actions
- Rules that transform the program state
- The `Project` operator for rendering dynamic content

## Key Files

- `src/runtime.js` - Core runtime engine
- `src/*.lisp` - Symbolic program source files
- `scripts/syma-modules.js` - S-expression to JSON compiler
- `public/universe.json` - Compiled program AST (generated)
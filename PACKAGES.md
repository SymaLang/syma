# Syma Packages

This monorepo contains all the core packages for the Syma symbolic programming language and its ecosystem.

## Package Overview

### Core Packages

#### `@syma/core`
**Platform-independent symbolic engine and compiler infrastructure**

- AST representation and manipulation
- Pattern matching and rewrite rules
- Module system and compiler
- Parser factory (tree-sitter + fallback)
- Primitive operations
- Effects system core

**Exports:**
- Engine functions: `normalize`, `match`, `subst`, `dispatch`
- Module compiler: `ModuleCompiler`, `Module`
- Parser factory: `createParser`
- AST utilities: `show`, `isSym`, `isNum`, `isStr`, `isCall`
- Primitives: `foldPrims`

#### `@syma/stdlib`
**Standard library modules written in Syma**

Core modules for common operations:
- `Core/List` - List manipulation
- `Core/String` - String operations
- `Core/JSON` - JSON serialization
- `Core/KV` - Key-value maps
- `Core/Set` - Set operations
- `Core/Effect` - Effects system helpers
- `Core/Test` - Testing utilities

### Platform Adapters

#### `@syma/platform-browser`
**Browser platform adapter and runtime**

- Browser-specific effects processing (HTTP, Storage, WebSockets, etc.)
- DOM projector integration
- `boot()` function for initializing apps
- Debug overlay for development
- Event handling

**Exports:**
- `boot` - Initialize Syma app in browser
- `BrowserPlatform` - Platform implementation
- `DebugOverlay` - Development tools
- Event utilities

**Usage:**
```js
import { boot } from '@syma/platform-browser/runtime';
import universe from 'virtual:syma-universe';

boot(universe, '#app', 'dom', { debug: false });
```

#### `@syma/platform-node`
**Node.js platform adapter**

- Node-specific effects (File I/O, Process execution, etc.)
- Terminal projector for CLI apps
- REPL integration
- Module platform for compiler

**Exports:**
- `NodePlatform` - Platform implementation
- `NodeModulePlatform` - Module loading platform

### Projectors

#### `@syma/projectors`
**Output rendering engines**

Multiple projector implementations:
- **dom** - Browser DOM with virtual DOM diffing
- **string** - Render to HTML string
- **terminal** - ANSI terminal rendering
- **trace** - Debug trace output

**Exports:**
- `ProjectorFactory` - Create projectors
- `renderToString` - Server-side rendering
- Individual projector classes

### Development Tools

#### `@syma/cli`
**REPL and compiler CLI tools**

Command-line tools for development:
- `syma` / `syma-repl` - Interactive REPL
- `syma-compile` / `symc` - Module compiler

**Exports:**
- REPL implementation
- Compiler API for programmatic use
- Commands and autocomplete

**CLI Usage:**
```bash
# REPL
syma

# Compile modules
syma-compile src/*.syma --bundle --entry App/Main --out app.json

# Format code
syma-compile src/main.syma --format
```

#### `@syma/vite-plugin`
**Vite plugin for Syma development**

Features:
- Automatic module bundling
- Hot Module Replacement (HMR)
- Dependency resolution
- Virtual module for compiled universe
- Environment variable support

**Usage:**
```js
import symaPlugin from '@syma/vite-plugin';

export default {
  plugins: [
    symaPlugin({
      entryModule: 'App/Main',
      modulesDir: 'src/modules'
    })
  ]
};
```

#### `create-syma`
**Project scaffolding tool**

Bootstrap new Syma applications with Vite:

```bash
npm create syma@latest my-app
cd my-app
npm install
npm run dev
```

**Templates:**
- `default` - Basic counter app
- More templates coming soon

### Supporting Packages

#### `tree-sitter-syma`
**Tree-sitter grammar for Syma**

- Syntax highlighting
- Comment preservation
- Code formatting
- VS Code integration

#### `vscode-extension`
**VS Code extension for Syma**

- Syntax highlighting
- Code formatting
- Bracket matching
- Snippets

#### `@syma/notebook`
**Jupyter-style notebook interface**

Browser-based interactive environment:
- Cell-based execution
- Live UI rendering
- Module development
- Watch mode

#### `@syma/demos`
**Example applications**

Demo programs showcasing Syma features:
- Counter - Basic state management
- Todo - Effects and persistence
- Math - Symbolic algebra
- VM - Virtual machine
- Brainfuck interpreter
- And more...

## Package Dependencies

```
@syma/core (foundation)
    ├── @syma/stdlib (depends on core)
    ├── @syma/platform-browser (depends on core + projectors)
    ├── @syma/platform-node (depends on core + projectors)
    ├── @syma/projectors (depends on core)
    ├── @syma/cli (depends on core + platform-node + stdlib)
    ├── @syma/vite-plugin (depends on cli)
    ├── @syma/notebook (depends on platform-browser)
    └── @syma/demos (depends on stdlib)
```

## Installation

### For Users

```bash
# Create a new project
npm create syma@latest my-app

# Or install packages manually
npm install @syma/platform-browser
npm install -D @syma/vite-plugin @syma/cli
```

### For Contributors

```bash
# Clone and install
git clone https://github.com/ahineya/syma
cd syma
npm install

# Build packages
npm run build:stdlib
npm run build:parser

# Run development server (notebook)
npm run dev

# Run REPL
npm run repl
```

## Publishing Packages

All packages follow the same version number (currently 0.5.0) for simplicity.

### Manual Publishing

```bash
# Publish all packages
npm publish --workspace @syma/core
npm publish --workspace @syma/stdlib
npm publish --workspace @syma/platform-browser
npm publish --workspace @syma/platform-node
npm publish --workspace @syma/projectors
npm publish --workspace @syma/cli
npm publish --workspace @syma/vite-plugin
npm publish --workspace create-syma
```

### Publishing Order

Due to dependencies, publish in this order:
1. `@syma/core`
2. `@syma/projectors`, `@syma/stdlib`
3. `@syma/platform-browser`, `@syma/platform-node`
4. `@syma/cli`
5. `@syma/vite-plugin`, `@syma/notebook`, `@syma/demos`
6. `create-syma`

## Development Workflow

### Working on Core

```bash
# Make changes to packages/core/src/**
# Test with REPL
npm run repl

# Or test with notebook
npm run dev
```

### Working on Vite Plugin

```bash
# Make changes to packages/vite-plugin/src/**
# Test with notebook
npm run dev

# Or test by creating a new project
npm create syma@latest test-app
cd test-app
npm install
npm run dev
```

### Working on Standard Library

```bash
# Edit packages/stdlib/syma/**/*.syma
npm run build:stdlib

# Test in REPL
npm run repl
```

### Working on Browser Runtime

```bash
# Edit packages/platform-browser/src/**
# Test with notebook
npm run dev
```

## Key Concepts

### Monorepo Structure

This project uses npm workspaces for managing multiple packages:
- Shared dependencies are hoisted to the root
- Each package has its own `package.json`
- Local packages reference each other with `*` version

### Module System

Syma modules are namespaced units:
```lisp
{Module Module/Name
  {Export symbol1 symbol2}
  {Import Other/Module as Alias}
  {Rules ...}
  {Program ...}}
```

### Virtual Module

The Vite plugin creates a virtual module that can be imported:
```js
import universe from 'virtual:syma-universe';
```

This contains the compiled and bundled AST of all your Syma modules.

### Effects System

All I/O is symbolic and platform-agnostic:
- Platform adapters implement `IPlatform` interface
- Effects processor coordinates between symbolic effects and platform
- Results flow through `Inbox` for consumption by rules

## Documentation Files

- `README.md` - Project overview
- `PACKAGES.md` - This file (package documentation)
- `LANGUAGE.md` - Language specification
- `TUTORIAL.md` - Learning guide
- `CHEATSHEET.md` - Primitives reference
- `EFFECTS_CHEATSHEET.md` - Effects reference
- `EFFECTS_TECHNICAL.md` - Effects technical details
- `REPL.md` - REPL guide
- `NOTEBOOK.md` - Notebook guide
- `RULERULES-TUTORIAL.md` - Meta-programming guide

## License

MIT - See LICENSE file for details

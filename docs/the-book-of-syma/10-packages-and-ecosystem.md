# 10. Projects and Ecosystem

*How to structure your Syma projects. The package manager, the stdlib, and the syma CLI. From REPL to web to notebook.*

⸻

## Introduction

You've learned the language. You've built systems. Now let's talk about **building for real**.

This chapter covers:
- Project structure and organization
- The Syma CLI tools
- Standard library modules
- Package management
- Development workflows
- Distribution and deployment

🜛 *A language without an ecosystem is a thought experiment. Syma has tools, libraries, and workflows for actual work.*

⸻

## Project Structure

A typical Syma project looks like this:

```
my-syma-app/
├── package.syma          # Project metadata and dependencies
├── src/
│   ├── main.syma        # Entry module
│   ├── core/
│   │   ├── state.syma
│   │   ├── actions.syma
│   │   └── utils.syma
│   ├── ui/
│   │   ├── components.syma
│   │   └── views.syma
│   └── effects/
│       └── api.syma
├── dist/
│   └── universe.json    # Compiled output
├── tests/
│   └── main.test.syma
└── README.md
```

### Naming Conventions

**Modules:**
- Use slash-separated namespaces: `App/Counter`, `Core/List`
- Match directory structure: `src/core/list.syma` → `Core/List`

**Files:**
- Lowercase with hyphens: `my-module.syma`
- Module name inside uses PascalCase: `{Module My/Module ...}`

**Exports:**
- PascalCase for types/constructors: `State`, `Action`
- camelCase for functions: `get`, `set`, `update`

⸻

## The package.syma File

```lisp
{Package
  {Name "my-syma-app"}
  {Version "1.0.0"}
  {Description "A Syma application"}
  {Author "Your Name"}
  {License "MIT"}

  {Entry "src/main.syma"}

  {Dependencies
    {Dep "@syma/stdlib" "gh:syma-lang/stdlib@v0.9.1"}
    {Dep "my-utils" "fs:../syma-utils"}}

  {Scripts
    {Build "syma-compile src/main.syma --bundle --out dist/universe.json"}
    {Dev "vite"}
    {Test "syma test/**/*.test.syma"}}}
```

### Fields

- **Name** — Package identifier
- **Version** — Semantic version
- **Entry** — Main module path
- **Dependencies** — External packages
- **Scripts** — Common commands

⸻

## The Syma CLI

The `syma` command provides all development tools:

```bash
# REPL (interactive)
syma                           # Start REPL
syma -l program.syma          # Load file into REPL
syma --trace                  # REPL with tracing

# Execution (runtime mode)
syma run program.syma         # Execute program
syma run app.syma -- arg1 arg2  # With arguments

# Quick evaluation
syma -e "{Add 1 2}"           # Evaluate and exit

# Compilation
syma compile input.syma --out output.json --pretty
syma compile src/*.syma --bundle --entry App/Main --out universe.json

# Package management
syma init                     # Create new project
syma add @syma/stdlib         # Add dependency
syma install                  # Install dependencies
syma build                    # Build project
```

### REPL Commands

```lisp
:help                         # Show commands
:rules                        # List all rules
:rule Name                    # Show specific rule
:drop Name                    # Remove rule
:trace                        # Toggle trace mode
:load file.syma               # Load file
:bundle file.syma             # Bundle module (replace universe)
:import file.syma             # Import module (add to universe)
:reload                       # Reload last bundle/load
:save filename.json           # Save universe
:clear                        # Reset universe
:universe                     # Show full universe
:macro-scopes                 # Show RuleRules scope map
:quit                         # Exit
```

🜛 *The REPL is your laboratory. Use it constantly during development.*

⸻

## syma-compile: The Compiler

The compiler transforms `.syma` source files into JSON AST universes:

### Single File Mode

```bash
syma-compile input.syma --out output.json --pretty
```

Compiles one file to AST, useful for non-module code or testing.

### Bundle Mode

```bash
syma-compile src/main.syma --bundle --entry App/Main --out universe.json
```

Bundles module with all dependencies:
1. Parses all imported modules
2. Resolves dependencies (topological sort)
3. Qualifies all symbols
4. Applies RuleRules (module-scoped)
5. Combines into single Universe

### Library Mode

```bash
syma-compile lib/utils.syma --library --out dist/lib.json
```

Bundles library modules (no `Program` section required).

### Format Mode

```bash
syma-compile messy.syma --format --out clean.syma
```

Pretty-prints Syma code using tree-sitter parser (preserves comments).

### Options

- `--out <file>` — Output path
- `--pretty` — Pretty-print JSON
- `--bundle` — Bundle with dependencies
- `--library` — Library mode (no Program needed)
- `--entry <Module/Name>` — Entry module
- `--stdlib <path>` — Path to stdlib
- `--format` — Format/pretty-print .syma
- `--silent` — Suppress output

🜛 *Compilation is transparent. The AST is just JSON. You can inspect, modify, or generate it programmatically.*

⸻

## Standard Library

Syma ships with core modules in `@syma/stdlib`:

### Core Modules

**Core/List** — List operations
```lisp
{Import Core/List as L open}

{L/Map {Lambda x {Mul x 2}} {List 1 2 3}}  → {List 2 4 6}
{L/Filter {Lambda x {Gt x 5}} {List 3 7 2 9}}  → {List 7 9}
{L/Fold {Lambda acc x {Add acc x}} 0 {List 1 2 3}}  → 6
```

**Core/KV** — Key-value state management
```lisp
{Import Core/KV as KV open}

{Get State Count {State {KV Count 5}}}  → 5
{Set State Count 10 {State {KV Count 5}}}  → {State {KV Count 10}}
```

**Core/String** — String manipulation
```lisp
{Import Core/String as S open}

{Split "," "a,b,c"}  → {List "a" "b" "c"}
{Join "-" {List "x" "y" "z"}}  → "x-y-z"
```

**Core/JSON** — JSON serialization
```lisp
{Import Core/JSON as JSON open}

{ToJSON {Obj {KV name "Alice"} {KV age 30}}}
→ "{\"name\":\"Alice\",\"age\":30}"

{FromJSON "{\"x\":5}"}  → {Obj {KV x 5}}
```

**Core/Fun** — Function definition syntax (RuleRules)
```lisp
{Import Core/Fun as F macro}

{Fn {Double n} {Mul n 2}}
{Call Double 5}  → 10
```

**Core/Set** — Set operations
```lisp
{Import Core/Set as Set open}

{Union {Set 1 2 3} {Set 3 4 5}}  → {Set 1 2 3 4 5}
{Intersection {Set 1 2 3} {Set 2 3 4}}  → {Set 2 3}
```

**Core/Effect** — Effects system helpers
```lisp
{Import Core/Effect as Eff open}

{EnqueueEffect {HttpReq ...} program_}
{ConsumeInbox program_}
```

**Core/Test** — Testing utilities
```lisp
{Import Core/Test as T open}

{Assert {Eq actual expected} "Test name"}
{AssertMatch pattern_ expr_ "Match test"}
```

### Global Syntax

**Core/Syntax/Global** — Automatically imported everywhere
```lisp
; Provides :rule shorthand
:rule Name pattern -> replacement
; Compiles to:
{R "Name" pattern replacement}
```

⸻

## Package Management

### Adding Dependencies

```bash
syma add @syma/stdlib
syma add my-utils fs:../syma-utils
syma add third-party gh:user/repo@v1.0.0
```

### Locator Formats

- **GitHub:** `gh:user/repo@version` or `gh:user/repo#branch`
- **Filesystem:** `fs:path/to/module`
- **Git:** `git+https://github.com/user/repo#branch`

### Installing

```bash
syma install  # or syma i
```

Reads `package.syma`, downloads dependencies to `syma_modules/`.

### Updating

```bash
syma update             # Update all
syma update @syma/stdlib  # Update specific package
```

### Listing

```bash
syma list  # or syma ls
```

Shows installed packages with versions and locations.

🜛 *Package management is simple: specify dependencies, install, use. No lock files, no complex resolvers.*

⸻

## Development Workflows

### Local Development (REPL)

```bash
# Start REPL
syma

# Load your module
syma> :bundle src/main.syma

# Test changes
syma> {MyFunction test input}

# Edit code in your editor...

# Reload
syma> :reload

# Test again
syma> {MyFunction test input}
```

The `:reload` command remembers your last `:bundle` or `:load` — massive time saver!

### Web Development (Vite)

```bash
npm run dev  # Starts Vite with HMR
```

**vite.config.js:**
```javascript
import { defineConfig } from 'vite';
import symaPlugin from '@syma/vite-plugin';

export default defineConfig({
  plugins: [
    symaPlugin({
      entryModule: 'App/Main',
      modulesDir: 'src/modules'
    })
  ]
});
```

The Vite plugin:
- Auto-compiles `.syma` files on change
- Provides HMR (hot module replacement)
- Exposes `virtual:syma-universe` module

**index.js:**
```javascript
import { boot } from '@syma/platform-browser/runtime';
import universe from 'virtual:syma-universe';

boot(universe, '#app', 'dom', { debug: false });
```

### Notebook Development

```bash
syma-notebook
# or
npm run dev  # if notebook is your project type
```

The notebook provides:
- Cell-based execution
- Markdown + code mixing
- Live UI rendering
- Module development
- Watch mode for reactive cells

### Testing

```bash
syma test/**/*.test.syma
```

**Example test:**
```lisp
{Module Tests/Main
  {Import Core/Test as T open}

  {Rules
    {Assert {Eq {Add 1 2} 3} "Addition works"}
    {Assert {Eq {Double 5} 10} "Double works"}
    {AssertMatch {Ok value_} {ProcessValid "test"} "Processes valid input"}}}
```

🜛 *Tests are just modules with assertions. No special framework needed.*

⸻

## Building for Production

### Compile

```bash
syma compile src/main.syma --bundle --entry App/Main --out dist/universe.json
```

### Optimize (Future)

```bash
syma compile src/main.syma --bundle --entry App/Main --out dist/universe.json --optimize
```

Optimization opportunities:
- Dead rule elimination
- Constant folding
- Rule fusion
- Partial evaluation

### Deploy

**Node.js:**
```bash
syma run dist/universe.json
```

**Browser:**
```javascript
import { boot } from '@syma/platform-browser/runtime';
import universe from './dist/universe.json';

boot(universe, '#app', 'dom');
```

**Static HTML:**
```javascript
import { renderToString } from '@syma/projectors';
const html = renderToString(program, state);
```

⸻

## Project Templates

### Create a New Project

```bash
npm create syma@latest my-app
cd my-app
npm install
npm run dev
```

**Available templates:**
- `default` — Basic counter app
- `tailwind` — With Tailwind CSS 4
- `notebook` — Notebook-based project
- `library` — Library/package template

### From Scratch

```bash
mkdir my-app && cd my-app
syma init
npm install
```

Creates:
- `package.syma`
- `src/main.syma`
- `package.json` (for npm dependencies)

⸻

## Publishing Packages

### Prepare for Publishing

1. Write `package.syma`
2. Document exports
3. Add README.md
4. Tag version: `git tag v1.0.0`

### Publish to GitHub

```bash
git push origin v1.0.0
```

Users install with:
```bash
syma add your-package gh:username/repo@v1.0.0
```

### Publish to npm (Future)

```bash
npm publish
```

Users install with:
```bash
syma add your-package npm:your-package@1.0.0
```

🜛 *Publishing is distribution. Syma packages are just git repos with .syma files.*

⸻

## Directory Structure Examples

### Web App

```
my-web-app/
├── package.syma
├── package.json
├── vite.config.js
├── index.html
├── index.js          # Boot script
├── src/
│   ├── main.syma     # Entry: App/Main
│   ├── state.syma    # App/State
│   ├── actions.syma  # App/Actions
│   └── ui/
│       ├── views.syma      # App/UI/Views
│       └── components.syma # App/UI/Components
└── dist/
    └── universe.json
```

### Library Package

```
my-syma-lib/
├── package.syma
├── README.md
├── src/
│   ├── core.syma     # Lib/Core
│   ├── utils.syma    # Lib/Utils
│   └── helpers.syma  # Lib/Helpers
├── tests/
│   └── core.test.syma
└── dist/
    └── lib.json
```

### Monorepo

```
syma-workspace/
├── packages/
│   ├── core/
│   │   └── package.syma
│   ├── ui/
│   │   └── package.syma
│   └── app/
│       └── package.syma
└── workspace.syma  # Workspace config
```

⸻

## Best Practices

### 1. Organize by Feature

```
src/
├── todo/
│   ├── state.syma
│   ├── actions.syma
│   └── ui.syma
└── user/
    ├── state.syma
    └── api.syma
```

Better than organizing by type (all state, all UI, etc.).

### 2. Keep Modules Small

- One module per concept
- 100-300 lines is ideal
- Split when it grows beyond that

### 3. Export Thoughtfully

```lisp
{Module My/Module
  {Export PublicAPI OnlyThis}  ; Minimal exports
  ; Don't export implementation details
  }
```

### 4. Use Qualified Imports for Clarity

```lisp
{Import Core/List as L}      ; Clear what's from List
{Import App/State as State}  ; Clear what's state-related
```

### 5. Document Module Interfaces

```lisp
{Module Data/Store
  ; Public API for data storage and retrieval
  {Export Get Set Delete Clear}

  ; Internal helpers (not exported)
  ...}
```

⸻

## Common Patterns

### App Structure

```
{Program
  {App
    {State InitialState}
    {UI {Project MainView}}}
  {Effects {Pending} {Inbox}}}
```

### State Module

```lisp
{Module App/State
  {Export InitialState UpdateState GetField}
  {Defs {InitialState {State {KV count 0} {KV user Empty}}}}
  {Rules ...}}
```

### Actions Module

```lisp
{Module App/Actions
  {Import App/State as State}
  {Export Inc Dec Reset}
  {Rules
    {R "Inc" {Apply Inc state_} {State/Inc state_}}
    ...}}
```

### Effects Module

```lisp
{Module App/Effects
  {Import Core/Effect as Eff}
  {Export LoadData SaveData}
  {Rules
    {R "LoadData" {Apply LoadData prog_} {Eff/Enqueue {HttpReq ...} prog_}}
    ...}}
```

⸻

## Exercises

### 1. Create a Library Package

Build a reusable utility library:
- Validation functions
- String formatting
- Date/time helpers

### 2. Build a Multi-Module App

Structure an app with:
- Separate modules for state, actions, UI, effects
- Proper imports and exports
- Tests for each module

### 3. Publish a Package

Create a package, publish to GitHub, test installing it in another project.

### 4. Set Up a Monorepo

Create a workspace with shared core library and multiple apps.

⸻

## Key Takeaways

- **package.syma** defines project metadata and dependencies
- **syma CLI** provides REPL, compiler, and package manager
- **Standard library** offers core modules for common tasks
- **Development workflows** support REPL, web (Vite), and notebook
- **Project structure** should organize by feature, not file type
- **Publishing** is git-based (GitHub, npm in future)

⸻

## What's Next

You know how to organize and build Syma projects.

Next, explore the **philosophy** behind symbolic computation.

**Next:** [Chapter 11: Philosophy of Symbols](./11-philosophy-of-symbols.md)

Or dive into history:
- [Chapter 12: Design Notes & Origins](./12-design-and-origins.md)
- [Chapter 13: Appendices](./13-appendices.md)

⸻

🜛 *"A language without tools is theory. A language with tools is practice. Syma has both."*

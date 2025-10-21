# Syma CLI Documentation

The Syma CLI provides a unified command-line interface for working with Syma programs, from development to deployment.

## Installation

```bash
npm install -g @syma/cli
```

Or in a local project:

```bash
npm install --save-dev @syma/cli
```

## Overview

The main `syma` command provides access to all CLI tools:

```bash
syma <command> [options]
```

## Commands

### Interactive Development

#### `syma repl`

Start an interactive Read-Eval-Print Loop for experimenting with Syma code.

```bash
syma repl                    # Start interactive REPL
syma repl -l program.syma    # Load a file and start REPL
syma repl --trace            # Enable trace mode
```

**Options:**
- `-l, --load <file>` - Load a file in REPL mode
- `-t, --trace` - Enable trace mode to see rule applications
- `--history <file>` - Custom history file (default: `.syma_history`)
- `--no-history` - Disable history
- `--rc <file>` - Custom RC file (default: `.symarc`)
- `--no-rc` - Don't load RC file
- `--max-steps <n>` - Maximum normalization steps (default: 10000)

**REPL Commands:**
- `:help` - Show available commands
- `:eval <expr>` - Evaluate an expression
- `:rule <name> <lhs> <rhs>` - Add a rewrite rule
- `:match <pattern> <expr>` - Test pattern matching
- `:load <file>` - Load a Syma file
- `:show rules` - Display all rules
- `:trace on|off` - Toggle trace mode
- `:quit` - Exit the REPL

**Examples:**
```bash
# Start REPL and experiment
syma repl

# Load a program and interact with it
syma repl -l todo.syma

# Enable tracing to debug rules
syma repl --trace
```

---

### Running Programs

#### `syma run <file>`

Execute a Syma program from source or compiled JSON.

```bash
syma run program.syma               # Run a .syma program
syma run universe.json              # Run compiled universe
syma run app.syma -- --input data.txt  # Pass arguments
```

**Program Arguments:**

Arguments after `--` are passed to the program's `{Args}` section:

```bash
syma run app.syma -- --key value    # Creates {KV "key" "value"}
syma run app.syma -- --flag         # Creates {KV "flag" Empty}
syma run app.syma -- -x 10          # Creates {KV "x" "10"}
syma run app.syma -- file1 file2    # Creates {KV 0 "file1"}, {KV 1 "file2"}
```

**Options:**
- `-t, --trace` - Enable trace mode
- `--max-steps <n>` - Maximum normalization steps

---

### Compilation

#### `syma compile <file> [options]`

Compile Syma source files to JSON AST format.

```bash
syma compile input.syma --out output.json --pretty
```

**Modes:**

**Single File Mode:**
```bash
syma compile input.syma --out output.json
syma compile input.syma --pretty        # Pretty-print to stdout
```

**Bundle Mode:**
```bash
# Auto-detect entry module from single file
syma compile src/main.syma --bundle --out universe.json

# Explicit entry module for multiple files
syma compile src/*.syma --bundle --entry App/Main --out universe.json
```

**Library Mode:**
```bash
# Bundle library modules (no Program section required)
syma compile core-utils.syma --library --out lib.json
```

**Format Mode:**
```bash
# Format/pretty-print .syma files
syma compile messy.syma --format --out clean.syma
syma compile file.syma -f  # Print formatted to stdout
```

**Options:**
- `-o, --out <file>` - Output file (default: stdout)
- `--pretty` - Pretty-print JSON output
- `--bundle` - Bundle modules with dependencies
- `--library` - Bundle as library (no Program required)
- `--entry <name>` - Entry module name (optional for single file)
- `--stdlib <path>` - Path to standard library modules
- `--format, -f` - Format/pretty-print .syma file
- `--silent` - Suppress all stdout output (useful for programmatic use)

**Examples:**
```bash
# Compile single file
syma compile app.syma --out app.json --pretty

# Bundle application with dependencies
syma compile src/main.syma --bundle --out dist/universe.json

# Bundle multiple modules
syma compile src/**/*.syma --bundle --entry App/Main --out universe.json

# Create a library bundle
syma compile stdlib/*.syma --library --out mylib.json

# Format a messy file
syma compile unformatted.syma --format --out formatted.syma
```

---

### Project Management

#### `syma init`

Initialize a new Syma project with `package.syma`.

```bash
syma init
```

Creates:
- `package.syma` - Project metadata and dependencies
- `src/main.syma` - Entry point module

---

#### `syma build`

Build the project using the configuration in `package.syma`.

```bash
syma build
```

Looks for:
1. Custom build script in `package.syma`
2. Or uses the `entry` field to compile automatically

---

### Package Management

Syma has a built-in package manager for managing dependencies.

#### `syma add <package> [locator]`

Install and add a package to dependencies.

```bash
syma add @syma/stdlib                           # Install from default registry
syma add @syma/stdlib gh:syma-lang/stdlib@v0.9.1  # GitHub
syma add my-utils fs:../utils                   # Local filesystem
syma add some-lib git+https://github.com/user/lib#main  # Git
```

**Locator Formats:**
- `gh:user/repo@version` - GitHub repository
- `fs:path` - Local filesystem path
- `git+https://url#branch` - Git repository

---

#### `syma install` (or `syma i`)

Install all dependencies from `package.syma`.

```bash
syma install
```

---

#### `syma remove <package>` (or `syma rm`)

Remove a package from dependencies.

```bash
syma remove @syma/stdlib
```

---

#### `syma update [package]` (or `syma up`)

Update package(s) to latest version.

```bash
syma update              # Update all packages
syma update @syma/stdlib # Update specific package
```

---

#### `syma list` (or `syma ls`)

List installed packages.

```bash
syma list
```

Shows:
- Package name and version
- Resolved location
- Installation mode
- Integrity hash

---

## Quick Evaluation

#### `syma -e <expr>`

Evaluate a single expression and exit.

```bash
syma -e "{Add 1 2}"
syma -e "{Map {Fun x {Mul x x}} {List 1 2 3}}"
```

---

## Configuration Files

### `.symarc`

REPL configuration file loaded on startup. Can contain initial rules and definitions.

Example `.symarc`:
```syma
{Rules
  {R "Double" {Var "x"} {Mul {Var "x"} 2}}
  {R "Square" {Var "x"} {Mul {Var "x"} {Var "x"}}}
}
```

### `package.syma`

Project configuration file for dependencies and build settings.

Example `package.syma`:
```syma
{Package
  {Name "my-app"}
  {Version "1.0.0"}
  {Entry "src/main.syma"}
  {Dependencies
    {Dep "@syma/stdlib" "gh:syma-lang/stdlib@v0.9.1"}
  }
}
```

---

## Environment Variables

- `VITE_SYMA_ENTRY` - Override entry file in Vite development (used by `@syma/vite-plugin`)

---

## Integration with Vite

The Syma CLI works seamlessly with the Vite plugin for hot module reloading during development.

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

The Vite plugin uses `syma compile` under the hood with `--silent` mode to avoid cluttering the console.

---

## Common Workflows

### Development Workflow

```bash
# Create new project
npm create syma@latest my-app
cd my-app

# Install dependencies
npm install

# Start dev server with HMR
npm run dev

# Or use REPL for interactive development
syma repl -l src/modules/main.syma
```

### Production Build

```bash
# Build optimized bundle
npm run build

# Preview production build
npm run preview

# Or compile directly
syma compile src/modules/main.syma --bundle --out dist/universe.json
```

### Library Development

```bash
# Create a library bundle
syma compile src/*.syma --library --entry MyLib/Core --out dist/mylib.json

# Format library files
syma compile src/utils.syma --format --out src/utils.syma
```

---

## Debugging

### Enable Trace Mode

```bash
# In REPL
syma repl --trace

# When running
syma run program.syma --trace
```

Trace mode shows:
- Rule applications
- Pattern matches
- Normalization steps

### Inspect Compiled Output

```bash
# Pretty-print compiled output
syma compile app.syma --bundle --pretty

# Save and inspect
syma compile app.syma --bundle --out universe.json --pretty
cat universe.json
```

---

## Tips

1. **Use `--silent` for scripts**: When using `syma compile` in build scripts or programmatically, use `--silent` to suppress console output

2. **Format before committing**: Use `syma compile --format` to maintain consistent code style

3. **Bundle for production**: Always use `--bundle` for production builds to include all dependencies

4. **Library mode for packages**: Use `--library` when creating reusable library packages that don't need a Program section

5. **REPL for exploration**: Use the REPL to test patterns, rules, and expressions before adding them to your code

---

## Version Information

```bash
syma --version    # Show CLI version
syma -v          # Short form
```

---

## Getting Help

```bash
syma --help              # General help
syma compile --help      # Command-specific help
syma repl --help         # REPL help
```

For more information, visit the [Syma documentation](https://syma-lang.org) or check out:
- `LANGUAGE.md` - Language specification
- `TUTORIAL.md` - Learn Syma from scratch
- `REPL.md` - Detailed REPL guide
- `CHEATSHEET.md` - Quick reference for primitives

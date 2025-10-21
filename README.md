# Syma

**A symbolic programming language and multiplatform runtime based on pattern matching and rewrite rules.**

## Key Features

- **Symbolic Computation**: Everything is a symbolic expression: code, data, and rules are all the same
- **Pattern Matching**: Powerful pattern-based transformations with variables, wildcards, and rest patterns
- **Multiplatform Runtime**: Write once, run in Node.js, browsers, notebook, and REPL
- **Module System**: Organize code with imports, exports, and symbol qualification
- **Meta-Programming**: RuleRules transform your rules before runtime: build DSLs and syntactic sugar
- **Reactive UI**: Declarative UI components that update through symbolic transformations
- **Pure Effects**: All I/O is symbolic: HTTP, storage, timers, and more are just data structures
- **Interactive Development**: Full-featured REPL and browser-based notebook for exploration
- **Literate Programming**: Jupyter-style notebooks mixing code, documentation, and interactive UI

## Quick Start

### Installation

```bash
# Install globally
npm install -g syma

```

### Run a Program

```bash
# Execute a Syma program directly
syma run program.syma

# Run with arguments
syma run app.syma -- --input file.txt --verbose

# Or start the REPL
syma repl

# Start the interactive notebook
npm run dev
# Navigate to http://localhost:5173
```

## Examples

Check out the `src/demos/` directory for example applications

## Documentation

Syma comes with comprehensive documentation covering all aspects of the language:

- **[Language Reference](LANGUAGE.md)** - Complete language specification covering atoms, compounds, patterns, modules, rules, effects, and more
- **[Tutorial](TUTORIAL.md)** - Learn symbolic programming from scratch with interactive examples and real applications
- **[CLI Guide](CLI.md)** - Complete command-line interface reference for all tools and workflows
- **[REPL Guide](REPL.md)** - Master the interactive development environment and runtime execution
- **[Notebook Guide](NOTEBOOK.md)** - Build literate programs with the Jupyter-style notebook interface
- **[RuleRules Tutorial](RULERULES-TUTORIAL.md)** - Advanced meta-programming: write rules that transform other rules

## Development Tools

### CLI Tools

The Syma CLI provides a unified interface for all development tasks:

```bash
# Interactive REPL for experimentation
syma repl
syma repl -l program.syma    # Load and interact with a file
syma repl --trace            # Debug with trace mode

# Run programs
syma run program.syma                    # Execute a program
syma run app.syma -- --key value         # Pass arguments

# Compilation
syma compile input.syma --out output.json --pretty
syma compile src/*.syma --bundle --entry App/Main --out universe.json
syma compile file.syma --format          # Format/pretty-print

# Package management
syma init                    # Initialize project
syma add @syma/stdlib        # Add dependencies
syma install                 # Install all dependencies
syma build                   # Build project

# Frontend Project scaffolding
npm create syma@latest my-app           # Create new project
npm create syma@latest my-app tailwind  # With Tailwind CSS 4

```

See **[CLI.md](CLI.md)** for complete documentation.

### Notebook Interface

The browser-based notebook provides:

- **Cell-based execution**: Mix code and markdown
- **Interactive UI**: Render live, reactive components
- **Watch mode**: Multiple cells stay synchronized
- **Module development**: Define and test modules inline
- **Rich output**: Pretty-printed results, errors, and DOM rendering

```bash
syma-notebook

# Open http://localhost:5173
```

## Why Symbolic Programming?

Traditional programming tells computers what to do step-by-step. Symbolic programming describes transformations: "When you see this pattern, transform it into that."

**Benefits:**
- **No hidden state**: Everything is visible in the symbolic expression
- **Natural reactivity**: Changes propagate automatically through rules
- **Time-travel debugging**: Every state is just an expression you can save
- **Mathematical reasoning**: Programs can be analyzed and proven correct
- **Meta-programming built-in**: Rules are data that can be transformed by other rules

## License

Syma is open source under the MIT License. See the [LICENSE](LICENSE.txt) file for details.

## Resources

- **Documentation**: See the guides in the repository
- **Examples**: Check out `packages/demos/` for complete applications

## Philosophy

> — Everything in Syma is just pattern matching and matter patching.


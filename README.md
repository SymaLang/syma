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
git clone https://github.com/yourusername/syma-fe
cd syma-fe
npm install
```

### Run a Program

```bash
# Execute a Syma program directly
syma program.syma

# Or run the REPL
syma

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
- **[REPL Guide](REPL.md)** - Master the interactive development environment and runtime execution
- **[Notebook Guide](NOTEBOOK.md)** - Build literate programs with the Jupyter-style notebook interface
- **[RuleRules Tutorial](RULERULES-TUTORIAL.md)** - Advanced meta-programming: write rules that transform other rules

## Development Tools

### REPL Commands

Run the REPL with:

```bash
syma
```

Or

```bash
npm run repl
```

Then use `:help` to see available commands

### Notebook Interface

The browser-based notebook provides:

- **Cell-based execution**: Mix code and markdown
- **Interactive UI**: Render live, reactive components
- **Watch mode**: Multiple cells stay synchronized
- **Module development**: Define and test modules inline
- **Rich output**: Pretty-printed results, errors, and DOM rendering

```bash
npm run dev
# Open http://localhost:5173
```

### Compilation

```bash
# Compile a single module
syma-compile input.syma --out output.json

# Bundle modules with dependencies
syma-compile src/*.syma --bundle --entry App/Main --out universe.json

# Pretty print for debugging
syma-compile input.syma --out output.json --pretty
```


## Example Applications

The repository includes several complete example applications:

### Counter App
```bash
npm run demo:counter
```
Simple interactive counter demonstrating state management and UI rendering.

### Todo List
```bash
npm run demo:todo
```
Complete todo application with filtering, persistence, and effects.

### Algebra Simplifier
```bash
npm run demo:math
```
Symbolic algebra system that simplifies mathematical expressions using rewrite rules.

## Why Symbolic Programming?

Traditional programming tells computers what to do step-by-step. Symbolic programming describes transformations: "When you see this pattern, transform it into that."

**Benefits:**
- **No hidden state**: Everything is visible in the symbolic expression
- **Natural reactivity**: Changes propagate automatically through rules
- **Time-travel debugging**: Every state is just an expression you can save
- **Mathematical reasoning**: Programs can be analyzed and proven correct
- **Meta-programming built-in**: Rules are data that can be transformed by other rules

## License

Just play with it.

## Resources

- **Documentation**: See the guides in the repository
- **Examples**: Check out `src/demos/` for complete applications

## Philosophy

> "In Syma, you don't write instructions: you define transformations that evolve your program from one state to another. Think in patterns, not procedures."

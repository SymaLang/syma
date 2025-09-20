# Syma Language Support for Visual Studio Code

This extension provides comprehensive language support for the Syma symbolic programming language.

## Features

### Syntax Highlighting
- Full syntax highlighting for Syma code
- Support for all comment styles (`;`, `//`, `/* */`)
- Highlighting for keywords, operators, functions, and UI elements
- Special highlighting for pattern variables (`x_`, `xs...`)

### Language Features
- **Bracket matching** - Automatic pairing of `{}`, `()`, `[]`
- **Code folding** - Collapse/expand modules, rules, and nested structures
- **Auto-indentation** - Smart indentation based on bracket nesting
- **Comment toggling** - Use `Ctrl+/` to toggle comments

### Code Snippets
Quick snippets for common Syma constructs:
- `module` - Create a new module structure
- `rule` - Create a rewrite rule
- `apply` - Create an Apply handler
- `component` - Create a UI component
- `state` - Create a state container
- `if`, `when` - Conditional expressions
- `btn`, `input`, `div` - UI elements
- And many more!

### Commands
- **Syma: Compile Current File** (`Ctrl+Shift+B` / `Cmd+Shift+B`)
  - Compiles the current `.syma` file to JSON AST
- **Syma: Run Current File** (`Ctrl+Shift+R` / `Cmd+Shift+R`)
  - Runs the current file with the Syma runtime
- **Syma: Open REPL**
  - Opens an interactive Syma REPL in the terminal

### IntelliSense
- Auto-completion for keywords and built-in functions
- Hover documentation for Syma constructs
- Function signatures and descriptions

### Diagnostics
- Real-time bracket matching validation
- Error highlighting for unmatched brackets

## Requirements

- Syma runtime installed (`syma` command available in PATH)
- Syma compiler installed (`syma-compile` command available in PATH)

## Installation

### From VSIX
1. Download the `.vsix` file
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X`)
4. Click on `...` menu → Install from VSIX
5. Select the downloaded file

### From Source
```bash
cd vscode-syma-extension
npm install
npm run compile
vsce package
```

## Usage

1. Open any `.syma` file
2. Enjoy syntax highlighting and IntelliSense
3. Use snippets to quickly write Syma code
4. Press `Ctrl+Shift+B` to compile
5. Press `Ctrl+Shift+R` to run

## Language Configuration

The extension automatically configures VS Code with optimal settings for Syma:
- Tab size: 2 spaces
- Auto-closing brackets and quotes
- Bracket pair colorization
- Word wrap enabled

## Examples

### Module Structure
```syma
{Module App/Main
  {Export InitialState View}

  {Import Core/KV as KV open}

  {Defs
    {InitialState
      {State {KV count 0}}}}

  {Program
    {App {State InitialState} {UI {View}}}}

  {Rules
    {R "Increment"
       {Apply Inc state_}
       {Set State count {Add {Get State count state_} 1} state_}}}}
```

### UI Components
```syma
{Div :class "container"
  {H1 "Counter App"}
  {P "Count: " {Show count}}
  {Button :onClick Inc "Increment"}}
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT
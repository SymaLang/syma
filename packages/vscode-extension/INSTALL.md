# Installing the Syma VS Code Extension

## Quick Install (Development)

1. **Build the extension:**
   ```bash
   cd vscode-syma-extension
   ./build.sh
   ```

2. **Install in VS Code:**
   - Open VS Code
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Install from VSIX" and select it
   - Browse to `syma-language-0.1.0.vsix` and select it
   - Reload VS Code when prompted

## Development Setup

If you want to develop or modify the extension:

1. **Install dependencies:**
   ```bash
   cd vscode-syma-extension
   npm install
   ```

2. **Compile TypeScript:**
   ```bash
   npm run compile
   # Or for continuous compilation:
   npm run watch
   ```

3. **Test the extension:**
   - Open the `vscode-syma-extension` folder in VS Code
   - Press `F5` to launch a new VS Code window with the extension loaded
   - Open any `.syma` file to test the features

## Features to Test

1. **Syntax Highlighting:**
   - Open `examples/test.syma`
   - Verify colors for keywords, strings, numbers, comments, etc.

2. **Snippets:**
   - Type `module` and press Tab
   - Type `rule` and press Tab
   - Try other snippets: `if`, `when`, `btn`, `input`

3. **Commands:**
   - Press `Ctrl+Shift+P` and search for "Syma"
   - You should see: Compile, Run, and REPL commands

4. **Bracket Matching:**
   - Click on any `{`, `(`, or `[`
   - The matching bracket should be highlighted

5. **Code Folding:**
   - Hover over line numbers next to `{Module`, `{Rules`, etc.
   - Click the fold indicator to collapse/expand

6. **Auto-completion:**
   - Start typing `Add`, `If`, `Module`
   - IntelliSense should suggest completions

## Publishing to VS Code Marketplace

To publish the extension to the VS Code Marketplace:

1. **Create a publisher:**
   - Visit https://marketplace.visualstudio.com/manage
   - Create a new publisher ID

2. **Update package.json:**
   - Set the `publisher` field to your publisher ID

3. **Package and publish:**
   ```bash
   vsce package
   vsce publish
   ```

## Troubleshooting

- **Extension not loading:** Check the Output panel in VS Code (View → Output → Extension Host)
- **Syntax highlighting not working:** Ensure file has `.syma` extension
- **Commands not working:** Make sure `syma` and `syma-compile` are in your PATH

## Advanced: Using Tree-Sitter WASM

To enable advanced parsing features using the tree-sitter WASM:

1. **Copy the WASM file:**
   ```bash
   cp ../tree-sitter-syma/tree-sitter-syma.wasm ./wasm/
   ```

2. **Update extension.ts to use tree-sitter:**
   - Import web-tree-sitter
   - Load the WASM file
   - Use for advanced parsing and error detection

This would enable:
- More accurate syntax highlighting
- Better error detection
- Incremental parsing for large files
- Structural navigation (jump to definition, etc.)
# Tree-Sitter Syma

A Tree-sitter grammar for the Syma symbolic programming language.

## Features

- Full support for Syma syntax including:
  - Brace syntax: `{Add 1 2}`
  - Function call syntax: `Add(1, 2)`
  - Variable patterns: `x_`, `_`
  - Variable rest patterns: `xs...`, `xs___`, `...`, `___`
  - Comments: `// single line`, `/* block */`, `; semicolon`
  - Numbers, strings, and symbols

## Building

### For Node.js

```bash
# Generate parser
npm run generate

# Build native bindings
npm run build
```

### For Web (WASM)

```bash
# Generate WASM file
npm run build-wasm

# Copy tree-sitter-syma.wasm to your public directory
cp tree-sitter-syma.wasm ../public/
```

## Testing

```bash
npm test
```

## Usage

### In Node.js

```javascript
import { createTreeSitterParser } from '../src/core/tree-sitter-parser.js';

const parser = await createTreeSitterParser();
const ast = parser.parseString('{Add 1 2}');
```

### In Browser

The parser will automatically load the WASM file from `/tree-sitter-syma.wasm`.

## Grammar Development

The grammar is defined in `grammar.js`. After making changes:

1. Regenerate the parser: `npm run generate`
2. Run tests: `npm test`
3. Build bindings: `npm run build` (for Node) or `npm run build-wasm` (for Web)
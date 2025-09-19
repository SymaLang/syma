# Syma REPL Implementation Plan

## Executive Summary
This document outlines the implementation plan for adding a Node.js-based REPL (Read-Eval-Print Loop) to the Syma symbolic language runtime. The REPL will provide an interactive command-line environment for experimenting with Syma code, managing rules, and manipulating universes as first-class objects.

## Architecture Overview

### Current State Analysis
The current runtime is tightly coupled to the browser environment:
- **Browser Dependencies**: DOM rendering, window object, browser-specific effects (localStorage, WebSocket)
- **Monolithic Structure**: Runtime, effects processing, and rendering are intertwined
- **Limited Modularity**: No clear separation between core evaluation and I/O

### Target Architecture
```
┌─────────────────────────────────────────────────┐
│                   REPL CLI                      │
│  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Command      │  │ Expression              │ │
│  │ Processor    │  │ Evaluator               │ │
│  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────┐
│               Core Runtime                       │
│  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Pattern      │  │ Normalization           │ │
│  │ Matcher      │  │ Engine                  │ │
│  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────┐
│           Platform Abstraction Layer            │
│  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Browser      │  │ Node.js                 │ │
│  │ Adapter      │  │ Adapter                 │ │
│  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Phase 1: Core Runtime Refactoring

### 1.1 Extract Platform-Independent Core
**File**: `src/core/engine.js`

Extract from `runtime.js`:
- Pattern matching (`match`, `matchArgsWithRest`, `subst`)
- Rule compilation (`extractRules`, `extractRulesFromNode`)
- Normalization (`normalize`, `normalizeWithTrace`, `applyOnce`)
- Universe manipulation (get/set Program, Rules)

**Dependencies to remove**:
- Window object references
- DOM-specific code
- Browser event system

### 1.2 Create Platform Abstraction Layer
**File**: `src/platform/index.js`

Define interfaces for:
```javascript
export class Platform {
  // File I/O
  async readFile(path) { throw new Error("Not implemented"); }
  async writeFile(path, content) { throw new Error("Not implemented"); }

  // Console I/O
  print(message) { throw new Error("Not implemented"); }
  readLine() { throw new Error("Not implemented"); }

  // Storage
  async getStorage(key) { throw new Error("Not implemented"); }
  async setStorage(key, value) { throw new Error("Not implemented"); }

  // Network
  async httpRequest(url, options) { throw new Error("Not implemented"); }

  // Timers
  setTimeout(fn, delay) { throw new Error("Not implemented"); }
  clearTimeout(id) { throw new Error("Not implemented"); }
}
```

### 1.3 Node.js Platform Adapter
**File**: `src/platform/node.js`

```javascript
import fs from 'fs/promises';
import readline from 'readline';
import fetch from 'node-fetch';

export class NodePlatform extends Platform {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.storage = new Map(); // In-memory storage
  }

  async readFile(path) {
    return await fs.readFile(path, 'utf-8');
  }

  async writeFile(path, content) {
    await fs.writeFile(path, content);
  }

  print(message) {
    console.log(message);
  }

  async readLine(prompt = '') {
    return new Promise(resolve => {
      this.rl.question(prompt, resolve);
    });
  }

  // ... implement other methods
}
```

### 1.4 Browser Platform Adapter
**File**: `src/platform/browser.js`

Wrap existing browser APIs to match the platform interface.

## Phase 2: Effects System Refactoring

### 2.1 Abstract Effects Processor
**File**: `src/effects/processor.js`

Create platform-agnostic effects processor that delegates I/O to platform adapter:
- Timer effects → platform.setTimeout
- HTTP effects → platform.httpRequest
- Storage effects → platform.getStorage/setStorage
- Print effects → platform.print

### 2.2 REPL-Specific Effects
**File**: `src/effects/repl-effects.js`

New effects for REPL environment:
- `FileRead[id, Path[str]]` → `FileReadComplete[id, Content[str]]`
- `FileWrite[id, Path[str], Content[str]]` → `FileWriteComplete[id, Ok|Error]`
- `Exit[code]` → Terminate REPL
- `Exec[id, Command[str]]` → Execute shell command

## Phase 3: REPL Implementation

### 3.1 REPL Core
**File**: `src/repl/repl.js`

```javascript
export class SymaREPL {
  constructor(platform, options = {}) {
    this.platform = platform;
    this.universe = this.createEmptyUniverse();
    this.history = [];
    this.commandHandlers = new Map();
    this.registerCommands();
  }

  createEmptyUniverse() {
    return {
      k: "Call",
      h: { k: "Sym", v: "Universe" },
      a: [
        { k: "Call", h: { k: "Sym", v: "Program" }, a: [] },
        { k: "Call", h: { k: "Sym", v: "Rules" }, a: [] },
        { k: "Call", h: { k: "Sym", v: "RuleRules" }, a: [] }
      ]
    };
  }

  async run() {
    this.platform.print("Syma REPL v1.0.0");
    this.platform.print("Type :help for commands");

    while (true) {
      const input = await this.platform.readLine("syma> ");
      await this.processInput(input);
    }
  }

  async processInput(input) {
    if (input.startsWith(':')) {
      await this.processCommand(input);
    } else {
      await this.evaluateExpression(input);
    }
  }
}
```

### 3.2 Command Processor
**File**: `src/repl/commands.js`

Implement REPL commands:
```javascript
export class CommandProcessor {
  constructor(repl) {
    this.repl = repl;
    this.commands = {
      'help': this.help.bind(this),
      'quit': this.quit.bind(this),
      'save': this.save.bind(this),
      'load': this.load.bind(this),
      'export': this.export.bind(this),
      'import': this.import.bind(this),
      'clear': this.clear.bind(this),
      'rules': this.listRules.bind(this),
      'rule': this.showOrEditRule.bind(this),
      'exec': this.execRule.bind(this),
      'trace': this.trace.bind(this),
      'why': this.explainStuck.bind(this),
      'apply': this.applyToState.bind(this),
      'drop': this.dropRule.bind(this),
      'edit': this.editRule.bind(this),
      'undo': this.undo.bind(this),
      'history': this.showHistory.bind(this),
      'set': this.setOption.bind(this)
    };
  }

  async save(args) {
    const [filename] = args;
    if (!filename) {
      this.repl.platform.print("Usage: :save <filename>");
      return;
    }

    const format = filename.endsWith('.json') ? 'json' : 'syma';
    const content = format === 'json'
      ? JSON.stringify(this.repl.universe, null, 2)
      : await this.universeToSyma(this.repl.universe);

    await this.repl.platform.writeFile(filename, content);
    this.repl.platform.print(`Universe saved to ${filename}`);
  }

  async load(args) {
    const [filename] = args;
    if (!filename) {
      this.repl.platform.print("Usage: :load <filename>");
      return;
    }

    const content = await this.repl.platform.readFile(filename);
    const format = filename.endsWith('.json') ? 'json' : 'syma';

    if (format === 'json') {
      this.repl.universe = JSON.parse(content);
    } else {
      // Parse S-expression to AST
      const parser = new SymaParser();
      this.repl.universe = parser.parse(content);
    }

    this.repl.platform.print(`Universe loaded from ${filename}`);
  }
}
```

### 3.3 Expression Parser
**File**: `src/repl/parser.js`

Extend existing S-expression parser from `syma-modules.js` compiler:
- Inline rule syntax: `:rule AddZero Add(x_, 0) → x_`
- Multiline input with `.` terminator
- Mixed brace and function call syntax

### 3.4 Terminal Projector
**File**: `src/projectors/terminal.js`

```javascript
export class TerminalProjector extends BaseProjector {
  render(universe) {
    // Extract result from universe if present
    const program = this.getProgram(universe);
    if (!program) return;

    // Pretty-print the result
    const output = this.prettyPrint(program);
    this.mount.write(output + '\n');
  }

  prettyPrint(node, indent = 0) {
    if (isNum(node)) return String(node.v);
    if (isStr(node)) return `"${node.v}"`;
    if (isSym(node)) return node.v;

    if (isCall(node)) {
      const head = this.prettyPrint(node.h);
      const args = node.a.map(a => this.prettyPrint(a));

      // Special formatting for common patterns
      if (head === 'R' && args.length >= 3) {
        return this.formatRule(args, indent);
      }

      // Default Call formatting
      if (args.length === 0) return `{${head}}`;
      return `{${head} ${args.join(' ')}}`;
    }
  }

  formatRule(args, indent) {
    const [name, pattern, replacement, ...rest] = args;
    const spaces = ' '.repeat(indent);
    return `${spaces}R(${name},\n` +
           `${spaces}  ${pattern},\n` +
           `${spaces}  ${replacement}${rest.length ? ',\n' + spaces + '  ' + rest.join(', ') : ''}\n` +
           `${spaces})`;
  }
}
```

## Phase 4: Module System Integration

### 4.1 Module Compiler Integration
**File**: `src/repl/modules.js`

Integrate with `syma-modules.js` compiler:
- Support `:import <file> [open]` for loading modules
- Handle symbol qualification
- Manage module dependencies

### 4.2 Module State Management
Track loaded modules and their exports:
```javascript
export class ModuleManager {
  constructor() {
    this.modules = new Map(); // module name → module AST
    this.exports = new Map(); // module name → exported symbols
    this.qualified = new Map(); // local symbol → qualified name
  }

  async importModule(path, options = {}) {
    const content = await this.platform.readFile(path);
    const module = this.parseModule(content);

    // Extract imports and exports
    this.processImports(module);

    // Qualify symbols based on scope
    if (options.open) {
      this.importOpen(module);
    } else {
      this.importQualified(module, options.as);
    }

    // Merge rules into universe
    this.mergeRules(module);
  }
}
```

## Phase 5: Testing and Integration

### 5.1 Unit Tests
**Files**: `test/repl/*.test.js`
- Command processing tests
- Expression evaluation tests
- Rule management tests
- Module import/export tests
- Platform adapter tests

### 5.2 Integration Tests
- End-to-end REPL sessions
- File I/O operations
- Module bundling
- Effects processing

### 5.3 Example REPL Sessions
Create example sessions demonstrating:
- Basic arithmetic and rules
- Module imports
- Interactive rule editing
- State persistence

## Phase 6: Entry Points

### 6.1 CLI Entry Point
**File**: `bin/syma-repl.js`

```javascript
#!/usr/bin/env node
import { SymaREPL } from '../src/repl/repl.js';
import { NodePlatform } from '../src/platform/node.js';

const platform = new NodePlatform();
const repl = new SymaREPL(platform, {
  historyFile: '.syma_history',
  rcFile: '.symarc'
});

repl.run().catch(console.error);
```

### 6.2 Package Configuration
Update `package.json`:
```json
{
  "bin": {
    "syma": "./bin/syma-repl.js",
    "syma-repl": "./bin/syma-repl.js"
  },
  "scripts": {
    "repl": "node bin/syma-repl.js",
    "compile": "node scripts/syma-modules.js",
    "dev": "vite",
    "build": "vite build"
  }
}
```

## Implementation Timeline

### Week 1: Core Refactoring
- Extract platform-independent core
- Create platform abstraction layer
- Implement Node.js adapter

### Week 2: REPL Foundation
- Implement basic REPL loop
- Add command processor
- Create terminal projector

### Week 3: Features
- Rule management commands
- File I/O operations
- Module import system

### Week 4: Polish
- Testing and bug fixes
- Documentation
- Example sessions

## Dependencies

### New Dependencies
```json
{
  "node-fetch": "^3.0.0",
  "chalk": "^5.0.0",
  "commander": "^9.0.0"
}
```

### Existing Dependencies to Refactor
- Remove direct DOM dependencies from core
- Abstract window object usage
- Isolate browser-specific effects

## Migration Strategy

### Backward Compatibility
- Maintain existing browser runtime functionality
- Use feature detection to load appropriate platform adapter
- Share core engine between browser and Node.js

### Gradual Migration
1. Start with core extraction (non-breaking)
2. Add platform abstraction (non-breaking)
3. Implement REPL alongside existing runtime
4. Migrate browser runtime to use new core

## Future Enhancements

### Near-term (v1.1)
- Tab completion for commands and symbols
- Syntax highlighting in terminal
- Watch mode for auto-reloading files
- Debug mode with breakpoints

### Long-term (v2.0)
- LSP server for editor integration
- Jupyter kernel for notebook support

## Risk Mitigation

### Technical Risks
1. **Parser complexity**: Use existing parser as foundation
2. **Platform differences**: Comprehensive abstraction layer

### Design Risks
1. **API changes**: Maintain backward compatibility
2. **Module system**: Align with existing compiler
3. **User experience**: Iterative feedback from early users

## Success Criteria

- [ ] REPL can evaluate all language constructs
- [ ] All PRD commands implemented
- [ ] File persistence works correctly
- [ ] Module imports function properly
- [ ] Tests pass on Node.js and browser
- [ ] Documentation complete
- [ ] Performance acceptable (<100ms response)

## Appendix A: File Structure

```
syma-fe/
├── src/
│   ├── core/
│   │   ├── engine.js         # Platform-independent runtime
│   │   ├── patterns.js       # Pattern matching
│   │   └── rules.js          # Rule management
│   ├── platform/
│   │   ├── index.js          # Platform interface
│   │   ├── node.js           # Node.js adapter
│   │   └── browser.js        # Browser adapter
│   ├── repl/
│   │   ├── repl.js           # Main REPL class
│   │   ├── commands.js       # Command processor
│   │   ├── parser.js         # Expression parser
│   │   └── modules.js        # Module manager
│   ├── projectors/
│   │   └── terminal.js       # Terminal output
│   └── effects/
│       ├── processor.js      # Abstract processor
│       └── repl-effects.js   # REPL-specific effects
├── bin/
│   └── syma-repl.js          # CLI entry point
└── test/
    └── repl/
        ├── commands.test.js
        ├── parser.test.js
        └── integration.test.js
```

## Appendix B: Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `:help` | Show help | `:help` |
| `:quit` | Exit REPL | `:quit` |
| `:save <file>` | Save universe | `:save my.syma` |
| `:load <file>` | Load universe | `:load my.syma` |
| `:export <module>` | Export module | `:export Core/KV` |
| `:import <file> [open]` | Import module | `:import kv.syma open` |
| `:clear` | Clear universe | `:clear` |
| `:rules` | List all rules | `:rules` |
| `:rule <name>` | Show rule | `:rule AddZero` |
| `:rule <inline>` | Define rule | `:rule AddZero Add(x_, 0) → x_` |
| `:exec <name> <expr>` | Execute rule | `:exec AddZero {Add 5 0}` |
| `:trace <expr>` | Trace evaluation | `:trace {Add 1 2}` |
| `:why <expr>` | Explain stuck | `:why {Foo 1}` |
| `:apply <action>` | Apply to state | `:apply Inc` |
| `:drop <name>` | Remove rule | `:drop AddZero` |
| `:edit <name>` | Edit rule | `:edit AddZero` |
| `:undo` | Undo last change | `:undo` |
| `:history` | Show history | `:history` |
| `:set <option> <value>` | Set option | `:set trace on` |
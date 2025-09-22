# The Syma Multiplatform Runtime
## Write Once, Run Everywhere with Symbolic Programming

Syma is not just a language—it's a **multiplatform runtime** that executes symbolic programs identically across different environments. Like Java's "write once, run anywhere" promise, but achieved through pure symbolic transformation rather than bytecode.

---

## What Makes Syma Multiplatform?

### 1. Pure Symbolic Core

At its heart, Syma is just pattern matching and symbolic transformation:

```lisp
; This rule works identically everywhere
{R "Increment"
   {Inc n_}
   {Add n_ 1}}

; Whether you run it in:
; - Node.js: syma program.syma
; - Browser: load compiled JSON
; - Future platforms: same symbolic rules
```

The core engine (`src/core/engine.js`) is pure JavaScript with zero platform dependencies. It only knows how to:
- Match patterns against symbolic expressions
- Apply transformation rules
- Normalize programs to fixed points

### 2. Platform Abstraction Layer

Platform-specific operations are isolated behind a clean interface:

```javascript
// Platform interface (implemented by each environment)
class Platform {
  print(message)      // Output text
  setTimeout(fn, ms)  // Schedule execution
  fetch(url, options) // Network requests
  storage            // Persistent storage
  // ... more capabilities
}
```

Your Syma code never directly touches these—it just describes effects symbolically.

### 3. Symbolic Effects System

All I/O is represented as symbolic data, not imperative calls:

```lisp
; Instead of console.log("Hello")
{Effects {Pending {Print "msg-1" {Message "Hello"}}}}

; Instead of fetch("/api")
{Effects {Pending {HttpReq "req-1" {Url "/api"}}}}

; The runtime interprets these based on the platform
```

---

## Supported Platforms

### Node.js Runtime

Full CLI runtime with file I/O and process control:

```bash
# Direct execution
syma my-app.syma

# Run compiled universe
syma universe.json

# With options
syma --trace --max-steps 50000 app.syma

# Platform provides:
# - File system access
# - Network (HTTP/WebSocket)
# - Process management
# - Console I/O
```

### Browser Runtime

DOM rendering and web APIs:

```html
<!-- Load the runtime -->
<script type="module">
import { boot } from './runtime.js';
boot('/universe.json', '#app');
</script>

<!-- Platform provides:
- DOM manipulation
- Fetch API
- LocalStorage/SessionStorage
- WebSockets
- Animation frames
-->
```

### Future Platforms

The architecture supports any JavaScript environment:
- **Deno**: Would work with minimal platform adapter
- **React Native**: Mobile apps with native UI
- **Electron**: Desktop applications
- **Workers**: Background processing
- **Edge Functions**: Serverless deployment

---

## How Multiplatform Works

### The Compilation Pipeline

```
1. Source (.syma)
   ↓
2. Parser (platform-independent)
   ↓
3. Module-scoped RuleRules applied (compile-time)
   ↓
4. AST (JSON - universal format with MacroScopes)
   ↓
5. Runtime (loads AST)
   ↓
6. Platform Adapter (handles effects)
```

The compiled AST includes:
- **Rules**: Tagged with their source module
- **RuleRules**: Preserved for debugging
- **MacroScopes**: Tracks which modules used which RuleRules
- **Program**: The main application structure

### Example: Timer Effect Across Platforms

Your Syma code:
```lisp
{Timer "timer-1" {Delay 1000}}
```

Node.js implementation:
```javascript
// Uses Node's setTimeout
platform.setTimeout(() => {
  addToInbox({TimerComplete: ["timer-1", now]});
}, 1000);
```

Browser implementation:
```javascript
// Uses window.setTimeout
window.setTimeout(() => {
  addToInbox({TimerComplete: ["timer-1", Date.now()]});
}, 1000);
```

Your rules work the same either way:
```lisp
{R "HandleTimer"
   {Program app_ {Effects _ {Inbox {TimerComplete "timer-1" _} rest...}}}
   {Program {Apply Tick app_} {Effects _ {Inbox rest...}}}}
```

---

## Building Multiplatform Apps

### 1. Structure Your Code

```
src/
  modules/
    Core/           # Platform-agnostic logic
      Logic.syma
      Rules.syma
    Platform/       # Platform-aware modules
      Storage.syma  # Uses storage effects
      Network.syma  # Uses HTTP effects
    App/
      Main.syma     # Entry point
```

### 2. Use Effects for I/O

Never try to do I/O directly—use symbolic effects:

```lisp
; ❌ Wrong - This won't work (unless you define a rule transforming DirectCallConsoleLog into an effect)
{DirectlyCallConsoleLog "Hello"}

; ✅ Right - Symbolic effect
{Effects {Pending {Print "id" {Message "Hello"}}}}
```

### 3. Test Across Platforms

```bash
# Test in Node.js
syma test-app.syma

# Test in browser
npm run dev  # Vite dev server
# Open browser to test

# The same code should work identically
```

### 4. Handle Platform Differences

While most code is identical, you can handle platform-specific needs:

```lisp
; Use effects that work everywhere
{R "SaveData"
   {Apply Save data_}
   {Effects {Pending {StorageSet "key" data_}}}}

; The platform adapter handles the details:
; - Node.js: Writes to file system
; - Browser: Uses localStorage
```

---

## Platform Capabilities

| Capability | Node.js | Browser | Notes |
|------------|---------|---------|-------|
| **Console Output** | ✅ `console.log` | ✅ `console.log` | Via Print effect |
| **Console Input** | ✅ `readline` | ✅ `prompt/events` | Via ReadLine/GetChar effects |
| **Timers** | ✅ `setTimeout` | ✅ `window.setTimeout` | Via Timer effect |
| **HTTP** | ✅ `node-fetch` | ✅ `fetch API` | Via HttpReq effect |
| **WebSocket** | ✅ `ws` library | ✅ Native WebSocket | Via WS effects |
| **Storage** | ✅ File system | ✅ localStorage | Via Storage effects |
| **DOM** | ❌ | ✅ DOM | UI rendering |
| **File I/O** | ✅ `fs` module | ❌ | Node-specific |
| **Process** | ✅ `process` | ❌ | Node-specific |
| **Clipboard** | ✅ Via libs | ✅ Clipboard API | Via Clipboard effects |

---

## Advanced: Creating Platform Adapters

### Implementing a New Platform

```javascript
// Example: Deno platform adapter
class DenoPlatform {
  print(msg) {
    console.log(msg);
  }

  setTimeout(fn, ms) {
    return setTimeout(fn, ms);
  }

  async fetch(url, options) {
    const res = await fetch(url, options);
    return {
      status: res.status,
      text: await res.text(),
      json: await res.json()
    };
  }

  storage = {
    get(key) {
      return localStorage.getItem(key);
    },
    set(key, value) {
      localStorage.setItem(key, value);
    }
  };
}

// Use it
const platform = new DenoPlatform();
const effectsProcessor = createEffectsProcessor(platform, ...);
```

---

## The Power of Symbolic Execution

### Why This Approach Works

1. **No Platform Lock-in**: Your code isn't tied to Node or browser APIs
2. **True Portability**: Not just "mostly works"—identical behavior
3. **Time-Travel Debugging**: Record and replay across platforms
4. **Formal Verification**: Rules can be mathematically analyzed
5. **Future-Proof**: New platforms just need an adapter

### Real-World Example

This todo app runs identically everywhere:

```lisp
{Module Todo/App
  {Program
    {App
      {State {Todos ...}}
      {UI {TodoList}}}
    {Effects
      {Pending {StorageGet "todos"}}  ; Load saved todos
      {Inbox}}}

  {Rules
    ; All rules work on all platforms
    {R "AddTodo" ...}
    {R "Toggle" ...}
    {R "SaveToStorage"
       {Apply Save state_}
       {Effects {Pending {StorageSet "todos" state_}}}}}}
```

Run it anywhere:
```bash
# Development in Node
syma todo.syma

# Production in browser
syma-compile todo.syma --out todo.json
# Load todo.json in web app

# Future: Mobile app
# Same todo.json in React Native
```

---

## Best Practices for Multiplatform Development

### 1. Think Symbolically

Don't think "call console.log"—think "create a Print effect":
```lisp
; Your mental model should be symbolic
{Effects {Pending {Print id_ {Message text_}}}}
```

### 2. Test Early, Test Often

```bash
# Quick test cycle
syma my-feature.syma     # Test in Node
npm run dev              # Test in browser
# Should behave identically
```

### 3. Use Platform Features Wisely

Some effects naturally work better on certain platforms:
```lisp
; File operations (Node only)
{R "ExportData" ...}  ; Only useful in Node

; DOM rendering (Browser only)
{UI {Canvas ...}}     ; Only renders in browser

; Universal effects (work everywhere)
{Timer ...}          ; Works on all platforms
{HttpReq ...}        ; Works on all platforms
```

### 4. Package for Distribution

```bash
# For Node.js users
npm publish          # They can 'syma your-app.syma'

# For browser users
syma-compile --bundle --out dist/app.json
# Include in web build

# For both
# Document both approaches in README
```

---

## Conclusion

Syma's multiplatform runtime represents a new approach to cross-platform development. Instead of transpiling to different targets or using compatibility layers, Syma achieves true platform independence through symbolic computation.

Your code doesn't know or care where it runs—it just describes transformations. The platform adapter handles the messy details of actual I/O, while your program remains pure, testable, and portable.

**Write your logic once. Run it everywhere. No compromises.**

---

## Quick Start

```bash
# Install Syma
npm install -g syma

# Create a program
echo '{Module Hello
  {Program {Effects {Pending {Print "1" {Message "Hello, Multiplatform!"}}}}}
  {Rules {R "Consume" {Effects _ {Inbox {PrintComplete _ _} rest...}}
            {Effects _ {Inbox rest...}}}}}' > hello.syma

# Run it anywhere
syma hello.syma              # Works in Node.js!
# Same code works in browser when compiled

# The future of multiplatform development is symbolic
```
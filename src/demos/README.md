# Syma Demo Applications

This directory contains demo applications showcasing different capabilities of the Syma symbolic programming language.

## Available Demos

### 1. Counter (`counter.syma`)
A simple counter application demonstrating basic state management and UI updates.
- **Features**: Increment button, state display
- **Key Concepts**: Basic rules, state transformation, UI projection

### 2. Todo List (`todo.syma`)
A fully-featured todo list application with filtering and effects.
- **Features**: Add/remove todos, toggle completion, filter by status, timer effects, print effects
- **Key Concepts**: Complex state, list operations, pattern matching, symbolic effects

### 3. Effects Playground (`effects-demo.syma`)
Interactive demonstration of all symbolic effects available in Syma.
- **Features**: Storage, clipboard, animation, random numbers, navigation, timers
- **Key Concepts**: Effects system, I/O operations, animation frames, browser APIs

### 4. Brainfuck Interpreter (`bf.syma`)
A complete interpreter for the Brainfuck esoteric programming language.
- **Features**: Step-by-step execution, continuous run mode, tape visualization
- **Key Concepts**: Complex pattern matching, recursion, timer-based execution

## Running the Demos

Each demo can be run independently. Choose one of these methods:

### Method 1: NPM Scripts (Recommended)

```bash
# Run a specific demo (builds and starts dev server)
npm run demo:counter     # Simple counter
npm run demo:todo        # Todo list app
npm run demo:effects     # Effects playground
npm run demo:bf          # Brainfuck interpreter

# Or just build without starting the server
npm run build:demo:counter
npm run build:demo:todo
npm run build:demo:effects
npm run build:demo:bf
```

### Method 2: Direct Compilation

```bash
# Compile a demo to universe.json
node scripts/syma-modules.js src/demos/counter.syma --out public/universe.json --pretty

# Then start the dev server
npm run dev
```

### Method 3: Shell Script

```bash
# Make the script executable (first time only)
chmod +x scripts/build-demo.sh

# Build a specific demo
./scripts/build-demo.sh counter
./scripts/build-demo.sh todo
./scripts/build-demo.sh effects
./scripts/build-demo.sh bf

# Then start the dev server
npm run dev
```

## Demo Details

### Counter Demo
The simplest demo showing the core concepts:
- State management with `(State (Count 0))`
- Event handling with `Apply` and rules
- UI projection with `(Show Count)`

### Todo List Demo
A real-world application example:
- Complex state with nested data structures
- List operations using pattern matching
- Filter states (All/Active/Done)
- Integration with timer and print effects
- Input handling with keyboard events

### Effects Playground
Comprehensive demonstration of I/O capabilities:
- **Storage**: LocalStorage persistence
- **Clipboard**: Copy/paste operations
- **Animation**: 60fps smooth animations
- **Random**: Random number generation
- **Navigation**: URL manipulation
- **Timers**: Delayed actions

### Brainfuck Interpreter
Advanced pattern matching and recursion:
- Tape zipper data structure
- Instruction pointer management
- Loop matching with bracket pairs
- Timer-based continuous execution
- Character I/O operations

## Understanding the Module Format

Each demo is a self-contained Syma module with:
- `Program` section defining the initial state and UI
- `Rules` section containing transformation rules
- Optional `Effects` for I/O operations
- Optional `RuleRules` for meta-programming

The demos are compiled from `.syma` source files to JSON AST format that the runtime executes.

## Development Tips

1. **Modify a demo**: Edit the `.syma` file and rebuild
2. **Watch mode**: Use `npm run watch` for auto-recompilation (for main app)
3. **Debug mode**: Add `?trace` to URL to see rule applications
4. **Console output**: Effects like `Print` appear in browser console

## Creating Your Own Demo

1. Create a new `.syma` file in `src/demos/`
2. Define a module with `(Module Demo/YourName ...)`
3. Add a `Program` section with initial state and UI
4. Define `Rules` for behavior
5. Add to package.json scripts for easy access

Example structure:
```lisp
(Module Demo/MyDemo
  (Export)

  (Program
    (App
      (State ...)
      (UI ...)))

  (Rules
    ...))
```
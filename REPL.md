# The Syma REPL & Runtime Documentation
## Interactive Development and Direct Execution with Symbolic Programming

Syma is both a full runtime and an interactive REPL (Read-Eval-Print Loop). Like Node.js, you can:
- **Run programs directly**: `syma program.syma` executes your code immediately
- **Start interactive sessions**: `syma` launches the REPL for exploration
- **Compile and execute**: Automatically handles both `.syma` source and `.json` compiled files

The REPL is your interactive gateway to symbolic programming—a live environment where you can explore, experiment, and build programs by transforming symbolic expressions in real-time.

---

## Table of Contents

1. [Introduction](#1-introduction)
1a. [Runtime vs REPL Mode](#1a-runtime-vs-repl-mode)
2. [Getting Started](#2-getting-started)
3. [Basic Expression Evaluation](#3-basic-expression-evaluation)
4. [Working with Rules](#4-working-with-rules)
5. [Module System in the REPL](#5-module-system-in-the-repl)
6. [File Operations](#6-file-operations)
7. [Advanced Commands](#7-advanced-commands)
8. [Debugging and Tracing](#8-debugging-and-tracing)
9. [Interactive Development Workflow](#9-interactive-development-workflow)
10. [REPL Commands Reference](#10-repl-commands-reference)
11. [Tips and Best Practices](#11-tips-and-best-practices)

---

## 1. Introduction

### What Makes the Syma REPL Different?

In traditional REPLs, you evaluate expressions and see results. In Syma's REPL, you're manipulating a living symbolic universe. Every expression you type, every rule you define, becomes part of a symbolic transformation system that evolves through pattern matching and rewriting.

Think of it as:
- **A symbolic calculator** that can compute with patterns, not just numbers
- **A rule laboratory** where you experiment with transformations
- **A module playground** for testing and combining code
- **A debugging tool** that shows you how symbolic expressions evolve

### The REPL Philosophy

The Syma REPL embodies the core philosophy of symbolic programming:

1. **Everything is data**: Your expressions, rules, and even the REPL state itself are symbolic expressions
2. **Incremental development**: Build complex systems by adding and testing rules one at a time
3. **Live exploration**: See transformations happen in real-time
4. **Pure and reproducible**: Every REPL session can be saved and replayed

---

## 1a. Runtime vs REPL Mode

### When to Use Direct Execution (Runtime Mode)

Use `syma program.syma` when you want to:
- **Run complete applications**: Execute a finished program
- **Process data**: Transform input through your rules
- **Deploy programs**: Run in production environments
- **Automate tasks**: Use in scripts and pipelines
- **Test modules**: Verify module behavior end-to-end

Example:
```bash
# Run a web server
syma server.syma

# Process data transformation
syma transform-data.syma < input.json > output.json

# Run with effects (timers, HTTP, etc.)
syma app-with-effects.syma
```

### When to Use Interactive Mode (REPL)

Use `syma` (REPL) when you want to:
- **Explore the language**: Learn Syma interactively
- **Debug programs**: Test rules and transformations step-by-step
- **Develop iteratively**: Build and test incrementally
- **Inspect state**: Examine program evolution
- **Prototype ideas**: Try concepts before implementing

Example:
```bash
# Start REPL for exploration
syma

syma> {Add 2 3}
→ 5

syma> :rule Double {Double n_} → {Mul n_ 2}
Rule "Double" added

syma> {Double 7}
→ 14
```

### The Best of Both Worlds

Syma seamlessly bridges both modes:

```bash
# Develop in REPL
syma
syma> :load my-module.syma
syma> {TestFunction 42}
syma> :save tested-module.syma

# Then run directly
syma tested-module.syma

# Or compile and distribute
syma-compile tested-module.syma --out app.json
syma app.json  # Runs anywhere Syma is installed
```

---

## 2. Getting Started

### Installation and Setup

```bash
# Install Syma (if not already installed)
npm install

# Run a Syma program directly (like Node.js!)
syma my-program.syma

# Run a compiled universe
syma universe.json

# Start interactive REPL
syma
# or via npm:
npm run repl
```

### Direct Execution Mode (New!)

Syma can now execute programs directly from the command line:

```bash
# Run a Syma module
syma src/demos/print-demo.syma
# Output: Hello from Syma Effects System!
#         …and I can queue more than one!

# Run with tracing to see transformations
syma --trace program.syma

# The runtime automatically:
# - Compiles modules if needed
# - Handles dependencies
# - Processes effects
# - Exits cleanly when done
```

### First Session

When you start the REPL, you'll see:

```
Syma REPL v1.0.0
Type :help for commands, :quit to exit

syma>
```

Try your first expression:

```lisp
syma> Add(2, 3)
→ 5

syma> {Concat "Hello " "World"}
→ "Hello World"
```

### Command-Line Options

```bash
# DIRECT EXECUTION (Runtime Mode)
syma program.syma                # Run a program and exit
syma universe.json               # Run compiled universe
syma --trace program.syma        # Run with step-by-step trace

# INTERACTIVE MODE (REPL)
syma                            # Start REPL
syma --load my-program.syma     # Load file then start REPL
syma --trace                    # REPL with tracing enabled

# EVALUATION MODE
syma --eval "Add(2, 3)"         # Evaluate and exit

# OPTIONS FOR ALL MODES
--max-steps 50000               # Set max normalization steps
--history .my-syma-history      # Custom history file (REPL)
--no-history                    # Disable history (REPL)
--rc .symarc                    # Custom RC file (REPL)
--no-rc                         # Skip RC file (REPL)
```

---

## 3. Basic Expression Evaluation

### Syntax Flexibility

The REPL accepts both brace syntax and function call syntax:

```lisp
syma> {Add 2 3}
→ 5

syma> Add(2, 3)
→ 5

syma> {Mul Add(1, 2) {Sub 10 6}}
→ 12
```

### Built-in Primitives

The REPL automatically evaluates primitive operations:

```lisp
syma> Concat("The answer is ", Add(40, 2))
→ "The answer is 42"

syma> If(Gt(5, 3), "yes", "no")
→ "yes"

syma> {FreshId}
→ "id_1234567890"
```

### Symbolic Expressions

Not everything evaluates—some expressions remain symbolic:

```lisp
syma> {Foo 1 2 3}
→ {Foo 1 2 3}

syma> MySymbol
→ MySymbol

syma> {Undefined Operation}
→ {Undefined Operation}
```

### Multiline Input

For complex expressions, use backslash to continue:

```lisp
syma> {Universe \
...     {Program \
...       {App {State {Count 0}}}} \
...     {Rules}}
... .
→ {Universe {Program {App {State {Count 0}}}} {Rules}}
```

End multiline input with a period on its own line.

---

## 4. Working with Rules

### Defining Rules Interactively

#### Method 1: Direct Rule Input

```lisp
syma> :rule Double {Double n_} → {Mul n_ 2}
Rule "Double" added

syma> {Double 5}
→ 10
```

#### Method 2: Multiline Rule Mode

```lisp
syma> :rule
Enter rule definition (end with '.' on empty line):
R("Factorial",
  Factorial(0),
  1)
.
Rule "Factorial" added

syma> :rule
Enter rule definition:
R("Factorial/Recursive",
  Factorial(n_),
  Mul(n_, Factorial(Sub(n_, 1))),
  1,
  Gt(n_, 0))
.
Rule "Factorial/Recursive" added

syma> Factorial(5)
→ 120
```

### Viewing Rules

```lisp
syma> :rules
Rules (3):
  Double
  Factorial [1]
  Factorial/Recursive [1] (with guard)

syma> :rule Double
R("Double",
  {Double n_},
  {Mul n_ 2})

syma> :rule Factorial/Recursive
R("Factorial/Recursive",
  {Factorial n_},
  {Mul n_ {Factorial {Sub n_ 1}}},
  1,
  {Gt n_ 0})
```

### Testing Rules with :apply

The `:apply` command applies a specific rule to an expression:

```lisp
syma> :apply Double {Double 7}
→ {Mul 7 2}

syma> :apply Factorial {Factorial 0}
→ 1

syma> :apply Factorial {Factorial 5}
Rule "Factorial" does not match expression
```

### Smart Execution with :exec

The `:exec` command intelligently wraps your input to match a rule's pattern:

```lisp
syma> :bundle src/demos/math.syma
Module Demo/Math bundled and loaded successfully

syma> :exec Simplify Add(Mul(2, c), Mul(3, c))
Wrapping to match pattern: {Algebra/Simplify/Simplify x_}
Wrapped expression: {Algebra/Simplify/Simplify Add(Mul(2, c), Mul(3, c))}
→ Mul(5, c)
```

This is particularly useful for rules that expect specific wrapper patterns.

### Modifying Rules

```lisp
syma> :edit Double {Double n_} → {Mul n_ 3}
Rule "Double" updated

syma> {Double 5}
→ 15

syma> :drop Double
Rule "Double" removed
```

### Rule Priorities and Guards

```lisp
syma> :rule
R("Divide/Zero",
  Divide(n_, 0),
  Error("Division by zero"),
  10)
.
Rule "Divide/Zero" added

syma> :rule
R("Divide/Normal",
  Divide(n_, d_),
  Div(n_, d_),
  0,
  Neq(d_, 0))
.
Rule "Divide/Normal" added

syma> Divide(10, 2)
→ 5

syma> Divide(10, 0)
→ Error("Division by zero")
```

---

## 5. Module System in the REPL

### Loading Individual Modules

```lisp
syma> :load src/modules/counter.syma
Universe loaded from src/modules/counter.syma

syma> :import src/modules/ui-components.syma
Module UI/Components imported
```

### Bundling vs Importing Modules

#### The `:bundle` Command

The `:bundle` command compiles a module with all its dependencies and **replaces** the entire universe:

```lisp
syma> :bundle src/demos/math.syma
Bundling module Demo/Math...
Bundling 2 modules (including dependencies)
Module Demo/Math bundled and loaded successfully
Found 7 module files

syma> :rules
Rules (49):
  Mul/Zero/Head [10]
  Add/Flatten/Left [5]
  ...
  ShowExpr
```

Use `:bundle` when you want to start fresh with a specific module as your main program.

#### The `:import` Command

The `:import` command adds a module and its dependencies to the **current** universe:

```lisp
syma> :clear
Universe cleared

syma> :rule MyRule {Test} → {Success}
Rule "MyRule" added

syma> :import src/demos/math.syma
Importing module Demo/Math...
  Added 49 new rules
Module Demo/Math imported successfully

syma> :rules
Rules (50):
  MyRule         ; Your original rule is preserved
  Mul/Zero/Head [10]
  Add/Flatten/Left [5]
  ...
```

Use `:import` when you want to:
- Add library modules to your working environment
- Combine multiple modules incrementally
- Preserve your current work while adding new functionality

The `:import` command:
- Uses the compiler to properly handle dependencies and symbol qualification
- Merges rules into the existing universe (skips duplicates)
- Preserves your current state and rules
- Supports undo with `:undo`

### Working with Module-Scoped Symbols

After bundling, all symbols are qualified with their module namespace:

```lisp
syma> :bundle src/modules/app-main.syma
Module App/Main bundled and loaded successfully

syma> App/Counter/Increment
→ App/Counter/Increment

syma> {Apply App/Counter/Increment {App/Counter/State {Count 0}}}
→ {App/Counter/State {Count 1}}
```

### Exporting Modules

Save a single module for distribution:

```lisp
syma> :export MyModule
Module MyModule exported to MyModule.syma
```

---

## 6. File Operations

### Saving and Loading Universes

Save your entire REPL state:

```lisp
syma> :save my-universe.json
Universe saved to my-universe.json

syma> :save my-universe.syma
Universe saved to my-universe.syma
```

Load a saved universe:

```lisp
syma> :load my-universe.json
Universe loaded from my-universe.json

syma> :load program.syma
Universe loaded from program.syma
```

Reload after making changes:

```lisp
syma> :bundle src/demos/math.syma
Module Demo/Math bundled and loaded successfully

syma> ; Edit math.syma in your editor...

syma> :reload
Reloading: :bundle src/demos/math.syma
Module Demo/Math bundled and loaded successfully

syma> ; Your changes are now loaded!
```

The `:reload` command remembers the last `:bundle` or `:load` command, making iterative development much faster.

### File Formats

- `.syma` - S-expression source format (human-readable)
- `.json` - Compiled AST format (machine-readable)

The REPL automatically detects the format based on file extension.

### Working with RC Files

Create a `.symarc` file in your project root to automatically load rules and settings:

```lisp
; .symarc - Loaded automatically when REPL starts
{Rules
  {R "MyDefault" {Test} {Success}}
  {R "Helper" pattern_ replacement_}}
```

---

## 7. Advanced Commands

### Universe Inspection

View the current universe structure:

```lisp
syma> :universe
{Universe
  {Program
    {App
      {State {Count 5}}
      {UI {Button :onClick Inc "+"}}}}
  {Rules
    {R "Increment" ... }
    {R "ShowCount" ... }}}
```

View specific sections of the universe:

```lisp
syma> :program
{Program
  {App
    {State {Count 5}}
    {UI {Button :onClick Inc "+"}}}}

syma> :rules-section
{Rules
  {TaggedRule "App/Counter"
    {R "Increment" ... }}
  {TaggedRule "UI/Core"
    {R "ShowCount" ... }}}

syma> :rulerules
{RuleRules
  {TaggedRuleRule "Core/Syntax"
    {R "Def->R" ... }}}
```

### Pattern Matching on Universe

The `:match` command lets you extract parts of the universe using pattern matching:

```lisp
syma> :match {Program p_}
Pattern matched successfully!

p_ =
  {App
    {State {Count 5}}
    {UI {Button :onClick Inc "+"}}}

syma> :match {Rules r...}
Pattern matched successfully!

r... = [
  {TaggedRule "App/Counter" {R "Increment" ...}}
  {TaggedRule "UI/Core" {R "ShowCount" ...}}
]

syma> :match {Program {App {State s_} ui_} ...}
Pattern matched successfully!

s_ = {Count 5}
ui_ = {UI {Button :onClick Inc "+"}}
```

Pattern syntax:
- `x_` - Variable (matches any single expression)
- `x...` - Rest variable (matches zero or more expressions)
- `_` - Wildcard (matches without binding)

Note: The pattern is automatically wrapped in `{Universe ...}` and the command intelligently adds `...` before/after as needed.

### Applying Actions to State

The `:apply` command (when used with one argument) applies an action to the current program:

```lisp
syma> :apply {Inc}
Program updated

syma> :universe
{Universe
  {Program
    {App {State {Count 6}} ...}}
  ...}
```

### Undo Functionality

```lisp
syma> {Add 2 3}
→ 5

syma> :rule Test {Test} {Result}
Rule "Test" added

syma> :undo
Undo successful

syma> :rules
Rules (0):
```

### History Management

```lisp
syma> :history
Last 20 entries:
  1: Add(2, 3)
  2: {Mul 5 6}
  3: :rule Test {Test} {Result}
  ...

syma> :history 50
Last 50 entries:
  ...
```

### Macro Scopes Inspection

View which modules can use which RuleRules (based on `macro` imports):

```lisp
syma> :macro-scopes
Macro Scopes (which modules can use which RuleRules):

  *:
    - Can use RuleRules from: Core/Syntax/Global  ; Global syntax for ALL modules
  Core/Set:
    - Can use RuleRules from: Core/Syntax/Global
    - Can use RuleRules from: Core/Rules/Sugar
  Demo/Math:
    - Can use RuleRules from: Core/Syntax/Global
    - Can use RuleRules from: Core/Rules/Sugar
  App/Main:
    - Can use RuleRules from: Core/Syntax/Global  ; Always has global syntax

Modules with RuleRules defined:
  - Core/Syntax/Global  ; Auto-loaded, applies everywhere
  - Core/Rules/Sugar
  - Core/Functions
```

This command helps debug why certain syntactic sugar works in some modules but not others. The special `*` scope indicates global RuleRules that apply to all modules.

---

## 8. Debugging and Tracing

### Trace Mode

Enable step-by-step tracing:

```lisp
syma> :trace
Trace mode: on

syma> {Double {Add 2 3}}
Trace:
  Step 1: Rule "PrimitiveFold" at path [1]
  Step 2: Rule "Double" at path []
→ 10

syma> :trace
Trace mode: off
```

### Trace Specific Expressions

```lisp
syma> :trace {Factorial 3}
Trace:
  Step 1: Rule "Factorial/Recursive" at path []
  Step 2: Rule "Factorial/Recursive" at path [1,1]
  Step 3: Rule "Factorial/Recursive" at path [1,1,1,1]
  Step 4: Rule "Factorial" at path [1,1,1,1,1,1]
  Step 5: Rule "PrimitiveFold" at path [1,1,1,1,1]
  Step 6: Rule "PrimitiveFold" at path [1,1,1,1]
  Step 7: Rule "PrimitiveFold" at path [1,1,1]
  Step 8: Rule "PrimitiveFold" at path [1,1]
  Step 9: Rule "PrimitiveFold" at path [1]
  Step 10: Rule "PrimitiveFold" at path []
→ 6
```

### Understanding Why Evaluation Stuck

```lisp
syma> :why {MyRule 42}
Checking why expression is stuck...

Rule "MyRule" partially matches:
  Pattern:
    {MyRule {Var n}}
  Issue: Expected Compound node but found Num

No other rules come close to matching this expression
```

### Inspecting Rule Transformations

Use the new inspection commands to understand how RuleRules transform your code:

```lisp
syma> :bundle src/demos/fun.syma
Module Demo/Fun bundled and loaded successfully

syma> :rules-section
{Rules
  {TaggedRule "Demo/Fun"
    {R "fun/Fib/1" {Core/Fun/WithSugar/Call Fib n_} {FibAcc n_ 0 1}}}
  {TaggedRule "Demo/Fun"
    {R "fun/Factorial/1" {Core/Fun/WithSugar/Call Factorial 0} 1}}
  ...}

syma> :rulerules
{RuleRules
  {TaggedRuleRule "Core/Fun/WithSugar"
    {R "Def->R:fn"
      {Fn {SYMAFNNAME_ pats...} {SYMAFNBODY_}}
      {Splat ...}
      100}}}

syma> :match {Rules r...}
Pattern matched successfully!

r... = [
  {TaggedRule "Demo/Fun" {R "fun/Fib/1" ...}}
  {TaggedRule "Demo/Fun" {R "fun/Factorial/1" ...}}
]
```

This shows how the `{Fn ...}` syntactic sugar was transformed into actual rules by RuleRules.

### REPL Settings

```lisp
syma> :set trace on
Trace mode enabled

syma> :set maxsteps 100000
Maximum normalization steps set to 100000

syma> :set trace off
Trace mode disabled
```

---

## 9. Interactive Development Workflow

### Exploratory Programming

Start with simple expressions and build up:

```lisp
syma> {Person "Alice" 30}
→ {Person "Alice" 30}

syma> :rule
R("GetName",
  GetName(Person(name_, _)),
  name_)
.
Rule "GetName" added

syma> GetName(Person("Alice", 30))
→ "Alice"

syma> :rule
R("GetAge",
  GetAge(Person(_, age_)),
  age_)
.
Rule "GetAge" added

syma> GetAge(Person("Bob", 25))
→ 25
```

### Test-Driven Rule Development

Test rules incrementally:

```lisp
syma> ; First, test the expression without rules
syma> {Sum 1 2 3}
→ {Sum 1 2 3}

syma> ; Add base case
syma> :rule Sum/Empty {Sum} → 0
Rule "Sum/Empty" added

syma> {Sum}
→ 0

syma> ; Add recursive case
syma> :rule Sum/Recursive {Sum n_ rest...} → {Add n_ {Sum rest...}}
Rule "Sum/Recursive" added

syma> {Sum 1 2 3}
→ 6

syma> ; Test edge cases
syma> {Sum 10}
→ 10

syma> {Sum -5 5}
→ 0
```

### Module Development Workflow

1. Start with a clear universe:
```lisp
syma> :clear
Universe reset to empty state
```

2. Define your module structure:
```lisp
syma> :rule
Module(MyModule,
  Export(Process, Transform),
  Rules(
    R("Process",
      Process(input_),
      Transform(input_))))
.
```

3. Test module functionality:
```lisp
syma> Process("test")
→ Transform("test")
```

4. Save your work:
```lisp
syma> :save my-module.syma
Universe saved to my-module.syma
```

5. Use `:reload` for rapid iteration:
```lisp
syma> :bundle my-module.syma
Module MyModule bundled and loaded successfully

syma> ; Make edits in your text editor...
syma> ; Add new rules, fix bugs, refactor...

syma> :reload  ; No need to retype the path!
Reloading: :bundle my-module.syma
Module MyModule bundled and loaded successfully

syma> ; Test your changes immediately
```

### Live Debugging Session

```lisp
syma> ; Something's not working as expected
syma> {ComplexRule {Nested {Deep 42}}}
→ {ComplexRule {Nested {Deep 42}}}

syma> ; Let's trace it
syma> :trace {ComplexRule {Nested {Deep 42}}}
Trace:
  (No rules matched)
→ {ComplexRule {Nested {Deep 42}}}

syma> ; Check what rules exist
syma> :rules
Rules (0):

syma> ; Ah, no rules defined! Let's add one
syma> :rule ComplexRule {ComplexRule x_} → {Processed x_}
Rule "ComplexRule" added

syma> {ComplexRule {Nested {Deep 42}}}
→ {Processed {Nested {Deep 42}}}
```

---

## 10. REPL Commands Reference

### Expression Evaluation
- `<expr>` - Evaluate an expression
- `<expr> \` - Start multiline input (end with `.`)

### Help and Navigation
- `:help`, `:h` - Show help message
- `:quit`, `:q`, `:exit` - Exit the REPL

### File Operations
- `:save <file>` - Save universe to file (.syma or .json)
- `:load <file>` - Load universe from file
- `:bundle <file>` - Bundle module and dependencies, replacing universe
- `:reload` - Re-run last `:bundle` or `:load` command
- `:import <file>` - Import module and dependencies into current universe
- `:export <module>` - Export single module to file (not yet implemented)

### Universe Management
- `:clear` - Reset universe to empty state
- `:universe`, `:u` - Show current universe (pretty printed)
- `:program`, `:p` - Show Program section
- `:rules-section`, `:rs` - Show raw Rules section
- `:rulerules`, `:rr` - Show RuleRules section
- `:match <pattern>` - Match pattern against universe and show bindings
- `:undo` - Undo last modification

### Rule Management
- `:rules` - List all rules
- `:rule` - Enter multiline rule definition mode
- `:rule <name>` - Show specific rule
- `:rule <name> <pat> → <repl>` - Define inline rule
- `:drop <name>` - Remove rule
- `:edit <name> <pat> → <repl>` - Replace existing rule

### Evaluation Control
- `:apply <name> <expr>` - Apply specific rule to expression
- `:exec <name> <expr>` - Smart execute: auto-wrap input to match rule
- `:trace <expr>` - Evaluate with step-by-step trace
- `:trace` - Toggle trace mode on/off
- `:why <expr>` - Explain why evaluation got stuck
- `:apply <action>` - Apply action to current universe state
- `:norm [show]` - Normalize the universe Program section

### Settings
- `:set <option> <value>` - Set REPL option
  - `trace on/off` - Enable/disable automatic tracing
  - `maxsteps <n>` - Set maximum normalization steps

### History
- `:history [n]` - Show last n history entries (default: 20)

### Debugging
- `:macro-scopes` - Show which modules can use which RuleRules (macro import tracking)

---

## 11. Tips and Best Practices

### Effective REPL Usage

#### 1. Start Small, Build Incrementally

```lisp
syma> ; Don't try to write complex rules immediately
syma> ; Start with simple cases
syma> :rule IsEven {IsEven 0} → True
syma> :rule IsEven/Even {IsEven n_} → {IsEven {Sub n_ 2}} when {Gt n_ 0}
syma> :rule IsEven/Odd {IsEven n_} → False when {Lt n_ 0}
```

#### 2. Use :trace for Understanding

When something doesn't work as expected, trace is your friend:

```lisp
syma> :trace {MyComplexExpression ...}
; See exactly which rules fire and in what order
```

#### 3. Test Rules in Isolation

Before adding to your main program:

```lisp
syma> :clear
syma> :rule TestRule ...
syma> {TestExpression}
; Verify it works
syma> :load main-program.syma
syma> :rule TestRule ...  ; Now add to main program
```

#### 4. Name Rules Systematically

```lisp
; Good naming
Module/Function
Module/Function/Variant
TodoList/Add
TodoList/Remove
TodoList/Toggle

; Poor naming
Rule1
DoStuff
Handler
```

#### 5. Use Comments Liberally

```lisp
syma> ; Testing the new factorial implementation
syma> :rule Fact {Fact 0} → 1
syma> ; Recursive case with guard
syma> :rule Fact/Rec {Fact n_} → {Mul n_ {Fact {Sub n_ 1}}} when {Gt n_ 0}
```

### Common Patterns

#### Pattern: Accumulator

```lisp
syma> :rule
R("Sum",
  Sum(items...),
  SumAcc(0, items...))
.

syma> :rule
R("SumAcc/Done",
  SumAcc(acc_),
  acc_)
.

syma> :rule
R("SumAcc/Step",
  SumAcc(acc_, n_, rest...),
  SumAcc(Add(acc_, n_), rest...))
.
```

#### Pattern: Wrapper/Unwrapper

```lisp
syma> :rule
R("Process",
  Process(input_),
  Unwrap(ProcessInternal(Wrap(input_))))
.

syma> :rule
R("Unwrap",
  Unwrap(Wrap(result_)),
  result_)
.
```

#### Pattern: Guard Chains

```lisp
syma> :rule Sign/Pos {Sign n_} → "positive" when {Gt n_ 0}
syma> :rule Sign/Neg {Sign n_} → "negative" when {Lt n_ 0}
syma> :rule Sign/Zero {Sign 0} → "zero"
```

### Performance Considerations

#### 1. Rule Priority Matters

Higher priority rules are checked first:

```lisp
syma> :rule SpecificCase pattern result 100  ; Check this first
syma> :rule GeneralCase pattern result        ; Fallback
```

#### 2. Avoid Infinite Loops

```lisp
syma> ; BAD: This will loop forever
syma> :rule Bad {X n_} → {X {Add n_ 1}}

syma> ; GOOD: Add termination condition
syma> :rule Good {X n_} → {X {Add n_ 1}} when {Lt n_ 10}
syma> :rule Good/Done {X n_} → {Done n_} when {Gte n_ 10}
```

#### 3. Set Appropriate Max Steps

```lisp
syma> :set maxsteps 100000  ; For complex computations
syma> {VeryComplexComputation ...}
```

### Debugging Strategies

#### 1. Binary Search for Problems

```lisp
syma> ; Half your rules aren't working?
syma> :clear
syma> :load first-half.syma
syma> {TestExpression}  ; Works?
syma> :load second-half.syma
syma> {TestExpression}  ; Breaks? Problem is in second half
```

#### 2. Minimal Reproducible Example

```lisp
syma> :clear
syma> ; Add only the rules needed to reproduce issue
syma> :rule MinimalRule ...
syma> {ProblematicExpression}
```

#### 3. Check Rule Shadows

```lisp
syma> :rules  ; List all rules
; Look for rules with same name or overlapping patterns
; Higher priority rules can shadow lower ones
```

### REPL Productivity Tips

#### 1. Use Shell History

The REPL saves command history. Use up/down arrows to navigate.

#### 2. Multiline for Complex Rules

```lisp
syma> :rule \
... R("Complex", \
...   LongPattern(with_, many_, parts_), \
...   LongReplacement(with_, many_, parts_)) \
... .
```

#### 3. Quick Testing Workflow

```lisp
syma> :save checkpoint.json   ; Save before experiments
syma> ; ... try risky changes ...
syma> :load checkpoint.json   ; Restore if needed
```

#### 4. Iterative Development with :reload

```lisp
syma> :bundle src/demos/math.syma
Module Demo/Math bundled and loaded successfully

syma> {Simplify {Add 2 3}}
→ 5

syma> ; Edit the file in your editor...

syma> :reload
Reloading: :bundle src/demos/math.syma
Module Demo/Math bundled and loaded successfully

syma> ; Test your changes immediately
```

#### 5. Bundle for Production

```lisp
syma> ; During development
syma> :load module1.syma
syma> :load module2.syma
syma> ; Test individually

syma> ; For production
syma> :bundle src/main.syma  ; Loads everything at once
```

---

## Conclusion

The Syma REPL is more than just an interactive prompt—it's your laboratory for symbolic programming. It lets you:

- **Experiment** with symbolic transformations in real-time
- **Build** complex systems incrementally
- **Debug** by watching expressions evolve
- **Test** rules and modules in isolation
- **Explore** the unique world of pattern-based programming

Whether you're learning Syma, developing new modules, or debugging complex rule systems, the REPL is your primary tool for understanding how symbolic expressions transform and evolve.

Remember: In Syma, computation is transformation. The REPL lets you see that transformation happening, step by step, rule by rule.

Happy symbolic programming!

---

## Quick Command Reference Card

```
EXPRESSION EVALUATION
  expr                      Evaluate expression
  expr \                   Multiline (end with .)

HELP
  :help                    Show commands
  :quit                    Exit REPL

FILES
  :save file               Save universe
  :load file               Load universe
  :bundle file             Replace universe with module
  :reload                  Re-run last :bundle/:load
  :import file             Add module to universe
  :export module           Export module

UNIVERSE
  :clear                   Reset universe
  :universe, :u            Show universe
  :program, :p             Show Program section
  :rules-section, :rs      Show Rules section
  :rulerules, :rr          Show RuleRules section
  :match pattern           Extract with pattern matching
  :undo                    Undo last change

RULES
  :rules                   List all rules
  :rule                    Define rule (multiline)
  :rule name               Show rule
  :rule name pat → repl    Define rule (inline)
  :drop name               Remove rule
  :edit name pat → repl    Update rule

EXECUTION
  :apply rule expr         Apply specific rule
  :exec rule expr          Smart execute
  :trace [expr]            Trace mode/expression
  :why expr                Why stuck?
  :apply action            Apply to universe
  :norm [show]             Normalize Program section

SETTINGS
  :set trace on/off        Toggle tracing
  :set maxsteps n          Max steps

HISTORY
  :history [n]             Show history

DEBUGGING
  :macro-scopes            Show RuleRules scope map
```
# 5. Modules and Macros

*Importing logic. Writing RuleRules (rules that rewrite rules). Making your own micro-languages inside Syma.*

⸻

## Why Modules?

You can't build everything in one file.

Well, technically you can. You could write a million-line Syma program in a single file. It would work. It would be a nightmare to maintain, but it would work.

Real systems need organization. Not because the computer cares — the computer would happily process a billion rules in one massive file. But because **humans** need structure. We think in hierarchies. We group related concepts. We hide implementation details and expose clean interfaces. We version things and share them with others.

Modules let you:
- **Organize** code into namespaced units
- **Share** reusable logic across projects
- **Import** only what you need
- **Encapsulate** implementation details
- **Version** and distribute libraries

But Syma modules are different. They're not just containers for code.

They're **symbolic expressions** that define transformation rules, exports, and dependencies.

Everything in Syma is data, remember? A module is data. The import statement is data. The whole dependency graph is data. Which means you can pattern-match on it, transform it, introspect it. Modules aren't a special language feature bolted on. They're part of the symbolic universe, just like everything else.

🜛 *A module is a universe fragment, waiting to be composed with others.*

⸻

## Module Structure

A module is a symbolic expression:

```lisp
{Module Module/Name
  {Export symbol1 symbol2 symbol3}
  {Import Other/Module as Alias}
  {Import Another/Module as A open}
  {Defs
    {ConstantName value}}
  {Program
    {App {State ...} {UI ...}}}
  {Rules
    {R "RuleName" pattern replacement}}
  {RuleRules
    {R "MetaRule" rulePattern ruleReplacement}}}
```

### Components

- **Module/Name** — Qualified module identifier (slash-separated namespace)
- **Export** — Public symbols available to importers
- **Import** — Dependencies on other modules
- **Defs** — Named constants (expanded to high-priority rules)
- **Program** — Entry point for executable modules
- **Rules** — Transformation rules
- **RuleRules** — Meta-rules that transform the Rules section

⸻

## Creating a Module

Let's build a simple module for key-value operations:

```lisp
{Module Core/KV
  {Export Get Set Put Patch}

  {Rules
    ; Get a value by key
    {R "Get/Found"
       {Get tag_ key_ {tag_ before.. {KV key_ value_} after..}}
       value_}

    ; Set a value (replace if exists)
    {R "Set"
       {Set tag_ key_ newValue_ state_}
       {Put tag_ key_ newValue_ state_}}

    ; Put a value (always adds)
    {R "Put"
       {Put tag_ key_ value_ {tag_ kvs..}}
       {tag_ kvs.. {KV key_ value_}}}

    ; Patch multiple key-values
    {R "Patch"
       {Patch tag_ state_ updates..}
       {ApplyUpdates tag_ state_ updates..}}}}
```

Save as `core-kv.syma`.

⸻

## Importing Modules

### Basic Import (Qualified Names)

```lisp
{Module App/Main
  {Import Core/KV as KV}

  {Rules
    {R "InitState"
       {InitState}
       {State {KV Count 0} {KV Name ""}}}

    {R "GetCount"
       {GetCount state_}
       {KV/Get State Count state_}}}}  ; ← Qualified!
```

After import, use `KV/Get`, `KV/Set`, etc.

### Open Import (Unqualified Names)

```lisp
{Module App/Main
  {Import Core/KV as KV open}

  {Rules
    {R "GetCount"
       {GetCount state_}
       {Get State Count state_}}}}  ; ← No qualification needed!
```

With `open`, you can use `Get` directly instead of `KV/Get`.

🜛 *Qualified imports are explicit. Open imports are convenient. Choose based on clarity.*

⸻

## Symbol Qualification

When modules are compiled, **all symbols are qualified** with their module namespace:

```lisp
; Before compilation (source):
{Module App/Counter
  {Export Inc}
  {Defs {InitialCount 0}}
  {Rules
    {R "Inc" {Inc n_} {Add n_ 1}}}}

; After compilation (universe):
{Rules
  {R "App/Counter/InitialCount/Def"
     App/Counter/InitialCount
     0
     1000}  ; High priority for Defs

  {R "App/Counter/Inc"
     {App/Counter/Inc n_}
     {Add n_ 1}}}
```

**Built-ins remain unqualified:**
- `Add`, `Mul`, `Concat`, `If`, etc.
- HTML tags: `Div`, `Button`, `Span`

**Local symbols get qualified:**
- `Inc` → `App/Counter/Inc`
- `InitialCount` → `App/Counter/InitialCount`

**Imported symbols resolve to their source:**
- `KV/Get` → `Core/KV/Get` (from Core/KV module)

⸻

## Defs: Named Constants

The `Defs` section creates high-priority rules:

```lisp
{Defs
  {Pi 3.14159}
  {InitialState {State {Count 0}}}}
```

Compiles to:

```lisp
{Rules
  {R "Module/Pi/Def" Module/Pi 3.14159 1000}
  {R "Module/InitialState/Def" Module/InitialState {State {Count 0}} 1000}}
```

Priority 1000 ensures definitions fire **before** other rules.

Use Defs for:
- Configuration constants
- Initial state values
- Commonly used expressions

⸻

## RuleRules: Rules That Transform Rules

Here's where Syma gets radical.

**RuleRules** are meta-rules that transform your `Rules` section **before runtime**.

They let you:
- Create syntactic sugar
- Generate families of rules
- Build DSLs
- Transform rule patterns

### Module-Scoped RuleRules

**Important:** RuleRules are **module-scoped**. They only affect modules that explicitly import them with the `macro` modifier:

```lisp
{Module Core/Sugar
  {Export}  ; No regular exports needed
  {RuleRules
    {R "ShorthandRule"
       {:rule name_ pattern_ -> replacement_}
       {R name_ pattern_ replacement_}}}}

{Module App/Main
  {Import Core/Sugar as S macro}  ; ← 'macro' enables RuleRules
  {Rules
    {:rule "Inc" {Inc n_} -> {Add n_ 1}}}}  ; ← Transformed!
```

After compilation:

```lisp
{Rules
  {R "Inc" {Inc n_} {Add n_ 1}}}  ; Sugar applied!
```

**Without `macro`:**

```lisp
{Import Core/Sugar as S}  ; No 'macro' modifier
{Rules
  {:rule "Inc" {Inc n_} -> {Add n_ 1}}}  ; ← ERROR! :rule not recognized
```

🜛 *`macro` is opt-in transformation. No surprises. Explicit magic only.*

### Global Syntax: Core/Syntax/Global

**Exception:** The special module `Core/Syntax/Global` is **automatically imported** and applies to **ALL modules**:

```lisp
{Module Core/Syntax/Global
  {Export}
  {RuleRules
    {R "Sugar/Rule"
       {:rule name_ pattern_ -> replacement_}
       {R name_ pattern_ replacement_}}}}
```

This provides fundamental syntax that every module gets automatically.

⸻

## Building a Function System with RuleRules

Let's create a function definition system using RuleRules:

```lisp
{Module Core/Fun
  {Export Fn}

  {RuleRules
    ; Transform {Fn name args body} into proper rules
    {R "Fn->Rules"
       {Fn {funcName_ patterns..} body_}
       {Splat
         ; Main rule: {Call FuncName args...}
         {R {Concat "fun/" {ToString funcName_} "/" {Arity patterns..}}
            {Call funcName_ patterns..}
            body_}

         ; Sugar rule: {FuncName args...} → {Call FuncName args...}
         {R {Concat "fun/" {ToString funcName_} "/Sugar"}
            {funcName_ patterns..}
            {Call funcName_ patterns..}}}}

    ; Helper: Count arguments
    {R "Arity/Empty" {Arity} 0}
    {R "Arity/Step" {Arity _ rest..} {Add 1 {Arity rest..}}}}}
```

Now use it:

```lisp
{Module App/Main
  {Import Core/Fun as F macro}  ; ← 'macro' enables Fn syntax

  {Rules
    {Fn {Double n} {Mul n 2}}
    {Fn {Triple n} {Mul n 3}}}}
```

After RuleRules transformation:

```lisp
{Rules
  {R "fun/Double/1" {Call Double n_} {Mul n_ 2}}
  {R "fun/Double/Sugar" {Double n_} {Call Double n_}}
  {R "fun/Triple/1" {Call Triple n_} {Mul n_ 3}}
  {R "fun/Triple/Sugar" {Triple n_} {Call Triple n_}}}
```

Now you can call functions two ways:

```lisp
{Call Double 5}  → 10
{Double 5}       → {Call Double 5} → 10
```

🜛 *RuleRules don't add features to Syma. They show you that Syma can modify itself. The language is its own metaprogrammer.*

⸻

## The Splat Primitive: Generating Multiple Rules

`Splat` (or its alias `...!`) generates multiple rules from one meta-rule:

```lisp
{RuleRules
  {R "MakePair"
     {MakePair name_}
     {Splat
       {R {Concat name_ "/Fst"} {Fst {name_ a_ b_}} a_}
       {R {Concat name_ "/Snd"} {Snd {name_ a_ b_}} b_}}}}

{Rules
  {MakePair Pair}}
```

Expands to:

```lisp
{Rules
  {R "Pair/Fst" {Fst {Pair a_ b_}} a_}
  {R "Pair/Snd" {Snd {Pair a_ b_}} b_}}
```

### Splat Alias: `...!`

```lisp
{...!
  rule1
  rule2
  rule3}
```

Same as `{Splat rule1 rule2 rule3}`.

⸻

## Macro Scopes: Who Gets What

When modules are bundled, the compiler creates a **MacroScopes** section:

```lisp
{Universe
  {Program ...}
  {Rules ...}
  {RuleRules ...}
  {MacroScopes
    {Module "Core/Set"
      {RuleRulesFrom "Core/Rules/Sugar"}}
    {Module "App/Main"
      {RuleRulesFrom "Core/Fun"}}}}
```

This tracks which modules can use which RuleRules.

**In the REPL:**

```lisp
syma> :macro-scopes
Macro Scopes:
  *:
    - Core/Syntax/Global  ; Applied to ALL modules
  Core/Set:
    - Core/Syntax/Global
    - Core/Rules/Sugar
  App/Main:
    - Core/Syntax/Global
    - Core/Fun
```

The `*` scope means global RuleRules from `Core/Syntax/Global`.

⸻

## Import Modifiers Cheat Sheet

```lisp
{Import Module as M}              ; Qualified only: M/Symbol
{Import Module as M open}         ; Unqualified: Symbol
{Import Module as M macro}        ; Qualified + RuleRules applied
{Import Module as M open macro}   ; Unqualified + RuleRules applied
```

Examples:

```lisp
; Qualified access, no RuleRules
{Import Core/List as L}
{L/Map f_ {L/List items..}}

; Unqualified access, no RuleRules
{Import Core/List as L open}
{Map f_ {List items..}}

; Qualified access + RuleRules
{Import Core/Fun as F macro}
{Fn {Double n} {Mul n 2}}  ; ← Sugar from RuleRules!
{F/Call Double 5}

; Unqualified + RuleRules (most convenient)
{Import Core/Fun as F open macro}
{Fn {Double n} {Mul n 2}}
{Call Double 5}
```

🜛 *`open` controls visibility. `macro` controls transformation. Combine them as needed.*

⸻

## Building a Mini-DSL

Let's build a state machine DSL:

```lisp
{Module DSL/StateMachine
  {Export State On}

  {RuleRules
    {R "StateMachineSyntax"
       {State stateName_ transitions..}
       {GenerateTransitions stateName_ transitions..}}

    {R "GenerateTransitions/Empty"
       {GenerateTransitions stateName_}
       {Splat}}

    {R "GenerateTransitions/Step"
       {GenerateTransitions stateName_ {On event_ nextState_} rest..}
       {Splat
         {R {Concat "State/" {ToString stateName_} "/" {ToString event_}}
            {Transition {CurrentState stateName_} event_}
            {CurrentState nextState_}}
         {GenerateTransitions stateName_ rest..}}}}}

{Module App/TrafficLight
  {Import DSL/StateMachine as SM macro}

  {Rules
    {State Red
      {On Timer Green}}

    {State Green
      {On Timer Yellow}}

    {State Yellow
      {On Timer Red}}}}
```

After RuleRules:

```lisp
{Rules
  {R "State/Red/Timer"
     {Transition {CurrentState Red} Timer}
     {CurrentState Green}}

  {R "State/Green/Timer"
     {Transition {CurrentState Green} Timer}
     {CurrentState Yellow}}

  {R "State/Yellow/Timer"
     {Transition {CurrentState Yellow} Timer}
     {CurrentState Red}}}
```

Now run it:

```lisp
{Transition {CurrentState Red} Timer}
→ {CurrentState Green}

{Transition {CurrentState Green} Timer}
→ {CurrentState Yellow}
```

🜛 *You didn't extend Syma. You built a language **inside** Syma using its own transformation rules.*

⸻

## Organizing a Project

```
my-syma-project/
├── package.syma           # Project metadata
├── src/
│   ├── main.syma         # Entry module
│   ├── core/
│   │   ├── kv.syma
│   │   ├── list.syma
│   │   └── string.syma
│   ├── ui/
│   │   ├── components.syma
│   │   └── forms.syma
│   └── app/
│       ├── state.syma
│       └── actions.syma
└── dist/
    └── universe.json      # Compiled output
```

Compile:

```bash
syma-compile src/main.syma --bundle --entry App/Main --out dist/universe.json
```

⸻

## Standard Library Modules

Syma ships with core modules:

- **Core/List** — List operations (Map, Filter, Fold)
- **Core/KV** — Key-value state management
- **Core/String** — String manipulation
- **Core/JSON** — JSON serialization
- **Core/Fun** — Function definition syntax
- **Core/Set** — Set operations
- **Core/Effect** — Effects system helpers
- **Core/Test** — Testing utilities
- **Core/Syntax/Global** — Global syntactic sugar

Import them:

```lisp
{Import Core/List as L open}
{Import Core/KV as KV}
{Import Core/Fun as F macro}
```

⸻

## Exercises

### 1. Build a Logging Module

Create a module that provides logging rules:

```lisp
{Module Debug/Log
  {Export Log Debug Warn Error}
  {Rules
    {R "Log" {Log msg_} {Debug "LOG" msg_}}
    {R "Warn" {Warn msg_} {Debug "WARN" msg_}}}}
```

### 2. Create Type Constructors

Use RuleRules to generate constructor patterns:

```lisp
{RuleRules
  {R "MakeType"
     {Type name_ fields..}
     {Splat
       {R {Concat "New" {ToString name_}}
          {New name_ values..}
          {name_ {Zip fields.. values..}}}}}}
```

### 3. Build a Test DSL

Create syntax for test assertions:

```lisp
{Module Test/DSL
  {RuleRules
    {R "TestSyntax"
       {:test name_ :expect expected_ :actual actual_}
       {R {Concat "Test/" name_}
          {RunTest name_}
          {Assert {Eq actual_ expected_} name_}}}}}
```

⸻

## Key Takeaways

- **Modules** organize code into namespaced units
- **Imports** can be qualified (`M/Symbol`) or open (`Symbol`)
- **`macro` modifier** enables RuleRules transformation
- **RuleRules** transform the Rules section before runtime
- **Splat** generates multiple rules from one meta-rule
- **Core/Syntax/Global** provides universal syntax to all modules
- **Defs** create high-priority constant rules

⸻

## What's Next

You can now organize code into modules and build DSLs with RuleRules.

Next, let's build **real systems** from scratch using only rules.

**Next:** [Chapter 6: Building Worlds with Rules](./06-building-worlds.md)

Or explore:
- [Chapter 7: Symbolic Effects](./07-symbolic-effects.md) — I/O through symbols
- [Chapter 8: The Outermost Philosophy](./08-outermost-philosophy.md) — Why outermost-first matters

⸻

🜛 *"Modules compose universes. RuleRules compose languages. Together, they compose infinity."*

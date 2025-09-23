# The Power of RuleRules: Meta-Programming in Syma
## Transform Your Rules Before They Transform Your Programs

Welcome to one of Syma's most powerful features: **RuleRules**. These are meta-rules that transform other rules before they're applied to your program. If regular rules are like chemical reactions, RuleRules are like catalysts that create new reactions.

---

## Table of Contents

1. [Introduction: What Are RuleRules?](#1-introduction-what-are-rulerules)
2. [Understanding the Compilation Pipeline](#2-understanding-the-compilation-pipeline)
3. [Your First RuleRule](#3-your-first-rulerule)
4. [The Magic of Splat: Generating Multiple Rules](#4-the-magic-of-splat-generating-multiple-rules)
5. [Building a Function Definition System](#5-building-a-function-definition-system)
6. [Pattern Variables in RuleRules](#6-pattern-variables-in-rulerules)
7. [Advanced Techniques](#7-advanced-techniques)
8. [Common Patterns and Best Practices](#8-common-patterns-and-best-practices)
9. [Debugging RuleRules](#9-debugging-rulerules)
10. [Real-World Examples](#10-real-world-examples)

---

## 1. Introduction: What Are RuleRules?

RuleRules are Syma's meta-programming system. They're rules that transform the Rules section of your Universe before your program runs. This happens at compile-time, making them perfect for:

- **Creating DSLs**: Define your own syntax that expands into rules
- **Reducing boilerplate**: Generate families of related rules
- **Adding syntactic sugar**: Create convenient shorthands
- **Building abstractions**: Hide complex rule patterns behind simple interfaces

### The Key Insight

In Syma, rules are just data—symbolic expressions like everything else. RuleRules pattern-match on rule definitions and transform them into new rules. This is homoiconicity at its finest: code that writes code.

### Module-Scoped RuleRules (New!)

**Important:** RuleRules are now module-scoped. They only transform rules in modules that explicitly import them with the `macro` modifier. This prevents unexpected transformations and keeps your code predictable:

**Special Exception:** The module `Core/Syntax/Global` is automatically included in all compilations and provides global syntax that applies to ALL modules without requiring imports. This is where fundamental syntactic sugar like `:rule` lives:

```lisp
;; Core/Syntax/Global provides universal syntax (no import needed!)
{Module MyApp
  {Rules
    {:rule "Test" x_ -> {Process x_}}  ; Works everywhere!
  }}

;; Regular module-scoped RuleRules still require 'macro' import
{Module B
  {Import CustomSyntax as CS macro}  ; ← Need 'macro' for non-global RuleRules
  {Rules {...}}}

;; Module C doesn't get CustomSyntax (only global syntax)
{Module C
  {Import CustomSyntax as CS}        ; ← No 'macro', no custom RuleRules
  {Rules
    {:rule "Works" x -> y}            ; Global :rule syntax works
    {CustomSyntax ...}}}              ; But custom syntax doesn't
```

### When RuleRules Execute

```
Source Code → Parse → Module-Scoped RuleRules Applied → Final Rules → Runtime
                      ↑
                Only applies to modules with 'macro' imports
```

RuleRules transform your Rules section ONCE at compile time, not during program execution, and only in modules that explicitly request them.

---

## 2. Understanding the Compilation Pipeline

Let's trace what happens when you use RuleRules:

### Step 1: Initial Universe Structure

```lisp
{Universe
  {Program ...}
  {Rules
    {R "Original" pattern replacement}
    {Def MyFunc {Args x y} {Add x y}}  ; This will be transformed!
  }
  {RuleRules
    {R "Def->R"
       {Def name_ args_ body_}
       {R {Concat "fun/" {ToString name_}} {Call name_ args_} body_}}}}
```

### Step 2: RuleRules Transform Rules

The RuleRules are applied to the Rules section. The `Def` node matches and gets replaced:

```lisp
{Rules
  {R "Original" pattern replacement}
  {R "fun/MyFunc" {Call MyFunc {Args x y}} {Add x y}}  ; Transformed!
}
```

### Step 3: Final Universe (RuleRules consumed)

After transformation, RuleRules have done their job and the final rules are ready for runtime:

```lisp
{Universe
  {Program ...}
  {Rules
    {R "Original" pattern replacement}
    {R "fun/MyFunc" {Call MyFunc x_ y_} {Add x_ y_}}}}
```

---

## 3. Your First RuleRule

Let's create a simple RuleRule that adds logging to any rule:

```lisp
{RuleRules
  {R "AddLogging"
     {R name_ pattern_ replacement_}
     {R name_ pattern_ {Seq {Debug name_ pattern_} replacement_}}}}

{Rules
  {R "Increment" {Inc n_} {Add n_ 1}}}
```

After RuleRules transformation:

```lisp
{Rules
  {R "Increment" {Inc n_} {Seq {Debug "Increment" {Inc n_}} {Add n_ 1}}}}
```

Now every time the Increment rule fires, it logs its name and matched pattern!

---

## 4. The Magic of Splat: Generating Multiple Rules

`Splat` (or its alias `...!`) is a powerful primitive that generates multiple rules from a single meta-rule. When used in RuleRules, it expands into multiple rule definitions.

### Basic Splat Example

```lisp
{RuleRules
  {R "MakeTwoRules"
     {MakeRules name_}
     {Splat
       {R {Concat name_ "/Forward"} {Forward x_} x_}
       {R {Concat name_ "/Backward"} {Backward x_} x_}}}}

{Rules
  {MakeRules "Test"}}
```

After transformation:

```lisp
{Rules
  {R "Test/Forward" {Forward x_} x_}
  {R "Test/Backward" {Backward x_} x_}}
```

### Splat Alias: ...!

The `...!` operator is an alias for Splat, making the syntax more concise:

```lisp
{RuleRules
  {R "MakeTwoRules"
     {MakeRules name_}
     {...!
       {R {Concat name_ "/A"} patternA replacementA}
       {R {Concat name_ "/B"} patternB replacementB}}}}
```

---

## 5. Building a Function Definition System

Let's build a complete function definition system using RuleRules, inspired by `core-fun-withsugar.syma`:

```lisp
{Module Core/Functions
  {Export Def Fn}

  {RuleRules
    ; Basic function definition
    {R "Def->Rule"
       {Def name_ {Args pats...} body_}
       {R {Concat "fun/" {ToString name_} "/" {Arity pats...}}
          {Call name_ pats...}
          body_}}

    ; Fancy function with multiple calling conventions
    {R "Fn->Rules"
       {Fn {name_ pats...} body_}
       {...!
         ; Main rule: {Call FuncName args...}
         {R {Concat "fun/" {ToString name_} "/" {Arity pats...}}
            {Call name_ pats...}
            body_}
         ; Sugar rule: {FuncName args...} without Call
         {R {Concat "fun/" {ToString name_} "/" {Arity pats...} "/Sugar"}
            {name_ pats...}
            {Call name_ pats...}}}}

    ; Helper to count arguments
    {R "Arity/Empty" {Arity} 0}
    {R "Arity/Count" {Arity _ rest...} {Add 1 {Arity rest...}}}}}

{Module MyApp
  {Import Core/Functions as F open macro}  ; Both modifiers!

  {Rules
    ; Now we can use Def and Fn syntax (from 'macro')
    ; And reference them without qualification (from 'open')
    {Def Double {Args n} {Mul n 2}}
    {Fn {Triple n} {Mul n 3}}}}
```

After RuleRules transformation:

```lisp
{Rules
  {R "fun/Double/1" {Call Double n_} {Mul n_ 2}}
  {R "fun/Triple/1" {Call Triple n_} {Mul n_ 3}}
  {R "fun/Triple/1/Sugar" {Triple n_} {Call Triple n_}}}
```

Now you can call Triple in two ways:
- `{Call Triple 5}` → `15`
- `{Triple 5}` → `{Call Triple 5}` → `15`

---

## 6. Pattern Variables in RuleRules

RuleRules can use special naming conventions for pattern variables to maintain clarity:

### Naming Convention

```lisp
{RuleRules
  {R "Example"
     {Pattern METAVAR_ normalvar_}
     {Replacement METAVAR_ normalvar_}}}
```

- `METAVAR_` - Uppercase indicates meta-level variables (exist at compile time)
- `normalvar_` - Lowercase for runtime pattern variables (will appear in final rules)

### Variable Preservation

When RuleRules transform rules, unbound pattern variables are preserved:

```lisp
{RuleRules
  {R "WrapPattern"
     {SimpleRule pattern_}
     {R "Wrapped" {Wrapper pattern_} {Process pattern_}}}}

{Rules
  {SimpleRule {Data x_ y_}}}  ; x_ and y_ are preserved
```

Result:

```lisp
{Rules
  {R "Wrapped" {Wrapper {Data x_ y_}} {Process {Data x_ y_}}}}
```

---

## 7. Advanced Techniques

### Conditional Rule Generation

Use guards in RuleRules to conditionally generate rules:

```lisp
{RuleRules
  {R "OptionalRule"
     {DefOpt name_ body_ enabled_}
     {R name_ {Call name_} body_}
     :guard {Eq enabled_ True}}}

{Rules
  {DefOpt "Feature1" {Success} True}   ; This generates a rule
  {DefOpt "Feature2" {Disabled} False}} ; This doesn't
```

### Recursive Rule Generation

RuleRules can generate rules that themselves use meta-patterns:

```lisp
{RuleRules
  {R "MakeGetter"
     {Getter field_}
     {R {Concat "Get" {ToString field_}}
        {Get field_ {Struct ... {field_ value_} ...}}
        value_}}}

{Rules
  {Getter Name}
  {Getter Age}}
```

Generates:

```lisp
{Rules
  {R "GetName" {Get Name {Struct ... {Name value_} ...}} value_}
  {R "GetAge" {Get Age {Struct ... {Age value_} ...}} value_}}
```

### Meta-Rule Composition

RuleRules can build on each other:

```lisp
{RuleRules
  ; First level: Create basic function
  {R "BasicFunc"
     {Func name_ body_}
     {SimpleFunc name_ {} body_}}

  ; Second level: Enhance simple functions
  {R "EnhanceFunc"
     {SimpleFunc name_ args_ body_}
     {Def name_ args_ {Logged name_ body_}}}}
```

---

## 8. Common Patterns and Best Practices

### Pattern 1: DSL Creation

Create domain-specific languages that expand into rules:

```lisp
{RuleRules
  {R "StateMachine"
     {State name_ {On event_ next_}}
     {R {Concat "State/" {ToString name_} "/" {ToString event_}}
        {Transition {CurrentState name_} event_}
        {CurrentState next_}}}}

{Rules
  {State Idle {On Start Running}}
  {State Running {On Stop Idle}}}
```

### Pattern 2: Operator Overloading

Generate rules for different types:

```lisp
{RuleRules
  {R "MakeOp"
     {OpFor op_ type_}
     {...!
       {R {Concat {ToString op_} "/" {ToString type_} "/Left"}
          {op_ {type_ x_} y_}
          {type_ {op_ x_ y_}}}
       {R {Concat {ToString op_} "/" {ToString type_} "/Right"}
          {op_ x_ {type_ y_}}
          {type_ {op_ x_ y_}}}}}}

{Rules
  {OpFor Add Vector}
  {OpFor Mul Matrix}}
```

### Pattern 3: Aspect-Oriented Rules

Add cross-cutting concerns:

```lisp
{RuleRules
  {R "Memoize"
     {Memoized {R name_ pattern_ result_}}
     {...!
       {R {Concat name_ "/Check"}
          pattern_
          {LookupCache name_ pattern_}
          100}  ; High priority
       {R name_
          pattern_
          {CacheResult name_ pattern_ result_}}}}}
```

---

## 9. Debugging RuleRules

### Technique 1: Check Macro Scopes

Use the REPL's `:macro-scopes` command to verify which modules can use which RuleRules:

```bash
syma> :macro-scopes
Macro Scopes (which modules can use which RuleRules):

  Core/Set:
    - Can use RuleRules from: Core/Rules/Sugar
  MyApp:
    - Can use RuleRules from: Core/Functions
  OtherModule:
    No RuleRules in scope  ; ← Forgot 'macro' in import!
```

### Technique 2: See the Transformation

Temporarily convert your RuleRule into a regular rule to see what it generates:

```lisp
; Instead of:
{RuleRules
  {R "Meta" pattern replacement}}

; Try:
{Rules
  {R "Debug"
     pattern
     {Debug "Would generate:" replacement}}}
```

### Technique 3: Use ToNormalString

Generate rule names that show their origin:

```lisp
{RuleRules
  {R "TracedGeneration"
     {Generate name_}
     {R {Concat "[Generated from " {ToString name_} "]"}
        pattern
        replacement}}}
```

### Technique 4: Incremental Testing

Test RuleRules incrementally:

1. Write the desired final rule manually
2. Write a RuleRule that generates it
3. Compare the generated vs manual version
4. Iterate until they match

### Technique 5: Common Scoping Mistakes

```lisp
;; ❌ Wrong: Forgot 'macro' modifier
{Import Core/Rules/Sugar as S}
{Rules {:rule "Test" x -> y}}  ; Error: :rule not recognized

;; ✅ Right: Include 'macro' to enable RuleRules
{Import Core/Rules/Sugar as S macro}
{Rules {:rule "Test" x -> y}}  ; Works!

;; ✅ Also right: Both open and macro
{Import Core/Rules/Sugar as S open macro}
```

---

## 10. Real-World Examples

### Example 1: React-Style Component System

```lisp
{RuleRules
  {R "Component"
     {Component name_ {Props props...} {Render body_}}
     {...!
       ; Render rule
       {R {Concat "Component/" {ToString name_} "/Render"}
          {name_ props...}
          body_}
       ; Default props rule
       {R {Concat "Component/" {ToString name_} "/Defaults"}
          {name_ partialProps...}
          {name_ partialProps... {DefaultPropsFor name_}}}}}}

{Rules
  {Component Button
    {Props label_ onClick_}
    {Render {Div :class "button" :onClick onClick_ label_}}}}
```

### Example 2: Type-Safe Getters/Setters

```lisp
{RuleRules
  {R "TypedField"
     {Field name_ type_ default_}
     {...!
       ; Getter
       {R {Concat "Get/" {ToString name_}}
          {Get name_ {Object fields...}}
          {FindField name_ fields... default_}}
       ; Setter with type check
       {R {Concat "Set/" {ToString name_}}
          {Set name_ value_ {Object fields...}}
          {Object {UpdateField name_ value_ fields...}}
          :guard {IsType type_ value_}}}}}}

{Rules
  {Field Age Number 0}
  {Field Name String ""}}
```

### Example 3: Pattern Matching Compiler

```lisp
{RuleRules
  {R "Match"
     {Match expr_ {Case pattern_ result_} rest...}
     {If {Matches expr_ pattern_}
         {Let pattern_ expr_ result_}
         {Match expr_ rest...}}}

  {R "Match/End"
     {Match expr_}
     {Error "No pattern matched"}}}

{Rules
  {Match {Input}
    {Case {Just x_} {Found x_}}
    {Case Nothing NotFound}}}
```

---

## Conclusion

RuleRules are Syma's secret weapon for building powerful abstractions. They let you:

- **Write less code**: Generate families of rules from patterns
- **Create DSLs**: Build domain-specific languages that compile to rules
- **Add syntax sugar**: Make your code more readable without runtime overhead
- **Stay DRY**: Define patterns once, use everywhere
- **Maintain clean boundaries**: Module scoping prevents unexpected transformations

The key insight: In Syma, transformation rules are just data, and RuleRules are transformations on that data. This recursive beauty enables unlimited meta-programming power.

The module scoping system ensures:
- **No surprises**: RuleRules only affect modules that explicitly request them with `macro`
- **Clear dependencies**: You can see which modules use which transformations
- **Easier debugging**: Use `:macro-scopes` in REPL to understand what's happening
- **Better composability**: Libraries can provide RuleRules without forcing them on users

Remember:
- RuleRules execute at compile time, not runtime
- Use `macro` import modifier to enable RuleRules from a module
- Use `Splat` (or `...!`) to generate multiple rules
- Pattern variables in rules are preserved during transformation
- Test incrementally—see what your RuleRules generate
- Debug with `:macro-scopes` command in REPL

Master RuleRules, and you master the art of writing programs that write themselves!

---

## Quick Reference

### RuleRule Structure
```lisp
{RuleRules
  {R "MetaRuleName"
     pattern_to_match_in_rules
     replacement_rules
     optional_priority
     :guard optional_guard}}
```

### Splat for Multiple Rules
```lisp
{Splat rule1 rule2 rule3}  ; Full form
{...! rule1 rule2 rule3}   ; Alias (more concise)
```

### Common Primitives in RuleRules
- `Concat` - Build rule names dynamically
- `ToString` - Convert symbols to strings
- `Add`, `Sub` - Arithmetic for counters (like Arity)
- Pattern variables - Preserved in final rules

### Execution Order
1. Parse source code
2. Apply RuleRules to transform Rules section (only in modules with `macro` imports)
3. Resulting rules used at runtime
4. RuleRules remain visible for debugging but don't execute at runtime
5. MacroScopes section tracks which modules can use which RuleRules

### Import Modifiers for RuleRules
```lisp
{Import Module as M}           ; Regular import (no RuleRules)
{Import Module as M macro}     ; Enable RuleRules from Module
{Import Module as M open}      ; Open symbols (no RuleRules)
{Import Module as M open macro} ; Both: open symbols AND enable RuleRules
```

Happy meta-programming!
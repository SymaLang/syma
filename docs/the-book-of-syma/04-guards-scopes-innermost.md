# 4. Guards, Scopes, and Innermost

*The control layer: when, where, and why a rule fires. How different evaluation orders make different universes.*

⸻

## The Three Dimensions of Control

In Syma, you control rule application through three mechanisms:

1. **Guards** — *when* a rule fires (conditional logic)
2. **Scopes** — *where* a rule fires (contextual restrictions)
3. **Innermost** — *how* a rule fires (evaluation order)

Together, they let you sculpt exactly how your symbolic universe evolves.

⸻

## Guards: Logical Filters

A **guard** is a condition that must be true for a rule to fire.

Pattern matches → Guard evaluates → If true, replacement happens.

### Basic Guards

```lisp
syma> :rule Positive {Sign n_} → "positive" when {Gt n_ 0}
Rule "Positive" added

syma> :rule Negative {Sign n_} → "negative" when {Lt n_ 0}
Rule "Negative" added

syma> :rule Zero {Sign 0} → "zero"
Rule "Zero" added

syma> {Sign 5}
→ "positive"

syma> {Sign -3}
→ "negative"

syma> {Sign 0}
→ "zero"
```

The guard `when {Gt n_ 0}` is **fully normalized** before checking.

```
{Sign 5}
→ Pattern matches: n_ = 5
→ Guard: {Gt 5 0} → True
→ Guard passed! Apply replacement
→ "positive"
```

### Guards Are Normalized

This means you can use **user-defined predicates**:

```lisp
syma> :rule IsEven/Zero {IsEven 0} → True
syma> :rule IsEven/Odd {IsEven n_} → {IsEven {Sub n_ 2}} when {Gt n_ 0}
syma> :rule IsEven/Negative {IsEven n_} → False when {Lt n_ 0}

syma> :rule ProcessEven {Process n_} → {Ok n_} when {IsEven n_}
Rule "ProcessEven" added

syma> {Process 4}
→ {Ok 4}   ; IsEven(4) → True

syma> {Process 5}
→ {Process 5}  ; IsEven(5) → False, rule doesn't fire
```

The guard `{IsEven n_}` isn't a built-in — it's **normalized through rules**!

🜛 *Guards don't just check values. They run entire computations to decide if a rule should fire.*

⸻

## The Frozen Wrapper: Preventing Normalization

The `{Frozen}` wrapper is a **general language feature** that prevents normalization (rule matching and primitive folding) of its contents anywhere in the program.

**Syntax:**
```lisp
{Frozen expr}
```

**Behavior:**
- The Frozen wrapper itself is preserved in the AST
- No rules are matched against expressions inside Frozen
- No primitive operations are folded inside Frozen
- Frozen can appear anywhere: in programs, guards, replacements, or data structures

### Use Case 1: Guards Without Normalization

When checking the **matched value as-is**, without any transformations:

```lisp
syma> :rule JSONNum {ToJSON x_} → {Str x_} when {IsNum {Frozen x_}}
Rule "JSONNum" added

syma> :rule JSONStr {ToJSON x_} → {Quote x_} when {IsStr {Frozen x_}}
Rule "JSONStr" added
```

**Why?**

Without `Frozen`, the value might be transformed by other rules **before** the type check:

```lisp
; BAD: x_ might be normalized first!
when {IsNum x_}

; GOOD: Check x_ exactly as matched
when {IsNum {Frozen x_}}
```

### Use Case 2: Code as Data

Use `{Frozen}` to prevent eval-on-read when loading code dynamically:

```lisp
syma> :rule StoreCode {Store code_} → {Stored {Frozen code_}}
Rule "StoreCode" added

syma> {Store {Add 1 2}}
→ {Stored {Frozen {Add 1 2}}}  ; Preserves structure, doesn't evaluate to 3
```

### Use Case 3: Development and Debugging

Wrap parts of your universe in `{Frozen}` to inspect them without normalization:

```lisp
syma> :rule DebugState
  {Apply action_ {Program app_ {Frozen effects_}}}
  → {Debug app_}
Rule "DebugState" added

; The effects structure won't be normalized, so you can inspect it as-is
```

**💡 Development Tip:** When debugging complex rule interactions, wrap subexpressions in `{Frozen}` to "freeze" parts of the universe and see their exact structure without normalization transforming them.

### Example: Type-Safe Operations

```lisp
syma> :rule SafeDiv {Div a_ b_} → {Div a_ b_} when {And {IsNum {Frozen a_}} {IsNum {Frozen b_}} {Neq b_ 0}}
Rule "SafeDiv" added

syma> {Div 10 2}
→ 5

syma> {Div "oops" 2}
→ {Div "oops" 2}  ; Guard fails, rule doesn't fire
```

🜛 *`Frozen` is your shield against premature normalization. It preserves the raw matched value and enables code-as-data patterns.*

⸻

## Scopes: Context-Sensitive Transformations

What if you want a rule to fire **only** when nested inside a specific context?

Use **scopes** with `:scope`:

```lisp
:rule RuleName pattern replacement :scope ParentSymbol
```

The rule only fires if the expression is **nested inside** a compound with head `ParentSymbol`.

### Example: Scoped Simplification

```lisp
syma> :rule GeneralSimplify {.. Foo ..} → {Simplified} :scope MathContext
Rule "GeneralSimplify" added

syma> {MathContext {Some {Nested Foo}}}
→ {MathContext {Some {Simplified}}}   ; Inside MathContext!

syma> {OtherContext {Nested Foo}}
→ {OtherContext {Nested Foo}}  ; Not in MathContext, rule doesn't fire
```

### How Scopes Work

The scope check looks at **all ancestors**, not just the immediate parent:

```
{MathContext          ← ParentSymbol
  {Level1
    {Level2
      {Level3 Foo}}}} ← Foo is inside MathContext (scoped)
```

### Practical Use: Error Bubbling

```lisp
syma> :rule BubbleError {.. {Err msg..} ..} → {Err msg..} :scope ErrorContext
Rule "BubbleError" added

syma> {ErrorContext {Process {Ok 1} {Err "failed"} {Ok 2}}}
→ {ErrorContext {Err "failed"}}  ; Error bubbles to top

syma> {SafeZone {Process {Err "fails silently"}}}
→ {SafeZone {Process {Err "fails silently"}}}  ; Not in ErrorContext
```

### Combining Scope and Guard

```lisp
syma> :rule ConditionalInScope {Match pattern_} → {Result} :scope Ctx :guard {Valid pattern_}
Rule "ConditionalInScope" added
```

Order doesn't matter:

```lisp
:rule Name pattern replacement :guard cond :scope Parent
:rule Name pattern replacement :scope Parent :guard cond
```

Both work!

🜛 *Scopes turn rules into context-aware surgeons. They know where to cut and where to leave alone.*

⸻

## Innermost: Bottom-Up Evaluation

By default, Syma uses **outermost-first** normalization — it matches the **biggest pattern first**, then works inward.

But sometimes you need **bottom-up evaluation** — process children before parents.

Use `:innermost`:

```lisp
:rule Name pattern replacement :innermost
```

### How Innermost Works

The runtime uses a **two-pass strategy**:

1. **Pass 1 (Innermost-first)**: Recursively process children, try innermost rules
2. **Pass 2 (Outermost-first)**: Standard top-down traversal for regular rules

### Example: Fold Then Reduce

```lisp
syma> :rule FoldScope {fold-scope result_ {Variant v_} ..} → {result_ v_}
Rule "FoldScope" added

syma> :rule FoldInner {Inner} → {Matched} :scope fold-scope :innermost
Rule "FoldInner" added

syma> {fold-scope Result {Variant x} {Inner}}
```

**Without `:innermost`:**
```
{fold-scope Result {Variant x} {Inner}}
→ {Result x}  ; FoldScope fires immediately, Inner never processes
```

**With `:innermost`:**
```
{fold-scope Result {Variant x} {Inner}}
→ {fold-scope Result {Variant x} {Matched}}  ; Inner processes first (innermost)
→ {Result {Matched}}                         ; Then FoldScope fires
```

### Innermost Order

```
Expression:
{Outer {Middle {Inner 42}}}

Pass 1 (Innermost rules only):
  - Descend to {Inner 42}
  - Try innermost rules
  - If match, transform and return
  - Back up to {Middle ...}
  - Try innermost rules
  - Continue up

Pass 2 (Regular rules):
  - Start at {Outer ...}
  - Try regular rules
  - If no match, descend
  - Standard outermost-first
```

### When to Use Innermost

Use `:innermost` when:
- **Folding scoped expressions** — process contents before consuming the scope
- **Accumulation patterns** — collect from children before parent acts
- **Semantic phases** — ensure phase 1 completes before phase 2

```lisp
; Evaluate all nested expressions FIRST
:rule SimplifyInner {Simplify expr_} → {Normalized expr_} :innermost

; Then apply outer transformations
:rule SimplifyOuter {Normalized expr_} → {Final expr_}
```

🜛 *Outermost thinks big, then refines. Innermost builds foundations, then assembles.*

⸻

## The `:with` Modifier: Context Binding

Sometimes you need to **bind variables from the scoped parent**:

```lisp
:rule Name pattern replacement :scope Parent :with contextPattern
```

The `:with` pattern matches against:
- **With `:scope`** → matches the scoped compound
- **Without `:scope`** → matches the same expression as the main pattern

### Example: Accessing Parent Context

```lisp
syma> :rule General {Some ..} → {Matched binding_} :scope Foo :with {Foo binding_ ..}
Rule "General" added

syma> {Foo "Something" {Some data}}
→ {Foo "Something" {Matched "Something"}}
```

**What happened:**

1. Main pattern `{Some ..}` matches `{Some data}`
2. Scope check: Is it inside `{Foo ...}`? Yes!
3. `:with {Foo binding_ ..}` matches the Foo compound, binds `binding_ = "Something"`
4. Replacement gets both matches merged
5. Result: `{Matched "Something"}`

### Without Scope

```lisp
syma> :rule Extract {Process ..} → {Result first_ second_} :with {Process first_ second_ ..}
Rule "Extract" added

syma> {Process "A" "B" "C"}
→ {Result "A" "B"}
```

Here, `:with` matches **the same expression** and extracts additional bindings.

🜛 *`:with` is like pattern matching with peripheral vision. The main pattern focuses; `:with` sees the surroundings.*

⸻

## Combining All Modifiers

You can use all modifiers together:

```lisp
:rule Name
  pattern
  replacement
  :guard condition
  :scope Parent
  :with contextPattern
  :innermost
  :prio 100
```

Order doesn't matter after the replacement!

### Real-World Example

```lisp
syma> :rule SafeTransform
  {Transform value_}
  {Ok {Transformed value_}}
  :guard {IsValid {Frozen value_}}
  :scope TransformContext
  :with {TransformContext config_ ..}
  :innermost
  :prio 50

Rule "SafeTransform" added
```

This rule:
- Matches `{Transform value_}` inside `TransformContext`
- Only if `value_` passes validation
- Binds `config_` from parent context
- Processes children first (innermost)
- Has medium priority (50)

⸻

## Evaluation Strategies Compared

### Outermost-First (Default)

```lisp
:rule Outer {Outer {Inner x_}} → {Result x_}
:rule Inner {Inner x_} → {Processed x_}

{Outer {Inner 42}}
→ {Result 42}  ; Outer consumes everything
```

**Best for:**
- High-level transformations
- Structural simplifications
- DSL evaluation

### Innermost-First (`:innermost`)

```lisp
:rule Outer {Outer x_} → {Result x_}
:rule Inner {Inner x_} → {Processed x_} :innermost

{Outer {Inner 42}}
→ {Outer {Processed 42}}  ; Inner fires first
→ {Result {Processed 42}} ; Then Outer
```

**Best for:**
- Bottom-up compilation
- Semantic analysis phases
- Accumulator patterns

🜛 *Outermost sees the forest. Innermost counts the trees.*

⸻

## Guard Evaluation Gotchas

### 1. Guards Are Fully Normalized

```lisp
:rule Check {Process n_} → {Ok} when {CustomPredicate n_}
```

`{CustomPredicate n_}` runs through **all rules** until it normalizes to `True` or `False`.

### 2. Infinite Loops in Guards

```lisp
; BAD! Infinite loop
:rule Bad {Foo x_} → {Result} when {Foo x_}
```

The guard calls `{Foo x_}`, which tries to apply the same rule, which evaluates the guard...

### 3. Side Effects in Guards?

**No.** Guards are pure symbolic expressions. They can't perform I/O or effects.

(Effects are symbolic data, not guard evaluations.)

⸻

## Practical Patterns

### 1. Type Dispatch

```lisp
:rule ProcessNum {Process x_} → {NumResult x_} when {IsNum {Frozen x_}}
:rule ProcessStr {Process x_} → {StrResult x_} when {IsStr {Frozen x_}}
:rule ProcessSym {Process x_} → {SymResult x_} when {IsSym {Frozen x_}}
```

### 2. Range Checks

```lisp
:rule InRange {Validate x_} → {Valid x_} when {And {Gte x_ 0} {Lte x_ 100}}
:rule OutOfRange {Validate x_} → {Invalid x_}
```

### 3. Scoped State Threading

```lisp
:rule GetFromState {Get key_} → value_ :scope StateContext :with {StateContext {.. {KV key_ value_} ..}}
```

### 4. Phase Separation

```lisp
; Phase 1: Expand macros (innermost)
:rule ExpandMacro {Macro ..} → {Expanded ..} :innermost

; Phase 2: Simplify (outermost)
:rule Simplify {Expanded ..} → {Simplified ..}
```

⸻

## Exercises

### 1. Safe Division

Write a division rule that:
- Only fires for numbers
- Checks for division by zero
- Returns an error on invalid input

```lisp
:rule SafeDiv {Div a_ b_} → {Ok {Div a_ b_}} when {And {IsNum {Frozen a_}} {IsNum {Frozen b_}} {Neq b_ 0}}
:rule DivByZero {Div a_ 0} → {Err "Division by zero"}
```

### 2. Scoped Logging

Create a logging rule that only fires inside `{LogContext ...}`:

```lisp
:rule Log {.. {Log msg_} ..} → {LogOutput msg_} :scope LogContext
```

### 3. Innermost Evaluation

Implement a simple calculator that evaluates innermost expressions first:

```lisp
:rule EvalAdd {Add a_ b_} → {Add a_ b_} :innermost when {And {IsNum {Frozen a_}} {IsNum {Frozen b_}}}
:rule EvalMul {Mul a_ b_} → {Mul a_ b_} :innermost when {And {IsNum {Frozen a_}} {IsNum {Frozen b_}}}
```

⸻

## Key Takeaways

- **Guards** control *when* rules fire (conditional logic)
- **Frozen** prevents normalization anywhere (check raw values, code-as-data, debugging)
- **Scopes** control *where* rules fire (context-sensitive)
- **Innermost** controls *how* rules fire (bottom-up evaluation)
- **`:with`** binds variables from context
- Modifiers can be combined in any order
- **Development Tip**: Use `{Frozen}` to inspect universe parts without normalization

⸻

## What's Next

You now control the three dimensions of rule application.

Next, learn how to organize rules into **modules** and transform them with **RuleRules**.

**Next:** [Chapter 5: Modules and Macros](./05-modules-and-macros.md)

Or explore applications:
- [Chapter 6: Building Worlds with Rules](./06-building-worlds.md)
- [Chapter 7: Symbolic Effects](./07-symbolic-effects.md)

⸻

🜛 *"A pattern says what. A guard says when. A scope says where. Together, they say everything."*

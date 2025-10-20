# Syma Symbolic Language Documentation

## 1. Introduction

This document describes Syma — a symbolic programming language and runtime based on S-expressions. The language uses symbolic expressions (S-expressions) as its core syntax and compiles these expressions into a JSON Abstract Syntax Tree (AST) representation. It is designed to express programs, rules, and transformations in a concise and symbolic manner.

Syma is unique in that it's both a language and a multiplatform runtime:
- **As a language**: Supports atoms, compound terms, pattern matching, modules, and rewrite rules
- **As a runtime**: Executes directly on Node.js (`syma program.syma`) and in browsers
- **Platform-agnostic**: The same code runs in browsers, Node.js, and future platforms
- **Purely functional effects**: All I/O is symbolic, handled by platform adapters

---

## 2. Atoms

Atoms are the fundamental building blocks of the language. There are three types of atoms:

- **Num**: Numeric literals, such as `42`, `3.14`
- **Str**: String literals, enclosed in double quotes, e.g., `"hello"`, `"Name"`
- **Sym**: Symbols, which are identifiers or names, e.g., `x`, `Show`, `Call`, `True`, `False`

Atoms represent constant values or symbolic identifiers in the language.

---

## 3. Compounds

A **Compound** is a flat sequence of expressions, where the first element typically serves as the head (function or operator) and the rest are arguments. Syma supports two equivalent syntaxes:

### Flat Sequence Semantics

Internally, compounds are represented with a head/args distinction for optimization (fast rule indexing by head symbol), but **semantically they are treated as flat sequences** during pattern matching. This means:

- `{Foo a b c}` is the sequence `[Foo, a, b, c]`
- The first element `Foo` is stored as the "head" for indexing
- Pattern matching treats it as a flat list, not head+args separately
- This allows VarRest patterns to match across the head boundary

### Brace Syntax (Original)

```lisp
{Head arg1 arg2 arg3}
```

Space-separated arguments within curly braces.

### Function Call Syntax (Alternative)

```lisp
Head(arg1, arg2, arg3)
```

Comma-separated arguments within parentheses, similar to traditional programming languages.

### Examples

Both syntaxes produce identical AST structures:

```lisp
; These are equivalent:
{Add 1 2}
Add(1, 2)

; Nested calls:
{Mul {Add 1 2} 3}
Mul(Add(1, 2), 3)

; Complex expressions:
{TodoState {NextId 5} {Items} {Filter "all"}}
TodoState(NextId(5), Items(), Filter("all"))
```

### Mixing Syntaxes

You can freely mix both syntaxes within the same file or even the same expression:

```lisp
R("Toggle",
  Apply(Toggle(id_), {TodoState {NextId n_} items_ filter_}),
  TodoState(NextId(n_), UpdatedItems(id_), filter_))
```

This flexibility allows you to use whichever syntax is clearer for each specific context. Function call syntax is often more readable for function applications, while brace syntax can be cleaner for data structures.

---

## 4. Pattern Matching and Variables

### Basic Variables

Syma uses pattern variables for matching and binding values in rules. There are two syntaxes available:

**Explicit syntax:**
```lisp
{Var name}   ; Pattern variable that binds to "name"
```

**Shorthand syntax:**
```lisp
name_        ; Equivalent to {Var name}
```

Variables are used in rule patterns to capture values that can be referenced in the replacement.

### Wildcard Patterns

The special variable `_` acts as a wildcard that matches any value without binding:

**Explicit syntax:**
```lisp
{Var _}      ; Matches any single expression, discards the value
```

**Shorthand syntax:**
```lisp
_            ; Equivalent to {Var _}
```

This is useful when you need to match a structure but don't care about certain values.

**Indexed Wildcards in Rules:**

When wildcards appear in both the pattern and replacement of a rule, they are matched by position:

```lisp
; First _ in pattern matches first _ in replacement, etc.
{R "Swap" {Pair a_ b_} {Pair b_ a_}}     ; Swaps the two values
{R "First" {Tuple _ a_ b_} _}          ; Returns first element, discards rest
{R "Omit" {Process _ _} {Result}}    ; Match two values but use neither
```

**Validation Rules:**
- Pattern and replacement must have the **same count** of `_` wildcards, OR
- Replacement can have **zero** wildcards (meaning "omit from replacement")
- Mismatched counts (e.g., 3 in pattern, 1 in replacement) will raise an error

### Rest Variables (Variadics)

Rest variables match zero or more elements in a sequence:

**Explicit syntax:**
```lisp
{Var xs...}  ; Rest variable using triple underscore suffix
{VarRest xs} ; Alternative explicit form
{Var ...}    ; Wildcard rest (matches any sequence without binding)
```

**Shorthand syntax:**
```lisp
xs...        ; Equivalent to {VarRest xs}
xs..         ; Also equivalent (shorter form)
...          ; Wildcard rest - equivalent to {VarRest "_"}
..           ; Also equivalent (shorter form)
```

**Note:** Both `..` and `...` suffixes work for both named and wildcard rest patterns. The output will always display using `..` (the shorter canonical form).

**VarRest Matching Across Boundaries:**

Because compounds are treated as flat sequences during pattern matching, VarRest can match zero or more elements from anywhere in the sequence, including what appears syntactically as the "head" position:

```lisp
; Match any sequence starting with zero or more elements, then Deep, then more elements
{.. Deep rest..}    ; Matches {Deep 1 2}, {Moo Deep 1}, {Moo Boo Deep}, etc.
                    ; First .. binds to prefix ([], [Moo], [Moo, Boo], etc.)
                    ; rest.. binds to suffix

; Match calls with Err anywhere in the sequence
{.. {Err err..} ..} ; Matches {Moo moo Err(4 5 6) moo}
                    ; First .. matches [Moo, moo]
                    ; {Err err..} matches Err(4 5 6) with err=[4, 5, 6]
                    ; Last .. matches [moo]

; Extract a specific error from any compound
{R "BubbleErr"
   {prefix.. {Err err..} suffix..}
   {Err err..}}      ; Extracts just the error, discarding prefix/suffix
```

When VarRest appears in the first position:
- It matches zero or more elements from the beginning of the flat sequence
- `{..}` alone matches any compound (all elements go into the wildcard)
- `{.. x}` matches compounds ending with x, with .. capturing all but the last element
- `{h.. rest..}` captures the first element(s) as h and remaining as rest

**Reconstruction After Substitution:**

When substituting in replacements, the flat sequence is reconstructed as a compound:
- The first element becomes the head
- Remaining elements become the arguments
- VarRest splices are flattened into the sequence at their position

**Indexed Rest Wildcards:**

Like single wildcards, rest wildcards (`...` or `..`) are matched by position when they appear in both pattern and replacement:

```lisp
; First .. in pattern matches first .. in replacement
{R "PassThrough" {List .. x_ ..} {List .. x_ ..}}  ; Preserve both sequences
{R "Middle" {Tuple .. x_ ..} x_}                    ; Extract middle, omit sequences
{R "Flatten" {Nested ..} {Flat ..}}                 ; Matches indexed rest patterns
```

The same validation rules apply: counts must match or replacement must have zero.

### Greedy Anchors for Rest Patterns

By default, rest variables use **non-greedy matching** - they match the shortest possible sequence. Greedy anchors allow you to match to the **last** occurrence of a symbol instead of the first.

**Syntax:**
```lisp
..symbol     ; Greedy anchor - matches to LAST occurrence of symbol
```

**How it works:**

When a greedy anchor appears after a rest variable in a pattern, the rest variable will capture everything up to the **last** occurrence of the anchor symbol:

```lisp
; Non-greedy (default behavior):
{before.. [ inner.. ] after..}
; Input: {1 [ 2 [ 3 ] 4 ] 5}
; Matches: before=[1], inner=[2, [, 3], after=[4, ], 5]
;                      ↑ matches to FIRST ]

; Greedy (with anchor):
{before.. [ inner.. ..] after..}
; Input: {1 [ 2 [ 3 ] 4 ] 5}
; Matches: before=[1], inner=[2, [, 3, ], 4], after=[5]
;                      ↑ matches to LAST ]
```

**Practical Examples:**

```lisp
; Parse nested brackets greedily
:rule ParseBrackets
  {before.. [ content.. ..] after..}
  -> {Bracket {Before before..} {Content content..} {After after..}}

; Input: {Start [ nested [ deep ] here ] End}
; Result: {Bracket
;           {Before Start}
;           {Content nested [ deep ] here}
;           {After End}}

; Extract content between first opening and last closing delimiter
:rule ExtractBalanced
  {prefix.. < body.. ..> suffix..}
  -> {Extracted body..}

; Input: {Text < outer < inner > text > End}
; Result: {Extracted outer < inner > text}

; Match to last occurrence of a specific marker
:rule SplitAtLast
  {head.. MARKER tail.. ..MARKER rest..}
  -> {Split {Head head..} {Middle tail..} {Tail rest..}}

; Input: {A MARKER B MARKER C}
; Result: {Split {Head A} {Middle MARKER B} {Tail C}}
```

**Key Points:**

- Greedy anchors only affect the rest variable **immediately before** them
- They work by finding all occurrences of the target symbol and trying matches from last to first
- The anchor symbol itself is consumed (not included in the matched sequence)
- Multiple greedy anchors can appear in the same pattern, each operating independently
- Greedy anchors are particularly useful for parsing nested structures like brackets, quotes, or delimiters

**Common Use Cases:**

- **Nested bracket parsing**: Match content between outermost delimiters
- **Balanced delimiter extraction**: Extract text between first open and last close
- **Reverse prefix matching**: Find content before the last occurrence of a marker
- **Greedy splitting**: Split at the rightmost occurrence of a separator

**Exception for RuleRules:**

In meta-rules (RuleRules), wildcards are treated as pattern constructs and are **not** indexed or validated. This allows RuleRules to freely manipulate pattern variables:

```lisp
{RuleRules
  {R "Transform"
    {SomePattern _ _}           ; These wildcards are preserved as-is
    {AnotherPattern _}}}        ; No count validation in RuleRules context
```

### Examples

Pattern matching with mixed syntax:
```lisp
;; These are equivalent:
{R "Rule1"
   {Apply {Toggle {Var id}}
      {TodoState {NextId {Var n}} {Items {Var before...} {Item {Id {Var id}}} {Var after...}}}}
   ...}

{R "Rule1"
   {Apply {Toggle id_}
      {TodoState {NextId n_} {Items before.. {Item {Id id_}} after..}}}
   ...}

;; Mix and match as needed for clarity:
{Items first_ rest..}            ; First item and rest of list
{Filter _}                        ; Don't care about filter value
{State _ {Items ..} active_}     ; Wildcard, any items, capture active

;; Using indexed wildcards:
{Pair _ _}                        ; Match any pair (no binding)
{Triple _ x_ _}                   ; Match triple, extract middle value
{Process .. result_}              ; Match sequence ending with result

;; VarRest patterns matching across the entire flat sequence:
{.. Deep ..}                      ; Match any compound containing Deep anywhere
{prefix.. {Err e..} suffix..}    ; Match compound with Err somewhere in the middle
{first.. last_}                   ; Match compound, capturing all but last element

;; Greedy anchors for matching to last occurrence:
{before.. [ content.. ..] after..}  ; Match to LAST ] instead of first
{start.. < body.. ..> end..}        ; Extract content between first < and last >
{prefix.. SEP rest.. ..SEP tail..}  ; Split at last occurrence of SEP

;; Practical examples using flat sequence semantics:
{R "BubbleError"
   {.. {Err msg..} ..}            ; Match any compound containing an error
   {Err msg..}}                   ; Return just the error

{R "ExtractMiddle"
   {.. middle_ ..}                ; Match compound with at least one element
   middle_}                       ; Return the middle element (first match)

{R "PrependOp"
   {args..}                       ; Match any compound
   {NewOp args..}}                ; Prepend NewOp to the flat sequence
```

---

## 5. Module System

### Module Structure

Syma supports a module system for organizing code into reusable, composable units. Modules can be written in either syntax:

**Brace Syntax:**
```lisp
{Module Module/Name
  {Export Symbol1 Symbol2 ...}           ; What this module provides
  {Import Other/Module as Alias open macro}  ; Dependencies
  {Defs {Name value} ...}                ; Constants/definitions
  {Program ...}                           ; Main program (entry modules only)
  {Rules ...}                             ; Transformation rules
  {RuleRules ...}}                        ; Meta-rules (optional)
```

**Function Call Syntax:**
```lisp
Module(Module/Name,
  Export(Symbol1, Symbol2, ...),         ; What this module provides
  Import(Other/Module, as, Alias),       ; Dependencies (note: 'as' is literal)
  Import(Core/KV, as, KV, open, macro),         ; Open import
  Defs(Name(value), ...),                ; Constants/definitions
  Program(...),                          ; Main program (entry modules only)
  Rules(...),                            ; Transformation rules
  RuleRules(...))                        ; Meta-rules (optional)
```

### Imports

Modules can import symbols from other modules using either syntax:

```lisp
;; Brace syntax
{Import Core/KV as KV}               ; Qualified: use as KV/Get, KV/Set
{Import Core/KV as KV open}          ; Open: use as Get, Set
{Import Core/Rules/Sugar as CRS macro}  ; Import RuleRules: apply to this module's rules
{Import Core/Set as CS open macro}   ; Both: open symbols AND apply RuleRules

;; Function syntax
Import(Core/KV, as, KV)              ; Qualified: use as KV/Get, KV/Set
Import(Core/KV, as, KV, open)        ; Open: use as Get, Set
Import(Core/Rules/Sugar, as, CRS, macro)  ; Import RuleRules
Import(Core/Set, as, CS, open, macro)     ; Both modifiers
```

#### Import Modifiers

- **`open`**: Makes exported symbols available without qualification
- **`macro`**: Applies the imported module's RuleRules to this module's rules
- Both can be used together: `{Import Module as M open macro}`

### Symbol Qualification

After compilation, all symbols are qualified with their module namespace:
- Local symbols: `Module/Name`
- Imported symbols: resolved to their source module
- Built-ins: remain unqualified (`Add`, `True`, `If`, etc.)
- HTML tags: remain unqualified (`Div`, `Button`, etc.)

### Module Example

```lisp
{Module App/Counter
  {Import Core/KV as KV open}

  {Export InitialState Inc Dec}

  {Defs
    {InitialState
      {CounterState {KV Count 0}}}}

  {Rules
    {R "Inc"
       {Apply Inc st_}
       {Set CounterState Count {Add {Get CounterState Count st_} 1} st_}}}}
```

---

## 6. Universe Structure

When modules are bundled, they produce a **Universe** structure:

```lisp
{Universe
  {Program …}          ; From entry module
  {Rules …}            ; Combined from all modules (tagged with source)
  {RuleRules …}        ; Combined meta-rules (tagged with source)
  {MacroScopes …}}    ; Tracks which modules can use which RuleRules
```

- **Program**: Main program from the entry module
- **Rules**: All rules from all modules, wrapped in `TaggedRule` with module source
- **RuleRules**: Combined meta-rules, wrapped in `TaggedRuleRule` with module source
- **MacroScopes**: Maps each module to the RuleRules it can use (based on `macro` imports)

Example MacroScopes structure:
```lisp
{MacroScopes
  {Module "Core/Set"
    {RuleRulesFrom "Core/Rules/Sugar"}}  ; Core/Set can use Sugar RuleRules
  {Module "App/Main"
    {RuleRulesFrom}}}                     ; App/Main uses no RuleRules
```

---

## 7. Rules and Rewriting

### Basic Rule Structure

Rules define pattern-based transformations:

```lisp
{R "Name" pattern replacement guard? priority?}
R("Name", pattern, replacement, guard?, priority?)
{R "Name" pattern replacement :guard guard :prio priority :scope Parent :with contextPattern :innermost}
```

- `"Name"`: A string identifier for the rule
- `pattern`: An expression pattern to match
- `replacement`: The expression that replaces matches
- `guard`: Optional condition that must evaluate to `True` (4th argument, or `:guard` syntax)
- `priority`: Optional numeric priority (higher values apply first, or `:prio` syntax)
  - If 4th argument is a number, it's treated as priority
  - If 4th argument is an expression and 5th is a number, they're guard and priority respectively
- `:scope Parent`: Optional scope restriction (see below)
- `:with contextPattern`: Optional context binding (see below)
- `:innermost`: Optional flag for bottom-up evaluation (see below)

**Examples:**
```lisp
; Priority only (4th argument is a number)
{R "HighPriority" pattern replacement 100}
R("HighPriority", pattern, replacement, 100)

; Guard only (4th argument is an expression)
{R "IsPositive" {Check n_} "positive" {Gt n_ 0}}
R("IsPositive", Check(n_), "positive", Gt(n_, 0))

; Both guard and priority
{R "GuardedRule" pattern replacement {IsNum n_} 50}
R("GuardedRule", pattern, replacement, IsNum(n_), 50)
```

### Guard Evaluation and the Frozen Wrapper

Guards are fully normalized with all rules, which allows using user-defined predicates. However, this can sometimes cause issues when you want to check the matched value as-is, without normalization.

**The Frozen Wrapper:**
The `Frozen` wrapper prevents normalization of its contents during guard evaluation:

```lisp
; Check if x_ is a number AFTER normalization (might transform first)
{R "Rule1" {Process x_} result {IsNum x_}}

; Check if x_ is a number AS-IS, without any transformation
{R "Rule2" {Process x_} result {IsNum {Frozen x_}}}
```

**When to use Frozen:**
- Use `{Frozen x_}` when you want to check the exact matched value without transformation
- Useful for type checking before any rules transform the value
- Essential when the matched value might be transformed by other rules before the check

**Examples with Frozen:**
```lisp
; These rules check the matched value without transformation
{R "JSONNum" {ToJSON x_} {Str x_} {IsNum {Frozen x_}}}
{R "JSONStr" {ToJSON x_} {Quote x_} {IsStr {Frozen x_}}}
{R "EmptyCheck" {Process x_} "empty" {Eq Empty {Frozen x_}}}
{R "BoolCheck" {Process x_} "true" {Eq True {Frozen x_}}}
```

**User-defined predicates still work:**
```lisp
; IsDigit is defined as a rule, needs normalization to work
{R "DigitCheck" {Parse c_} digit {IsDigit c_}}  ; No Frozen needed

; But for primitives checking the actual value:
{R "NumCheck" {Parse n_} number {IsNum {Frozen n_}}}
```

**Important Notes:**
- Guards are fully normalized with all rules (allows user-defined predicates)
- Use `Frozen` wrapper to prevent normalization of specific values in guards

### Scope Restrictions with `:scope`

Rules can be restricted to only match expressions nested within specific parent compounds using the `:scope` modifier:

```lisp
{R "Name" pattern replacement :scope ParentSymbol}
```

**How it works:**
- Without `:scope`, a rule can match at any level in the expression tree
- With `:scope Foo`, the rule only matches if the expression is nested inside a compound with head `Foo`
- The scope check looks at all ancestors, not just the immediate parent

**Examples:**

```lisp
; Without scope - matches everywhere
:rule General {..} -> oops

; Expression: {Foo {Some moo}}
; Result: oops (matches the top-level Foo)

; With scope - only matches inside Foo
:rule Specific {Some ..} -> {Match}
:rule General {..} -> oops :scope Foo

; Expression: {Foo {Some moo}}
; Step 1: {Some moo} matches Specific -> {Match}
; Step 2: {Match} is inside Foo, so General can match -> oops
; Result: {Foo oops}
```

**Common use cases:**
- Preventing overly general rules from matching at the wrong level
- Creating context-sensitive transformations
- Bubbling errors or special values up from nested expressions

```lisp
; Bubble errors to top level, but only within Error-handling contexts
:rule BubbleError {.. {Err msg..} ..} -> {Err msg..} :scope ErrorContext

; Type-specific operations only within type constructors
:rule Normalize {..} -> normalized :scope TypeDef
```

**Combining with other modifiers:**

```lisp
; All modifiers together
{R "Name" pattern replacement :guard condition :scope Parent :prio 100}
```

The order of `:guard`, `:scope`, and `:prio` doesn't matter - they can appear in any order after the replacement expression.

### Context Binding with `:with`

The `:with` modifier allows rules to bind additional variables from a related context:

```lisp
{R "Name" pattern replacement :with withPattern}
{R "Name" pattern replacement :scope Parent :with withPattern}
```

**How it works:**
- **With `:scope`**: The `:with` pattern matches against the scoped compound
- **Without `:scope`**: The `:with` pattern matches against the same expression as the main pattern
- Bindings from both patterns are merged and available in the replacement

**Examples:**

```lisp
; Bind context from scoped parent
:rule General {Some ..} -> {Matched bind_} :scope Foo :with {Foo bind_ ..}

; Expression: {Foo "Something" {Some moo}}
; Step 1: {Some moo} matches main pattern (inside Foo)
; Step 2: :with {Foo bind_ ..} matches Foo compound, binds bind_ = "Something"
; Result: {Foo "Something" {Matched "Something"}}
```

```lisp
; Bind from same expression when no :scope
:rule Extract {Process ..} -> {Result first_ second_} :with {Process first_ second_ ..}

; Expression: {Process "A" "B" "C"}
; Main pattern matches Process with any args
; :with pattern binds first_ = "A", second_ = "B"
; Result: {Result "A" "B"}
```

**User's original example:**

```lisp
{Foo "Something" {Some moo}}

:rule Specific {Some ..} -> {Match}
:rule General {..} -> {Splat oops bind_} :scope Foo :with {Foo bind_ ..}

; When {Some moo} matches:
; - Main pattern {..} matches {Some moo}
; - :scope Foo ensures we're inside Foo
; - :with {Foo bind_ ..} binds bind_ = "Something" from the Foo compound
; - Result includes both oops and the bound value
```

**Common use cases:**
- Accessing parent context while transforming nested elements
- Extracting multiple values from the same expression
- Context-aware transformations that need information from the scoping compound

**All modifiers together:**

```lisp
{R "Name" pattern replacement :guard condition :scope Parent :with contextPattern :prio 100}
```

The order of `:guard`, `:scope`, `:with`, and `:prio` doesn't matter - they can appear in any order after the replacement expression.

### Innermost-First Evaluation with `:innermost`

By default, Syma uses **outermost-first** evaluation, where rules try to match parent nodes before their children. The `:innermost` flag reverses this for specific rules, enabling **bottom-up** evaluation.

```lisp
{R "Name" pattern replacement :innermost}
{R "Name" pattern replacement :scope Parent :innermost}
```

**How it works:**

The runtime uses a **two-pass approach** in each normalization step:

1. **Pass 1 (Innermost-first)**: Recursively traverse the tree bottom-up, trying only rules marked with `:innermost`
   - Process all children first (recursively)
   - Then try to match innermost rules at the current node
   - Return immediately if a match is found

2. **Pass 2 (Outermost-first)**: Standard top-down traversal for all non-innermost rules
   - Try to match rules at the current node first
   - Then recursively process children
   - Uses the normal outermost-first strategy

**When to use `:innermost`:**

Use `:innermost` when you need children to be fully normalized before a parent rule can match. This is particularly useful for:

- **Scoped folding operations** - process scope contents first, then fold the scope
- **Accumulation patterns** - collect values from children before processing parent
- **Context-sensitive transformations** - normalize nested values before applying parent context

**Example:**

```lisp
; Process {LiftedOneOf} nodes inside fold-oneof scope first
:rule OneOf/Fold/A {LiftedOneOf ..} -> c_
  :scope fold-oneof
  :with {fold-oneof .. {Variant c_} ..}
  :innermost

:rule OneOf/Fold/B {OneOfResult ..} -> c_
  :scope fold-oneof
  :with {fold-oneof .. {Variant c_} ..}
  :innermost

; After innermost rules finish, fold the scope itself
:rule OneOf/Fold {fold-oneof R {Variant c_} ..} -> {R ..}
```

**Execution order:**

```lisp
; Expression: {fold-oneof R {Variant "x"} {LiftedOneOf a b}}

; Pass 1: Innermost rules only
; Step 1: Process {LiftedOneOf a b} (innermost rule matches)
; → Result: {fold-oneof R {Variant "x"} "x"}

; Pass 2: Regular rules
; Step 2: Process {fold-oneof R {Variant "x"} "x"} (fold rule matches)
; → Result: {R "x"}
```

Without `:innermost`, the fold rule would match first and consume the scope before the innermost rules could process its children.

**Combining with other modifiers:**

```lisp
{R "Name" pattern replacement :guard condition :scope Parent :with contextPattern :innermost :prio 100}
```

The `:innermost` flag can be combined with `:scope`, `:with`, `:guard`, and `:prio` in any order.

### Pattern Matching

Patterns can include:
- Literal atoms that must match exactly
- `{Var name}` to capture and bind values
- `{Var _}` as wildcards
- `{Var name...}` for rest patterns
- Nested structures combining all of the above

### Normalization Strategy

The runtime uses a **two-pass strategy** for each normalization step:

1. **Innermost Pass**: Bottom-up traversal for rules marked with `:innermost`
   - Process children recursively first
   - Try to match innermost rules at each node
   - Return immediately if any innermost rule matches

2. **Outermost Pass**: Top-down traversal for regular rules
   - Try to match rules at the current expression level first
   - If no match, recursively try children (outermost-first)
   - Apply the highest-priority matching rule when found

3. **Primitive Folding**: After each rule application, fold any primitive operations

4. **Fixed Point**: Repeat all passes until neither rules nor primitives can make changes

**Important Details:**
- **Innermost rules process children before parents** - enables bottom-up transformations
- **Outermost-first is critical for determinism** - regular rules at higher levels take precedence
- **Primitives fold after each step** - expressions like `Eq(6, -1)` become `False` immediately
- **The loop continues if either rules OR primitives change the expression** - this ensures complete normalization
- **Guards are fully normalized** - allowing rules like `R("name", pattern, replacement, :guard IsNumericOrSpaceOrLetterX(x_))` to work correctly

**Example Normalization Sequence:**
```lisp
If(Eq(IndexOf("abc", "z"), -1), "not found", "found")
→ If(Eq(-1, -1), "not found", "found")     ; IndexOf primitive folded
→ If(True, "not found", "found")           ; Eq primitive folded
→ "not found"                              ; If/True rule applied
```

### Built-in Primitives

The runtime provides a comprehensive standard library of primitive operations that are folded during normalization:

**Arithmetic Operations:**
- `{Add n1 n2}` → sum of two numbers
- `{Sub n1 n2}` → difference of two numbers
- `{Mul n1 n2}` → product of two numbers
- `{Div n1 n2}` → quotient (remains symbolic for division by zero)
- `{Mod n1 n2}` → remainder (modulo)
- `{Pow n1 n2}` → n1 raised to power n2
- `{Sqrt n}` → square root (remains symbolic for negative numbers)
- `{Abs n}` → absolute value
- `{Min n1 n2 ...}` → minimum of all arguments
- `{Max n1 n2 ...}` → maximum of all arguments
- `{Floor n}` → round down to integer
- `{Ceil n}` → round up to integer
- `{Round n}` → round to nearest integer

**Bitwise Operations:**
- `{BitAnd n1 n2}` (alias `&`) → bitwise AND of two 32-bit integers
- `{BitOr n1 n2}` (alias `|`) → bitwise OR of two 32-bit integers
- `{BitXor n1 n2}` → bitwise XOR of two 32-bit integers
- `{BitNot n}` (alias `~`) → bitwise NOT of 32-bit integer
- `{BitShiftLeft n shift}` (alias `<<`) → left shift by specified bits
- `{BitShiftRight n shift}` (alias `>>`) → arithmetic right shift (sign-preserving)
- `{BitShiftRightUnsigned n shift}` (alias `>>>`) → logical right shift (zero-fill)

**String Operations:**
- `{Concat s1 s2 ...}` → concatenates strings/numbers into a string
- `{ToString value}` → converts value to string representation immediately
- `{ToNormalString value}` → waits for full normalization before stringifying (see note below)
- `{ToUpper str}` → converts to uppercase
- `{ToLower str}` → converts to lowercase
- `{Trim str}` → removes leading/trailing whitespace
- `{StrLen str}` → length of string
- `{Substring str start end?}` → extract substring
- `{IndexOf str search}` → find position of substring (-1 if not found)
- `{Replace str search replacement}` → replace first occurrence

**Note on ToString vs ToNormalString:**
- `ToString` immediately converts its argument to a string representation. For example, `ToString(Add(2, 3))` produces `"{Add 2 3}"` showing the expression structure.
- `ToNormalString` defers stringification until its argument is fully normalized. It returns `null` (remains unevaluated) if the argument contains rule-based constructs like `If`, `Apply`, etc. For example, `ToNormalString(If(True, "yes", "no"))` will wait until `If` reduces to `"yes"` before stringifying.

**Comparison Operations:**
- `{Eq a b}` → equality check, returns `True` or `False`
- `{Neq a b}` → inequality check
- `{Lt n1 n2}` → less than (numbers)
- `{Gt n1 n2}` → greater than (numbers)
- `{Lte n1 n2}` → less than or equal
- `{Gte n1 n2}` → greater than or equal

**Boolean Operations:**
- `{And b1 b2}` → logical AND of `True`/`False` symbols
- `{Or b1 b2}` → logical OR
- `{Not b}` → logical NOT

**Type Checking:**
- `{IsNum value}` → returns `True` or `False`
- `{IsStr value}` → checks if string
- `{IsSym value}` → checks if symbol
- `{IsTrue value}` → checks if symbol `True`
- `{IsFalse value}` → checks if symbol `False`

**Utilities:**
- `{FreshId}` → generates a unique identifier string
- `{Random}` → random number between 0 and 1
- `{Random min max}` → random number in range
- `{ParseNum str}` → parse string to number (remains symbolic if invalid)
- `{Debug label? value}` → logs to console and returns value (for debugging)
- `{Splat arg1 arg2 ...}` → creates a splice that expands in context (see Meta-Rules)
- `{...! arg1 arg2 ...}` → alias for Splat, commonly used in RuleRules
- `{Serialize expr}` → converts any Syma expression to JSON string for storage/transmission
- `{Deserialize str}` → parses JSON string back to original Syma expression

**Projection Operations:**
- `{ProjectToString ui}` → renders UI node to HTML string (state defaults to Empty)
- `{ProjectToString ui state}` → renders UI node to HTML string with given state context

### Serialization and Deserialization

The `Serialize` and `Deserialize` primitives enable powerful metaprogramming patterns:

**Serialize** converts any Syma expression into a JSON string that preserves the complete AST structure:
```lisp
{Serialize {Add 1 2}}  → "{\"k\":\"Call\",\"h\":{\"k\":\"Sym\",\"v\":\"Add\"},\"a\":[{\"k\":\"Num\",\"v\":1},{\"k\":\"Num\",\"v\":2}]}"
{Serialize CounterState} → serialized state string
```

**Deserialize** reconstructs the original expression from a serialized string:
```lisp
{Deserialize "{\"k\":\"Sym\",\"v\":\"Hello\"}"} → Hello
{Deserialize storedExpr} → original expression
```

**Use Cases:**
- **Persistence**: Store expressions in localStorage or databases
- **Network transmission**: Send code over WebSocket or HTTP
- **Code templates**: Create and instantiate expression templates
- **Metaprogramming**: Generate, transform, and evaluate code dynamically
- **Undo/Redo**: Serialize state history for time-travel debugging
- **Cross-platform sharing**: Exchange expressions between browser and Node.js

**Example - Dynamic Code Evaluation:**
```lisp
{R "EvalStored"
  {Eval key_}
  {Normalize {Deserialize {StorageGet key_}}}}
```

### ProjectToString for Server-Side Rendering

The `ProjectToString` primitive enables rendering UI nodes to HTML strings, making it possible to implement Server-Side Rendering (SSR), Static Site Generation (SSG), and other HTML generation use cases directly within Syma:

```lisp
; Simple static HTML generation (no state needed)
{ProjectToString
  {Div :class "card"
    {H1 "Welcome"}
    {P "This is static content"}}}
; → "<div class=\"card\"><h1>Welcome</h1><p>This is static content</p></div>"

; Dynamic content with state
{ProjectToString
  {Div :class "profile"
    {H2 "Hello, " {Show userName}}
    {P "Email: " {Show userEmail}}}
  {State
    {KV userName "Alice"}
    {KV userEmail "alice@example.com"}}}
; → "<div class=\"profile\"><h2>Hello, Alice</h2><p>Email: alice@example.com</p></div>"
```

**Key Features:**
- **Omits event handlers**: `onClick`, `onInput`, etc. are removed (client-side only)
- **Omits bindings**: `bind-value`, `bind-checked`, etc. are removed (client-side only)
- **Supports projection**: Handles `Project[...]` and `Show[...]` nodes with state context
- **Escapes HTML**: Automatically escapes special characters for security
- **Optional state**: State parameter can be omitted for pure static HTML

**Use Cases:**
- **Static Site Generation**: Generate complete HTML pages at build time
- **Server-Side Rendering**: Render pages on the server for SEO and initial load performance
- **Email Templates**: Generate HTML email bodies
- **Documentation**: Generate HTML documentation from symbolic UI definitions
- **Pre-rendering**: Create page shells for faster initial loads

**Example - Blog Post Generator:**
```lisp
{R "GeneratePostHTML"
  {GeneratePost post_}
  {ProjectToString
    {Article :class "blog-post"
      {Header
        {H1 {Show title}}
        {Time :datetime {Show date} {Show formattedDate}}}
      {Div :class "content" {Show content}}}
    {State
      {KV title {Get Post title post_}}
      {KV date {Get Post date post_}}
      {KV formattedDate {FormatDate {Get Post date post_}}}
      {KV content {Get Post content post_}}}}}
```

### Note on Lists

Lists in Syma are not a primitive type. Instead, they are represented as sequences of arguments within calls. List operations like counting, filtering, and mapping are handled through symbolic rules and pattern matching with rest variables `{Var rest...}`. This keeps the core language minimal while providing full list manipulation power through the rewrite system.

---

## 8. UI DSL and Rendering

### UI Elements

Syma includes a DSL for defining user interfaces:

```lisp
{Div :class "card"
  {H1 "Title"}
  {Button :onClick ActionName "Click me"}}
```

### Tag Properties

Properties are specified using `:key value` syntax:
- `:class "className"` for CSS classes
- `:onClick ActionName` for event handlers
- Other HTML attributes as needed

### Dynamic Content

Use `{Show expression}` to display computed values:

```lisp
{Span "Count: " {Show CountValue}}
```

### Projection

The `{Project expression}` form evaluates an expression in the current state context and renders the result as UI.

---

## 9. Projection Operator `/@`

The projection operator `/@` enables context-aware evaluation:

```lisp
{/@ expression context}
```

Common usage in rules:
```lisp
{R "ShowCount"
  {/@ {Show Count} {App {State ...} {Var _}}}
  {Str "42"}}
```

This allows rules to match projections and compute values based on the current application state.

---

## 10. Event System

Events are handled through the `Apply` pattern:

```lisp
{Apply action state} → new-state
```

The runtime dispatches events by:
1. Wrapping the action: `{Apply action currentProgram}`
2. Normalizing with rules
3. Updating the UI with the new state

Lifting rules propagate `Apply` through state containers:
```lisp
{R "LiftApplyThroughApp"
  {Apply {Var act} {App {Var st} {Var ui}}}
  {App {Apply {Var act} {Var st}} {Var ui}}}
```

---

## 11. Symbolic Effects System

Syma supports a purely symbolic effects system where all I/O operations are represented as terms in the AST. The host runtime acts as a minimal bridge between symbolic effect requests and actual I/O operations.

### Effects Structure

Programs can include an Effects node alongside the main application:

```lisp
{Program
  {App ...}           ; Main application
  {Effects            ; Effects lane
    {Pending ...}     ; Outbound effect requests
    {Inbox ...}}}     ; Inbound effect responses
```

### Effect Flow

1. **Request**: Actions enqueue effect terms in `Pending`
2. **Processing**: Host runtime performs actual I/O
3. **Response**: Results are added to `Inbox`
4. **Consumption**: Rules process inbox messages and update state

### Example: Timer Effect

```lisp
;; Enqueue a timer effect
{R "StartTimer"
   {Apply StartTimer {Program {Var app} {Effects {Pending {Var p...}} {Var inbox}}}}
   {Program
     {Var app}
     {Effects
       {Pending {Var p...} {Timer {FreshId} {Delay 2000}}}
       {Var inbox}}}
   10}  ; High priority to match before lifters

;; Process timer completion
{R "TimerComplete"
   {Program
     {App {Var state} {Var ui}}
     {Effects {Var pending} {Inbox {TimerComplete {Var id} {Var _}} {Var rest...}}}}
   {Program
     {Apply DoSomething {App {Var state} {Var ui}}}
     {Effects {Var pending} {Inbox {Var rest...}}}}}
```

### Supported Effect Types

#### Time & Scheduling

- **Timer**: `{Timer id {Delay ms}}` → `{TimerComplete id {Now timestamp}}`
- **AnimationFrame**: `{AnimationFrame id}` → `{AnimationFrameComplete id {Now timestamp}}`

#### Networking

- **HttpReq**: `{HttpReq id {Method "POST"} {Url "/api"} {Body data} {Headers ...}}` → `{HttpRes id {Status 200} {Json result} {Headers ...}}`
- **WebSocket Connect**: `{WsConnect id {Url "wss://..."}}` → `{WsConnectComplete id Opened}`
- **WebSocket Send**: `{WsSend id {Text "message"}}` → `{WsSendComplete id Ack}`
- **WebSocket Receive**: Appears in inbox as `{WsRecv id {Text "message"}}`
- **WebSocket Close**: `{WsClose id {Code 1000} {Reason ""}}` → `{WsCloseComplete id Closed}`

#### Storage & Persistence

- **Storage Get**: `{StorageGet id {Store Local|Session} {Key "key"}}` → `{StorageGetComplete id {Found value}|Missing}`
- **Storage Set**: `{StorageSet id {Store Local|Session} {Key "key"} {Value data}}` → `{StorageSetComplete id Ok}`
- **Storage Delete**: `{StorageDel id {Store Local|Session} {Key "key"}}` → `{StorageDelComplete id Ok}`

#### Clipboard

- **Clipboard Write**: `{ClipboardWrite id {Text "content"}}` → `{ClipboardWriteComplete id Ok|Denied}`
- **Clipboard Read**: `{ClipboardRead id}` → `{ClipboardReadComplete id {Text "content"}|Denied}`

#### Navigation

- **Navigate**: `{Navigate id {Url "/path"} {Replace True|False}}` → `{NavigateComplete id Ok}`
- **Read Location**: `{ReadLocation id}` → `{ReadLocationComplete id {Location {Path "/"} {Query "?q=1"} {Hash "#top"}}}`

#### Console I/O

- **Print**: `{Print id {Message "text"}}` → `{PrintComplete id Success}`
- **ReadLine**: `{ReadLine id}` → `{ReadLineComplete id {Text "input"}}`
- **GetChar**: `{GetChar id}` → `{GetCharComplete id {Char "a"}}`

#### Utilities

- **Random**: `{RandRequest id {Min 0} {Max 100}}` → `{RandResponse id value}`

### Effect Examples

#### Persistent State with LocalStorage
```lisp
;; Save user preferences
{R "SavePrefs"
   {Apply {SavePrefs theme_ lang_} prog_}
   {Program prog_
     {Effects
       {Pending {StorageSet {FreshId} {Store Local} {Key "prefs"}
                          {Value {Obj {Theme theme_} {Lang lang_}}}}}
       {Inbox}}}}

;; Load preferences on startup
{R "LoadPrefs"
   {Apply LoadPrefs prog_}
   {Program prog_
     {Effects
       {Pending {StorageGet {FreshId} {Store Local} {Key "prefs"}}}
       {Inbox}}}}
```

#### WebSocket Chat Application
```lisp
;; Connect and handle messages
{R "ConnectChat"
   {Apply {Connect url_} prog_}
   {Program prog_
     {Effects
       {Pending {WsConnect {FreshId} {Url url_}}}
       {Inbox}}}}

{R "HandleWsMessage"
   {Program app_ {Effects pending_ {Inbox {WsRecv id_ {Text msg_}} rest...}}}
   {Program
     {Apply {NewMessage msg_} app_}
     {Effects pending_ {Inbox rest...}}}}
```

#### Smooth Animation Loop
```lisp
;; Request next frame for 60fps updates
{R "AnimLoop"
   {Apply Animate {Program {App state_ ui_} effects_}}
   {Program {App {Apply UpdateAnimation state_} ui_}
     {Effects
       {Pending {AnimationFrame {FreshId}}}
       {Inbox}}}}

{R "AnimFrameReady"
   {Program app_ {Effects pending_ {Inbox {AnimationFrameComplete id_ {Now ts_}} rest...}}}
   {Program
     {Apply Animate app_}  ; Loop continues
     {Effects pending_ {Inbox rest...}}}}
```

### Benefits

- **Pure**: All effects are symbolic terms, no imperative code
- **Inspectable**: Effect history is visible in the AST
- **Testable**: Mock effects by directly manipulating inbox
- **Composable**: Rules can transform, retry, or cancel effects
- **Complete**: Comprehensive coverage of browser APIs and I/O operations

---

## 12. Meta-Rules (RuleRules)

RuleRules are meta-rules that transform the Rules section before runtime. They enable powerful meta-programming by treating rules as data that can be pattern-matched and transformed.

### Basic RuleRule Structure

```lisp
{RuleRules
  {R "MetaRuleName"
    pattern_in_rules_section     ; What to match in Rules
    replacement_rules}}           ; What to replace it with
```

### Module-Scoped RuleRules

RuleRules are scoped to modules. They only transform rules in modules that explicitly import them with the `macro` modifier:

```lisp
;; Module Core/Rules/Sugar defines RuleRules
{Module Core/Rules/Sugar
  {Export}
  {RuleRules
    {R "Sugar/Rule"
       {:rule name_ pattern_ -> replacement_}
       {R name_ pattern_ replacement_}}}}

;; Module Core/Set imports with 'macro' - gets sugar transformation
{Module Core/Set
  {Import Core/Rules/Sugar as CRS macro}  ; 'macro' applies RuleRules
  {Rules
    {:rule "MyRule" pattern -> result}}}  ; This gets transformed

;; Module App/Main doesn't import with 'macro' - no transformation
{Module App/Main
  {Import Core/Set as CS}  ; No 'macro', no RuleRule application
  {Rules
    {:rule "Test" x -> y}}}  ; Error! :rule syntax not available
```

This scoping prevents RuleRules from leaking across module boundaries, avoiding unexpected transformations and bugs.

### Global Syntax (Core/Syntax/Global)

**Special Exception:** The module `Core/Syntax/Global` is automatically included in every compilation and its RuleRules apply globally to ALL modules:

```lisp
;; src/stdlib/core-syntax-global.syma
{Module Core/Syntax/Global
  {Export}
  {RuleRules
    ; This :rule syntax is available EVERYWHERE
    {R "Sugar/Rule"
       {:rule name_ pattern_ -> replacement_}
       {R name_ pattern_ replacement_}}}}

;; Any module can now use :rule syntax without importing anything
{Module MyApp
  {Rules
    {:rule "Test" x -> y}}}  ; Works! Global syntax is always available
```

This provides fundamental syntactic sugar that should be universally available, like the `:rule` shorthand. The compiler:
1. Automatically loads `Core/Syntax/Global` if it exists in stdlib
2. Adds a special `"*"` scope in MacroScopes that applies to all modules
3. These global RuleRules transform rules in every module

Use global syntax sparingly—only for truly universal constructs that every module should have access to.

### The Power of Splat in RuleRules

The `Splat` primitive (alias `...!`) allows generating multiple rules from a single meta-rule:

```lisp
{RuleRules
  {R "GenerateMultiple"
    {Generate name_}
    {Splat                       ; or use ...!
      {R {Concat name_ "/A"} patternA resultA}
      {R {Concat name_ "/B"} patternB resultB}}}}

{Rules
  {Generate "Test"}}  ; Expands to two rules: Test/A and Test/B
```

### Example: Function Definition System

A practical example showing how RuleRules create function definition syntax:

```lisp
{Module Core/Functions
  {Export Def}
  {RuleRules
    {R "DefineFunction"
      {Def fname_ {Args pats...} body_}
      {R {Concat "fun/" {ToString fname_} "/" {Arity pats...}}
         {Call fname_ pats...}
         body_}}}}

{Module MyApp
  {Import Core/Functions as F macro}  ; Need 'macro' to use Def syntax
  {Rules
    {Def Double {Args x} {Mul x 2}}}}  ; Becomes a proper rule
```

After RuleRules transformation, this becomes:

```lisp
{Rules
  {R "fun/Double/1" {Call Double x_} {Mul x_ 2}}}
```

### Execution Timeline

1. **Compile time**: RuleRules transform the Rules section of modules that import them with `macro`
2. **Runtime**: Transformed rules execute normally
3. RuleRules themselves remain visible for debugging but don't execute at runtime
4. The MacroScopes section tracks which modules can use which RuleRules

This enables DSL creation, boilerplate reduction, and syntactic sugar without runtime overhead, while maintaining clean module boundaries.

For a comprehensive guide, see the [RuleRules Tutorial](RULERULES-TUTORIAL.md).

---

## 13. Event Action Combinators

Syma provides composable action primitives for handling UI events:

### Basic Actions

- `{Seq action1 action2 ...}` - Execute actions in sequence
- `{If condition thenAction elseAction}` - Conditional execution
- `{When condition action}` - Execute only if condition is true

### Input/Form Actions

- `{Input fieldName}` - Reference input field value
- `{ClearInput fieldName}` - Clear input field
- `{SetInput fieldName}` - Set input field value

### Event Control

- `{PreventDefault action}` - Prevent default browser behavior
- `{StopPropagation action}` - Stop event bubbling
- `{KeyIs "Enter"}` - Check if specific key was pressed

### Example Usage

```lisp
{Input :type "text"
       :value {Input todoInput}
       :onKeydown {When {KeyIs "Enter"}
                    {PreventDefault
                      {Seq
                        {AddTodoWithTitle {Input todoInput}}
                        {ClearInput todoInput}}}}}
```

---

## 14. Development Features

### Trace Mode

Enable step-by-step rewriting trace:
- Add `?trace` to the URL
- Or set `window.SYMA_DEV_TRACE = true`

This shows each rule application with the matched pattern and replacement.

### File Extensions

- `.syma` - Source files in S-expression syntax (module format)
- `.lisp` or `.sym` - Legacy source files (non-module format)
- `.json` - Compiled AST representation

### Code Formatting

The compiler includes a Tree-Sitter based formatter that preserves comments and user formatting:

```bash
# Format a .syma file
syma-compile file.syma --format

# Format and save to a new file
syma-compile messy.syma --format --out clean.syma
```

**Formatter Features:**
- **Preserves comments** - Unlike AST-based formatting, comments are retained
- **Preserves blank lines** - User-added spacing for readability is kept
- **Smart indentation** - Automatically indents nested structures
- **Mixed syntax support** - Handles both brace `{}` and function call `()` syntax

The formatter uses the Tree-Sitter parse tree directly rather than converting to AST, ensuring nothing is lost during formatting.

### Running Programs

Syma offers multiple execution modes:
```bash
# Direct execution (auto-compiles if needed)
syma program.syma

# Run pre-compiled universe
syma universe.json

# Interactive REPL
syma

# Compile for distribution
syma-compile src/modules/*.syma --bundle --entry App/Main --out universe.json
```

---

## 15. Running Syma Programs

### Direct Execution

Syma programs can be run directly from the command line:

```bash
# Run a Syma module or program
syma my-program.syma

# Run a compiled universe
syma universe.json

# Evaluate an expression
syma -e '{Add 2 3}'

# Start interactive REPL
syma

# Load a file into REPL
syma -l program.syma
```

### Module Compilation

The `syma-compile` compiler handles both single files and module bundling:

```bash
# Single file mode (backward compatibility for non-module files)
syma-compile input.syma --out output.json --pretty

# Bundle modules into a Universe
syma-compile src/modules/*.syma --bundle --entry App/Main --out universe.json

# The compiler:
# 1. Parses all module files
# 2. Extracts imports/exports
# 3. Topologically sorts by dependencies
# 4. Qualifies symbols with module namespaces
# 5. Expands Defs as high-priority rules
# 6. Bundles into a single Universe
```

### Platform Support

Syma runs on multiple platforms through a platform abstraction layer:
- **Node.js**: Full runtime with file I/O, networking, and process control
- **Browser**: DOM rendering, localStorage, WebSockets, and browser APIs
- **Platform-agnostic**: Write once, run anywhere with symbolic effects

### Symbol Qualification Process

During compilation, symbols are transformed based on scope:
- **Local symbols** → `Module/Name`
- **Imported with alias** → resolved to source module
- **From open imports** → qualified with source module
- **Built-ins** → remain unqualified

### Def Expansion

Module definitions become rules with high priority (1000):
```lisp
{Defs {InitialState {CounterState ...}}}
; Becomes:
{R "App/Counter/InitialState/Def"
   App/Counter/InitialState
   {App/Counter/CounterState ...}
   1000}
```

---

## 16. Complete Modular Example

### Core/KV Module
```lisp
{Module Core/KV
  {Export Get Put Set Patch}

  {Rules
    {R "Get/Here"
       {Get tag_ key_ {tag_ before... {KV key_ v_} after...}}
       v_}

    {R "Set"
       {Set tag_ key_ v_ st_}
       {Put tag_ key_ v_ st_}}}}
```

### App/Counter Module
```lisp
{Module App/Counter
  {Import Core/KV as KV open}

  {Export InitialState View Inc Dec}

  {Defs
    {InitialState
      {CounterState
        {KV Count 0}
        {KV LastAction "None"}}}}

  {Rules
    {R "Inc"
       {Apply Inc st_}
       {Patch CounterState st_
         {KV Count {Add {Get CounterState Count st_} 1}}
         {KV LastAction "Incremented"}}}

    {R "View"
       {/@ {View} {App {State st_} _}}
       {Div :class "card"
         {H1 "Counter"}
         {Div "Count: " {Show Count}}
         {Button :onClick Inc "+"}}}

    {R "ShowCount"
       {/@ {Show Count} {App {State st_} _}}
       {Get CounterState Count st_}}}}
```

### App/Main Module
```lisp
{Module App/Main
  {Import App/Counter as Counter}

  {Program
    {App
      {State Counter/InitialState}
      {UI {Project {Counter/View}}}}}

  {Rules
    {R "LiftApplyThroughProgram"
       {Apply act_ {Program app_ eff_}}
       {Program {Apply act_ app_} eff_}
       100}  ; High priority for lifters

    {R "LiftApplyThroughApp"
       {Apply act_ {App st_ ui_}}
       {App {Apply act_ st_} ui_}
       100}

    {R "LiftApplyThroughState"
       {Apply act_ {State s_}}
       {State {Apply act_ s_}}
       100}}}
```

---

## 17. Key Concepts Summary

1. **Symbolic expressions** as universal syntax
2. **Module system** for code organization and namespacing
3. **Pattern matching** with variables, wildcards, and rest patterns
4. **Greedy anchors** - `..symbol` for matching to last occurrence instead of first
5. **Rewrite rules** for computation and transformation
6. **Two-pass normalization** - innermost-first for `:innermost` rules, then outermost-first for regular rules
7. **Symbol qualification** for namespace isolation
8. **Context-aware projection** for UI rendering
9. **Event handling** through `Apply` patterns with lifting rules
10. **Symbolic effects** for pure I/O representation
11. **Event action combinators** for composable UI interactions
12. **Meta-programming** with rule-rewriting rules
13. **Priority system** for controlling rule application order
14. **Evaluation strategies** - `:innermost` for bottom-up, `:scope` for context restrictions

Syma provides a minimal yet powerful foundation for building reactive applications with a purely functional, rule-based architecture. The module system enables large-scale code organization while maintaining the simplicity of the core language. All side effects remain symbolic, with the runtime acting as a thin bridge to the real world.
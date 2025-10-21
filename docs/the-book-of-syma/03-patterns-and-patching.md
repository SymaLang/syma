# 3. Pattern Matching and Matter Patching

*Variables, wildcards, rests, greediness, and linearity — the mechanics of matching and the poetry of patching.*

⸻

## The Anatomy of a Pattern

A pattern is a **template** for recognizing structure.

Imagine you're a detective. You don't remember every face you've ever seen, but you can recognize a face when you see one. Two eyes, a nose, a mouth — that's the pattern. The specific color of eyes, shape of nose, curve of mouth — those are the variables. Pattern matching is teaching the computer to be a detective of structure.

```lisp
{Add 1 2}           ; Matches exactly {Add 1 2}
{Add x_ y_}         ; Matches any {Add ...} with 2 args
{Add x_ x_}         ; Matches {Add 5 5} but not {Add 5 6}
{Add ...}           ; Matches {Add} with any number of args
{Add x_ ..}         ; Matches {Add} with at least 1 arg
```

When a pattern matches an expression, it **binds variables** to the parts that matched.

Think of it like filling out a form. The form has blanks: "Name: ______ Age: ______". When someone fills it out, those blanks get bound to values: "Name: Alice Age: 30". Patterns are forms for symbolic expressions. Variables are the blanks. Matching is the act of filling them in.

⸻

## Variables: Binding Structure

Use `x_` (or `{Var "x"}` in full form) to capture a single value:

```lisp
Pattern: {Greet name_}
Expression: {Greet "Alice"}

Binds: name_ = "Alice"
```

Variables match **exactly one** sub-expression:

```lisp
syma> :rule ShowName {Greet name_} → {Concat "Hello, " name_}
Rule "ShowName" added

syma> {Greet "Bob"}
→ "Hello, Bob"
```

### Linear Variables: Same Name = Same Value

If a variable appears multiple times, **all occurrences must match the same value**:

```lisp
syma> :rule SameValue {Pair x_ x_} → {Doubled x_}
Rule "SameValue" added

syma> {Pair 5 5}
→ {Doubled 5}

syma> {Pair 5 6}
→ {Pair 5 6}  ; Doesn't match! (x_ can't be both 5 and 6)
```

This is called **linearity** — a powerful constraint for pattern matching.

⸻

## Wildcards: Matching Without Binding

Use `_` (single underscore) to match anything without capturing it:

```lisp
syma> :rule GetSecond {Pair _ second_} → second_
Rule "GetSecond" added

syma> {Pair "ignore this" "want this"}
→ "want this"
```

Wildcards in both pattern and replacement are **matched by position**:

```lisp
syma> :rule Swap {Pair a_ b_} → {Pair b_ a_}
Rule "Swap" added

syma> :rule IgnoreBoth {Process _ _} → {Result}
Rule "IgnoreBoth" added

syma> {Swap {Pair 1 2}}
→ {Pair 2 1}

syma> {Process "foo" "bar"}
→ {Result}
```

🜛 *Wildcards say: "I see you, but I don't care about you."*

⸻

## Rest Variables: Matching Sequences

Use `xs..` (or `{VarRest "xs"}`) to match **zero or more** elements:

```lisp
Pattern: {List first_ rest..}
Expression: {List 1 2 3 4}

Binds:
  first_ = 1
  rest.. = [2, 3, 4]
```

### Basic Rest Examples

```lisp
syma> :rule Head {Head first_ ..} → first_
Rule "Head" added

syma> :rule Tail {Tail _ rest..} → {List rest..}
Rule "Tail" added

syma> {Head 1 2 3 4}
→ 1

syma> {Tail 1 2 3 4}
→ {List 2 3 4}
```

### Rest Wildcards

Use `..` or `...` (rest wildcard) to match sequences without binding:

```lisp
syma> :rule HasFoo {.. Foo ..} → True
Rule "HasFoo" added

syma> {Moo Boo Foo Goo}
→ True

syma> {Moo Boo Goo}
→ {Moo Boo Goo}  ; Doesn't match
```

⸻

## Flat Compound Semantics

Here's where Syma gets radical.

Most languages treat function calls as fundamentally different from their arguments. `f(x, y, z)` is a function `f` applied to arguments `x, y, z`. There's a wall between the function and its arguments — a categorical boundary you can't cross.

Syma tears down that wall.

**Internally**, compounds are stored as `{head, [args...]}` for optimization.
But **semantically**, they're **flat sequences** `[head, arg1, arg2, ...]`.

The head isn't special. It's just the first element. Arguments aren't in a separate category. They're just the rest of the sequence. This seemingly small decision has profound consequences.

This means rest variables can match **across the head boundary**:

```lisp
syma> :rule MatchAnywhere {.. Deep rest..} → {Found rest..}
Rule "MatchAnywhere" added

syma> {Deep 1 2}
→ {Found 1 2}    ; Deep is at position 0, rest.. = [1, 2]

syma> {Moo Deep 1}
→ {Found 1}      ; prefix = [Moo], Deep at position 1, rest.. = [1]

syma> {Moo Boo Deep}
→ {Found}        ; prefix = [Moo, Boo], Deep at position 2, rest.. = []
```

### VarRest at the Beginning

```lisp
syma> :rule ExtractLast {prefix.. last_} → last_
Rule "ExtractLast" added

syma> {Foo Bar Baz}
→ Baz    ; prefix.. = [Foo, Bar], last_ = Baz
```

### Bubbling Errors

```lisp
syma> :rule BubbleError {.. {Err msg..} ..} → {Err msg..}
Rule "BubbleError" added

syma> {Process {Ok 1} {Err "failed"} {Ok 2}}
→ {Err "failed"}
```

🜛 *Flat semantics blur the line between "head" and "arguments." Everything is just a sequence, waiting to be matched.*

⸻

## Greedy Anchors: Matching to the Last

By default, rest variables are **non-greedy** — they match the shortest sequence.

Imagine you're parsing a sentence: "The cat sat on the mat." If you're looking for "the", do you stop at the first one or search for the last? Non-greedy says "stop as soon as you find it." Greedy says "keep going until you can't go further."

But what if you want to match to the **last occurrence** of a symbol?

Use **greedy anchors**: `..symbol`

```lisp
Pattern: {before.. [ inner.. ..] after..}
```

The `..` before `]` says: "Match to the **LAST** `]`, not the first."

This is how you handle nested structures without writing a full parser. Brackets within brackets, quotes within quotes, delimiters within delimiters — greedy anchors let you skip over them all and find the matching pair. It's pattern matching with long-distance vision.

### Example: Nested Brackets

```lisp
syma> :rule ParseBrackets {before.. [ content.. ..] after..} → {Bracket content..}
Rule "ParseBrackets" added

syma> {Start [ nested [ deep ] here ] End}
→ {Bracket nested [ deep ] here}
```

**Without greedy anchor** (default):
```
before.. = [Start]
content.. = [nested, [, deep]  ; Stops at FIRST ]
after.. = [here, ], End]
```

**With greedy anchor** (`..`]):
```
before.. = [Start]
content.. = [nested, [, deep, ], here]  ; Goes to LAST ]
after.. = [End]
```

### Practical Use: Balanced Delimiters

```lisp
syma> :rule ExtractBalanced {prefix.. < body.. ..> suffix..} → {Extracted body..}
Rule "ExtractBalanced" added

syma> {Text < outer < inner > text > End}
→ {Extracted outer < inner > text}
```

🜛 *Greedy anchors let you parse nested structures without a parser. The pattern **is** the parser.*

⸻

## Pattern Matching: Visual Examples

Let's trace how patterns match step-by-step.

### Example 1: Simple Variable

```
Pattern:  {Add x_ y_}
Expression: {Add 5 10}

Match:
  ✓ Head matches: Add = Add
  ✓ Arg count matches: 2 = 2
  ✓ Bindings: x_ = 5, y_ = 10

Result: MATCH
  x_ → 5
  y_ → 10
```

### Example 2: Linear Variables

```
Pattern: {Eq x_ x_}
Expression: {Eq 7 7}

Match:
  ✓ Head matches: Eq = Eq
  ✓ First x_ matches: 7
  ✓ Second x_ matches: 7
  ✓ Check linearity: 7 = 7 ✓

Result: MATCH
  x_ → 7
```

```
Pattern: {Eq x_ x_}
Expression: {Eq 7 9}

Match:
  ✓ Head matches: Eq = Eq
  ✓ First x_ matches: 7
  ✗ Second x_ matches: 9
  ✗ Linearity violation: 7 ≠ 9

Result: NO MATCH
```

### Example 3: Rest Variables

```
Pattern: {List first_ rest..}
Expression: {List 1 2 3 4}

Match:
  ✓ Head matches: List = List
  ✓ first_ matches: 1
  ✓ rest.. matches: [2, 3, 4]

Result: MATCH
  first_ → 1
  rest.. → [2, 3, 4]
```

### Example 4: Wildcard Rests

```
Pattern: {.. Foo ..}
Expression: {Moo Boo Foo Goo}

Match:
  ✓ Scan for Foo: found at position 2
  ✓ First .. matches: [Moo, Boo]
  ✓ Foo matches: Foo
  ✓ Second .. matches: [Goo]

Result: MATCH (no bindings)
```

⸻

## Matter Patching: The Replacement

Once a pattern matches, the **replacement** is built by substituting bound variables.

### Basic Substitution

```lisp
Pattern:    {Inc n_}
Bindings:   n_ = 5
Replacement: {Add n_ 1}

Patched:    {Add 5 1}
```

### Rest Substitution

Rest variables **splice** their contents:

```lisp
Pattern:    {List first_ rest..}
Bindings:   first_ = 1, rest.. = [2, 3, 4]
Replacement: {Reversed rest.. first_}

Patched:    {Reversed 2 3 4 1}
```

### Nested Substitution

```lisp
Pattern:    {Outer {Inner x_}}
Bindings:   x_ = 42
Replacement: {Result {Processed x_}}

Patched:    {Result {Processed 42}}
```

🜛 *Patching is like Mad Libs for symbolic expressions. The pattern extracts the blanks, the replacement fills them in.*

⸻

## Advanced Patterns

### Matching Deeply Nested Structure

```lisp
syma> :rule ExtractDeep {Outer {Middle {Inner value_}}} → value_
Rule "ExtractDeep" added

syma> {Outer {Middle {Inner 99}}}
→ 99
```

### Multiple Rest Variables

```lisp
syma> :rule SplitAt {before.. MARKER after..} → {Split before.. after..}
Rule "SplitAt" added

syma> {A B C MARKER D E F}
→ {Split A B C D E F}
```

### Rest with Constraints

```lisp
syma> :rule NonEmpty {Process first_ rest..} → {Ok first_}
Rule "NonEmpty" added

syma> :rule Empty {Process} → {Error "Empty"}
Rule "Empty" added

syma> {Process 1 2 3}
→ {Ok 1}

syma> {Process}
→ {Error "Empty"}
```

⸻

## Pattern Matching Strategies

### Specificity: Most Specific Wins

```lisp
syma> :rule Specific {Process 0} → {Zero}
syma> :rule General {Process n_} → {NonZero n_}

{Process 0}  → {Zero}        ; Specific matches first
{Process 5}  → {NonZero 5}   ; General catches the rest
```

### Guards: Conditional Matching

```lisp
syma> :rule Positive {Check n_} → {Pos} when {Gt n_ 0}
syma> :rule Negative {Check n_} → {Neg} when {Lt n_ 0}
syma> :rule Zero {Check 0} → {Zer}

{Check 5}   → {Pos}
{Check -3}  → {Neg}
{Check 0}   → {Zer}
```

### Priority: Explicit Ordering

```lisp
syma> :rule High {Foo x_} → {HighPriority} 100
syma> :rule Low {Foo x_} → {LowPriority} 10

{Foo 42}  → {HighPriority}  ; 100 > 10
```

⸻

## Common Patterns

### List Operations

```lisp
; Map
:rule Map/Empty {Map f_ {List}} → {List}
:rule Map/Cons {Map f_ {List first_ rest..}} → {List {f_ first_} {Map f_ {List rest..}}}

; Filter
:rule Filter/Empty {Filter p_ {List}} → {List}
:rule Filter/Match {Filter p_ {List first_ rest..}} → {List first_ {Filter p_ {List rest..}}} when {p_ first_}
:rule Filter/Skip {Filter p_ {List _ rest..}} → {Filter p_ {List rest..}}

; Fold
:rule Fold/Empty {Fold f_ acc_ {List}} → acc_
:rule Fold/Cons {Fold f_ acc_ {List first_ rest..}} → {Fold f_ {f_ acc_ first_} {List rest..}}
```

### State Threading

```lisp
; Get field from state
:rule Get {Get field_ {State pairs..}} → {LookupField field_ pairs..}

; Set field in state
:rule Set {Set field_ value_ {State pairs..}} → {State {UpdateField field_ value_ pairs..}}

; Apply action to state
:rule Apply {Apply action_ state_} → {action_ state_}
```

### Error Propagation

```lisp
; Bubble errors up
:rule BubbleError {.. {Err msg..} ..} → {Err msg..}

; Transform Ok values
:rule MapOk {Map f_ {Ok value_}} → {Ok {f_ value_}}
:rule MapErr {Map f_ {Err msg_}} → {Err msg_}
```

⸻

## Exercises

### 1. Reverse a List

```lisp
; Hint: Use an accumulator
:rule Reverse {Reverse {List items..}} → {ReverseAcc {List} items..}
:rule ReverseAcc/Done {ReverseAcc acc_} → acc_
:rule ReverseAcc/Step {ReverseAcc acc_ first_ rest..} → {ReverseAcc {Cons first_ acc_} rest..}
```

### 2. Find Element

```lisp
; Implement Contains
:rule Contains/Found {Contains x_ {List .. x_ ..}} → True
:rule Contains/NotFound {Contains x_ {List ..}} → False
```

### 3. Zip Two Lists

```lisp
; Combine two lists into pairs
:rule Zip {Zip {List a_ as..} {List b_ bs..}} → {List {Pair a_ b_} {Zip {List as..} {List bs..}}}
:rule Zip {Zip {List} _} → {List}
:rule Zip {Zip _ {List}} → {List}
```

⸻

## Key Takeaways

- **Patterns** bind structure — variables (`x_`), wildcards (`_`), rests (`xs..`)
- **Linearity** enforces same-value constraints for repeated variables
- **Flat semantics** treat compounds as sequences — rest variables can match across the head
- **Greedy anchors** (`..symbol`) match to the **last** occurrence
- **Matter patching** substitutes bindings into replacements
- Pattern specificity, guards, and priorities control which rules fire

⸻

## What's Next

You now understand how patterns match and how replacements patch.

Next, learn how to **control** when and where rules fire.

**Next:** [Chapter 4: Guards, Scopes, and Innermost](./04-guards-scopes-innermost.md)

Or dive into building:
- [Chapter 6: Building Worlds with Rules](./06-building-worlds.md) — Real systems
- [Chapter 5: Modules and Macros](./05-modules-and-macros.md) — Organizing code

⸻

🜛 *"A pattern is a question. A match is an answer. A patch is the consequence of asking."*

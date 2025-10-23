# 13. Appendices

*A: Standard Library. B: Meta Universe (how Syma runs on itself).*

⸻

## Appendix A: Standard Library Reference

The Syma standard library provides core modules for common operations. All stdlib modules are available in `@syma/stdlib`.

### A.1 Core/List — List Operations

**Module:** `Core/List`
**Imports:** `{Import Core/List as L open}`

**Operations:**

```lisp
; Constructors
{List items...}              ; Create list
{Empty}                      ; Empty list

; Access
{Head {List first rest..}}   → first
{Tail {List first rest..}}   → {List rest..}
{Nth n {List items..}}       → nth item (0-indexed)

; Predicates
{IsEmpty {List}}             → True
{IsEmpty {List items..}}     → False
{Contains x {List items..}}  → True | False

; Transformations
{Map f {List items..}}       → {List {f item1} {f item2} ...}
{Filter p {List items..}}    → {List matching-items...}
{Fold f acc {List items..}}  → accumulated-result
{Reverse {List items..}}     → {List reversed...}

; Combining
{Append {List a..} {List b..}}  → {List a.. b..}
{Zip {List a..} {List b..}}     → {List {Pair a1 b1} {Pair a2 b2} ...}
{Concat lists..}                → {List all-items...}

; Analysis
{Length {List items..}}      → count
{Sum {List numbers..}}       → total
{Product {List numbers..}}   → product
{Min {List numbers..}}       → minimum
{Max {List numbers..}}       → maximum

; Slicing
{Take n {List items..}}      → first n items
{Drop n {List items..}}      → items after first n
{Slice start end {List items..}}  → items[start:end]
```

**Examples:**

```lisp
{Map {Lambda x {Mul x 2}} {List 1 2 3}}
→ {List 2 4 6}

{Filter {Lambda x {Gt x 5}} {List 3 7 2 9 4}}
→ {List 7 9}

{Fold {Lambda acc x {Add acc x}} 0 {List 1 2 3 4}}
→ 10

{Zip {List "a" "b" "c"} {List 1 2 3}}
→ {List {Pair "a" 1} {Pair "b" 2} {Pair "c" 3}}
```

---

### A.2 Core/KV — Key-Value Operations

**Module:** `Core/KV`
**Imports:** `{Import Core/KV as KV open}`

**Operations:**

```lisp
; Access
{Get tag key {tag kvs.. {KV key value} rest..}}  → value
{Get tag key {tag kvs..}}                        → Empty (not found)

; Mutation
{Set tag key newValue state}   → updated state (replaces if exists)
{Put tag key value state}      → updated state (always adds)
{Delete tag key state}         → state without key

; Bulk operations
{Patch tag state updates..}    → state with multiple updates

; Queries
{Has tag key state}            → True | False
{Keys tag state}               → {List keys...}
{Values tag state}             → {List values...}
```

**Examples:**

```lisp
{State {KV count 0} {KV name "Alice"}}

{Get State count ...}  → 0
{Set State count 5 ...}  → {State {KV count 5} {KV name "Alice"}}

{Patch State ...
  {KV count 10}
  {KV email "alice@example.com"}}
```

---

### A.3 Core/String — String Manipulation

**Module:** `Core/String`
**Imports:** `{Import Core/String as S open}`

**Operations:**

```lisp
; Transformations
{ToUpper str}               → uppercase string
{ToLower str}               → lowercase string
{Trim str}                  → remove leading/trailing whitespace
{Reverse str}               → reversed string

; Analysis
{StrLen str}                → length
{IsEmpty str}               → True | False
{StartsWith prefix str}     → True | False
{EndsWith suffix str}       → True | False
{Contains substr str}       → True | False

; Extraction
{Substring str start end}   → substring
{CharAt n str}              → character at index n

; Splitting/Joining
{Split delim str}           → {List parts...}
{Join delim {List parts..}} → joined string
{Lines str}                 → {List lines...}

; Search/Replace
{IndexOf substr str}        → position (or -1)
{Replace old new str}       → string with first occurrence replaced
{ReplaceAll old new str}    → string with all occurrences replaced

; Conversion
{ToString value}            → string representation
{ParseNum str}              → number (or fails)
```

**Examples:**

```lisp
{Split "," "a,b,c"}
→ {List "a" "b" "c"}

{Join "-" {List "x" "y" "z"}}
→ "x-y-z"

{ReplaceAll " " "_" "hello world"}
→ "hello_world"
```

---

### A.4 Core/JSON — JSON Serialization

**Module:** `Core/JSON`
**Imports:** `{Import Core/JSON as JSON open}`

**Operations:**

```lisp
; Serialization
{ToJSON expr}               → JSON string

; Deserialization
{FromJSON str}              → symbolic expression

; Encoding rules
Numbers    → JSON numbers
Strings    → JSON strings
{List ...} → JSON arrays
{Obj {KV k v} ...} → JSON objects
True/False → JSON booleans
Empty      → JSON null
```

**Examples:**

```lisp
{ToJSON {Obj {KV name "Alice"} {KV age 30}}}
→ "{\"name\":\"Alice\",\"age\":30}"

{FromJSON "{\"x\":5,\"y\":10}"}
→ {Obj {KV x 5} {KV y 10}}

{ToJSON {List 1 2 3}}
→ "[1,2,3]"
```

---

### A.5 Core/Fun — Function Definition Syntax

**Module:** `Core/Fun` (RuleRules module)
**Imports:** `{Import Core/Fun as F macro}`

**Syntax:**

```lisp
; Define function
{Fn {name args...} body}

; Generates rules:
{R "fun/name/arity" {Call name args...} body}
{R "fun/name/arity/Sugar" {name args...} {Call name args...}}

; Call function
{Call name args...}  ; Explicit
{name args...}       ; Sugar
```

**Examples:**

```lisp
{Import Core/Fun as F macro}

{Fn {Double x} {Mul x 2}}
{Fn {Add3 a b c} {Add a {Add b c}}}

{Call Double 5}   → 10
{Double 5}        → 10  (sugar)
{Add3 1 2 3}      → 6
```

---

### A.6 Core/Set — Set Operations

**Module:** `Core/Set`
**Imports:** `{Import Core/Set as Set open}`

**Operations:**

```lisp
; Constructors
{Set items...}              ; Create set

; Queries
{Member x {Set items..}}    → True | False
{Size {Set items..}}        → count

; Operations
{Union {Set a..} {Set b..}}        → {Set combined...}
{Intersection {Set a..} {Set b..}} → {Set common...}
{Difference {Set a..} {Set b..}}   → {Set in-a-not-in-b...}

; Transformations
{Add x {Set items..}}       → {Set items.. x} (if not present)
{Remove x {Set items..}}    → {Set items-without-x...}
```

**Examples:**

```lisp
{Union {Set 1 2 3} {Set 3 4 5}}
→ {Set 1 2 3 4 5}

{Intersection {Set 1 2 3} {Set 2 3 4}}
→ {Set 2 3}

{Member 3 {Set 1 2 3}}
→ True
```

---

### A.7 Core/Effect — Effects System Helpers

**Module:** `Core/Effect`
**Imports:** `{Import Core/Effect as Eff open}`

**Operations:**

```lisp
; Enqueueing
{EnqueueEffect effect program}  → program with effect in Pending

; Consuming
{ConsumeInbox program}           → process all inbox messages

; Helpers
{FreshEffectId}                  → unique ID for effect
{WaitFor effectId program}       → block until effect completes
```

**Examples:**

```lisp
{EnqueueEffect
  {HttpReq {FreshId} {Method "GET"} {Url "/api/users"}}
  program}

{ConsumeInbox program}  ; Process all responses in Inbox
```

---

### A.8 Core/Test — Testing Utilities

**Module:** `Core/Test`
**Imports:** `{Import Core/Test as T open}`

**Operations:**

```lisp
; Assertions
{Assert condition message}       → pass or fail
{AssertEq actual expected msg}   → pass or fail
{AssertMatch pattern expr msg}   → pass or fail

; Test suites
{Suite name tests...}            → run all tests
{Test name assertions...}        → single test

; Reporting
{Report results...}              → summary
```

**Examples:**

```lisp
{Assert {Eq {Add 1 2} 3} "Addition works"}

{AssertEq {Double 5} 10 "Double function"}

{AssertMatch {Ok value_} {ProcessValid input} "Processes valid input"}

{Suite "Math Tests"
  {Test "Addition" {Assert {Eq {Add 1 1} 2} "1+1=2"}}
  {Test "Multiplication" {Assert {Eq {Mul 2 3} 6} "2*3=6"}}}
```

---

### A.9 Core/Syntax/Global — Global Syntax

**Module:** `Core/Syntax/Global` (RuleRules, automatically imported)

**Provides:**

```lisp
; Rule shorthand
:rule name pattern -> replacement
; Compiles to:
{R "name" pattern replacement}

; Multiline rule
:rule multiline name
  pattern
  -> replacement
:end
```

This module is **automatically imported** into every Syma module, providing universal syntactic sugar.

---

## Appendix B: The Meta Universe

### How Syma Runs on Itself

Syma's runtime is not written in JavaScript or C++. The core normalization engine is, but the **symbolic transformation layer** is written in **Syma itself**.

**The meta-circular property:**

Syma uses its own pattern matching and rewriting to:
1. Parse `.syma` source into AST
2. Apply RuleRules to transform rules
3. Normalize programs

### Core Engine Rules (Excerpt)

These rules power Syma's normalization:

```lisp
{Module Syma/Core/Engine
  {Export Normalize Match Subst}

  {Rules
    ; Pattern matching
    {R "Match/Sym"
       {Match {Var _} expr_ env_}
       {Bind _ expr_ env_}}

    {R "Match/Compound"
       {Match {Call h_ a..} {Call h2_ a2..} env_}
       {MatchArgs a.. a2.. {Match h_ h2_ env_}}}

    ; Substitution
    {R "Subst/Var"
       {Subst {Var x_} env_}
       {Lookup x_ env_}}

    {R "Subst/Compound"
       {Subst {Call h_ args..} env_}
       {Call {Subst h_ env_} {SubstAll args.. env_}}}

    ; Normalization
    {R "Normalize/Step"
       {Normalize expr_ rules_}
       {TryRules expr_ rules_}}

    {R "TryRules/Match"
       {TryRules expr_ {Rules .. {R _ pattern_ replacement_} ..}}
       {Normalize {Subst replacement_ {Match pattern_ expr_}} rules_}
       {Matches pattern_ expr_}}

    {R "TryRules/NoMatch"
       {TryRules expr_ rules_}
       {NormalizeChildren expr_ rules_}}

    ; Primitive folding
    {R "FoldPrimitives"
       {Normalize {Add n1_ n2_} rules_}
       {Add n1_ n2_}  ; Delegates to JavaScript primitive
       {And {IsNum n1_} {IsNum n2_}}}}}
```

### The Bootstrap Process

1. **Initial Universe** (JavaScript)
   - Minimal AST types
   - Basic pattern matching (in JS)
   - Primitive folding (in JS)

2. **Meta Rules Loaded** (Syma)
   - Load `Syma/Core/Engine` module
   - Rules for normalization, matching, substitution
   - Written in Syma, executed by Syma

3. **Self-Hosting**
   - The Syma engine normalizes itself
   - RuleRules transform the engine's own rules
   - Meta-circular interpreter emerges

🜛 *Syma compiles Syma. Syma runs Syma. It's turtles all the way down—or up.*

---

### Platform Abstraction

Syma's effects system separates symbolic transformations from platform I/O:

**Symbolic Layer (Pure Syma):**

```lisp
{HttpReq id {Method "GET"} {Url "/api"}}
```

**Platform Layer (JavaScript):**

```javascript
async function processEffect(effect) {
  if (effect.k === 'HttpReq') {
    const response = await fetch(url, options);
    return {k: 'HttpRes', ...};
  }
  // Other effects...
}
```

**Platforms:**
- **Browser** (`@syma/platform-browser`) — DOM, fetch, localStorage, WebSockets
- **Node.js** (`@syma/platform-node`) — File I/O, child processes, network
- **Future** — Native (Rust/Go), mobile, embedded

Each platform implements the same symbolic interface, allowing Syma programs to run **anywhere**.

---

### Compiler Pipeline

```
.syma source
    ↓
[Tree-Sitter Parser] (preserves comments)
    ↓
AST (JSON)
    ↓
[Module Compiler] (resolve imports, qualify symbols)
    ↓
Bundled Modules
    ↓
[RuleRules Application] (module-scoped transformation)
    ↓
Final Universe (JSON)
    ↓
[Runtime Engine] (normalization loop)
    ↓
Normalized Program
    ↓
[Projector] (DOM/string/terminal)
    ↓
Output
```

Each stage is **inspectable** and **modifiable**. You can:
- Hook into the compiler at any stage
- Transform the AST programmatically
- Generate code from templates
- Optimize rules before runtime

🜛 *Transparency is Syma's superpower. Every stage is visible. Nothing is magic.*

---

### Rule Indexing for Performance

Syma doesn't try every rule on every expression. Rules are **indexed** by:

1. **Head symbol** — `{Add ...}` only tries rules matching `{Add ...}`
2. **Arity** — `{Add x_ y_}` only tries rules with 2 arguments
3. **Priority** — Higher priority rules are tried first

**Index Structure:**

```
RuleIndex
  ├─ Add
  │  ├─ Arity 2: [AddZero, AddCommute, AddAssoc]
  │  └─ Arity *: [AddVarArgs]
  ├─ Mul
  │  └─ Arity 2: [MulZero, MulOne, Distribute]
  └─ *
     └─ Arity *: [CatchAll]
```

Normalization:
1. Look up index by head symbol
2. Filter by arity
3. Try rules in priority order
4. First match wins

**Result:** O(rules matching head) instead of O(all rules).

---

### Future: Self-Optimizing Rules

Imagine Syma analyzing its own rule applications:

```lisp
{Module Syma/Optimizer
  {Rules
    ; Detect unused rules
    {R "RemoveDeadRules"
       {Universe prog {Rules .. {R name_ pattern_ replacement_} ..}}
       {Universe prog {Rules ...}}  ; Remove rule
       {NeverFired name_}}

    ; Fuse frequently paired rules
    {R "FuseRules"
       {Rules .. {R "A" p1_ r1_} .. {R "B" p2_ r2_} ..}
       {Rules .. {R "A+B" p1_ {ApplyRule "B" r1_}} ..}
       {AlwaysFollows "A" "B"}}

    ; Partial evaluation
    {R "PartialEval"
       {R name_ {pattern_ constant_} replacement_}
       {R name_ {pattern_} {PreCompute replacement_ constant_}}
       {IsConstant constant_}}}}
```

Syma could **optimize itself** by analyzing rule firing patterns and generating more efficient rules.

---

## Appendix C: Quick Reference

### Primitive Operations

See [CHEATSHEET.md](../../CHEATSHEET.md) for complete primitive reference.

**Arithmetic:** `Add`, `Sub`, `Mul`, `Div`, `Mod`, `Pow`, `Sqrt`, `Abs`, `Min`, `Max`, `Floor`, `Ceil`, `Round`

**Bitwise:** `BitAnd` (`&`), `BitOr` (`|`), `BitXor`, `BitNot` (`~`), `<<`, `>>`, `>>>`

**Strings:** `Concat`, `ToString`, `ToUpper`, `ToLower`, `Trim`, `StrLen`, `Substring`, `IndexOf`, `Replace`

**Comparison:** `Eq`, `Neq`, `Lt`, `Gt`, `Lte`, `Gte`

**Boolean:** `And`, `Or`, `Not`

**Type Checks:** `IsNum`, `IsStr`, `IsSym`, `IsTrue`, `IsFalse`

**Utilities:** `FreshId`, `Random`, `ParseNum`, `Debug`, `Serialize`, `Deserialize`

---

### Rule Modifiers

```lisp
:guard condition        ; Conditional matching
:scope ParentSymbol     ; Context restriction
:with contextPattern    ; Bind from context (scoped parent or top Program)
:innermost              ; Bottom-up evaluation
:prio N                 ; Priority (higher first)
```

**The `:with` modifier:**
- **With `:scope`**: Matches the scoped compound
- **Without `:scope`**: Matches the top `{Program}` node (access Effects, full App, etc.)

**Order doesn't matter after replacement:**

```lisp
{R "Name" pattern replacement :guard G :scope S :with W :innermost :prio 100}
{R "Name" pattern replacement :prio 100 :innermost :with W :scope S :guard G}
; Both valid!
```

---

### Frozen Wrapper

The `{Frozen expr}` wrapper prevents normalization (rule matching and primitive folding) of its contents:

**Use cases:**
- **Guards**: Check matched values as-is without transformation
- **Code-as-data**: Prevent eval-on-read when loading Syma files
- **Development**: Inspect universe parts without normalization

```lisp
; In guards - check type without normalizing
when {IsNum {Frozen x_}}

; Code-as-data - ReadSymaFile returns Frozen
{ReadSymaFileComplete id {Frozen code}}

; Debugging - inspect without transforming
{Debug {Frozen state_}}
```

---

### REPL Commands

```
:help               :rules              :load file
:trace              :bundle file        :import file
:reload             :save file          :clear
:universe           :program            :macro-scopes
:match pattern expr :apply action       :quit
```

---

### Module Structure

```lisp
{Module Module/Name
  {Export symbol1 symbol2}
  {Import Other/Module as Alias open macro}
  {Defs {name value}}
  {Program {App ...} {Effects ...}}
  {Rules {R ...}}
  {RuleRules {R ...}}}
```

---

### Import Modifiers

```lisp
{Import M as A}              ; Qualified: A/Symbol
{Import M as A open}         ; Unqualified: Symbol
{Import M as A macro}        ; Apply RuleRules
{Import M as A open macro}   ; Both
```

---

## Further Reading

- **[LANGUAGE.md](../../LANGUAGE.md)** — Complete language specification
- **[TUTORIAL.md](../../TUTORIAL.md)** — Step-by-step learning path
- **[RULERULES-TUTORIAL.md](../../RULERULES-TUTORIAL.md)** — Meta-programming guide
- **[REPL.md](../../REPL.md)** — REPL reference
- **[NOTEBOOK.md](../../NOTEBOOK.md)** — Notebook guide
- **[CLI.md](../../CLI.md)** — CLI tools reference
- **[PACKAGES.md](../../PACKAGES.md)** — Package system documentation

---

## Contributing to Syma

Syma is open source. Contributions welcome:

- **Report bugs** — GitHub issues
- **Suggest features** — Discussions
- **Write documentation** — Improve the book!
- **Build libraries** — Publish packages
- **Share examples** — Show what you've built

---

🜛 *"The best way to learn Syma is to build something impossible with it... then realize it was possible all along."*

⸻

**End of The Book of Syma**

Now go forth and **rewrite reality**.

# 12. Design Notes & Origins

*The real story — outermost-first as a self-inflicted mind experiment that worked. The moments where Syma became more than an engine.*

⸻

## How It Started

Syma began as a **thought experiment**.

The question was simple:

> "What if computation wasn't about executing instructions, but about transforming patterns?"

Not a new idea. Term rewriting systems have existed for decades: Mathematica, Pure, Maude, ASF+SDF.

But they all felt like **tools for specific domains** — algebra, formal verification, theorem proving.

What if symbolic rewriting could be a **general-purpose programming language**?

Not for mathematics. Not for logic. For **everything**.

Web apps. State machines. UI systems. APIs.

That was the experiment.

🜛 *Syma is what happens when you take term rewriting seriously as a foundation for all computation, not just symbolic math.*

⸻

## The Outermost Decision

Early Syma used **innermost-first** normalization, like most term rewriting systems.

It made sense. It was standard. It worked.

But something felt **wrong**.

I couldn't explain it at first. The code ran fine. Rules fired correctly. But when I traced execution, when I watched transformations happen, it felt... backwards. Like reading a book from the last page to the first. You get the story, but not the way it was meant to be told.

When you write:

```lisp
{Simplify {Add {Mul 2 x} {Mul 3 x}}}
```

You don't think:
1. "First, multiply 2 by x"
2. "Then, multiply 3 by x"
3. "Then, add the results"
4. "Then, simplify"

You think:
1. "I need to simplify"
2. "I see two multiplications being added"
3. "Factor out x"

**You see the whole pattern first.**

So I switched to **outermost-first**.

And everything changed.

It wasn't a small tweak. It was a paradigm shift. Suddenly, rules could be lazy — only evaluating arguments if needed. Conditionals worked naturally without special syntax. DSLs felt intuitive instead of forced. The traces made sense — big transformations first, then details. The code felt like it was thinking the way I was thinking.

That's when I knew: Syma wasn't just another term rewriting system. It was something different.

### What Outermost Unlocked

**1. Natural DSL evaluation**

```lisp
{If condition thenBranch elseBranch}
```

Outermost sees the `If` first, evaluates the condition, picks a branch.

Innermost would evaluate **both branches** before checking the condition. Wasteful. Unintuitive.

**2. Lazy evaluation for free**

```lisp
{Or True {ExpensiveComputation}}
→ True  ; Never computes the second argument
```

No special "lazy" keyword. Just outermost-first.

**3. Context-aware optimization**

```lisp
:rule OptimizeInContext pattern replacement :scope Context
```

Rules can see they're inside a specific context **before** descending.

**4. Human-readable traces**

When you trace outermost execution, you see the **big transformations first**, then the details.

Just like how humans explain things:
- "I simplified the expression" (high-level)
- "By factoring out the common term" (detail)

Not:
- "I multiplied 2 by x" (micro-detail)
- "Then I multiplied 3 by x" (micro-detail)
- "Then I added them" (micro-detail)
- "Then I noticed a pattern and factored" (belated realization)

🜛 *Outermost-first wasn't a technical optimization. It was a cognitive one. It made Syma think like humans think.*

⸻

## The Moment: From Engine to Language

There was a moment when Syma stopped being a **rewrite engine** and became a **language**.

It happened when I implemented **RuleRules**.

The idea: What if rules could transform other rules **before runtime**?

Not macros (which expand syntax).
Not metaprogramming (which generates code).

But **rules that pattern-match on rule definitions and transform them**.

```lisp
{RuleRules
  {R "Def->Rule"
     {Def name_ body_}
     {R name_ {Call name_} body_}}}

{Rules
  {Def Double {Mul 2}}}
```

At compile time:
```lisp
{Rules
  {R "Double" {Call Double} {Mul 2}}}
```

**The language could modify itself.**

Not through some special macro system bolted on.
But through the **same pattern-matching mechanism** used for everything else.

Rules are data.
RuleRules are rules that transform that data.

It was **homoiconicity** taken seriously.

🜛 *When I saw RuleRules work, I realized: Syma isn't just a rewrite engine. It's a language that can rewrite its own language.*

⸻

## Design Principles That Emerged

As Syma evolved, certain principles crystallized:

### 1. No Hidden State

**Everything must be visible in the symbolic expression.**

Bad:
```javascript
let x = 5;
function foo() {
  return x + 1;  // Where does x come from?
}
```

Good:
```lisp
{Foo {Env {KV x 5}}}  ; Environment is explicit
```

No closures hiding captured variables.
No global state hiding mutations.

If you can't see it in the expression, **it doesn't exist**.

### 2. No Syntax Sugar Unless It's Rules

Bad:
```
for x in list:
  print(x)
```

Good:
```lisp
{RuleRules
  {R "ForSyntax"
     {:for var_ :in list_ body_}
     {Map {Lambda var_ body_} list_}}}

{Rules
  {:for x :in items {Print x}}}
```

**Every convenience is a rule transformation**, visible and modifiable.

### 3. Outermost Unless You Need Innermost

**Default to outermost-first.**

Only use `:innermost` when you explicitly need bottom-up:
- Scoped folding
- Phase separation
- Accumulation patterns

This keeps the default intuitive while allowing exceptions.

### 4. Effects as Data

**Never perform I/O directly. Always represent it symbolically.**

Bad:
```javascript
await fetch('/api/users');
```

Good:
```lisp
{HttpReq id {Method "GET"} {Url "/api/users"}}
```

The platform adapter performs the actual I/O.
The symbolic world stays pure.

### 5. Modules Are Scopes for RuleRules

**RuleRules must be opt-in per module.**

This prevents:
- Surprising transformations across module boundaries
- Dependency hell from conflicting RuleRules
- Debugging nightmares ("Where did this syntax come from?")

Use the `macro` import modifier explicitly:

```lisp
{Import Core/Sugar as S macro}  ; ← Explicit opt-in
```

Exception: `Core/Syntax/Global` provides universal syntax to all modules (like `:rule` shorthand).

🜛 *Design principles aren't chosen arbitrarily. They emerge from use. Syma's principles came from seeing what broke and what worked.*

⸻

## What Didn't Work

Not every idea was good. Some failed spectacularly:

### 1. Automatic Memoization

**Idea:** Automatically cache rule results for repeated patterns.

**Reality:** Exploded memory. Slow cache lookups. Hard to invalidate.

**Lesson:** Optimization is hard. Do it explicitly, not magically.

### 2. Type Inference

**Idea:** Infer types from patterns, generate type-checking rules automatically.

**Reality:** Type inference is **hard**. It requires constraint solving, unification, and complex algorithms.

**Lesson:** Types are better as a **library**, not a language feature. Let users build type systems with RuleRules if they want them.

### 3. Parallel Rule Application

**Idea:** Apply multiple rules in parallel if they don't conflict.

**Reality:** Determinism matters more than speed. Parallel application made debugging impossible.

**Lesson:** Predictability > performance for a language focused on clarity.

### 4. First-Class Patterns

**Idea:** Let patterns be values:

```lisp
{MatchWith pattern_ expr_}
```

**Reality:** Blurred the line between compile-time and runtime. Too confusing.

**Lesson:** Patterns are **compile-time** constructs. Keep them separate from runtime values.

🜛 *Every failed experiment taught something. Failed ideas are just lessons you pay for up front.*

⸻

## Influences

Syma didn't appear in a vacuum. It's built on the shoulders of giants:

### Term Rewriting Systems

- **Mathematica** — Showed symbolic computation can be practical
- **Pure** — Proved term rewriting can be a general-purpose language
- **Maude** — Demonstrated the power of rewrite strategies

### Lisp Family

- **Scheme** — S-expressions and homoiconicity
- **Racket** — Language-oriented programming and macros
- **Clojure** — Persistent data structures and simplicity

### Logic Programming

- **Prolog** — Pattern matching and unification
- **Datalog** — Declarative queries and rules

### Functional Languages

- **Haskell** — Lazy evaluation and purity
- **ML/OCaml** — Pattern matching in practice

### Others

- **React** — Declarative UI through transformations
- **Elm** — The Elm Architecture (Model-Update-View)
- **Luna** — Visual symbolic programming

🜛 *Syma is the synthesis of ideas I loved from other languages, filtered through the lens of symbolic transformation.*

⸻

## The Name: "Syma"

**Syma** comes from:
- **SYM**bolic
- **MA**tter (as in "matter patching")

It's also meant to evoke:
- **Sigma** (Σ) — summation, totality
- **Symbiosis** — harmony between parts
- **Symmetry** — balance in structure

The name should sound like **process**, not **product**.

Not a "framework" or "library".
A **way of thinking**.

🜛 *Names matter. "Syma" is a verb disguised as a noun.*

⸻

## Design Tensions

Every language has tensions between conflicting goals. Syma's biggest:

### 1. Simplicity vs Power

**Simplicity:** Keep the core minimal (patterns + rules).
**Power:** Enable complex DSLs, metaprogramming, effects.

**Resolution:** Simple core + RuleRules for extensibility.

### 2. Purity vs Practicality

**Purity:** Everything symbolic, no side effects.
**Practicality:** Apps need I/O, HTTP, storage.

**Resolution:** Effects as symbolic data, platform adapters handle reality.

### 3. Determinism vs Emergence

**Determinism:** Predictable evaluation order.
**Emergence:** Let complex behavior emerge from simple rules.

**Resolution:** Outermost-first with priority/guards for control.

### 4. Familiar vs Novel

**Familiar:** Syntax that looks like other languages.
**Novel:** New paradigm requires new thinking.

**Resolution:** Dual syntax (braces + function calls) for familiarity, but don't hide the novelty.

🜛 *Good design isn't resolving tensions. It's **navigating** them.*

⸻

## What's Next for Syma

Syma is still evolving. Future directions:

### 1. Performance Optimization

- Partial evaluation (constant folding at compile time)
- Rule indexing improvements (better pattern discrimination trees)
- JIT compilation (compile hot rules to native code)

### 2. Better Tooling

- IDE integration (LSP for VS Code)
- Debugger (step through transformations visually)
- Profiler (which rules fire most often?)

### 3. Type System Library

- Optional type checking via RuleRules
- Gradual typing (mix typed and untyped code)
- Dependent types (types that depend on values)

### 4. Distributed Syma

- Remote rule application (rules across machines)
- Conflict-free replicated data types (CRDTs)
- Distributed effects processing

### 5. Visual Programming

- Node-based rule editor (like Blender's node system)
- Live visualization of transformations
- Pattern playground (test patterns interactively)

🜛 *Syma is not finished. It's a research project disguised as a usable language.*

⸻

## Lessons Learned

Building Syma taught me:

**1. Constraints breed creativity**

Forcing everything into patterns + rules led to unexpected solutions.

**2. The simplest model wins**

Syma's core is tiny: match patterns, apply replacements, normalize. Everything else builds on that.

**3. Syntax matters less than you think**

Brace vs function syntax debates miss the point. The **structure** matters, not the **notation**.

**4. Humans think in patterns**

Outermost-first evaluation works because it matches human cognition.

**5. Homoiconicity is underrated**

When code is data, everything becomes possible: macros, metaprogramming, introspection, live editing.

**6. Side effects must be explicit**

The symbolic effects system forced me to make I/O visible and testable.

**7. Evolution > revolution**

Syma evolved through experimentation, not grand design. Let use cases drive features.

🜛 *Building a language is building a way of thinking. Every decision shapes not just the syntax, but the mind of the programmer.*

⸻

## Final Thoughts

Syma is not for everyone.

It's weird. It's different. It requires unlearning.

But for those who see the beauty in transformation, who think in patterns, who want to **sculpt reality with symbols**...

Syma feels like home.

🜛 *"The best way to predict the future is to invent it." — Alan Kay*

*Syma is my invention. The future it predicts: computation as transformation. Programs as patterns. Matter patching through symbolic rewriting.*

*Welcome to that future.*

⸻

## What's Next

You've read the story of how Syma came to be.

Now reference the appendices for comprehensive documentation.

**Next:** [Chapter 13: Appendices](./13-appendices.md)

Or return to practical chapters:
- [Chapter 6: Building Worlds with Rules](./06-building-worlds.md)
- [Chapter 10: Projects and Ecosystem](./10-packages-and-ecosystem.md)

⸻

🜛 *"Every program is a transformation. Every transformation is a story. This is Syma's story."*

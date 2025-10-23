# 1. Introduction: The Symbolic Mind

*A symbolic rewrite engine disguised as a language.*

⸻

## What Syma Is

Syma is a **symbolic programming language** — a general-purpose system for writing programs as pattern-matching rewrite rules.

Imagine if programs weren't instructions to execute, but shapes to transform. If debugging meant watching patterns morph into other patterns, if refactoring meant tweaking transformation laws until the system behaves differently. This is Syma.

It's not:
- An imperative language (no statements, no control flow)
- A functional language (no lambda calculus at its core)
- An object-oriented language (no classes, no inheritance)
- A logic language (though you can build one inside it)

It **is**:
- A universe of symbolic expressions that constantly reconfigure themselves
- A pattern matcher that reads structure
- A matter patcher that writes structure
- A normalization engine that applies rules until nothing more can change

Think of it as reality's computational substrate, if reality were made of patterns that know how to rewrite themselves. In most languages, you command the computer: "do this, then that." In Syma, you declare: "whenever you see this pattern, transform it into that pattern." The computer becomes a symbolic artist, sculpting expressions until they reach their final form.

⸻

## The Philosophy of Matter Patching

In Syma, computation isn't about executing instructions. It's about **transformation**.

Most programming feels like giving orders to an obedient servant. "Add these numbers." "Loop through this list." "If this condition, do that." The computer obeys, step by step, mechanically. It's a relationship of command and execution.

Syma inverts this. You don't command. You **observe patterns and describe what they should become**. You're not a commander — you're a naturalist documenting the laws of a symbolic ecosystem. "When water freezes, it becomes ice." "When an Inc pattern appears, it transforms into Add."

You don't write:
```javascript
function increment(x) {
  return x + 1;
}
```

You write:
```lisp
{R "Increment" {Inc n_} {Add n_ 1}}
```

This reads: "When you see the pattern `{Inc n_}`, replace it with `{Add n_ 1}`."

That's it. That's the whole language.

No function calls in the traditional sense. No variable assignments. No control flow keywords. Just pattern recognition and transformation. The program doesn't "run" — it **evolves**, like a cellular automaton following simple rules until it reaches equilibrium.

🜛 *Matching is reading. Patching is writing. Normalization is thinking.*

⸻

## No Syntax Sugar, No Frameworks, No Runtime Magic

Syma has no hidden layers.

Most languages are icebergs — what you see on the surface is supported by massive invisible infrastructure below. Keywords that trigger compiler magic. Framework abstractions three layers deep. Runtime systems doing mysterious things behind the scenes. You write `async/await` and the compiler weaves in state machines. You write `for` loops and the runtime manages iterators.

Syma refuses this. What you see is what exists. The tip of the iceberg is the entire iceberg.

There's no:
- Built-in function syntax (though you can build one)
- Special loop constructs (though you can write them)
- Class systems or inheritance hierarchies
- Async/await primitives (though effects are symbolic)

Everything you see — UI rendering, state management, I/O, module systems — is built from **rules transforming rules**.

Even the syntactic conveniences you'll use (like `:rule` shorthand or function definitions) are implemented **in Syma itself** through RuleRules (rules that rewrite other rules before runtime).

This isn't minimalism for its own sake. It's **clarity**: when everything is explicit, you understand exactly what's happening. There's no moment where you hit a wall and think "the language does something here I can't see or modify." If it exists, it's made of patterns. If it's made of patterns, you can see it, understand it, and change it.

⸻

## Symbols as Reality's Minimal Unit

In Syma, everything is a **symbolic expression**:

```lisp
42                    ; A number
"hello"               ; A string
Foo                   ; A symbol
{Add 1 2}             ; A compound (symbol + arguments)
{State {Count 5}}     ; Nested structure
```

These aren't "objects" or "values" in the traditional sense. They're **patterns** — shapes that can be matched and transformed.

Think of symbols the way chemists think of atoms. Not as the final indivisible unit (we know atoms are made of particles), but as the **smallest meaningful unit for composition**. You don't build molecules by thinking about quarks. You build them by combining atoms. Similarly, you don't build Syma programs by thinking about bits and bytes. You build them by combining symbols.

A number is a symbol. A string is a symbol. A complex nested data structure is a symbol made of other symbols. Code is a symbol. Data is a symbol. **There is no distinction**.

A Syma program is a symbolic expression.
A Syma rule is a symbolic expression.
The transformation of one symbolic expression into another **is** computation.

This isn't philosophy for philosophy's sake. It's deeply practical: when code and data are the same thing, you can write code that transforms code. When rules are data, you can write rules that transform rules. The entire language becomes programmable from within itself.

⸻

## The Universe of Data

When you run a Syma program, you're not "executing code." You're **normalizing a universe**.

Picture a snow globe. You shake it, and snowflakes swirl chaotically. Gradually, they settle. That settling process — from chaos to rest — is normalization. Your program is the snow globe. Rules are gravity. Normalization is what happens when you shake it and watch it settle.

The universe contains:
1. **Program** — your application state and UI
2. **Rules** — transformation laws that govern how patterns rewrite
3. **Effects** — symbolic representations of I/O (HTTP, storage, timers, etc.)

The runtime applies rules to the universe until it reaches a **normal form** — a state where no more rules can fire.

Then it renders the result.

Then an event happens (user clicks a button), and the cycle begins again.

This isn't a metaphor. When you inspect a Syma program at runtime, you literally see a universe — a data structure containing your program, your rules, and your effects, all as symbolic expressions. No hidden callstacks. No mysterious runtime state. Just data, transforming itself according to laws you wrote.

🜛 *The universe doesn't execute. It evolves.*

⸻

## Why Symbolic Programming Matters

Traditional programming is about **control**:
- Control flow (if/else, loops)
- Control state (variables, mutation)
- Control side effects (explicit async, promises)

You're the puppeteer, pulling strings, making the computer dance to your choreography. Every step prescribed. Every branch explicitly coded. You micromanage the machine.

Symbolic programming is about **transformation**:
- You declare patterns and their replacements
- The engine finds matches and applies them
- Complex behavior emerges from simple rules

Here, you're not a puppeteer. You're a gardener. You plant seeds (rules) and let the garden grow according to natural laws. You don't control every leaf's position. You define the conditions for growth, and complexity emerges.

This shift changes everything:

**Debugging** becomes watching transformations:
```
{Inc {Count 5}}
→ {Add {Count 5} 1}    ; Inc rule fired
→ {Add 5 1}            ; Count extracted
→ 6                    ; Add primitive folded
```

**Testing** becomes pattern matching:
```lisp
:match {State {Count n_}} {State {Count 5}}
; ✓ n_ = 5
```

**Refactoring** becomes rule rewriting:
```lisp
; Change one rule, the whole system adapts
{R "ProjectCount" {:project Count} {Get CounterState Count st_} :with {App {State st_} _}}
```

⸻

## A Language That Rewrites Itself

The most radical idea in Syma: **the language can modify its own syntax**.

Through RuleRules (meta-rules), you can transform your Rules section before runtime:

```lisp
{RuleRules
  {R "DefToRule"
     {Def name_ body_}
     {R name_ {Call name_} body_}}}

{Rules
  {Def Double {Mul 2}}}  ; ← Sugar!
```

At compile time, this becomes:
```lisp
{Rules
  {R "Double" {Call Double} {Mul 2}}}  ; ← Real rule
```

This isn't a feature added to Syma. It's a **consequence** of treating rules as data.

When rules are just symbolic expressions, you can pattern-match on them and transform them like anything else.

🜛 *Syma doesn't have macros. It has rules that rewrite rules. The distinction matters.*

⸻

## What You'll Build

In this book, you'll build:
- **Counter apps** — reactive UIs with state
- **Interpreters** — arithmetic, Brainfuck, stack VMs
- **Symbolic algebra** — expression simplifiers
- **Effects systems** — HTTP, storage, timers
- **Type checkers** — as libraries, not syntax
- **Your own DSLs** — custom syntax via RuleRules

All from **pattern matching and matter patching**.

No frameworks. No external dependencies. Just rules.

⸻

## The Promise

Syma won't make your code shorter.
It won't make it "faster" (though it's fast enough).
It won't give you type safety by default (though you can build it).

What it **will** do:

- Show you that computation is transformation
- Teach you to think in patterns instead of procedures
- Let you build systems from first principles
- Give you a language that doesn't hide anything
- Make you question everything you thought you knew about programming

⸻

## Next Steps

Ready to write your first rule?

**Next:** [Chapter 2: First Contact](./02-first-contact.md) — Install Syma, run the REPL, and watch your first transformation happen.

Or jump ahead:
- [Chapter 3: Pattern Matching and Matter Patching](./03-patterns-and-patching.md) — Deep dive into patterns
- [Chapter 6: Building Worlds with Rules](./06-building-worlds.md) — Start building immediately

⸻

🜛 *"In Syma, there are no functions. There are no objects. There are only patterns... and the will to transform them."*

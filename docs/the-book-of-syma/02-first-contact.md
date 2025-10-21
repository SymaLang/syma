# 2. First Contact

*Installing Syma, running your first rule, and understanding normalization.*

⸻

## Install + Hello, Syma!

First, get Syma running on your machine:

```bash
npm install -g @syma/cli
```

That's it. No build tools. No configuration files. No framework setup.

Now open a terminal and type:

```bash
syma
```

You'll see:

```
Syma REPL v1.0.0
Type :help for commands, :quit to exit

syma>
```

Welcome to the symbolic universe.

⸻

## The Smallest Rewrite Possible

Type this:

```lisp
syma> :rule Hello {Hello} {World}
Rule "Hello" added

syma> {Hello}
→ {World}
```

**What just happened?**

1. You defined a rule: "When you see `{Hello}`, replace it with `{World}`"
2. You gave the engine an expression: `{Hello}`
3. The engine matched the pattern and transformed it to `{World}`

That's **pattern matching and matter patching** in action.

Pause and absorb this. You just wrote your first transformation rule. No function definition, no class, no variable assignment. Just: "this pattern becomes that pattern." The entire universe of Syma programming is elaborations on this theme.

Everything you'll build — web apps, compilers, games, databases — will be variations of this: recognize a pattern, describe what it becomes. That's all. That's the whole paradigm.

🜛 *The universe saw `{Hello}`, recognized the pattern, and patched it into `{World}`. Computation happened.*

⸻

## Live Normalization

Let's go deeper. Type this:

```lisp
syma> :rule Double {Double n_} → {Mul n_ 2}
Rule "Double" added

syma> {Double 5}
→ 10
```

Wait, what? We wrote `{Mul n_ 2}`, but the result was `10`, not `{Mul 5 2}`.

**Why?**

Because normalization doesn't stop after one rule. The engine keeps transforming until nothing more can change:

```
{Double 5}
→ {Mul 5 2}     ; Double rule fired
→ 10            ; Mul primitive folded (built-in arithmetic)
```

The engine:
1. Matched `{Double n_}` with `n_ = 5`
2. Replaced it with `{Mul 5 2}`
3. Saw `{Mul 5 2}` (a primitive operation)
4. Folded it to `10`
5. No more rules match → **normal form reached**

🜛 *Normalization is the heartbeat of Syma. The universe pulses with transformations until it rests.*

⸻

## Outermost-First: The Big Pattern Wins

Here's where Syma gets interesting.

Type this:

```lisp
syma> :rule Outer {Outer {Inner x_}} → {Result x_}
Rule "Outer" added

syma> :rule Inner {Inner x_} → {Processed x_}
Rule "Inner" added

syma> {Outer {Inner 42}}
→ {Result 42}
```

Notice: The `Inner` rule never fired!

**Why?**

Syma uses **outermost-first** normalization. It always tries to match rules from the **outside in**, starting with the biggest pattern.

Here's what happened:

```
{Outer {Inner 42}}
```

The engine looks for rules that match the **whole expression first**:
- Does `Outer` match `{Outer {Inner 42}}`? **Yes!** (with `x_ = 42`)
- Apply it → `{Result 42}`

The `Inner` rule never got a chance because `Outer` consumed the whole pattern.

Compare this to **innermost-first** (like most functional languages), which would do:

```
{Outer {Inner 42}}
→ {Outer {Processed 42}}   ; Inner fires first
→ (Outer rule doesn't match anymore!)
```

🜛 *Outermost-first evaluation says: "Always replace the biggest pattern you can see. Think big, then refine."*

This is **human reasoning**. When you look at a problem, you don't start from the smallest details. You grasp the whole, then zoom in.

⸻

## Play: The Joy of Rewriting Your Own Mistakes

Let's make a mistake:

```lisp
syma> :rule Bad {Inc n_} → {Inc {Add n_ 1}}
Rule "Bad" added

syma> {Inc 5}
... (hangs) ...
^C
```

**Oops.** Infinite loop.

The rule says: "When you see `{Inc n_}`, replace it with `{Inc {Add n_ 1}}`"

But the replacement contains `{Inc ...}`! So the rule fires again... and again... forever:

```
{Inc 5}
→ {Inc {Add 5 1}}
→ {Inc {Add {Add 5 1} 1}}
→ {Inc {Add {Add {Add 5 1} 1} 1}}
→ ...
```

This is **not a bug**. This is you learning how rules work.

Fix it:

```lisp
syma> :drop Bad
Rule "Bad" removed

syma> :rule Inc {Inc n_} → {Add n_ 1}
Rule "Inc" added

syma> {Inc 5}
→ 6
```

Now it works! The rule transforms `{Inc n_}` into something that **doesn't match the rule again**.

🜛 *In Syma, you don't fight the compiler. You wrestle with transformation itself. Every mistake teaches you about patterns.*

⸻

## Tracing: Watch the Universe Think

Want to see exactly how rules transform expressions?

```lisp
syma> :trace
Trace mode: on

syma> {Double {Inc 3}}
Trace:
  Step 1: Rule "Inc" at path [1]
    {Double {Inc 3}}
    → {Double {Add 3 1}}

  Step 2: Rule "PrimitiveFold" at path [1]
    {Double {Add 3 1}}
    → {Double 4}

  Step 3: Rule "Double" at path []
    {Double 4}
    → {Mul 4 2}

  Step 4: Rule "PrimitiveFold" at path []
    {Mul 4 2}
    → 8

→ 8
```

Every step is visible. No hidden state. No black boxes.

Turn it off:

```lisp
syma> :trace
Trace mode: off
```

⸻

## Multiple Rules: Priority and Order

What happens when multiple rules could match?

```lisp
syma> :rule Specific {Process 0} → {Zero}
Rule "Specific" added

syma> :rule General {Process n_} → {NonZero n_}
Rule "General" added

syma> {Process 0}
→ {Zero}

syma> {Process 5}
→ {NonZero 5}
```

Both rules match `{Process 0}`, but `Specific` wins because it was defined **first**.

You can control this with **priorities**:

```lisp
syma> :rule High {Foo x_} → {HighPriority x_} 100
Rule "High" added

syma> :rule Low {Foo x_} → {LowPriority x_} 10
Rule "Low" added

syma> {Foo 42}
→ {HighPriority 42}
```

Higher priority = matches first (even if defined later).

⸻

## Guards: Conditional Matching

What if you want a rule to match only when a condition is true?

```lisp
syma> :rule PositiveInc {Inc n_} → {Add n_ 1} when {Gt n_ 0}
Rule "PositiveInc" added

syma> :rule NegativeInc {Inc n_} → {Error "Cannot increment negative"}
Rule "NegativeInc" added

syma> {Inc 5}
→ 6

syma> {Inc -1}
→ {Error "Cannot increment negative"}
```

The guard `when {Gt n_ 0}` is checked **after** the pattern matches but **before** the replacement happens.

⸻

## The REPL is Your Laboratory

The REPL isn't just for testing. It's where you **think** in Syma.

**Essential commands:**

```lisp
:help                  ; Show all commands
:rules                 ; List all rules
:rule Name             ; Show specific rule
:drop Name             ; Remove a rule
:clear                 ; Reset universe
:save filename.json    ; Save your work
:load filename.syma    ; Load a file
:trace                 ; Toggle trace mode
:quit                  ; Exit
```

Try them all.

⸻

## Your First Real Rule

Let's build something useful: a counter with state.

```lisp
syma> :rule InitCounter {InitCounter} → {State {Count 0}}
Rule "InitCounter" added

syma> :rule Increment {Inc {State {Count n_}}} → {State {Count {Add n_ 1}}}
Rule "Increment" added

syma> {Inc {InitCounter}}
→ {State {Count 1}}

syma> {Inc {Inc {InitCounter}}}
→ {State {Count 2}}
```

**What's happening:**

1. `{InitCounter}` → `{State {Count 0}}`
2. `{Inc {State {Count 0}}}` → `{State {Count 1}}`
3. `{Inc {State {Count 1}}}` → `{State {Count 2}}`

Each transformation carries the state forward.

🜛 *State isn't a variable you mutate. It's a pattern you transform.*

⸻

## Composing Rules

Rules compose naturally:

```lisp
syma> :rule Double {Double x_} → {Mul x_ 2}
Rule "Double" added

syma> :rule Triple {Triple x_} → {Mul x_ 3}
Rule "Triple" added

syma> :rule DoubleTriple {DoubleTriple x_} → {Double {Triple x_}}
Rule "DoubleTriple" added

syma> {DoubleTriple 5}
→ 30
```

Trace it to see the transformations:

```
{DoubleTriple 5}
→ {Double {Triple 5}}      ; DoubleTriple rule
→ {Double {Mul 5 3}}       ; Triple rule
→ {Double 15}              ; Mul primitive
→ {Mul 15 2}               ; Double rule
→ 30                       ; Mul primitive
```

⸻

## Exercises

**1. Fibonacci**

Write rules to compute Fibonacci numbers:

```lisp
:rule Fib0 {Fib 0} → 1
:rule Fib1 {Fib 1} → 1
:rule FibN {Fib n_} → {Add {Fib {Sub n_ 1}} {Fib {Sub n_ 2}}} when {Gt n_ 1}

{Fib 6}  ; → 13
```

**2. Factorial**

```lisp
:rule Fact0 {Fact 0} → 1
:rule FactN {Fact n_} → {Mul n_ {Fact {Sub n_ 1}}} when {Gt n_ 0}

{Fact 5}  ; → 120
```

**3. String Reversal**

Use the built-in `Concat` and pattern matching:

```lisp
; Hint: You'll need to think recursively!
```

⸻

## Key Takeaways

- Syma programs are **rules** that transform **patterns**
- **Normalization** applies rules until no more can fire
- **Outermost-first** means big patterns match before small ones
- The **REPL** is your laboratory for exploring transformations
- **Trace mode** shows you every step
- Rules compose naturally — build complexity from simplicity

⸻

## What's Next

You've written your first rules. You've seen normalization in action. You understand outermost-first evaluation.

Now it's time to master **pattern matching** — the heart of Syma.

**Next:** [Chapter 3: Pattern Matching and Matter Patching](./03-patterns-and-patching.md)

Or explore:
- [Chapter 4: Guards, Scopes, and Innermost](./04-guards-scopes-innermost.md) — Advanced control
- [Chapter 6: Building Worlds with Rules](./06-building-worlds.md) — Build real systems

⸻

🜛 *"The first rule you write changes how you see computation. The hundredth rule changes how you see reality."*

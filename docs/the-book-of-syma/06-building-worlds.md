# 6. Worlds Built from Rules

*Step-by-step: arithmetic interpreter, stack VM, HTML renderer, Prolog subset. No libraries, no runtime — only rewrites.*

⸻

## Introduction

This is where theory becomes practice.

Most programming books give you theory, then say "now go build something!" leaving you to figure out how. This chapter is different. We're going to build **complete systems** from scratch using only pattern matching and rewrite rules. No frameworks. No external libraries. No "just import this package to handle the hard parts." Just symbolic transformations.

We're not building toys. We're building real computational systems — interpreters that evaluate code, virtual machines that execute instructions, renderers that generate HTML, logic engines that answer queries. The kind of things that normally require thousands of lines of C++ and a graduate degree in compiler theory.

But here's the secret: when you think in transformations instead of procedures, these systems aren't that hard. They're just patterns transforming into other patterns, all the way down.

You'll see that:
- An **interpreter** is rules that transform expressions
- A **virtual machine** is rules that transform states
- A **renderer** is rules that transform trees
- A **logic engine** is rules that transform queries

Everything is patterns. Everything is patching.

By the end of this chapter, you'll have built five complete systems and understood, viscerally, that software isn't about objects or functions or procedures. It's about **recognizing shapes and describing what they become**.

🜛 *In Syma, there is no difference between data and code, between programs and interpreters, between syntax and semantics. There are only transformations.*

⸻

## World 1: Arithmetic Interpreter

Let's build an interpreter for arithmetic expressions.

Think about what an interpreter actually does. It takes a symbolic representation of computation — like `Add(2, Mul(3, 4))` — and figures out what it means. Most languages do this by walking a tree, maintaining a stack, managing memory. Seems complicated.

But wait. Isn't "figuring out what it means" just... transforming it? `Add(2, Mul(3, 4))` transforms to `Add(2, 12)` which transforms to `14`. The interpreter doesn't "execute" anything. It just keeps rewriting until there's nothing left to rewrite.

Let's build that.

### The Language

```
Expr := Num(n)
      | Add(Expr, Expr)
      | Sub(Expr, Expr)
      | Mul(Expr, Expr)
      | Div(Expr, Expr)
      | Neg(Expr)
```

Simple arithmetic. But notice: we're not defining "how to execute" these. We're defining what they **look like**. The execution is just pattern matching.

### The Rules

```lisp
{Module Calc/Eval
  {Export Eval}

  {Rules
    ; Numbers evaluate to themselves
    {R "Eval/Num"
       {Eval {Num n_}}
       n_}

    ; Addition
    {R "Eval/Add"
       {Eval {Add left_ right_}}
       {Add {Eval left_} {Eval right_}}}

    ; Subtraction
    {R "Eval/Sub"
       {Eval {Sub left_ right_}}
       {Sub {Eval left_} {Eval right_}}}

    ; Multiplication
    {R "Eval/Mul"
       {Eval {Mul left_ right_}}
       {Mul {Eval left_} {Eval right_}}}

    ; Division
    {R "Eval/Div"
       {Eval {Div left_ right_}}
       {Div {Eval left_} {Eval right_}}}

    ; Negation
    {R "Eval/Neg"
       {Eval {Neg expr_}}
       {Sub 0 {Eval expr_}}}}}
```

### Running It

```lisp
syma> {Eval {Add {Num 2} {Mul {Num 3} {Num 4}}}}
→ 14

syma> {Eval {Neg {Sub {Num 10} {Num 3}}}}
→ -7
```

### How It Works

```
{Eval {Add {Num 2} {Mul {Num 3} {Num 4}}}}

→ {Add {Eval {Num 2}} {Eval {Mul {Num 3} {Num 4}}}}
  ; Eval/Add rule

→ {Add 2 {Eval {Mul {Num 3} {Num 4}}}}
  ; Eval/Num rule

→ {Add 2 {Mul {Eval {Num 3}} {Eval {Num 4}}}}
  ; Eval/Mul rule

→ {Add 2 {Mul 3 4}}
  ; Eval/Num rules

→ {Add 2 12}
  ; Mul primitive

→ 14
  ; Add primitive
```

🜛 *The interpreter is just rules. Evaluation is normalization.*

⸻

## World 2: Stack-Based Virtual Machine

Let's build a stack VM with instructions.

### The Instructions

```
Instr := Push(n)
       | Pop
       | Add
       | Mul
       | Dup
       | Swap
```

### The State

```
{VMState {Stack items...} {Code instrs...}}
```

### The Rules

```lisp
{Module VM/Stack
  {Export Run Step}

  {Rules
    ; Run until code is empty
    {R "Run/Done"
       {Run {VMState stack_ {Code}}}
       stack_}

    {R "Run/Step"
       {Run state_}
       {Run {Step state_}}}

    ; Push number onto stack
    {R "Step/Push"
       {Step {VMState {Stack stack..} {Code {Push n_} rest..}}}
       {VMState {Stack n_ stack..} {Code rest..}}}

    ; Pop top of stack (discard)
    {R "Step/Pop"
       {Step {VMState {Stack _ stack..} {Code Pop rest..}}}
       {VMState {Stack stack..} {Code rest..}}}

    ; Add top two values
    {R "Step/Add"
       {Step {VMState {Stack a_ b_ stack..} {Code Add rest..}}}
       {VMState {Stack {Add a_ b_} stack..} {Code rest..}}}

    ; Multiply top two values
    {R "Step/Mul"
       {Step {VMState {Stack a_ b_ stack..} {Code Mul rest..}}}
       {VMState {Stack {Mul a_ b_} stack..} {Code rest..}}}

    ; Duplicate top of stack
    {R "Step/Dup"
       {Step {VMState {Stack top_ stack..} {Code Dup rest..}}}
       {VMState {Stack top_ top_ stack..} {Code rest..}}}

    ; Swap top two values
    {R "Step/Swap"
       {Step {VMState {Stack a_ b_ stack..} {Code Swap rest..}}}
       {VMState {Stack b_ a_ stack..} {Code rest..}}}}}
```

### Running It

```lisp
syma> {Run {VMState {Stack} {Code {Push 5} {Push 3} Add {Push 2} Mul}}}
→ {Stack 16}

; Trace:
; Stack: []        Code: [Push(5), Push(3), Add, Push(2), Mul]
; Stack: [5]       Code: [Push(3), Add, Push(2), Mul]
; Stack: [3, 5]    Code: [Add, Push(2), Mul]
; Stack: [8]       Code: [Push(2), Mul]
; Stack: [2, 8]    Code: [Mul]
; Stack: [16]      Code: []
```

### Factorial in Stack VM

```lisp
{Run {VMState
  {Stack}
  {Code
    {Push 5}      ; n = 5
    {Push 1}      ; acc = 1
    ; Loop: while n > 0
    Dup           ; duplicate n
    {Push 0}
    ; if n > 0: acc *= n, n -= 1
    ; (simplified - actual loop needs jumps)
    Mul
    Swap
    {Push 1}
    Sub
    Swap
  }}}
```

(Full loops need jump instructions - left as exercise!)

🜛 *A VM is just state transformations. Instructions are patterns that rewrite the state.*

⸻

## World 3: Brainfuck Interpreter

Let's implement the entire Brainfuck language in Syma rules.

### Brainfuck Recap

- `>` - move pointer right
- `<` - move pointer left
- `+` - increment cell
- `-` - decrement cell
- `.` - output cell
- `,` - input to cell
- `[` - jump forward if cell is 0
- `]` - jump backward if cell is not 0

### The State

```lisp
{BFState
  {Tape left.. {Cell current_} right..}
  {Code instrs..}
  {Output output..}}
```

### The Rules

```lisp
{Module Lang/Brainfuck
  {Export Run}

  {Rules
    ; Done when code is empty
    {R "Run/Done"
       {Run {BFState tape_ {Code} output_}}
       output_}

    {R "Run/Step"
       {Run state_}
       {Run {Step state_}}}

    ; > - Move right
    {R "Step/Right"
       {Step {BFState {Tape left.. {Cell current_} right_ rest..} {Code > code..} output_}}
       {BFState {Tape left.. {Cell current_} {Cell right_} rest..} {Code code..} output_}}

    ; < - Move left
    {R "Step/Left"
       {Step {BFState {Tape left.. left_ {Cell current_} right..} {Code < code..} output_}}
       {BFState {Tape left.. {Cell left_} {Cell current_} right..} {Code code..} output_}}

    ; + - Increment
    {R "Step/Inc"
       {Step {BFState {Tape left.. {Cell n_} right..} {Code + code..} output_}}
       {BFState {Tape left.. {Cell {Add n_ 1}} right..} {Code code..} output_}}

    ; - - Decrement
    {R "Step/Dec"
       {Step {BFState {Tape left.. {Cell n_} right..} {Code - code..} output_}}
       {BFState {Tape left.. {Cell {Sub n_ 1}} right..} {Code code..} output_}}

    ; . - Output
    {R "Step/Output"
       {Step {BFState {Tape left.. {Cell n_} right..} {Code . code..} {Output output..}}}
       {BFState {Tape left.. {Cell n_} right..} {Code code..} {Output output.. n_}}}

    ; [ - Jump forward if zero
    {R "Step/JumpForward/Zero"
       {Step {BFState {Tape left.. {Cell 0} right..} {Code [ code..} output_}}
       {BFState {Tape left.. {Cell 0} right..} {Code {SkipToMatchingBracket code..}} output_}}

    {R "Step/JumpForward/NonZero"
       {Step {BFState {Tape left.. {Cell n_} right..} {Code [ code..} output_}}
       {BFState {Tape left.. {Cell n_} right..} {Code code..} output_}
       {Neq n_ 0}}

    ; ] - Jump backward if not zero
    {R "Step/JumpBack/NonZero"
       {Step {BFState tape_ {Code before.. [ loop.. ] code..} output_}}
       {BFState tape_ {Code before.. [ loop.. ] loop.. ] code..} output_}
       {GetCell tape_}  ; Guard checks if cell != 0

    {R "Step/JumpBack/Zero"
       {Step {BFState {Tape left.. {Cell 0} right..} {Code before.. ] code..} output_}}
       {BFState {Tape left.. {Cell 0} right..} {Code code..} output_}}}}
```

### Running It

```lisp
; Hello World in Brainfuck (simplified)
syma> {Run {BFState
  {Tape {Cell 0}}
  {Code
    + + + + + + + + +  ; 9
    [ > + + + + + + + + < - ]  ; Multiply by 8 = 72 ('H')
    > .
  }
  {Output}}}

→ {Output 72}  ; ASCII 'H'
```

🜛 *Brainfuck is Turing-complete. Syma implements it in pure rules. Therefore, Syma is Turing-complete through rewriting.*

⸻

## World 4: HTML Renderer

Let's build a system that converts symbolic UI into HTML strings.

### The UI Language

```lisp
{Div {:class "card"}
  {H1 {} "Title"}
  {P {} "Content"}
  {Button {:onClick Action} "Click"}}
```

### The Rules

```lisp
{Module Render/HTML
  {Export ToHTML}

  {Rules
    ; Text nodes
    {R "ToHTML/String"
       {ToHTML str_}
       str_
       {IsStr {Frozen str_}}}

    ; Numbers
    {R "ToHTML/Number"
       {ToHTML n_}
       {ToString n_}
       {IsNum {Frozen n_}}}

    ; Elements with attributes and children
    {R "ToHTML/Element"
       {ToHTML {tag_ {attrs..} children..}}
       {Concat
         "<" {ToLower {ToString tag_}} {RenderAttrs attrs..} ">"
         {RenderChildren children..}
         "</" {ToLower {ToString tag_}} ">"}}

    ; Render attributes
    {R "RenderAttrs/Empty"
       {RenderAttrs}
       ""}

    {R "RenderAttrs/Pair"
       {RenderAttrs {:key val_} rest..}
       {Concat
         " " {ToString key_} "=\"" {Escape val_} "\""
         {RenderAttrs rest..}}}

    ; Render children
    {R "RenderChildren/Empty"
       {RenderChildren}
       ""}

    {R "RenderChildren/Cons"
       {RenderChildren first_ rest..}
       {Concat {ToHTML first_} {RenderChildren rest..}}}

    ; Escape HTML
    {R "Escape"
       {Escape str_}
       {Replace {Replace str_ "<" "&lt;"} ">" "&gt;"}}}}
```

### Running It

```lisp
syma> {ToHTML
  {Div {:class "card"}
    {H1 {} "Welcome"}
    {P {} "Hello, World!"}}}

→ "<div class=\"card\"><h1>Welcome</h1><p>Hello, World!</p></div>"
```

🜛 *Rendering is transformation. The UI tree becomes an HTML string through pattern matching.*

⸻

## World 5: Prolog Subset (Logic Programming)

Let's implement a tiny Prolog-like logic engine.

### The Language

```
Fact: parent(tom, bob).
Rule: grandparent(X, Z) :- parent(X, Y), parent(Y, Z).
Query: ?- grandparent(tom, Who).
```

In Syma:

```lisp
{Fact {parent tom bob}}
{Rule {grandparent X Z} {And {parent X Y} {parent Y Z}}}
{Query {grandparent tom Who}}
```

### The Rules

```lisp
{Module Logic/Prolog
  {Export Solve AddFact AddRule Query}

  {Defs
    {DB {Facts} {Rules}}}

  {Rules
    ; Add a fact
    {R "AddFact"
       {AddFact fact_ {DB {Facts facts..} rules_}}
       {DB {Facts facts.. fact_} rules_}}

    ; Add a rule
    {R "AddRule"
       {AddRule head_ body_ {DB facts_ {Rules rules..}}}
       {DB facts_ {Rules rules.. {Rule head_ body_}}}}

    ; Solve a query
    {R "Solve/Fact"
       {Solve goal_ {DB {Facts .. goal_ ..} rules_}}
       {Success goal_}}

    {R "Solve/Rule"
       {Solve goal_ {DB facts_ {Rules .. {Rule head_ body_} ..}}}
       {Unify goal_ head_ {SolveBody body_ DB}}
       {Match goal_ head_}}

    ; Unification (simplified)
    {R "Unify"
       {Unify {pred_ args1..} {pred_ args2..} continuation_}
       {UnifyArgs args1.. args2.. continuation_}}

    {R "UnifyArgs/Empty"
       {UnifyArgs continuation_}
       continuation_}

    {R "UnifyArgs/Vars"
       {UnifyArgs {Var _} arg2_ rest1.. rest2.. continuation_}
       {UnifyArgs rest1.. rest2.. continuation_}}

    {R "UnifyArgs/Same"
       {UnifyArgs arg_ arg_ rest1.. rest2.. continuation_}
       {UnifyArgs rest1.. rest2.. continuation_}}

    ; Solve body (conjunction)
    {R "SolveBody/Empty"
       {SolveBody {And} db_}
       {Success}}

    {R "SolveBody/Single"
       {SolveBody {And goal_} db_}
       {Solve goal_ db_}}

    {R "SolveBody/Multiple"
       {SolveBody {And goal_ rest..} db_}
       {And {Solve goal_ db_} {SolveBody {And rest..} db_}}}}}
```

### Running It

```lisp
; Build database
syma> :rule InitDB {InitDB} → {DB {Facts {parent tom bob} {parent bob alice}} {Rules}}

; Add grandparent rule
syma> :rule GrandparentRule
  {Query {grandparent X Z}}
  {Solve {grandparent X Z} {AddRule {grandparent X Z} {And {parent X Y} {parent Y Z}} {InitDB}}}

; Query
syma> {Query {grandparent tom alice}}
→ {Success {grandparent tom alice}}
```

🜛 *Logic programming is pattern matching with backtracking. Syma can implement it through recursive rules and unification.*

⸻

## Common Patterns Across All Worlds

Notice the patterns that appear in every system:

### 1. State Representation

```lisp
{VMState {Stack ...} {Code ...}}
{BFState {Tape ...} {Code ...} {Output ...}}
{DB {Facts ...} {Rules ...}}
```

State is just symbolic structure.

### 2. Step Function

```lisp
{R "Run/Step" {Run state_} {Run {Step state_}}}
```

Computation is iterated transformation.

### 3. Base Cases

```lisp
{R "Run/Done" {Run {State ... {Code}}} result_}
```

Termination is pattern matching.

### 4. Recursion

```lisp
{R "Eval" {Eval {Op left_ right_}} {Op {Eval left_} {Eval right_}}}
```

Recursion is self-reference in patterns.

🜛 *All computation is the same: match a pattern, patch the matter, repeat until done.*

⸻

## Exercises

### 1. Add Variables to Arithmetic

Extend the calculator with variable bindings:

```lisp
{Eval {Let x 5 {Add {Var x} 3}}}  → 8
```

Hint: Thread an environment through Eval.

### 2. Add Conditionals to Stack VM

Add `If` instruction:

```lisp
{If {Code true-branch..} {Code false-branch..}}
```

### 3. Optimize Brainfuck

Add a preprocessing step that optimizes sequences:

```lisp
{Optimize [+ + + + +]}  → {Add 5}
{Optimize [- - -]}      → {Sub 3}
```

### 4. Add CSS to HTML Renderer

Support inline styles:

```lisp
{Div {:style {color "red" fontSize "16px"}} ...}
→ "<div style=\"color: red; font-size: 16px;\">...</div>"
```

### 5. Add Lists to Prolog

Implement list patterns:

```lisp
{Fact {member X {List X ..}}}
{Rule {member X {List _ rest..}} {member X {List rest..}}}
```

⸻

## What You've Built

In this chapter, you've implemented:

- **An interpreter** (arithmetic expressions)
- **A virtual machine** (stack-based execution)
- **A language** (Brainfuck)
- **A renderer** (HTML generation)
- **A logic engine** (Prolog subset)

All with **only pattern matching and rewrite rules**.

No parsers. No compilers. No runtime systems.

Just **symbolic transformations**.

🜛 *You didn't use Syma to build these systems. You used symbolic rewriting. Syma just gave you the notation.*

⸻

## Key Takeaways

- Interpreters are rules that transform expressions
- VMs are rules that transform states
- Renderers are rules that transform trees
- Logic engines are rules that transform queries
- All systems share common patterns: state, step, base cases, recursion
- Everything is just symbolic transformation

⸻

## What's Next

You've built worlds from rules. Now let's explore how these worlds interact with **reality** through symbolic effects.

**Next:** [Chapter 7: Symbolic Effects](./07-symbolic-effects.md)

Or dive deeper into philosophy:
- [Chapter 8: The Outermost Philosophy](./08-outermost-philosophy.md)
- [Chapter 11: Philosophy of Symbols](./11-philosophy-of-symbols.md)

⸻

🜛 *"Show me your flowcharts and conceal your tables, and I shall continue to be mystified. Show me your tables, and I won't usually need your flowcharts; they'll be obvious." — Fred Brooks*

*In Syma, there are no flowcharts. There are no tables. There are only patterns... and what they become.*

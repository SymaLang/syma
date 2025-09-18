# The Syma Language Tutorial
## A Step-by-Step Guide to Symbolic Programming

Welcome to Syma! This tutorial will take you from zero to building interactive applications using our symbolic programming language. By the end, you'll understand how to create reactive UIs, manage state, and even build complex systems like interpreters—all through pattern matching and rewrite rules.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Your First Program: Counter](#2-your-first-program-counter)
3. [Understanding Rules and Pattern Matching](#3-understanding-rules-and-pattern-matching)
4. [Building Interactive UIs](#4-building-interactive-uis)
5. [Working with Lists and Data](#5-working-with-lists-and-data)
6. [Advanced Patterns: Todo App](#6-advanced-patterns-todo-app)
7. [Symbolic Effects and I/O](#7-symbolic-effects-and-io)
8. [Complex State Machines: Brainfuck Interpreter](#8-complex-state-machines-brainfuck-interpreter)
9. [Tips and Best Practices](#9-tips-and-best-practices)

---

## 1. Getting Started

### What is Syma?

Syma is a symbolic programming language where everything is an expression, and computation happens through pattern matching and rewriting. Instead of imperatively telling the computer what to do step by step, you define transformation rules that describe how your program evolves.

### Core Concepts

- **Everything is an S-expression**: `(Head arg1 arg2 ...)`
- **Programs transform through rules**: Pattern → Replacement
- **State is immutable**: Each transformation creates a new state
- **UI is declarative**: Describe what you want, not how to build it

### Your First Expression

```lisp
(Add 2 3)  ; This evaluates to 5
```

The runtime has built-in primitives that automatically fold:

```lisp
(Concat "Hello " "World")  ; → "Hello World"
(Mul (Add 1 2) 4)          ; → 12
```

---

## 2. Your First Program: Counter

Let's build a simple counter to understand the basics:

```lisp
(Universe
  ;; The Program section contains your app
  (Program
    (App
      ;; State holds your data
      (State (Count 0))

      ;; UI describes the interface
      (UI
        (Div :class "card"
          (H1 "Counter")
          (P "Value: " (Show Count))
          (Button :onClick Inc :class "btn" "Increment")))))

  ;; Rules define how your program transforms
  (Rules
    ;; This rule "lifts" Apply through the Program and App layers
    (R "LiftApplyThroughProgramAndApp"
       (Apply act_ (Program (App st_ ui_) eff_))
       (Program (App (Apply act_ st_) ui_) eff_))

    ;; This rule handles the Inc action
    (R "Inc"
       (Apply Inc (State (Count n_)))
       (State (Count (Add n_ 1))))

    ;; This rule shows the count value
    (R "ShowCount"
       (/@ (Show Count) (App (State (Count n_)) _))
       n_)))
```

### Breaking It Down

1. **State**: `(State (Count 0))` - Your counter starts at 0
2. **UI**: Uses familiar HTML-like elements with `:onClick` handlers
3. **Rules**:
   - Lifting rules propagate actions through containers
   - The `Inc` rule matches the increment action and updates state
   - The `ShowCount` rule projects the count value for display

### How Events Work

When you click "Increment":
1. Runtime wraps: `(Apply Inc (Program ...))`
2. Lifting rule pushes `Apply` down to state level
3. `Inc` rule matches and transforms: `(Count 0)` → `(Count 1)`
4. UI re-renders with new state

---

## 3. Understanding Rules and Pattern Matching

### Basic Pattern Variables

```lisp
;; Explicit syntax
(Var name)    ; Captures a value as "name"

;; Shorthand syntax (preferred)
name_         ; Same as (Var name)
```

### Wildcards

```lisp
_             ; Matches anything, doesn't bind
```

### Rest Variables (Variadics)

```lisp
items___      ; Matches zero or more items
___           ; Wildcard rest (matches but doesn't bind)
```

### Pattern Matching Examples

```lisp
;; Match a specific structure
(R "FindItem"
   (Items (Item (Id 5) title_ done_) rest___)
   (Found title_))

;; Match with wildcards
(R "GetMiddle"
   (List _ middle_ _)
   middle_)

;; Match lists with rest
(R "GetTail"
   (List head_ tail___)
   tail___)
```

### Rule Priorities

Higher priority rules match first:

```lisp
(R "SpecificCase" pattern1 replacement1 10)  ; Priority 10
(R "GeneralCase"  pattern2 replacement2)      ; Default priority (0)
```

---

## 4. Building Interactive UIs

### UI Elements

Syma provides a React-like DSL for building UIs:

```lisp
(Div :class "container"
  (H1 "Title")
  (P "Some text")
  (Button :onClick DoSomething "Click me")
  (Input :type "text"
         :value (Input fieldName)
         :placeholder "Enter text..."))
```

### Dynamic Content with Show

Use `(Show expression)` to display computed values:

```lisp
(Span "Count: " (Show ItemCount))
```

The `Show` projection is resolved by rules:

```lisp
(R "ShowItemCount"
   (/@ (Show ItemCount) (App (State data_) _))
   (Length data_))
```

### Projection for Complex Rendering

`(Project expression)` evaluates an expression and renders the result:

```lisp
(UI
  (Div
    (H1 "Dynamic List")
    (Project (RenderItems))))

(R "RenderItems"
   (/@ (RenderItems) (App (State (Items items___)) _))
   (Ul (MapItems items___)))
```

---

## 5. Working with Lists and Data

### Lists Are Not Primitive

In Syma, lists are just sequences of arguments. We use pattern matching to work with them:

```lisp
;; Empty list
(Items)

;; List with items
(Items (Item 1) (Item 2) (Item 3))
```

### Common List Patterns

#### Counting Items

```lisp
(R "Length/Nil"
   (Length)
   0)

(R "Length/Cons"
   (Length item_ rest___)
   (Add 1 (Length rest___)))
```

#### Filtering

```lisp
(R "FilterEven/Nil"
   (FilterEven)
   (Items))

(R "FilterEven/Keep"
   (FilterEven n_ rest___)
   (Items n_ (FilterEven rest___))
   (Eq (Mod n_ 2) 0))

(R "FilterEven/Skip"
   (FilterEven n_ rest___)
   (FilterEven rest___)
   (Neq (Mod n_ 2) 0))
```

#### Mapping

```lisp
(R "DoubleAll/Nil"
   (DoubleAll)
   (Items))

(R "DoubleAll/Cons"
   (DoubleAll n_ rest___)
   (Items (Mul n_ 2) (DoubleAll rest___)))
```

---

## 6. Advanced Patterns: Todo App

Let's examine key patterns from the todo app:

### Complex State Structure

```lisp
(State
  (TodoState
    (NextId 1)                    ; Auto-incrementing ID
    (Items)                       ; List of todos
    (Filter All)))                ; Current filter
```

### Adding Items with Input

```lisp
(Input :type "text"
       :value (Input todoInput)
       :onKeydown (When (KeyIs "Enter")
                    (PreventDefault
                      (Seq
                        (AddTodoWithTitle (Input todoInput))
                        (ClearInput todoInput)))))
```

### Action Combinators

```lisp
;; Sequential actions
(Seq
  (AddTodo)
  (SetFilter Active))

;; Conditional actions
(When (IsEmpty (Input field))
      (ShowError "Field required"))

;; Prevent default browser behavior
(PreventDefault (SubmitForm))
```

### Pattern Matching on Lists

```lisp
;; Find and toggle a specific item
(R "Toggle"
   (Apply (Toggle id_)
     (TodoState (NextId n_)
                (Items before___
                       (Item (Id id_) (Title t_) (Done d_))
                       after___)
                (Filter f_)))
   (TodoState (NextId n_)
              (Items before___
                     (Item (Id id_) (Title t_) (Done (Flip d_)))
                     after___)
              (Filter f_)))
```

### Recursive List Rendering

```lisp
(R "RenderItems/Cons"
   (RenderItems (Item (Id i_) (Title t_) (Done d_)) rest___)
   (Div :class "todo-item"
     (Button :onClick (Toggle i_) (If d_ "✅" "⬜"))
     (Span :class (If d_ "done" "active") t_)
     (Button :onClick (Remove i_) "×")
     (RenderItems rest___))
   1)  ; Higher priority than Nil case

(R "RenderItems/Nil"
   (RenderItems)
   (Span))  ; Empty terminator
```

---

## 7. Symbolic Effects and I/O

### The Effects System

All I/O in Syma is symbolic—represented as data in your program:

```lisp
(Program
  (App ...)
  (Effects
    (Pending)    ; Outgoing effect requests
    (Inbox)))    ; Incoming effect responses
```

### Timer Example

```lisp
;; Enqueue a timer
(R "StartTimer/Enqueue"
   (Apply StartTimer (Program app_ (Effects (Pending p___) inbox_)))
   (Program app_
            (Effects (Pending p___ (Timer (FreshId) (Delay 2000)))
                     inbox_))
   10)  ; High priority

;; Handle timer completion
(R "TimerComplete/Process"
   (Program app_
            (Effects pending_
                     (Inbox (TimerComplete id_ _) rest___)))
   (Program (Apply DoSomething app_)
            (Effects pending_ (Inbox rest___))))
```

### Print Effect

```lisp
;; Enqueue print
(R "TestPrint/Enqueue"
   (Apply TestPrint (Program (App (State data_) ui_) effects_))
   (Program (App (State data_) ui_)
            (Effects (Pending (Print (FreshId)
                                    (Message (Concat "Data: " data_))))
                     (Inbox))))

;; Consume print response
(R "PrintComplete/Process"
   (Program app_
            (Effects pending_
                     (Inbox (PrintComplete _ _) rest___)))
   (Program app_
            (Effects pending_ (Inbox rest___))))
```

### Benefits of Symbolic Effects

- **Pure**: No side effects in your rules
- **Testable**: Mock effects by manipulating inbox
- **Debuggable**: See entire effect history in AST
- **Composable**: Transform effects with rules

---

## 8. Complex State Machines: Brainfuck Interpreter

The Brainfuck interpreter demonstrates advanced patterns:

### Zipper Pattern for Tape Navigation

```lisp
(BFState
  left_     ; List to the left (reversed)
  curr_     ; Current cell
  right_    ; List to the right
  ip_       ; Instruction pointer
  code_     ; Program code
  out_)     ; Output buffer
```

### Moving on the Tape

```lisp
;; Move right
(R "BFExec/Right/Cons"
   (BFExec ">" left_ curr_ (Cons first_ rest_) ip_ code_ out_)
   (BFState (Cons curr_ left_) first_ rest_ (Add ip_ 1) code_ out_))

;; Move left
(R "BFExec/Left/Cons"
   (BFExec "<" (Cons first_ rest_) curr_ right_ ip_ code_ out_)
   (BFState rest_ first_ (Cons curr_ right_) (Add ip_ 1) code_ out_))
```

### Conditional Guards

```lisp
(R "BFExec/Dec/NonZero"
   (BFExec "-" left_ curr_ right_ ip_ code_ out_)
   (BFState left_ (Sub curr_ 1) right_ (Add ip_ 1) code_ out_)
   (Gt curr_ 0))  ; Guard: only if curr > 0
```

### Recursive Bracket Matching

```lisp
(R "FindMatchingBracket/Found"
   (FindMatchingBracket code_ pos_ _ 0)
   pos_
   (Eq (Substring code_ pos_ (Add pos_ 1)) "]"))

(R "FindMatchingBracket/OpenBracket"
   (FindMatchingBracket code_ pos_ dir_ depth_)
   (FindMatchingBracket code_ (Add pos_ dir_) dir_ (Add depth_ 1))
   (Eq (Substring code_ pos_ (Add pos_ 1)) "["))
```

### Timer-Based Execution

```lisp
(R "BFStepTimer/Process"
   (Program (App (State bf_state_) ui_)
            (Effects pending_
                     (Inbox (TimerComplete (BFStepTimer count_) _) rest___)))
   (If (And (Lt ip_ (StrLen code_)) (Lt count_ 10000))
       ;; Continue execution
       (Program (Apply Step (App (State bf_state_) ui_))
                (Effects (Pending (Timer (BFStepTimer (Add count_ 1))
                                        (Delay 0)))
                         (Inbox rest___)))
       ;; Stop execution
       (Program (App (State bf_state_) ui_)
                (Effects pending_ (Inbox rest___))))
```

---

## 9. Tips and Best Practices

### 1. Start Simple
Begin with basic state and a few rules. Add complexity gradually.

### 2. Use Meaningful Names
```lisp
;; Good
(R "Toggle/ItemById" ...)

;; Less clear
(R "Rule1" ...)
```

### 3. Organize Rules by Function
```lisp
;; --- State Management ---
(R "AddItem" ...)
(R "RemoveItem" ...)

;; --- UI Rendering ---
(R "RenderList" ...)
(R "ShowCount" ...)

;; --- Effects ---
(R "Timer/Enqueue" ...)
(R "Timer/Process" ...)
```

### 4. Use Guards for Conditional Rules
```lisp
(R "Divide"
   (Div n_ d_)
   (Div n_ d_)    ; Keep symbolic
   (Eq d_ 0))     ; Guard: when denominator is 0

(R "Divide/Normal"
   (Div n_ d_)
   (ActuallyDivide n_ d_)
   (Neq d_ 0))    ; Guard: when denominator is not 0
```

### 5. Leverage Priority for Specificity
```lisp
(R "SpecialCase" pattern result 10)     ; High priority
(R "GeneralCase" pattern result)        ; Default
```

### 6. Debug with Trace Mode
Add `?trace` to your URL to see each rule application:
```
Applying rule "AddItem" at path [0,0,0]
Pattern: (Apply AddItem (State ...))
Result: (State (Items ...))
```

### 7. Keep Effects Symbolic
Don't try to perform I/O directly. Enqueue symbolic effects and let the runtime handle them:
```lisp
;; Good: Symbolic
(Effects (Pending (HttpReq id_ (Url "/api/data"))))

;; Bad: Trying to be imperative (won't work)
(FetchDataNow "/api/data")
```

### 8. Think in Transformations
Instead of "How do I update X?", think "What rule transforms X into X'?"

### 9. Use Higher-Order Patterns
Create generic rules that work with many cases:
```lisp
(R "Map/Nil"
   (Map _ Nil)
   Nil)

(R "Map/Cons"
   (Map f_ (Cons x_ xs_))
   (Cons (Apply f_ x_) (Map f_ xs_)))
```

### 10. Test Incrementally
- Test individual rules in isolation
- Build up complex behavior from simple rules
- Use the REPL mindset: small changes, immediate feedback

---

## Conclusion

Syma offers a unique approach to programming where:
- **Everything is data** (S-expressions)
- **Computation is transformation** (rewrite rules)
- **Effects are symbolic** (pure functional I/O)
- **UI is declarative** (describe, don't construct)

Start with simple programs like the counter, explore list manipulation with todos, and when you're ready, dive into complex state machines like the Brainfuck interpreter. The key is understanding that you're not writing instructions—you're defining transformations that evolve your program from one state to another.

Happy symbolic programming!

---

## Quick Reference

### Common Primitives
- Arithmetic: `Add`, `Sub`, `Mul`, `Div`, `Mod`
- Strings: `Concat`, `StrLen`, `Substring`
- Comparison: `Eq`, `Neq`, `Lt`, `Gt`, `Lte`, `Gte`
- Boolean: `And`, `Or`, `Not`
- Type checking: `IsNum`, `IsStr`, `IsSym`

### UI Elements
- Containers: `Div`, `Span`
- Text: `H1`-`H6`, `P`
- Interactive: `Button`, `Input`
- Lists: `Ul`, `Li`

### Action Combinators
- `Seq`: Sequential execution
- `If`/`When`: Conditionals
- `PreventDefault`: Event control
- `Input`/`ClearInput`: Form handling

### Effect Types
- `Timer`: Delayed execution
- `HttpReq`: HTTP requests
- `Print`: Console output
- `RandRequest`: Random numbers

---

*Remember: In Syma, you don't tell the computer what to do—you describe how things transform.*
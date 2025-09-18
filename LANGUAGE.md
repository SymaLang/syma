# Symbolic S-Expression Language Documentation

## 1. Introduction

This document describes a symbolic language based on S-expressions. The language uses symbolic expressions (S-expressions) as its core syntax and compiles these expressions into a JSON Abstract Syntax Tree (AST) representation. It is designed to express programs, rules, and transformations in a concise and symbolic manner. The language supports atoms, function calls, special forms, pattern matching with wildcards, and a structured universe of programs and rules that can be normalized by applying rewrite rules repeatedly.

---

## 2. Atoms

Atoms are the fundamental building blocks of the language. There are three types of atoms:

- **Num**: Numeric literals, such as `42`, `3.14`
- **Str**: String literals, enclosed in double quotes, e.g., `"hello"`, `"Name"`
- **Sym**: Symbols, which are identifiers or names, e.g., `x`, `Show`, `Call`, `True`, `False`

Atoms represent constant values or symbolic identifiers in the language.

---

## 3. Calls

A **Call** is an S-expression where the first element is the head (function or operator) and the rest are arguments. The syntax is:

```lisp
(Head arg1 arg2 …)
```

This corresponds to a `Call` node in the JSON AST with a `head` and a list of `args`. For example:

```lisp
(Add 1 2)
```

represents a call to `Add` with arguments `1` and `2`.

Calls can be nested arbitrarily to represent complex expressions.

---

## 4. Pattern Matching and Variables

### Basic Variables

The language uses pattern variables for matching and binding values in rules:

```lisp
(Var name)
```

This represents a pattern variable that matches any expression and binds it to `name`. Variables are used in rule patterns to capture values that can be referenced in the replacement.

### Wildcard Patterns

The special variable `_` acts as a wildcard that matches any value without binding:

```lisp
(Var _)  ; Matches any single expression, discards the value
```

This is useful when you need to match a structure but don't care about certain values.

### Rest Variables (Variadics)

Rest variables match zero or more elements in a sequence:

```lisp
(Var xs___)  ; Using the triple underscore suffix
; or
(VarRest xs)  ; Explicit rest variable
```

For wildcards that match any sequence:

```lisp
(Var ___)    ; Matches any sequence without binding
```

Example pattern matching a list with rest variables:
```lisp
(Items (Var first) (Var rest___))  ; Matches first item and rest of the list
```

---

## 5. Universe Structure

The top-level structure of a program is the **Universe**, which organizes the program and its rules:

```lisp
(Universe
  (Program …)
  (Rules …)
  (RuleRules …))  ; Optional meta-rules
```

- **Program**: Contains the main expressions or state of the program
- **Rules**: Contains rewrite rules that define transformations
- **RuleRules**: Optional meta-rules that can rewrite the rules themselves before application

---

## 6. Rules and Rewriting

### Basic Rule Structure

Rules define pattern-based transformations:

```lisp
(R "Name" pattern replacement priority?)
```

- `"Name"`: A string identifier for the rule
- `pattern`: An expression pattern to match
- `replacement`: The expression that replaces matches
- `priority`: Optional numeric priority (higher values apply first)

### Pattern Matching

Patterns can include:
- Literal atoms that must match exactly
- `(Var name)` to capture and bind values
- `(Var _)` as wildcards
- `(Var name___)` for rest patterns
- Nested structures combining all of the above

### Normalization Strategy

The runtime uses an outermost-first strategy:
1. Try to match rules at the current expression level
2. If no match, recurse into sub-expressions
3. Apply the highest-priority matching rule
4. Repeat until fixed point (no rules match)

### Built-in Operations

The runtime provides primitive operations that are folded during normalization:
- `(Add num1 num2)` → evaluates to the sum

---

## 7. UI DSL and Rendering

### UI Elements

The language includes a DSL for defining user interfaces:

```lisp
(Div :class "card"
  (H1 "Title")
  (Button :onClick ActionName "Click me"))
```

### Tag Properties

Properties are specified using `:key value` syntax:
- `:class "className"` for CSS classes
- `:onClick ActionName` for event handlers
- Other HTML attributes as needed

### Dynamic Content

Use `(Show expression)` to display computed values:

```lisp
(Span "Count: " (Show CountValue))
```

### Projection

The `(Project expression)` form evaluates an expression in the current state context and renders the result as UI.

---

## 8. Projection Operator `/@`

The projection operator `/@` enables context-aware evaluation:

```lisp
(/@ expression context)
```

Common usage in rules:
```lisp
(R "ShowCount"
  (/@ (Show Count) (App (State ...) (Var _)))
  (Str "42"))
```

This allows rules to match projections and compute values based on the current application state.

---

## 9. Event System

Events are handled through the `Apply` pattern:

```lisp
(Apply action state) → new-state
```

The runtime dispatches events by:
1. Wrapping the action: `(Apply action currentProgram)`
2. Normalizing with rules
3. Updating the UI with the new state

Lifting rules propagate `Apply` through state containers:
```lisp
(R "LiftApplyThroughApp"
  (Apply (Var act) (App (Var st) (Var ui)))
  (App (Apply (Var act) (Var st)) (Var ui)))
```

---

## 10. Meta-Rules

Meta-rules in the `RuleRules` section can transform other rules before they're compiled:

```lisp
(RuleRules
  (R "ModifyRule"
    (R "OriginalName" (Var lhs) (Var rhs))
    (R "OriginalName" (Var lhs) (ModifiedRhs ...))))
```

This enables dynamic rule modification and DSL extensions.

---

## 11. Development Features

### Trace Mode

Enable step-by-step rewriting trace:
- Add `?trace` to the URL
- Or set `window.SYMA_DEV_TRACE = true`

This shows each rule application with the matched pattern and replacement.

### File Extensions

- `.lisp` or `.sym` - Source files in S-expression syntax
- `.json` - Compiled AST representation

### Compilation

Convert source to AST:
```bash
node scripts/sym-2-json.js input.lisp --out output.json --pretty
```

---

## 12. Complete Todo App Example

```lisp
(Universe
  (Program
    (App
      (State
        (TodoState
          (NextId 1)
          (Items)           ; Empty list of todos
          (Filter All)))    ; Filter: All | Active | Done
      (UI
        (Div :class "card"
          (H1 "Todo List")
          (Button :onClick AddTodo "Add Task")
          (Span "Active: " (Show LeftCount))
          (Project (RenderTodos))))))

  (Rules
    ;; Add a new todo
    (R "AddTodo"
      (Apply AddTodo
        (TodoState (NextId (Var n)) (Items (Var ___)) (Filter (Var f))))
      (TodoState
        (NextId (Add (Var n) 1))
        (Items (Var ___)
               (Item (Id (Var n)) (Title "New Task") (Done False)))
        (Filter (Var f))))

    ;; Toggle todo completion
    (R "Toggle"
      (Apply (Toggle (Var id))
        (TodoState (NextId (Var n))
                   (Items (Var before___)
                          (Item (Id (Var id)) (Title (Var t)) (Done (Var d)))
                          (Var after___))
                   (Filter (Var f))))
      (TodoState (NextId (Var n))
                 (Items (Var before___)
                        (Item (Id (Var id)) (Title (Var t)) (Done (Flip (Var d))))
                        (Var after___))
                 (Filter (Var f))))

    ;; Render todos list
    (R "RenderTodos"
      (/@ (RenderTodos)
          (App (State (TodoState (Var _) (Items (Var xs___)) (Var _))) (Var _)))
      (Ul (RenderItems (Var xs___))))

    ;; Count active items
    (R "ShowLeftCount"
      (/@ (Show LeftCount)
          (App (State (TodoState (Var _) (Items (Var xs___)) (Var _))) (Var _)))
      (CountActive (Var xs___)))
    ))
```

---

## 13. Key Concepts Summary

1. **S-expressions** as universal syntax
2. **Pattern matching** with variables and wildcards
3. **Rewrite rules** for computation and transformation
4. **Normalization** as the execution model
5. **Context-aware projection** for UI rendering
6. **Event handling** through `Apply` patterns
7. **Meta-programming** with rule-rewriting rules

This language provides a minimal yet powerful foundation for building reactive applications with a purely functional, rule-based architecture.
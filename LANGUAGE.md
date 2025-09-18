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

The language uses pattern variables for matching and binding values in rules. There are two syntaxes available:

**Explicit syntax:**
```lisp
(Var name)   ; Pattern variable that binds to "name"
```

**Shorthand syntax:**
```lisp
name_        ; Equivalent to (Var name)
```

Variables are used in rule patterns to capture values that can be referenced in the replacement.

### Wildcard Patterns

The special variable `_` acts as a wildcard that matches any value without binding:

**Explicit syntax:**
```lisp
(Var _)      ; Matches any single expression, discards the value
```

**Shorthand syntax:**
```lisp
_            ; Equivalent to (Var _)
```

This is useful when you need to match a structure but don't care about certain values.

### Rest Variables (Variadics)

Rest variables match zero or more elements in a sequence:

**Explicit syntax:**
```lisp
(Var xs___)  ; Rest variable using triple underscore suffix
(VarRest xs) ; Alternative explicit form
(Var ___)    ; Wildcard rest (matches any sequence without binding)
```

**Shorthand syntax:**
```lisp
xs___        ; Equivalent to (Var xs___) or (VarRest xs)
___          ; Equivalent to (Var ___) - wildcard rest
```

### Examples

Pattern matching with mixed syntax:
```lisp
;; These are equivalent:
(R "Rule1"
   (Apply (Toggle (Var id))
      (TodoState (NextId (Var n)) (Items (Var before___) (Item (Id (Var id))) (Var after___))))
   ...)

(R "Rule1"
   (Apply (Toggle id_)
      (TodoState (NextId n_) (Items before___ (Item (Id id_)) after___)))
   ...)

;; Mix and match as needed for clarity:
(Items first_ rest___)           ; First item and rest of list
(Filter _)                        ; Don't care about filter value
(State _ (Items ___) active_)    ; Wildcard, any items, capture active
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

### Built-in Primitives

The runtime provides a comprehensive standard library of primitive operations that are folded during normalization:

**Arithmetic Operations:**
- `(Add n1 n2)` → sum of two numbers
- `(Sub n1 n2)` → difference of two numbers
- `(Mul n1 n2)` → product of two numbers
- `(Div n1 n2)` → quotient (remains symbolic for division by zero)
- `(Mod n1 n2)` → remainder (modulo)
- `(Pow n1 n2)` → n1 raised to power n2
- `(Sqrt n)` → square root (remains symbolic for negative numbers)
- `(Abs n)` → absolute value
- `(Min n1 n2 ...)` → minimum of all arguments
- `(Max n1 n2 ...)` → maximum of all arguments
- `(Floor n)` → round down to integer
- `(Ceil n)` → round up to integer
- `(Round n)` → round to nearest integer

**String Operations:**
- `(Concat s1 s2 ...)` → concatenates strings/numbers into a string
- `(ToString value)` → converts value to string
- `(ToUpper str)` → converts to uppercase
- `(ToLower str)` → converts to lowercase
- `(Trim str)` → removes leading/trailing whitespace
- `(StrLen str)` → length of string
- `(Substring str start end?)` → extract substring
- `(IndexOf str search)` → find position of substring (-1 if not found)
- `(Replace str search replacement)` → replace first occurrence

**Comparison Operations:**
- `(Eq a b)` → equality check, returns `True` or `False`
- `(Neq a b)` → inequality check
- `(Lt n1 n2)` → less than (numbers)
- `(Gt n1 n2)` → greater than (numbers)
- `(Lte n1 n2)` → less than or equal
- `(Gte n1 n2)` → greater than or equal

**Boolean Operations:**
- `(And b1 b2)` → logical AND of `True`/`False` symbols
- `(Or b1 b2)` → logical OR
- `(Not b)` → logical NOT

**Type Checking:**
- `(IsNum value)` → returns `True` or `False`
- `(IsStr value)` → checks if string
- `(IsSym value)` → checks if symbol
- `(IsTrue value)` → checks if symbol `True`
- `(IsFalse value)` → checks if symbol `False`

**Utilities:**
- `(FreshId)` → generates a unique identifier string
- `(Random)` → random number between 0 and 1
- `(Random min max)` → random number in range
- `(ParseNum str)` → parse string to number (remains symbolic if invalid)
- `(Debug label? value)` → logs to console and returns value (for debugging)

### Note on Lists

Lists in this language are not a primitive type. Instead, they are represented as sequences of arguments within calls. List operations like counting, filtering, and mapping are handled through symbolic rules and pattern matching with rest variables `(Var rest___)`. This keeps the core language minimal while providing full list manipulation power through the rewrite system.

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

## 10. Symbolic Effects System

The language supports a purely symbolic effects system where all I/O operations are represented as terms in the AST. The host runtime acts as a minimal bridge between symbolic effect requests and actual I/O operations.

### Effects Structure

Programs can include an Effects node alongside the main application:

```lisp
(Program
  (App ...)           ; Main application
  (Effects            ; Effects lane
    (Pending ...)     ; Outbound effect requests
    (Inbox ...)))     ; Inbound effect responses
```

### Effect Flow

1. **Request**: Actions enqueue effect terms in `Pending`
2. **Processing**: Host runtime performs actual I/O
3. **Response**: Results are added to `Inbox`
4. **Consumption**: Rules process inbox messages and update state

### Example: Timer Effect

```lisp
;; Enqueue a timer effect
(R "StartTimer"
   (Apply StartTimer (Program (Var app) (Effects (Pending (Var p___)) (Var inbox))))
   (Program
     (Var app)
     (Effects
       (Pending (Var p___) (Timer (FreshId) (Delay 2000)))
       (Var inbox)))
   10)  ; High priority to match before lifters

;; Process timer completion
(R "TimerComplete"
   (Program
     (App (Var state) (Var ui))
     (Effects (Var pending) (Inbox (TimerComplete (Var id) (Var _)) (Var rest___))))
   (Program
     (Apply DoSomething (App (Var state) (Var ui)))
     (Effects (Var pending) (Inbox (Var rest___)))))
```

### Supported Effect Types

#### Time & Scheduling

- **Timer**: `(Timer id (Delay ms))` → `(TimerComplete id (Now timestamp))`
- **AnimationFrame**: `(AnimationFrame id)` → `(AnimationFrameComplete id (Now timestamp))`

#### Networking

- **HttpReq**: `(HttpReq id (Method "POST") (Url "/api") (Body data) (Headers ...))` → `(HttpRes id (Status 200) (Json result) (Headers ...))`
- **WebSocket Connect**: `(WsConnect id (Url "wss://..."))` → `(WsConnectComplete id Opened)`
- **WebSocket Send**: `(WsSend id (Text "message"))` → `(WsSendComplete id Ack)`
- **WebSocket Receive**: Appears in inbox as `(WsRecv id (Text "message"))`
- **WebSocket Close**: `(WsClose id (Code 1000) (Reason ""))` → `(WsCloseComplete id Closed)`

#### Storage & Persistence

- **Storage Get**: `(StorageGet id (Store Local|Session) (Key "key"))` → `(StorageGetComplete id (Found value)|Missing)`
- **Storage Set**: `(StorageSet id (Store Local|Session) (Key "key") (Value data))` → `(StorageSetComplete id Ok)`
- **Storage Delete**: `(StorageDel id (Store Local|Session) (Key "key"))` → `(StorageDelComplete id Ok)`

#### Clipboard

- **Clipboard Write**: `(ClipboardWrite id (Text "content"))` → `(ClipboardWriteComplete id Ok|Denied)`
- **Clipboard Read**: `(ClipboardRead id)` → `(ClipboardReadComplete id (Text "content")|Denied)`

#### Navigation

- **Navigate**: `(Navigate id (Url "/path") (Replace True|False))` → `(NavigateComplete id Ok)`
- **Read Location**: `(ReadLocation id)` → `(ReadLocationComplete id (Location (Path "/") (Query "?q=1") (Hash "#top")))`

#### Utilities

- **Random**: `(RandRequest id (Min 0) (Max 100))` → `(RandResponse id value)`
- **Print**: `(Print id (Message "text"))` → `(PrintComplete id Success)`

### Effect Examples

#### Persistent State with LocalStorage
```lisp
;; Save user preferences
(R "SavePrefs"
   (Apply (SavePrefs theme_ lang_) prog_)
   (Program prog_
     (Effects
       (Pending (StorageSet (FreshId) (Store Local) (Key "prefs")
                          (Value (Obj (Theme theme_) (Lang lang_)))))
       (Inbox))))

;; Load preferences on startup
(R "LoadPrefs"
   (Apply LoadPrefs prog_)
   (Program prog_
     (Effects
       (Pending (StorageGet (FreshId) (Store Local) (Key "prefs")))
       (Inbox))))
```

#### WebSocket Chat Application
```lisp
;; Connect and handle messages
(R "ConnectChat"
   (Apply (Connect url_) prog_)
   (Program prog_
     (Effects
       (Pending (WsConnect (FreshId) (Url url_)))
       (Inbox))))

(R "HandleWsMessage"
   (Program app_ (Effects pending_ (Inbox (WsRecv id_ (Text msg_)) rest___)))
   (Program
     (Apply (NewMessage msg_) app_)
     (Effects pending_ (Inbox rest___))))
```

#### Smooth Animation Loop
```lisp
;; Request next frame for 60fps updates
(R "AnimLoop"
   (Apply Animate (Program (App state_ ui_) effects_))
   (Program (App (Apply UpdateAnimation state_) ui_)
     (Effects
       (Pending (AnimationFrame (FreshId)))
       (Inbox))))

(R "AnimFrameReady"
   (Program app_ (Effects pending_ (Inbox (AnimationFrameComplete id_ (Now ts_)) rest___)))
   (Program
     (Apply Animate app_)  ; Loop continues
     (Effects pending_ (Inbox rest___))))
```

### Benefits

- **Pure**: All effects are symbolic terms, no imperative code
- **Inspectable**: Effect history is visible in the AST
- **Testable**: Mock effects by directly manipulating inbox
- **Composable**: Rules can transform, retry, or cancel effects
- **Complete**: Comprehensive coverage of browser APIs and I/O operations

---

## 11. Meta-Rules

Meta-rules in the `RuleRules` section can transform other rules before they're compiled:

```lisp
(RuleRules
  (R "ModifyRule"
    (R "OriginalName" (Var lhs) (Var rhs))
    (R "OriginalName" (Var lhs) (ModifiedRhs ...))))
```

This enables dynamic rule modification and DSL extensions.

---

## 12. Event Action Combinators

The language provides composable action primitives for handling UI events:

### Basic Actions

- `(Seq action1 action2 ...)` - Execute actions in sequence
- `(If condition thenAction elseAction)` - Conditional execution
- `(When condition action)` - Execute only if condition is true

### Input/Form Actions

- `(Input fieldName)` - Reference input field value
- `(ClearInput fieldName)` - Clear input field
- `(SetInput fieldName)` - Set input field value

### Event Control

- `(PreventDefault action)` - Prevent default browser behavior
- `(StopPropagation action)` - Stop event bubbling
- `(KeyIs "Enter")` - Check if specific key was pressed

### Example Usage

```lisp
(Input :type "text"
       :value (Input todoInput)
       :onKeydown (When (KeyIs "Enter")
                    (PreventDefault
                      (Seq
                        (AddTodoWithTitle (Input todoInput))
                        (ClearInput todoInput)))))
```

---

## 13. Development Features

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

## 14. Complete Todo App Example

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

## 15. Key Concepts Summary

1. **S-expressions** as universal syntax
2. **Pattern matching** with variables and wildcards
3. **Rewrite rules** for computation and transformation
4. **Normalization** as the execution model
5. **Context-aware projection** for UI rendering
6. **Event handling** through `Apply` patterns
7. **Symbolic effects** for pure I/O representation
8. **Event action combinators** for composable UI interactions
9. **Meta-programming** with rule-rewriting rules

This language provides a minimal yet powerful foundation for building reactive applications with a purely functional, rule-based architecture where all side effects are symbolic and the runtime is just a thin bridge to the real world.
# Syma REPL – Product Requirements Document

## Overview
The Syma REPL (Read–Eval–Print Loop) provides an interactive command-line environment for experimenting with Syma code.  
Unlike a traditional interpreter, the Syma REPL treats rules and universes as **first-class interactive objects**: you can load, edit, save, and resume entire symbolic universes.

---

## Goals
- Provide a playful yet powerful symbolic playground.
- Make rules editable, savable, and sharable directly from REPL.
- Allow round-tripping: write rules → eval → modify → save → reload.
- Support debugging and introspection to make symbolic rewriting accessible.

---

## Core Features

### 1. REPL Basics
- **Prompt**:

```
syma>
```

- Two input types:
- **Expressions** – subject to rewriting until normal form.
- **Commands** (`:` prefix) – meta operations.

---

### 2. Expression Evaluation
- Any term may be entered and evaluated.
- Results are normalized using the current universe’s rules.
- Example:

```
syma> {Add 2 3}
→ 5
```

---

### 3. Universe Persistence
- **`:save <file>`** – write current universe (all modules, rules, state) to file.
- **`:load <file>`** – restore universe from file.
- **`:export <module>`** – export only one module into a standalone file.
- **`:import <file>`** – bring additional modules/rules into current universe.
- **`:import <file> open`** – bring additional modules/rules into current universe and do not qualify their symbols to use them unqualified.
- **`:clear`** – reset universe to empty.

Use case:

```
syma> :rule AddZero Add(x_, 0) → x_
syma> :save my_universe.syma
syma> :clear
syma> :load my_universe.syma
syma> {Add 10 0}
→ 10
```

or, to save as JSON AST immediately for loading in other environments like the browser:

```
syma> :rule AddZero Add(x_, 0) → x_
syma> :save my_universe.json
syma> :clear
syma> :load my_universe.json
syma> {Add 10 0}
→ 10
```

---

### 4. Rule Management
- **`:rules`** – list rules in universe.
- **`:rule <name>`** – show full rule definition, pretty-printed, multiline.
- **`:exec <name> <expr>`** – apply a rule to an expression using current ruleset.
- **`:trace <expr>`** – evaluate with step-by-step rewrite trace, pretty-printed.
- **`:why <expr>`** – explain why reduction got stuck (candidate vs. mismatch).
- **`:apply <name>`** - apply a rule to the current universe state. Similar to how we react to events in the browser Syma runtime.

---

### 5. Live Rule Editing
Users can add new rules directly in REPL without restarting.

- **Inline definition**:

```
syma> :rule AddComm Add(x_, y_) -> Add(y_, x_)
```

- **Multiline block with full-form**:

```
syma> :rule
R(“Distribute”,
Mul(x_, Add(y_, z_)),
Add(Mul(x_, y_), Mul(x_, z_)))
.
```

(terminated with `.` on a new line)

- **Replace rule**:

```
syma> :edit AddZero Add(x_, 0) → x_
```

- **Remove rule**:

```
syma> :drop AddComm
```

All changes immediately affect the running universe.

TODO: Think about integrations with RuleRules rule rewriting engine

---

### 6. Quality-of-Life
- **`:help`** – list available commands.
- **`:quit`** – exit REPL.
- **`:set <option> <value>`** – runtime options (tracing, max steps, etc.).
- **`:history`** – show recent expressions and results.
- **`:undo`** – undo last universe modification (rule add/drop/edit).

---

## Stretch Features (Beyond MVP)
- **Runtime effects**: define rules that interact with file I/O, timers, etc.

---

## Example Session

```
syma> :rule AddZero Add(x_, 0) → x_
Rule added: AddZero

syma> {Add 5 0}
→ 5

syma> :rule AddComm Add(x_, y_) → Add(y_, x_)
Rule added: AddComm

syma> :rules
[0] AddZero  
[0] AddComm

syma> :rule AddComm
R("AddComm",
    Add(x_, y_),
    Add(y_, x_)
)

syma> :trace {Add 1 0}
Step 1: Add(1, 0)
matched by AddZero
→ 1
Result: 1

syma> :import core-kv.syma open
Imported module: core-kv

syma> :rules
[1] Get  
[1] Put
[0] AddZero  
[0] AddComm  

syma> :save algebra.syma
Universe saved to algebra.syma
```

---

## Non-Goals
- Performance optimization (beyond basic memoization).
- Full IDE/editor integration in MVP.


# Symbolic S-Expression Language Documentation

## 1. Introduction

This document describes a new symbolic language based on S-expressions. The language uses symbolic expressions (S-expressions) as its core syntax and compiles these expressions into a JSON Abstract Syntax Tree (AST) representation. It is designed to express programs, rules, and transformations in a concise and symbolic manner. The language supports atoms, function calls, special forms, and a structured universe of programs and rules that can be normalized by applying rewrite rules repeatedly.

---

## 2. Atoms

Atoms are the fundamental building blocks of the language. There are three types of atoms:

- **Num**: Numeric literals, such as `42`, `3.14`.
- **Str**: String literals, enclosed in double quotes, e.g., `"hello"`, `"Name"`.
- **Sym**: Symbols, which are identifiers or names, e.g., `x`, `Show`, `Call`.

Atoms represent constant values or symbolic identifiers in the language.

---

## 3. Calls

A **Call** is an S-expression where the first element is the head (function or operator) and the rest are arguments. The syntax is:

```
(Head arg1 arg2 …)
```

This corresponds to a `Call` node in the JSON AST with a `head` and a list of `args`. For example:

```lisp
(Add 1 2)
```

represents a call to `Add` with arguments `1` and `2`.

Calls can be nested arbitrarily to represent complex expressions.

---

## 4. Special Forms

The language includes special forms that provide syntactic sugar or special semantics. One such form is:

```
(Var name)
```

This is a shorthand for referring to variables by name. Instead of writing out the full representation, `(Var name)` represents a variable node with the given `name`. It is a convenient way to express variable references within expressions.

---

## 5. Universe Structure

The top-level structure of a program is the **Universe**, which organizes the program and its rules. The syntax is:

```lisp
(Universe
  (Program …)
  (Rules …))
```

- **Program**: Contains the main expressions or definitions of the program.
- **Rules**: Contains a set of rewrite rules that define how expressions can be transformed.

This structure encapsulates the entire program state and its transformation logic.

---

## 6. Rules

Rules define how patterns in expressions are matched and replaced. Each rule has the form:

```lisp
(R "Name" pattern replacement)
```

- `"Name"`: A string naming the rule.
- `pattern`: An expression pattern to match.
- `replacement`: An expression that replaces the matched pattern.

During normalization, the runtime attempts to match the `pattern` against parts of the program. When a match is found, the `replacement` expression is substituted accordingly.

Patterns can include variables that bind parts of the matched expression, allowing complex and conditional transformations.

---

## 7. Projection Operator `/@`

The projection operator `/@` is used to connect the `Show` function with the state context. It allows extracting or projecting parts of the program state for display or further processing.

For example:

```lisp
(Show state /@ someProjection)
```

This expression indicates that the `Show` function is applied to the `state`, but only projecting the part specified by `someProjection`. This operator enables selective viewing or manipulation of nested state components.

---

## 8. Normalization

Normalization is the process by which the runtime repeatedly applies rewrite rules to the program until a stable form is reached — that is, no further rules apply.

The runtime:

1. Scans the program for sub-expressions matching any rule's pattern.
2. Applies the corresponding replacement.
3. Repeats the process until no rule matches.

This process ensures that the program evolves according to its defined semantics and terminates in a normalized, canonical form.

---

## 9. Examples

### Minimal Counter App

Here is a minimal example of a counter application written in the symbolic language (`.sym`):

```lisp
(Universe
  (Program
    (Counter 0))
  (Rules
    (R "Increment"
      (Counter n)
      (Counter (+ n 1)))
    (R "ShowCounter"
      (Show (Counter n))
      (Str (toString n)))))
```

**Explanation:**

- The program starts with a `Counter` initialized to `0`.
- The `Increment` rule matches a `Counter` with value `n` and replaces it with a `Counter` incremented by 1.
- The `ShowCounter` rule matches a `Show` call on a `Counter` and replaces it with the string representation of the current count.

**Behavior:**

- Applying normalization repeatedly increments the counter.
- Calling `(Show (Counter 3))` after normalization returns the string `"3"`.

---

This documentation provides a comprehensive overview of the symbolic S-expression language, its syntax, semantics, and usage.

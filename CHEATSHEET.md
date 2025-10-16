# Syma Primitives Cheat Sheet

This document lists all available primitive operations in the Syma language runtime.

## Arithmetic Operations

| Primitive | Aliases | Signature | Returns | Notes |
|-----------|---------|-----------|---------|-------|
| `Add` | `+` | `[Num, Num]` | `Num` | Sum of two numbers |
| `Sub` | `-` | `[Num, Num]` | `Num` | Difference of two numbers |
| `Mul` | `*` | `[Num, Num]` | `Num` | Product of two numbers |
| `Div` | `/` | `[Num, Num]` | `Num` | Quotient (returns null for division by zero) |
| `Mod` | `%` | `[Num, Num]` | `Num` | Remainder (returns null for modulo by zero) |
| `Pow` | `^` | `[Num, Num]` | `Num` | Exponentiation (a^b) |
| `Sqrt` | - | `[Num]` | `Num` | Square root (returns null for negative numbers) |
| `Abs` | - | `[Num]` | `Num` | Absolute value |
| `Min` | - | `[Num, Num, ...]` | `Num` | Minimum of all arguments |
| `Max` | - | `[Num, Num, ...]` | `Num` | Maximum of all arguments |
| `Floor` | - | `[Num]` | `Num` | Round down to nearest integer |
| `Ceil` | - | `[Num]` | `Num` | Round up to nearest integer |
| `Round` | - | `[Num]` | `Num` | Round to nearest integer |

## String Operations

| Primitive | Signature | Returns | Description |
|-----------|-----------|---------|-------------|
| `Concat` | `[Str\|Num, ...]` | `Str` | Concatenate strings/numbers |
| `ToString` | `[Any]` | `Str` | Convert any value to string (S-expression format for complex expressions) |
| `ToNormalString` | `[Any]` | `Str` | Convert normalized expression to string (returns null for non-normalized expressions) |
| `ToUpper` | `[Str]` | `Str` | Convert to uppercase |
| `ToLower` | `[Str]` | `Str` | Convert to lowercase |
| `Trim` | `[Str]` | `Str` | Remove leading/trailing whitespace |
| `StrLen` | `[Str]` | `Num` | String length |
| `Substring` | `[Str, Num, Num?]` | `Str` | Extract substring (start, optional end) |
| `IndexOf` | `[Str, Str]` | `Num` | Find index of substring (-1 if not found) |
| `Replace` | `[Str, Str, Str]` | `Str` | Replace first occurrence |
| `ReplaceAll` | `[Str, Str, Str]` | `Str` | Replace all occurrences |
| `Split` | `[Str, Str]` | - | Split string (returns null - no list support yet) |
| `SplitToChars` | `[Str]` | `Chars[Str, ...]` | Split string into individual characters |
| `SplitBy` | `[Str, Str]` | `Strings[Str, ...]` | Split string by separator (empty separator splits into chars) |
| `Join` | `[Str, Str\|Num, ...]` | `Str` | Join items with separator (works with rest args) |
| `Escape` | `[Str]` | `Str` | Escape special characters (\\, ", \n, \r, \t, \f) |
| `Unescape` | `[Str]` | `Str` | Unescape escape sequences |

## Comparison Operations

| Primitive | Aliases | Signature | Returns | Description |
|-----------|---------|-----------|---------|-------------|
| `Eq` | `==` | `[Any, Any]` | `True\|False` | Equality check (deep for calls) |
| `Neq` | `!=` | `[Any, Any]` | `True\|False` | Inequality check |
| `Lt` | `<` | `[Num, Num]` | `True\|False` | Less than |
| `Gt` | `>` | `[Num, Num]` | `True\|False` | Greater than |
| `Lte` | `<=` | `[Num, Num]` | `True\|False` | Less than or equal |
| `Gte` | `>=` | `[Num, Num]` | `True\|False` | Greater than or equal |

## Boolean Operations

| Primitive | Signature | Returns | Description |
|-----------|-----------|---------|-------------|
| `And` | `[Bool, Bool, ...]` | `True\|False` | Logical AND (true if all are True) |
| `Or` | `[Bool, Bool, ...]` | `True\|False` | Logical OR (true if any is True) |
| `Not` | `[Bool]` | `True\|False` | Logical NOT |

## Type Checking

| Primitive | Signature | Returns | Description |
|-----------|-----------|---------|-------------|
| `IsNum` | `[Any]` | `True\|False` | Check if value is a number |
| `IsStr` | `[Any]` | `True\|False` | Check if value is a string |
| `IsSym` | `[Any]` | `True\|False` | Check if value is a symbol |
| `IsTrue` | `[Any]` | `True\|False` | Check if value is True symbol |
| `IsFalse` | `[Any]` | `True\|False` | Check if value is False symbol |
| `AreNums` | `[Array\|Splice\|...args]` | `True\|False` | Check if all elements are numbers |
| `AreStrings` | `[Array\|Splice\|...args]` | `True\|False` | Check if all elements are strings |
| `AreSyms` | `[Array\|Splice\|...args]` | `True\|False` | Check if all elements are symbols |

## Utilities

| Primitive | Aliases | Signature | Returns | Description |
|-----------|---------|-----------|---------|-------------|
| `FreshId` | - | `[]` | `Str` | Generate unique identifier |
| `Random` | - | `[]\|[Num, Num]` | `Num` | Random number (0-1, or min-max range) |
| `ParseNum` | - | `[Str]` | `Num` | Parse string to number (returns null if invalid) |
| `Debug` | - | `[Any]\|[Str, Any]` | `Any` | Log value to console and pass through (optional label) |
| `CharFromCode` | - | `[Num]` | `Str` | Convert ASCII/Unicode code to character |
| `Splat` | `...!` | `[...args]` | `Splice` | Create splice object for spreading arguments |
| `Reverse` | - | `[...args]` | `Splice` | Reverse order of arguments (returns Splice) |
| `Serialize` | - | `[Expr]` | `Str` | Convert expression to JSON string |
| `Deserialize` | - | `[Str]` | `Expr` | Parse JSON string back to expression |

## Notes

- **Primitives fold during normalization**: These operations are evaluated automatically when their arguments are fully computed values.
- **Null return = no fold**: When a primitive returns `null`, the expression remains symbolic and is not reduced.
- **Type safety**: Most primitives only fold when given the correct types. Wrong types result in `null` (stays symbolic).
- **Arrays and Splices**: The `AreNums`, `AreStrings`, and `AreSyms` primitives can handle:
  - VarRest bindings that expand to arrays
  - Splice objects from rule substitution
  - Multiple arguments passed directly
- **Boolean values**: Represented as symbols `True` and `False`
- **Escape sequences**: `Escape` and `Unescape` handle: `\"`, `\\`, `\n`, `\r`, `\t`, `\f`

## Examples

```lisp
; Arithmetic
{Add 2 3}              ; → 5
{+ 2 3}                ; → 5
{Pow 2 8}              ; → 256
{Max 3 7 2 9 1}        ; → 9

; Strings
{Concat "Hello" " " "World"}  ; → "Hello World"
{ToUpper "hello"}             ; → "HELLO"
{StrLen "test"}               ; → 4
{SplitToChars "ABC"}          ; → Chars["A", "B", "C"]
{SplitBy "-" "a-b-c"}         ; → Strings["a", "b", "c"]
{Join " " "Hello" "World"}    ; → "Hello World"
{Join ", " "a" "b" "c"}       ; → "a, b, c"

; Comparisons
{Eq 5 5}               ; → True
{Lt 3 7}               ; → True
{>= 10 5}              ; → True

; Boolean
{And True True False}  ; → False
{Or False False True}  ; → True
{Not True}             ; → False

; Type checking
{IsNum 42}             ; → True
{IsStr "hello"}        ; → True
{AreNums 1 2 3}        ; → True

; Utilities
{FreshId}              ; → "id-12345" (unique)
{Random 1 10}          ; → 7.3 (random between 1-10)
{ParseNum "42"}        ; → 42
{Debug "x" {+ 2 3}}    ; Logs "[DEBUG x] 5", returns 5
{CharFromCode 65}      ; → "A"
{Reverse "a" "b" "c"}  ; → Splice["c", "b", "a"] (can be splatted)
```
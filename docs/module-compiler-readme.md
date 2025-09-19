# Syma Module System

The Syma module system provides a clean way to organize code into reusable, composable modules with proper namespacing and dependency management.

## Quick Start

```bash
# Bundle modules into a Universe
node scripts/syma-old-compiler.js src/modules/*.syma --bundle --entry App/Main --out public/universe.json --pretty

# Single file (backward compatibility)
node scripts/syma-old-compiler.js src/file.syma --out output.json --pretty
```

## Module Structure

```lisp
(Module Module/Name
  (Export Symbol1 Symbol2 ...)           ; What this module provides
  (Import Other/Module as Alias [open])  ; Dependencies
  (Defs (Name value) ...)                ; Constants/macros
  (Rules ...)                             ; Transformation rules
  (RuleRules ...)                         ; Meta-rules (optional)
  (Program ...))                          ; Main program (entry modules only)
```

## Example Module

```lisp
;; Core KV operations
(Module Core/KV
  (Export Get Put Set Patch)

  (Rules
    (R "Get/Here"
       (Get tag_ key_ (tag_ before___ (KV key_ v_) after___))
       v_)
    ;; ... more rules
    ))
```

## Import Styles

### Qualified Import
```lisp
(Import Core/KV as KV)  ; Use as: KV/Get, KV/Set
```

### Open Import
```lisp
(Import Core/KV as KV open)  ; Use as: Get, Set (unqualified)
```

## Symbol Qualification

The compiler automatically qualifies symbols based on scope:

- **Built-ins**: Never qualified (`Add`, `True`, `If`, etc.)
- **Language forms**: Never qualified (`R`, `Apply`, `State`, etc.)
- **Open imports**: Qualified with source module (`UI/HTML/Button`)
- **Local symbols**: Qualified with current module (`App/Counter/Inc`)
- **Aliased imports**: Resolved then qualified (`KV/Get` → `Core/KV/Get`)

## Module Organization

```
src/modules/
├── core-kv.syma        # Core data operations
├── ui-html.syma        # UI component library
├── app-counter.syma    # Feature module
└── app-main.syma       # Entry point with Program
```

## Compilation Process

1. **Parse**: Read all `.syma` files
2. **Extract**: Parse module structure (exports, imports, rules)
3. **Sort**: Topological sort by dependencies
4. **Qualify**: Add module namespaces to symbols
5. **Expand**: Replace `Defs` with their values
6. **Bundle**: Combine into single `Universe`

## Features

- **Namespacing**: Prevents symbol collisions
- **Dependency tracking**: Automatic import resolution
- **Cycle detection**: Fails fast on circular dependencies
- **Open imports**: Convenient unqualified access
- **Def expansion**: Compile-time constant folding
- **Backward compatible**: Works with non-module files

## Implementation Details

The module compiler (`scripts/syma-old-compiler.js`) extends the base S-expression compiler with:

- `Module` class for parsing module structure
- `SymbolQualifier` for namespace resolution
- `ModuleLinker` for bundling and dependency management
- Topological sort for correct initialization order

## Migration Guide

To convert existing code to modules:

1. Wrap in `(Module Name/Path ...)`
2. Add `(Export ...)` for public symbols
3. Add `(Import ...)` for dependencies
4. Move state initialization to `(Defs ...)`
5. Keep rules in `(Rules ...)`
6. Add `(Program ...)` to entry module only

## Best Practices

- One module per file
- Use hierarchical names: `App/Feature/Component`
- Export only necessary symbols
- Prefer qualified imports for clarity
- Use open imports sparingly (UI libraries)
- Put shared utilities in `Core/*` modules
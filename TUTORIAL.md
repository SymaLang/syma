# The Syma Language Tutorial
## Learn to Build Interactive Apps with Symbolic Programming

Welcome to Syma! This tutorial will teach you a radically different way to think about programming. Instead of telling a computer what to do step by step, you'll define transformation rules that evolve your program like a living system.

By the end of this tutorial, you'll build real interactive applications and understand the beauty of symbolic programming. Let's dive in!

---

## Table of Contents

1. [Your First Steps in Syma](#1-your-first-steps-in-syma)
2. [Understanding Symbolic Programming](#2-understanding-symbolic-programming)
3. [Building Your First Interactive App](#3-building-your-first-interactive-app)
4. [Mastering Pattern Matching](#4-mastering-pattern-matching)
5. [Creating Dynamic User Interfaces](#5-creating-dynamic-user-interfaces)
6. [Working with Data and Lists](#6-working-with-data-and-lists)
7. [Organizing Code with Modules](#7-organizing-code-with-modules)
8. [Building a Real App: Todo List](#8-building-a-real-app-todo-list)
9. [Understanding Symbolic Effects](#9-understanding-symbolic-effects)
10. [Advanced Example: Building an Interpreter](#10-advanced-example-building-an-interpreter)
11. [Best Practices and Tips](#11-best-practices-and-tips)

---

## 1. Your First Steps in Syma

### A New Way to Think

In traditional programming, you write instructions: "First do this, then do that." In Syma, you describe transformations: "When you see this pattern, transform it into that."

Think of it like chemistry: you define reactions, and the runtime finds which reactions can happen and applies them until your program reaches a stable state.

### Writing Your First Expression

Syma offers two equivalent syntaxes. Choose whichever feels more natural:

```lisp
; Brace syntax
{Add 2 3}        ; Evaluates to 5

; Function call syntax
Add(2, 3)        ; Also evaluates to 5
```

You can even mix them in the same program:

```lisp
{Mul Add(1, 2) 4}     ; → 12
Concat("Hello ", "World")  ; → "Hello World"
```

The runtime includes many built-in operations that automatically compute their results. Try these:

```lisp
{Concat "Hello " {Add 2 3}}    ; → "Hello 5"
Mul(2, Add(3, 4))              ; → 14
{If {Gt 5 3} "yes" "no"}       ; → "yes"
```

---

## 2. Understanding Symbolic Programming

Before we build our first app, let's understand what makes Syma fundamentally different from other languages.

### What Does "Symbolic" Mean?

In most programming languages, code is text that gets compiled into machine instructions. The code itself disappears—it's just a recipe that produced the final dish.

In Syma, **code IS data, and data IS code**. Everything—your program, its state, even the rules that transform it—is represented as symbolic expressions (S-expressions). These aren't just syntax; they're the actual data structures your program manipulates.

Consider this example:

```lisp
{Add 2 3}
```

This isn't just syntax for calling an Add function. It's a data structure:
- A Call node with head `Add`
- Two arguments: numbers `2` and `3`

Your entire program is a tree of these structures. And here's the magic: **your program can examine and transform itself**.

### Code as Data, Data as Code

This property—called homoiconicity—means your program is made of the same stuff it manipulates:

```lisp
; This is data
{TodoItem {Id 1} {Text "Learn Syma"} {Done false}}

; This is also data, but happens to be executable
{Add {Mul 2 3} 4}

; This is a rule—also just data!
{R "Double" {Double n_} {Mul n_ 2}}

; Even your UI is data
{Button :onClick Inc "Click me"}
```

Everything lives in the same symbolic space. A rule can pattern-match on another rule. Your program can rewrite its own rules. The UI can be transformed just like any other data structure.

### How Rules and Rewriting Actually Work

When we say "rules," we mean pattern-based transformations. Each rule has three parts:

1. **Pattern**: What to look for
2. **Replacement**: What to replace it with
3. **Guard** (optional): When to apply this rule

Here's what happens under the hood:

```lisp
{R "Increment"
   {Inc n_}        ; Pattern: Match {Inc n_} where n_ is any number
   {Add n_ 1}}     ; Replacement: Replace with {Add n_ 1}
```

When the runtime sees `{Inc 5}`:
1. It tries each rule's pattern against this expression
2. The "Increment" rule's pattern `{Inc n_}` matches, binding `n_` to `5`
3. It constructs the replacement `{Add 5 1}`
4. Built-in primitives fold: `{Add 5 1}` → `6`

### The Normalization Process

Normalization is how Syma "runs" your program. It repeatedly applies rules until nothing changes—like a chemical reaction reaching equilibrium.

Here's a simple trace:

```lisp
Initial: {Double {Inc 3}}

Step 1: Apply "Increment" rule
        {Double {Inc 3}} → {Double {Add 3 1}}

Step 2: Primitive folding
        {Double {Add 3 1}} → {Double 4}

Step 3: Apply "Double" rule
        {Double 4} → {Mul 4 2}

Step 4: Primitive folding
        {Mul 4 2} → 8

Final: 8 (no more rules match)
```

The runtime uses an **outermost-first strategy**:
1. Try to match rules at the current level
2. If no match, recurse into sub-expressions
3. Apply the highest-priority matching rule
4. Repeat until fixed point

### Live Example: Todo Item Toggle

Let's trace a real interaction to see how everything connects:

```lisp
; Initial program state
{Program
  {App
    {State {TodoState
      {NextId 3}
      {Items {Todo {Id 1} {Text "Learn"} {Done false}}
             {Todo {Id 2} {Text "Build"} {Done false}}}}}
    {UI ...}}}

; User clicks toggle button for item 1
; Runtime generates:
{Apply {Toggle 1} {Program ...}}

; Step 1: Lifting rule propagates Apply inward
{Apply {Toggle 1} {Program {App state_ ui_}}}
→ {Program {App {Apply {Toggle 1} state_} ui_}}

; Step 2: Toggle rule matches and transforms
{Apply {Toggle 1} {State {TodoState next_ {Items {Todo {Id 1} text_ {Done false}} rest...}}}}
→ {State {TodoState next_ {Items {Todo {Id 1} text_ {Done true}} rest...}}}

; Final state (with values substituted)
{Program
  {App
    {State {TodoState
      {NextId 3}
      {Items {Todo {Id 1} {Text "Learn"} {Done true}}  ; Changed!
             {Todo {Id 2} {Text "Build"} {Done false}}}}}
    {UI ...}}}

; UI automatically re-renders with the new state
```

Each transformation is deterministic and pure. No callbacks, no mutations—just pattern matching and substitution!

### Why Is This Powerful?

#### 1. **Time-Travel Debugging**
Your program's entire history is just a sequence of symbolic expressions. You can see every transformation that led to the current state.

#### 2. **Pure Functional with State**
State changes are just transformations from one expression to another. No mutation, no side effects—just pure mathematical transformations.

#### 3. **Meta-Programming Built In**
Since rules are data, you can write rules that generate or modify other rules:

```lisp
; A meta-rule that adds logging to any rule
{RuleRules
  {R "AddLogging"
     {R name_ pattern_ replacement_}
     {R name_ pattern_ {Seq {Debug name_ pattern_} replacement_}}}}
```

#### 4. **Verification and Testing**
You can mathematically prove properties about your program by analyzing its rules. Each rule is a theorem about how your program behaves.

### A Concrete Example: How Events Flow

Let's trace what happens when you click a button:

```lisp
; Initial state
{Program {App {State {Count 0}} {UI {Button :onClick Inc "+"}}}}

; User clicks button, runtime creates:
{Apply Inc {Program {App {State {Count 0}} ...}}}

; Lifting rule matches and transforms:
{Program {App {Apply Inc {State {Count 0}}} ...}}

; Inc rule matches and transforms:
{Program {App {State {Count 1}} ...}}

; UI re-renders with new state
```

Each step is a pure transformation. No callbacks, no event handlers—just pattern matching and replacement.

### The Mental Model

Think of Syma like this:

**Traditional programming**: You're a chef following a recipe step by step.

**Symbolic programming**: You're a chemist defining reactions. You don't stir the pot—you define what happens when molecules meet, and let the system find equilibrium.

Your rules are like chemical reactions:
- When these molecules (patterns) meet
- They transform into these products (replacements)
- Under these conditions (guards)

The runtime is the reaction vessel, constantly checking what reactions can occur and applying them until your program reaches a stable state.

### Deep Dive: The Pattern Matching Algorithm

Let's peek at how the runtime actually matches patterns. When you write:

```lisp
{R "FindItem"
   {Items before... {Item {Id target_} data_} after...}
   {Found data_}}
```

The runtime builds a pattern tree and traverses your data looking for structural matches:

1. **Structural Match**: Does the shape match? (`Items` with arguments)
2. **Variable Binding**: Can we bind variables consistently? (`target_`, `data_`)
3. **Rest Matching**: Do rest patterns consume the right elements? (`before...`, `after...`)
4. **Guard Evaluation**: If there's a guard, does it evaluate to `True`?

Here's a concrete matching example:

```lisp
; Data to match against
{Items {Item {Id 1} "apple"} {Item {Id 2} "banana"} {Item {Id 3} "cherry"}}

; Pattern
{Items before... {Item {Id 2} data_} after...}

; Matching process:
; 1. Items matches Items ✓
; 2. Try different splits for before.../after...
; 3. Split 1: before = {Item {Id 1} "apple"}, middle = {Item {Id 2} "banana"}, after = {Item {Id 3} "cherry"}
; 4. {Item {Id 2} data_} matches {Item {Id 2} "banana"} ✓
; 5. Bind data_ = "banana"
; 6. Match successful!

; Result after replacement:
{Found "banana"}
```

### The AST: Your Program's True Form

Under the hood, your Syma program is represented as a JSON AST (Abstract Syntax Tree):

```json
// {Add 2 3} becomes:
{
  "k": "Call",
  "h": {"k": "Sym", "v": "Add"},
  "a": [
    {"k": "Num", "v": 2},
    {"k": "Num", "v": 3}
  ]
}

// {Var n_} becomes:
{
  "k": "Call",
  "h": {"k": "Sym", "v": "Var"},
  "a": [{"k": "Sym", "v": "n"}]
}
```

This isn't an implementation detail—it's fundamental. Your entire program, at any moment, is a single JSON tree that you can inspect, serialize, or even edit with external tools.

### Why "Symbolic"? A Philosophy

We call it "symbolic" because everything is a symbol that stands for something:

- `Count` isn't a variable holding a value—it's a symbol in an expression
- `Inc` isn't a function—it's a symbol that triggers a transformation
- `{State {Count 5}}` isn't mutable state—it's a symbolic expression representing a configuration

This is profoundly different from imperative programming:

**Imperative**: "Set count to 5, then increment it"
**Symbolic**: "The expression {Count 5} transforms to {Count 6} when Inc is applied"

You're not telling the computer what to do—you're describing relationships between symbolic forms.

### Comparison with Other Paradigms

**Object-Oriented**: Objects have hidden state and methods
**Syma**: Everything is a visible symbolic expression

**Functional**: Functions transform immutable data
**Syma**: Rules transform symbolic expressions (including functions themselves!)

**Logic Programming**: Define facts and queries
**Syma**: Define transformation rules that evolve expressions

**Reactive**: Explicitly wire up data flows
**Syma**: Reactivity emerges from rule application

### Real-World Implications

This approach means:

1. **No hidden state**: Everything is visible in the symbolic expression
2. **No race conditions**: Transformations are deterministic
3. **Natural reactivity**: Changes propagate through rules automatically
4. **Composable by default**: Any expression can be part of a larger expression
5. **Time-travel debugging**: Every state is just an expression you can save
6. **Formal verification**: Rules can be mathematically analyzed
7. **Live programming**: Modify rules while the program runs

Now that you understand what's happening under the hood, let's build something real!

---

## 3. Building Your First Interactive App

Let's build something real: an interactive counter. This example will teach you the core concepts of Syma.

### The Complete Counter App

```lisp
{Universe
  ; Your app lives in the Program section
  {Program
    {App
      ; State holds your data
      {State {Count 0}}

      ; UI describes what users see
      {UI
        {Div :class "counter-app"
          {H1 "My First Syma App"}
          {P "Count: " {Show Count}}
          {Button :onClick Inc "Click me!"}}}}}

  ; Rules define how your app behaves
  {Rules
    ; When Inc is clicked, increment the count
    {R "HandleIncrement"
       {Apply Inc {State {Count n_}}}
       {State {Count {Add n_ 1}}}}

    ; Show the current count value
    {R "DisplayCount"
       {/@ {Show Count} {App {State {Count n_}} _}}
       n_}

    ; This "lifts" actions through the app structure
    {R "PropagateActions"
       {Apply act_ {Program {App st_ ui_} eff_}}
       {Program {App {Apply act_ st_} ui_} eff_}}}}
```

### What's Happening Here?

1. **State as Data**: Your counter value lives in `{State {Count 0}}`. This isn't a variable—it's a data structure.

2. **Declarative UI**: The UI section describes what should appear. `{Show Count}` is a placeholder that gets filled by rules.

3. **Rules as Behavior**: Rules are like chemical reactions:
   - When someone clicks the button, it triggers `Inc`
   - The "HandleIncrement" rule sees `{Apply Inc ...}` and transforms it
   - The state changes from `{Count 0}` to `{Count 1}`

4. **The Magic of Apply**: `Apply` is how actions flow through your app. The "PropagateActions" rule ensures actions reach the right place.

### Try It Yourself

Want the counter to increment by 2? Just change one rule:

```lisp
{R "HandleIncrement"
   {Apply Inc {State {Count n_}}}
   {State {Count {Add n_ 2}}}}  ; Changed from 1 to 2
```

Want to add a decrement button? Add a button and a rule:

```lisp
; In the UI section:
{Button :onClick Dec "−"}

; In the Rules section:
{R "HandleDecrement"
   {Apply Dec {State {Count n_}}}
   {State {Count {Sub n_ 1}}}}

```

---

## 4. Mastering Pattern Matching

Pattern matching is the heart of Syma. Think of it like a sophisticated find-and-replace that understands the structure of your data.

### Variables: Capturing Values

In Syma, variables capture parts of a pattern. There are two ways to write them:

```lisp
; Explicit form (verbose but clear)
{Var name}

; Shorthand form (preferred, cleaner)
name_        ; The underscore suffix makes it a variable
```

Here's how they work in practice:

```lisp
; This rule captures the value after Count
{R "DoubleCount"
   {State {Count n_}}           ; n_ captures the current count
   {State {Count {Mul n_ 2}}}}  ; Use n_ in the replacement
```

### The Wildcard: When You Don't Care

Sometimes you need to match something but don't care about its value:

```lisp
; The underscore by itself matches anything
{R "IgnoreTheRest"
   {Person name_ age_ _}     ; Don't care about the third field
   {JustName name_}}
```

### Rest Patterns: Matching Multiple Items

Rest patterns match zero or more elements. Syma uses triple dots:

```lisp
; Capture remaining items
items...      ; Captures all remaining items

; Wildcard rest (match but don't capture)
...           ; Matches remaining items without binding
```

Real-world example:

```lisp
; Finding an item in a list
{R "FindAndUpdate"
   {Items before... {Item {Id 5} old_} after...}
   {Items before... {Item {Id 5} "Updated"} after...}}

; Getting the first item
{R "GetFirst"
   {List first_ rest...}
   first_}

; Getting all but the first
{R "GetTail"
   {List _ tail...}
   tail...}
```

### Combining Patterns

The real power comes from combining these patterns:

```lisp
; Complex pattern matching
{R "UpdateTodoItem"
   {TodoList
     {Items before...
            {Todo {Id target_} {Text _} {Done false}}
            after...}
     {Filter f_}}
   {TodoList
     {Items before...
            {Todo {Id target_} {Text "Completed!"} {Done true}}
            after...}
     {Filter f_}}}
```

### Pattern Matching Tips

1. **Be Specific**: More specific patterns should come before general ones
2. **Use Priorities**: Add a number to control which rules match first

```lisp
{R "SpecificCase" pattern result 10}    ; High priority
{R "GeneralCase" pattern result}        ; Default priority (0)
```

3. **Think Structurally**: Patterns match the shape of data, not just values

---

## 5. Creating Dynamic User Interfaces

Syma's UI system feels familiar if you've used React or HTML, but with a symbolic twist.

### Basic UI Elements

```lisp
{Div :class "my-app"
  {H1 "Welcome to Syma"}
  {P "Build amazing things"}
  {Button :onClick DoSomething "Click me"}}
```

You can use function syntax too:

```lisp
Div(:class, "my-app",
  H1("Welcome"),
  Button(:onClick, DoSomething, "Click"))
```

### Making Things Dynamic with Show

`Show` is how you display dynamic values:

```lisp
{UI
  {Div
    {H2 "Shopping Cart"}
    {P "Items: " {Show ItemCount}}
    {P "Total: $" {Show Total}}}}
```

But `Show` doesn't compute anything—it's just a marker. Rules do the work:

```lisp
{R "CalculateItemCount"
   {/@ {Show ItemCount} {App {State {Cart items...}} _}}
   {Length items...}}

{R "CalculateTotal"
   {/@ {Show Total} {App {State {Cart items...}} _}}
   {SumPrices items...}}
```

The `/@ ` operator means "evaluate in context"—it lets rules see where `Show` appears.

### Handling User Input

Forms in Syma are purely functional:

```lisp
{Input :type "text"
       :value {Input username}
       :placeholder "Enter username"}

{Button :onClick {SubmitForm {Input username}}
        "Submit"}
```

The `{Input fieldName}` expression represents the current value of an input field.

### Complex Rendering with Project

Sometimes you need to generate UI dynamically. `Project` evaluates an expression and renders the result:

```lisp
{UI
  {Div
    {H1 "Todo List"}
    {Project {RenderTodos}}}}  ; Generate UI from data

; Rule to build the todo list UI
{R "RenderTodos"
   {/@ {RenderTodos} {App {State {Todos todos...}} _}}
   {Ul {RenderEachTodo todos...}}}

; Recursive rendering
{R "RenderEachTodo/Item"
   {RenderEachTodo {Todo id_ text_ done_} rest...}
   {Li {Checkbox :checked done_ :onClick {Toggle id_}}
       {Span text_}
       {RenderEachTodo rest...}}  ; Continue with rest
   1}  ; Higher priority

{R "RenderEachTodo/Empty"
   {RenderEachTodo}
   {Span}}  ; Terminal case
```

### UI Composition

Build complex UIs from simple pieces:

```lisp
{R "Header"
   {/@ {Header} context_}
   {Div :class "header"
     {H1 "My App"}
     {Nav {NavLinks}}}}

{R "Footer"
   {/@ {Footer} context_}
   {Div :class "footer"
     {P "© 2024 My Company"}}}

{R "Layout"
   {/@ {Layout content_} context_}
   {Div
     {Project {Header}}
     {Div :class "main" content_}
     {Project {Footer}}}}

; Use it in your UI
{UI {Project {Layout {HomePage}}}}

---

## 6. Working with Data and Lists

In Syma, there's no special list type. Lists are just expressions with multiple arguments. This simplicity is powerful.

### Understanding Lists as Patterns

```lisp
; An empty list is just a head with no arguments
{Items}

; A list with three items
{Items {Item 1} {Item 2} {Item 3}}

; Lists can contain anything
{People
  {Person "Alice" 30}
  {Person "Bob" 25}}
```

### Recursive List Processing

Most list operations use recursion. Here's the pattern:

```lisp
; Count items in a list
{R "Count/Empty"
   {Count}
   0}

{R "Count/NonEmpty"
   {Count first_ rest...}
   {Add 1 {Count rest...}}}

; Usage: {Count 1 2 3} → 3
```

### Building Practical List Operations

#### Filtering Items

Let's build a filter that keeps only even numbers:

```lisp
{R "KeepEven/Done"
   {KeepEven}
   {Results}}  ; Empty results

{R "KeepEven/Keep"
   {KeepEven n_ rest...}
   {Results n_ {KeepEven rest...}}
   {Eq {Mod n_ 2} 0}}  ; Guard: n is even

{R "KeepEven/Skip"
   {KeepEven n_ rest...}
   {KeepEven rest...}
   {Neq {Mod n_ 2} 0}}  ; Guard: n is odd

; Unwrap results
{R "KeepEven/Unwrap"
   {Results content...}
   content...}

; Usage: {KeepEven 1 2 3 4 5 6} → 2 4 6
```

#### Transforming Lists (Map)

```lisp
{R "DoubleEach/Done"
   {DoubleEach}
   {Results}}

{R "DoubleEach/Process"
   {DoubleEach n_ rest...}
   {Results {Mul n_ 2} {DoubleEach rest...}}}

{R "DoubleEach/Unwrap"
   {Results items...}
   items...}

; Usage: {DoubleEach 1 2 3} → 2 4 6
```

#### Finding Items

```lisp
{R "FindById/Found"
   {FindById target_ {Item {Id target_} data_} rest...}
   {Found data_}
   1}  ; Higher priority

{R "FindById/Continue"
   {FindById target_ item_ rest...}
   {FindById target_ rest...}}

{R "FindById/NotFound"
   {FindById target_}
   NotFound}
```

### Advanced: Building a Key-Value Store

Here's a practical example—a simple key-value store:

```lisp
; Store structure: {Store {KV key1 val1} {KV key2 val2} ...}

{R "Get/Found"
   {Get key_ {Store before... {KV key_ value_} after...}}
   value_}

{R "Get/NotFound"
   {Get key_ {Store pairs...}}
   Missing}

{R "Put/Update"
   {Put key_ newVal_ {Store before... {KV key_ _} after...}}
   {Store before... {KV key_ newVal_} after...}
   1}  ; Try update first

{R "Put/Insert"
   {Put key_ val_ {Store pairs...}}
   {Store pairs... {KV key_ val_}}}

; Usage:
; {Get "name" {Store {KV "name" "Alice"} {KV "age" 30}}} → "Alice"
; {Put "city" "NYC" {Store {KV "name" "Alice"}}} → {Store {KV "name" "Alice"} {KV "city" "NYC"}}
```

### List Processing Tips

1. **Think Recursively**: Process the first item, then recurse on the rest
2. **Use Guards**: Control which rule applies with conditions
3. **Priority Matters**: Specific patterns should have higher priority
4. **Wrap Intermediate Results**: Use wrapper nodes like `{Results ...}` during processing

---

## 7. Organizing Code with Modules

As your apps grow, you need to organize code. Syma's module system lets you build reusable, composable components.

### Your First Module

Here's a simple counter module:

```lisp
{Module Counter/Core
  ; What this module provides to others
  {Export InitialState Increment Decrement GetCount}

  ; Define constants
  {Defs
    {InitialState {CounterState 0}}}

  ; Module rules
  {Rules
    {R "Increment"
       {Apply Increment {CounterState n_}}
       {CounterState {Add n_ 1}}}

    {R "Decrement"
       {Apply Decrement {CounterState n_}}
       {CounterState {Sub n_ 1}}}

    {R "GetCount"
       {GetCount {CounterState n_}}
       n_}}}
```

### Using Modules

Import and use modules in your main app:

```lisp
{Module MyApp/Main
  ; Import the counter module
  {Import Counter/Core as Counter}

  ; Main program (only in entry modules)
  {Program
    {App
      {State Counter/InitialState}
      {UI
        {Div
          {H1 "Module Example"}
          {P "Count: " {Show Count}}
          {Button :onClick Counter/Increment "+"}
          {Button :onClick Counter/Decrement "-"}}}}}

  ; App-specific rules
  {Rules
    {R "ShowCount"
       {/@ {Show Count} {App {State state_} _}}
       {Counter/GetCount state_}}

    ; Lifting rules for Apply
    {R "LiftApply"
       {Apply act_ {Program {App state_ ui_} eff_}}
       {Program {App {Apply act_ state_} ui_} eff_}
       100}}}
```

### Import Styles

```lisp
; Qualified import (recommended)
{Import Counter/Core as Counter}
; Use as: Counter/Increment, Counter/GetCount

; Open import (brings symbols into scope)
{Import Counter/Core as Counter open}
; Use as: Increment, GetCount (no prefix needed)
```

### Module Compilation

Modules are compiled into a Universe:

```bash
# Compile multiple modules into one universe
node scripts/syma-old-compiler.js src/*.syma --bundle --entry MyApp/Main --out universe.json
```

The compiler:
1. Resolves dependencies
2. Qualifies symbols with module names
3. Expands definitions into rules
4. Bundles everything into a Universe

### Advanced: Module with Dependencies

```lisp
{Module UI/Components
  {Import Core/KV as KV open}  ; Key-value utilities
  {Import UI/Styles as Styles}

  {Export Card Button TextField}

  {Defs
    {CardStyle "shadow rounded p-4"}}

  {Rules
    {R "Card"
       {/@ {Card title_ content_} _}
       {Div :class CardStyle
         {H3 title_}
         {Div content_}}}

    {R "Button"
       {/@ {Button text_ action_} _}
       {Button :class Styles/PrimaryButton
               :onClick action_
               text_}}}}
```

### Module Best Practices

1. **Single Responsibility**: Each module should do one thing well
2. **Clear Exports**: Only export what others need
3. **Namespace Everything**: Avoid name collisions
4. **Document Dependencies**: Make imports explicit
5. **Test in Isolation**: Modules should work independently

### Real-World Module Structure

```
src/
  modules/
    Core/
      KV.syma        ; Key-value store utilities
      List.syma      ; List operations
    UI/
      Components.syma ; Reusable UI components
      Layout.syma    ; Layout system
    Features/
      Todo.syma      ; Todo list logic
      Auth.syma      ; Authentication
    App/
      Main.syma      ; Entry point
```

---

## 8. Building a Real App: Todo List

Let's build a complete todo app to see how everything comes together.

### The State Structure

A todo app needs to track items, IDs, and filters:

```lisp
{State
  {TodoState
    {NextId 5}         ; Next available ID
    {Items
      {Todo {Id 1} {Text "Learn Syma"} {Done true}}
      {Todo {Id 2} {Text "Build an app"} {Done false}}
      {Todo {Id 3} {Text "Have fun"} {Done false}}}
    {Filter All}}}     ; All, Active, or Completed
```

### Building the UI

```lisp
{UI
  {Div :class "todo-app"
    {H1 "📝 Todo List"}

    ; Input for new todos
    {Div :class "input-group"
      {Input :type "text"
             :value {Input todoField}
             :placeholder "What needs to be done?"
             :onKeydown {When {KeyIs "Enter"}
                           {PreventDefault
                             {Seq
                               {AddTodo {Input todoField}}
                               {ClearInput todoField}}}}}
      {Button :onClick {AddTodo {Input todoField}} "Add"}}

    ; Todo list
    {Div :class "todo-list"
      {Project {RenderFilteredTodos}}}

    ; Filter buttons
    {Div :class "filters"
      {Button :onClick {SetFilter All} "All"}
      {Button :onClick {SetFilter Active} "Active"}
      {Button :onClick {SetFilter Completed} "Done"}}

    ; Stats
    {P {Show ActiveCount} " items left"}}}
```

### Core Todo Operations

```lisp
; Add a new todo
{R "AddTodo"
   {Apply {AddTodo text_}
     {TodoState {NextId id_} {Items todos...} filter_}}
   {TodoState
     {NextId {Add id_ 1}}
     {Items todos... {Todo {Id id_} {Text text_} {Done false}}}
     filter_}
   {Neq text_ ""}}  ; Don't add empty todos

; Toggle todo completion
{R "ToggleTodo"
   {Apply {Toggle id_}
     {TodoState next_ {Items before...
                              {Todo {Id id_} text_ {Done status_}}
                              after...}
                filter_}}
   {TodoState next_
              {Items before...
                     {Todo {Id id_} text_ {Done {Not status_}}}
                     after...}
              filter_}}

; Remove a todo
{R "RemoveTodo"
   {Apply {Remove id_}
     {TodoState next_ {Items before...
                              {Todo {Id id_} _ _}
                              after...}
                filter_}}
   {TodoState next_ {Items before... after...} filter_}}
```

### Filtering Logic

```lisp
; Get filtered todos based on current filter
{R "FilteredTodos/All"
   {/@ {FilteredTodos} {App {State {TodoState _ {Items todos...} {Filter All}}} _}}
   todos...}

{R "FilteredTodos/Active"
   {/@ {FilteredTodos} {App {State {TodoState _ items_ {Filter Active}}} _}}
   {FilterActive items_}}

{R "FilteredTodos/Completed"
   {/@ {FilteredTodos} {App {State {TodoState _ items_ {Filter Completed}}} _}}
   {FilterCompleted items_}}

; Helper: Keep only active todos
{R "FilterActive/Done"
   {FilterActive {Items}}
   {Items}}

{R "FilterActive/Skip"
   {FilterActive {Items {Todo id_ text_ {Done true}} rest...}}
   {FilterActive {Items rest...}}}

{R "FilterActive/Keep"
   {FilterActive {Items {Todo id_ text_ {Done false}} rest...}}
   {Items {Todo id_ text_ {Done false}} {FilterActive {Items rest...}}}}
```

### Action Combinators

Syma provides powerful ways to compose actions:

```lisp
; Sequential execution
{Seq {ValidateInput} {AddTodo text_} {ClearInput field}}

; Conditional execution
{When {IsValid input_} {SubmitForm input_}}

; Complex event handling
{Input :onKeydown
  {If {KeyIs "Enter"}
      {PreventDefault {Seq {AddTodo {Input field}} {ClearInput field}}}
      {If {KeyIs "Escape"}
          {ClearInput field}
          NoOp}}}
```

### Advanced: Batch Operations

```lisp
; Mark all as complete
{R "CompleteAll"
   {Apply CompleteAll {TodoState next_ {Items todos...} filter_}}
   {TodoState next_ {Items {MarkAllDone todos...}} filter_}}

{R "MarkAllDone/Todo"
   {MarkAllDone {Todo id_ text_ _} rest...}
   {Todo id_ text_ {Done true}} {MarkAllDone rest...}}

{R "MarkAllDone/Empty"
   {MarkAllDone}
   {}}  ; Empty result

; Clear completed
{R "ClearCompleted"
   {Apply ClearCompleted {TodoState next_ {Items todos...} filter_}}
   {TodoState next_ {Items {RemoveCompleted todos...}} filter_}}

---

## 9. Understanding Symbolic Effects

In Syma, everything is pure—even I/O. Effects are just data structures that the runtime interprets.

### How Effects Work

Your program has an effects lane alongside the main app:

```lisp
{Program
  {App ...}           ; Your application
  {Effects
    {Pending ...}     ; Effects waiting to be executed
    {Inbox ...}}}     ; Responses from completed effects
```

Think of it like a mailbox system:
1. You put effect requests in `Pending`
2. The runtime executes them
3. Responses appear in `Inbox`
4. Your rules process the responses

### Example: Adding a Timer

Let's add a countdown timer to an app:

```lisp
; Start the timer
{R "StartCountdown"
   {Apply StartCountdown {Program app_ {Effects {Pending pending...} inbox_}}}
   {Program app_
            {Effects {Pending pending...
                              {Timer "countdown-timer" {Delay 1000}}}
                     inbox_}}
   10}  ; High priority

; Handle timer completion
{R "CountdownTick"
   {Program {App {State {Count n_}} ui_}
            {Effects pending_
                     {Inbox {TimerComplete "countdown-timer" _} rest...}}}
   {Program {App {State {Count {Sub n_ 1}}} ui_}
            {Effects {Pending {If {Gt n_ 1}
                                 {Timer "countdown-timer" {Delay 1000}}
                                 {}}}  ; Stop at 0
                     {Inbox rest...}}}}
```

### Making HTTP Requests

Here's how to fetch data from an API:

```lisp
; Trigger a data fetch
{R "FetchUserData"
   {Apply {FetchUser userId_} {Program app_ effects_}}
   {Program app_
            {Effects
              {Pending {HttpReq {FreshId}
                               {Method "GET"}
                               {Url {Concat "/api/users/" userId_}}}}
              {Inbox}}}}

; Process the response
{R "HandleUserData"
   {Program app_
            {Effects pending_
                     {Inbox {HttpRes id_ {Status 200} {Json userData_} _} rest...}}}
   {Program {Apply {UpdateUser userData_} app_}
            {Effects pending_ {Inbox rest...}}}}

; Handle errors
{R "HandleUserError"
   {Program app_
            {Effects pending_
                     {Inbox {HttpRes id_ {Status error_} _ _} rest...}}}
   {Program {Apply {ShowError "Failed to fetch user"} app_}
            {Effects pending_ {Inbox rest...}}}
   {Gte error_ 400}}
```

### Local Storage

Save and load app state:

```lisp
; Save to localStorage
{R "SaveState"
   {Apply {SaveState} {Program {App state_ ui_} effects_}}
   {Program {App state_ ui_}
            {Effects
              {Pending {StorageSet {FreshId}
                                  {Store Local}
                                  {Key "app-state"}
                                  {Value state_}}}
              {Inbox}}}}

; Load on startup
{R "LoadState"
   {Apply LoadState prog_}
   {Program prog_
            {Effects
              {Pending {StorageGet {FreshId}
                                  {Store Local}
                                  {Key "app-state"}}}
              {Inbox}}}}

; Apply loaded state
{R "ApplyLoadedState"
   {Program {App _ ui_}
            {Effects pending_
                     {Inbox {StorageGetComplete _ {Found state_}} rest...}}}
   {Program {App state_ ui_}
            {Effects pending_ {Inbox rest...}}}}
```

### Benefits of Symbolic Effects

- **Pure**: Your code has no side effects—effects are just data
- **Testable**: Test by adding mock responses to the inbox
- **Time Travel**: The entire effect history is in your program's AST
- **Composable**: Transform and retry effects with rules

---

## 10. Advanced Example: Building an Interpreter

Let's build something ambitious: a Brainfuck interpreter. This showcases Syma's power for complex state machines.

### What's Brainfuck?

Brainfuck is a minimal programming language with just 8 commands:
- `>` move right, `<` move left
- `+` increment, `-` decrement
- `.` output, `,` input
- `[` loop start, `]` loop end

### The State Structure

We'll use a "zipper" pattern—a clever way to navigate a tape:

```lisp
{BFState
  {Left ...}       ; Cells to the left (reversed for efficiency)
  {Current 0}      ; Current cell value
  {Right ...}      ; Cells to the right
  {IP 0}          ; Instruction pointer
  {Code "++[>++<-]"}  ; The Brainfuck program
  {Output ""}}    ; Accumulated output
```

The zipper lets us move efficiently by shifting elements between Left and Right.

### Core Execution Rules

```lisp
; Move right on the tape
{R "BF/MoveRight"
   {BFExec ">" {BFState left_ curr_ {Right first_ rest...} ip_ code_ out_}}
   {BFState {Left curr_ left...} first_ {Right rest...}
            {Add ip_ 1} code_ out_}}

; Move left on the tape
{R "BF/MoveLeft"
   {BFExec "<" {BFState {Left first_ rest...} curr_ right_ ip_ code_ out_}}
   {BFState {Left rest...} first_ {Right curr_ right...}
            {Add ip_ 1} code_ out_}}

; Increment current cell
{R "BF/Increment"
   {BFExec "+" {BFState left_ curr_ right_ ip_ code_ out_}}
   {BFState left_ {Add curr_ 1} right_ {Add ip_ 1} code_ out_}}

; Decrement (with guard to prevent negative)
{R "BF/Decrement"
   {BFExec "-" {BFState left_ curr_ right_ ip_ code_ out_}}
   {BFState left_ {Sub curr_ 1} right_ {Add ip_ 1} code_ out_}
   {Gt curr_ 0}}  ; Only if current > 0
```

### Handling Loops

Brainfuck loops are tricky—we need to find matching brackets:

```lisp
; Start loop - skip if current cell is 0
{R "BF/LoopStart/Skip"
   {BFExec "[" {BFState left_ 0 right_ ip_ code_ out_}}
   {BFState left_ 0 right_
            {FindClosingBracket code_ ip_ 1}  ; Jump to ]
            code_ out_}}

{R "BF/LoopStart/Enter"
   {BFExec "[" {BFState left_ curr_ right_ ip_ code_ out_}}
   {BFState left_ curr_ right_ {Add ip_ 1} code_ out_}
   {Neq curr_ 0}}  ; Enter loop if not zero

; End loop - jump back if current cell isn't 0
{R "BF/LoopEnd/Continue"
   {BFExec "]" {BFState left_ curr_ right_ ip_ code_ out_}}
   {BFState left_ curr_ right_
            {FindOpeningBracket code_ ip_ -1}  ; Jump back to [
            code_ out_}
   {Neq curr_ 0}}

{R "BF/LoopEnd/Exit"
   {BFExec "]" {BFState left_ 0 right_ ip_ code_ out_}}
   {BFState left_ 0 right_ {Add ip_ 1} code_ out_}}
```

### Bracket Matching

Finding matching brackets requires counting depth:

```lisp
; Find closing bracket
{R "FindClosing/Step"
   {FindClosingBracket code_ pos_ depth_}
   {If {Eq {Substring code_ pos_ {Add pos_ 1}} "["}
       {FindClosingBracket code_ {Add pos_ 1} {Add depth_ 1}}
       {If {Eq {Substring code_ pos_ {Add pos_ 1}} "]"}
           {If {Eq depth_ 1}
               {Add pos_ 1}  ; Found it!
               {FindClosingBracket code_ {Add pos_ 1} {Sub depth_ 1}}}
           {FindClosingBracket code_ {Add pos_ 1} depth_}}}}
```

### Running the Interpreter

```lisp
; Main execution loop
{R "BF/Step"
   {Apply Step {BFState left_ curr_ right_ ip_ code_ out_}}
   {If {Lt ip_ {StrLen code_}}
       {BFExec {Substring code_ ip_ {Add ip_ 1}}
               {BFState left_ curr_ right_ ip_ code_ out_}}
       {BFState left_ curr_ right_ ip_ code_ {Concat out_ " [Done]"}}}}

; Run continuously with timers
{R "BF/Run"
   {Apply Run state_}
   {Program {App {State state_} ui_}
            {Effects {Pending {Timer "bf-step" {Delay 0}}} {Inbox}}}}

{R "BF/StepTimer"
   {Program {App {State bf_} ui_}
            {Effects pending_ {Inbox {TimerComplete "bf-step" _} rest...}}}
   {Program {Apply Step {App {State bf_} ui_}}
            {Effects {Pending {If {IsRunning bf_}
                                 {Timer "bf-step" {Delay 0}}
                                 {}}}
                     {Inbox rest...}}}}
```

This interpreter example shows how Syma can handle complex state machines with just pattern matching and rules!

---

## 11. Best Practices and Tips

### Start Simple, Think Big

Begin with a minimal working example, then add features incrementally. Syma rewards iterative development.

### Name Things Clearly

```lisp
; Good: descriptive, follows a pattern
{R "Todo/Toggle" ...}
{R "User/UpdateProfile" ...}

; Not so good: generic, unclear
{R "Rule1" ...}
{R "DoStuff" ...}
```

### Structure Your Rules

Group related rules together with comments:

```lisp
; === State Management ===
{R "AddItem" ...}
{R "RemoveItem" ...}
{R "UpdateItem" ...}

; === UI Rendering ===
{R "RenderList" ...}
{R "ShowCount" ...}

; === Effects Handling ===
{R "Timer/Start" ...}
{R "Timer/Process" ...}
```

### Use Guards Wisely

Guards make rules conditional—use them to handle edge cases:

```lisp
; Prevent division by zero
{R "SafeDivide/Zero"
   {Divide n_ 0}
   {Error "Division by zero"}
   1}  ; Higher priority

{R "SafeDivide/Normal"
   {Divide n_ d_}
   {Div n_ d_}
   {Neq d_ 0}}  ; Guard ensures d ≠ 0
```

### Priority Controls Flow

Higher numbers match first—use this for specificity:

```lisp
{R "ParseNumber/Float" pattern result 20}    ; Most specific
{R "ParseNumber/Int" pattern result 10}      ; Less specific
{R "ParseNumber/Any" pattern result}         ; Fallback
```

### Debug with Trace Mode

Add `?trace` to your URL to see the rewriting process:
```
Rule "AddTodo" matched at [0,0,0]
Before: {Apply {AddTodo "Learn Syma"} ...}
After: {TodoState {NextId 2} {Items ...} ...}
```

### Keep Effects Pure

Effects are just data—let the runtime handle I/O:

```lisp
; Good: Pure, symbolic
{Effects {Pending {HttpReq id_ {Url "/api/data"}}}}

; Won't work: Trying to do I/O directly
{ActuallyFetchDataRightNow "/api/data"}  ; This isn't how Syma works
```

### Think in Patterns, Not Steps

Instead of "First do A, then B, then C", think:
- "When I see pattern A, transform it to A'"
- "When condition B holds, apply transformation B'"

### Build Generic Rules

Create reusable patterns that work across contexts:

```lisp
; Generic map operation
{R "Map/Empty"
   {Map func_ {List}}
   {List}}

{R "Map/Items"
   {Map func_ {List first_ rest...}}
   {List {Apply func_ first_} {Map func_ {List rest...}}}}

; Now you can map any function over any list!
```

### Module Organization

Keep modules focused and composable:

```lisp
; Good: Single responsibility
{Module UI/Button ...}      ; Just button logic
{Module Data/Store ...}     ; Just storage
{Module Todo/Logic ...}     ; Just todo operations

; Not ideal: Kitchen sink
{Module Everything ...}     ; Does too much
```

### Test with Small Examples

Before adding a rule to your app, test it in isolation:

```lisp
; Test just this rule
{Universe
  {Program {TestData 1 2 3}}
  {Rules
    {R "MyNewRule"
       {TestData a_ b_ c_}
       {Result {Add a_ b_ c_}}}}}
; Expected: {Result 6}
```

### Common Pitfalls to Avoid

1. **Forgetting rest patterns**: Use `...` to match remaining items
2. **Wrong priorities**: More specific rules need higher priority
3. **Missing lifting rules**: Actions need to propagate through containers
4. **Guards on wrong rules**: Guards go on the rule, not in patterns
5. **Imperative thinking**: Describe what IS, not what TO DO

---

## Conclusion

You've learned a fundamentally different way to think about programming. In Syma:

- **Everything is data** — Programs are just S-expressions
- **Computation is transformation** — Rules evolve your program like chemical reactions
- **Effects are symbolic** — Even I/O is pure and functional
- **UI is declarative** — Describe what you want, not how to build it
- **Modules organize complexity** — Build large systems from small, focused pieces

You now have the tools to build real applications: interactive UIs, complex state management, API integration, and even programming language interpreters—all through pattern matching and symbolic transformation.

The journey doesn't end here. Syma rewards experimentation. Try combining patterns in new ways. Build something nobody's thought of yet. The language is simple, but its possibilities are endless.

Welcome to the world of symbolic programming!

---

## Quick Reference

### Syntax Styles
```lisp
{Add 2 3}         ; Brace syntax
Add(2, 3)         ; Function call syntax
; Both work, mix as you like!
```

### Pattern Variables
```lisp
name_             ; Captures a value
_                 ; Wildcard (matches anything)
items...          ; Captures rest (zero or more)
...               ; Wildcard rest
```

### Common Primitives
- **Arithmetic**: `Add`, `Sub`, `Mul`, `Div`, `Mod`, `Pow`, `Sqrt`
- **Strings**: `Concat`, `StrLen`, `Substring`, `ToUpper`, `ToLower`
- **Comparison**: `Eq`, `Neq`, `Lt`, `Gt`, `Lte`, `Gte`
- **Boolean**: `And`, `Or`, `Not`
- **Type checks**: `IsNum`, `IsStr`, `IsSym`
- **Utilities**: `FreshId`, `Random`, `Debug`

### UI Elements
- **Containers**: `Div`, `Span`
- **Text**: `H1`-`H6`, `P`
- **Interactive**: `Button`, `Input`
- **Lists**: `Ul`, `Ol`, `Li`
- **Special**: `Show`, `Project`

### Action Combinators
- `Seq` — Do things in sequence
- `If`/`When` — Conditional execution
- `PreventDefault` — Stop browser defaults
- `StopPropagation` — Stop event bubbling
- `Input`/`ClearInput` — Form field handling
- `KeyIs` — Check keyboard input

### Effects
- `Timer` — Delayed execution
- `HttpReq`/`HttpRes` — HTTP requests
- `StorageGet`/`StorageSet` — Local storage
- `ClipboardRead`/`ClipboardWrite` — Clipboard access
- `Navigate` — URL navigation
- `Print` — Console output

### Module System
```lisp
{Module My/Module
  {Export Symbol1 Symbol2}
  {Import Other/Module as Other}
  {Defs {Constant value}}
  {Program ...}  ; Entry modules only
  {Rules ...}}
```

---

**Remember**: In Syma, you don't write instructions—you define transformations that evolve your program from one state to another. Think in patterns, not procedures!
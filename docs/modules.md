1) File shape

Each file defines one module:

(Module Core/KV
(Export Get Put Set Patch)
(Rules
(R "Get/Here"  (Get tag_ key_ (tag_ before___ (KV key_ v_) after___)) v_)
(R "Get/Skip"  (Get tag_ key_ (tag_ (KV k_ _) rest___)) (Get tag_ key_ (tag_ rest___)) -100)
(R "Put/Replace" (Put tag_ key_ v_ (tag_ before___ (KV key_ _) after___))
(tag_ before___ (KV key_ v_) after___))
(R "Put/Insert"  (Put tag_ key_ v_ (tag_ fields___))
(tag_ fields___ (KV key_ v_)) -100)
(R "SetField"  (Set tag_ key_ v_ st_) (Put tag_ key_ v_ st_))
(R "Patch/End" (Patch tag_ st_) st_)
(R "Patch/Step" (Patch tag_ st_ (KV k_ v_) more___) (Patch tag_ (Put tag_ k_ v_ st_) more___))
))

Your app file:

(Module App/Main
(Import Core/KV as KV)
(Import UI/HTML as H open)     ; brings tags (Div/H1/…) unqualified
(Import App/Todos as Todos)    ; keep qualified as Todos/…

(Program
(App
(State (Todos/InitialState))
(UI    (Todos/View))))

(Rules
(R "LiftApplyThroughApp"  (Apply act_ (App st_ ui_)) (App (Apply act_ st_) ui_))
(R "LiftApplyThroughState"(Apply act_ (State s_))    (State (Apply act_ s_)))
))

A features module:

(Module App/Todos
(Import Core/KV as KV open)
(Import UI/HTML as H open)

(Export InitialState View AddTodo Toggle Remove ShowLeftCount)

(Defs
(InitialState
(EffectsDemo
(KV StoredValue "") (KV StorageStatus "Ready") (KV ClipboardText "")
(KV ClipboardStatus "Ready") (KV AnimationActive False) ; …or your TodoState
))
)

(Rules
(R "AddTodo"  (Apply AddTodo (State …)) …)
(R "View"     (/@ (View) (App (State st_) _))
(Div :class "card" (H1 "Todos") …))
(R "ShowLeftCount" (/@ (ShowLeftCount) (App (State st_) _))
(Length …))
))

A UI tags module:

(Module UI/HTML
(Export Div Span H1 Button Input Ul Li Fragment Props KV)
(Rules) ; usually none—host renders these tags
)

2) Names & qualification
   •	Symbols are just strings. We encode qualified names as Module/Name (e.g., Todos/AddTodo).
   •	Import forms:
   •	(Import X/Y as Z) → refer with Z/....
   •	(Import X/Y as Z open) → all exported names from X/Y are re-prefixed into the current module at link time so you can use them unqualified (Div, AddTodo).
   •	Export lists what this module exposes. Everything else is private (kept with its Module/... internal name).

3) What’s allowed inside a Module
   •	(Export …) optional.
   •	(Import …)* optional.
   •	(Defs …) optional: macro-ish constant definitions (each entry is (Name expr)); the linker rewrites bare Name to the expanded expression scoped to the module (i.e., becomes Module/Name).
   •	(Rules …) optional.
   •	Optionally (RuleRules …) for meta-rewrites on your own rules before exporting.

4) Bundling to a runnable Universe

A tiny bundler/linker (can be in your Node script) does:
1.	Parse all Module … files.
2.	Topo sort imports; detect cycles (error if cyclic).
3.	Qualify:
•	For each definition/rule in M, rewrite any unqualified symbol S to M/S.
•	For each (Import X as A), rewrite any A/S to X/S.
•	For (Import X as A open), additionally rewrite unqualified S that is exported by X to X/S (unless shadowed by a local M/S).
4.	Expand Defs: replace M/InitialState occurrences by its term (or leave as symbol + add a rule M/InitialState → <term>; either works).
5.	Concatenate all rules into one Rules[…]. Concatenate all meta-rules (in import order) and apply them to the combined Rules (so RuleRules run per-module then globally).
6.	Choose your entry module (e.g., App/Main) and produce:

(Universe
(Program <fully-qualified Program from entry module>)
(Rules …combined, qualified…)
(RuleRules) ) ; usually empty after link

Hot-reload is just: re-read one module, re-link, and swap GLOBAL_UNIVERSE (state-preserving if your state shape is stable).

5) Using qualified names in Syma code

Inside App/Main, after imports above:
•	Todos/AddTodo calls the action from the Todos module.
•	Div, H1 are available unqualified because UI/HTML was imported open.
•	If you want to avoid long chains in rules, use an alias import and keep it qualified: (Import Core/KV as KV) then KV/Set, KV/Get etc.

6) Cross-module /@ rules

Context projection continues to work because names are globally qualified after linking. Example:

(R "Todos/ShowCount"
(/@ (Todos/ShowLeftCount) (App (State (Todos/State …)) _))
…)

In your App you can still embed (Show Todos/LeftCount) or (Project (Todos/View))—the linker doesn’t touch /@; it just ensures the names match on both sides.

7) Meta tricks (optional but tasty)
   •	Re-exports: a module can re-expose imports: (Export (From Other/Module)) if you want to collect a “prelude”.
   •	Parameterized modules (functors): simple sugar—treat symbols like Param/Type and during import-with-args rewrite Param to the chosen module. First pass can skip and just copy-paste modules with different names.

8) Tiny loader hook (runtime)

At load time, if you’d rather link in the browser:

// pseudo
const modules = await Promise.all(urls.map(load));
const linked = linkModules(modules, {entry: "App/Main"});
window.GLOBAL_UNIVERSE = linked;
renderUniverseToDOM(linked, mount, dispatchAction);

Your existing extractRules/dispatch code remains unchanged—everything is already one Universe.

⸻

Minimal running example (3 files)

ui.html.syma

(Module UI/HTML
(Export Div Span H1 Button Input Ul Li Fragment Props KV)
(Rules))

todos.syma

(Module App/Todos
(Import UI/HTML as H open)
(Export InitialState View AddTodo Toggle Remove)

(Defs
(InitialState (TodoState (NextId 1) (Items) (Filter All))))

(Rules
(R "Add" (Apply AddTodo (TodoState (NextId n_) (Items xs___) (Filter f_)))
(TodoState (NextId (Add n_ 1))
(Items xs___ (Item (Id n_) (Title "Task ") (Done False)))
(Filter f_)))
(R "View" (/@ (View) (App (State st_) _))
(Div :class "card" (H1 "Todos") (Button :onClick AddTodo "Add") (Project (RenderTodos))))
;; …plus RenderTodos etc.
))

main.syma

(Module App/Main
(Import UI/HTML as H open)
(Import App/Todos as Todos)

(Program (App (State (Todos/InitialState)) (UI (Todos/View))))
(Rules
(R "LiftApplyThroughApp"  (Apply act_ (App st_ ui_)) (App (Apply act_ st_) ui_))
(R "LiftApplyThroughState"(Apply act_ (State s_))    (State (Apply act_ s_)))
))

Bundle → one Universe and run.

⸻

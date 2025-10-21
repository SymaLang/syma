🜛 The Book of Syma

1. Introduction: The Symbolic Mind
   •	What Syma is: a symbolic rewrite engine disguised as a language.
   •	What Syma is not: an imperative, functional, or object-oriented system.
   •	The idea of “Matter Patching” — the universe of data constantly reconfiguring itself by rules.
   •	The philosophy of “no syntax sugar, no frameworks, no runtime magic — just rules transforming rules.”

⸻

2. A First Contact
   •	Install + Hello, Syma!
   •	Explain {R Hello {Hello} {World}} → “the smallest rewrite possible.”
   •	Show the REPL and live normalization.
   •	Explain the idea of outermost-first normalization in intuitive terms (“Syma always replaces the biggest pattern first”).

⸻

3. Pattern Matching and Matter Patching
   •	Deep dive into pattern syntax (_, .., ..., indexed variants, etc.).
   •	Explain how a match binds structure, and the replacement patches the structure.
   •	Step-by-step visual example of a rule firing:

→ show tree structure before and after.

	•	Explain linear rest, greedy rest, duplicates, and their meaning.
	•	Talk about how “Matching is reading, Patching is writing.”

⸻

4. Guards, Scopes, and Innermost
   •	Guards as logical filters on matches.
   •	Scopes as context selectors (:scope CatExperiment).
   •	The power of per-rule strategies (:innermost).
   •	Show how different strategies change normalization order, and why that’s powerful.

⸻

5. Modules and Macros
   •	{Import Foo open macro} — explain explicit openness and opt-in expansion.
   •	RuleRules and self-generating rules (Splat, Transform/...).
   •	The idea that “Syma can rewrite its own language.”
   •	Build a small macro language inside Syma as an example.

⸻

6. Building Worlds with Rules
   •	Construct small, self-contained systems:
   •	Arithmetic interpreter
   •	Stack VM
   •	Brainfuck interpreter
   •	HTML renderer (ToHTML)
   •	Prolog subset (“SymaProlog”)
   •	Show that all are written with the same mechanism.

⸻

7. Outermost Philosophy
   •	Why Syma chose outermost-first.
   •	Comparison to innermost-first and functional evaluation.
   •	How outermost rewrites align with “intuitive human reasoning” — starting from big patterns and refining inward.

⸻

8. Symbolic Effects
   •	Show browser effects (Clipboard, Storage, Timer, etc.) as symbolic rewrite rules.
   •	Explain how Syma interacts with reality through symbolic projections.
   •	“In Syma, side effects are just matter patches that escape the universe.”

⸻

9. Typing, Guards, and Constraint Rules
   •	Show the type system module (as a library, not syntax).
   •	Explain “type checking as rewriting.”
   •	Dynamic vs symbolic types.

⸻

10. Packages, Projects, and Ecosystem
    •	How to structure a Syma project.
    •	package.syma explained.
    •	Importing stdlib and user packages.
    •	syma run, syma build, syma notebook, syma repl.
    •	File structure of a Syma module and best practices.

⸻

11. Philosophy of Symbols
    •	Why everything in Syma is a symbol.
    •	The duality of expression: {Add 1 2} and Add(1, 2) as the same thought.
    •	The linguistic roots: symbol as the smallest reversible unit of meaning.
    •	How Syma unites logic, computation, and structure.

⸻

12. Design Notes & Origins
    •	A personal essay from you: how it started, what inspired it.
    •	From term rewriting to meta rewriting, to effects and projections.
    •	“Outermost-first is the most human evaluation strategy.”

⸻

13. Appendix: Syma Standard Library
    •	A full index of primitives.
    •	Built-in macros and meta rules.
    •	Implementation hints for contributors.

⸻

14. Appendix II: The Meta Universe
    •	Explain that Syma’s own runtime is written in the same language it runs.
    •	Show a tiny excerpt from the core rules.
    •	End with the motto:
    “Everything is pattern matching and matter patching.”
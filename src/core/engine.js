/*****************************************************************
 * Platform-Independent Core Engine
 *
 * Contains the core symbolic evaluation engine without any
 * platform-specific dependencies (no DOM, no window object)
 ******************************************************************/

import { Sym, Str, Call, isSym, isNum, isStr, isCall, clone, deq, Splice, isSplice, arrEq, show } from '../ast-helpers.js';

/* --------------------- Rule extraction ----------------------- */
const isR = n => isCall(n) && isSym(n.h) && n.h.v === "R";
const isVar = n => isCall(n) && isSym(n.h) && n.h.v === "Var" && n.a.length === 1 && isStr(n.a[0]);
const isVarRest = n =>
    isCall(n) && isSym(n.h) && n.h.v === "VarRest" && n.a.length === 1 && isStr(n.a[0]);

/**
 * Analyze a pattern to determine its indexing key.
 * Returns { type, key, arity } where:
 * - type: "call", "atom", or "universal"
 * - key: the indexing key (head symbol for calls, value for atoms, null for universal)
 * - arity: number for fixed arity, "*" for variable arity, null for non-calls
 */
function analyzePattern(pattern) {
    if (isVar(pattern)) {
        // Top-level Var matches anything
        return { type: "universal", key: null, arity: null };
    }

    if (isSym(pattern)) {
        return { type: "atom", key: `sym:${pattern.v}`, arity: null };
    }

    if (isNum(pattern)) {
        return { type: "atom", key: `num:${pattern.v}`, arity: null };
    }

    if (isStr(pattern)) {
        return { type: "atom", key: `str:${pattern.v}`, arity: null };
    }

    if (isCall(pattern)) {
        // For Call patterns, index by head
        // Head could be a symbol or a Var
        if (isVar(pattern.h)) {
            // Call with Var head matches any call
            return { type: "universal", key: null, arity: null };
        }

        if (!isSym(pattern.h)) {
            // Complex head (nested Call) - treat as universal for now
            return { type: "universal", key: null, arity: null };
        }

        const headSymbol = pattern.h.v;

        // Check if arguments contain VarRest (variable arity)
        const hasVarRest = pattern.a.some(arg => isVarRest(arg));
        const arity = hasVarRest ? "*" : pattern.a.length;

        return { type: "call", key: headSymbol, arity };
    }

    // Unknown pattern type - treat as universal
    return { type: "universal", key: null, arity: null };
}

/**
 * Create an indexed structure for efficient rule lookup.
 * Returns { byHead, byAtom, universal, allRules }
 */
export function indexRules(rules) {
    const index = {
        byHead: {},      // { headSymbol: { arity: [rules] } }
        byAtom: {},      // { "type:value": [rules] }
        universal: [],   // rules that match anything
        allRules: rules  // keep original array for fallback
    };

    for (const rule of rules) {
        const analysis = analyzePattern(rule.lhs);

        if (analysis.type === "universal") {
            index.universal.push(rule);
        } else if (analysis.type === "atom") {
            if (!index.byAtom[analysis.key]) {
                index.byAtom[analysis.key] = [];
            }
            index.byAtom[analysis.key].push(rule);
        } else if (analysis.type === "call") {
            if (!index.byHead[analysis.key]) {
                index.byHead[analysis.key] = {};
            }
            if (!index.byHead[analysis.key][analysis.arity]) {
                index.byHead[analysis.key][analysis.arity] = [];
            }
            index.byHead[analysis.key][analysis.arity].push(rule);
        }
    }

    return index;
}

/**
 * Get applicable rules for an expression using the index.
 * Returns an array of rules that could potentially match.
 */
function getApplicableRules(expr, ruleIndex) {
    const applicable = [];

    // Always include universal rules
    applicable.push(...ruleIndex.universal);

    if (isSym(expr)) {
        const key = `sym:${expr.v}`;
        if (ruleIndex.byAtom[key]) {
            applicable.push(...ruleIndex.byAtom[key]);
        }
    } else if (isNum(expr)) {
        const key = `num:${expr.v}`;
        if (ruleIndex.byAtom[key]) {
            applicable.push(...ruleIndex.byAtom[key]);
        }
    } else if (isStr(expr)) {
        const key = `str:${expr.v}`;
        if (ruleIndex.byAtom[key]) {
            applicable.push(...ruleIndex.byAtom[key]);
        }
    } else if (isCall(expr) && isSym(expr.h)) {
        const headSymbol = expr.h.v;
        const arity = expr.a.length;

        if (ruleIndex.byHead[headSymbol]) {
            // Add rules with exact arity match
            if (ruleIndex.byHead[headSymbol][arity]) {
                applicable.push(...ruleIndex.byHead[headSymbol][arity]);
            }
            // Add rules with variable arity (VarRest)
            if (ruleIndex.byHead[headSymbol]["*"]) {
                applicable.push(...ruleIndex.byHead[headSymbol]["*"]);
            }
        }
    }

    // If no specific rules found and expr is a Call with non-symbol head,
    // we already included universal rules above

    return applicable;
}

// --- Meta-rule helpers ---
export function findSection(universe, name) {
    if (!isCall(universe) || !isSym(universe.h) || universe.h.v !== "Universe")
        throw new Error("Expected root Universe[...]");
    return universe.a.find(n => isCall(n) && isSym(n.h) && n.h.v === name) || null;
}

export function extractRulesFromNode(rulesNode) {
    if (!rulesNode || !isCall(rulesNode) || !isSym(rulesNode.h) || (rulesNode.h.v !== "Rules" && rulesNode.h.v !== "RuleRules"))
        throw new Error("extractRulesFromNode: expected Rules[...] or RuleRules[...] node");
    const rs = [];
    for (const r of rulesNode.a) {
        // Handle both plain R rules and TaggedRule wrapped rules
        let actualRule = r;
        if (isCall(r) && isSym(r.h) && r.h.v === "TaggedRule") {
            // Unwrap TaggedRule to get the actual R rule
            if (r.a.length >= 2) {
                actualRule = r.a[1]; // The second argument is the actual rule
            }
        }

        if (!isR(actualRule)) throw new Error(`Rules must contain R[...] entries; found ${show(actualRule)}`);
        if (actualRule.a.length < 3) throw new Error("R[name, lhs, rhs, ...] requires at least 3 arguments");

        const [nm, lhs, rhs, ...rest] = actualRule.a;

        // Handle both string and symbol rule names
        let ruleName;
        if (isStr(nm)) {
            ruleName = nm.v;
        } else if (isSym(nm)) {
            // Some modules use symbols for rule names, convert to string
            ruleName = nm.v;
        } else {
            throw new Error("R[name] must be Str or Sym");
        }

        let prio = 0;
        let guard = null;

        // Parse named arguments (:guard, :prio) or legacy positional args
        let i = 0;
        while (i < rest.length) {
            const arg = rest[i];

            // Check for named arguments
            if (isSym(arg) && arg.v === ":guard" && i + 1 < rest.length) {
                guard = rest[i + 1];
                i += 2;
            } else if (isSym(arg) && arg.v === ":prio" && i + 1 < rest.length) {
                const prioArg = rest[i + 1];
                if (isNum(prioArg)) {
                    prio = prioArg.v;
                }
                i += 2;
            } else {
                // Legacy: 4th arg could be guard (expression) or prio (number)
                // 5th arg could be prio if 4th was guard
                if (i === 0) {
                    if (isNum(arg)) {
                        prio = arg.v;
                    } else {
                        guard = arg;
                    }
                } else if (i === 1 && guard && isNum(arg)) {
                    prio = arg.v;
                }
                i++;
            }
        }

        rs.push({ name: nm.v, lhs, rhs, guard, prio });
    }
    rs.sort((a, b) => b.prio - a.prio);
    return indexRules(rs);
}

export function extractRules(universe) {
    if (!isCall(universe) || !isSym(universe.h) || universe.h.v !== "Universe")
        throw new Error("Expected root Universe[...]");
    const baseRulesNode = findSection(universe, "Rules");
    if (!baseRulesNode) throw new Error("Universe missing Rules[...]");

    // Rules are now wrapped in TaggedRule, need to unwrap them
    const rules = [];
    for (const node of baseRulesNode.a) {
        let actualRule = node;

        // Unwrap TaggedRule if present
        if (isCall(node) && isSym(node.h) && node.h.v === "TaggedRule") {
            if (node.a.length >= 2) {
                actualRule = node.a[1]; // Skip module tag, get the actual rule
            }
        }

        // Extract the rule from the R node
        if (isR(actualRule)) {
            const rule = extractRuleFromRNode(actualRule);
            if (rule) {
                rules.push(rule);
            }
        }
    }

    // Sort by priority
    rules.sort((a, b) => b.prio - a.prio);
    return indexRules(rules);
}

/**
 * Apply RuleRules to transform the Universe itself
 * This makes RuleRules permanent transformations on the Universe data structure
 * Now respects module scoping - only applies RuleRules to rules from modules that imported them
 */
export function applyRuleRules(universe, foldPrimsFn = null) {
    if (!isCall(universe) || !isSym(universe.h) || universe.h.v !== "Universe")
        throw new Error("Expected root Universe[...]");

    const ruleRulesNode = findSection(universe, "RuleRules");
    if (!ruleRulesNode) return universe; // No RuleRules, return as-is

    const baseRulesNode = findSection(universe, "Rules");
    if (!baseRulesNode) return universe; // No Rules to transform

    // Extract MacroScopes to understand which modules can use which RuleRules
    const macroScopesNode = findSection(universe, "MacroScopes");
    const macroScopes = extractMacroScopes(macroScopesNode);

    // Extract all tagged rules (they're wrapped in TaggedRule)
    const taggedRules = baseRulesNode.a;
    const taggedRuleRules = ruleRulesNode.a;

    // Transform rules respecting module scopes
    const transformedRules = [];

    for (const taggedRule of taggedRules) {
        // Extract module tag and actual rule
        let ruleModule = null;
        let actualRule = taggedRule;

        if (isCall(taggedRule) && isSym(taggedRule.h) && taggedRule.h.v === "TaggedRule") {
            if (taggedRule.a.length >= 2 && isStr(taggedRule.a[0])) {
                ruleModule = taggedRule.a[0].v;
                actualRule = taggedRule.a[1];
            }
        }

        // Get the RuleRules this module can use
        const allowedRuleRuleModules = macroScopes.get(ruleModule) || new Set();

        // Also check for global RuleRules (from "*" scope)
        const globalRuleRules = macroScopes.get("*");
        if (globalRuleRules) {
            for (const globalModule of globalRuleRules) {
                allowedRuleRuleModules.add(globalModule);
            }
        }

        // Build the set of applicable RuleRules for this rule
        const applicableMetaRules = [];

        for (const taggedRuleRule of taggedRuleRules) {
            let ruleRuleModule = null;
            let actualRuleRule = taggedRuleRule;

            if (isCall(taggedRuleRule) && isSym(taggedRuleRule.h) &&
                taggedRuleRule.h.v === "TaggedRuleRule") {
                if (taggedRuleRule.a.length >= 2 && isStr(taggedRuleRule.a[0])) {
                    ruleRuleModule = taggedRuleRule.a[0].v;
                    actualRuleRule = taggedRuleRule.a[1];
                }
            }

            // Only include this RuleRule if it's in scope for the rule's module
            if (ruleRuleModule && allowedRuleRuleModules.has(ruleRuleModule)) {
                // Extract the actual meta-rule from the tagged wrapper
                if (isR(actualRuleRule)) {
                    const metaRule = extractRuleFromRNode(actualRuleRule);
                    if (metaRule) {
                        applicableMetaRules.push(metaRule);
                    }
                }
            }
        }

        // Apply only the applicable meta-rules to this rule
        let rulesToAdd = [actualRule];
        if (applicableMetaRules.length > 0) {
            // Create a restricted fold function for meta-rule evaluation
            const metaFoldPrimsFn = foldPrimsFn ? createMetaFoldPrimsFn(foldPrimsFn) : null;

            // Wrap the single rule in a Rules node for normalization
            const singleRuleNode = Call(Sym("Rules"), actualRule);

            // Apply the applicable meta-rules (index them first)
            const indexedMetaRules = indexRules(applicableMetaRules);
            const transformedNode = normalize(
                singleRuleNode,
                indexedMetaRules,
                10000,
                false,
                metaFoldPrimsFn,
                true
            );

            // Extract the transformed rules from the Rules wrapper
            if (isCall(transformedNode) && transformedNode.a.length > 0) {
                // Check if the result is a Splat node that needs expansion
                const result = transformedNode.a[0];
                if (isCall(result) && isSym(result.h) && result.h.v === "Splat") {
                    // Expand Splat into multiple rules
                    rulesToAdd = result.a;
                } else {
                    rulesToAdd = [result];
                }
            }

            // Now normalize each rule's metadata (like rule names) while preserving patterns
            rulesToAdd = rulesToAdd.map(rule => {
                if (isR(rule) && rule.a.length >= 3) {
                    // For R nodes, evaluate the rule name expression
                    const [nameExpr, lhs, rhs, ...rest] = rule.a;

                    // Evaluate the name expression (e.g., Concat, ToString, Add operations)
                    // Use the meta fold function to evaluate these expressions
                    const emptyRuleIndex = indexRules([]);
                    const evaluatedName = metaFoldPrimsFn ?
                        normalize(nameExpr, emptyRuleIndex, 1000, false, metaFoldPrimsFn, false) :
                        nameExpr;

                    // Reconstruct the R node with evaluated name
                    return Call(Sym("R"), evaluatedName, lhs, rhs, ...rest);
                }
                return rule;
            });
        }

        // Keep the module tag on the transformed rules and add them to the final result
        for (const rule of rulesToAdd) {
            if (ruleModule) {
                transformedRules.push(Call(Sym("TaggedRule"), Str(ruleModule), rule));
            } else {
                transformedRules.push(rule);
            }
        }
    }

    // Create new Universe with transformed Rules
    const newUniverse = clone(universe);
    const rulesIndex = newUniverse.a.findIndex(n => isCall(n) && isSym(n.h) && n.h.v === "Rules");
    if (rulesIndex >= 0) {
        newUniverse.a[rulesIndex] = Call(Sym("Rules"), ...transformedRules);
    }

    return newUniverse;
}

/**
 * Extract a rule from an R node
 */
function extractRuleFromRNode(rNode) {
    if (!isR(rNode)) return null;

    if (rNode.a.length < 3) return null;

    const [nm, lhs, rhs, ...rest] = rNode.a;

    // Handle both string and symbol rule names
    let ruleName;
    if (isStr(nm)) {
        ruleName = nm.v;
    } else if (isSym(nm)) {
        // Some modules use symbols for rule names, convert to string
        ruleName = nm.v;
    } else {
        return null;  // Name must be either string or symbol
    }

    let prio = 0;
    let guard = null;

    // Parse optional arguments
    let i = 0;
    while (i < rest.length) {
        const arg = rest[i];
        if (isSym(arg) && arg.v === ":guard" && i + 1 < rest.length) {
            guard = rest[i + 1];
            i += 2;
        } else if (isSym(arg) && arg.v === ":prio" && i + 1 < rest.length) {
            const prioArg = rest[i + 1];
            if (isNum(prioArg)) {
                prio = prioArg.v;
            }
            i += 2;
        } else {
            // Legacy positional args
            if (i === 0) {
                if (isNum(arg)) {
                    prio = arg.v;
                } else {
                    guard = arg;
                }
            } else if (i === 1 && guard && isNum(arg)) {
                prio = arg.v;
            }
            i++;
        }
    }

    return { name: ruleName, lhs, rhs, guard, prio };
}

/**
 * Extract macro scopes from MacroScopes section
 * Returns Map<moduleName, Set<allowedRuleRuleModules>>
 * Special case: "*" scope means those RuleRules apply globally
 */
function extractMacroScopes(macroScopesNode) {
    const scopes = new Map();

    if (!macroScopesNode || !isCall(macroScopesNode)) {
        return scopes;
    }

    // Each entry is {Module "ModName" {RuleRulesFrom "Mod1" "Mod2" ...}}
    for (const entry of macroScopesNode.a) {
        if (!isCall(entry) || !isSym(entry.h) || entry.h.v !== "Module") continue;
        if (entry.a.length < 2 || !isStr(entry.a[0])) continue;

        const moduleName = entry.a[0].v;
        const ruleRulesFrom = entry.a[1];

        if (!isCall(ruleRulesFrom) || !isSym(ruleRulesFrom.h) ||
            ruleRulesFrom.h.v !== "RuleRulesFrom") continue;

        const allowedModules = new Set();
        for (const mod of ruleRulesFrom.a) {
            if (isStr(mod)) {
                allowedModules.add(mod.v);
            }
        }

        scopes.set(moduleName, allowedModules);
    }

    return scopes;
}

/**
 * Create a restricted fold function for meta-rule evaluation.
 * This only evaluates primitives that are safe and necessary for meta-rule processing,
 * avoiding side effects and preserving runtime-only expressions.
 */
function createMetaFoldPrimsFn(originalFoldPrimsFn) {
    // Whitelist of primitives safe to evaluate during meta-rule processing
    // These are pure functions needed for rule name generation and meta-operations
    const META_SAFE_PRIMITIVES = [
        'Concat',      // String concatenation for rule names
        'ToString',    // Convert symbols to strings for rule names
        'Add',         // Arithmetic for Arity calculation
        'Sub',         // Basic arithmetic
        'Mul',         // Basic arithmetic
        'Div',         // Basic arithmetic
        'Mod',         // Basic arithmetic
        'ToNumber',    // Type conversion
        'Length',      // String/array length
        'Slice',       // String/array slicing
        'Join',        // Array joining
        'Split',       // String splitting
        'Splat',       // Splat
        'Replace',     // String replacement
        'ReplaceAll',  // String replacement
        '...!'         // Splat
        // Note: Explicitly exclude:
        // - FreshId (side effects)
        // - Comparison ops (Gt, Lt, Eq, etc.) - needed at runtime for guards
        // - Logical ops (And, Or, Not) - needed at runtime for guards
        // - Any I/O or effect-related primitives
    ];

    return (expr) => {
        // Check if this is a primitive call we should evaluate
        if (isCall(expr) && isSym(expr.h)) {
            const primName = expr.h.v;
            if (!META_SAFE_PRIMITIVES.includes(primName)) {
                // Don't evaluate this primitive during meta-rule processing
                return expr;
            }
        }
        // Evaluate safe primitives
        return originalFoldPrimsFn(expr);
    };
}

/* --------------------- Pattern matching ---------------------- */

// Backtracking matcher for argument vectors with multiple VarRest
function matchArgsWithRest(pArgs, tArgs, env) {
    // Fast path: no VarRest
    const hasRest = pArgs.some(pa => isVarRest(pa));
    if (!hasRest) {
        if (pArgs.length !== tArgs.length) return null;
        let e = env;
        for (let i = 0; i < pArgs.length; i++) {
            e = match(pArgs[i], tArgs[i], e);
            if (!e) return null;
        }
        return e;
    }

    // Find first VarRest index
    const idx = pArgs.findIndex(pa => isVarRest(pa));
    const prefix = pArgs.slice(0, idx);
    const restVar = pArgs[idx];
    const suffix = pArgs.slice(idx + 1);

    // The suffix must match the tail; compute minimal tail length
    const minTail = suffix.reduce((n, pat) => n + (isVarRest(pat) ? 0 : 1), 0);
    if (tArgs.length < prefix.length + minTail) return null;

    // Match prefix
    let e = env;
    for (let i = 0; i < prefix.length; i++) {
        e = match(prefix[i], tArgs[i], e);
        if (!e) return null;
    }

    // Try all possible splits for this rest var, from shortest to longest slice
    const name = restVar.a[0].v;
    for (let take = 0; take <= (tArgs.length - prefix.length - minTail); take++) {
        // Candidate binding for this VarRest
        const middle = tArgs.slice(prefix.length, prefix.length + take);
        // Match suffix against the remaining tail
        const tail = tArgs.slice(prefix.length + take);

        // First ensure repeated binding consistency if already present
        let e1 = e;
        // Treat (VarRest "_") as wildcard - matches any sequence without binding
        if (name === "_") {
            // Skip binding for wildcard, just continue matching
            e1 = e;
        } else if (Object.prototype.hasOwnProperty.call(e1, name)) {
            const bound = e1[name];
            if (!Array.isArray(bound) || !arrEq(bound, middle)) {
                continue; // inconsistent, try next take
            }
        } else {
            e1 = { ...e1, [name]: middle };
        }

        // Now match the suffix against tail, using recursion that allows more VarRest later
        const e2 = matchArgsWithRest(suffix, tail, e1);
        if (e2) return e2; // success down this branch
    }
    return null; // no split worked
}

/* Env: plain object mapping var name -> Expr */
export function match(pat, subj, env = {}) {
    // Pattern variable?
    if (isVar(pat)) {
        const name = pat.a[0].v;
        // Treat (Var "_") as wildcard - matches anything without binding
        if (name === "_") {
            return env; // Match succeeds without binding
        }
        if (env.hasOwnProperty(name)) {
            return deq(env[name], subj) ? env : null;
        }
        return {...env, [name]: subj};
    }
    // Atoms
    if (isSym(pat) || isNum(pat) || isStr(pat)) {
        return deq(pat, subj) ? env : null;
    }
    // Calls
    if (isCall(pat)) {
        if (!isCall(subj)) return null;
        const env1 = match(pat.h, subj.h, env);
        if (!env1) return null;
        return matchArgsWithRest(pat.a, subj.a, env1);
    }
    throw new Error("match: unknown pattern node");
}

/**
 * Substitute with special handling for Frozen nodes
 * Frozen nodes have their contents substituted but not normalized
 */
export function substWithFrozen(expr, env, preserveUnboundPatterns = false) {
    // Handle Frozen nodes - substitute contents but mark to prevent normalization
    if (isCall(expr) && isSym(expr.h) && expr.h.v === "Frozen" && expr.a.length === 1) {
        // Substitute inside the Frozen, but keep the Frozen wrapper
        const substituted = subst(expr.a[0], env, preserveUnboundPatterns);
        return Call(Sym("Frozen"), substituted);
    }

    // For Var and VarRest, use normal substitution
    if (isVar(expr) || isVarRest(expr)) {
        return subst(expr, env, preserveUnboundPatterns);
    }

    // For other Call nodes, recursively handle any Frozen children
    if (isCall(expr)) {
        const h = substWithFrozen(expr.h, env, preserveUnboundPatterns);
        const mapped = expr.a.map(arg => substWithFrozen(arg, env, preserveUnboundPatterns));

        // Handle splices from VarRest substitutions
        const flat = [];
        for (const m of mapped) {
            if (isSplice(m)) flat.push(...m.items);
            else flat.push(m);
        }
        return Call(h, ...flat);
    }

    // For atoms (Sym, Num, Str), return as-is
    return expr;
}

/**
 * Normalize with special handling for Frozen nodes
 * Frozen nodes prevent normalization of their contents
 */
export function normalizeWithFrozen(expr, rules, maxSteps = 10000, skipPrims = false, foldPrimsFn = null, preserveUnboundPatterns = false) {
    return normalizeIterative(expr, rules, maxSteps, skipPrims, foldPrimsFn, preserveUnboundPatterns, {
        skipFrozen: true,
        includeTrace: false
    });
}

/**
 * Apply rules once, but skip Frozen nodes at any level
 */
function applyOnceWithFrozen(expr, rules, foldPrimsFn = null, preserveUnboundPatterns = false) {
    return applyOnceIterative(expr, rules, foldPrimsFn, preserveUnboundPatterns, {
        skipFrozen: true,
        includeDebugInfo: false
    });
}

/**
 * Fold primitives with special handling for Frozen nodes
 */
function foldPrimsWithFrozen(expr, foldPrimsFn) {
    // If this is a Frozen node, don't fold its contents
    if (isCall(expr) && isSym(expr.h) && expr.h.v === "Frozen") {
        return expr;  // Return as-is
    }

    // For Call nodes, recursively process arguments but handle Frozen specially
    if (isCall(expr) && isSym(expr.h)) {
        const op = expr.h.v;

        // For type checking and comparison primitives, unwrap any Frozen arguments
        // These primitives need to examine the actual value, not the normalized version
        const primitivesNeedingUnwrap = [
            // Type checking
            "IsNum", "IsStr", "IsSym", "IsTrue", "IsFalse",
            // Comparisons
            "Eq", "Neq", "Lt", "Gt", "Lte", "Gte",
            // String operations that need to see the actual value
            "StrLen", "IndexOf", "Substring"
        ];

        if (primitivesNeedingUnwrap.includes(op)) {
            const processedArgs = expr.a.map(arg => {
                if (isCall(arg) && isSym(arg.h) && arg.h.v === "Frozen" && arg.a.length === 1) {
                    // Return the unwrapped content for checking/comparison
                    return arg.a[0];
                }
                return arg;
            });

            // Create new expression with unwrapped args and fold it
            const newExpr = Call(expr.h, ...processedArgs);
            return foldPrimsFn(newExpr);
        }

        // For other operations, recursively process but preserve Frozen
        const processedArgs = expr.a.map(arg => foldPrimsWithFrozen(arg, foldPrimsFn));
        const newExpr = Call(expr.h, ...processedArgs);
        return foldPrimsFn(newExpr);
    }

    // For non-Call nodes, use normal primitive folding
    return foldPrimsFn(expr);
}

export function subst(expr, env, preserveUnboundPatterns = false) {
    // Handle /! nodes - prevent substitution of their contents (unbound variables)
    if (isCall(expr) && isSym(expr.h) && expr.h.v === "/!" && expr.a.length === 1) {
        // Return the content without substitution
        return expr.a[0];
    }
    // Handle Unbound sugar - creates a fresh unbound Var or VarRest
    if (isCall(expr) && isSym(expr.h) && expr.h.v === "Unbound" && expr.a.length === 1 && isStr(expr.a[0])) {
        const name = expr.a[0].v;
        if (name.endsWith("...")) {
            // Create unbound VarRest
            return Call(Sym("VarRest"), Str(name.slice(0, -3)));
        } else {
            // Create unbound Var
            return Call(Sym("Var"), Str(name));
        }
    }
    if (isVar(expr)) {
        const name = expr.a[0].v;
        // Wildcard _ in replacements - only allow in RuleRules context
        if (name === "_") {
            if (preserveUnboundPatterns) {
                // In RuleRules context, preserve wildcards
                return expr;
            }
            throw new Error("subst: wildcard _ cannot be used in replacement");
        }
        if (!(name in env)) {
            if (preserveUnboundPatterns) {
                // In RuleRules context, preserve pattern variables
                return expr;
            }
            throw new Error(`subst: unbound var ${name}`);
        }
        return env[name];
    }
    if (isVarRest(expr)) {
        const name = expr.a[0].v;
        // Wildcard ... in replacements - only allow in RuleRules context
        if (name === "_") {
            if (preserveUnboundPatterns) {
                // In RuleRules context, preserve wildcard rest patterns
                return expr;
            }
            throw new Error("subst: wildcard ... cannot be used in replacement");
        }
        if (!(name in env)) {
            if (preserveUnboundPatterns) {
                // In RuleRules context, preserve pattern variables
                return expr;
            }
            // For VarRest, default to empty sequence if not bound
            return Splice([]);
        }
        const seq = env[name];
        if (!Array.isArray(seq)) throw new Error(`subst: VarRest ${name} expected sequence`);
        // Recursively substitute inside the sequence, passing the flag through
        return Splice(seq.map(n => subst(n, env, preserveUnboundPatterns)));
    }
    if (isSym(expr) || isNum(expr) || isStr(expr)) return expr;
    if (isCall(expr)) {
        const h = subst(expr.h, env, preserveUnboundPatterns);
        const mapped = expr.a.map(a => subst(a, env, preserveUnboundPatterns));
        const flat = [];
        for (const m of mapped) {
            if (isSplice(m)) flat.push(...m.items);
            else flat.push(m);
        }
        return Call(h, ...flat);
    }
    throw new Error("subst: unknown expr node");
}

/* --------------------- Rewriting ----------------------------- */

/**
 * Try to match and apply a rule to an expression using indexed rules.
 * Returns {matched: true, result: expr, rule: ruleObject} if successful,
 * or {matched: false} if no rule matches.
 * @param {*} expr - Expression to match
 * @param {Object} ruleIndex - Indexed rule structure
 */
function tryMatchRule(expr, ruleIndex, foldPrimsFn = null, preserveUnboundPatterns = false) {
    // Get only the applicable rules for this expression
    const rulesToCheck = getApplicableRules(expr, ruleIndex);

    for (const r of rulesToCheck) {
        const env = match(r.lhs, expr, {});
        if (env) {
            // Check guard if present
            if (r.guard) {
                // Substitute the guard with matched bindings, preserving Frozen wrappers
                const guardValue = substWithFrozen(r.guard, env, preserveUnboundPatterns);
                // Fully normalize the guard expression (not just fold primitives)
                // Guards need access to all rules, not just applicable ones
                const evaluatedGuard = normalizeWithFrozen(guardValue, ruleIndex, 100, false, foldPrimsFn, preserveUnboundPatterns);
                // Guard must evaluate to the symbol True
                if (!isSym(evaluatedGuard) || evaluatedGuard.v !== "True") {
                    continue; // Guard failed, try next rule
                }
            }
            const out = subst(r.rhs, env, preserveUnboundPatterns);
            return {matched: true, result: out, rule: r};
        }
    }
    return {matched: false};
}

/**
 * Unified iterative apply-once implementation.
 * Options:
 * - skipFrozen: Skip traversal into Frozen nodes
 * - includeDebugInfo: Include rule name, path, before/after for debugging
 */
function applyOnceIterative(expr, rules, foldPrimsFn = null, preserveUnboundPatterns = false, options = {}) {
    const {skipFrozen = false, includeDebugInfo = false} = options;

    // Always track path internally (it's cheap and simplifies the algorithm)
    const work = [{parent: null, node: expr, path: []}];

    while (work.length) {
        const {parent, node, path} = work.shift();

        // Skip Frozen nodes if requested
        if (skipFrozen && isCall(node) && isSym(node.h) && node.h.v === "Frozen") {
            if (!parent) return {changed: false, expr};
            continue;
        }

        // Try to match and apply a rule at this node
        const matchResult = tryMatchRule(node, rules, foldPrimsFn, preserveUnboundPatterns);
        if (matchResult.matched) {
            const out = matchResult.result;

            // Reconstruct the tree with the replacement
            let resultExpr;
            if (!parent) {
                // Root node was replaced
                resultExpr = out;
            } else {
                // Navigate to the location and replace
                resultExpr = clone(expr);
                let cursor = resultExpr;

                // Navigate to the parent using the path (excluding last step)
                for (let i = 0; i < path.length - 1; i++) {
                    const p = path[i];
                    cursor = (p === 'h') ? cursor.h : cursor.a[p];
                }

                // Apply the replacement at the last step
                if (path.length > 0) {
                    const last = path[path.length - 1];
                    if (last === 'h') {
                        cursor.h = out;
                    } else {
                        cursor.a[last] = out;
                    }
                } else {
                    // path is empty, we're at root
                    resultExpr = out;
                }
            }

            // Return with or without debug info
            if (includeDebugInfo) {
                return {
                    changed: true,
                    expr: resultExpr,
                    rule: matchResult.rule.name,
                    path: path,
                    before: node,
                    after: out
                };
            } else {
                return {changed: true, expr: resultExpr};
            }
        }

        // Enqueue children for traversal (pre-order: head first, then args)
        if (isCall(node)) {
            // Add head to work queue (unless it's Frozen and we're skipping)
            if (!(skipFrozen && isSym(node.h) && node.h.v === "Frozen")) {
                work.push({
                    parent: node,
                    node: node.h,
                    path: path.concat('h')
                });
            }

            // Add arguments to work queue
            for (let i = 0; i < node.a.length; i++) {
                const child = node.a[i];
                // Skip Frozen children if requested
                if (skipFrozen && isCall(child) && isSym(child.h) && child.h.v === "Frozen") {
                    continue;
                }
                work.push({
                    parent: node,
                    node: child,
                    path: path.concat(i)
                });
            }
        }
    }

    // No rule matched
    if (includeDebugInfo) {
        return {changed: false, expr, rule: null, path: null, before: null, after: null};
    } else {
        return {changed: false, expr};
    }
}

/* applyOnce: outermost-first, highest-priority rule wins */
export function applyOnce(expr, rules, foldPrimsFn = null, preserveUnboundPatterns = false) {
    return applyOnceIterative(expr, rules, foldPrimsFn, preserveUnboundPatterns, {
        skipFrozen: false,
        includeDebugInfo: false
    });
}

/* Tracing variant: track rule name + path of rewrite (iterative, pre-order) */
export function applyOnceTrace(expr, rules, foldPrimsFn = null, preserveUnboundPatterns = false) {
    return applyOnceIterative(expr, rules, foldPrimsFn, preserveUnboundPatterns, {
        skipFrozen: false,
        includeDebugInfo: true
    });
}

/**
 * Unified normalization implementation.
 * Options:
 * - skipFrozen: Use frozen-aware apply and fold functions
 * - includeTrace: Build and return a trace of rewrite steps
 */
function normalizeIterative(expr, rules, maxSteps = 10000, skipPrims = false, foldPrimsFn = null, preserveUnboundPatterns = false, options = {}) {
    const {skipFrozen = false, includeTrace = false} = options;

    // Special case: if expr is Frozen and we're skipping frozen, return immediately
    if (skipFrozen && isCall(expr) && isSym(expr.h) && expr.h.v === "Frozen") {
        return includeTrace ? {result: expr, trace: []} : expr;
    }

    let cur = expr;
    const trace = includeTrace ? [] : null;

    for (let i = 0; i < maxSteps; i++) {
        // Apply rules once (using appropriate variant)
        const step = skipFrozen
            ? applyOnceWithFrozen(cur, rules, foldPrimsFn, preserveUnboundPatterns)
            : includeTrace
                ? applyOnceTrace(cur, rules, foldPrimsFn, preserveUnboundPatterns)
                : applyOnce(cur, rules, foldPrimsFn, preserveUnboundPatterns);

        const afterRules = step.expr;

        // Fold primitives if enabled (using appropriate variant)
        cur = (skipPrims || !foldPrimsFn)
            ? afterRules
            : skipFrozen
                ? foldPrimsWithFrozen(afterRules, foldPrimsFn)
                : foldPrimsFn(afterRules);

        // Check if either rules or primitives changed the expression
        const changed = step.changed || !deq(afterRules, cur);
        if (!changed) {
            return includeTrace ? {result: cur, trace} : cur;
        }

        // Add to trace if enabled
        if (includeTrace) {
            if (step.changed) {
                trace.push({
                    i,
                    rule: step.rule,
                    path: step.path,
                    before: step.before,
                    after: step.after
                });
            } else {
                // Primitive folding happened
                trace.push({
                    i,
                    rule: "[primitive folding]",
                    path: [],
                    before: afterRules,
                    after: cur
                });
            }
        }
    }

    const errorMsg = skipFrozen
        ? "normalizeWithFrozen: exceeded maxSteps (possible non-termination)"
        : includeTrace
            ? "normalizeWithTrace: exceeded maxSteps (possible non-termination)"
            : "normalize: exceeded maxSteps (possible non-termination)";
    throw new Error(errorMsg);
}

export function normalize(expr, rules, maxSteps = 10000, skipPrims = false, foldPrimsFn = null, preserveUnboundPatterns = false) {
    return normalizeIterative(expr, rules, maxSteps, skipPrims, foldPrimsFn, preserveUnboundPatterns, {
        skipFrozen: false,
        includeTrace: false
    });
}

/* Normalization with step trace for debugger UIs */
export function normalizeWithTrace(expr, rules, maxSteps = 10000, skipPrims = false, foldPrimsFn = null, preserveUnboundPatterns = false) {
    return normalizeIterative(expr, rules, maxSteps, skipPrims, foldPrimsFn, preserveUnboundPatterns, {
        skipFrozen: false,
        includeTrace: true
    });
}

/* --------------------- Universe plumbing --------------------- */
export function getProgram(universe) {
    const node = universe.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "Program");
    if (!node) throw new Error("Universe missing Program[...]");
    return node;
}

/**
 * Ensure Program has Effects structure for backward compatibility
 * If Program[App[...]] found, enrich to Program[App[...], Effects[Pending[], Inbox[]]]
 */
export function enrichProgramWithEffects(universe) {
    const prog = getProgram(universe);

    // Check if Effects already exists
    const hasEffects = prog.a.some(n => isCall(n) && isSym(n.h) && n.h.v === "Effects");
    if (hasEffects) return universe;

    // Add Effects[Pending[], Inbox[]] to Program
    const enrichedProg = clone(prog);
    enrichedProg.a.push(Call(Sym("Effects"), Call(Sym("Pending")), Call(Sym("Inbox"))));

    return setProgram(universe, enrichedProg);
}

export function getProgramApp(universe) {
    const prog = getProgram(universe);
    // Program might contain [App[...]] or [App[...], Effects[...]]
    const app = prog.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "App");
    return app || prog.a[0];
}

export function setProgram(universe, newProg) {
    const i = universe.a.findIndex(n => isCall(n) && isSym(n.h) && n.h.v === "Program");
    if (i < 0) throw new Error("Universe missing Program[...]");
    const uni = clone(universe);
    uni.a[i] = newProg;
    return uni;
}

export function setProgramApp(universe, newApp) {
    const prog = getProgram(universe);
    const progCopy = clone(prog);
    // Find and replace App node
    const appIdx = progCopy.a.findIndex(n => isCall(n) && isSym(n.h) && n.h.v === "App");
    if (appIdx >= 0) {
        progCopy.a[appIdx] = newApp;
    } else {
        progCopy.a[0] = newApp;
    }
    return setProgram(universe, progCopy);
}

/* Inject an action: Program := Normalize( Apply[action, Program] ) */
export function dispatch(universe, rules, actionTerm, foldPrimsFn = null, traceFn = null) {
    // Rules are already extracted and passed in, no need to re-extract
    // (RuleRules have already been applied to the Universe)
    const prog = getProgram(universe);

    // Apply the action to the Program node itself
    // The lifting rules will handle propagating it through Program -> App -> State
    const applied = Call(Sym("Apply"), actionTerm, prog);

    let newProg;
    if (traceFn) {
        const {result, trace} = normalizeWithTrace(applied, rules, 10000, false, foldPrimsFn, false);
        traceFn(actionTerm, trace);
        newProg = result;
    } else {
        newProg = normalize(applied, rules, 10000, false, foldPrimsFn, false);
    }

    // The result should be a Program node after normalization
    // If not, something went wrong
    if (!isCall(newProg) || !isSym(newProg.h) || newProg.h.v !== "Program") {
        console.warn("Warning: dispatch normalization didn't return a Program node");
        // Try to recover by wrapping it
        if (isCall(newProg) && isSym(newProg.h) && newProg.h.v === "App") {
            // If it's an App, wrap it in Program
            newProg = Call(Sym("Program"), newProg);
        }
    }

    return setProgram(universe, newProg);
}

/**
 * Create an empty universe
 */
export function createEmptyUniverse() {
    return Call(
        Sym("Universe"),
        Call(Sym("Program")),
        Call(Sym("Rules")),
        Call(Sym("RuleRules"))
    );
}
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
const isGreedyAnchor = n =>
    isCall(n) && isSym(n.h) && n.h.v === "GreedyAnchor" && n.a.length === 1 && isSym(n.a[0]);

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
        // Handle empty calls (null head) - they match only empty calls
        if (pattern.h === null) {
            // Empty call pattern - index as a special atom
            return { type: "atom", key: "emptycall", arity: null };
        }

        // Head could be a symbol, Var, or VarRest
        if (isVar(pattern.h)) {
            // Call with Var head matches any call
            return { type: "universal", key: null, arity: null };
        }

        if (isVarRest(pattern.h)) {
            // Call with VarRest head matches any call
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
    // Sort rules by priority (highest first), preserving declaration order for equal priorities
    const sortedRules = [...rules].sort((a, b) => b.prio - a.prio);

    const index = {
        byHead: {},      // { headSymbol: { arity: [rules] } }
        byAtom: {},      // { "type:value": [rules] }
        universal: [],   // rules that match anything
        allRules: sortedRules  // keep sorted array
    };

    for (const rule of sortedRules) {
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
 * Check if a rule could potentially match an expression based on pattern analysis.
 * This is a fast pre-filter before attempting full pattern matching.
 */
function isRuleApplicable(rule, expr) {
    const analysis = analyzePattern(rule.lhs);

    // Universal patterns match everything
    if (analysis.type === "universal") {
        return true;
    }

    // Atom patterns
    if (analysis.type === "atom") {
        if (isSym(expr) && analysis.key === `sym:${expr.v}`) return true;
        if (isNum(expr) && analysis.key === `num:${expr.v}`) return true;
        if (isStr(expr) && analysis.key === `str:${expr.v}`) return true;
        if (isCall(expr) && expr.h === null && analysis.key === "emptycall") return true;
        return false;
    }

    // Call patterns
    if (analysis.type === "call" && isCall(expr) && isSym(expr.h)) {
        const headSymbol = expr.h.v;
        const arity = expr.a.length;

        // Check if head matches
        if (analysis.key !== headSymbol) return false;

        // Check if arity matches (either exact or variable with *)
        if (analysis.arity === "*" || analysis.arity === arity) return true;

        return false;
    }

    return false;
}

/**
 * Get applicable rules for an expression, preserving declaration/priority order.
 * Returns an array of rules that could potentially match, in priority order.
 */
function getApplicableRules(expr, ruleIndex) {
    // Iterate through all rules in priority order and filter to applicable ones
    // This preserves declaration order while still benefiting from the fast
    // applicability check
    return ruleIndex.allRules.filter(rule => isRuleApplicable(rule, expr));
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
        let scope = null;
        let withPattern = null;
        let innermost = false;

        // Parse named arguments (:guard, :prio, :scope, :with, :innermost) or legacy positional args
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
            } else if (isSym(arg) && arg.v === ":scope" && i + 1 < rest.length) {
                const scopeArg = rest[i + 1];
                if (isSym(scopeArg)) {
                    scope = scopeArg.v;
                } else if (isStr(scopeArg)) {
                    scope = scopeArg.v;
                }
                i += 2;
            } else if (isSym(arg) && arg.v === ":with" && i + 1 < rest.length) {
                withPattern = rest[i + 1];
                i += 2;
            } else if (isSym(arg) && arg.v === ":innermost") {
                innermost = true;
                i += 1;
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

        rs.push({ name: nm.v, lhs, rhs, guard, prio, scope, withPattern, innermost });
    }
    rs.sort((a, b) => b.prio - a.prio);
    return indexRules(rs);
}

/**
 * Check if a node tree contains Var or VarRest patterns
 */
function containsPatternNodes(node, path = []) {
    const issues = [];

    function traverse(n, currentPath) {
        if (isVar(n)) {
            issues.push({
                type: 'Var',
                name: n.a[0]?.v || '?',
                path: currentPath.join('/')
            });
        } else if (isVarRest(n)) {
            issues.push({
                type: 'VarRest',
                name: n.a[0]?.v || '?',
                path: currentPath.join('/')
            });
        } else if (isCall(n)) {
            // Handle null heads (empty calls like {})
            const headName = (n.h && isSym(n.h)) ? n.h.v : 'Call';

            // Traverse head if it exists
            if (n.h !== null) {
                traverse(n.h, [...currentPath, headName]);
            }

            // Traverse arguments
            n.a.forEach((arg, i) => {
                traverse(arg, [...currentPath, `${headName}[${i}]`]);
            });
        }
    }

    traverse(node, path);
    return issues;
}

/**
 * Validate that Var/VarRest only appear in Rules/RuleRules sections
 */
export function validateUniverse(universe) {
    const warnings = [];

    if (!isCall(universe) || !isSym(universe.h) || universe.h.v !== "Universe") {
        return warnings;
    }

    for (const section of universe.a) {
        if (!isCall(section) || !isSym(section.h)) continue;

        const sectionName = section.h.v;

        // Skip Rules and RuleRules - these are allowed to have patterns
        if (sectionName === "Rules" || sectionName === "RuleRules") {
            continue;
        }

        // Check for pattern nodes in other sections
        const issues = containsPatternNodes(section, [sectionName]);

        if (issues.length > 0) {
            warnings.push({
                section: sectionName,
                message: `Found pattern matching constructs (Var/VarRest) outside of Rules/RuleRules sections`,
                details: issues
            });
        }
    }

    return warnings;
}

export function extractRules(universe) {
    if (!isCall(universe) || !isSym(universe.h) || universe.h.v !== "Universe")
        throw new Error("Expected root Universe[...]");

    // Validate universe structure
    const warnings = validateUniverse(universe);
    if (warnings.length > 0) {
        console.warn("⚠️  Universe validation warnings:");
        for (const warning of warnings) {
            console.warn(`  ${warning.section}: ${warning.message}`);
            for (const detail of warning.details) {
                console.warn(`    - ${detail.type} "${detail.name}" at ${detail.path}`);
            }
        }
    }

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
    let scope = null;
    let withPattern = null;
    let innermost = false;

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
        } else if (isSym(arg) && arg.v === ":scope" && i + 1 < rest.length) {
            const scopeArg = rest[i + 1];
            if (isSym(scopeArg)) {
                scope = scopeArg.v;
            } else if (isStr(scopeArg)) {
                scope = scopeArg.v;
            }
            i += 2;
        } else if (isSym(arg) && arg.v === ":with" && i + 1 < rest.length) {
            withPattern = rest[i + 1];
            i += 2;
        } else if (isSym(arg) && arg.v === ":innermost") {
            innermost = true;
            i += 1;
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

    return { name: ruleName, lhs, rhs, guard, prio, scope, withPattern, innermost };
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
        '...!',        // Splat
        'Serialize',   // Expression serialization
        'Deserialize'  // Expression deserialization
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

    // Check if we have a greedy anchor as the first suffix element
    const hasGreedyAnchor = suffix.length > 0 && isGreedyAnchor(suffix[0]);

    if (hasGreedyAnchor) {
        // Greedy matching: find LAST occurrence of the anchor symbol
        const greedyAnchor = suffix[0];
        const targetSymbol = greedyAnchor.a[0].v;
        const remainingSuffix = suffix.slice(1);
        const remaining = tArgs.slice(prefix.length);

        // Find all occurrences of the target symbol
        const occurrences = [];
        for (let i = 0; i < remaining.length; i++) {
            if (isSym(remaining[i]) && remaining[i].v === targetSymbol) {
                occurrences.push(i);
            }
        }

        if (occurrences.length === 0) {
            return null; // Target symbol not found
        }

        // Try matching from the last occurrence backwards
        for (let i = occurrences.length - 1; i >= 0; i--) {
            const anchorPos = occurrences[i];
            const middle = remaining.slice(0, anchorPos);
            const tail = remaining.slice(anchorPos + 1); // Skip the anchor symbol itself

            // Bind the VarRest
            let e1 = e;
            const name = restVar.a[0].v;
            if (name === "_") {
                e1 = e;
            } else if (Object.prototype.hasOwnProperty.call(e1, name)) {
                const bound = e1[name];
                if (!Array.isArray(bound) || !arrEq(bound, middle)) {
                    continue;
                }
            } else {
                e1 = { ...e1, [name]: middle };
            }

            // Match remaining suffix against tail
            const e2 = matchArgsWithRest(remainingSuffix, tail, e1);
            if (e2) return e2;
        }
        return null; // No match found
    }

    // Normal non-greedy matching: try all possible splits from shortest to longest
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

/**
 * Generate all possible match environments for a pattern and subject.
 * Used when guards are present to try all rest variable splits.
 */
function matchAll(pat, subj, env = {}) {
    const results = [];
    matchAllHelper(pat, subj, env, results);
    return results;
}

function matchAllHelper(pat, subj, env, results) {
    // Pattern variable?
    if (isVar(pat)) {
        const name = pat.a[0].v;
        if (name === "_") {
            results.push(env);
            return;
        }
        if (Object.prototype.hasOwnProperty.call(env, name)) {
            if (deq(env[name], subj)) {
                results.push(env);
            }
            return;
        }
        results.push({ ...env, [name]: subj });
        return;
    }

    // Literals
    if (isSym(pat) || isNum(pat) || isStr(pat)) {
        if (deq(pat, subj)) {
            results.push(env);
        }
        return;
    }

    // VarRest not allowed outside Call
    if (isVarRest(pat)) return;

    // Calls
    if (isCall(pat)) {
        if (!isCall(subj)) return;

        // Handle empty calls
        if (pat.h === null && subj.h === null) {
            matchArgsWithRestAll(pat.a, subj.a, env, results);
            return;
        }
        if (pat.h === null || subj.h === null) return;

        // Match as flat sequences
        const patSeq = [pat.h, ...pat.a];
        const subjSeq = [subj.h, ...subj.a];
        matchArgsWithRestAll(patSeq, subjSeq, env, results);
        return;
    }
}

/**
 * Generate all possible environments for matching argument vectors with rest variables
 */
function matchArgsWithRestAll(pArgs, tArgs, env, results) {
    // Fast path: no VarRest
    const hasRest = pArgs.some(pa => isVarRest(pa));
    if (!hasRest) {
        if (pArgs.length !== tArgs.length) return;
        let e = env;
        for (let i = 0; i < pArgs.length; i++) {
            const envs = [];
            matchAllHelper(pArgs[i], tArgs[i], e, envs);
            if (envs.length === 0) return;
            e = envs[0]; // Take first match for non-rest patterns
        }
        results.push(e);
        return;
    }

    // Find first VarRest index
    const idx = pArgs.findIndex(pa => isVarRest(pa));
    const prefix = pArgs.slice(0, idx);
    const restVar = pArgs[idx];
    const suffix = pArgs.slice(idx + 1);

    // Check for greedy anchor
    const hasGreedyAnchor = suffix.length > 0 && isGreedyAnchor(suffix[0]);

    if (hasGreedyAnchor) {
        // Greedy matching logic (same as before, but collect all valid environments)
        const greedyAnchor = suffix[0];
        const targetSymbol = greedyAnchor.a[0].v;
        const remainingSuffix = suffix.slice(1);

        // Match prefix
        let e = env;
        for (let i = 0; i < prefix.length; i++) {
            const envs = [];
            matchAllHelper(prefix[i], tArgs[i], e, envs);
            if (envs.length === 0) return;
            e = envs[0];
        }

        const remaining = tArgs.slice(prefix.length);
        const occurrences = [];
        for (let i = 0; i < remaining.length; i++) {
            if (isSym(remaining[i]) && remaining[i].v === targetSymbol) {
                occurrences.push(i);
            }
        }

        if (occurrences.length === 0) return;

        // Try all occurrences from last to first
        for (let i = occurrences.length - 1; i >= 0; i--) {
            const anchorPos = occurrences[i];
            const middle = remaining.slice(0, anchorPos);
            const tail = remaining.slice(anchorPos + 1);

            const name = restVar.a[0].v;
            let e1 = e;
            if (name === "_") {
                e1 = e;
            } else if (Object.prototype.hasOwnProperty.call(e1, name)) {
                const bound = e1[name];
                if (!Array.isArray(bound) || !arrEq(bound, middle)) {
                    continue;
                }
            } else {
                e1 = { ...e1, [name]: middle };
            }

            matchArgsWithRestAll(remainingSuffix, tail, e1, results);
        }
        return;
    }

    // The suffix must match the tail; compute minimal tail length
    const minTail = suffix.reduce((n, pat) => n + (isVarRest(pat) ? 0 : 1), 0);
    if (tArgs.length < prefix.length + minTail) return;

    // Match prefix
    let e = env;
    for (let i = 0; i < prefix.length; i++) {
        const envs = [];
        matchAllHelper(prefix[i], tArgs[i], e, envs);
        if (envs.length === 0) return;
        e = envs[0];
    }

    // Try all possible splits for this rest var
    const name = restVar.a[0].v;
    for (let take = 0; take <= (tArgs.length - prefix.length - minTail); take++) {
        const middle = tArgs.slice(prefix.length, prefix.length + take);
        const tail = tArgs.slice(prefix.length + take);

        let e1 = e;
        if (name === "_") {
            e1 = e;
        } else if (Object.prototype.hasOwnProperty.call(e1, name)) {
            const bound = e1[name];
            if (!Array.isArray(bound) || !arrEq(bound, middle)) {
                continue;
            }
        } else {
            e1 = { ...e1, [name]: middle };
        }

        // Recursively match suffix against tail, collecting all results
        matchArgsWithRestAll(suffix, tail, e1, results);
    }
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
    // Calls - treat as flat sequences [head, ...args] for matching
    if (isCall(pat)) {
        if (!isCall(subj)) return null;

        // Handle empty calls (null heads) - they have no head element
        if (pat.h === null && subj.h === null) {
            // Both are empty calls, just match args
            return matchArgsWithRest(pat.a, subj.a, env);
        }
        if (pat.h === null || subj.h === null) {
            // Only one is empty, no match
            return null;
        }

        // Flatten both pattern and subject into sequences [head, ...args]
        // This treats Calls as flat sequences semantically
        const patSeq = [pat.h, ...pat.a];
        const subjSeq = [subj.h, ...subj.a];

        // Match as flat sequences
        return matchArgsWithRest(patSeq, subjSeq, env);
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
        // Handle empty calls (null head)
        if (expr.h === null) {
            const mapped = expr.a.map(arg => substWithFrozen(arg, env, preserveUnboundPatterns));
            const flat = [];
            for (const m of mapped) {
                if (isSplice(m)) flat.push(...m.items);
                else flat.push(m);
            }
            return Call(null, ...flat);
        }

        // Substitute head - may produce a Splice for VarRest patterns
        const hSubst = substWithFrozen(expr.h, env, preserveUnboundPatterns);
        const mapped = expr.a.map(arg => substWithFrozen(arg, env, preserveUnboundPatterns));

        // Reconstruct Call from flat sequence semantics:
        // If head is a Splice, treat it as prefix elements in the flat sequence
        let flatSeq = [];
        if (isSplice(hSubst)) {
            // Head was a VarRest - its items become prefix of flat sequence
            flatSeq.push(...hSubst.items);
        } else {
            // Normal head
            flatSeq.push(hSubst);
        }

        // Add args, flattening any splices
        for (const m of mapped) {
            if (isSplice(m)) flatSeq.push(...m.items);
            else flatSeq.push(m);
        }

        // Reconstruct Call: first element is head, rest are args
        if (flatSeq.length === 0) {
            // Empty sequence - return empty call
            return Call(null);
        }
        return Call(flatSeq[0], ...flatSeq.slice(1));
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
            throw new Error("subst: wildcard _ must have matching count in pattern and replacement (use same number of _ in both)");
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
            throw new Error("subst: wildcard ... must have matching count in pattern and replacement (use same number of ... in both)");
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
        // Handle empty calls (null head)
        if (expr.h === null) {
            const mapped = expr.a.map(a => subst(a, env, preserveUnboundPatterns));
            const flat = [];
            for (const m of mapped) {
                if (isSplice(m)) flat.push(...m.items);
                else flat.push(m);
            }
            return Call(null, ...flat);
        }

        // Substitute head - may produce a Splice for VarRest patterns
        const hSubst = subst(expr.h, env, preserveUnboundPatterns);
        const mapped = expr.a.map(a => subst(a, env, preserveUnboundPatterns));

        // Reconstruct Call from flat sequence semantics:
        // If head is a Splice, treat it as prefix elements in the flat sequence
        let flatSeq = [];
        if (isSplice(hSubst)) {
            // Head was a VarRest - its items become prefix of flat sequence
            flatSeq.push(...hSubst.items);
        } else {
            // Normal head
            flatSeq.push(hSubst);
        }

        // Add args, flattening any splices
        for (const m of mapped) {
            if (isSplice(m)) flatSeq.push(...m.items);
            else flatSeq.push(m);
        }

        // Reconstruct Call: first element is head, rest are args
        if (flatSeq.length === 0) {
            // Empty sequence - return empty call
            return Call(null);
        }
        return Call(flatSeq[0], ...flatSeq.slice(1));
    }
    throw new Error("subst: unknown expr node");
}

/* --------------------- Rewriting ----------------------------- */

/**
 * Index wildcards in an expression by replacing _ with __wc0, __wc1, etc.
 * and ... with __wcr0, __wcr1, etc.
 * Returns {expr, varCount, varRestCount}
 */
function indexWildcards(expr) {
    const varCounter = {value: 0};
    const varRestCounter = {value: 0};

    function traverse(node) {
        // Skip /! blocks - they contain literal patterns, not wildcards to index
        if (isCall(node) && isSym(node.h) && node.h.v === "/!" && node.a.length === 1) {
            return node; // Return as-is, don't traverse into /! blocks
        }

        if (isVar(node) && node.a.length === 1 && isStr(node.a[0]) && node.a[0].v === "_") {
            const indexed = Call(Sym("Var"), Str(`__wc${varCounter.value}`));
            varCounter.value++;
            return indexed;
        }
        if (isVarRest(node) && node.a.length === 1 && isStr(node.a[0]) && node.a[0].v === "_") {
            const indexed = Call(Sym("VarRest"), Str(`__wcr${varRestCounter.value}`));
            varRestCounter.value++;
            return indexed;
        }
        if (isCall(node)) {
            const h = node.h === null ? null : traverse(node.h);
            const a = node.a.map(arg => traverse(arg));
            return Call(h, ...a);
        }
        return node;
    }

    const result = traverse(expr);
    return {
        expr: result,
        varCount: varCounter.value,
        varRestCount: varRestCounter.value
    };
}

/**
 * Try to match and apply a rule to an expression using indexed rules.
 * Returns {matched: true, result: expr, rule: ruleObject} if successful,
 * or {matched: false} if no rule matches.
 * @param {*} expr - Expression to match
 * @param {Object} ruleIndex - Indexed rule structure
 * @param {Array} parents - Array of ancestor nodes from root to immediate parent
 */
function tryMatchRule(expr, ruleIndex, foldPrimsFn = null, preserveUnboundPatterns = false, parents = []) {
    // Get only the applicable rules for this expression
    const rulesToCheck = getApplicableRules(expr, ruleIndex);

    for (const r of rulesToCheck) {
        // Check scope restriction if present
        if (r.scope) {
            // Rule has a scope restriction - check if any parent matches
            let scopeMatched = false;
            for (const parent of parents) {
                if (isCall(parent) && isSym(parent.h) && parent.h.v === r.scope) {
                    scopeMatched = true;
                    break;
                }
            }
            if (!scopeMatched) {
                continue; // Scope requirement not met, skip this rule
            }
        }
        // Only index wildcards for normal rules, not for RuleRules
        // In RuleRules context, wildcards are preserved as pattern constructs
        let lhsToMatch = r.lhs;
        let rhsToSubst = r.rhs;
        let guardToEval = r.guard;

        if (!preserveUnboundPatterns) {
            // Index wildcards in both lhs and rhs for normal rules
            const lhsIndexed = indexWildcards(r.lhs);
            const rhsIndexed = indexWildcards(r.rhs);

            // Validate that wildcard counts match (or replacement has 0, meaning "omit")
            if (rhsIndexed.varCount !== 0 && lhsIndexed.varCount !== rhsIndexed.varCount) {
                throw new Error(`Rule "${r.name}": pattern has ${lhsIndexed.varCount} _ wildcard(s) but replacement has ${rhsIndexed.varCount}`);
            }
            if (rhsIndexed.varRestCount !== 0 && lhsIndexed.varRestCount !== rhsIndexed.varRestCount) {
                throw new Error(`Rule "${r.name}": pattern has ${lhsIndexed.varRestCount} ... wildcard(s) but replacement has ${rhsIndexed.varRestCount}`);
            }

            lhsToMatch = lhsIndexed.expr;
            rhsToSubst = rhsIndexed.expr;
            if (r.guard) {
                const guardIndexed = indexWildcards(r.guard);
                guardToEval = guardIndexed.expr;
            }
        }

        // When a guard is present, we may need to try multiple matches
        // (different rest variable splits) until one satisfies the guard
        const allEnvs = guardToEval ? matchAll(lhsToMatch, expr, {}) : [match(lhsToMatch, expr, {})];

        for (const env of allEnvs) {
            if (!env) continue;

            // If there's a :with pattern, match it and merge bindings
            let finalEnv = env;
            if (r.withPattern) {
                // Determine what to match :with against:
                // - If :scope is specified, match against the scoped compound
                // - Otherwise, match against the same expression (expr)
                let withTarget = expr;

                if (r.scope) {
                    // Find the scoped compound in parents
                    let scopedCompound = null;
                    for (const parent of parents) {
                        if (isCall(parent) && isSym(parent.h) && parent.h.v === r.scope) {
                            scopedCompound = parent;
                            break;
                        }
                    }

                    if (!scopedCompound) {
                        // This shouldn't happen since we already checked scope earlier
                        continue;
                    }

                    withTarget = scopedCompound;
                }

                // Index wildcards in :with pattern if needed
                let withPatternToMatch = r.withPattern;
                if (!preserveUnboundPatterns) {
                    const withIndexed = indexWildcards(r.withPattern);
                    withPatternToMatch = withIndexed.expr;
                }

                // Match :with pattern against the target
                const withEnv = match(withPatternToMatch, withTarget, {});
                if (!withEnv) {
                    continue; // :with pattern didn't match, skip this rule
                }

                // Merge bindings: withEnv takes precedence if there are conflicts
                // Actually, they shouldn't conflict - they bind different variables
                finalEnv = { ...env, ...withEnv };
            }

            // Check guard if present (with merged environment)
            if (guardToEval) {
                // Substitute the guard with matched bindings, preserving Frozen wrappers
                const guardValue = substWithFrozen(guardToEval, finalEnv, preserveUnboundPatterns);
                // Fully normalize the guard expression (not just fold primitives)
                // Guards need access to all rules, not just applicable ones
                const evaluatedGuard = normalizeWithFrozen(guardValue, ruleIndex, 100, false, foldPrimsFn, preserveUnboundPatterns);
                // Guard must evaluate to the symbol True
                if (!isSym(evaluatedGuard) || evaluatedGuard.v !== "True") {
                    continue; // Guard failed, try next env (next rest split)
                }
            }
            const out = subst(rhsToSubst, finalEnv, preserveUnboundPatterns);
            return {matched: true, result: out, rule: r};
        }
        // If we get here, all environments were tried and none matched (guard failed or :with failed)
    }
    return {matched: false};
}


/**
 * Try innermost-first pass: recursively traverse bottom-up, trying only innermost rules.
 * Returns {matched: true, expr: newExpr, ...} if an innermost rule matched, else {matched: false}
 */
function tryInnermostFirst(expr, rules, foldPrimsFn, preserveUnboundPatterns, parents, skipFrozen, includeDebugInfo, pathSoFar = []) {
    // Skip Frozen nodes if requested
    if (skipFrozen && isCall(expr) && isSym(expr.h) && expr.h.v === "Frozen") {
        return {matched: false};
    }

    // First, recursively process children (bottom-up)
    if (isCall(expr)) {
        const newParents = [...parents, expr];

        // Process head
        if (expr.h) {
            const headResult = tryInnermostFirst(expr.h, rules, foldPrimsFn, preserveUnboundPatterns, newParents, skipFrozen, includeDebugInfo, pathSoFar.concat('h'));
            if (headResult.matched) {
                // Reconstruct with new head
                const newExpr = Call(headResult.expr, ...expr.a);
                return {matched: true, expr: newExpr, rule: headResult.rule, path: headResult.path, before: headResult.before, after: headResult.after};
            }
        }

        // Process arguments
        for (let i = 0; i < expr.a.length; i++) {
            const childResult = tryInnermostFirst(expr.a[i], rules, foldPrimsFn, preserveUnboundPatterns, newParents, skipFrozen, includeDebugInfo, pathSoFar.concat(i));
            if (childResult.matched) {
                // Reconstruct with new child at position i
                const newArgs = [...expr.a];
                newArgs[i] = childResult.expr;
                const newExpr = Call(expr.h, ...newArgs);
                return {matched: true, expr: newExpr, rule: childResult.rule, path: childResult.path, before: childResult.before, after: childResult.after};
            }
        }
    }

    // Now try matching innermost rules at this node (after children processed)
    // Build an index with only innermost rules
    const innermostRulesArray = rules.allRules.filter(r => r.innermost);
    if (innermostRulesArray.length === 0) {
        return {matched: false};
    }

    const innermostIndex = indexRules(innermostRulesArray);

    const matchResult = tryMatchRule(expr, innermostIndex, foldPrimsFn, preserveUnboundPatterns, parents);
    if (matchResult.matched) {
        if (includeDebugInfo) {
            return {
                matched: true,
                expr: matchResult.result,
                rule: matchResult.rule.name,
                path: pathSoFar,
                before: expr,
                after: matchResult.result
            };
        } else {
            return {matched: true, expr: matchResult.result};
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

    // Pass 1: Try innermost-first traversal for innermost rules
    const innermostResult = tryInnermostFirst(expr, rules, foldPrimsFn, preserveUnboundPatterns, [], skipFrozen, includeDebugInfo);
    if (innermostResult.matched) {
        if (includeDebugInfo) {
            return {
                changed: true,
                expr: innermostResult.expr,
                rule: innermostResult.rule,
                path: innermostResult.path,
                before: innermostResult.before,
                after: innermostResult.after
            };
        } else {
            return {changed: true, expr: innermostResult.expr};
        }
    }

    // Pass 2: Standard outermost-first traversal for non-innermost rules
    // Track path and parent chain for scope checking
    const work = [{parent: null, node: expr, path: [], parents: []}];

    while (work.length) {
        const {parent, node, path, parents} = work.shift();

        // Skip Frozen nodes if requested
        if (skipFrozen && isCall(node) && isSym(node.h) && node.h.v === "Frozen") {
            if (!parent) return {changed: false, expr};
            continue;
        }

        // Try to match and apply a rule at this node (excluding innermost rules)
        const matchResult = tryMatchRule(node, rules, foldPrimsFn, preserveUnboundPatterns, parents);
        if (matchResult.matched && !matchResult.rule.innermost) {
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
            // Build new parent chain by appending current node
            const newParents = [...parents, node];

            // Add head to work queue (unless it's Frozen and we're skipping)
            if (!(skipFrozen && isSym(node.h) && node.h.v === "Frozen")) {
                work.push({
                    parent: node,
                    node: node.h,
                    path: path.concat('h'),
                    parents: newParents
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
                    path: path.concat(i),
                    parents: newParents
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
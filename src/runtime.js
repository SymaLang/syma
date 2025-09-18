/*****************************************************************
 * Symbolic Host Runtime (minimal, no stubs)
 * - Load Universe AST
 * - Compile Rules (Var[...] patterns)
 * - Normalize Program via Rules + Strategy (outermost-first)
 * - Render tiny UI subset to DOM
 * - Event bridge: Apply[action, Program] + Normalize
 ******************************************************************/

import { K, Sym, Num, Str, Call, isSym, isNum, isStr, isCall, clone, deq, Splice, isSplice, arrEq, show } from './ast-helpers.js';
import { createEventHandler, handleBinding, clearInput, getInputValue } from './events.js';
import { createEffectsProcessor, freshId } from './effects-processor.js';
import { foldPrims } from './primitives.js';
import {
    isTraceEnabled,
    setTrace as debugSetTrace,
    formatStep,
    logDispatchTrace,
    logProjectionTrace,
    explainProjectionFailure,
    logProjectionFailure
} from './debug.js';

/* -------- Dev trace toggle -------- */
const SYMA_DEV_TRACE = isTraceEnabled();

/* --------------------- Rule extraction ----------------------- */
/* We expect: Rules[...] where each rule is R[name:Str, lhs:Expr, rhs:Expr, prio?:Num] */
const isR = n => isCall(n) && isSym(n.h) && n.h.v === "R";
const isVar = n => isCall(n) && isSym(n.h) && n.h.v === "Var" && n.a.length === 1 && isStr(n.a[0]);
const isVarRest = n =>
    isCall(n) && isSym(n.h) && n.h.v === "VarRest" && n.a.length === 1 && isStr(n.a[0]);

// --- Meta-rule helpers ---
function findSection(universe, name) {
    if (!isCall(universe) || !isSym(universe.h) || universe.h.v !== "Universe")
        throw new Error("Expected root Universe[...]");
    return universe.a.find(n => isCall(n) && isSym(n.h) && n.h.v === name) || null;
}
function extractRulesFromNode(rulesNode) {
    if (!rulesNode || !isCall(rulesNode) || !isSym(rulesNode.h) || (rulesNode.h.v !== "Rules" && rulesNode.h.v !== "RuleRules"))
        throw new Error("extractRulesFromNode: expected Rules[...] or RuleRules[...] node");
    const rs = [];
    for (const r of rulesNode.a) {
        if (!isR(r)) throw new Error(`Rules must contain R[...] entries; found ${show(r)}`);
        if (r.a.length < 3) throw new Error("R[name, lhs, rhs, ...] requires at least 3 arguments");

        const [nm, lhs, rhs, ...rest] = r.a;
        if (!isStr(nm)) throw new Error("R[name] must be Str");

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
    return rs;
}

function extractRules(universe) {
    if (!isCall(universe) || !isSym(universe.h) || universe.h.v !== "Universe")
        throw new Error("Expected root Universe[...]");
    const baseRulesNode = findSection(universe, "Rules");
    if (!baseRulesNode) throw new Error("Universe missing Rules[...]");

    // Optional meta-rules that rewrite R[...] terms
    const ruleRulesNode = findSection(universe, "RuleRules");
    let effectiveRulesNode = baseRulesNode;
    if (ruleRulesNode) {
        // The meta-rules themselves are ordinary R[...] over R[...] trees
        const meta = extractRulesFromNode(ruleRulesNode);
        effectiveRulesNode = normalize(baseRulesNode, meta);
    }
    return extractRulesFromNode(effectiveRulesNode);
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
function match(pat, subj, env = {}) {
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

function subst(expr, env) {
    if (isVar(expr)) {
        const name = expr.a[0].v;
        // Wildcard _ should never appear in RHS, but handle gracefully
        if (name === "_") throw new Error("subst: wildcard _ cannot be used in replacement");
        if (!(name in env)) throw new Error(`subst: unbound var ${name}`);
        return env[name];
    }
    if (isVarRest(expr)) {
        const name = expr.a[0].v;
        // Wildcard ___ should never appear in RHS, but handle gracefully
        if (name === "_") throw new Error("subst: wildcard ___ cannot be used in replacement");
        const seq = env[name] || [];
        if (!Array.isArray(seq)) throw new Error(`subst: VarRest ${name} expected sequence`);
        // Recursively substitute inside the sequence
        return Splice(seq.map(n => subst(n, env)));
    }
    if (isSym(expr) || isNum(expr) || isStr(expr)) return expr;
    if (isCall(expr)) {
        const h = subst(expr.h, env);
        const mapped = expr.a.map(a => subst(a, env));
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

/* applyOnce: outermost-first, highest-priority rule wins */
function applyOnce(expr, rules) {
    // Try to rewrite this node
    for (const r of rules) {
        const env = match(r.lhs, expr, {});
        if (env) {
            // Check guard if present
            if (r.guard) {
                // Substitute the guard with matched bindings
                const guardValue = subst(r.guard, env);
                // Evaluate the guard expression
                const evaluatedGuard = foldPrims(guardValue);
                // Guard must evaluate to the symbol True
                if (!isSym(evaluatedGuard) || evaluatedGuard.v !== "True") {
                    continue; // Guard failed, try next rule
                }
            }
            const out = subst(r.rhs, env);
            return {changed: true, expr: out};
        }
    }
    // Otherwise try children (pre-order)
    if (isCall(expr)) {
        for (let i = 0; i < expr.a.length; i++) {
            const child = expr.a[i];
            const res = applyOnce(child, rules);
            if (res.changed) {
                const next = clone(expr);
                next.a[i] = res.expr;
                return {changed: true, expr: next};
            }
        }
    }
    return {changed: false, expr};
}

/* Tracing variant: track rule name + path of rewrite (iterative, pre-order) */
function applyOnceTrace(expr, rules) {
    // Work items hold: parentRef, keyInParent, node, path (array of 'h' or arg index)
    const work = [{ parent: null, key: null, node: expr, path: [] }];
    while (work.length) {
        const { parent, key, node, path } = work.shift();
        // Try rules at this node
        for (const r of rules) {
            const env = match(r.lhs, node, {});
            if (env) {
                // Check guard if present
                if (r.guard) {
                    // Substitute the guard with matched bindings
                    const guardValue = subst(r.guard, env);
                    // Evaluate the guard expression
                    const evaluatedGuard = foldPrims(guardValue);
                    // Guard must evaluate to the symbol True
                    if (!isSym(evaluatedGuard) || evaluatedGuard.v !== "True") {
                        continue; // Guard failed, try next rule
                    }
                }
                const out = subst(r.rhs, env);
                if (parent === null) {
                    return {
                        changed: true,
                        expr: out,
                        rule: r.name,
                        path,
                        before: node,
                        after: out
                    };
                } else {
                    // write in place into a cloned top-level expr
                    const root = clone(expr);
                    // navigate to parent along path excluding last step
                    let cursor = root;
                    for (let i = 0; i < path.length - 1; i++) {
                        const p = path[i];
                        cursor = (p === 'h') ? cursor.h : cursor.a[p];
                    }
                    const last = path[path.length - 1];
                    if (last === undefined) {
                        // path points to root
                        return {
                            changed: true, expr: out, rule: r.name, path, before: node, after: out
                        };
                    }
                    if (last === 'h') cursor.h = out; else cursor.a[last] = out;
                    return {
                        changed: true,
                        expr: root,
                        rule: r.name,
                        path,
                        before: node,
                        after: out
                    };
                }
            }
        }
        // Enqueue children (pre-order: head, then args)
        if (isCall(node)) {
            work.push({ parent: node, key: 'h', node: node.h, path: path.concat('h') });
            for (let i = 0; i < node.a.length; i++) {
                work.push({ parent: node, key: i, node: node.a[i], path: path.concat(i) });
            }
        }
    }
    return { changed: false, expr, rule: null, path: null, before: null, after: null };
}


function normalize(expr, rules, maxSteps = 10000) {
    let cur = expr;
    for (let i = 0; i < maxSteps; i++) {
        const step = applyOnce(cur, rules);
        cur = foldPrims(step.expr);   // <-- add this line
        if (!step.changed) return cur;
    }
    throw new Error("normalize: exceeded maxSteps (possible non-termination)");
}

/* Normalization with step trace for debugger UIs */
function normalizeWithTrace(expr, rules, maxSteps = 10000) {
    let cur = expr;
    const trace = [];
    for (let i = 0; i < maxSteps; i++) {
        const step = applyOnceTrace(cur, rules);
        cur = foldPrims(step.expr);
        if (!step.changed) return {result: cur, trace};
        // Human-friendly snapshot of *this* rewrite
        trace.push({
            i,
            rule: step.rule,
            path: step.path,
            before: step.before,
            after: step.after
        });
    }
    throw new Error("normalizeWithTrace: exceeded maxSteps (possible non-termination)");
}


/* --------------------- Universe plumbing --------------------- */
function getProgram(universe) {
    const node = universe.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "Program");
    if (!node) throw new Error("Universe missing Program[...]");
    return node;
}

/**
 * Ensure Program has Effects structure for backward compatibility
 * If Program[App[...]] found, enrich to Program[App[...], Effects[Pending[], Inbox[]]]
 */
function enrichProgramWithEffects(universe) {
    const prog = getProgram(universe);

    // Check if Effects already exists
    const hasEffects = prog.a.some(n => isCall(n) && isSym(n.h) && n.h.v === "Effects");
    if (hasEffects) return universe;

    // Add Effects[Pending[], Inbox[]] to Program
    const enrichedProg = clone(prog);
    enrichedProg.a.push(Call(Sym("Effects"), Call(Sym("Pending")), Call(Sym("Inbox"))));

    return setProgram(universe, enrichedProg);
}

function getProgramApp(universe) {
    const prog = getProgram(universe);
    // Program might contain [App[...]] or [App[...], Effects[...]]
    const app = prog.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "App");
    return app || prog.a[0];
}

function setProgram(universe, newProg) {
    const i = universe.a.findIndex(n => isCall(n) && isSym(n.h) && n.h.v === "Program");
    if (i < 0) throw new Error("Universe missing Program[...]");
    const uni = clone(universe);
    uni.a[i] = newProg;
    return uni;
}

function setProgramApp(universe, newApp) {
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
function dispatch(universe, rules, actionTerm) {
    // Recompute rules from current universe in case RuleRules rewrote Rules
    rules = extractRules(universe);
    const prog = getProgram(universe);
    const applied = Call(Sym("Apply"), actionTerm, prog);
    let newProg;
    if (SYMA_DEV_TRACE) {
        const {result, trace} = normalizeWithTrace(applied, rules);
        logDispatchTrace(actionTerm, trace);
        newProg = result;
    } else {
        newProg = normalize(applied, rules);
    }
    return setProgram(universe, newProg);
}

/* --------------------- Minimal DOM projector ------------------ */

/* Supports: App[ State[...], UI[ ... ]] with VStack, HStack, Text, Button[Str, OnClick->action] */


function splitPropsAndChildren(node) {
    if (!isCall(node)) return {props: null, children: []};
    if (node.a.length && isCall(node.a[0]) && isSym(node.a[0].h) && node.a[0].h.v === "Props") {
        const propsNode = node.a[0];
        const children = node.a.slice(1);
        const props = {};
        for (const kv of propsNode.a) {
            if (!isCall(kv) || !isSym(kv.h) || kv.h.v !== "KV" || kv.a.length !== 2 || !isStr(kv.a[0])) {
                throw new Error(`Props expects KV[str, value]; got ${show(kv)}`);
            }
            props[kv.a[0].v] = kv.a[1];
        }
        return {props, children};
    }
    return {props: null, children: node.a};
}

function renderUniverseToDOM(universe, mount, onDispatch) {
    mount.innerHTML = ""; // simple full replace (can optimize with keyed diff)
    const app = getProgramApp(universe);
    if (!isCall(app) || !isSym(app.h) || app.h.v !== "App")
        throw new Error("Program must contain App[state, ui]");

    const [state, ui] = app.a;
    mount.appendChild(renderUI(ui, state, onDispatch));
}

// Normalize a symbolic UI node under current App/State context and return a UI node
function projectUI(node, state) {
    // Build /@ node: (/@ node (App state _))
    const annotated = Call(Sym("/@"), node, Call(Sym("App"), state, Sym("_")));
    const currentRules = extractRules(GLOBAL_UNIVERSE);
    const reduced = SYMA_DEV_TRACE
        ? normalizeWithTrace(annotated, currentRules).result
        : normalize(annotated, currentRules);
    return reduced;
}

function renderUI(node, state, onDispatch) {
    if (!isCall(node) || !isSym(node.h)) throw new Error(`UI node must be Call; got ${show(node)}`);
    const tag = node.h.v;

    if (tag === "/@") {
        const currentRules = extractRules(GLOBAL_UNIVERSE);
        const reduced = SYMA_DEV_TRACE
            ? normalizeWithTrace(node, currentRules).result
            : normalize(node, currentRules);
        return renderUI(reduced, state, onDispatch);
    }

    if (tag === "Project") {
        if (node.a.length !== 1) throw new Error("Project[...] expects exactly one child expression");
        const rendered = projectUI(node.a[0], state);
        // The result may be a Text-like atom or another UI call
        if (isStr(rendered) || isNum(rendered) || isSym(rendered)) {
            const span = document.createElement("span");
            span.appendChild(renderTextPart(rendered, state));
            return span;
        }
        return renderUI(rendered, state, onDispatch);
    }

    if (tag === "UI") {
        if (node.a.length !== 1) throw new Error("UI[...] must wrap exactly one subtree");
        return renderUI(node.a[0], state, onDispatch);
    }

    const {props, children} = splitPropsAndChildren(node);
    const el = document.createElement(tag.toLowerCase());

    if (props) {
        for (const [k, v] of Object.entries(props)) {
            // Handle ALL events generically - any prop starting with "on"
            if (k.startsWith("on")) {
                const eventName = k.slice(2).toLowerCase(); // onClick -> click, onMouseOver -> mouseover
                el.addEventListener(eventName, createEventHandler(v, onDispatch));
                continue;
            }

            // Handle two-way bindings (e.g., bind-value, bind-checked)
            if (k.startsWith("bind-")) {
                const bindingType = k.slice(5); // bind-value -> value
                handleBinding(el, bindingType, v, onDispatch);
                continue;
            }

            // Regular attributes
            if (isStr(v) || isNum(v)) {
                el.setAttribute(k, isStr(v) ? v.v : String(v.v));
            } else if (isSym(v)) {
                el.setAttribute(k, v.v);
            } else {
                // For complex values, might be a binding expression
                if (isCall(v) && isSym(v.h) && v.h.v === "Input") {
                    // Special handling for (Input fieldName) in attributes
                    handleBinding(el, k, v, onDispatch);
                } else {
                    el.setAttribute(k, JSON.stringify(v));
                }
            }
        }
    }

    for (const ch of children) {
        // strings/numbers/Show[...] become text; Calls recurse
        if (isStr(ch) || isNum(ch) || (isCall(ch) && isSym(ch.h) && ch.h.v === "Show") || isSym(ch)) {
            el.appendChild(renderTextPart(ch, state));
        } else {
            el.appendChild(renderUI(ch, state, onDispatch));
        }
    }
    return el;
}


function renderTextPart(part, state) {
    // Two cases:
    // 1) literal Str / Num
    // 2) symbolic Show[...] that needs to normalize under (App[State, _])
    if (isStr(part)) return document.createTextNode(part.v);
    if (isNum(part)) return document.createTextNode(String(part.v));

    if (isCall(part) && isSym(part.h) && part.h.v === "Show") {
        // Build a tiny projection context: Show[x] /@ App[State, _] -> Str[...]
        const appCtx = Call(Sym("App"), state, Sym("_"));
        const annotated = Call(Sym("/@"), part, appCtx); // “apply in context” idiom
        // Let rules reduce it; if it doesn't become Str/Num, complain
        const reduced = (() => {
            const currentRules = extractRules(GLOBAL_UNIVERSE);
            if (SYMA_DEV_TRACE) {
                const {result, trace} = normalizeWithTrace(annotated, currentRules);
                logProjectionTrace(part, trace);
                return result;
            }
            return normalize(annotated, currentRules);
        })();
        if (isStr(reduced)) return document.createTextNode(reduced.v);
        if (isNum(reduced)) return document.createTextNode(String(reduced.v));
        // If your rules emit Call(Str[...]) etc., adjust here
        const currentRules = extractRules(GLOBAL_UNIVERSE);
        logProjectionFailure(part, annotated, reduced, currentRules);
        throw new Error(`Show[...] did not reduce to Str/Num. Got: ${show(reduced)}`);
    }

    // If plain Sym leaks here, stringify it
    if (isSym(part)) return document.createTextNode(part.v);

    throw new Error(`Unsupported Text part: ${show(part)}`);
}

/* --------------------- Boot glue ----------------------------- */
let GLOBAL_UNIVERSE = null;
let GLOBAL_RULES = null;

async function boot(universeOrUrl, mountSelector = "#app") {
    let uni;

    // Check if it's a URL string or a direct AST object
    if (typeof universeOrUrl === 'string') {
        // Legacy mode: fetch from URL
        const res = await fetch(universeOrUrl);
        if (!res.ok) throw new Error(`Failed to load universe: ${res.status}`);
        uni = await res.json();
    } else {
        // Direct import mode: use the AST directly
        uni = universeOrUrl;
    }

    // Enrich Program with Effects if missing (for backward compatibility)
    uni = enrichProgramWithEffects(uni);

    GLOBAL_UNIVERSE = uni;
    GLOBAL_RULES = extractRules(uni);

    const mount = document.querySelector(mountSelector);
    if (!mount) throw new Error(`Mount not found: ${mountSelector}`);

    const dispatchAction = (action) => {
        // Inject Apply[action, Program] normalization
        GLOBAL_UNIVERSE = dispatch(GLOBAL_UNIVERSE, GLOBAL_RULES, action);
        renderUniverseToDOM(GLOBAL_UNIVERSE, mount, dispatchAction);
    };

    // Initial render (if your rules expect pre-normalization, do it here too)
    renderUniverseToDOM(GLOBAL_UNIVERSE, mount, dispatchAction);

    // Create effects processor to handle symbolic effects
    const effectsProcessor = createEffectsProcessor(
        () => getProgram(GLOBAL_UNIVERSE),
        (newProg) => {
            // After effects update, normalize to trigger inbox processing rules
            const normalized = normalize(newProg, GLOBAL_RULES);
            GLOBAL_UNIVERSE = setProgram(GLOBAL_UNIVERSE, normalized);
        },
        () => {
            // Re-render after effects update
            renderUniverseToDOM(GLOBAL_UNIVERSE, mount, dispatchAction);
        }
    );

    // Return a handle for HMR
    return {
        universe: GLOBAL_UNIVERSE,
        reload: () => {
            // Re-enrich in case the reloaded version doesn't have Effects
            uni = enrichProgramWithEffects(uni);
            GLOBAL_UNIVERSE = uni;
            GLOBAL_RULES = extractRules(uni);
            renderUniverseToDOM(GLOBAL_UNIVERSE, mount, dispatchAction);
        },
        effectsProcessor
    };
}

/* Helper to trace the exact projector path for Show[...] terms */
function traceProjection(part, state) {
    const appCtx = Call(Sym("App"), state, Sym("_"));
    const annotated = Call(Sym("/@"), part, appCtx);
    return normalizeWithTrace(annotated, extractRules(GLOBAL_UNIVERSE));
}

/* --------------------- Expose API ---------------------------- */
window.SymbolicHost = {boot, show, dispatch, normalize, normalizeWithTrace, formatStep, traceProjection, freshId};

Object.defineProperty(window, "GLOBAL_UNIVERSE", {
    get: () => GLOBAL_UNIVERSE
});
Object.defineProperty(window, "GLOBAL_RULES", {
    get: () => GLOBAL_RULES
});

// Dynamic toggle for trace in console: SymbolicHost.setTrace(true/false)
const setTrace = debugSetTrace;
window.SymbolicHost = {...window.SymbolicHost, setTrace};

export {boot, show, dispatch, clearInput, getInputValue, freshId};
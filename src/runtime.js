/*****************************************************************
 * Symbolic Host Runtime (minimal, no stubs)
 * - Load Universe AST
 * - Compile Rules (Var[...] patterns)
 * - Normalize Program via Rules + Strategy (outermost-first)
 * - Render tiny UI subset to DOM
 * - Event bridge: Apply[action, Program] + Normalize
 ******************************************************************/

/* --------------------- AST helpers --------------------------- */
const K = {
    Sym: "Sym",
    Num: "Num",
    Str: "Str",
    Call: "Call"
};
/* -------- Dev trace toggle -------- */
// Enable tracing via:
//   1) window.SYMA_DEV_TRACE = true
//   2) or URL query ?trace (any value)
// Tracing prints a step-by-step rewrite log (rule, path, before -> after).
const SYMA_DEV_TRACE = (() => {
    try {
        const q = new URLSearchParams(window.location.search);
        if (q.has('trace')) return true;
        if (typeof window !== 'undefined' && window.SYMA_DEV_TRACE === true) return true;
    } catch (_) {
    }
    return false;
})();

const Sym = v => ({k: K.Sym, v});
const Num = v => ({k: K.Num, v});
const Str = v => ({k: K.Str, v});
const Call = (h, ...a) => ({k: K.Call, h, a});

/* type guards */
const isSym = n => n && n.k === K.Sym;
const isNum = n => n && n.k === K.Num;
const isStr = n => n && n.k === K.Str;
const isCall = n => n && n.k === K.Call;

/* Deep clone (small trees, simple) */
const clone = n => JSON.parse(JSON.stringify(n));

/* Structural deep equality */
const deq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const Splice  = (items) => ({ __splice: true, items });
const isSplice = (x) => x && x.__splice === true && Array.isArray(x.items);
const arrEq   = (A, B) =>
    Array.isArray(A) && Array.isArray(B) &&
    A.length === B.length && A.every((x,i)=>deq(x,B[i]));

/* Pretty (for debugging) */
const show = n => {
    if (isSym(n)) return n.v;
    if (isNum(n)) return String(n.v);
    if (isStr(n)) return JSON.stringify(n.v);
    if (isCall(n)) return `${show(n.h)}[${n.a.map(show).join(", ")}]`;
    throw new Error("show: unknown node kind");
};

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
        const [nm, lhs, rhs, prio] = r.a;
        if (!isStr(nm)) throw new Error("R[name] must be Str");
        rs.push({ name: nm.v, lhs, rhs, prio: (prio && isNum(prio)) ? prio.v : 0 });
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
        if (Object.prototype.hasOwnProperty.call(e1, name)) {
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
        if (!(name in env)) throw new Error(`subst: unbound var ${name}`);
        return env[name];
    }
    if (isVarRest(expr)) {
        const name = expr.a[0].v;
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

function foldPrims(node) {
    if (isCall(node)) {
        const h = foldPrims(node.h);
        const a = node.a.map(foldPrims);
        // Host arithmetic: Add[Num, Num] -> Num(sum)
        if (isSym(h) && h.v === "Add" && a.length === 2 && isNum(a[0]) && isNum(a[1])) {
            return Num(a[0].v + a[1].v);
        }
        return {k: K.Call, h, a};
    }
    // atoms unchanged
    if (isSym(node) || isNum(node) || isStr(node)) return node;
    throw new Error("foldPrims: unknown node");
}

function normalize(expr, rules, maxSteps = 1000) {
    let cur = expr;
    for (let i = 0; i < maxSteps; i++) {
        const step = applyOnce(cur, rules);
        cur = foldPrims(step.expr);   // <-- add this line
        if (!step.changed) return cur;
    }
    throw new Error("normalize: exceeded maxSteps (possible non-termination)");
}

/* Normalization with step trace for debugger UIs */
function normalizeWithTrace(expr, rules, maxSteps = 1000) {
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

/* Pretty formatter for console use */
function formatStep(step) {
    const pathStr = Array.isArray(step.path) ? `[${step.path.join(".")}]` : "[]";
    return `#${step.i} ${step.rule || "<host/prim>"} ${pathStr}: ${show(step.before)} -> ${show(step.after)}`;
}

/* --------------------- Universe plumbing --------------------- */
function getProgram(universe) {
    const node = universe.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "Program");
    if (!node) throw new Error("Universe missing Program[...]");
    if (node.a.length !== 1) throw new Error("Program[...] must have exactly one child");
    return node.a[0];
}

function setProgram(universe, newProg) {
    const i = universe.a.findIndex(n => isCall(n) && isSym(n.h) && n.h.v === "Program");
    if (i < 0) throw new Error("Universe missing Program[...]");
    const progWrapper = clone(universe.a[i]);
    progWrapper.a[0] = newProg;
    const uni = clone(universe);
    uni.a[i] = progWrapper;
    return uni;
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
        try {
            console.groupCollapsed?.(`[SYMA TRACE] dispatch ${show(actionTerm)}`);
            trace.forEach(step => console.log(formatStep(step)));
            console.groupEnd?.();
        } catch (_) {
        }
        newProg = result;
    } else {
        newProg = normalize(applied, rules);
    }
    return setProgram(universe, newProg);
}

/* --------------------- Minimal DOM projector ------------------ */

/* Supports: App[ State[...], UI[ ... ]] with VStack, HStack, Text, Button[Str, OnClick->action] */

// ---- Debug helpers for /@ projection failures ----
function tryMatchBool(pat, subj) {
    try { return match(pat, subj, {}) !== null; } catch (_) { return false; }
}
function explainProjectionFailure(annotated, rules) {
    // annotated is /@[part, App[State[...], _]]
    const out = [];
    const lhsCandidates = rules.filter(r => isCall(r.lhs) && isSym(r.lhs.h) && r.lhs.h.v === "/@");
    for (const r of lhsCandidates) {
        const pat = r.lhs;
        const headOK = true; // filtered by "/@"
        const arityOK = isCall(pat) && isCall(annotated) && pat.a.length === annotated.a.length;
        let partOK = false, ctxOK = false;
        if (arityOK) {
            // Check first arg (the Show[...] part) in isolation
            partOK = tryMatchBool(pat.a[0], annotated.a[0]);
            // Check second arg (the App[State[..], _]) in isolation
            ctxOK = tryMatchBool(pat.a[1], annotated.a[1]);
        }
        out.push({
            rule: r.name,
            headOK,
            arityOK,
            partOK,
            ctxOK,
            lhs: show(r.lhs)
        });
    }
    return out;
}

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
    const prog = getProgram(universe);
    if (!isCall(prog) || !isSym(prog.h) || prog.h.v !== "App")
        throw new Error("Program must be App[state, ui]");

    const [state, ui] = prog.a;
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
            if (k === "onClick") {
                el.onclick = () => onDispatch(v); // v is an action term
                continue;
            }
            if (isStr(v) || isNum(v)) el.setAttribute(k, isStr(v) ? v.v : String(v.v));
            else if (isSym(v)) el.setAttribute(k, v.v);
            else el.setAttribute(k, JSON.stringify(v));
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
                try {
                    console.groupCollapsed?.(`[SYMA TRACE] project ${show(part)}`);
                    trace.forEach(step => console.log(formatStep(step)));
                    console.groupEnd?.();
                } catch (_) {
                }
                return result;
            }
            return normalize(annotated, currentRules);
        })();
        if (isStr(reduced)) return document.createTextNode(reduced.v);
        if (isNum(reduced)) return document.createTextNode(String(reduced.v));
        // If your rules emit Call(Str[...]) etc., adjust here
        try {
            const currentRules = extractRules(GLOBAL_UNIVERSE);
            const hints = explainProjectionFailure(annotated, currentRules)
                .filter(h => h.headOK)
                .slice(0, 8);
            console.groupCollapsed?.(`[SYMA HINT] /@ failed for ${show(part)} in context; result=${show(reduced)}`);
            console.log("Annotated:", show(annotated));
            if (hints.length === 0) {
                console.log("No /@ rules found. Ensure a rule like (R \"ShowX\" (/@ (Show X) (App (State ...) _)) ... ) exists.");
            } else {
                console.table(hints);
            }
            console.groupEnd?.();
        } catch (_) {}
        throw new Error(`Show[...] did not reduce to Str/Num. Got: ${show(reduced)}`);
    }

    // If plain Sym leaks here, stringify it
    if (isSym(part)) return document.createTextNode(part.v);

    throw new Error(`Unsupported Text part: ${show(part)}`);
}

/* --------------------- Boot glue ----------------------------- */
let GLOBAL_UNIVERSE = null;
let GLOBAL_RULES = null;

async function boot(universeJsonUrl, mountSelector = "#app") {
    const res = await fetch(universeJsonUrl);
    if (!res.ok) throw new Error(`Failed to load universe: ${res.status}`);
    const uni = await res.json();

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
}

/* Helper to trace the exact projector path for Show[...] terms */
function traceProjection(part, state) {
    const appCtx = Call(Sym("App"), state, Sym("_"));
    const annotated = Call(Sym("/@"), part, appCtx);
    return normalizeWithTrace(annotated, extractRules(GLOBAL_UNIVERSE));
}

/* --------------------- Expose API ---------------------------- */
window.SymbolicHost = {boot, show, dispatch, normalize, normalizeWithTrace, formatStep, traceProjection};

Object.defineProperty(window, "GLOBAL_UNIVERSE", {
    get: () => GLOBAL_UNIVERSE
});
Object.defineProperty(window, "GLOBAL_RULES", {
    get: () => GLOBAL_RULES
});

// Dynamic toggle for trace in console: SymbolicHost.setTrace(true/false)
function setTrace(v) {
    try {
        window.SYMA_DEV_TRACE = !!v;
    } catch (_) {
    }
    // No re-render here; next dispatch/projection will honor it.
    return !!v;
}

window.SymbolicHost = {...window.SymbolicHost, setTrace};

export {boot, show, dispatch};
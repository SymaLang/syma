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
    Sym:  "Sym",
    Num:  "Num",
    Str:  "Str",
    Call: "Call"
};
const Sym  = v => ({k:K.Sym, v});
const Num  = v => ({k:K.Num, v});
const Str  = v => ({k:K.Str, v});
const Call = (h, ...a) => ({k:K.Call, h, a});

/* type guards */
const isSym  = n => n && n.k===K.Sym;
const isNum  = n => n && n.k===K.Num;
const isStr  = n => n && n.k===K.Str;
const isCall = n => n && n.k===K.Call;

/* Deep clone (small trees, simple) */
const clone = n => JSON.parse(JSON.stringify(n));

/* Structural deep equality */
const deq = (a,b) => JSON.stringify(a) === JSON.stringify(b);

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
const isR   = n => isCall(n) && isSym(n.h) && n.h.v==="R";
const isVar = n => isCall(n) && isSym(n.h) && n.h.v==="Var" && n.a.length===1 && isStr(n.a[0]);

function extractRules(universe) {
    // Universe[...] = Call(Sym("Universe"), [...])
    if (!isCall(universe) || !isSym(universe.h) || universe.h.v!=="Universe")
        throw new Error("Expected root Universe[...]");

    // Find Rules[...] node among Universe children
    const rulesNode = universe.a.find(n => isCall(n) && isSym(n.h) && n.h.v==="Rules");
    if (!rulesNode) throw new Error("Universe missing Rules[...]");

    // Extract R[...] entries
    const rs = [];
    for (const r of rulesNode.a) {
        if (!isR(r)) throw new Error(`Rules must contain R[...] entries; found ${show(r)}`);
        const [nm,lhs,rhs,prio] = r.a;
        if (!isStr(nm)) throw new Error("R[name] must be Str");
        rs.push({
            name: nm.v,
            lhs:  lhs,
            rhs:  rhs,
            prio: (prio && isNum(prio)) ? prio.v : 0
        });
    }
    // High priority first
    rs.sort((a,b)=> b.prio - a.prio);
    return rs;
}

/* --------------------- Pattern matching ---------------------- */
/* Env: plain object mapping var name -> Expr */
function match(pat, subj, env={}) {
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
        if (pat.a.length !== subj.a.length) return null;
        let e = env1;
        for (let i=0;i<pat.a.length;i++) {
            e = match(pat.a[i], subj.a[i], e);
            if (!e) return null;
        }
        return e;
    }
    throw new Error("match: unknown pattern node");
}

function subst(expr, env) {
    if (isVar(expr)) {
        const name = expr.a[0].v;
        if (!(name in env)) throw new Error(`subst: unbound var ${name}`);
        return env[name];
    }
    if (isSym(expr) || isNum(expr) || isStr(expr)) return expr;
    if (isCall(expr)) {
        return Call(subst(expr.h, env), ...expr.a.map(a => subst(a, env)));
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
            return {changed:true, expr: out};
        }
    }
    // Otherwise try children (pre-order)
    if (isCall(expr)) {
        for (let i=0;i<expr.a.length;i++) {
            const child = expr.a[i];
            const res = applyOnce(child, rules);
            if (res.changed) {
                const next = clone(expr);
                next.a[i] = res.expr;
                return {changed:true, expr: next};
            }
        }
    }
    return {changed:false, expr};
}

function foldPrims(node) {
    if (isCall(node)) {
        const h = foldPrims(node.h);
        const a = node.a.map(foldPrims);
        // Host arithmetic: Add[Num, Num] -> Num(sum)
        if (isSym(h) && h.v==="Add" && a.length===2 && isNum(a[0]) && isNum(a[1])) {
            return Num(a[0].v + a[1].v);
        }
        return {k:K.Call, h, a};
    }
    // atoms unchanged
    if (isSym(node) || isNum(node) || isStr(node)) return node;
    throw new Error("foldPrims: unknown node");
}

function normalize(expr, rules, maxSteps=1000) {
    let cur = expr;
    for (let i=0;i<maxSteps;i++) {
        const step = applyOnce(cur, rules);
        cur = foldPrims(step.expr);   // <-- add this line
        if (!step.changed) return cur;
    }
    throw new Error("normalize: exceeded maxSteps (possible non-termination)");
}

/* --------------------- Universe plumbing --------------------- */
function getProgram(universe) {
    const node = universe.a.find(n => isCall(n) && isSym(n.h) && n.h.v==="Program");
    if (!node) throw new Error("Universe missing Program[...]");
    if (node.a.length!==1) throw new Error("Program[...] must have exactly one child");
    return node.a[0];
}
function setProgram(universe, newProg) {
    const i = universe.a.findIndex(n => isCall(n) && isSym(n.h) && n.h.v==="Program");
    if (i<0) throw new Error("Universe missing Program[...]");
    const progWrapper = clone(universe.a[i]);
    progWrapper.a[0] = newProg;
    const uni = clone(universe);
    uni.a[i] = progWrapper;
    return uni;
}

/* Inject an action: Program := Normalize( Apply[action, Program] ) */
function dispatch(universe, rules, actionTerm) {
    const prog = getProgram(universe);
    const applied = Call(Sym("Apply"), actionTerm, prog);
    const newProg = normalize(applied, rules);
    return setProgram(universe, newProg);
}

/* --------------------- Minimal DOM projector ------------------ */
/* Supports: App[ State[...], UI[ ... ]] with VStack, HStack, Text, Button[Str, OnClick->action] */

function renderUniverseToDOM(universe, mount, onDispatch) {
    mount.innerHTML = ""; // simple full replace (can optimize with keyed diff)
    const prog = getProgram(universe);
    if (!isCall(prog) || !isSym(prog.h) || prog.h.v!=="App")
        throw new Error("Program must be App[state, ui]");

    const [state, ui] = prog.a;
    mount.appendChild(renderUI(ui, state, onDispatch));
}

function renderUI(node, state, onDispatch) {
    if (!isCall(node) || !isSym(node.h)) throw new Error(`UI node must be Call; got ${show(node)}`);
    const tag = node.h.v;

    if (tag === "UI") {
        if (node.a.length!==1) throw new Error("UI[...] must wrap exactly one subtree");
        return renderUI(node.a[0], state, onDispatch);
    }

    if (tag === "VStack") {
        const el = document.createElement("div");
        el.style.display = "flex";
        el.style.flexDirection = "column";
        el.style.gap = "8px";
        node.a.forEach(child => el.appendChild(renderUI(child, state, onDispatch)));
        return el;
    }

    if (tag === "HStack") {
        const el = document.createElement("div");
        el.style.display = "flex";
        el.style.gap = "8px";
        el.style.alignItems = "center";
        node.a.forEach(child => el.appendChild(renderUI(child, state, onDispatch)));
        return el;
    }

    if (tag === "Text") {
        const span = document.createElement("span");
        node.a.forEach(part => span.appendChild(renderTextPart(part, state)));
        return span;
    }

    if (tag === "Button") {
        const [label, meta] = node.a;
        const btn = document.createElement("button");
        btn.appendChild(renderTextPart(label, state));

        // Expect OnClick[action]
        let action = null;
        if (meta && isCall(meta) && isSym(meta.h) && meta.h.v==="OnClick") {
            if (meta.a.length!==1) throw new Error("OnClick must have exactly one action argument");
            action = meta.a[0];
        } else {
            throw new Error(`Button missing OnClick[...] meta: ${show(node)}`);
        }

        btn.onclick = () => onDispatch(action);
        return btn;
    }

    // Allow custom UI terms that reduce to primitives via rules before projection.
    // If something non-primitive leaked here, that's a modeling error:
    throw new Error(`Unknown UI tag: ${tag}`);
}

function renderTextPart(part, state) {
    // Two cases:
    // 1) literal Str / Num
    // 2) symbolic Show[...] that needs to normalize under (App[State, _])
    if (isStr(part)) return document.createTextNode(part.v);
    if (isNum(part)) return document.createTextNode(String(part.v));

    if (isCall(part) && isSym(part.h) && part.h.v==="Show") {
        // Build a tiny projection context: Show[x] /@ App[State, _] -> Str[...]
        const appCtx = Call(Sym("App"), state, Sym("_"));
        const annotated = Call(Sym("/@"), part, appCtx); // “apply in context” idiom
        // Let rules reduce it; if it doesn't become Str/Num, complain
        const reduced = normalize(annotated, GLOBAL_RULES); // GLOBAL_RULES captured at boot
        if (isStr(reduced)) return document.createTextNode(reduced.v);
        if (isNum(reduced)) return document.createTextNode(String(reduced.v));
        // If your rules emit Call(Str[...]) etc., adjust here
        throw new Error(`Show[...] did not reduce to Str/Num. Got: ${show(reduced)}`);
    }

    // If plain Sym leaks here, stringify it
    if (isSym(part)) return document.createTextNode(part.v);

    throw new Error(`Unsupported Text part: ${show(part)}`);
}

/* --------------------- Boot glue ----------------------------- */
let GLOBAL_UNIVERSE = null;
let GLOBAL_RULES    = null;

async function boot(universeJsonUrl, mountSelector="#app") {
    const res = await fetch(universeJsonUrl);
    if (!res.ok) throw new Error(`Failed to load universe: ${res.status}`);
    const uni = await res.json();

    GLOBAL_UNIVERSE = uni;
    GLOBAL_RULES    = extractRules(uni);

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

/* --------------------- Expose API ---------------------------- */
window.SymbolicHost = { boot, show, dispatch, normalize };

Object.defineProperty(window, "GLOBAL_UNIVERSE", {
    get: () => GLOBAL_UNIVERSE
});
Object.defineProperty(window, "GLOBAL_RULES", {
    get: () => GLOBAL_RULES
});


export { boot, show, dispatch };
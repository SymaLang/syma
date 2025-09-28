/**
 * DOM Projector for Syma Runtime
 *
 * Renders symbolic UI representations to browser DOM.
 * Handles event binding, dynamic content projection, and UI updates.
 */

import { BaseProjector } from './base.js';
import { Sym, Call, isSym, isNum, isStr, isCall, isSplice, show } from '../ast-helpers.js';
import { createEventHandler, handleBinding } from '../events.js';
import { logProjectionTrace, logProjectionFailure, explainProjectionFailure, getTraceState } from '../debug.js';

/**
 * DOM Projector implementation
 */
export class DOMProjector extends BaseProjector {
    constructor() {
        super();
        this.universe = null;
        this.rules = null;
        this.normalizeFunc = null;
        this.extractRulesFunc = null;
    }

    /**
     * Initialize with DOM-specific configuration
     * @param {Object} config - Configuration with mount (DOM element), onDispatch, and options
     */
    init(config) {
        super.init(config);

        if (!(this.mount instanceof HTMLElement)) {
            throw new Error("DOMProjector requires an HTML element as mount point");
        }

        // Store references to runtime functions
        this.normalizeFunc = config.options?.normalize;
        this.extractRulesFunc = config.options?.extractRules;
        this.universe = config.options?.universe;

        if (!this.normalizeFunc || !this.extractRulesFunc) {
            throw new Error("DOMProjector requires normalize and extractRules functions in options");
        }

        return this;
    }

    /**
     * Render universe to DOM
     * @param {Object} universe - The universe AST
     */
    render(universe) {
        this.universe = universe;
        this.mount.innerHTML = ""; // Simple full replace (can optimize with keyed diff)

        const app = this.getProgramApp(universe);
        if (!isCall(app) || !isSym(app.h) || app.h.v !== "App") {
            throw new Error("Program must contain App[state, ui]");
        }

        const [state, ui] = app.a;
        this.mount.appendChild(this.renderUI(ui, state, this.onDispatch));
    }

    /**
     * Project a symbolic UI node under current App/State context
     * @param {Object} node - The node to project
     * @param {Object} state - Current state
     * @returns {Object} Projected node
     */
    project(node, state) {
        // Build /@ node: (/@ node (App state _))
        const annotated = Call(Sym("/@"), node, Call(Sym("App"), state, Sym("_")));
        const currentRules = this.extractRulesFunc(this.universe);

        const reduced = getTraceState()
            ? this.normalizeWithTrace(annotated, currentRules).result
            : this.normalizeFunc(annotated, currentRules);

        // Check if projection failed (still has /@ at the root)
        if (isCall(reduced) && isSym(reduced.h) && reduced.h.v === "/@") {
            throw new Error(`No projection rule found for: ${show(node)}\n` +
                          `Tried to match: ${show(annotated)}\n` +
                          `Make sure you have a rule like: (R "ProjectionRule" (/@ ${show(node)} (App ...)) ...)`);
        }

        return reduced;
    }

    /**
     * Normalize with optional tracing
     */
    normalizeWithTrace(expr, rules) {
        // This would need to be imported from runtime or passed in options
        const normalizeWithTrace = this.options?.normalizeWithTrace;
        if (!normalizeWithTrace) {
            return { result: this.normalizeFunc(expr, rules), trace: [] };
        }
        return normalizeWithTrace(expr, rules);
    }

    /**
     * Get Program/App from universe
     */
    getProgramApp(universe) {
        const prog = universe.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "Program");
        if (!prog) throw new Error("Universe missing Program[...]");

        // Program might contain [App[...]] or [App[...], Effects[...]]
        const app = prog.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "App");
        return app || prog.a[0];
    }

    /**
     * Split props and children from a UI node
     */
    splitPropsAndChildren(node) {
        if (!isCall(node)) return { props: null, children: [] };

        // Check for new-style Props[KV[...], KV[...]] structure
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

            return { props, children };
        }

        // Handle old-style attributes (symbols starting with ':' like :class, :onClick)
        const props = {};
        const children = [];
        let i = 0;

        while (i < node.a.length) {
            const arg = node.a[i];

            // Check if it's an attribute (symbol starting with ':')
            if (isSym(arg) && arg.v.startsWith(':')) {
                const propName = arg.v.slice(1); // Remove the ':'

                // Next argument is the value
                if (i + 1 < node.a.length) {
                    props[propName] = node.a[i + 1];
                    i += 2; // Skip both attribute and value
                } else {
                    throw new Error(`Attribute ${arg.v} missing value`);
                }
            } else {
                // It's a child element
                children.push(arg);
                i++;
            }
        }

        return { props: Object.keys(props).length > 0 ? props : null, children };
    }

    /**
     * Render a UI node to DOM element
     */
    renderUI(node, state, onDispatch) {
        if (!isCall(node) || !isSym(node.h)) {
            throw new Error(`UI node must be Call; got ${show(node)}`);
        }

        const tag = node.h.v;

        // Handle special cases
        if (tag === "/@") {
            const currentRules = this.extractRulesFunc(this.universe);
            const reduced = getTraceState()
                ? this.normalizeWithTrace(node, currentRules).result
                : this.normalizeFunc(node, currentRules);
            return this.renderUI(reduced, state, onDispatch);
        }

        if (tag === "Project") {
            if (node.a.length !== 1) {
                throw new Error("Project[...] expects exactly one child expression");
            }
            const rendered = this.project(node.a[0], state);

            // Check if the result is a Splice (from Splat/...!)
            if (isSplice(rendered)) {
                // Create a DocumentFragment to hold multiple nodes
                const fragment = document.createDocumentFragment();
                for (const child of rendered.items) {
                    if (isStr(child) || isNum(child) || isSym(child)) {
                        const span = document.createElement("span");
                        span.appendChild(this.renderTextPart(child, state));
                        fragment.appendChild(span);
                    } else {
                        fragment.appendChild(this.renderUI(child, state, onDispatch));
                    }
                }
                return fragment;
            }

            // The result may be a Text-like atom or another UI call
            if (isStr(rendered) || isNum(rendered) || isSym(rendered)) {
                const span = document.createElement("span");
                span.appendChild(this.renderTextPart(rendered, state));
                return span;
            }
            return this.renderUI(rendered, state, onDispatch);
        }

        if (tag === "UI") {
            if (node.a.length !== 1) {
                throw new Error("UI[...] must wrap exactly one subtree");
            }
            return this.renderUI(node.a[0], state, onDispatch);
        }

        // Regular DOM element
        const { props, children } = this.splitPropsAndChildren(node);
        const el = document.createElement(tag.toLowerCase());

        if (props) {
            this.applyProps(el, props, onDispatch);
        }

        for (const ch of children) {
            // Strings/numbers/Show[...] become text; Calls recurse
            if (isStr(ch) || isNum(ch) || (isCall(ch) && isSym(ch.h) && ch.h.v === "Show") || isSym(ch)) {
                el.appendChild(this.renderTextPart(ch, state));
            } else {
                el.appendChild(this.renderUI(ch, state, onDispatch));
            }
        }

        return el;
    }

    /**
     * Apply props to DOM element
     */
    applyProps(el, props, onDispatch) {
        for (const [k, v] of Object.entries(props)) {
            // Handle ALL events generically - any prop starting with "on"
            if (k.startsWith("on")) {
                const eventName = k.slice(2).toLowerCase(); // onClick -> click
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

    /**
     * Render text parts with Show projection
     */
    renderTextPart(part, state) {
        // Two cases:
        // 1) literal Str / Num / Sym
        // 2) symbolic Show[...] that needs to normalize under (App[State, _])
        if (isStr(part)) return document.createTextNode(part.v);
        if (isNum(part)) return document.createTextNode(String(part.v));

        // if (isCall(part) && isSym(part.h) && part.h.v === "Show") {
        //     // Build a tiny projection context: Show[x] /@ App[State, _] -> Str[...]
        //     const appCtx = Call(Sym("App"), state, Sym("_"));
        //     const annotated = Call(Sym("/@"), part, appCtx);
        //
        //     // Let rules reduce it
        //     const reduced = (() => {
        //         const currentRules = this.extractRulesFunc(this.universe);
        //         if (getTraceState()) {
        //             const { result, trace } = this.normalizeWithTrace(annotated, currentRules);
        //             logProjectionTrace(part, trace);
        //             return result;
        //         }
        //         return this.normalizeFunc(annotated, currentRules);
        //     })();
        //
        //     if (isStr(reduced)) return document.createTextNode(reduced.v);
        //     if (isNum(reduced)) return document.createTextNode(String(reduced.v));
        //
        //     // If reduction failed, log error
        //     const currentRules = this.extractRulesFunc(this.universe);
        //     logProjectionFailure(part, annotated, reduced, currentRules);
        //     throw new Error(`Show[...] did not reduce to Str/Num. Got: ${show(reduced)}`);
        // }

        if (isCall(part) && isSym(part.h) && part.h.v === "Show") {
            const appCtx = Call(Sym("App"), state, Sym("_"));
            const annotated = Call(Sym("/@"), part, appCtx);
            const currentRules = this.extractRulesFunc(this.universe);

            const reduced = getTraceState()
                ? this.normalizeWithTrace(annotated, currentRules).result
                : this.normalizeFunc(annotated, currentRules);

            // Check if Show projection failed (still has /@ at the root)
            if (isCall(reduced) && isSym(reduced.h) && reduced.h.v === "/@") {
                throw new Error(`No projection rule found for: ${show(part)}\n` +
                              `Tried to match: ${show(annotated)}\n` +
                              `Make sure you have a rule to handle this Show expression in the current context`);
            }

            if (isStr(reduced)) return document.createTextNode(reduced.v);
            if (isNum(reduced)) return document.createTextNode(String(reduced.v));

            // 🔽 Fallback: stringify anything else
            const coerced = this.normalizeFunc(Call(Sym("ToString"), reduced), currentRules);
            if (isStr(coerced)) return document.createTextNode(coerced.v);
            if (isNum(coerced)) return document.createTextNode(String(coerced.v));

            // Still not displayable? Log and throw.
            logProjectionFailure(part, annotated, reduced, currentRules);
            throw new Error(`Show[...] did not reduce to Str/Num. Got: ${show(reduced)}`);
        }

        // If plain Sym leaks here, check if it's Empty (skip) or stringify it
        if (isSym(part)) {
            if (part.v === "Empty") {
                return document.createTextNode(""); // Return empty text node to skip rendering
            }
            return document.createTextNode(part.v);
        }

        throw new Error(`Unsupported Text part: ${show(part)}`);
    }

    /**
     * Clean up DOM
     */
    cleanup() {
        if (this.mount) {
            this.mount.innerHTML = "";
        }
        super.cleanup();
    }
}
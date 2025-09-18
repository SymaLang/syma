/**
 * Trace Projector for Syma Runtime
 *
 * Renders symbolic UI to a trace format suitable for snapshot testing
 * and debugging. Instead of creating DOM elements, it generates a
 * structured text representation of the UI tree.
 */

import { BaseProjector } from './base.js';
import { Sym, Call, isSym, isNum, isStr, isCall, show } from '../ast-helpers.js';

/**
 * Trace Projector implementation
 */
export class TraceProjector extends BaseProjector {
    constructor() {
        super();
        this.output = [];
        this.indentLevel = 0;
        this.universe = null;
        this.normalizeFunc = null;
        this.extractRulesFunc = null;
    }

    /**
     * Initialize with trace-specific configuration
     * @param {Object} config - Configuration
     */
    init(config) {
        super.init(config);

        // Store references to runtime functions
        this.normalizeFunc = config.options?.normalize;
        this.extractRulesFunc = config.options?.extractRules;
        this.universe = config.options?.universe;

        if (!this.normalizeFunc || !this.extractRulesFunc) {
            throw new Error("TraceProjector requires normalize and extractRules functions in options");
        }

        this.output = [];
        this.indentLevel = 0;

        return this;
    }

    /**
     * Render universe to trace format
     * @param {Object} universe - The universe AST
     * @returns {string} The trace output
     */
    render(universe) {
        this.universe = universe;
        this.output = [];
        this.indentLevel = 0;

        const app = this.getProgramApp(universe);
        if (!isCall(app) || !isSym(app.h) || app.h.v !== "App") {
            throw new Error("Program must contain App[state, ui]");
        }

        const [state, ui] = app.a;

        this.writeLine("=== TRACE OUTPUT ===");
        this.writeLine(`State: ${this.formatValue(state)}`);
        this.writeLine("UI Tree:");
        this.indentLevel++;
        this.traceNode(ui, state);
        this.indentLevel--;
        this.writeLine("=== END TRACE ===");

        const result = this.output.join('\n');

        // If mount is provided and is a function, call it with the output
        if (typeof this.mount === 'function') {
            this.mount(result);
        }

        return result;
    }

    /**
     * Project a symbolic node in context
     */
    project(node, state) {
        const annotated = Call(Sym("/@"), node, Call(Sym("App"), state, Sym("_")));
        const currentRules = this.extractRulesFunc(this.universe);
        return this.normalizeFunc(annotated, currentRules);
    }

    /**
     * Trace a UI node recursively
     */
    traceNode(node, state) {
        if (!isCall(node) || !isSym(node.h)) {
            this.writeLine(`[ATOM] ${this.formatValue(node)}`);
            return;
        }

        const tag = node.h.v;

        // Handle special nodes
        if (tag === "/@") {
            const currentRules = this.extractRulesFunc(this.universe);
            const reduced = this.normalizeFunc(node, currentRules);
            this.traceNode(reduced, state);
            return;
        }

        if (tag === "Project") {
            if (node.a.length !== 1) {
                this.writeLine(`[ERROR] Project expects 1 arg`);
                return;
            }
            const rendered = this.project(node.a[0], state);
            this.writeLine(`[PROJECT] ${this.formatValue(node.a[0])} => ${this.formatValue(rendered)}`);
            this.indentLevel++;
            this.traceNode(rendered, state);
            this.indentLevel--;
            return;
        }

        if (tag === "UI") {
            if (node.a.length !== 1) {
                this.writeLine(`[ERROR] UI expects 1 child`);
                return;
            }
            this.traceNode(node.a[0], state);
            return;
        }

        // Regular element
        const { props, children } = this.splitPropsAndChildren(node);

        let propsStr = "";
        if (props) {
            const propsList = Object.entries(props)
                .map(([k, v]) => `${k}=${this.formatValue(v)}`)
                .join(", ");
            propsStr = props && Object.keys(props).length > 0 ? ` {${propsList}}` : "";
        }

        this.writeLine(`<${tag}${propsStr}>`);
        this.indentLevel++;

        for (const ch of children) {
            if (isStr(ch) || isNum(ch) || isSym(ch)) {
                this.writeLine(`[TEXT] ${this.formatValue(ch)}`);
            } else if (isCall(ch) && isSym(ch.h) && ch.h.v === "Show") {
                const projected = this.projectShow(ch, state);
                this.writeLine(`[SHOW] ${this.formatValue(ch.a[0])} => ${this.formatValue(projected)}`);
            } else {
                this.traceNode(ch, state);
            }
        }

        this.indentLevel--;
        this.writeLine(`</${tag}>`);
    }

    /**
     * Project a Show[...] expression
     */
    projectShow(part, state) {
        const appCtx = Call(Sym("App"), state, Sym("_"));
        const annotated = Call(Sym("/@"), part, appCtx);
        const currentRules = this.extractRulesFunc(this.universe);
        const reduced = this.normalizeFunc(annotated, currentRules);

        if (!isStr(reduced) && !isNum(reduced)) {
            return `[ERROR: Show did not reduce to Str/Num: ${show(reduced)}]`;
        }

        return reduced;
    }

    /**
     * Helper utilities
     */
    getProgramApp(universe) {
        const prog = universe.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "Program");
        if (!prog) throw new Error("Universe missing Program[...]");
        const app = prog.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "App");
        return app || prog.a[0];
    }

    splitPropsAndChildren(node) {
        if (!isCall(node)) return { props: null, children: [] };

        if (node.a.length && isCall(node.a[0]) && isSym(node.a[0].h) && node.a[0].h.v === "Props") {
            const propsNode = node.a[0];
            const children = node.a.slice(1);
            const props = {};

            for (const kv of propsNode.a) {
                if (!isCall(kv) || !isSym(kv.h) || kv.h.v !== "KV" || kv.a.length !== 2 || !isStr(kv.a[0])) {
                    continue; // Skip malformed props
                }
                props[kv.a[0].v] = kv.a[1];
            }

            return { props, children };
        }

        return { props: null, children: node.a };
    }

    formatValue(val) {
        if (isStr(val)) return `"${val.v}"`;
        if (isNum(val)) return String(val.v);
        if (isSym(val)) return val.v;
        return show(val);
    }

    writeLine(text) {
        const indent = "  ".repeat(this.indentLevel);
        this.output.push(indent + text);
    }

    /**
     * Clean up
     */
    cleanup() {
        this.output = [];
        this.indentLevel = 0;
        super.cleanup();
    }
}
/**
 * String Projector for Syma Runtime
 *
 * Renders symbolic UI representations to HTML strings.
 * Useful for SSR, SSG, and static site generation within Syma.
 * Omits event handlers and bindings (client-side only features).
 */

import { BaseProjector } from './base.js';
import { Sym, Call, isSym, isNum, isStr, isCall, isSplice, show } from '@syma/core/ast-helpers';

/**
 * String Projector implementation
 */
export class StringProjector extends BaseProjector {
    constructor() {
        super();
        this.universe = null;
        this.normalizeFunc = null;
        this.extractRulesFunc = null;
    }

    /**
     * Initialize with string-specific configuration
     * @param {Object} config - Configuration with onDispatch (unused), and options
     */
    init(config) {
        super.init(config);

        // Store references to runtime functions
        this.normalizeFunc = config.options?.normalize;
        this.extractRulesFunc = config.options?.extractRules;
        this.universe = config.options?.universe;

        if (!this.normalizeFunc || !this.extractRulesFunc) {
            throw new Error("StringProjector requires normalize and extractRules functions in options");
        }

        return this;
    }

    /**
     * Render universe to HTML string
     * @param {Object} universe - The universe AST
     * @returns {string} HTML string
     */
    render(universe) {
        this.universe = universe;

        const app = this.getProgramApp(universe);
        if (!isCall(app) || !isSym(app.h) || app.h.v !== "App") {
            throw new Error("Program must contain App[state, ui]");
        }

        const [state, ui] = app.a;
        return this.renderNode(ui, state, app);
    }

    /**
     * Render a single UI node to HTML string
     * @param {Object} node - The node to render
     * @param {Object} state - Current state
     * @param {Object} app - Current App node
     * @returns {string} HTML string
     */
    renderNode(node, state, app) {
        // Handle text nodes (atoms)
        if (!isCall(node)) {
            if (isSym(node) && node.v === "Empty") {
                return '';
            }
            return this.escapeHtml(this.nodeToString(node));
        }

        if (!isSym(node.h)) {
            throw new Error(`UI node must be Call with Sym head; got ${show(node)}`);
        }

        const tag = node.h.v;

        // Handle special cases
        if (tag === "/@") {
            const currentRules = this.extractRulesFunc(this.universe);
            const reduced = this.normalizeFunc(node, currentRules);
            return this.renderNode(reduced, state, app);
        }

        if (tag === "Project") {
            if (node.a.length !== 1) {
                throw new Error("Project[...] expects exactly one child expression");
            }
            const rendered = this.project(node.a[0], app);

            if (isSplice(rendered)) {
                // Filter out Empty symbols
                const items = rendered.items.filter(item =>
                    !(isSym(item) && item.v === "Empty")
                );
                return items.map(item => this.renderNode(item, state, app)).join('');
            }

            if (isSym(rendered) && rendered.v === "Empty") {
                return '';
            }

            return this.renderNode(rendered, state, app);
        }

        if (tag === "UI") {
            if (node.a.length !== 1) {
                throw new Error("UI[...] must wrap exactly one subtree");
            }
            return this.renderNode(node.a[0], state, app);
        }

        if (tag === "Show") {
            // Project Show node to get text
            const annotated = Call(Sym("/@"), node, app);
            const currentRules = this.extractRulesFunc(this.universe);
            const reduced = this.normalizeFunc(annotated, currentRules);

            if (isStr(reduced)) return this.escapeHtml(reduced.v);
            if (isNum(reduced)) return this.escapeHtml(String(reduced.v));

            // Try ToString coercion
            const coerced = this.normalizeFunc(Call(Sym("ToString"), reduced), currentRules);
            if (isStr(coerced)) return this.escapeHtml(coerced.v);
            if (isNum(coerced)) return this.escapeHtml(String(coerced.v));

            return '';
        }

        // Regular HTML element
        const { props, children } = this.splitPropsAndChildren(node);

        // Build opening tag
        let html = `<${tag.toLowerCase()}`;

        // Add attributes (skip event handlers and bindings)
        if (props) {
            for (const [k, v] of Object.entries(props)) {
                // Skip event handlers (onClick, onInput, etc.)
                if (k.startsWith('on')) continue;

                // Skip bindings (bind-value, bind-checked, etc.)
                if (k.startsWith('bind-')) continue;

                // Skip internal key prop
                if (k === 'key') continue;

                // Add regular attributes
                const value = this.propToString(v);
                if (value !== null) {
                    html += ` ${k}="${this.escapeHtml(value)}"`;
                }
            }
        }

        // Self-closing tags
        const selfClosing = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
        if (selfClosing.includes(tag.toLowerCase())) {
            html += ' />';
            return html;
        }

        html += '>';

        // Render children
        for (const child of children) {
            if (isSym(child) && child.v === "Empty") {
                continue;
            }
            html += this.renderNode(child, state, app);
        }

        // Closing tag
        html += `</${tag.toLowerCase()}>`;

        return html;
    }

    /**
     * Project a symbolic UI node under current App context
     * @param {Object} node - The node to project
     * @param {Object} app - Current App node
     * @returns {Object} Projected node
     */
    project(node, app) {
        // Build /@ node: (/@ node app)
        const annotated = Call(Sym("/@"), node, app);
        const currentRules = this.extractRulesFunc(this.universe);
        const reduced = this.normalizeFunc(annotated, currentRules);

        // Check if projection failed (still has /@ at the root)
        if (isCall(reduced) && isSym(reduced.h) && reduced.h.v === "/@") {
            throw new Error(`No projection rule found for: ${show(node)}\n` +
                          `Tried to match: ${show(annotated)}\n` +
                          `Make sure you have a rule like: (R "ProjectionRule" (/@ ${show(node)} (App ...)) ...)`);
        }

        return reduced;
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

        // Handle old-style Props[KV[...], KV[...]] structure
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

        // Handle new-style attributes (symbols starting with ':' like :class, :onClick)
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
     * Convert a prop value to string
     */
    propToString(value) {
        if (isStr(value)) return value.v;
        if (isNum(value)) return String(value.v);
        if (isSym(value)) return value.v;
        return null;
    }

    /**
     * Convert a node to text string
     */
    nodeToString(node) {
        if (isStr(node)) return node.v;
        if (isNum(node)) return String(node.v);
        if (isSym(node)) return node.v === "Empty" ? "" : node.v;
        return '';
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Clean up
     */
    cleanup() {
        this.universe = null;
        super.cleanup();
    }
}

/**
 * Utility function to render UI to string with given universe context
 * @param {Object} uiNode - UI node to render
 * @param {Object} state - State context
 * @param {Object} universe - Universe with rules
 * @param {Function} normalizeFunc - Normalization function
 * @param {Function} extractRulesFunc - Rules extraction function
 * @returns {string} HTML string
 */
export function renderToString(uiNode, state, universe, normalizeFunc, extractRulesFunc) {
    const projector = new StringProjector();
    projector.init({
        mount: null, // Not needed for string projection
        onDispatch: () => {}, // Not needed for string projection
        options: {
            normalize: normalizeFunc,
            extractRules: extractRulesFunc,
            universe: universe
        }
    });

    return projector.renderNode(uiNode, state);
}

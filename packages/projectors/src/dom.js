/**
 * DOM Projector for Syma Runtime
 *
 * Renders symbolic UI representations to browser DOM.
 * Handles event binding, dynamic content projection, and UI updates.
 */

import { BaseProjector } from './base.js';
import { Sym, Call, isSym, isNum, isStr, isCall, isSplice, show } from '@syma/core/ast-helpers';
import { createEventHandler, handleBinding, removeBoundElement, cleanupAllBindings } from '@syma/platform-browser/events';
import { getTraceState } from '@syma/platform-browser/debug';

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
        this.virtualTree = null;
        this.virtualState = null; // Track the state used for virtual tree
        this.rootElement = null; // Track the root DOM element
        this.domMap = new WeakMap(); // Maps virtual nodes to DOM elements
        this.hashCache = new WeakMap(); // Cache for AST node hashes
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
        this.onError = config.options?.onError || null; // Error callback
        this.onRenderSuccess = config.options?.onRenderSuccess || null; // Success callback

        if (!this.normalizeFunc || !this.extractRulesFunc) {
            throw new Error("DOMProjector requires normalize and extractRules functions in options");
        }

        return this;
    }

    /**
     * Render universe to DOM with incremental updates
     * @param {Object} universe - The universe AST
     */
    render(universe) {
        let renderSucceeded = false;
        try {
            this.universe = universe;

            const app = this.getProgramApp(universe);
            if (!isCall(app) || !isSym(app.h) || app.h.v !== "App") {
                throw new Error("Program must contain App[State[...], UI[...]]");
            }

            // Find State and UI nodes by head symbol
            const state = app.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "State");
            const ui = app.a.find(n => isCall(n) && isSym(n.h) && n.h.v === "UI");

            if (!state) {
                throw new Error("App must contain State[...] node");
            }
            if (!ui) {
                throw new Error("App must contain UI[...] node");
            }

            // Build new virtual tree
            const newVirtualTree = this.buildVirtualTree(ui, state);

            if (!this.virtualTree || !this.rootElement) {
                // First render - create DOM from scratch
                this.mount.innerHTML = "";
                this.rootElement = this.createDOMFromVirtual(newVirtualTree, state, this.onDispatch);
                this.mount.appendChild(this.rootElement);
                this.domMap.set(newVirtualTree, this.rootElement);
            } else {
                // Incremental update - diff and patch
                // Pass both old and new states for proper comparison
                const patches = this.diff(this.virtualTree, newVirtualTree, this.virtualState, state);
                this.applyPatches(patches, state, this.onDispatch);
            }

            this.virtualTree = newVirtualTree;
            this.virtualState = state; // Store the state for next diff

            // Note: We intentionally DON'T clear hashCache here!
            // The newState of this render becomes the oldState of the next render.
            // Clearing would force us to rehash the same tree on every render.
            // WeakMap automatically handles GC when nodes are no longer referenced.

            renderSucceeded = true;
        } catch (error) {
            // Notify error callback if provided
            if (this.onError) {
                this.onError(error, universe);
                // Don't re-throw if we have an error handler - it's been handled
                // This prevents duplicate error logging in the console
            } else {
                // Re-throw if no error handler to maintain existing behavior
                throw error;
            }
        } finally {
            // Only clear errors if render actually succeeded
            // This is in finally block to ensure it runs even if there are other issues
            if (renderSucceeded && this.onRenderSuccess) {
                this.onRenderSuccess();
            }
        }
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

        // Check for old-style Props[KV[...], KV[...]] structure
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
     * Remove all event listeners from an element and its children
     */
    removeAllEventListeners(element) {
        if (!element) return;

        // Remove all tracked event listeners
        if (element.__handlers) {
            for (const [eventName, handler] of element.__handlers) {
                element.removeEventListener(eventName, handler);
            }
            element.__handlers = [];
        }

        // Clean up from bound elements registry if it's a bound element
        if (element.dataset?.bindTo) {
            this.cleanupBoundElement(element);
        }

        // Recursively clean children
        if (element.children) {
            for (const child of element.children) {
                this.removeAllEventListeners(child);
            }
        }
    }

    /**
     * Clean up element from bound elements registry
     */
    cleanupBoundElement(element) {
        if (!element.dataset?.bindTo) return;

        // Remove from events module registry
        removeBoundElement(element);

        // Clear dataset
        delete element.dataset.bindTo;
        delete element.dataset.bindProperty;
    }

    /**
     * Apply props to DOM element
     */
    applyProps(el, props, onDispatch) {
        // Initialize handlers array if not present
        if (!el.__handlers) {
            el.__handlers = [];
        }

        for (const [k, v] of Object.entries(props)) {
            // Handle ALL events generically - any prop starting with "on"
            if (k.startsWith("on")) {
                const eventName = k.slice(2).toLowerCase(); // onClick -> click
                const handler = createEventHandler(v, onDispatch);
                el.addEventListener(eventName, handler);
                // Track the handler for cleanup
                el.__handlers.push([eventName, handler]);
                continue;
            }

            // Handle two-way bindings (e.g., bind-value, bind-checked)
            if (k.startsWith("bind-")) {
                const bindingType = k.slice(5); // bind-value -> value
                handleBinding(el, bindingType, v, onDispatch);
                continue;
            }

            // Special handling for key prop - use it as syma-ref for focus restoration
            if (k === 'key' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
                const keyValue = isStr(v) ? v.v : String(v.v);
                el.setAttribute('data-syma-ref', keyValue);
                // Don't set key as an HTML attribute
                continue;
            }

            // Skip internal key prop (don't render as HTML attribute)
            if (k === 'key') {
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
     * Build a virtual tree representation from Syma nodes
     */
    buildVirtualTree(node, state) {
        // Handle special node types first
        if (!isCall(node)) {
            // Handle Empty symbols specially - they represent nothing
            if (isSym(node) && node.v === "Empty") {
                return { type: 'empty' };
            }
            return { type: 'text', value: node };
        }

        if (!isSym(node.h)) {
            throw new Error(`UI node must be Call with Sym head; got ${show(node)}`);
        }

        const tag = node.h.v;

        // Handle special cases
        if (tag === "/@") {
            const currentRules = this.extractRulesFunc(this.universe);
            const reduced = getTraceState()
                ? this.normalizeWithTrace(node, currentRules).result
                : this.normalizeFunc(node, currentRules);
            return this.buildVirtualTree(reduced, state);
        }

        if (tag === "Project") {
            if (node.a.length !== 1) {
                throw new Error("Project[...] expects exactly one child expression");
            }
            const rendered = this.project(node.a[0], state);

            if (isSplice(rendered)) {
                // For splices, we need to return multiple nodes
                // Filter out Empty symbols as they shouldn't create DOM nodes
                const items = rendered.items.filter(item =>
                    !(isSym(item) && item.v === "Empty")
                );
                // Return a special marker that the parent will handle
                return {
                    type: 'project-splice',
                    children: items.map(item => this.buildVirtualTree(item, state))
                };
            }

            // Handle if rendered is Empty
            if (isSym(rendered) && rendered.v === "Empty") {
                return { type: 'empty' };
            }
            return this.buildVirtualTree(rendered, state);
        }

        if (tag === "UI") {
            if (node.a.length !== 1) {
                throw new Error("UI[...] must wrap exactly one subtree");
            }
            return this.buildVirtualTree(node.a[0], state);
        }

        // Regular DOM element
        const { props, children } = this.splitPropsAndChildren(node);

        // Only use explicit keys from props, no implicit key generation
        const explicitKey = props?.key ? (isStr(props.key) ? props.key.v : String(props.key.v)) : undefined;

        // Build children, flattening fragments and project-splices to match DOM behavior
        const virtualChildren = [];
        children.forEach(child => {
            // Skip Empty symbols - they shouldn't create DOM nodes
            if (isSym(child) && child.v === "Empty") {
                return;
            }

            if (isStr(child) || isNum(child) || isSym(child)) {
                virtualChildren.push({ type: 'text', value: child });
            } else if (isCall(child) && isSym(child.h) && child.h.v === "Show") {
                virtualChildren.push({ type: 'show', value: child });
            } else {
                const childVNode = this.buildVirtualTree(child, state);
                // Skip empty nodes
                if (childVNode.type === 'empty') {
                    return;
                }
                // Flatten fragments and project-splices - their children become our direct children
                if (childVNode.type === 'fragment' || childVNode.type === 'project-splice') {
                    // Filter out any empty nodes from flattened children
                    const nonEmptyChildren = childVNode.children.filter(c => c.type !== 'empty');
                    virtualChildren.push(...nonEmptyChildren);
                } else {
                    virtualChildren.push(childVNode);
                }
            }
        });

        const vNode = {
            type: 'element',
            tag: tag.toLowerCase(),
            props: props || {},
            children: virtualChildren,
            node // Keep reference to original AST node
        };

        // Only add key if explicitly provided
        if (explicitKey !== undefined) {
            vNode.key = explicitKey;
        }

        return vNode;
    }

    /**
     * Diff two virtual trees and generate patches
     */
    diff(oldVNode, newVNode, oldState, newState, patches = [], path = []) {
        if (!oldVNode && !newVNode) {
            return patches;
        }

        if (!oldVNode) {
            // Add new node
            patches.push({ type: 'add', path, newVNode });
            return patches;
        }

        if (!newVNode) {
            // Remove old node
            patches.push({ type: 'remove', path, oldVNode });
            return patches;
        }

        // Different node types - replace
        if (oldVNode.type !== newVNode.type || oldVNode.tag !== newVNode.tag) {
            patches.push({ type: 'replace', path, oldVNode, newVNode });
            return patches;
        }

        // Handle different node types
        if (newVNode.type === 'text' || newVNode.type === 'show') {
            // Compare text values using appropriate states
            const oldText = this.getTextValue(oldVNode, oldState);
            const newText = this.getTextValue(newVNode, newState);
            if (oldText !== newText) {
                patches.push({ type: 'text', path, oldVNode, newVNode });
            }
        } else if (newVNode.type === 'element') {
            // Compare props
            const propsHaveChanged = this.propsChanged(oldVNode.props, newVNode.props);

            // Check if children have dynamic content that might depend on state
            const hasDynamicChildren = this.hasDynamicContent(newVNode.children);

            if (propsHaveChanged) {
                // When parent props change significantly, replace the entire element
                // This ensures all children are re-rendered with the new parent context
                patches.push({ type: 'replace', path, oldVNode, newVNode });
            } else if (hasDynamicChildren && this.stateHasChanged(oldState, newState)) {
                // If state changed meaningfully and children have dynamic content, replace to ensure proper re-evaluation
                // This handles cases where Project/Show nodes need re-evaluation with new state
                patches.push({ type: 'replace', path, oldVNode, newVNode });
            } else {
                // Props haven't changed and no dynamic children, so we can safely diff children
                // Diff children with key-based reconciliation
                this.diffChildren(oldVNode.children, newVNode.children, oldState, newState, patches, path);
            }
        }

        return patches;
    }

    /**
     * Diff children arrays with proper reconciliation
     */
    diffChildren(oldChildren, newChildren, oldState, newState, patches, parentPath) {
        // Separate keyed and non-keyed children
        const hasKeys = newChildren.some(c => c.key !== undefined) || oldChildren.some(c => c.key !== undefined);

        if (hasKeys) {
            // Key-based reconciliation
            const oldKeyed = new Map();
            const newKeyed = new Map();
            const oldNonKeyed = [];
            const newNonKeyed = [];

            oldChildren.forEach((child, idx) => {
                if (child.key !== undefined) {
                    oldKeyed.set(child.key, { node: child, index: idx });
                } else {
                    oldNonKeyed.push({ node: child, index: idx });
                }
            });

            newChildren.forEach((child, idx) => {
                if (child.key !== undefined) {
                    newKeyed.set(child.key, { node: child, index: idx });
                } else {
                    newNonKeyed.push({ node: child, index: idx });
                }
            });

            // Process keyed children
            const processedOldKeys = new Set();
            newChildren.forEach((newChild, newIdx) => {
                const path = [...parentPath, newIdx];

                if (newChild.key !== undefined) {
                    const oldData = oldKeyed.get(newChild.key);
                    if (oldData) {
                        processedOldKeys.add(newChild.key);
                        // Recursively diff the matching keyed node
                        this.diff(oldData.node, newChild, oldState, newState, patches, path);
                    } else {
                        // New keyed node
                        patches.push({ type: 'add', path, newVNode: newChild });
                    }
                }
            });

            // Process non-keyed children by position
            let nonKeyedIdx = 0;
            newChildren.forEach((newChild, newIdx) => {
                if (newChild.key === undefined) {
                    const path = [...parentPath, newIdx];
                    if (nonKeyedIdx < oldNonKeyed.length) {
                        // Match by position for non-keyed items
                        this.diff(oldNonKeyed[nonKeyedIdx].node, newChild, oldState, newState, patches, path);
                        nonKeyedIdx++;
                    } else {
                        // New non-keyed node
                        patches.push({ type: 'add', path, newVNode: newChild });
                    }
                }
            });

            // Remove unmatched old keyed children
            oldKeyed.forEach((data, key) => {
                if (!processedOldKeys.has(key)) {
                    patches.push({ type: 'remove', path: [...parentPath, data.index], oldVNode: data.node });
                }
            });

            // Remove excess old non-keyed children
            for (let i = nonKeyedIdx; i < oldNonKeyed.length; i++) {
                patches.push({ type: 'remove', path: [...parentPath, oldNonKeyed[i].index], oldVNode: oldNonKeyed[i].node });
            }
        } else {
            // Pure position-based reconciliation (no keys at all)
            // When list size changes significantly, replace all to avoid content mix-ups
            if (oldChildren.length !== newChildren.length && oldChildren.length > 0 && newChildren.length > 0) {
                // Replace strategy when filtering: replace all elements to ensure correctness
                const minLen = Math.min(oldChildren.length, newChildren.length);

                // Replace common positions
                for (let i = 0; i < minLen; i++) {
                    const path = [...parentPath, i];
                    // Force replacement instead of update to avoid content mix-up
                    patches.push({ type: 'replace', path, oldVNode: oldChildren[i], newVNode: newChildren[i] });
                }

                // Add new elements if list grew
                for (let i = oldChildren.length; i < newChildren.length; i++) {
                    const path = [...parentPath, i];
                    patches.push({ type: 'add', path, newVNode: newChildren[i] });
                }

                // Remove excess if list shrank
                for (let i = newChildren.length; i < oldChildren.length; i++) {
                    const path = [...parentPath, i];
                    patches.push({ type: 'remove', path, oldVNode: oldChildren[i] });
                }
            } else {
                // Same length or one list is empty - use standard position-based diff
                const minLen = Math.min(oldChildren.length, newChildren.length);

                // Diff common elements by position
                for (let i = 0; i < minLen; i++) {
                    const path = [...parentPath, i];
                    this.diff(oldChildren[i], newChildren[i], oldState, newState, patches, path);
                }

                // Add new elements
                for (let i = oldChildren.length; i < newChildren.length; i++) {
                    const path = [...parentPath, i];
                    patches.push({ type: 'add', path, newVNode: newChildren[i] });
                }

                // Remove excess old elements
                for (let i = newChildren.length; i < oldChildren.length; i++) {
                    const path = [...parentPath, i];
                    patches.push({ type: 'remove', path, oldVNode: oldChildren[i] });
                }
            }
        }
    }

    /**
     * Compute FNV-1a hash of an AST node
     */
    hashNode(node) {
        // Check memoization cache
        if (this.hashCache.has(node)) {
            return this.hashCache.get(node);
        }

        // FNV-1a 64-bit offset basis
        let hash = 14695981039346656037n;

        // FNV-1a mixing function
        const mix = (value) => {
            hash = (hash ^ BigInt(value)) * 1099511628211n;
        };

        // Hash based on node type
        if (!node || !node.k) {
            mix(0); // null/undefined
        } else if (node.k === 'Sym') {
            mix(1); // Type tag
            // Mix symbol string characteristics
            const str = node.v || '';
            mix(str.length);
            // Mix first few chars for better distribution
            for (let i = 0; i < Math.min(str.length, 4); i++) {
                mix(str.charCodeAt(i));
            }
        } else if (node.k === 'Str') {
            mix(2); // Type tag
            const str = node.v || '';
            mix(str.length);
            // Mix first and last chars
            if (str.length > 0) {
                mix(str.charCodeAt(0));
                mix(str.charCodeAt(str.length - 1));
            }
        } else if (node.k === 'Num') {
            mix(3); // Type tag
            // Mix number value directly
            const num = node.v || 0;
            mix(Math.floor(num * 1000)); // Keep some decimal precision
        } else if (node.k === 'Call') {
            mix(4); // Type tag
            // Hash head
            mix(this.hashNode(node.h));
            // Hash arguments
            mix(node.a ? node.a.length : 0);
            if (node.a) {
                for (const arg of node.a) {
                    mix(this.hashNode(arg));
                }
            }
        } else if (isSplice(node)) {
            mix(5); // Type tag
            mix(node.items ? node.items.length : 0);
            if (node.items) {
                for (const item of node.items) {
                    mix(this.hashNode(item));
                }
            }
        }

        // Downcast to 53-bit safe integer for JS
        const result = Number(hash & ((1n << 53n) - 1n));

        // Cache the result
        this.hashCache.set(node, result);

        return result;
    }

    /**
     * Check if state has meaningfully changed
     */
    stateHasChanged(oldState, newState) {
        // If references are the same, no change
        if (oldState === newState) return false;

        // If one is null/undefined and other isn't, changed
        if (!oldState || !newState) return true;

        // Compare hashes for fast inequality check
        return this.hashNode(oldState) !== this.hashNode(newState);
    }

    /**
     * Check if virtual node tree contains dynamic content
     */
    hasDynamicContent(children) {
        if (!children || children.length === 0) return false;

        for (const child of children) {
            // Check for dynamic node types
            if (child.type === 'show' || child.type === 'project-splice') {
                return true;
            }

            // Check if the original node was a Project node
            if (child.node && isCall(child.node) && isSym(child.node.h) &&
                (child.node.h.v === 'Project' || child.node.h.v === 'Show')) {
                return true;
            }

            // Recursively check element children
            if (child.type === 'element' && child.children && child.children.length > 0) {
                if (this.hasDynamicContent(child.children)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if props have changed
     */
    propsChanged(oldProps, newProps) {
        const oldKeys = Object.keys(oldProps);
        const newKeys = Object.keys(newProps);

        if (oldKeys.length !== newKeys.length) return true;

        for (const key of newKeys) {
            if (oldProps[key] !== newProps[key]) {
                // Deep comparison for complex props
                if (JSON.stringify(oldProps[key]) !== JSON.stringify(newProps[key])) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get text value from a virtual node
     */
    getTextValue(vNode, state) {
        if (vNode.type === 'text') {
            const val = vNode.value;
            if (isStr(val)) return val.v;
            if (isNum(val)) return String(val.v);
            if (isSym(val)) return val.v === "Empty" ? "" : val.v;
        } else if (vNode.type === 'show') {
            // Project Show node to get text
            const appCtx = Call(Sym("App"), state, Sym("_"));
            const annotated = Call(Sym("/@"), vNode.value, appCtx);
            const currentRules = this.extractRulesFunc(this.universe);
            const reduced = this.normalizeFunc(annotated, currentRules);

            if (isStr(reduced)) return reduced.v;
            if (isNum(reduced)) return String(reduced.v);

            // Try ToString coercion
            const coerced = this.normalizeFunc(Call(Sym("ToString"), reduced), currentRules);
            if (isStr(coerced)) return coerced.v;
            if (isNum(coerced)) return String(coerced.v);
        }
        return "";
    }

    /**
     * Apply patches to the DOM
     */
    applyPatches(patches, state, onDispatch) {
        // Group patches by type
        const patchGroups = {
            remove: [],
            move: [],
            replace: [],
            add: [],
            text: [],
            props: []
        };

        patches.forEach(patch => {
            if (patchGroups[patch.type]) {
                patchGroups[patch.type].push(patch);
            }
        });

        // Apply removals in reverse order to avoid index shifting issues
        patchGroups.remove.sort((a, b) => {
            // Sort by path depth first (deeper first), then by index (higher first)
            if (a.path.length !== b.path.length) {
                return b.path.length - a.path.length;
            }
            // Same depth, sort by last index (higher first)
            const aLastIdx = a.path[a.path.length - 1] || 0;
            const bLastIdx = b.path[b.path.length - 1] || 0;
            return bLastIdx - aLastIdx;
        });

        // Apply patches in order: removals, moves, replacements, additions, text updates, prop updates
        patchGroups.remove.forEach(patch => this.applyPatch(patch, state, onDispatch));
        patchGroups.move.forEach(patch => this.applyPatch(patch, state, onDispatch));
        patchGroups.replace.forEach(patch => this.applyPatch(patch, state, onDispatch));
        patchGroups.add.forEach(patch => this.applyPatch(patch, state, onDispatch));
        patchGroups.text.forEach(patch => this.applyPatch(patch, state, onDispatch));
        patchGroups.props.forEach(patch => this.applyPatch(patch, state, onDispatch));
    }

    /**
     * Save focus state before DOM manipulation
     */
    saveFocusState(element) {
        const activeEl = document.activeElement;
        if (!activeEl || !element.contains(activeEl)) {
            return null;
        }

        const focusState = {
            id: activeEl.id,
            symaRef: activeEl.dataset?.symaRef,
            tagName: activeEl.tagName,
            className: activeEl.className,
            name: activeEl.name,
            type: activeEl.type
        };

        // Save selection state for inputs/textareas
        if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
            focusState.selectionStart = activeEl.selectionStart;
            focusState.selectionEnd = activeEl.selectionEnd;
            focusState.selectionDirection = activeEl.selectionDirection;
            focusState.scrollTop = activeEl.scrollTop;
            focusState.scrollLeft = activeEl.scrollLeft;
        }

        return focusState;
    }

    /**
     * Restore focus state after DOM manipulation
     */
    restoreFocusState(element, focusState) {
        if (!focusState) return;

        let targetEl = null;

        // Try to find element by id first (most reliable)
        if (focusState.id) {
            targetEl = element.querySelector(`#${CSS.escape(focusState.id)}`);
        }

        // Try data-syma-ref if no id
        if (!targetEl && focusState.symaRef) {
            targetEl = element.querySelector(`[data-syma-ref="${CSS.escape(focusState.symaRef)}"]`);
        }

        // Fallback: try to match by tag, name, and type
        if (!targetEl && focusState.tagName) {
            const candidates = element.querySelectorAll(focusState.tagName);
            for (const el of candidates) {
                if ((!focusState.name || el.name === focusState.name) &&
                    (!focusState.type || el.type === focusState.type) &&
                    (!focusState.className || el.className === focusState.className)) {
                    targetEl = el;
                    break;
                }
            }
        }

        if (targetEl) {
            targetEl.focus();

            // Restore selection for inputs/textareas
            if ((targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') &&
                focusState.selectionStart !== undefined) {
                try {
                    targetEl.setSelectionRange(
                        focusState.selectionStart,
                        focusState.selectionEnd,
                        focusState.selectionDirection
                    );
                    if (focusState.scrollTop !== undefined) {
                        targetEl.scrollTop = focusState.scrollTop;
                    }
                    if (focusState.scrollLeft !== undefined) {
                        targetEl.scrollLeft = focusState.scrollLeft;
                    }
                } catch (e) {
                    // Some input types don't support selection
                }
            }
        }
    }

    /**
     * Apply a single patch
     */
    applyPatch(patch, state, onDispatch) {
        switch (patch.type) {
            case 'add': {
                if (patch.path.length === 0) {
                    // Root level add - should not happen in normal flow
                    // but handle it by replacing root
                    const newEl = this.createDOMFromVirtual(patch.newVNode, state, onDispatch);
                    if (this.rootElement) {
                        this.mount.replaceChild(newEl, this.rootElement);
                    } else {
                        this.mount.appendChild(newEl);
                    }
                    this.rootElement = newEl;
                    this.domMap.set(patch.newVNode, newEl);
                } else {
                    const parent = this.getElementByPath(patch.path.slice(0, -1));
                    const newEl = this.createDOMFromVirtual(patch.newVNode, state, onDispatch);
                    const index = patch.path[patch.path.length - 1];

                    // Insert at the correct position, accounting for current DOM state
                    if (index < parent.children.length) {
                        parent.insertBefore(newEl, parent.children[index]);
                    } else {
                        parent.appendChild(newEl);
                    }
                    this.domMap.set(patch.newVNode, newEl);
                }
                break;
            }

            case 'remove': {
                const element = this.getElementByPath(patch.path);
                if (element) {
                    // Clean up all event listeners before removing
                    this.removeAllEventListeners(element);
                }

                if (patch.path.length === 0) {
                    // Removing root - clear mount
                    if (this.rootElement) {
                        this.mount.removeChild(this.rootElement);
                        this.rootElement = null;
                    }
                } else if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
                break;
            }

            case 'replace': {
                const element = this.getElementByPath(patch.path);

                // Save focus state before replacing
                const focusState = element ? this.saveFocusState(element) : null;

                // Clean up old element before replacing
                if (element) {
                    this.removeAllEventListeners(element);
                }

                if (patch.path.length === 0) {
                    // Replacing root
                    const newEl = this.createDOMFromVirtual(patch.newVNode, state, onDispatch);
                    if (this.rootElement) {
                        this.mount.replaceChild(newEl, this.rootElement);
                    } else {
                        this.mount.appendChild(newEl);
                    }
                    this.rootElement = newEl;
                    this.domMap.set(patch.newVNode, newEl);

                    // Restore focus after replacing root
                    this.restoreFocusState(newEl, focusState);
                } else if (element && element.parentNode) {
                    const newEl = this.createDOMFromVirtual(patch.newVNode, state, onDispatch);
                    element.parentNode.replaceChild(newEl, element);
                    this.domMap.set(patch.newVNode, newEl);

                    // Restore focus after replacing element
                    this.restoreFocusState(newEl, focusState);
                }
                break;
            }

            case 'text': {
                const element = this.getElementByPath(patch.path);
                if (element) {
                    element.textContent = this.getTextValue(patch.newVNode, state);
                }
                break;
            }

            case 'props': {
                const element = this.getElementByPath(patch.path);
                if (element) {
                    // Remove ALL old event listeners (simpler and more reliable)
                    if (element.__handlers) {
                        for (const [eventName, handler] of element.__handlers) {
                            element.removeEventListener(eventName, handler);
                        }
                        element.__handlers = [];
                    }

                    // Remove old attributes that are no longer in new props
                    for (const key of Object.keys(patch.oldVNode.props)) {
                        if (!key.startsWith('on') && !key.startsWith('bind-') && !(key in patch.newVNode.props)) {
                            element.removeAttribute(key);
                        }
                    }

                    // Clean up bound element if it was previously bound
                    if (element.dataset?.bindTo) {
                        this.cleanupBoundElement(element);
                    }

                    // Apply new props (will re-add listeners and bindings)
                    this.applyProps(element, patch.newVNode.props, onDispatch);
                }
                break;
            }

            case 'move': {
                const parent = this.getElementByPath(patch.path.slice(0, -1));
                const child = parent.children[patch.from];
                const refNode = parent.children[patch.to];
                if (child && parent) {
                    if (patch.to < patch.from) {
                        parent.insertBefore(child, refNode);
                    } else {
                        parent.insertBefore(child, refNode ? refNode.nextSibling : null);
                    }
                }
                break;
            }
        }
    }

    /**
     * Get DOM element by path
     */
    getElementByPath(path) {
        if (path.length === 0) {
            return this.rootElement;
        }

        let element = this.rootElement;
        for (const index of path) {
            if (!element) return null;
            element = element.children ? element.children[index] : null;
        }
        return element;
    }

    /**
     * Create DOM element from virtual node
     */
    createDOMFromVirtual(vNode, state, onDispatch) {
        if (vNode.type === 'text' || vNode.type === 'show') {
            return document.createTextNode(this.getTextValue(vNode, state));
        }

        // Note: fragments should be flattened during buildVirtualTree,
        // so this case should rarely be hit. But handle it just in case.
        if (vNode.type === 'fragment') {
            const fragment = document.createDocumentFragment();
            for (const child of vNode.children) {
                fragment.appendChild(this.createDOMFromVirtual(child, state, onDispatch));
            }
            return fragment;
        }

        if (vNode.type === 'element') {
            const el = document.createElement(vNode.tag);

            // Apply props
            if (vNode.props) {
                this.applyProps(el, vNode.props, onDispatch);
            }

            // Add children
            for (const child of vNode.children) {
                el.appendChild(this.createDOMFromVirtual(child, state, onDispatch));
            }

            // Store mapping
            this.domMap.set(vNode, el);

            return el;
        }

        throw new Error(`Unknown virtual node type: ${vNode.type}`);
    }

    /**
     * Clean up DOM
     */
    cleanup() {
        // Clean up all event listeners before clearing DOM
        if (this.rootElement) {
            this.removeAllEventListeners(this.rootElement);
        }

        // Clean up all bindings from events module
        cleanupAllBindings();

        if (this.mount) {
            this.mount.innerHTML = "";
        }
        this.virtualTree = null;
        this.virtualState = null;
        this.rootElement = null;
        this.domMap = new WeakMap();
        this.hashCache = new WeakMap(); // Clear hash cache on cleanup
        super.cleanup();
    }
}
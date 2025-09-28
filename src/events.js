/*****************************************************************
 * Event System Module
 * Generic event dispatching and data binding for the symbolic runtime
 ******************************************************************/

import { Sym, Call, Str, isStr, isCall, isSym } from './ast-helpers.js';

/**
 * Registry for bound values keyed by their symbolic names
 */
const boundValues = new Map();

/**
 * Registry for element references for two-way binding updates
 */
const boundElements = new Map();

/**
 * Get current value for a bound field
 */
export function getInputValue(name) {
    return boundValues.get(name) || '';
}

/**
 * Set value for a bound field and update all bound elements
 */
export function setInputValue(name, value) {
    boundValues.set(name, value);

    // Update all elements bound to this field
    const elements = boundElements.get(name) || [];
    elements.forEach(({ element, property }) => {
        if (property === 'value' || property === 'checked') {
            element[property] = value;
        } else {
            element.setAttribute(property, value);
        }
    });
}

/**
 * Clear a bound field
 */
export function clearInput(name) {
    boundValues.delete(name);

    // Clear all elements bound to this field
    const elements = boundElements.get(name) || [];
    elements.forEach(({ element, property }) => {
        if (property === 'value') {
            element.value = '';
        } else if (property === 'checked') {
            element.checked = false;
        }
    });
}

/**
 * Generic binding handler for any element property
 */
export function handleBinding(element, property, bindingExpr, onDispatch) {
    // Check if this is an (Input fieldName) binding
    if (isCall(bindingExpr) && isSym(bindingExpr.h) && bindingExpr.h.v === 'Input') {
        const fieldName = bindingExpr.a[0]?.v;
        if (!fieldName) return;

        // Register this element for updates
        if (!boundElements.has(fieldName)) {
            boundElements.set(fieldName, []);
        }
        boundElements.get(fieldName).push({ element, property });

        // Set initial value
        const currentValue = boundValues.get(fieldName);
        if (currentValue !== undefined) {
            if (property === 'value' || property === 'checked') {
                element[property] = currentValue;
            } else {
                element.setAttribute(property, currentValue);
            }
        }

        // Set up two-way binding based on element type
        if (property === 'value') {
            // For text inputs, textareas, select
            const handler = (e) => {
                setInputValue(fieldName, e.target.value);
            };
            element.addEventListener('input', handler);
            // Track handler in the unified registry
            if (!element.__handlers) element.__handlers = [];
            element.__handlers.push(['input', handler]);
        } else if (property === 'checked') {
            // For checkboxes and radio buttons
            const handler = (e) => {
                setInputValue(fieldName, e.target.checked);
            };
            element.addEventListener('change', handler);
            // Track handler in the unified registry
            if (!element.__handlers) element.__handlers = [];
            element.__handlers.push(['change', handler]);
        }

        // Store binding info for reference
        element.dataset.bindTo = fieldName;
        element.dataset.bindProperty = property;
    } else if (isStr(bindingExpr)) {
        // Static value
        if (property === 'value' || property === 'checked') {
            element[property] = bindingExpr.v;
        } else {
            element.setAttribute(property, bindingExpr.v);
        }
    }
}

/**
 * Create a generic event handler for any DOM event
 */
export function createEventHandler(actionTerm, onDispatch) {
    return (event) => {
        // Store current values from form elements
        const element = event.target;
        if (element.dataset.bindTo) {
            const fieldName = element.dataset.bindTo;
            const property = element.dataset.bindProperty || 'value';

            if (property === 'value') {
                setInputValue(fieldName, element.value);
            } else if (property === 'checked') {
                setInputValue(fieldName, element.checked);
            }
        }

        // Process and execute the action
        const handler = processAction(actionTerm, onDispatch, event);
        handler();
    };
}

/**
 * Process special action forms before dispatching
 */
function processAction(actionTerm, onDispatch, event = null) {
    // Handle (Seq action1 action2 ...) - execute actions in sequence
    if (isCall(actionTerm) && isSym(actionTerm.h) && actionTerm.h.v === 'Seq') {
        return () => {
            actionTerm.a.forEach(action => {
                const processed = processAction(action, onDispatch, event);
                processed();
            });
        };
    }

    // Handle (ClearInput fieldName) - clear an input field
    if (isCall(actionTerm) && isSym(actionTerm.h) && actionTerm.h.v === 'ClearInput') {
        return () => {
            if (actionTerm.a[0] && isSym(actionTerm.a[0])) {
                clearInput(actionTerm.a[0].v);
            }
        };
    }

    // Handle (PreventDefault action) - prevent default and then execute action
    if (isCall(actionTerm) && isSym(actionTerm.h) && actionTerm.h.v === 'PreventDefault') {
        return () => {
            if (event) event.preventDefault();
            if (actionTerm.a[0]) {
                const processed = processAction(actionTerm.a[0], onDispatch, event);
                processed();
            }
        };
    }

    // Handle (StopPropagation action) - stop propagation and then execute action
    if (isCall(actionTerm) && isSym(actionTerm.h) && actionTerm.h.v === 'StopPropagation') {
        return () => {
            if (event) event.stopPropagation();
            if (actionTerm.a[0]) {
                const processed = processAction(actionTerm.a[0], onDispatch, event);
                processed();
            }
        };
    }

    // Handle (If condition thenAction elseAction) - conditional execution
    if (isCall(actionTerm) && isSym(actionTerm.h) && actionTerm.h.v === 'If') {
        return () => {
            const [condition, thenAction, elseAction] = actionTerm.a;
            // Simple boolean check for now - could be extended
            const condValue = evaluateCondition(condition, event);
            const action = condValue ? thenAction : elseAction;
            if (action) {
                const processed = processAction(action, onDispatch, event);
                processed();
            }
        };
    }

    // Handle (When (KeyIs "Enter") action) - execute action only when key matches
    if (isCall(actionTerm) && isSym(actionTerm.h) && actionTerm.h.v === 'When') {
        return () => {
            const [condition, action] = actionTerm.a;
            if (evaluateCondition(condition, event) && action) {
                const processed = processAction(action, onDispatch, event);
                processed();
            }
        };
    }

    // Replace any (Input fieldName) references with actual values
    if (isActionWithInput(actionTerm)) {
        return () => {
            const finalAction = replaceAllInputs(actionTerm);
            onDispatch(finalAction);
        };
    }

    // Default: dispatch the action as-is
    return () => onDispatch(actionTerm);
}

/**
 * Simple condition evaluator (can be extended)
 */
function evaluateCondition(condition, event = null) {
    // Check for (KeyIs "keyName") - check if event.key matches
    if (isCall(condition) && isSym(condition.h) && condition.h.v === 'KeyIs') {
        if (event && condition.a[0] && isStr(condition.a[0])) {
            return event.key === condition.a[0].v;
        }
        return false;
    }

    // Check for (Input fieldName) - true if non-empty
    if (isCall(condition) && isSym(condition.h) && condition.h.v === 'Input') {
        const fieldName = condition.a[0]?.v;
        if (fieldName) {
            const value = boundValues.get(fieldName) || '';
            return value !== '';
        }
    }

    // Check for boolean symbols
    if (isSym(condition)) {
        return condition.v === 'True';
    }

    return false;
}

/**
 * Replace all (Input fieldName) references with actual values
 */
function replaceAllInputs(term) {
    if (!term || !term.k) return term;

    // If this is an Input term, replace with value
    if (term.k === 'Call' && term.h && term.h.k === 'Sym' && term.h.v === 'Input') {
        if (term.a && term.a[0] && term.a[0].k === 'Sym') {
            const fieldName = term.a[0].v;
            return Str(boundValues.get(fieldName) || '');
        }
    }

    // Recursively process Call arguments
    if (term.k === 'Call') {
        return Call(
            term.h,
            ...term.a.map(arg => replaceAllInputs(arg))
        );
    }

    return term;
}

/**
 * Check if an action term contains an Input reference
 */
function isActionWithInput(term) {
    if (!term || !term.k) return false;
    if (term.k === 'Call' && term.h && term.h.k === 'Sym' && term.h.v === 'Input') {
        return true;
    }
    if (term.k === 'Call' && term.a) {
        return term.a.some(isActionWithInput);
    }
    return false;
}

/**
 * Remove element from bound elements registry
 */
export function removeBoundElement(element) {
    if (!element.dataset?.bindTo) return;

    const fieldName = element.dataset.bindTo;
    const elements = boundElements.get(fieldName);
    if (elements) {
        const filtered = elements.filter(item => item.element !== element);
        if (filtered.length > 0) {
            boundElements.set(fieldName, filtered);
        } else {
            boundElements.delete(fieldName);
        }
    }
}

/**
 * Clear all bound values
 */
export function clearAllInputs() {
    boundValues.clear();
    // Update all bound elements
    boundElements.forEach((elements, fieldName) => {
        elements.forEach(({ element, property }) => {
            if (property === 'value') {
                element.value = '';
            } else if (property === 'checked') {
                element.checked = false;
            }
        });
    });
}

/**
 * Clean up all bindings (for cleanup/unmount)
 */
export function cleanupAllBindings() {
    boundValues.clear();
    boundElements.clear();
}
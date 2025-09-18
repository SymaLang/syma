/*****************************************************************
 * Primitives Module
 *
 * Handles folding of primitive operations during normalization.
 * These are host-level computations that reduce symbolic expressions
 * to computed values.
 ******************************************************************/

import { K, Sym, Num, Str, isNum, isStr, isSym, isCall } from './ast-helpers.js';
import { freshId } from './effects-processor.js';

/**
 * Fold primitive operations into their computed values
 * Called during normalization to evaluate built-in functions
 */
export function foldPrims(node) {
    if (isCall(node)) {
        const h = foldPrims(node.h);
        const a = node.a.map(foldPrims);

        // Delegate to specific primitive handlers
        if (isSym(h)) {
            switch (h.v) {
                case "Add":
                    return foldAdd(a) || {k: K.Call, h, a};

                case "Sub":
                    return foldSub(a) || {k: K.Call, h, a};

                case "Mul":
                    return foldMul(a) || {k: K.Call, h, a};

                case "Div":
                    return foldDiv(a) || {k: K.Call, h, a};

                case "Concat":
                    return foldConcat(a) || {k: K.Call, h, a};

                case "ToString":
                    return foldToString(a) || {k: K.Call, h, a};

                case "FreshId":
                    return foldFreshId(a) || {k: K.Call, h, a};

                default:
                    return {k: K.Call, h, a};
            }
        }

        return {k: K.Call, h, a};
    }

    // Atoms unchanged
    if (isSym(node) || isNum(node) || isStr(node)) return node;

    throw new Error("foldPrims: unknown node type");
}

/**
 * Arithmetic: Add[Num, Num] -> Num(sum)
 */
function foldAdd(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        return Num(args[0].v + args[1].v);
    }
    return null;
}

/**
 * Arithmetic: Sub[Num, Num] -> Num(difference)
 */
function foldSub(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        return Num(args[0].v - args[1].v);
    }
    return null;
}

/**
 * Arithmetic: Mul[Num, Num] -> Num(product)
 */
function foldMul(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        return Num(args[0].v * args[1].v);
    }
    return null;
}

/**
 * Arithmetic: Div[Num, Num] -> Num(quotient)
 * Returns null for division by zero
 */
function foldDiv(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        if (args[1].v === 0) return null; // Don't fold division by zero
        return Num(args[0].v / args[1].v);
    }
    return null;
}

/**
 * String concatenation: Concat[Str|Num, ...] -> Str(concatenated)
 * Accepts any number of strings or numbers
 */
function foldConcat(args) {
    // Check if all args are strings or numbers
    const allStringifiable = args.every(arg => isStr(arg) || isNum(arg));

    if (allStringifiable && args.length > 0) {
        const concatenated = args.map(arg =>
            isStr(arg) ? arg.v : String(arg.v)
        ).join("");
        return Str(concatenated);
    }

    return null;
}

/**
 * Convert to string: ToString[Any] -> Str(stringified)
 */
function foldToString(args) {
    if (args.length !== 1) return null;

    const arg = args[0];

    if (isStr(arg)) {
        return arg; // Already a string
    } else if (isNum(arg)) {
        return Str(String(arg.v));
    } else if (isSym(arg)) {
        return Str(arg.v);
    }

    return null;
}

/**
 * Generate unique ID: FreshId[] -> Str(unique-id)
 */
function foldFreshId(args) {
    if (args.length === 0) {
        return freshId();
    }
    return null;
}



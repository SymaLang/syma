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
            const result = foldPrimitive(h.v, a);
            if (result !== null) return result;
            return {k: K.Call, h, a};
        }

        return {k: K.Call, h, a};
    }

    // Atoms unchanged
    if (isSym(node) || isNum(node) || isStr(node)) return node;

    throw new Error("foldPrims: unknown node type");
}

/**
 * Central dispatcher for primitive operations
 */
function foldPrimitive(op, args) {
    // Arithmetic operations
    switch (op) {
        case "Add": return foldAdd(args);
        case "Sub": return foldSub(args);
        case "Mul": return foldMul(args);
        case "Div": return foldDiv(args);
        case "Mod": return foldMod(args);
        case "Pow": return foldPow(args);
        case "Sqrt": return foldSqrt(args);
        case "Abs": return foldAbs(args);
        case "Min": return foldMin(args);
        case "Max": return foldMax(args);
        case "Floor": return foldFloor(args);
        case "Ceil": return foldCeil(args);
        case "Round": return foldRound(args);
    }

    // String operations
    switch (op) {
        case "Concat": return foldConcat(args);
        case "ToString": return foldToString(args);
        case "ToUpper": return foldToUpper(args);
        case "ToLower": return foldToLower(args);
        case "Trim": return foldTrim(args);
        case "StrLen": return foldStrLen(args);
        case "Substring": return foldSubstring(args);
        case "IndexOf": return foldIndexOf(args);
        case "Replace": return foldReplace(args);
        case "Split": return foldSplit(args);
    }

    // Comparison operations
    switch (op) {
        case "Eq": return foldEq(args);
        case "Neq": return foldNeq(args);
        case "Lt": return foldLt(args);
        case "Gt": return foldGt(args);
        case "Lte": return foldLte(args);
        case "Gte": return foldGte(args);
    }

    // Boolean operations
    switch (op) {
        case "And": return foldAnd(args);
        case "Or": return foldOr(args);
        case "Not": return foldNot(args);
    }

    // Type checking
    switch (op) {
        case "IsNum": return foldIsNum(args);
        case "IsStr": return foldIsStr(args);
        case "IsSym": return foldIsSym(args);
        case "IsTrue": return foldIsTrue(args);
        case "IsFalse": return foldIsFalse(args);
    }

    // Utilities
    switch (op) {
        case "FreshId": return foldFreshId(args);
        case "Random": return foldRandom(args);
        case "ParseNum": return foldParseNum(args);
        case "Debug": return foldDebug(args);
        case "CharFromCode": return foldCharFromCode(args);
    }

    return null;
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

// ============= Extended Arithmetic Operations =============

/**
 * Modulo: Mod[Num, Num] -> Num(remainder)
 */
function foldMod(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        if (args[1].v === 0) return null; // Don't fold modulo by zero
        return Num(args[0].v % args[1].v);
    }
    return null;
}

/**
 * Power: Pow[Num, Num] -> Num(result)
 */
function foldPow(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        return Num(Math.pow(args[0].v, args[1].v));
    }
    return null;
}

/**
 * Square root: Sqrt[Num] -> Num(result)
 */
function foldSqrt(args) {
    if (args.length === 1 && isNum(args[0])) {
        if (args[0].v < 0) return null; // Don't fold negative sqrt
        return Num(Math.sqrt(args[0].v));
    }
    return null;
}

/**
 * Absolute value: Abs[Num] -> Num(result)
 */
function foldAbs(args) {
    if (args.length === 1 && isNum(args[0])) {
        return Num(Math.abs(args[0].v));
    }
    return null;
}

/**
 * Minimum: Min[Num, Num, ...] -> Num(minimum)
 */
function foldMin(args) {
    if (args.length > 0 && args.every(isNum)) {
        const min = Math.min(...args.map(n => n.v));
        return Num(min);
    }
    return null;
}

/**
 * Maximum: Max[Num, Num, ...] -> Num(maximum)
 */
function foldMax(args) {
    if (args.length > 0 && args.every(isNum)) {
        const max = Math.max(...args.map(n => n.v));
        return Num(max);
    }
    return null;
}

/**
 * Floor: Floor[Num] -> Num(floor)
 */
function foldFloor(args) {
    if (args.length === 1 && isNum(args[0])) {
        return Num(Math.floor(args[0].v));
    }
    return null;
}

/**
 * Ceiling: Ceil[Num] -> Num(ceiling)
 */
function foldCeil(args) {
    if (args.length === 1 && isNum(args[0])) {
        return Num(Math.ceil(args[0].v));
    }
    return null;
}

/**
 * Round: Round[Num] -> Num(rounded)
 */
function foldRound(args) {
    if (args.length === 1 && isNum(args[0])) {
        return Num(Math.round(args[0].v));
    }
    return null;
}

// ============= String Operations =============

/**
 * To uppercase: ToUpper[Str] -> Str(uppercased)
 */
function foldToUpper(args) {
    if (args.length === 1 && isStr(args[0])) {
        return Str(args[0].v.toUpperCase());
    }
    return null;
}

/**
 * To lowercase: ToLower[Str] -> Str(lowercased)
 */
function foldToLower(args) {
    if (args.length === 1 && isStr(args[0])) {
        return Str(args[0].v.toLowerCase());
    }
    return null;
}

/**
 * Trim whitespace: Trim[Str] -> Str(trimmed)
 */
function foldTrim(args) {
    if (args.length === 1 && isStr(args[0])) {
        return Str(args[0].v.trim());
    }
    return null;
}

/**
 * String length: StrLen[Str] -> Num(length)
 */
function foldStrLen(args) {
    if (args.length === 1 && isStr(args[0])) {
        return Num(args[0].v.length);
    }
    return null;
}

/**
 * Substring: Substring[Str, start, end?] -> Str(substring)
 */
function foldSubstring(args) {
    if (args.length >= 2 && isStr(args[0]) && isNum(args[1])) {
        const str = args[0].v;
        const start = args[1].v;

        if (args.length === 3 && isNum(args[2])) {
            return Str(str.substring(start, args[2].v));
        } else {
            return Str(str.substring(start));
        }
    }
    return null;
}

/**
 * Index of substring: IndexOf[Str, searchStr] -> Num(index)
 */
function foldIndexOf(args) {
    if (args.length === 2 && isStr(args[0]) && isStr(args[1])) {
        return Num(args[0].v.indexOf(args[1].v));
    }
    return null;
}

/**
 * Replace: Replace[Str, search, replacement] -> Str(replaced)
 */
function foldReplace(args) {
    if (args.length === 3 && isStr(args[0]) && isStr(args[1]) && isStr(args[2])) {
        const result = args[0].v.replace(args[1].v, args[2].v);
        return Str(result);
    }
    return null;
}

/**
 * Split string: Split[Str, separator] -> creates multiple Str nodes
 * Note: Returns null as we can't represent lists as primitives yet
 */
function foldSplit(args) {
    // This would need proper list support to be useful
    // For now, returning null keeps it symbolic
    return null;
}

// ============= Comparison Operations =============

/**
 * Equality: Eq[a, b] -> True|False
 */
function foldEq(args) {
    if (args.length === 2) {
        const [a, b] = args;

        if (isNum(a) && isNum(b)) {
            return Sym(a.v === b.v ? "True" : "False");
        }
        if (isStr(a) && isStr(b)) {
            return Sym(a.v === b.v ? "True" : "False");
        }
        if (isSym(a) && isSym(b)) {
            return Sym(a.v === b.v ? "True" : "False");
        }
    }
    return null;
}

/**
 * Inequality: Neq[a, b] -> True|False
 */
function foldNeq(args) {
    if (args.length === 2) {
        const eq = foldEq(args);
        if (eq && isSym(eq)) {
            return Sym(eq.v === "True" ? "False" : "True");
        }
    }
    return null;
}

/**
 * Less than: Lt[Num, Num] -> True|False
 */
function foldLt(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        return Sym(args[0].v < args[1].v ? "True" : "False");
    }
    return null;
}

/**
 * Greater than: Gt[Num, Num] -> True|False
 */
function foldGt(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        return Sym(args[0].v > args[1].v ? "True" : "False");
    }
    return null;
}

/**
 * Less than or equal: Lte[Num, Num] -> True|False
 */
function foldLte(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        return Sym(args[0].v <= args[1].v ? "True" : "False");
    }
    return null;
}

/**
 * Greater than or equal: Gte[Num, Num] -> True|False
 */
function foldGte(args) {
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        return Sym(args[0].v >= args[1].v ? "True" : "False");
    }
    return null;
}

// ============= Boolean Operations =============

/**
 * Logical AND: And[Bool, Bool] -> True|False
 */
function foldAnd(args) {
    if (args.length === 2 && isSym(args[0]) && isSym(args[1])) {
        const a = args[0].v === "True";
        const b = args[1].v === "True";
        return Sym(a && b ? "True" : "False");
    }
    return null;
}

/**
 * Logical OR: Or[Bool, Bool] -> True|False
 */
function foldOr(args) {
    if (args.length === 2 && isSym(args[0]) && isSym(args[1])) {
        const a = args[0].v === "True";
        const b = args[1].v === "True";
        return Sym(a || b ? "True" : "False");
    }
    return null;
}

/**
 * Logical NOT: Not[Bool] -> True|False
 */
function foldNot(args) {
    if (args.length === 1 && isSym(args[0])) {
        return Sym(args[0].v === "True" ? "False" : "True");
    }
    return null;
}

// ============= Type Checking =============

/**
 * Check if number: IsNum[Any] -> True|False
 */
function foldIsNum(args) {
    if (args.length === 1) {
        return Sym(isNum(args[0]) ? "True" : "False");
    }
    return null;
}

/**
 * Check if string: IsStr[Any] -> True|False
 */
function foldIsStr(args) {
    if (args.length === 1) {
        return Sym(isStr(args[0]) ? "True" : "False");
    }
    return null;
}

/**
 * Check if symbol: IsSym[Any] -> True|False
 */
function foldIsSym(args) {
    if (args.length === 1) {
        return Sym(isSym(args[0]) ? "True" : "False");
    }
    return null;
}

/**
 * Check if True: IsTrue[Any] -> True|False
 */
function foldIsTrue(args) {
    if (args.length === 1) {
        return Sym(isSym(args[0]) && args[0].v === "True" ? "True" : "False");
    }
    return null;
}

/**
 * Check if False: IsFalse[Any] -> True|False
 */
function foldIsFalse(args) {
    if (args.length === 1) {
        return Sym(isSym(args[0]) && args[0].v === "False" ? "True" : "False");
    }
    return null;
}

// ============= Utilities =============

/**
 * Random number: Random[min?, max?] -> Num(random)
 */
function foldRandom(args) {
    if (args.length === 0) {
        return Num(Math.random());
    }
    if (args.length === 2 && isNum(args[0]) && isNum(args[1])) {
        const min = args[0].v;
        const max = args[1].v;
        return Num(Math.random() * (max - min) + min);
    }
    return null;
}

/**
 * Parse number from string: ParseNum[Str] -> Num(parsed) or remains symbolic if invalid
 */
function foldParseNum(args) {
    if (args.length === 1 && isStr(args[0])) {
        const parsed = parseFloat(args[0].v);
        if (!isNaN(parsed)) {
            return Num(parsed);
        }
    }
    return null;
}

/**
 * Debug logging: Debug[label?, value] -> value (side effect: console.log)
 * Quick and dirty debugging - logs to console and passes through the value
 * Unlike Print effect, this happens immediately during normalization
 */
function foldDebug(args) {
    if (args.length === 0) return null;

    // Debug[value] - just log the value
    if (args.length === 1) {
        const value = args[0];
        console.log("[DEBUG]", formatDebugValue(value));
        return value; // Pass through
    }

    // Debug[label, value] - log with label
    if (args.length >= 2) {
        const label = isStr(args[0]) ? args[0].v : formatDebugValue(args[0]);
        const value = args[1];
        console.log(`[DEBUG ${label}]`, formatDebugValue(value));
        return value; // Return the value, not the label
    }

    return null;
}

/**
 * Convert ASCII code to character: CharFromCode[Num] -> Str(char)
 * Converts an ASCII/Unicode code point to its character representation
 */
function foldCharFromCode(args) {
    if (args.length === 1 && isNum(args[0])) {
        const code = args[0].v;
        // Handle valid ASCII/Unicode range
        if (code >= 0 && code <= 0x10FFFF) {
            return Str(String.fromCharCode(code));
        }
    }
    return null;
}

/**
 * Helper to format values for debug output
 */
function formatDebugValue(node) {
    if (isStr(node)) return `"${node.v}"`;
    if (isNum(node)) return node.v;
    if (isSym(node)) return node.v;
    if (isCall(node) && isSym(node.h)) {
        // Simple representation for calls
        const args = node.a.map(formatDebugValue).join(", ");
        return `${node.h.v}[${args}]`;
    }
    // Fallback to JSON for complex structures
    return JSON.stringify(node);
}



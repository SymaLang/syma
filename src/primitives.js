/*****************************************************************
 * Primitives Module
 *
 * Handles folding of primitive operations during normalization.
 * These are host-level computations that reduce symbolic expressions
 * to computed values.
 ******************************************************************/

import { K, Sym, Num, Str, isNum, isStr, isSym, isCall, Splice, isSplice, Call } from './ast-helpers.js';
import { freshId } from './effects/processor.js';

/**
 * Fold primitive operations into their computed values
 * Called during normalization to evaluate built-in functions
 */
export function foldPrims(node, skipFolds = []) {
    if (isCall(node)) {
        const h = foldPrims(node.h, skipFolds);
        const a = node.a.map((a) => foldPrims(a, skipFolds));

        // Flatten any Splice objects in the arguments
        const flattened = [];
        for (const arg of a) {
            if (isSplice(arg)) {
                flattened.push(...arg.items);
            } else {
                flattened.push(arg);
            }
        }

        // Delegate to specific primitive handlers
        if (isSym(h)) {
            const result = foldPrimitive(h.v, flattened, skipFolds);
            if (result !== null) return result;
            return {k: K.Call, h, a: flattened};
        }

        return {k: K.Call, h, a: flattened};
    }

    // Atoms unchanged
    if (isSym(node) || isNum(node) || isStr(node)) return node;

    // Splice objects pass through unchanged
    // They only get flattened during substitution in rule application
    if (isSplice(node)) return node;

    throw new Error("foldPrims: unknown node type");
}

/**
 * Central dispatcher for primitive operations
 */
function foldPrimitive(op, args, skipFolds) {
    // Skip specified folds
    if (skipFolds.includes(op)) {
        return null;
    }
    // Arithmetic operations
    switch (op) {
        case "Add": return foldAdd(args);
        case "+": return foldAdd(args); // Alias
        case "Sub": return foldSub(args);
        case "-": return foldSub(args); // Alias
        case "Mul": return foldMul(args);
        case "*": return foldMul(args); // Alias
        case "Div": return foldDiv(args);
        case "/": return foldDiv(args); // Alias
        case "Mod": return foldMod(args);
        case "%": return foldMod(args); // Alias
        case "Pow": return foldPow(args);
        case "^": return foldPow(args); // Alias
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
        case "ToNormalString": return foldToNormalString(args);
        case "ToUpper": return foldToUpper(args);
        case "ToLower": return foldToLower(args);
        case "Trim": return foldTrim(args);
        case "StrLen": return foldStrLen(args);
        case "Substring": return foldSubstring(args);
        case "IndexOf": return foldIndexOf(args);
        case "Replace": return foldReplace(args);
        case "ReplaceAll": return foldReplaceAll(args);
        case "Split": return foldSplit(args);
        case "SplitToChars": return foldSplitToChars(args);
        case "SplitBy": return foldSplitBy(args);
        case "Escape": return foldEscape(args);
        case "Unescape": return foldUnescape(args);
    }

    // Comparison operations
    switch (op) {
        case "Eq": return foldEq(args);
        case "==": return foldEq(args); // Alias
        case "Neq": return foldNeq(args);
        case "!=": return foldNeq(args); // Alias
        case "Lt": return foldLt(args);
        case "<": return foldLt(args); // Alias
        case "Gt": return foldGt(args);
        case ">": return foldGt(args); // Alias
        case "Lte": return foldLte(args);
        case "<=": return foldLte(args); // Alias
        case "Gte": return foldGte(args);
        case ">=": return foldGte(args); // Alias
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
        case "AreNums": return foldAreNums(args);
        case "AreStrings": return foldAreStrings(args);
        case "AreSyms": return foldAreSyms(args);
    }

    // Utilities
    switch (op) {
        case "FreshId": return foldFreshId(args);
        case "Random": return foldRandom(args);
        case "ParseNum": return foldParseNum(args);
        case "Debug": return foldDebug(args);
        case "CharFromCode": return foldCharFromCode(args);
        case "Splat": return foldSplat(args);
        case "...!": return foldSplat(args);
        case "Serialize": return foldSerialize(args);
        case "Deserialize": return foldDeserialize(args);
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
    } else if (isCall(arg)) {
        // Convert complex expressions to S-expression string format
        return Str(exprToString(arg));
    }

    return null;
}

/**
 * ToNormalString: Converts a fully normalized expression to a string
 * NOTE: The normalizer must ensure the argument is fully normalized before
 * calling this primitive. This function itself cannot determine if something
 * is normalized - it relies on the normalizer to handle this correctly.
 *
 * For now, we return null for Call expressions as a conservative default,
 * but the real solution requires the normalizer to track normalization state
 * and only fold ToNormalString when its argument is in normal form.
 */
function foldToNormalString(args) {
    if (args.length !== 1) return null;

    const arg = args[0];

    if (isStr(arg)) {
        return arg; // Already a string
    } else if (isNum(arg)) {
        return Str(String(arg.v));
    } else if (isSym(arg)) {
        return Str(arg.v);
    } else if (isCall(arg)) {
        // TODO: This should actually stringify once the normalizer confirms
        // the expression is in normal form. For now, returning null forces
        // the normalizer to keep trying, which is conservative but incomplete.
        return null;
    }

    return null;
}


/**
 * Helper to convert expressions to S-expression string format
 */
function exprToString(expr) {
    if (isStr(expr)) {
        // Strings need quotes in S-expression format
        return `"${expr.v.replace(/"/g, '\\"')}"`;
    } else if (isNum(expr)) {
        return String(expr.v);
    } else if (isSym(expr)) {
        return expr.v;
    } else if (isCall(expr)) {
        // Format as {Head arg1 arg2 ...}
        const head = exprToString(expr.h);
        const args = expr.a.map(exprToString);
        if (args.length === 0) {
            return `{${head}}`;
        }
        return `{${head} ${args.join(' ')}}`;
    }
    return String(expr); // Fallback
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
 * Replace all occurrences: ReplaceAll[Str, search, replacement] -> Str(replaced)
 */
function foldReplaceAll(args) {
    if (args.length === 3 && isStr(args[0]) && isStr(args[1]) && isStr(args[2])) {
        // Use replaceAll if available (ES2021+) or fall back to global regex
        const search = args[1].v;
        const replacement = args[2].v;
        let result;

        if (String.prototype.replaceAll) {
            // Use native replaceAll if available
            result = args[0].v.replaceAll(search, replacement);
        } else {
            // Fallback for older environments: escape regex special chars and use global replace
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = args[0].v.replace(new RegExp(escaped, 'g'), replacement);
        }

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

/**
 * Split string to characters: SplitToChars[Str] -> Chars[Str, Str, ...]
 * Converts a string into individual character strings wrapped in Chars
 */
function foldSplitToChars(args) {
    if (args.length === 1 && isStr(args[0])) {
        const str = args[0].v;
        const chars = str.split('').map(char => Str(char));
        return Call(Sym('Chars'), ...chars);
    }
    return null;
}

/**
 * Split string by separator: SplitBy[separator, string] -> Strings[Str, Str, ...]
 * Splits a string by the given separator
 * Special case: empty separator "" splits into individual character strings
 */
function foldSplitBy(args) {
    if (args.length === 2 && isStr(args[0]) && isStr(args[1])) {
        const separator = args[0].v;
        const str = args[1].v;

        let parts;
        if (separator === '') {
            // Special case: empty separator splits into individual characters
            // but we return Strings (not Chars) per the requirement
            parts = str.split('').map(char => Str(char));
        } else {
            // Normal case: split by separator
            parts = str.split(separator).map(part => Str(part));
        }

        return Call(Sym('Strings'), ...parts);
    }
    return null;
}

/**
 * Escape string: Escape[Str] -> Str(escaped)
 * Escapes special characters in a string for safe embedding/serialization
 * Handles: quotes, backslashes, newlines, carriage returns, tabs, form feeds
 */
function foldEscape(args) {
    if (args.length === 1 && isStr(args[0])) {
        const escaped = args[0].v
            .replace(/\\/g, '\\\\')   // Escape backslashes first
            .replace(/"/g, '\\"')     // Escape quotes
            .replace(/\n/g, '\\n')    // Escape newlines
            .replace(/\r/g, '\\r')    // Escape carriage returns
            .replace(/\t/g, '\\t')    // Escape tabs
            .replace(/\f/g, '\\f');   // Escape form feeds
        return Str(escaped);
    }
    return null;
}

/**
 * Unescape string: Unescape[Str] -> Str(unescaped)
 * Converts escape sequences back to their actual characters
 * Handles: \", \\, \n, \r, \t, \f
 */
function foldUnescape(args) {
    if (args.length === 1 && isStr(args[0])) {
        const unescaped = args[0].v
            .replace(/\\n/g, '\n')    // Unescape newlines
            .replace(/\\r/g, '\r')    // Unescape carriage returns
            .replace(/\\t/g, '\t')    // Unescape tabs
            .replace(/\\f/g, '\f')    // Unescape form feeds
            .replace(/\\"/g, '"')     // Unescape quotes
            .replace(/\\\\/g, '\\');  // Unescape backslashes last
        return Str(unescaped);
    }
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
        if (isCall(a) && isCall(b)) {
            // Deep equality check for calls
            const callsEqual = (a.h.k === b.h.k) &&
                ((isSym(a.h) && isSym(b.h) && a.h.v === b.h.v) ||
                 (isNum(a.h) && isNum(b.h) && a.h.v === b.h.v) ||
                 (isStr(a.h) && isStr(b.h) && a.h.v === b.h.v)) &&
                (a.a.length === b.a.length) &&
                a.a.every((arg, idx) => {
                    const otherArg = b.a[idx];
                    return foldEq([arg, otherArg]).v === "True";
                });
            return Sym(callsEqual ? "True" : "False");
        }
        // Different types are not equal
        return Sym("False");
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
 * Logical AND: And[Bool, Bool, ...] -> True|False
 * Returns True only if ALL arguments are True
 */
function foldAnd(args) {
    if (args.length > 0 && args.every(arg => isSym(arg) && (arg.v === "True" || arg.v === "False"))) {
        const allTrue = args.every(arg => arg.v === "True");
        return Sym(allTrue ? "True" : "False");
    }
    return null;
}

/**
 * Logical OR: Or[Bool, Bool, ...] -> True|False
 * Returns True if ANY argument is True
 */
function foldOr(args) {
    if (args.length > 0 && args.every(arg => isSym(arg) && (arg.v === "True" || arg.v === "False"))) {
        const anyTrue = args.some(arg => arg.v === "True");
        return Sym(anyTrue ? "True" : "False");
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

/**
 * Check if all elements are numbers: AreNums[Array|Splice|...args] -> True|False
 * Works with:
 * - VarRest bindings that expand to arrays
 * - Splice objects from rule substitution
 * - Multiple arguments passed directly
 */
function foldAreNums(args) {
    if (args.length === 0) {
        // Empty list is vacuously true
        return Sym("True");
    }

    let items;
    if (args.length === 1) {
        const arg = args[0];
        // Handle both plain arrays and Splice objects
        if (Array.isArray(arg)) {
            items = arg;
        } else if (isSplice(arg)) {
            items = arg.items;
        } else {
            // Single non-array/splice argument, check if it's a number
            return Sym(isNum(arg) ? "True" : "False");
        }
    } else {
        // Multiple arguments, check all of them
        items = args;
    }

    const allNums = items.every(item => isNum(item));
    return Sym(allNums ? "True" : "False");
}

/**
 * Check if all elements are strings: AreStrings[Array|Splice|...args] -> True|False
 * Works with:
 * - VarRest bindings that expand to arrays
 * - Splice objects from rule substitution
 * - Multiple arguments passed directly
 */
function foldAreStrings(args) {
    if (args.length === 0) {
        // Empty list is vacuously true
        return Sym("True");
    }

    let items;
    if (args.length === 1) {
        const arg = args[0];
        // Handle both plain arrays and Splice objects
        if (Array.isArray(arg)) {
            items = arg;
        } else if (isSplice(arg)) {
            items = arg.items;
        } else {
            // Single non-array/splice argument, check if it's a string
            return Sym(isStr(arg) ? "True" : "False");
        }
    } else {
        // Multiple arguments, check all of them
        items = args;
    }

    const allStrings = items.every(item => isStr(item));
    return Sym(allStrings ? "True" : "False");
}

/**
 * Check if all elements are symbols: AreSyms[Array|Splice|...args] -> True|False
 * Works with:
 * - VarRest bindings that expand to arrays
 * - Splice objects from rule substitution
 * - Multiple arguments passed directly
 */
function foldAreSyms(args) {
    if (args.length === 0) {
        // Empty list is vacuously true
        return Sym("True");
    }

    let items;
    if (args.length === 1) {
        const arg = args[0];
        // Handle both plain arrays and Splice objects
        if (Array.isArray(arg)) {
            items = arg;
        } else if (isSplice(arg)) {
            items = arg.items;
        } else {
            // Single non-array/splice argument, check if it's a symbol
            return Sym(isSym(arg) ? "True" : "False");
        }
    } else {
        // Multiple arguments, check all of them
        items = args;
    }

    const allSyms = items.every(item => isSym(item));
    return Sym(allSyms ? "True" : "False");
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
 * Splat/spread operator: ...![arg1, arg2, ...] -> Splice([arg1, arg2, ...])
 * Returns a Splice object that will be flattened in specific contexts:
 * - As arguments in function calls (automatically flattened during normalization)
 * - In RuleRules for generating multiple rules (handled by meta-rule processor)
 *
 * Note: Splice is an internal representation. When displayed at top level,
 * it will be shown as Bundle[...] for clarity.
 */
function foldSplat(args) {
    // Return Splice object - it will be expanded by context-specific processors
    // The display layer will handle showing it as Bundle[...] for clarity
    return Splice(args);
}

/**
 * Serialize: Serialize[expr] -> Str(json)
 * Converts any Syma expression into a JSON string that can be stored or transmitted.
 * The serialized format preserves the complete AST structure and can be perfectly
 * deserialized back to the original expression.
 *
 * This enables powerful patterns like:
 * - Storing expressions in databases or files
 * - Transmitting code over the network
 * - Creating expression templates
 * - Metaprogramming and code generation
 */
function foldSerialize(args) {
    if (args.length !== 1) return null;

    const expr = args[0];

    try {
        // Convert the expression to a serializable format
        const serializable = exprToSerializable(expr);
        // Convert to JSON string
        const json = JSON.stringify(serializable);
        return Str(json);
    } catch (e) {
        // If serialization fails, remain symbolic
        return null;
    }
}

/**
 * Deserialize: Deserialize[Str] -> expr
 * Parses a JSON string (created by Serialize) back into a Syma expression.
 * This is the inverse of Serialize, allowing perfect round-trip conversion.
 *
 * Use cases:
 * - Loading stored expressions
 * - Receiving code over the network
 * - Dynamic code evaluation
 * - Template instantiation
 */
function foldDeserialize(args) {
    if (args.length !== 1 || !isStr(args[0])) return null;

    const jsonStr = args[0].v;

    try {
        // Parse the JSON string
        const parsed = JSON.parse(jsonStr);
        // Convert back to Syma expression
        const expr = serializableToExpr(parsed);
        return expr;
    } catch (e) {
        // If deserialization fails, remain symbolic
        return null;
    }
}

/**
 * Convert a Syma expression to a serializable JavaScript object
 * that can be safely converted to JSON
 */
function exprToSerializable(expr) {
    // Handle Splice objects
    if (isSplice(expr)) {
        return {
            k: "Splice",
            items: expr.items.map(exprToSerializable)
        };
    }

    // Handle atoms
    if (isSym(expr)) {
        return {k: "Sym", v: expr.v};
    }
    if (isNum(expr)) {
        return {k: "Num", v: expr.v};
    }
    if (isStr(expr)) {
        return {k: "Str", v: expr.v};
    }

    // Handle calls
    if (isCall(expr)) {
        return {
            k: "Call",
            h: exprToSerializable(expr.h),
            a: expr.a.map(exprToSerializable)
        };
    }

    // Unknown type - throw error
    throw new Error(`Cannot serialize unknown expression type: ${JSON.stringify(expr)}`);
}

/**
 * Convert a serialized JavaScript object back to a Syma expression
 */
function serializableToExpr(obj) {
    if (!obj || typeof obj !== 'object' || !obj.k) {
        throw new Error(`Invalid serialized format: ${JSON.stringify(obj)}`);
    }

    switch (obj.k) {
        case "Sym":
            return Sym(obj.v);
        case "Num":
            return Num(obj.v);
        case "Str":
            return Str(obj.v);
        case "Call":
            return Call(
                serializableToExpr(obj.h),
                ...obj.a.map(serializableToExpr)
            );
        case "Splice":
            return Splice(obj.items.map(serializableToExpr));
        default:
            throw new Error(`Unknown serialized type: ${obj.k}`);
    }
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

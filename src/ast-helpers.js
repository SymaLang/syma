/*****************************************************************
 * AST Helper Functions
 * Shared utilities for working with the symbolic AST
 ******************************************************************/

export const K = {
    Sym: "Sym",
    Num: "Num",
    Str: "Str",
    Call: "Call"
};

/* Constructors */
export const Sym = v => ({k: K.Sym, v});
export const Num = v => ({k: K.Num, v});
export const Str = v => ({k: K.Str, v});
export const Call = (h = null, ...a) => ({k: K.Call, h, a});

/* Type guards */
export const isSym = n => n && n.k === K.Sym;
export const isNum = n => n && n.k === K.Num;
export const isStr = n => n && n.k === K.Str;
export const isCall = n => n && n.k === K.Call;

/* Deep clone (small trees, simple) */
export const clone = n => JSON.parse(JSON.stringify(n));

/* Structural deep equality */
export const deq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Splice helper for rest variables */
export const Splice = (items) => ({ __splice: true, items });
export const isSplice = (x) => x && x.__splice === true && Array.isArray(x.items);
export const arrEq = (A, B) =>
    Array.isArray(A) && Array.isArray(B) &&
    A.length === B.length && A.every((x, i) => deq(x, B[i]));

/* Pretty printing for debugging */
export const show = n => {
    if (isSym(n)) return n.v;
    if (isNum(n)) return String(n.v);
    if (isStr(n)) return JSON.stringify(n.v);
    if (isCall(n)) {
        if (n.h === null) return `{}[${n.a.map(show).join(", ")}]`;
        return `${show(n.h)}[${n.a.map(show).join(", ")}]`;
    }
    throw new Error("show: unknown node kind");
};
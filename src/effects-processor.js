/*****************************************************************
 * Symbolic Effects Processor
 *
 * A minimal bridge between symbolic effect terms and real I/O.
 * The host runtime watches for effect requests in the AST,
 * performs actual I/O, and inserts results back as terms.
 *
 * Everything else (retries, caching, optimistic updates)
 * is handled symbolically via rules.
 ******************************************************************/

import { K, Sym, Num, Str, Call, isSym, isNum, isStr, isCall, clone, deq } from './ast-helpers.js';

/**
 * Find the Effects node in the Program
 * Expected structure: Program[App[State[...], UI[...]], Effects[Pending[...], Inbox[...]]]
 */
function findEffects(program) {
    if (!isCall(program) || !isSym(program.h) || program.h.v !== "Program") return null;

    // Look for Effects[...] in Program's children
    return program.a.find(node =>
        isCall(node) && isSym(node.h) && node.h.v === "Effects"
    );
}

/**
 * Extract pending effect requests from Effects[Pending[...], Inbox[...]]
 */
function extractPendingEffects(effectsNode) {
    if (!effectsNode || !isCall(effectsNode)) return [];

    // Effects[Pending[...], Inbox[...]]
    const pending = effectsNode.a[0];
    if (!pending || !isCall(pending) || !isSym(pending.h) || pending.h.v !== "Pending") {
        return [];
    }

    return pending.a; // Return all pending effect terms
}

/**
 * Update Effects node with processed results
 * Removes processed request from Pending, adds response to Inbox
 */
function updateEffects(program, processedId, response) {
    const prog = clone(program);
    const effects = findEffects(prog);
    if (!effects) return prog;

    // Effects[Pending[...], Inbox[...]]
    const pending = effects.a[0];
    const inbox = effects.a[1] || Call(Sym("Inbox"));

    if (!isCall(pending) || !isCall(inbox)) return prog;

    // Remove processed request from Pending (match by id)
    const newPendingItems = pending.a.filter(req => {
        // Check if this request has the processed id
        if (isCall(req) && req.a.length > 0) {
            const firstArg = req.a[0];
            if (deq(firstArg, processedId)) return false;
        }
        return true;
    });

    // Add response to Inbox
    const newInboxItems = [...inbox.a, response];

    // Update Effects node
    effects.a[0] = Call(Sym("Pending"), ...newPendingItems);
    effects.a[1] = Call(Sym("Inbox"), ...newInboxItems);

    return prog;
}

/**
 * Process HttpReq effect - perform actual HTTP request
 */
async function processHttpReq(req) {
    // HttpReq[id, Method["GET"|"POST"], Url["/api/..."], Body[...], Headers[...]]
    const [id, method, url, body, headers] = req.a;

    if (!id) throw new Error("HttpReq missing id");

    // Extract values
    const methodStr = method && isCall(method) && method.a[0] && isStr(method.a[0])
        ? method.a[0].v : "GET";
    const urlStr = url && isCall(url) && url.a[0] && isStr(url.a[0])
        ? url.a[0].v : "/";

    // Build fetch options
    const fetchOpts = {
        method: methodStr,
    };

    // Add body if present and not GET
    if (body && methodStr !== "GET") {
        const bodyContent = body.a[0];
        if (bodyContent) {
            // Convert symbolic body to JSON
            fetchOpts.body = JSON.stringify(symbolicToJs(bodyContent));
            fetchOpts.headers = {
                'Content-Type': 'application/json',
                ...extractHeaders(headers)
            };
        }
    } else if (headers) {
        fetchOpts.headers = extractHeaders(headers);
    }

    try {
        const response = await fetch(urlStr, fetchOpts);
        const responseData = await response.json().catch(() => null);

        // Build HttpRes[id, Status[code], Json[data], Headers[...]]
        return Call(
            Sym("HttpRes"),
            id,
            Call(Sym("Status"), Num(response.status)),
            responseData ? Call(Sym("Json"), jsToSymbolic(responseData)) : Call(Sym("Json"), Sym("null")),
            Call(Sym("Headers")) // Could extract response headers if needed
        );
    } catch (error) {
        // Network error - return error response
        return Call(
            Sym("HttpRes"),
            id,
            Call(Sym("Status"), Num(0)), // 0 indicates network error
            Call(Sym("Error"), Str(error.message)),
            Call(Sym("Headers"))
        );
    }
}

/**
 * Process Timer effect - schedule delayed insertion
 */
function processTimer(req, insertResponse) {
    // Timer[id, Delay[ms]]
    const [id, delay] = req.a;
    if (!id || !delay) return;

    const delayMs = delay && isCall(delay) && delay.a[0] && isNum(delay.a[0])
        ? delay.a[0].v : 0;

    setTimeout(() => {
        // Insert TimerComplete[id, Now[timestamp]]
        insertResponse(Call(
            Sym("TimerComplete"),
            id,
            Call(Sym("Now"), Num(Date.now()))
        ));
    }, delayMs);
}

/**
 * Process Random effect - generate random number
 */
function processRandom(req) {
    // RandRequest[id, Min[n], Max[m]]
    const [id, min, max] = req.a;
    if (!id) return null;

    const minVal = min && isCall(min) && min.a[0] && isNum(min.a[0]) ? min.a[0].v : 0;
    const maxVal = max && isCall(max) && max.a[0] && isNum(max.a[0]) ? max.a[0].v : 1;

    const randVal = Math.random() * (maxVal - minVal) + minVal;

    // RandResponse[id, Num[value]]
    return Call(
        Sym("RandResponse"),
        id,
        Num(Math.floor(randVal))
    );
}

/**
 * Convert symbolic headers to JS object
 */
function extractHeaders(headersNode) {
    if (!headersNode || !isCall(headersNode)) return {};

    const headers = {};
    for (const pair of headersNode.a) {
        if (isCall(pair) && isSym(pair.h) && pair.h.v === "Pair" && pair.a.length === 2) {
            const key = isStr(pair.a[0]) ? pair.a[0].v : String(pair.a[0]);
            const val = isStr(pair.a[1]) ? pair.a[1].v : String(pair.a[1]);
            headers[key] = val;
        }
    }
    return headers;
}

/**
 * Convert JS value to symbolic representation
 */
function jsToSymbolic(val) {
    if (val === null || val === undefined) return Sym("null");
    if (typeof val === "number") return Num(val);
    if (typeof val === "string") return Str(val);
    if (typeof val === "boolean") return Sym(val ? "True" : "False");

    if (Array.isArray(val)) {
        return Call(Sym("List"), ...val.map(jsToSymbolic));
    }

    if (typeof val === "object") {
        const pairs = [];
        for (const [k, v] of Object.entries(val)) {
            pairs.push(Call(Sym("Pair"), Str(k), jsToSymbolic(v)));
        }
        return Call(Sym("Obj"), ...pairs);
    }

    return Sym("unknown");
}

/**
 * Convert symbolic value to JS
 */
function symbolicToJs(node) {
    if (isNum(node)) return node.v;
    if (isStr(node)) return node.v;
    if (isSym(node)) {
        if (node.v === "True") return true;
        if (node.v === "False") return false;
        if (node.v === "null") return null;
        return node.v;
    }

    if (isCall(node)) {
        if (isSym(node.h)) {
            if (node.h.v === "List") {
                return node.a.map(symbolicToJs);
            }
            if (node.h.v === "Obj") {
                const obj = {};
                for (const pair of node.a) {
                    if (isCall(pair) && pair.a.length === 2) {
                        const key = isStr(pair.a[0]) ? pair.a[0].v : String(pair.a[0]);
                        obj[key] = symbolicToJs(pair.a[1]);
                    }
                }
                return obj;
            }
        }
    }

    return node; // Return as-is if can't convert
}

/**
 * Create an effects processor that watches and handles symbolic effects
 */
export function createEffectsProcessor(getProgramFn, setProgramFn, onUpdate) {
    let processing = false;

    async function processEffects() {
        if (processing) return;
        processing = true;

        try {
            const program = getProgramFn();
            const effects = findEffects(program);
            if (!effects) return;

            const pending = extractPendingEffects(effects);

            for (const req of pending) {
                if (!isCall(req) || !isSym(req.h)) continue;

                let response = null;
                const effectType = req.h.v;

                // Process different effect types
                switch (effectType) {
                    case "HttpReq":
                        response = await processHttpReq(req);
                        break;

                    case "RandRequest":
                        response = processRandom(req);
                        break;

                    case "Timer":
                        // Timer is async, handle separately
                        // Remove from pending immediately to avoid duplicate processing
                        const timerID = req.a[0];

                        // Remove this timer from pending
                        const progWithoutTimer = clone(program);
                        const effectsNode = findEffects(progWithoutTimer);
                        if (effectsNode) {
                            const pending = effectsNode.a[0];
                            if (isCall(pending)) {
                                // Filter out this specific timer
                                pending.a = pending.a.filter(r => {
                                    if (!isCall(r) || !isSym(r.h) || r.h.v !== "Timer") return true;
                                    if (r.a[0] && deq(r.a[0], timerID)) return false;
                                    return true;
                                });
                            }
                        }
                        setProgramFn(progWithoutTimer);

                        processTimer(req, (timerResponse) => {
                            // Add the response to inbox when timer completes
                            const updatedProgram = updateEffects(getProgramFn(), timerID, timerResponse);
                            setProgramFn(updatedProgram);
                            onUpdate();
                            processEffects(); // Check for more effects
                        });
                        continue; // Don't wait for timer

                    default:
                        // Unknown effect type - skip
                        console.warn(`Unknown effect type: ${effectType}`);
                        continue;
                }

                if (response) {
                    // Update program with response
                    const updatedProgram = updateEffects(program, req.a[0], response);
                    setProgramFn(updatedProgram);
                    onUpdate();
                    break; // Process one at a time to allow rules to run
                }
            }
        } finally {
            processing = false;
        }

        // Check again after a short delay (effects might generate new effects)
        setTimeout(processEffects, 10);
    }

    // Start the processor
    processEffects();

    return {
        process: processEffects
    };
}

/**
 * Helper to generate unique IDs for effects
 */
let effectIdCounter = 0;
export function freshId() {
    return Str(`effect-${Date.now()}-${++effectIdCounter}`);
}
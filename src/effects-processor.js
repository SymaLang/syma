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
 * Helper to remove async effects from pending immediately
 */
function removeFromPending(program, effectId, effectType, setProgramFn) {
    const prog = clone(program);
    const effectsNode = findEffects(prog);
    if (!effectsNode) return;

    const pending = effectsNode.a[0];
    if (!isCall(pending)) return;

    // Filter out this specific effect
    pending.a = pending.a.filter(r => {
        if (!isCall(r) || !isSym(r.h) || r.h.v !== effectType) return true;
        if (r.a[0] && deq(r.a[0], effectId)) return false;
        return true;
    });

    setProgramFn(prog);
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
    // RandRequest[id, Min[n], Max[m]] but Min/Max are actually direct numbers
    const [id, min, max] = req.a;
    if (!id) return null;

    // The min and max come through as direct Num objects
    const minVal = min && isNum(min) ? min.v : 0;
    const maxVal = max && isNum(max) ? max.v : 1;

    // Generate integer in range [minVal, maxVal] inclusive
    const randVal = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;

    // RandResponse[id, Num[value]]
    return Call(
        Sym("RandResponse"),
        id,
        Num(randVal)
    );
}

/**
 * Process Print effect - output to console
 */
function processPrint(req) {
    // Print[id, Message[...]]
    const [id, message] = req.a;
    if (!id) return null;

    // Extract message content
    let output = "";
    if (message && isCall(message) && isSym(message.h) && message.h.v === "Message") {
        if (message.a[0]) {
            if (isStr(message.a[0])) {
                output = message.a[0].v;
            } else if (isNum(message.a[0])) {
                output = String(message.a[0].v);
            } else if (isSym(message.a[0])) {
                output = message.a[0].v;
            } else {
                // For complex structures, convert to readable format
                output = JSON.stringify(symbolicToJs(message.a[0]), null, 2);
            }
        }
    }

    // Output to console
    console.log(`[PRINT ${new Date().toISOString()}]`, output);

    // PrintComplete[id, Success]
    return Call(
        Sym("PrintComplete"),
        id,
        Sym("Success")
    );
}

/**
 * Process Storage effects - LocalStorage/SessionStorage
 */
function processStorageGet(req) {
    // StorageGet[id, Store[Local|Session], Key[str]]
    const [id, store, key] = req.a;
    if (!id || !store || !key) return null;

    const storageType = store && isCall(store) && store.a[0] && isSym(store.a[0])
        ? store.a[0].v : "Local";
    const storage = storageType === "Session" ? sessionStorage : localStorage;

    const keyStr = key && isCall(key) && key.a[0] && isStr(key.a[0])
        ? key.a[0].v : "";

    try {
        const value = storage.getItem(keyStr);
        if (value !== null) {
            // Try to parse as JSON, fall back to string
            try {
                const parsed = JSON.parse(value);
                return Call(
                    Sym("StorageGetComplete"),
                    id,
                    Call(Sym("Found"), jsToSymbolic(parsed))
                );
            } catch {
                return Call(
                    Sym("StorageGetComplete"),
                    id,
                    Call(Sym("Found"), Str(value))
                );
            }
        } else {
            return Call(
                Sym("StorageGetComplete"),
                id,
                Sym("Missing")
            );
        }
    } catch (error) {
        return Call(
            Sym("StorageGetComplete"),
            id,
            Call(Sym("Error"), Str(error.message))
        );
    }
}

function processStorageSet(req) {
    // StorageSet[id, Store[Local|Session], Key[str], Value[any]]
    const [id, store, key, value] = req.a;
    if (!id || !store || !key) return null;

    const storageType = store && isCall(store) && store.a[0] && isSym(store.a[0])
        ? store.a[0].v : "Local";
    const storage = storageType === "Session" ? sessionStorage : localStorage;

    const keyStr = key && isCall(key) && key.a[0] && isStr(key.a[0])
        ? key.a[0].v : "";

    try {
        // Extract value content
        let valueToStore = "";
        if (value && isCall(value) && value.a[0]) {
            const val = value.a[0];
            if (isStr(val) || isNum(val) || isSym(val)) {
                valueToStore = isStr(val) ? val.v : String(val.v);
            } else {
                valueToStore = JSON.stringify(symbolicToJs(val));
            }
        }

        storage.setItem(keyStr, valueToStore);

        return Call(
            Sym("StorageSetComplete"),
            id,
            Sym("Ok")
        );
    } catch (error) {
        return Call(
            Sym("StorageSetComplete"),
            id,
            Call(Sym("Error"), Str(error.message))
        );
    }
}

function processStorageDel(req) {
    // StorageDel[id, Store[Local|Session], Key[str]]
    const [id, store, key] = req.a;
    if (!id || !store || !key) return null;

    const storageType = store && isCall(store) && store.a[0] && isSym(store.a[0])
        ? store.a[0].v : "Local";
    const storage = storageType === "Session" ? sessionStorage : localStorage;

    const keyStr = key && isCall(key) && key.a[0] && isStr(key.a[0])
        ? key.a[0].v : "";

    try {
        storage.removeItem(keyStr);

        return Call(
            Sym("StorageDelComplete"),
            id,
            Sym("Ok")
        );
    } catch (error) {
        return Call(
            Sym("StorageDelComplete"),
            id,
            Call(Sym("Error"), Str(error.message))
        );
    }
}

/**
 * Process Clipboard effects
 */
async function processClipboardWrite(req) {
    // ClipboardWrite[id, Text[str]]
    const [id, text] = req.a;
    if (!id || !text) return null;

    const textStr = text && isCall(text) && text.a[0] && isStr(text.a[0])
        ? text.a[0].v : "";

    try {
        await navigator.clipboard.writeText(textStr);
        return Call(
            Sym("ClipboardWriteComplete"),
            id,
            Sym("Ok")
        );
    } catch (error) {
        return Call(
            Sym("ClipboardWriteComplete"),
            id,
            Sym("Denied")
        );
    }
}

async function processClipboardRead(req) {
    // ClipboardRead[id]
    const [id] = req.a;
    if (!id) return null;

    try {
        const text = await navigator.clipboard.readText();
        return Call(
            Sym("ClipboardReadComplete"),
            id,
            Call(Sym("Text"), Str(text))
        );
    } catch (error) {
        return Call(
            Sym("ClipboardReadComplete"),
            id,
            Sym("Denied")
        );
    }
}

/**
 * Process AnimationFrame effect
 */
function processAnimationFrame(req, insertResponse) {
    // AnimationFrame[id]
    const [id] = req.a;
    if (!id) return;

    requestAnimationFrame((timestamp) => {
        insertResponse(Call(
            Sym("AnimationFrameComplete"),
            id,
            Call(Sym("Now"), Num(timestamp))
        ));
    });
}

/**
 * WebSocket connection management
 */
const webSockets = new Map(); // id -> WebSocket instance

function processWsConnect(req, insertResponse) {
    // WsConnect[id, Url["wss://..."], Protocols[...], Headers[...]]
    const [id, url, protocols, headers] = req.a;
    if (!id || !url) return;

    const urlStr = url && isCall(url) && url.a[0] && isStr(url.a[0])
        ? url.a[0].v : "";

    try {
        const ws = new WebSocket(urlStr);
        webSockets.set(id, ws);

        ws.onopen = () => {
            insertResponse(Call(
                Sym("WsConnectComplete"),
                id,
                Sym("Opened")
            ));
        };

        ws.onmessage = (event) => {
            // Insert message as a new inbox item
            insertResponse(Call(
                Sym("WsRecv"),
                id,
                Call(Sym("Text"), Str(event.data))
            ));
        };

        ws.onerror = (error) => {
            insertResponse(Call(
                Sym("WsError"),
                id,
                Call(Sym("Error"), Str("WebSocket error"))
            ));
        };

        ws.onclose = (event) => {
            webSockets.delete(id);
            insertResponse(Call(
                Sym("WsClose"),
                id,
                Call(Sym("Closed"),
                     Call(Sym("Code"), Num(event.code)),
                     Call(Sym("Reason"), Str(event.reason || "")))
            ));
        };
    } catch (error) {
        return Call(
            Sym("WsConnectComplete"),
            id,
            Call(Sym("Error"), Str(error.message))
        );
    }
}

function processWsSend(req) {
    // WsSend[id, Text[str] | Binary[bytes]]
    const [id, data] = req.a;
    if (!id || !data) return null;

    const ws = webSockets.get(id);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Call(
            Sym("WsSendComplete"),
            id,
            Call(Sym("Error"), Str("WebSocket not open"))
        );
    }

    try {
        if (isCall(data) && isSym(data.h)) {
            if (data.h.v === "Text" && data.a[0] && isStr(data.a[0])) {
                ws.send(data.a[0].v);
            } else if (data.h.v === "Binary") {
                // For binary, we'd need to handle Uint8Array conversion
                // For now, just send as text
                ws.send(JSON.stringify(symbolicToJs(data.a[0])));
            }
        }

        return Call(
            Sym("WsSendComplete"),
            id,
            Sym("Ack")
        );
    } catch (error) {
        return Call(
            Sym("WsSendComplete"),
            id,
            Call(Sym("Error"), Str(error.message))
        );
    }
}

function processWsClose(req) {
    // WsClose[id, Code[n], Reason[str]]
    const [id, code, reason] = req.a;
    if (!id) return null;

    const ws = webSockets.get(id);
    if (!ws) {
        return Call(
            Sym("WsCloseComplete"),
            id,
            Sym("AlreadyClosed")
        );
    }

    const codeNum = code && isCall(code) && code.a[0] && isNum(code.a[0])
        ? code.a[0].v : 1000;
    const reasonStr = reason && isCall(reason) && reason.a[0] && isStr(reason.a[0])
        ? reason.a[0].v : "";

    try {
        ws.close(codeNum, reasonStr);
        webSockets.delete(id);

        return Call(
            Sym("WsCloseComplete"),
            id,
            Sym("Closed")
        );
    } catch (error) {
        return Call(
            Sym("WsCloseComplete"),
            id,
            Call(Sym("Error"), Str(error.message))
        );
    }
}

/**
 * Process Navigation effects
 */
function processNavigate(req) {
    // Navigate[id, Url[str], Replace[True|False]]
    const [id, url, replace] = req.a;
    if (!id || !url) return null;

    const urlStr = url && isCall(url) && url.a[0] && isStr(url.a[0])
        ? url.a[0].v : "";
    const shouldReplace = replace && isCall(replace) && replace.a[0] && isSym(replace.a[0])
        ? replace.a[0].v === "True" : false;

    try {
        if (shouldReplace) {
            window.history.replaceState(null, "", urlStr);
        } else {
            window.history.pushState(null, "", urlStr);
        }

        return Call(
            Sym("NavigateComplete"),
            id,
            Sym("Ok")
        );
    } catch (error) {
        return Call(
            Sym("NavigateComplete"),
            id,
            Call(Sym("Error"), Str(error.message))
        );
    }
}

function processReadLocation(req) {
    // ReadLocation[id]
    const [id] = req.a;
    if (!id) return null;

    try {
        const location = window.location;
        return Call(
            Sym("ReadLocationComplete"),
            id,
            Call(Sym("Location"),
                Call(Sym("Path"), Str(location.pathname)),
                Call(Sym("Query"), Str(location.search)),
                Call(Sym("Hash"), Str(location.hash))
            )
        );
    } catch (error) {
        return Call(
            Sym("ReadLocationComplete"),
            id,
            Call(Sym("Error"), Str(error.message))
        );
    }
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

                    case "Print":
                        response = processPrint(req);
                        break;

                    // Storage effects
                    case "StorageGet":
                        response = processStorageGet(req);
                        break;

                    case "StorageSet":
                        response = processStorageSet(req);
                        break;

                    case "StorageDel":
                        response = processStorageDel(req);
                        break;

                    // Clipboard effects
                    case "ClipboardWrite":
                        response = await processClipboardWrite(req);
                        break;

                    case "ClipboardRead":
                        response = await processClipboardRead(req);
                        break;

                    // Navigation effects
                    case "Navigate":
                        response = processNavigate(req);
                        break;

                    case "ReadLocation":
                        response = processReadLocation(req);
                        break;

                    // WebSocket effects (async)
                    case "WsConnect":
                        const wsId = req.a[0];
                        removeFromPending(program, wsId, "WsConnect", setProgramFn);
                        processWsConnect(req, (wsResponse) => {
                            const updatedProgram = updateEffects(getProgramFn(), wsId, wsResponse);
                            setProgramFn(updatedProgram);
                            onUpdate();
                            processEffects();
                        });
                        continue;

                    case "WsSend":
                        response = processWsSend(req);
                        break;

                    case "WsClose":
                        response = processWsClose(req);
                        break;

                    // Timer effect (async)
                    case "Timer":
                        const timerID = req.a[0];
                        removeFromPending(program, timerID, "Timer", setProgramFn);
                        processTimer(req, (timerResponse) => {
                            const updatedProgram = updateEffects(getProgramFn(), timerID, timerResponse);
                            setProgramFn(updatedProgram);
                            onUpdate();
                            processEffects();
                        });
                        continue;

                    // AnimationFrame effect (async)
                    case "AnimationFrame":
                        const frameId = req.a[0];
                        removeFromPending(program, frameId, "AnimationFrame", setProgramFn);
                        processAnimationFrame(req, (frameResponse) => {
                            const updatedProgram = updateEffects(getProgramFn(), frameId, frameResponse);
                            setProgramFn(updatedProgram);
                            onUpdate();
                            processEffects();
                        });
                        continue;

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
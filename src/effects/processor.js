/*****************************************************************
 * Platform-Agnostic Effects Processor
 *
 * A minimal bridge between symbolic effect terms and real I/O.
 * Delegates actual I/O operations to the platform adapter.
 ******************************************************************/

import { K, Sym, Num, Str, Call, isSym, isNum, isStr, isCall, clone, deq } from '../ast-helpers.js';
import { getPlatform } from '../platform/index.js';

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
 * Convert JS value to symbolic representation
 */
export function jsToSymbolic(val) {
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
export function symbolicToJs(node) {
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
 * Process effects using platform-specific handlers
 */
export class EffectsProcessor {
    constructor(platform, getProgramFn, setProgramFn, onUpdate) {
        this.platform = platform;
        this.getProgramFn = getProgramFn;
        this.setProgramFn = setProgramFn;
        this.onUpdate = onUpdate;
        this.processing = false;
        this.webSocketHandlers = new Map();
        this.activeIOOperations = new Set(); // Track active I/O operations
        this.activeTimers = new Set(); // Track active timers
    }

    /**
     * Check if there are active I/O operations
     */
    hasActiveIO() {
        return this.activeIOOperations.size > 0;
    }

    /**
     * Check if there are active timers
     */
    hasActiveTimers() {
        return this.activeTimers.size > 0;
    }

    /**
     * Process HttpReq effect
     */
    async processHttpReq(req) {
        // HttpReq[id, Method["GET"|"POST"], Url["/api/..."], Body[...], Headers[...]]
        const [id, method, url, body, headers] = req.a;

        if (!id) throw new Error("HttpReq missing id");

        // Extract values
        const methodStr = method && isCall(method) && method.a[0] && isStr(method.a[0])
            ? method.a[0].v : "GET";
        const urlStr = url && isCall(url) && url.a[0] && isStr(url.a[0])
            ? url.a[0].v : "/";

        // Build request options
        const options = {
            method: methodStr,
        };

        // Add body if present and not GET
        if (body && methodStr !== "GET") {
            const bodyContent = body.a[0];
            if (bodyContent) {
                options.body = symbolicToJs(bodyContent);
            }
        }

        // Extract headers
        if (headers && isCall(headers)) {
            options.headers = {};
            for (const pair of headers.a) {
                if (isCall(pair) && isSym(pair.h) && pair.h.v === "Pair" && pair.a.length === 2) {
                    const key = isStr(pair.a[0]) ? pair.a[0].v : String(pair.a[0]);
                    const val = isStr(pair.a[1]) ? pair.a[1].v : String(pair.a[1]);
                    options.headers[key] = val;
                }
            }
        }

        try {
            const response = await this.platform.httpRequest(urlStr, options);

            // Build HttpRes[id, Status[code], Json[data], Headers[...]]
            return Call(
                Sym("HttpRes"),
                id,
                Call(Sym("Status"), Num(response.status)),
                Call(Sym("Json"), jsToSymbolic(response.data)),
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
     * Process Timer effect
     */
    processTimer(req, insertResponse) {
        // Timer[id, Delay[ms]]
        const [id, delay] = req.a;
        if (!id || !delay) return;

        const delayMs = delay && isCall(delay) && delay.a[0] && isNum(delay.a[0])
            ? delay.a[0].v : 0;

        const timerId = `timer-${id.v || id}`;
        this.activeTimers.add(timerId);

        this.platform.setTimeout(() => {
            this.activeTimers.delete(timerId);
            // Insert TimerComplete[id, Now[timestamp]]
            insertResponse(Call(
                Sym("TimerComplete"),
                id,
                Call(Sym("Now"), Num(Date.now()))
            ));
        }, delayMs);
    }

    /**
     * Process Random effect
     */
    processRandom(req) {
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
     * Process Print effect
     */
    processPrint(req) {
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

        // Output directly using platform print
        this.platform.print(output);

        // PrintComplete[id, Success]
        return Call(
            Sym("PrintComplete"),
            id,
            Sym("Success")
        );
    }

    /**
     * Process Storage effects
     */
    async processStorageGet(req) {
        // StorageGet[id, Store[Local|Session], Key[str]]
        const [id, store, key] = req.a;
        if (!id || !key) return null;

        const keyStr = key && isCall(key) && key.a[0] && isStr(key.a[0])
            ? key.a[0].v : "";

        try {
            const value = await this.platform.getStorage(keyStr);
            if (value !== undefined && value !== null) {
                return Call(
                    Sym("StorageGetComplete"),
                    id,
                    Call(Sym("Found"), jsToSymbolic(value))
                );
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

    async processStorageSet(req) {
        // StorageSet[id, Store[Local|Session], Key[str], Value[any]]
        const [id, store, key, value] = req.a;
        if (!id || !key) return null;

        const keyStr = key && isCall(key) && key.a[0] && isStr(key.a[0])
            ? key.a[0].v : "";

        try {
            // Extract value content
            let valueToStore = null;
            if (value && isCall(value) && value.a[0]) {
                valueToStore = symbolicToJs(value.a[0]);
            }

            await this.platform.setStorage(keyStr, valueToStore);

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

    async processStorageDel(req) {
        // StorageDel[id, Store[Local|Session], Key[str]]
        const [id, store, key] = req.a;
        if (!id || !key) return null;

        const keyStr = key && isCall(key) && key.a[0] && isStr(key.a[0])
            ? key.a[0].v : "";

        try {
            await this.platform.deleteStorage(keyStr);

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
    async processClipboardWrite(req) {
        // ClipboardWrite[id, Text[str]]
        const [id, text] = req.a;
        if (!id || !text) return null;

        const textStr = text && isCall(text) && text.a[0] && isStr(text.a[0])
            ? text.a[0].v : "";

        try {
            await this.platform.clipboardWrite(textStr);
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

    async processClipboardRead(req) {
        // ClipboardRead[id]
        const [id] = req.a;
        if (!id) return null;

        try {
            const text = await this.platform.clipboardRead();
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
    processAnimationFrame(req, insertResponse) {
        // AnimationFrame[id]
        const [id] = req.a;
        if (!id) return;

        const frameId = `frame-${id.v || id}`;
        this.activeTimers.add(frameId);

        this.platform.requestAnimationFrame((timestamp) => {
            this.activeTimers.delete(frameId);
            insertResponse(Call(
                Sym("AnimationFrameComplete"),
                id,
                Call(Sym("Now"), Num(timestamp || Date.now()))
            ));
        });
    }

    /**
     * Process WebSocket effects
     */
    processWsConnect(req, insertResponse) {
        // WsConnect[id, Url["wss://..."], Protocols[...], Headers[...]]
        const [id, url] = req.a;
        if (!id || !url) return;

        const urlStr = url && isCall(url) && url.a[0] && isStr(url.a[0])
            ? url.a[0].v : "";

        try {
            const ws = this.platform.createWebSocket(urlStr);
            this.webSocketHandlers.set(id, ws);

            ws.onOpen(() => {
                insertResponse(Call(
                    Sym("WsConnectComplete"),
                    id,
                    Sym("Opened")
                ));
            });

            ws.onMessage((event) => {
                insertResponse(Call(
                    Sym("WsRecv"),
                    id,
                    Call(Sym("Text"), Str(event.data))
                ));
            });

            ws.onError((error) => {
                insertResponse(Call(
                    Sym("WsError"),
                    id,
                    Call(Sym("Error"), Str("WebSocket error"))
                ));
            });

            ws.onClose((event) => {
                this.webSocketHandlers.delete(id);
                insertResponse(Call(
                    Sym("WsClose"),
                    id,
                    Call(Sym("Closed"),
                         Call(Sym("Code"), Num(event.code || 1000)),
                         Call(Sym("Reason"), Str(event.reason || "")))
                ));
            });
        } catch (error) {
            return Call(
                Sym("WsConnectComplete"),
                id,
                Call(Sym("Error"), Str(error.message))
            );
        }
    }

    processWsSend(req) {
        // WsSend[id, Text[str] | Binary[bytes]]
        const [id, data] = req.a;
        if (!id || !data) return null;

        const ws = this.webSocketHandlers.get(id);
        if (!ws || ws.readyState() !== 1) { // 1 = OPEN
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
                    // For binary, convert to appropriate format
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

    processWsClose(req) {
        // WsClose[id, Code[n], Reason[str]]
        const [id, code, reason] = req.a;
        if (!id) return null;

        const ws = this.webSocketHandlers.get(id);
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
            this.webSocketHandlers.delete(id);

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
     * Process ReadLine effect
     */
    async processReadLine(req) {
        // ReadLine[id]
        const [id] = req.a;
        if (!id) return null;

        const ioId = `readline-${id.v || id}`;
        this.activeIOOperations.add(ioId);

        try {
            // Pass skipHistory=true to prevent effect input from being saved to REPL history
            const input = await this.platform.readLine('', true);
            this.activeIOOperations.delete(ioId);
            return Call(
                Sym("ReadLineComplete"),
                id,
                Call(Sym("Text"), Str(input || ""))
            );
        } catch (error) {
            this.activeIOOperations.delete(ioId);
            return Call(
                Sym("ReadLineComplete"),
                id,
                Call(Sym("Error"), Str(error.message))
            );
        }
    }

    /**
     * Process GetChar effect
     */
    async processGetChar(req) {
        // GetChar[id]
        const [id] = req.a;
        if (!id) return null;

        const ioId = `getchar-${id.v || id}`;
        this.activeIOOperations.add(ioId);

        try {
            const char = await this.platform.getChar();
            this.activeIOOperations.delete(ioId);
            return Call(
                Sym("GetCharComplete"),
                id,
                Call(Sym("Char"), Str(char || ""))
            );
        } catch (error) {
            this.activeIOOperations.delete(ioId);
            return Call(
                Sym("GetCharComplete"),
                id,
                Call(Sym("Error"), Str(error.message))
            );
        }
    }

    /**
     * Process Navigation effects
     */
    processNavigate(req) {
        // Navigate[id, Url[str], Replace[True|False]]
        const [id, url, replace] = req.a;
        if (!id || !url) return null;

        const urlStr = url && isCall(url) && url.a[0] && isStr(url.a[0])
            ? url.a[0].v : "";
        const shouldReplace = replace && isCall(replace) && replace.a[0] && isSym(replace.a[0])
            ? replace.a[0].v === "True" : false;

        try {
            this.platform.navigateTo(urlStr, shouldReplace);

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

    processReadLocation(req) {
        // ReadLocation[id]
        const [id] = req.a;
        if (!id) return null;

        try {
            const location = this.platform.getCurrentLocation();
            return Call(
                Sym("ReadLocationComplete"),
                id,
                Call(Sym("Location"),
                    Call(Sym("Path"), Str(location.path)),
                    Call(Sym("Query"), Str(location.query)),
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
     * Process REPL-specific effects
     */
    async processFileRead(req) {
        // FileRead[id, Path[str]]
        const [id, pathNode] = req.a;
        if (!id || !pathNode) return null;

        const path = pathNode && isCall(pathNode) && pathNode.a[0] && isStr(pathNode.a[0])
            ? pathNode.a[0].v : "";

        try {
            const content = await this.platform.readFile(path);
            return Call(
                Sym("FileReadComplete"),
                id,
                Call(Sym("Content"), Str(content))
            );
        } catch (error) {
            return Call(
                Sym("FileReadComplete"),
                id,
                Call(Sym("Error"), Str(error.message))
            );
        }
    }

    async processFileWrite(req) {
        // FileWrite[id, Path[str], Content[str]]
        const [id, pathNode, contentNode] = req.a;
        if (!id || !pathNode || !contentNode) return null;

        const path = pathNode && isCall(pathNode) && pathNode.a[0] && isStr(pathNode.a[0])
            ? pathNode.a[0].v : "";
        const content = contentNode && isCall(contentNode) && contentNode.a[0] && isStr(contentNode.a[0])
            ? contentNode.a[0].v : "";

        try {
            await this.platform.writeFile(path, content);
            return Call(
                Sym("FileWriteComplete"),
                id,
                Sym("Ok")
            );
        } catch (error) {
            return Call(
                Sym("FileWriteComplete"),
                id,
                Call(Sym("Error"), Str(error.message))
            );
        }
    }

    async processExec(req) {
        // Exec[id, Command[str]]
        const [id, cmdNode] = req.a;
        if (!id || !cmdNode) return null;

        const command = cmdNode && isCall(cmdNode) && cmdNode.a[0] && isStr(cmdNode.a[0])
            ? cmdNode.a[0].v : "";

        try {
            const result = await this.platform.exec(command);
            return Call(
                Sym("ExecComplete"),
                id,
                Call(Sym("Output"), Str(result.stdout)),
                Call(Sym("Error"), Str(result.stderr)),
                Call(Sym("Code"), Num(result.exitCode))
            );
        } catch (error) {
            return Call(
                Sym("ExecComplete"),
                id,
                Call(Sym("Output"), Str("")),
                Call(Sym("Error"), Str(error.message)),
                Call(Sym("Code"), Num(1))
            );
        }
    }

    processExit(req) {
        // Exit[code]
        const [code] = req.a;
        const exitCode = code && isNum(code) ? code.v : 0;
        this.platform.exit(exitCode);
        // Note: The Exit effect is manually removed from Pending in the main processing loop
        // since it doesn't follow the standard ID-based removal pattern
    }

    /**
     * Main processing loop
     */
    async processEffects() {
        if (this.processing) return;
        this.processing = true;

        try {
            const program = this.getProgramFn();
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
                        response = await this.processHttpReq(req);
                        break;

                    case "RandRequest":
                        response = this.processRandom(req);
                        break;

                    case "Print":
                        response = this.processPrint(req);
                        break;

                    // Storage effects
                    case "StorageGet":
                        response = await this.processStorageGet(req);
                        break;

                    case "StorageSet":
                        response = await this.processStorageSet(req);
                        break;

                    case "StorageDel":
                        response = await this.processStorageDel(req);
                        break;

                    // Clipboard effects
                    case "ClipboardWrite":
                        response = await this.processClipboardWrite(req);
                        break;

                    case "ClipboardRead":
                        response = await this.processClipboardRead(req);
                        break;

                    // Console I/O effects
                    case "ReadLine":
                        response = await this.processReadLine(req);
                        break;

                    case "GetChar":
                        response = await this.processGetChar(req);
                        break;

                    // Navigation effects
                    case "Navigate":
                        response = this.processNavigate(req);
                        break;

                    case "ReadLocation":
                        response = this.processReadLocation(req);
                        break;

                    // REPL-specific effects
                    case "FileRead":
                        response = await this.processFileRead(req);
                        break;

                    case "FileWrite":
                        response = await this.processFileWrite(req);
                        break;

                    case "Exec":
                        response = await this.processExec(req);
                        break;

                    case "Exit":
                        // Exit effect doesn't have an ID, so we need to handle it specially
                        this.processExit(req);
                        // Manually remove the Exit effect from pending since it doesn't have a standard ID
                        const updatedProgramForExit = clone(program);
                        const effectsForExit = findEffects(updatedProgramForExit);
                        if (effectsForExit && effectsForExit.a[0] && isCall(effectsForExit.a[0])) {
                            const pendingForExit = effectsForExit.a[0];
                            // Remove this specific Exit effect
                            pendingForExit.a = pendingForExit.a.filter(r => {
                                if (!isCall(r) || !isSym(r.h) || r.h.v !== "Exit") return true;
                                // Check if it's the same exit code
                                return !deq(r.a[0], req.a[0]);
                            });
                        }
                        this.setProgramFn(updatedProgramForExit);
                        this.onUpdate();
                        break; // Process one at a time

                    // Async effects (WebSocket, Timer, AnimationFrame)
                    case "WsConnect":
                        const wsId = req.a[0];
                        removeFromPending(program, wsId, "WsConnect", this.setProgramFn);
                        this.processWsConnect(req, (wsResponse) => {
                            const updatedProgram = updateEffects(this.getProgramFn(), wsId, wsResponse);
                            this.setProgramFn(updatedProgram);
                            this.onUpdate();
                            this.processEffects();
                        });
                        continue;

                    case "WsSend":
                        response = this.processWsSend(req);
                        break;

                    case "WsClose":
                        response = this.processWsClose(req);
                        break;

                    case "Timer":
                        const timerID = req.a[0];
                        removeFromPending(program, timerID, "Timer", this.setProgramFn);
                        this.processTimer(req, (timerResponse) => {
                            const updatedProgram = updateEffects(this.getProgramFn(), timerID, timerResponse);
                            this.setProgramFn(updatedProgram);
                            this.onUpdate();
                            this.processEffects();
                        });
                        continue;

                    case "AnimationFrame":
                        const frameId = req.a[0];
                        removeFromPending(program, frameId, "AnimationFrame", this.setProgramFn);
                        this.processAnimationFrame(req, (frameResponse) => {
                            const updatedProgram = updateEffects(this.getProgramFn(), frameId, frameResponse);
                            this.setProgramFn(updatedProgram);
                            this.onUpdate();
                            this.processEffects();
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
                    this.setProgramFn(updatedProgram);
                    this.onUpdate();
                    break; // Process one at a time to allow rules to run
                }
            }
        } finally {
            this.processing = false;
        }

        // Check again after a short delay (effects might generate new effects)
        this.platform.setTimeout(() => this.processEffects(), 10);
    }

    /**
     * Start the processor
     */
    start() {
        this.processEffects();
    }

    /**
     * Clean up resources
     */
    cleanup() {
        // Close all WebSockets
        for (const [id, ws] of this.webSocketHandlers) {
            if (ws.readyState() === 1) { // OPEN
                ws.close();
            }
        }
        this.webSocketHandlers.clear();
    }
}

/**
 * Helper to generate unique IDs for effects
 */
let effectIdCounter = 0;
export function freshId() {
    return Str(`effect-${Date.now()}-${++effectIdCounter}`);
}

/**
 * Create an effects processor instance
 */
export function createEffectsProcessor(platform, getProgramFn, setProgramFn, onUpdate) {
    const processor = new EffectsProcessor(platform, getProgramFn, setProgramFn, onUpdate);
    processor.start();
    return processor;
}
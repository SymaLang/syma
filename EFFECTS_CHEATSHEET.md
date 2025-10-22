# Syma Effects Cheat Sheet

This document provides a quick reference for all available effect operations in the Syma language runtime.

## HTTP Requests

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{HttpReq id {Method "GET"} {Url "/api/data"} {Body} {Headers}}` | `{HttpRes id {Status 200} {Json data} {Headers}}` | `{HttpRes id {Status 0} {Error "message"} {Headers}}` |

**Notes:**
- Method defaults to "GET" if omitted
- Body is ignored for GET requests
- Headers format: `{Headers {Pair "key" "value"} ...}`
- Status 0 indicates network failure

## Timers & Animation

| Request | Response | Notes |
|---------|----------|-------|
| `{Timer id {Delay 1000}}` | `{TimerComplete id {Now timestamp}}` | Delay in milliseconds |
| `{AnimationFrame id}` | `{AnimationFrameComplete id {Now timestamp}}` | Browser requestAnimationFrame |

**Notes:**
- Both removed from Pending immediately upon scheduling
- Responses arrive asynchronously in Inbox

## Random Numbers

| Request | Response | Notes |
|---------|----------|-------|
| `{RandRequest id min max}` | `{RandResponse id value}` | Random integer in [min, max] inclusive |

## Console I/O

### Output

| Request | Response | Notes |
|---------|----------|-------|
| `{Print id {Message content}}` | `{PrintComplete id Success}` | Outputs to console/stdout immediately |

### Input (Node.js/REPL)

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{ReadLine id}` | `{ReadLineComplete id {Text "user input"}}` | `{ReadLineComplete id {Error "message"}}` |
| `{GetChar id}` | `{GetCharComplete id {Char "a"}}` | `{GetCharComplete id {Error "message"}}` |

**Notes:**
- Blocking in Node.js, async in browser
- ReadLine reads entire line, GetChar reads single character

## Storage Operations

### Get

| Request | Response (Found) | Response (Not Found) | Response (Error) |
|---------|-----------------|---------------------|------------------|
| `{StorageGet id {Store Local} {Key "key"}}` | `{StorageGetComplete id {Found value}}` | `{StorageGetComplete id Missing}` | `{StorageGetComplete id {Error "msg"}}` |

### Set

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{StorageSet id {Store Local} {Key "key"} {Value data}}` | `{StorageSetComplete id Ok}` | `{StorageSetComplete id {Error "msg"}}` |

### Delete

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{StorageDel id {Store Local} {Key "key"}}` | `{StorageDelComplete id Ok}` | `{StorageDelComplete id {Error "msg"}}` |

**Notes:**
- Store can be `Local` or `Session`
- Browser uses localStorage/sessionStorage
- Node.js uses in-memory map

## Clipboard Operations

### Write

| Request | Response (Success) | Response (Denied) |
|---------|-------------------|-------------------|
| `{ClipboardWrite id {Text "content"}}` | `{ClipboardWriteComplete id Ok}` | `{ClipboardWriteComplete id Denied}` |

### Read

| Request | Response (Success) | Response (Denied) |
|---------|-------------------|-------------------|
| `{ClipboardRead id}` | `{ClipboardReadComplete id {Text "content"}}` | `{ClipboardReadComplete id Denied}` |

## WebSocket Operations

### Connect

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{WsConnect id {Url "wss://example.com"}}` | `{WsConnectComplete id Opened}` | `{WsConnectComplete id {Error "msg"}}` |

### Send

| Request (Text) | Request (Binary) | Response (Success) | Response (Error) |
|---------------|------------------|-------------------|------------------|
| `{WsSend id {Text "msg"}}` | `{WsSend id {Binary data}}` | `{WsSendComplete id Ack}` | `{WsSendComplete id {Error "msg"}}` |

### Close

| Request | Response (Success) | Response (Already Closed) |
|---------|-------------------|---------------------------|
| `{WsClose id {Code 1000} {Reason "reason"}}` | `{WsCloseComplete id Closed}` | `{WsCloseComplete id AlreadyClosed}` |

### Incoming Events

| Event Type | Format |
|------------|--------|
| Message Received | `{WsRecv id {Text "message"}}` |
| Error Occurred | `{WsError id {Error "message"}}` |
| Connection Closed | `{WsClose id {Closed {Code 1006} {Reason "reason"}}}` |

**Notes:**
- WsConnect removed from Pending immediately
- Incoming messages appear asynchronously in Inbox

## Navigation (Browser)

### Navigate

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{Navigate id {Url "/path"} {Replace False}}` | `{NavigateComplete id Ok}` | `{NavigateComplete id {Error "msg"}}` |

**Notes:**
- Replace: True to replace history entry, False to push new entry

### Read Location

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{ReadLocation id}` | `{ReadLocationComplete id {Location {Path "/path"} {Query "?q=1"} {Hash "#section"}}}` | `{ReadLocationComplete id {Error "msg"}}` |

## File Operations (Node.js/REPL only)

### Read File

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{FileRead id {Path "file.txt"}}` | `{FileReadComplete id {Content "data"}}` | `{FileReadComplete id {Error "msg"}}` |

### Write File

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{FileWrite id {Path "file.txt"} {Content "data"}}` | `{FileWriteComplete id Ok}` | `{FileWriteComplete id {Error "msg"}}` |

### Read Syma File

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{ReadSymaFile id {Path "file.syma"}}` | `{ReadSymaFileComplete id {Frozen expression}}` | `{ReadSymaFileComplete id {Error "msg"}}` |

**Notes:**
- Reads and parses Syma source code into AST
- Result is wrapped in `{Frozen ...}` to prevent eval-on-read (code-as-data)
- Extract from Frozen and normalize explicitly to evaluate the loaded code
- Available in Node.js and REPL only
- Browser returns error response (not supported)

### Write Syma File

| Request | Response (Success) | Response (Error) |
|---------|-------------------|------------------|
| `{WriteSymaFile id {Path "file.syma"} {Ast expr} {Pretty True}}` | `{WriteSymaFileComplete id Ok}` | `{WriteSymaFileComplete id {Error "msg"}}` |

**Notes:**
- Serializes Syma AST to source code
- `{Pretty True}` for formatted output, `{Pretty False}` for compact
- Available in Node.js and REPL only
- Browser returns error response (not supported)

## Process Execution (Node.js/REPL only)

| Request | Response |
|---------|----------|
| `{Exec id {Command "ls -la"}}` | `{ExecComplete id {Output "stdout"} {Error "stderr"} {Code 0}}` |

**Notes:**
- Output: standard output
- Error: standard error
- Code: process exit code

## Process Exit (Terminal)

| Request | Notes |
|---------|-------|
| `{Exit 0}` | Terminates process immediately (no response) |

## Effect Processing Behavior

### Synchronous Effects
Processed immediately and removed from Pending atomically:
- `RandRequest`
- `Print`
- `StorageGet/Set/Del`
- `ClipboardWrite/Read`
- `Navigate/ReadLocation`
- `FileRead/Write`
- `Exec`
- `Exit`
- `WsSend/WsClose` (for connected sockets)

### Asynchronous Effects
Removed from Pending immediately upon scheduling, responses arrive later:
- `Timer`
- `AnimationFrame`
- `WsConnect`
- `HttpReq`
- `ReadLine/GetChar` (async in browser, blocking in Node.js)

## Platform Availability

| Effect | Browser | Node.js | REPL |
|--------|---------|---------|------|
| HttpReq | ✓ | ✓ | ✓ |
| Timer | ✓ | ✓ | ✓ |
| AnimationFrame | ✓ | ✗ | ✗ |
| RandRequest | ✓ | ✓ | ✓ |
| Print | ✓ | ✓ | ✓ |
| ReadLine/GetChar | ✓* | ✓ | ✓ |
| Storage | ✓ | ✓** | ✓** |
| Clipboard | ✓ | ✗ | ✗ |
| WebSocket | ✓ | ✓ | ✓ |
| Navigate/ReadLocation | ✓ | ✗ | ✗ |
| FileRead/Write | ✗ | ✓ | ✓ |
| ReadSymaFile/WriteSymaFile | ✗ | ✓ | ✓ |
| Exec | ✗ | ✓ | ✓ |
| Exit | ✗ | ✓ | ✓ |

\* Async in browser
\*\* In-memory storage only

## Best Practices

1. **Use FreshId**: Always generate unique IDs with `{FreshId}` primitive
2. **Handle All Responses**: Rules should handle both success and error cases
3. **Clean Up Resources**: Close WebSockets when done, cancel unnecessary timers
4. **Process Inbox Promptly**: Remove processed responses to prevent memory growth
5. **Check Platform**: Use platform-appropriate effects
6. **Batch Effects**: Multiple effects can be queued in Pending simultaneously

## Example: Complete Effect Flow

```lisp
; 1. Generate effect request
{R "RequestData"
   {Apply FetchData {Program app_ effects_}}
   {Program app_
     {Effects
       {Pending {HttpReq {FreshId} {Method "GET"} {Url "/api/data"} {Body} {Headers}}}
       {Inbox}}}}

; 2. Handle success response
{R "HandleSuccess"
   {Program app_ {Effects pending_ {Inbox {HttpRes id_ {Status 200} {Json data_} headers_} rest..}}}
   {Program
     {Apply {DataReceived data_} app_}
     {Effects pending_ {Inbox rest..}}}}

; 3. Handle error response
{R "HandleError"
   {Program app_ {Effects pending_ {Inbox {HttpRes id_ {Status 0} {Error msg_} headers_} rest..}}}
   {Program
     {Apply {NetworkError msg_} app_}
     {Effects pending_ {Inbox rest..}}}}
```

## Data Type Conversions

### JavaScript → Symbolic

| JavaScript | Symbolic |
|------------|----------|
| `null`, `undefined` | `Sym("null")` |
| `number` | `Num(value)` |
| `string` | `Str(value)` |
| `true` | `Sym("True")` |
| `false` | `Sym("False")` |
| `Array` | `{List item1 item2 ...}` |
| `Object` | `{Obj {Pair "key1" val1} {Pair "key2" val2} ...}` |

### Symbolic → JavaScript

| Symbolic | JavaScript |
|----------|------------|
| `Num(n)` | `number` |
| `Str(s)` | `string` |
| `Sym("True")` | `true` |
| `Sym("False")` | `false` |
| `Sym("null")` | `null` |
| `{List ...}` | `Array` |
| `{Obj ...}` | `Object` |

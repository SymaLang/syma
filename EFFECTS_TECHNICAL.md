# Syma Effects System Technical Reference

## Overview

The Syma effects system provides a purely symbolic interface for I/O operations. Effects are processed through a request/response cycle:

1. **Request Phase**: Effect terms are placed in `Pending` within the `Effects` node
2. **Processing Phase**: The runtime processor extracts and executes the effect
3. **Response Phase**: Results are placed in `Inbox` for consumption by rules

## Effect Request/Response Specifications

### 1. HTTP Requests

#### Request Structure (Pending)
```lisp
{HttpReq id {Method "GET"|"POST"|...} {Url "/api/endpoint"} {Body data} {Headers ...}}
```

**Fields:**
- `id`: Unique identifier (required)
- `Method`: HTTP method wrapped in `{Method "..."}` (defaults to "GET")
- `Url`: Endpoint URL wrapped in `{Url "..."}`
- `Body`: Request body wrapped in `{Body ...}` (ignored for GET)
- `Headers`: Header pairs as `{Headers {Pair "key" "value"} ...}`

#### Response Structure (Inbox)
```lisp
; Success:
{HttpRes id {Status 200} {Json result} {Headers ...}}

; Network Error:
{HttpRes id {Status 0} {Error "message"} {Headers}}
```

**Response Fields:**
- `Status`: HTTP status code (0 indicates network failure)
- `Json`: Response data converted to symbolic form
- `Error`: Error message for failures
- `Headers`: Response headers (currently empty)

---

### 2. Timers

#### Request Structure (Pending)
```lisp
{Timer id {Delay milliseconds}}
```

**Fields:**
- `id`: Unique identifier
- `Delay`: Delay in milliseconds wrapped in `{Delay n}`

#### Response Structure (Inbox)
```lisp
{TimerComplete id {Now timestamp}}
```

**Response Fields:**
- `Now`: Unix timestamp when timer completed

**Note**: Timer is removed from Pending immediately upon scheduling.

---

### 3. Animation Frames

#### Request Structure (Pending)
```lisp
{AnimationFrame id}
```

**Fields:**
- `id`: Unique identifier

#### Response Structure (Inbox)
```lisp
{AnimationFrameComplete id {Now timestamp}}
```

**Response Fields:**
- `Now`: High-resolution timestamp from requestAnimationFrame

**Note**: Removed from Pending immediately upon scheduling.

---

### 4. Random Numbers

#### Request Structure (Pending)
```lisp
{RandRequest id min max}
```

**Fields:**
- `id`: Unique identifier
- `min`: Minimum value (direct number, not wrapped)
- `max`: Maximum value (direct number, not wrapped)

#### Response Structure (Inbox)
```lisp
{RandResponse id value}
```

**Response Fields:**
- `value`: Random integer in range [min, max] inclusive

---

### 5. Console Output

#### Request Structure (Pending)
```lisp
{Print id {Message content}}
```

**Fields:**
- `id`: Unique identifier
- `Message`: Content to print wrapped in `{Message ...}`

#### Response Structure (Inbox)
```lisp
{PrintComplete id Success}
```

**Response Fields:**
- Always returns `Success` symbol

**Note**: Outputs to platform console/stdout immediately.

---

### 6. Storage Operations

#### Get Request (Pending)
```lisp
{StorageGet id {Store Local|Session} {Key "keyname"}}
```

#### Get Response (Inbox)
```lisp
; Value found:
{StorageGetComplete id {Found value}}

; Key not found:
{StorageGetComplete id Missing}

; Error:
{StorageGetComplete id {Error "message"}}
```

#### Set Request (Pending)
```lisp
{StorageSet id {Store Local|Session} {Key "keyname"} {Value data}}
```

#### Set Response (Inbox)
```lisp
; Success:
{StorageSetComplete id Ok}

; Error:
{StorageSetComplete id {Error "message"}}
```

#### Delete Request (Pending)
```lisp
{StorageDel id {Store Local|Session} {Key "keyname"}}
```

#### Delete Response (Inbox)
```lisp
; Success:
{StorageDelComplete id Ok}

; Error:
{StorageDelComplete id {Error "message"}}
```

**Fields:**
- `Store`: Storage type (Local or Session) - currently not differentiated
- `Key`: Storage key wrapped in `{Key "..."}`
- `Value`: Data to store wrapped in `{Value ...}`

---

### 7. Clipboard Operations

#### Write Request (Pending)
```lisp
{ClipboardWrite id {Text "content"}}
```

#### Write Response (Inbox)
```lisp
; Success:
{ClipboardWriteComplete id Ok}

; Permission denied:
{ClipboardWriteComplete id Denied}
```

#### Read Request (Pending)
```lisp
{ClipboardRead id}
```

#### Read Response (Inbox)
```lisp
; Success:
{ClipboardReadComplete id {Text "content"}}

; Permission denied:
{ClipboardReadComplete id Denied}
```

---

### 8. WebSocket Operations

#### Connect Request (Pending)
```lisp
{WsConnect id {Url "wss://example.com/socket"}}
```

#### Connect Response (Inbox)
```lisp
; Success:
{WsConnectComplete id Opened}

; Error:
{WsConnectComplete id {Error "message"}}
```

#### Send Request (Pending)
```lisp
; Text message:
{WsSend id {Text "message"}}

; Binary data:
{WsSend id {Binary data}}
```

#### Send Response (Inbox)
```lisp
; Success:
{WsSendComplete id Ack}

; Error (not connected):
{WsSendComplete id {Error "WebSocket not open"}}
```

#### Close Request (Pending)
```lisp
{WsClose id {Code 1000} {Reason "Normal closure"}}
```

#### Close Response (Inbox)
```lisp
; Success:
{WsCloseComplete id Closed}

; Already closed:
{WsCloseComplete id AlreadyClosed}
```

#### Incoming Messages (Inbox)
```lisp
; Text message received:
{WsRecv id {Text "message"}}

; Error event:
{WsError id {Error "WebSocket error"}}

; Connection closed:
{WsClose id {Closed {Code 1006} {Reason "Abnormal closure"}}}
```

**Note**: WsConnect is removed from Pending immediately. Incoming messages appear asynchronously in Inbox.

---

### 9. Console Input

#### ReadLine Request (Pending)
```lisp
{ReadLine id}
```

#### ReadLine Response (Inbox)
```lisp
; Success:
{ReadLineComplete id {Text "user input"}}

; Error:
{ReadLineComplete id {Error "message"}}
```

#### GetChar Request (Pending)
```lisp
{GetChar id}
```

#### GetChar Response (Inbox)
```lisp
; Success:
{GetCharComplete id {Char "a"}}

; Error:
{GetCharComplete id {Error "message"}}
```

**Note**: These operations block in Node.js but are async in browser.

---

### 10. Navigation

#### Navigate Request (Pending)
```lisp
{Navigate id {Url "/path"} {Replace True|False}}
```

**Fields:**
- `Url`: Target URL/path
- `Replace`: Whether to replace current history entry

#### Navigate Response (Inbox)
```lisp
; Success:
{NavigateComplete id Ok}

; Error:
{NavigateComplete id {Error "message"}}
```

#### Read Location Request (Pending)
```lisp
{ReadLocation id}
```

#### Read Location Response (Inbox)
```lisp
; Success:
{ReadLocationComplete id {Location {Path "/path"} {Query "?q=1"} {Hash "#section"}}}

; Error:
{ReadLocationComplete id {Error "message"}}
```

---

### 11. File Operations (REPL/Node.js only)

#### Read File Request (Pending)
```lisp
{FileRead id {Path "filename.txt"}}
```

#### Read File Response (Inbox)
```lisp
; Success:
{FileReadComplete id {Content "file contents"}}

; Error:
{FileReadComplete id {Error "message"}}
```

#### Write File Request (Pending)
```lisp
{FileWrite id {Path "filename.txt"} {Content "data to write"}}
```

#### Write File Response (Inbox)
```lisp
; Success:
{FileWriteComplete id Ok}

; Error:
{FileWriteComplete id {Error "message"}}
```

---

### 12. Process Execution (REPL/Node.js only)

#### Execute Command Request (Pending)
```lisp
{Exec id {Command "ls -la"}}
```

#### Execute Command Response (Inbox)
```lisp
{ExecComplete id {Output "stdout"} {Error "stderr"} {Code 0}}
```

**Response Fields:**
- `Output`: Standard output
- `Error`: Standard error output
- `Code`: Process exit code

---

### 13. Syma File Operations (REPL/Node.js only)

#### Read Syma File Request (Pending)
```lisp
{ReadSymaFile id {Path "filename.syma"}}
```

#### Read Syma File Response (Inbox)
```lisp
; Success:
{ReadSymaFileComplete id {Frozen parsedExpression}}

; Error:
{ReadSymaFileComplete id {Error "message"}}
```

#### Write Syma File Request (Pending)
```lisp
{WriteSymaFile id {Path "filename.syma"} {Ast expression} {Pretty True|False}}
```

#### Write Syma File Response (Inbox)
```lisp
; Success:
{WriteSymaFileComplete id Ok}

; Error:
{WriteSymaFileComplete id {Error "message"}}
```

**Fields:**
- `Path`: File path wrapped in `{Path "..."}`
- `Ast`: Syma AST expression to write (for WriteSymaFile)
- `Pretty`: Boolean flag - `True` for pretty-printed output, `False` for compact (defaults to `False`)

**Notes:**
- ReadSymaFile parses the file content into a Syma AST and wraps it in `{Frozen ...}` to prevent eval-on-read (code-as-data)
- To evaluate the loaded code, extract it from the Frozen wrapper and normalize explicitly
- WriteSymaFile serializes an AST to Syma source code (unwrap Frozen before writing if needed)

---

### 14. Process Exit (Terminal)

#### Exit Request (Pending)
```lisp
{Exit exitCode}
```

**Fields:**
- `exitCode`: Numeric exit code (defaults to 0)

**Note**: No response; terminates the process immediately.

---

## Data Type Conversions

### JavaScript to Symbolic

When converting JS values to symbolic representation:
- `null`/`undefined` → `Sym("null")`
- `number` → `Num(value)`
- `string` → `Str(value)`
- `boolean` → `Sym("True")` or `Sym("False")`
- `Array` → `{List item1 item2 ...}`
- `Object` → `{Obj {Pair "key1" value1} {Pair "key2" value2} ...}`

### Symbolic to JavaScript

When converting symbolic values to JS:
- `Num(n)` → `number`
- `Str(s)` → `string`
- `Sym("True")` → `true`
- `Sym("False")` → `false`
- `Sym("null")` → `null`
- `{List ...}` → `Array`
- `{Obj ...}` → `Object`

---

## Processing Behavior

### Synchronous Effects
These effects are processed immediately and removed from Pending atomically:
- RandRequest
- Print
- StorageGet/Set/Del
- ClipboardWrite/Read
- Navigate/ReadLocation
- FileRead/Write
- ReadSymaFile/WriteSymaFile
- Exec
- Exit
- WsSend/WsClose (for connected sockets)

### Asynchronous Effects
These effects are removed from Pending immediately upon scheduling, with responses arriving later:
- Timer
- AnimationFrame
- WsConnect
- HttpReq (async but processed atomically)
- ReadLine/GetChar (async in browser, blocking in Node.js)

### Effect Processing Order
1. Effects are processed in the order they appear in Pending
2. One effect is processed per normalization cycle
3. After adding a response to Inbox, normalization runs before processing the next effect
4. This allows rules to consume responses and potentially generate new effects

### Platform Differences

**Browser:**
- Storage uses localStorage/sessionStorage
- Navigation uses History API
- File operations limited (fetch for read, download for write)
- Syma file operations not available (returns error responses)
- Process execution not available
- Exit not available

**Node.js:**
- Storage uses in-memory map
- Navigation not available (no-op)
- Full file system access
- Syma file operations with parser integration
- Process execution via child_process
- Exit terminates process

**REPL:**
- Inherits Node.js capabilities
- ReadLine integrates with REPL interface
- Input from ReadLine is not saved to history

---

## Best Practices

1. **Always use unique IDs**: Use `{FreshId}` to generate unique effect identifiers
2. **Handle all response types**: Rules should handle both success and error responses
3. **Clean up async resources**: Close WebSockets and cancel timers when appropriate
4. **Batch related effects**: Multiple effects can be queued in Pending simultaneously
5. **Check platform capabilities**: Some effects are platform-specific
6. **Process inbox promptly**: Remove processed responses from Inbox to prevent memory growth

---

## Example: Complete HTTP Request Flow

```lisp
; 1. Action triggers request
{R "FetchData"
   {Apply FetchData prog_}
   {Program prog_
     {Effects
       {Pending {HttpReq {FreshId} {Method "GET"} {Url "/api/data"} {Body} {Headers}}}
       {Inbox}}}}

; 2. Process successful response
{R "HandleHttpSuccess"
   {Program app_ {Effects pending_ {Inbox {HttpRes id_ {Status 200} {Json data_} headers_} rest...}}}
   {Program
     {Apply {DataReceived data_} app_}
     {Effects pending_ {Inbox rest...}}}}

; 3. Process error response
{R "HandleHttpError"
   {Program app_ {Effects pending_ {Inbox {HttpRes id_ {Status 0} {Error msg_} headers_} rest...}}}
   {Program
     {Apply {NetworkError msg_} app_}
     {Effects pending_ {Inbox rest...}}}}
```
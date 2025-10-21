# 7. Symbolic Effects

*How to do "side effects" without leaving the symbolic world. HTTP, storage, timers, I/O — all represented as rewrite patterns.*

⸻

## The Problem: Reality Intrudes

Everything we've built so far lives in a **pure symbolic universe**. Patterns transform into other patterns, rules fire, the world normalizes.

It's beautiful. It's clean. It's elegant.

It's also completely disconnected from reality.

But programs need to interact with **reality**:
- Read files
- Make HTTP requests
- Store data in localStorage
- Print to the console
- Wait for timers
- Listen to WebSocket messages

These are **side effects** — operations that escape the symbolic world and touch the messy real universe.

This is the moment most pure functional languages compromise. Haskell wraps effects in monads. Elm has "managed effects" with a special runtime. Most just give up and say "use this magic command keyword."

How do we reconcile purity with practicality?

Syma's answer: **Effects are data**. Not special. Not magical. Just symbolic expressions representing intentions. The symbolic world stays pure. Reality stays messy. And there's a bridge between them built of pure data structures.

🜛 *In imperative languages, side effects are commands. In Syma, side effects are data — symbolic requests waiting to be fulfilled.*

⸻

## The Syma Solution: Effects as Symbols

In Syma, effects aren't **performed**. They're **expressed**.

An HTTP request isn't a function call. It's a **symbolic term**:

```lisp
{HttpReq "req-1" {Method "GET"} {Url "/api/users"} {Headers} {Body Empty}}
```

A timer isn't a callback registration. It's a **pattern**:

```lisp
{Timer "timer-1" {Delay 2000}}
```

Storage operations are **just structure**:

```lisp
{StorageSet "set-1" {Store Local} {Key "count"} {Value 42}}
```

**These don't DO anything. They're data.**

The magic happens when the **platform adapter** sees these symbolic requests, performs the actual I/O, and injects symbolic **responses** back into the universe.

🜛 *Effects escape the symbolic world as requests. Reality enters the symbolic world as responses. The bridge between them is pure data.*

⸻

## The Effects Structure

Programs that use effects have a special structure:

```lisp
{Program
  {App
    {State ...}
    {UI ...}}
  {Effects
    {Pending ...}   ; Outbound requests
    {Inbox ...}}}   ; Inbound responses
```

### The Flow

1. **Action fires** → Enqueues effect in `Pending`
2. **Platform adapter** → Processes pending effects (actual I/O)
3. **Response arrives** → Added to `Inbox`
4. **Rules consume inbox** → Transform responses, update state
5. **Repeat**

⸻

## Example: Timer Effect

Let's build a simple countdown timer.

### Enqueue the Timer

```lisp
{R "StartTimer"
   {Apply StartTimer {Program app_ {Effects {Pending pending..} inbox_}}}
   {Program app_
     {Effects
       {Pending pending.. {Timer {FreshId} {Delay 1000}}}
       inbox_}}
   10}  ; High priority
```

When `StartTimer` action fires:
- Create a timer effect with unique ID
- Add it to `Pending`
- Platform sees it, starts a 1-second timer

### Process Timer Completion

```lisp
{R "TimerComplete"
   {Program
     {App state_ ui_}
     {Effects pending_ {Inbox {TimerComplete id_ timestamp_} rest..}}}
   {Program
     {Apply Tick {App state_ ui_}}  ; Update app
     {Effects pending_ {Inbox rest..}}}  ; Remove from inbox
   }}
```

When timer fires:
- Platform adds `{TimerComplete id timestamp}` to `Inbox`
- Rule consumes it, dispatches `Tick` action
- State updates through normal rules

### Complete Example

```lisp
{Module App/Timer
  {Export}

  {Defs
    {InitialState {State {Count 10}}}}

  {Program
    {App
      {State InitialState}
      {UI {Project View}}}
    {Effects {Pending} {Inbox}}}

  {Rules
    ; Start countdown on init
    {R "Init"
       {Apply Init prog_}
       {Apply StartTimer prog_}}

    ; Enqueue timer
    {R "StartTimer"
       {Apply StartTimer {Program app_ {Effects {Pending p..} inbox_}}}
       {Program app_ {Effects {Pending p.. {Timer {FreshId} {Delay 1000}}} inbox_}}
       10}

    ; Process timer completion
    {R "TimerComplete"
       {Program
         {App {State {Count n_}} ui_}
         {Effects pending_ {Inbox {TimerComplete _ _} rest..}}}
       {Program
         {App {State {Count {Sub n_ 1}}} ui_}
         {Effects
           {Pending {Timer {FreshId} {Delay 1000}}}  ; Queue next tick
           {Inbox rest..}}}
       {Gt n_ 0}}  ; Only if count > 0

    ; View
    {R "View"
       {/@ {View} {App {State {Count n_}} _}}
       {Div
         {H1 "Countdown: " {Show Count}}}}

    ; Show count
    {R "ShowCount"
       {/@ {Show Count} {App {State {Count n_}} _}}
       {ToString n_}}}}
```

Run it:

```bash
syma app/timer.syma
```

Every second, the count decreases. When it hits 0, the timer stops.

🜛 *The timer isn't hidden in the runtime. It's a symbolic request you can inspect, delay, cancel, or transform like any other data.*

⸻

## Effect Types

### Time & Scheduling

**Timer**
```lisp
{Timer id {Delay ms}}
→ {TimerComplete id {Now timestamp}}
```

**AnimationFrame** (60fps)
```lisp
{AnimationFrame id}
→ {AnimationFrameComplete id {Now timestamp}}
```

### HTTP

**Request**
```lisp
{HttpReq id
  {Method "POST"}
  {Url "/api/save"}
  {Headers {Header "Content-Type" "application/json"}}
  {Body {JSON data}}}

→ {HttpRes id
     {Status 200}
     {Json response}
     {Headers ...}}
```

### Storage

**localStorage/sessionStorage**

```lisp
{StorageSet id {Store Local} {Key "user"} {Value {Name "Alice"}}}
→ {StorageSetComplete id Ok}

{StorageGet id {Store Local} {Key "user"}}
→ {StorageGetComplete id {Found {Name "Alice"}}}

{StorageDel id {Store Local} {Key "user"}}
→ {StorageDelComplete id Ok}
```

### WebSockets

**Connect**
```lisp
{WsConnect id {Url "wss://example.com/socket"}}
→ {WsConnectComplete id Opened}
```

**Send**
```lisp
{WsSend id {Text "Hello"}}
→ {WsSendComplete id Ack}
```

**Receive** (automatic)
```lisp
→ {WsRecv id {Text "Message from server"}}
```

**Close**
```lisp
{WsClose id {Code 1000} {Reason "Done"}}
→ {WsCloseComplete id Closed}
```

### File System (Node.js)

**Read**
```lisp
{FileRead id {Path "/data/file.txt"}}
→ {FileReadComplete id {Content "file contents"}}
```

**Write**
```lisp
{FileWrite id {Path "/data/out.txt"} {Content "data"}}
→ {FileWriteComplete id Ok}
```

### Console I/O

**Print**
```lisp
{Print id {Message "Hello, Syma!"}}
→ {PrintComplete id Success}
```

**Input**
```lisp
{ReadLine id}
→ {ReadLineComplete id {Text "user input"}}

{GetChar id}
→ {GetCharComplete id {Char "a"}}
```

⸻

## Example: Todo App with LocalStorage

```lisp
{Module App/Todo
  {Export}

  {Defs
    {InitialState {State {Todos} {NextId 1}}}}

  {Program
    {App
      {State InitialState}
      {UI {Project View}}}
    {Effects {Pending} {Inbox}}}

  {Rules
    ; Load todos on init
    {R "Init"
       {Apply Init {Program app_ {Effects {Pending p..} inbox_}}}
       {Program app_ {Effects
         {Pending p.. {StorageGet {FreshId} {Store Local} {Key "todos"}}}
         inbox_}}
       10}

    ; Process loaded todos
    {R "LoadComplete"
       {Program app_ {Effects pending_ {Inbox {StorageGetComplete _ {Found todos_}} rest..}}}
       {Program {Apply {SetTodos todos_} app_} {Effects pending_ {Inbox rest..}}}}

    ; Add todo (triggers save)
    {R "AddTodo"
       {Apply {AddTodo text_} {Program {App {State {Todos todos..} {NextId n_}} ui_} effects_}}
       {Program
         {App {State {Todos todos.. {Todo n_ text_ False}} {NextId {Add n_ 1}}} ui_}
         {Apply SaveTodos effects_}}}

    ; Save todos to storage
    {R "SaveTodos"
       {Apply SaveTodos {Program {App {State {Todos todos..} _} _} {Effects {Pending p..} inbox_}}}
       {Program
         {App {State {Todos todos..} _} _}
         {Effects
           {Pending p.. {StorageSet {FreshId} {Store Local} {Key "todos"} {Value {Todos todos..}}}}
           inbox_}}}

    ; View
    {R "View"
       {/@ {View} {App state_ _}}
       {Div
         {Input :type "text" :value {Input todoInput} :onKeydown {When {KeyIs "Enter"} {Seq {AddTodo {Input todoInput}} {ClearInput todoInput}}}}
         {Ul {Project {TodoList}}}}}

    {R "TodoList"
       {/@ {TodoList} {App {State {Todos todos..} _} _}}
       {Map {Lambda t {Li {Show {Get t text}}}} {Todos todos..}}}}}
```

**Flow:**

1. App loads → `Init` rule fires → Enqueues `{StorageGet ...}`
2. Platform reads localStorage → Injects `{StorageGetComplete ... {Found todos}}`
3. `LoadComplete` rule fires → Applies `{SetTodos todos}` action
4. User adds todo → `AddTodo` rule fires → Triggers `SaveTodos`
5. `SaveTodos` enqueues `{StorageSet ...}`
6. Platform writes to localStorage → Injects `{StorageSetComplete ...}`
7. App continues normally

🜛 *Persistence isn't a framework feature. It's a pattern: enqueue save effects when state changes, load on init.*

⸻

## Example: Live Chat with WebSockets

```lisp
{Module App/Chat
  {Export}

  {Program
    {App
      {State {Messages} {Connected False}}
      {UI {Project View}}}
    {Effects {Pending} {Inbox}}}

  {Rules
    ; Connect on init
    {R "Init"
       {Apply Init {Program app_ {Effects {Pending p..} inbox_}}}
       {Program app_ {Effects
         {Pending p.. {WsConnect {FreshId} {Url "wss://chat.example.com"}}}
         inbox_}}
       10}

    ; Handle connection success
    {R "Connected"
       {Program app_ {Effects pending_ {Inbox {WsConnectComplete _ Opened} rest..}}}
       {Program {Apply {SetConnected True} app_} {Effects pending_ {Inbox rest..}}}}

    ; Send message
    {R "SendMessage"
       {Apply {SendMsg text_} {Program app_ {Effects {Pending p..} inbox_}}}
       {Program app_ {Effects
         {Pending p.. {WsSend {FreshId} {Text text_}}}
         inbox_}}}

    ; Receive message
    {R "ReceiveMessage"
       {Program app_ {Effects pending_ {Inbox {WsRecv _ {Text msg_}} rest..}}}
       {Program {Apply {AddMessage msg_} app_} {Effects pending_ {Inbox rest..}}}}

    ; Add message to state
    {R "AddMessage"
       {Apply {AddMessage msg_} {App {State {Messages msgs..} conn_} ui_}}
       {App {State {Messages msgs.. msg_} conn_} ui_}}}}
```

**Flow:**

1. `Init` → Connect to WebSocket
2. `{WsConnectComplete}` arrives → Set connected flag
3. User types message → `SendMsg` action → Enqueues `{WsSend}`
4. Server responds → `{WsRecv}` arrives → `AddMessage` action
5. State updates → UI re-renders with new message

🜛 *WebSockets are bidirectional symbolic streams. Send requests. Receive events. Transform state. That's it.*

⸻

## Platform Adapters

Effects are **platform-independent symbolic data**.

Different platforms implement the actual I/O:

### Browser Platform

```javascript
class BrowserPlatform {
  async processEffect(effect) {
    if (effect.k === 'Call' && effect.h.v === 'HttpReq') {
      const response = await fetch(url, options);
      return {HttpRes: ...};
    }
    if (effect.k === 'Call' && effect.h.v === 'Timer') {
      return new Promise(resolve =>
        setTimeout(() => resolve({TimerComplete: ...}), delay)
      );
    }
    // ... other effects
  }
}
```

### Node.js Platform

```javascript
class NodePlatform {
  async processEffect(effect) {
    if (effect.k === 'Call' && effect.h.v === 'FileRead') {
      const content = await fs.readFile(path, 'utf8');
      return {FileReadComplete: ...};
    }
    if (effect.k === 'Call' && effect.h.v === 'Print') {
      console.log(message);
      return {PrintComplete: ...};
    }
    // ... other effects
  }
}
```

The **symbolic interface** stays the same. Only the **platform implementation** changes.

🜛 *Write once, run everywhere. Not because of a VM, but because effects are just data that any platform can interpret.*

⸻

## Effects Patterns

### 1. Optimistic Updates

Update UI immediately, save in background:

```lisp
{R "AddTodo"
   {Apply {AddTodo text_} {Program {App {State state_} ui_} effects_}}
   {Program
     {App {State {UpdateState state_ text_}} ui_}  ; Update now
     {Apply {SaveAsync} effects_}}}                ; Save later
```

### 2. Error Handling

```lisp
{R "HttpError"
   {Program app_ {Effects pending_ {Inbox {HttpRes _ {Status 500} _ _} rest..}}}
   {Program {Apply {ShowError "Server error"} app_} {Effects pending_ {Inbox rest..}}}}
```

### 3. Retry Logic

```lisp
{R "RetryOnFailure"
   {Program app_ {Effects pending_ {Inbox {HttpRes id_ {Status 500} _ _} rest..}}}
   {Program app_ {Effects
     {Pending {RetryHttp id_ 1}}  ; Retry with backoff
     {Inbox rest..}}}}
```

### 4. Batching

```lisp
{R "BatchSave"
   {Apply {Save items..} {Program app_ {Effects {Pending p..} inbox_}}}
   {Program app_ {Effects
     {Pending p.. {BatchWrite {FreshId} {Items items..}}}
     inbox_}}}
```

⸻

## Debugging Effects

Effects are visible in trace mode:

```lisp
syma> :trace
Trace mode: on

syma> {Apply StartTimer {Program ...}}
Trace:
  Step 1: Rule "StartTimer" at path []
    Enqueued effect: {Timer "t-123" {Delay 1000}}

  Platform processed timer...

  Step 2: Effect response injected: {TimerComplete "t-123" 1697654321}

  Step 3: Rule "TimerComplete" at path []
    ...
```

You can **inspect** the effects queue:

```lisp
{Program app_ {Effects {Pending effects..} inbox_}}
```

`effects..` is just a list of symbolic terms.

🜛 *Effects aren't hidden in callbacks or promises. They're data you can log, inspect, test, and transform.*

⸻

## Testing with Effects

Mock effects by directly injecting responses:

```lisp
; Test: Add todo triggers save
syma> :rule TestAddTodo
  {Test}
  {Apply {AddTodo "Test"} {Program {App {State {Todos}} {UI Empty}} {Effects {Pending} {Inbox}}}}

syma> {Test}
→ {Program
    {App {State {Todos {Todo 1 "Test" False}}} ...}
    {Effects
      {Pending {StorageSet "..." {Store Local} {Key "todos"} {Value ...}}}
      {Inbox}}}

; Verify: StorageSet is pending!
```

No actual I/O happened. You're testing **pure transformations**.

⸻

## Exercises

### 1. Build a Polling System

Create an effect that polls an API every N seconds:

```lisp
:rule StartPolling {StartPolling} → {SchedulePoll}
:rule Poll {Poll} → Enqueue {HttpReq ...} and {Timer ...}
:rule ProcessPollResponse ...
```

### 2. Implement Debouncing

Debounce user input before saving:

```lisp
:rule OnInput → Cancel previous timer, start new one
:rule OnTimerComplete → Actually save
```

### 3. Add Undo/Redo with Storage

Save state history to localStorage:

```lisp
:rule SaveHistory → {StorageSet "history" {Serialize stateHistory}}
:rule Undo → Load from history, apply previous state
```

### 4. Build a File Uploader (Node.js)

Read file, split into chunks, upload via HTTP:

```lisp
:rule StartUpload → {FileRead ...}
:rule FileReadComplete → Split into chunks, send first
:rule ChunkComplete → Send next chunk
:rule AllChunksComplete → Success
```

⸻

## Key Takeaways

- **Effects are symbolic data**, not function calls
- **Pending** queue holds outbound effect requests
- **Inbox** holds inbound effect responses
- **Platform adapters** bridge symbolic and real I/O
- Effects are **inspectable, testable, and transformable**
- **Same symbolic interface** works across browser, Node.js, and future platforms

⸻

## What's Next

You've seen how Syma interacts with reality through symbolic effects.

Next, explore the **philosophy** behind outermost-first evaluation.

**Next:** [Chapter 8: The Outermost Philosophy](./08-outermost-philosophy.md)

Or dive into advanced topics:
- [Chapter 9: Typing and Constraints](./09-typing-and-constraints.md)
- [Chapter 10: Projects and Ecosystem](./10-packages-and-ecosystem.md)

⸻

🜛 *"In imperative languages, effects are commands that change the world. In Syma, effects are questions asked of the world... and the world answers in symbols."*

Heck yeah—let’s design the effect palette. Think in capabilities with clean symbolic protocols (request term → completion term(s)), so the host stays dumb and your rules decide policy.

Below is a tight set that covers 95% of real apps, with suggested term shapes, stream semantics, and little rule snippets to show how they play.

⸻

0) Envelope (baseline)

I’ll assume the “pair-aware” envelope:
•	Pending: raw requests
… Effects (Pending <req> …) (Inbox …)
•	Inbox: completions, always wrapped
Completed <Ctor> <Id> <Payload>

This lets one generic consumer rule handle any effect kind.

Example generic consumer:

(R "HandleCompleted"
(Program app_ (Effects pend_ (Inbox (Completed kind_ id_ payload_) rest___)))
(Program
(Apply (EffectCompleted kind_ id_ payload_) app_)
(Effects pend_ (Inbox rest___))))

You then branch on kind_ in rules for post-processing.

⸻

1) Time & scheduling

Timer (you already have)

Pending:   (Timer id_ (Delay ms_))
Inbox:     (Completed Timer id_ (Now ts_))
Cancel:    (Cancel Timer id_)

Animation frame (for smooth loops)

Pending:   (AnimationFrame id_)
Inbox:     (Completed AnimationFrame id_ (Now ts_))

Useful for 60fps simulations without wall-clock drift.

Idle callback (background work)

Pending:   (Idle id_ (Timeout ms_))
Inbox:     (Completed Idle id_ (Deadline ms_))


⸻

2) Networking

HTTP (robust)

Pending:   (HttpReq id_ (Method "GET") (Url "/api") (Headers ...) (Body ...))
Inbox:     (Completed HttpReq id_
(HttpRes (Status 200) (Ok True|False) (Json|Text payload_) (Headers ...)))
Cancel:    (Cancel HttpReq id_)

WebSocket

Pending:   (WsConnect id_ (Url "wss://...") (Protocols ...)? (Headers ...)?)
Pending:   (WsSend id_ (Text str_) | (Binary bytes_))
Pending:   (WsClose id_ (Code n_) (Reason str_)?)
Inbox:     (Completed WsConnect id_ (Opened))
Inbox:     (Completed WsSend    id_ (Ack))
Inbox:     (Completed WsClose   id_ (Closed code_ reason_))
Inbox:     (Completed WsRecv    id_ ((Text str_) | (Binary bytes_)))

Use rules to model reconnect/backoff.

Server-Sent Events (SSE)

Pending:   (SseOpen id_ (Url "...") (Headers ...)?)
Pending:   (SseClose id_)
Inbox:     (Completed SseOpen  id_ (Opened))
Inbox:     (Completed SseEvent id_ (Event name_) (Data str_))
Inbox:     (Completed SseClose id_ (Closed))


⸻

3) Storage & persistence

LocalStorage / SessionStorage

Pending:   (StorageGet  id_ (Store Local|Session) (Key str_))
Pending:   (StorageSet  id_ (Store ...) (Key str_) (Value any_))
Pending:   (StorageDel  id_ (Store ...) (Key str_))
Inbox:     (Completed StorageGet id_ (Found any_) | (Missing))
Inbox:     (Completed StorageSet id_ (Ok))
Inbox:     (Completed StorageDel id_ (Ok))

IndexedDB (coarse-grained)

Pending:   (IDBGet  id_ (DB str_) (Store str_) (Key any_))
Pending:   (IDBPut  id_ (DB ...)  (Store ...)   (Key any_) (Value any_))
Pending:   (IDBDel  id_ (DB ...)  (Store ...)   (Key any_))
Inbox:     (Completed IDBGet id_ (Found any_) | (Missing))
Inbox:     (Completed IDBPut id_ (Ok))
Inbox:     (Completed IDBDel id_ (Ok))


⸻

4) Files, clipboard, downloads

Clipboard

Pending:   (ClipboardWrite id_ (Text str_))
Pending:   (ClipboardRead  id_)
Inbox:     (Completed ClipboardWrite id_ (Ok|Denied))
Inbox:     (Completed ClipboardRead  id_ (Text str_ | Denied))

File picker / save-as

Pending:   (FileOpen id_ (Accept [ "image/*" "text/*" ]) (Multiple True|False))
Inbox:     (Completed FileOpen id_ (Files (List (FileRef ref_) ...)))

Pending:   (FileRead id_ (FileRef ref_) (As "text"|"arrayBuffer"))
Inbox:     (Completed FileRead id_ (Text str_) | (Bytes bytes_))

Pending:   (FileSave id_ (SuggestedName str_) (Bytes|Text data_))
Inbox:     (Completed FileSave id_ (Ok))

Download (visible browser download)

Pending:   (Download id_ (Filename str_) (Bytes|Text data_ (Mime str_)?))
Inbox:     (Completed Download id_ (Ok))


⸻

5) Sensors & environment

Geolocation

Pending:   (GeoOnce   id_ (HighAccuracy True|False)? (Timeout ms_)?)
Pending:   (GeoWatch  id_ (HighAccuracy …)?)
Pending:   (GeoClear  id_)
Inbox:     (Completed GeoOnce  id_ (Position lat_ lon_ acc_ ts_) | (Denied|Timeout|Error msg_))
Inbox:     (Completed GeoWatch id_ (Position ...))   ; streaming
Inbox:     (Completed GeoClear id_ (Ok))

Visibility / focus changes

Pending:   (Subscribe id_ (Event VisibilityChange | FocusChange))
Pending:   (Unsubscribe id_)
Inbox:     (Completed Event id_ (Visibility "visible"|"hidden"))
Inbox:     (Completed Event id_ (Focus True|False))

Resize / Intersection observers

Pending:   (ObserveResize id_ (Element el_))
Pending:   (UnobserveResize id_)
Inbox:     (Completed Resize id_ (Size w_ h_))

Pending:   (ObserveIntersect id_ (Element el_) (Root el_|None) (Threshold n_))
Pending:   (UnobserveIntersect id_)
Inbox:     (Completed Intersect id_ (Ratio r_) (IsIntersecting True|False))

(Where Element el_ is a symbolic handle your runtime can resolve to a DOM element—same style you used for FreshId.)

⸻

6) Media & audio

getUserMedia / tracks

Pending:   (MediaRequest id_ (Audio True|False) (Video True|False))
Pending:   (MediaStop    id_)
Inbox:     (Completed MediaRequest id_ (Stream mediaRef_) | (Denied|Error msg_))
Inbox:     (Completed MediaStop    id_ (Ok))

WebAudio (coarse)

Pending:   (AudioCtxOpen  id_)
Pending:   (AudioPlay     id_ (Buffer bytes_) (Options ...))
Pending:   (AudioStop     id_)
Inbox:     (Completed AudioCtxOpen id_ (Ctx ctxRef_))
Inbox:     (Completed AudioPlay    id_ (Started))
Inbox:     (Completed AudioStop    id_ (Stopped))

(If you want the full node graph, do a separate “AudioGraph” DSL and send batches via one effect: (AudioGraphApply id_ (Ops …)).)

⸻

7) Crypto & randomness

Deterministic & non-deterministic RNG

Pending:   (RandRequest id_ (Min n_) (Max m_))                 ; nondet
Pending:   (RandSeeded  id_ (Seed s_) (Min n_) (Max m_))       ; replayable
Inbox:     (Completed RandRequest id_ (Num n_))
Inbox:     (Completed RandSeeded  id_ (Num n_))

SubtleCrypto

Pending:   (Digest id_ (Alg "SHA-256") (Data bytes_))
Inbox:     (Completed Digest id_ (Bytes digest_))

Pending:   (CryptoRand id_ (Bytes n_))
Inbox:     (Completed CryptoRand id_ (Bytes bytes_))


⸻

8) Workers & compute offloading

Web Workers

Pending:   (WorkerSpawn id_ (ScriptUrl url_))
Pending:   (WorkerPost  id_ (Json|Bytes data_))
Pending:   (WorkerKill  id_)
Inbox:     (Completed WorkerSpawn id_ (Ready))
Inbox:     (Completed WorkerPost  id_ (Ack))
Inbox:     (Completed WorkerMsg   id_ (Json|Bytes data_))
Inbox:     (Completed WorkerKill  id_ (Exited code_))

(You can layer “compilation” or WASM loading on top of this.)

⸻

9) Canvas / rendering bridges

For heavy draw loops, keep policy symbolic and batch commands:

Pending:   (CanvasApply id_ (CanvasRef r_) (Ops (List (Op …) (Op …) …)))
Inbox:     (Completed CanvasApply id_ (Ok | Error msg_))

; or for WebGL
Pending:   (GLApply id_ (CtxRef r_) (Ops …))

Use AnimationFrame to clock redraws.

⸻

10) Navigation / URL / History

Pending:   (Navigate id_ (Url str_) (Replace True|False)?)
Inbox:     (Completed Navigate id_ (Ok))

Pending:   (ReadLocation id_)
Inbox:     (Completed ReadLocation id_ (Location (Path str_) (Query obj_) (Hash str_)))

Pending:   (ListenPopstate id_)
Pending:   (UnlistenPopstate id_)
Inbox:     (Completed Popstate id_ (Location ...))


⸻

11) Notifications & permissions

Pending:   (RequestPermission id_ (Capability Notifications|Clipboard|Geo|Media))
Inbox:     (Completed RequestPermission id_ (Granted|Denied|Prompt))

Pending:   (Notify id_ (Title str_) (Body str_) (Tag str_)?)
Inbox:     (Completed Notify id_ (Shown|Denied|Error msg_))


⸻

12) Telemetry / logging

You already have Print. Add levels & structured meta:

Pending:   (Log id_ (Level Debug|Info|Warn|Error) (Message str_) (Meta obj_)?)
Inbox:     (Completed Log id_ (Ok))

…and keep real shipping to server as HttpReq (rules can batch).

⸻

13) Performance & profiling

Pending:   (PerfMark  id_ (Name str_))
Pending:   (PerfMeasure id_ (Name str_) (Start str_) (End str_))
Inbox:     (Completed PerfMark    id_ (Ok))
Inbox:     (Completed PerfMeasure id_ (Duration ms_))

Lets you wire symbolic performance tests.

⸻

Tiny rule examples

Retry HTTP with backoff (purely symbolic)

; When an HttpReq fails with Status=0 or !Ok, enqueue a retry via Timer
(R "HttpRetry"
(Program app_ (Effects pend_ (Inbox (Completed HttpReq id_ (HttpRes (Status s_) (Ok False) _ _)) rest___)))
(Program app_
(Effects
(Pending pend_ (Timer (RetryTag id_) (Delay (BackoffFor id_))))
(Inbox rest___))))

; When Timer completes, re-enqueue the same HttpReq (you’d store the original request term under a map)
(R "RetryTimerFired"
(Program app_ (Effects pend_ (Inbox (Completed Timer (RetryTag id_) _) rest___)))
(Program app_
(Effects (Pending pend_ (OrigHttpReq id_)) (Inbox rest___)))
)

Streaming WS message into domain action

(R "OnWsRecv"
(Program app_ (Effects pend_ (Inbox (Completed WsRecv wsId_ (Text msg_)) rest___)))
(Program (Apply (HandleIncomingMessage msg_) app_)
(Effects pend_ (Inbox rest___))))

Cancel long HTTP on route change

(R "RouteChangeCancelsHttp"
(Apply (RouteTo new_) (Program (App st_ ui_) (Effects (Pending (HttpReq id_ ... ) rest___) inbox_)))
(Program
(App (Apply (RouteTo new_) st_) ui_)
(Effects (Pending (Cancel HttpReq id_) rest___) inbox_)))


⸻

Guiding principles (so you keep winning)
•	One transport per capability, not per endpoint. The rules do batching, retries, caching, priorities. The host only correlates (ctor,id), performs I/O, and emits completions.
•	Streams = long-lived subscriptions (Ws, Sse, observers). Every “open” must have a “close/clear.”
•	Determinism when desired: offer seeded RNG and recordable completions for replay.
•	No hidden policy in host: anything smart should be expressible as rules.
•	Uniform envelopes make consumers trivial and composable.

If you want, I can turn the above into a ready-to-drop “effects spec” file with S-expr schemas + a couple of canonical consumer rules you can paste into your RuleRules / docs.
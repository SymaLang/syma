(Universe
  ;; ========= Program =========
  (Program
    (App
      (State
        (EffectsDemo
          ;; Storage demo
          ""        ;; StoredValue
          "Ready"   ;; StorageStatus

          ;; Clipboard demo
          ""        ;; ClipboardText
          "Ready"   ;; ClipboardStatus

          ;; Animation demo
          False      ;; AnimationActive
          0          ;; AnimationFrame
          0          ;; AnimationX

          ;; Random demo
          0          ;; RandomNumber

          ;; Navigation demo
          "/"        ;; CurrentPath

          ;; General status
          "None"     ;; LastEffect
          Nil        ;; EffectLog (empty list)
          ))  ; List of effect results

      (UI
        (Div :class "max-w-4xl mx-auto p-6"
          (Div :class "bg-white rounded-xl shadow-lg p-8"
            (H1 :class "text-3xl font-bold text-gray-800 mb-8" "🧪 Syma Effects Playground")
            (P :class "text-gray-600 mb-6" "Interactive demonstration of symbolic effects")

            ;; Status display
            (Div :class "mb-6 p-4 bg-blue-50 rounded-lg"
              (P :class "font-mono text-sm" "Last Effect: " (Show LastEffect))
              (P :class "font-mono text-sm" "Current Path: " (Show CurrentPath)))

            ;; Effects Grid
            (Div :class "grid grid-cols-1 md:grid-cols-2 gap-6"

              ;; Storage Effects Card
              (Div :class "border rounded-lg p-4"
                (H2 :class "text-xl font-semibold mb-3 text-blue-600" "💾 Storage Effects")
                (Input :type "text"
                       :placeholder "Enter value to store..."
                       :class "w-full px-3 py-2 border rounded mb-2"
                       :value (Input storageInput)
                       :onKeydown (When (KeyIs "Enter")
                                   (PreventDefault (SaveToStorage (Input storageInput)))))
                (Div :class "flex gap-2 mb-3"
                  (Button :onClick (SaveToStorage (Input storageInput))
                          :class "px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                          "Save")
                  (Button :onClick LoadFromStorage
                          :class "px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                          "Load")
                  (Button :onClick ClearStorage
                          :class "px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                          "Clear"))
                (Div :class "p-2 bg-gray-50 rounded"
                  (P :class "text-sm" "Status: " (Show StorageStatus))
                  (P :class "text-sm font-mono" "Stored: " (Show StoredValue))))

              ;; Clipboard Effects Card
              (Div :class "border rounded-lg p-4"
                (H2 :class "text-xl font-semibold mb-3 text-purple-600" "📋 Clipboard Effects")
                (Input :type "text"
                       :placeholder "Text to copy..."
                       :class "w-full px-3 py-2 border rounded mb-2"
                       :value (Input clipboardInput))
                (Div :class "flex gap-2 mb-3"
                  (Button :onClick (CopyToClipboard (Input clipboardInput))
                          :class "px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                          "Copy")
                  (Button :onClick PasteFromClipboard
                          :class "px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                          "Paste"))
                (Div :class "p-2 bg-gray-50 rounded"
                  (P :class "text-sm" "Status: " (Show ClipboardStatus))
                  (P :class "text-sm font-mono" "Clipboard: " (Show ClipboardText))))

              ;; Animation Effects Card
              (Div :class "border rounded-lg p-4"
                (H2 :class "text-xl font-semibold mb-3 text-green-600" "🎬 Animation Effects")
                (Button :onClick ToggleAnimation
                        :class (Project (AnimButtonClass))
                        (Project (AnimButtonText)))
                (Div :class "mt-4 h-20 bg-gray-50 rounded relative overflow-hidden"
                  (Div :class "absolute h-4 w-4 bg-blue-500 rounded-full"
                       :style (Project (AnimationStyle))
                       ""))
                (P :class "text-sm mt-2" "Frame: " (Show AnimationFrame))
                (P :class "text-xs text-gray-500" "60 FPS smooth animation using AnimationFrame effect"))

              ;; Random Effects Card
              (Div :class "border rounded-lg p-4"
                (H2 :class "text-xl font-semibold mb-3 text-orange-600" "🎲 Random Effects")
                (Div :class "flex gap-2 mb-3"
                  (Button :onClick (GenerateRandom 1 100)
                          :class "px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                          "1-100")
                  (Button :onClick (GenerateRandom 1 6)
                          :class "px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                          "Roll Dice")
                  (Button :onClick (GenerateRandom 0 1)
                          :class "px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                          "Coin Flip"))
                (Div :class "p-4 bg-gray-50 rounded text-center"
                  (P :class "text-4xl font-bold" (Show RandomNumber))))

              ;; Navigation Effects Card
              (Div :class "border rounded-lg p-4"
                (H2 :class "text-xl font-semibold mb-3 text-indigo-600" "🧭 Navigation Effects")
                (Div :class "flex flex-col gap-2"
                  (Button :onClick (NavigateTo "/home")
                          :class "px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                          "Go to /home")
                  (Button :onClick (NavigateTo "/about")
                          :class "px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                          "Go to /about")
                  (Button :onClick (NavigateTo "/effects")
                          :class "px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
                          "Go to /effects")
                  (Button :onClick ReadCurrentLocation
                          :class "px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                          "Read Location"))
                (P :class "text-sm mt-2 font-mono" (Show CurrentPath)))

              ;; Timer Effects Card (bonus)
              (Div :class "border rounded-lg p-4"
                (H2 :class "text-xl font-semibold mb-3 text-teal-600" "⏱️ Timer Effect")
                (Button :onClick DelayedAction
                        :class "px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600"
                        "Trigger 2s Delay")
                (P :class "text-sm mt-2 text-gray-600" "Triggers an action after 2 seconds"))
            )

            ;; Effect Log
            (Div :class "mt-8"
              (H3 :class "text-lg font-semibold mb-3" "📜 Effect Log")
              (Div :class "max-h-40 overflow-y-auto p-3 bg-gray-50 rounded font-mono text-xs"
                (Project (RenderLog))))))))

    ;; Effects lane for I/O
    (Effects (Pending) (Inbox)))

  ;; ========= Rules =========
  (Rules

    ;; --- Lifters ---
    (R "LiftApplyThroughProgram"
       (Apply act_ (Program app_ eff_))
       (Program (Apply act_ app_) eff_))

    (R "LiftApplyThroughApp"
       (Apply act_ (App st_ ui_))
       (App (Apply act_ st_) ui_))

    (R "LiftApplyThroughState"
       (Apply act_ (State s_))
       (State (Apply act_ s_)))

    ;; --- Storage Effects ---
    (R "SaveToStorage/Enqueue"
       (Apply (SaveToStorage value_) (Program app_ (Effects (Pending p___) inbox_)))
       (Program
         (Apply (SetStorageStatus "Saving...") app_)
         (Effects
           (Pending p___ (StorageSet (FreshId) (Store Local) (Key "demo-value") (Value value_)))
           inbox_))
       10)

    (R "StorageSet/Complete"
       (Program app_ (Effects pending_ (Inbox (StorageSetComplete id_ Ok) rest___)))
       (Program
         (Apply StorageSaved app_)
         (Effects pending_ (Inbox rest___))))

    (R "StorageSaved"
       (Apply StorageSaved (EffectsDemo stored_ status_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_))
       (EffectsDemo stored_ "Saved!" ct_ cs_ aa_ af_ ax_ rn_ cp_ "Storage: Saved" (Cons "Storage: Value saved" log_)))

    (R "LoadFromStorage/Enqueue"
       (Apply LoadFromStorage (Program app_ (Effects (Pending p___) inbox_)))
       (Program
         app_
         (Effects
           (Pending p___ (StorageGet (FreshId) (Store Local) (Key "demo-value")))
           inbox_))
       10)

    (R "StorageGet/Found"
       (Program (App (State (EffectsDemo stored_ status_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_)) ui_)
                (Effects pending_ (Inbox (StorageGetComplete id_ (Found value_)) rest2___)))
       (Program
         (App (State (EffectsDemo value_ "Loaded!" ct_ cs_ aa_ af_ ax_ rn_ cp_ "Storage: Loaded" (Cons (Concat "Storage: Loaded " value_) log_))) ui_)
         (Effects pending_ (Inbox rest2___))))

    (R "StorageGet/Missing"
       (Program (App (State (EffectsDemo stored_ status_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_)) ui_)
                (Effects pending_ (Inbox (StorageGetComplete id_ Missing) rest2___)))
       (Program
         (App (State (EffectsDemo "" "No stored value" ct_ cs_ aa_ af_ ax_ rn_ cp_ "Storage: Not found" (Cons "Storage: No value found" log_))) ui_)
         (Effects pending_ (Inbox rest2___))))

    (R "ClearStorage/Enqueue"
       (Apply ClearStorage (Program app_ (Effects (Pending p___) inbox_)))
       (Program
         app_
         (Effects
           (Pending p___ (StorageDel (FreshId) (Store Local) (Key "demo-value")))
           inbox_))
       10)

    (R "StorageDel/Complete"
       (Program (App (State (EffectsDemo stored_ status_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_)) ui_)
                (Effects pending_ (Inbox (StorageDelComplete id_ Ok) rest2___)))
       (Program
         (App (State (EffectsDemo "" "Cleared!" ct_ cs_ aa_ af_ ax_ rn_ cp_ "Storage: Cleared" (Cons "Storage: Value cleared" log_))) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Clipboard Effects ---
    (R "CopyToClipboard/Enqueue"
       (Apply (CopyToClipboard text_) (Program app_ (Effects (Pending p___) inbox_)))
       (Program
         app_
         (Effects
           (Pending p___ (ClipboardWrite (FreshId) (Text text_)))
           inbox_))
       10)

    (R "ClipboardWrite/Complete"
       (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_)) ui_)
                (Effects pending_ (Inbox (ClipboardWriteComplete id_ Ok) rest2___)))
       (Program
         (App (State (EffectsDemo sv_ ss_ ct_ "Copied!" aa_ af_ ax_ rn_ cp_ "Clipboard: Copied" (Cons "Clipboard: Text copied" log_))) ui_)
         (Effects pending_ (Inbox rest2___))))

    (R "PasteFromClipboard/Enqueue"
       (Apply PasteFromClipboard (Program app_ (Effects (Pending p___) inbox_)))
       (Program
         app_
         (Effects
           (Pending p___ (ClipboardRead (FreshId)))
           inbox_))
       10)

    (R "ClipboardRead/Complete"
       (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_)) ui_)
                (Effects pending_ (Inbox (ClipboardReadComplete id_ (Text text_)) rest2___)))
       (Program
         (App (State (EffectsDemo sv_ ss_ text_ "Pasted!" aa_ af_ ax_ rn_ cp_ "Clipboard: Pasted" (Cons (Concat "Clipboard: Pasted " text_) log_))) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Animation Effects ---
    ;; Toggle animation state
    (R "ToggleAnimation/Start"
       (Apply ToggleAnimation (EffectsDemo sv_ ss_ ct_ cs_ False rest___))
       (EffectsDemo sv_ ss_ ct_ cs_ True rest___))

    (R "ToggleAnimation/Stop"
       (Apply ToggleAnimation (EffectsDemo sv_ ss_ ct_ cs_ True rest___))
       (EffectsDemo sv_ ss_ ct_ cs_ False rest___))

    ;; When toggling animation on, start with effect
    (R "ToggleAnimation/StartWithEffect"
       (Apply ToggleAnimation (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ False frame_ x_ rest___)) ui_)
                                      (Effects (Pending p___) inbox_)))
       (Program
         (App (State (EffectsDemo sv_ ss_ ct_ cs_ True frame_ x_ rest___)) ui_)
         (Effects
           (Pending p___ (AnimationFrame (FreshId)))
           inbox_))
       10)  ; High priority

    ;; When toggling animation off, just update state
    (R "ToggleAnimation/StopWithEffect"
       (Apply ToggleAnimation (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ True frame_ x_ rest___)) ui_)
                                      effects_))
       (Program
         (App (State (EffectsDemo sv_ ss_ ct_ cs_ False frame_ x_ rest___)) ui_)
         effects_)
       10)  ; High priority

    ;; Process animation frame when active - update and request next
    (R "AnimationFrame/CompleteActive"
       (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ True frame_ x_ rest___)) ui_)
                (Effects pending_ (Inbox (AnimationFrameComplete id_ (Now ts_)) rest2___)))
       (Program
         (App (State (EffectsDemo sv_ ss_ ct_ cs_ True
                                  (Add frame_ 1)
                                  (Mod (Add x_ 3) 300)
                                  rest___)) ui_)
         (Effects
           (Pending (AnimationFrame (FreshId)))  ; Request next frame
           (Inbox rest2___))))

    ;; Process animation frame when inactive - just consume the event
    (R "AnimationFrame/CompleteInactive"
       (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ False frame_ x_ rest___)) ui_)
                (Effects pending_ (Inbox (AnimationFrameComplete id_ _) rest2___)))
       (Program
         (App (State (EffectsDemo sv_ ss_ ct_ cs_ False frame_ x_ rest___)) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Random Effects ---
    (R "GenerateRandom/Enqueue"
       (Apply (GenerateRandom min_ max_) (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue (RandRequest min_ max_) (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "RandResponse/Process"
       (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_)) ui_)
                (Effects pending_ (Inbox (RandResponse id_ value_) rest2___)))
       (Program
         (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ value_ cp_ (Concat "Random: " (ToString value_)) (Cons (Concat "Random: Generated " (ToString value_)) log_))) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Navigation Effects ---
    (R "NavigateTo/Enqueue"
       (Apply (NavigateTo path_) (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue (Navigate (Url path_)) (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "Navigate/Complete"
       (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_)) ui_)
                (Effects pending_ (Inbox (NavigateComplete id_ Ok) rest2___)))
       (Program
         (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ "Navigation: Complete" (Cons "Navigation: URL updated" log_))) ui_)
         (Effects pending_ (Inbox rest2___))))

    (R "ReadCurrentLocation/Enqueue"
       (Apply ReadCurrentLocation (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue ReadLocation (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "ReadLocation/Complete"
       (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_)) ui_)
                (Effects pending_ (Inbox (ReadLocationComplete id_ (Location (Path path_) _ _)) rest2___)))
       (Program
         (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ path_ (Concat "Location: " path_) (Cons (Concat "Location: Read " path_) log_))) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Timer Effect ---
    (R "DelayedAction/Enqueue"
       (Apply DelayedAction (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue (Timer (Delay 2000))
                (Program (Apply (UpdateLastEffect "Timer started...") app_)
                         (Effects (Pending p___) inbox_)))
       10)

    (R "Timer/Complete"
       (Program (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_)) ui_)
                (Effects pending_ (Inbox (TimerComplete id_ _) rest___)))
       (Program
         (App (State (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ "Timer completed!" (Cons "Timer: 2s delay completed" log_))) ui_)
         (Effects pending_ (Inbox rest___))))

    ;; --- Helper Rules ---
    (R "UpdateLastEffect"
       (Apply (UpdateLastEffect msg_) (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ le_ log_))
       (EffectsDemo sv_ ss_ ct_ cs_ aa_ af_ ax_ rn_ cp_ msg_ log_))

    (R "SetStorageStatus"
       (Apply (SetStorageStatus status_) (EffectsDemo sv_ ss_ rest___))
       (EffectsDemo sv_ status_ rest___))

    ;; Generic enqueue rule - takes an effect term and inserts FreshId as first arg
    ;; Pattern: (Enqueue (EffectKind ...args) program-context)
    ;; Result: Adds (EffectKind (FreshId) ...args) to pending
    (R "Enqueue/Generic"
       (Enqueue (kind_ args___) (Program app_ (Effects (Pending p___) inbox_)))
       (Program
         app_
         (Effects
           (Pending p___ (kind_ (FreshId) args___))
           inbox_))
       100)  ; Very high priority to fire immediately

    ;; Special case for effects with no arguments (just the ID)
    (R "Enqueue/NoArgs"
       (Enqueue effectKind_ (Program app_ (Effects (Pending p___) inbox_)))
       (Program
         app_
         (Effects
           (Pending p___ (effectKind_ (FreshId)))
           inbox_))
       99)  ; Slightly lower than Generic but still very high

    ;; --- UI Projections ---
    (R "ShowStoredValue"
       (/@ (Show StoredValue) (App (State (EffectsDemo sv_ _ _ _ _ _ _ _ _ _ _)) _))
       sv_)

    (R "ShowStorageStatus"
       (/@ (Show StorageStatus) (App (State (EffectsDemo _ ss_ _ _ _ _ _ _ _ _ _)) _))
       ss_)

    (R "ShowClipboardText"
       (/@ (Show ClipboardText) (App (State (EffectsDemo _ _ ct_ _ _ _ _ _ _ _ _)) _))
       ct_)

    (R "ShowClipboardStatus"
       (/@ (Show ClipboardStatus) (App (State (EffectsDemo _ _ _ cs_ _ _ _ _ _ _ _)) _))
       cs_)

    (R "ShowAnimationActive"
       (/@ (Show AnimationActive) (App (State (EffectsDemo _ _ _ _ aa_ _ _ _ _ _ _)) _))
       aa_)

    (R "ShowAnimationFrame"
       (/@ (Show AnimationFrame) (App (State (EffectsDemo _ _ _ _ _ af_ _ _ _ _ _)) _))
       af_)

    (R "ShowAnimationX"
       (/@ (Show AnimationX) (App (State (EffectsDemo _ _ _ _ _ _ ax_ _ _ _ _)) _))
       ax_)

    ;; Animation style projection - computes the full style string
    (R "AnimationStyle"
       (/@ (AnimationStyle) (App (State (EffectsDemo _ _ _ _ _ _ ax_ _ _ _ _)) _))
       (Concat "transform: translateX(" (Concat (ToString ax_) "px); top: 38px;")))

    (R "ShowRandomNumber"
       (/@ (Show RandomNumber) (App (State (EffectsDemo _ _ _ _ _ _ _ rn_ _ _ _)) _))
       rn_)

    (R "ShowCurrentPath"
       (/@ (Show CurrentPath) (App (State (EffectsDemo _ _ _ _ _ _ _ _ cp_ _ _)) _))
       cp_)

    (R "ShowLastEffect"
       (/@ (Show LastEffect) (App (State (EffectsDemo _ _ _ _ _ _ _ _ _ le_ _)) _))
       le_)

    ;; Animation button projections
    (R "AnimButtonClass/Active"
       (/@ (AnimButtonClass) (App (State (EffectsDemo _ _ _ _ True _ _ _ _ _ _)) _))
       "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600")

    (R "AnimButtonClass/Inactive"
       (/@ (AnimButtonClass) (App (State (EffectsDemo _ _ _ _ False _ _ _ _ _ _)) _))
       "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600")

    (R "AnimButtonText/Active"
       (/@ (AnimButtonText) (App (State (EffectsDemo _ _ _ _ True _ _ _ _ _ _)) _))
       "Stop Animation")

    (R "AnimButtonText/Inactive"
       (/@ (AnimButtonText) (App (State (EffectsDemo _ _ _ _ False _ _ _ _ _ _)) _))
       "Start Animation")

    (R "RenderLog"
       (/@ (RenderLog) (App (State (EffectsDemo _ _ _ _ _ _ _ _ _ _ log_)) _))
       (If (IsNil log_) "No effects triggered yet" (RenderLogItems log_)))

    (R "RenderLogItems/Cons"
       (RenderLogItems (Cons item_ rest_))
       (Div :class "text-xs"
         (P :class "mb-1" item_)
         (RenderLogItems rest_)))

    (R "RenderLogItems/Nil"
       (RenderLogItems Nil)
       "")

    (R "IsNil/Nil" (IsNil Nil) True)
    (R "IsNil/Cons" (IsNil (Cons _ _)) False)

    ;; Conditionals
    (R "If/True"  (If True  a_ b_) a_)
    (R "If/False" (If False a_ b_) b_)
  )
)
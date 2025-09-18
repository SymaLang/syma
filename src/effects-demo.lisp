(Universe
  ;; ========= Program =========
  (Program
    (App
      (State
        (EffectsDemo
          ;; KV-based state structure
          (KV StoredValue     "")
          (KV StorageStatus   "Ready")
          (KV ClipboardText   "")
          (KV ClipboardStatus "Ready")
          (KV AnimationActive False)
          (KV AnimationFrame  0)
          (KV AnimationX      0)
          (KV RandomNumber    0)
          (KV CurrentPath     "/")
          (KV LastEffect      "None")
          (KV EffectLog       Nil)))

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

  )

  ;; ========= Rules =========
  (Rules

    ;; --- Generic KV Operations ---
    ;; Get value from KV list
    (R "GetKV/Here"
       (Get tag_ key_ (tag_ before___ (KV key_ v_) after___))
       v_)

    (R "GetKV/Skip"
       (Get tag_ key_ (tag_ (KV k_ _) rest___))
       (Get tag_ key_ (tag_ rest___))
       -100)  ;; Low priority to try Here first

    ;; Put value into KV list (replace existing)
    (R "PutKV/Replace"
       (Put tag_ key_ v_ (tag_ before___ (KV key_ _) after___))
       (tag_ before___ (KV key_ v_) after___))

    ;; Put value into KV list (insert if missing)
    (R "PutKV/Insert"
       (Put tag_ key_ v_ (tag_ fields___))
       (tag_ fields___ (KV key_ v_))
       -100)  ;; Low priority to try Replace first

    ;; Set is just Put with better name
    (R "SetField"
       (Set tag_ key_ v_ st_)
       (Put tag_ key_ v_ st_))

    ;; Patch multiple fields
    (R "Patch/End"
       (Patch tag_ st_)
       st_)

    (R "Patch/Step"
       (Patch tag_ st_ (KV k_ v_) more___)
       (Patch tag_ (Put tag_ k_ v_ st_) more___))

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
       (Apply (SaveToStorage value_) (Program (App (State st_) ui_) (Effects (Pending p___) inbox_)))
       (Enqueue (StorageSet (Store Local) (Key "demo-value") (Value value_))
                (Program (App (State (Patch EffectsDemo st_
                                        (KV StoredValue value_)
                                        (KV StorageStatus "Saving..."))) ui_)
                         (Effects (Pending p___) inbox_)))
       10)

    (R "StorageSet/Complete"
       (Program (App (State st_) ui_) (Effects pending_ (Inbox (StorageSetComplete id_ Ok) rest___)))
       (Program
         (App (State (Apply StorageSaved st_)) ui_)
         (Effects pending_ (Inbox rest___))))

    (R "StorageSaved"
       (Apply StorageSaved st_)
       (Patch EffectsDemo st_
                (KV StorageStatus "Saved!")
                (KV LastEffect "Storage: Saved")
                (KV EffectLog (Cons "Storage: Value saved" (Get EffectsDemo EffectLog st_)))))

    (R "LoadFromStorage/Enqueue"
       (Apply LoadFromStorage (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue (StorageGet (Store Local) (Key "demo-value"))
                (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "StorageGet/Found"
       (Program (App (State st_) ui_)
                (Effects pending_ (Inbox (StorageGetComplete id_ (Found value_)) rest2___)))
       (Program
         (App (State (Patch EffectsDemo st_
                        (KV StoredValue value_)
                        (KV StorageStatus "Loaded!")
                        (KV LastEffect "Storage: Loaded")
                        (KV EffectLog (Cons (Concat "Storage: Loaded " value_) (Get EffectsDemo EffectLog st_))))) ui_)
         (Effects pending_ (Inbox rest2___))))

    (R "StorageGet/Missing"
       (Program (App (State st_) ui_)
                (Effects pending_ (Inbox (StorageGetComplete id_ Missing) rest2___)))
       (Program
         (App (State (Patch EffectsDemo st_
                        (KV StoredValue "")
                        (KV StorageStatus "No stored value")
                        (KV LastEffect "Storage: Not found")
                        (KV EffectLog (Cons "Storage: No value found" (Get EffectsDemo EffectLog st_))))) ui_)
         (Effects pending_ (Inbox rest2___))))

    (R "ClearStorage/Enqueue"
       (Apply ClearStorage (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue (StorageDel (Store Local) (Key "demo-value"))
                (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "StorageDel/Complete"
       (Program (App (State st_) ui_)
                (Effects pending_ (Inbox (StorageDelComplete id_ Ok) rest2___)))
       (Program
         (App (State (Patch EffectsDemo st_
                        (KV StoredValue "")
                        (KV StorageStatus "Cleared!")
                        (KV LastEffect "Storage: Cleared")
                        (KV EffectLog (Cons "Storage: Value cleared" (Get EffectsDemo EffectLog st_))))) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Clipboard Effects ---
    (R "CopyToClipboard/Enqueue"
       (Apply (CopyToClipboard text_) (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue (ClipboardWrite (Text text_))
                (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "ClipboardWrite/Complete"
       (Program (App (State st_) ui_)
                (Effects pending_ (Inbox (ClipboardWriteComplete id_ Ok) rest2___)))
       (Program
         (App (State (Patch EffectsDemo st_
                        (KV ClipboardStatus "Copied!")
                        (KV LastEffect "Clipboard: Copied")
                        (KV EffectLog (Cons "Clipboard: Text copied" (Get EffectsDemo EffectLog st_))))) ui_)
         (Effects pending_ (Inbox rest2___))))

    (R "PasteFromClipboard/Enqueue"
       (Apply PasteFromClipboard (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue ClipboardRead
                (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "ClipboardRead/Complete"
       (Program (App (State st_) ui_)
                (Effects pending_ (Inbox (ClipboardReadComplete id_ (Text text_)) rest2___)))
       (Program
         (App (State (Patch EffectsDemo st_
                        (KV ClipboardText text_)
                        (KV ClipboardStatus "Pasted!")
                        (KV LastEffect "Clipboard: Pasted")
                        (KV EffectLog (Cons (Concat "Clipboard: Pasted " text_) (Get EffectsDemo EffectLog st_))))) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Animation Effects ---
    ;; Toggle animation state - match on actual KV structure
    (R "ToggleAnimation/Start"
       (Apply ToggleAnimation (State (EffectsDemo before___ (KV AnimationActive False) after___)))
       (State (EffectsDemo before___ (KV AnimationActive True) after___)))

    (R "ToggleAnimation/Stop"
       (Apply ToggleAnimation (State (EffectsDemo before___ (KV AnimationActive True) after___)))
       (State (EffectsDemo before___ (KV AnimationActive False) after___)))

    ;; When toggling animation on, start with effect
    (R "ToggleAnimation/StartWithEffect"
       (Apply ToggleAnimation (Program (App (State (EffectsDemo before___ (KV AnimationActive False) after___)) ui_)
                                      (Effects (Pending p___) inbox_)))
       (Enqueue AnimationFrame
                (Program (App (State (EffectsDemo before___ (KV AnimationActive True) after___)) ui_)
                         (Effects (Pending p___) inbox_)))
       10)  ; High priority

    ;; When toggling animation off, just update state
    (R "ToggleAnimation/StopWithEffect"
       (Apply ToggleAnimation (Program (App (State (EffectsDemo before___ (KV AnimationActive True) after___)) ui_) effects_))
       (Program
         (App (State (EffectsDemo before___ (KV AnimationActive False) after___)) ui_)
         effects_)
       10)  ; High priority

    ;; Process animation frame when active - update and request next
    (R "AnimationFrame/CompleteActive"
       (Program (App (State (EffectsDemo b1___ (KV AnimationActive True) b2___ (KV AnimationFrame frame_) b3___ (KV AnimationX x_) b4___)) ui_)
                (Effects pending_ (Inbox (AnimationFrameComplete id_ (Now ts_)) rest2___)))
       (Enqueue AnimationFrame
                (Program
                  (App (State (EffectsDemo b1___ (KV AnimationActive True) b2___ (KV AnimationFrame (Add frame_ 1)) b3___ (KV AnimationX (Mod (Add x_ 3) 300)) b4___)) ui_)
                  (Effects pending_ (Inbox rest2___)))))

    ;; Process animation frame when inactive - just consume the event
    (R "AnimationFrame/CompleteInactive"
       (Program (App (State (EffectsDemo before___ (KV AnimationActive False) after___)) ui_)
                (Effects pending_ (Inbox (AnimationFrameComplete id_ _) rest2___)))
       (Program
         (App (State (EffectsDemo before___ (KV AnimationActive False) after___)) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Random Effects ---
    (R "GenerateRandom/Enqueue"
       (Apply (GenerateRandom min_ max_) (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue (RandRequest min_ max_) (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "RandResponse/Process"
       (Program (App (State st_) ui_)
                (Effects pending_ (Inbox (RandResponse id_ value_) rest2___)))
       (Program
         (App (State (Patch EffectsDemo st_
                        (KV RandomNumber value_)
                        (KV LastEffect (Concat "Random: " (ToString value_)))
                        (KV EffectLog (Cons (Concat "Random: Generated " (ToString value_)) (Get EffectsDemo EffectLog st_))))) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Navigation Effects ---
    (R "NavigateTo/Enqueue"
       (Apply (NavigateTo path_) (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue (Navigate (Url path_)) (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "Navigate/Complete"
       (Program (App (State st_) ui_)
                (Effects pending_ (Inbox (NavigateComplete id_ Ok) rest2___)))
       (Program
         (App (State (Patch EffectsDemo st_
                        (KV LastEffect "Navigation: Complete")
                        (KV EffectLog (Cons "Navigation: URL updated" (Get EffectsDemo EffectLog st_))))) ui_)
         (Effects pending_ (Inbox rest2___))))

    (R "ReadCurrentLocation/Enqueue"
       (Apply ReadCurrentLocation (Program app_ (Effects (Pending p___) inbox_)))
       (Enqueue ReadLocation (Program app_ (Effects (Pending p___) inbox_)))
       10)

    (R "ReadLocation/Complete"
       (Program (App (State st_) ui_)
                (Effects pending_ (Inbox (ReadLocationComplete id_ (Location (Path path_) _ _)) rest2___)))
       (Program
         (App (State (Patch EffectsDemo st_
                        (KV CurrentPath path_)
                        (KV LastEffect (Concat "Location: " path_))
                        (KV EffectLog (Cons (Concat "Location: Read " path_) (Get EffectsDemo EffectLog st_))))) ui_)
         (Effects pending_ (Inbox rest2___))))

    ;; --- Timer Effect ---
    (R "DelayedAction/Enqueue"
       (Apply DelayedAction (Program (App (State st_) ui_) (Effects (Pending p___) inbox_)))
       (Enqueue (Timer (Delay 2000))
                (Program (App (State (Set EffectsDemo LastEffect "Timer started..." st_)) ui_)
                         (Effects (Pending p___) inbox_)))
       10)

    (R "Timer/Complete"
       (Program (App (State st_) ui_)
                (Effects pending_ (Inbox (TimerComplete id_ _) rest___)))
       (Program
         (App (State (Patch EffectsDemo st_
                        (KV LastEffect "Timer completed!")
                        (KV EffectLog (Cons "Timer: 2s delay completed" (Get EffectsDemo EffectLog st_))))) ui_)
         (Effects pending_ (Inbox rest___))))

    ;; --- Helper Rules ---
    (R "UpdateLastEffect"
       (Apply (UpdateLastEffect msg_) st_)
       (Set EffectsDemo LastEffect msg_ st_))

    (R "SetStorageStatus"
       (Apply (SetStorageStatus status_) st_)
       (Set EffectsDemo StorageStatus status_ st_))

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
       (/@ (Show StoredValue) (App (State st_) _))
       (Get EffectsDemo StoredValue st_))

    (R "ShowStorageStatus"
       (/@ (Show StorageStatus) (App (State st_) _))
       (Get EffectsDemo StorageStatus st_))

    (R "ShowClipboardText"
       (/@ (Show ClipboardText) (App (State st_) _))
       (Get EffectsDemo ClipboardText st_))

    (R "ShowClipboardStatus"
       (/@ (Show ClipboardStatus) (App (State st_) _))
       (Get EffectsDemo ClipboardStatus st_))

    (R "ShowAnimationActive"
       (/@ (Show AnimationActive) (App (State st_) _))
       (Get EffectsDemo AnimationActive st_))

    (R "ShowAnimationFrame"
       (/@ (Show AnimationFrame) (App (State st_) _))
       (Get EffectsDemo AnimationFrame st_))

    (R "ShowAnimationX"
       (/@ (Show AnimationX) (App (State st_) _))
       (Get EffectsDemo AnimationX st_))

    ;; Animation style projection - computes the full style string
    (R "AnimationStyle"
       (/@ (AnimationStyle) (App (State st_) _))
       (Concat "transform: translateX(" (Concat (ToString (Get EffectsDemo AnimationX st_)) "px); top: 38px;")))

    (R "ShowRandomNumber"
       (/@ (Show RandomNumber) (App (State st_) _))
       (Get EffectsDemo RandomNumber st_))

    (R "ShowCurrentPath"
       (/@ (Show CurrentPath) (App (State st_) _))
       (Get EffectsDemo CurrentPath st_))

    (R "ShowLastEffect"
       (/@ (Show LastEffect) (App (State st_) _))
       (Get EffectsDemo LastEffect st_))

    ;; Animation button projections - match on the actual state structure
    (R "AnimButtonClass/Active"
       (/@ (AnimButtonClass) (App (State (EffectsDemo before___ (KV AnimationActive True) after___)) _))
       "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600")

    (R "AnimButtonClass/Inactive"
       (/@ (AnimButtonClass) (App (State (EffectsDemo before___ (KV AnimationActive False) after___)) _))
       "px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600")

    (R "AnimButtonText/Active"
       (/@ (AnimButtonText) (App (State (EffectsDemo before___ (KV AnimationActive True) after___)) _))
       "Stop Animation")

    (R "AnimButtonText/Inactive"
       (/@ (AnimButtonText) (App (State (EffectsDemo before___ (KV AnimationActive False) after___)) _))
       "Start Animation")

    (R "RenderLog"
       (/@ (RenderLog) (App (State st_) _))
       (If (IsNil (Get EffectsDemo EffectLog st_)) "No effects triggered yet" (RenderLogItems (Get EffectsDemo EffectLog st_))))

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
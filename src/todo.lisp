(Universe
  ;; ========= Program =========
  (Program
    (App
      (State
        (TodoState
          (NextId 1)
          (Items)                 ; list of Item[id Num, title Str, done Sym[True|False]]
          (Filter All)))          ; All | Active | Done
      (UI
        (Div :class "max-w-2xl mx-auto p-6"
          (Div :class "bg-white rounded-xl shadow-lg p-8"
            (H1 :class "text-3xl font-bold text-gray-800 mb-6" "Symbolic Todos")
            (Div :class "flex gap-2 mb-6"
            (Input :type "text"
                   :placeholder "Enter todo title..."
                   :class "flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                   :value (Input todoInput)
                   :onKeydown (When (KeyIs "Enter")
                                (PreventDefault
                                  (Seq
                                    (AddTodoWithTitle (Input todoInput))
                                    (ClearInput todoInput)))))
            (Button :onClick (Seq
                              (AddTodoWithTitle (Input todoInput))
                              (ClearInput todoInput))
                    :class "px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors" "Add")
            (Button :onClick Add3 :class "px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors" "Add 3")
            (Button :onClick TestTimer :class "px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors" "Test Timer")
            (Button :onClick TestPrint :class "px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors" "Test Print")
            (Span :class "px-4 py-2 text-gray-600 font-medium" "Active: " (Show LeftCount)))
          ;; The list is rendered by projecting a symbolic node that rules expand to real UI
          (Project (RenderTodos))
          (Div :class "flex gap-2 justify-center mt-6"
            (Button :onClick (SetFilter All)  :class "px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 transition-colors" "All")
            (Button :onClick (SetFilter Active) :class "px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors" "Active")
            (Button :onClick (SetFilter Done) :class "px-4 py-2 rounded-lg text-sm font-medium bg-green-100 hover:bg-green-200 text-green-700 transition-colors" "Done"))))))
    ;; Effects lane for symbolic I/O
    (Effects (Pending) (Inbox)))

  ;; ========= Rules =========
  (Rules

    ;; --- Lifters (push Apply through shells) ---
    ;; Updated to handle Program with Effects
    (R "LiftApplyThroughProgram"
       (Apply act_ (Program app_ eff_))
       (Program (Apply act_ app_) eff_))

    (R "LiftApplyThroughApp"
       (Apply act_ (App st_ ui_))
       (App (Apply act_ st_) ui_))

    (R "LiftApplyThroughState"
       (Apply act_ (State s_))
       (State (Apply act_ s_)))

    ;; --- Domain: structure ---
    ;; Item := (Item (Id n) (Title "…") (Done True|False))
    ;; TodoState := (TodoState (NextId n) (Items ...list...) (Filter F))

    ;; --- Add single todo with custom title ---
    ;; Skip empty titles
    (R "AddTodoWithTitle/Empty"
       (Apply (AddTodoWithTitle (Str ""))
         state_)
       state_)

    (R "AddTodoWithTitle"
       (Apply (AddTodoWithTitle title_)
         (TodoState (NextId n_) (Items items___) (Filter f_)))
       (TodoState
         (NextId (Add n_ 1))
         (Items
           items___
           (Item (Id n_) (Title title_) (Done False)))
         (Filter f_)))

    ;; --- Add single todo with default title ---
    (R "AddTodo"
       (Apply AddTodo
         (TodoState (NextId n_) (Items items___) (Filter f_)))
       (TodoState
         (NextId (Add n_ 1))
         (Items
           items___
           (Item (Id n_) (Title (Str "Task ")) (Done False)))
         (Filter f_)))

    ;; --- Add 3 todos (macro via composition) ---
    (R "Add3-1"
       (Apply Add3 st_)
       (Apply Add3-2 (Apply AddTodo st_)))
    (R "Add3-2"
       (Apply Add3-2 st_)
       (Apply Add3-3 (Apply AddTodo st_)))
    (R "Add3-3"
       (Apply Add3-3 st_)
       (Apply AddTodo st_))

    ;; --- Toggle by id ---
    (R "Toggle"
       (Apply (Toggle id_)
         (TodoState (NextId n_) (Items before___ (Item (Id id_) (Title t_) (Done d_)) after___) (Filter f_)))
       (TodoState
         (NextId n_)
         (Items before___
                (Item (Id id_) (Title t_) (Done (Flip d_)))
                after___)
         (Filter f_)))

    ;; Flip True/False
    (R "FlipTrue"  (Flip True)  False)
    (R "FlipFalse" (Flip False) True)

    ;; --- Remove by id ---
    (R "Remove"
       (Apply (Remove id_)
         (TodoState (NextId n_) (Items before___ (Item (Id id_) (Title t_) (Done d_)) after___) (Filter f_)))
       (TodoState
         (NextId n_)
         (Items before___ after___)
         (Filter f_)))

    ;; --- Set filter ---
    (R "SetFilter"
       (Apply (SetFilter flt_)
         (TodoState (NextId n_) (Items rest___) (Filter _)))
       (TodoState (NextId n_) (Items rest___) (Filter flt_)))

    ;; --- Effects demo: Timer ---
    ;; TestTimer is a no-op at the state level
    (R "TestTimer/State"
       (Apply TestTimer state_)
       state_)

    ;; TestTimer action enqueues a timer effect at Program level (high priority to match before lifters)
    (R "TestTimer/Enqueue"
       (Apply TestTimer (Program app_ (Effects (Pending p___) inbox_)))
       (Program
         app_
         (Effects
           (Pending p___ (Timer (FreshId) (Delay 2000)))
           inbox_))
       10)  ; High priority to match before lifters

    ;; When timer completes, add a demo todo with custom title
    (R "TimerComplete/Process"
       (Program
         (App (Var state) (Var ui))
         (Effects (Var pending) (Inbox (TimerComplete (Var id) _) (Var rest___))))
       (Program
         (Apply (AddTodoWithTitle (Str "Timer completed!")) (App (Var state) (Var ui)))
         (Effects (Var pending) (Inbox (Var rest___)))))

    ;; --- Print effect demo ---
    ;; TestPrint is a no-op at the state level
    (R "TestPrint/State"
       (Apply TestPrint (Var state))
       (Var state))

    ;; TestPrint action enqueues a print effect at Program level
    (R "TestPrint/Enqueue"
       (Apply TestPrint (Program (App (State (TodoState (Var n) (Items (Var items___)) (Var f))) (Var ui)) (Effects (Pending (Var p___)) (Var inbox))))
       (Program
         (App (State (TodoState (Var n) (Items (Var items___)) (Var f))) (Var ui))
         (Effects
           (Pending (Var p___) (Print (FreshId) (Message (Concat "Todo list has " (Length (Var items___)) " items"))))
           (Var inbox)))
       10)  ; High priority to match before lifters

    ;; When print completes, just consume the response
    (R "PrintComplete/Process"
       (Program
         (Var app)
         (Effects (Var pending) (Inbox (PrintComplete _ _) (Var rest___))))
       (Program
         (Var app)
         (Effects (Var pending) (Inbox (Var rest___)))))

    ;; ---------- Projection layer ----------

    ;; Count of active items (for header)
    (R "ShowLeftCount/Empty"
       (/@ (Show LeftCount)
           (App (State (TodoState (NextId _) (Items) (Filter _))) _))
       0)

    (R "ShowLeftCount/NonEmpty"
       (/@ (Show LeftCount)
           (App (State (TodoState (NextId _) (Items rest___) (Filter _))) _))
       (CountActive rest___))

    ;; CountActive over a list (linear recursion)
    (R "CountActive/Nil"
       (CountActive)
       0)
    (R "CountActive/Cons-Active"
       (CountActive (Item (Id _) (Title _) (Done False)) (Var rest___))
       (Add 1 (CountActive (Var rest___))))
    (R "CountActive/Cons-Done"
       (CountActive (Item (Id _) (Title _) (Done True)) (Var rest___))
       (CountActive (Var rest___)))

    ;; RenderTodos → expand into concrete UI (Ul …)
    (R "RenderTodos"
       (/@ (RenderTodos)
           (App (State (TodoState (NextId _) (Items rest___) (Filter (Var flt)))) _))
       (Div :class "space-y-2" (RenderList (Var flt) rest___)))

    ;; RenderList dispatch on filter
    ;; Handle empty list case first
    (R "RenderList/All-Empty"
       (RenderList All)
       (Div :class "text-center py-8 text-gray-400" "No items yet"))

    (R "RenderList/All"
       (RenderList All items___)
       (RenderItems items___))

    (R "RenderList/Active"
       (RenderList Active items___)
       (RenderItems (FilterActive items___)))

    (R "RenderList/Done"
       (RenderList Done items___)
       (RenderItems (FilterDone items___)))

    ;; Filtering fused into RenderItems so results splice in-place
    (R "RenderItems/FilterActive-Nil"
       (RenderItems (FilterActive))
       (RenderItems))
    (R "RenderItems/FilterActive-Keep"
       (RenderItems (FilterActive (Item (Id (Var i)) (Title (Var t)) (Done False)) (Var rest___)))
       (RenderItems (Item (Id (Var i)) (Title (Var t)) (Done False)) (FilterActive (Var rest___))))
    (R "RenderItems/FilterActive-Skip"
       (RenderItems (FilterActive (Item (Id _) (Title _) (Done True)) (Var rest___)))
       (RenderItems (FilterActive (Var rest___))))

    (R "RenderItems/FilterDone-Nil"
       (RenderItems (FilterDone))
       (RenderItems))
    (R "RenderItems/FilterDone-Keep"
       (RenderItems (FilterDone (Item (Id (Var i)) (Title (Var t)) (Done True)) (Var rest___)))
       (RenderItems (Item (Id (Var i)) (Title (Var t)) (Done True)) (FilterDone (Var rest___))))
    (R "RenderItems/FilterDone-Skip"
       (RenderItems (FilterDone (Item (Id _) (Title _) (Done False)) (Var rest___)))
       (RenderItems (FilterDone (Var rest___))))

    ;; Turn a (proper) list of Item[...] into rows
    ;; IMPORTANT: Use higher priority for Cons to match before Nil
    (R "RenderItems/Cons"
       (RenderItems (Item (Id (Var i)) (Title (Var t)) (Done (Var d))) (Var rest___))
       (Div :class "w-full"
         (Div :class "flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors mb-2"
           (Button :onClick (Toggle (Var i)) :class "text-2xl" (If (Var d) "✅" "⬜"))
           (Span :class (If (Var d) "flex-1 line-through text-gray-400" "flex-1 text-gray-700") (Var t))
           (Button :onClick (Remove (Var i)) :class "text-red-500 hover:text-red-700 text-xl" "×"))
         (RenderItems (Var rest___)))
       1)  ; Priority 1 to match before Nil

    (R "RenderItems/Nil"
       (RenderItems)
       (Span))  ; Empty span - just a terminator for recursion

    ;; Tiny If that chooses between two Strs based on True/False
    (R "If/True"  (If True  a_ b_) a_)
    (R "If/False" (If False a_ b_) b_)

    ;; ---------- Show primitives ----------
    (R "ShowCount"
       (/@ (Show Count)
           (App (State (TodoState (NextId _) (Items rest___) (Filter _))) _))
       (Length (Var rest___)))

    ;; list length
    (R "Length/Nil" (Length) 0)
    (R "Length/Cons" (Length _ (Var rest___)) (Add 1 (Length (Var rest___))))

  )

  ;; Optional: meta-rules to tweak UI or behavior live
  (RuleRules
    ;; Example: make Remove into a no-op by rewriting the Remove rule RHS
    ;; (R "NoDelete"
    ;;    (R "Remove" (Var lhs) (Var rhs))
    ;;    (R "Remove" (Var lhs) (Var lhs)))
  )
)
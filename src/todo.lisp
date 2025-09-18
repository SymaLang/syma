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
            (Span :class "px-4 py-2 text-gray-600 font-medium" "Active: " (Show LeftCount)))
          ;; The list is rendered by projecting a symbolic node that rules expand to real UI
          (Project (RenderTodos))
          (Div :class "flex gap-2 justify-center mt-6"
            (Button :onClick (SetFilter All)  :class "px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 transition-colors" "All")
            (Button :onClick (SetFilter Active) :class "px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors" "Active")
            (Button :onClick (SetFilter Done) :class "px-4 py-2 rounded-lg text-sm font-medium bg-green-100 hover:bg-green-200 text-green-700 transition-colors" "Done")))))))

  ;; ========= Rules =========
  (Rules

    ;; --- Lifters (push Apply through shells) ---
    (R "LiftApplyThroughApp"
       (Apply (Var act) (App (Var st) (Var ui)))
       (App (Apply (Var act) (Var st)) (Var ui)))

    (R "LiftApplyThroughState"
       (Apply (Var act) (State (Var s)))
       (State (Apply (Var act) (Var s))))

    ;; --- Domain: structure ---
    ;; Item := (Item (Id n) (Title "…") (Done True|False))
    ;; TodoState := (TodoState (NextId n) (Items ...list...) (Filter F))

    ;; --- Add single todo with custom title ---
    ;; Skip empty titles
    (R "AddTodoWithTitle/Empty"
       (Apply (AddTodoWithTitle (Str ""))
         (Var state))
       (Var state))

    (R "AddTodoWithTitle"
       (Apply (AddTodoWithTitle (Var title))
         (TodoState (NextId (Var n)) (Items (Var ___)) (Filter (Var f))))
       (TodoState
         (NextId (Add (Var n) 1))
         (Items
           (Var ___)
           (Item (Id (Var n)) (Title (Var title)) (Done False)))
         (Filter (Var f))))

    ;; --- Add single todo with default title ---
    (R "AddTodo"
       (Apply AddTodo
         (TodoState (NextId (Var n)) (Items (Var ___)) (Filter (Var f))))
       (TodoState
         (NextId (Add (Var n) 1))
         (Items
           (Var ___)
           (Item (Id (Var n)) (Title (Str "Task ")) (Done False)))
         (Filter (Var f))))

    ;; --- Add 3 todos (macro via composition) ---
    (R "Add3-1"
       (Apply Add3 (Var st))
       (Apply Add3-2 (Apply AddTodo (Var st))))
    (R "Add3-2"
       (Apply Add3-2 (Var st))
       (Apply Add3-3 (Apply AddTodo (Var st))))
    (R "Add3-3"
       (Apply Add3-3 (Var st))
       (Apply AddTodo (Var st)))

    ;; --- Toggle by id ---
    (R "Toggle"
       (Apply (Toggle (Var id))
         (TodoState (NextId (Var n)) (Items (Var before___) (Item (Id (Var id)) (Title (Var t)) (Done (Var d))) (Var after___)) (Filter (Var f))))
       (TodoState
         (NextId (Var n))
         (Items (Var before___)
                (Item (Id (Var id)) (Title (Var t)) (Done (Flip (Var d))))
                (Var after___))
         (Filter (Var f))))

    ;; Flip True/False
    (R "FlipTrue"  (Flip True)  False)
    (R "FlipFalse" (Flip False) True)

    ;; --- Remove by id ---
    (R "Remove"
       (Apply (Remove (Var id))
         (TodoState (NextId (Var n)) (Items (Var before___) (Item (Id (Var id)) (Title (Var t)) (Done (Var d))) (Var after___)) (Filter (Var f))))
       (TodoState
         (NextId (Var n))
         (Items (Var before___) (Var after___))
         (Filter (Var f))))

    ;; --- Set filter ---
    (R "SetFilter"
       (Apply (SetFilter (Var flt))
         (TodoState (NextId (Var n)) (Items (Var ___)) (Filter (Var _))))
       (TodoState (NextId (Var n)) (Items (Var ___)) (Filter (Var flt))))

    ;; ---------- Projection layer ----------

    ;; Count of active items (for header)
    (R "ShowLeftCount/Empty"
       (/@ (Show LeftCount)
           (App (State (TodoState (NextId (Var _)) (Items) (Filter (Var _)))) (Var _)))
       0)

    (R "ShowLeftCount/NonEmpty"
       (/@ (Show LeftCount)
           (App (State (TodoState (NextId (Var _)) (Items (Var ___)) (Filter (Var _)))) (Var _)))
       (CountActive (Var ___)))

    ;; CountActive over a list (linear recursion)
    (R "CountActive/Nil"
       (CountActive)
       0)
    (R "CountActive/Cons-Active"
       (CountActive (Item (Id (Var _)) (Title (Var _)) (Done False)) (Var rest___))
       (Add 1 (CountActive (Var rest___))))
    (R "CountActive/Cons-Done"
       (CountActive (Item (Id (Var _)) (Title (Var _)) (Done True)) (Var rest___))
       (CountActive (Var rest___)))

    ;; RenderTodos → expand into concrete UI (Ul …)
    (R "RenderTodos"
       (/@ (RenderTodos)
           (App (State (TodoState (NextId (Var _)) (Items (Var ___)) (Filter (Var flt)))) (Var _)))
       (Div :class "space-y-2" (RenderList (Var flt) (Var ___))))

    ;; RenderList dispatch on filter
    ;; Handle empty list case first
    (R "RenderList/All-Empty"
       (RenderList All)
       (Div :class "text-center py-8 text-gray-400" "No items yet"))

    (R "RenderList/All"
       (RenderList All (Var items___))
       (RenderItems (Var items___)))

    (R "RenderList/Active"
       (RenderList Active (Var items___))
       (RenderItems (FilterActive (Var items___))))

    (R "RenderList/Done"
       (RenderList Done (Var items___))
       (RenderItems (FilterDone (Var items___))))

    ;; Filtering fused into RenderItems so results splice in-place
    (R "RenderItems/FilterActive-Nil"
       (RenderItems (FilterActive))
       (RenderItems))
    (R "RenderItems/FilterActive-Keep"
       (RenderItems (FilterActive (Item (Id (Var i)) (Title (Var t)) (Done False)) (Var rest___)))
       (RenderItems (Item (Id (Var i)) (Title (Var t)) (Done False)) (FilterActive (Var rest___))))
    (R "RenderItems/FilterActive-Skip"
       (RenderItems (FilterActive (Item (Id (Var _)) (Title (Var _)) (Done True)) (Var rest___)))
       (RenderItems (FilterActive (Var rest___))))

    (R "RenderItems/FilterDone-Nil"
       (RenderItems (FilterDone))
       (RenderItems))
    (R "RenderItems/FilterDone-Keep"
       (RenderItems (FilterDone (Item (Id (Var i)) (Title (Var t)) (Done True)) (Var rest___)))
       (RenderItems (Item (Id (Var i)) (Title (Var t)) (Done True)) (FilterDone (Var rest___))))
    (R "RenderItems/FilterDone-Skip"
       (RenderItems (FilterDone (Item (Id (Var _)) (Title (Var _)) (Done False)) (Var rest___)))
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
    (R "If/True"  (If True  (Var a) (Var b)) (Var a))
    (R "If/False" (If False (Var a) (Var b)) (Var b))

    ;; ---------- Show primitives ----------
    (R "ShowCount"
       (/@ (Show Count)
           (App (State (TodoState (NextId (Var _)) (Items (Var ___)) (Filter (Var _)))) (Var _)))
       (Length (Var ___)))

    ;; list length
    (R "Length/Nil" (Length) 0)
    (R "Length/Cons" (Length (Var _) (Var rest___)) (Add 1 (Length (Var rest___))))

  )

  ;; Optional: meta-rules to tweak UI or behavior live
  (RuleRules
    ;; Example: make Remove into a no-op by rewriting the Remove rule RHS
    ;; (R "NoDelete"
    ;;    (R "Remove" (Var lhs) (Var rhs))
    ;;    (R "Remove" (Var lhs) (Var lhs)))
  )
)
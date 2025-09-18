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
        (Div :class "card"
          (H1 "Symbolic Todos")
          (Div :class "controls"
            (Input :type "text"
                   :placeholder "Enter todo title..."
                   :value (Input todoInput)
                   :onKeydown (When (KeyIs "Enter")
                                (PreventDefault
                                  (Seq
                                    (AddTodoWithTitle (Input todoInput))
                                    (ClearInput todoInput)))))
            (Button :onClick (Seq
                              (AddTodoWithTitle (Input todoInput))
                              (ClearInput todoInput))
                    :class "btn" "Add")
            (Button :onClick Add3 :class "btn" "Add 3 Tasks")
            (Span :class "count" "Left: " (Show LeftCount))
    )
          ;; The list is rendered by projecting a symbolic node that rules expand to real UI
          (Project (RenderTodos))
          (Div :class "filters"
            (Button :onClick (SetFilter All)  :class "btn" "All")
            (Button :onClick (SetFilter Active) :class "btn" "Active")
            (Button :onClick (SetFilter Done) :class "btn" "Done"))
    )
    )
    )
    )

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
       (Ul :class "todos" (RenderList (Var flt) (Var ___))))

    ;; RenderList dispatch on filter
    (R "RenderList/All"
       (RenderList All (Var ___))
       (RenderItems (Var ___)))
    (R "RenderList/Active"
       (RenderList Active (Var ___))
       (RenderItems (FilterActive (Var ___))))
    (R "RenderList/Done"
       (RenderList Done (Var ___))
       (RenderItems (FilterDone (Var ___))))

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

    ;; Turn a (proper) list of Item[...] into <li> rows
    (R "RenderItems/Nil"
       (RenderItems)
       (Span :class "empty" "No items"))
    (R "RenderItems/Cons"
       (RenderItems (Item (Id (Var i)) (Title (Var t)) (Done (Var d))) (Var rest___))
       (Fragment
         (Li :class "row"
           (Button :onClick (Toggle (Var i)) :class "toggle" (If (Var d) "✅" "⬜"))
           (Span :class (If (Var d) "done" "open") (Var t) (Var i))
           (Button :onClick (Remove (Var i)) :class "remove" "✖"))
         (RenderItems (Var rest___))))


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
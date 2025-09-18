(Universe
  (Program
    (App
      (State (Count 0))
      (UI
        (Div :class "card"
          (H1 "Counter")
          (P "Value: " (Show Count))
          (Button :onClick Inc :class "btn" "Increment")))))
  (Rules
    (R "LiftApplyThroughApp"
       (Apply (Var act) (App (Var st) (Var ui)))
       (App (Apply (Var act) (Var st)) (Var ui)))
    (R "Inc"
       (Apply Inc (State (Count (Var n))))
       (State (Count (Add (Var n) 1))))
    (R "ShowCount"
       (/@ (Show Count) (App (State (Count (Var n))) _))
       (Var n)))
  (RuleRules
    ;; Meta-rule: patch Inc to add 2 instead of 1
    (R "PatchIncAdd"
       (R "Inc" (Var lhs)
          (State (Count (Add (Var n) 1))))
       (R "Inc" (Var lhs)
          (State (Count (Add (Var n) 2)))))
  ))
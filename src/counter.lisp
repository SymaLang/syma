(Universe
  (Program
    (App
      (State (Count 0))
      (UI
        (VStack
          (Text "Value: " (Show Count))
          (Button "Increment" (OnClick Inc))))))
  (Rules
    (R "LiftApplyThroughApp"
       (Apply (Var act) (App (Var st) (Var ui)))
       (App (Apply (Var act) (Var st)) (Var ui)))

    (R "Inc"
       (Apply Inc (State (Count (Var n))))
       (State (Count (Add (Var n) 1))))

    (R "ShowCount"
       (/@ (Show Count)
           (App (State (Count (Var n))) _))
       (Var n))))
(Universe
  ;; ========= Program =========
  (Program
    (App
      (State
        (BFState      ; Zipper over the tape
          Nil         ; Left of the current cell (empty)
          0           ; Current cell value
          Nil         ; Right of the current cell (empty)
          0           ; Instruction Pointer
;          "+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++." ; This prints 'A'
          "++++++++++[>++++++<-]>+++++." ; This should also print 'A', now it prints
;           "++++++[->++++++++++[->+<]<]>>+++++." ; Also 'A', but with nested loops
;           "++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++." ; Hello World!
          ""          ; Output collected
        )
        )
      (UI
        (Div :class "max-w-2xl mx-auto p-6"
        (H1 "Brainfuck Interpreter" :class "text-3xl font-bold mb-4")
        (Div :class "mb-4"
          (Button :onClick Step :class "bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2" "Step")
          (Button :onClick RunToEnd :class "bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded" "Run")
        )
        (Div :class "mb-4 p-4 bg-gray-100 rounded"
          (P :class "font-mono" "Tape: " (Show Tape))
        )
        (Div :class "mb-4 p-4 bg-gray-100 rounded"
          (P :class "font-mono" "Current Cell: " (Show CurrentCell))
          (P :class "font-mono" "IP: " (Show InstructionPointer))
          (P :class "font-mono" "Current Instruction: " (Show CurrentInstruction))
        )
        (Div :class "p-4 bg-gray-900 text-green-400 rounded"
          (P :class "font-mono whitespace-pre" "Output: " (Show Output))
        )
    ))
    )
    ;; Effects lane for timer-based execution
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

    ;; --- Main BF Actions ---
    (R "Step"
       (Apply Step (BFState left_ curr_ right_ ip_ code_ out_))
       (BFStep left_ curr_ right_ ip_ code_ out_))

    ;; --- Timer-based Run execution ---
    ;; RunToEnd is a no-op at the state level
    (R "RunToEnd/State"
       (Apply RunToEnd state_)
       state_)

    ;; RunToEnd enqueues a timer effect at Program level to start execution
    (R "RunToEnd/Enqueue"
       (Apply RunToEnd (Program app_ (Effects (Pending p___) inbox_)))
       (Program
         app_
         (Effects
           (Pending p___ (Timer (BFStepTimer 0) (Delay 0)))  ; Immediate timer with step counter
           inbox_))
       10)  ; High priority to match before lifters

    ;; When timer completes, execute a step and check if we should continue
    (R "BFStepTimer/Process"
       (Program
         (App (State (BFState left_ curr_ right_ ip_ code_ out_)) ui_)
         (Effects pending_ (Inbox (TimerComplete (BFStepTimer count_) _) rest___)))
       (If (And (Lt ip_ (StrLen code_)) (Lt count_ 10000))  ; Stop at end or after 10000 steps
           ;; Not at end and under limit: execute Step and enqueue another timer
           (Program
             (Apply Step (App (State (BFState left_ curr_ right_ ip_ code_ out_)) ui_))
             (Effects
               (Pending (Timer (BFStepTimer (Add count_ 1)) (Delay 0)))  ; Continue with next step
               (Inbox rest___)))
           ;; At end or limit reached: stop running
           (Program
             (App (State (BFState left_ curr_ right_ ip_ code_ out_)) ui_)
             (Effects pending_ (Inbox rest___)))))

    ;; --- BFStep: Execute one instruction ---
    (R "BFStep/End"
       (BFStep left_ curr_ right_ ip_ code_ out_)
       (BFState left_ curr_ right_ ip_ code_ out_)
       (Gte ip_ (StrLen code_)))

    (R "BFStep/Execute"
       (BFStep left_ curr_ right_ ip_ code_ out_)
       (BFExec (Substring code_ ip_ (Add ip_ 1)) left_ curr_ right_ ip_ code_ out_)
       -5)

    ;; --- BFExec: Execute specific instruction ---
    ;; Move right >
    (R "BFExec/Right/Empty"
       (BFExec ">" left_ curr_ Nil ip_ code_ out_)
       (BFState (Cons curr_ left_) 0 Nil (Add ip_ 1) code_ out_))

    (R "BFExec/Right/Cons"
       (BFExec ">" left_ curr_ (Cons first_ rest_) ip_ code_ out_)
       (BFState (Cons curr_ left_) first_ rest_ (Add ip_ 1) code_ out_))

    ;; Move left <
    (R "BFExec/Left/Empty"
       (BFExec "<" Nil curr_ right_ ip_ code_ out_)
       (BFState Nil 0 (Cons curr_ right_) (Add ip_ 1) code_ out_))

    (R "BFExec/Left/Cons"
       (BFExec "<" (Cons first_ rest_) curr_ right_ ip_ code_ out_)
       (BFState rest_ first_ (Cons curr_ right_) (Add ip_ 1) code_ out_))

    ;; Increment +
    (R "BFExec/Inc"
       (BFExec "+" left_ curr_ right_ ip_ code_ out_)
       (BFState left_ (Mod (Add curr_ 1) 256) right_ (Add ip_ 1) code_ out_))

    ;; Decrement -
    ;; Special cases to handle wrapping since JS % can be negative
    (R "BFExec/Dec/Zero"
       (BFExec "-" left_ 0 right_ ip_ code_ out_)
       (BFState left_ 255 right_ (Add ip_ 1) code_ out_))

    (R "BFExec/Dec/NonZero"
       (BFExec "-" left_ curr_ right_ ip_ code_ out_)
       (BFState left_ (Sub curr_ 1) right_ (Add ip_ 1) code_ out_)
       (Gt curr_ 0))

    ;; Output .
    (R "BFExec/Output"
       (BFExec "." left_ curr_ right_ ip_ code_ out_)
       (BFState left_ curr_ right_ (Add ip_ 1) code_ (Concat out_ (CharFromCode curr_))))

    ;; Input , (always input 0 for simplicity)
    (R "BFExec/Input"
       (BFExec "," left_ curr_ right_ ip_ code_ out_)
       (BFState left_ 0 right_ (Add ip_ 1) code_ out_))

    ;; Loop start [
    (R "BFExec/LoopStart/Zero"
       (BFExec "[" left_ 0 right_ ip_ code_ out_)
       (BFState left_ 0 right_ (Add (FindMatchingBracket code_ ip_ 1 0) 1) code_ out_))

    (R "BFExec/LoopStart/NonZero"
       (BFExec "[" left_ curr_ right_ ip_ code_ out_)
       (BFState left_ curr_ right_ (Add ip_ 1) code_ out_)
       (Neq curr_ 0))

    ;; Loop end ]
    (R "BFExec/LoopEnd/Zero"
       (BFExec "]" left_ 0 right_ ip_ code_ out_)
       (BFState left_ 0 right_ (Add ip_ 1) code_ out_))

    (R "BFExec/LoopEnd/NonZero"
       (BFExec "]" left_ curr_ right_ ip_ code_ out_)
       (BFJumpBack left_ curr_ right_ ip_ code_ out_)
       (Neq curr_ 0))

    ;; Separate rule to handle the jump back
    (R "BFJumpBack"
       (BFJumpBack left_ curr_ right_ ip_ code_ out_)
       (BFState left_ curr_ right_ (FindMatchingBracketBack code_ (Sub ip_ 1) 1 0) code_ out_))

    ;; Skip any other character
    (R "BFExec/Skip"
       (BFExec _ left_ curr_ right_ ip_ code_ out_)
       (BFState left_ curr_ right_ (Add ip_ 1) code_ out_)
       -100)

    ;; --- Helper: Find matching ] bracket ---
    (R "FindMatchingBracket/TooFar"
       (FindMatchingBracket code_ pos_ _ _)
       pos_  ; Give up and return current position
       (Gte pos_ (StrLen code_)))  ; Guard: out of bounds

    (R "FindMatchingBracket/Found"
       (FindMatchingBracket code_ pos_ _ 0)
       pos_
       (Eq (Substring code_ pos_ (Add pos_ 1)) "]"))

    (R "FindMatchingBracket/OpenBracket"
       (FindMatchingBracket code_ pos_ dir_ depth_)
       (FindMatchingBracket code_ (Add pos_ dir_) dir_ (Add depth_ 1))
       (Eq (Substring code_ pos_ (Add pos_ 1)) "["))

    (R "FindMatchingBracket/CloseBracket"
       (FindMatchingBracket code_ pos_ dir_ depth_)
       (FindMatchingBracket code_ (Add pos_ dir_) dir_ (Sub depth_ 1))
       (Eq (Substring code_ pos_ (Add pos_ 1)) "]"))

    (R "FindMatchingBracket/Other"
       (FindMatchingBracket code_ pos_ dir_ depth_)
       (FindMatchingBracket code_ (Add pos_ dir_) dir_ depth_)
       -100)

    ;; --- Helper: Find matching [ bracket (going backwards) ---
    (R "FindMatchingBracketBack/TooFar"
       (FindMatchingBracketBack _ pos_ _ _)
       0  ; Return to start if we go out of bounds
       (Lt pos_ 0))  ; Guard: out of bounds

    (R "FindMatchingBracketBack/Found"
       (FindMatchingBracketBack code_ pos_ _ 0)
       pos_  ; Jump TO the "[" so it can check the condition
       (Eq (Substring code_ pos_ (Add pos_ 1)) "["))

    (R "FindMatchingBracketBack/CloseBracket"
       (FindMatchingBracketBack code_ pos_ dir_ depth_)
       (FindMatchingBracketBack code_ (Sub pos_ dir_) dir_ (Add depth_ 1))
       (Eq (Substring code_ pos_ (Add pos_ 1)) "]"))

    (R "FindMatchingBracketBack/OpenBracket"
       (FindMatchingBracketBack code_ pos_ dir_ depth_)
       (FindMatchingBracketBack code_ (Sub pos_ dir_) dir_ (Sub depth_ 1))
       (And (Eq (Substring code_ pos_ (Add pos_ 1)) "[") (Gt depth_ 0)))  ; Only match if not at target depth

    (R "FindMatchingBracketBack/Other"
       (FindMatchingBracketBack code_ pos_ dir_ depth_)
       (FindMatchingBracketBack code_ (Sub pos_ dir_) dir_ depth_)
       -100)

    ;; --- Helper: Convert ASCII code to character ---
    (R "CharFromCode/Space" (CharFromCode 32) " ")
    (R "CharFromCode/Exclaim" (CharFromCode 33) "!")
    (R "CharFromCode/Comma" (CharFromCode 44) ",")
    (R "CharFromCode/Period" (CharFromCode 46) ".")
    (R "CharFromCode/H" (CharFromCode 72) "H")
    (R "CharFromCode/W" (CharFromCode 87) "W")
    (R "CharFromCode/d" (CharFromCode 100) "d")
    (R "CharFromCode/e" (CharFromCode 101) "e")
    (R "CharFromCode/l" (CharFromCode 108) "l")
    (R "CharFromCode/o" (CharFromCode 111) "o")
    (R "CharFromCode/r" (CharFromCode 114) "r")
    (R "CharFromCode/A" (CharFromCode 65) "A")
    (R "CharFromCode/B" (CharFromCode 66) "B")
    (R "CharFromCode/Other" (CharFromCode code_) (Concat "[" (Concat (ToString code_) "]")) -100)

    ;; --- List helpers ---
    ;; Cons should remain symbolic, not try to create a Call with a number as head
    ;; We'll leave Cons as-is for the runtime to handle

    ;; --- UI Projections ---
    (R "ShowTape"
       (/@ (Show Tape) (App (State (BFState left_ curr_ right_ _ _ _)) _))
       (Concat "[" (Concat (FormatList (Reverse left_)) (Concat " >" (Concat (ToString curr_) (Concat "< " (Concat (FormatList right_) "]")))))))

    (R "ShowCurrentCell"
       (/@ (Show CurrentCell) (App (State (BFState _ curr_ _ _ _ _)) _))
       (ToString curr_))

    (R "ShowInstructionPointer"
       (/@ (Show InstructionPointer) (App (State (BFState _ _ _ ip_ _ _)) _))
       (ToString ip_))

    (R "ShowCurrentInstruction"
       (/@ (Show CurrentInstruction) (App (State (BFState _ _ _ ip_ code_ _)) _))
       (If (Lt ip_ (StrLen code_)) (Substring code_ ip_ (Add ip_ 1)) "END"))

    (R "ShowOutput"
       (/@ (Show Output) (App (State (BFState _ _ _ _ _ out_)) _))
       out_)

    ;; --- List formatting helpers ---
    (R "FormatList/Nil" (FormatList Nil) "")
    (R "FormatList/Cons"
       (FormatList (Cons x_ rest_))
       (Concat (ToString x_) (Concat " " (FormatList rest_)))
       -5)

    ;; --- List reversal ---
    (R "Reverse/Nil" (Reverse Nil) Nil)
    (R "Reverse/Cons" (Reverse list_) (ReverseAcc list_ Nil) -5)
    (R "ReverseAcc/Nil" (ReverseAcc Nil acc_) acc_)
    (R "ReverseAcc/Cons" (ReverseAcc (Cons x_ rest_) acc_) (ReverseAcc rest_ (Cons x_ acc_)))

    ;; --- Conditionals ---
    (R "If/True"  (If True  a_ b_) a_)
    (R "If/False" (If False a_ b_) b_)

    ;; --- Boolean operations ---
    (R "And/True"  (And True True) True)
    (R "And/False1" (And False _) False)
    (R "And/False2" (And _ False) False)
  ) ;; End Rules

  ;; Optional: meta-rules to tweak UI or behavior live
  (RuleRules
    ;; Example: make Remove into a no-op by rewriting the Remove rule RHS
    ;; (R "NoDelete"
    ;;    (R "Remove" (Var lhs) (Var rhs))
    ;;    (R "Remove" (Var lhs) (Var lhs)))
  )
)
/-
Copyright (c) 2026 ProofLens contributors. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
-/
import ProofLens

/-!
# `prooflens-extract`

Usage:

```
lake exe prooflens-extract ProofLensExamples.Bounds [more modules...]
```

Emits ProofLens Formal IR as JSON on stdout.
-/

open Lean ProofLens.Extract

unsafe def run (modules : Array Name) : IO Unit := do
  initSearchPath (← findSysroot)
  -- Required so that attribute initialisers from the imported modules run in
  -- the interpreter. Without this, delaborators and notation unexpanders are
  -- never registered and the pretty printer falls back to raw applications.
  enableInitializersExecution
  withImportModules (modules.map (fun m => { module := m })) {} (trustLevel := 1024)
    fun env => do
      -- Pretty-printer configuration. Generalised field notation would render
      -- `LE.le ℝ inst x y` as `Real.instLE.le x y`, which defeats the binary
      -- operator delaborators and produces unreadable mathematics. ProofLens
      -- wants the notation a mathematician would write.
      let opts : Options := Options.empty
        |>.setBool `pp.fieldNotation false
        |>.setBool `pp.fieldNotation.generalized false
        |>.setBool `pp.unicode.fun true
        |>.setBool `pp.coercions.types false
        |>.setNat  `pp.maxSteps 8192
      let ctx : Core.Context :=
        { fileName := "<prooflens-extract>"
        , fileMap := default
        , options := opts }
      let state : Core.State := { env := env }
      let (json, _) ← ((extractModules modules).run' {} {}).toIO ctx state
      IO.println json.pretty

unsafe def main (args : List String) : IO UInt32 := do
  let modules := args.filter (fun a => !a.startsWith "-") |>.map String.toName |>.toArray
  if modules.isEmpty then
    IO.eprintln "usage: prooflens-extract <Module.Name> [...]"
    return 1
  run modules
  return 0

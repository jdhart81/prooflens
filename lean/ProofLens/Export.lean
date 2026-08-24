/-
Copyright (c) 2026 ProofLens contributors. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
-/
import ProofLens.Extract.Module

/-!
# Frontend-driven export

The `#prooflens_export` command runs ProofLens extraction from inside Lean's
own elaborator. This is the **reference** extraction path (see ADR 0001): it
inherits the frontend's fully configured pretty printer, so the Formal IR
carries the notation a mathematician would actually write.

Usage — the ProofLens CLI generates a driver file of this shape:

```lean
import ProofLens.Export
import ProofLensExamples.Bounds

#prooflens_export "out.json" ProofLensExamples.Bounds
```
-/

namespace ProofLens

open Lean Elab Command

/-- Extract the named modules and write ProofLens Formal IR to a file. -/
syntax (name := proofLensExport) "#prooflens_export " str ident+ : command

@[command_elab proofLensExport]
def elabProofLensExport : CommandElab := fun stx => do
  match stx with
  | `(#prooflens_export $out:str $mods:ident*) => do
      let modules := mods.map (·.getId)
      let path : System.FilePath := out.getString
      liftTermElabM do
        let json ← ProofLens.Extract.extractModules modules
        if let some parent := path.parent then
          IO.FS.createDirAll parent
        IO.FS.writeFile path (json.pretty ++ "\n")
        logInfo m!"ProofLens: wrote Formal IR for {modules.size} module(s) to {path}"
  | _ => throwUnsupportedSyntax

end ProofLens

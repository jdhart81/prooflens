/-
Copyright (c) 2026 ProofLens contributors. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
-/
import ProofLens.Extract.Declaration

/-! # Whole-module extraction -/

namespace ProofLens.Extract

open Lean Meta

/-- Should this constant appear in the Formal IR at all? -/
def isUserFacing (env : Environment) (n : Name) : Bool :=
  !n.isInternalDetail
    && !n.isAnonymous
    && (env.find? n).isSome

/-- Module name that a declaration was declared in, if recorded. -/
def moduleOf? (env : Environment) (n : Name) : Option Name := do
  let idx ← env.getModuleIdxFor? n
  env.allImportedModuleNames[idx.toNat]?

/--
Probe whether the pretty printer in the *current* environment is producing
mathematical notation or raw applications.

ProofLens runs extraction in two ways: inside Lean's own frontend (full
fidelity) and from a standalone `importModules` runner (faster, but notation
delaborators are not always available). Rather than silently emit degraded
mathematics, we measure it and record the answer in the Formal IR.
-/
def probeNotationFidelity : MetaM String := do
  let e := mkApp4 (mkConst ``LE.le [levelZero]) (mkConst ``Nat)
    (mkConst ``instLENat) (mkNatLit 0) (mkNatLit 1)
  let rendered ← try ppString e catch _ => pure ""
  return if rendered.contains '≤' then "notation" else "raw"

/--
Extract one declaration without letting it take the run down with it.

Two things go wrong at mathlib scale, and neither should be fatal:

* **Heartbeats.** The whole extraction loop otherwise shares a single budget, so
  declaration 400 fails not because it is expensive but because the 399 before
  it were. `withCurrHeartbeats` gives each declaration a fresh allowance.
* **Individual failures.** A pathological declaration — a deeply nested
  instance, a term the pretty printer chokes on — should be reported as one
  failed row, not silently drop 600 others.

A failed declaration still appears in the Formal IR, carrying its name and the
error. Losing a theorem without saying so is the outcome ProofLens is not
allowed to have, and that applies to extraction as much as to visualization.
-/
def extractOneResilient (declName : Name) (moduleName : Option Name) :
    MetaM (Option Json) := do
  try
    Core.withCurrHeartbeats <| extractDeclaration declName moduleName
  catch e =>
    let message ← e.toMessageData.toString
    return some <| Json.mkObj
      [ ("name", Json.str declName.toString)
      , ("namespace", Json.str declName.getPrefix.toString)
      , ("kind", Json.str "theorem")
      , ("docstring", Json.null)
      , ("source", Json.null)
      , ("binders", Json.arr #[])
      , ("conclusion", Json.mkObj
          [ ("pretty", Json.str "<extraction failed>")
          , ("tree", Json.mkObj [("kind", Json.str "sort"), ("level", Json.str "0")])
          , ("constants", Json.arr #[]) ])
      , ("definitionBody", Json.null)
      , ("statement", Json.mkObj
          [ ("pretty", Json.str "<extraction failed>")
          , ("tree", Json.mkObj [("kind", Json.str "sort"), ("level", Json.str "0")])
          , ("constants", Json.arr #[]) ])
      , ("dependencies", Json.arr #[])
      , ("axioms", Json.arr #[])
      , ("proofTermAvailable", Lean.toJson false)
      , ("usesSorry", Lean.toJson false)
      , ("extractionError", Json.str message) ]

/-- Extract every user-facing declaration originating in `modules`. -/
def extractModules (modules : Array Name) : MetaM Json := do
  let env ← getEnv
  let wanted := modules.toList
  let mut names : Array Name := #[]
  for (n, _) in env.constants.toList do
    if isUserFacing env n then
      if let some m := moduleOf? env n then
        if wanted.contains m then
          names := names.push n
  let sorted := names.qsort (fun a b => a.toString < b.toString)
  let mut decls : Array Json := #[]
  for n in sorted do
    if let some j ← extractOneResilient n (moduleOf? env n) then
      decls := decls.push j
  let fidelity ← probeNotationFidelity
  return Json.mkObj
    [ ("formalIRVersion", Json.str "0.1.0")
    , ("system", Json.str "lean4")
    , ("notationFidelity", Json.str fidelity)
    , ("toolchain", Json.str (Lean.versionString))
    , ("modules", Json.arr ((modules.map (Json.str ∘ Name.toString))))
    , ("declarations", Json.arr decls) ]

end ProofLens.Extract

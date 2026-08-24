/-
Copyright (c) 2026 ProofLens contributors. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
-/
import ProofLens.Extract.Module

/-!
# Focused extraction

The infoview widget wants one declaration, but a dependency graph with a single
node is not worth drawing. This module extracts a declaration together with the
declarations from its own module that its proof actually reaches, which is
enough for a useful local graph and far cheaper than extracting a whole module.
-/

namespace ProofLens.Extract

open Lean Meta

/-- Transitive dependencies of `declName` that live in the same module. -/
partial def localClosure (env : Environment) (declName : Name) : Array Name := Id.run do
  let some home := moduleOf? env declName | return #[declName]
  let mut seen : Std.HashSet Name := {}
  let mut stack : List Name := [declName]
  let mut out : Array Name := #[]
  while !stack.isEmpty do
    match stack with
    | [] => break
    | current :: rest =>
      stack := rest
      if seen.contains current then continue
      seen := seen.insert current
      if moduleOf? env current != some home then continue
      if !isUserFacing env current then continue
      out := out.push current
      if let some ci := env.find? current then
        let deps := ci.type.getUsedConstants ++ (ci.value?.map (·.getUsedConstants)).getD #[]
        for d in deps do
          if !seen.contains d then stack := d :: stack
  return out

/--
Extract `declName` plus its same-module dependency closure, as a Formal IR
document the TypeScript pipeline can consume unchanged.
-/
def extractFocused (declName : Name) : MetaM Json := do
  let env ← getEnv
  let names := (localClosure env declName).qsort (fun a b => a.toString < b.toString)
  let mut decls : Array Json := #[]
  for n in names do
    if let some j ← extractDeclaration n (moduleOf? env n) then
      decls := decls.push j
  let fidelity ← probeNotationFidelity
  let home := (moduleOf? env declName).getD Name.anonymous
  return Json.mkObj
    [ ("formalIRVersion", Json.str "0.1.0")
    , ("system", Json.str "lean4")
    , ("toolchain", Json.str Lean.versionString)
    , ("notationFidelity", Json.str fidelity)
    , ("focus", Json.str declName.toString)
    , ("modules", Json.arr #[Json.str home.toString])
    , ("declarations", Json.arr decls) ]

end ProofLens.Extract

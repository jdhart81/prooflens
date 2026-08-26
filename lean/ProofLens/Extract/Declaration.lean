/-
Copyright (c) 2026 ProofLens contributors. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
-/
import ProofLens.Extract.Expr

/-!
# Declaration extraction

Produces the ProofLens **Formal IR** for a single Lean declaration.

Everything emitted here is either transcribed from Lean's environment or
mechanically computed from the elaborated terms. Per Invariant 3, the consumer
tags all of it `verified` (transcription) or `derived` (mechanical computation);
this module never *interprets*.

The one analysis performed here that is not pure transcription is
**hypothesis usage** (see `binderUsage`), which powers ProofLens's
assumption-sensitivity view. It is a syntactic occurrence check on the
elaborated proof term, and its meaning is stated precisely in the emitted JSON.
-/

namespace ProofLens.Extract

open Lean Meta

/-- Human-stable declaration kind. -/
def constantKind : ConstantInfo → String
  | .axiomInfo _  => "axiom"
  | .defnInfo _   => "definition"
  | .thmInfo _    => "theorem"
  | .opaqueInfo _ => "opaque"
  | .inductInfo _ => "inductive"
  | .ctorInfo _   => "constructor"
  | .recInfo _    => "recursor"
  | .quotInfo _   => "quot"

/-- Source position payload, when Lean recorded one. -/
def rangesToJson (declName : Name) (moduleName : Option Name) : MetaM Json := do
  let some ranges ← findDeclarationRanges? declName | return Json.null
  let r := ranges.range
  return Json.mkObj
    [ ("module", match moduleName with | some m => Json.str m.toString | none => Json.null)
    , ("startLine", toJson r.pos.line)
    , ("startColumn", toJson r.pos.column)
    , ("endLine", toJson r.endPos.line)
    , ("endColumn", toJson r.endPos.column) ]

/--
Occurrence analysis for one binder of a declaration.

For binder `i` we report, as three independent booleans:

* `occursInProofTerm` — the free variable occurs in the elaborated value
  (the proof term for a theorem, the body for a definition).
* `occursInLaterBinderTypes` — some later binder's *type* mentions it.
* `occursInConclusion` — the conclusion mentions it.

A hypothesis that occurs nowhere is *stated but unused*. That is a statement
about this particular proof term, not about mathematical necessity, and the
downstream explanation layer is required to say so.
-/
structure BinderUsage where
  occursInProofTerm         : Bool
  occursInLaterBinderTypes  : Bool
  occursInConclusion        : Bool
  deriving Inhabited

def BinderUsage.toJson (u : BinderUsage) (valueAvailable : Bool) : Json :=
  Json.mkObj
    [ ("occursInProofTerm", Lean.toJson u.occursInProofTerm)
    , ("occursInLaterBinderTypes", Lean.toJson u.occursInLaterBinderTypes)
    , ("occursInConclusion", Lean.toJson u.occursInConclusion)
    , ("proofTermAvailable", Lean.toJson valueAvailable)
    , ("unusedInProof",
        Lean.toJson (valueAvailable && !u.occursInProofTerm
          && !u.occursInLaterBinderTypes && !u.occursInConclusion)) ]

/-- Does `e` mention the free variable `fid`? -/
def mentions (e : Expr) (fid : FVarId) : Bool :=
  e.hasAnyFVar (· == fid)

/--
Extract the Formal IR for `declName`.

Returns `none` for declarations that are not present in the environment.
-/
def extractDeclaration (declName : Name) (moduleName : Option Name) :
    MetaM (Option Json) := do
  let env ← getEnv
  let some ci := env.find? declName | return none
  let docstring ← findDocString? env declName
  let source ← rangesToJson declName moduleName

  -- The elaborated value: proof term for theorems, body for definitions.
  let value? := ci.value?
  let valueAvailable := value?.isSome

  -- Trust base. `sorryAx` here means the declaration is *not* actually proved.
  let axioms ← try collectAxioms declName catch _ => pure #[]
  let usesSorry := axioms.contains ``sorryAx
    || (value?.map (·.getUsedConstants.contains ``sorryAx)).getD false

  forallTelescope ci.type fun xs conclusion => do
    -- Instantiate the value at exactly the same free variables as the type,
    -- so binder `i` of the statement and binder `i` of the proof are the same
    -- `FVarId`. `beta` tolerates an eta-short value.
    let valueAtXs := value?.map (fun v => v.beta xs)

    let mut binderTypes : Array Expr := #[]
    for x in xs do
      binderTypes := binderTypes.push (← inferType x)

    let mut binders : Array Json := #[]
    for h : i in [0:xs.size] do
      let x := xs[i]!
      let fid := x.fvarId!
      let ty := binderTypes[i]!
      let isProp ← Meta.isProp ty
      let decl ← fid.getDecl

      let occursInProofTerm := (valueAtXs.map (mentions · fid)).getD false
      let mut occursLater := false
      for j in [i+1:binderTypes.size] do
        if mentions binderTypes[j]! fid then occursLater := true
      let occursInConclusion := mentions conclusion fid

      let usage : BinderUsage :=
        { occursInProofTerm := occursInProofTerm
        , occursInLaterBinderTypes := occursLater
        , occursInConclusion := occursInConclusion }

      -- Binders introduced by an arrow rather than named by the author carry
      -- macro scopes (`a._@._internal._hyg.7`). Leaking that into a figure
      -- label is noise, so we display it the way Lean itself does.
      let rawName ← fid.getUserName
      let displayName :=
        if rawName.hasMacroScopes then s!"{rawName.eraseMacroScopes}✝" else rawName.toString

      binders := binders.push <| Json.mkObj
        [ ("index", Lean.toJson i)
        , ("name", Json.str displayName)
        , ("rawName", Json.str rawName.toString)
        , ("fvarId", Json.str fid.name.toString)
        , ("binderInfo", Json.str (binderInfoToString decl.binderInfo))
        -- A typeclass instance is plumbing, not an assumption a mathematician
        -- made. `[IsStrictOrderedRing α]` is `Prop`-valued and would otherwise
        -- be counted as a hypothesis, which distorts assumption sensitivity and
        -- fills figures with noise.
        , ("role", Json.str (
            if decl.binderInfo == BinderInfo.instImplicit then "instance"
            else if isProp then "hypothesis" else "parameter"))
        , ("type", ← exprPayload ty)
        , ("usage", usage.toJson valueAvailable) ]
      -- silence the unused `h` from the bounded-for elaboration
      let _ := h

    -- A definition's body is the mathematics it introduces, and showing it is
    -- what turns a definition from an opaque name into a concept a reader can
    -- follow. Proof terms are excluded: they are enormous, and the interesting
    -- facts about them (which hypotheses they touch, which constants they use)
    -- are already computed above.
    let isDefinitional := match ci with
      | .defnInfo _ => true
      | .opaqueInfo _ => true
      | _ => false
    let definitionBody : Json ←
      if isDefinitional then
        match value?.map (fun v => v.beta xs) with
        | some body =>
            if exprSize body 4000 < 3000 then exprPayload body else pure Json.null
        | none => pure Json.null
      else pure Json.null

    let dependencies :=
      (ci.type.getUsedConstants
        ++ (value?.map (·.getUsedConstants)).getD #[]).toList.eraseDups

    return some <| Json.mkObj
      [ ("name", Json.str declName.toString)
      , ("namespace", Json.str declName.getPrefix.toString)
      , ("kind", Json.str (constantKind ci))
      , ("docstring", match docstring with | some d => Json.str d | none => Json.null)
      , ("source", source)
      , ("binders", Json.arr binders)
      , ("conclusion", ← exprPayload conclusion)
      , ("definitionBody", definitionBody)
      , ("statement", ← exprPayload ci.type)
      , ("dependencies", Json.arr ((dependencies.map (Json.str ∘ Name.toString)).toArray))
      , ("axioms", Json.arr ((axioms.map (Json.str ∘ Name.toString))))
      , ("proofTermAvailable", Lean.toJson valueAvailable)
      , ("usesSorry", Lean.toJson usesSorry) ]

end ProofLens.Extract

/-
Copyright (c) 2026 ProofLens contributors. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
-/
import Lean

/-!
# Structure-preserving `Expr` serialisation

This module implements the *preservation* half of ProofLens Invariant 6: the
Formal IR must retain enough of Lean's own `Expr` structure that later stages
can reinterpret a declaration **without reparsing Lean source**.

Nothing in this file interprets mathematics. It only transcribes.
-/

namespace ProofLens.Extract

open Lean

/-- Universe levels, rendered structurally rather than via the pretty printer. -/
partial def levelToString : Level → String
  | .zero       => "0"
  | .succ l     => s!"({levelToString l}+1)"
  | .max a b    => s!"max({levelToString a},{levelToString b})"
  | .imax a b   => s!"imax({levelToString a},{levelToString b})"
  | .param n    => n.toString
  | .mvar m     => s!"?{m.name}"

/-- Binder annotation, as a stable wire string. -/
def binderInfoToString : BinderInfo → String
  | .default        => "default"
  | .implicit       => "implicit"
  | .strictImplicit => "strictImplicit"
  | .instImplicit   => "instImplicit"

/--
Serialise a `Lean.Expr` into a JSON tree.

Design notes:
* Applications are **flattened** (`f a b c` becomes one node with three args)
  because that is the shape mathematical analysis wants.
* Bound variables keep their de Bruijn index, so the tree is lossless.
* `mdata` is transparent: it carries elaborator bookkeeping, not mathematics.
-/
partial def exprToJson (e : Expr) : MetaM Json := do
  match e with
  | .bvar i =>
      return Json.mkObj [("kind", Json.str "bvar"), ("index", toJson i)]
  | .fvar fid =>
      let userName ← try (return (← fid.getUserName).toString) catch _ => pure "_"
      return Json.mkObj
        [ ("kind", Json.str "fvar")
        , ("name", Json.str userName)
        , ("fvarId", Json.str fid.name.toString) ]
  | .mvar mid =>
      return Json.mkObj [("kind", Json.str "mvar"), ("mvarId", Json.str mid.name.toString)]
  | .sort l =>
      return Json.mkObj [("kind", Json.str "sort"), ("level", Json.str (levelToString l))]
  | .const n us =>
      return Json.mkObj
        [ ("kind", Json.str "const")
        , ("name", Json.str n.toString)
        , ("levels", Json.arr ((us.map (Json.str ∘ levelToString)).toArray)) ]
  | .app .. =>
      let fnJson ← exprToJson e.getAppFn
      let argsJson ← e.getAppArgs.mapM exprToJson
      return Json.mkObj
        [ ("kind", Json.str "app")
        , ("fn", fnJson)
        , ("args", Json.arr argsJson) ]
  | .lam n t b bi =>
      return Json.mkObj
        [ ("kind", Json.str "lam")
        , ("binderName", Json.str n.toString)
        , ("binderInfo", Json.str (binderInfoToString bi))
        , ("binderType", ← exprToJson t)
        , ("body", ← exprToJson b) ]
  | .forallE n t b bi =>
      return Json.mkObj
        [ ("kind", Json.str "forall")
        , ("binderName", Json.str n.toString)
        , ("binderInfo", Json.str (binderInfoToString bi))
        , ("binderType", ← exprToJson t)
        , ("body", ← exprToJson b) ]
  | .letE n t v b _ =>
      return Json.mkObj
        [ ("kind", Json.str "let")
        , ("binderName", Json.str n.toString)
        , ("binderType", ← exprToJson t)
        , ("value", ← exprToJson v)
        , ("body", ← exprToJson b) ]
  | .lit (.natVal n) =>
      return Json.mkObj [("kind", Json.str "lit"), ("litKind", Json.str "nat"), ("value", toJson n)]
  | .lit (.strVal s) =>
      return Json.mkObj [("kind", Json.str "lit"), ("litKind", Json.str "str"), ("value", Json.str s)]
  | .mdata _ b => exprToJson b
  | .proj s i b =>
      return Json.mkObj
        [ ("kind", Json.str "proj")
        , ("structName", Json.str s.toString)
        , ("index", toJson i)
        , ("struct", ← exprToJson b) ]

/-- Pretty-printed surface syntax, kept alongside the tree for human display. -/
def ppString (e : Expr) : MetaM String := do
  return (← Meta.ppExpr e).pretty

/--
Node count, with fuel.

Used to decide whether a term is small enough to be worth transcribing. Proof
terms are routinely enormous; definition bodies almost never are.
-/
partial def exprSize (e : Expr) (fuel : Nat) : Nat :=
  if fuel = 0 then fuel else
  match e with
  | .app f a       => 1 + exprSize f (fuel - 1) + exprSize a (fuel - 1)
  | .lam _ t b _   => 1 + exprSize t (fuel - 1) + exprSize b (fuel - 1)
  | .forallE _ t b _ => 1 + exprSize t (fuel - 1) + exprSize b (fuel - 1)
  | .letE _ t v b _ => 1 + exprSize t (fuel-1) + exprSize v (fuel-1) + exprSize b (fuel - 1)
  | .mdata _ b     => exprSize b (fuel - 1)
  | .proj _ _ b    => 1 + exprSize b (fuel - 1)
  | _              => 1

/-- An `Expr` plus its rendering: the atomic unit of ProofLens Formal IR. -/
def exprPayload (e : Expr) : MetaM Json := do
  return Json.mkObj
    [ ("pretty", Json.str (← ppString e))
    , ("tree", ← exprToJson e)
    , ("constants", Json.arr ((e.getUsedConstants.map (Json.str ∘ Name.toString)))) ]

end ProofLens.Extract

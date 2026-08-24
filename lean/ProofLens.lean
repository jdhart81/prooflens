/-
Copyright (c) 2026 ProofLens contributors. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
-/
import ProofLens.Extract.Expr
import ProofLens.Extract.Declaration
import ProofLens.Extract.Module
import ProofLens.Extract.Focus
import ProofLens.Export
import ProofLens.Widget

/-!
# ProofLens

Visual interpretability for formal mathematics.

This library is the *deterministic core* of ProofLens on the Lean side. It
extracts structured, provenance-carrying information from Lean's environment
and emits it as Formal IR JSON. It performs no interpretation and requires no
language model (Invariants 4 and 5).
-/

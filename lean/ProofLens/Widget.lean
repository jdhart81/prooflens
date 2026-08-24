/-
Copyright (c) 2026 ProofLens contributors. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
-/
import ProofLens.Extract.Focus

/-!
# The ProofLens infoview widget

`#prooflens my_theorem` renders ProofLens's analysis directly in the Lean
infoview, next to the code.

This is ProofLens's primary surface, and the reason is architectural rather
than cosmetic. Inside the editor there is no export step, no second process,
and no stale snapshot: the declaration is elaborated by the same frontend that
is checking the file, so the pretty printer, the environment, and the source
positions are all the real ones. See ADR 0002.

The Lean side of the widget does exactly one thing — hand the Formal IR to the
browser as widget props. Every stage after that (MathIR, classification,
visualization planning, SVG) runs in the infoview's JavaScript context, using
the very same packages the CLI and the web application use. Invariant 7,
renderer independence, is what makes that possible.
-/

namespace ProofLens

open Lean Elab Command Widget

/-- The bundled ProofLens widget. Rebuild with `pnpm build:widget`. -/
@[widget_module]
def proofLensWidget : Widget.Module where
  javascript := include_str "Widget/prooflens.js"

/--
Show ProofLens's analysis of a declaration in the infoview.

```lean
#prooflens Nat.le_of_succ_le
```
-/
syntax (name := proofLensCmd) "#prooflens " ident : command

@[command_elab proofLensCmd]
def elabProofLensCmd : CommandElab := fun stx => do
  match stx with
  | `(#prooflens $ident:ident) => do
      let declName ← liftCoreM <| realizeGlobalConstNoOverload ident
      let props ← liftTermElabM do
        Extract.extractFocused declName
      liftCoreM <| savePanelWidgetInfo proofLensWidget.javascriptHash (pure props) stx
  | _ => throwUnsupportedSyntax

end ProofLens

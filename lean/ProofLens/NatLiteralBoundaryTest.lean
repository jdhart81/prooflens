import ProofLens.Extract.Expr

open Lean Elab Command Meta

/- Actual extractor outputs, consumed by the JavaScript round-trip regression. -/
run_cmd do
  for n in #[0, 42, 9007199254740991, 9007199254740992, 9007199254740993,
      952044948935508700, 10000000000000000000] do
    let actual ← liftTermElabM (ProofLens.Extract.exprToJson (.lit (.natVal n)))
    logInfo m!"NAT_LITERAL_BOUNDARY:{actual.compress}"

import ComparatorChallenges.SeymourSecondNeighborhood

/-!
Checks the finite computations used by the ProofLens Seymour explorer against the
released target's exact definitions. The target contains an unproved challenge
statement; this module never uses that statement and proves no general solution
to Seymour's conjecture. The computational counterpart explicitly receives a
decidable edge relation so that small graph fixtures can be evaluated.
-/

namespace ProofLens.SeymourScene

variable {V : Type*} [Fintype V] [DecidableEq V]

def firstNeighbors (r : V → V → Prop) [DecidableRel r] (v : V) : Finset V :=
  Finset.univ.filter (r v)

def secondNeighbors (r : V → V → Prop) [DecidableRel r] (v : V) : Finset V :=
  Finset.univ.filter (fun w => w ≠ v ∧ ¬ r v w ∧ ∃ u, r v u ∧ r u w)

omit [DecidableEq V] in
theorem firstNeighbors_eq_upstream (r : V → V → Prop) [DecidableRel r] (v : V) :
    firstNeighbors r v = OAI.SeymourSecondNeighborhood.firstNeighbors r v := by
  ext w
  simp [firstNeighbors, OAI.SeymourSecondNeighborhood.firstNeighbors]

theorem secondNeighbors_eq_upstream (r : V → V → Prop) [DecidableRel r] (v : V) :
    secondNeighbors r v = OAI.SeymourSecondNeighborhood.secondNeighbors r v := by
  ext w
  simp [secondNeighbors, OAI.SeymourSecondNeighborhood.secondNeighbors]

theorem neighborhood_card_eq_upstream (r : V → V → Prop) [DecidableRel r] (v : V) :
    (firstNeighbors r v).card = (OAI.SeymourSecondNeighborhood.firstNeighbors r v).card ∧
      (secondNeighbors r v).card =
        (OAI.SeymourSecondNeighborhood.secondNeighbors r v).card := by
  simp [firstNeighbors_eq_upstream, secondNeighbors_eq_upstream]

def goodVertex (r : V → V → Prop) [DecidableRel r] (v : V) : Bool :=
  decide ((firstNeighbors r v).card ≤ (secondNeighbors r v).card)

theorem goodVertex_iff_upstream (r : V → V → Prop) [DecidableRel r] (v : V) :
    goodVertex r v = true ↔ OAI.SeymourSecondNeighborhood.GoodVertex r v := by
  simp [goodVertex, OAI.SeymourSecondNeighborhood.GoodVertex,
    firstNeighbors_eq_upstream, secondNeighbors_eq_upstream]

theorem secondNeighbors_excludes_origin (r : V → V → Prop) [DecidableRel r] (v : V) :
    v ∉ secondNeighbors r v := by
  simp [secondNeighbors]

theorem secondNeighbors_excludes_first (r : V → V → Prop) [DecidableRel r] (v w : V)
    (edge : r v w) : w ∉ secondNeighbors r v := by
  simp [secondNeighbors, edge]

def path3 (u v : Fin 3) : Prop := (u = 0 ∧ v = 1) ∨ (u = 1 ∧ v = 2)
instance : DecidableRel path3 := fun u v => by unfold path3; infer_instance

def cycle3 (u v : Fin 3) : Prop :=
  (u = 0 ∧ v = 1) ∨ (u = 1 ∧ v = 2) ∨ (u = 2 ∧ v = 0)
instance : DecidableRel cycle3 := fun u v => by unfold cycle3; infer_instance

def diamond4 (u v : Fin 4) : Prop :=
  (u = 0 ∧ v = 1) ∨ (u = 0 ∧ v = 2) ∨ (u = 1 ∧ v = 3) ∨ (u = 2 ∧ v = 3)
instance : DecidableRel diamond4 := fun u v => by unfold diamond4; infer_instance

def shortcut3 (u v : Fin 3) : Prop :=
  (u = 0 ∧ v = 1) ∨ (u = 1 ∧ v = 2) ∨ (u = 0 ∧ v = 2)
instance : DecidableRel shortcut3 := fun u v => by unfold shortcut3; infer_instance

def overlap4 (u v : Fin 4) : Prop :=
  (u = 0 ∧ v = 1) ∨ (u = 0 ∧ v = 2) ∨ (u = 1 ∧ v = 2) ∨ (u = 1 ∧ v = 3)
instance : DecidableRel overlap4 := fun u v => by unfold overlap4; infer_instance

-- The following five graph relations meet the released orientation assumptions.
theorem path3_oriented : OAI.SeymourSecondNeighborhood.IsOriented path3 :=
  ⟨by decide, by decide⟩
theorem cycle3_oriented : OAI.SeymourSecondNeighborhood.IsOriented cycle3 :=
  ⟨by decide, by decide⟩
theorem diamond4_oriented : OAI.SeymourSecondNeighborhood.IsOriented diamond4 :=
  ⟨by decide, by decide⟩
theorem shortcut3_oriented : OAI.SeymourSecondNeighborhood.IsOriented shortcut3 :=
  ⟨by decide, by decide⟩
theorem overlap4_oriented : OAI.SeymourSecondNeighborhood.IsOriented overlap4 :=
  ⟨by decide, by decide⟩

theorem sink_fixture :
    firstNeighbors path3 2 = ∅ ∧ secondNeighbors path3 2 = ∅ ∧
      goodVertex path3 2 = true := by decide

theorem cycle_fixture :
    firstNeighbors cycle3 0 = {1} ∧ secondNeighbors cycle3 0 = {2} ∧
      goodVertex cycle3 0 = true := by decide

-- Two different two-edge paths reach vertex 3, which contributes one endpoint.
theorem multiple_paths_fixture :
    firstNeighbors diamond4 0 = {1, 2} ∧ secondNeighbors diamond4 0 = {3} ∧
      (secondNeighbors diamond4 0).card = 1 ∧ goodVertex diamond4 0 = false := by decide

-- Vertex 2 has a two-edge path, but also a direct edge, so it is excluded.
theorem direct_edge_exclusion_fixture :
    firstNeighbors shortcut3 0 = {1, 2} ∧ secondNeighbors shortcut3 0 = ∅ ∧
      goodVertex shortcut3 0 = false := by decide

-- A first neighbor and a distinct second neighbor share the same intermediate.
theorem overlap_fixture :
    firstNeighbors overlap4 0 = {1, 2} ∧ secondNeighbors overlap4 0 = {3} ∧
      goodVertex overlap4 0 = false := by decide

-- An invalid oriented graph fixture exercises the origin exclusion explicitly.
-- This relation is never presented as an input satisfying the conjecture.
def twoCycle2 (u v : Fin 2) : Prop := (u = 0 ∧ v = 1) ∨ (u = 1 ∧ v = 0)
instance : DecidableRel twoCycle2 := fun u v => by unfold twoCycle2; infer_instance

theorem two_cycle_origin_exclusion_fixture :
    firstNeighbors twoCycle2 0 = {1} ∧ secondNeighbors twoCycle2 0 = ∅ := by decide

theorem two_cycle_fails_orientation :
    ¬ OAI.SeymourSecondNeighborhood.IsOriented twoCycle2 := by
  intro h
  exact h.asymmetric (u := 0) (v := 1) (by decide) (by decide)

-- Audit the dependencies of all correspondence and finite fixture proofs.
#print axioms firstNeighbors_eq_upstream
#print axioms secondNeighbors_eq_upstream
#print axioms neighborhood_card_eq_upstream
#print axioms goodVertex_iff_upstream
#print axioms secondNeighbors_excludes_origin
#print axioms secondNeighbors_excludes_first
#print axioms path3_oriented
#print axioms cycle3_oriented
#print axioms diamond4_oriented
#print axioms shortcut3_oriented
#print axioms overlap4_oriented
#print axioms sink_fixture
#print axioms cycle_fixture
#print axioms multiple_paths_fixture
#print axioms direct_edge_exclusion_fixture
#print axioms overlap_fixture
#print axioms two_cycle_origin_exclusion_fixture
#print axioms two_cycle_fails_orientation

end ProofLens.SeymourScene

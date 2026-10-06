"""Reject the original binding regression and plausible corrupted artifacts."""
from decimal import Decimal, localcontext
from pathlib import Path
import tempfile
import unittest

from check_torchlean_source_binding import ROOT, HASHES, check_binding, scaled_token, source_json


class SourceBindingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_dir = ROOT / "fixtures/torchlean-digits-source"
        cls.text = (ROOT / "corpus/ProofLensExamples/TorchLeanDigits.lean").read_text()

    def test_complete_pinned_model_and_enclosures(self):
        result = check_binding(self.text, self.source_dir)
        self.assertEqual(result["weights_checked"], 640)
        self.assertEqual(result["interval_pairs_checked"], 3600)

    def test_binary_rounded_parameter_regression_is_rejected(self):
        bad = self.text.replace("-414265058934688600", "-414265058934688568", 1)
        self.assertNotEqual(bad, self.text)
        with self.assertRaisesRegex(ValueError, "source decimal tokens"):
            check_binding(bad, self.source_dir)

    def test_over_precise_source_is_rejected_without_rounding(self):
        with self.assertRaisesRegex(ValueError, "scale precision"):
            scaled_token(Decimal("0.00000000000000000001"))

    def test_arithmetic_is_independent_of_decimal_context(self):
        with localcontext() as context:
            context.prec = 2
            self.assertEqual(scaled_token(Decimal("-0.04142650589346886")), -414265058934688600)
            self.assertEqual(scaled_token(Decimal("12.5e-2")), 1250000000000000000)
            self.assertEqual(scaled_token(Decimal("1.25e0")), 12500000000000000000)

    def test_modified_source_bytes_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "digits_linear_weights.json"
            path.write_bytes((self.source_dir / path.name).read_bytes() + b"\n")
            with self.assertRaisesRegex(ValueError, "source hash mismatch"):
                source_json(path, HASHES[path.name])

    def test_nonconservative_retained_bound_is_rejected(self):
        bad = self.text.replace("certLo0Z : Fin 10 → ℤ := ![-3519947998077", "certLo0Z : Fin 10 → ℤ := ![999999999999999999999999", 1)
        self.assertNotEqual(bad, self.text)
        with self.assertRaisesRegex(ValueError, "Nonconservative certificate interval"):
            check_binding(bad, self.source_dir)

    def test_reordered_input_dispatch_is_rejected(self):
        bad = self.text.replace("⟨0, _⟩ => inputLo0Z", "⟨0, _⟩ => inputLo1Z", 1)
        self.assertNotEqual(bad, self.text)
        with self.assertRaisesRegex(ValueError, "reordered dispatch"):
            check_binding(bad, self.source_dir)


if __name__ == "__main__":
    unittest.main()

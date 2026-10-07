#!/usr/bin/env python3
"""Independent source-token/constant gate; numeric checks are not Lean proof.

The model is the rational value of each original JSON decimal token, not the
nearest binary64 or float32 value. No generator or JavaScript parser is imported.
"""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "12f5c651f03b3890ec012d0a6bb45e3ea698c8d3"
HASHES = {
    "digits_linear_weights.json": "2da442779a3c368cdc5ca83358bfbe06783041d0b9516f3b0741bc95f09bf3cd",
    "digits_test.json": "b381019f8564ab1255f717791075577857e7c4eb49325edd9a31421d292be513",
    "digits_linear_margin_cert.json": "c517ffd45f2f9e7b844750fcc9e937c1c70509466b973f770644b5d7962aa060",
}
SOURCE_SCALE = 10**19
CERTIFICATE_SCALE = 10**12
EPSILON_Z = 2 * 10**17


def scaled_token(value, power=19):
    """Exact tuple arithmetic, independent of Decimal's working precision."""
    if not isinstance(value, Decimal) or not value.is_finite():
        raise ValueError("Expected an original finite decimal token")
    sign, digits, exponent = value.as_tuple()
    coefficient = int("".join(map(str, digits)))
    shift = exponent + power
    if shift >= 0:
        coefficient *= 10**shift
    else:
        divisor = 10**(-shift)
        if coefficient % divisor:
            raise ValueError("Source token exceeds declared scale precision")
        coefficient //= divisor
    return -coefficient if sign else coefficient


def source_json(path, expected_hash):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_hash:
        raise ValueError(f"Pinned source hash mismatch: {path.name}")
    return json.loads(data, parse_float=Decimal, parse_int=Decimal)


def vector(text, name):
    match = re.search(r"\bdef " + re.escape(name) + r"\b[^\n]*:= !\[", text)
    if not match:
        raise ValueError(f"Missing explicit integer vector {name}")
    start = match.end() - 1
    depth = 0
    for end in range(start, len(text)):
        depth += (text[end] == "[") - (text[end] == "]")
        if not depth:
            value = json.loads(text[start:end + 1].replace("!", ""))
            if not all(type(x) is int for x in _flatten(value)):
                raise ValueError(f"Non-integer Lean constant in {name}")
            return value
    raise ValueError(f"Unterminated integer vector {name}")


def _flatten(value):
    for item in value:
        if isinstance(item, list):
            yield from _flatten(item)
        else:
            yield item


def check_binding(text, source_dir):
    sources = {name: source_json(source_dir / name, digest) for name, digest in HASHES.items()}
    weights = sources["digits_linear_weights.json"]
    dataset = sources["digits_test.json"]
    margin = sources["digits_linear_margin_cert.json"]
    for name, expected in (("sourceCommit", COMMIT), ("weightsSha256", HASHES["digits_linear_weights.json"]),
                           ("datasetSha256", HASHES["digits_test.json"])):
        if f'def {name} : String := "{expected}"' not in text:
            raise ValueError(f"Lean source pin mismatch: {name}")
    for name, value in (("sourceScale", SOURCE_SCALE), ("certificateScale", CERTIFICATE_SCALE)):
        if f"def {name} : ℤ := {value}" not in text:
            raise ValueError(f"Lean scale mismatch: {name}")
    if (int(weights["in_dim"]), int(weights["out_dim"])) != (64, 10):
        raise ValueError("Unexpected source model dimensions")
    expected_weights = [[scaled_token(x) for x in row] for row in weights["layers.0.weight"]]
    expected_bias = [scaled_token(x) for x in weights["layers.0.bias"]]
    if len(expected_weights) != 10 or any(len(row) != 64 for row in expected_weights) or len(expected_bias) != 10:
        raise ValueError("Unexpected source parameter shape")
    actual_weights, actual_bias = vector(text, "weightsZ"), vector(text, "biasZ")
    if actual_weights != expected_weights or actual_bias != expected_bias:
        raise ValueError("Lean model constants differ from original source decimal tokens")
    if len(dataset["examples"]) != 360 or len(margin["examples"]) != 360:
        raise ValueError("Expected all 360 pinned source examples")
    if margin["norm"] != "linf" or margin["method"] != "ibp_linear" or scaled_token(margin["eps"]) != EPSILON_Z:
        raise ValueError("Unexpected source perturbation contract")
    checked = 0
    for sample, example in enumerate(dataset["examples"]):
        if example["id"] != sample or margin["examples"][sample]["id"] != sample:
            raise ValueError("Source example order mismatch")
        x = [scaled_token(token) for token in example["x"]]
        if len(x) != 64 or any(not 0 <= token <= SOURCE_SCALE for token in x):
            raise ValueError("Unexpected source input domain")
        lo = vector(text, f"inputLo{sample}Z")
        hi = vector(text, f"inputHi{sample}Z")
        if lo != [max(0, token - EPSILON_Z) for token in x] or hi != [min(SOURCE_SCALE, token + EPSILON_Z) for token in x]:
            raise ValueError(f"Input box differs from exact source decimals: {sample}")
        c_lo, c_hi = vector(text, f"certLo{sample}Z"), vector(text, f"certHi{sample}Z")
        if len(c_lo) != 10 or len(c_hi) != 10:
            raise ValueError(f"Unexpected certificate dimensions: {sample}")
        for cls, row in enumerate(expected_weights):
            lower = expected_bias[cls] * SOURCE_SCALE + sum(min(w * a, w * b) for w, a, b in zip(row, lo, hi))
            upper = expected_bias[cls] * SOURCE_SCALE + sum(max(w * a, w * b) for w, a, b in zip(row, lo, hi))
            if not (c_lo[cls] * SOURCE_SCALE**2 <= lower * CERTIFICATE_SCALE and
                    upper * CERTIFICATE_SCALE <= c_hi[cls] * SOURCE_SCALE**2):
                raise ValueError(f"Nonconservative certificate interval: {sample}/{cls}")
            checked += 1
    # Verify the explicit sample dispatch maps the checked vectors, not another row.
    for function, prefix in (("inputsLoZ", "inputLo"), ("inputsHiZ", "inputHi"),
                             ("certLoZ", "certLo"), ("certHiZ", "certHi")):
        start = text.index(f"def {function} :")
        end = text.index("\n\n", start)
        block = text[start:end]
        pairs = re.findall(r"\| ⟨(\d+), _⟩ => " + prefix + r"(\d+)Z", block)
        if pairs != [(str(sample), str(sample)) for sample in range(360)]:
            raise ValueError(f"Incomplete or reordered dispatch: {function}")
    return {"numeric_semantics": "original-json-token-exact-decimal-rationals",
            "weights_checked": 640, "biases_checked": 10, "input_boxes_checked": 360,
            "interval_pairs_checked": checked, "source_sha256": HASHES,
            "formal_proof": "NOT_CHECKED_BY_THIS_NUMERIC_GATE"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lean", type=Path, default=ROOT / "corpus/ProofLensExamples/TorchLeanDigits.lean")
    parser.add_argument("--source-dir", type=Path, default=ROOT / "fixtures/torchlean-digits-source")
    args = parser.parse_args()
    print(json.dumps(check_binding(args.lean.read_text(), args.source_dir), indent=2))

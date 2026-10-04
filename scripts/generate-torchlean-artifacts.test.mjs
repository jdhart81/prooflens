import assert from "node:assert/strict";
import test from "node:test";
import { generateAllArtifacts, parseScaledDecimal } from "./generate-torchlean-artifacts.mjs";

test("all weights and biases use the declared 19-digit scale, independent of array position", () => {
  const weights = {
    "layers.0.weight": Array.from({ length: 10 }, () => Array(64).fill("0.125")),
    "layers.0.bias": Array(10).fill("0.25"),
  };
  const dataset = {
    examples: Array.from({ length: 360 }, () => ({ x: Array(64).fill("0.5"), y: 0 })),
  };
  const result = generateAllArtifacts(weights, dataset, {
    examples: Array.from({ length: 360 }, () => ({ certified: false })),
  });
  for (const row of result.weightsZ) assert.deepEqual(row, Array(64).fill(1250000000000000000n));
  assert.deepEqual(result.biasZ, Array(10).fill(2500000000000000000n));
  // 0.25 + 64 * 0.125 * [0.48, 0.52] = [4.09, 4.41].
  for (const row of result.certLoZ) assert.deepEqual(row, Array(10).fill(4090000000000n));
  for (const row of result.certHiZ) assert.deepEqual(row, Array(10).fill(4410000000000n));
});

test("decimal tokens retain exact scaled values across scientific notation", () => {
  assert.equal(parseScaledDecimal("0.8443235754966736"), 8443235754966736000n);
  assert.equal(parseScaledDecimal("1.25e0"), 12500000000000000000n);
  assert.equal(parseScaledDecimal("12.5e-2"), 1250000000000000000n);
  assert.equal(parseScaledDecimal("-2.5e1"), -250000000000000000000n);
});

test("unsupported precision fails instead of silently truncating source decimals", () => {
  assert.throws(() => parseScaledDecimal("0.00000000000000000001"), /precision/);
  assert.throws(() => parseScaledDecimal("not-a-number"), /decimal/);
});

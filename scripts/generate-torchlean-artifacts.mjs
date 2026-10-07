#!/usr/bin/env node
/**
 * Numeric helpers for the pinned TorchLean digits artifacts.
 *
 * generateAllArtifacts computes integer vectors and outward-rounded bounds.
 * Direct invocation validates the retained Formal IR schema and receipt hash;
 * it does not emit Lean code or perform a fresh Formal IR extraction. Use the
 * pinned CI extraction path to regenerate those proof artifacts.
 * Pass original decimal tokens as strings when exact source precision matters.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const PINNED_SOURCE = {
  repository: "https://github.com/lean-dojo/TorchLean",
  commit: "12f5c651f03b3890ec012d0a6bb45e3ea698c8d3",
  artifacts: {
    marginCert: {
      path: "NN/Examples/Verification/Robustness/digits_linear_margin_cert.json",
      sha256: "c517ffd45f2f9e7b844750fcc9e937c1c70509466b973f770644b5d7962aa060",
    },
    weights: {
      path: "NN/Examples/Verification/Robustness/digits_linear_weights.json",
      sha256: "2da442779a3c368cdc5ca83358bfbe06783041d0b9516f3b0741bc95f09bf3cd",
    },
    dataset: {
      path: "NN/Examples/Verification/Robustness/digits_test.json",
      sha256: "b381019f8564ab1255f717791075577857e7c4eb49325edd9a31421d292be513",
    },
  },
};

const sourceScale = 10000000000000000000n; // 10^19
const certScale = 1000000000000n; // 10^12
const scaleDiff = 100000000000000000000000000n; // 10^26
const epsZ = 200000000000000000n; // 0.02 * 10^19

export function parseSourceJsonTokens(content) {
  // Validate JSON syntax, then preserve every original number token as a string.
  // The decoded validation value is discarded and never supplies model values.
  JSON.parse(content);
  const quotedNumbers = content.replace(
    /("(?:\\.|[^"\\])*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, quoted, numeric) => quoted ?? JSON.stringify(numeric),
  );
  return JSON.parse(quotedNumbers);
}

export function loadPinnedSourceArtifacts(sourceDir) {
  const parsed = {};
  for (const [name, pin] of Object.entries(PINNED_SOURCE.artifacts)) {
    const bytes = readFileSync(resolve(sourceDir, basename(pin.path)));
    const actual = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actual !== pin.sha256) throw new Error(`Pinned source hash mismatch: ${name}`);
    parsed[name] = parseSourceJsonTokens(bytes.toString("utf8"));
  }
  return {
    weightsData: parsed.weights,
    testData: parsed.dataset,
    marginCert: parsed.marginCert,
  };
}

export function parseScaledDecimal(s, scalePower = 19) {
  if (typeof s !== "string") {
    throw new Error("Expected an original decimal token string, not a decoded number");
  }
  if (!Number.isSafeInteger(scalePower) || scalePower < 0) {
    throw new Error("Invalid decimal precision");
  }
  const token = String(s).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) throw new Error("Invalid decimal token");
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  if (!Number.isSafeInteger(exponent)) throw new Error("Invalid decimal exponent");
  const shift = scalePower + exponent - fraction.length;
  let coefficient = BigInt(match[2] + fraction);
  if (shift >= 0) {
    coefficient *= 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    if (coefficient % divisor !== 0n) {
      throw new Error("Source decimal exceeds supported precision");
    }
    coefficient /= divisor;
  }
  return match[1] === "-" ? -coefficient : coefficient;
}

export function generateAllArtifacts(weightsData, testData, marginCert) {
  const rawWeights = weightsData["layers.0.weight"];
  const rawBias = weightsData["layers.0.bias"];

  const weightsZ = rawWeights.map((row) => row.map((value) => parseScaledDecimal(value)));
  const biasZ = rawBias.map((value) => parseScaledDecimal(value));

  const inputsLoZ = [];
  const inputsHiZ = [];
  const certLoZ = [];
  const certHiZ = [];
  const certIntervalsMap = {};

  let certifiedOkCount = 0;
  let certifiedMismatches = 0;

  for (let s = 0; s < 360; s++) {
    const row = testData.examples[s];
    const x = row.x;
    // Labels are discrete indices. Converting a validated 0..9 integer to Number
    // is exact and does not decode any model parameter or input decimal.
    const y = typeof row.y === "string" ? Number(parseScaledDecimal(row.y, 0)) : row.y;
    if (!Number.isInteger(y) || y < 0 || y >= 10) throw new Error("Invalid class label");

    const loRow = [];
    const hiRow = [];
    for (let i = 0; i < 64; i++) {
      const pVal = parseScaledDecimal(x[i]);
      let l = pVal - epsZ;
      if (l < 0n) l = 0n;
      let h = pVal + epsZ;
      if (h > sourceScale) h = sourceScale;
      loRow.push(l);
      hiRow.push(h);
    }
    inputsLoZ.push(loRow);
    inputsHiZ.push(hiRow);

    const cLoRow = [];
    const cHiRow = [];

    for (let j = 0; j < 10; j++) {
      let lowerSum = 0n;
      let upperSum = 0n;
      for (let i = 0; i < 64; i++) {
        const w = weightsZ[j][i];
        const p1 = w * loRow[i];
        const p2 = w * hiRow[i];
        lowerSum += p1 < p2 ? p1 : p2;
        upperSum += p1 > p2 ? p1 : p2;
      }
      const lowerNum = biasZ[j] * sourceScale + lowerSum;
      const upperNum = biasZ[j] * sourceScale + upperSum;

      // Floor division for conservative lower bound
      let cLo = lowerNum / scaleDiff;
      if (lowerNum < 0n && lowerNum % scaleDiff !== 0n) {
        cLo -= 1n;
      }

      // Ceiling division for conservative upper bound
      let cHi = upperNum / scaleDiff;
      if (upperNum > 0n && upperNum % scaleDiff !== 0n) {
        cHi += 1n;
      }

      // Mathematical verification of exact enclosure
      if (!(cLo * sourceScale * sourceScale <= lowerNum * certScale)) {
        throw new Error(`Enclosure lower check failed at sample ${s}, class ${j}`);
      }
      if (!(upperNum * certScale <= cHi * sourceScale * sourceScale)) {
        throw new Error(`Enclosure upper check failed at sample ${s}, class ${j}`);
      }

      cLoRow.push(cLo);
      cHiRow.push(cHi);
    }

    certLoZ.push(cLoRow);
    certHiZ.push(cHiRow);

    certIntervalsMap[s] = {
      lower: cLoRow.map((v) => Number(v) / 1e12),
      upper: cHiRow.map((v) => Number(v) / 1e12),
    };

    const labelFloor = cLoRow[y];
    let maxCompZ = -999999999999999999n;
    for (let j = 0; j < 10; j++) {
      if (j !== y && cHiRow[j] > maxCompZ) {
        maxCompZ = cHiRow[j];
      }
    }

    const isCert = labelFloor > maxCompZ;
    if (isCert) certifiedOkCount++;

    const reportExample = marginCert.examples[s];
    if (reportExample.certified !== isCert) {
      certifiedMismatches++;
    }
  }

  return {
    weightsZ,
    biasZ,
    inputsLoZ,
    inputsHiZ,
    certLoZ,
    certHiZ,
    certIntervalsMap,
    certifiedOkCount,
    certifiedMismatches,
  };
}

// Direct invocation checks retained artifacts; it does not regenerate them.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { parseFormalIR } = await import("../packages/formal-ir/dist/index.js");
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--source-dir")) {
    throw new Error("Usage: generate-torchlean-artifacts.mjs [--source-dir PATH]");
  }
  if (args.length) {
    const { weightsData, testData, marginCert } = loadPinnedSourceArtifacts(resolve(args[1]));
    const generated = generateAllArtifacts(weightsData, testData, marginCert);
    console.log("Computed source-token candidate: 640 weights, 10 biases, 360 input boxes, 3600 interval pairs.");
    console.log("Source certified-flag mismatches:", generated.certifiedMismatches);
    console.log("This integer computation is not Lean proof or a fresh extraction.");
  }
  console.log("Verifying retained TorchLean 360-example artifacts...");
  console.log("Source repository:", PINNED_SOURCE.repository, "@", PINNED_SOURCE.commit);

  const { TORCHLEAN_DIGITS_MARGIN_FIXTURE } =
    await import("../packages/torchlean-adapter/dist/index.js");
  console.log(
    "Fixture loaded with " + TORCHLEAN_DIGITS_MARGIN_FIXTURE.examples.length + " examples.",
  );

  // Verify that committed Formal IR and receipt match the schema
  const formalIrPath = resolve(root, "examples/torchlean-digits-enclosure.formal-ir.json");
  const formalIrContent = readFileSync(formalIrPath, "utf8");
  const parsedDoc = parseFormalIR(JSON.parse(formalIrContent));
  const formalIrSha256 = crypto.createHash("sha256").update(formalIrContent).digest("hex");

  const receiptPath = resolve(root, "examples/torchlean-digits-enclosure.receipt.json");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));

  if (receipt.proof.formalIrSha256 !== formalIrSha256) {
    throw new Error(
      `Receipt formalIrSha256 mismatch: receipt=${receipt.proof.formalIrSha256}, actual=${formalIrSha256}`,
    );
  }

  console.log(
    "Retained Formal IR schema parsed (declarations: " +
      parsedDoc.declarations.length +
      ", sha256: " +
      formalIrSha256 +
      ")",
  );
  console.log("Receipt hash matched (examples: " + receipt.binding.exampleIds.length + ")");
  console.log("Retained schema/hash checks passed; this command did not run Lean proof or extraction.");
}

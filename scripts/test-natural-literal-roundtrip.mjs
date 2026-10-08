#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { FormalExprNodeSchema } from "../packages/formal-ir/dist/schema.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const result = spawnSync("lake", ["env", "lean", "ProofLens/NatLiteralBoundaryTest.lean"], {
  cwd: resolve(root, "lean"), encoding: "utf8",
});
assert.equal(result.status, 0, result.stdout + result.stderr);
const rows = [...result.stdout.matchAll(/NAT_LITERAL_BOUNDARY:(\{[^\n]+\})/g)]
  .map(match => FormalExprNodeSchema.parse(JSON.parse(match[1])));
const expected = [0, 42, 9007199254740991, "9007199254740992", "9007199254740993",
  "952044948935508700", "10000000000000000000"];
assert.equal(rows.length, expected.length, result.stdout);
rows.forEach((row, index) => {
  assert.equal(row.kind, "lit");
  assert.equal(row.litKind, "nat");
  assert.equal(row.value, expected[index]);
});
console.log("Seven actual Lean→JSON→FormalIR literal boundary cases passed without numeric loss.");

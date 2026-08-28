#!/usr/bin/env node
/**
 * Keep the web application's copy of the extracted corpus in step with the
 * canonical one.
 *
 * `examples/corpus.formal-ir.json` is the extraction CI verifies. The web app
 * needs it under `public/` to fetch at runtime. Copying by hand is exactly the
 * kind of step that gets forgotten, leaving the browser serving a stale
 * extraction while the tests and the CLI use a fresh one.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "examples/corpus.formal-ir.json");
const destination = resolve(root, "apps/web/public/corpus.formal-ir.json");
const paperPacketSource = resolve(root, "examples/viridis-intelligence-bound.paper-packet.json");
const paperPacketDestination = resolve(
  root,
  "apps/web/public/viridis-intelligence-bound.paper-packet.json",
);

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
await copyFile(paperPacketSource, paperPacketDestination);
console.log("Synced Formal IR and paper packet examples -> apps/web/public/");

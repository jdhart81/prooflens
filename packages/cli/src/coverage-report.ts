import type { CoverageReport, HeadMiss } from "@prooflens/pipeline";

/**
 * Rendering the coverage report.
 *
 * The number at the top is the honest headline. The tables underneath are the
 * point: a ranked, evidence-backed work queue, where every row names the
 * declarations that would improve if someone did that row.
 */

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function bar(fraction: number, width = 28): string {
  const filled = Math.round(fraction * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

export function renderCoverageText(report: CoverageReport): string {
  const t = report.totals;
  const out: string[] = [];
  const rule = "─".repeat(78);

  out.push("═".repeat(78));
  out.push("ProofLens coverage");
  out.push("═".repeat(78));
  out.push(`modules            ${report.modules.length}`);
  for (const m of report.modules) out.push(`                   ${m}`);
  out.push(`notation fidelity  ${report.notationFidelity}`);
  out.push("");
  out.push(
    `  declarations                 ${String(t.declarations).padStart(5)}  (${t.theorems} theorems, ${t.definitions} definitions)`,
  );
  out.push(
    `  structurally classified      ${String(t.classified).padStart(5)}  ${bar(report.rates.classified)} ${pct(report.rates.classified)}`,
  );
  out.push(
    `  fully readable               ${String(t.fullyReadable).padStart(5)}  ${bar(report.rates.fullyReadable)} ${pct(report.rates.fullyReadable)}`,
  );
  out.push(`  classified, opaque subterms  ${String(t.classifiedWithOpaqueTerms).padStart(5)}`);
  out.push(`  unrecognised shape           ${String(t.unsupported).padStart(5)}`);
  out.push("");
  out.push("  `fully readable` means the conclusion classified AND every term inside it");
  out.push("  has a name in ProofLens's constant table. It is the strict number.");
  out.push("");

  out.push(rule);
  out.push("WHAT CLASSIFIED");
  out.push(rule);
  for (const row of report.byClassification) {
    out.push(`  ${row.kind.padEnd(26)} ${String(row.declarations).padStart(5)}`);
  }
  out.push("");

  out.push(rule);
  out.push("BACKLOG 1 — UNRECOGNISED CONCLUSION SHAPES");
  out.push("  Each row is a statement form ProofLens cannot read at all.");
  out.push(rule);
  if (report.unrecognisedShapes.length === 0) {
    out.push("  (none)");
  } else {
    for (const miss of report.unrecognisedShapes.slice(0, 25)) {
      out.push(`  ${String(miss.declarations).padStart(4)}  ${miss.head ?? "<unnamed structure>"}`);
      out.push(`        e.g. ${miss.examples.slice(0, 3).join(", ")}`);
    }
    if (report.unrecognisedShapes.length > 25) {
      out.push(
        `  … and ${report.unrecognisedShapes.length - 25} more (use --json for the full list)`,
      );
    }
  }
  out.push("");

  out.push(rule);
  out.push("BACKLOG 2 — CONSTANTS TO ADD TO THE MathIR TABLES");
  out.push("  Each row is a term ProofLens sees but cannot name. Where they appear in");
  out.push("  statements that already classify these are the cheaper wins; a constant");
  out.push("  also listed in Backlog 1 has no such statements yet.");
  out.push(rule);
  if (report.opaqueConstants.length === 0) {
    out.push("  (none)");
  } else {
    for (const miss of report.opaqueConstants.slice(0, 30)) {
      const marker = miss.alsoUnrecognised ? "  †" : "";
      out.push(`  ${String(miss.declarations).padStart(4)}  ${miss.head ?? "<unnamed>"}${marker}`);
    }
    if (report.opaqueConstants.slice(0, 30).some((m) => m.alsoUnrecognised)) {
      out.push("");
      out.push("  † also an unrecognised shape, so this row is not a cheap win: there are");
      out.push("    no already-classifying statements for it to improve.");
    }
    if (report.opaqueConstants.length > 30) {
      out.push(`  … and ${report.opaqueConstants.length - 30} more (use --json for the full list)`);
    }
  }
  out.push("");

  const s = report.assumptionSensitivity;
  out.push(rule);
  out.push("ASSUMPTION SENSITIVITY");
  out.push(rule);
  out.push(`  declarations analysed        ${String(s.analysed).padStart(5)}`);
  out.push("    (proof term available, and at least one non-instance hypothesis)");
  out.push(`  with unused hypotheses       ${String(s.withUnusedHypotheses).padStart(5)}`);
  out.push(`  unused hypotheses in total   ${String(s.unusedHypotheses).padStart(5)}`);
  if (s.examples.length > 0) {
    out.push("");
    out.push("  A hypothesis listed here is stated but never referenced by that proof");
    out.push("  term. It may still be mathematically necessary; another proof might use it.");
    out.push("");
    for (const example of s.examples.slice(0, 12)) {
      out.push(`    ${example.declaration}`);
      out.push(`      unused: ${example.unused.join(", ")}`);
    }
  }
  out.push("");

  if (report.trust.usesSorry.length > 0 || report.trust.unusualAxioms.length > 0) {
    out.push(rule);
    out.push("TRUST");
    out.push(rule);
    for (const name of report.trust.usesSorry) out.push(`  NOT PROVED (sorry): ${name}`);
    for (const entry of report.trust.unusualAxioms) {
      out.push(`  extra axioms: ${entry.declaration} — ${entry.axioms.join(", ")}`);
    }
    out.push("");
  }

  out.push(rule);
  out.push("FIGURES");
  out.push(rule);
  out.push(`  planned  ${report.figures.planned}`);
  for (const row of report.figures.byType) {
    out.push(`    ${row.type.padEnd(26)} ${String(row.count).padStart(5)}`);
  }
  out.push("");
  for (const row of report.figures.byEpistemicStatus) {
    out.push(`    ${row.status.padEnd(26)} ${String(row.count).padStart(5)}`);
  }

  return out.join("\n");
}

/**
 * One backlog as a markdown table.
 *
 * An empty backlog renders as `_(none)_` rather than a header with no rows: a
 * bare table renders as an empty box, and a reader cannot tell "nothing left to
 * do" from "this section is broken". Nothing left to do is the good news the
 * report should state loudest.
 */
function missTable(
  misses: readonly HeadMiss[],
  columnLabel: string,
  unnamed: string,
  limit: number,
  exampleLimit: number,
): string[] {
  if (misses.length === 0) return ["_(none)_"];
  const rows = [`| Declarations | ${columnLabel} | Examples |`, "|---:|---|---|"];
  for (const miss of misses.slice(0, limit)) {
    const examples = miss.examples
      .slice(0, exampleLimit)
      .map((e) => `\`${e}\``)
      .join(", ");
    const marker = miss.alsoUnrecognised ? " †" : "";
    rows.push(`| ${miss.declarations} | \`${miss.head ?? unnamed}\`${marker} | ${examples} |`);
  }
  if (misses.slice(0, limit).some((m) => m.alsoUnrecognised)) {
    rows.push("");
    rows.push(
      "_† also an unrecognised shape, so the row is not a cheap win: there are no already-classifying statements for it to improve._",
    );
  }
  if (misses.length > limit) {
    rows.push("");
    rows.push(`_… and ${misses.length - limit} more. Use \`--format json\` for the full list._`);
  }
  return rows;
}

export function renderCoverageMarkdown(report: CoverageReport): string {
  const t = report.totals;
  const out: string[] = [];

  out.push("# ProofLens coverage report");
  out.push("");
  out.push(
    `Generated against ${report.modules.length} module(s), notation fidelity \`${report.notationFidelity}\`.`,
  );
  out.push("");
  out.push("| | |");
  out.push("|---|---|");
  out.push(
    `| Declarations | ${t.declarations} (${t.theorems} theorems, ${t.definitions} definitions) |`,
  );
  out.push(`| Structurally classified | **${t.classified}** (${pct(report.rates.classified)}) |`);
  out.push(`| Fully readable | **${t.fullyReadable}** (${pct(report.rates.fullyReadable)}) |`);
  out.push(`| Classified but containing opaque terms | ${t.classifiedWithOpaqueTerms} |`);
  out.push(`| Unrecognised shape | ${t.unsupported} |`);
  out.push("");
  out.push("`Fully readable` is the strict number: the conclusion classified *and* every");
  out.push("term inside it has a name in ProofLens's constant table.");
  out.push("");

  out.push("## Modules");
  out.push("");
  for (const m of report.modules) out.push(`- \`${m}\``);
  out.push("");

  out.push("## What classified");
  out.push("");
  out.push("| Classification | Declarations |");
  out.push("|---|---:|");
  for (const row of report.byClassification) out.push(`| ${row.kind} | ${row.declarations} |`);
  out.push("");

  out.push("## Backlog 1 — unrecognised conclusion shapes");
  out.push("");
  out.push("Statement forms ProofLens cannot read at all. Ranked by declarations affected.");
  out.push("");
  out.push(...missTable(report.unrecognisedShapes, "Head", "<unnamed structure>", 30, 3));
  out.push("");

  out.push("## Backlog 2 — constants to add to the MathIR tables");
  out.push("");
  out.push("Terms ProofLens sees but cannot name. Where they appear in statements that");
  out.push("already classify, these are the cheaper wins: they improve output that already");
  out.push("works. A constant appearing in Backlog 1 as well has no such statements yet.");
  out.push("");
  out.push(...missTable(report.opaqueConstants, "Constant", "<unnamed>", 40, 2));
  out.push("");

  const s = report.assumptionSensitivity;
  out.push("## Assumption sensitivity");
  out.push("");
  out.push(
    `Of ${s.analysed} declarations with a proof term and at least one genuine (non-instance)`,
  );
  out.push(
    `hypothesis, **${s.withUnusedHypotheses}** state a hypothesis the proof never references (${s.unusedHypotheses} in total).`,
  );
  out.push("");
  out.push("A hypothesis listed here is stated but never referenced by *that proof term*.");
  out.push("It may still be mathematically necessary — another proof might need it.");
  out.push("");
  if (s.examples.length > 0) {
    out.push("| Declaration | Unused |");
    out.push("|---|---|");
    for (const example of s.examples) {
      out.push(
        `| \`${example.declaration}\` | ${example.unused.map((u) => `\`${u}\``).join(", ")} |`,
      );
    }
    out.push("");
  }

  out.push("## Figures");
  out.push("");
  out.push(`${report.figures.planned} planned.`);
  out.push("");
  out.push("| Type | Count |");
  out.push("|---|---:|");
  for (const row of report.figures.byType) out.push(`| ${row.type} | ${row.count} |`);
  out.push("");
  out.push("| Epistemic status | Count |");
  out.push("|---|---:|");
  for (const row of report.figures.byEpistemicStatus) out.push(`| ${row.status} | ${row.count} |`);

  return out.join("\n");
}

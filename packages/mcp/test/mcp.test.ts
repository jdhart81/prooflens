import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { analyse, SOURCE_LIMIT } from "../src/analysis.js";

const source = "theorem cooling_bound (P T : ℝ) (hP : 0 < P) (hT : 0 < T) : 0 < P / T := by sorry";
const corpus = new URL("../../../examples/corpus.formal-ir.json", import.meta.url);

describe("MCP input trust and numerical boundaries", () => {
  it("preserves source-preview status even with a plausible proof body", () => {
    for (const proof of ["sorry", "positivity"]) {
      const result = analyse("source", source.replace("sorry", proof), "cooling_bound", {
        P: 2,
        T: 1,
      });
      expect(result.report.verified).toBe(false);
      expect(result.report.inputOrigin).toBe("source-preview");
      expect(result.report.explanations.every((e) => e.status !== "verified")).toBe(true);
      expect(result.report.snapshot?.right).toBe(2);
      expect(result.report.snapshot?.assumptionStatus).toBe("yes");
      expect(result.svg).toContain("<svg");
    }
  });
  it("carries invalid and undefined assumptions into the result", () => {
    const result = analyse("source", source, "cooling_bound", { T: 0 });
    expect(result.report.snapshot?.assumptionStatus).toBe("no");
    expect(result.report.snapshot?.error).toMatch(/undefined/);
    expect(result.report.snapshot?.result).toBeUndefined();
    expect(result.report.gaps.join(" ")).toContain("cannot assess");
  });
  it("does not authenticate caller-supplied extraction metadata", async () => {
    const input = JSON.parse(await readFile(corpus, "utf8"));
    delete input.inputOrigin;
    input.verified = true;
    const result = analyse("artifact", JSON.stringify(input), "simple_upper_bound");
    expect(result.report.inputOrigin).toBe("user-extraction");
    expect(result.report.verified).toBe(false);
    expect(result.report.explanations.every((e) => e.status !== "verified")).toBe(true);
    expect(result.svg).not.toMatch(/\[verified\]/);
  });
  it("rejects excessive inputs, unsupported syntax and unknown controls", () => {
    expect(() => analyse("source", "a".repeat(SOURCE_LIMIT + 1), "x")).toThrow(/byte limit/);
    expect(() => analyse("source", "(".repeat(65), "x")).toThrow(/nesting/);
    expect(() => analyse("source", 'macro "oops" : term => `(0)', "x")).toThrow(/Custom syntax/);
    expect(() => analyse("source", source, "cooling_bound", { missing: 1 })).toThrow(
      /Unknown or ambiguous numeric control/,
    );
  });
  it("rejects ambiguous short names instead of silently choosing a theorem", async () => {
    const input = JSON.parse(await readFile(corpus, "utf8"));
    const declaration = input.declarations.find((d: { name: string }) =>
      d.name.endsWith("simple_upper_bound"),
    );
    input.declarations = [
      { ...declaration, name: "A.shared" },
      { ...declaration, name: "B.shared" },
    ];
    expect(() => analyse("artifact", JSON.stringify(input), "shared")).toThrow(/Ambiguous/);
    expect(analyse("artifact", JSON.stringify(input), "A.shared").report.declaration).toBe(
      "A.shared",
    );
  });
});

it("official SDK client discovers tools, calls stdio and reads artifacts without stdout pollution", async () => {
  const client = new Client({ name: "prooflens-integration-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/bin.js", import.meta.url))],
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "prooflens_capabilities",
      "prooflens_preview_statement",
      "prooflens_explain_artifact",
    ]);
    const result = await client.callTool({
      name: "prooflens_preview_statement",
      arguments: { source, declaration: "cooling_bound", values: { T: 1 } },
    });
    expect(result.isError).not.toBe(true);
    const data = result.structuredContent as {
      verified: boolean;
      markdownUri: string;
      svgUri: string;
    };
    expect(data.verified).toBe(false);
    const markdown = await client.readResource({ uri: data.markdownUri });
    expect(markdown.contents[0]).toMatchObject({
      mimeType: "text/markdown",
      text: expect.stringContaining("not authenticated by Lean"),
    });
    const svg = await client.readResource({ uri: data.svgUri });
    expect(svg.contents[0]).toMatchObject({
      mimeType: "image/svg+xml",
      text: expect.stringContaining("<svg"),
    });
    const unsupported = await client.callTool({
      name: "prooflens_preview_statement",
      arguments: { source: 'macro "oops" : term => `(0)', declaration: "oops" },
    });
    expect(unsupported.isError).toBe(true);
    // Failure must not terminate the server or compromise the next result.
    expect(
      (await client.callTool({ name: "prooflens_capabilities", arguments: {} })).isError,
    ).not.toBe(true);
    await expect(client.readResource({ uri: "file:///etc/passwd" })).rejects.toThrow();
    for (let i = 0; i < 14; i++)
      await client.callTool({
        name: "prooflens_preview_statement",
        arguments: { source, declaration: "cooling_bound", values: { P: i + 3 } },
      });
    await expect(client.readResource({ uri: data.markdownUri })).rejects.toThrow(/expired/);
  } finally {
    await client.close();
  }
}, 30_000);

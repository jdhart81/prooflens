import { parseFormalIR } from "./load.js";
import type {
  FormalBinder,
  FormalDeclaration,
  FormalExprNode,
  FormalIRDocument,
} from "./schema.js";

const constant = (name: string): FormalExprNode => ({ kind: "const", name, levels: [] });
const call = (name: string, ...args: FormalExprNode[]): FormalExprNode => ({
  kind: "app",
  fn: constant(name),
  args,
});
const real = constant("Real");
const usage = {
  occursInProofTerm: false,
  occursInLaterBinderTypes: false,
  occursInConclusion: false,
  proofTermAvailable: false,
  unusedInProof: false,
};
const expression = (tree: FormalExprNode, pretty = "") => ({
  tree,
  pretty,
  constants: [] as string[],
});
const operators: Record<string, [number, string]> = {
  "↔": [1, "Iff"],
  "→": [2, "arrow"],
  "∧": [3, "And"],
  "=": [4, "Eq"],
  "≠": [4, "Ne"],
  "<": [4, "LT.lt"],
  "≤": [4, "LE.le"],
  ">": [4, "GT.gt"],
  "≥": [4, "GE.ge"],
  "+": [10, "HAdd.hAdd"],
  "-": [10, "HSub.hSub"],
  "*": [20, "HMul.hMul"],
  "/": [20, "HDiv.hDiv"],
  "^": [30, "HPow.hPow"],
};
const functions: Record<string, [string, number]> = {
  "Real.sqrt": ["Real.sqrt", 1],
  "Real.log": ["Real.log", 1],
  "Real.exp": ["Real.exp", 1],
  abs: ["abs", 1],
  "Filter.Tendsto": ["Filter.Tendsto", 3],
  nhdsWithin: ["nhdsWithin", 2],
  nhds: ["nhds", 1],
  "Set.Ioi": ["Set.Ioi", 1],
  "Set.Iio": ["Set.Iio", 1],
};
const identifier = /^[\p{L}_][\p{L}\p{N}_'.]*$/u;

/** Strip nested Lean comments while preserving line positions. No proof code is executed. */
function uncomment(source: string): string {
  let result = "",
    depth = 0,
    line = false;
  for (let i = 0; i < source.length; i++) {
    const pair = source.slice(i, i + 2),
      c = source[i]!;
    if (line) {
      if (c === "\n") {
        line = false;
        result += c;
      } else result += " ";
    } else if (pair === "/-") {
      depth++;
      result += "  ";
      i++;
    } else if (depth && pair === "-/") {
      depth--;
      result += "  ";
      i++;
    } else if (depth) result += c === "\n" ? c : " ";
    else if (pair === "--") {
      line = true;
      result += "  ";
      i++;
    } else result += c;
  }
  if (depth) throw new Error("A block comment is not closed.");
  return result;
}

class SignatureParser {
  tokens: string[];
  pos = 0;
  serial = 0;
  depth = 0;
  variables = new Map<string, FormalExprNode>();
  constructor(source: string) {
    const normalized = source
      .replace(/<=/g, "≤")
      .replace(/>=/g, "≥")
      .replace(/!=/g, "≠")
      .replace(/<->/g, "↔")
      .replace(/->/g, "→");
    this.tokens = normalized.match(/=>|:=|[\p{L}_][\p{L}\p{N}_'.]*|\d+|[^\s]/gu) ?? [];
    if (this.tokens.length > 5000)
      throw new Error(
        "This statement is too large for source preview; import its extracted JSON instead.",
      );
  }
  peek(): string {
    return this.tokens[this.pos] ?? "";
  }
  take(): string {
    return this.tokens[this.pos++] ?? "";
  }
  need(value: string): void {
    if (this.take() !== value)
      throw new Error(
        `Expected '${value}' near '${this.tokens.slice(this.pos - 1, this.pos + 3).join(" ")}'.`,
      );
  }
  variable(name: string): FormalExprNode {
    if (!identifier.test(name)) throw new Error(`Expected a variable name, got '${name}'.`);
    const node: FormalExprNode = { kind: "fvar", name, fvarId: `source:${name}:${this.serial++}` };
    this.variables.set(name, node);
    return node;
  }
  realType(): void {
    const t = this.take();
    if (!["ℝ", "Real"].includes(t))
      throw new Error(
        `Source preview supports explicit real-valued variables, not '${t}'. Import extracted JSON for other Lean types.`,
      );
  }
  parse(minimum = 0): FormalExprNode {
    if (++this.depth > 100) throw new Error("Statement nesting is too deep for source preview.");
    let left = this.atom();
    while (operators[this.peek()] && operators[this.peek()]![0] >= minimum) {
      const token = this.take(),
        [precedence, name] = operators[token]!;
      const right = this.parse(precedence + (["^", "→", "∧", "↔"].includes(token) ? 0 : 1));
      left =
        name === "arrow"
          ? {
              kind: "forall",
              binderName: `_condition${this.serial++}`,
              binderInfo: "default",
              binderType: left,
              body: right,
            }
          : call(name, left, right);
    }
    this.depth--;
    return left;
  }
  atom(): FormalExprNode {
    const token = this.take();
    if (token === "(") {
      const value = this.parse();
      if (this.peek() === ":") {
        this.take();
        this.realType();
      }
      this.need(")");
      return value;
    }
    if (token === "-") return call("Neg.neg", this.parse(25));
    if (token === "√") return call("Real.sqrt", this.atom());
    if (token === "|") {
      const value = this.parse();
      this.need("|");
      return call("abs", value);
    }
    if (/^\d+$/.test(token))
      return {
        kind: "lit",
        litKind: "nat",
        value: BigInt(token) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(token) : token,
      };
    if (token === "∀" || token === "∃" || token === "fun") {
      const prior = new Map(this.variables);
      const parenthesized = this.peek() === "(";
      if (parenthesized) this.take();
      const names: string[] = [];
      while (identifier.test(this.peek()) && !["Real", "ℝ"].includes(this.peek()))
        names.push(this.take());
      if (!names.length) throw new Error("A quantified variable needs a name.");
      const variables = names.map((name) => this.variable(name));
      let guard: FormalExprNode | undefined;
      if (this.peek() === ":") {
        this.take();
        this.realType();
      } else if (token === "∃" && [">", "≥", "<", "≤"].includes(this.peek())) {
        const operator = this.take();
        guard = call(operators[operator]![1], variables[0]!, this.parse(5));
      } else
        throw new Error(
          "Quantified variables need an explicit real type (or an existential inequality).",
        );
      if (parenthesized) this.need(")");
      this.need(token === "fun" ? "=>" : ",");
      let body = this.parse();
      if (guard) body = call("And", guard, body);
      for (const name of names.reverse()) {
        const lambda: FormalExprNode = {
          kind: "lam",
          binderName: name,
          binderInfo: "default",
          binderType: real,
          body,
        };
        body =
          token === "∃"
            ? call("Exists", real, lambda)
            : token === "fun"
              ? lambda
              : { ...lambda, kind: "forall" };
      }
      this.variables = prior;
      return body;
    }
    const fn = functions[token];
    if (fn) {
      const args = Array.from({ length: fn[1] }, () => this.atom());
      return call(fn[0], ...(fn[0] === "Filter.Tendsto" ? [real, real, ...args] : args));
    }
    if (["Filter.atTop", "Filter.atBot"].includes(token)) return constant(token);
    const variable = this.variables.get(token);
    if (variable) return variable;
    throw new Error(
      `Source preview cannot resolve '${token || "end of statement"}'. Use explicit real variables and standard arithmetic, or import extracted JSON.`,
    );
  }
  signature(): { binders: FormalBinder[]; conclusion: FormalExprNode } {
    const binders: FormalBinder[] = [];
    const add = (
      name: string,
      type: FormalExprNode,
      value: FormalExprNode,
      role: "parameter" | "hypothesis",
    ) => {
      binders.push({
        index: binders.length,
        name,
        fvarId: value.kind === "fvar" ? value.fvarId : `source:${name}`,
        binderInfo: "default",
        role,
        type: expression(type, role === "parameter" ? "ℝ" : ""),
        usage: { ...usage },
      });
    };
    while (this.peek() === "(" || this.peek() === "{") {
      const close = this.take() === "(" ? ")" : "}";
      const names: string[] = [];
      while (identifier.test(this.peek())) names.push(this.take());
      this.need(":");
      if (["ℝ", "Real"].includes(this.peek())) {
        this.realType();
        for (const name of names) add(name, real, this.variable(name), "parameter");
      } else {
        const type = this.parse();
        for (const name of names) add(name, type, this.variable(name), "hypothesis");
      }
      this.need(close);
    }
    this.need(":");
    let conclusion = this.parse();
    if (this.pos !== this.tokens.length)
      throw new Error(
        `Unexpected syntax '${this.tokens.slice(this.pos, this.pos + 4).join(" ")}'.`,
      );
    while (conclusion.kind === "forall") {
      const type = conclusion.binderType;
      const value = findVariable(conclusion.body, conclusion.binderName) ?? {
        kind: "fvar" as const,
        name: conclusion.binderName,
        fvarId: `source:${conclusion.binderName}`,
      };
      add(
        conclusion.binderName,
        type,
        value,
        type.kind === "const" && type.name === "Real" ? "parameter" : "hypothesis",
      );
      conclusion = conclusion.body;
    }
    return { binders, conclusion };
  }
}
function findVariable(node: FormalExprNode, name: string): FormalExprNode | undefined {
  if (node.kind === "fvar" && node.name === name) return node;
  const children =
    node.kind === "app"
      ? node.args
      : node.kind === "forall" || node.kind === "lam"
        ? [node.binderType, node.body]
        : [];
  for (const child of children) {
    const found = findVariable(child, name);
    if (found) return found;
  }
  return undefined;
}

export interface SourcePreview {
  document: FormalIRDocument;
  skipped: Array<{ name: string; reason: string }>;
}
/** A deliberately limited source reader, never a substitute for Lean elaboration. */
export function previewLeanSource(source: string): SourcePreview {
  if (source.length > 200_000)
    throw new Error(
      "Lean source preview is limited to 200 KB. Import an extraction for larger projects.",
    );
  const clean = uncomment(source);
  if (/^\s*(?:notation|infix[lr]?|prefix|postfix|macro|syntax|local\s+notation)\b/m.test(clean))
    throw new Error("Custom syntax needs Lean elaboration. Import this project's extracted JSON.");
  const starts = [...clean.matchAll(/^\s*(?:theorem|lemma)\s+([\p{L}_][\p{L}\p{N}_'.]*)/gmu)];
  if (starts.length > 250) throw new Error("Preview up to 250 declarations at a time.");
  const declarations: FormalDeclaration[] = [],
    skipped: SourcePreview["skipped"] = [];
  for (let i = 0; i < starts.length; i++) {
    const match = starts[i]!,
      name = match[1]!;
    const chunk = clean.slice(match.index! + match[0].length, starts[i + 1]?.index ?? clean.length);
    const end = chunk.indexOf(":=");
    const signature = (end < 0 ? chunk : chunk.slice(0, end)).trim();
    try {
      if (end < 0) throw new Error("Expected a declaration ending with ':=' and a proof body.");
      if (declarations.some((d) => d.name === name))
        throw new Error(
          "Duplicate declaration name; import an extraction with fully qualified names.",
        );
      const parsed = new SignatureParser(signature).signature();
      declarations.push({
        name,
        namespace: "",
        kind: "theorem",
        docstring: null,
        source: {
          module: "SourcePreview",
          startLine: clean.slice(0, match.index).split("\n").length,
          startColumn: 0,
          endLine: clean.slice(0, match.index! + match[0].length + end).split("\n").length,
          endColumn: 0,
        },
        binders: parsed.binders,
        conclusion: expression(parsed.conclusion),
        statement: expression(parsed.conclusion, `theorem ${name} ${signature}`),
        definitionBody: null,
        dependencies: [],
        axioms: [],
        usesSorry: /\bsorry\b/.test(chunk.slice(end)),
        proofTermAvailable: false,
        extractionError: null,
      });
    } catch (error) {
      skipped.push({ name, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (!starts.length)
    throw new Error(
      "Paste a Lean theorem or lemma declaration, including its named variables, statement, and ':= by …' proof body.",
    );
  if (!declarations.length)
    throw new Error(skipped.map((item) => `${item.name}: ${item.reason}`).join("\n"));
  return {
    document: parseFormalIR({
      formalIRVersion: "0.1.0",
      system: "lean4-source-preview",
      toolchain: "not elaborated",
      notationFidelity: "notation",
      inputOrigin: "source-preview",
      modules: ["SourcePreview"],
      declarations,
    }),
    skipped,
  };
}

/** Ignore any trust assertion carried by a user's uploaded JSON. */
export function importFormalIR(text: string): FormalIRDocument {
  if (text.length > 8_000_000) throw new Error("Extraction files must be smaller than 8 MB.");
  const raw: unknown = JSON.parse(text);
  const pending: Array<{ value: unknown; depth: number }> = [{ value: raw, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++count > 200_000 || depth > 150)
      throw new Error(
        "This extraction is too large or deeply nested for browser exploration. Split it into smaller modules.",
      );
    if (value && typeof value === "object")
      for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 });
  }
  if (raw && typeof raw === "object" && "declarations" in raw && Array.isArray(raw.declarations)) {
    const names = raw.declarations.map((d: unknown) =>
      d && typeof d === "object" && "name" in d ? d.name : undefined,
    );
    if (names.every((n) => typeof n === "string") && new Set(names).size !== names.length)
      throw new Error("Declaration names must be unique.");
  }
  const doc = parseFormalIR(raw);
  if (doc.declarations.length > 250) throw new Error("Import up to 250 declarations at a time.");
  if (!doc.declarations.length) throw new Error("This extraction contains no declarations.");
  if (new Set(doc.declarations.map((d) => d.name)).size !== doc.declarations.length)
    throw new Error("Declaration names must be unique.");
  return { ...doc, inputOrigin: "user-extraction" };
}

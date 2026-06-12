import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AFFORDANCE_MATRIX, DEFERRED_TESTIDS } from "@/app/help/_affordanceMatrix";

const ROOT = process.cwd();
const MATRIX_FILE = join(ROOT, "app/help/_affordanceMatrix.ts");
const DOMAIN_ROOTS = ["components", "app"].map((p) => join(ROOT, p));
const EXEMPT = /\/\/\s*not-a-help-affordance:\s*\S/;

function domainFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (!/__generated__/.test(p)) walk(p);
      } else if (/\.(tsx?|mdx)$/.test(p) && !/\.test\./.test(p) && p !== MATRIX_FILE) {
        out.push(p);
      }
    }
  };
  DOMAIN_ROOTS.forEach(walk);
  return out;
}

// Blank out /* */ and // comment CONTENT while preserving newlines, so the
// call-site scan never matches doc prose like "Distinct from <HelpTooltip>"
// (HoverHelp.tsx doc header) and reported line numbers stay valid. The
// EXEMPTION check reads the RAW source — "// not-a-help-affordance:" is
// itself a comment and must survive for that rule.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'])\/\/[^\n]*/gm, (m, pre) => pre + " ".repeat(m.length - pre.length));
}

const concreteIds = new Set(
  AFFORDANCE_MATRIX.flatMap((r) => (r.kind === "concrete" ? [r.testid] : [])),
);
const liveIds = new Set([...concreteIds].filter((id) => !DEFERRED_TESTIDS.has(id)));

// The occurrence-uniqueness rule below counts substring hits via indexOf. That
// is only sound if no concrete id is a substring of another concrete id —
// otherwise one literal would count toward two ids. Verified for the current
// 20-row matrix (Task 9 pre-check); this assertion keeps the precondition
// pinned so a future row that violates it fails loudly instead of silently
// double-counting (the fix then is a boundary-aware regex scan).
const allConcrete = [...concreteIds];
const substringPairs = allConcrete.flatMap((a) =>
  allConcrete.filter((b) => a !== b && b.includes(a)).map((b) => `${a} ⊂ ${b}`),
);

describe("affordance-matrix ↔ live-surface parity (spec §7)", () => {
  const files = domainFiles().map((f) => {
    const raw = readFileSync(f, "utf8");
    return {
      path: f,
      rel: relative(ROOT, f),
      raw, // exemption comments are read from RAW source
      src: stripComments(raw), // call sites + literals scanned comment-free
    };
  });

  it("stripComments: prose mentions of <HelpTooltip> in comments are not call sites", () => {
    const sample = `// Distinct from <HelpTooltip>\nconst x = 1; /* <HoverHelp testId="y"> */\nrender(<HoverHelp label="z" />);\n`;
    const stripped = stripComments(sample);
    expect(stripped.match(/<(HoverHelp|HelpTooltip)\b/g)).toHaveLength(1);
    expect(stripped.split("\n").length).toBe(sample.split("\n").length); // line numbers preserved
  });

  it("no concrete id is a substring of another (precondition for the indexOf occurrence scan)", () => {
    expect(substringPairs, substringPairs.join("\n")).toEqual([]);
  });

  it("every HoverHelp/HelpTooltip call site references a live matrix testid or carries an exemption", () => {
    const failures: string[] = [];
    for (const f of files) {
      const sites = f.src.match(/<(HoverHelp|HelpTooltip)\b/g) ?? [];
      if (sites.length === 0) continue;
      const lines = f.src.split("\n");
      const rawLines = f.raw.split("\n");
      lines.forEach((line, i) => {
        if (!/<(HoverHelp|HelpTooltip)\b/.test(line)) return;
        const window = lines.slice(i, Math.min(i + 12, lines.length)).join("\n");
        // Exemption comments live in the RAW source (stripComments blanks them).
        const rawAbove = rawLines.slice(Math.max(0, i - 3), i).join("\n");
        const rawWindow = rawLines.slice(i, Math.min(i + 12, rawLines.length)).join("\n");
        const literal = window.match(/(?:rootTestId|testId)=["'](help-affordance--[^"']+)["']/);
        if (literal && liveIds.has(literal[1]!)) return;
        if (EXEMPT.test(rawAbove) || EXEMPT.test(rawWindow)) return;
        failures.push(
          `${f.rel}:${i + 1} — call site resolves no live matrix testid and carries no exemption`,
        );
      });
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("every live concrete row's testid occurs EXACTLY ONCE across the domain (occurrences, not files)", () => {
    const counts = new Map<string, string[]>();
    for (const id of liveIds) counts.set(id, []);
    for (const f of files) {
      for (const id of liveIds) {
        let idx = f.src.indexOf(id);
        while (idx !== -1) {
          const line = f.src.slice(0, idx).split("\n").length;
          counts.get(id)!.push(`${f.rel}:${line}`);
          idx = f.src.indexOf(id, idx + 1);
        }
      }
    }
    const bad = [...counts].filter(([, hits]) => hits.length !== 1);
    expect(bad, bad.map(([id, hits]) => `${id} → [${hits.join(", ")}]`).join("\n")).toEqual([]);
  });

  it("no deferred testid appears in any domain file; deferred ids are matrix rows", () => {
    for (const id of DEFERRED_TESTIDS) {
      expect(concreteIds.has(id), `${id} must be a matrix row`).toBe(true);
      const hits = files.filter((f) => f.src.includes(id)).map((f) => f.rel);
      expect(hits, `${id} must not appear in components/app: ${hits.join(", ")}`).toEqual([]);
    }
  });

  it("matrix testids are unique", () => {
    expect(concreteIds.size).toBe(AFFORDANCE_MATRIX.filter((r) => r.kind === "concrete").length);
  });
});

// Contract test for tests/docs/_invariant8Closeout.ts (the invariant-8 closeout
// walker). Plants are labeled by mutation family M1-M3/M7/M8 per the plan's
// ownership matrix (docs/superpowers/plans/2026-08-01-invariant8-closeout-enforcement.md);
// M4-M6 live with the guard test. Fixture trees exercise the REAL filesystem
// acquisition path (tmpdir) so an acquisition-layer mutant cannot hide behind
// in-memory path lists (spec r1 F1).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  declaresGate,
  parseMarkers,
  partitionUnits,
  unitVerdict,
  walkPlansTree,
} from "./_invariant8Closeout";

const DECLARING = "run /impeccable critique then /impeccable audit on the diff";
const VALID_RAN = "impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none";
const VALID_NA = "impeccable-gate: N/A — no UI surface";
const TEMPLATE_LINE =
  "impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>";

// ---------- fixture tree on real disk (M1 acquisition layer) ----------

const root = mkdtempSync(join(tmpdir(), "i8-walker-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function seed(rel: string, text: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, text);
}

// One file per discovery shape.
seed("2026-08-02-flat-plan.md", DECLARING);
seed("admin/2026-08-02-category-flat.md", "category flat");
seed("admin/2026-08-02-category-dir/plan.md", "category dir member");
seed("2026-08-02-mega/inner/2026-08-03-nested-name.md", "nested dated name, same unit");
seed("2026-08-02-attach.md", DECLARING);
seed("2026-08-02-attach-closeout.md", VALID_RAN);
seed("parser/2026-08-02-upper.md", "plan");
seed("parser/2026-08-02-upper-CLOSEOUT.md", VALID_RAN);
seed("2026-08-02-share.md", "base plan");
seed("2026-08-02-share-fidelity-fixes.md", "stem-extending sibling, own unit");
seed("2026-08-02-orphan-closeout.md", "no matching plan in this directory");
seed("2026-08-02-descoped-closeout/notes.md", "closeout DIRECTORY, own unit");
seed("README.md", "undated index");

// Lazy so a stubbed helper produces assertion-time failures, not collection errors.
let cache: { walked: string[]; units: Map<string, string[]>; undated: string[] } | null = null;
function tree(): { walked: string[]; units: Map<string, string[]>; undated: string[] } {
  if (cache === null) {
    const walked = walkPlansTree(root);
    const { units, undated } = partitionUnits(walked);
    cache = { walked, units, undated };
  }
  return cache;
}

describe("walkPlansTree — filesystem acquisition (M1)", () => {
  it("sees every seeded file, including a novel unit nobody registered", () => {
    // M1(d): a hardcoded path list cannot know this tmpdir's contents.
    expect(tree().walked).toContain("2026-08-02-flat-plan.md");
    expect(tree().walked).toContain("admin/2026-08-02-category-dir/plan.md");
    expect(tree().walked).toContain("README.md");
    expect(tree().walked).toHaveLength(13);
  });
});

describe("partitionUnits — §3.1 shapes (M1)", () => {
  it("flat dated file is its own unit", () => {
    expect(tree().units.get("2026-08-02-flat-plan.md")).toEqual(["2026-08-02-flat-plan.md"]);
  });

  it("category-nested flat file and directory are units", () => {
    expect(tree().units.has("admin/2026-08-02-category-flat.md")).toBe(true);
    expect(tree().units.get("admin/2026-08-02-category-dir")).toEqual([
      "admin/2026-08-02-category-dir/plan.md",
    ]);
  });

  it("nested dated names do NOT reopen sub-units", () => {
    expect(tree().units.get("2026-08-02-mega")).toEqual([
      "2026-08-02-mega/inner/2026-08-03-nested-name.md",
    ]);
    expect(tree().units.has("2026-08-02-mega/inner/2026-08-03-nested-name.md")).toBe(false);
  });

  it("closeout-attach: stem-matching sibling joins the plan unit (both casings)", () => {
    expect(tree().units.get("2026-08-02-attach.md")?.sort()).toEqual([
      "2026-08-02-attach-closeout.md",
      "2026-08-02-attach.md",
    ]);
    expect(tree().units.has("2026-08-02-attach-closeout.md")).toBe(false);
    expect(tree().units.get("parser/2026-08-02-upper.md")?.sort()).toEqual([
      "parser/2026-08-02-upper-CLOSEOUT.md",
      "parser/2026-08-02-upper.md",
    ]);
  });

  it("non-attach controls: stem-extender, closeout directory, orphan closeout stay separate", () => {
    expect(tree().units.has("2026-08-02-share-fidelity-fixes.md")).toBe(true);
    expect(tree().units.has("2026-08-02-descoped-closeout")).toBe(true);
    expect(tree().units.has("2026-08-02-orphan-closeout.md")).toBe(true);
  });

  it("undated files are reported, not swallowed", () => {
    expect(tree().undated).toEqual(["README.md"]);
  });
});

describe("declaresGate — unit-wide fold (M2)", () => {
  const f = (...texts: string[]) =>
    new Map(texts.map((t, i) => [`f${i}.md`, t] as const));

  it("critique-only and audit-only do not trigger", () => {
    expect(declaresGate(f("impeccable critique alone"))).toBe(false);
    expect(declaresGate(f("impeccable audit alone"))).toBe(false);
  });

  it("both halves in one file trigger, case-insensitively", () => {
    expect(declaresGate(f("Impeccable Critique and IMPECCABLE AUDIT"))).toBe(true);
  });

  it("split across files triggers (the fold, not same-file-BOTH)", () => {
    expect(declaresGate(f("impeccable critique here", "impeccable audit there"))).toBe(true);
  });
});

// ---------- marker grammar: the committed grammar-probe table, ported (M3/M8) ----------

type Want = "valid" | "template" | "malformed" | "not-marker";
const GRAMMAR_CASES: ReadonlyArray<[line: string, template: boolean, want: Want]> = [
  [VALID_RAN, false, "valid"],
  ["impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=1 p1=2 dispositions=recorded", false, "valid"],
  [VALID_NA, false, "valid"],
  ["Critique skipped. Audit pending.", false, "not-marker"], // P-HEDGE — the entry's canonical string
  ["For backend-only milestones use `impeccable-gate: N/A — no UI surface` here.", true, "not-marker"],
  ["impeccable-gate: critique=SKIPPED audit=RAN p0=0 p1=0 dispositions=none", false, "malformed"],
  ["impeccable-gate: critique=RAN p0=0 p1=0 dispositions=none", false, "malformed"],
  ["impeccable-gate: critique=RAN audit=RAN p0=1 p1=0 dispositions=none", false, "malformed"],
  ["impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=recorded", false, "malformed"],
  ["impeccable-gate: critique=RAN audit=RAN p0=00 p1=0 dispositions=none", false, "malformed"],
  ["impeccable-gate: N/A — no UI surface (probably)", false, "malformed"],
  ["impeccable-gate: N/A - no UI surface", false, "malformed"],
  ["  impeccable-gate: critique=SKIPPED audit=RAN p0=0 p1=0 dispositions=none", false, "malformed"],
  ["  " + VALID_RAN, false, "valid"],
  [TEMPLATE_LINE, true, "template"],
  [TEMPLATE_LINE, false, "malformed"],
  [VALID_RAN, true, "malformed"], // valid marker inside a template file is forbidden (§4.1.6)
];

describe("parseMarkers — grammar accept/reject table (M3, M8)", () => {
  it.each(GRAMMAR_CASES)("%#: %s (template=%s) → %s", (line, template, want) => {
    const r = parseMarkers(line, { template });
    const got: Want =
      r.valid.length > 0
        ? "valid"
        : r.template > 0
          ? "template"
          : r.malformed.length > 0
            ? "malformed"
            : "not-marker";
    expect(got).toBe(want);
  });

  it("multi-line text yields one verdict per marker line", () => {
    const text = `prose\n${VALID_RAN}\nimpeccable-gate: broken\nmore prose`;
    const r = parseMarkers(text, { template: false });
    expect(r.valid).toHaveLength(1);
    expect(r.malformed).toEqual(["impeccable-gate: broken"]);
  });
});

describe("unitVerdict — strictness (M7) and template gating (M8)", () => {
  const NONE: ReadonlySet<string> = new Set();

  it("one valid marker conforms", () => {
    const files = new Map([["p.md", `${DECLARING}\n${VALID_NA}`]]);
    expect(unitVerdict(files, { templateFiles: NONE })).toBe("conforms");
  });

  it("no marker anywhere → no-marker", () => {
    expect(unitVerdict(new Map([["p.md", DECLARING]]), { templateFiles: NONE })).toBe("no-marker");
  });

  it("valid + malformed marker → malformed-marker (M7: typos never silently not-count)", () => {
    const files = new Map([
      ["p.md", VALID_RAN],
      ["q.md", "impeccable-gate: critique=RAN audit=RAN p0=1 p1=0 dispositions=none"],
    ]);
    expect(unitVerdict(files, { templateFiles: NONE })).toBe("malformed-marker");
  });

  it("valid + INDENTED malformed marker → malformed-marker (M7, trimmed-line classification)", () => {
    const files = new Map([
      ["p.md", VALID_RAN],
      ["q.md", "   impeccable-gate: critique=SKIPPED audit=RAN p0=0 p1=0 dispositions=none"],
    ]);
    expect(unitVerdict(files, { templateFiles: NONE })).toBe("malformed-marker");
  });

  it("TEMPLATE form in a template file never confers conformance (M8)", () => {
    const files = new Map([["HANDOFF-TEMPLATE.md", `${DECLARING}\n${TEMPLATE_LINE}`]]);
    expect(unitVerdict(files, { templateFiles: new Set(["HANDOFF-TEMPLATE.md"]) })).toBe(
      "no-marker",
    );
  });

  it("TEMPLATE form OUTSIDE a template file is malformed (M8)", () => {
    const files = new Map([["p.md", TEMPLATE_LINE]]);
    expect(unitVerdict(files, { templateFiles: NONE })).toBe("malformed-marker");
  });

  it("valid marker INSIDE a template file is malformed (M8, §4.1.6)", () => {
    const files = new Map([["HANDOFF-TEMPLATE.md", VALID_RAN]]);
    expect(unitVerdict(files, { templateFiles: new Set(["HANDOFF-TEMPLATE.md"]) })).toBe(
      "malformed-marker",
    );
  });
});

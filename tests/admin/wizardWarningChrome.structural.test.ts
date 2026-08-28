/**
 * tests/admin/wizardWarningChrome.structural.test.ts
 * (wizard-warning-ignore-controls spec §2.4 — Task 13)
 *
 * Every wizard surface that derives anything from a row's warnings — counts, dots,
 * borders, chips, callouts, button labels — must read the ACTIVE partition, or the
 * chrome contradicts the list under it. §2.4 makes that true by routing every
 * derivation through two choke points. This guard is what keeps it true.
 *
 * It walks the wizard chrome tree FROM THE FILESYSTEM and flags any line reaching
 * for a row's warnings outside the registered-site list. A bypass added next month
 * fails by default rather than shipping a card whose amber border outlives the
 * warning that caused it.
 *
 * Two properties, and the second is the one that makes the first mean anything:
 *
 *   1. no UNREGISTERED site — a new direct read fails.
 *   2. the walk SAW every registered site — misconfigure the roots, rename a file,
 *      or move a choke point out of the tree, and the guard would otherwise pass
 *      having inspected nothing. That is the failure mode this arm exists for
 *      (BL-GUARD-PREMISE-REACHABILITY: a guard whose condition is false where it
 *      runs passes unconditionally, and would forever).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { stripCommentsForFile } from "@/tests/_shared/stripComments";

const ROOT = process.cwd();

/**
 * The walked tree. Every registered site below MUST live inside it — a registry row
 * pointing outside the walk is a claim the walk can never check.
 */
const WALK_ROOTS = [
  "components/admin/wizard",
  "components/admin/review/ShowReviewSurface.tsx",
  "lib/admin/step3Buckets.ts",
  "lib/admin/activeWarningEntries.ts",
  "lib/admin/wizardWarningModel.ts",
  "lib/admin/enrichStep3WarningModels.ts",
];

/** A direct reach for a row's warnings. Any of these outside a registered site is a
 *  derivation that bypasses the partition. */
const BYPASS = /warningsBySection\(|\.parseResult\??\.warnings|data\.warnings|summarizeDataGaps\(/;

/**
 * The sites allowed to read warnings directly, each with what makes it legitimate.
 * Keyed `file:symbol` so a second read in the same file still has to be registered.
 */
const REGISTERED: readonly { file: string; symbol: string; why: string }[] = [
  {
    file: "lib/admin/step3Buckets.ts",
    symbol: "nonAmbiguityGapTotal",
    why: "Choke point 1: summarizeDataGaps over `gapWarnings`, which applies the partition.",
  },
  {
    file: "lib/admin/activeWarningEntries.ts",
    symbol: "activeWarningEntries",
    why: "Choke point 2: the ONE warningsBySection call, wrapped by the partition filter.",
  },
  {
    file: "components/admin/review/ShowReviewSurface.tsx",
    symbol: "bySection",
    why: "Section-state memo: reads through the choke-point-2 wrapper, not warningsBySection.",
  },
  {
    file: "components/admin/review/ShowReviewSurface.tsx",
    symbol: "hasWarnRow",
    why: "Warnings-panel dot: filters data.warnings by the same ignored index set (§2.4).",
  },
  {
    file: "components/admin/review/ShowReviewSurface.tsx",
    symbol: "ShowReviewSurface",
    why: "The dot memo's dependency array, at component scope — a reference, not a read.",
  },
  {
    file: "components/admin/wizard/Step3SheetCard.tsx",
    symbol: "Step3SheetCard",
    why: "Card data-gap glyph: summarizeDataGaps over `activeGapWarnings` (choke point 1).",
  },
  {
    file: "components/admin/wizard/Step3ReviewModal.tsx",
    symbol: "bySection",
    why: "Attention memo: hands data.warnings to the choke-point-2 wrapper with the ignored set.",
  },
];

function walkFiles(): string[] {
  const out: string[] = [];
  const visit = (path: string) => {
    const full = join(ROOT, path);
    if (statSync(full).isDirectory()) {
      for (const entry of readdirSync(full, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        visit(join(path, entry.name));
      }
      return;
    }
    if (/\.tsx?$/.test(path)) out.push(path);
  };
  for (const root of WALK_ROOTS) visit(root);
  return out;
}

/** Every bypass-pattern line in the walked tree, as `{file, line, text}`. */
function bypassHits(): Array<{ file: string; line: number; text: string }> {
  const hits: Array<{ file: string; line: number; text: string }> = [];
  for (const file of walkFiles()) {
    const rel = relative(ROOT, join(ROOT, file));
    const source = stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), rel);
    source.split("\n").forEach((text, i) => {
      if (BYPASS.test(text)) hits.push({ file: rel, line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

/**
 * The ENCLOSING declaration name for a line — how a hit is attributed to a registered
 * SYMBOL rather than merely to a file.
 *
 * Scans upward for the nearest declaration at a STRICTLY SMALLER indent, which is the
 * scope the hit sits inside. "Nearest declaration at any indent" was the first draft
 * and it is wrong in a way that looks right: for `const s = summarizeDataGaps(...)`
 * inside `nonAmbiguityGapTotal`, it attributes the hit to `s` — the binding on that
 * very line — so every registry row would have to name a local temporary, and renaming
 * one would silently unregister its site.
 */
function enclosingSymbol(source: string, line: number): string | null {
  const lines = source.split("\n");
  const indentOf = (text: string) => text.length - text.trimStart().length;
  const hitIndent = indentOf(lines[line - 1] ?? "");
  const DECL =
    /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*[:=])/;
  for (let i = line - 2; i >= 0; i -= 1) {
    const text = lines[i] ?? "";
    if (text.trim() === "") continue;
    if (indentOf(text) >= hitIndent) continue;
    const m = DECL.exec(text);
    if (m) return (m[1] ?? m[2]) as string;
  }
  // A hit on the declaration line itself belongs to that declaration.
  const own = DECL.exec(lines[line - 1] ?? "");
  return own ? ((own[1] ?? own[2]) as string) : null;
}

describe("wizard warning chrome reads the partition (§2.4 structural guard)", () => {
  it("PREMISE: the walk saw every registered site", () => {
    // Without this the guard is a claim about a tree it might not be reading. Rename
    // a choke point, move it out of the roots, or mistype a registry path, and the
    // bypass check below would pass having inspected nothing.
    const hits = bypassHits();
    const seen = new Set(
      hits
        .map((h) => {
          const source = stripCommentsForFile(readFileSync(join(ROOT, h.file), "utf8"), h.file);
          const symbol = enclosingSymbol(source, h.line);
          return symbol ? `${h.file}:${symbol}` : null;
        })
        .filter((k): k is string => k !== null),
    );
    const missing = REGISTERED.filter((r) => !seen.has(`${r.file}:${r.symbol}`)).map(
      (r) => `${r.file}:${r.symbol}`,
    );
    expect(missing, "registered sites the walk never found").toEqual([]);
    // And the walk is non-empty at all: an empty hit list would satisfy the bypass
    // assertion below for every file at once.
    expect(hits.length, "no warning reads discovered — the guard is vacuous").toBeGreaterThan(0);
  });

  it("no UNREGISTERED site reaches for a row's warnings", () => {
    const registered = new Set(REGISTERED.map((r) => `${r.file}:${r.symbol}`));
    const offenders: string[] = [];
    for (const hit of bypassHits()) {
      const source = stripCommentsForFile(readFileSync(join(ROOT, hit.file), "utf8"), hit.file);
      const symbol = enclosingSymbol(source, hit.line);
      const key = `${hit.file}:${symbol ?? "<module scope>"}`;
      if (!registered.has(key)) offenders.push(`${key} (line ${hit.line}): ${hit.text}`);
    }
    expect(
      offenders,
      "these derive from a row's warnings outside the §2.4 choke points — route them " +
        "through `activeGapWarnings` (row-level) or `activeWarningEntries` (section-level), " +
        "or add a registry row saying why this one is legitimate",
    ).toEqual([]);
  });

  it("every registered site lives INSIDE the walked tree", () => {
    // A row whose file the walk never visits is unfalsifiable: it can never fail the
    // premise and can never be checked. (R1 F8.)
    const walked = new Set(walkFiles());
    const outside = REGISTERED.filter((r) => !walked.has(r.file)).map((r) => r.file);
    expect(outside, "registered files outside WALK_ROOTS").toEqual([]);
  });
});

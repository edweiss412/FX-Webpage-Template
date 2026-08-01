/**
 * Structural guard (spec 2026-08-01-focus-ring-a11y-pass §4.3): every
 * `ring-offset-2` under app/ and components/ must carry a same-variant-chain
 * companion naming a FOCUS_BACKDROP_ALLOWLIST token, OR live in a registered
 * indirection file. Arbitrary `ring-offset-[…]` values are banned outright.
 * Second tripwire: no focus-prefixed `outline-accent` anywhere (spec §2.1).
 *
 * Line-scoped tripwire with file-scoped registry trust — green means "no
 * known spelling is present", posture per
 * tests/cross-cutting/no-absolute-self-redirect-audit.ts. NOTE: this walker
 * reads NUL-containing files (e.g. components/admin/wizard/Step3Review.tsx)
 * that rg/grep skip as binary — do not "verify" its counts with rg.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOCUS_BACKDROP_ALLOWLIST } from "./_focusBackdropAllowlist";

const ROOTS = ["app", "components"];
// File-scoped trust: any ring-offset-2 line in these files is accepted; the
// companion is assembled away from the offset line (maps, split literals).
// A NEW file assembling companions elsewhere fails by default until listed.
const INDIRECTION_REGISTRY: Record<string, string> = {
  "components/shared/ReportButton.tsx": "RING_OFFSET_CLASS map",
  "components/shared/AccentButton.tsx": "RING_OFFSET_CLASS map + doc comment",
  "components/crew/CrewSubNav.tsx": "split adjacent literals",
  "components/admin/PerShowActionableWarnings.tsx": "linkOffsetClass",
  "components/admin/SheetIconLink.tsx": "BACKDROP_SKIN map",
  "components/admin/DataQualityWarningControls.tsx": "RING_OFFSET map",
};
const COMMENT = /^\s*(\/\/|\*|\{\/\*)/;
const OFFSET = /((?:[\w-]+:)*)ring-offset-2(?![\w-])/g;
const FOCUS_OUTLINE_ACCENT = /((?:[\w-]+:)*)outline-accent(?![\w-])/g;
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Violation = { site: string; reason: string };

export function lineViolations(rel: string, text: string, lineNo: number): Violation[] {
  const out: Violation[] = [];
  if (COMMENT.test(text)) return out;
  const site = `${rel}:${lineNo}`;
  if (text.includes("ring-offset-[")) {
    out.push({ site, reason: "arbitrary ring-offset value (banned, spec 4.3)" });
    return out;
  }
  for (const hit of text.matchAll(FOCUS_OUTLINE_ACCENT)) {
    if ((hit[1] ?? "").includes("focus")) {
      out.push({ site, reason: "focus-prefixed outline-accent (spec 2.1)" });
    }
  }
  for (const hit of text.matchAll(OFFSET)) {
    const chain = hit[1] ?? "";
    const companion = new RegExp(
      `(?:^|[\\s"'\`])${esc(chain)}ring-offset-(${FOCUS_BACKDROP_ALLOWLIST.join("|")})(?![\\w/-])`,
    );
    if (companion.test(text)) continue;
    if (rel in INDIRECTION_REGISTRY) continue;
    out.push({ site, reason: `bare ring-offset-2 (chain "${chain}")` });
  }
  return out;
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

describe("no bare ring-offset-2 / no focus outline-accent (spec 4.3)", () => {
  it("tree is clean", () => {
    const all: Violation[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root, [])) {
        const rel = file.split("\\").join("/");
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((text, i) => {
            all.push(...lineViolations(rel, text, i + 1));
          });
      }
    }
    expect(all).toEqual([]);
  });

  // Mutant self-checks: pin the predicate against the spec's closure families.
  const cases: Array<[string, string, boolean]> = [
    ["a.tsx", 'className="focus-visible:ring-offset-2"', true], // family 1: bare
    ["a.tsx", 'className="focus-visible:ring-offset-2 focus-visible:ring-offset-text"', true], // family 2: non-backdrop token
    ["a.tsx", 'className="focus-visible:ring-offset-2 focus-visible:ring-offset-garbage"', true], // family 3: non-emitting spelling
    ["a.tsx", 'className="focus-visible:ring-offset-2 focus-visible:ring-offset-[garbage]"', true], // family 4: arbitrary value
    [
      "a.tsx",
      'className="focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-text)]"',
      true,
    ], // family 4: arbitrary var
    [
      "a.tsx",
      'className="peer-focus-visible:ring-offset-2 focus-visible:ring-offset-surface"',
      true,
    ], // family 5: chain mismatch
    ["a.tsx", "className={`focus-visible:ring-offset-2 ${x}`}", true], // family 6: unregistered indirection
    ["a.tsx", 'className="focus-visible:outline-accent"', true], // family 7: focus outline-accent
    [
      "a.tsx",
      'className="focus-visible:ring-offset-2 focus-visible:ring-offset-surface/garbage"',
      true,
    ], // whole-diff A mutant: modifier suffix emits nothing in Tailwind v4
    ["a.tsx", 'className="focus-visible:ring-offset-2 focus-visible:ring-offset-surface"', false],
    [
      "a.tsx",
      'className="peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface"',
      false,
    ],
    [
      "components/shared/ReportButton.tsx",
      "className={`focus-visible:ring-offset-2 ${offsetClass}`}",
      false,
    ], // registry lane
    ["a.tsx", 'className="outline-accent"', false], // non-focus outline-accent is out of scope
  ];
  for (const [rel, text, expected] of cases) {
    it(`predicate: ${text.slice(0, 58)} -> ${String(expected)}`, () => {
      expect(lineViolations(rel, text, 1).length > 0).toBe(expected);
    });
  }
});

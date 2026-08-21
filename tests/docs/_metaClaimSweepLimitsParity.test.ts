/**
 * The claim sweep's module header restates spec §5's documented limits, and
 * this asserts it VERBATIM by COMPARISON of the whole item rather than by
 * prefix.
 *
 * A documented limit belongs where the code is READ, not only where the spec is
 * filed, so the module carries its own copy. Two copies drift, and the drift is
 * silent in the direction that looks green: a prefix grep for each item's number
 * and opening clause passes a header that carries every opening clause and then
 * TRUNCATES or CONTRADICTS the rest, which establishes nothing about the word
 * "verbatim" the header claims. So the check is sequence EQUALITY over the
 * normalised item text, and it names the first item that differs.
 *
 * It reads both files as TEXT and imports nothing from the module, which is why
 * it is not one of the surface's deciding suites: it decides a docs-to-code
 * parity question, not a behavioural one, and enrolling it would buy wall clock
 * at no mutation score.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SPEC = readFileSync(
  join(ROOT, "docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md"),
  "utf8",
);
const MODULE = readFileSync(join(ROOT, "lib/specLint/claimSweep.ts"), "utf8");

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** §5's numbered items, each as one normalised string, in document order. */
function specLimits(text: string): { n: number; body: string }[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## 5. Documented limits"));
  const end = lines.findIndex((l) => l.startsWith("## 6. Testing"));
  if (start < 0 || end < 0 || end <= start) throw new Error("§5 boundaries not found");
  return collect(lines.slice(start + 1, end), /^(\d+)\. (.*)$/, (l) => l);
}

/** The header block's numbered items, with the ` * ` comment prefix stripped. */
function headerLimits(text: string): { n: number; body: string }[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.includes("DOCUMENTED LIMITS"));
  if (start < 0) throw new Error("header limits block not found");
  const end = lines.findIndex((l, i) => i > start && l.trimEnd() === " */");
  if (end < 0) throw new Error("header docblock never closes");
  return collect(lines.slice(start + 1, end), /^ \* (\d+)\. (.*)$/, (l) =>
    l.replace(/^ \* ?/, ""),
  );
}

/** Shared walk: an item runs until the next numbered item or the block's end. */
function collect(
  lines: string[],
  head: RegExp,
  strip: (line: string) => string,
): { n: number; body: string }[] {
  const items: { n: number; parts: string[] }[] = [];
  for (const line of lines) {
    const m = head.exec(line);
    if (m !== null) {
      items.push({ n: Number(m[1]), parts: [m[2]!] });
      continue;
    }
    // A RULE ENDS THE LAST ITEM. The module's header closes its limits block
    // with a dashed separator, and an item-runs-until-the-next-item walk
    // swallows it into item 10 -- which reported a difference of exactly one
    // horizontal rule and named it drift. A checker that manufactures its own
    // mismatch is worse than none: it would have been silenced by widening the
    // comparison, which is how a real drift gets waived later.
    if (/^-{5,}$/.test(squash(strip(line)))) break;
    if (items.length > 0) items[items.length - 1]!.parts.push(strip(line));
  }
  return items.map((i) => ({ n: i.n, body: squash(i.parts.join(" ")) }));
}

/** Every disagreement, never just the first, so one run names them all. */
export function compareLimits(
  spec: { n: number; body: string }[],
  header: { n: number; body: string }[],
): string[] {
  const out: string[] = [];
  if (spec.length !== header.length) {
    out.push(`item COUNT differs: spec has ${spec.length}, header has ${header.length}`);
  }
  for (let i = 0; i < Math.min(spec.length, header.length); i += 1) {
    const s = spec[i]!;
    const h = header[i]!;
    if (s.n !== h.n) out.push(`item ${i + 1} is numbered ${s.n} in the spec and ${h.n} in the header`);
    else if (s.body !== h.body) {
      out.push(
        `item ${s.n} differs.\n  SPEC  : ${s.body.slice(0, 220)}\n  HEADER: ${h.body.slice(0, 220)}`,
      );
    }
  }
  return out;
}

describe("claimSweep module header restates spec §5 verbatim", () => {
  const spec = specLimits(SPEC);
  const header = headerLimits(MODULE);

  it("PREMISE: both extractions found the ten items", () => {
    // Sequence equality over two empty lists is a pass, and a boundary rename in
    // either file produces exactly that. The count is the floor that makes the
    // clean verdict below attributable.
    expect(spec.map((i) => i.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(header.map((i) => i.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("agrees item for item, whole text and not merely the opening clause", () => {
    expect(compareLimits(spec, header)).toEqual([]);
  });

  it("POSITIVE CONTROL: a truncated item is REPORTED, by number", () => {
    // Without this, a comparator that always returns [] passes the case above.
    // The mutation is a truncation rather than a rewrite because truncation is
    // exactly what a prefix check cannot see.
    const truncated = header.map((i) =>
      i.n === 3 ? { n: 3, body: squash(i.body.split(" ").slice(0, 4).join(" ")) } : i,
    );
    const found = compareLimits(spec, truncated);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("item 3 differs");
  });

  it("POSITIVE CONTROL: a DROPPED item is reported as a count difference", () => {
    const dropped = header.filter((i) => i.n !== 7);
    expect(compareLimits(spec, dropped).join(" ")).toContain("item COUNT differs");
  });
});

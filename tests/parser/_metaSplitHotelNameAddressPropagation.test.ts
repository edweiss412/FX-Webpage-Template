// tests/parser/_metaSplitHotelNameAddressPropagation.test.ts
//
// Source-scanning guard for S6. `splitHotelNameAddress` is PURE: it returns an
// ambiguity but emits nothing, so every caller must propagate its own result
// into a stash.
//
// SCOPE OF THE GUARANTEE (whole-diff R7 f2). A regex scanner cannot prove
// SEMANTIC propagation — an empty `if`, a no-op ternary, or a pass to a no-op
// function all satisfy any textual "feeds" shape. What this file pins is the
// call-site INVENTORY (exact count, every call a scanned binding) and the
// BINDING DISCIPLINE (each binding's `.ambiguity` is read in a feeding
// position). Semantic propagation is proven BEHAVIORALLY, per reachable
// caller×arm, in hotelAddressIntegration.test.ts (full payloads) and the
// first-stash-wins content oracles — probe-verified: a P3(a)-filtering ternary
// at the inline no-guest caller (R7 f2's own example) fails 3 behavioral tests,
// because that caller's P3(b) arm IS observable. The single genuinely masked
// cell is the no-guest caller's P3(a) arm — dropping it is OUTPUT-IDENTICAL by
// construction: `stripHotelNameConf` re-splits the unsplit text and re-stashes
// the same reason and the same splitInput, so no oracle can or needs to see it.
//
// This is a per-call BINDING check, not a file-level token count: a scanner that
// merely counted N calls and N nearby `ambiguity` tokens would pass while one
// caller dropped its result.
//
// First-stash-wins (`addr ??=`) IS observable by content, and is pinned
// behaviorally in tests/parser/hotelAddressIntegration.test.ts at every
// reachable merge site (spec §8.1 "pinned by CONTENT, not count"). An earlier
// header here claimed the two stashes could never differ; whole-diff R4 f2
// refuted it with `71 Wacker Drive 72 Main St Chicago, IL 60601` — P3(b) at
// the build split, then P3(a) when the retained name `71 Wacker Drive`
// re-splits via position-0 padding. Last-wins silently downgrades a resolvable
// card to a disabled one.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "lib/parser/blocks/hotels.ts");

/** All `const <id> = splitHotelNameAddress(` bindings, tolerant of the call
 * being reformatted across line breaks (whole-diff R3 finding 3: the previous
 * per-line scan went blind on a wrapped call while the total-call count still
 * passed). */
function scanBindings(source: string): Array<{ binding: string; line: number }> {
  const re = /const\s+(\w+)\s*=\s*splitHotelNameAddress\s*\(/g;
  const out: Array<{ binding: string; line: number }> = [];
  for (const m of source.matchAll(re)) {
    out.push({
      binding: m[1]!,
      line: source.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

/**
 * For each binding, require that the SAME binding's `.ambiguity` FEEDS a
 * consumer within the following window. Binding-scoped, so a sibling caller's
 * propagation cannot satisfy a caller that dropped its own.
 */
function unpropagatedCallers(source: string): string[] {
  const lines = source.split("\n");
  const bad: string[] = [];
  for (const { binding, line } of scanBindings(source)) {
    const window = lines.slice(line - 1, line - 1 + 14).join("\n");
    const amb = `\\b${binding}\\.ambiguity\\b`;
    // The read must FEED something that can reach a stash. A bare
    // `void split.ambiguity` (whole-diff R1 finding 5) or a dead assignment
    // `const ignored = split.ambiguity` (whole-diff R3 finding 3) satisfies
    // "is mentioned" while propagating nothing, so a plain `=` binding does
    // NOT count — no live caller uses one.
    const feeds = [
      new RegExp(`if\\s*\\(${amb}`), // guarded stash
      new RegExp(`${amb}\\s*\\?`), // ternary / spread into an object
      new RegExp(`\\?\\?=\\s*${amb}`), // merged into an existing stash
      new RegExp(`\\(\\s*${amb}`), // passed as an argument
    ];
    if (!feeds.some((re) => re.test(window))) {
      bad.push(
        `line ${line}: \`${binding}.ambiguity\` is never propagated ` +
          `(no guard, stash-merge, or argument use within ${14} lines)`,
      );
    }
  }
  return bad;
}

describe("splitHotelNameAddress propagation (source guard)", () => {
  it("every call site propagates its OWN result's ambiguity", () => {
    const src = readFileSync(SRC, "utf8");
    const bad = unpropagatedCallers(src);
    expect(bad, `unpropagated splitHotelNameAddress call sites:\n${bad.join("\n")}`).toEqual([]);
  });

  it("still finds every call site (fails-by-default if the call shape changes)", () => {
    const src = readFileSync(SRC, "utf8");
    const calls = [...src.matchAll(/splitHotelNameAddress\s*\(/g)].length;
    // EXACT, not a floor: a floor cannot fail when a caller is added or removed,
    // so it never forces the propagation question to be re-answered (whole-diff
    // R1 finding 5). 5 call sites + 1 definition.
    expect(calls).toBe(6);
  });

  it("every non-definition call is a scanned const binding (nothing escapes the guard)", () => {
    // Without this, a caller reshaped away from `const x = ...` — inlined as an
    // argument, chained, destructured — would drop out of the binding scan while
    // the total-call count above still reads 6 (whole-diff R3 finding 3).
    const src = readFileSync(SRC, "utf8");
    expect(scanBindings(src)).toHaveLength(5);
  });

  // Proves the scanner's binding check actually discriminates — without this the
  // guard could be vacuous and nobody would know.
  it.each([
    [
      "a caller that ignores its result entirely",
      ["const b = splitHotelNameAddress(y);", "row.hotel_name = b.name;"].join("\n"),
    ],
    [
      "a caller that mentions .ambiguity without propagating it",
      ["const b = splitHotelNameAddress(y);", "void b.ambiguity;"].join("\n"),
    ],
    [
      "a caller that binds .ambiguity to a dead local",
      ["const b = splitHotelNameAddress(y);", "const ignored = b.ambiguity;"].join("\n"),
    ],
    [
      "a WRAPPED call that drops its result (the scan is not line-bound)",
      ["const b =", "  splitHotelNameAddress(y);", "row.hotel_name = b.name;"].join("\n"),
    ],
  ])("REJECTS %s", (_label, sample) => {
    const src = [
      "const a = splitHotelNameAddress(x);",
      "if (a.ambiguity) stash(a.ambiguity);",
      sample,
    ].join("\n");
    const bad = unpropagatedCallers(src);
    expect(bad, "the compliant caller must pass and the offender must fail").toHaveLength(1);
    expect(bad[0]).toContain("`b.ambiguity`");
  });

  it("ACCEPTS a wrapped call that does propagate", () => {
    const src = [
      "const a =",
      "  splitHotelNameAddress(x);",
      "if (a.ambiguity) stash(a.ambiguity);",
    ].join("\n");
    expect(unpropagatedCallers(src)).toEqual([]);
    expect(scanBindings(src)).toHaveLength(1);
  });
});

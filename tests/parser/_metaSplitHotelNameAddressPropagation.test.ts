// tests/parser/_metaSplitHotelNameAddressPropagation.test.ts
//
// Source-scanning guard for S6. `splitHotelNameAddress` is PURE: it returns an
// ambiguity but emits nothing, so every caller must propagate its own result
// into a stash. One of the nine caller×arm cells is NOT behaviorally
// observable — the inline no-guest caller cannot be reached with a confirmation
// token (every shape `stripConfTokens` removes also makes `hasGuest` true), and
// `stripHotelNameConf` re-splits and produces the same warning, masking it. So
// that cell is guarded structurally instead.
//
// This is a per-call BINDING check, not a file-level token count: a scanner that
// merely counted N calls and N nearby `ambiguity` tokens would pass while one
// caller dropped its result.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "lib/parser/blocks/hotels.ts");

/**
 * For each `const <id> = splitHotelNameAddress(...)`, require that the SAME
 * binding's `.ambiguity` is read within the following window. Binding-scoped, so
 * a sibling caller's propagation cannot satisfy a caller that dropped its own.
 */
function unpropagatedCallers(source: string): string[] {
  const lines = source.split("\n");
  const bad: string[] = [];
  lines.forEach((line, i) => {
    const m = /const\s+(\w+)\s*=\s*splitHotelNameAddress\s*\(/.exec(line);
    if (!m) return;
    const binding = m[1]!;
    const window = lines.slice(i, i + 14).join("\n");
    if (!new RegExp(`\\b${binding}\\.ambiguity\\b`).test(window)) {
      bad.push(`line ${i + 1}: \`${binding}\` never reads ${binding}.ambiguity`);
    }
  });
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
    // 5 call sites + 1 definition. A new caller raises this and must be
    // deliberately accounted for here.
    expect(calls).toBeGreaterThanOrEqual(6);
  });

  // Proves the scanner's binding check actually discriminates — without this the
  // guard could be vacuous and nobody would know.
  it("REJECTS a synthetic caller that drops its own result", () => {
    const dropped = [
      "const a = splitHotelNameAddress(x);",
      "row.hotel_name = a.name;",
      "if (a.ambiguity) stash(a.ambiguity);",
      "const b = splitHotelNameAddress(y);",
      "row.hotel_name = b.name;",
      "row.hotel_address = b.address;",
    ].join("\n");
    const bad = unpropagatedCallers(dropped);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain("`b`");
  });
});

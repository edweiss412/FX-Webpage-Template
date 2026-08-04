/**
 * Structural meta-test: every predicate line documented in
 * `lib/visibility/capabilityTransitions.ts` must match the BEHAVIOR of the
 * live `lib/visibility/scopeTiles.ts` function it claims to quote.
 *
 * Expected values are parsed from the comment; actual values come from
 * calling the live function. Neither side derives from the other, so this
 * cannot pass tautologically.
 *
 * Scope of the sweep, stated precisely: every SUBSET of the 20-flag universe,
 * at two orderings each (canonical and reversed), against BOTH isAdmin
 * values, for every predicate. It does NOT establish order-insensitivity --
 * a three-element permutation can hide, and 20! is not enumerable. That is
 * acceptable because the live predicates are Array.includes disjunctions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as scopeTiles from "@/lib/visibility/scopeTiles";
import type { RoleFlag } from "@/lib/parser/types";

const MODULE_REL = "lib/visibility/capabilityTransitions.ts";
const BLOCK_SENTINEL = "Tile-visibility rules";

const ALL_ROLE_FLAGS = [
  "LEAD",
  "A1",
  "A2",
  "V1",
  "L1",
  "GS",
  "BO",
  "CAM_OP",
  "PTZ",
  "LED",
  "STREAM",
  "GAV",
  "FLOATER",
  "FLOOR",
  "SHOW_CALLER",
  "GREEN_ROOM",
  "OWNER",
  "CONTENT_CREATION",
  "FINANCIALS",
  "ONLY",
] as const satisfies readonly RoleFlag[];

// A RoleFlag added to lib/parser/types.ts and not added above is a COMPILE
// error here, so the sweep below can never silently under-test.
type NoFlagOmitted =
  Exclude<RoleFlag, (typeof ALL_ROLE_FLAGS)[number]> extends never ? true : never;
const _exhaustive: NoFlagOmitted = true;
void _exhaustive;

/**
 * Exported `*Visible` functions that are NOT capability-flag gates and so
 * have no place in a block of flag disjunctions. Registry-or-exemption idiom,
 * same shape as invariants 9 and 10: reflection finds every export, and each
 * must be documented OR exempted here with a reason, so a NEW export is
 * uncovered-by-default rather than silently skipped.
 */
const NOT_FLAG_GATED: Record<string, string> = {
  transportTileVisible:
    "takes an options object (transportation row, viewerId, transportationOwnerIds, viewerName), not a RoleFlag[]; gates on transport ownership, not on a capability flag. lib/visibility/scopeTiles.ts:180",
};

interface DocumentedPredicate {
  readonly name: string;
  readonly tokens: readonly string[];
}

/**
 * Returns the CONTENT of a JSDoc line: drops the leading `*` decoration so the
 * text can be read. Deliberately NOT `tests/_shared/stripComments` — that
 * module removes comments FROM code, which here would delete the block this
 * guard exists to read. Named to say so, since a `strip*Comment*` name would
 * (correctly) trip the single-source detector for a thing this is not.
 */
function jsdocLineContent(line: string): string {
  return line.replace(/^\s*\*[ \t]?/, "");
}

/** Pure -- takes source text so the negative cases can drive it directly. */
function parseDocumentedPredicates(source: string): DocumentedPredicate[] {
  const lines = source.split("\n");
  const sentinelLines = lines.filter((line) => line.includes(BLOCK_SENTINEL));
  if (sentinelLines.length === 0) {
    throw new Error(
      `documented-predicate block not found: no line contains "${BLOCK_SENTINEL}". ` +
        `That heading marks the quoted-predicate block; restore it if it was renamed.`,
    );
  }
  // Uniqueness matters: findIndex would bind to the FIRST occurrence, so a
  // second (correct) block could shadow drift in the real one and the whole
  // powerset sweep would pass against the decoy.
  if (sentinelLines.length > 1) {
    throw new Error(
      `documented-predicate block is ambiguous: ${sentinelLines.length} lines contain ` +
        `"${BLOCK_SENTINEL}". Exactly one block may carry the sentinel.`,
    );
  }
  const headerIdx = lines.findIndex((line) => line.includes(BLOCK_SENTINEL));
  const out: DocumentedPredicate[] = [];
  let started = false;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) break;
    const body = jsdocLineContent(raw).trim();
    if (body === "") {
      if (started) break;
      continue;
    }
    const m = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^(]*)/.exec(body);
    if (m === null) {
      // Prose between the heading and the quotes (e.g. a wrapped continuation
      // of the heading itself) is skipped; once the quotes START, a non-quote
      // line terminates the block rather than being tolerated.
      if (started) break;
      continue;
    }
    started = true;
    const name = m[1]!;
    const expr = m[2]!.trim();
    if (!/^[A-Za-z0-9_]+(\s*\|\|\s*[A-Za-z0-9_]+)*$/.test(expr)) {
      throw new Error(
        `documented predicate "${name}" uses an expression shape this guard does not ` +
          `interpret (only "a || b || c" is supported): ${expr}`,
      );
    }
    out.push({ name, tokens: expr.split("||").map((t) => t.trim()) });
  }
  return out;
}

type FlagPredicate = (flags: RoleFlag[], isAdmin?: boolean) => boolean;

const REFLECTED: ReadonlyArray<readonly [string, FlagPredicate]> = Object.entries(
  scopeTiles as Record<string, unknown>,
)
  .filter(([key, value]) => key.endsWith("Visible") && typeof value === "function")
  .map(([key, value]) => [key, value as FlagPredicate] as const)
  .sort((a, b) => a[0].localeCompare(b[0]));

const GATED = REFLECTED.filter(([name]) => !(name in NOT_FLAG_GATED));

/**
 * ALWAYS passes both arguments and ALWAYS sweeps both isAdmin values.
 *
 * A hand-written TAKES_IS_ADMIN set and `fn.length >= 2` were both tried and
 * both refuted -- default parameters do not contribute to Function.length, so
 * `(flags, isAdmin = false) => isAdmin || ...` reports length 1 and would
 * never be swept with isAdmin=true. There is no reliable runtime signal for
 * "does this take isAdmin", so the guard stops asking. A predicate that
 * genuinely ignores the argument answers identically either way, which is
 * exactly what a documented expression carrying no isAdmin token predicts.
 */
function callPredicate(fn: FlagPredicate, flags: RoleFlag[], isAdmin: boolean): boolean {
  return fn(flags, isAdmin);
}

const SOURCE = readFileSync(join(process.cwd(), MODULE_REL), "utf8");

describe("documented predicate lines match live scopeTiles behavior", () => {
  const documented = parseDocumentedPredicates(SOURCE);

  test("every NOT_FLAG_GATED key still names a live export", () => {
    const reflectedNames = new Set(REFLECTED.map(([name]) => name));
    const dangling = Object.keys(NOT_FLAG_GATED).filter((name) => !reflectedNames.has(name));
    expect(dangling).toEqual([]);
  });

  test("every NOT_FLAG_GATED exemption carries a real reason", () => {
    const hollow = Object.entries(NOT_FLAG_GATED).filter(
      ([, reason]) => reason.trim().length < 20 || !/\.ts:\d+/.test(reason),
    );
    expect(hollow).toEqual([]);
  });

  test("every reflected *Visible export is either documented or exempted", () => {
    const documentedNames = new Set(documented.map((d) => d.name));
    const unclassified = REFLECTED.map(([name]) => name).filter(
      (name) => !documentedNames.has(name) && !(name in NOT_FLAG_GATED),
    );
    expect(unclassified).toEqual([]);
  });

  test("every documented name is a real, non-exempted export", () => {
    expect(documented.map((d) => d.name).sort((a, b) => a.localeCompare(b))).toEqual(
      GATED.map(([name]) => name),
    );
  });

  test.each(documented.map((d) => [d.name, d] as const))(
    "%s: every documented token is real vocabulary",
    (_name, doc) => {
      const vocabulary = new Set<string>([...ALL_ROLE_FLAGS, "isAdmin"]);
      for (const token of doc.tokens) expect(vocabulary.has(token)).toBe(true);
    },
  );

  test.each(documented.map((d) => [d.name, d] as const))(
    "%s: documented tokens equal the live function over the ENTIRE flag powerset",
    (name, doc) => {
      const entry = GATED.find(([n]) => n === name);
      expect(entry).toBeDefined();
      const fn = entry![1];

      const adminGrants = doc.tokens.includes("isAdmin");

      let tokenMask = 0;
      ALL_ROLE_FLAGS.forEach((flag, i) => {
        if (doc.tokens.includes(flag)) tokenMask |= 1 << i;
      });

      const mismatches: string[] = [];
      const total = 1 << ALL_ROLE_FLAGS.length; // 2**20 = 1_048_576
      outer: for (const isAdmin of [false, true]) {
        for (let mask = 0; mask < total; mask++) {
          const subset: RoleFlag[] = [];
          for (let i = 0; i < ALL_ROLE_FLAGS.length; i++) {
            if (mask & (1 << i)) subset.push(ALL_ROLE_FLAGS[i]!);
          }
          const expected = (isAdmin && adminGrants) || (mask & tokenMask) !== 0;

          if (callPredicate(fn, subset, isAdmin) !== expected) {
            mismatches.push(
              `${name}([${subset.join(",")}], isAdmin=${isAdmin}) documented=${expected} live=${!expected}`,
            );
            if (mismatches.length >= 5) break outer;
          }
          // The bitmask emits ONE canonical ordering per subset, so a
          // position-dependent branch can hide. Checking the reverse widens
          // that; it does not close it (a three-element permutation escapes,
          // and 20! is not enumerable). Widened spot-check, not a proof.
          const reversed = [...subset].reverse();
          if (callPredicate(fn, reversed, isAdmin) !== expected) {
            mismatches.push(
              `${name}([${reversed.join(",")}] reversed, isAdmin=${isAdmin}) documented=${expected} live=${!expected}`,
            );
            if (mismatches.length >= 5) break outer;
          }
        }
      }

      // ONE assertion, not 2**20 of them.
      expect(mismatches).toEqual([]);
    },
  );
});

describe("the parser fails loudly rather than silently passing", () => {
  test("M7: missing sentinel throws", () => {
    expect(() => parseDocumentedPredicates("/**\n * nothing here\n */")).toThrow(
      /documented-predicate block not found/,
    );
  });

  test("M8: a short block yields fewer entries than there are gated predicates", () => {
    const short = ` * Tile-visibility rules:\n *\n *   audioScopeVisible = A1\n *\n`;
    expect(parseDocumentedPredicates(short)).toHaveLength(1);
    expect(parseDocumentedPredicates(short).length).toBeLessThan(GATED.length);
  });

  test("M25: a duplicate sentinel block is ambiguous, not silently preferred", () => {
    const decoy =
      ` * Tile-visibility rules:\n *\n *   financialsVisible = isAdmin || LEAD || FINANCIALS\n *\n` +
      ` * Tile-visibility rules:\n *\n *   financialsVisible = isAdmin || LEAD\n *\n`;
    expect(() => parseDocumentedPredicates(decoy)).toThrow(/ambiguous: 2 lines contain/);
  });

  test("M9: an unsupported operator throws", () => {
    const bad = ` * Tile-visibility rules:\n *\n *   financialsVisible = isAdmin && LEAD\n *\n`;
    expect(() => parseDocumentedPredicates(bad)).toThrow(/expression shape this guard does not/);
  });
});

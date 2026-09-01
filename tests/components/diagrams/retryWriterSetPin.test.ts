/**
 * The retry-state writer set, pinned as a POPULATION rather than as prose.
 *
 * WHY THIS EXISTS, and it is a defect record rather than a design note. The plan
 * for this arc claimed the availability sweeps were unedited by the Set-to-Map
 * change; review round 3 refuted it. The repair ran three greps, published the
 * five sites they found, and called the result a derivation. Review round 4 found
 * that none of those greps had included `new Set(`, and the live count is
 * SEVENTEEN such sites across the two components. Three greps chosen by an author
 * cover exactly what that author already suspected, which is an enumeration
 * wearing a derivation's clothes.
 *
 * So the count lives here, in code, and not in a table anyone has to remember to
 * update. A writer added later without the functional form fails; a writer added
 * deliberately updates EXPECTED_PHASE_WRITERS and says so in review.
 *
 * WHAT THIS PINS, and what it deliberately does not. It pins the SHAPE of every
 * write to the retry phase state: the functional form, over `new Map(prev)`. It
 * does NOT pin that a writer consults `prev` before acting, because at this point
 * only some writers condition on the phase at all and a blanket requirement would
 * fail the ones that legitimately need nothing but membership. That assertion
 * arrives with Restart, the first writer that must read the phase before acting.
 *
 * The writer set is the closed half of this problem and that is the whole reason
 * it is the thing asserted. The READER set is open, three drafts of an inventory
 * over it were each refuted by the next review round, and the surviving contract
 * is a consequence bound rather than a list (design spec section 3.2a).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "../../_shared/premise";

const ROOT = process.cwd();

const COMPONENTS = [
  "components/diagrams/Gallery.tsx",
  "components/diagrams/GalleryLightbox.tsx",
] as const;

/**
 * The setter this arc converts to a Map. Named once: every assertion below keys
 * on it, and a rename that missed one of them would otherwise pass silently.
 */
const PHASE_SETTER = "setRetryPhase";

/**
 * Writers of the phase state, counted across BOTH components.
 *
 * Derived, not guessed: `node --import tsx scripts/derive-retry-set-sites.ts`
 * attributes every `new Set(prev)` / `new Map(prev)` to its enclosing setter. At
 * the merge base seventeen sites existed and SEVEN of them wrote the retry state;
 * the other ten write `failedKeys` and `wantsOriginal`, which stay Sets.
 *
 * THIRTEEN with Restart on both surfaces. The breakdown, because a bare number
 * tells a later reader nothing about which way it should legitimately move:
 * seven transitions shipped before this arc; each surface's check-in timer
 * callback added one (nine); and each surface's Restart handler plus its
 * restarting-to-pending promotion added two more (thirteen). The previous
 * revision of this comment predicted thirteen for exactly this reason and the
 * walk agreed, which is the count tracking real membership rather than being
 * retyped to match. A count that moves on its own is the failure this guards,
 * and the timer callback is the writer the pin exists for,
 * and it is the one this pin exists for. It reads `prev.get(id)` before writing,
 * which is what makes a callback that fires after its item has gone a no-op
 * rather than a stale write the next retry inherits. The count moved because a
 * writer was added on purpose; a count that moves on its own is the failure this
 * guards.
 */
const EXPECTED_PHASE_WRITERS = 13;

type Writer = { file: string; line: number; body: string };

/** Every `setRetryPhase((prev) => { ... })` call, with its body. */
function phaseWriters(file: string): Writer[] {
  const src = readFileSync(join(ROOT, file), "utf8");
  const out: Writer[] = [];
  const opener = new RegExp(`${PHASE_SETTER}\\(\\s*\\(prev\\)\\s*=>`, "g");
  for (const m of src.matchAll(opener)) {
    const start = m.index ?? 0;
    // Brace-match forward from the arrow so a nested object or closure inside the
    // updater cannot truncate the body. A regex terminator cannot do this, and a
    // truncated body would silently exempt whatever sits past the cut.
    const braceAt = src.indexOf("{", start + m[0].length - 1);
    let depth = 0;
    let end = braceAt;
    for (let i = braceAt; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push({
      file,
      line: src.slice(0, start).split("\n").length,
      body: src.slice(braceAt, end + 1),
    });
  }
  return out;
}

describe("retry phase writers are a pinned, closed set", () => {
  const writers = COMPONENTS.flatMap(phaseWriters);

  it("finds the writers at all, before asserting anything about them", () => {
    // THE PREMISE. Every assertion below is `for (const w of writers)`, which is
    // vacuously true on an empty list. A renamed setter, a moved file or a broken
    // matcher would otherwise report a clean run having read nothing at all.
    premiseHolds(`the walk found ${PHASE_SETTER} writers`, writers.length > 0);
    expect(
      writers.length,
      `expected ${EXPECTED_PHASE_WRITERS} phase writers across ${COMPONENTS.length} components; ` +
        `found ${writers.length} at ${writers.map((w) => `${w.file}:${w.line}`).join(", ")}. ` +
        "A new writer is not a test failure to route around: add it deliberately and say so.",
    ).toBe(EXPECTED_PHASE_WRITERS);
  });

  it("every writer builds the next state with `new Map(prev)`", () => {
    premiseHolds("there are writers to check", writers.length > 0);
    const setShaped = writers
      .filter((w) => w.body.includes("new Set(prev)"))
      .map((w) => `${w.file}:${w.line}`);
    expect(
      setShaped,
      "a phase writer still builds a Set, which returns the wrong container into Map-valued state",
    ).toEqual([]);

    const mapShaped = writers.filter((w) => w.body.includes("new Map(prev)"));
    expect(mapShaped.length, "every phase writer copies through `new Map(prev)`").toBe(
      writers.length,
    );
  });

  it("no writer captures the phase state instead of reading the updater argument", () => {
    premiseHolds("there are writers to check", writers.length > 0);
    // The stale-capture shape this arc chased across three review rounds: a body
    // that consults the RENDER's `retryPhase` rather than the live `prev` it was
    // handed. Reading `prev` is what makes a late callback a no-op.
    const captured = writers
      .filter((w) => /\bretryPhase\b/.test(w.body))
      .map((w) => `${w.file}:${w.line}`);
    expect(
      captured,
      "a writer reads the captured `retryPhase` from its render instead of the live `prev`",
    ).toEqual([]);
  });
});

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
import { describe, expect, it } from "vitest";

import { premiseHolds } from "../../_shared/premise";
import { PHASE_COMPONENTS, PHASE_SETTER, directPhaseWrites, phaseWriters } from "./phaseWriters";

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
 * retyped to match.
 *
 * TWELVE, not thirteen, since whole-diff review finding 1. The lightbox's Embla
 * `select` handler used to write the phase to abandon a departing slide's retry;
 * that write is gone, because abandonment now derives from the render sweep and
 * covers every route to inactivity rather than the one route `select` reports.
 * The count went DOWN because a writer was deliberately deleted, which is the
 * direction this pin is least used to and exactly why it is a pin.
 *
 * The timer callback is the writer this pin exists for. It reads `prev.get(id)`
 * before writing, which is what makes a callback that fires after its item has
 * gone a no-op rather than a stale write the next retry inherits. The count
 * moved because writers were added and removed on purpose; a count that moves on
 * its own is the failure this guards.
 */
const EXPECTED_PHASE_WRITERS = 12;

describe("retry phase writers are a pinned, closed set", () => {
  const writers = PHASE_COMPONENTS.flatMap(phaseWriters);

  it("finds the writers at all, before asserting anything about them", () => {
    // THE PREMISE. Every assertion below is `for (const w of writers)`, which is
    // vacuously true on an empty list. A renamed setter, a moved file or a broken
    // matcher would otherwise report a clean run having read nothing at all.
    premiseHolds(`the walk found ${PHASE_SETTER} writers`, writers.length > 0);
    expect(
      writers.length,
      `expected ${EXPECTED_PHASE_WRITERS} phase writers across ${PHASE_COMPONENTS.length} components; ` +
        `found ${writers.length} at ${writers.map((w) => `${w.file}:${w.line}`).join(", ")}. ` +
        "A new writer is not a test failure to route around: add it deliberately and say so.",
    ).toBe(EXPECTED_PHASE_WRITERS);
  });

  it("every DIRECT setter call is one of the two the sweep owns, and nothing else", () => {
    // Whole-diff review finding 3. Every other assertion in this file discovers
    // writers by the functional form, so a plain `setRetryPhase(new Map())` was
    // not a writer that failed the shape check — it was not a writer at all, and
    // both the count and the `new Map(prev)` assertion stayed green with one
    // added to each component (the reviewer's probe: 13 discovered before AND
    // after the mutation).
    //
    // The direct form is not banned, because it is already correct twice: the
    // render sweep hands back an ALREADY-SWEPT map, and routing that through
    // `(prev) => …` would discard the value it just computed. So the closure is
    // asserted on the SHAPE of the argument rather than on the call's absence —
    // an accept-set, which fails closed on the write nobody predicted, which is
    // the right direction for a guard whose whole job is to notice one.
    const direct = PHASE_COMPONENTS.flatMap(directPhaseWrites);
    premiseHolds("the direct-write walk found the sweep's own calls", direct.length > 0);
    const unexpected = direct
      .filter((d) => !/setRetryPhase\(sweptRetryPhase\)/.test(d.text))
      .map((d) => `${d.file}:${d.line} ${d.text.trim()}`);
    expect(
      unexpected,
      `a direct ${PHASE_SETTER} call that is not the sweep's write-back bypasses every shape ` +
        "assertion in this file. Add it deliberately and say why, or use the functional form.",
    ).toEqual([]);
    expect(direct.length, "one sweep write-back per component, and no more").toBe(
      PHASE_COMPONENTS.length,
    );
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

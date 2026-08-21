import { describe, expect, it } from "vitest";

import { mintNonce, runCompact } from "@/scripts/lib/pane-compaction-core";
import { premiseHolds } from "@/tests/_shared/premise";

/**
 * The nonce, and `--compact`'s consume-before-send ordering (spec §5.2).
 *
 * The nonce proves THIS orchestrator's checkpoint landed before THIS
 * orchestrator sends. It is deliberately not a cross-orchestrator lock: three
 * review rounds each found a new race in a nonce accreting toward that
 * guarantee, and the claim was dropped rather than bought.
 *
 * RE-TARGETED by the send-authorization arc (spec §3.2, §8.1 class 3). Three
 * describes are gone and each is named here with the deletion that retired it,
 * so nothing is silently dropped:
 *
 *  - "the nonce gate" (the three refusal rows). `runCompact` no longer gates;
 *    nonce equality is step 4 of `authorizeSend`, and the same three refusals
 *    are pinned in `authorization.test.ts` over the pass's own values. Keeping
 *    a second comparison here would mean one of the two is dead code.
 *  - "revalidation runs immediately before sending" (stale-verdict,
 *    nonce-after-revalidation, verdict-only-comparison). Every one of these
 *    injected a revalidation CALLBACK, and §3.2 deletes the second pass the
 *    callback existed for. Their subject no longer exists to be tested.
 *  - "revalidates BEFORE consuming, so a refusal leaves the record reusable".
 *    The property is real and is now STRUCTURAL rather than an ordering: a
 *    refusal never reaches `runCompact` at all. Pinned end-to-end in
 *    `adapter.test.ts`, "a refused --compact leaves the outstanding record for
 *    a retry", where the refusal is a real authorization refusal.
 */

const N1 = "1111111111111111";
const N2 = "2222222222222222";

describe("mintNonce compares against the marker and re-mints on collision", () => {
  it("never returns the value already in the marker", () => {
    // Randomness makes a repeat improbable, not impossible, and an unlucky
    // repeat would let --compact accept the PREVIOUS checkpoint before the new
    // prompt executed. A real generator cannot be made to collide on demand,
    // so the seam is what makes this case reachable at all.
    const generated = [N1, N1, N2];
    let i = 0;
    const got = mintNonce({ markerNonce: N1, random: () => generated[i++] ?? N2 });
    premiseHolds("the generator really did collide first", generated[0] === N1);
    expect(got).toBe(N2);
  });

  it("accepts the first value when there is nothing to collide with", () => {
    expect(mintNonce({ markerNonce: null, random: () => N1 })).toBe(N1);
  });
});

describe("consume-before-send, observed from INSIDE the send", () => {
  it("the record is already gone when the send is entered", () => {
    // Plan round 2 probed that `try { send() } finally { consume() }` produces
    // IDENTICAL post-hoc observations: both end with the record gone. No
    // end-state assertion can separate them, so the spy reads the record at
    // call time and reports what it saw.
    let held: string | null = N1;
    let seenAtCallTime: string | null = "not-observed";
    runCompact({
      consume: () => {
        held = null;
      },
      send: () => {
        seenAtCallTime = held;
      },
    });
    premiseHolds("the spy actually ran", seenAtCallTime !== "not-observed");
    expect(seenAtCallTime).toBeNull();
  });

  it("consumes exactly once, and sends the slash command rather than prose", () => {
    // The positive twin of the ordering case: an implementation that consumed
    // and sent NOTHING would satisfy "the record is gone when the send is
    // entered" vacuously, because the spy would never run.
    let consumes = 0;
    const sent: string[] = [];
    runCompact({
      consume: () => {
        consumes += 1;
      },
      send: (s) => sent.push(s),
    });
    expect(consumes).toBe(1);
    expect(sent).toEqual(["/compact", "\r"]);
  });
});

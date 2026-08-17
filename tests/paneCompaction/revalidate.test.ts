import { describe, expect, it } from "vitest";

import { type NonceStore, mintNonce, runCompact } from "@/scripts/lib/pane-compaction-core";
import { premiseHolds } from "@/tests/_shared/premise";

/**
 * Task 8 — the nonce, and per-command revalidation (spec §5.2, §5.5).
 *
 * The nonce proves THIS orchestrator's checkpoint landed before THIS
 * orchestrator sends. It is deliberately not a cross-orchestrator lock: three
 * review rounds each found a new race in a nonce accreting toward that
 * guarantee, and the claim was dropped rather than bought.
 */

const N1 = "1111111111111111";
const N2 = "2222222222222222";

/** An in-memory record file. */
function aStore(initial?: string): NonceStore {
  let held = initial;
  return {
    read: () => held ?? null,
    consume: () => {
      held = undefined;
    },
  };
}

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

describe("the nonce gate", () => {
  it("sends when the marker carries the recorded nonce", () => {
    const sent: string[] = [];
    const r = runCompact({
      store: aStore(N1),
      markerNonce: () => N1,
      send: (s) => sent.push(s),
      revalidate: () => ({ ok: true }),
    });
    expect(r.exitCode).toBe(0);
    expect(sent).toEqual(["/compact", "\r"]);
  });

  const REFUSALS: ReadonlyArray<readonly [string, string | null, string | undefined, string]> = [
    ["absent from the marker", null, N1, "no checkpointNonce"],
    ["different from the record", N2, N1, "not the one this command recorded"],
    ["stale-equal: record already consumed", N1, undefined, "no checkpointNonce"],
  ];

  it.each(REFUSALS)(
    "refuses when the nonce is %s, and sends nothing",
    (_l, markerNonce, held, needle) => {
      const sent: string[] = [];
      const r = runCompact({
        store: aStore(held),
        markerNonce: () => markerNonce,
        send: (s) => sent.push(s),
        revalidate: () => ({ ok: true }),
      });
      expect(r.exitCode).toBe(1);
      expect(sent).toEqual([]);
      expect(r.message).toContain(needle);
    },
  );
});

describe("consume-before-send, observed from INSIDE the send", () => {
  it("the record is already gone when the send is entered", () => {
    // Plan round 2 probed that `try { send() } finally { consume() }` produces
    // IDENTICAL post-hoc observations: both end with the record gone. No
    // end-state assertion can separate them, so the spy reads the record at
    // call time and reports what it saw.
    let seenAtCallTime: string | null = "not-observed";
    const store = aStore(N1);
    runCompact({
      store,
      markerNonce: () => N1,
      send: () => {
        seenAtCallTime = store.read();
      },
      revalidate: () => ({ ok: true }),
    });
    premiseHolds("the spy actually ran", seenAtCallTime !== "not-observed");
    expect(seenAtCallTime).toBeNull();
  });
});

describe("revalidation runs immediately before sending", () => {
  it("refuses, naming the condition, when the verdict went stale", () => {
    const sent: string[] = [];
    const r = runCompact({
      store: aStore(N1),
      markerNonce: () => N1,
      send: (s) => sent.push(s),
      revalidate: () => ({
        ok: false,
        message: "refusing: verdict changed from COMPACT to WAIT before sending",
      }),
    });
    expect(r.exitCode).toBe(1);
    expect(sent).toEqual([]);
    expect(r.message).toContain("verdict changed");
  });

  it("compares the nonce the marker holds AFTER revalidation, not before", () => {
    // Diff round 1, finding 3. The gate took `markerNonce` as a VALUE, so it was
    // read before `revalidate()` ran; the revalidation then re-read the marker,
    // compared only the VERDICT, and authorized the send against a nonce that
    // had already changed. Probed: three marker reads returning `recorded`,
    // `recorded`, `changed-before-revalidation`, and the command still exited 0
    // having sent `/compact`.
    //
    // The window is not theoretical: `--checkpoint` asks the target to write its
    // marker, so a target writing during the subsequent `--compact` is the
    // ORDINARY case this tool creates, not a race someone has to engineer.
    //
    // Fails against a value-captured nonce (it would see N1, match, and send)
    // and passes only when the thunk is consulted after revalidation.
    const sent: string[] = [];
    let markerHolds: string | null = N1;
    const r = runCompact({
      store: aStore(N1),
      markerNonce: () => markerHolds,
      send: (s) => sent.push(s),
      revalidate: () => {
        markerHolds = N2; // the target rewrote its marker mid-command
        return { ok: true };
      },
    });
    expect(r.exitCode).toBe(1);
    expect(sent).toEqual([]);
    expect(r.message).toContain("not the one this command recorded");
  });

  it("revalidates BEFORE consuming, so a refusal leaves the record reusable", () => {
    // A refusal must not burn the checkpoint: the orchestrator should be able
    // to fix the condition and retry without re-checkpointing the target.
    const store = aStore(N1);
    runCompact({
      store,
      markerNonce: () => N1,
      send: () => undefined,
      revalidate: () => ({ ok: false, message: "refusing: contested" }),
    });
    expect(store.read()).toBe(N1);
  });
});

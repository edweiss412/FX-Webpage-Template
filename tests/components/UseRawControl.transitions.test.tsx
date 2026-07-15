// @vitest-environment jsdom
/**
 * tests/components/UseRawControl.transitions.test.tsx — transition audit
 * (spec 2026-07-10-structural-transform-use-raw §8 matrix, lines 239-253).
 *
 * `<UseRawControl>` is deliberately INSTANT: every state swap is a plain
 * conditional render with NO framer-motion wrapper (`AnimatePresence` / `motion.`).
 * The render state is a PURE function of the persisted `(preference, applied)` +
 * `inFlight`, so every transition is verified by driving `deriveUseRawControlState`
 * through the target persisted shape and asserting the resulting state string.
 * Each transition below is "instant — no animation needed."
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParseWarning, UseRawResolution } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { deriveUseRawControlState } from "@/components/admin/UseRawControl";

const HASH = "content-hash-1";
const resolution: Extract<UseRawResolution, { resolvable: true }> = {
  resolvable: true,
  contentHash: HASH,
  parsed: { kind: "rooms", name: "Grand Ballroom", dimensions: "40x60", floor: "2" },
  replacement: { kind: "rooms", name: "Salon A Merged", dimensions: null, floor: null },
};
const w: Pick<ParseWarning, "code" | "resolution"> = {
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  resolution,
};

// The four persisted forms → the state each derives to (spec §8 lines 249-253).
const NONE = undefined; // no decision row
const APPLY_PENDING: UseRawDecision = mk("raw", false); // {raw, applied:false}
const RAW_ACTIVE: UseRawDecision = mk("raw", true); // {raw, applied:true}
const CLEAR_PENDING: UseRawDecision = mk("transform", false); // {transform, applied:false}

function mk(preference: "raw" | "transform", applied: boolean): UseRawDecision {
  return {
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    contentHash: HASH,
    target: { kind: "rooms" },
    preference,
    applied,
    decidedAt: "2026-07-10T00:00:00.000Z",
    decidedBy: "admin@example.com",
  };
}

const stateFor = (d: UseRawDecision | undefined, inFlight = false) =>
  deriveUseRawControlState(w, d, inFlight);

describe("UseRawControl transition audit — spec §8 matrix", () => {
  it("base persisted-state derivations (the matrix cells)", () => {
    expect(stateFor(NONE)).toBe("transform-active");
    expect(stateFor(APPLY_PENDING)).toBe("apply-pending");
    expect(stateFor(RAW_ACTIVE)).toBe("raw-active");
    expect(stateFor(CLEAR_PENDING)).toBe("clear-pending");
  });

  it("transform-active → apply-pending → raw-active (toggle on, then successful sync)", () => {
    // toggle ON writes {raw, applied:false}; the later sync flips applied:true.
    expect(stateFor(NONE)).toBe("transform-active");
    expect(stateFor(APPLY_PENDING)).toBe("apply-pending");
    expect(stateFor(RAW_ACTIVE)).toBe("raw-active");
  });

  it("raw-active → clear-pending → transform-active (toggle off, then successful sync)", () => {
    // toggle OFF writes {transform, applied:false}; the sync GCs the row (→ none).
    expect(stateFor(RAW_ACTIVE)).toBe("raw-active");
    expect(stateFor(CLEAR_PENDING)).toBe("clear-pending");
    expect(stateFor(NONE)).toBe("transform-active");
  });

  it("apply-pending → transform-active (toggle off before any apply = hard-delete)", () => {
    expect(stateFor(APPLY_PENDING)).toBe("apply-pending");
    expect(stateFor(NONE)).toBe("transform-active"); // row deleted
  });

  it("clear-pending → raw-active (toggle back on before the revert applies)", () => {
    expect(stateFor(CLEAR_PENDING)).toBe("clear-pending");
    expect(stateFor(RAW_ACTIVE)).toBe("raw-active"); // {raw, applied:true} straight back
  });

  it("each pending state SURVIVES a reload — re-deriving from the same persisted row is idempotent", () => {
    // A reload re-runs the pure deriver against the SAME persisted decision. No
    // ephemeral action result: same input → same output (the reload-safety contract).
    for (const d of [APPLY_PENDING, CLEAR_PENDING, RAW_ACTIVE, NONE]) {
      expect(stateFor(d)).toBe(stateFor(d));
    }
    expect(stateFor(APPLY_PENDING)).toBe("apply-pending");
    expect(stateFor(CLEAR_PENDING)).toBe("clear-pending");
  });

  it("compound: optimistic `pending` overlays EVERY steady state", () => {
    for (const d of [NONE, APPLY_PENDING, RAW_ACTIVE, CLEAR_PENDING]) {
      expect(stateFor(d, true)).toBe("pending");
    }
  });

  it("in-flight does NOT override the resolution guards → 'pending' is resolvable-only (Codex R8 F2)", () => {
    // A refresh mid-toggle can deliver an unresolvable version of the same in-scope warning
    // while inFlight is still set. Such a warning must stay in its guarded state, NOT
    // "pending" — the render casts resolution as {resolvable:true}, so a "pending" on an
    // undefined / {resolvable:false} resolution would crash reading .parsed.
    // Legacy = the `resolution` key is ABSENT (pre-feature warning), not `undefined`
    // (exactOptionalPropertyTypes). `deriveUseRawControlState` reads it as undefined at runtime.
    const legacy: Pick<ParseWarning, "code" | "resolution"> = {
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    };
    const unresolvable: Pick<ParseWarning, "code" | "resolution"> = {
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
      resolution: { resolvable: false, reason: "empty-raw" },
    };
    expect(deriveUseRawControlState(legacy, undefined, true)).toBe("legacy-unavailable");
    expect(deriveUseRawControlState(unresolvable, undefined, true)).toBe("disabled");
  });

  it("the deriver is a pure function (same inputs → same output across calls)", () => {
    // Determinism proof — the basis for calling every transition "instant, no
    // animation needed": there is no hidden state machine to animate between.
    expect(deriveUseRawControlState(w, RAW_ACTIVE, false)).toBe(
      deriveUseRawControlState(w, RAW_ACTIVE, false),
    );
    expect(deriveUseRawControlState(w, NONE, false)).toBe(deriveUseRawControlState(w, NONE, false));
  });
});

describe("UseRawControl — deliberately instant (no animation wrappers)", () => {
  it("the component source contains NO framer-motion (AnimatePresence / motion.) — every swap is instant", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/admin/UseRawControl.tsx"),
      "utf8",
    );
    expect(src).not.toContain("AnimatePresence");
    expect(src).not.toMatch(/\bmotion\./);
    expect(src).not.toContain("framer-motion");
  });
});

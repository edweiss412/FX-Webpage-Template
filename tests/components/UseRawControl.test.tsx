// @vitest-environment jsdom
/**
 * tests/components/UseRawControl.test.tsx
 *
 * The shared presentational "use the sheet's raw value" control (spec
 * 2026-07-10-structural-transform-use-raw §8). Two concerns:
 *
 *   1. `useRawControlState` — the PURE guard-precedence + persisted-state deriver.
 *      Asserts all 7 states + null for out-of-scope, and the exact §8 precedence
 *      (out-of-scope → null; resolution absent → legacy-unavailable; resolvable:false
 *      → disabled; resolvable + no decision → transform-active; the four decision
 *      shapes; inFlight overlays pending).
 *
 *   2. Render contract — `disabled` vs `legacy-unavailable` are DISTINCT non-empty
 *      copy; `use-raw-parsed` reads `warning.resolution.parsed` (NOT the replacement);
 *      and an action-error surfaces `use-raw-error` while NEVER rendering a raw
 *      §12.4 code (invariant 5).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ParseWarning, UseRawResolution } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { UseRawControl, useRawControlState } from "@/components/admin/UseRawControl";

afterEach(() => cleanup());

// ── fixtures ──────────────────────────────────────────────────────────────
const HASH = "content-hash-rooms-1";

const roomsResolution: Extract<UseRawResolution, { resolvable: true }> = {
  resolvable: true,
  contentHash: HASH,
  // The TRANSFORM (parsed) reading — what the control's "Parsed" side must show.
  parsed: { kind: "rooms", name: "Grand Ballroom", dimensions: "40x60", floor: "2" },
  // The RAW reading — a deliberately DIFFERENT name so the anti-tautology check can
  // prove the parsed side is not accidentally reading the replacement.
  replacement: { kind: "rooms", name: "Salon A Merged", dimensions: null, floor: null },
};

function warning(
  over: Partial<Pick<ParseWarning, "code" | "resolution">> = {},
): Pick<ParseWarning, "code" | "resolution"> {
  return { code: "ROOM_HEADER_SPLIT_AMBIGUOUS", resolution: roomsResolution, ...over };
}

// An in-scope warning with `resolution` ABSENT (the key is omitted, not set to
// `undefined` — exactOptionalPropertyTypes) → the legacy-unavailable state.
function legacyWarning(): Pick<ParseWarning, "code" | "resolution"> {
  return { code: "ROOM_HEADER_SPLIT_AMBIGUOUS" };
}

function decision(over: Partial<UseRawDecision> = {}): UseRawDecision {
  return {
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    contentHash: HASH,
    target: { kind: "rooms", name: "Grand Ballroom" },
    preference: "raw",
    applied: false,
    decidedAt: "2026-07-10T00:00:00.000Z",
    decidedBy: "admin@example.com",
    ...over,
  };
}

// ── 1. state derivation (guard precedence + 4 decision shapes + pending) ────
describe("useRawControlState — guard precedence + all 7 states + null", () => {
  it("(1) out-of-scope code → null", () => {
    expect(useRawControlState({ code: "UNKNOWN_FIELD" }, undefined, false)).toBe(null);
    // Even with a decision + inFlight, an out-of-scope code is null (the guard is first).
    expect(
      useRawControlState(
        { code: "SCHEDULE_TIME_UNPARSED", resolution: roomsResolution },
        decision(),
        true,
      ),
    ).toBe(null);
  });

  it("(2) in-scope + resolution absent → legacy-unavailable", () => {
    expect(useRawControlState(legacyWarning(), undefined, false)).toBe("legacy-unavailable");
  });

  it("(3) resolvable:false → disabled", () => {
    expect(
      useRawControlState(
        warning({ resolution: { resolvable: false, reason: "empty-raw" } }),
        undefined,
        false,
      ),
    ).toBe("disabled");
    expect(
      useRawControlState(
        warning({ resolution: { resolvable: false, reason: "invalid-dmy" } }),
        undefined,
        false,
      ),
    ).toBe("disabled");
  });

  it("(4) resolvable + no decision → transform-active", () => {
    expect(useRawControlState(warning(), undefined, false)).toBe("transform-active");
  });

  it("{raw, applied:false} → apply-pending", () => {
    expect(
      useRawControlState(warning(), decision({ preference: "raw", applied: false }), false),
    ).toBe("apply-pending");
  });

  it("{raw, applied:true} → raw-active", () => {
    expect(
      useRawControlState(warning(), decision({ preference: "raw", applied: true }), false),
    ).toBe("raw-active");
  });

  it("{transform, applied:false} → clear-pending", () => {
    expect(
      useRawControlState(warning(), decision({ preference: "transform", applied: false }), false),
    ).toBe("clear-pending");
  });

  it("inFlight overlays every steady state → pending", () => {
    for (const d of [
      undefined,
      decision({ preference: "raw", applied: false }),
      decision({ preference: "raw", applied: true }),
      decision({ preference: "transform", applied: false }),
    ]) {
      expect(useRawControlState(warning(), d, true)).toBe("pending");
    }
  });
});

// ── 2. render contract ──────────────────────────────────────────────────────
describe("UseRawControl — render contract", () => {
  it("disabled and legacy-unavailable render DISTINCT, non-empty copy", () => {
    const disabled = render(
      <UseRawControl
        warning={warning({ resolution: { resolvable: false, reason: "empty-raw" } })}
        decision={undefined}
        onToggle={vi.fn()}
      />,
    );
    const disabledCopy = disabled.getByTestId("use-raw-control").textContent ?? "";
    disabled.unmount();

    const legacy = render(
      <UseRawControl warning={legacyWarning()} decision={undefined} onToggle={vi.fn()} />,
    );
    const legacyCopy = legacy.getByTestId("use-raw-control").textContent ?? "";

    expect(disabledCopy.trim().length).toBeGreaterThan(0);
    expect(legacyCopy.trim().length).toBeGreaterThan(0);
    expect(disabledCopy).not.toBe(legacyCopy);
  });

  it("use-raw-parsed reads warning.resolution.parsed, NOT the raw replacement", () => {
    const { getByTestId } = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={vi.fn()} />,
    );
    const parsed = getByTestId("use-raw-parsed").textContent ?? "";
    const raw = getByTestId("use-raw-raw").textContent ?? "";
    // Anti-tautology: the parsed side must carry the TRANSFORM name and never the
    // replacement name (which lives on the raw side).
    expect(parsed).toContain("Grand Ballroom");
    expect(parsed).not.toContain("Salon A Merged");
    expect(raw).toContain("Salon A Merged");
  });

  it("an action failure surfaces use-raw-error and NEVER renders a raw §12.4 code (invariant 5)", async () => {
    // The action rejects with a raw code string; the control must catch it and show
    // static plain copy — the code must appear NOWHERE in the rendered DOM.
    const onToggle = vi.fn(async () => {
      throw new Error("USE_RAW_DECISION_STALE");
    });
    const { getByTestId, container } = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={onToggle} />,
    );

    await act(async () => {
      fireEvent.click(getByTestId("use-raw-toggle-on"));
    });

    await waitFor(() => expect(getByTestId("use-raw-error")).not.toBeNull());
    expect(onToggle).toHaveBeenCalledWith(true);

    const dom = container.textContent ?? "";
    expect(dom).not.toContain("USE_RAW_DECISION_STALE");
    // No bare ALL_CAPS_CODE token leaked into the copy.
    expect(dom).not.toMatch(/[A-Z][A-Z0-9]+_[A-Z0-9_]+/);
  });
});

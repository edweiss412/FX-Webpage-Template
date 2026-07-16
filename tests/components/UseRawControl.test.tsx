// @vitest-environment jsdom
/**
 * tests/components/UseRawControl.test.tsx
 *
 * The shared presentational "use the sheet's raw value" control (spec
 * 2026-07-10-structural-transform-use-raw §8). Two concerns:
 *
 *   1. `deriveUseRawControlState` — the PURE guard-precedence + persisted-state deriver.
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
import {
  UseRawControl,
  deriveUseRawControlState,
  segmentRawReading,
} from "@/components/admin/UseRawControl";

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
describe("deriveUseRawControlState — guard precedence + all 7 states + null", () => {
  it("(1) out-of-scope code → null", () => {
    expect(deriveUseRawControlState({ code: "UNKNOWN_FIELD" }, undefined, false)).toBe(null);
    // Even with a decision + inFlight, an out-of-scope code is null (the guard is first).
    expect(
      deriveUseRawControlState(
        { code: "SCHEDULE_TIME_UNPARSED", resolution: roomsResolution },
        decision(),
        true,
      ),
    ).toBe(null);
  });

  it("(2) in-scope + resolution absent → legacy-unavailable", () => {
    expect(deriveUseRawControlState(legacyWarning(), undefined, false)).toBe("legacy-unavailable");
  });

  it("(3) resolvable:false → disabled", () => {
    expect(
      deriveUseRawControlState(
        warning({ resolution: { resolvable: false, reason: "empty-raw" } }),
        undefined,
        false,
      ),
    ).toBe("disabled");
    expect(
      deriveUseRawControlState(
        warning({ resolution: { resolvable: false, reason: "invalid-dmy" } }),
        undefined,
        false,
      ),
    ).toBe("disabled");
  });

  it("(4) resolvable + no decision → transform-active", () => {
    expect(deriveUseRawControlState(warning(), undefined, false)).toBe("transform-active");
  });

  it("{raw, applied:false} → apply-pending", () => {
    expect(
      deriveUseRawControlState(warning(), decision({ preference: "raw", applied: false }), false),
    ).toBe("apply-pending");
  });

  it("{raw, applied:true} → raw-active", () => {
    expect(
      deriveUseRawControlState(warning(), decision({ preference: "raw", applied: true }), false),
    ).toBe("raw-active");
  });

  it("{transform, applied:false} → clear-pending", () => {
    expect(
      deriveUseRawControlState(
        warning(),
        decision({ preference: "transform", applied: false }),
        false,
      ),
    ).toBe("clear-pending");
  });

  it("inFlight overlays every steady state → pending", () => {
    for (const d of [
      undefined,
      decision({ preference: "raw", applied: false }),
      decision({ preference: "raw", applied: true }),
      decision({ preference: "transform", applied: false }),
    ]) {
      expect(deriveUseRawControlState(warning(), d, true)).toBe("pending");
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

  // ── choice-row contract (2026-07-15 redesign) ─────────────────────────────
  // The control renders BOTH readings as a two-option radiogroup in every
  // resolvable state; the persisted preference side is aria-checked and carries
  // a visible "In use" marker (no colour-only state, DESIGN §1).
  it("renders a radiogroup with both rows in every steady resolvable state; aria-checked follows the preference side", () => {
    const cases: {
      decision: UseRawDecision | undefined;
      rawChecked: boolean;
    }[] = [
      { decision: undefined, rawChecked: false }, // transform-active
      { decision: decision({ preference: "raw", applied: false }), rawChecked: true }, // apply-pending
      { decision: decision({ preference: "raw", applied: true }), rawChecked: true }, // raw-active
      { decision: decision({ preference: "transform", applied: false }), rawChecked: false }, // clear-pending
    ];
    for (const c of cases) {
      const view = render(
        <UseRawControl warning={warning()} decision={c.decision} onToggle={vi.fn()} />,
      );
      const group = view.getByRole("radiogroup");
      const radios = view.getAllByRole("radio");
      expect(group).not.toBeNull();
      expect(radios).toHaveLength(2);
      const rawRow = view.getByTestId("use-raw-toggle-on");
      const parsedRow = view.getByTestId("use-raw-toggle-off");
      expect(rawRow.getAttribute("aria-checked")).toBe(String(c.rawChecked));
      expect(parsedRow.getAttribute("aria-checked")).toBe(String(!c.rawChecked));
      // The visible marker sits on the checked row only. Honest wording per state
      // (critique P2): "In use" only when the entity rows already reflect the
      // choice; a pending choice reads "Selected" (crew still see the other value).
      const settled = c.decision === undefined || c.decision.applied === true;
      const marker = settled ? "In use" : "Selected";
      const checkedRow = c.rawChecked ? rawRow : parsedRow;
      const uncheckedRow = c.rawChecked ? parsedRow : rawRow;
      expect(checkedRow.textContent).toContain(marker);
      expect(uncheckedRow.textContent).not.toContain("In use");
      expect(uncheckedRow.textContent).not.toContain("Selected");
      // WAI radio pattern (critique P1): roving tab stop — checked row is the
      // group's single tab stop, the other row leaves the tab order.
      expect(checkedRow.getAttribute("tabindex")).toBe("0");
      expect(uncheckedRow.getAttribute("tabindex")).toBe("-1");
      view.unmount();
    }
  });

  it("arrow keys move + select within the radiogroup (WAI radio keyboard contract)", async () => {
    const onToggle = vi.fn(async () => {});
    const { getByTestId } = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={onToggle} />,
    );
    // transform-active: parsed row checked. ArrowDown from it selects the raw row.
    await act(async () => {
      fireEvent.keyDown(getByTestId("use-raw-toggle-off"), { key: "ArrowDown" });
    });
    expect(onToggle).toHaveBeenCalledWith(true);
    onToggle.mockClear();
    // Arrow from the UNCHECKED row toward the checked one moves focus but fires
    // nothing (target already selected).
    await act(async () => {
      fireEvent.keyDown(getByTestId("use-raw-toggle-on"), { key: "ArrowUp" });
    });
    expect(onToggle).not.toHaveBeenCalled();
  });

  // ── Codex R1 findings (2026-07-16) ────────────────────────────────────────
  it("optimistic pending: the row the admin CHOSE reads checked + Selected, not the stale persisted side (Codex R1 F1)", async () => {
    let release!: () => void;
    const onToggle = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { getByTestId } = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={onToggle} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("use-raw-toggle-on")); // choose raw from transform-active
    });
    const rawRow = getByTestId("use-raw-toggle-on");
    const parsedRow = getByTestId("use-raw-toggle-off");
    expect(rawRow.getAttribute("aria-checked")).toBe("true");
    expect(rawRow.textContent).toContain("Selected");
    expect(parsedRow.getAttribute("aria-checked")).toBe("false");
    expect(parsedRow.textContent).not.toContain("Selected");
    await act(async () => release());
  });

  it("pending keeps the radiogroup focusable: aria-disabled, never native disabled; activation still guarded (Codex R1 F2)", async () => {
    let release!: () => void;
    const onToggle = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { getByTestId } = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={onToggle} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId("use-raw-toggle-on"));
    });
    const rawRow = getByTestId("use-raw-toggle-on");
    const parsedRow = getByTestId("use-raw-toggle-off");
    // Focus is never destroyed mid-save: no native disabled attribute, the
    // checked (chosen) row keeps the group's tab stop.
    expect(rawRow.hasAttribute("disabled")).toBe(false);
    expect(parsedRow.hasAttribute("disabled")).toBe(false);
    expect(rawRow.getAttribute("aria-disabled")).toBe("true");
    expect(rawRow.getAttribute("tabindex")).toBe("0");
    // Activation stays guarded — clicking the other row mid-save fires nothing.
    fireEvent.click(parsedRow);
    expect(onToggle).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it("hotels raw label never claims 'exactly as the sheet says' — the replacement is conf-stripped (Codex R1 F3)", () => {
    const view = render(
      <UseRawControl
        warning={{
          code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
          resolution: {
            resolvable: true,
            contentHash: HASH,
            parsed: { kind: "hotels", names: ["Jane Doe", "John Smith"], confirmationNo: "84421" },
            replacement: { kind: "hotels", names: ["Jane Doe John Smith"], confirmationNo: null },
          },
        }}
        decision={undefined}
        onToggle={vi.fn()}
      />,
    );
    const rawRow = view.getByTestId("use-raw-toggle-on");
    expect(rawRow.textContent).not.toContain("Exactly as the sheet says");
    expect(rawRow.textContent).toContain("The whole cell as one guest");
    view.unmount();
    // Rooms keep the literal-sheet-text claim (their replacement IS the raw header).
    const rooms = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={vi.fn()} />,
    );
    expect(rooms.getByTestId("use-raw-toggle-on").textContent).toContain(
      "Exactly as the sheet says",
    );
  });

  // ── raw-string split markers (deferred P2, 2026-07-16) ───────────────────
  it("segmentRawReading (rooms): labels the name run, the Room→Floor gap as Dimensions, leaves the kind label plain", () => {
    const raw =
      "GENERAL SESSION GRAND BALLROOM A/B TOTAL: 82' x 94' x 14' A/B: 82' x 63' x 14' 8th Floor";
    const segs = segmentRawReading(raw, {
      resolvable: true,
      contentHash: HASH,
      parsed: {
        kind: "rooms",
        roomKind: "gs",
        name: "GRAND BALLROOM A/B",
        dimensions: "TOTAL: 82' x 94' x 14' · A/B: 82' x 63' x 14'",
        floor: "8th Floor",
      },
      replacement: { kind: "rooms", name: raw, dimensions: null, floor: null },
    });
    // Reassembly is lossless — marking must never mutate the sheet text.
    expect(segs.map((s) => s.text).join("")).toBe(raw);
    expect(segs.map((s) => [s.field, s.text])).toEqual([
      [null, "GENERAL SESSION "],
      ["Room", "GRAND BALLROOM A/B"],
      ["Dimensions", " TOTAL: 82' x 94' x 14' A/B: 82' x 63' x 14' "],
      ["Floor", "8th Floor"],
    ]);
  });

  it("segmentRawReading fails soft: unmatched anchors → single plain segment; dates never segment", () => {
    // Name not present in the raw string → no partial/false claims.
    const noMatch = segmentRawReading("SOMETHING ELSE ENTIRELY", roomsResolution);
    expect(noMatch).toEqual([{ text: "SOMETHING ELSE ENTIRELY", field: null }]);
    // Dates are a reinterpretation, not sheet substrings — always one plain segment.
    const dates = segmentRawReading("in 2026-04-03 · set 2026-05-03", {
      resolvable: true,
      contentHash: HASH,
      parsed: {
        kind: "dates",
        dates: { travelIn: "2026-03-04", set: null, showDays: [], travelOut: null },
      },
      replacement: {
        kind: "dates",
        dmyDates: { travelIn: "2026-04-03", set: null, showDays: [], travelOut: null },
      },
    });
    expect(dates).toEqual([{ text: "in 2026-04-03 · set 2026-05-03", field: null }]);
  });

  it("segmentRawReading (hotels): each guest name is its own labeled run, case-insensitive, in order", () => {
    const segs = segmentRawReading("jane doe JOHN SMITH", {
      resolvable: true,
      contentHash: HASH,
      parsed: { kind: "hotels", names: ["Jane Doe", "John Smith"], confirmationNo: "84421" },
      replacement: { kind: "hotels", names: ["jane doe JOHN SMITH"], confirmationNo: null },
    });
    expect(segs.map((s) => [s.field, s.text])).toEqual([
      ["Guest 1", "jane doe"],
      [null, " "],
      ["Guest 2", "JOHN SMITH"],
    ]);
  });

  it("segmentRawReading boundary soundness (Codex R1): unicode case-fold drift, junk gaps, repeated floors", () => {
    const res = (parsed: {
      name: string;
      dimensions: string | null;
      floor: string | null;
    }): Extract<UseRawResolution, { resolvable: true }> => ({
      resolvable: true,
      contentHash: HASH,
      parsed: { kind: "rooms", ...parsed },
      replacement: { kind: "rooms", name: "x", dimensions: null, floor: null },
    });

    // (1) A length-changing case-fold character BEFORE the anchors ("İ".toLowerCase()
    // is two code units) must not shift the underlined runs — indexes must come from
    // the raw string itself, never a lowercased copy.
    const uni = "SESSİON LABEL Ballroom 82x94 8th Floor";
    const uniSegs = segmentRawReading(
      uni,
      res({ name: "Ballroom", dimensions: "82x94", floor: "8th Floor" }),
    );
    expect(uniSegs.map((s) => s.text).join("")).toBe(uni);
    expect(uniSegs.find((s) => s.field === "Room")?.text).toBe("Ballroom");
    expect(uniSegs.find((s) => s.field === "Floor")?.text).toBe("8th Floor");
    expect(uniSegs.find((s) => s.field === "Dimensions")?.text).toBe(" 82x94 ");

    // (2) A junk middle gap is NOT labeled Dimensions just because parsed dims exist —
    // the gap must normalize to the parsed dimensions.
    const junk = segmentRawReading(
      "GENERAL SESSION Ballroom unexpected junk 8th Floor",
      res({ name: "Ballroom", dimensions: "82' x 94'", floor: "8th Floor" }),
    );
    expect(junk.find((s) => s.field === "Dimensions")).toBeUndefined();
    expect(junk.find((s) => s.field === "Room")?.text).toBe("Ballroom");
    expect(junk.find((s) => s.field === "Floor")?.text).toBe("8th Floor");

    // (3) A floor-looking substring INSIDE the middle region must not steal the
    // Floor run — the parser takes the TRAILING floor, so the LAST occurrence wins.
    const repeated = "GENERAL SESSION Ballroom 8th Floor Annex 82x94 8th Floor";
    const repSegs = segmentRawReading(
      repeated,
      res({ name: "Ballroom", dimensions: "82x94", floor: "8th Floor" }),
    );
    expect(repSegs.map((s) => s.text).join("")).toBe(repeated);
    const floorRuns = repSegs.filter((s) => s.field === "Floor");
    expect(floorRuns).toHaveLength(1);
    // The labeled floor is the FINAL occurrence (string ends right after it).
    expect(repeated.slice(repeated.length - "8th Floor".length)).toBe("8th Floor");
    expect(repSegs[repSegs.length - 1]).toEqual({ text: "8th Floor", field: "Floor" });
    // Middle (containing the decoy floor + dims) stays unlabeled — mixed junk.
    expect(repSegs.find((s) => s.field === "Dimensions")).toBeUndefined();
  });

  it("raw row renders matched runs as data-seg spans without mutating the text", () => {
    const { getByTestId } = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={vi.fn()} />,
    );
    const rawEl = getByTestId("use-raw-raw");
    // roomsResolution: raw = "Salon A Merged", parsed name "Grand Ballroom" → no
    // anchor match → NO segment spans (fail-soft, plain string).
    expect(rawEl.querySelectorAll("[data-seg]").length).toBe(0);
    expect(rawEl.textContent).toBe("Salon A Merged");
  });

  it("raw row marks the parsed-field runs when anchors match", () => {
    const raw = "GENERAL SESSION Ballroom 82' x 94' 8th Floor";
    const { getByTestId } = render(
      <UseRawControl
        warning={warning({
          resolution: {
            resolvable: true,
            contentHash: HASH,
            parsed: {
              kind: "rooms",
              roomKind: "gs",
              name: "Ballroom",
              dimensions: "82' x 94'",
              floor: "8th Floor",
            },
            replacement: { kind: "rooms", name: raw, dimensions: null, floor: null },
          },
        })}
        decision={undefined}
        onToggle={vi.fn()}
      />,
    );
    const rawEl = getByTestId("use-raw-raw");
    const segFields = Array.from(rawEl.querySelectorAll("[data-seg]")).map((el) =>
      el.getAttribute("data-seg"),
    );
    expect(segFields).toEqual(["Room", "Dimensions", "Floor"]);
    expect(rawEl.textContent).toBe(raw); // text itself never altered
  });

  // ── inline retry (deferred P3, 2026-07-16) ────────────────────────────────
  it("a failed toggle offers Try again, which re-fires the SAME choice and clears the error on success", async () => {
    let calls = 0;
    const onToggle = vi.fn(async (useRaw: boolean) => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return useRaw ? undefined : undefined;
    });
    const view = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={onToggle} />,
    );
    await act(async () => {
      fireEvent.click(view.getByTestId("use-raw-toggle-on"));
    });
    await waitFor(() => expect(view.getByTestId("use-raw-error")).not.toBeNull());
    await act(async () => {
      fireEvent.click(view.getByTestId("use-raw-retry"));
    });
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenLastCalledWith(true); // same direction as the failed attempt
    await waitFor(() => expect(view.queryByTestId("use-raw-error")).toBeNull());
  });

  it("screen-reader punctuation pairs each field label with its value (sr-only, no visual change)", () => {
    const { getByTestId } = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={vi.fn()} />,
    );
    // textContent picks up sr-only separators: "Room: Grand Ballroom," etc.
    expect(getByTestId("use-raw-parsed").textContent).toMatch(/Room:\s*Grand Ballroom,/);
  });

  it("clicking the already-checked row is a no-op; clicking the other row fires the toggle", async () => {
    const onToggle = vi.fn(async () => {});
    const { getByTestId } = render(
      <UseRawControl
        warning={warning()}
        decision={decision({ preference: "raw", applied: true })} // raw-active
        onToggle={onToggle}
      />,
    );
    // Checked (raw) row: no-op.
    await act(async () => {
      fireEvent.click(getByTestId("use-raw-toggle-on"));
    });
    expect(onToggle).not.toHaveBeenCalled();
    // Unchecked (parsed) row: fires toggle-off.
    await act(async () => {
      fireEvent.click(getByTestId("use-raw-toggle-off"));
    });
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("pending notes survive the redesign: apply-pending and clear-pending render use-raw-pending-note", () => {
    const applyPending = render(
      <UseRawControl
        warning={warning()}
        decision={decision({ preference: "raw", applied: false })}
        onToggle={vi.fn()}
      />,
    );
    expect(applyPending.getByTestId("use-raw-pending-note").textContent).toContain("next");
    applyPending.unmount();
    const clearPending = render(
      <UseRawControl
        warning={warning()}
        decision={decision({ preference: "transform", applied: false })}
        onToggle={vi.fn()}
      />,
    );
    expect(clearPending.getByTestId("use-raw-pending-note").textContent).toContain("Reverting");
  });

  // ── structured parsed side (2026-07-16): the parsed row shows HOW the line was
  // split — one labeled line per field — while the raw row stays a single string,
  // so the two readings are visually distinct at a glance.
  it("rooms: the parsed row renders labeled field lines (Room / Dimensions / Floor), never a re-glued string", () => {
    const view = render(
      <UseRawControl
        warning={warning({
          resolution: {
            ...roomsResolution,
            parsed: {
              kind: "rooms",
              name: "Ballroom",
              dimensions: "82' x 94' x 14'",
              floor: "8th Floor",
            },
          },
        })}
        decision={undefined}
        onToggle={vi.fn()}
      />,
    );
    const parsed = view.getByTestId("use-raw-parsed");
    const labels = Array.from(parsed.querySelectorAll("[data-field-label]")).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["Room", "Dimensions", "Floor"]);
    const text = parsed.textContent ?? "";
    expect(text).toContain("8th Floor");
    // The old prefix idiom must not resurface ("floor 8th Floor").
    expect(text).not.toMatch(/floor 8th Floor/i);
    view.unmount();
    // Null fields are omitted, not rendered as empty lines.
    const noFloor = render(
      <UseRawControl
        warning={warning({
          resolution: {
            ...roomsResolution,
            parsed: { kind: "rooms", name: "Ballroom", dimensions: null, floor: null },
          },
        })}
        decision={undefined}
        onToggle={vi.fn()}
      />,
    );
    const noFloorLabels = Array.from(
      noFloor.getByTestId("use-raw-parsed").querySelectorAll("[data-field-label]"),
    ).map((el) => el.textContent);
    expect(noFloorLabels).toEqual(["Room"]);
  });

  it("rooms: a resolution carrying roomKind renders a leading plain-language Type line", () => {
    const view = render(
      <UseRawControl
        warning={warning({
          resolution: {
            ...roomsResolution,
            parsed: {
              kind: "rooms",
              roomKind: "gs",
              name: "Ballroom",
              dimensions: "82' x 94'",
              floor: null,
            },
          },
        })}
        decision={undefined}
        onToggle={vi.fn()}
      />,
    );
    const parsed = view.getByTestId("use-raw-parsed");
    const labels = Array.from(parsed.querySelectorAll("[data-field-label]")).map(
      (el) => el.textContent,
    );
    // Type leads: it mirrors the raw line's own order ("GENERAL SESSION <name> …").
    expect(labels).toEqual(["Type", "Room", "Dimensions"]);
    // Plain language, never the machine token.
    expect(parsed.textContent).toContain("General Session");
    expect(parsed.textContent).not.toMatch(/\bgs\b/);
    view.unmount();
    // Legacy resolution without roomKind → no Type line (backward-compatible).
    const legacyShape = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={vi.fn()} />,
    );
    const legacyLabels = Array.from(
      legacyShape.getByTestId("use-raw-parsed").querySelectorAll("[data-field-label]"),
    ).map((el) => el.textContent);
    expect(legacyLabels).not.toContain("Type");
  });

  it("hotels: each parsed guest renders as its own numbered line (the split points are visible)", () => {
    const view = render(
      <UseRawControl
        warning={{
          code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
          resolution: {
            resolvable: true,
            contentHash: HASH,
            parsed: { kind: "hotels", names: ["Jane Doe", "John Smith"], confirmationNo: "84421" },
            replacement: { kind: "hotels", names: ["Jane Doe John Smith"], confirmationNo: null },
          },
        }}
        decision={undefined}
        onToggle={vi.fn()}
      />,
    );
    const labels = Array.from(
      view.getByTestId("use-raw-parsed").querySelectorAll("[data-field-label]"),
    ).map((el) => el.textContent);
    // The confirmation number the split pulled out gets its own line too.
    expect(labels).toEqual(["Guest 1", "Guest 2", "Confirmation"]);
    expect(view.getByTestId("use-raw-parsed").textContent).toContain("84421");
    // The raw side keeps the glued cell as one string.
    expect(view.getByTestId("use-raw-raw").textContent).toContain("Jane Doe John Smith");
  });

  it("dates: the parsed row renders one labeled line per date field", () => {
    const view = render(
      <UseRawControl
        warning={{
          code: "DATE_ORDER_SUGGESTS_DMY",
          resolution: {
            resolvable: true,
            contentHash: HASH,
            parsed: {
              kind: "dates",
              dates: {
                travelIn: "2026-03-04",
                set: null,
                showDays: ["2026-03-05", "2026-03-06"],
                travelOut: "2026-03-07",
              },
            },
            replacement: {
              kind: "dates",
              dmyDates: {
                travelIn: "2026-04-03",
                set: null,
                showDays: ["2026-05-03", "2026-06-03"],
                travelOut: "2026-07-03",
              },
            },
          },
        }}
        decision={undefined}
        onToggle={vi.fn()}
      />,
    );
    const labels = Array.from(
      view.getByTestId("use-raw-parsed").querySelectorAll("[data-field-label]"),
    ).map((el) => el.textContent);
    expect(labels).toEqual(["Travel in", "Show days", "Travel out"]); // null `set` omitted
    expect(view.getByTestId("use-raw-parsed").textContent).toContain("2026-03-05, 2026-03-06");
  });

  it("plain-language labels: no 'Parsed'/'Raw' parser jargon renders (DESIGN principle 5)", () => {
    const { getByTestId } = render(
      <UseRawControl warning={warning()} decision={undefined} onToggle={vi.fn()} />,
    );
    const dom = getByTestId("use-raw-control").textContent ?? "";
    expect(dom).not.toMatch(/\bParsed\b/);
    expect(dom).not.toMatch(/\bRaw\b/);
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

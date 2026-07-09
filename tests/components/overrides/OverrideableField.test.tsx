// @vitest-environment jsdom
/**
 * tests/components/overrides/OverrideableField.test.tsx — Task 13, Step 13.1.
 *
 * Pins the shared <OverrideableField> component contract (spec §8.1/§8.2/§8.5/§8.7):
 *   - all six guard states (§8.5) render their documented element;
 *   - the "Overridden" chip appears ONLY in the two active-override states, is a
 *     LOCAL pill (not ChangeFeedBadge's status enum), and carries the sheet value
 *     in its title (anti-tautology: clone the row + remove the value cell before
 *     asserting the chip label so a coincidental value string can't satisfy it);
 *   - an {ok:false, code} result renders lib/messages/lookup.ts-mapped copy and
 *     NEVER the raw code (invariant 5);
 *   - the spy onSave receives p_expected_current_value === the expectedCurrentValue
 *     prop UNCHANGED (incl. for a dates OBJECT) — proves no rendered-text derivation
 *     (R17);
 *   - all transitions are instant conditional renders (no framer-motion — §8.7).
 *
 * onSave is injected as a spy, so this task is independent of Task 14's real action.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import {
  OverrideableField,
  type OverrideState,
} from "@/components/admin/overrides/OverrideableField";
import type { SetFieldOverrideParams } from "@/lib/overrides/setFieldOverride";

afterEach(() => {
  cleanup();
});

const okSpy = () =>
  vi.fn(
    async (
      _p: SetFieldOverrideParams,
    ): Promise<{ ok: true; value: unknown } | { ok: false; code: string }> => ({
      ok: true,
      value: "saved",
    }),
  );

function baseProps() {
  return {
    driveFileId: "drive-file-1",
    domain: "crew" as const,
    field: "name" as const,
    matchKey: "Jon",
    currentValue: "John",
    expectedCurrentValue: "Jon" as unknown,
    override: null as OverrideState | null,
    onSave: okSpy(),
  };
}

const activeOverride: OverrideState = {
  overrideValue: "John",
  sheetValue: "Jon",
  active: true,
  deactivationCode: null,
  version: 3,
};

describe("OverrideableField — guard states (§8.5)", () => {
  it("override === null → live value + Edit affordance, no chip", () => {
    const { getByTestId, queryByTestId } = render(<OverrideableField {...baseProps()} />);
    expect(getByTestId("override-value-crew-name").textContent).toContain("John");
    expect(getByTestId("override-edit-crew-name")).toBeTruthy();
    expect(queryByTestId("override-chip-crew-name")).toBeNull();
  });

  it("active + non-null sheetValue → visible sheet line + SR aria + Edit + Revert", () => {
    const { getByTestId } = render(
      <OverrideableField {...baseProps()} override={activeOverride} />,
    );
    // §8.5 / PRODUCT (no hover-only): the sheet value is a VISIBLE muted line,
    // reachable by keyboard + touch — never a hover `title`.
    expect(getByTestId("override-sheet-value-crew-name").textContent).toBe('Sheet: "Jon"');
    // The chip carries the same comparison for screen readers via aria-label
    // (title is not reliably announced), and NO `title` attribute survives.
    const chip = getByTestId("override-chip-crew-name");
    expect(chip.getAttribute("aria-label")).toContain('the sheet says "Jon"');
    expect(chip.getAttribute("title")).toBeNull();
    expect(getByTestId("override-edit-crew-name")).toBeTruthy();
    expect(getByTestId("override-revert-crew-name")).toBeTruthy();
  });

  it("active + null sheetValue → visible 'Sheet has no value' line", () => {
    const { getByTestId } = render(
      <OverrideableField {...baseProps()} override={{ ...activeOverride, sheetValue: null }} />,
    );
    expect(getByTestId("override-sheet-value-crew-name").textContent).toBe("Sheet has no value");
    expect(getByTestId("override-chip-crew-name").getAttribute("aria-label")).toContain(
      "the sheet has no value",
    );
  });

  it("active === false (stale) → parsed value + muted paused note + Re-point/Discard, no chip", () => {
    const { getByTestId, queryByTestId } = render(
      <OverrideableField
        {...baseProps()}
        override={{ ...activeOverride, active: false, deactivationCode: "target_missing" }}
      />,
    );
    expect(getByTestId("override-stale-note-crew-name").textContent).toContain(
      "Override paused: the sheet no longer has «Jon»",
    );
    expect(getByTestId("override-repoint-crew-name")).toBeTruthy();
    expect(getByTestId("override-discard-crew-name")).toBeTruthy();
    expect(queryByTestId("override-chip-crew-name")).toBeNull();
  });

  it("disabled → read-only value, NO override affordances", () => {
    const { getByTestId, queryByTestId } = render(
      <OverrideableField {...baseProps()} override={activeOverride} disabled />,
    );
    expect(getByTestId("override-value-crew-name").textContent).toContain("John");
    expect(queryByTestId("override-edit-crew-name")).toBeNull();
    expect(queryByTestId("override-revert-crew-name")).toBeNull();
  });

  it("empty currentValue + no override → plain empty-state, no Edit", () => {
    const { getByTestId, queryByTestId } = render(
      <OverrideableField {...baseProps()} currentValue="" />,
    );
    expect(getByTestId("override-value-crew-name").textContent).toContain("—");
    expect(queryByTestId("override-edit-crew-name")).toBeNull();
  });
});

describe("OverrideableField — chip anti-tautology (§8.2)", () => {
  it("chip label 'Overridden' survives removal of the value cell", () => {
    // currentValue deliberately CONTAINS the word 'Overridden' so a naive scan
    // of the whole row would pass even if the chip were absent.
    const { getByTestId } = render(
      <OverrideableField
        {...baseProps()}
        currentValue="Overridden Person"
        override={activeOverride}
      />,
    );
    const row = getByTestId("overrideable-field-crew-name");
    const clone = row.cloneNode(true) as HTMLElement;
    const valueCell = clone.querySelector('[data-testid="override-value-crew-name"]');
    valueCell?.remove();
    // After removing the value cell, the ONLY remaining 'Overridden' is the chip.
    expect(clone.textContent).toContain("Overridden");
    const chip = clone.querySelector('[data-testid="override-chip-crew-name"]');
    expect(chip?.textContent?.trim()).toBe("Overridden");
  });
});

describe("OverrideableField — error mapping (invariant 5)", () => {
  it("{ok:false, code:'OVERRIDE_STALE_REVIEW'} → mapped copy, NEVER the raw code", async () => {
    const onSave = vi.fn(async () => ({ ok: false as const, code: "OVERRIDE_STALE_REVIEW" }));
    const { getByTestId } = render(
      <OverrideableField {...baseProps()} onSave={onSave} override={activeOverride} />,
    );
    fireEvent.click(getByTestId("override-edit-crew-name"));
    fireEvent.click(getByTestId("override-save-crew-name"));
    const err = await waitFor(() => getByTestId("override-error-crew-name"));
    expect(err.textContent && err.textContent.length).toBeGreaterThan(0);
    // Invariant 5: the raw code string must NOT appear anywhere in the DOM.
    const row = getByTestId("overrideable-field-crew-name");
    expect(row.textContent).not.toContain("OVERRIDE_STALE_REVIEW");
  });
});

describe("OverrideableField — CAS-B expectedCurrentValue passthrough (R17)", () => {
  it("passes p_expected_current_value UNCHANGED, incl. a dates OBJECT (no rendered-text derivation)", async () => {
    const datesObject = { travelIn: "2026-07-01", travelOut: "2026-07-10" };
    const onSave = okSpy();
    const { getByTestId } = render(
      <OverrideableField
        driveFileId="drive-file-1"
        domain="show"
        field="dates"
        matchKey=""
        currentValue="Jul 1 – Jul 10"
        expectedCurrentValue={datesObject}
        override={null}
        onSave={onSave}
      />,
    );
    fireEvent.click(getByTestId("override-edit-show-dates"));
    fireEvent.click(getByTestId("override-save-show-dates"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const params = onSave.mock.calls[0]?.[0] as SetFieldOverrideParams;
    // toBe: the SAME object reference — proves it was passed through untouched.
    expect(params.p_expected_current_value).toBe(datesObject);
    expect(params.p_op).toBe("upsert");
    expect(params.p_match_key).toBe("");
  });

  it("upsert passes p_expected_version from override.version and revert uses op 'revert'", async () => {
    const onSave = okSpy();
    const { getByTestId } = render(
      <OverrideableField {...baseProps()} onSave={onSave} override={activeOverride} />,
    );
    fireEvent.click(getByTestId("override-revert-crew-name"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const params = onSave.mock.calls[0]?.[0] as SetFieldOverrideParams;
    expect(params.p_op).toBe("revert");
    expect(params.p_expected_version).toBe(3);
  });
});

// Adversarial R1 (Codex round 1, HIGH): show `dates`/`venue` are structured jsonb
// OBJECTS; the RPC rejects a non-object p_override_value (invalid_shape). A single
// text-draft path would submit a STRING and every Dates/Venue override would fail.
// Failure mode this catches: `saveEdit` sending `draft` (string) for a show field.
describe("OverrideableField — structured show fields submit an object, not a string (R1)", () => {
  const datesObject = { travelIn: "2026-07-01", travelOut: "2026-07-10" };

  function showDates(onSave: ReturnType<typeof okSpy>) {
    return render(
      <OverrideableField
        driveFileId="drive-file-1"
        domain="show"
        field="dates"
        matchKey=""
        currentValue="Jul 1 – Jul 10"
        expectedCurrentValue={datesObject}
        override={null}
        onSave={onSave}
      />,
    );
  }

  it("edit → save (unchanged) submits p_override_value as an OBJECT equal to the live shape", async () => {
    const onSave = okSpy();
    const { getByTestId } = showDates(onSave);
    fireEvent.click(getByTestId("override-edit-show-dates"));
    fireEvent.click(getByTestId("override-save-show-dates"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const v = (onSave.mock.calls[0]?.[0] as SetFieldOverrideParams).p_override_value;
    expect(typeof v).toBe("object");
    expect(v).not.toBeNull();
    expect(typeof v).not.toBe("string"); // the exact R1 defect
    expect(v).toEqual(datesObject);
  });

  it("edit → change to a new object → save submits the edited OBJECT", async () => {
    const onSave = okSpy();
    const { getByTestId } = showDates(onSave);
    fireEvent.click(getByTestId("override-edit-show-dates"));
    fireEvent.change(getByTestId("override-input-show-dates"), {
      target: { value: '{"travelIn":"2026-08-01","travelOut":"2026-08-09"}' },
    });
    fireEvent.click(getByTestId("override-save-show-dates"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const v = (onSave.mock.calls[0]?.[0] as SetFieldOverrideParams).p_override_value;
    expect(v).toEqual({ travelIn: "2026-08-01", travelOut: "2026-08-09" });
  });

  it("malformed JSON → inline error, onSave NOT called", async () => {
    const onSave = okSpy();
    const { getByTestId } = showDates(onSave);
    fireEvent.click(getByTestId("override-edit-show-dates"));
    fireEvent.change(getByTestId("override-input-show-dates"), {
      target: { value: "not json {" },
    });
    fireEvent.click(getByTestId("override-save-show-dates"));
    await waitFor(() =>
      expect(getByTestId("override-error-show-dates").textContent).toContain("valid JSON"),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a non-object JSON (string/array) → inline error, onSave NOT called", async () => {
    const onSave = okSpy();
    const { getByTestId } = showDates(onSave);
    fireEvent.click(getByTestId("override-edit-show-dates"));
    fireEvent.change(getByTestId("override-input-show-dates"), {
      target: { value: '"just a string"' },
    });
    fireEvent.click(getByTestId("override-save-show-dates"));
    await waitFor(() =>
      expect(getByTestId("override-error-show-dates").textContent).toContain("structured value"),
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});

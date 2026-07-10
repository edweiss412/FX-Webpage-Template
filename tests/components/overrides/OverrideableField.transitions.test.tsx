// @vitest-environment jsdom
/**
 * tests/components/overrides/OverrideableField.transitions.test.tsx — Task 16, Part B.
 *
 * Transition-audit (spec §8.7). The §8.7 inventory declares every state pair
 * (plain / editing / overridden / stale) as INSTANT — a plain conditional
 * render, no motion. Two assertions pin that contract:
 *
 *   1. ALL-INSTANT proof (structural): the component source imports NO
 *      framer-motion / AnimatePresence / motion.* — so no transition CAN be
 *      animated. This is the transition-audit equivalent of the modal specs'
 *      "no AnimatePresence" scan, done on the source text because there is no
 *      animation wrapper to interrogate at runtime.
 *   2. COMPOUND path (§8.7 last row / §16.2): the reviewer opens the editor,
 *      edits, and a background SYNC bumps `override.version`. On Save the RPC
 *      CAS mismatches → {ok:false, code:"OVERRIDE_STALE_REVIEW"}. The inline
 *      error must render the MAPPED copy ("This field changed since you opened
 *      it — reload and try again.", OverrideableField.tsx OVERRIDE_RPC_COPY)
 *      and the raw code string must NEVER reach the DOM (invariant 5).
 *
 * onSave is injected as a spy (same pattern as OverrideableField.test.tsx).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import {
  OverrideableField,
  type OverrideState,
} from "@/components/admin/overrides/OverrideableField";

afterEach(() => {
  cleanup();
});

const activeOverride: OverrideState = {
  overrideValue: "John",
  sheetValue: "Jon",
  active: true,
  deactivationCode: null,
  version: 3,
};

function baseProps() {
  return {
    driveFileId: "drive-file-1",
    domain: "crew" as const,
    field: "name" as const,
    matchKey: "Jon",
    currentValue: "John",
    expectedCurrentValue: "Jon" as unknown,
    override: activeOverride,
  };
}

describe("OverrideableField — all-instant proof (§8.7)", () => {
  it("source imports no framer-motion / AnimatePresence / motion.*", () => {
    const raw = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "components",
        "admin",
        "overrides",
        "OverrideableField.tsx",
      ),
      "utf8",
    );
    // Strip comments before scanning: the component's own header comment
    // (OverrideableField.tsx:16) documents "No framer-motion / AnimatePresence
    // / motion.* anywhere", which would falsely trip a raw-text scan. The audit
    // is about CODE, so scan the code-only body.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // Every §8.7 transition is a plain conditional render — if any of these
    // tokens appears in code, a transition could be animated and the
    // inventory's "instant — no animation needed" declarations would break.
    expect(code, "no framer-motion import").not.toMatch(/framer-motion/);
    expect(code, "no AnimatePresence usage").not.toMatch(/AnimatePresence/);
    expect(code, "no motion.* elements").not.toMatch(/motion\./);
  });
});

describe("OverrideableField — compound editing×sync path (§8.7 / §16.2)", () => {
  it("editing while a background sync bumps version → Save 409 → mapped stale copy, raw code never in DOM", async () => {
    // The sync bumped override.version; the RPC CAS (p_expected_version)
    // mismatches server-side and returns the RPC-level stale code. The
    // component never sees the version diff — it maps whatever code comes back.
    const onSave = vi.fn(async () => ({ ok: false as const, code: "OVERRIDE_STALE_REVIEW" }));
    const { getByTestId, queryByTestId } = render(
      <OverrideableField {...baseProps()} onSave={onSave} />,
    );

    // overridden → editing (instant): open the editor pre-filled with the
    // override value, then the reviewer edits.
    fireEvent.click(getByTestId("override-edit-crew-name"));
    const input = getByTestId("override-input-crew-name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Jonathan" } });

    // Save → the injected onSave resolves the stale-review 409.
    fireEvent.click(getByTestId("override-save-crew-name"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const err = await waitFor(() => getByTestId("override-error-crew-name"));
    // role="alert" (assertive): a failed save should interrupt SR speech, not
    // queue behind it (impeccable audit P2). It is the inline error live region.
    expect(err.getAttribute("role")).toBe("alert");
    // The MAPPED copy (OVERRIDE_RPC_COPY), asserted verbatim so a copy drift
    // or a fallthrough to GENERIC_ERROR is caught. No em dash (PRODUCT copy rule).
    expect(err.textContent).toBe("This field changed since you opened it. Reload and try again.");

    // Invariant 5: the raw RPC code must NOT appear anywhere in the field DOM.
    // Assert on the whole field container (input row + error), not just the
    // error node, so a stray code leak elsewhere is also caught.
    const row = getByTestId("overrideable-field-crew-name");
    expect(row.textContent).not.toContain("OVERRIDE_STALE_REVIEW");
    // The editor stays open on failure (no idle transition) so the reviewer can
    // read the error next to the input they were editing.
    expect(queryByTestId("override-input-crew-name")).toBeTruthy();
  });
});

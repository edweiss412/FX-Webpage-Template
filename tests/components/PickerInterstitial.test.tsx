// @vitest-environment jsdom
/**
 * tests/components/PickerInterstitial.test.tsx (M11.5 §B Task C2)
 *
 * Pins the public contract of <PickerInterstitial> — the Server Component
 * rendered on the show page when the resolver returns
 * { kind: 'no_auth' | 'epoch_stale' | 'removed_from_roster' |
 *   'identity_invalidated', ?gate=skip }.
 *
 * Contracts pinned:
 *   1. Active roster rows submit via selectIdentity.
 *   2. Claimed rows render `data-claimed="true"`, a lock icon, and a
 *      GET form pointing at /auth/sign-in?next=<encoded tokenized URL>
 *      (P-R35 deactivated-row contract).
 *   3. Banner copy is the cataloged crewFacing string from MESSAGE_CATALOG
 *      (NOT the raw code; AGENTS.md invariant 5).
 *   4. Empty roster renders the PICKER_EMPTY_ROSTER copy.
 *   5. staleCleanupHint mounts <StaleCleanupAutoSubmit> with the same
 *      (epoch, crewMemberId) propagated from the resolver.
 *   6. The roster row 44×44 tap target floor is enforced via inline
 *      min-h class (jsdom doesn't compute real layout; Playwright suite
 *      asserts the rendered dimensions).
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { PickerInterstitial } from "@/app/show/[slug]/[shareToken]/_PickerInterstitial";

afterEach(cleanup);

const baseProps = {
  slug: "sample-show",
  shareToken: "a".repeat(64),
  showId: "11111111-1111-1111-1111-111111111111",
  banner: null as null,
  staleCleanupHint: null as null,
};

const ACTIVE_ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Alice Adams",
  role: "Audio A1",
  role_flags: ["LEAD"],
  claimed_via_oauth_at: null as null,
};

const CLAIMED_ROW = {
  id: "33333333-3333-3333-3333-333333333333",
  name: "Bob Burns",
  role: "Video V2",
  role_flags: [],
  claimed_via_oauth_at: "2026-05-01T12:00:00Z",
};

describe("<PickerInterstitial>", () => {
  test("renders the who-are-you heading + sub-instruction", () => {
    const { getByTestId } = render(
      <PickerInterstitial {...baseProps} roster={[ACTIVE_ROW]} />,
    );
    expect(getByTestId("picker-question-heading").textContent).toContain(
      "Who are you?",
    );
    expect(getByTestId("picker-sub-instruction")).toBeTruthy();
  });

  test("active row renders a POST form bound to selectIdentity with full hidden inputs", () => {
    const { getByTestId, getAllByTestId } = render(
      <PickerInterstitial {...baseProps} roster={[ACTIVE_ROW]} />,
    );
    const row = getAllByTestId("picker-roster-row")[0] as HTMLButtonElement;
    expect(row.getAttribute("data-claimed")).toBe("false");
    expect(row.getAttribute("data-crew-member-id")).toBe(ACTIVE_ROW.id);
    const form = row.closest("form")!;
    // ACTIVE-row form binds a Server Action reference. React inserts a
    // `javascript:throw` safety attribute for the no-JS fallback so we
    // detect Server Action binding by that prefix. CLAIMED rows render
    // a real /auth/sign-in URL (next test). Pinning this contract
    // structurally catches a future regression that points the active
    // form at a different URL.
    expect(form.getAttribute("action") ?? "").toMatch(/^javascript:/);
    const fieldOf = (n: string) =>
      (form.querySelector(`input[name="${n}"]`) as HTMLInputElement | null)
        ?.value;
    expect(fieldOf("slug")).toBe(baseProps.slug);
    expect(fieldOf("shareToken")).toBe(baseProps.shareToken);
    expect(fieldOf("crewMemberId")).toBe(ACTIVE_ROW.id);
    expect(getByTestId("picker-roster-list")).toBeTruthy();
  });

  test("claimed row deactivates: data-claimed=true + lock glyph + GET form to /auth/sign-in (P-R35)", () => {
    const { getAllByTestId } = render(
      <PickerInterstitial {...baseProps} roster={[CLAIMED_ROW]} />,
    );
    const row = getAllByTestId("picker-roster-row")[0] as HTMLButtonElement;
    expect(row.getAttribute("data-claimed")).toBe("true");
    const form = row.closest("form")!;
    expect(form.method.toLowerCase()).toBe("get");
    const expectedHref = `/auth/sign-in?next=${encodeURIComponent(
      `/show/${baseProps.slug}/${baseProps.shareToken}`,
    )}`;
    // The form action attribute exposes the rendered URL (HTMLFormElement
    // resolves it against the current origin; we read the raw attribute
    // to compare against the spec-mandated wire shape).
    expect(form.getAttribute("action")).toBe(expectedHref);
    // The form action must NOT bind to selectIdentity; a hand-crafted
    // submission through selectIdentity would also redirect (per
    // PICKER_IDENTITY_CLAIMED), but the UI contract is that the picker
    // never even calls selectIdentity for a claimed row.
    expect(form.querySelector('input[name="crewMemberId"]')).toBeNull();
    // Lock icon present.
    const lock = row.querySelector('[data-testid="picker-row-lock"]');
    expect(lock).not.toBeNull();
  });

  test("LEAD role chip uses accent treatment; non-LEAD uses muted treatment", () => {
    const { getAllByTestId } = render(
      <PickerInterstitial
        {...baseProps}
        roster={[ACTIVE_ROW, CLAIMED_ROW]}
      />,
    );
    const rows = getAllByTestId("picker-roster-row") as HTMLButtonElement[];
    expect(rows.length).toBe(2);
    const [alice, bob] = rows as [HTMLButtonElement, HTMLButtonElement];
    // Alice = active + LEAD → accent.
    const aliceChip = alice.querySelector('[data-testid="picker-role-chip"]');
    expect(aliceChip?.className).toContain("bg-accent");
    // Bob = claimed + non-LEAD → muted (claimed overrides).
    const bobChip = bob.querySelector('[data-testid="picker-role-chip"]');
    expect(bobChip?.className).not.toContain("bg-accent");
  });

  test("banner row renders cataloged crewFacing copy for each banner code", () => {
    const codes = [
      "PICKER_EPOCH_STALE_BANNER",
      "PICKER_REMOVED_FROM_ROSTER_BANNER",
      "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER",
    ] as const;
    for (const code of codes) {
      const { getByTestId, unmount } = render(
        <PickerInterstitial
          {...baseProps}
          roster={[ACTIVE_ROW]}
          banner={code}
        />,
      );
      expect(getByTestId("picker-banner").textContent).toContain(
        MESSAGE_CATALOG[code].crewFacing!,
      );
      // No raw code in DOM (AGENTS.md invariant 5).
      const html = getByTestId("picker-banner").outerHTML.replace(
        /data-testid="[^"]*"/g,
        "",
      );
      expect(html).not.toContain(code);
      unmount();
    }
  });

  test("empty roster shows PICKER_EMPTY_ROSTER cataloged copy", () => {
    const { getByTestId, queryByTestId } = render(
      <PickerInterstitial {...baseProps} roster={[]} />,
    );
    expect(getByTestId("picker-roster-empty").textContent).toContain(
      MESSAGE_CATALOG.PICKER_EMPTY_ROSTER.crewFacing!,
    );
    expect(queryByTestId("picker-roster-list")).toBeNull();
  });

  test("staleCleanupHint propagates (epoch, crewMemberId) into StaleCleanupAutoSubmit", () => {
    const hint = {
      expectedEpoch: 5,
      expectedCrewMemberId: ACTIVE_ROW.id,
    };
    const { container } = render(
      <PickerInterstitial
        {...baseProps}
        roster={[ACTIVE_ROW]}
        staleCleanupHint={hint}
      />,
    );
    const cleanup = container.querySelector(
      '[data-testid="stale-cleanup-auto-submit"]',
    )!;
    const fieldOf = (n: string) =>
      (cleanup.querySelector(`input[name="${n}"]`) as HTMLInputElement | null)
        ?.value;
    expect(fieldOf("showId")).toBe(baseProps.showId);
    expect(fieldOf("expectedEpoch")).toBe(String(hint.expectedEpoch));
    expect(fieldOf("expectedCrewMemberId")).toBe(hint.expectedCrewMemberId);
  });

  test("roster row carries min-h-tap-min for the 44px floor (Playwright validates real layout)", () => {
    const { getAllByTestId } = render(
      <PickerInterstitial {...baseProps} roster={[ACTIVE_ROW]} />,
    );
    const row = getAllByTestId("picker-roster-row")[0] as HTMLButtonElement;
    // jsdom can't compute applied 44px height — the Playwright dimensional-
    // invariants test in tests/e2e asserts the real rendered floor. Here
    // we pin the contract that the class IS applied (regression catch for
    // future refactors).
    expect(row.className).toMatch(/\bmin-h-tap-min\b/);
  });
});

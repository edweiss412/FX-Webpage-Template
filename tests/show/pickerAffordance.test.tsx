// tests/show/pickerAffordance.test.tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PickerInterstitial } from "@/app/show/[slug]/[shareToken]/_PickerInterstitial";
import { messageFor } from "@/lib/messages/lookup";

const base = { slug: "s", shareToken: "t", showId: "sid", banner: null, staleCleanupHint: null } as const;
const affordance = messageFor("PICKER_NAME_NOT_LISTED").crewFacing!;
const roster = [{ id: "1", name: "Doug Larson", role: "A1", role_flags: [], claimed_via_oauth_at: null }];

describe("picker missing-name affordance (both modes)", () => {
  test("non-empty roster shows the affordance", () => {
    const { container } = render(<PickerInterstitial {...base} roster={roster} />);
    const el = container.querySelector('[data-testid="picker-name-not-listed"]');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain(affordance);
  });

  test("empty roster shows the affordance alongside PICKER_EMPTY_ROSTER copy", () => {
    const { container } = render(<PickerInterstitial {...base} roster={[]} />);
    expect(container.querySelector('[data-testid="picker-name-not-listed"]')?.textContent).toContain(affordance);
    expect(container.querySelector('[data-testid="picker-roster-empty"]')?.textContent).toContain(
      messageFor("PICKER_EMPTY_ROSTER").crewFacing!,
    );
  });
});

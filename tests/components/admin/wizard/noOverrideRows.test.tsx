// @vitest-environment jsdom
//
// Teardown guard (Task 1): the Step-3 wizard review sections must render NO
// field-override affordance — neither the active override row nor the
// "overrides become available after publish" first-seen hint. The override
// feature (#376) is removed; the sheet is the single source of truth.
//
// Fail-first mechanism: we pass a `liveOverrides: null` prop through a
// permissive cast. BEFORE removal, `null` is the first-seen sentinel and the
// sections render `override-unavailable-<domain>-<field>` hint rows — so the
// `toBeNull()` assertions FAIL. AFTER removal the prop no longer exists and is
// ignored, so no override DOM renders and the assertions PASS. The cast keeps
// the SAME test compiling before and after (the prop is gone post-removal), so
// the assertion — not an edited render call — is what flips.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import type { CrewMemberRow } from "@/lib/parser/types";
import { CrewBreakdown, VenueBreakdown } from "@/components/admin/wizard/step3ReviewSections";

const member: CrewMemberRow = {
  name: "Alice",
  email: null,
  phone: null,
  role: "A1",
  role_flags: [],
  date_restriction: { kind: "none" },
  stage_restriction: { kind: "none" },
  flight_info: null,
};

// Permissive props: `liveOverrides: null` is the pre-removal first-seen sentinel.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withLegacyOverrideProp = (props: Record<string, unknown>): any => props;

describe("wizard review sections — no override affordances after teardown", () => {
  it("CrewBreakdown renders the crew but no override row / no first-seen hint", () => {
    render(
      h(
        CrewBreakdown,
        withLegacyOverrideProp({ dfid: "d1", members: [member], liveOverrides: null }),
      ),
    );
    // Regression: the section still renders the parsed crew.
    expect(screen.getByText("Alice")).toBeTruthy();
    // Teardown: no override affordance in any form.
    expect(screen.queryByTestId(/^wizard-override-/)).toBeNull();
    expect(screen.queryByTestId(/^override-unavailable-/)).toBeNull();
  });

  it("VenueBreakdown renders the venue but no override row / no first-seen hint", () => {
    render(
      h(
        VenueBreakdown,
        withLegacyOverrideProp({
          dfid: "d1",
          venue: {
            name: "Grand Hall",
            address: "1 Main St",
            city: null,
            loadingDock: null,
            googleLink: null,
          },
          liveOverrides: null,
        }),
      ),
    );
    expect(screen.getByText("Grand Hall")).toBeTruthy();
    expect(screen.queryByTestId(/^wizard-override-/)).toBeNull();
    expect(screen.queryByTestId(/^override-unavailable-/)).toBeNull();
  });
});

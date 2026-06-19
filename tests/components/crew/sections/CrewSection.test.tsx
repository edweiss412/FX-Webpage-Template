// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";

import { CrewSection, CREW_INLINE_CAP } from "@/components/crew/sections/CrewSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

describe("CrewSection", () => {
  test.each([CREW_INLINE_CAP - 1, CREW_INLINE_CAP, CREW_INLINE_CAP + 1])(
    "roster cap boundary at %i",
    (n) => {
      const crewMembers = Array.from({ length: n }, (_, i) => ({
        id: `c${i}`,
        name: `Member ${i}`,
        email: null,
        phone: null,
        role: "",
        roleFlags: [],
        dateRestriction: { kind: "none" as const },
        stageRestriction: { kind: "none" as const },
      }));
      const { container } = render(
        <CrewSection
          data={makeShowForViewer({ crewMembers })}
          viewer={{ kind: "crew", crewMemberId: "c0" }}
          today={TODAY}
          showId={SHOW_ID}
        />,
      );
      const shown = container.querySelectorAll('[data-testid="crew-person-row"]').length;
      const stub = container.querySelector("[data-tile-show-more]");
      if (n <= CREW_INLINE_CAP) {
        expect(shown).toBe(n);
        expect(stub).toBeNull();
      } else {
        expect(shown).toBe(CREW_INLINE_CAP);
        expect(stub!.textContent).toContain(String(n - CREW_INLINE_CAP));
      }
    },
  );

  test("client_contact never appears in Crew", () => {
    const { container } = render(
      <CrewSection
        data={makeShowForViewer({
          show: {
            client_contact: { name: "CLIENT_REP", phone: "555-0", email: null },
          },
          contacts: [
            {
              kind: "venue",
              name: "Venue Vera",
              email: "vera@venue.test",
              phone: "555-1234",
              notes: null,
            },
            {
              kind: "in_house_av",
              name: "AV Ace",
              email: "ace@av.test",
              phone: "555-5678",
              notes: null,
            },
          ],
        })}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    // client_contact must NOT render in the Crew section.
    expect(container.textContent).not.toContain("CLIENT_REP");
    // A key-contact sourced from data.contacts IS rendered.
    expect(container.textContent).toContain("Venue Vera");
  });
});

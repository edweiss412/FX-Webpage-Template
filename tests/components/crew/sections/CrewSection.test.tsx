// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { CrewSection, CREW_INLINE_CAP } from "@/components/crew/sections/CrewSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

afterEach(cleanup);

/**
 * The two-column wrapper is the direct parent of the `[data-testid="crew-column"]`
 * columns. Resolve it from whichever column rendered so the assertion targets the
 * actual layout container, not the section root.
 */
function wrapperOf(container: HTMLElement): HTMLElement {
  const column = container.querySelector('[data-testid="crew-column"]');
  expect(column).not.toBeNull();
  const wrapper = column!.parentElement;
  expect(wrapper).not.toBeNull();
  return wrapper as HTMLElement;
}

const VENUE_CONTACT = {
  kind: "venue" as const,
  name: "Venue Vera",
  email: "vera@venue.test",
  phone: "555-1234",
  notes: null,
};

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

  test("both columns present → split-wide two-track grid (1.6fr_1fr)", () => {
    const { container } = render(
      <CrewSection
        data={makeShowForViewer({
          crewMembers: [
            {
              id: "c1",
              name: "Member One",
              email: null,
              phone: null,
              role: "",
              roleFlags: [],
              dateRestriction: { kind: "none" as const },
              stageRestriction: { kind: "none" as const },
            },
          ],
          contacts: [VENUE_CONTACT],
        })}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    // Both columns rendered.
    expect(container.querySelectorAll('[data-testid="crew-column"]').length).toBe(2);
    // Mock `.card-head .ico` parity: both the Show-crew and Key-contacts cards
    // carry a leading glyph (UsersIcon / PhoneIcon).
    expect(container.querySelectorAll('[data-slot="section-card-icon"] svg').length).toBe(2);
    const wrapper = wrapperOf(container);
    // Wide-left / narrow-right grid is the two-sided layout.
    expect(wrapper).toHaveClass("grid");
    expect(wrapper).toHaveClass("min-[720px]:grid-cols-[1.6fr_1fr]");
    expect(wrapper.className).not.toContain("flex-row");
  });

  test("crew-only (contacts empty) → single full-width column, NOT a 2-track grid", () => {
    const { container } = render(
      <CrewSection
        data={makeShowForViewer({
          crewMembers: [
            {
              id: "c1",
              name: "Member One",
              email: null,
              phone: null,
              role: "",
              roleFlags: [],
              dateRestriction: { kind: "none" as const },
              stageRestriction: { kind: "none" as const },
            },
          ],
          contacts: [],
        })}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const columns = container.querySelectorAll('[data-testid="crew-column"]');
    // Only the Show-crew column renders.
    expect(columns.length).toBe(1);
    expect(columns[0]!.getAttribute("data-crew-column")).toBe("roster");
    const wrapper = wrapperOf(container);
    // No blank right track at ≥720px: the wrapper is NOT the two-track grid.
    expect(wrapper.className).not.toContain("grid-cols-[1.6fr_1fr]");
    expect(wrapper).toHaveClass("flex");
    expect(wrapper).toHaveClass("flex-col");
  });

  test("contacts-only (crew empty) → single full-width column, NOT a 2-track grid", () => {
    const { container } = render(
      <CrewSection
        data={makeShowForViewer({
          crewMembers: [],
          contacts: [VENUE_CONTACT],
        })}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const columns = container.querySelectorAll('[data-testid="crew-column"]');
    // Only the Key-contacts column renders.
    expect(columns.length).toBe(1);
    expect(columns[0]!.getAttribute("data-crew-column")).toBe("contacts");
    const wrapper = wrapperOf(container);
    expect(wrapper.className).not.toContain("grid-cols-[1.6fr_1fr]");
    expect(wrapper).toHaveClass("flex");
    expect(wrapper).toHaveClass("flex-col");
  });

  test("partial-attendance member gets a chip; full-attendance member does not (BL-CREW-PARTIAL-ATTENDANCE-CHIP)", () => {
    const crewMembers = [
      {
        id: "c0",
        name: "Calvin",
        email: null,
        phone: null,
        role: "BO",
        roleFlags: [],
        dateRestriction: { kind: "explicit" as const, days: ["2025-10-07", "2025-10-09"] },
        stageRestriction: { kind: "none" as const },
      },
      {
        id: "c1",
        name: "Doug",
        email: null,
        phone: null,
        role: "Lead",
        roleFlags: [],
        dateRestriction: { kind: "none" as const },
        stageRestriction: { kind: "none" as const },
      },
    ];
    const { container } = render(
      <CrewSection
        data={makeShowForViewer({ crewMembers })}
        viewer={{ kind: "crew", crewMemberId: "c1" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const rows = [...container.querySelectorAll('[data-testid="crew-person-row"]')];
    const calvin = rows.find((r) => r.textContent?.includes("Calvin"))!;
    const doug = rows.find((r) => r.textContent?.includes("Doug"))!;
    expect(calvin.querySelector("[data-partial]")).not.toBeNull();
    expect(calvin.textContent).toContain("Oct 7 & 9 only");
    expect(doug.querySelector("[data-partial]")).toBeNull();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { ContactsSection } from "@/components/crew/sections/ContactsSection";
import { CrewSection, CREW_INLINE_CAP } from "@/components/crew/sections/CrewSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./_ledgerProp";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

afterEach(cleanup);

const VENUE_CONTACT = {
  kind: "venue" as const,
  name: "Venue Vera",
  email: "vera@venue.test",
  phone: "555-1234",
  notes: null,
};

/**
 * The roster is the whole Crew section from crew page redesign PR B Task 7 (the
 * key contacts moved to their own section): its one panel card spans the
 * section, with no column wrapper and no two-track split.
 */
function expectSingleRosterCard(container: HTMLElement) {
  const root = container.querySelector('[data-testid="section-crew"]');
  expect(root).not.toBeNull();
  const cards = root!.querySelectorAll('[data-testid="crew-panel-card"]');
  expect(cards).toHaveLength(1);
  expect(cards[0]!.getAttribute("data-card-id")).toBe("crew-roster");
  expect(root!.querySelector('[data-testid="crew-column"]')).toBeNull();
  expect(root!.innerHTML).not.toContain("grid-cols-[1.6fr_1fr]");
  expect(root!.querySelector('[data-card-id="crew-contacts"]')).toBeNull();
}

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
          {...ledgerProp()}
          data={makeShowForViewer({ crewMembers })}
          viewer={{ kind: "crew", crewMemberId: "c0" }}
          today={TODAY}
          showId={SHOW_ID}
        />,
      );
      const shown = container.querySelectorAll('[data-testid="crew-panel-crew-row"]').length;
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

  test("client_contact never appears in Crew, and the key contacts render in their own section", () => {
    const data = makeShowForViewer({
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
    });
    const { container } = render(
      <CrewSection
        {...ledgerProp()}
        data={data}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    // client_contact must NOT render in the Crew section, and the key contacts left it.
    expect(container.textContent).not.toContain("CLIENT_REP");
    expect(container.textContent).not.toContain("Venue Vera");
    cleanup();
    // A key contact sourced from data.contacts IS rendered, in the Contacts section,
    // and the client contact is not.
    const contacts = render(
      <ContactsSection
        {...ledgerProp()}
        data={data}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
    expect(contacts.textContent).toContain("Venue Vera");
    expect(contacts.textContent).not.toContain("CLIENT_REP");
  });

  test("with contacts on the show, the Crew section is the roster card alone: no column split, no contacts card", () => {
    const { container } = render(
      <CrewSection
        {...ledgerProp()}
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
    expectSingleRosterCard(container);
    // Mock `.card-head .ico` parity: the card carries its leading glyph in the crew
    // panel card's chip (PR B Task 6), and no other card is left in the section.
    expect(container.querySelectorAll('[data-slot="panel-card-chip"] svg').length).toBe(1);
    expect(container.querySelectorAll('[data-slot="section-card-icon"] svg').length).toBe(0);
  });

  test("crew only (contacts empty) → the same single roster card", () => {
    const { container } = render(
      <CrewSection
        {...ledgerProp()}
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
    expectSingleRosterCard(container);
  });

  test("no crew → the section's empty state, even with contacts on the show", () => {
    const { container } = render(
      <CrewSection
        {...ledgerProp()}
        data={makeShowForViewer({
          crewMembers: [],
          contacts: [VENUE_CONTACT],
        })}
        viewer={{ kind: "admin" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const empty = container.querySelectorAll('[data-testid="section-empty"]');
    expect(empty).toHaveLength(1);
    expect(empty[0]!.textContent).toBe("No crew on file yet.");
    expect(container.querySelector('[data-testid="crew-panel-card"]')).toBeNull();
    expect(container.textContent).not.toContain(VENUE_CONTACT.name);
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
        {...ledgerProp()}
        data={makeShowForViewer({ crewMembers })}
        viewer={{ kind: "crew", crewMemberId: "c1" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const rows = [...container.querySelectorAll('[data-testid="crew-panel-crew-row"]')];
    const calvin = rows.find((r) => r.textContent?.includes("Calvin"))!;
    const doug = rows.find((r) => r.textContent?.includes("Doug"))!;
    expect(calvin.querySelector("[data-partial]")).not.toBeNull();
    expect(calvin.textContent).toContain("Oct 7 & 9 only");
    expect(doug.querySelector("[data-partial]")).toBeNull();
  });
});

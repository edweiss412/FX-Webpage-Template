// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/sectionExtrasPresence.test.tsx
 * (crew-warning-attachment spec §5.4b — routed-sections presence pin, R1-F2/R2-F1)
 *
 * The full published surface renders with a routed warning for EACH of the 11
 * routing-target sections; every section's warning-extras block must exist AND
 * be a DESCENDANT of that section's §5.2 panel card. Pins that every host
 * consumes the chrome's `sectionExtras` — a future chrome-less section body
 * fails the presence assertion instead of silently dropping its group.
 *
 * Excluded per spec §1.1: `warnings` (always sibling, R1-F1), `report` (null
 * published render), `diagrams` (no routing target; nested under rooms).
 *
 * Anti-tautology: presence is asserted PER id (one passing section cannot mask
 * another's drop); descendant-of-card is asserted by walking the extras node's
 * ancestor chain to the section and requiring a bordered div crossing — never
 * by shape-matching a "card" that could select the extras block itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/polish-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSurfaceProps } from "../../../helpers/publishedSurfaceProps";

afterEach(cleanup);

/** Section label (helper emitter key) → routed SectionId. Completeness pinned
 *  below against the spec §1.1 11-target list. */
const ROUTED: readonly { label: string; id: string }[] = [
  { label: "Venue", id: "venue" },
  { label: "Event details", id: "event" },
  { label: "Crew", id: "crew" },
  { label: "Contacts", id: "contacts" },
  { label: "Crew schedule", id: "schedule" },
  { label: "Agenda", id: "agenda" },
  { label: "Hotels", id: "hotels" },
  { label: "Transport", id: "transport" },
  { label: "Rooms & scope", id: "rooms" },
  { label: "Pack list", id: "packlist" },
  { label: "Billing & docs", id: "billing" },
];

const DRIVE_FILE_ID = "DRIVE_POLISH";

describe("routed-sections extras presence + in-card containment (spec §5.4b)", () => {
  it("covers exactly the 11 routing-target sections (numeric pin vs spec §1.1)", () => {
    expect([...ROUTED.map((r) => r.id)].sort()).toEqual(
      [
        "agenda",
        "billing",
        "contacts",
        "crew",
        "event",
        "hotels",
        "packlist",
        "rooms",
        "schedule",
        "transport",
        "venue",
      ].sort(),
    );
  });

  it("every routed section renders its extras block INSIDE its panel card", () => {
    render(
      <ShowReviewSurface
        {...buildPublishedSurfaceProps({
          elsewhereSections: ROUTED.map((r) => r.label),
          // agenda is conditional — a non-empty baseline mounts it (T4b).
          agendaLinks: [{ label: "AGENDA LINK", url: "https://example.com/agenda.pdf" }],
        })}
      />,
    );
    for (const { id } of ROUTED) {
      const section = screen.getByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-review-section-${id}`);
      const extras = within(section).getByTestId(`section-warning-controls-${id}`);
      // Descendant-of-card: between the extras node and the section wrapper
      // there must be a bordered div (the §5.2 panel card). A sibling-placed
      // extras block reaches the section without crossing one.
      let el: HTMLElement | null = extras.parentElement;
      let crossedBorderedDiv = false;
      while (el && el !== section) {
        if (el.tagName === "DIV" && /(^|\s)border(\s|$)/.test(el.className)) {
          crossedBorderedDiv = true;
        }
        el = el.parentElement;
      }
      expect(crossedBorderedDiv, `extras for '${id}' render inside its panel card`).toBe(true);
    }
  });
});

// @vitest-environment jsdom
/**
 * tests/components/tiles/SentinelHidingClass.test.tsx
 *
 * Crew-redesign retarget (wp-20 step b): the §8.3 generic-optional
 * sentinel-hiding BEHAVIORAL contract, ported off the deleted M4 tiles onto
 * the curated section/primitive surfaces that now own each field. The
 * structural directory-walk lives in `_metaSentinelHidingContract.test.ts`
 * (kept unchanged — it already walks `components/crew/`); THIS file is the
 * per-field render-level assertion that a sentinel never reaches the DOM.
 *
 * Field → new owner map:
 *   - venue/hotel/room/transport/contact notes aggregation → TodaySection
 *     "Show notes" + the transport-source visibility gate.
 *   - transportation driver/vehicle/plate/color/parking/notes → TravelSection
 *     "Getting there".
 *   - hotel address / confirmation / notes → TravelSection "Hotels".
 *   - venue notes / loadingDock / googleLink (+URL guard) → VenueSection.
 *   - dress code → TodaySection "Dress code".
 *   - contact phone/email/notes (dead-link guard) → CrewSection → PersonRow.
 *   - crew member phone/email (dead-link guard) → CrewSection → PersonRow.
 *   - room audio/video/lighting scope → GearSection scope cards.
 *   - financials po/proposal/invoice/invoice_notes → BudgetSection.
 *   - pack-list item cat/subCat taxonomy → GearSection pack list.
 *
 * SENTINELS mirror lib/visibility/emptyState.ts:GENERIC_OPTIONAL_HIDE
 * (case-insensitive after trim). Each class gets a sentinel test (value
 * absent from DOM) AND a non-sentinel anti-tautology test (value present),
 * with a non-sentinel sibling field keeping the surface alive so a vacuous
 * null-render can't pass.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { CrewSection } from "@/components/crew/sections/CrewSection";
import { GearSection } from "@/components/crew/sections/GearSection";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { BudgetSection } from "@/components/crew/sections/BudgetSection";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ContactRow, RoleFlag } from "@/lib/parser/types";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
// Admin viewer: all flags + isAdmin → transport/scope/budget gates all open,
// so the sentinel-hiding behavior (not a visibility gate) is what's exercised.
const ADMIN = { kind: "admin" } as const;

// Every value here MUST be in GENERIC_OPTIONAL_HIDE. If that set shrinks this
// array becomes a false-positive — keep them aligned.
const SENTINELS = ["TBD", "N/A", "TBA", "  ", ""] as const;

// TodaySection mounts the RightNowHero client island (matchMedia-on-mount).
// jsdom lacks matchMedia; stub it so the hero's real wiring runs.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function html(container: HTMLElement): string {
  return container.innerHTML;
}

// ─────────────────────────────────────────────────────────────────────
// Notes aggregation → TodaySection "Show notes"
// ─────────────────────────────────────────────────────────────────────

describe("§8.3 sentinel-hiding — Show notes aggregation (TodaySection)", () => {
  function renderToday(over: Parameters<typeof makeShowForViewer>[0]) {
    return render(
      <TodaySection data={makeShowForViewer(over)} viewer={ADMIN} today={TODAY} showId={SHOW_ID} />,
    ).container;
  }

  for (const sentinel of SENTINELS) {
    test(`every notes source = "${sentinel}" → no Show notes block`, () => {
      const c = renderToday({
        show: { venue: { name: "TestVenue", address: "1 Main", notes: sentinel } },
        hotelReservations: [
          {
            ordinal: 1,
            hotel_name: "The Marriott Downtown",
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: sentinel,
          },
        ],
        contacts: [{ kind: "venue", name: "Stella", email: null, phone: null, notes: sentinel }],
      });
      // No Show-notes surface (every source sentinel → zero entries).
      expect(c.querySelector('[data-testid="today-notes"]')).toBeNull();
      if (sentinel.trim().length > 0) {
        expect(html(c)).not.toContain(sentinel);
      }
    });
  }

  test("mixed sources — only non-sentinel notes render", () => {
    const c = renderToday({
      show: { venue: { name: "TestVenue", address: "1 Main", notes: "TBD" } },
      hotelReservations: [
        {
          ordinal: 1,
          hotel_name: "The Marriott Downtown",
          hotel_address: null,
          names: [],
          confirmation_no: null,
          check_in: null,
          check_out: null,
          notes: "Free WiFi at front desk",
        },
      ],
      contacts: [
        { kind: "venue", name: "Stella", email: null, phone: null, notes: "Knows the dock combo" },
      ],
    });
    expect(c.querySelector('[data-testid="today-notes"]')).toBeTruthy();
    expect(c.textContent ?? "").toContain("Free WiFi at front desk");
    expect(c.textContent ?? "").toContain("Knows the dock combo");
    expect(html(c)).not.toContain("TBD");
  });

  test("transport note source gated — admin sees it (anti-tautology)", () => {
    const c = renderToday({
      transportation: {
        driver_name: "Manny Driver",
        driver_phone: null,
        driver_email: null,
        vehicle: null,
        license_plate: null,
        color: null,
        parking: null,
        schedule: [],
        notes: "Park in the back lot, gate code 1234",
      },
    });
    expect(c.textContent ?? "").toContain("Park in the back lot, gate code 1234");
    expect(c.querySelector('li[data-source="transport"]')).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Dress code → TodaySection
// ─────────────────────────────────────────────────────────────────────

describe("§8.3 sentinel-hiding — Dress code (TodaySection)", () => {
  function renderDress(dress: string) {
    return render(
      <TodaySection
        data={makeShowForViewer({ show: { event_details: { dress_code: dress } } })}
        viewer={ADMIN}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  for (const sentinel of SENTINELS) {
    test(`dress_code = "${sentinel}" → no Dress code block`, () => {
      const c = renderDress(sentinel);
      expect(c.querySelector('[data-testid="today-dress"]')).toBeNull();
      if (sentinel.trim().length > 0) {
        expect(html(c)).not.toContain(sentinel);
      }
    });
  }

  test("non-sentinel dress_code renders (anti-tautology)", () => {
    const c = renderDress("Business casual");
    expect(c.querySelector('[data-testid="today-dress"]')).toBeTruthy();
    expect(c.textContent ?? "").toContain("Business casual");
  });

  test("single-key sentinel dress_code with no other candidate → block omitted", () => {
    // A sentinel `dress_code` alone reflows out (the predicate is wired on the
    // resolved value). This is the part of the dress contract TodaySection DOES
    // satisfy.
    const c = render(
      <TodaySection
        data={makeShowForViewer({ show: { event_details: { dress_code: "N/A" } } })}
        viewer={ADMIN}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
    expect(c.querySelector('[data-testid="today-dress"]')).toBeNull();
    expect(html(c)).not.toContain("N/A");
  });

  test("KNOWN DELTA — cross-key fallback does NOT skip a sentinel earlier key (regression vs M4 pickDressCode)", () => {
    // M4 ShowStatusTile.pickDressCode (components/tiles/ShowStatusTile.tsx:66-77)
    // probed candidate keys [dress_code, "dress code", dress, attire] IN ORDER
    // and SKIPPED any whose value was a sentinel, so `dress_code:"N/A"` +
    // `attire:"Black tie"` rendered "Black tie".
    //
    // TodaySection.tsx:184-189 resolves dress via a plain `??` chain
    // (`dress_code ?? dress ?? attire`), which stops at the first NON-NULL key
    // regardless of whether it's a sentinel — so a sentinel `dress_code` SHADOWS
    // a real `attire` and the whole Dress code block is omitted. The real value
    // is dropped. This test PINS the current (regressed) behavior so the delta
    // is visible; it is reported to the orchestrator as a real contract gap, not
    // silently weakened. (It does NOT leak the sentinel — fail-safe direction.)
    const c = render(
      <TodaySection
        data={makeShowForViewer({
          show: { event_details: { dress_code: "N/A", attire: "Black tie" } },
        })}
        viewer={ADMIN}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
    // Current behavior: sentinel dress_code shadows attire → block omitted.
    expect(c.querySelector('[data-testid="today-dress"]')).toBeNull();
    // The real attire value is (regrettably) dropped — documents the delta.
    expect(c.textContent ?? "").not.toContain("Black tie");
    // No sentinel leaks (the only fail-SAFE part of the delta).
    expect(html(c)).not.toContain("N/A");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Transportation fields → TravelSection "Getting there"
// ─────────────────────────────────────────────────────────────────────

describe("§8.3 sentinel-hiding — Transportation (TravelSection)", () => {
  function travel(over: Record<string, unknown>) {
    return render(
      <TravelSection
        data={makeShowForViewer({
          transportation: {
            driver_name: null,
            driver_phone: null,
            driver_email: null,
            vehicle: null,
            license_plate: null,
            color: null,
            parking: null,
            schedule: [],
            notes: null,
            ...over,
          },
        })}
        viewer={ADMIN}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  for (const sentinel of SENTINELS) {
    test(`vehicle = "${sentinel}" → no Vehicle value; driver keeps tile alive`, () => {
      const c = travel({ driver_name: "Manny Driver", vehicle: sentinel });
      expect(c.textContent ?? "").toContain("Manny Driver");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });

    test(`driver_phone = "${sentinel}" → value absent; driver name keeps it alive`, () => {
      const c = travel({ driver_name: "Manny Driver", driver_phone: sentinel });
      expect(c.textContent ?? "").toContain("Manny Driver");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });

    test(`notes = "${sentinel}" → notes paragraph absent`, () => {
      const c = travel({ driver_name: "Manny Driver", notes: sentinel });
      expect(c.textContent ?? "").toContain("Manny Driver");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });
  }

  test("all transport fields sentinel → Getting there omitted (no orphan block)", () => {
    const c = travel({
      driver_name: "TBD",
      driver_phone: "TBD",
      driver_email: "TBD",
      vehicle: "TBD",
      license_plate: "N/A",
      color: "TBA",
      parking: "TBD",
      notes: "TBD",
    });
    expect(c.querySelector('[data-testid="travel-getting-there"]')).toBeNull();
    expect(html(c)).not.toContain("TBD");
    expect(html(c)).not.toContain("N/A");
    expect(html(c)).not.toContain("TBA");
  });

  test("non-sentinel transport fields render (anti-tautology)", () => {
    const c = travel({
      driver_name: "Manny Driver",
      driver_phone: "555-1234",
      vehicle: "Sprinter Van",
      license_plate: "ABC-1234",
      color: "Black",
      parking: "Lot 5",
      notes: "Park in the back lot",
    });
    for (const v of ["Manny Driver", "555-1234", "Sprinter Van", "ABC-1234", "Black", "Lot 5", "Park in the back lot"]) {
      expect(c.textContent ?? "").toContain(v);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Hotel reservation fields → TravelSection "Hotels"
// ─────────────────────────────────────────────────────────────────────

describe("§8.3 sentinel-hiding — Hotel reservation (TravelSection)", () => {
  function hotel(over: Record<string, unknown>) {
    return render(
      <TravelSection
        data={makeShowForViewer({
          hotelReservations: [
            {
              ordinal: 1,
              hotel_name: "The Marriott Downtown",
              hotel_address: null,
              names: ["Alice"],
              confirmation_no: null,
              check_in: null,
              check_out: null,
              notes: null,
              ...over,
            },
          ],
        })}
        viewer={ADMIN}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  for (const sentinel of SENTINELS) {
    test(`hotel_address = "${sentinel}" → address absent; hotel name alive`, () => {
      const c = hotel({ hotel_address: sentinel });
      expect(c.textContent ?? "").toContain("The Marriott Downtown");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });

    test(`confirmation_no = "${sentinel}" → Confirmation row absent`, () => {
      const c = hotel({ confirmation_no: sentinel });
      expect(c.textContent ?? "").toContain("The Marriott Downtown");
      expect(c.textContent ?? "").not.toContain("Confirmation");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });

    test(`hotel notes = "${sentinel}" → Notes row absent`, () => {
      const c = hotel({ notes: sentinel });
      expect(c.textContent ?? "").toContain("The Marriott Downtown");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });
  }

  test("non-sentinel hotel fields render (anti-tautology)", () => {
    const c = hotel({
      hotel_address: "100 Hotel Way, Downtown",
      confirmation_no: "ABC-123",
      notes: "Late checkout granted",
    });
    expect(c.textContent ?? "").toContain("100 Hotel Way, Downtown");
    expect(c.textContent ?? "").toContain("Confirmation");
    expect(c.textContent ?? "").toContain("ABC-123");
    expect(c.textContent ?? "").toContain("Late checkout granted");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Venue fields → VenueSection
// ─────────────────────────────────────────────────────────────────────

describe("§8.3 sentinel-hiding — Venue (VenueSection)", () => {
  function venue(over: Record<string, unknown>) {
    return render(
      <VenueSection
        data={makeShowForViewer({
          show: {
            venue: {
              name: "Hilton Downtown",
              address: "200 Main St",
              loadingDock: null,
              googleLink: null,
              notes: null,
              ...over,
            },
          },
        })}
        viewer={ADMIN}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  for (const sentinel of SENTINELS) {
    test(`venue.notes = "${sentinel}" → Venue notes row absent`, () => {
      const c = venue({ notes: sentinel });
      expect(c.textContent ?? "").toContain("200 Main St");
      expect(c.textContent ?? "").not.toContain("Venue notes");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });

    test(`venue.loadingDock = "${sentinel}" → Loading dock row absent`, () => {
      const c = venue({ loadingDock: sentinel });
      expect(c.textContent ?? "").toContain("200 Main St");
      expect(c.textContent ?? "").not.toContain("Loading dock");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });

    test(`venue.googleLink = "${sentinel}" → no Maps anchor`, () => {
      const c = venue({ googleLink: sentinel });
      expect(c.textContent ?? "").not.toContain("Open in Maps");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });
  }

  test("googleLink without protocol → no Maps anchor (URL-validity guard)", () => {
    const c = venue({ googleLink: "maps.google.com/?q=Hilton" });
    expect(c.textContent ?? "").not.toContain("Open in Maps");
  });

  test("googleLink javascript: → no Maps anchor (XSS guard)", () => {
    const c = venue({ googleLink: "javascript:alert('xss')" });
    expect(c.textContent ?? "").not.toContain("Open in Maps");
    expect(html(c)).not.toContain("javascript:");
  });

  test("non-sentinel venue fields render (anti-tautology)", () => {
    const c = venue({
      loadingDock: "Bay 3, alley off Walnut St",
      googleLink: "https://maps.google.com/?q=Hilton",
      notes: "Tell front desk you are with FXAV",
    });
    expect(c.textContent ?? "").toContain("Bay 3, alley off Walnut St");
    expect(c.textContent ?? "").toContain("Open in Maps");
    expect(html(c)).toContain("https://maps.google.com/?q=Hilton");
    expect(c.textContent ?? "").toContain("Tell front desk you are with FXAV");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Contact + crew actionable links → CrewSection → PersonRow
// ─────────────────────────────────────────────────────────────────────

describe("§8.3 actionable-link guard — Key contacts (CrewSection → PersonRow)", () => {
  function contact(over: Partial<ContactRow>) {
    const contacts: ContactRow[] = [
      { kind: "venue", name: "Stella the FOH Manager", email: null, phone: null, notes: null, ...over },
    ];
    return render(
      <CrewSection
        data={makeShowForViewer({ contacts })}
        viewer={ADMIN}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  for (const sentinel of SENTINELS) {
    test(`contact.phone = "${sentinel}" → no tel: tap target`, () => {
      const c = contact({ phone: sentinel });
      expect(c.textContent ?? "").toContain("Stella the FOH Manager");
      expect(html(c)).not.toContain("tel:");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });

    test(`contact.email = "${sentinel}" → no mailto: tap target`, () => {
      const c = contact({ email: sentinel });
      expect(c.textContent ?? "").toContain("Stella the FOH Manager");
      expect(html(c)).not.toContain("mailto:");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });

    test(`contact.notes = "${sentinel}" → notes paragraph absent`, () => {
      const c = contact({ notes: sentinel });
      expect(c.textContent ?? "").toContain("Stella the FOH Manager");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });
  }

  test("non-sentinel contact phone/email/notes render (anti-tautology)", () => {
    const c = contact({ phone: "555-1234", email: "stella@venue.example", notes: "Loading dock combo" });
    expect(html(c)).toContain("tel:5551234");
    expect(html(c)).toContain("mailto:stella@venue.example");
    expect(c.textContent ?? "").toContain("Loading dock combo");
  });
});

describe("§8.3 actionable-link guard — Crew roster (CrewSection → PersonRow)", () => {
  function crew(over: { phone?: string | null; email?: string | null }) {
    return render(
      <CrewSection
        data={makeShowForViewer({
          crewMembers: [
            {
              id: "crew-1",
              name: "Sam Crew",
              email: null,
              phone: null,
              role: "A1",
              roleFlags: ["A1"],
              dateRestriction: { kind: "none" },
              stageRestriction: { kind: "none" },
              ...over,
            },
          ],
        })}
        viewer={ADMIN}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  for (const sentinel of SENTINELS) {
    test(`member.phone = "${sentinel}" → no tel: tap target`, () => {
      const c = crew({ phone: sentinel });
      expect(c.textContent ?? "").toContain("Sam Crew");
      expect(html(c)).not.toContain("tel:");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });

    test(`member.email = "${sentinel}" → no mailto: tap target`, () => {
      const c = crew({ email: sentinel });
      expect(c.textContent ?? "").toContain("Sam Crew");
      expect(html(c)).not.toContain("mailto:");
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });
  }

  test("non-sentinel member phone/email render (anti-tautology)", () => {
    const c = crew({ phone: "555-9876", email: "sam@crew.example" });
    expect(html(c)).toContain("tel:5559876");
    expect(html(c)).toContain("mailto:sam@crew.example");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Room scope strings → GearSection scope cards
// ─────────────────────────────────────────────────────────────────────

describe("§8.3 sentinel-hiding — Scope cards (GearSection)", () => {
  const FLAGS: RoleFlag[] = ["LEAD", "L1"];

  function gear(rooms: Array<Record<string, unknown>>) {
    return render(
      <GearSection
        data={makeShowForViewer({
          rooms: rooms as never,
          crewMembers: [
            {
              id: "c1",
              name: "A",
              email: null,
              phone: null,
              role: "",
              roleFlags: FLAGS,
              dateRestriction: { kind: "none" },
              stageRestriction: { kind: "none" },
            },
          ],
        })}
        viewer={{ kind: "crew", crewMemberId: "c1" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  for (const discipline of ["audio", "video", "lighting"] as const) {
    for (const sentinel of SENTINELS) {
      test(`every room.${discipline} = "${sentinel}" → ${discipline} card omitted`, () => {
        const c = gear([{ id: "r1", kind: "gs", name: "GS", [discipline]: sentinel }]);
        expect(c.querySelector(`[data-testid="gear-scope-${discipline}"]`)).toBeNull();
        if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
      });
    }
  }

  test("mixed rooms — only non-sentinel scope rows render", () => {
    const c = gear([
      { id: "r1", kind: "gs", name: "GS", audio: "TBD" },
      { id: "r2", kind: "breakout", name: "Ballroom", audio: "L-Acoustics K1" },
      { id: "r3", kind: "additional", name: "Green Room", audio: "N/A" },
    ]);
    expect(c.querySelector('[data-testid="gear-scope-audio"]')).toBeTruthy();
    expect(c.textContent ?? "").toContain("L-Acoustics K1");
    expect(html(c)).not.toContain("TBD");
    expect(html(c)).not.toContain("N/A");
  });

  test("non-sentinel scope renders (anti-tautology)", () => {
    const c = gear([{ id: "r1", kind: "gs", name: "GS", lighting: "MAC Aura XB wash" }]);
    expect(c.textContent ?? "").toContain("MAC Aura XB wash");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Financials → BudgetSection
// ─────────────────────────────────────────────────────────────────────

describe("§8.3 sentinel-hiding — Financials (BudgetSection)", () => {
  function budget(financials: { po: string; proposal: string; invoice: string; invoice_notes: string }) {
    return render(
      <BudgetSection
        data={makeShowForViewer({ financials })}
        viewer={ADMIN}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  for (const sentinel of SENTINELS) {
    test(`every financials field = "${sentinel}" → empty-state, no value`, () => {
      const c = budget({ po: sentinel, proposal: sentinel, invoice: sentinel, invoice_notes: sentinel });
      expect(c.querySelector('[data-testid="section-empty"]')).toBeTruthy();
      if (sentinel.trim().length > 0) expect(html(c)).not.toContain(sentinel);
    });
  }

  test("mixed financials — only non-sentinel fields render", () => {
    const c = budget({ po: "PO-12345", proposal: "TBD", invoice: "INV-99", invoice_notes: "N/A" });
    expect(c.textContent ?? "").toContain("PO-12345");
    expect(c.textContent ?? "").toContain("INV-99");
    expect(html(c)).not.toContain("TBD");
    expect(html(c)).not.toContain("N/A");
  });

  test("non-sentinel financials render (anti-tautology)", () => {
    const c = budget({
      po: "PO-12345",
      proposal: "Approved 4/10",
      invoice: "INV-99",
      invoice_notes: "Net 30 from event date",
    });
    expect(c.textContent ?? "").toContain("PO-12345");
    expect(c.textContent ?? "").toContain("Approved 4/10");
    expect(c.textContent ?? "").toContain("INV-99");
    expect(c.textContent ?? "").toContain("Net 30 from event date");
    expect(c.querySelector('[data-testid="section-empty"]')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pack-list item taxonomy → GearSection pack list
// ─────────────────────────────────────────────────────────────────────

describe("§8.3 sentinel-hiding — Pack-list taxonomy (GearSection)", () => {
  const TODAY_ISO = "2026-04-21";
  const PACK_TODAY = new Date("2026-04-21T16:00:00Z");

  function pack(item: { cat?: string | null; subCat?: string | null; item?: string }) {
    return render(
      <GearSection
        data={makeShowForViewer({
          show: { schedule_phases: { [TODAY_ISO]: ["Set"] } },
          pullSheet: [
            { caseLabel: "FOH Rack", items: [{ qty: 1, cat: null, subCat: null, item: "FOH Mixer", ...item }] },
          ],
        })}
        viewer={ADMIN}
        today={PACK_TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  for (const sentinel of SENTINELS) {
    test(`cat = "${sentinel}" → not in taxonomy parens`, () => {
      const c = pack({ cat: sentinel, subCat: "Mixers" });
      expect(c.textContent ?? "").toContain("FOH Mixer");
      if (sentinel.trim().length > 0) {
        expect(html(c)).not.toContain(`(${sentinel}`);
        expect(html(c)).not.toContain(`${sentinel} /`);
      }
    });

    test(`subCat = "${sentinel}" → not in taxonomy parens`, () => {
      const c = pack({ cat: "FOH", subCat: sentinel });
      expect(c.textContent ?? "").toContain("FOH Mixer");
      if (sentinel.trim().length > 0) {
        expect(html(c)).not.toContain(`/ ${sentinel}`);
        expect(html(c)).not.toContain(`${sentinel})`);
      }
    });
  }

  test("both cat+subCat sentinel → no taxonomy parens", () => {
    const c = pack({ cat: "TBD", subCat: "N/A" });
    expect(c.textContent ?? "").toContain("FOH Mixer");
    expect(html(c)).not.toContain("TBD");
    expect(html(c)).not.toContain("N/A");
    expect(c.textContent ?? "").not.toMatch(/FOH Mixer\s*\(\s*\)/);
  });

  test("both non-sentinel → full taxonomy renders (anti-tautology)", () => {
    const c = pack({ cat: "FOH", subCat: "Mixers" });
    expect(c.textContent ?? "").toContain("FOH Mixer");
    expect(c.textContent ?? "").toContain("FOH / Mixers");
  });

  test("one sentinel + one real → only real side renders", () => {
    const c = pack({ cat: "TBD", subCat: "Mixers" });
    expect(c.textContent ?? "").toContain("FOH Mixer");
    expect(c.textContent ?? "").toContain("(Mixers)");
    expect(html(c)).not.toContain("TBD");
  });
});

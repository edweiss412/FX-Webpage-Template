/**
 * tests/e2e/_hotelStayStubHarness.tsx — renderToStaticMarkup harness for the
 * hotel card date-stub reflow gate (hotel-stay-stub.layout.spec.ts). Run via
 * `tsx` from the layout spec, NOT imported: Playwright's test transform rewrites
 * JSX in every .tsx it loads into component-testing payloads that
 * react-dom/server cannot render (same boundary as _dataQualityBadgeHarness.tsx).
 * The main-guard writes { body } — the rendered HTML string — to argv[2].
 */
import { renderToStaticMarkup } from "react-dom/server";
import { HotelsBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { HotelReservationRow } from "@/lib/parser/types";

// Widths the card lives at: a 320px phone row (DESIGN.md §7a), a 360px phone,
// and the desktop review modal. Exported so the spec's case list cannot drift
// from what was rendered (the spec reads them back from the JSON).
export const STUB_CASE_WIDTHS = [240, 296, 600] as const;

// Two reservations, so each renders as its own bordered sub-card: the
// narrowest stub the modal produces. The first carries the widest night label
// a real stay reaches here (two digits) and the longest weekday names.
const HOTELS: HotelReservationRow[] = [
  {
    ordinal: 1,
    hotel_name: "The Westin Chicago River North",
    hotel_address: "320 N Dearborn St, Chicago, IL 60654",
    names: ["Maria Gonzalez-Whitfield", "Sam Oduya"],
    confirmation_no: null,
    check_in: "2026-03-11", // Wednesday
    check_out: "2026-03-23", // Monday, 12 nights
    notes: null,
  },
  {
    ordinal: 2,
    hotel_name: "Four Seasons Hotel Chicago",
    hotel_address: "120 E Delaware Pl Chicago, IL 60611",
    names: ["Douglas Larson"],
    confirmation_no: null,
    check_in: "2026-03-22",
    check_out: "2026-03-26",
    notes: null,
  },
];

export function renderHotelStubHarnessBody(): string {
  return renderToStaticMarkup(
    <main style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
      {STUB_CASE_WIDTHS.map((w) => (
        <div key={w} id={`case-${w}`} data-case-width={w} style={{ width: `${w}px` }}>
          <HotelsBreakdown dfid={`stub-${w}`} hotels={HOTELS} />
        </div>
      ))}
    </main>,
  );
}

// Direct-execution entry: `tsx _hotelStayStubHarness.tsx <out.json>` writes the
// rendered body so the layout spec never imports this .tsx (see file header).
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _hotelStayStubHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(
    outPath,
    JSON.stringify({ body: renderHotelStubHarnessBody(), widths: STUB_CASE_WIDTHS }),
  );
}

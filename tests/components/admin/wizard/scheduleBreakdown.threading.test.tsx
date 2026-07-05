// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import type { ParseResult, ShowRow } from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review"; // Step3Row is exported from Step3Review

// Step3SheetCard calls useRouter() — mock next/navigation (mirrors step3SheetCard.bookends.test.tsx).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const WSID = "00000000-1111-4222-8333-444444444444";
const DFID = "d";
afterEach(cleanup);

// Minimal ShowRow with a travel-in date and empty run-of-show (mirror the live
// fixture in tests/components/step3SheetCard.bookends.test.tsx:33-70).
const show = (): ShowRow => ({
  title: "T",
  client_label: "Acme Capital",
  client_contact: null,
  template_version: "v4",
  venue: null,
  dates: { travelIn: "2025-10-18", set: null, showDays: ["2025-10-20"], travelOut: null },
  schedule_phases: {},
  event_details: {},
  agenda_links: [],
  coi_status: null,
  po: null,
  proposal: null,
  invoice: null,
  invoice_notes: null,
});
const pr = (): ParseResult => ({
  show: show(),
  crewMembers: [],
  hotelReservations: [],
  rooms: [],
  transportation: null,
  contacts: [],
  pullSheet: null,
  diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
  openingReel: null,
  raw_unrecognized: [],
  warnings: [],
  runOfShow: {},
  hardErrors: [],
});
const row = (): Step3Row => ({
  driveFileId: DFID,
  driveFileName: "x.sheet",
  status: "staged",
  parseResult: pr(),
});

describe("wizard Step3 call site threads dates → travel-in appears (bug #316 item 1)", () => {
  test("travel-in phase label renders in the expanded card (proves dates threading)", () => {
    const q = render(<Step3SheetCard row={row()} wizardSessionId={WSID} />);
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    const el = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`);
    expect(
      el.querySelector(`[data-testid="wizard-step3-card-${DFID}-sched-phase-2025-10-18"]`)
        ?.textContent,
    ).toBe("Travel In");
  });
});

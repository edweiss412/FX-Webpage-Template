// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3SheetCardActiveGlyph.test.tsx
 * (wizard-warning-ignore-controls spec §2.4 choke point 1 — Task 10)
 *
 * The card's data-gap glyph is the ONE row-level consumer that sits outside the
 * `gapWarnings` accessor: it called `summarizeDataGaps` on a raw array. So the helper
 * tests in step3Buckets.test.ts cannot see whether this call site actually switched —
 * they would pass with the glyph still counting dismissed warnings, and the card would
 * keep showing "2" over a panel listing one.
 *
 * This mounts the real card and reads the rendered count.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import type { ParseResult, ParseWarning, ShowRow } from "@/lib/parser/types";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => cleanup());

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

/** A real gap-class code, so `summarizeDataGaps` actually counts these. */
const GAP_CODE = "FIELD_UNREADABLE";
const gapWarning = (snippet: string): ParseWarning => ({
  severity: "warn",
  code: GAP_CODE,
  message: GAP_CODE,
  rawSnippet: snippet,
});

function show(): ShowRow {
  return {
    title: "Asset Mgmt Summit",
    client_label: "Acme Capital",
    client_contact: null,
    template_version: "v4",
    venue: null,
    dates: { travelIn: null, set: null, showDays: ["2026-04-10"], travelOut: null },
    schedule_phases: {},
    event_details: {},
    agenda_links: [],
    coi_status: null,
    po: null,
    proposal: null,
    invoice: null,
    invoice_notes: null,
  };
}

function parseResult(warnings: ParseWarning[]): ParseResult {
  return {
    show: show(),
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    raw_unrecognized: [],
    warnings,
    hardErrors: [],
  } as unknown as ParseResult;
}

function cardRow(pr: ParseResult, overrides: Partial<Step3Row> = {}): Step3Row {
  return {
    driveFileId: DFID,
    driveFileName: "asset-mgmt-summit.sheet",
    status: "staged",
    parseResult: pr,
    ...overrides,
  };
}

/** The rendered gap count, read off the glyph chip itself. */
function renderedGapCount(q: ReturnType<typeof render>): number {
  const badge = q.getByTestId(`shows-data-quality-${DFID}`);
  const chip = within(badge).getByTestId("dq-chip-gap");
  return Number(chip.textContent?.trim());
}

describe("Step3SheetCard data-gap glyph reads the ACTIVE partition (§2.4)", () => {
  const WARNINGS = [gapWarning("Hotel notes | double"), gapWarning("Parking | validated")];

  test("with no model the glyph counts every gap warning (unchanged behaviour)", () => {
    const pr = parseResult(WARNINGS);
    const q = render(<Step3SheetCard row={cardRow(pr)} wizardSessionId={WSID} />);
    // Expected derived from the fixture, not hardcoded.
    expect(renderedGapCount(q)).toBe(WARNINGS.length);
  });

  test("with one warning ignored the glyph drops to the active count", () => {
    const pr = parseResult(WARNINGS);
    const q = render(
      <Step3SheetCard
        row={cardRow(pr, {
          warningModel: {
            active: [{ index: 1, reportSurfaceId: "sid-1" }],
            ignored: [{ index: 0, reportSurfaceId: "sid-0" }],
          },
        })}
        wizardSessionId={WSID}
      />,
    );
    expect(renderedGapCount(q)).toBe(WARNINGS.length - 1);
  });

  test("with every warning ignored the gap chip does not render at all", () => {
    const pr = parseResult(WARNINGS);
    const q = render(
      <Step3SheetCard
        row={cardRow(pr, {
          warningModel: {
            active: [],
            ignored: [
              { index: 0, reportSurfaceId: "sid-0" },
              { index: 1, reportSurfaceId: "sid-1" },
            ],
          },
        })}
        wizardSessionId={WSID}
      />,
    );
    const badge = q.queryByTestId(`shows-data-quality-${DFID}`);
    expect(badge ? within(badge).queryByTestId("dq-chip-gap") : null).toBeNull();
  });
});

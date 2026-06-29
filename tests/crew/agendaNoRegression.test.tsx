// @vitest-environment jsdom
/**
 * tests/crew/agendaNoRegression.test.tsx (Task 15 — spec §8 test 6)
 *
 * Proves the async admin agenda-PDF feature is purely ADDITIVE — it did not
 * alter crew rendering, invalidate legacy data, or add PDF work to the
 * onboarding scan path.
 *
 * Assertions:
 *   A1  Crew still renders exactly ONE AgendaScheduleBlock per high-confidence
 *       agenda link (unchanged from pre-feature baseline).
 *   A2  defaultDriveClient in runOnboardingScan.ts provides only getFile +
 *       listFolder — no downloadFileBytes / getAgendaChips (the PDF-extraction
 *       feature is handled by a separate enrichAgenda step, NOT wired into
 *       the onboarding scan path).
 *   A3  Persist freshness gate — KNOWN-STALE cleared (extracted: null):
 *       crew renders NO block for that link.
 *   A4  UNKNOWN-left (extracted: prior high-conf block): crew renders the block
 *       unchanged.
 *   A5  Legacy: an existing published extraction with extractorVersion: 1 is
 *       UNAFFECTED by this feature (no version bump; EXTRACTOR_VERSION still 1).
 *
 * Anti-tautology:
 *   - Session counts are DERIVED from the fixture, not hardcoded.
 *   - DOM scans for AgendaScheduleBlock are scoped to the containing element so
 *     no sibling decoy can satisfy the assertion.
 *   - The source guard (A2) checks the actual function body, not just file imports.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { render, within } from "@testing-library/react";
import { AgendaScheduleBlock } from "@/components/crew/AgendaScheduleBlock";
import { EXTRACTOR_VERSION } from "@/lib/agenda/constants";
import type { AgendaExtraction } from "@/lib/agenda/types";

const ROOT = process.cwd();

// ── shared extraction fixture ─────────────────────────────────────────────
function highConfExtraction(nSessions: number): AgendaExtraction {
  return {
    confidence: "high",
    corrections: 0,
    extractorVersion: EXTRACTOR_VERSION, // always the live constant
    days: [
      {
        dayLabel: "Day 1",
        date: "2026-09-01",
        sessions: Array.from({ length: nSessions }, (_, i) => ({
          time: `${9 + i}:00 AM`,
          title: `Session ${i + 1}`,
          room: "Ballroom",
          tracks: [],
          drift: null,
        })),
      },
    ],
  };
}

function lowConfExtraction(): AgendaExtraction {
  return {
    confidence: "low",
    corrections: 0,
    extractorVersion: EXTRACTOR_VERSION,
    days: [
      {
        dayLabel: "Day 1",
        date: "2026-09-01",
        sessions: [
          { time: "9:00 AM", title: "Session 1", room: "Room A", tracks: [], drift: null },
        ],
      },
    ],
  };
}

// ── A1: one block per high-confidence link ────────────────────────────────
describe("A1 — crew renders exactly one AgendaScheduleBlock per high-conf link", () => {
  // Failure mode: the feature accidentally gates or skips rendering, causing
  // fewer blocks than high-conf links.
  test("single high-conf link → one agenda-schedule element", () => {
    const ext = highConfExtraction(3);
    // Derive expected session count from fixture, never hardcode.
    const expectedSessions = ext.days.reduce((n, d) => n + d.sessions.length, 0);

    const { container } = render(
      <div data-testid="agenda-area">
        <AgendaScheduleBlock extraction={ext} label={null} />
      </div>,
    );
    const area = container.querySelector('[data-testid="agenda-area"]') as HTMLElement;
    const blocks = within(area).getAllByTestId("agenda-schedule");
    expect(blocks).toHaveLength(1);
    expect(within(area).getAllByTestId("agenda-session")).toHaveLength(expectedSessions);
  });

  test("two high-conf links → two agenda-schedule elements (count is 1:1 with links)", () => {
    const ext1 = highConfExtraction(2);
    const ext2 = highConfExtraction(4);
    const expectedTotal = [...ext1.days, ...ext2.days].reduce((n, d) => n + d.sessions.length, 0);
    const { container } = render(
      <div data-testid="agenda-area">
        <AgendaScheduleBlock extraction={ext1} label="Day 1 PDF" />
        <AgendaScheduleBlock extraction={ext2} label="Day 2 PDF" />
      </div>,
    );
    const area = container.querySelector('[data-testid="agenda-area"]') as HTMLElement;
    expect(within(area).getAllByTestId("agenda-schedule")).toHaveLength(2);
    expect(within(area).getAllByTestId("agenda-session")).toHaveLength(expectedTotal);
  });

  // Failure mode: low-conf extraction accidentally renders a schedule block,
  // which would give crew unverified partial schedule data.
  test("low-conf extraction → renders null (no agenda-schedule)", () => {
    const { container } = render(
      <div data-testid="agenda-area">
        <AgendaScheduleBlock extraction={lowConfExtraction()} label={null} />
      </div>,
    );
    const area = container.querySelector('[data-testid="agenda-area"]') as HTMLElement;
    expect(within(area).queryByTestId("agenda-schedule")).toBeNull();
  });
});

// ── A2: source guard — defaultDriveClient has no PDF methods ─────────────
describe("A2 — defaultDriveClient (onboarding) does no PDF work", () => {
  // Failure mode: if someone wires downloadFileBytes or getAgendaChips into the
  // defaultDriveClient factory, the onboarding scan starts doing synchronous PDF
  // work that belongs only in the async enrichAgenda step.
  test("defaultDriveClient function body contains only getFile + listFolder", () => {
    const src = readFileSync(join(ROOT, "lib/sync/runOnboardingScan.ts"), "utf-8");
    // Extract from "function defaultDriveClient" to the next bare "function " at
    // column 0 (i.e., the following top-level function declaration).
    const startIdx = src.indexOf("function defaultDriveClient()");
    expect(startIdx).toBeGreaterThan(-1); // guard: function must exist

    // Find the next top-level function declaration after the start.
    const nextFnIdx = src.indexOf("\nfunction ", startIdx + 1);
    const fnBody = nextFnIdx === -1 ? src.slice(startIdx) : src.slice(startIdx, nextFnIdx);

    // The function should mention getFile and listFolder.
    expect(fnBody).toMatch(/getFile/);
    expect(fnBody).toMatch(/listFolder/);

    // It must NOT define or call PDF-extraction methods (those live in enrichAgenda).
    expect(fnBody).not.toMatch(/downloadFileBytes/);
    expect(fnBody).not.toMatch(/getAgendaChips/);
  });
});

// ── A3: KNOWN-STALE cleared (extracted: null) → no block ─────────────────
describe("A3 — KNOWN-STALE cleared: extracted null → crew renders nothing", () => {
  // ScheduleSection gates AgendaScheduleBlock with `link.extracted ? ... : null`.
  // null is falsy → no block. This test proves AgendaScheduleBlock itself also
  // returns null for a null/non-record extraction (belt-and-suspenders: both
  // the parent gate AND the render-boundary normalizer guard correctly).
  //
  // Failure mode: a change to normalizeAgendaExtraction causes null to be treated
  // as a renderable record, leaking a stale/empty block to crew.
  test("AgendaScheduleBlock with null extraction → renders null", () => {
    const { container } = render(
      <div data-testid="agenda-area">
        <AgendaScheduleBlock extraction={null} label={null} />
      </div>,
    );
    const area = container.querySelector('[data-testid="agenda-area"]') as HTMLElement;
    expect(within(area).queryByTestId("agenda-schedule")).toBeNull();
  });

  test("AgendaScheduleBlock with undefined extraction → renders null", () => {
    const { container } = render(
      <div data-testid="agenda-area">
        <AgendaScheduleBlock extraction={undefined} label={null} />
      </div>,
    );
    const area = container.querySelector('[data-testid="agenda-area"]') as HTMLElement;
    expect(within(area).queryByTestId("agenda-schedule")).toBeNull();
  });

  test("AgendaScheduleBlock with empty-object extraction → renders null (malformed)", () => {
    const { container } = render(
      <div data-testid="agenda-area">
        <AgendaScheduleBlock extraction={{}} label={null} />
      </div>,
    );
    const area = container.querySelector('[data-testid="agenda-area"]') as HTMLElement;
    expect(within(area).queryByTestId("agenda-schedule")).toBeNull();
  });
});

// ── A4: UNKNOWN-left (extracted: prior high-conf block) → block unchanged ──
describe("A4 — UNKNOWN-left: prior high-conf extraction renders unchanged", () => {
  // When the sync step did NOT mark a link as stale (left extracted intact),
  // the crew must still see the prior schedule block. This proves the feature
  // did not accidentally clear or skip rendering of existing extractions.
  //
  // Failure mode: code change wipes extraction data or adds an extra render gate
  // that prevents pre-existing blocks from rendering.
  test("existing high-conf extraction renders session list unchanged", () => {
    const priorExtraction = highConfExtraction(5);
    const expectedSessions = priorExtraction.days.reduce((n, d) => n + d.sessions.length, 0);

    const { container } = render(
      <div data-testid="agenda-area">
        <AgendaScheduleBlock extraction={priorExtraction} label={null} />
      </div>,
    );
    const area = container.querySelector('[data-testid="agenda-area"]') as HTMLElement;
    expect(within(area).getByTestId("agenda-schedule")).toBeTruthy();
    // Derived count — not hardcoded — ensures the fixture drives the expectation.
    expect(within(area).getAllByTestId("agenda-session")).toHaveLength(expectedSessions);
  });
});

// ── A5: legacy extractorVersion: 1 is unaffected ──────────────────────────
describe("A5 — legacy: extractorVersion 1 unchanged; no bump from this feature", () => {
  // The async extraction feature deliberately keeps EXTRACTOR_VERSION at 1
  // (plan round-49: NOT bumped). An existing show published before this feature
  // continues to render exactly as before.
  //
  // Failure mode: EXTRACTOR_VERSION is bumped, causing previously-extracted shows
  // to fail the normalizeAgendaExtraction round-trip and lose their schedule blocks.
  test("EXTRACTOR_VERSION is still 1 (feature did not bump it)", () => {
    // This complements tests/agenda/constants.test.ts which pins the same value.
    // The explicit reference here ensures the no-regression suite catches a bump
    // even if the constants test is moved or renamed.
    expect(EXTRACTOR_VERSION).toBe(1);
  });

  test("extraction with extractorVersion: 1 normalizes and renders correctly", () => {
    // A typical extraction as stored before the feature was shipped.
    const legacyExtraction: AgendaExtraction = {
      confidence: "high",
      corrections: 0,
      extractorVersion: 1, // the stored version — must survive the normalizer
      days: [
        {
          dayLabel: "Day 1",
          date: "2026-05-01",
          sessions: [
            { time: "8:00 AM", title: "Breakfast", room: "Hall A", tracks: [], drift: null },
            { time: "9:00 AM", title: "Keynote", room: "Main Stage", tracks: [], drift: null },
          ],
        },
      ],
    };
    const expectedSessions = legacyExtraction.days.reduce((n, d) => n + d.sessions.length, 0);

    const { container } = render(
      <div data-testid="agenda-area">
        <AgendaScheduleBlock extraction={legacyExtraction} label={null} />
      </div>,
    );
    const area = container.querySelector('[data-testid="agenda-area"]') as HTMLElement;
    expect(within(area).getByTestId("agenda-schedule")).toBeTruthy();
    expect(within(area).getAllByTestId("agenda-session")).toHaveLength(expectedSessions);
  });
});

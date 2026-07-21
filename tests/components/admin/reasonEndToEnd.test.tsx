// @vitest-environment jsdom
// The ratified persist -> read -> derive -> render(DOM) contract
// (attention-alert-routing §3.1, plan Task 2.8). One fixture spans the whole
// chain: the REAL producer seam builds the context, derivation + bucketing carry
// it, and WarningsBreakdown renders the composed reason to the DOM. The DB read
// layer is a verbatim context pass-through (fetchPerShowAlerts.ts:100 selects
// context whole), so the persisted shape IS the derived shape.
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildParseErrorContext } from "@/lib/sync/parseErrorContext";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";
import { bucketAttention } from "@/lib/admin/sectionAttention";
import {
  WarningsBreakdown,
  Step3SectionChromeContext,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

function renderChain(failureCode: string | null, warnings: ParseWarning[]) {
  // 1. persist: the real seam builds exactly what the RPC stores.
  const context = buildParseErrorContext({ driveFileId: "f", sheetName: "S", failureCode });
  // 2. read (verbatim) -> derive.
  const row: AttentionAlertInput = {
    id: "p1",
    code: "PARSE_ERROR_LAST_GOOD",
    context,
    raised_at: "2026-07-20T00:00:00Z",
    occurrence_count: 1,
    identityText: null,
    messageParams: {},
    crewName: null,
  };
  const items = deriveAttentionItems({ alerts: [row], feed: null, slug: "s" });
  // 3. bucket into the warnings notes channel.
  const map = bucketAttention(items, {
    renderCard: () => null,
    sectionAvailable: () => true,
    anchorAvailable: () => false,
  });
  const parseNotes = map.get("warnings")?.notes;
  // 4. render to DOM.
  const chrome = {
    Icon: (() => null) as never,
    label: "Warnings",
    flagged: false,
    sectionId: "warnings" as const,
    dfid: "d1",
    parseNotes,
  } as unknown as Step3SectionChrome;
  return render(
    <Step3SectionChromeContext.Provider value={chrome}>
      <WarningsBreakdown dfid="d1" warnings={warnings} mode="resync" />
    </Step3SectionChromeContext.Provider>,
  );
}

const warning = (code: string): ParseWarning =>
  ({ code, severity: "warn", message: `w ${code}` }) as ParseWarning;

describe("persist-shape -> derive -> rendered DOM (reason integration)", () => {
  it("an allowlisted failure reaches the banner DOM as its resolved reason", () => {
    renderChain("MI-4_NO_CREW", [warning("UNKNOWN_FIELD")]);
    const p = screen.getByTestId("parse-attention-note-PARSE_ERROR_LAST_GOOD");
    expect(p.textContent).toContain("No crew rows.");
  });
  it("PARSE_HARD_FAIL (dropped at the seam) renders no reason sentence (state 4)", () => {
    renderChain("PARSE_HARD_FAIL", []);
    const p = screen.getByTestId("parse-attention-note-PARSE_ERROR_LAST_GOOD");
    // No reason clause, and no 'below' clause on an empty list.
    expect(p.textContent).toBe(
      "Crew are still seeing the last good version. Your latest changes didn't go through.",
    );
  });
});

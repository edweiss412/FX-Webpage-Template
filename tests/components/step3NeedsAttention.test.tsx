// @vitest-environment jsdom
/**
 * tests/components/step3NeedsAttention.test.tsx (Task D4 — spec §4.1 / §7.7 / AC11)
 *
 * Step 3's "Needs your attention" group: a distinct grouped section below the
 * clean publish cards that gives every BLOCKING row an in-wizard exit (AC11):
 *   - hard_failed  → Retry (POST .../retry) + Ignore this sheet
 *                    (POST .../permanent_ignore — the C1 live-partition writer);
 *                    the cataloged reason renders via resolveIngestionCopy /
 *                    messageFor (NO raw §12.4 code leaks).
 *   - live_row_conflict → the cataloged LIVE_ROW_CONFLICT copy (via messageFor,
 *                    NO raw code) + a dashboard link ("Resolve in the dashboard,
 *                    then re-run setup"); NO in-wizard Ignore button (deferred).
 *   - The group is HIDDEN when there are no blocking rows.
 *
 * Anti-tautology: the Retry / Ignore POST URLs are derived from the fixture's
 * driveFileId + pendingIngestionId, not hardcoded literals; the rendered reason
 * is asserted against the catalog source (MESSAGE_CATALOG), and a separate
 * assertion proves the bare §12.4 code string never reaches the DOM.
 *
 * jsdom — render + interaction only; the durable live-partition write contract
 * is the route test (Task C1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { resolveIngestionCopy } from "@/lib/admin/needsAttention";
import { WIZARD_HARD_FAIL_GENERIC } from "@/components/admin/wizard/Step3Review";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/admin/onboarding",
}));

import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult } from "@/lib/parser/types";

const WSID = "11111111-2222-4333-8444-555555555555";

function hardFailedRow(dfid: string, pendingId: string, code: string): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "hard_failed",
    pendingIngestionId: pendingId,
    errorCode: code,
  };
}

function liveConflictRow(dfid: string): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "live_row_conflict",
  };
}

function cleanStagedRow(dfid: string): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "staged",
    parseResult: { show: { title: `Show ${dfid}` } } as unknown as ParseResult,
  };
}

function okFetch() {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Step 3 "Needs your attention" group (Task D4)', () => {
  it("renders the group as a distinct section when a blocking row is present", () => {
    const { getByTestId } = render(
      <Step3Review
        wizardSessionId={WSID}
        rows={[cleanStagedRow("df-clean"), hardFailedRow("df-hf", "ing-1", "PARSE_HARD_FAIL")]}
      />,
    );
    const group = getByTestId("wizard-step3-needs-attention");
    expect(group).toBeTruthy();
    // The blocking row lives INSIDE the group (not interleaved with clean cards).
    expect(within(group).getByTestId("wizard-step3-row-df-hf")).toBeTruthy();
  });

  it("hides the group entirely when there are no blocking rows", () => {
    const { queryByTestId } = render(
      <Step3Review
        wizardSessionId={WSID}
        rows={[cleanStagedRow("df-a"), cleanStagedRow("df-b")]}
      />,
    );
    expect(queryByTestId("wizard-step3-needs-attention")).toBeNull();
  });

  it("hard_failed: Retry posts the retry URL; Ignore posts the permanent_ignore URL", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const dfid = "df-hf-actions";
    const pendingId = "ingestion-77";
    const { getByTestId } = render(
      <Step3Review
        wizardSessionId={WSID}
        rows={[hardFailedRow(dfid, pendingId, "PARSE_HARD_FAIL")]}
      />,
    );

    fireEvent.click(getByTestId(`wizard-step3-retry-${dfid}`));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/admin/onboarding/pending_ingestions/${pendingId}/retry`,
    );
    expect((fetchMock.mock.calls[0]![1] as RequestInit | undefined)?.method).toBe("POST");
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    fetchMock.mockClear();
    refresh.mockClear();
    fireEvent.click(getByTestId(`wizard-step3-ignore-${dfid}`));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/admin/onboarding/pending_ingestions/${pendingId}/permanent_ignore`,
    );
    expect((fetchMock.mock.calls[0]![1] as RequestInit | undefined)?.method).toBe("POST");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("hard_failed: renders the resolver reason via the shared catalog path and never leaks the raw §12.4 code", () => {
    // The reason is produced by the SAME resolver the needs-attention inbox +
    // emails use (resolveIngestionCopy → messageFor); assert the rendered copy
    // equals that resolver's output (the data source, not the container), and
    // that the bare §12.4 code never reaches the DOM (invariant 5).
    const code = "STAGED_PARSE_RESULT_CORRUPT"; // real catalog code, non-null dougFacing
    const dfid = "df-reason";
    const driveFileName = `${dfid}.gsheet`;
    const expected = resolveIngestionCopy({
      code,
      driveFileName,
      genericFallback: WIZARD_HARD_FAIL_GENERIC,
    });
    // Sanity: the chosen fixture exercises real catalog copy (not the generic
    // fallback), so "no raw code leaks" is a meaningful assertion.
    expect(expected).not.toBe(WIZARD_HARD_FAIL_GENERIC);
    expect(expected.length).toBeGreaterThan(0);

    const { getByTestId, container } = render(
      <Step3Review wizardSessionId={WSID} rows={[hardFailedRow(dfid, "ing-9", code)]} />,
    );
    const row = getByTestId(`wizard-step3-row-${dfid}`);
    expect(row.textContent ?? "").toContain(expected);
    expect(container.textContent ?? "").not.toContain(code);
  });

  it("live_row_conflict: renders the cataloged copy + dashboard link AND the in-wizard Ignore (DS3-1, AC11 'Ignore OR external resolve')", () => {
    const dfid = "df-conflict";
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[liveConflictRow(dfid)]} />,
    );
    const row = getByTestId(`wizard-step3-row-${dfid}`);
    const expected = MESSAGE_CATALOG.LIVE_ROW_CONFLICT.dougFacing!;
    const probe = expected.replace(/[_*]/g, "").slice(0, 30);
    expect(row.textContent ?? "").toContain(probe);
    // A link to the dashboard is the AC11-accepted external-resolve exit.
    const link = within(row).getByTestId(
      `wizard-step3-conflict-dashboard-${dfid}`,
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin");
    // DS3-1: the in-wizard "Permanently ignore" exit now renders ALONGSIDE the
    // dashboard link (AC11 offers both exits for live_row_conflict).
    expect(within(row).getByTestId(`wizard-step3-ignore-${dfid}`)).toBeTruthy();
    // No raw code leaks.
    expect(row.textContent ?? "").not.toContain("LIVE_ROW_CONFLICT");
  });
});

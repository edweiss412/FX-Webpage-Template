// @vitest-environment jsdom
/**
 * tests/components/step3ManifestIgnore.test.tsx (DS3-1 — spec §4.1 / §7.7 / AC11)
 *
 * The in-wizard "Permanently ignore" button on the two no-pendingIngestionId
 * blocking statuses — `live_row_conflict` and `discard_retryable`. Unlike the
 * hard_failed Ignore (which posts the pending_ingestions permanent_ignore route),
 * this posts the NEW manifest-keyed route
 *   POST /api/admin/onboarding/manifest/<wsid>/<driveFileId>/ignore
 * (no pendingIngestionId in scope). On success it router.refresh()es; an error
 * body surfaces Doug-facing copy via the catalog (no raw §12.4 code leaks).
 *
 * Anti-tautology: the POST URL is derived from the fixture's wizardSessionId +
 * driveFileId (never hardcoded literals); the rendered error copy is asserted
 * against the catalog source (MESSAGE_CATALOG via messageFor), and the bare code
 * is proven absent from the DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { messageFor, type MessageCode } from "@/lib/messages/lookup";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/admin/onboarding",
}));

import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";

const WSID = "11111111-2222-4333-8444-555555555555";

function blockingRow(dfid: string, status: "live_row_conflict" | "discard_retryable"): Step3Row {
  return { driveFileId: dfid, driveFileName: `${dfid}.gsheet`, status };
}

function okFetch() {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: "ignored" }), { status: 200 }),
  );
}

function errorFetch(code: string) {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: false, code }), { status: 409 }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DS3-1 — in-wizard Ignore on live_row_conflict / discard_retryable", () => {
  it.each(["live_row_conflict", "discard_retryable"] as const)(
    "renders the manifest Ignore button for %s",
    (status) => {
      const dfid = `df-${status}`;
      const { getByTestId } = render(
        <Step3Review wizardSessionId={WSID} rows={[blockingRow(dfid, status)]} />,
      );
      const group = getByTestId("wizard-step3-needs-attention");
      const button = within(group).getByTestId(`wizard-step3-ignore-${dfid}`);
      expect(button).toBeTruthy();
      expect(button.textContent).toMatch(/Permanently ignore/i);
    },
  );

  it.each(["live_row_conflict", "discard_retryable"] as const)(
    "%s: clicking Ignore POSTs the manifest-keyed URL and refreshes",
    async (status) => {
      const fetchMock = okFetch();
      vi.stubGlobal("fetch", fetchMock);
      const dfid = `df-post-${status}`;
      const { getByTestId } = render(
        <Step3Review wizardSessionId={WSID} rows={[blockingRow(dfid, status)]} />,
      );

      fireEvent.click(getByTestId(`wizard-step3-ignore-${dfid}`));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      // Derived from fixture, not hardcoded.
      expect(fetchMock.mock.calls[0]![0]).toBe(
        `/api/admin/onboarding/manifest/${WSID}/${dfid}/ignore`,
      );
      expect((fetchMock.mock.calls[0]![1] as RequestInit | undefined)?.method).toBe("POST");
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    },
  );

  it("live_row_conflict KEEPS the dashboard-resolve link alongside Ignore (AC11 'Ignore OR external resolve')", () => {
    const dfid = "df-both-exits";
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[blockingRow(dfid, "live_row_conflict")]} />,
    );
    expect(getByTestId(`wizard-step3-ignore-${dfid}`)).toBeTruthy();
    expect(getByTestId(`wizard-step3-conflict-dashboard-${dfid}`)).toBeTruthy();
  });

  it("error body surfaces Doug-facing catalog copy and never leaks the raw §12.4 code", async () => {
    const code: MessageCode = "WIZARD_SESSION_SUPERSEDED";
    // Sanity: the catalog row has non-null dougFacing so the assertion is meaningful.
    const dougFacing = messageFor(code).dougFacing;
    expect(dougFacing && dougFacing.length).toBeTruthy();
    expect(code in MESSAGE_CATALOG).toBe(true);

    const fetchMock = errorFetch(code);
    vi.stubGlobal("fetch", fetchMock);
    const dfid = "df-err";
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[blockingRow(dfid, "live_row_conflict")]} />,
    );

    fireEvent.click(getByTestId(`wizard-step3-ignore-${dfid}`));
    const errorBox = await waitFor(() => getByTestId(`wizard-step3-error-${dfid}`));
    expect(errorBox.textContent ?? "").toContain(dougFacing as string);
    // The bare §12.4 code must not reach the DOM (invariant 5).
    expect(errorBox.textContent ?? "").not.toContain(code);
  });
});

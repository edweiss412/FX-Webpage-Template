// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3ReportIssueSection.test.tsx (Task 7 —
 * follow-ups spec §D3, §D3a, §K4)
 *
 * Pins the report-an-issue section body: the §D3 payload shape (asserted
 * against the mocked fetch BODY, never the DOM), the §D3a active-section
 * plumbing (viewerVisibleSection follows a pre-submit active change — a
 * hardcoded value must fail), idempotency-key persistence/rotation, and the
 * copy-only status line (invariant 5: never a raw code, never empty).
 *
 * Anti-tautology: every expected copy string is DERIVED from the live catalog
 * via messageFor (with the §D3 non-empty-after-trim rule applied), payload
 * expectations derive from the fixture row / constants, and the parseWarnings
 * cap fixture is sized from REPORT_PARSE_WARNINGS_CAP itself.
 */
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MessageSquareWarning } from "lucide-react";
import type { ParseWarning } from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";

// Step3ReviewModal (full-modal integration case) mounts RescanSheetButton,
// which calls useRouter().refresh().
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import {
  REPORT_GENERIC_ERROR_COPY,
  REPORT_MESSAGE_MAX_CHARS,
  REPORT_PARSE_WARNINGS_CAP,
  ReportIssueSection,
  Step3SectionChromeContext,
  type SectionData,
} from "@/components/admin/wizard/step3ReviewSections";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import { messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";
const STORAGE_KEY = `fxav-report-attempt-wizard-${WSID}-${DFID}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUCCESS_COPY = "Sent — thanks. The developer will take a look.";

/** The §D3 resolution rule, applied to a cataloged code — expectations DERIVE
 *  from the live catalog import, never restate copy. */
function expectedErrorCopy(code: MessageCode): string {
  const copy = messageFor(code).dougFacing;
  return copy != null && copy.trim().length > 0 ? copy : REPORT_GENERIC_ERROR_COPY;
}

function sectionData(
  rowOverrides: Partial<Step3Row> = {},
  dataOverrides: Partial<SectionData> = {},
): SectionData {
  const pr = buildParseResult();
  const row = stagedRow(pr, rowOverrides);
  return {
    pr,
    row,
    dfid: DFID,
    wizardSessionId: WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    ...dataOverrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubFetch(...responses: Array<ReturnType<typeof jsonResponse>>) {
  const fetchMock = vi.fn();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  // Default (extra calls): created success.
  fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, status: "created" }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function ttid(name: string): string {
  return `wizard-step3-card-${DFID}-report-${name}`;
}

/** Follow-ups-b2 §D (T-D2): the form is collapsed behind the disclosure
 *  trigger, so every test querying textarea/submit/status expands first.
 *  Disclosure semantics themselves are pinned in step3ReviewSections.test.tsx
 *  (T-D1/T-D3) — here the expand is purely mechanical setup. */
function expandReport(q: ReturnType<typeof render>) {
  fireEvent.click(q.getByTestId(ttid("toggle")));
}

/** Render the section inside the modal chrome provider (the production mount),
 *  expanded (§D T-D2) so the pre-existing form assertions keep their teeth. */
function renderInChrome(d: SectionData, getActiveSection: () => SectionId) {
  const q = render(
    <Step3SectionChromeContext.Provider
      value={{
        Icon: MessageSquareWarning,
        label: "Report an issue",
        flagged: false,
        getActiveSection,
      }}
    >
      <ReportIssueSection data={d} />
    </Step3SectionChromeContext.Provider>,
  );
  expandReport(q);
  return q;
}

function fillAndSubmit(q: ReturnType<typeof render>, text = "Something broke") {
  fireEvent.change(q.getByTestId(ttid("textarea")), { target: { value: text } });
  fireEvent.click(q.getByTestId(ttid("submit")));
}

function postedBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]![1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── §D3 payload shape (asserted against the fetch BODY) ─────────────────────

describe("ReportIssueSection — §D3 payload shape", () => {
  test("submit posts EXACTLY the §D3 payload to /api/report — catches any field drift, an untrimmed message, and an uncapped parseWarnings list", async () => {
    // 55-warning fixture proving the 50 cap — sized FROM the constant.
    const manyWarnings: ParseWarning[] = Array.from(
      { length: REPORT_PARSE_WARNINGS_CAP + 5 },
      (_, i) => ({ severity: "warn", code: `W_${i}`, message: `m${i}` }),
    );
    const d = sectionData({ stagedShowTitle: "Staged Title" }, { warnings: manyWarnings });
    const fetchMock = stubFetch();
    const q = renderInChrome(d, () => "venue");
    fillAndSubmit(q, "  Something broke  "); // message must arrive trimmed
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/report");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");

    const body = postedBody(fetchMock);
    expect(body).toEqual({
      surface: "admin",
      show_id: null,
      showTitle: d.row.stagedShowTitle,
      showSlug: null,
      idempotency_key: expect.stringMatching(UUID_RE),
      message: "Something broke",
      reporterUrl: window.location.href,
      viewerVisibleSection: "venue",
      userAgent: navigator.userAgent,
      parseWarnings: JSON.parse(
        JSON.stringify(d.warnings.slice(0, REPORT_PARSE_WARNINGS_CAP)),
      ) as unknown[],
      fieldRef: {
        kind: "wizard-step3",
        driveFileId: d.dfid,
        wizardSessionId: d.wizardSessionId,
        driveFileName: d.row.driveFileName ?? null,
        stagedShowTitle: d.row.stagedShowTitle ?? null,
      },
    });
    // Cap sanity: the fixture actually exceeds the cap, so slice() is proven.
    expect(d.warnings.length).toBeGreaterThan(REPORT_PARSE_WARNINGS_CAP);
    expect((body.parseWarnings as unknown[]).length).toBe(REPORT_PARSE_WARNINGS_CAP);
  });

  test("showTitle falls back to row.driveFileName when stagedShowTitle is absent — catches a dropped ?? fallback", async () => {
    const d = sectionData(); // fixture row has driveFileName, no stagedShowTitle
    expect(d.row.stagedShowTitle).toBeUndefined(); // fixture sanity
    expect(d.row.driveFileName).toBeTruthy();
    const fetchMock = stubFetch();
    const q = renderInChrome(d, () => "venue");
    fillAndSubmit(q);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = postedBody(fetchMock);
    expect(body.showTitle).toBe(d.row.driveFileName);
    expect((body.fieldRef as Record<string, unknown>).stagedShowTitle).toBeNull();
  });

  test("showTitle is null when BOTH stagedShowTitle and driveFileName are absent — catches undefined leaking into JSON", async () => {
    const d = sectionData({ driveFileName: null });
    const fetchMock = stubFetch();
    const q = renderInChrome(d, () => "venue");
    fillAndSubmit(q);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = postedBody(fetchMock);
    expect(body.showTitle).toBeNull();
    expect((body.fieldRef as Record<string, unknown>).driveFileName).toBeNull();
  });
});

// ── §D3a active-section plumbing ─────────────────────────────────────────────

describe("ReportIssueSection — viewerVisibleSection (spec §D3a)", () => {
  test("provider-level: the posted value follows the mock's CURRENT return at submit time — a hardcoded or mount-time-captured value fails", async () => {
    let activeId: SectionId = "venue";
    const d = sectionData();
    const fetchMock = stubFetch();
    const q = renderInChrome(d, () => activeId);
    fillAndSubmit(q);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedBody(fetchMock, 0).viewerVisibleSection).toBe("venue");
    // Swap the active section, submit again (draft cleared on success — refill).
    activeId = "hotels";
    fillAndSubmit(q, "second issue");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(postedBody(fetchMock, 1).viewerVisibleSection).toBe("hotels");
  });

  test("full modal: clicking the crew rail item pre-submit makes the posted viewerVisibleSection 'crew' — a hardcoded 'report' MUST fail", async () => {
    const d = sectionData();
    const fetchMock = stubFetch();
    const q = render(
      <Step3ReviewModal
        data={d}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );
    // handleNavClick sets shared `active` BEFORE the jsdom scrollTo guard.
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-review-rail-item-crew`));
    expandReport(q); // §D T-D2 — the modal mounts the section collapsed
    fireEvent.change(q.getByTestId(ttid("textarea")), { target: { value: "modal report" } });
    fireEvent.click(q.getByTestId(ttid("submit")));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedBody(fetchMock).viewerVisibleSection).toBe("crew");
  });

  test("outside the chrome context the payload OMITS viewerVisibleSection (exactOptional discipline — not null, not undefined, ABSENT)", async () => {
    const d = sectionData();
    const fetchMock = stubFetch();
    const q = render(<ReportIssueSection data={d} />);
    expandReport(q); // §D T-D2 — collapsed by default outside the chrome too
    fillAndSubmit(q);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedBody(fetchMock)).not.toHaveProperty("viewerVisibleSection");
  });
});

// ── Idempotency key lifecycle ────────────────────────────────────────────────

describe("ReportIssueSection — idempotency key persistence/rotation (spec §D3)", () => {
  test("failed → retry reuses the SAME key (catches: key churn making duplicates unlinkable); 500-no-code renders REPORT_PIPELINE_FAILED copy", async () => {
    const fetchMock = stubFetch(jsonResponse(500, { ok: false }), jsonResponse(500, { ok: false }));
    const q = renderInChrome(sectionData(), () => "venue");
    fillAndSubmit(q);
    await waitFor(() =>
      expect(q.getByTestId(ttid("status")).textContent).toBe(
        expectedErrorCopy("REPORT_PIPELINE_FAILED"),
      ),
    );
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    expect(stored).toMatch(UUID_RE); // key persisted across the failure
    // Draft is NOT cleared on error — retry without refilling.
    fireEvent.click(q.getByTestId(ttid("submit")));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const key1 = postedBody(fetchMock, 0).idempotency_key;
    const key2 = postedBody(fetchMock, 1).idempotency_key;
    expect(key1).toBe(stored);
    expect(key2).toBe(key1);
  });

  test("201 created → success copy, draft cleared, key REMOVED; the next attempt mints a DIFFERENT key (catches: stale-key reuse across distinct reports)", async () => {
    const fetchMock = stubFetch();
    const q = renderInChrome(sectionData(), () => "venue");
    fillAndSubmit(q);
    await waitFor(() => expect(q.getByTestId(ttid("status")).textContent).toBe(SUCCESS_COPY));
    const textarea = q.getByTestId(ttid("textarea")) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    fillAndSubmit(q, "a different issue");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(postedBody(fetchMock, 1).idempotency_key).not.toBe(
      postedBody(fetchMock, 0).idempotency_key,
    );
  });

  test("200 duplicate/recovered counts as success: same copy, same rotation", async () => {
    stubFetch(jsonResponse(200, { ok: true, status: "duplicate" }));
    const q = renderInChrome(sectionData(), () => "venue");
    fillAndSubmit(q);
    await waitFor(() => expect(q.getByTestId(ttid("status")).textContent).toBe(SUCCESS_COPY));
    expect((q.getByTestId(ttid("textarea")) as HTMLTextAreaElement).value).toBe("");
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("410 REPORT_HORIZON_EXPIRED is terminal: the persisted key is REUSED for the attempt, then rotated; status shows the code's dougFacing copy", async () => {
    // Pre-seed the attempt key: proves the reuse path AND the rotation.
    window.sessionStorage.setItem(STORAGE_KEY, "11111111-2222-4333-8444-555555555555");
    const fetchMock = stubFetch(jsonResponse(410, { ok: false, code: "REPORT_HORIZON_EXPIRED" }));
    const q = renderInChrome(sectionData(), () => "venue");
    fillAndSubmit(q);
    await waitFor(() =>
      expect(q.getByTestId(ttid("status")).textContent).toBe(
        expectedErrorCopy("REPORT_HORIZON_EXPIRED"),
      ),
    );
    expect(postedBody(fetchMock).idempotency_key).toBe("11111111-2222-4333-8444-555555555555");
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull(); // rotated
  });
});

// ── Status copy resolution (invariant 5: copy, never codes, never empty) ────

describe("ReportIssueSection — status copy (spec §D3, invariant 5)", () => {
  test("429 renders REPORT_RATE_LIMITED_ADMIN dougFacing copy and NEVER the literal code (raw-code leak); non-terminal → key kept", async () => {
    stubFetch(jsonResponse(429, { ok: false, code: "REPORT_RATE_LIMITED_ADMIN" }));
    const q = renderInChrome(sectionData(), () => "venue");
    fillAndSubmit(q);
    const copy = messageFor("REPORT_RATE_LIMITED_ADMIN").dougFacing;
    expect(copy).toBeTruthy(); // catalog sanity — this code HAS Doug-facing copy
    await waitFor(() => expect(q.getByTestId(ttid("status")).textContent).toBe(copy));
    expect(q.getByTestId(ttid("status")).textContent).not.toContain("REPORT_RATE_LIMITED_ADMIN");
    // 429 is not terminal — the key persists for the retry.
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toMatch(UUID_RE);
  });

  test("coded response whose catalog dougFacing is null (ADMIN_SESSION_LOOKUP_FAILED) → the exported generic fallback, never an empty status (empty-status leak)", async () => {
    expect(messageFor("ADMIN_SESSION_LOOKUP_FAILED").dougFacing).toBeNull(); // catalog sanity
    stubFetch(jsonResponse(500, { ok: false, code: "ADMIN_SESSION_LOOKUP_FAILED" }));
    const q = renderInChrome(sectionData(), () => "venue");
    fillAndSubmit(q);
    await waitFor(() =>
      expect(q.getByTestId(ttid("status")).textContent).toBe(REPORT_GENERIC_ERROR_COPY),
    );
    expect(q.getByTestId(ttid("status")).textContent!.trim().length).toBeGreaterThan(0);
  });

  test("network throw resolves through the same rule as NETWORK_UNREACHABLE (catches: unhandled rejection / raw error text)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const q = renderInChrome(sectionData(), () => "venue");
    fillAndSubmit(q);
    await waitFor(() =>
      expect(q.getByTestId(ttid("status")).textContent).toBe(
        expectedErrorCopy("NETWORK_UNREACHABLE"),
      ),
    );
  });
});

// ── Form mechanics (§D3 disabled states + a11y) ─────────────────────────────

describe("ReportIssueSection — form mechanics (spec §D3)", () => {
  test("submit is disabled while the draft is empty-after-trim; a whitespace draft never posts", async () => {
    const fetchMock = stubFetch();
    const q = renderInChrome(sectionData(), () => "venue");
    const submit = q.getByTestId(ttid("submit")) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // empty draft
    fireEvent.change(q.getByTestId(ttid("textarea")), { target: { value: "   " } });
    expect(submit.disabled).toBe(true); // whitespace-only draft
    fireEvent.click(submit);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(q.getByTestId(ttid("textarea")), { target: { value: "real text" } });
    expect(submit.disabled).toBe(false);
  });

  test("while pending: disabled + aria-busy + 'Sending…' status (catches: double-submit)", async () => {
    const fetchMock = vi.fn(() => new Promise<never>(() => {})); // never settles
    vi.stubGlobal("fetch", fetchMock);
    const q = renderInChrome(sectionData(), () => "venue");
    fillAndSubmit(q);
    const submit = q.getByTestId(ttid("submit")) as HTMLButtonElement;
    await waitFor(() => expect(q.getByTestId(ttid("status")).textContent).toBe("Sending…"));
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute("aria-busy")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a11y contract: role=status + aria-live=polite on the status line; label wired via htmlFor; maxLength = REPORT_MESSAGE_MAX_CHARS; 44px submit target", () => {
    stubFetch();
    const q = renderInChrome(sectionData(), () => "venue");
    const status = q.getByTestId(ttid("status"));
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    const textarea = q.getByTestId(ttid("textarea")) as HTMLTextAreaElement;
    expect(textarea.getAttribute("maxlength")).toBe(String(REPORT_MESSAGE_MAX_CHARS));
    expect(textarea.id).toBeTruthy();
    const label = document.querySelector("label")!;
    expect(label.getAttribute("for")).toBe(textarea.id);
    const submit = q.getByTestId(ttid("submit"));
    expect(submit.className).toMatch(/\bmin-h-tap-min\b/);
  });

  test("impeccable dual-gate P2 pins: quiet secondary submit (never accent — one accent CTA per view), ring-offset matches the bg pane, textarea boundary uses border-strong + surface fill (WCAG 1.4.11)", () => {
    stubFetch();
    const q = renderInChrome(sectionData(), () => "venue");
    const submit = q.getByTestId(ttid("submit"));
    const submitClasses = submit.className.split(/\s+/);
    // Quiet/secondary recipe (same as the footer Unpublish button) — the
    // accent CTA belongs to Publish alone (critique P2).
    expect(submitClasses).not.toContain("bg-accent");
    expect(submitClasses).not.toContain("text-accent-text");
    expect(submitClasses).toContain("border");
    expect(submitClasses).toContain("border-border-strong");
    expect(submitClasses).toContain("bg-surface");
    expect(submitClasses).toContain("hover:bg-surface-sunken");
    // Ring-offset color present so the focus halo isn't white in dark mode.
    expect(submitClasses).toContain("focus-visible:ring-offset-bg");
    // Textarea boundary ≥3:1-capable pairing: border-strong + surface fill
    // (border-border on bg-bg computed 1.22:1 — audit P2).
    const textarea = q.getByTestId(ttid("textarea"));
    const textareaClasses = textarea.className.split(/\s+/);
    expect(textareaClasses).toContain("border-border-strong");
    expect(textareaClasses).toContain("bg-surface");
    expect(textareaClasses).not.toContain("bg-bg");
  });
});

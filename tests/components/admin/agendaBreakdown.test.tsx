// @vitest-environment jsdom
/**
 * tests/components/admin/agendaBreakdown.test.tsx (Task 13 — spec §5.3)
 *
 * Pins the public contract of <AgendaBreakdown>: a pure-presentation card over
 * server-built `AdminAgendaItem[]` plus a per-row fetch state machine
 *   idle → loading → { ready | stale | error }
 * keyed on `agendaStateKey`. Anchors (Open-PDF) render ONLY in `ready`; a late
 * response from an old generation is dropped (captured-key + AbortController).
 *
 * Anti-tautology: schedule/anchor counts are DERIVED from the fixture extraction
 * (never hardcoded), and DOM scans are scoped to the card's own section testid so
 * a sibling breakdown can never satisfy an assertion by accident.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, within } from "@testing-library/react";
import type { AgendaExtraction } from "@/lib/agenda/types";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import {
  AgendaBreakdown,
  __resetAgendaThrottleForTests,
} from "@/components/admin/wizard/Step3SheetCard";

const WIZARD_SESSION_ID = "11111111-1111-1111-1111-111111111111";
const DFID = "drive-agenda-1";

// ── fixtures ──────────────────────────────────────────────────────────────
function extraction(nSessions: number): AgendaExtraction {
  return {
    confidence: "high",
    corrections: 0,
    extractorVersion: 1,
    days: [
      {
        dayLabel: "Day 1",
        date: "2026-07-01",
        sessions: Array.from({ length: nSessions }, (_unused, i) => ({
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

// note-only baseline (Task 11 shape: block:null, href:null on every item).
const BASELINE: AdminAgendaItem[] = [{ label: "AGENDA", badge: null, href: null, block: null }];

// the upgraded items the server returns on a 200 (validated href + block).
const READY_HREF = "https://drive.google.com/file/d/abc123/view";
const READY_ITEMS: AdminAgendaItem[] = [
  {
    label: "AGENDA",
    badge: null,
    href: READY_HREF,
    block: { extraction: extraction(4), droppedSessions: 2, droppedDays: 0, droppedTracks: 0 },
  },
];
// expected session count is DERIVED from the fixture, not a literal.
const EXPECTED_SESSIONS = READY_ITEMS[0]!.block!.extraction.days.reduce(
  (n, d) => n + d.sessions.length,
  0,
);

// ── fetch harness ───────────────────────────────────────────────────────────
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
function jsonRes(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

const fetchMock = vi.fn<typeof fetch>();
function signalOf(call: number): AbortSignal | undefined {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return init?.signal ?? undefined;
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetAgendaThrottleForTests();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  __resetAgendaThrottleForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// thoroughly flush queued microtasks (the POST → json → setState chain).
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
}
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderCard(props?: Partial<Parameters<typeof AgendaBreakdown>[0]>) {
  return render(
    <AgendaBreakdown
      driveFileId={DFID}
      wizardSessionId={WIZARD_SESSION_ID}
      baseline={BASELINE}
      stateKey="gen-A"
      {...props}
    />,
  );
}
const section = () =>
  document.querySelector(`[data-testid="wizard-step3-card-${DFID}-agenda"]`) as HTMLElement;

describe("AgendaBreakdown — 5-state machine", () => {
  // (a) loading → baseline note + "Parsing agenda… (N PDFs)" eyebrow, NO anchor.
  test("(a) loading renders baseline note + parsing eyebrow with N PDFs, no Open-PDF anchor", async () => {
    fetchMock.mockReturnValue(defer<Response>().promise); // stays pending → loading
    renderCard();
    await flush();
    const s = within(section());
    expect(s.getByText(/Parsing agenda/i).textContent).toContain(String(BASELINE.length));
    expect(s.queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    expect(s.queryByTestId("agenda-schedule")).toBeNull();
  });

  // (b) ready (200) → agenda-schedule blocks + overflow notes WITH validated anchor.
  test("(b) ready renders schedule blocks (count derived from fixture) + anchor + overflow note", async () => {
    // a sibling breakdown for a DIFFERENT sheet is mounted alongside; the scan is
    // scoped to THIS card's section so the sibling can never satisfy the assertion.
    fetchMock.mockResolvedValue(jsonRes(200, { items: READY_ITEMS }));
    render(
      <div>
        <AgendaBreakdown
          driveFileId={DFID}
          wizardSessionId={WIZARD_SESSION_ID}
          baseline={BASELINE}
          stateKey="gen-A"
        />
        <div data-testid="wizard-step3-card-sibling-agenda">decoy: Open PDF / agenda-schedule</div>
      </div>,
    );
    await flush();
    const s = within(section());
    expect(s.getByTestId("agenda-schedule")).toBeTruthy();
    expect(s.getAllByTestId("agenda-session")).toHaveLength(EXPECTED_SESSIONS);
    const anchor = s.getByTestId("agenda-open-pdf") as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe(READY_HREF);
    // overflow note derived from the block's drop counts.
    expect(s.getByText(/2 more sessions/i)).toBeTruthy();
    expect(s.queryByText(/Parsing agenda/i)).toBeNull();
  });

  // (c) error — 504 timeout MUST land in error (NOT ready/stale), no anchor + source link.
  test("(c) 504 timeout → error: note-only, NO Open-PDF anchor, source-sheet link present", async () => {
    fetchMock.mockResolvedValue(jsonRes(504, { status: "timeout" }));
    renderCard();
    await flush();
    const s = within(section());
    expect(s.queryByTestId("agenda-schedule")).toBeNull();
    expect(s.queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    expect(s.getByTestId("agenda-source-link")).toBeTruthy();
    expect(s.getByText(/couldn’t read|couldn't read/i)).toBeTruthy();
  });

  test("(c-net) network throw and 500 → error", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    renderCard();
    await flush();
    expect(within(section()).getByTestId("agenda-source-link")).toBeTruthy();
    expect(within(section()).queryAllByTestId("agenda-open-pdf")).toHaveLength(0);

    cleanup();
    __resetAgendaThrottleForTests();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonRes(500, { code: "AGENDA_EXTRACT_FAILED" }));
    renderCard();
    await flush();
    const s = within(section());
    expect(s.queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    // no raw code leaks into the UI.
    expect(s.queryByText(/AGENDA_EXTRACT_FAILED/)).toBeNull();
  });

  // (c2) 409 → sanitized stale note, NO anchor, NO block.
  test("(c2) 409 → stale: sanitized note, no anchor, no schedule block", async () => {
    fetchMock.mockResolvedValue(jsonRes(409, { status: "stale" }));
    renderCard();
    await flush();
    const s = within(section());
    expect(s.queryByTestId("agenda-schedule")).toBeNull();
    expect(s.queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    expect(s.queryByText(/stale/i)).toBeNull(); // sanitized — no raw status token
    expect(s.getByTestId("agenda-note")).toBeTruthy();
  });

  // (c3) anchors ONLY in ready.
  test("(c3) Open-PDF anchors appear ONLY in ready (zero in loading/error/stale)", async () => {
    // loading
    fetchMock.mockReturnValue(defer<Response>().promise);
    renderCard();
    await flush();
    expect(within(section()).queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    cleanup();
    __resetAgendaThrottleForTests();
    fetchMock.mockReset();
    // ready
    fetchMock.mockResolvedValue(jsonRes(200, { items: READY_ITEMS }));
    renderCard();
    await flush();
    expect(within(section()).getAllByTestId("agenda-open-pdf").length).toBeGreaterThan(0);
  });

  // (d) empty baseline → no breakdown at all (and never fetches).
  test("(d) empty baseline → renders nothing and never POSTs", async () => {
    renderCard({ baseline: [] });
    await flush();
    expect(section()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // (e) always-fetch: a baseline item that already carries a block does NOT bypass
  // the fetch and is NOT rendered as ready until a successful 200 arrives.
  test("(e) always-fetch — no baseline-block bypass (block present but fetch pending → not ready)", async () => {
    const baselineWithBlock: AdminAgendaItem[] = [
      {
        label: "AGENDA",
        badge: null,
        href: READY_HREF,
        block: { extraction: extraction(3), droppedSessions: 0, droppedDays: 0, droppedTracks: 0 },
      },
    ];
    fetchMock.mockReturnValue(defer<Response>().promise); // pending → loading
    renderCard({ baseline: baselineWithBlock });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const s = within(section());
    // still loading: no schedule, no anchor despite the baseline block.
    expect(s.queryByTestId("agenda-schedule")).toBeNull();
    expect(s.queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
  });

  // (f) long-poll: 202 in_progress (Retry-After) then 200.
  test("(f) 202 in_progress then 200 after honoring Retry-After → ready", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonRes(202, { status: "pending", reason: "in_progress" }, { "Retry-After": "10" }),
      )
      .mockResolvedValueOnce(jsonRes(200, { items: READY_ITEMS }));
    renderCard();
    await flush(); // first poll → 202
    expect(within(section()).queryByTestId("agenda-schedule")).toBeNull();
    await advance(10_000); // honor Retry-After → second poll → 200
    await flush();
    const s = within(section());
    expect(s.getByTestId("agenda-schedule")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // (g) generation-key reset clears items, returns to loading, re-fires the POST.
  test("(g) new agendaStateKey resets to loading (items cleared) and re-fires POST", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { items: READY_ITEMS }));
    const view = renderCard({ stateKey: "gen-A" });
    await flush();
    expect(within(section()).getByTestId("agenda-schedule")).toBeTruthy();

    // gen-B: leave the new POST pending so we observe the reset-to-loading state.
    fetchMock.mockReturnValue(defer<Response>().promise);
    view.rerender(
      <AgendaBreakdown
        driveFileId={DFID}
        wizardSessionId={WIZARD_SESSION_ID}
        baseline={BASELINE}
        stateKey="gen-B"
      />,
    );
    await flush();
    const s = within(section());
    expect(s.queryByTestId("agenda-schedule")).toBeNull(); // ready items cleared
    expect(s.getByText(/Parsing agenda/i)).toBeTruthy(); // back to loading
    expect(fetchMock).toHaveBeenCalledTimes(2); // re-fired
  });

  // (g2) late-response suppression: gen-A POST resolving AFTER gen-B render must NOT
  // render A's items/anchors; B is untouched; A's request was abort()ed.
  test("(g2) late gen-A 200 is dropped after gen-B render; A aborted; B untouched", async () => {
    const dA = defer<Response>();
    const dB = defer<Response>();
    fetchMock.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise);
    const view = renderCard({ stateKey: "gen-A" });
    await flush(); // A in flight

    view.rerender(
      <AgendaBreakdown
        driveFileId={DFID}
        wizardSessionId={WIZARD_SESSION_ID}
        baseline={BASELINE}
        stateKey="gen-B"
      />,
    );
    await flush(); // B starts; A's effect cleanup aborts A
    expect(signalOf(0)?.aborted).toBe(true); // A aborted on key change

    // now A finally resolves with upgraded items — must be DROPPED.
    dA.resolve(jsonRes(200, { items: READY_ITEMS }));
    await flush();
    const s = within(section());
    expect(s.queryByTestId("agenda-schedule")).toBeNull(); // A's items NOT rendered
    expect(s.queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    expect(s.getByText(/Parsing agenda/i)).toBeTruthy(); // B still loading (untouched)
  });

  // (h) queued past one window then admitted → 200.
  test("(h) 202 queued then 202 in_progress then 200 → ready", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonRes(202, { status: "pending", reason: "queued" }, { "Retry-After": "10" }),
      )
      .mockResolvedValueOnce(
        jsonRes(202, { status: "pending", reason: "in_progress" }, { "Retry-After": "10" }),
      )
      .mockResolvedValueOnce(jsonRes(200, { items: READY_ITEMS }));
    renderCard();
    await flush();
    await advance(10_000);
    await flush();
    await advance(10_000);
    await flush();
    expect(within(section()).getByTestId("agenda-schedule")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

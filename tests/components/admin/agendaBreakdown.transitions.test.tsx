// @vitest-environment jsdom
/**
 * tests/components/admin/agendaBreakdown.transitions.test.tsx
 * (Task 15 — spec §5.3 Transition Inventory)
 *
 * Transition audit for <AgendaBreakdown>'s 5-state machine:
 *   idle | loading | ready | stale | error
 *
 * Full inventory (N=5, 10 possible pairs; impossible pairs noted):
 *
 *   T1  idle      → (stays idle)   empty baseline → null render, no POST
 *   T2  idle      → loading        gen-reset: stateKey changes, new baseline non-empty
 *   T3  loading   → ready          POST 200 — INSTANT
 *   T4  loading   → stale          POST 409 — INSTANT
 *   T5  loading   → error          POST throws / non-2xx/202 — INSTANT
 *   T6  ready     → loading        gen-reset: stateKey changes, new baseline non-empty — INSTANT
 *   T7  stale     → loading        gen-reset: same — INSTANT
 *   T8  error     → loading        gen-reset: same — INSTANT
 *   T9  *         → idle           gen-reset: stateKey changes, new baseline empty — INSTANT
 *   T10 COMPOUND  late-response    gen-A resolves after gen-B render → dropped (captured-key guard)
 *
 * No AnimatePresence / framer-motion wrappers exist in Step3SheetCard.tsx; all
 * transitions are instant — only the rendered output changes.
 *
 * Anchors (data-testid="agenda-open-pdf") render in NO state but `ready`.
 *
 * Anti-tautology: counts are DERIVED from fixtures; DOM scans are scoped to
 * the card's own section testid so a sibling element can never satisfy an
 * assertion. Concrete failure mode stated per test.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, within } from "@testing-library/react";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import type { AgendaExtraction } from "@/lib/agenda/types";
import {
  AgendaBreakdown,
  __resetAgendaThrottleForTests,
} from "@/components/admin/wizard/Step3SheetCard";

const WIZARD_SESSION_ID = "22222222-2222-2222-2222-222222222222";
const DFID = "drive-transition-test";

// ── fixtures ──────────────────────────────────────────────────────────────
function makeExtraction(nSessions: number): AgendaExtraction {
  return {
    confidence: "high",
    corrections: 0,
    extractorVersion: 1,
    days: [
      {
        dayLabel: "Day 1",
        date: "2026-08-01",
        sessions: Array.from({ length: nSessions }, (_, i) => ({
          time: `${9 + i}:00 AM`,
          title: `Session ${i + 1}`,
          room: "Main Hall",
          tracks: [],
          drift: null,
        })),
      },
    ],
  };
}

const BASELINE: AdminAgendaItem[] = [{ label: "AGENDA", badge: null, href: null, block: null }];

const READY_HREF = "https://drive.google.com/file/d/ready-pdf/view";
const READY_ITEMS: AdminAgendaItem[] = [
  {
    label: "AGENDA",
    badge: null,
    href: READY_HREF,
    block: {
      extraction: makeExtraction(3),
      droppedSessions: 0,
      droppedDays: 0,
      droppedTracks: 0,
    },
  },
];
// Derived from fixture — never a literal.
const EXPECTED_SESSIONS = READY_ITEMS[0]!.block!.extraction.days.reduce(
  (n, d) => n + d.sessions.length,
  0,
);

// ── fetch harness ──────────────────────────────────────────────────────────
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
function signalOf(callIndex: number): AbortSignal | null | undefined {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return init?.signal;
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

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
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
  document.querySelector(`[data-testid="wizard-step3-card-${DFID}-agenda"]`) as HTMLElement | null;

/**
 * Shared assertion: no Open-PDF anchor visible in any non-ready state.
 * Failure mode caught: anchor leaks into loading/stale/error render.
 */
function assertNoAnchors() {
  const s = section();
  if (s) expect(within(s).queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
}

describe("AgendaBreakdown — Transition Inventory (spec §5.3)", () => {
  // ── T1: idle (empty baseline) stays idle — null render, never POSTs ────
  // Failure mode: a non-null render or a spurious POST means the empty-baseline
  // guard was removed.
  test("T1 idle: empty baseline → renders null and never POSTs", async () => {
    renderCard({ baseline: [] });
    await flush();
    expect(section()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── T2: idle → loading (initial mount with non-empty baseline) ──────────
  // All transitions are INSTANT (no AnimatePresence in Step3SheetCard.tsx).
  // Failure mode: loading state renders anchors or schedule blocks that
  // should appear only in ready.
  test("T2 loading: initial mount with non-empty baseline → parsing eyebrow, no anchors", async () => {
    fetchMock.mockReturnValue(defer<Response>().promise); // stays pending
    renderCard();
    await flush();
    const s = within(section()!);
    expect(s.getByText(/Parsing agenda/i).textContent).toContain(String(BASELINE.length));
    assertNoAnchors();
    expect(s.queryByTestId("agenda-schedule")).toBeNull();
  });

  // ── T3: loading → ready (POST 200) — INSTANT ──────────────────────────
  // Failure mode: schedule blocks or anchor missing after 200 response, or
  // a sibling element's "agenda-schedule" satisfies the assertion by accident.
  test("T3 loading→ready: 200 → schedule blocks + anchor appear; parsing eyebrow gone", async () => {
    fetchMock.mockResolvedValue(jsonRes(200, { items: READY_ITEMS }));
    // Mount sibling decoy to prove DOM scope is tight.
    render(
      <div>
        <AgendaBreakdown
          driveFileId={DFID}
          wizardSessionId={WIZARD_SESSION_ID}
          baseline={BASELINE}
          stateKey="gen-A"
        />
        <div data-testid="wizard-step3-card-sibling-agenda">decoy Open PDF / agenda-schedule</div>
      </div>,
    );
    await flush();
    const s = within(section()!);
    expect(s.getByTestId("agenda-schedule")).toBeTruthy();
    expect(s.getAllByTestId("agenda-session")).toHaveLength(EXPECTED_SESSIONS);
    const anchor = s.getByTestId("agenda-open-pdf") as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe(READY_HREF);
    expect(s.queryByText(/Parsing agenda/i)).toBeNull();
  });

  // ── T4: loading → stale (POST 409) — INSTANT ──────────────────────────
  // Failure mode: stale state leaks anchor, or raw "stale" token appears in UI
  // (invariant 5 violation), or schedule block is rendered.
  test("T4 loading→stale: 409 → sanitized note, no anchor, no schedule block", async () => {
    fetchMock.mockResolvedValue(jsonRes(409, { status: "stale" }));
    renderCard();
    await flush();
    const s = within(section()!);
    expect(s.queryByTestId("agenda-schedule")).toBeNull();
    assertNoAnchors();
    expect(s.queryByText(/\bstale\b/i)).toBeNull(); // raw status token must not appear
    expect(s.getByTestId("agenda-note")).toBeTruthy();
  });

  // ── T5: loading → error (throw / 5xx) — INSTANT ────────────────────────
  // Failure mode: error state leaks anchor; source-sheet link absent; raw error
  // code surfaces in UI; schedule block renders.
  test("T5 loading→error (throw): network throw → error note, no anchor, source-sheet link", async () => {
    fetchMock.mockRejectedValue(new Error("network failure"));
    renderCard();
    await flush();
    const s = within(section()!);
    expect(s.queryByTestId("agenda-schedule")).toBeNull();
    assertNoAnchors();
    expect(s.getByTestId("agenda-source-link")).toBeTruthy();
    expect(s.getByText(/couldn.t read/i)).toBeTruthy();
  });

  test("T5 loading→error (5xx): 500 → error state, no raw code in UI", async () => {
    fetchMock.mockResolvedValue(jsonRes(500, { code: "AGENDA_EXTRACT_FAILED" }));
    renderCard();
    await flush();
    const s = within(section()!);
    expect(s.queryByTestId("agenda-schedule")).toBeNull();
    assertNoAnchors();
    expect(s.queryByText(/AGENDA_EXTRACT_FAILED/)).toBeNull(); // invariant 5
  });

  // ── T6: ready → loading (gen-reset, new baseline non-empty) — INSTANT ──
  // Failure mode: prior ready items remain visible after gen reset; or the
  // parsing eyebrow doesn't reappear; or the POST isn't re-fired.
  test("T6 ready→loading: gen-reset after ready → items cleared, parsing eyebrow returns", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { items: READY_ITEMS }));
    const view = renderCard({ stateKey: "gen-A" });
    await flush();
    expect(within(section()!).getByTestId("agenda-schedule")).toBeTruthy();

    fetchMock.mockReturnValue(defer<Response>().promise); // gen-B stays pending
    view.rerender(
      <AgendaBreakdown
        driveFileId={DFID}
        wizardSessionId={WIZARD_SESSION_ID}
        baseline={BASELINE}
        stateKey="gen-B"
      />,
    );
    await flush();
    const s = within(section()!);
    expect(s.queryByTestId("agenda-schedule")).toBeNull(); // ready items cleared
    expect(s.getByText(/Parsing agenda/i)).toBeTruthy();
    assertNoAnchors();
    expect(fetchMock).toHaveBeenCalledTimes(2); // re-fired for gen-B
  });

  // ── T7: stale → loading (gen-reset) — INSTANT ─────────────────────────
  // Failure mode: stale note persists after stateKey change; no POST re-fired.
  test("T7 stale→loading: gen-reset after stale → loading, POST re-fired", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(409, {}));
    const view = renderCard({ stateKey: "gen-A" });
    await flush();
    // confirm stale
    expect(within(section()!).queryByTestId("agenda-schedule")).toBeNull();
    expect(within(section()!).queryAllByTestId("agenda-open-pdf")).toHaveLength(0);

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
    expect(within(section()!).getByText(/Parsing agenda/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // ── T8: error → loading (gen-reset) — INSTANT ─────────────────────────
  // Failure mode: error state persists after stateKey change; source-link lingers.
  test("T8 error→loading: gen-reset after error → loading, source link gone", async () => {
    fetchMock.mockRejectedValueOnce(new Error("transient"));
    const view = renderCard({ stateKey: "gen-A" });
    await flush();
    expect(within(section()!).getByTestId("agenda-source-link")).toBeTruthy();

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
    const s = within(section()!);
    expect(s.queryByTestId("agenda-source-link")).toBeNull();
    expect(s.getByText(/Parsing agenda/i)).toBeTruthy();
  });

  // ── T9: * → idle (gen-reset with empty baseline) — INSTANT ───────────
  // Failure mode: component keeps rendering (doesn't return null) when the new
  // baseline is empty after a stateKey change.
  test("T9 *→idle: gen-reset with empty baseline → renders null, no POST re-fired", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { items: READY_ITEMS }));
    const view = renderCard({ stateKey: "gen-A" });
    await flush();
    expect(section()).not.toBeNull();

    // New generation has no agenda links → empty baseline → idle
    view.rerender(
      <AgendaBreakdown
        driveFileId={DFID}
        wizardSessionId={WIZARD_SESSION_ID}
        baseline={[]}
        stateKey="gen-B"
      />,
    );
    await flush();
    expect(section()).toBeNull(); // renders null
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second POST
  });

  // ── Anchor invariant: Open-PDF renders ONLY in ready ───────────────────
  // Failure mode: anchor leaks into loading, stale, or error state, or
  // disappears from ready.
  test("Anchor invariant: Open-PDF appears only in ready, absent in loading/stale/error", async () => {
    // loading
    fetchMock.mockReturnValue(defer<Response>().promise);
    renderCard();
    await flush();
    expect(within(section()!).queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    cleanup();
    __resetAgendaThrottleForTests();
    fetchMock.mockReset();

    // stale
    fetchMock.mockResolvedValue(jsonRes(409, {}));
    renderCard();
    await flush();
    expect(within(section()!).queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    cleanup();
    __resetAgendaThrottleForTests();
    fetchMock.mockReset();

    // error
    fetchMock.mockRejectedValue(new Error("net"));
    renderCard();
    await flush();
    expect(within(section()!).queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    cleanup();
    __resetAgendaThrottleForTests();
    fetchMock.mockReset();

    // ready
    fetchMock.mockResolvedValue(jsonRes(200, { items: READY_ITEMS }));
    renderCard();
    await flush();
    expect(within(section()!).getAllByTestId("agenda-open-pdf").length).toBeGreaterThan(0);
  });

  // ── T10 COMPOUND: late gen-A 200 after gen-B render is dropped ─────────
  // This is the one "real" compound transition (plan round-24):
  //   - gen-A fires a POST and is pending
  //   - stateKey changes to gen-B; gen-A's effect cleanup calls abort()
  //   - gen-B starts its own POST
  //   - gen-A's 200 arrives but capturedKey !== currentKeyRef.current → DROPPED
  //   - gen-B's state is untouched (stays loading)
  //
  // Failure mode: gen-A's setState("ready") races through and renders A's items
  // even though B is the live generation. The `capturedKey` guard prevents this.
  test("T10 COMPOUND late-response: gen-A 200 after gen-B render is dropped; B stays loading", async () => {
    const dA = defer<Response>();
    const dB = defer<Response>();
    fetchMock.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise);

    const view = renderCard({ stateKey: "gen-A" });
    await flush(); // gen-A in flight

    // Switch to gen-B; gen-A's effect cleanup fires (abort + cancelled=true).
    view.rerender(
      <AgendaBreakdown
        driveFileId={DFID}
        wizardSessionId={WIZARD_SESSION_ID}
        baseline={BASELINE}
        stateKey="gen-B"
      />,
    );
    await flush(); // gen-B starts; gen-A aborted
    expect(signalOf(0)?.aborted).toBe(true); // A's AbortController fired

    // gen-A resolves late with upgraded items — must be silently dropped.
    dA.resolve(jsonRes(200, { items: READY_ITEMS }));
    await flush();

    const s = within(section()!);
    // A's items must NOT appear.
    expect(s.queryByTestId("agenda-schedule")).toBeNull();
    expect(s.queryAllByTestId("agenda-open-pdf")).toHaveLength(0);
    // B is unaffected — still showing loading.
    expect(s.getByText(/Parsing agenda/i)).toBeTruthy();
  });
});

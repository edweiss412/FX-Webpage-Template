import { test, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { AGENDA_MAX_PAGES } from "@/lib/agenda/constants";
const logMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));
import { extractAgendaSchedule } from "@/lib/agenda/extractAgendaSchedule";
const bytes = (f: string) => new Uint8Array(readFileSync(`fixtures/agenda/${f}`));
beforeEach(() => {
  logMock.info.mockClear();
  logMock.warn.mockClear();
  logMock.error.mockClear();
});

test("RFI: high confidence, all times, breakout tracks", async () => {
  const x = await extractAgendaSchedule(bytes("rfi.pdf"));
  expect(x.confidence).toBe("high");
  const sessions = x.days.flatMap((d) => d.sessions);
  expect(sessions.length).toBeGreaterThanOrEqual(16);
  // wrapped title joined (regression: must include BOTH halves around the time)
  expect(sessions.some((s) => /Adapting.*Unpredictability\?/.test(s.title ?? ""))).toBe(true);
  // breakout produced ≥2 tracks
  expect(sessions.some((s) => s.tracks.length >= 2)).toBe(true);
});
test("FIT: 2 days, afternoon day-1 resolves to PM (order-aware, no drift)", async () => {
  const x = await extractAgendaSchedule(bytes("fit.pdf"));
  expect(x.days.length).toBe(2);
  const day1 = x.days[0]!.sessions;
  expect(day1[0]!.time.startsWith("1:00 PM")).toBe(true); // not 1:00 AM
  expect(day1.every((s) => s.drift === null)).toBe(true); // bare clocks → no drift
});
test("PCF: 12:25 AM lunch typo auto-corrected to PM + drift flagged", async () => {
  const x = await extractAgendaSchedule(bytes("pcf.pdf"));
  const lunch = x.days.flatMap((d) => d.sessions).find((s) => /Lunch/i.test(s.title ?? ""));
  expect(lunch?.time.startsWith("12:25 PM")).toBe(true);
  expect(lunch?.drift).toMatch(/source: 12:25 AM/);
  expect(x.corrections).toBeGreaterThanOrEqual(1);
});
test("RIA: 'a.m./p.m.' meridiem format (period-delimited times) parses high", async () => {
  // II - RIA Central 2025 formats times as "7:30 a.m." (lowercase, periods). Before the
  // noSp meridiem-normalization, these matched neither clockSingle nor clockRange → 0 time
  // anchors → 0 sessions → low confidence → admin card "No schedule detected" for a fully
  // readable schedule. Concrete failure mode this pins: reverting the noSp fix drops this
  // back to confidence:"low" with empty days. Time assertion derives from the fixture
  // ("7:30 a.m." → canonical "7:30 AM" via fmtClock), not a hardcoded ladder value.
  const x = await extractAgendaSchedule(bytes("ria.pdf"));
  expect(x.confidence).toBe("high");
  expect(x.days.length).toBeGreaterThanOrEqual(2);
  const sessions = x.days.flatMap((d) => d.sessions);
  expect(sessions.length).toBeGreaterThanOrEqual(5);
  // The period/lowercase "7:30 a.m." is recognized and rendered in canonical form.
  expect(sessions.some((s) => s.time.startsWith("7:30 AM"))).toBe(true);
});
test("RPS: bare-morning opener whose day crosses AM→PM is NOT ambiguous-first (parses high)", async () => {
  // II - Retirement Plan Advisor Summit 2026 opens "7:45" (bare, hour 7) and runs to
  // ~5:40 PM. Pre-relaxation, the §4.4 ambiguous-first guard gated ANY bare 7–11 opener
  // to low — so this real, fully-readable schedule (24 sessions, every other metric
  // passing) rendered "No schedule detected". The relaxation accepts it because the
  // opener's day later resolves sessions to PM (AM→PM crossover proves a daytime
  // schedule). Concrete failure mode pinned: reverting the dayCrossesToPM check drops
  // this back to confidence:low. Assertions derive from the fixture (first "7:45 AM",
  // presence of a PM session), not hardcoded counts.
  const x = await extractAgendaSchedule(bytes("rps.pdf"));
  expect(x.confidence).toBe("high");
  const sessions = x.days.flatMap((d) => d.sessions);
  expect(sessions.length).toBeGreaterThanOrEqual(5);
  expect(sessions[0]?.time.startsWith("7:45 AM")).toBe(true); // bare opener seeded AM
  expect(sessions.some((s) => / PM$/.test(s.time))).toBe(true); // day crosses into PM
});
test("garbage / non-agenda PDF → low confidence", async () => {
  // a tiny non-agenda PDF fixture (or empty Uint8Array) → defensively low
  const x = await extractAgendaSchedule(new Uint8Array([0]));
  expect(x.confidence).toBe("low");
  expect(x.days).toEqual([]);
});
test("output always carries the current extractorVersion", async () => {
  const x = await extractAgendaSchedule(bytes("rfi.pdf"));
  expect(x.extractorVersion).toBe(2);
});
test("page cap: >AGENDA_MAX_PAGES → low confidence, no per-page parse, extractorVersion still 2", async () => {
  const getPage = vi.fn();
  vi.resetModules();
  vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
    getDocument: () => ({ promise: Promise.resolve({ numPages: 81, getPage }) }),
  }));
  const { extractAgendaSchedule: extract } = await import("@/lib/agenda/extractAgendaSchedule");
  const x = await extract(new Uint8Array([1, 2, 3]));
  expect(x.confidence).toBe("low");
  expect(x.days).toEqual([]);
  expect(x.extractorVersion).toBe(2);
  expect(getPage).not.toHaveBeenCalled();
  vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
  vi.resetModules();
});

// Observability breadcrumbs (agenda serverless-extraction gap): every non-rendering
// outcome must leave a greppable log so a degraded serverless parse is distinguishable
// from a genuinely scheduleless PDF in production. Concrete failure mode caught: a
// silent `LOW()`/throw that renders "No schedule detected" with no diagnostic trace.
test("breadcrumb: high-confidence parse logs agenda.extract `high` via lib/log", async () => {
  await extractAgendaSchedule(bytes("rfi.pdf"));
  expect(logMock.info).toHaveBeenCalledWith(
    "high",
    expect.objectContaining({ source: "agenda.extract" }),
  );
});
test("breadcrumb: a pdfjs throw logs agenda.extract `pdfjs threw` (not swallowed)", async () => {
  const x = await extractAgendaSchedule(new Uint8Array([0]));
  expect(x.confidence).toBe("low"); // still defensively low
  expect(logMock.error).toHaveBeenCalledWith(
    "pdfjs threw",
    expect.objectContaining({ source: "agenda.extract" }),
  );
});
test("breadcrumb: low-confidence gate logs agenda.extract `low-confidence` with metrics", async () => {
  // Mock a valid 1-page doc whose only text is a non-time line → n=0 sessions → gate
  // fails on minSessions → returns low WITHOUT throwing (exercises the gate, not the catch).
  vi.resetModules();
  vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({
            items: [
              {
                str: "Welcome to the conference",
                transform: [10, 0, 0, 10, 50, 700],
                fontName: "g_d0_f1",
              },
            ],
          }),
        }),
      }),
    }),
  }));
  try {
    const { extractAgendaSchedule: extract } = await import("@/lib/agenda/extractAgendaSchedule");
    const x = await extract(new Uint8Array([1, 2, 3]));
    expect(x.confidence).toBe("low");
    const call = logMock.warn.mock.calls.find((c) => c[0] === "low-confidence");
    expect(call).toBeDefined();
    // metrics payload present (not just a bare string) — the diagnostic value
    expect(call![1]).toMatchObject({ source: "agenda.extract", sessions: 0, numPages: 1 });
  } finally {
    vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
    vi.resetModules();
  }
});

// Forensic codes (Task 5): every non-rendering / durable outcome carries a greppable
// `code` on its log row so the durable stream is self-triageable. Concrete failure mode
// caught: a log row lands with a message string but no `code`, so it is invisible to the
// code-filtered observability queries. Codes are the literals under implementation — the
// `>AGENDA_MAX_PAGES` threshold is derived from the constant, not hardcoded.
test("forensic code: too-many-pages emits code AGENDA_TOO_MANY_PAGES", async () => {
  const getPage = vi.fn();
  vi.resetModules();
  vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
    getDocument: () => ({
      promise: Promise.resolve({ numPages: AGENDA_MAX_PAGES + 1, getPage }),
    }),
  }));
  try {
    const { extractAgendaSchedule: extract } = await import("@/lib/agenda/extractAgendaSchedule");
    await extract(new Uint8Array([1, 2, 3]));
    expect(logMock.warn).toHaveBeenCalledWith(
      "too-many-pages",
      expect.objectContaining({ source: "agenda.extract", code: "AGENDA_TOO_MANY_PAGES" }),
    );
  } finally {
    vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
    vi.resetModules();
  }
});
test("forensic code: high-confidence parse emits code AGENDA_SCHEDULE_HIGH_CONFIDENCE (durable)", async () => {
  await extractAgendaSchedule(bytes("rfi.pdf"));
  expect(logMock.info).toHaveBeenCalledWith(
    "high",
    expect.objectContaining({ source: "agenda.extract", code: "AGENDA_SCHEDULE_HIGH_CONFIDENCE" }),
  );
});
test("forensic code: a pdfjs throw emits code AGENDA_PDFJS_THREW with the error preserved", async () => {
  await extractAgendaSchedule(new Uint8Array([0]));
  expect(logMock.error).toHaveBeenCalledWith(
    "pdfjs threw",
    expect.objectContaining({
      source: "agenda.extract",
      code: "AGENDA_PDFJS_THREW",
      error: expect.anything(),
    }),
  );
});
test("forensic code: low-confidence gate reuses cataloged code AGENDA_SCHEDULE_LOW_CONFIDENCE", async () => {
  vi.resetModules();
  vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({
            items: [
              {
                str: "Welcome to the conference",
                transform: [10, 0, 0, 10, 50, 700],
                fontName: "g_d0_f1",
              },
            ],
          }),
        }),
      }),
    }),
  }));
  try {
    const { extractAgendaSchedule: extract } = await import("@/lib/agenda/extractAgendaSchedule");
    await extract(new Uint8Array([1, 2, 3]));
    expect(logMock.warn).toHaveBeenCalledWith(
      "low-confidence",
      expect.objectContaining({
        source: "agenda.extract",
        code: "AGENDA_SCHEDULE_LOW_CONFIDENCE",
      }),
    );
  } finally {
    vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
    vi.resetModules();
  }
});

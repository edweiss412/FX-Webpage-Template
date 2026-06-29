import { test, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { extractAgendaSchedule } from "@/lib/agenda/extractAgendaSchedule";
const bytes = (f: string) => new Uint8Array(readFileSync(`fixtures/agenda/${f}`));

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
test("garbage / non-agenda PDF → low confidence", async () => {
  // a tiny non-agenda PDF fixture (or empty Uint8Array) → defensively low
  const x = await extractAgendaSchedule(new Uint8Array([0]));
  expect(x.confidence).toBe("low");
  expect(x.days).toEqual([]);
});
test("output always carries the current extractorVersion", async () => {
  const x = await extractAgendaSchedule(bytes("rfi.pdf"));
  expect(x.extractorVersion).toBe(1);
});
test("page cap: >AGENDA_MAX_PAGES → low confidence, no per-page parse, extractorVersion still 1", async () => {
  const getPage = vi.fn();
  vi.resetModules();
  vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
    getDocument: () => ({ promise: Promise.resolve({ numPages: 81, getPage }) }),
  }));
  const { extractAgendaSchedule: extract } = await import("@/lib/agenda/extractAgendaSchedule");
  const x = await extract(new Uint8Array([1, 2, 3]));
  expect(x.confidence).toBe("low");
  expect(x.days).toEqual([]);
  expect(x.extractorVersion).toBe(1);
  expect(getPage).not.toHaveBeenCalled();
  vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
  vi.resetModules();
});

// Observability breadcrumbs (agenda serverless-extraction gap): every non-rendering
// outcome must leave a greppable log so a degraded serverless parse is distinguishable
// from a genuinely scheduleless PDF in production. Concrete failure mode caught: a
// silent `LOW()`/throw that renders "No schedule detected" with no diagnostic trace.
test("breadcrumb: high-confidence parse logs [agenda-extract] high", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await extractAgendaSchedule(bytes("rfi.pdf"));
    expect(log.mock.calls.some((c) => String(c[0]).includes("[agenda-extract] high"))).toBe(true);
  } finally {
    log.mockRestore();
  }
});
test("breadcrumb: a pdfjs throw logs [agenda-extract] pdfjs threw (not swallowed)", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const x = await extractAgendaSchedule(new Uint8Array([0]));
    expect(x.confidence).toBe("low"); // still defensively low
    expect(err.mock.calls.some((c) => String(c[0]).includes("[agenda-extract] pdfjs threw"))).toBe(
      true,
    );
  } finally {
    err.mockRestore();
  }
});
test("breadcrumb: low-confidence gate logs [agenda-extract] low-confidence with metrics", async () => {
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
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { extractAgendaSchedule: extract } = await import("@/lib/agenda/extractAgendaSchedule");
    const x = await extract(new Uint8Array([1, 2, 3]));
    expect(x.confidence).toBe("low");
    const call = warn.mock.calls.find((c) =>
      String(c[0]).includes("[agenda-extract] low-confidence"),
    );
    expect(call).toBeDefined();
    // metrics payload present (not just a bare string) — the diagnostic value
    expect(call![1]).toMatchObject({ sessions: 0, numPages: 1 });
  } finally {
    warn.mockRestore();
    vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
    vi.resetModules();
  }
});

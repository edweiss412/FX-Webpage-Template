import { test, expect } from "vitest";
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

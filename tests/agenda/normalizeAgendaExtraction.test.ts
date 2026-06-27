import { test, expect } from "vitest";
import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";
test("valid high payload passes", () => {
  const ok = {
    confidence: "high",
    corrections: 0,
    extractorVersion: 1,
    days: [{ dayLabel: "Tue", date: null, sessions: [{ time: "9 AM", title: null, room: null, tracks: [], drift: null }] }],
  };
  expect(normalizeAgendaExtraction(ok)).not.toBeNull();
});
test.each([
  null,
  {},
  { confidence: "high" }, // missing days
  { confidence: "high", days: "x", corrections: 0, extractorVersion: 1 }, // non-array days
  { confidence: "high", days: [{ sessions: [{ time: 5 }] }], corrections: 0, extractorVersion: 1 }, // bad session
])("malformed → null (embed-only)", (raw) => {
  expect(normalizeAgendaExtraction(raw)).toBeNull();
});

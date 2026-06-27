import { test, expect } from "vitest";
import type { AgendaExtraction } from "@/lib/agenda/types";
test("AgendaExtraction shape compiles + low-confidence has empty days", () => {
  const x: AgendaExtraction = { confidence: "low", corrections: 0, days: [], extractorVersion: 1 };
  expect(x.days).toEqual([]);
});

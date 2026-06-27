import { test, expect } from "vitest";
import { AGENDA_CONFIDENCE, AGENDA_MAX_SESSION_MIN, EXTRACTOR_VERSION } from "@/lib/agenda/constants";
test("agenda constants are the spec single-source values", () => {
  expect(AGENDA_CONFIDENCE).toEqual({ minSessions: 5, minTimeAnchorParsePct: 0.95, minTitlePct: 0.8, minRoomPct: 0.75 });
  expect(AGENDA_MAX_SESSION_MIN).toBe(240);
  expect(EXTRACTOR_VERSION).toBe(1);
});

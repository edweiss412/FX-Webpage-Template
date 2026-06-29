import { test, expect } from "vitest";
import * as C from "@/lib/agenda/constants";

test("agenda constants are the spec single-source values", () => {
  expect(C.AGENDA_CONFIDENCE).toEqual({
    minSessions: 5,
    minTimeAnchorParsePct: 0.95,
    minTitlePct: 0.8,
    minRoomPct: 0.75,
  });
  expect(C.AGENDA_MAX_SESSION_MIN).toBe(240);
  expect(C.EXTRACTOR_VERSION).toBe(1);
});

test("agenda async-decouple constants are defined with sane magnitudes", () => {
  expect(C.EXTRACTOR_VERSION).toBe(1); // round-49: NOT bumped
  expect(C.AGENDA_PDF_MAX_BYTES).toBe(25 * 1024 * 1024);
  expect(C.AGENDA_MAX_PAGES).toBe(80);
  expect(C.AGENDA_MAX_PDFS_PER_SHEET).toBe(6);
  expect(C.AGENDA_ADMIN_SESSIONS_CAP).toBe(8);
  expect(C.AGENDA_ADMIN_TRACKS_PER_SESSION_CAP).toBe(6);
  expect(C.AGENDA_CLIENT_CONCURRENCY).toBe(3);
  // deadlines strictly below the 300s route maxDuration
  expect(C.AGENDA_EXTRACT_DEADLINE_MS).toBeLessThan(300_000);
  expect(C.AGENDA_PDF_DEADLINE_MS).toBeLessThan(C.AGENDA_EXTRACT_DEADLINE_MS);
  // client poll budget ≈ one extraction window; queue budget strictly larger
  expect(C.AGENDA_CLIENT_POLL_BUDGET_MS).toBeGreaterThanOrEqual(300_000);
  expect(C.AGENDA_CLIENT_QUEUE_BUDGET_MS).toBeGreaterThan(C.AGENDA_CLIENT_POLL_BUDGET_MS);
  expect(C.AGENDA_EXTRACT_LEASE_TTL_MS).toBeGreaterThanOrEqual(300_000);
  expect(C.AGENDA_MAX_CONCURRENT_EXTRACTIONS).toBeGreaterThan(0);
  expect(C.AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS).toBeGreaterThanOrEqual(
    C.AGENDA_MAX_CONCURRENT_EXTRACTIONS,
  );
});

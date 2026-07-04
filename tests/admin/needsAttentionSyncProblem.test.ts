import { describe, expect, test } from "vitest";
import {
  buildNeedsAttention,
  resolveSyncProblemCopy,
  type NeedsAttentionSyncProblemInput,
} from "@/lib/admin/needsAttention";

const sp = (
  over: Partial<NeedsAttentionSyncProblemInput> = {},
): NeedsAttentionSyncProblemInput => ({
  alertId: "a1",
  showId: "s1",
  slug: "east-coast",
  title: "East Coast",
  code: "SHEET_UNAVAILABLE",
  sheetName: "East Coast",
  raisedAt: "2026-07-03T10:00:00Z",
  ...over,
});

describe("buildNeedsAttention sync_problem", () => {
  test("merges + sorts newest-first across streams and totals correctly", () => {
    const r = buildNeedsAttention({
      ingestions: [
        {
          id: "i1",
          driveFileId: "d1",
          driveFileName: "Old",
          lastErrorCode: null,
          lastAttemptAt: "2026-07-03T09:00:00Z",
        },
      ],
      syncs: [],
      syncProblems: [sp({ alertId: "a1", raisedAt: "2026-07-03T11:00:00Z" })],
      existence: {},
      totalCounts: { ingestions: 1, syncs: 0, syncProblems: 1 },
      cap: 20,
    });
    expect(r.items[0]?.variant).toBe("sync_problem");
    expect(r.totalCount).toBe(2);
    expect(r.syncProblemTotal).toBe(1);
  });

  test("overflow is computed from totals, not the capped array", () => {
    const many = Array.from({ length: 21 }, (_, i) =>
      sp({ alertId: `a${i}`, raisedAt: `2026-07-03T10:00:${String(i).padStart(2, "0")}Z` }),
    );
    const r = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      syncProblems: many,
      existence: {},
      totalCounts: { ingestions: 0, syncs: 0, syncProblems: 21 },
      cap: 20,
    });
    expect(r.renderedCount).toBe(20);
    expect(r.overflowCount).toBe(1);
    expect(r.syncProblemTotal).toBe(21);
  });

  test("digest caller shape (no syncProblems) defaults to empty + 0", () => {
    const r = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 0, syncs: 0 },
    });
    expect(r.syncProblemTotal).toBe(0);
    expect(r.items.some((i) => i.variant === "sync_problem")).toBe(false);
  });

  test("skips a sync-problem with a null slug (no dead link)", () => {
    const r = buildNeedsAttention({
      ingestions: [],
      syncs: [],
      syncProblems: [sp({ slug: null })],
      existence: {},
      totalCounts: { ingestions: 0, syncs: 0, syncProblems: 1 },
      cap: 20,
    });
    expect(r.items.some((i) => i.variant === "sync_problem")).toBe(false);
  });
});

describe("resolveSyncProblemCopy", () => {
  test("interpolates the sheet name and strips emphasis/placeholder markers", () => {
    const c = resolveSyncProblemCopy({
      code: "SHEET_UNAVAILABLE",
      sheetName: "East Coast",
      title: null,
    });
    expect(c).toContain("East Coast");
    expect(c).not.toMatch(/[<>_*]/);
  });

  test("falls back sheetName -> title -> per-code generic", () => {
    expect(
      resolveSyncProblemCopy({ code: "SHEET_UNAVAILABLE", sheetName: null, title: "RPAS" }),
    ).toContain("RPAS");
    expect(
      resolveSyncProblemCopy({ code: "SHEET_UNAVAILABLE", sheetName: null, title: null }),
    ).toBe("Sheet no longer in folder");
    expect(
      resolveSyncProblemCopy({ code: "PARSE_ERROR_LAST_GOOD", sheetName: null, title: null }),
    ).toBe("Latest edit didn't parse");
  });

  test("unknown code -> a non-empty generic, never a raw code", () => {
    const c = resolveSyncProblemCopy({ code: "NOT_A_CODE", sheetName: null, title: null });
    expect(c.length).toBeGreaterThan(0);
    expect(c).not.toContain("NOT_A_CODE");
  });
});

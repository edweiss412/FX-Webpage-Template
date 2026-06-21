import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * F1 Task 1.7 — second-copy apply tripwire (the meta-test that would have caught the origin
 * incident). The origin bug was a bespoke `UPDATE public.shows SET …` with no child writes
 * (finalize-cas applyShadow) and a bespoke shows-only `INSERT` (finalize applyFirstSeenDraft):
 * second copies of the canonical Phase-2 writers that drifted. Tasks 1.3/1.5 deleted them; this
 * walker makes a silent reintroduction impossible.
 *
 * NO file-wide escape hatch: EVERY pattern match in EVERY walked file (including
 * runScheduledCronSync.ts) must fall inside an explicit allowed `(file, symbol)` body range; a
 * match outside every range fails with `file :: pattern :: line`. Adding a new shows/child
 * writer means adding a reviewed allowlist row HERE.
 */

const ROOT = process.cwd();

// Walks the REAL subtrees (class-sweep rule: never a lexical file list).
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    const stat = statSync(join(ROOT, rel));
    if (stat.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

const SNAPSHOT_SQL = [
  /insert\s+into\s+public\.shows\b/gi,
  // Plan-R1 finding 2: the ORIGIN bug was a bespoke `UPDATE public.shows SET ...` with no child
  // writes (finalize-cas applyShadow) — the tripwire must catch shows UPDATEs too, not just inserts.
  /update\s+public\.shows\b/gi,
  /delete\s+from\s+public\.(crew_members|rooms|hotel_reservations|transportation|contacts)\b/gi,
  /insert\s+into\s+public\.(crew_members|rooms|hotel_reservations|transportation|contacts|shows_internal)\b/gi,
];

// Path+symbol allowlist (spec §9, corrected: the canonical writer methods live on
// PostgresPipelineTx — NOT `upsertShow`, which does not exist). NO file-wide entries:
// every match must sit inside one of these symbol bodies. Lifecycle shows-UPDATE sites
// are enumerated individually; adding a new writer means adding a row HERE, in review.
// Re-derived from the live worktree 2026-06-12 via:
//   rg -ni "insert\s+into\s+public\.shows|update\s+public\.shows|delete\s+from\s+public\.(crew_members|rooms|hotel_reservations|transportation|contacts)|insert\s+into\s+public\.(crew_members|rooms|hotel_reservations|transportation|contacts|shows_internal)" lib app/api
const ALLOWED: ReadonlyArray<{ file: string; symbol: string }> = [
  // canonical snapshot writers (PostgresPipelineTx):
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async applyShowSnapshot(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async deleteCrewMembersNotIn(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async upsertCrewMembers(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async replaceHotelReservations(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async replaceRooms(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async replaceTransportation(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async replaceContacts(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async upsertShowsInternal(" },
  // legitimate non-snapshot shows-UPDATE lifecycle sites (enumerated from the live worktree):
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async applyDiagramSnapshot(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async updateShowParseError(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async updateShowPendingReview(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async markShowSheetUnavailable(" },
  { file: "lib/sync/runScheduledCronSync.ts", symbol: "async markShowDriveError(" },
  { file: "lib/sync/applyStaged.ts", symbol: "async function defaultRestoreShowStatus(" },
  { file: "lib/sync/discardStaged.ts", symbol: "async function defaultRestoreShowStatus(" },
  {
    file: "lib/sync/runManualSyncForShow.ts",
    symbol: "export async function runManualSyncForShow(",
  },
  { file: "lib/sync/promoteSnapshot.ts", symbol: "export async function promoteSnapshotUpload(" },
  { file: "lib/sync/promoteSnapshot.ts", symbol: "export async function repairSnapshotRollback(" },
  { file: "lib/sync/assetRecovery.ts", symbol: "async updateRecoveredDiagrams(" },
  { file: "lib/sync/unpublishShow.ts", symbol: "async clearUnpublishToken(" },
  { file: "lib/sync/unpublishShow.ts", symbol: "async archiveAndConsumeUnpublishToken(" },
  // Phase D publish flip — narrowed by T1.5 (provenance-bound UPDATE, plan R47-1/R55-1/R56-1).
  {
    file: "app/api/admin/onboarding/finalize-cas/route.ts",
    symbol: "async function publishAppliedWizardShows(",
  },
];

// [start, end) source range of a symbol body: from the symbol marker to the next
// top-level function or class-method declaration (or end of file).
const NEXT_DECL =
  /\n(?:export\s+(?:async\s+)?function\s+\w|async\s+function\s+\w|function\s+\w|  (?:private\s+)?async\s+\w+\()/;

function allowedRanges(file: string, src: string): Array<[number, number]> {
  return ALLOWED.filter((a) => a.file === file).map((a) => {
    const start = src.indexOf(a.symbol);
    if (start === -1) throw new Error(`allowlist symbol not found: ${a.file} :: ${a.symbol}`);
    const tail = src.slice(start + a.symbol.length);
    const next = tail.search(NEXT_DECL);
    const end = next === -1 ? src.length : start + a.symbol.length + next;
    return [start, end] as [number, number];
  });
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

describe("second-copy apply tripwire (the meta-test that would have caught the origin incident)", () => {
  test("every shows/child snapshot or shows-UPDATE statement under app/api/** + lib/** sits inside an allowed (file, symbol) range", () => {
    const offenders: string[] = [];
    for (const file of [...walk("app/api"), ...walk("lib")]) {
      const src = readFileSync(join(ROOT, file), "utf8");
      const ranges = allowedRanges(file, src);
      for (const pattern of SNAPSHOT_SQL) {
        for (const match of src.matchAll(pattern)) {
          const idx = match.index ?? 0;
          const allowed = ranges.some(([start, end]) => idx >= start && idx < end);
          if (!allowed) offenders.push(`${file} :: ${pattern} :: line ${lineOf(src, idx)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the allowlist itself is live — every pinned symbol still contains at least one matched statement", () => {
    // Guards against entries rotting into dead exemptions that would mask a future writer
    // moving into a stale range.
    for (const entry of ALLOWED) {
      const src = readFileSync(join(ROOT, entry.file), "utf8");
      const start = src.indexOf(entry.symbol);
      const [range] = allowedRanges(entry.file, src).filter(([s]) => s === start);
      const body = src.slice(range![0], range![1]);
      expect(
        SNAPSHOT_SQL.some((p) => new RegExp(p.source, "i").test(body)),
        `${entry.file} :: ${entry.symbol} no longer contains matched SQL — prune or update the allowlist`,
      ).toBe(true);
    }
  });
});

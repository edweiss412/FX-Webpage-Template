import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripSqlComments } from "./sqlComments";

const MIGRATIONS_DIR = "supabase/migrations";

/**
 * Every `.sql` migration, in apply order.
 *
 * Discovery is a directory scan, NOT a hard-coded list, and that is the whole
 * point (whole-diff R10). Migrations are immutable by convention: a cadence or
 * timeout change lands as a NEW file, not as an edit to the file that first
 * scheduled the job. Two guards previously named
 * `20260527000003_schedule_cron_jobs.sql` (and the notify migration) explicitly,
 * so a new `..._reschedule_refresh_watch.sql` would have changed production while
 * both guards kept reading the superseded values and passing.
 *
 * Filenames are timestamp-prefixed, so lexicographic order is apply order.
 */
export function migrationFilesInApplyOrder(): string[] {
  return readdirSync(join(process.cwd(), MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/**
 * Every live `cron.schedule('<jobName>', …)` block across all migrations, in
 * apply order. A block runs to the next `cron.schedule(` call or end of file.
 *
 * Comments are stripped first (see `stripSqlComments`), so a commented-out
 * schedule cannot supply the answer.
 */
export function scheduleBlocksForJob(jobName: string): string[] {
  const dir = join(process.cwd(), MIGRATIONS_DIR);
  const anchor = `cron.schedule('${jobName}'`;
  const blocks: string[] = [];

  for (const name of migrationFilesInApplyOrder()) {
    const raw = readFileSync(join(dir, name), "utf8");
    if (!raw.includes(anchor)) continue; // cheap pre-filter; stripping 100+ files is wasteful
    const sql = stripSqlComments(raw);
    let from = sql.indexOf(anchor);
    while (from !== -1) {
      const next = sql.indexOf("cron.schedule(", from + anchor.length);
      blocks.push(sql.slice(from, next === -1 ? undefined : next));
      from = sql.indexOf(anchor, from + anchor.length);
    }
  }
  return blocks;
}

/**
 * The block that actually governs the job — the LAST one applied.
 *
 * Throws when the job is scheduled nowhere, so a rename fails loudly instead of
 * silently pinning a constant against nothing.
 */
export function effectiveScheduleBlock(jobName: string): string {
  const blocks = scheduleBlocksForJob(jobName);
  if (blocks.length === 0) {
    throw new Error(`${jobName} is not scheduled by any migration`);
  }
  return blocks[blocks.length - 1]!;
}

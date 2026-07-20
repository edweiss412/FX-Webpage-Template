// Summarization + JSONL emission for the per-test-file DB-touch probe.
// See dbTouchProbe.ts for why the measurement exists and why it hooks sockets.
import fs from "node:fs";
import path from "node:path";
import type { DbTouch } from "./dbTouchProbe";

/**
 * Ports that mean "a database". Not only the local stack: `TEST_DATABASE_URL`
 * in .env.local targets the REMOTE validation pooler on 5432, so a file can be
 * DB-bound while the local Supabase ports stay untouched. Missing that would
 * mark such a file DB-free and recommend moving it into the parallel project.
 *
 *   5432  — Postgres (direct, incl. the remote validation pooler)
 *   6543  — Supabase transaction-mode pooler
 *   54321 — local Supabase API gateway → PostgREST
 *   54322 — local Supabase Postgres
 */
export const DB_PORTS: ReadonlySet<number> = new Set([5432, 6543, 54321, 54322]);

export type DbTouchRow = {
  file: string;
  /** Every socket the file opened, DB or not. */
  total: number;
  /** Connects whose port is in DB_PORTS. */
  db: number;
  /** Sorted, deduplicated `host:port` strings — never credentials. */
  targets: string[];
};

export function summarizeFile(file: string, touches: readonly DbTouch[]): DbTouchRow {
  const dbTouches = touches.filter((t) => DB_PORTS.has(t.port));
  const targets = [...new Set(dbTouches.map((t) => `${t.host}:${t.port}`))].sort();

  return { file, total: touches.length, db: dbTouches.length, targets };
}

/**
 * Append one JSONL row. Per-worker files, because vitest runs many workers and
 * a shared handle would interleave partial lines. Appended per test file rather
 * than buffered to the end so a crashed or timed-out run still yields every row
 * recorded before the crash.
 */
export function appendRow(outputDir: string, workerId: string, row: DbTouchRow): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.appendFileSync(path.join(outputDir, `worker-${workerId}.jsonl`), `${JSON.stringify(row)}\n`);
}

/**
 * Resolve a guard surface's accepted-survivor keys back to the lines they name.
 *
 * The mutation ledger is keyed by `operator:LINE:COLUMN:from>to`, so ANY edit
 * above a keyed row silently invalidates it. Nothing local flags that. The gate
 * does, a full CI cycle later, and it reports the same site as one unaccepted
 * survivor PLUS one stale row -- same operator, same column, same mutation --
 * which is the signature of a MOVE rather than a coverage regression.
 *
 * One row on `paneCompactionCore` moved FOUR times in a day (700 -> 801 -> 828
 * -> 854), and the last move was made by the very comment block that documented
 * the previous one. Per-incident re-keying never converges: each repair edits
 * the file and can move the next row. Verifying the WHOLE ledger by reading the
 * column converges every run, which is why this reads rather than greps.
 *
 * A resolving key proves the site still EXISTS. Reading the column proves the
 * reason still holds -- they are different claims, and only the second is worth
 * anything.
 *
 * Usage:  pnpm tsx scripts/verify-mutation-site-keys.ts [surfaceId ...]
 *         (no arguments = every enrolled surface)
 * Exit 0 = every row resolves to the literal it names; 1 = at least one moved.
 */
import { readFileSync } from "node:fs";

import { GUARD_SURFACES } from "../tests/mutation/source/registry";

// NON-GREEDY on `from`. The key is `${from}>${to}` and both halves can contain
// `>`: `relational-boundary:...:>>>=` is `>` becoming `>=`. A greedy `from` split
// that as `>>` -> `=` and reported 28 healthy rows as MOVED across the corpus --
// a verifier's false positive is worse than its silence, because it is ACTED ON.
const KEY = /^([a-z-]+):(\d+):(\d+):(.+?)>(.+)$/;

function check(surfaceId: string): number {
  const surface = GUARD_SURFACES.find((s) => s.id === surfaceId);
  if (surface === undefined) {
    console.log(`UNKNOWN SURFACE  ${surfaceId}`);
    return 1;
  }
  const rows = surface.accepted;
  if (rows.length === 0) {
    console.log(`${surfaceId}: no accepted rows (nothing to verify)`);
    return 0;
  }
  const src = readFileSync(surface.sourcePath, "utf8").split("\n");
  let bad = 0;
  for (const row of rows) {
    const m = KEY.exec(row.siteId);
    if (m === null) {
      console.log(`  UNPARSED  ${row.siteId}`);
      bad += 1;
      continue;
    }
    // Narrowed rather than asserted: the regex guarantees all three groups, but
    // `noUncheckedIndexedAccess` does not know that, and a bare `!` would hide a
    // future grammar change instead of failing on it.
    const [, , lineNo, col, from] = m;
    if (lineNo === undefined || col === undefined || from === undefined) {
      console.log(`  UNPARSED  ${row.siteId}`);
      bad += 1;
      continue;
    }
    const line = src[Number(lineNo) - 1] ?? "";
    const held = line.slice(Number(col) - 1, Number(col) - 1 + from.length);
    const ok = held === from;
    if (!ok) bad += 1;
    console.log(
      `  ${ok ? "OK   " : "MOVED"} ${row.siteId.padEnd(30)} holds ${JSON.stringify(held)} wants ${JSON.stringify(from)}  ${line.trim().slice(0, 56)}`,
    );
  }
  console.log(`${surfaceId}: ${rows.length - bad}/${rows.length} rows resolve to what they name`);
  return bad;
}

const wanted = process.argv.slice(2);
const ids =
  wanted.length > 0 ? wanted : GUARD_SURFACES.filter((s) => s.accepted.length > 0).map((s) => s.id);
let total = 0;
for (const id of ids) total += check(id);
console.log(
  total === 0 ? "ALL KEYS RESOLVE" : `${total} STALE KEY(S) -- re-key by READING the new line`,
);
process.exitCode = total === 0 ? 0 : 1;

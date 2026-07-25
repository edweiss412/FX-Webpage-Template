/**
 * Remove SQL comments from `sql`, preserving everything else byte-for-byte.
 *
 * Shared by the two guards that pin a constant against a value declared inside
 * `supabase/migrations/20260527000003_schedule_cron_jobs.sql`
 * (`tests/drive/watchExpiration.test.ts` for `T_EXEC_BUDGET_MS`,
 * `tests/cron/samplingPeriodParity.test.ts` for `SAMPLING_PERIOD_MS`). Both read
 * the migration as text, so both need the same answer to "is this line live?".
 *
 * A single left-to-right state machine rather than two regex passes, because the
 * shapes interleave and order-dependent stripping gets them wrong (whole-diff R8
 * finding 3, which mutation-confirmed a false green in a line-only filter:
 * block-commenting a live declaration and adding a new one still extracted the
 * OLD value).
 *
 * Concretely, the naive "strip block comments, then line comments" order breaks
 * on that migration: line 6 documents a `cron` route path whose glob segment puts
 * a literal slash-star INSIDE a `--` comment, which that order would mistake for
 * the start of a block comment.
 *
 * Handles, per PostgreSQL lexing: `--` to end-of-line; slash-star block comments
 * (nestable, unlike C); and single-quoted strings with `''` doubling, whose
 * contents are DATA and are preserved.
 *
 * Dollar-quoted bodies are the deliberate exception: PostgreSQL lexes
 * `$tag$…$tag$` as one opaque literal, but this migration uses `$body$` to carry
 * the SQL that pg_net later EXECUTES, and a comment in that body is a comment at
 * execution time. So the body is recursed into rather than preserved. Treating it
 * as opaque is what let the R8 mutation survive even after line and block
 * stripping were fixed — every `timeout_milliseconds` in the file sits inside one.
 */
export function stripSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      if (nl === -1) break;
      i = nl; // keep the newline so line structure survives
      continue;
    }
    if (two === "/*") {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql.startsWith("/*", i)) {
          depth += 1;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth -= 1;
          i += 2;
        } else i += 1;
      }
      out += " "; // a comment is a token separator, not nothing
      continue;
    }
    if (sql[i] === "'") {
      const start = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i += 1;
          break;
        } else i += 1;
      }
      out += sql.slice(start, i);
      continue;
    }
    const dollar = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end;
      out += tag + stripSqlComments(sql.slice(i + tag.length, stop)) + (end === -1 ? "" : tag);
      i = end === -1 ? sql.length : end + tag.length;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * M12.1 T1/T4 — no-vercel-cron meta-test.
 *
 * The inverse-contract test that replaces the M6-era `tests/api/vercel-crons.test.ts`.
 * Per M12.1 spec §2.1 + plan T1, the `crons` block in `vercel.json` is removed (not
 * retained-with-comment) because Vercel Hobby tier rejects deployments declaring
 * sub-daily crons. Cron scheduling pivots to Supabase `pg_cron` + `pg_net` per spec §2.3.
 *
 * T1 owns assertion #1 (no `crons` key in `vercel.json`). T4.1 extends with the
 * substring walk over app/ + lib/ + tests/ for `x-vercel-cron` / `vercel-cron` /
 * `VercelCron` plus self-exclusion + anti-tautology.
 */
describe("M12.1: no vercel.json crons block (pg_cron pivot)", () => {
  test("vercel.json does NOT contain a `crons` key", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons?: unknown;
    };
    expect(config.crons).toBeUndefined();
  });
});

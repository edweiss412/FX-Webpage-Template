/**
 * Structural guard for the X.6 R1 reversal class.
 *
 * Failure mode caught: a new admin-alert producer bypasses the recurrence
 * contract by writing `admin_alerts` through raw Supabase `.insert()` or
 * `.upsert()` instead of the canonical `upsert_admin_alert` RPC.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

const RAW_ADMIN_ALERT_SUPABASE_ALLOWLIST: ReadonlyArray<{
  path: string;
  reason: string;
}> = [
  {
    path: "lib/dev/materialize/run.ts",
    reason:
      "Attention scenario materialize (spec 2026-07-20-attention-scenario-gallery). NOT a producer: " +
      "it writes SYNTHETIC state for a developer-only instrument, build-gated out of production, " +
      "and never reacts to a real event. The canonical RPC cannot express what a scenario declares " +
      "- upsert_admin_alert(p_show_id, p_code, p_context) takes three arguments and derives " +
      "occurrence_count (1, then +1 per conflict) and raised_at (now()) itself " +
      "(supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:18-54). A scenario " +
      "declaring occurrence_count 7 is reachable through the RPC only by raising the same alert seven " +
      "times, which is precisely the state the gallery exists to show without waiting for it. The " +
      "recurrence contract this file defends is therefore not in scope here: no recurrence is being " +
      "recorded. Every row written carries the __devScenario tag and is removed by Clear.",
  },
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function rawAdminAlertSupabaseWriteSites(): string[] {
  const allowlisted = new Set(RAW_ADMIN_ALERT_SUPABASE_ALLOWLIST.map((entry) => entry.path));
  const findings: string[] = [];
  for (const file of walkSourceFiles(["scripts", "lib", "app"])) {
    const source = stripComments(readFileSync(file, "utf8"));
    const rawWriteRe =
      /\.from\(\s*["']admin_alerts["']\s*\)[\s\S]{0,400}?\.(?:insert|upsert)\s*\(/g;
    for (const match of source.matchAll(rawWriteRe)) {
      if (allowlisted.has(file)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      findings.push(`${file}:${line}:raw_admin_alert_supabase_write`);
    }
  }
  return findings;
}

describe("META admin_alerts producer contract", () => {
  test("production Supabase admin_alert producers use upsert_admin_alert RPC", () => {
    expect(rawAdminAlertSupabaseWriteSites()).toEqual([]);
  });
});

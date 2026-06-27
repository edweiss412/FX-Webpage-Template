import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// PR F/G: scripts/ci/supabase-local-bootstrap.sh boots local Supabase with
// `-x <services>` to skip CI-unused images (~62s+ of the ~86-96s boot, paid by
// every booting job across all 6 consumers). This guard pins the contract so a
// regression can't (a) silently drop the perf flag, (b) exclude a service the
// app/e2e/seed actually exercises (which would break crew-e2e/screenshots/etc.),
// or (c) exclude vector/logflare while [analytics] is still enabled (which hangs
// `supabase start` via the analytics health-dependency chain — supabase/cli#2737).
const ROOT = process.cwd();
const SCRIPT = readFileSync(join(ROOT, "scripts", "ci", "supabase-local-bootstrap.sh"), "utf8");
const CONFIG_TOML = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");

// Services the rendered app + e2e + seed exercise live — excluding ANY of these
// breaks a consumer (kong=gateway, postgrest=.from/.rpc, gotrue=auth/signInAs,
// realtime=ShowRealtimeBridge broadcast, storage-api=signed URLs + sync uploads).
const MUST_KEEP = ["kong", "postgrest", "gotrue", "realtime", "storage-api"];
// Proven-unused services that are safe to exclude. vector+logflare are the
// Logflare analytics log pipeline — safe ONLY with [analytics] disabled (asserted).
const EXPECTED_EXCLUDED = [
  "imgproxy",
  "mailpit",
  "studio",
  "postgres-meta",
  "edge-runtime",
  "vector",
  "logflare",
];

describe("supabase bootstrap — `-x` excludes only CI-unused services", () => {
  it("boots with `supabase start -x <comma-list>`", () => {
    expect(
      /supabase start -x \S+/.test(SCRIPT),
      "the bootstrap must boot with `supabase start -x <services>` (the boot-time perf trim)",
    ).toBe(true);
  });

  // Extract the exclude list from the actual `supabase start -x a,b,c` invocation.
  const m = /supabase start -x ([^\s;]+)/.exec(SCRIPT); // stop at `;`/whitespace (the `; do`)
  const excluded = (m?.[1] ?? "").split(",").filter(Boolean);

  it("excludes exactly the proven-unused services", () => {
    expect([...excluded].sort()).toEqual([...EXPECTED_EXCLUDED].sort());
  });

  it.each(MUST_KEEP)("never excludes `%s` (exercised live by app/e2e/seed)", (svc) => {
    expect(
      excluded.includes(svc),
      `${svc} is exercised live — excluding it breaks a bootstrap consumer (crew-e2e/screenshots/seed)`,
    ).toBe(false);
  });

  it("if vector/logflare are excluded, [analytics] MUST be disabled (else start hangs — cli#2737)", () => {
    const excludesAnalyticsSvc = excluded.includes("vector") || excluded.includes("logflare");
    if (!excludesAnalyticsSvc) return; // coupling only applies when they're excluded
    // The [analytics] block must set `enabled = false`.
    const block = /\[analytics\]([\s\S]*?)(?:\n\[|$)/.exec(CONFIG_TOML);
    expect(block, "supabase/config.toml has no [analytics] block").not.toBeNull();
    expect(
      /\n\s*enabled\s*=\s*false\b/.test(block?.[1] ?? ""),
      "the bootstrap excludes vector/logflare, so supabase/config.toml [analytics] must be " +
        "`enabled = false` — excluding them while analytics is enabled hangs `supabase start` " +
        "(analytics health-dependency chain, supabase/cli#2737).",
    ).toBe(true);
  });
});

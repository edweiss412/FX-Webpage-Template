import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// PR F: scripts/ci/supabase-local-bootstrap.sh boots local Supabase with
// `-x <services>` to skip CI-unused images (~62s of the ~86-96s boot, paid by
// every booting job across all 6 consumers). This guard pins the contract so a
// regression can't (a) silently drop the perf flag or (b) exclude a service the
// app/e2e/seed actually exercises (which would break crew-e2e/screenshots/etc.).
const SCRIPT = readFileSync(
  join(process.cwd(), "scripts", "ci", "supabase-local-bootstrap.sh"),
  "utf8",
);

// Services the rendered app + e2e + seed exercise live — excluding ANY of these
// breaks a consumer (kong=gateway, postgrest=.from/.rpc, gotrue=auth/signInAs,
// realtime=ShowRealtimeBridge broadcast, storage-api=signed URLs + sync uploads).
const MUST_KEEP = ["kong", "postgrest", "gotrue", "realtime", "storage-api"];
// Proven-unused services that are safe to exclude.
const EXPECTED_EXCLUDED = ["imgproxy", "mailpit", "studio", "postgres-meta", "edge-runtime"];

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
});

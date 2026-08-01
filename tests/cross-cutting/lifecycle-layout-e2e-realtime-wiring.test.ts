import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Race-cluster spec §6.4: the restored compound case in
// admin-lifecycle-transitions.spec.ts depends on the realtime bridge — tab B's
// refresh arrives via a Broadcast subscription whose JWT the subscriber-token
// route SIGNS with SUPABASE_JWT_SECRET. lifecycle-layout-e2e.yml historically
// carried no realtime env, so in CI the mint failed, the bridge failed open
// (documented no-retry posture), and the case timed out on the tab-B terminal
// wait — measured on PR #639's first CI run while 3/3 local runs (which read
// .env.local) were green. Same wiring-pin idiom as
// published-modal-e2e-realtime-wiring.test.ts.
const WORKFLOW = readFileSync(
  join(process.cwd(), ".github", "workflows", "lifecycle-layout-e2e.yml"),
  "utf8",
);

describe("lifecycle-layout-e2e realtime wiring (restored compound case)", () => {
  it("carries SUPABASE_JWT_SECRET so the subscriber-token mint can sign", () => {
    expect(WORKFLOW).toMatch(/SUPABASE_JWT_SECRET:/);
  });

  it("carries SUPABASE_REALTIME_ISS matching the CI supabase stack", () => {
    expect(WORKFLOW).toMatch(/SUPABASE_REALTIME_ISS:\s*supabase-demo/);
  });
});

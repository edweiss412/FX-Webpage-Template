import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Realtime-refresh plan Task 5: the realtime e2e's CI gate is DARK unless all
// the wiring points exist in published-modal-e2e.yml — a green workflow whose
// run line lacks the spec is the green-without-running failure mode (plan
// round-6 F5). This pin is the wiring's red phase (written BEFORE the YAML
// edit) and its structural guard afterward. String-match idiom per
// tests/cross-cutting/ci-workflow-speedup.test.ts.
const WORKFLOW = readFileSync(
  join(process.cwd(), ".github", "workflows", "published-modal-e2e.yml"),
  "utf8",
);

describe("published-modal-e2e realtime wiring", () => {
  it("sets the MODAL_REALTIME_E2E env gate (the spec self-skips without it)", () => {
    expect(WORKFLOW).toMatch(/MODAL_REALTIME_E2E:\s*"1"/);
  });

  it("lists the realtime spec on the playwright RUN LINE (not merely in path filters)", () => {
    // Anchored to the `playwright test` invocation so a path-filter entry
    // alone can never satisfy it.
    expect(WORKFLOW).toMatch(/playwright test[^\n]*published-review-modal\.realtime\.spec\.ts/);
  });

  it("path-filters on the bridge component so bridge edits re-run the gate", () => {
    expect(WORKFLOW).toMatch(/-\s*"components\/realtime\/ShowRealtimeBridge\.tsx"/);
  });

  it("path-filters on the realtime spec file so spec edits re-run the gate", () => {
    expect(WORKFLOW).toMatch(/-\s*"tests\/e2e\/published-review-modal\.realtime\.spec\.ts"/);
  });

  it("provides the subscriber-token mint env (spike finding: absent vars → mint 500 → gate-2 failure)", () => {
    expect(WORKFLOW).toMatch(/SUPABASE_JWT_SECRET:/);
    expect(WORKFLOW).toMatch(/SUPABASE_REALTIME_ISS:/);
  });
});

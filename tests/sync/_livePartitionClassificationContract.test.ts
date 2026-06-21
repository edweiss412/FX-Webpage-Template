import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyStagedCore, LIVE_PARTITION_CLASSIFICATION } from "@/lib/sync/applyStagedCore";
import { spyTx, coreArgs } from "./_applyStagedCoreTestkit";

/**
 * F1 Task 1.7 — live-partition classification contract (spec §3.2 / §9 R17).
 *
 * Concrete failure modes caught:
 *  (a) a new partition-discriminated statement appears on the core's reachable apply surface
 *      without a classification row or an explicit `live-partition:` annotation (orphan);
 *  (b) a classified-live op stops being a wizard no-op (a wizard apply erases live-partition
 *      operator-visible state — the spec §3.2 violation);
 *  (c) the core grows a call into a caller-level live-only op (e.g. resolveStaleSyncProblemAlerts).
 */

const ROOT = process.cwd();

// The core's reachable apply surface — module + transitive tx/composition files INCLUDING the
// PostgresPipelineTx method bodies, where live-only mutations like deleteLivePendingIngestion
// actually live (plan R23-1: omitting the tx file left the exact class unguarded — a future tx
// method could add a live-partition mutation reachable from wizard applies without failing this
// test).
const SURFACE = [
  "lib/sync/applyStagedCore.ts",
  "lib/sync/applyParseResult.ts",
  "lib/sync/phase2.ts",
  "lib/sync/runScheduledCronSync.ts",
];

function coreSource(): string {
  return readFileSync(join(ROOT, "lib/sync/applyStagedCore.ts"), "utf8");
}

// The classification registry itself names live-only ops/tables in its row strings (op names,
// site citations) — strip it (and comments) before probing the core's EXECUTABLE source for
// structural unreachability, otherwise the registry's own documentation would false-positive.
function stripRegistry(src: string): string {
  const start = src.indexOf("export const LIVE_PARTITION_CLASSIFICATION");
  if (start === -1)
    throw new Error("LIVE_PARTITION_CLASSIFICATION not found in applyStagedCore.ts");
  const end = src.indexOf("];", start);
  if (end === -1) throw new Error("LIVE_PARTITION_CLASSIFICATION array is unterminated");
  return src.slice(0, start) + src.slice(end + 2);
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// Structural probes for live-only ops classified reachableFromCore:false — the proof is that the
// core's executable source (registry + comments stripped) never references the op's concrete
// symbols/tables. Every non-reachable live-only registry row MUST have a probe here (the
// wizard-scope test below fails on an unprobed row).
const STRUCTURAL_PROBES: Record<string, RegExp> = {
  resolveStaleSyncProblemAlerts: /resolveStaleSyncProblemAlerts/,
  restoreDeleteAndIngest:
    /restoreDeleteAndIngest|restoreShowStatus\s*\(|upsertLivePendingIngestion/,
  adminAlertWriters: /upsertAdminAlert|admin_alerts/,
};

describe("live-partition classification contract (spec §3.2 / §9 R17)", () => {
  test("every partition-discriminated statement on the core surface has a classification row or an explicit annotation", () => {
    const partitionTables = /(pending_syncs|pending_ingestions|deferred_ingestions|admin_alerts)/g;
    const classifiedSites = new Set(LIVE_PARTITION_CLASSIFICATION.map((r) => r.op));
    for (const file of SURFACE) {
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const match of src.matchAll(partitionTables)) {
        // Each match must be attributable: the surrounding 400 chars must name a classified op
        // or carry an explicit classification comment.
        const window = src.slice(Math.max(0, (match.index ?? 0) - 400), (match.index ?? 0) + 400);
        const attributed =
          [...classifiedSites].some((op) => window.includes(op)) ||
          /live-partition:(live-only|wizard-only|n\/a)/.test(window);
        expect(
          attributed,
          `${file} has an unclassified ${match[0]} statement near index ${match.index}`,
        ).toBe(true);
      }
    }
  });

  test("wizard scope resolves EVERY classified-live op to a no-op (or proves it structurally unreachable)", async () => {
    const liveOnly = LIVE_PARTITION_CLASSIFICATION.filter((row) => row.class === "live-only");
    expect(liveOnly.length).toBeGreaterThan(0);

    // Runtime pin for the reachable rows (re-runs the Task-1.2 spy assertion as a structural pin
    // — kept here so deleting the unit test cannot silently drop the contract). The injected
    // deleteLivePendingSync THROWS: a wizard apply that reaches it fails the whole test loudly.
    const tx = spyTx();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, { sourceScope: "wizard", auditSource: "onboarding_finalize" }),
      {
        insertSyncAudit: async () => null,
        deleteLivePendingSync: async () => {
          throw new Error("live op reached from wizard scope");
        },
      },
    );
    expect(result.outcome).toBe("applied");

    const executableCore = stripComments(stripRegistry(coreSource()));
    for (const row of liveOnly) {
      if (row.reachableFromCore) {
        // Reachable live-only ops: prove the wizard run resolved each to a no-op.
        if (row.op === "deleteLivePendingIngestion") {
          expect(tx.ops, `${row.op} fired under wizard scope`).not.toContain(row.op);
        } else if (row.op === "deleteLivePendingSync") {
          // Proven by the throwing dep above: result.outcome === "applied" means it never fired.
        } else {
          throw new Error(
            `live-only op "${row.op}" is reachableFromCore but has no wizard no-op proof — ` +
              `add a runtime assertion for it in this test`,
          );
        }
      } else {
        // Caller-level live-only ops: prove the core's executable source never references them.
        const probe = STRUCTURAL_PROBES[row.op];
        expect(
          probe,
          `live-only op "${row.op}" (reachableFromCore: false) has no structural probe — add one`,
        ).toBeTruthy();
        expect(
          executableCore,
          `applyStagedCore.ts executable source references caller-level live-only op "${row.op}"`,
        ).not.toMatch(probe!);
      }
    }
  });

  test("the core never invokes resolveStaleSyncProblemAlerts (classified live-only, cron caller level)", () => {
    // DEVIATION from the plan's literal `not.toContain("resolveStaleSyncProblemAlerts")` over the
    // RAW file: the Task-1.2 classification registry inside applyStagedCore.ts legitimately NAMES
    // the op in its row strings. Pin the executable form instead: no import, no call site, and no
    // occurrence at all once the registry + comments are stripped.
    const raw = coreSource();
    expect(raw).not.toMatch(/resolveStaleSyncProblemAlerts_unlocked\s*\(/);
    expect(raw).not.toMatch(/import[^;]*resolveStaleSyncProblemAlerts/);
    expect(stripComments(stripRegistry(raw))).not.toContain("resolveStaleSyncProblemAlerts");
  });
});

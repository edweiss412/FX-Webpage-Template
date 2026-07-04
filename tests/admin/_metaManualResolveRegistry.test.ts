// tests/admin/_metaManualResolveRegistry.test.ts (route-sync-problems spec §8)
//
// Structural contract: inbox-routed codes (SHEET_UNAVAILABLE / PARSE_ERROR_LAST_GOOD)
// are auto-clear ONLY. Every MANUAL surface that sets admin_alerts.resolved_at must
// refuse them; the AUTO recovery paths must NOT be guarded (they are the only way
// these codes close). This pins the whole no-Dismiss enforcement surface at CI time
// so a new manual-resolve surface can't silently reopen the dismissal hole.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("META manual-resolve lockdown for inbox-routed codes", () => {
  test("shared resolveAdminAlert(s) helper rejects inbox-routed codes (isInboxRouted guard)", () => {
    const src = read("lib/adminAlerts/resolveAdminAlert.ts");
    expect(src).toMatch(/isInboxRouted/);
    // The guard throws (fail-closed), not silently skips.
    expect(src).toMatch(/isInboxRouted[\s\S]{0,120}throw new Error/);
    // Both entry points invoke it.
    expect(src).toMatch(/assertNotInboxRouted\(input\.code\)/);
    expect(src).toMatch(/input\.codes\.forEach\(assertNotInboxRouted\)/);
  });

  test("show-scoped resolve route rejects inbox-routed with 409 ALERT_AUTO_RESOLVE_ONLY", () => {
    const src = read("app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts");
    expect(src).toMatch(/isInboxRouted\(row\.code\)/);
    expect(src).toMatch(/errorResponse\(409,\s*"ALERT_AUTO_RESOLVE_ONLY"\)/);
    // It selects `code` so the guard has something to check.
    expect(src).toMatch(/select id, show_id, resolved_at, code/);
  });

  test("global resolve route is scope-protected (rejects ALL per-show alerts)", () => {
    // Inbox-routed codes are always per-show (show_id NOT NULL); the global route
    // rejects every per-show alert before any UPDATE, so it can never resolve one —
    // no code check needed. Pin that scope guard so it can't regress.
    const src = read("app/api/admin/admin-alerts/[id]/resolve/route.ts");
    expect(src).toMatch(/row\.show_id !== null/);
    expect(src).toMatch(/ALERT_REQUIRES_SHOW_SCOPED_RESOLVE/);
  });

  test("global banner form action (surface A) is scope-excluded via show_id IS NULL", () => {
    const src = read("app/admin/actions.ts");
    // Its UPDATE is global-only; a per-show inbox code can never be its target.
    expect(src).toMatch(/\.is\("show_id",\s*null\)/);
  });

  test("AUTO recovery paths are NOT guarded (they must stay able to auto-clear)", () => {
    for (const p of [
      "lib/notify/detect/recoveryResolution.ts",
      "lib/sync/runScheduledCronSync.ts",
    ]) {
      expect(read(p), `${p} must not gate auto-resolution on isInboxRouted`).not.toMatch(
        /isInboxRouted/,
      );
    }
  });

  test("no production caller passes an inbox-routed code literal to resolveAdminAlert(s)", () => {
    // Walk the resolveAdminAlert(s) callers; none may hand it an inbox-routed code
    // (those close only via the SQL recovery paths). Belt-and-braces to the helper throw.
    const callers = [
      "lib/notify/detect/stall.ts",
      "lib/notify/detect/emailDeliveryFailed.ts",
      "lib/sync/applyStaged.ts",
      "lib/sync/assetRecovery.ts",
      "lib/drive/watch.ts",
      "app/admin/actions.ts",
      "app/show/[slug]/[shareToken]/_CrewShell.tsx",
    ];
    for (const p of callers) {
      let src: string;
      try {
        src = read(p);
      } catch {
        continue; // caller path drifted; the helper throw still protects at runtime
      }
      for (const code of INBOX_ROUTED_CODES) {
        expect(src, `${p} must not pass inbox-routed code ${code} to a manual resolver`).not.toMatch(
          new RegExp(`resolveAdminAlert[\\s\\S]{0,200}"${code}"`),
        );
      }
    }
  });
});

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function windowsAround(haystack: string, needle: string, radius = 320): string[] {
  return [...haystack.matchAll(new RegExp(needle, "gi"))].map((match) => {
    const index = match.index ?? 0;
    return haystack.slice(Math.max(0, index - radius), index + needle.length + radius);
  });
}

describe("M6 pending-row partition scope contract", () => {
  test("Supabase read-side pending_syncs SELECTs are scoped to live wizard_session_id", () => {
    const gate = source("lib/sync/perFileProcessor.ts");
    const selectOffset = gate.indexOf('.from("pending_syncs")');
    const wizardScopeOffset = gate.indexOf('.is("wizard_session_id", null)', selectOffset);

    expect(selectOffset).toBeGreaterThan(-1);
    expect(wizardScopeOffset).toBeGreaterThan(selectOffset);
  });

  test("Phase 1 uses live-scoped transaction-port methods for pending_syncs and pending_ingestions", () => {
    const phase1 = source("lib/sync/phase1.ts");

    expect(phase1).toContain("readLivePendingSync");
    expect(phase1).toContain("upsertLivePendingIngestion");
    expect(phase1).toContain("deleteLivePendingIngestion");
    expect(phase1).not.toContain("readPendingSync(");
    expect(phase1).not.toContain("readPendingIngestion(");
  });

  test("Apply live-scope SELECT and DELETE carry wizard_session_id IS NULL", () => {
    const applyStaged = source("lib/sync/applyStaged.ts");
    const windows = [
      ...windowsAround(applyStaged, "from public\\.pending_syncs"),
      ...windowsAround(applyStaged, "delete from public\\.pending_syncs"),
    ].filter((sqlWindow) => sqlWindow.toLowerCase().includes("wizard_session_id is null"));

    expect(windows.length).toBeGreaterThanOrEqual(2);
    for (const sqlWindow of windows) {
      expect(sqlWindow.toLowerCase()).toContain("wizard_session_id is null");
    }
  });

  test("Apply wizard-scope SELECT, UPDATE, and manifest writes carry wizard_session_id equality", () => {
    const applyStaged = source("lib/sync/applyStaged.ts");
    const windows = [
      ...windowsAround(applyStaged, "from public\\.pending_syncs", 420),
      ...windowsAround(applyStaged, "update public\\.pending_syncs", 420),
      ...windowsAround(applyStaged, "update public\\.onboarding_scan_manifest", 420),
    ].filter((sqlWindow) => sqlWindow.toLowerCase().includes("wizard_session_id ="));

    expect(windows.length).toBeGreaterThanOrEqual(3);
  });

  test("Apply wizard-scope UPDATEs also carry active-wizard-session CAS", () => {
    const applyStaged = source("lib/sync/applyStaged.ts");
    const windows = [
      ...windowsAround(applyStaged, "update public\\.pending_syncs", 720),
      ...windowsAround(applyStaged, "update public\\.onboarding_scan_manifest", 720),
    ].filter((sqlWindow) => sqlWindow.toLowerCase().includes("pending_wizard_session_id"));

    expect(windows.length).toBeGreaterThanOrEqual(2);
  });

  test("Discard live-scope SELECT and DELETE carry wizard_session_id IS NULL", () => {
    const discardStaged = source("lib/sync/discardStaged.ts");
    const windows = [
      ...windowsAround(discardStaged, "from public\\.pending_syncs"),
      ...windowsAround(discardStaged, "delete from public\\.pending_syncs"),
    ].filter((sqlWindow) => sqlWindow.toLowerCase().includes("wizard_session_id is null"));

    expect(windows.length).toBeGreaterThanOrEqual(2);
    for (const sqlWindow of windows) {
      expect(sqlWindow.toLowerCase()).toContain("wizard_session_id is null");
    }
  });

  test("Discard wizard-scope SELECT, DELETE, and deferral writes carry wizard_session_id equality", () => {
    const discardStaged = source("lib/sync/discardStaged.ts");
    const windows = [
      ...windowsAround(discardStaged, "from public\\.pending_syncs", 420),
      ...windowsAround(discardStaged, "delete from public\\.pending_syncs", 420),
      ...windowsAround(discardStaged, "insert into public\\.deferred_ingestions", 560),
    ].filter((sqlWindow) => sqlWindow.toLowerCase().includes("wizard_session_id ="));

    expect(windows.length).toBeGreaterThanOrEqual(3);
    expect(discardStaged.toLowerCase()).toContain(
      "on conflict (drive_file_id, wizard_session_id) where wizard_session_id is not null",
    );
  });

  test("Onboarding scan writes target only the wizard partition", () => {
    const onboarding = source("lib/sync/runOnboardingScan.ts");
    const windows = [
      ...windowsAround(onboarding, "insert into public\\.pending_syncs", 900),
      ...windowsAround(onboarding, "insert into public\\.pending_ingestions", 900),
      ...windowsAround(onboarding, "insert into public\\.onboarding_scan_manifest", 900),
    ];

    expect(windows.length).toBeGreaterThanOrEqual(3);
    for (const sqlWindow of windows) {
      expect(sqlWindow.toLowerCase()).toContain("pending_wizard_session_id");
      expect(sqlWindow.toLowerCase()).toContain("wizard_session_id");
      expect(sqlWindow.toLowerCase()).not.toContain("wizard_session_id is null");
    }
    expect(onboarding.toLowerCase()).toContain(
      "on conflict (drive_file_id, wizard_session_id) where wizard_session_id is not null",
    );
  });

  test("live upsert conflict targets have matching partial unique indexes", () => {
    const ddl = source("supabase/migrations/20260501001000_internal_and_admin.sql");

    expect(ddl).toMatch(
      /create unique index pending_ingestions_live_drive_file_idx\s+on public\.pending_ingestions \(drive_file_id\) where wizard_session_id is null;/i,
    );
    expect(ddl).toMatch(
      /create unique index deferred_ingestions_live_drive_file_idx\s+on public\.deferred_ingestions \(drive_file_id\) where wizard_session_id is null;/i,
    );
  });
});

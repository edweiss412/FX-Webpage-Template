import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
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
    const selectOffset = applyStaged.indexOf("from public.pending_syncs");
    const selectScopeOffset = applyStaged.indexOf("and wizard_session_id is null", selectOffset);
    const deleteOffset = applyStaged.indexOf("delete from public.pending_syncs");
    const deleteScopeOffset = applyStaged.indexOf("and wizard_session_id is null", deleteOffset);

    expect(selectOffset).toBeGreaterThan(-1);
    expect(selectScopeOffset).toBeGreaterThan(selectOffset);
    expect(deleteOffset).toBeGreaterThan(-1);
    expect(deleteScopeOffset).toBeGreaterThan(deleteOffset);
  });
});

/**
 * Publish freshness gate wiring at the wizard finalize surfaces
 * (spec 2026-07-16-role-vocab-staging-overlay §3.5 / §7 items 11-14, 16, 18).
 *
 * Fake-DB route tests (the predicate ITSELF is DB-tested in
 * tests/db/roleMappingsStampPredicate.db.test.ts; here the fakes mirror its
 * truth table so the ROUTE wiring — refusal shape, completion blocking, infra
 * discrimination, partial durability — is what's under test).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { resetLogSink, setLogSink } from "@/lib/log";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import {
  FakeFinalizeDb,
  deps as finalizeDeps,
  pending,
  request as finalizeRequest,
} from "../../onboarding/_finalizeFake";
import {
  FakeFinalizeCasDb,
  W1 as CAS_W1,
  deps as casDeps,
  json,
  request as casRequest,
  shadowPayload,
} from "../../onboarding/_finalizeCasFake";

afterEach(() => resetLogSink());

// Recoverable staleness, not an infra fault: the shared per-row severity map must classify the
// gate refusal as warn (only DRIVE_FETCH_FAILED is error) — pins the default branch.
test("severityForFinalizeRowCode(ROLE_MAPPINGS_OUTDATED_AT_PUBLISH) → warn", async () => {
  const { severityForFinalizeRowCode } = await import("@/lib/onboarding/finalizeRowSeverity");
  expect(severityForFinalizeRowCode("ROLE_MAPPINGS_OUTDATED_AT_PUBLISH")).toBe("warn");
});

const TOKEN = "NEWROLE";
const STAMP = [{ token: TOKEN, grants: ["A1"] }];

function stampedPayload() {
  const payload = shadowPayload();
  (payload.parse_result as Record<string, unknown>).appliedRoleMappings = STAMP;
  return payload;
}

function shadowRow(driveFileId: string, payload = stampedPayload()) {
  return {
    wizard_session_id: CAS_W1,
    drive_file_id: driveFileId,
    show_id: "22222222-2222-4222-8222-222222222222",
    applied_by_email: "apply-admin@example.com",
    applied_at_intent: "2026-05-08T12:00:00.000Z",
    payload,
  };
}

describe("wizard apply gate — finalize-cas (Flow B shadow apply)", () => {
  test("stamped row + stale mapping → per-row ROLE_MAPPINGS_OUTDATED_AT_PUBLISH, blocking 409, nothing applied", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadowRow("existing-1")];
    db.staleRoleTokens.add(TOKEN);

    const response = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(response.status).toBe(409);
    const body = (await json(response)) as { per_row: Array<Record<string, unknown>> };
    expect(body.per_row).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drive_file_id: "existing-1",
          code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
        }),
      ]),
    );
    expect(db.appliedShadows).toEqual([]); // nothing written for the refused row
    expect(db.deletedWizardDeferrals).toBe(false);
    expect(db.checkpoint?.status).not.toBe("final_cas_done");
  });

  test("stamp round-trip integrity: the gate evaluates the EXACT staged stamp (fresh mapping → applies)", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadowRow("existing-1")];
    // Nothing stale — the gate must see STAMP (not a stripped/absent field) and pass.
    const response = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(response.status).toBe(200);
    expect(db.appliedShadows).toEqual(["existing-1"]);
  });

  test("legacy row (no appliedRoleMappings key) applies normally THROUGH the gate (SQL null bind)", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadowRow("existing-1", shadowPayload())]; // no stamp key
    db.staleRoleTokens.add(TOKEN); // must be irrelevant: null stamp passes
    const response = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(response.status).toBe(200);
    expect(db.appliedShadows).toEqual(["existing-1"]);
  });

  test("apply-heal round-trip: refused row re-staged under the current vocabulary then applies", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [shadowRow("existing-1")];
    db.staleRoleTokens.add(TOKEN);
    expect((await handleOnboardingFinalizeCas(casRequest(), casDeps(db))).status).toBe(409);
    expect(db.appliedShadows).toEqual([]);

    // Heal: the rescan re-derived the stamp under the current vocabulary (fresh token).
    const healed = stampedPayload();
    (healed.parse_result as Record<string, unknown>).appliedRoleMappings = [
      { token: "RENAMED ROLE", grants: ["A1"] },
    ];
    db.shadowRows = [shadowRow("existing-1", healed)];
    const rerun = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(rerun.status).toBe(200);
    expect(db.appliedShadows).toEqual(["existing-1"]);
  });

  test("mid-batch: mapping goes stale after row 1 applies → row 2 refused, row 1 stands (per-row read)", async () => {
    const db = new FakeFinalizeCasDb();
    const secondStamp = [{ token: "SECOND ROLE", grants: ["V1"] }];
    const second = stampedPayload();
    (second.parse_result as Record<string, unknown>).appliedRoleMappings = secondStamp;
    db.shadowRows = [shadowRow("existing-1"), shadowRow("existing-2", second)];
    // Seam: the first row's apply commit "deletes" the second row's mapping — the fake's
    // freshness read consults this set per row, so a request-level snapshot regression
    // (the R4 F1 bug shape) would let existing-2 slip through.
    const origHas = db.staleRoleTokens.has.bind(db.staleRoleTokens);
    db.staleRoleTokens.has = (t: string) => {
      if (db.appliedShadows.includes("existing-1") && t === "SECOND ROLE") return true;
      return origHas(t);
    };

    const response = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(response.status).toBe(409);
    expect([...db.appliedShadows]).toEqual(["existing-1"]); // row 1 durably applied
    const body = (await json(response)) as { per_row: Array<Record<string, unknown>> };
    expect(body.per_row).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drive_file_id: "existing-2",
          code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
        }),
      ]),
    );
  });

  test("gate infra fault on row N: typed 500, NOT the business code, row N unapplied, row 1 stands", async () => {
    const sink: Array<{ code?: string }> = [];
    setLogSink((r) => {
      sink.push(r as { code?: string });
    });
    const db = new FakeFinalizeCasDb();
    const second = stampedPayload();
    db.shadowRows = [shadowRow("existing-1", shadowPayload()), shadowRow("existing-2", second)];
    // Fault injection: the gate SQL throws for existing-2's stamp (invariant 9 — thrown path).
    db.staleRoleTokens.add("__THROW__");
    const origHas = db.staleRoleTokens.has.bind(db.staleRoleTokens);
    db.staleRoleTokens.has = (t: string) => {
      if (t === TOKEN) throw new Error("vocabulary read fault");
      return origHas(t);
    };

    const response = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("ONBOARDING_FINALIZE_INTERNAL_ERROR");
    expect(db.appliedShadows).toEqual(["existing-1"]); // partial durability: row 1 committed
    expect(sink.some((r) => r.code === "FINALIZE_CAS_UNEXPECTED_FAILURE")).toBe(true);
    expect(sink.some((r) => r.code === "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH")).toBe(false);
  });
});

describe("wizard apply gate — finalize (Flow A first-seen apply)", () => {
  test("stamped first-seen row + stale mapping → per-row refusal, not applied", async () => {
    const db = new FakeFinalizeDb();
    const row = pending("stale-1");
    (row.parse_result as Record<string, unknown>).appliedRoleMappings = STAMP;
    db.approved = [row, pending("ok-1")];
    db.staleRoleTokens.add(TOKEN);

    const response = await handleOnboardingFinalize(finalizeRequest(), finalizeDeps(db));
    const body = (await response.json()) as { per_row?: Array<Record<string, unknown>> };
    expect(db.firstSeenApplied).toEqual(["ok-1"]); // fresh sibling applied; stale row did not
    expect(body.per_row).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drive_file_id: "stale-1",
          code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
        }),
      ]),
    );
  });
});

describe("flip gate — publishAppliedWizardShows (Held → Live)", () => {
  test("stale flip candidate blocks final-CAS completion BEFORE the flip/deferrals/promotion/checkpoint", async () => {
    const db = new FakeFinalizeCasDb();
    db.sessionCreatedDriveIds = ["first-seen-1", "first-seen-2"];
    db.staleFlipDriveIds.add("first-seen-1");

    const response = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(response.status).toBe(409);
    const body = (await json(response)) as { per_row: Array<Record<string, unknown>> };
    expect(body.per_row).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drive_file_id: "first-seen-1",
          code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
        }),
      ]),
    );
    expect(db.published).toBe(false); // NO row flipped (409 before the flip UPDATE)
    expect(db.deletedWizardDeferrals).toBe(false);
    expect(db.watchedFolderId).toBeNull(); // settings NOT promoted
    expect(db.checkpoint?.status).not.toBe("final_cas_done");
  });

  test("heal: stamp refreshed (no longer stale) → re-run completes and flips", async () => {
    const db = new FakeFinalizeCasDb();
    db.sessionCreatedDriveIds = ["first-seen-1"];
    db.staleFlipDriveIds.add("first-seen-1");
    expect((await handleOnboardingFinalizeCas(casRequest(), casDeps(db))).status).toBe(409);

    db.staleFlipDriveIds.clear(); // the /finalize re-run rewrote shows_internal.applied_role_mappings
    const rerun = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(rerun.status).toBe(200);
    expect(db.published).toBe(true);
    expect(db.checkpoint?.status).toBe("final_cas_done");
  });

  test("unstamped candidates (null column) flip ungated", async () => {
    const db = new FakeFinalizeCasDb();
    db.sessionCreatedDriveIds = ["first-seen-1"];
    const response = await handleOnboardingFinalizeCas(casRequest(), casDeps(db));
    expect(response.status).toBe(200);
    expect(db.published).toBe(true);
  });
});

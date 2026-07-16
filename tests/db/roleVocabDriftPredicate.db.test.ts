/**
 * Drift-eligibility predicate matrix (spec 2026-07-16-role-vocab-mapping-convergence §3.1/§6.1).
 * DB-bound (local Supabase). Each case seeds shows + shows_internal + role_token_mappings and
 * asserts membership of the seeded drive_file_id in listRoleVocabDriftEligibleFileIds().
 *
 * Anti-tautology: every expectation derives from the seeded fixture rows (mappings + stamp +
 * warnings), never from re-running the predicate's own logic in JS. Each case uses a unique
 * token prefix `RVDC <n>` so cases cannot cross-match through the shared role_token_mappings table.
 */
import { afterEach, describe, expect, it } from "vitest";

import { sqlClient, seedLiveShowWithToken, seedHeldShow } from "@/tests/db/_b2Helpers";
import { listRoleVocabDriftEligibleFileIds } from "@/lib/sync/roleVocabDrift";

const T = (s: string) => `RVDC ${s}`; // canonical (upper, trimmed) per role_token_mappings_token_canonical

async function seedMapping(token: string, grants: string[]): Promise<void> {
  await sqlClient`
    insert into public.role_token_mappings (token, grants, decided_by)
    values (${token}, ${grants}, 'doug@fxav.com')
    on conflict (token) do update set grants = excluded.grants, updated_at = now()`;
}
async function deleteMapping(token: string): Promise<void> {
  await sqlClient`delete from public.role_token_mappings where token = ${token}`;
}
async function setInternal(showId: string, stamp: unknown, warnings: unknown): Promise<void> {
  await sqlClient`
    insert into public.shows_internal (show_id, applied_role_mappings, parse_warnings)
    values (${showId}, ${stamp === null ? null : JSON.stringify(stamp)}::text::jsonb,
            ${warnings === null ? null : JSON.stringify(warnings)}::text::jsonb)
    on conflict (show_id) do update
      set applied_role_mappings = excluded.applied_role_mappings,
          parse_warnings = excluded.parse_warnings`;
}
const unknownWarning = (token: string) => ({
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: `Unknown role token: '${token}'`,
  roleToken: token,
});

// Tokens seeded across cases; cleaned up after each test so the shared table cannot leak.
const seededTokens = new Set<string>();
async function mapping(token: string, grants: string[]): Promise<void> {
  seededTokens.add(token);
  await seedMapping(token, grants);
}
afterEach(async () => {
  for (const token of seededTokens) await deleteMapping(token);
  seededTokens.clear();
});

async function eligibleIds(): Promise<Set<string>> {
  return listRoleVocabDriftEligibleFileIds();
}

describe("listRoleVocabDriftEligibleFileIds (predicate matrix)", () => {
  it("1. CREATE: published, stamp null, roleToken warning, mapping now exists → ELIGIBLE", async () => {
    const token = T("CREATE");
    const show = await seedLiveShowWithToken();
    await setInternal(show.showId, null, [unknownWarning(token)]);
    await mapping(token, ["A1"]);
    expect((await eligibleIds()).has(show.driveFileId)).toBe(true);
  });

  it("2. legacy carve-out: warning WITHOUT roleToken key → NOT eligible (pins R1 F2)", async () => {
    const token = T("LEGACY");
    const show = await seedLiveShowWithToken();
    // Legacy warning shape: no roleToken field, only the message text.
    await setInternal(show.showId, null, [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: `Unknown role token: '${token}'` },
    ]);
    await mapping(token, ["A1"]);
    expect((await eligibleIds()).has(show.driveFileId)).toBe(false);
  });

  it("3. BROADEN: stamp grants [A1], mapping grants [A1,V1] → ELIGIBLE", async () => {
    const token = T("BROADEN");
    const show = await seedLiveShowWithToken();
    await setInternal(show.showId, [{ token, grants: ["A1"] }], null);
    await mapping(token, ["A1", "V1"]);
    expect((await eligibleIds()).has(show.driveFileId)).toBe(true);
  });

  it("4. NARROW: stamp grants [A1,V1], mapping grants [A1] → ELIGIBLE", async () => {
    const token = T("NARROW");
    const show = await seedLiveShowWithToken();
    await setInternal(show.showId, [{ token, grants: ["A1", "V1"] }], null);
    await mapping(token, ["A1"]);
    expect((await eligibleIds()).has(show.driveFileId)).toBe(true);
  });

  it("5. DELETE-consumed: stamp entry present, mapping row deleted → ELIGIBLE", async () => {
    const token = T("DELCONSUMED");
    const show = await seedLiveShowWithToken();
    await setInternal(show.showId, [{ token, grants: ["A1"] }], null);
    // No mapping row seeded → the consumed token no longer resolves.
    expect((await eligibleIds()).has(show.driveFileId)).toBe(true);
  });

  it("6. DELETE-unconsumed: stamp null, roleToken warning, NO mapping row → NOT eligible", async () => {
    const token = T("DELUNCONSUMED");
    const show = await seedLiveShowWithToken();
    await setInternal(show.showId, null, [unknownWarning(token)]);
    // No mapping row → direction (b) join finds nothing; show already reflects no-mapping.
    expect((await eligibleIds()).has(show.driveFileId)).toBe(false);
  });

  it("7. equal (edit-revert / steady state): stamp grants == mapping grants → NOT eligible", async () => {
    const token = T("EQUAL");
    const show = await seedLiveShowWithToken();
    await setInternal(show.showId, [{ token, grants: ["A1", "V1"] }], null);
    await mapping(token, ["V1", "A1"]); // same set, different order → still equal
    expect((await eligibleIds()).has(show.driveFileId)).toBe(false);
  });

  it("8. recognize-only steady state: stamp grants [], mapping grants [] → NOT eligible", async () => {
    const token = T("RECOGNIZE");
    const show = await seedLiveShowWithToken();
    await setInternal(show.showId, [{ token, grants: [] }], null);
    await mapping(token, []);
    expect((await eligibleIds()).has(show.driveFileId)).toBe(false);
  });

  it("9. malformed stamp (jsonb string 'corrupt') → ELIGIBLE (self-heal)", async () => {
    const show = await seedLiveShowWithToken();
    await setInternal(show.showId, "corrupt", null);
    expect((await eligibleIds()).has(show.driveFileId)).toBe(true);
  });

  it("10. published=false (held) with NARROW drift → NOT eligible (pins R2 F1 ownership bound)", async () => {
    const token = T("HELDNARROW");
    const { showId, driveFileId } = await seedHeldShow();
    await setInternal(showId, [{ token, grants: ["A1", "V1"] }], null);
    await mapping(token, ["A1"]);
    expect((await eligibleIds()).has(driveFileId)).toBe(false);
  });

  it("11. archived=true with NARROW drift → NOT eligible", async () => {
    const token = T("ARCHIVEDNARROW");
    // Archived+published row: the archived=false bound must still exclude it.
    const show = await seedLiveShowWithToken();
    await sqlClient`update public.shows set archived = true, archived_at = now() where id = ${show.showId}::uuid`;
    await setInternal(show.showId, [{ token, grants: ["A1", "V1"] }], null);
    await mapping(token, ["A1"]);
    expect((await eligibleIds()).has(show.driveFileId)).toBe(false);
  });
});

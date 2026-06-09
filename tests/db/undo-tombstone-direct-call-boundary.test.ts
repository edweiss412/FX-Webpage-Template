/**
 * Phase 4 Task 4.3 — _undo_tombstone direct-call boundary (PF36).
 *
 * The helper is exposed by PostgREST as rpc('_undo_tombstone', …) like any public.* function, so it
 * MUST NOT be callable except through undo_change. It is SECURITY INVOKER (so a direct authenticated
 * caller has no DML on the RPC-gated tables) AND has EXECUTE REVOKEd from public/anon/authenticated.
 * This is a FUNCTION-grant boundary — NOT the table-lockdown registry (that's the wrong home for it).
 */
import { afterAll, describe, expect, it } from "vitest";

import { asAdminTx, closeHoldsHelpers, holdsSql, seedShowWithCrew } from "./_holdsHelpers";

const SIG = "public._undo_tombstone(public.show_change_log, text)";

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

describe("_undo_tombstone direct-call boundary (PF36)", () => {
  it("STRUCTURAL — the helper is SECURITY INVOKER (not DEFINER)", async () => {
    const rows = (await holdsSql`
      select prosecdef from pg_proc
       where proname = '_undo_tombstone' and pronamespace = 'public'::regnamespace`) as unknown as Array<{
      prosecdef: boolean;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.prosecdef).toBe(false);
  });

  it("STRUCTURAL — EXECUTE is revoked from authenticated and anon", async () => {
    const [row] = (await holdsSql`
      select has_function_privilege('authenticated', ${SIG}, 'EXECUTE') as authed,
             has_function_privilege('anon', ${SIG}, 'EXECUTE') as anon`) as unknown as Array<{
      authed: boolean;
      anon: boolean;
    }>;
    expect(row!.authed).toBe(false);
    expect(row!.anon).toBe(false);
  });

  it("RUNTIME — a direct authenticated call mutates nothing", async () => {
    const { showId } = await seedShowWithCrew([{ name: "Carol", email: "carol@x" }]);
    // Capture Carol's full row + baseline hold/log counts.
    const before = (await holdsSql`
      select id, name, email, phone, role, role_flags, claimed_via_oauth_at
        from public.crew_members where show_id = ${showId} and name = 'Carol'`) as unknown as unknown[];
    const holdsBefore = (await holdsSql`select count(*)::int as n from public.sync_holds where show_id = ${showId}`) as unknown as Array<{ n: number }>;
    const logBefore = (await holdsSql`select count(*)::int as n from public.show_change_log where show_id = ${showId}`) as unknown as Array<{ n: number }>;

    // Build a show_change_log composite literal to pass as v_log, then attempt the direct call.
    let failed = false;
    try {
      await asAdminTx(async (tx) => {
        // A crew_added-shaped row record cast to the row type; drive_file_id text arg.
        await tx.unsafe(
          // column order: id, show_id, drive_file_id, occurred_at, source, change_kind, entity_ref,
          // summary, before_image, after_image, status, undo_of, created_by.
          `select public._undo_tombstone(
             row(gen_random_uuid(), $1::uuid, 'drv-x', now(), 'auto_apply', 'crew_added', 'Carol',
                 's', null, '{"email":"carol@x"}'::jsonb, 'applied', null, 'system')::public.show_change_log,
             'drv-x')`,
          [showId],
        );
      });
    } catch {
      failed = true; // permission-denied / not-exposed — the boundary held.
    }
    expect(failed).toBe(true);

    // Carol's row is byte-identical; no new holds / log rows for the show.
    const after = (await holdsSql`
      select id, name, email, phone, role, role_flags, claimed_via_oauth_at
        from public.crew_members where show_id = ${showId} and name = 'Carol'`) as unknown as unknown[];
    expect(after).toEqual(before);
    const holdsAfter = (await holdsSql`select count(*)::int as n from public.sync_holds where show_id = ${showId}`) as unknown as Array<{ n: number }>;
    const logAfter = (await holdsSql`select count(*)::int as n from public.show_change_log where show_id = ${showId}`) as unknown as Array<{ n: number }>;
    expect(holdsAfter[0]!.n).toBe(holdsBefore[0]!.n);
    expect(logAfter[0]!.n).toBe(logBefore[0]!.n);
  });
});

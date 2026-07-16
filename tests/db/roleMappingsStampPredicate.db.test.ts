/**
 * Publish freshness predicate + publish_show gate + FOR SHARE serialization
 * (spec 2026-07-16-role-vocab-staging-overlay §3.5 / §7 items 10, 15, 17b-RPC).
 *
 * Three groups against the MIGRATION-APPLIED function (executing it per case pins
 * the VOLATILE/FOR SHARE combination — an invalid volatility declaration fails
 * HERE, not at first production use — spec R11 F1):
 *   (a) predicate truth-table incl. every malformed-stamp shape (fail-closed, R10 F2)
 *   (b) publish_show refuses an unsatisfied stamp with ROLE_MAPPINGS_OUTDATED_AT_PUBLISH
 *   (c) FOR SHARE commit-order serialization vs the lockless settings DELETE (R7 F1)
 *
 * DB-bound (b2 harness; local Supabase). Expected values derive from the seeded
 * mapping fixtures below, never from hardcoded row dumps.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";

import { asAdminRpc, readShow, seedHeldShow, sqlClient } from "@/tests/db/_b2Helpers";

const TOKEN = "RVSO PREDICATE ROLE"; // unique to this file; canonical (upper, trimmed)
const TOKEN_B = "RVSO SERIALIZE ROLE";

async function seedMapping(sql: Sql, token: string, grants: string[]): Promise<void> {
  await sql`
    insert into public.role_token_mappings (token, grants, decided_by, decided_at, updated_at)
    values (${token}, ${grants}, 'doug@fxav.com', now(), now())
    on conflict (token) do update set grants = excluded.grants, updated_at = now()`;
}

async function deleteMapping(sql: Sql, token: string): Promise<void> {
  await sql`delete from public.role_token_mappings where token = ${token}`;
}

// NOTE: params are passed as TEXT then cast text→jsonb in SQL — postgres.js JSON-encodes a
// string bound directly to a ::jsonb cast (the $N::jsonb double-encode trap), which would turn
// '[]' into the jsonb STRING '"[]"' and silently flip every array case to the fail-closed branch.
async function satisfied(stamp: string | null): Promise<boolean> {
  const rows = await sqlClient`
    select public.role_mappings_stamp_satisfied(${stamp}::text::jsonb) as ok`;
  return rows[0]!.ok as boolean;
}

const stamp = (entries: Array<{ token: string; grants: string[] }>) => JSON.stringify(entries);

afterAll(async () => {
  await deleteMapping(sqlClient, TOKEN);
  await deleteMapping(sqlClient, TOKEN_B);
});

describe("role_mappings_stamp_satisfied (predicate matrix)", () => {
  it("null stamp → true (legacy / nothing consumed)", async () => {
    expect(await satisfied(null)).toBe(true);
  });

  it("empty array → true (nothing consumed, post-deploy baseline)", async () => {
    expect(await satisfied("[]")).toBe(true);
  });

  it("consumed token deleted → false", async () => {
    await deleteMapping(sqlClient, TOKEN);
    expect(await satisfied(stamp([{ token: TOKEN, grants: [] }]))).toBe(false);
  });

  it("narrowed grants → false; equal → true; broadened → true", async () => {
    await seedMapping(sqlClient, TOKEN, ["A1"]);
    // staged grants derive from the fixture: staged [A1,V1] vs current [A1] = narrowed
    expect(await satisfied(stamp([{ token: TOKEN, grants: ["A1", "V1"] }]))).toBe(false);
    expect(await satisfied(stamp([{ token: TOKEN, grants: ["A1"] }]))).toBe(true);
    await seedMapping(sqlClient, TOKEN, ["A1", "V1", "FINANCIALS"]);
    expect(await satisfied(stamp([{ token: TOKEN, grants: ["A1", "V1"] }]))).toBe(true);
  });

  it("recognize-only entry: passes while the token row exists, refuses when deleted", async () => {
    await seedMapping(sqlClient, TOKEN, []);
    expect(await satisfied(stamp([{ token: TOKEN, grants: [] }]))).toBe(true);
    await deleteMapping(sqlClient, TOKEN);
    expect(await satisfied(stamp([{ token: TOKEN, grants: [] }]))).toBe(false);
  });

  it("every malformed stamp shape → false (corrupt evidence never publishes)", async () => {
    await seedMapping(sqlClient, TOKEN, ["A1"]);
    for (const bad of [
      '"x"', // not an array
      "[1]", // entry not an object
      '[{"grants":[]}]', // missing token
      '[{"token":1,"grants":[]}]', // non-text token
      `[{"token":"${TOKEN}","grants":"A1"}]`, // grants not an array
      `[{"token":"${TOKEN}","grants":[1]}]`, // non-text grant
      `[{"token":"${TOKEN}","grants":["NOT_A_FLAG"]}]`, // unknown grant value
    ]) {
      expect(await satisfied(bad), `stamp ${bad} must fail closed`).toBe(false);
    }
  });
});

describe("publish_show freshness gate (RPC leg)", () => {
  it("refuses an unsatisfied stamp with ROLE_MAPPINGS_OUTDATED_AT_PUBLISH, publishes after heal", async () => {
    await seedMapping(sqlClient, TOKEN, ["A1"]);
    const { showId } = await seedHeldShow({ requiresResync: false });
    await sqlClient`
      insert into public.shows_internal (show_id, applied_role_mappings)
      values (${showId}, ${stamp([{ token: TOKEN, grants: ["A1"] }])}::text::jsonb)
      on conflict (show_id) do update set applied_role_mappings = excluded.applied_role_mappings`;

    // satisfied stamp → publish succeeds
    await asAdminRpc("publish_show", { p_show_id: showId });
    expect((await readShow(showId)).published).toBe(true);

    // second Held show, mapping deleted after staging → refuse, published stays false
    const second = await seedHeldShow({ requiresResync: false });
    await sqlClient`
      insert into public.shows_internal (show_id, applied_role_mappings)
      values (${second.showId}, ${stamp([{ token: TOKEN, grants: ["A1"] }])}::text::jsonb)
      on conflict (show_id) do update set applied_role_mappings = excluded.applied_role_mappings`;
    await deleteMapping(sqlClient, TOKEN);
    await expect(asAdminRpc("publish_show", { p_show_id: second.showId })).rejects.toThrow(
      /ROLE_MAPPINGS_OUTDATED_AT_PUBLISH/,
    );
    expect((await readShow(second.showId)).published).toBe(false);

    // heal: mapping restored (stand-in for the manual-sync re-derive) → publish succeeds
    await seedMapping(sqlClient, TOKEN, ["A1"]);
    await asAdminRpc("publish_show", { p_show_id: second.showId });
    expect((await readShow(second.showId)).published).toBe(true);
  });
});

describe("FOR SHARE serialization (two connections)", () => {
  it(
    "a settings DELETE blocks behind the gate's share lock until the gate tx commits",
    { timeout: 20000 },
    async () => {
      await seedMapping(sqlClient, TOKEN_B, []);
      const a = postgres(
        process.env.TEST_DATABASE_URL ??
          process.env.DATABASE_URL ??
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        { max: 1, prepare: false },
      );
      const b = postgres(
        process.env.TEST_DATABASE_URL ??
          process.env.DATABASE_URL ??
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        { max: 1, prepare: false },
      );
      try {
        let releaseA!: () => void;
        const aHolds = new Promise<void>((r) => (releaseA = r));
        let aResult: boolean | undefined;
        const aTx = a.begin(async (tx) => {
          const rows = await tx`
          select public.role_mappings_stamp_satisfied(${stamp([
            { token: TOKEN_B, grants: [] },
          ])}::text::jsonb) as ok`;
          aResult = rows[0]!.ok as boolean;
          await aHolds; // hold the share lock until the delete has provably blocked
        });

        // B's delete must BLOCK while A's tx holds FOR SHARE (statement_timeout proves it)
        await new Promise((r) => setTimeout(r, 100)); // let A acquire the lock
        await expect(
          b.begin(async (tx) => {
            await tx`set local statement_timeout = '500ms'`;
            await tx`delete from public.role_token_mappings where token = ${TOKEN_B}`;
          }),
        ).rejects.toThrow(/statement timeout|canceling statement/);

        releaseA();
        await aTx;
        expect(aResult).toBe(true); // gate saw the still-live row

        // after A committed, the delete proceeds
        await b`delete from public.role_token_mappings where token = ${TOKEN_B}`;

        // inverse order: delete committed first → gate read refuses
        expect(await satisfied(stamp([{ token: TOKEN_B, grants: [] }]))).toBe(false);
      } finally {
        await a.end({ timeout: 5 }).catch(() => {});
        await b.end({ timeout: 5 }).catch(() => {});
      }
    },
  );
});

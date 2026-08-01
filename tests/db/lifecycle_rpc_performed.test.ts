/**
 * tests/db/lifecycle_rpc_performed.test.ts
 * (spec docs/superpowers/specs/2026-07-31-archive-lifecycle-race-cluster-design.md §3, §6.1)
 *
 * The performed/no-op discriminator contract for the three migrated lifecycle
 * RPCs: archive_show / publish_show / unpublish_show return TRUE iff THIS call
 * performed the state transition, FALSE on the idempotent no-op arm. The
 * sibling contract for unarchive_show is pinned in unarchive_show_rpc.test.ts
 * (shipped 20260718000001; untouched by this feature, spec §1.1 row 8).
 *
 * Failure modes, per case:
 *  - discriminator cases: a recreate that dropped the no-op early-return would
 *    answer TRUE twice (and, for archive, rotate the share token twice — the
 *    side-effect probe below);
 *  - refusal case: a recreate that lost a gate would publish an archived show
 *    instead of raising SHOW_ARCHIVED_IMMUTABLE. This case is a regression PIN,
 *    not part of the red set — the shipped void core already raises it.
 */
import { describe, it, expect } from "vitest";
import {
  archiveShowReturning,
  publishShowReturning,
  unpublishShowReturning,
  readShareToken,
  readShow,
  seedArchivedShow,
  seedHeldShow,
  sqlClient,
} from "@/tests/db/_b2Helpers";

describe("lifecycle RPC performed/no-op discriminator (race-cluster spec §3)", () => {
  it("archive_show: TRUE on the held→archived transition, FALSE + side-effect-free on repeat", async () => {
    const { showId } = await seedHeldShow();
    try {
      expect(await archiveShowReturning(showId)).toBe(true);
      const s1 = await readShow(showId);
      expect(s1.archived).toBe(true);
      expect(s1.published).toBe(false);
      const tokenAfterFirst = (await readShareToken(showId)).share_token;

      expect(await archiveShowReturning(showId)).toBe(false);
      const s2 = await readShow(showId);
      expect(s2.archived).toBe(true);
      // Side-effect probe: the no-op arm must NOT re-run the core — the share
      // token rotates on a PERFORMED archive only.
      expect((await readShareToken(showId)).share_token).toBe(tokenAfterFirst);
    } finally {
      await sqlClient`delete from public.shows where id = ${showId}::uuid`;
    }
  });

  it("publish_show: TRUE on held→live, FALSE on repeat with state unchanged", async () => {
    const { showId } = await seedHeldShow();
    try {
      expect(await publishShowReturning(showId)).toBe(true);
      expect((await readShow(showId)).published).toBe(true);

      expect(await publishShowReturning(showId)).toBe(false);
      expect((await readShow(showId)).published).toBe(true);
    } finally {
      await sqlClient`delete from public.shows where id = ${showId}::uuid`;
    }
  });

  it("unpublish_show: TRUE on live→held, FALSE on repeat", async () => {
    const { showId } = await seedHeldShow();
    try {
      expect(await publishShowReturning(showId)).toBe(true);

      expect(await unpublishShowReturning(showId)).toBe(true);
      expect((await readShow(showId)).published).toBe(false);

      expect(await unpublishShowReturning(showId)).toBe(false);
      expect((await readShow(showId)).published).toBe(false);
    } finally {
      await sqlClient`delete from public.shows where id = ${showId}::uuid`;
    }
  });

  it("refusal preservation (regression pin, green pre-migration): publish on archived raises SHOW_ARCHIVED_IMMUTABLE", async () => {
    const { showId } = await seedArchivedShow();
    try {
      await expect(publishShowReturning(showId)).rejects.toThrow(/SHOW_ARCHIVED_IMMUTABLE/);
    } finally {
      await sqlClient`delete from public.shows where id = ${showId}::uuid`;
    }
  });
});

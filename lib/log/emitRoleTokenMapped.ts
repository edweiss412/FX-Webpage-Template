import { log } from "@/lib/log";
import type { GatedRoleMapping } from "@/lib/sync/roleMappingOverlay";

/**
 * Post-commit ROLE_TOKEN_MAPPED emission (spec 2026-07-15-extend-role-scope-vocab §10 points 5/6).
 * Call AFTER the sync transaction commits, OUTSIDE the advisory-lock tx (invariant 10) — a
 * rolled-back / non-applied sync passes `[]` and emits nothing. One info-level app_event per
 * gate-passing token. `code` is a top-level field key (AST-checkable). Context is name-free
 * (`{ token, grants, newMemberCount }`) — crew names surface with names only in the changes feed
 * via ROLE_FLAGS_NOTICE, never here (§10 point 4, Codex R8 F2).
 */
export async function emitRoleTokenMapped(
  entries: readonly GatedRoleMapping[],
  ctx: { showId: string; source: string },
): Promise<void> {
  for (const e of entries) {
    await log.info("role token mapping applied", {
      source: ctx.source,
      code: "ROLE_TOKEN_MAPPED",
      showId: ctx.showId,
      token: e.token,
      grants: e.grants,
      newMemberCount: e.newMemberCount,
    });
  }
}

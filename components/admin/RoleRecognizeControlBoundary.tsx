"use client";

/**
 * components/admin/RoleRecognizeControlBoundary.tsx
 *
 * `"use client"` glue between a Server Component (per-show admin page) or an
 * already-client surface (wizard step-3) and the presentational
 * `<RoleRecognizeControl>` (spec 2026-07-15 §8.1). Mirrors `UseRawControlBoundary`:
 *
 *   - Imports the `"use server"` actions DIRECTLY (Next resolves them to RPC refs
 *     in the client bundle — the supported pattern; the closure that calls them is
 *     defined HERE in client code, never inline-wrapped across the RSC boundary).
 *   - Self-hides (null) unless the warning is an `UNKNOWN_ROLE_TOKEN` carrying a
 *     non-blank `roleToken` (guard, §8.1 — legacy warnings render nothing).
 *   - Binds the correct create action per surface (show → `mapRoleToken`, wizard →
 *     `mapRoleTokenStaged`) and routes REVISE-mode saves through
 *     `updateRoleTokenMapping` — the create affordance never mutates an existing
 *     row (§8.3), that is exclusively the settings-edit path.
 *   - Normalizes each typed result into a `RoleRecognizeSaveOutcome` so the control
 *     branches `stale`/`conflict` to their benign notices and everything else to
 *     the plain error copy — NEVER a raw code (invariant 5). No `router.refresh()`:
 *     each action already revalidates server-side, and the saved card is
 *     client-local until that refresh unmounts the control (§8.1 timing contract).
 */

import {
  RoleRecognizeControl,
  type RoleRecognizeSaveMode,
  type RoleRecognizeSaveOutcome,
} from "@/components/admin/RoleRecognizeControl";
import type { GrantableFlag } from "@/lib/sync/roleMappingOverlay";
import type { ParseWarning } from "@/lib/parser/types";
import type { WarningControlSite } from "@/components/admin/warningControlSite";
import { mapRoleToken } from "@/app/admin/show/[slug]/_actions/roleToken";
import { mapRoleTokenStaged } from "@/app/admin/onboarding/_actions/roleTokenStaged";
import { updateRoleTokenMapping } from "@/app/admin/settings/_actions/roleTokenMappings";

type SurfaceProps =
  | { surface: "show"; showId: string }
  | { surface: "wizard"; wizardSessionId: string; driveFileId: string };

export function RoleRecognizeControlBoundary(
  props: {
    /** The live warning; its `roleToken` is the create/edit key. */
    warning: ParseWarning;
    /** spec 2026-07-17 §8: render site, forwarded to the control (conditional spread below). */
    site?: WarningControlSite;
  } & SurfaceProps,
) {
  const { warning } = props;
  const token = warning.code === "UNKNOWN_ROLE_TOKEN" ? (warning.roleToken ?? "").trim() : "";
  if (token.length === 0) return null;

  const onSave = async (
    grants: GrantableFlag[],
    mode: RoleRecognizeSaveMode,
  ): Promise<RoleRecognizeSaveOutcome> => {
    if (mode === "revise") {
      // The existing mapping is edited through the sole sanctioned mutation path.
      // `updateRoleTokenMapping` runs NO show refresh, so the outcome is "revised"
      // (convergence = each show's next sheet check) — NOT "applied", which would
      // overclaim an immediate live effect on the saved card.
      const r = await updateRoleTokenMapping(token, grants);
      if (r.ok) return { kind: "saved", state: "revised", grants };
      if (r.code === "stale") return { kind: "stale" };
      return { kind: "error" };
    }
    const r =
      props.surface === "show"
        ? await mapRoleToken(props.showId, token, grants)
        : await mapRoleTokenStaged(props.wizardSessionId, props.driveFileId, token, grants);
    if (r.ok) return { kind: "saved", state: r.state, grants };
    if (r.code === "stale") return { kind: "stale" };
    if (r.code === "conflict") return { kind: "conflict" };
    return { kind: "error" };
  };

  return (
    <RoleRecognizeControl
      roleToken={token}
      onSave={onSave}
      {...(props.site ? { site: props.site } : {})}
    />
  );
}

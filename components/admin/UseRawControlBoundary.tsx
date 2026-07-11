"use client";

/**
 * components/admin/UseRawControlBoundary.tsx
 *
 * The `"use client"` glue between a Server Component (the per-show admin page) or
 * an already-client surface (the wizard step-3 review sections) and the shared
 * presentational `<UseRawControl>` (spec 2026-07-10-structural-transform-use-raw
 * §8). Its ONLY job is to build the per-warning `warningRef`, bind the correct
 * surface's server action, and refresh the route on success:
 *
 *   - It imports the `"use server"` action DIRECTLY (Next resolves that to an RPC
 *     reference in the client bundle — the supported pattern, not a value import
 *     that would drag server-only deps into the client chunk). This keeps the RSC
 *     page from passing an inline-wrapped closure across the server→client
 *     boundary (only `next build` catches that class), because the closure is
 *     defined HERE, in client code.
 *   - `onToggle` calls the action, THROWS on `!result.ok` (so `<UseRawControl>`
 *     surfaces its own plain-copy error state — never a raw code, invariant 5),
 *     and `router.refresh()`es on success so the durably-derived control state
 *     re-reads from persisted data.
 *
 * Serializable props only (the Server Component passes `warning`, `decision`,
 * `showId`) — no functions cross the boundary from the server side.
 */

import { useRouter } from "next/navigation";
import { UseRawControl } from "@/components/admin/UseRawControl";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { setUseRawDecisionAction } from "@/app/admin/show/[slug]/_actions/useRaw";
import { setStagedUseRawDecisionAction } from "@/app/admin/onboarding/_actions/useRawStaged";

type SurfaceProps =
  | { surface: "show"; showId: string }
  | { surface: "wizard"; wizardSessionId: string };

export function UseRawControlBoundary(
  props: {
    /** The live warning (full `ParseWarning` so `blockRef` is available for the ref). */
    warning: ParseWarning;
    /** The persisted decision matching this warning's `(code, contentHash)`, or undefined. */
    decision: UseRawDecision | undefined;
  } & SurfaceProps,
) {
  const { warning, decision } = props;
  const router = useRouter();

  const onToggle = async (useRaw: boolean): Promise<void> => {
    // The toggle affordances only mount in resolvable states, so `resolution` is
    // present + resolvable here; guard anyway and let a throw surface the error UI.
    const resolution = warning.resolution;
    if (!resolution || resolution.resolvable !== true) {
      throw new Error("warning_not_resolvable");
    }
    const warningRef = {
      code: warning.code,
      // In-scope resolvable warnings always carry a blockRef; fall back defensively.
      blockRef: warning.blockRef ?? { kind: "" },
      observedContentHash: resolution.contentHash,
    };
    const result =
      props.surface === "show"
        ? await setUseRawDecisionAction(props.showId, warningRef, useRaw)
        : await setStagedUseRawDecisionAction(props.wizardSessionId, warningRef, useRaw);
    // Throw on any typed failure so `<UseRawControl>` shows its plain error copy
    // (the code string is NEVER rendered — invariant 5).
    if (!result.ok) throw new Error(result.code);
    router.refresh();
  };

  return <UseRawControl warning={warning} decision={decision} onToggle={onToggle} />;
}

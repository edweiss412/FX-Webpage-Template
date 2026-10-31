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
 *   - The `"use server"` actions are imported DIRECTLY by a client module (Next
 *     resolves that to an RPC reference in the client bundle — the supported
 *     pattern, not a value import that would drag server-only deps into the client
 *     chunk); since warning-card-fixes §6.3 that module is components/admin/
 *     useRawDraft.tsx, also `"use client"`. This keeps the RSC page from passing an
 *     inline-wrapped closure across the server→client boundary (only `next build`
 *     catches that class), because the closure is defined HERE, in client code.
 *   - `onToggle` calls the action through `callUseRawAction` (components/admin/
 *     useRawDraft.tsx, shared with the reading-draft provider), THROWS on "failed" (so
 *     `<UseRawControl>` surfaces its own plain-copy error state — never a raw code,
 *     invariant 5), and `router.refresh()`es on success so the durably-derived control
 *     state re-reads from persisted data. Inside a `UseRawDraftProvider` the control
 *     never calls `onToggle`: selection is a draft and the action bar saves it.
 *
 * Serializable props only (the Server Component passes `warning`, `decision`, and the
 * surface locator — `showId`, or `wizardSessionId` + `driveFileId`) — no functions cross
 * the boundary from the server side.
 */

import { useRouter } from "next/navigation";
import { UseRawControl } from "@/components/admin/UseRawControl";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import type { WarningControlSite } from "@/components/admin/warningControlSite";
import { callUseRawAction, type UseRawSurface } from "@/components/admin/useRawDraft";

type SurfaceProps = UseRawSurface;

export function UseRawControlBoundary(
  props: {
    /** The live warning (full `ParseWarning` so `blockRef` is available for the ref). */
    warning: ParseWarning;
    /** The persisted decision matching this warning's `(code, contentHash)`, or undefined. */
    decision: UseRawDecision | undefined;
    /** spec 2026-07-17 §8: render site, forwarded to the control (conditional spread below). */
    site?: WarningControlSite;
  } & SurfaceProps,
) {
  const { warning, decision } = props;
  const router = useRouter();

  const onToggle = async (useRaw: boolean): Promise<void> => {
    // warning-card-fixes §6.3: the argument assembly and the action call live in
    // `callUseRawAction`, shared with the reading-draft provider. Throw on "failed" so
    // `<UseRawControl>` shows its plain error copy (no code reaches the DOM, invariant 5).
    const surface: UseRawSurface =
      props.surface === "show"
        ? { surface: "show", showId: props.showId }
        : {
            surface: "wizard",
            wizardSessionId: props.wizardSessionId,
            driveFileId: props.driveFileId,
          };
    if ((await callUseRawAction(surface, warning, useRaw)) === "failed") {
      throw new Error("use_raw_failed");
    }
    router.refresh();
  };

  return (
    <UseRawControl
      warning={warning}
      decision={decision}
      onToggle={onToggle}
      {...(props.site ? { site: props.site } : {})}
    />
  );
}

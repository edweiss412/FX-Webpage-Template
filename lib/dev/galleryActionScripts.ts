/**
 * lib/dev/galleryActionScripts.ts
 * (spec 2026-07-23-gallery-action-outcomes §3.1-§3.3)
 *
 * Pure builders turning a scenario's serializable `actionOutcomes` script into
 * the three delivery channels the gallery uses to demonstrate action-outcome
 * states without any real write:
 *
 *  1. `buildScriptedActions`  - the 8 modal action-prop closures (replaces
 *     `NOOP_ACTIONS` members per scripted key; identity when unscripted).
 *  2. `buildFetchScripts`     - scripted JSON responses (or a hang) served by
 *     `GalleryWriteGuard` for the fetch-based controls (re-sync, alert
 *     resolve, bulk ignore). Bodies mirror the routes' real envelopes.
 *  3. `buildActionOverrides`  - scripted implementations of the 3 direct-import
 *     server actions, mounted via `DevActionOverrideContext`.
 *
 * `pending` = a never-resolving promise: the components' own in-flight UI
 * (useActionState pending, useFormStatus, useTransition, busy flags) shows
 * indefinitely, which is exactly the state under demonstration.
 */
import type { PublishedReviewModalProps } from "@/components/admin/showpage/PublishedReviewModal";
import type { ActionKeys } from "@/lib/dev/galleryModalTypes";
import type { ScenarioActionOutcomes } from "@/lib/dev/attentionScenarios/types";
import type { resetCrewMemberSelection } from "@/lib/auth/picker/resetCrewMemberSelection";
import type { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";
import type { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";

type ModalActions = Pick<PublishedReviewModalProps, ActionKeys>;

/**
 * Eight no-op action closures (moved verbatim from AttentionModalSwitcher).
 * Each resolves to its action's contracted result so the modal's
 * `useActionState` reducers stay consistent, and NONE writes.
 * `unarchiveAction` is typed `(showId) => Promise<void>`, so its contracted
 * result IS `undefined` — that is correct, not an omission. `satisfies` pins
 * every shape to the real prop types (a drift is a compile error) while keeping
 * the concrete literal types for callers.
 */
export const NOOP_ACTIONS = {
  setPublished: async () => ({ ok: true }) as const,
  archiveAction: async () => ({ ok: true }) as const,
  unarchiveAction: async () => {},
  undoAction: async () => ({ ok: true }) as const,
  acceptAction: async () => ({ ok: true, count: 0 }) as const,
  acceptAllAction: async () => ({ ok: true, count: 0 }) as const,
  approveAction: async () => ({ ok: true }) as const,
  rejectAction: async () => ({ ok: true }) as const,
} satisfies ModalActions;

export type ScriptedFetchResponse = { status: number; body: unknown } | "hang";

export type GalleryFetchScript = {
  key: "resync" | "resolve" | "bulkIgnore";
  method: "POST";
  pathPattern: RegExp;
  respond: (callIndex: number) => ScriptedFetchResponse;
};

/** Scripted stand-ins for the 3 direct-import server actions (spec §3.3). */
export type GalleryActionOverrides = {
  resetCrewMemberSelection?: typeof resetCrewMemberSelection;
  rotateShareToken?: typeof rotateShareToken;
  resetPickerEpoch?: typeof resetPickerEpoch;
};

/** Fixed, deterministic gallery timestamps (no Date.now in scenario land). */
const GALLERY_RESET_AT = "2026-07-01T12:00:00.000Z";
const GALLERY_RESOLVED_AT = "2026-07-01T00:00:00.000Z";
const GALLERY_HELD_MODIFIED_TIME = "2026-06-29T00:00:00.000Z";

const hang = <T>(): Promise<T> => new Promise<T>(() => {});

/** Status the re-sync route pairs with each error code (route.ts:76-106). */
const RESYNC_ERROR_STATUS: Record<string, number> = {
  SYNC_INFRA_ERROR: 500,
  PENDING_SYNC_NOT_FOUND: 404,
  FINALIZE_OWNED_SHOW: 409,
  SHOW_BUSY_RETRY: 409,
};

export function buildScriptedActions(
  outcomes: ScenarioActionOutcomes | null,
  acceptableCount: number,
): ModalActions {
  if (outcomes === null) return NOOP_ACTIONS;

  const acts: ModalActions = { ...NOOP_ACTIONS };
  let scripted = false;

  const sp = outcomes.setPublished;
  if (sp !== undefined) {
    scripted = true;
    acts.setPublished = async () => {
      if (sp.kind === "pending") return hang();
      return sp.kind === "success" ? { ok: true } : { ok: false, code: sp.code };
    };
  }
  const ar = outcomes.archive;
  if (ar !== undefined) {
    scripted = true;
    acts.archiveAction = async () => {
      if (ar.kind === "pending") return hang();
      if (ar.kind === "success") return { ok: true };
      return { ok: false, code: ar.kind === "not_found" ? "show_not_found" : ar.code };
    };
  }
  const un = outcomes.undo;
  if (un !== undefined) {
    scripted = true;
    acts.undoAction = async () => {
      if (un.kind === "pending") return hang();
      return un.kind === "success" ? { ok: true } : { ok: false, code: un.code };
    };
  }
  const ac = outcomes.accept;
  if (ac !== undefined) {
    scripted = true;
    acts.acceptAction = async () => {
      if (ac.kind === "pending") return hang();
      return ac.kind === "success" ? { ok: true, count: 1 } : { ok: false, code: ac.code };
    };
  }
  const aa = outcomes.acceptAll;
  if (aa !== undefined) {
    scripted = true;
    acts.acceptAllAction = async () => {
      if (aa.kind === "pending") return hang();
      return aa.kind === "success"
        ? { ok: true, count: acceptableCount }
        : { ok: false, code: aa.code };
    };
  }
  const ap = outcomes.approve;
  if (ap !== undefined) {
    scripted = true;
    acts.approveAction = async () => {
      if (ap.kind === "pending") return hang();
      return ap.kind === "success" ? { ok: true } : { ok: false, code: ap.code };
    };
  }
  const rj = outcomes.reject;
  if (rj !== undefined) {
    scripted = true;
    acts.rejectAction = async () => {
      if (rj.kind === "pending") return hang();
      return rj.kind === "success" ? { ok: true } : { ok: false, code: rj.code };
    };
  }

  return scripted ? acts : NOOP_ACTIONS;
}

export function buildFetchScripts(outcomes: ScenarioActionOutcomes | null): GalleryFetchScript[] {
  if (outcomes === null) return [];
  const scripts: GalleryFetchScript[] = [];

  const rs = outcomes.resync;
  if (rs !== undefined) {
    scripts.push({
      key: "resync",
      method: "POST",
      pathPattern: /^\/api\/admin\/sync\//,
      respond: () => {
        switch (rs.kind) {
          case "pending":
            return "hang";
          case "success":
            return {
              status: 200,
              body: { ok: true, result: { outcome: rs.outcome ?? "applied" } },
            };
          case "shrink_held":
            return {
              status: 200,
              body: {
                ok: true,
                result: {
                  outcome: "shrink_held",
                  detail: rs.detail,
                  heldModifiedTime: GALLERY_HELD_MODIFIED_TIME,
                },
              },
            };
          case "error":
            return {
              status: RESYNC_ERROR_STATUS[rs.code] ?? 500,
              body: { ok: false, error: rs.code },
            };
        }
      },
    });
  }

  const rv = outcomes.resolve;
  if (rv !== undefined) {
    scripts.push({
      key: "resolve",
      method: "POST",
      pathPattern: /^\/api\/admin\/show\/[^/]+\/alerts\/[^/]+\/resolve$/,
      respond: () => {
        if (rv.kind === "pending") return "hang";
        if (rv.kind === "success") {
          return {
            status: 200,
            body: { status: "resolved", id: "gallery-alert", resolved_at: GALLERY_RESOLVED_AT },
          };
        }
        return { status: 500, body: { ok: false, code: rv.code } };
      },
    });
  }

  const bi = outcomes.bulkIgnore;
  if (bi !== undefined) {
    scripts.push({
      key: "bulkIgnore",
      method: "POST",
      pathPattern: /\/data-quality\/ignore$/,
      respond: (callIndex) => {
        if (bi.kind === "pending") return "hang";
        const okCount = bi.kind === "partial" ? bi.okCount : 0;
        if (callIndex < okCount) return { status: 200, body: { status: "ignored" } };
        // Synthetic, never-rendered code: BulkIgnoreControls branches on r.ok only.
        return { status: 500, body: { ok: false, code: "gallery_scripted_fail" } };
      },
    });
  }

  return scripts;
}

export function buildActionOverrides(
  outcomes: ScenarioActionOutcomes | null,
): GalleryActionOverrides | null {
  if (outcomes === null) return null;
  const overrides: GalleryActionOverrides = {};
  let scripted = false;

  const cr = outcomes.crewReset;
  if (cr !== undefined) {
    scripted = true;
    overrides.resetCrewMemberSelection = async () => {
      switch (cr.kind) {
        case "pending":
          return hang();
        case "success":
          return { ok: true, reset_at: GALLERY_RESET_AT };
        case "not_found":
          return { ok: false, code: "PICKER_CREW_MEMBER_NOT_FOUND" };
        case "error":
          return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
      }
    };
  }
  const ro = outcomes.rotate;
  if (ro !== undefined) {
    scripted = true;
    overrides.rotateShareToken = async () => {
      if (ro.kind === "pending") return hang();
      if (ro.kind === "success") {
        return { ok: true, new_share_token: "gallery-share-token-rotated", new_epoch: 2 };
      }
      return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    };
  }
  const er = outcomes.everyoneReset;
  if (er !== undefined) {
    scripted = true;
    overrides.resetPickerEpoch = async () => {
      if (er.kind === "pending") return hang();
      if (er.kind === "success") return { ok: true, new_epoch: 2 };
      return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    };
  }

  return scripted ? overrides : null;
}

/**
 * Count the acceptable entries in a scenario's serialized feed (the shaper's
 * own `acceptable` flag - components/ChangesFeed renders Accept for exactly
 * these). Drives the scripted acceptAll success count.
 */
export function countAcceptableEntries(
  feed: { entries: readonly { acceptable: boolean }[] } | null | undefined,
): number {
  return feed?.entries.filter((e) => e.acceptable).length ?? 0;
}

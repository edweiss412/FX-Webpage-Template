/**
 * app/admin/show/[slug]/_actions/undoAutoPublish.ts (M12.13 Task 12 — spec §6.2)
 *
 * Admin-gated in-app "Undo auto-publish" server action, shared by the per-show
 * footer button and the SHOW_FIRST_PUBLISHED alert-row action (one server action,
 * one shared client island, so copy/behavior cannot drift).
 *
 * requireAdmin() runs FIRST (defense in depth — the page already gates the
 * affordance off `undoWindowOpen && published && !archived`, but a direct action
 * dispatch must re-authorize). Then the action:
 *   1. reads the show's STORED `unpublish_token` by slug (raw-postgres seam —
 *      `readUnpublishTokenForSlug`). A null token means the mint vanished between
 *      render and click (someone else / another tab / the email link / expiry-
 *      sweep got there first): surface the CONSUMED catalog outcome — never call
 *      `unpublishShow` with a bad token, never crash, never leak a raw code.
 *   2. calls the PLAIN session-authed `unpublishShow({slug, token})` — NEVER the
 *      emailed-link wrapper `unpublishShowViaEmailedLink`, which requires the
 *      recipient binding `r`. The in-app caller is session-authed (requireAdmin
 *      already passed) and has no `r`; CONSUMED is allowed here (unlike the public
 *      emailed path, which renders a neutral not-found per §3/§5/R19).
 *   3. maps the typed UnpublishShowResult to a UI-facing outcome.
 *
 * Invariant 9: a returned OR thrown infra fault (token read or unpublishShow) maps
 * to `{ outcome: "infra_error" }`, which the button renders as a plain-language
 * retry state (no raw code in the DOM). Pinned by
 * tests/app/admin/undo-auto-publish-action.test.ts.
 *
 * not-subject-to-meta: this action uses a raw-postgres seam
 * (readUnpublishTokenForSlug) + the `unpublishShow` caller (itself a raw seam),
 * not a Supabase client; returned/thrown faults are caught here and surfaced as
 * the discriminable `infra_error` outcome, never a benign success/consumed.
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { revalidateShow } from "@/lib/data/showCacheTag";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { readUnpublishTokenForSlug, unpublishShow } from "@/lib/sync/unpublishShow";

/** UI-facing outcome of the in-app undo. The button maps each to its render state. */
export type UndoAutoPublishOutcome =
  | { outcome: "success" }
  | { outcome: "expired" }
  | { outcome: "consumed" }
  | { outcome: "infra_error" };

/**
 * Signature is `(slug, prevState, formData)` so a slug-bound reference
 * (`undoAutoPublishAction.bind(null, slug)`) is directly useActionState-
 * compatible — useActionState supplies the trailing `(prevState, formData)`.
 * The form also carries the slug as a hidden field for defense in depth, but the
 * bound argument is the authoritative source (the hidden field is ignored here).
 */
export async function undoAutoPublishAction(
  slug: string,
  _prevState?: UndoAutoPublishOutcome | null,
  _formData?: FormData,
): Promise<UndoAutoPublishOutcome> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();

  let storedToken: string | null;
  try {
    storedToken = await readUnpublishTokenForSlug(slug);
  } catch {
    return { outcome: "infra_error" };
  }

  // Token vanished between render and click → the catalog CONSUMED outcome
  // (single-use, already spent). No mutation attempt with a stale/empty token.
  if (storedToken === null) {
    return { outcome: "consumed" };
  }

  let result: Awaited<ReturnType<typeof unpublishShow>>;
  try {
    result = await unpublishShow({ slug, token: storedToken });
  } catch {
    return { outcome: "infra_error" };
  }

  switch (result.outcome) {
    case "success":
      // nav-perf tag-caching (Task 8/9): the undo unpublished + archived the show (published=false)
      // — gates crew visibility (getShowForViewer.ts:291). `unpublishShow` owns its own lock/tx and
      // has committed by the time it resolves, so revalidateShow(result.showId) here is POST-COMMIT.
      revalidateShow(result.showId);
      revalidatePath(`/admin/show/${slug}`);
      revalidatePath("/admin");
      // Durable admin-outcome telemetry (post-commit): unpublishShow owns its own
      // lock/tx and has committed by the time it resolves, so this await is safe.
      await logAdminOutcome({
        code: "SHOW_UNPUBLISHED_BY_ADMIN",
        source: "admin.show.undoAutoPublish",
        actorEmail: email,
        showId: result.showId,
      });
      return { outcome: "success" };
    case "expired":
      return { outcome: "expired" };
    case "consumed":
      return { outcome: "consumed" };
    case "not_found":
      // The show / token disappeared mid-flight (deleted, or the token was
      // cleared by a concurrent consume). In-app, treat as the catalog CONSUMED
      // outcome — no crash, no raw code (invariant 5).
      return { outcome: "consumed" };
  }
}

"use client";

/**
 * app/show/[slug]/[shareToken]/_StaleCleanupAutoSubmit.tsx
 *
 * M11.5 §B Task C3. One of the picker tree's 'use client' components
 * (spec §4.7 R25). Mounted by `<PickerInterstitial>` when the resolver
 * returns any of `epoch_stale | removed_from_roster | identity_invalidated`
 * — it renders an invisible form with the expected (epoch, crewMemberId)
 * tuple and auto-submits on mount via useEffect. The Server Action
 * `cleanupStaleEntry` compares the submitted tuple against the current
 * cookie envelope and only deletes the entry if both still match (the
 * compare-and-delete contract in spec §4.9 / R22).
 *
 * Why a separate client file: server components cannot run useEffect, and
 * Next App Router Server Action forms only auto-submit with client JS.
 * Keeping client boundaries few and small minimises hydration cost on the
 * picker page.
 */

import { useActionState, useEffect, useRef } from "react";
import { cleanupStaleEntry } from "@/lib/auth/picker/cleanupStaleEntry";

type CleanupResult = Awaited<ReturnType<typeof cleanupStaleEntry>>;

export function StaleCleanupAutoSubmit({
  slug,
  shareToken,
  showId,
  expectedEpoch,
  expectedCrewMemberId,
}: {
  slug: string;
  shareToken: string;
  showId: string;
  expectedEpoch: number;
  expectedCrewMemberId: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  // useActionState is the canonical repo pattern for binding a typed
  // Server Action into <form action> while keeping the action's return
  // value addressable (see app/admin/settings/admins/ReAddRowButton.tsx).
  // We don't read _result — the compare-and-delete contract is fire-
  // and-forget; the cookie clears on the server and the route revalidates.
  //
  // "and the user sees the fresh picker on next render" used to follow, and it
  // is not reliably true: `cleanupStaleEntry` revalidates a PATH, and the picker
  // is often reached at `?gate=skip`, whose entry that does not invalidate — the
  // same defect fixed in this file's sibling form action, where a roster tap
  // left the person on the picker until a reload. It is benign here because both
  // the current and the intended screen ARE the picker, and the effect has an
  // empty dep array so a stale render cannot re-submit in a loop; at worst a
  // cleared stale-entry hint lingers until the next navigation. Tracked as
  // BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT rather than changed here, because
  // the stale path has no prod-build e2e to prove a fix against.
  const [_result, formAction] = useActionState<CleanupResult | null, FormData>(
    async (_prev, formData) => cleanupStaleEntry(formData),
    null,
  );
  void _result;
  useEffect(() => {
    ref.current?.requestSubmit();
  }, []);
  return (
    <form
      ref={ref}
      action={formAction}
      className="sr-only"
      aria-hidden="true"
      data-testid="stale-cleanup-auto-submit"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="shareToken" value={shareToken} />
      <input type="hidden" name="showId" value={showId} />
      <input type="hidden" name="expectedEpoch" value={expectedEpoch} />
      <input type="hidden" name="expectedCrewMemberId" value={expectedCrewMemberId} />
    </form>
  );
}

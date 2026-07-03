// Shared publish-intent (approve/unapprove) POST helper for Step 3 review flow.
// not-subject-to-meta: internal Next API fetch, not a Supabase client call

/**
 * Post a publish intent (approve or unapprove) for a staged show onboarding.
 *
 * @param wizardSessionId - The wizard session ID
 * @param driveFileId - The Drive file ID of the show
 * @param next - true for approve, false for unapprove
 * @returns true on success (HTTP 200 with valid body or unparseable body);
 *          false on server refusal (200 + {ok:false}), HTTP error, or network error
 */
export async function postPublishIntent(
  wizardSessionId: string,
  driveFileId: string,
  next: boolean
): Promise<boolean> {
  const action = next ? "approve" : "unapprove";
  try {
    const res = await fetch(
      `/api/admin/onboarding/staged/${wizardSessionId}/${driveFileId}/${action}`,
      { method: "POST" }
    );
    if (!res.ok) return false;
    // The server returns HTTP 200 with `{ ok: false }` when it SAFELY refuses an
    // approve (e.g. a row that went dirty between render and click →
    // RESCAN_REVIEW_REQUIRED): the publish was NOT applied. Treat that as a failure
    // so flush reverts the optimistic box to server truth instead of leaving it
    // falsely checked/applied. A success body has no `ok` field (`{ status: ... }`),
    // so this only catches an explicit refusal. A 200 with no/invalid body is success.
    const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    if (body !== null && typeof body === "object" && body.ok === false) return false;
    return true;
  } catch {
    return false;
  }
}

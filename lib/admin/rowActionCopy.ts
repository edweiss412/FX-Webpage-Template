/**
 * lib/admin/rowActionCopy.ts — copy the dashboard row menu speaks for states
 * that carry no §12.4 code.
 *
 * Sibling of `lib/admin/archiveCopy.ts` and the sync fallback in
 * `lib/admin/syncRequest.ts`, and here for the same reason: these are
 * client-side STATE descriptions, not server outcomes, so there is no code to
 * route through `messageFor`. Keeping them out of the component also keeps the
 * M5-D8 guard's promise honest — inline literal error copy in `app/` or
 * `components/` is a defect, and an exemption comment would only hide that this
 * string belongs beside its two siblings.
 */

/**
 * Spoken when an answer arrives for a row that has since stopped accepting it —
 * the request was in flight when a background refresh unpublished the show. The
 * outcome region for that action is eligibility-gated and can no longer render,
 * so without this the admin fires an action and hears nothing at all.
 */
export const STALE_ROW_COPY =
  "This show changed while that was running, so the result no longer applies here. Open the show to see where it stands.";

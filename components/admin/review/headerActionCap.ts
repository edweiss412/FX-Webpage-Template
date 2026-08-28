/**
 * components/admin/review/headerActionCap.ts
 *
 * ONE definition of the review-modal header action cap, shared by both modals.
 *
 * The cap exists so the header's trailing action cluster cannot crowd out the
 * show title, which is `min-w-0 flex-1` and therefore absorbs every pixel the
 * cluster takes. Measured on the wizard modal at 375x667 before this cap
 * existed: a composite attention pill took 236px of a 375px viewport and the
 * title collapsed to 6.97px — no overflow and no scrollbar, so nothing visibly
 * broke; the title simply stopped existing.
 *
 * It is a CONSTANT rather than a literal repeated per surface because AC-18's
 * concern is drift: two copies measure identically right up until someone edits
 * one of them, and then the cap silently disagrees with itself. Two consumers of
 * one exported source cannot diverge at all, which serves that intent more
 * strongly than counting occurrences of a string. The guard now pins this
 * definition plus its registered consumers by name
 * (`publishedReviewModal.test.tsx`, AC-18).
 */
export const HEADER_ACTION_CAP = "max-sm:max-w-40";

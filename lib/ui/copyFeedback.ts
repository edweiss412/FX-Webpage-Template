/**
 * lib/ui/copyFeedback.ts — the shared copy-confirmation window.
 *
 * Spec: docs/superpowers/specs/2026-08-10-wifi-password-legibility.md §4.2
 *
 * WHY THIS MODULE EXISTS. Before this arc the 2 s clipboard-reset window was a
 * bare literal inside `ShareLinkCopyButton`, and adding a second copy control
 * would have made it two literals with no relationship. `DEFERRED.md`'s
 * SHARELINK-CONSTANTS-INVENTORY-1 named exactly that trigger — "any milestone
 * adding a third timing constant … the inventory should be swept and pinned by
 * a test rather than maintained by hand" — so the consolidation lands here and
 * the sweep's disposition is recorded in that entry.
 *
 * WHAT IS AND IS NOT SHARED. Both clipboard controls (`CopyFactValue`,
 * `ShareLinkCopyButton`) import this. `components/admin/wizard/Step1Share.tsx`
 * keeps its own `COPY_FEEDBACK_RESET_MS = 2200`: it is a wizard step whose
 * confirmation sits beside a longer instruction, and changing its window would
 * be a behavior change in a surface this arc does not touch. That peer is
 * recorded in the DEFERRED.md entry rather than silently folded in here.
 *
 * The value is 2 s because that is what shipped and what the existing
 * ShareLinkCopyButton suites pin; this module is a consolidation, not a
 * retuning.
 */
export const COPY_FEEDBACK_RESET_MS = 2_000;

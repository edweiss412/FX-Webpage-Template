# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-18 (ALERT-COPY-EMDASH-1 shipped via EMDASH-1 → archive; PR #469/#472 deferrals recorded below).

---

### ALERT-COPY-IDENTITY-BOLD-1 — [P3] Woven identity names render plain mid-sentence in stacked alert lists

From impeccable critique of PR #472 (30/40): condensed inline-context copy puts the show/sheet name in plain text inside the sentence; scanning a stacked bell list, Doug can't quickly spot WHICH show. Names are single-quoted (identity tier of `deriveAlertMessageParams`), which helps but is subtler than weight. Spec-ratified bare tokens (PR #469 wrapper-check saga) mean emphasis can't ride the template today.
**Un-defer trigger:** next alert-surface copy/UI pass, or user feedback that alerts are hard to scan. Fix shape: emphasis applied at render on the identity param span (not template markup), or bold via renderCatalogEmphasis param-aware pass.

### ALERT-CHEVRON-HINT-1 — [P3] Chevron behavior changed (expand → navigate) with no transition affordance

PR #472 reworked the bell caret from longform expander to show-page nav link (user-ratified). `aria-label="Open show page"` covers AT; a returning sighted user who learned "chevron = expand" gets no hint.
**Un-defer trigger:** any user confusion report, or the next bell-panel UX task. Fix shape: one-time dismissible hint chip or tooltip on first render post-deploy.

### ALERT-MULTI-CHANGE-TONE-1 — [P2→ratified] Multi-change ROLE_FLAGS_NOTICE renders as bold verbless bullet block; "show page" can appear 3×

From impeccable critique of PR #469 (27/40): the multi-change branch ("In 'X', 3 role changes:" + bullets, cap 3, "+N more — see show page.") is a spec-ratified format the user approved with preview; bold weight + phrase repetition + fragment lead noted as P2s.
**Un-defer trigger:** next alert-copy pass, or user feedback on the multi-change rendering. Fix shape: body-weight bullets or real `<ul>`, drop "— see show page" from the overflow line (link/chevron already carries it).

### MODAL-CLOSE-EXIT-ANIM-1 — [P1→ratified] X/Esc/scrim close is an instant unmount (no exit animation) while drag-dismiss animates out

From impeccable critique of the admin-show-modal branch (33/40): every non-drag close affordance funnels through `useShowModalNav().close` (a `router.push`), so the modal lingers until the RSC roundtrip returns, then unmounts with no exit transition — asymmetric with the drag-dismiss slide-out, and can read as laggy on venue cellular. **Declined as a defect: the spec's transition inventory explicitly ratifies "open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today (no exit animation)" (docs/superpowers/specs/2026-07-18-admin-show-modal.md:147), preserving Step3 chrome parity.**
**Un-defer trigger:** user feedback that closing feels laggy/broken, or a future motion pass touching ReviewModalShell — then add an optimistic local dismiss transition (play the reverse sheet/pop animation immediately, fire `router.push` behind it) to BOTH consumers so Step3 parity holds.

### MODAL-SKELETON-CLOSE-1 — [P2] Suspense skeleton frame has a no-op onClose — Esc/scrim dead while the loader streams

`ShowReviewModalSkeleton` mounts the shell with `onClose={() => {}}` and no live close control (spec §4 ratifies an "open, non-interactive modal frame"). On a slow load the user's only escape is browser-back; body scroll is locked and the background inert. Skeleton is a client component, so it COULD wire `useShowModalNav().close` without crossing the RSC boundary.
**Un-defer trigger:** any report of a stuck loading modal, or the next ReviewModalShell/skeleton task — wire the skeleton's onClose to `useShowModalNav().close` and render a real close button in place of the placeholder block (spec amendment: relax "non-interactive" to "content-non-interactive").

### MODAL-STRIP-CHROME-1 — [P2] StatusStrip keeps page-context chrome (`sticky top-0 z-30 border-b shadow-tile px-4`) inside the modal header

Inside the shell's `<header>` (which carries its own `border-b border-border px-tile-pad`), the strip's sticky/z are inert and its border-b + shadow-tile stack a doubled seam above the header's own bottom border, plus doubled horizontal padding. Source-inferred (browser render skipped in critique); cosmetic. Fix needs a StatusStrip chrome variant prop, which bumps the pageTransitions conditional-count pin (`tests/components/admin/showpage/pageTransitions.test.tsx`) — deliberately not landed mid-close-out.
**Un-defer trigger:** first visual QA pass on the shipped modal confirming the seam, or the next StatusStrip task — add a `chrome?: "page" | "modal-header"` prop dropping sticky/z/shadow/border/px in modal mode and update the count pin.

### PERSHOW-LINK-TAPTARGET-1 — [P3, pre-existing] Per-show action/help links lack the tap-target/focus-ring sizing BellPanel's equivalents carry

From impeccable audit of PR #472 (18/20): `PerShowAlertSection` action + Learn-more links follow that file's existing quiet-link pattern (no `min-h-tap-min`/`ring-offset-surface`), while BellPanel's `HELP_LINK`/`LINK_CTA` carry both. Pre-existing inconsistency, not a #472 regression.
**Un-defer trigger:** next PerShowAlertSection UI task — align both link classes with the BellPanel vocabulary.

---

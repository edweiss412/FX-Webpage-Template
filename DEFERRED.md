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

### PERSHOW-LINK-TAPTARGET-1 — [P3, pre-existing] Per-show action/help links lack the tap-target/focus-ring sizing BellPanel's equivalents carry

From impeccable audit of PR #472 (18/20): `PerShowAlertSection` action + Learn-more links follow that file's existing quiet-link pattern (no `min-h-tap-min`/`ring-offset-surface`), while BellPanel's `HELP_LINK`/`LINK_CTA` carry both. Pre-existing inconsistency, not a #472 regression.
**Un-defer trigger:** next PerShowAlertSection UI task — align both link classes with the BellPanel vocabulary.

---

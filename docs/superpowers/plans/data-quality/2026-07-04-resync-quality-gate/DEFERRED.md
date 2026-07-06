# DEFERRED.md — Re-sync quality gate (RESYNC_SHRINK_HELD)

Deferral discipline (per AGENTS.md): land-now vs DEFERRED (will-do, concrete
trigger) vs BACKLOG (might-do, speculative). Entries here are **will-do** with a
named trigger.

---

## DEF-RSH-1 — ReSyncButton drops focus to `<body>` when the shrink confirm unmounts (impeccable audit, P3/LOW)

**Surface:** `components/admin/ReSyncButton.tsx` — the held-shrink confirm region
(`data-testid="admin-resync-shrink-confirm"`).

**Finding (impeccable dual-gate round 2, 2026-07-05, on commit `2e40883f`):**
When the confirm region unmounts — either via the safe "Keep current version"
dismiss (`setHeldShrink(null)`) or after a successful apply — focus falls to
`<body>` instead of returning to the persistent "Re-sync from Drive" trigger
(WCAG 2.4.3). The audit scored it P3 and explicitly non-blocking; critique
PASSed clean. Invariant-8 requires only HIGH/CRITICAL findings to be fixed or
deferred, so this does not gate the milestone.

**Why deferred, not fixed in the dual-gate pass:** The gap is not specific to the
new dismiss path — it **mirrors the component's pre-existing success-path focus
behavior** (post-apply `router.refresh()` re-render also drops focus). Fixing
only the new dismiss path while leaving the success path inconsistent would be a
net regression in coherence; the correct fix is a single whole-component 2.4.3
focus-return pass (trigger ref + restore on every region unmount, success and
dismiss alike). That is a self-contained a11y polish with no dependency on this
feature's data-safety behavior, so it is cleanly separable.

**Trigger:** the next focus-management / a11y sweep that touches
`components/admin/ReSyncButton.tsx`, or a dedicated WCAG 2.4.3 audit of the admin
per-show action controls — whichever lands first.

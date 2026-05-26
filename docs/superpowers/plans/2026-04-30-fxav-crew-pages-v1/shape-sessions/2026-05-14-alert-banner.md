# Shape brief — AlertBanner polish (Cluster C4)

**Date:** 2026-05-14
**Cluster:** C4
**Items:** M5-D3 (queue depth + Resolve confirmation + raised_at display)
**Implementer:** Opus / Claude Code
**Status:** Awaiting confirmation

---

## 1. Feature Summary

Polish `components/admin/AlertBanner.tsx` so Doug (on the venue floor, glancing at his phone between cues) can (a) see when more alerts are queued behind the top one, (b) recover from an accidental tap on a P0 alert, and (c) understand how urgent the alert is by reading its age inline.

## 2. Primary User Action

Doug taps `/admin` mid-show, sees the banner, decides in <3 seconds whether to act now or finish his cue. The age tells him urgency; the queue chip tells him scope; the Resolve confirmation protects him from a misfire.

## 3. Design Direction

- **Color strategy:** Restrained. The banner inherits `--color-warning-bg` (warm yellow) from existing styling. Orange used only on the "Confirm resolve" two-tap state and on the count chip's `+N more ▸` link. The `Resolve` button stays in its current accent treatment.
- **Theme scene sentence:** Doug, mid-show in a dim ballroom, glances at his phone for the alert banner that just notified him; one hand on his comms pack, one on the phone. The banner must read at a glance and never let an accidental thumb-press take down a P0 alert.
- **Anchor references:**
  - GitHub's banner-with-count-link (where issues notify with a small "+N similar" link).
  - Apple Calendar's tappable event-block-with-confirmation (long-press + confirm — but we're going two-tap inline, not press-and-hold).
  - PagerDuty's incident strip (compact, severity-aware, age-prominent).
- **Anti-references:** Datadog's modal-confirm-everything UX (too many clicks). Generic Bootstrap dismissible alert (no confirmation, no recovery).

## 4. Scope

- **Fidelity:** Production-ready.
- **Breadth:** `components/admin/AlertBanner.tsx` + new `resolveAdminAlertFormAction` (already exists; minor change to accept the inline-confirm state). Possibly extract a `lib/time/relativeMinutes.ts` helper if `lib/time/relative.ts` doesn't yet cover ≤24h granularity.
- **Interactivity:** Two-tap confirmation flow on Resolve. Optional `+N more` link if queue depth >= 2.
- **Time intent:** Polish-until-it-ships. P0 alert misfire is the highest-stakes mistake; the inline confirm is the load-bearing change.

## 5. Layout Strategy

### 5.1 Banner anatomy

```
┌────────────────────────────────────────────────────────────┐
│ REPORT_ORPHANED_LOST_LEASE                                 │ ← code eyebrow
│ Report ID 84a3b29... orphaned with no lease.               │ ← Doug-facing copy
│ Raised 14 minutes ago               +3 more ▸              │ ← raised_at + queue
│                                                            │
│ [ Resolve ]                                                │ ← primary action
└────────────────────────────────────────────────────────────┘
```

After Resolve clicked:
```
┌────────────────────────────────────────────────────────────┐
│ REPORT_ORPHANED_LOST_LEASE                                 │
│ Report ID 84a3b29... orphaned with no lease.               │
│ Raised 14 minutes ago               +3 more ▸              │
│                                                            │
│ [ Confirm resolve ]   Cancel                               │ ← 3s auto-revert
└────────────────────────────────────────────────────────────┘
```

### 5.2 raised_at — relative + tooltip absolute

- Render: `Raised <N> <minutes|hours|days> ago` for ≤7 day age; `Raised on Apr 14` for older.
- Tabular figures on the number: `font-tabular`.
- `<time dateTime={isoString} title={absoluteFormatted}>` carries the absolute time as both `dateTime` attribute (semantic) AND `title` (visible on hover/long-press).
- Position: under the message, before the count chip on the same row.
- Class: `text-xs text-text-subtle`.

### 5.3 Queue depth chip — `+N more ▸`

- Render iff `queue_depth - 1 > 0` where `queue_depth = COUNT(*) FROM admin_alerts WHERE resolved_at IS NULL`.
- Position: right-aligned on the raised_at row (uses `flex justify-between` on that row).
- Class: `text-xs text-text-subtle hover:text-accent-on-bg underline-offset-2 hover:underline`.
- Target: `/admin/alerts` (the feed page is M9/M10 territory; if the route doesn't exist yet, the chip links to `/admin#alerts` as a forward-compatible anchor — implementation discovers and defers if no feed page yet).
- ARIA: `<a aria-label="View 3 more unresolved alerts">+3 more ▸</a>`.
- Tap target: meets 44×44 minimum via `py-2 px-3` padding on the link, even though visual chrome is text-only.

### 5.4 Resolve two-tap confirmation

**Implementation:** client-side state in a small React island OR inline via Server Action + URL param (e.g., `?confirm=<alertId>`). Decision deferred to implementation. The latter is preferred (no client island; matches the existing form-action posture); only fall back to a client island if URL-param state breaks the existing posture.

**State flow:**
| State | Render | Behavior |
|---|---|---|
| `idle` (default) | `[ Resolve ]` button, primary accent style | Click → `confirm` state |
| `confirm` | `[ Confirm resolve ]` button (orange `bg-accent`, `text-accent-text`) + `Cancel` link, sibling | Click button → submits form. Click `Cancel` → back to `idle`. 3s of inaction → auto-revert to `idle`. |
| `resolving` (post-submit) | Button disabled, `Resolving…` label | Until Server Action completes. Then page revalidates and banner either swaps to next alert or returns null. |

**Auto-revert:** `setTimeout(() => setState('idle'), 3000)` on entering `confirm`. Cleared on `Cancel` click or form submit.

**Cancel link:** `text-sm text-text-subtle underline-offset-2 hover:text-text` to the right of the Confirm button. Plain `<button type="button">` (not a link — it cancels client state, doesn't navigate).

**Accessibility:** the button label change announces via the existing `aria-live="polite"` wrapper (the banner is already `role="status"`). The orange `bg-accent` on Confirm gives a visual signal beyond text alone (covers color-blind users — paired with text change "Resolve" → "Confirm resolve").

### 5.5 Dimensional invariants

| Parent → Child | Guarantee |
|---|---|
| Banner flex row → eyebrow + body + meta-row + actions stack | Block flow; no fixed-height constraint. |
| meta-row (raised_at + queue chip) | `flex items-center justify-between` (the time on the left, chip on the right). On narrow viewports (`< 360px`), wrap chip below time. |
| Resolve / Confirm / Cancel | All ≥44×44 tap targets via padding. |

## 6. Key States

| Banner state | What renders |
|---|---|
| No alerts | Banner returns `null` (existing behavior preserved). |
| 1 unresolved alert | Top alert + raised_at + no queue chip + Resolve button (idle). |
| 2+ unresolved alerts | Top alert + raised_at + `+N more ▸` chip + Resolve button (idle). |
| Resolve clicked | Confirm + Cancel state per §5.4. |
| Resolve confirmed | Server Action submits; banner re-renders with next alert OR null. |
| Resolve auto-reverted | Back to idle after 3s of inaction. |
| Per-show alert (existing behavior) | "View show" link instead of inline Resolve; raised_at + queue chip still render. |

## 7. Interaction Model

- **Resolve idle → confirm:** single tap. State change is visual + announced via the banner's existing `aria-live="polite"`.
- **Confirm → resolve:** single tap. Submits the form. Button disables; `Resolving…` label until server returns.
- **Cancel → idle:** single tap. Clears state, no server round-trip.
- **3s timeout:** if no Cancel and no Confirm, auto-revert. Protects Doug if he tapped Resolve then put his phone down.
- **+N more chip:** standard Link navigation. No confirmation needed (it's read-only routing).
- **Hover on raised_at:** title tooltip shows absolute time. Touch: long-press also shows tooltip (browser-native).

## 8. Content Requirements

| Surface | Literal copy |
|---|---|
| Resolve idle button | `Resolve` (unchanged) |
| Resolve confirm button | `Confirm resolve` |
| Cancel button | `Cancel` |
| Resolving label | `Resolving…` |
| raised_at <1min | `Raised just now` |
| raised_at 1-59 min | `Raised <N> minutes ago` |
| raised_at 1-23 hrs | `Raised <N> hours ago` |
| raised_at 1-7 days | `Raised <N> days ago` |
| raised_at >7 days | `Raised on <Mon D>` (e.g., `Raised on Apr 14`) |
| Queue chip | `+<N> more ▸` |
| Queue chip aria-label | `View <N> more unresolved alerts` |

## 9. Recommended References

- DESIGN.md §1 — orange-on-accent contrast for the Confirm state.
- DESIGN.md §5 — `--duration-fast` (220ms) for any micro-transition on button label swap. Brief authorizes either an instant swap (preferred — confirmation should feel committed, not animated) or a `--duration-fast` opacity crossfade on the label text. No motion choice is load-bearing.
- Spec §4.6 — `admin_alerts` table schema.
- Spec §12.4 — catalog rendering via `<ErrorExplainer surface="admin">`.
- Memory `feedback_iterate_until_convergence.md` (M9 review discipline).

## 10. Open Questions

1. **Feed route for `+N more ▸`** — does `/admin/alerts` exist? Implementation will check. If not, the chip links to `/admin#alerts` as a placeholder, and a follow-up cluster (or future M10) builds the feed page.
2. **Two-tap inline confirm — client island vs. URL-param state** — implementation decides. Default: URL-param (`?confirm=<alertId>`) so the existing Server Action posture stays clean. Fall back to client island only if URL-param state breaks accessibility or test isolation.
3. **Confirm orange contrast** — `--color-accent-text` on `--color-accent` is 4.07:1 light / 11.3:1 dark. Confirm button uses `text-sm font-semibold` (matches `accent-bg text` ≥14pt-bold restriction per DESIGN.md §1.2). Verified.

## 11. Anti-goals

- **No modal.** The banner is already an interruption; opening a modal on top of it is gratuitous. Two-tap inline is the right ceiling for confirmation friction.
- **No undo toast.** Resolve is destructive; the two-tap confirm IS the undo mechanism. A post-resolve toast adds noise without changing the irreversibility.
- **No icon-only buttons.** Resolve / Confirm / Cancel are all text-labeled. Color-blind crew exist.
- **No new tokens.** All sizes, colors, and motions consume existing tokens.

## 12. Definition of done

- AlertBanner renders raised_at relative time + tooltip absolute per §5.2.
- AlertBanner renders `+N more ▸` chip when queue depth >= 2.
- Resolve button supports two-tap confirm with 3s auto-revert, Cancel link, and disabled `Resolving…` post-submit state.
- All affected unit + e2e tests updated.
- `pnpm typecheck` + `pnpm lint` clean.
- `/impeccable critique` + `/impeccable audit` dual gate pass on the C4 diff.
- Codex adversarial review converges to APPROVE.

# Shape Brief — Bell Notification Redesign

**Date:** 2026-07-06 · **Register:** product (admin UI) · **Owner:** Opus / Claude Code · **Source:** Claude Design import "Bell Notification Redesign.dc.html" (treated as **directional**, not a verbatim port).

## 0. Intent & scope

Visual + structural restyle of the **existing, feature-complete** `NotifBell` (`components/admin/nav/NotifBell.tsx`) and `BellPanel` (`components/admin/BellPanel.tsx`). Every feature in the mock already ships (active/history sections, occurrence chips, helpful-context expansion, Resolve/Retry actions, empty/error/loading states, desktop-dropdown/mobile-sheet, realtime badge). This is a **restyle**, not new capability.

**Non-negotiable: preserve every behavioral contract and every `data-testid`** except the two explicitly retired below. No new API routes. No new server-side `BellEntry` fields. Severity is derived **client-side** from the message catalog. This is UI-only (`components/` + `app/globals.css` + `DESIGN.md`); no `app/api/**`, no DB, no advisory-lock, no mutation-surface changes → invariant-10 telemetry surface is untouched, invariant-9 Supabase boundary untouched.

## 1. Deltas the mock introduces (adopt) vs. current

| # | Mock element | Current | Decision |
|---|---|---|---|
| D1 | **Desktop: anchored dropdown** under the bell (`right:0; top:calc(100%+10px)`), up-caret, **transparent** click-catcher overlay (no dimming scrim). | Centered-modal with `bg-text-strong/40` scrim on desktop too. | **Adopt.** Anchor on desktop; keep mobile bottom-sheet + dark scrim identical. Switch is **pure responsive Tailwind** — panel `fixed inset-0 … sm:absolute sm:inset-auto sm:right-0 sm:top-[calc(100%+10px)]`, overlay `fixed inset-0` with `bg-overlay-scrim sm:bg-transparent`, caret `hidden sm:block`, handle `sm:hidden`. NotifBell wraps trigger+panel in a `relative` container so the panel anchors to the bell. **`aria-modal="true"` stays on both** (the transparent desktop overlay is a full-screen click-catcher → outside interaction is genuinely blocked → modal semantics are honest; focus trap stays). **No matchMedia JS.** **Highest-risk item.** |
| D2 | **Severity icon-circle** (34px) leading each active row: error/warn/info. | No severity indicator. | **Adopt, data-driven from catalog + `isHealth`.** Tone = `isHealth` → **critical** (status-degraded, `TriangleAlert`); else catalog `severity==="info"` → **info** (accent-on-bg, `Info`); else → **notice** (status-warn, `CircleAlert`). Color reinforces; icon-shape + title text carry meaning → DESIGN.md §1 color-blind floor holds (never color-alone). |
| D3 | **"Mark all read"** button in header (accent text), shown when unread active rows exist. | None (opening the panel already advances the `/bell/open` watermark, `BellPanel.tsx:530-542`; the badge is already zeroed by `zeroNow()` on open, `NotifBell.tsx:39-42`). | **Adopt, client-side, reusing the existing `/bell/read` path** (`BellPanel.tsx:550-571`). It routes each still-unread active row through the **exact** first-expand read path — the shared `readFiredRef`/`readClearedIds` sets and the same per-row fail-quiet contract (§4/`BellPanel.tsx:567-569`: a failed POST leaves the marker cleared for the session; the server watermark is authoritative on next open). **Failure policy = the existing single-row contract, unchanged:** optimistic clear, per-row fail-quiet, no rollback, no new cataloged error, no forced refetch (the badge is already zero while open; `/bell/open` governs cross-open truth). `readFiredRef` guarantees a row already read is not re-POSTed. **No new API, no new failure mode.** |
| D4 | **Unread = row background tint** + semibold title (mock `#fdf7f0`); **no standalone dot.** | Standalone accent dot in a fixed margin slot (`bell-unread-dot-{id}`), opacity flip on read. | **Adopt row-tint.** Retire the standalone dot element; unread now drives row `bg-stale-tint` + semibold title, cleared on first expand (same `readCleared` logic, different target). No layout shift (bg + font-weight only). |
| D5 | Occurrence chip **"Seen N×"** with a repeat icon. | `×N` pill. | Restyle to `Seen {N}×` + `RotateCcw` icon; keep `>1` gate + `OccurrenceChip`. |
| D6 | Helpful context in a **tinted box** (surface-sunken, rounded, info icon). | Plain indented text. | Restyle; keep `bell-context-{id}` + expand gating. |
| D7 | History row: **teal check-circle** icon + title + resolved time. | Bare title + time. | Restyle (`CircleCheck`, status-positive). |
| D8 | Empty state: **teal check-circle in tinted circle** + headline + subline. | Sunken card + "You're all caught up." + history-window line. | Restyle; keep `bell-empty` + history-window line (dev-relevant). |
| D9 | Desktop footer **"View activity log →"**. | Dev-only `DevFooter` (window/cap config). | Keep `DevFooter` (dev-only). Add the "View activity log →" link **dev-only**, pointing at `/admin/dev/telemetry` (the only real activity surface). **No dead link for non-dev Doug.** |
| D10 | Active eyebrow **"ACTIVE"** + count pill. | "Active (N)" text heading. | Restyle to eyebrow + accent-tinted count pill; keep `bell-section-active-heading`. |

## 2. Diverge from the mock (craft judgment; "directional")

- **Tokens, not hex.** Every mock hex maps to an existing project token (§3). Zero inline hex in the components.
- **Red usage.** Mock uses raw `#c0392b` for error and applies red freely. Project reserves red to `--color-status-degraded` (DESIGN.md §1.3), always paired with a label. Critical tone = `status-degraded`, only for `isHealth` rows, always beside the title text. Non-health actionable alerts (sync failed, channel expired) are **amber notice**, not red — matches the project's "amber for problems, red only for degraded health" posture.
- **First-class dark mode.** Mock is light-only; PRODUCT/DESIGN mandate both. Every new element themes in dark via tokens (§3).
- **No mock green.** Mock history/empty use `#3f8a83` which is already the project's non-green `status-positive` teal — kept.

## 3. Token map (mock hex → project token) + new tokens

Existing (1:1): `#fafaf9`→`bg` · `#fff`→`surface` · `#f4f3f1`→`surface-sunken` · `#1a1b1f`→`text` · `#0e0f12`→`text-strong` · `#5a5b62`→`text-subtle` · `#8b8c92`→`text-faint` · `#e5e4e0`→`border` · `#cfcdc7`→`border-strong` · `#ff8c1a`→`accent` · `#c25e00`→`accent-on-bg` · `#3f8a83`→`status-positive` · `#b3261e`→`status-degraded` · `#b26a16`→`status-warn` · scrim→`overlay-scrim` · popover shadow→`shadow-popover` · panel radius→`radius-lg` (16).

Reused tints: warn icon-circle bg → `warning-bg`; unread row tint → `stale-tint`.

**New tokens** (add to `@theme` + `:root` + both dark blocks in `app/globals.css`, document in `DESIGN.md` §1.1 + contrast in §1.2):
- `--color-accent-tint` — info icon-circle bg **and** active-count-pill bg. Light `#feeede`, dark `#2a1e10` (warm, low-chroma). Icon/text on it = `accent-on-bg` (dark: `#ffa047`) → verify ≥3:1 graphical / ≥4.5:1 text.
- `--color-danger-bg` — critical icon-circle bg. Light `#fbeae8`, dark `#3a1e1c`. Icon on it = `status-degraded` → verify ≥3:1 graphical.

`tests/styles/status-token-contrast.test.ts` gets rows for the two new tint↔icon pairs (graphical ≥3:1 both modes).

## 4. Motion

- **Desktop dropdown:** pop-in (translateY(-6px) + scale(0.985)→1), `--duration-normal` `--ease-out-quart`. Reuse/add a `bell-pop-in` keyframe (pattern already exists as `step3-details-pop-in`). Transform-origin top-right.
- **Mobile sheet:** existing `sheet-rise`.
- **Scrim (mobile):** fade via existing pattern.
- Caret rotate, row-tint fade, mark-all-read: existing `--duration-fast` transitions.
- All gated behind `motion-safe:`; reduced-motion collapses durations to 0 (global block).

## 5. Behavioral contracts that MUST stay green (regression fences)

4-source badge + `zeroNow` on open + degraded `!` chip + `9+` cap · feed load → `/bell/open` exactly-once (seq guard) → `onOpened` badge refetch · per-row `/bell/read` once on first expand · resolve/retry/telemetry/action routes + door order + refetch-after · realtime ping refetch · dev-footer config 400-bounds echo · focus trap (`useDialogFocus`) + Esc + overlay/scrim dismiss + persistent sr-only `role=status` live region · load-order (open never before feed) · snapshot-safe watermark (server `seenThrough`, never client clock).

## 6. Testids

**Preserve:** `admin-notif-bell`, `admin-notif-bell-degraded`, `admin-notif-badge`, `bell-panel`, `bell-panel-backdrop`, `bell-panel-close`, `bell-live-region`, `bell-loading`, `bell-error`, `bell-empty`, `bell-section-active`, `bell-section-active-heading`, `bell-section-history`, `bell-entry-{id}`, `bell-entry-toggle-{id}`, `bell-caret-{id}`, `bell-context-{id}`, `bell-resolve-{id}`, `bell-telemetry-{id}`, `bell-auto-note-{id}`, `bell-action-{id}`, `bell-truncation-row`, `bell-dev-footer`, `bell-config-history`, `bell-config-cap`, `bell-config-save`, `bell-config-error`.

**Retire (update owning tests):** `bell-unread-dot-{id}` → replaced by row-level unread marker `data-testid="bell-entry-{id}"` carrying `data-unread="true|false"` (tests assert the attribute instead of dot opacity).

**Add:** `bell-mark-all-read` (header button), `bell-sev-{id}` (severity icon-circle, `data-tone`), `bell-activity-log` (dev footer link).

## 7. Test strategy (TDD)

1. **Update failing-first:** amend `notifBell` / `bellPanel` / `bellPanelActions` / `bellPanelDeferrals` tests for the retired dot → `data-unread` attribute; add assertions for severity tone (`data-tone` from a health vs info vs default fixture), `bell-mark-all-read` (visible with unread, clears markers + fires `/bell/read` per unread row), header/empty/history restyle testids. `aria-modal="true"` assertion is unchanged (stays true both modes).
2. **Contrast:** extend `status-token-contrast.test.ts` for the two new tint pairs.
3. **Layout e2e:** update `tests/e2e/bell-panel-layout.spec.ts` for the anchored-desktop geometry (dropdown right-aligned under the bell; caret present; no full-screen dim on desktop) + mobile sheet unchanged; keep the fixed-parent BoundingRect assertions.
4. Full `pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm format:check` before push (memory: scoped gates miss regressions).

## 8. Disagreement-loop preempts (for the reviewer)

- **Anchored desktop dropdown (D1)** is an intentional UX upgrade, the core reason a redesign was requested; not a modal regression. `aria-modal="true"` and the focus trap are **retained on both modes** — the transparent desktop overlay is a full-screen click-catcher that blocks outside interaction, so modal semantics remain honest (this diverges from the mock's `aria-modal` toggle by design, and keeps the layout switch pure-CSS with no matchMedia JS).
- **Amber-not-red for non-health alerts (§2)** is deliberate per DESIGN.md §1.3, not a fidelity miss vs the mock's red.
- **Mark-all-read reuses `/bell/read`** — no new endpoint, no new mutation surface, so invariant-10 registry is not implicated.
- **Severity derived client-side** from `messageFor(code).severity` + `isHealth` — no feed/wire/API change, mirroring the existing client-side `rowCopy` catalog read.
- **"View activity log" is dev-only** — no user-facing activity route exists; a dead link for Doug would violate PRODUCT principle 5.

## 9. Live-code citations (verified 2026-07-06 against origin/main `4f3ed201`)

**Components / mount:** `NotifBell` `components/admin/nav/NotifBell.tsx:25` (degraded branch `:44-62`, badge `:76-83`, `useBellBadge` `:32`, `zeroNow` on open `:39-42`, `BellPanel` mount `:91`). `BellPanel` `components/admin/BellPanel.tsx:428` — overlay/backdrop (`fixed inset-0`, `bg-text-strong/40` scrim, `bell-panel-backdrop`) `:719-733`; panel shell (`max-w-[420px]`, `rounded-t-md sm:rounded-md`, `sheet-rise`) `:734-736`; drag handle `sm:hidden` `:749-752`; header + `bell-panel-close` `:753-769`; scroll (`max-h-panel-max-mobile sm:max-h-panel-max`) `:770`; sr-only live region `:746`. `ActiveRow` `:215` — unread dot `bell-unread-dot-{id}` opacity flip `:250-256`; title weight `:260-266`; `OccurrenceChip` `×N` `:120-127`/`:268`; caret gated on helpful `:279-287`; message `:290-294`; helpful disclosure `:300-307`; `IdentityLine` `:129-133`. `ActionCell` `:140` — telemetry link `bell-telemetry-{id}` `:164-171`, auto-note `:172-178`, `bell-resolve-{id}` `:180-190`, watch Retry `:195-199`, `bell-action-{id}` `:200-210`. `HistoryRow` `:315-327`. Active section heading `Active (N)` `bell-section-active-heading` `:660-669`. History section `:683-696`. Empty `bell-empty` `:646-655`. Error `bell-error` `:627-641`. Loading `bell-loading` `:621-626`. Truncation `:697-706`. `DevFooter` `:329-426`. Panel dialog root `role=dialog aria-modal=true` `:719-724`. Mount site: `components/admin/nav/AdminNav.tsx:139` (beside `AppHealthIndicator` `:137`, `ThemeToggle` `:140`).

**Behavior contracts:** feed→open exactly-once seq guard `BellPanel.tsx:475-545`; per-row read once `:550-571`; realtime ping refetch `:603-608`; Esc close `:610-616`; mount-once + unmount invalidation `:583-593`; `useDialogFocus` `:444`. Routes: `app/api/admin/alerts/bell/{feed,open,read,config,count,token}/route.ts` (all six exist).

**Data / severity:** `BellEntry` `lib/admin/bellFeed.ts:27-47` — fields `alertId/code/slug/state/activityAt/resolvedAt/occurrences/unread/context/identity/isAutoResolving/autoResolveNote/action/isHealth`; **no `severity`**. Catalog per-code `severity?: "info" | "warning"` `lib/messages/catalog.ts:3`; `messageFor(code)` returns the full entry `lib/messages/lookup.ts:95-104`; `isMessageCode` narrowing `:91`. Test-default code `ADMIN_ALERT_COUNT_FAILED` `catalog.ts:2292` carries **no** `severity` → notice tone (default). `severity:"info"` exemplars: `SHOW_FIRST_PUBLISHED` `catalog.ts:1069`, `SHOW_ARCHIVED_BY_ADMIN` `catalog.ts:1715`.

**Tokens / motion:** color tokens `app/globals.css:46-95` (`@theme`), `:root` light `:261-293`, dark `@media` `:305-338` + `[data-theme=dark]` `:344-376`; radii `:203-206` (`--radius-lg:16px` `:205`); duration/ease `:209-216`; `sheet-rise` keyframe `:646`, `step3-details-pop-in` (pop pattern) `:654`, reduced-motion collapse `:388-391`. Contrast meta-test `tests/styles/status-token-contrast.test.ts`.

**Tests (constrain the restyle):** `tests/components/notifBell.test.tsx`, `bellPanel.test.tsx` (dot opacity `:121-127`, `×N` `:133-143`), `bellPanelActions.test.tsx` (dot read-clear `:290-326`), `bellPanelDeferrals.test.tsx` (`Active (N)` heading `:171-187`, caret `aria-hidden` `:152`), `tests/e2e/bell-panel-layout.spec.ts`. Fixtures `makeEntry` default `code:"ADMIN_ALERT_COUNT_FAILED"`, `isHealth:false` (`bellPanel.test.tsx:37-55`).

**Design context:** DESIGN.md §1.1 token table, §1.3 status-hue scope + red-only-for-degraded rule; PRODUCT.md principle 5 (plain language, no dead ends). Panel tokens `--spacing-panel-max`/`--spacing-panel-max-mobile` DESIGN.md §189-190, `app/globals.css:196/200`.

## 10. Out of scope

Server feed shape, resolve-route semantics, realtime transport, badge sources, catalog copy, DB. Any of these surfacing in review → open a question, do not silently expand.

# Shape Brief — Bell Notification Redesign

**Date:** 2026-07-06 · **Register:** product (admin UI) · **Owner:** Opus / Claude Code · **Source:** Claude Design import "Bell Notification Redesign.dc.html" (treated as **directional**, not a verbatim port).

## 0. Intent & scope

Visual + structural restyle of the **existing, feature-complete** `NotifBell` (`components/admin/nav/NotifBell.tsx`) and `BellPanel` (`components/admin/BellPanel.tsx`). Every feature in the mock already ships (active/history sections, occurrence chips, helpful-context expansion, Resolve/Retry actions, empty/error/loading states, desktop-dropdown/mobile-sheet, realtime badge). This is a **restyle**, not new capability.

**Non-negotiable: preserve every behavioral contract and every `data-testid`** except the two explicitly retired below. No new API routes. No new server-side `BellEntry` fields. Severity is derived **client-side** from the message catalog. This is UI-only (`components/` + `app/globals.css` + `DESIGN.md`); no `app/api/**`, no DB, no advisory-lock, no mutation-surface changes → invariant-10 telemetry surface is untouched, invariant-9 Supabase boundary untouched.

## 1. Deltas the mock introduces (adopt) vs. current

| # | Mock element | Current | Decision |
|---|---|---|---|
| D1 | **Desktop: anchored dropdown** under the bell (`right:0; top:calc(100%+10px)`), up-caret, **transparent** click-catcher overlay (no dimming scrim). | Centered-modal with `bg-text-strong/40` scrim on desktop too. | **Adopt.** Anchor on desktop; keep mobile bottom-sheet + dark scrim identical. Switch is **pure responsive Tailwind** — panel `fixed inset-0 … sm:absolute sm:inset-auto sm:right-0 sm:top-[calc(100%+10px)]`, overlay `fixed inset-0` with `bg-overlay-scrim sm:bg-transparent`, caret `hidden sm:block`, handle `sm:hidden`. NotifBell wraps trigger+panel in a `relative` container so the panel anchors to the bell. **`aria-modal="true"` stays on both** (the transparent desktop overlay is a full-screen click-catcher → outside interaction is genuinely blocked → modal semantics are honest; focus trap stays). **No matchMedia JS.** **Explicit desktop width contract (R2/R6):** once the panel is `sm:absolute` inside a shrink-wrapped relative parent, `w-full` loses its viewport containing block, so the panel MUST pin its own width: `w-full max-w-[420px]` (mobile, unchanged) **plus** `sm:w-[420px]` (desktop fixed 420). No `calc()` overflow cap: desktop mode is `sm:`-gated at 640px, where a right-aligned 420px panel always fits with margin, so a cap would be dead code (R6). **Highest-risk item.** |
| D2 | **Severity icon-circle** (34px) leading each active row: error/warn/info. | No severity indicator. | **Adopt, data-driven from catalog + `isHealth`.** Tone = `isHealth` → **critical** (status-degraded, `TriangleAlert`); else catalog `severity==="info"` → **info** (accent-on-bg, `Info`); else → **notice** (status-warn, `CircleAlert`). Color reinforces; icon-shape + title text carry meaning → DESIGN.md §1 color-blind floor holds (never color-alone). |
| D3 | **"Mark all read"** button in header (accent text), shown when unread active rows exist **AND the feed is not truncated** (see truncation rule below). | None (opening the panel already advances the `/bell/open` watermark, `BellPanel.tsx:530-542`; the badge is already zeroed by `zeroNow()` on open, `NotifBell.tsx:39-42`). | **Adopt, client-side.** **Decouple the read POST from expansion (R7):** the current `handleToggle` (`BellPanel.tsx:550-571`) both toggles `expandedIds` AND fires the read. Extract a `markRead(entry)` helper that owns ONLY the read side — the shared `readFiredRef`/`readClearedIds` sets + the per-row fail-quiet `/bell/read` POST — and does **not** touch `expandedIds`. `handleToggle` becomes `toggle expand` + `markRead(entry)`. Mark-all-read calls `markRead` for each still-unread active row, so it clears markers **without expanding/collapsing any row** (no panel-jump / state clobber). Same per-row fail-quiet contract (§4/`BellPanel.tsx:567-569`: a failed POST leaves the marker cleared for the session; the server watermark is authoritative on next open). **Failure policy = the existing single-row contract, unchanged:** optimistic clear, per-row fail-quiet, no rollback, no new cataloged error, no forced refetch (the badge is already zero while open; `/bell/open` governs cross-open truth). `readFiredRef` guarantees a row already read is not re-POSTed. **Truncation-honesty gate (R3):** the button renders ONLY when `!feed.truncated` — when the feed is capped (`feed.truncated`, `BellPanel.tsx:697-706`), active unread rows exist outside `feed.entries` that the client cannot reach, so a "Mark all read" that clears only loaded rows would lie. On a truncated feed the button is hidden and the existing truncation row remains the honest signal. Visibility predicate: `unreadActiveCount > 0 && !feed.truncated`. **No new API, no new failure mode.** |
| D4 | **Unread = row background tint** + semibold title (mock `#fdf7f0`). | Standalone accent dot in a fixed margin slot (`bell-unread-dot-{id}`), opacity flip on read. | **Adopt row-tint AND keep the dot** (repositioned as an unread pip on the severity icon-circle's top-right corner). Unread drives both the row `bg-stale-tint` and the pip; both fade on first expand via the SAME `readCleared`/opacity mechanism (`BellPanel.tsx:250-256`). The dot stays `size-2` (8px) with the opacity flip, so every existing dot test (`bellPanel.test.tsx:121-127`, `bellPanelActions.test.tsx:290-326`) and the e2e dot-slot/opacity/no-shift assertions (`bell-panel-layout.spec.ts:290-369`) stay green **unchanged** — nothing is retired. No layout shift (bg + opacity + font-weight only). |
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
- **No message clamping (R4).** The mock clamps the row message to 2 lines when collapsed. **Dropped from scope:** the message is the primary Doug-facing remediation copy (e.g. "Reconnect the sheet in Settings…"), and the expand caret is gated on helpful-context, so a long-message/no-helpful row would hide remediation text behind no affordance. The message renders in full at all times (matches current behavior). PRODUCT principle 2 "lead with the answer" — here the message IS the answer.

## 3. Token map (mock hex → project token) + new tokens

Existing (1:1): `#fafaf9`→`bg` · `#fff`→`surface` · `#f4f3f1`→`surface-sunken` · `#1a1b1f`→`text` · `#0e0f12`→`text-strong` · `#5a5b62`→`text-subtle` · `#8b8c92`→`text-faint` · `#e5e4e0`→`border` · `#cfcdc7`→`border-strong` · `#ff8c1a`→`accent` · `#c25e00`→`accent-on-bg` · `#3f8a83`→`status-positive` · `#b3261e`→`status-degraded` · `#b26a16`→`status-warn` · scrim→`overlay-scrim` · popover shadow→`shadow-popover` · panel radius→`radius-lg` (16).

Reused tints: warn icon-circle bg → `warning-bg`; unread row tint → `stale-tint`.

**New tokens** (add to `@theme` + `:root` + both dark blocks in `app/globals.css`, document in `DESIGN.md` §1.1 + contrast in §1.2):
- `--color-accent-tint` — info icon-circle bg **and** active-count-pill bg. Light `#feeede`, dark `#2a1e10` (warm, low-chroma).
  - **Info icon** on it = `accent-on-bg` (light `#c25e00` / dark `#ffa047`) — a **graphical** glyph, floor ≥3:1. Computed light 3.78:1, dark 8.08:1. ✓
  - **Active-count-pill TEXT** on it = **`text-strong`** (light `#0e0f12` / dark `#f5f3ee`), NOT `accent-on-bg`. `accent-on-bg` on this tint is only ~3.78:1 light — **below the 4.5:1 text floor** (R5), so it must not carry the pill number. `text-strong` on `accent-tint` ≈16.5:1 light / ≈14:1 dark. ✓ AA/AAA. The pill reads as tinted via its bg; the number is near-ink.
- `--color-danger-bg` — critical icon-circle bg. Light `#fbeae8`, dark `#3a1e1c`. Icon on it = `status-degraded` (**graphical**) — light 5.63:1, dark 4.16:1, floor ≥3:1. ✓

`tests/styles/status-token-contrast.test.ts` gets: (1) two **graphical** rows (`status-degraded` on `danger-bg`; `accent-on-bg` on `accent-tint`) ≥3:1 both modes; (2) one **text** row (`text-strong` on `accent-tint`, the active-count pill) ≥4.5:1 both modes.

## 4. Motion

- **Desktop dropdown:** pop-in (translateY(-6px) + scale(0.985)→1), `--duration-normal` `--ease-out-quart`. Reuse/add a `bell-pop-in` keyframe (pattern already exists as `step3-details-pop-in`). Transform-origin top-right.
- **Mobile sheet:** existing `sheet-rise`.
- **Scrim (mobile):** fade via existing pattern.
- Caret rotate, row-tint fade, mark-all-read: existing `--duration-fast` transitions.
- All gated behind `motion-safe:`; reduced-motion collapses durations to 0 (global block).

## 4A. Dimensional Invariants (fixed-dimension parents → children)

Tailwind v4 here does NOT default `.flex` to `align-items: stretch` (memory `feedback_tailwind_v4_flex_items_stretch`), so every fixed-dimension relationship is stated with the exact guaranteeing class and verified in a real browser (§7.3 Playwright, not jsdom).

| # | Parent (fixed dim) | Child | Guarantee | Class/style |
|---|---|---|---|---|
| DI-1 | Desktop panel root (≥640px) | self | width === 420px, right edge ≤ viewport | `sm:w-[420px]`, `sm:right-0` |
| DI-2 | Mobile panel root | self | width === min(viewport, 420) | `w-full max-w-[420px]` |
| DI-3 | Scroll body | self | max-height = token (mobile 70vh / desktop 480) | `max-h-panel-max-mobile sm:max-h-panel-max` |
| DI-4 | Severity icon-circle | self | fixed 34px square, never shrinks in the flex row | `size-[34px] shrink-0` |
| DI-5 | Severity icon-circle | unread pip | 8px pip pinned to circle top-right, no reflow on clear | pip `absolute -right-0.5 -top-0.5 size-2`, opacity flip only |
| DI-6 | Severity icon-circle | glyph | 17px lucide icon centered | `inline-flex items-center justify-center`, icon `size-[17px]` |
| DI-7 | Active row (flex) | icon vs text column | icon column fixed, text column fills | icon `shrink-0`, text `min-w-0 flex-1` |
| DI-8 | Unread dot slot (kept from current) | dot | fixed `size-2` (8px) slot, opacity flip, no layout shift | `size-2` slot + `opacity-100/0` (unchanged, `BellPanel.tsx:250-256`) |
| DI-9 | Desktop caret | self | 12px square anchored under bell at panel top-right | `absolute -top-1.5 right-3 size-3`, `hidden sm:block` |
| DI-10 | Mark-all-read + close (header row) | buttons | ≥44px tap targets, no wrap | `min-h-tap-min`, header `flex items-center` |

## 4B. Transition Inventory

States: **panel-open** (loading · error · empty · active+history) × **mode** (desktop · mobile) × per-row (collapsed↔expanded, unread↔read) × action (idle↔pending↔resolved) × mark-all-read.

| Transition | Treatment |
|---|---|
| closed → open (desktop) | `bell-pop-in` (translateY(-6px)+scale(.985)→1), `--duration-normal` `--ease-out-quart`, origin top-right |
| closed → open (mobile) | `sheet-rise` (translateY(100%)→0) + scrim fade-in, `--duration-normal` |
| open → closed (both) | instant unmount (React removes the node; matches current — no exit anim today, not a regression) |
| loading → ready / error / empty | instant content swap inside the stable scroll body (no cross-fade; matches current) |
| row collapsed → expanded | **message is NEVER clamped** — the Doug-facing remediation copy renders in full at all times (unchanged from current `BellPanel.tsx:290-294`; the mock's 2-line clamp is dropped, §2). Expansion adds ONLY the helpful-context disclosure; caret rotate 0→90° `--duration-fast`; disclosure appears instant |
| row expanded → collapsed | reverse; caret 90°→0° `--duration-fast` (message stays full throughout) |
| row unread → read (first expand) | dot `opacity-100→0` + row `bg-stale-tint→transparent`, both `--duration-fast` opacity/bg. Title weight is HELD CONSTANT across read (`font-semibold`, `BellPanel.tsx:320`) — a weight swap changes glyph advance widths and can reflow a wrapping title by a full line on read (§14 no-layout-shift); unread emphasis is carried by the pip + `bg-stale-tint` + the severity circle, never the title weight |
| mark-all-read click | every loaded unread active row runs the unread→read transition simultaneously (dot + tint fade, `--duration-fast`); button then hides (its predicate goes false) |
| action idle → pending | button label → "Resolving…/Retrying…", `disabled` + `aria-busy`, `opacity-60` (instant, matches current) |
| action pending → resolved | row removed on refetch (instant list update, matches current) |
| **compound:** mark-all-read WHILE a row is mid-expand | independent — mark-all drives dot/tint opacity via the decoupled `markRead` helper and does **not** touch `expandedIds`; expand drives caret + helpful disclosure. No shared property, no state clobber |
| **compound:** realtime ping refetch WHILE a row is expanded | expanded/read Sets are session-scoped and preserved across refetch (`BellPanel.tsx:469-471`), so the row stays expanded/cleared; new snapshot content swaps under it instantly |
| reduced-motion | all of the above collapse to 0ms via the global `--duration-*` override; open is instant, no transforms |

## 5. Behavioral contracts that MUST stay green (regression fences)

4-source badge + `zeroNow` on open + degraded `!` chip + `9+` cap · feed load → `/bell/open` exactly-once (seq guard) → `onOpened` badge refetch · per-row `/bell/read` once on first expand · resolve/retry/telemetry/action routes + door order + refetch-after · realtime ping refetch · dev-footer config 400-bounds echo · focus trap (`useDialogFocus`) + Esc + overlay/scrim dismiss + persistent sr-only `role=status` live region · load-order (open never before feed) · snapshot-safe watermark (server `seenThrough`, never client clock).

## 6. Testids

**Preserve:** `admin-notif-bell`, `admin-notif-bell-degraded`, `admin-notif-badge`, `bell-panel`, `bell-panel-backdrop`, `bell-panel-close`, `bell-live-region`, `bell-loading`, `bell-error`, `bell-empty`, `bell-section-active`, `bell-section-active-heading`, `bell-section-history`, `bell-entry-{id}`, `bell-entry-toggle-{id}`, `bell-caret-{id}`, `bell-context-{id}`, `bell-resolve-{id}`, `bell-telemetry-{id}`, `bell-auto-note-{id}`, `bell-action-{id}`, `bell-truncation-row`, `bell-dev-footer`, `bell-config-history`, `bell-config-cap`, `bell-config-save`, `bell-config-error`.

**Retire:** none. (Revised D4 keeps `bell-unread-dot-{id}` with its `size-2`/opacity-flip contract intact.)

**Add:** `bell-mark-all-read` (header button), `bell-sev-{id}` (severity icon-circle, `data-tone="critical|info|notice"`), `bell-activity-log` (dev footer link). The active row also gains `data-unread="true|false"` on `bell-entry-{id}` (additive; drives the row tint) — additive, not a replacement.

## 7. Test strategy (TDD)

1. **Update/extend (dot contract UNCHANGED):** amend `notifBell` / `bellPanel` / `bellPanelActions` / `bellPanelDeferrals` to add assertions for severity tone (`bell-sev-{id}` `data-tone` from health / info-code / default fixtures), the new `data-unread` row attribute, and header/empty/history restyle testids. The existing `bell-unread-dot-{id}` opacity-flip assertions stay as-is. `aria-modal="true"` assertion unchanged (true both modes). **`bell-mark-all-read` — three explicit cases:** (a) unread active rows + non-truncated feed → button present; click clears every active unread marker and fires `/bell/read` once per still-unread active row (assert call count === unread count, and `readFiredRef` dedupe on a second click → no new calls). **State-preservation (R7):** with one row pre-expanded and others collapsed, clicking mark-all-read leaves the expanded row expanded and the collapsed rows collapsed (no `expandedIds` mutation, no caret flips) — only the unread markers clear; (b) no unread active rows → button absent; (c) **truncated feed (R3/R4):** `feed.truncated: true` + unread active entries → `bell-mark-all-read` ABSENT, `bell-truncation-row` present, and no `/bell/read` calls are possible from the header. **Message-not-clamped (R4):** a long-message row WITHOUT helpful context renders the full message text (assert full string present, no `line-clamp` class, no caret); a long-message row WITH helpful context still shows the caret for the disclosure only.
2. **Contrast:** extend `status-token-contrast.test.ts` for the two new tint↔icon pairs (`status-degraded` on `danger-bg`; `accent-on-bg` on `accent-tint`) — computed ≥3:1 graphical both modes; tune the dark tint hexes until the floor clears (the tight one is `status-degraded` dark on `danger-bg` dark).
3. **Layout e2e (mirrors §4A Dimensional Invariants):** update `tests/e2e/bell-panel-layout.spec.ts` — replace the desktop `sm:items-center` vertically-centered assertion with the **anchored** geometry (panel top-right, below the bell; caret present DI-9; overlay transparent/no dim at sm+). Add real-browser `getBoundingClientRect` assertions with **explicit breakpoint boundaries (R6):** at **639px** → mobile sheet (`items-end`, full-width ≤420, dark scrim); at **640px** → anchored desktop (width === 420px ±TOL, right edge ≤ viewport / no horizontal overflow, caret present, transparent overlay). (The `sm` breakpoint is 640px; there is no narrow-desktop regime, so no `calc` cap and no sub-640 desktop test.) Plus DI-4 severity circle 34×34 (±TOL) + DI-7 icon column `shrink-0` while text column fills; DI-5 unread pip 8px pinned top-right of the circle with no row-left shift on clear. Mobile sheet (`items-end`, full-width ≤420) + existing dot-slot/opacity assertions unchanged.
3b. **Transition audit (mirrors §4B):** in the same e2e (or a component test where a real transition isn't required), assert each `bell-pop-in`/`sheet-rise`/scrim has its open animation at the right breakpoint; row collapsed↔expanded shows caret rotation + helpful-context disclosure only, with the **message text fully visible before, during, and after** expand/collapse (no `line-clamp`); unread→read dot+tint fade; **compound:** mark-all-read while a row is mid-expand leaves the expanded row expanded and the collapsed rows collapsed (no `expandedIds` mutation → no state clobber), only unread markers clear; realtime ping refetch preserves expanded/read Sets. Reduced-motion: open is instant (no transform), assertions run under `prefers-reduced-motion`.
4. Full `pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm format:check` before push (memory: scoped gates miss regressions).
5. **UI quality gate (invariant 8, MANDATORY before ship):** run `/impeccable critique` AND `/impeccable audit` on the affected diff (canonical v3 preflight — PRODUCT.md/DESIGN.md/register/preflight). Every HIGH and CRITICAL finding is fixed or explicitly deferred via a `DEFERRED.md` entry. This runs at close-out, BEFORE the Codex whole-diff adversarial review and BEFORE ship. Dispositions recorded alongside the diff.

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

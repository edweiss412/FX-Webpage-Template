# Theme persistence-failure note — say so when the device will not remember

**Date:** 2026-08-15 · **Authoring branch:** `docs/theme-persistence-note-spec` · **Implementation branch:** `feat/theme-persistence-note` · **Status:** DRAFT
**Entry:** `BL-THEME-PERSISTENCE-FAILURE-IS-SILENT` (BACKLOG.md, filed 2026-08-10) · **Effort:** S · **Plan:** authored beside this spec in the plan directory docs/superpowers/plans/2026-08-15-theme-persistence-note/ (same PR)

## §0 Why

When `localStorage.setItem` throws (restrictive in-app browser, private mode, third-party-storage block), `setTheme` in `components/layout/useAppliedTheme.ts` deliberately absorbs the failure: the in-tab theme still applies, but the choice is gone on the next load and nothing tells the user. The entry probed it: pick dark, page turns dark, next load is light. The absorb is correct (throwing would take the control down over a preference); the missing piece is the SIGNAL. Reachability is real: embedded webviews with storage partitioning are exactly where crew open a link from a group thread.

## §1.1 Resolved scope — do not relitigate

1. **Ratified decision (Eric, 2026-08-15, orchestrator session; captured in the orchestrator's G3 scope brief, smalls-g3-signal-arcs.md in the session briefs directory, outside the repo).** A small inline plain-language note near the theme control, rendered only after a persist write FAILS. Copy direction: "This device won't remember this choice." No toast, no technical explanation, no "localStorage" (PRODUCT.md Design Principle 5, PRODUCT.md:68). Final wording and placement are THIS SPEC's decisions, not user stops.
2. **The silent absorb in `setTheme` stays.** The catch (`components/layout/useAppliedTheme.ts`, the `window.localStorage.setItem` try/catch in `setTheme`) keeps swallowing; this arc adds state, not a throw. The unreadable-storage fallback in the OS-change listener ("Unreadable storage is treated as no stored choice") is likewise untouched.
3. **Both controls get the note.** Two controls flip the theme through the one shared hook: the standalone `ThemeToggle` (`components/layout/ThemeToggle.tsx`, identity-less pages, rendered by `components/layout/Header.tsx:141`) and the avatar-menu theme row (`components/auth/AvatarMenu.tsx:314`, `menuitemcheckbox`). They never render simultaneously (the header renders the standalone toggle only when there is no resolved identity, `components/layout/Header.tsx:123`). A note that lived on only one control would leave the other silent for the same failure.
4. **UI surface: the invariant-8 impeccable dual gate applies to the IMPLEMENTATION** (critique + audit on the unit diff; the plan carries it). No raw error codes in UI (invariant 5): the note is plain copy, no code, and no §12.4 row is minted (nothing machine-emits this string; it is component copy like the FinalizeButton completion sentence, `components/admin/FinalizeButton.tsx:545`, which pins the same "success/UX copy carries no catalog code" posture).
5. **Autonomy: both user review gates WAIVED** (Eric's 2026-08-15 batch grant, kickoff brief). Stop only for a genuinely new question.
6. **Out of scope:** persistence retry/queueing; cookie or server-side theme persistence; any change to the no-FOUC script in `app/layout.tsx`; the OS-change subscription; telemetry for the failure (a client preference miss is not an operator event — no `log.*`, no app_events).

## §2 Design

### §2.1 Hook state (the one shared seam)

`useAppliedTheme` gains `persistFailed: boolean` on its returned object (both variants of `AppliedTheme`; `false` in the unmounted variant). Mechanics in `setTheme`:

- try `setItem` succeeds: state becomes `{ mounted: true, theme: next, persistFailed: false }` — a later successful write CLEARS a previous failure (storage can come back; a stale warning would then lie).
- catch: state becomes `{ mounted: true, theme: next, persistFailed: true }`. The dataset write above the try has already applied the theme; nothing else changes.

The state is per hook instance. That matches the surface: the instance lives in whichever control the user is touching (§1.1 item 3 — never both at once), and `AvatarMenu` calls the hook at component level (`components/auth/AvatarMenu.tsx:96`), so the flag survives popover close/re-open within the page session. It does not survive reload — by definition of the failure, nothing here can persist.

Guard conditions: pre-mount `persistFailed` is `false` (SSR-stable, no hydration delta — the note region renders empty exactly as it does post-mount pre-failure). `setTheme` called pre-mount already promotes to `mounted: true`; the same shape carries `persistFailed`. The OS-change listener path never touches `persistFailed` (it does not write storage).

### §2.2 Rendered note, both controls (rendered element, not a description)

**Copy (both controls, identical string):** `This device won't remember this choice.` — the ratified direction verbatim; plain language, no technical chrome (PRODUCT.md:68), no em dash (DESIGN.md §9), straight apostrophe (matches shipped copy, e.g. §12.4 catalog strings). One exported const shared by both controls (single source; the announcer-and-visible-drift rule pinned at `components/admin/FinalizeButton.tsx:535`, through the COMPLETE_COPY const at line 545) — it lives in `components/layout/useAppliedTheme.ts` beside `THEME_STORAGE_KEY` so both consumers import the same string.

**Always-mounted status container (a11y, both controls).** The note's container renders ALWAYS, with `role="status"` (implicit `aria-live="polite"`), and the TEXT is conditional on `persistFailed`. A `role="status"` node inserted at failure time announces nothing — the repo has measured exactly this trap (`components/admin/ReSyncButton.tsx:147`, which records that an inserted status card announced nothing); prior art for the always-mounted pattern is `FinalizeAnnouncer` (`components/admin/FinalizeButton.tsx:549`). The container carries no padding/margin/border of its own when empty so an empty region paints nothing (do NOT use `empty:hidden` — DESIGN.md §7a documents it re-hiding regions a fix just exposed; conditional text inside an unconditionally-rendered, zero-chrome container needs no hiding).

**Placement, avatar menu:** inside the popover panel, as a sibling immediately AFTER the `role="menu"` element (`components/auth/AvatarMenu.tsx:299`) — NOT inside it. `role="menu"` constrains its owned children (the same ARIA required-owned-elements rule that forced the `role="none"` form wrapper at the menu's search form), and the popover panel already hosts non-menuitem content (the identity header), so a status sibling is the shape the component already uses. The theme row does not close the menu on activation (`components/auth/AvatarMenu.tsx:42`), so the note is visible in place when the failed write happens. Styling: `text-xs/relaxed text-text-subtle` (canonical small-note classes, e.g. `components/admin/ShowRowActions.tsx:744`), padded to the menu's item inset when non-empty.

**Placement, standalone toggle:** `ThemeToggle` returns a small flex wrapper: the note text sits BESIDE the button (before it in reading order, so the icon button keeps its position at the header edge), `text-xs/relaxed text-text-subtle`, right-aligned, with a max-width so a 390px viewport wraps it to two short lines rather than displacing the header. Identity-less pages (sign-in, picker) have free horizontal header room (`components/layout/Header.tsx` renders no nav beside the toggle in that mode). The wrapper adds no visual chrome when the note is empty; the button's own markup, classes, and handshake comments are unchanged.

### §2.3 Mode boundaries and Transition Inventory

Two visual states per control: note-absent (default) and note-present. Transition inventory (all pairs):

| Transition | Treatment |
|---|---|
| absent to present (persist write fails) | instant, no animation; announced via the live region |
| present to absent (a later persist write succeeds) | instant, no animation; no announcement (silence is the good news, and a polite region with emptied content announces nothing) |
| theme flips light/dark while note present (compound) | note re-renders in tokens (`text-text-subtle` resolves per palette); no animation of its own; the note text does NOT re-announce (same string, same node — `role="status"` announces content CHANGES only) |
| popover closes/re-opens while `persistFailed` true (avatar menu only, compound) | note unmounts with the popover and renders again on re-open (hook state survives, §2.1); re-mount renders the container WITH text already present, which polite live regions do not announce on insertion — accepted, the user already heard it at failure time (§4 limit 3) |

Reduced motion: nothing animates; no `prefers-reduced-motion` branch exists to get wrong.

### §2.4 Dimensional Invariants

None introduced. Neither note container has a fixed dimension, and neither sits as a flex/grid child of a fixed-dimension parent: both are content-sized text regions (empty = zero-size, non-empty = intrinsic text height). The only fixed-size element near them, the standalone toggle button's `min-h-tap-min min-w-tap-min` tap target, is untouched. No parent-to-child dimension relationship exists for a real-browser layout assertion to pin, so the writing-plans layout-dimensions task is N/A (declared here so the plan states it rather than silently skipping it).

### §2.5 What does NOT change

No change to: the no-FOUC script; `readAppliedTheme`; the OS-change subscription; `THEME_STORAGE_KEY`; either control's aria model (`aria-pressed` on the standalone toggle, `menuitemcheckbox`/`aria-checked` on the menu row — the note is a sibling region, not part of either control's accessible name or state); tap-target sizing (the button keeps `min-h-tap-min min-w-tap-min`); any server component.

## §3 Acceptance criteria

- **AC-1 (signal on failure).** With `localStorage.setItem` throwing, activating either control applies the theme in-tab AND renders the note text in that control's status container. Assert BOTH halves; the theme-apply assertion pins that the guard did not break the absorb.
- **AC-2 (silent on success).** With working storage, no note text renders anywhere, before or after toggling. The status containers exist (always-mounted) but are empty.
- **AC-3 (clear on recovery).** Failing write then succeeding write (storage restored between activations) clears the note.
- **AC-4 (announce reliability).** The `role="status"` container is present in the DOM BEFORE the failing activation (query it pre-click), not inserted with the note — the ReSyncButton trap pinned as a test.
- **AC-5 (copy).** The rendered string equals the shared exported const in both controls (single-source assertion per the FinalizeButton drift rule); the const contains no em dash and no technical vocabulary ("localStorage", "browser storage", "cookies" do not appear).
- **AC-6 (menu semantics).** The avatar-menu note is NOT inside the `role="menu"` element (assert the status node is not a descendant of the menu node); the menu's owned children are unchanged.
- **AC-7 (impeccable dual gate).** `/impeccable critique` + `/impeccable audit` run on the implementation diff; P0/P1 fixed or DEFERRED-entried; the plan's closeout carries the `impeccable-gate:` marker line.
- **AC-8 (ledger).** `BL-THEME-PERSISTENCE-FAILURE-IS-SILENT` archives on the implementation PR's merge; markers strip per invariant 12.

## §4 Documented limits

1. **The note is per-control-instance and per-page-session.** It does not survive reload (nothing can persist it — that is the failure being reported) and does not render on load for a PREVIOUS session's failure: the signal fires at interaction time, which is when the user can act on it. A load-time probe write was considered and rejected: probing storage on every load to warn users who never touch the toggle spends a speculative write on everyone for a note almost nobody needs.
2. **No telemetry.** A blocked client storage write is a device condition, not an operator event (§1.1 item 6).
3. **Popover re-open renders the note without re-announcing** (§2.3 last row) — sighted parity holds (the text is visible); a screen-reader user re-opening the menu reads the menu contents anyway.
4. **If BOTH controls could ever render at once** (today they cannot, `components/layout/Header.tsx:123`), each instance would track failure independently and only the touched control would show the note. Accepted: the note describes the interaction the user just had, not global device state.

## §5 Test surface (plan owns the details)

RTL unit tests beside the existing control suites (locate via `grep -rln "ThemeToggle\|AvatarMenu" tests/`), driving real components with a stubbed throwing/working `localStorage` (`vi.spyOn(Storage.prototype, "setItem")`). RED validity: every AC-1..AC-6 case fails on the live tree today (no `persistFailed` state, no status container, no note copy exist — the production lines whose absence makes them fail are the current `setTheme` catch block and both control render bodies). The impeccable dual gate is the visual-quality check; no screenshot baseline captures these surfaces in a failed-persist state (no regen expected — verify with the capture manifest at plan time).

## §6 Sequencing

Authoring PR (spec + plan + HANDOFF, docs-only, preflight skip declared) merges first; implementation branch `feat/theme-persistence-note` is created by the authoring session with the claim handed off before the authoring PR releases it (invariant 12, no undeclared instant). A fresh Opus pane implements from `HANDOFF.md` (UI work is Opus-owned per the AGENTS.md hard rule). The implementation plan carries the invariant-8 dual gate; its closeout marker line is `impeccable-gate:` with both halves recorded.

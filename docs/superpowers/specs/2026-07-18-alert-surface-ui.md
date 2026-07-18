# Alert-Surface UI Pass — Design Spec

**Date:** 2026-07-18
**Slug:** `alert-surface-ui`
**Status:** Ratified design (user-locked via autonomous-ship consent; user-review gate waived per `/ship-feature`).

Closes DEFERRED items `ALERT-COPY-IDENTITY-BOLD-1`, `ALERT-CHEVRON-HINT-1`, `ALERT-MULTI-CHANGE-TONE-1`, `PERSHOW-LINK-TAPTARGET-1`, plus two screenshot-driven layout asks (timestamp right-flush, Learn-more inline). Branches off merged ARC-1 (`origin/main` @ PR #475).

---

## 1. Goal

Restructure the admin alert-notification row (`BellPanel` `ActiveRow`) and its copy-rendering path so that: (a) the alert message, inline "Learn more" link, and multi-change list render as real semantic siblings below a **title-only** mark-read tap target; (b) the occurrence chip + relative timestamp sit **flush to the true row right edge** aligned with the chevron column; (c) identity-tier names render **bold** at render time; (d) the multi-change `ROLE_FLAGS_NOTICE` renders a real `<ul>` with body-weight items and no redundant "see show page" tail; (e) the show-page chevron carries a **one-time dismissible hint** flagging its behavior change (expand → navigate); and (f) `PerShowAlertSection`'s action + Learn-more links adopt BellPanel's tap-target/focus-ring vocabulary.

This is render-only UI. No DB schema, no RPC, no advisory-lock surface, no new mutation surface (the existing `onMarkRead` mutation is unchanged — only the DOM it wraps changes).

## 2. Architecture

Six work items (WI). WI-1 (row restructure) is the structural enabler: moving the message out of the `<button>` is what makes WI-2 (inline `<a>`) and WI-4 (`<ul>`) legal, since interactive content and `<ul>` are forbidden inside `<button>` per the HTML content model.

| WI | Name | Primary files | DEFERRED / ask |
|----|------|---------------|----------------|
| WI-1 | Row restructure + timestamp right-flush | `components/admin/BellPanel.tsx` | screenshot ask |
| WI-2 | Learn-more inline-append | `components/admin/BellPanel.tsx` | screenshot ask |
| WI-3 | Identity-tier bold at render | `components/messages/renderEmphasis.tsx`, `components/admin/BellPanel.tsx` | `ALERT-COPY-IDENTITY-BOLD-1` |
| WI-4 | Multi-change real `<ul>` + tail drop + em-dash sweep | `lib/adminAlerts/deriveMessageParams.ts`, `components/admin/BellPanel.tsx` | `ALERT-MULTI-CHANGE-TONE-1` |
| WI-5 | Chevron one-time dismissible hint | `components/admin/BellPanel.tsx` (+ small client hook) | `ALERT-CHEVRON-HINT-1` |
| WI-6 | PerShow link tap-target parity | `components/admin/PerShowAlertSection.tsx` | `PERSHOW-LINK-TAPTARGET-1` |

---

## 3. Current-code baseline (cited)

- `ActiveRow` — `components/admin/BellPanel.tsx:330-468`. Outer row `:363-369` (`relative flex gap-3 px-4 py-3.5 …`). Severity rail `:381-398`. Main column `<div className="min-w-0 flex-1">` `:399`. Header wrapper `<div className="flex items-center gap-1">` `:407` holds [mark-read button, chevron].
- Mark-read `<button>` — `:415-447`. testid `bell-entry-toggle-${alertId}`, `onClick={onMarkRead}`, className `"flex min-h-tap-min min-w-0 flex-1 flex-col justify-center text-left focus-visible:… ring-offset-surface"`. Currently wraps: title-row span `:421` (`flex items-start justify-between gap-2.5`) → title `:428-430` + right-group span `:435` (`flex shrink-0 items-center gap-2.5`) → `<OccurrenceChip/>` + timestamp `:437-439` (`text-xs tabular-nums text-text-faint`, value `raisedAtSuffix(entry.activityAt, now)`); AND the message span `:442-446` (`mt-1 block whitespace-pre-line wrap-break-word text-sm text-text-subtle` → `renderCatalogEmphasis(message, params)`).
- `message` = `rowCopy(entry.code)` → catalog `dougFacing` (`:117-120`). `params` = `entry.messageParams ?? contextParams(entry.context)` (`:347-350`).
- Chevron `<a>` — `:452-461`, DOM sibling of button inside `:407` wrapper. `href=/admin/show/${slug}`, testid `bell-caret-${alertId}`, `aria-label="Open show page"`, class `SHOW_PAGE_LINK`, `<ChevronRight className="size-4">`. Rendered only when `entry.slug !== null`.
- ActionCell — `:231-328`. Outer `<div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">` `:261`. Members: telemetry link `:263-267`, action links `:272-282`, `RetryWatchButton` `:288-292`, **Learn-more `:296-305`** (`<a href={helpHref} testid=bell-help-${alertId} className={HELP_LINK} aria-label="Learn more about {title}">Learn more</a>`, `helpHref = messageFor(entry.code).helpHref` `:236`), spacer `:306`, auto-note `:307-313` OR Dismiss button `:314-324`.
- Class constants: `LINK_CTA` `:213-214`, `GHOST_DISMISS` `:216-217`, `SHOW_PAGE_LINK` `:222-223`, `HELP_LINK` `:228-229` (verbatim strings preserved; reused, not rewritten).
- `renderCatalogEmphasis` — `components/messages/renderEmphasis.tsx:75`. `(template: string, params?: MessageParams): ReactNode[]`. Parses `**bold**`→`<strong>`, `*em*`/`_em_`→`<em>` via `renderEmphasis` (`:103-114`), then interpolates params as **opaque plain-text nodes** (`interpolate`, docstring `:61-74`). No identity weight today.
- `deriveAlertMessageParams` — `lib/adminAlerts/deriveMessageParams.ts:256-260`. `roleChangesParam` `:238-247` returns a `\n`-joined string: header `"${n} role changes:"`, up-to-`CHANGE_LINE_CAP=3` (`:28`) `•`-bullets via `bulletLine` `:232-236`, overflow `"+${n-3} more — see show page."`. `ROLE_CHANGES_FALLBACK` `:27` = `"a crew member's role flags changed — see the show page."`. `LEAD_HINT` `:26` = `" Lead changes must be confirmed in the show page."`. Identity params single-quoted via `quoted` `:151-153`; identity token set `IDENTITY_PARAM_TOKENS` `:38-48`.
- `PerShowAlertSection` action link `:348-358` (`self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:… ring-offset-2`) + Learn-more `:364-377` (`self-start text-xs text-text-subtle …ring-offset-2`) — **neither** has `min-h-tap-min` nor `ring-offset-surface`.
- Reference vocabulary (`HealthAlertsPanel.tsx`): View-show `Link :134-142` + action `<a> :143-153` both carry `min-h-tap-min` (BellPanel constants carry `min-h-tap-min` + `ring-offset-surface`).
- Sole real-browser layout harness: `tests/e2e/bell-panel-layout.spec.ts` (Playwright, `getBoundingClientRect`).

---

## 4. Work items (detailed)

### WI-1 — Row restructure + timestamp right-flush

**Target DOM (ActiveRow main column `:399` children):**

```
<div className="min-w-0 flex-1">
  {/* header: title button (flex-1) | right-group (chip+timestamp) | chevron */}
  <div className="flex items-start gap-2">
    <button …toggle… className={TOGGLE class, title-only}>       {/* wraps ONLY the title span */}
      <span className="min-w-0 wrap-break-word font-semibold text-text-strong">{title}</span>
    </button>
    <span className="flex shrink-0 items-center gap-2.5 pt-0.5">  {/* right-group, out of button */}
      <OccurrenceChip …/>
      <span className="text-xs tabular-nums text-text-faint">{raisedAtSuffix(entry.activityAt, now)}</span>
    </span>
    {entry.slug !== null && <a …chevron… className={SHOW_PAGE_LINK}>…</a>}  {/* + hint wrapper, WI-5 */}
  </div>
  {/* message block: sibling BELOW header, NOT inside button (enables <a>/<ul>) */}
  {/* renders when message resolves OR helpHref exists (WI-2 orphan guard) */}
  {((message && messageResolved) || helpHref) && (
    <div className="mt-1 whitespace-pre-line wrap-break-word text-sm text-text-subtle">
      {message && messageResolved && (… WI-3 renderer … {multi-change <ul>, WI-4} …)}
      {helpHref && (<a …HELP_LINK… >Learn more</a>)}  {/* WI-2 inline, leading space only if message present */}
    </div>
  )}
  <IdentityChip …/>
  <ActionCell … />   {/* Learn-more removed, WI-2 */}
</div>
```

**Right-flush requirement:** the right-group (chip + timestamp) moves out of the button into the header flex row, positioned so its right edge sits flush against the chevron's left edge, and the chevron's right edge is flush to the row content's right padding edge. Net effect: the timestamp is the rightmost element before the chevron column, not stopped short inside a `flex-1` button. Because chevron may be absent (`slug === null`), when absent the right-group is the rightmost element and sits flush to the content right edge.

**Mark-read tap target:** the `<button>` now wraps the title only. `min-h-tap-min` retained on the button so it keeps a ≥44px tap target even as a title-only control. `flex-1 min-w-0` retained so the title takes remaining width and truncates/wraps rather than pushing the right-group off-row. Clicking the message text no longer marks read — this is the ratified "move message out of button" decision.

**Guard conditions:**
- Message TEXT renders only when `message && messageResolved`; but the message-block WRAPPER renders when `((message && messageResolved) || helpHref)` (see WI-2 — the wrapper also hosts the inline Learn-more, so it must survive a suppressed message when `helpHref` exists). The block is omitted only when BOTH resolved message text AND `helpHref` are absent. Header + chip + timestamp + chevron always render independently of the block.
- `entry.slug === null`: no chevron (and no WI-5 hint); right-group is rightmost, flush to content right edge.
- Title always present (non-null invariant of the feed row).

### WI-2 — Learn-more inline-append

Remove Learn-more from ActionCell (`:296-305`). Render it **inline, appended after the message text** inside the WI-1 message block, as an `<a>` sibling immediately following the rendered message nodes (a leading space separates it from the message). Keep testid `bell-help-${alertId}`, `href={helpHref}`, and the `aria-label="Learn more about {title}"`. Reuse `HELP_LINK` class (already has `min-h-tap-min` + `ring-offset-surface`); it renders `inline-flex` so it flows inline after the text.

**Message-block render condition (revised — prevents orphaned Learn-more):** the message block wrapper renders when `((message && messageResolved) || helpHref)`, NOT `message && messageResolved` alone. When `message`/`messageResolved` is falsy but `helpHref` exists (the unresolved-placeholder guard path — a cataloged code with longform help but a suppressed/unresolved message), the block renders with the Learn-more `<a>` alone (no message text, no leading space). This preserves today's behavior where the ActionCell Learn-more was independent of message resolution — the help affordance never disappears just because the message was suppressed.

**Guard:**
- `helpHref` present, message resolved → message text + inline Learn-more.
- `helpHref` present, message null/unresolved → Learn-more alone in the block (no orphan-drop regression).
- `helpHref` null/absent, message resolved → message text alone.
- both absent → no block.
- ActionCell no longer references Learn-more in any branch.

### WI-3 — Identity-tier bold at render

Add a param-aware weighting pass to `renderCatalogEmphasis`. New optional parameter `identityKeys?: ReadonlySet<string>`. Catalog placeholders are angle-bracket hyphenated tokens (`<sheet-name>`, `<show-name>`) matched by `PLACEHOLDER_RE` in `lib/messages/lookup.ts` and substituted whole-string by `interpolate`. When `identityKeys` is present, string nodes are split on placeholder boundaries: a placeholder whose key (hyphen/underscore-normalized, matching `interpolate`'s own normalization at `lookup.ts:32`) ∈ `identityKeys` renders as a `<strong className="font-semibold text-text-strong">` node carrying the resolved value; every other placeholder and surrounding literal renders as plain interpolated text (delegating to `interpolate` so the non-identity path is byte-identical to today). `interpolate` in `lookup.ts` stays unchanged (the split lives in `renderEmphasis.tsx`), so `plainCatalogText` and other string callers are untouched. Emphasis from template `*`/`**` markers is unchanged and composes (an identity param inside an `*em*` span is both italic and bold). Bare-token identity values (spec-ratified per PR #469 wrapper-check) get their weight here at render, never via template markup.

**BellPanel passes a NARROW name-only set, NOT `IDENTITY_PARAM_TOKENS`.** The full `IDENTITY_PARAM_TOKENS` (`deriveMessageParams.ts:38-48`) also contains structured/prose/technical tokens — `role-changes` (the WI-4 multi-line list/sentence), `email`, `repo`, `file-name`, `crew-row-count`, `failed-sheet-names` — bolding any of which would fight WI-4's body-weight list or bold non-name operational prose (e.g. a single-change `ROLE_FLAGS_NOTICE` whose entire `<role-changes>` sentence would go bold). Introduce a new exported const `BELL_BOLD_IDENTITY_TOKENS: ReadonlySet<string> = new Set(["show-name", "sheet-name", "crew-name"])` in `deriveMessageParams.ts` (the three name-like tiers matching the `ALERT-COPY-IDENTITY-BOLD-1` intent "spot WHICH show"). BellPanel passes `identityKeys={BELL_BOLD_IDENTITY_TOKENS}`. A structural test asserts `BELL_BOLD_IDENTITY_TOKENS ⊆ IDENTITY_PARAM_TOKENS` AND `role-changes ∉ BELL_BOLD_IDENTITY_TOKENS`, so a future identity-token addition cannot silently start bolding prose.

BellPanel passes `identityKeys={BELL_BOLD_IDENTITY_TOKENS}` (the narrow name-only set above, imported from `lib/adminAlerts/deriveMessageParams.ts`). The single-quote wrap from `quoted` remains part of the value string; the whole quoted name renders bold.

**Guard conditions:**
- `identityKeys` omitted/empty: behavior identical to today (all params plain text) — back-compat for `HealthAlertsPanel` and any other caller.
- An identity key present in `identityKeys` but absent from `params`: the `<key>` placeholder falls through to `interpolate`'s not-found behavior (the literal `<key>` is left in place, `lookup.ts:33`) — rendered plain, no empty `<strong>`.
- Param value empty string: an empty `<strong>` is avoided by skipping weight when the resolved value is `""` (emit nothing / plain).
- `role-changes` (and every non-name token) NOT in the bold set → the single-change `ROLE_FLAGS_NOTICE` sentence and the WI-4 `<ul>` items render body weight, never fully bold. Pinned by test + the subset structural test.

### WI-4 — Multi-change real `<ul>` + tail drop + em-dash sweep

`ROLE_FLAGS_NOTICE.dougFacing` = `"In <sheet-name>, <role-changes><lead-hint>"` (`catalog.ts:855`). Today `<role-changes>` interpolates a `\n`-joined `•`-bullet string (`roleChangesParam :238-247`) which the row renders as pre-line text. Replace the **multi-change** case (≥2 changes) with structured `<ul>` rendering; single/zero change keeps prose.

**deriveMessageParams.ts changes (all pure, unit-tested):**
- Export the existing `parseChanges(context): RoleChange[]` (`:209`, currently private) and the `RoleChange` type so BellPanel can obtain structured changes from `entry.context`.
- Add exported `roleChangeLines(changes: RoleChange[]): { header: string; items: string[]; overflow: string | null }`: `header = "${n} role changes:"`, `items` = up-to-`CHANGE_LINE_CAP` (3) strings built from `bulletLine` **with the leading `• ` marker removed** (a real `<li>` supplies the marker), `overflow = changes.length > 3 ? "+${n-3} more" : null` (**"— see show page" tail dropped**, em dash gone with it).
- `roleChangesParam` (retained for the non-`<ul>` string callers — `PerShowAlertSection` and BellPanel's own 0/1-change path) drops the tail identically: overflow → `"+${n-3} more"`. **This is a GLOBAL helper copy change** (a §9 em-dash fix + the ratified tail drop), so every surface that renders `<role-changes>` as a string is affected — see the cross-surface scope note below.

**Cross-surface scope of the `roleChangesParam` string change:**
- `lib/admin/bellFeed.ts:293` → BellPanel: BellPanel's ≥2-change path now uses the structured `<ul>` (does not render `roleChangesParam`'s string); its 0/1-change path uses the tail-dropped string. In scope, tested (WI-4 BellPanel tests).
- `components/admin/PerShowAlertSection.tsx:238` renders ROLE_FLAGS_NOTICE (doug per-show audience) as a string via `renderCatalogEmphasis` — it receives the **tail-dropped, em-dash-free** copy but NOT the `<ul>` (structured list is BellPanel-only). **In scope:** add a rendered regression test for PerShowAlertSection's multi-change ROLE_FLAGS_NOTICE (overflow ends `"+N more"`, NO "see show page", NO `—`).
- `components/admin/telemetry/HealthAlertsPanel.tsx:77` calls `deriveAlertMessageParams` but renders **health-audience** alerts only; ROLE_FLAGS_NOTICE is `audience:"doug"` (`catalog.ts:853`), so the panel never surfaces it. The helper's changed output is computed-but-unused there → no rendered copy change reaches HealthAlertsPanel (consistent with §9). No new HealthAlertsPanel test needed for role-changes; its only touch is the optional `renderCatalogEmphasis` param it does not pass.

**BellPanel render (message block, WI-1 sibling):** when `entry.code === "ROLE_FLAGS_NOTICE"` AND `parseChanges(entry.context).length >= 2` AND the template contains the literal `<role-changes>` token:
1. Split `dougFacing` on the literal `<role-changes>` into `prefix` (`"In <sheet-name>, "`) and `suffix` (`"<lead-hint>"`).
2. Render `prefix` via `renderCatalogEmphasis(prefix, params, BELL_BOLD_IDENTITY_TOKENS)` (bolds `<sheet-name>`), inline.
3. Render `roleChangeLines(changes).header` as inline text, then a real `<ul className="mt-1 list-disc pl-5 text-sm text-text-subtle">` with one `<li className="wrap-break-word">{item}</li>` per item (body weight — NO `font-semibold`), then, if `overflow`, `<p className="mt-1 text-xs text-text-faint">{overflow}</p>`.
4. Render `suffix` via `renderCatalogEmphasis(suffix, params, BELL_BOLD_IDENTITY_TOKENS)` (the `<lead-hint>` param; empty string when no LEAD delta).
- **Defensive fallback:** if the template lacks the `<role-changes>` literal (future template edit) OR `< 2` changes, render the whole `dougFacing` via the ordinary WI-3 `renderCatalogEmphasis` path (no `<ul>`) — never crash on a template shape change.

**Em-dash sweep (DESIGN.md §9):** `ROLE_CHANGES_FALLBACK` `:27` (`"…changed — see the show page."` → `"a crew member's role flags changed; see the show page."`) and the `:244` overflow string (em dash removed with the tail). `LEAD_HINT` `:26` has NO em dash (verified) — untouched. The `→` arrow in `<li>` items is NOT an em dash — retained.

**Guard conditions:**
- `changes.length === 0`: `roleChangeLines` returns `{header:"", items:[], overflow:null}`; BellPanel takes the defensive/ordinary path → renders the fallback sentence prose (no `<ul>`).
- `changes.length === 1`: ordinary path → `singleSentence` prose (no `<ul>`).
- `changes.length` 2..3: `<ul>` with all items, no overflow line.
- `changes.length > 3`: `<ul>` capped at 3 items + overflow `<p>`.
- Template missing `<role-changes>` literal: defensive ordinary path (no crash, no `<ul>`).
- Non-`ROLE_FLAGS_NOTICE` codes: ordinary path (no `<ul>`).

### WI-5 — Chevron one-time dismissible hint

Chevron behavior changed expand→navigate (PR #472). Add a one-time dismissible hint for returning sighted users. Shown only until dismissed, on the **first** `ActiveRow` that has a chevron. Persist dismissal in `localStorage` under key `fxav:bell-chevron-hint:v1` (client-only; SSR renders nothing until mounted to avoid hydration mismatch).

**In-flow placement (NOT absolute — avoids clipping in the scroll container):** active rows render inside a `max-h-… overflow-y-auto` panel scroll container; an absolutely-positioned chip on the first chevron row could be clipped at the panel top/right edge and place its dismiss button outside the clickable area at mobile (≤420px) width. Instead the hint renders **in-flow** as the FIRST child of the active-rows list content (top of the scroll container's flowing content, before the first `ActiveRow`), so it can never clip, never create horizontal overflow, and its dismiss button is always within the panel. It is a single panel-level banner (one instance total), shown only when at least one active row has a chevron.

**Exact DOM shape (no nested interactive content):** a full-width in-flow block `<div role="note" data-testid="bell-chevron-hint" className="mx-4 mt-2 flex items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs text-text-subtle">` containing: the text "The ⌄ chevron now opens the show page" (the glyph is decorative, `aria-hidden`), a flex spacer, and a dismiss `<button type="button" data-testid="bell-chevron-hint-dismiss" aria-label="Dismiss hint" className={GHOST_DISMISS}>` (its own top-level control, never wrapped by any `<a>` — clicking writes `localStorage` and unmounts, never navigates). The chevron `<a>` (testid `bell-caret-${id}`) is UNCHANGED and structurally unrelated to the banner. AT is already covered by the chevron's own `aria-label="Open show page"`; the banner is a supplemental visual affordance for returning sighted users.

**localStorage access is fully guarded (throwing-safe, not just absent-safe):** BOTH the read (mount) and write (dismiss) wrap every `localStorage` access — the property accessor itself, `getItem`, AND `setItem` — in `try/catch` (Safari private mode / hardened-privacy browsers throw on access, not just return null). A read throw → treat as not-dismissed-but-suppress (banner absent, no crash); a write throw on dismiss → still unmount the banner locally for the session, swallow the error, never navigate, never break the panel render. The BellPanel render lifecycle must never throw from this cosmetic hint. Centralize in a tiny `safeGetDismissed()/safeSetDismissed()` pair (or a `useDismissibleOnce(key)` hook) so the try/catch cannot be forgotten at a call site.

**Guard conditions:**
- No chevron on any active row (all `slug === null`): no banner (nothing to hint about).
- `localStorage` unavailable, throwing, OR already dismissed: no banner (fail-safe: absence, never an error).
- Pre-mount (SSR / first paint): banner not rendered (mount-gated via a `useHasMounted`-style client hook) — prevents hydration mismatch and flash.
- Exactly ONE banner instance total (panel-level, top of the active list), never per-row.
- Empty active list: no banner.

### WI-6 — PerShow link tap-target parity

In `PerShowAlertSection.tsx`, align the action link (`:348-358`) and Learn-more link (`:364-377`) with BellPanel's `LINK_CTA`/`HELP_LINK` vocabulary. The cited links are **plain inline `<a>`** today (`self-start text-xs …`) — a bare `min-h-tap-min` on an inline anchor does NOT produce a real 44px target, so all three classes are required together: **add `inline-flex items-center` AND `min-h-tap-min` AND `ring-offset-surface`** to both links (the `inline-flex` is what makes `min-height` effective). Existing testids, hrefs, and text-size/color classes unchanged. (The `HelpTooltip` "Learn more →" at `:298-304` is out of scope — separate component, not a PerShowAlertSection link.)

**Guard:** additive class change; render behavior otherwise identical.

**Test (`tests/components/admin/perShowAlertActionLink.test.tsx` / `HelpLink.test.tsx`):** assert both links' classNames include `inline-flex`, `items-center`, `min-h-tap-min`, AND `ring-offset-surface`. Preferred (real-browser, in the layout spec): assert rendered link height ≥ 44px. A class-only assertion that checks `min-h-tap-min` alone would pass while the target stays sub-44px — assert the `inline-flex` companion too.

---

## 5. Dimensional Invariants (real-browser assertions required)

Tailwind v4 in this repo does NOT default `.flex` to `align-items: stretch`; assert every relationship in a real browser (Playwright), not jsdom.

| # | Parent | Child | Invariant | Guaranteeing class |
|---|--------|-------|-----------|--------------------|
| DI-1 | header flex row `[data-testid=bell-header-${id}]` | right-group `[data-testid=bell-meta-${id}]` | **ACTUAL FLUSH (not `≤`):** chevron-present → `caret.left − meta.right` equals the header flex gap (`gap-2` = 8px) within ±1px; chevron-absent (`slug===null`) → `abs(headerContentRight − meta.right) ≤ 0.5px` where `headerContentRight = bell-header.right − paddingRight`. A permissive `≤` is INSUFFICIENT — it blesses the far-left-timestamp screenshot bug. | `shrink-0` on right-group; header `flex items-start gap-2` |
| DI-2 | header flex row | chevron `[data-testid=bell-caret-${id}]` | `abs(caret.right − headerContentRight) ≤ 0.5px` (chevron flush to row content right edge) | chevron is last flex child; `SHOW_PAGE_LINK` `shrink-0` |
| DI-3 | header flex row | title button `[data-testid=bell-entry-toggle-${id}]` | button height ≥ 44px (`min-h-tap-min`); button is `flex-1` and does not overflow the right-group off-row | `min-h-tap-min flex-1 min-w-0` |
| DI-4 | ActiveRow row `[data-testid=bell-entry-${id}]` | timestamp `[data-testid=bell-time-${id}]` | timestamp right edge ≥ (title button right edge) — i.e. timestamp sits to the RIGHT of the title column, the screenshot fix | right-group ordering + `shrink-0` |

The harness asserts `getBoundingClientRect()` on `bell-header-${id}`, `bell-meta-${id}`, `bell-caret-${id}`, `bell-time-${id}`, `bell-entry-toggle-${id}` for both a chevron-present and a chevron-absent (`slug===null`) fixture row.

## 6. Transition Inventory

States are largely static per row; the animated surfaces are the WI-5 hint and existing hover/focus. Enumerate:

| State pair | Treatment |
|------------|-----------|
| Hint banner visible → dismissed | Instant removal on dismiss click (no exit animation needed; `localStorage` write + unmount). In-flow, so rows below shift up instantly. Acceptable per prior BellPanel hover-only motion budget. |
| Hint banner absent (dismissed) → visible | Never re-appears within a browser profile (one-time). No transition. |
| Pre-mount → mounted (banner) | Banner mounts silently after `useHasMounted` flips; no entrance animation (avoids flash). Because it is in-flow at the list top, its mount pushes rows down by its height (no overlap, no clip). |
| Row unread (`bg-stale-tint`) → read (`hover:bg-surface-sunken`) | Existing `transition-colors motion-safe:duration-fast` on row `:363` — unchanged by restructure. |
| Message block present ↔ absent | Instant (conditional render); no animation — consistent with today. |
| `<ul>` multi-change ↔ single-sentence | Instant (mutually exclusive render branches on the same alert code); no compound transition — a given alert row does not toggle change-count live. |

Compound transition check: the banner dismiss occurs independently of row read-state. Because the banner is in-flow at the list top, dismissing it shifts rows up by its height (expected, not a bug) but never overlaps or clips a row. Verify in the transition-audit / layout task that (a) with the banner present the panel has NO horizontal overflow, (b) the banner and its dismiss button are fully within the panel bounds at both mobile and desktop widths, and (c) the banner never overlaps the first row's chevron (in-flow ⇒ trivially non-overlapping; assert the banner's bottom edge ≤ first row's top edge).

## 7. Test plan & anti-tautology

- **renderEmphasis identity-bold** (`tests/components/renderEmphasis.test.tsx` + extend `tests/messages/_metaEmphasisRenderContract.test.ts`): assert an identity-key param renders inside `<strong>`; a non-identity param renders as a plain text node (assert the specific node type, not just textContent); `identityKeys` omitted → no `<strong>` (back-compat); empty value → no empty `<strong>`; template `*em*` around an identity param → both `<em>` and `<strong>`. Anti-tautology: extract the identity value's rendered node and assert its tag is `STRONG`, scoped to that node — do NOT assert on the container textContent (which would pass even if bold were dropped).
- **Bold-token narrowing** (structural, `tests/adminAlerts/deriveMessageParams.test.ts` or a meta-test): assert `BELL_BOLD_IDENTITY_TOKENS ⊆ IDENTITY_PARAM_TOKENS`, that it contains exactly `{show-name, sheet-name, crew-name}`, and that `role-changes`/`email`/`repo`/`file-name`/`crew-row-count`/`failed-sheet-names` are each absent. Failure mode caught: a future identity-token addition silently bolding structured/prose params.
- **Single-change ROLE_FLAGS_NOTICE not fully bold** (`tests/components/bellPanel*.test.tsx`): render a 1-change `ROLE_FLAGS_NOTICE` in BellPanel; assert the role-change sentence text node is NOT inside a `<strong>` (only the `<show-name>` name, if present in the template, is bold). Failure mode: `role-changes` leaking into the bold set.
- **Learn-more survives suppressed message** (`tests/components/bellPanel*.test.tsx`): render a cataloged entry with `helpHref` set and message null/unresolved; assert `bell-help-${id}` still renders (in the message block, alone) and is NOT in ActionCell. Failure mode: the WI-2 move orphan-drops the help link on the suppressed-message path.
- **roleChangesParam (prose path)** (`tests/adminAlerts/deriveMessageParams.test.ts`): covers 0→`ROLE_CHANGES_FALLBACK`, 1→`singleSentence`, and multi-change tail removal (overflow ends `"+${n-3} more"`, NO "see show page" substring, NO `—`). Derive expected from fixture `RoleChange[]` dimensions, never hardcode.
- **roleChangeLines (structured path)** (`tests/adminAlerts/deriveMessageParams.test.ts`): covers ONLY `changes.length >= 2` — returns `{header:"${n} role changes:", items:[…], overflow}`. Assert `items` count = `min(n,3)`, each item has NO leading `• ` marker, NO `—`; `overflow` = `"+${n-3} more"` for n>3 else `null`. For the retained inert 0/1 return, assert `{header:"", items:[], overflow:null}` explicitly (documents the inert branch; the prose fallback is `roleChangesParam`'s job, NOT this helper's). Derive expected from fixture dimensions. Failure mode caught: mixing prose fallback into the structured helper, or reintroducing the tail/em dash.
- **BellPanel multi-change `<ul>`** (`tests/components/bellPanel*.test.tsx`): for a 4-change `ROLE_FLAGS_NOTICE` fixture, assert a real `<ul>` with 3 `<li>` + an overflow `<p>`; assert `<li>` font-weight is body (not bold) by asserting the class lacks `font-semibold`/`font-bold`; assert the `<ul>` is NOT a descendant of the mark-read `<button>` (query button subtree, assert no `<ul>`). Failure mode: `<ul>` nested in button (invalid HTML) or bold items.
- **Message-out-of-button** (`tests/components/bellPanel*.test.tsx`): assert the message span and inline Learn-more `<a>` are siblings of, not descendants of, the toggle button; assert the toggle button's accessible name is the title only (clone the button subtree, assert it contains no message text). Failure mode: message still inside button.
- **Learn-more inline** : assert `bell-help-${id}` is inside the message block, not in ActionCell (`bell-action-*` container); assert ActionCell has no `bell-help-*`.
- **Chevron hint** (`tests/components/bellPanelDeferrals.test.tsx` or new `bellChevronHint.test.tsx`): assert banner absent pre-mount; present after mount when not dismissed; absent after dismiss (localStorage set); exactly one banner across a multi-row feed; absent when all rows lack a slug; absent on empty list. Mock `localStorage`. **Throwing-localStorage path (required):** with `window.localStorage` made to THROW on the accessor / `getItem` / `setItem` (Safari private-mode simulation), assert BellPanel renders without crashing, the banner is absent on read-throw, and clicking dismiss on a write-throw unmounts the banner without navigation or panel failure. **No-nested-interactive invariant:** assert `bell-chevron-hint-dismiss` is NOT a descendant of any `bell-caret-${id}` (query every caret subtree, assert no button), and that clicking dismiss unmounts the banner (does not navigate — the handler is the dismiss handler on a top-level `<button>`, not the chevron `<a>`).
- **PerShow multi-change copy** (`tests/components/PerShowAlertSection.test.tsx` or existing per-show test): render a 4-change `ROLE_FLAGS_NOTICE` per-show alert; assert the rendered overflow ends `"+1 more"` with NO "see show page" substring and NO `—`. Confirms the global tail/em-dash drop reaches this surface. (No `<ul>` expected here — string rendering retained; `<ul>` is BellPanel-only.)
- **PerShow tap-target** (`tests/components/admin/perShowAlertActionLink.test.tsx` / `HelpLink.test.tsx`): assert action + Learn-more classNames include `inline-flex`, `items-center`, `min-h-tap-min`, AND `ring-offset-surface` (the `inline-flex` companion is what makes `min-height` effective — asserting `min-h-tap-min` alone would pass a sub-44px anchor). Preferred: real-browser rendered height ≥ 44px. Failure mode: parity regression / inert min-height on an inline anchor.
- **Layout (real-browser)** `tests/e2e/bell-panel-layout.spec.ts`: DI-1..DI-4 with chevron-present + chevron-absent fixtures. jsdom insufficient. **Chevron-hint banner geometry — at mobile (≤420px) AND desktop widths:** with the banner present, assert (a) panel has no horizontal overflow (`panel.scrollWidth <= panel.clientWidth + 0.5`), (b) `bell-chevron-hint` and `bell-chevron-hint-dismiss` bounding rects are fully within the panel's rect (left/right/top/bottom within bounds), (c) the dismiss button rect is ≥44px tap target and clickable (perform the click, assert the banner unmounts), (d) banner bottom edge ≤ first `ActiveRow` top edge (in-flow, non-overlapping).
- **Transition-audit** (jsdom ok for prop presence): enumerate the banner's mount/dismiss conditional; assert dismiss removes it; assert no `AnimatePresence`/`exit` needed (instant is deliberate). Real-browser (in the layout spec) covers the geometry / non-overlap.

## 8. Meta-test inventory

- **EXTENDS** `tests/messages/_metaEmphasisRenderContract.test.ts` — add the identity-bold contract (identity keys → `<strong>`; back-compat when omitted).
- **NEW structural subset guard** (in `tests/adminAlerts/deriveMessageParams.test.ts`) — `BELL_BOLD_IDENTITY_TOKENS ⊆ IDENTITY_PARAM_TOKENS` and `role-changes ∉ BELL_BOLD_IDENTITY_TOKENS`, so a future identity-token addition cannot silently bold structured/prose params (guards the R1-HIGH finding class).
- **No new** admin_alerts code, message §12.4 code, DB table, RPC, or advisory-lock surface → `_metaAdminAlertCatalog`, `advisoryLockRpcDeadlock`, PostgREST-DML meta-tests: **N/A (no such surface touched)**.
- **Invariant 10 (mutation-surface observability):** ARC-2 adds no mutating HTTP route and no `"use server"` action. The WI-5 dismiss is a client-only `localStorage` write (no server round-trip). `onMarkRead` is pre-existing and unchanged. → **N/A (no new/modified mutation surface).**
- **Invariant 5 (no raw error codes in UI):** preserved — all copy still flows through `lib/messages/lookup` / catalog; the restructure moves DOM, not copy source.

## 9. Out of scope

- No change to `onMarkRead` semantics, bell feed RPC, realtime, or badge counts.
- No change to `HealthAlertsPanel` **rendering**: it renders health-audience alerts only and never surfaces the doug-audience `ROLE_FLAGS_NOTICE`, so the global `roleChangesParam` copy change is computed-but-unused there. Its sole code touch is the shared `renderCatalogEmphasis` gaining an optional param it does not pass (back-compat, verified). (`PerShowAlertSection` DOES render ROLE_FLAGS_NOTICE and IS in scope for the tail-dropped copy + a rendered test — see WI-4 cross-surface note; not out of scope.)
- `HelpTooltip` "Learn more →" (`PerShowAlertSection:298-304`) tap-target — separate component, not in this pass.
- The `→` arrow in role-change bullets is retained (not an em dash; DESIGN.md §9 bans only `—` and `--`).

## 10. Disagreement-loop preempts (for reviewer)

- **Message no longer a click target for mark-read** is intentional and user-ratified ("Move message out of button"), forced by the HTML content model (`<ul>`/`<a>` illegal in `<button>`). Not a regression.
- **Bare identity tokens getting weight at render, not via template markup** is spec-ratified per PR #469 (wrapper-check saga) — bolding MUST happen at the render pass, never by injecting `**` into templates.
- **Dropping "see show page" from overflow** is the ratified `ALERT-MULTI-CHANGE-TONE-1` fix shape (chevron/nav already carries it). Not a lost affordance.
- **`→` retained** — deliberate, not an em-dash-sweep miss.
- **WI-5 one-time hint via localStorage** (not a server-persisted per-user flag) is deliberate: crew/admin identity has no per-user pref store for this, and the hint is cosmetic; `localStorage` scoping is acceptable and fail-safe.

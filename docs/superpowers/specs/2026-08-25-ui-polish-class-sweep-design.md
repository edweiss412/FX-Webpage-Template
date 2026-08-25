# UI polish class sweep — combined spec and plan (2026-08-25)

**Branch:** `feat/ui-polish-class-sweep` · **Arc:** product-facing · **Does not merge.** It ends at a READINESS line to `bl-orch`; Eric rules on the `## Decisions taken` block before it lands.

Eleven open `BL-` rows, all product-facing, all blocked on a design decision nobody had taken. Under the 2026-08-25 process mint freeze, "product rows waiting on a decision are the head of the queue: the decision is the work, so ask for it." This arc takes each decision, ships the repair, and states the choice so it can be overridden at review rather than re-queued.

Every row was already probed at filing. This document does not re-probe; it cites the row and the live `file:line`, re-derived in this worktree at `dce1e5e2f`.

**Process findings do not mint rows.** Anything process-facing this arc hits goes to the owning surface's documented-limits record with a re-file trigger. There are two, both recorded in §6.

---

## 1. Decisions taken

Each is a design call the ledger row deferred. The reason is one line; the row body carries the long form.

| # | Decision | Reason |
|---|---|---|
| D1 | `DESIGN.md` §1.2a's control-outline rule **supersedes** the §3 R3 ShareHub mobile skin. Both ternary arms and the kebab move `max-sm:border-border` to `max-sm:border-text-faint`. | R3 ratified a *split row layout*, and the border clause was one line of skin inside it. Keeping it means one button paints 3.35:1 above 640px and 1.27:1 below, on the viewport where the crew-facing half of the product lives. A responsive layout decision does not get to carry a contrast regression as a rider. |
| D2 | Tinted plates get **their own outline token**, `--color-control-outline-tinted`, used only on a control standing on `warning-bg` / `info-bg` / `danger-bg`. The shared `--color-text-faint` does not move. | The four neutral grounds already clear 3:1 at `text-faint`; retuning the shared token to rescue the plates pushes the neutral grounds the other way. A second token costs one row in §1.2 and one recipe branch. |
| D3 | §1.2a gains a **pairing clause**: chrome rendered in-frame with a control of the same recipe takes that control's outline weight. Both chips move to `border-text-faint`. | The alternative — "chrome follows chrome" — is defensible in the abstract and wrong here: the reader sees one frame, not two taxonomies. A rule closes both sites and the next one; a per-site judgment closes neither. |
| D4 | `text-faint` **is** admissible as a resting colour, under one condition named in §1.1a: *a non-colour affordance carries the control at rest* (a glyph that IS the control, a boundary at ≥3:1, or a native affordance such as `cursor-help`). Three of the four sites meet it and are registered; one does not and moves to `text-text`. | The four sites are not one thing. Two are icon-or-boundary controls where colour was never carrying the affordance; one is a bordered badge whose 3.35:1 ring does the work. The fourth is a text-only action in a list row, and there the colour IS the only cue. |
| D5 | The dev panel is **ratified as an unstyled developer tool.** The `@source not` exclusion stays; the two census rows move to a documented-limit record with a re-file trigger. | The surface is build-gated out of production by `ADMIN_DEV_PANEL_ENABLED`. Narrowing the exclusion ships production CSS for a surface no crew member, admin or operator can reach, and `BACKLOG.md:546` records the sharper problem: adding `min-h-tap-min` today emits no CSS while making the static guard report a floor the browser never applies. That is strictly worse than the honest under-floor row. |
| D6 | FINANCIALS: wrap **only the checkbox and its short caption** in a `<label>`, leave the caution copy outside it still bound by `aria-describedby`, and put `min-h-tap-min` on the label. Identical shape in both files. | The `div` carrying the floor today toggles nothing. Wrapping the caution too would fold it into the accessible name, which is the exact mechanism `RoleRecognizeControl.tsx:339-341` exists to protect. |
| D7 | The staged-review radio label takes its own floor. | The row deferred it under class-sweep exception (c), "a surface this branch does not otherwise touch". This branch touches it, so (c) no longer fences it. |
| D8 | Inactive carousel slides leave the accessibility tree (`aria-hidden={!isActive}`), and the active-slide transition gains an announcement so it is not silent. | The row carries no `Class-sweep exception` field and nothing in it argues against hiding. Its only deferral reason was that the change moves role-based queries, which is work, not disagreement. |
| D9 | The urgent alert-pill branch gains a boundary in its own text colour. The monitoring branch does not move. | Moving the monitoring branch down trades a hierarchy problem for a legibility one. The urgent branch has a tinted fill and a filled dot and no boundary; adding one is the emphasis it was missing. |
| D10 | The run-of-show `<summary>` keeps Family S and **renders a chevron**. §1.1a gains a sentence saying what counts as the affordance when the native marker is suppressed. | A trailing ellipsis is not a fold affordance on a mobile-first crew surface. Reclassifying out of Family S would change the row's tone, which is the thing the dimness was chosen for. |
| D11 | Both `app/globals.css` accent figures are recomputed and corrected in place. The prose conclusion stays; **its stated reason changes**, because the reason was the false figure. | The measured values are 5.34:1 on `--color-bg` and 4.78–5.05:1 light / 6.56–8.19:1 dark on the tinted Callout fills — all at or above the 4.5:1 floor. The conclusion (prose links use text colour plus underline, not the accent) is ratified and correct, but it can no longer rest on "the accent fails AA". It rests on chrome consistency with Header/Breadcrumb. |

---

## 2. Live state, re-derived in this worktree

Every line below was read from the worktree, not from the ledger row.

**Group A.** ShareHub's primary trigger is `components/admin/showpage/ShareHub.tsx:781`; its two ternary arms are the class strings at `components/admin/showpage/ShareHub.tsx:804` and `components/admin/showpage/ShareHub.tsx:805`, both carrying `border-text-faint` **and** `max-sm:border-border`. The kebab is `components/admin/showpage/ShareHub.tsx:817`, class string at `components/admin/showpage/ShareHub.tsx:829`. The design ratification is the in-file comment at `components/admin/showpage/ShareHub.tsx:798-801`. The executable ratification is the case named `keeps max-sm:border-border on BOTH ShareHub ternary arms`, `tests/styles/_metaControlOutlineFill.test.ts:306`.

Tinted-plate controls, re-derived (the ledger's five drifted lines are corrected here): `components/admin/DataQualityWarningControls.tsx:20` (`NEUTRAL_BTN`), `components/admin/MaintenanceResetButtons.tsx:308` and `components/admin/MaintenanceResetButtons.tsx:328`, `PerShowAlertResolveButton.tsx:94`, `ReapStaleSessionsButton.tsx:146`, `RecentAutoAppliedStrip.tsx:551`, `ReSyncButton.tsx:286`, `ShowRowActions.tsx:932`, `components/admin/wizard/archivedTabOffer.tsx:49` (`ARCHIVED_TAB_BTN`, both its accept and revoke call sites), `components/admin/StagedPreviewBanner.tsx:75`, `app/admin/settings/roles/RoleMappingRow.tsx:47` (`outlineBtn`), `components/shared/ReportModal.tsx:626`, and the step-3 review site in `components/admin/wizard/step3ReviewSections.tsx`. Four of the thirteen paint through a file-local constant rather than an inline string, which is why five of the ledger's line numbers drifted: the constant moved, the call site did not.

Paired chrome: `components/diagrams/GalleryLightbox.tsx:773` is the demote chip at `border-border-strong`; its twin the Reset chip is `components/diagrams/GalleryLightbox.tsx:708` at `border-text-faint`. `components/admin/StagedPreviewBanner.tsx:65` is the `aria-current` chip at `border-border-strong`, in a row with the picker `<Link>` at `components/admin/StagedPreviewBanner.tsx:75` carrying `border-text-faint`. **Neither element is interactive, so SC 1.4.11 does not reach either.** This is hierarchy, not accessibility, and any finding that argues it as a contrast failure is refuted by `BACKLOG.md:462`.

`text-faint` resting sites: `components/crew/primitives/SourceLink.tsx:80`, `components/shared/CardReportTrigger.tsx:79`, `components/admin/BellPanel.tsx:236` (`GHOST_RESOLVE`), `components/admin/HoverHelp.tsx:565`.

The stale comment is `app/globals.css:1250-1252`, not the `1206-1209` the row cites. The live light accent token is `#a65000` (`app/globals.css:378`).

**Group B.** The FINANCIALS checkbox sits in a `div` carrying `min-h-tap-min` with its `<label htmlFor>` as a sibling: `app/admin/settings/roles/RoleMappingRow.tsx:265-275`, `components/admin/RoleRecognizeControl.tsx:342-350`. The staged-review radio label is `components/admin/StagedReviewCard.tsx:575-578` — `flex cursor-pointer items-center gap-2 text-sm text-text`, no floor and no padding. Dev-panel buttons: `app/admin/dev/page.tsx:151` and `app/admin/dev/page.tsx:165`; the Tailwind exclusion is `app/globals.css:33`, its non-composition note at `app/globals.css:30-32`. Floor token `--spacing-tap-min: 44px`, `app/globals.css:223`. All five sites carry `under-floor-filed` rows in `tests/styles/tapTargetCensus.ts`.

**Group C.** `components/diagrams/GalleryLightbox.tsx:731` computes `const isActive = i === activeIndex;`; the `<figure>` at `components/diagrams/GalleryLightbox.tsx:736-742` carries no `aria-hidden`. `components/diagrams/Gallery.tsx:167` and `components/diagrams/Gallery.tsx:175` call `useAnnounceLog()` with no argument. `ANNOUNCE_LOG_TTL_MS` is exported at `components/admin/announceLog.tsx:52`.

**Group D.** `components/admin/showpage/PublishedReviewModal.tsx` carries three `-alert-pill` testids: `components/admin/showpage/PublishedReviewModal.tsx:967` (two-branch, classes at `components/admin/showpage/PublishedReviewModal.tsx:981` monitoring / `components/admin/showpage/PublishedReviewModal.tsx:982` urgent), `components/admin/showpage/PublishedReviewModal.tsx:1080` (`text-text-subtle` on `bg-surface-sunken`), and `components/admin/showpage/PublishedReviewModal.tsx:1088` (`text-status-positive-text`). `components/crew/primitives/RunOfShowList.tsx:82` is the `<summary>` with `list-none [&::-webkit-details-marker]:hidden` and no replacement marker.

---

## 3. Measured numbers

Recomputed in this worktree from `app/globals.css` with the standard WCAG 2.x relative-luminance formula, the same one `tests/styles/secondary-action-contrast.test.ts` uses.

**The new token.** `--color-control-outline-tinted` = `#7e7f86` light, `#88867f` dark.

| Ground | Light at `text-faint` | Light at the new token | Dark at `text-faint` | Dark at the new token |
|---|---|---|---|---|
| `--color-warning-bg` | 3.04 | **3.62** | **2.79** | **3.65** |
| `--color-info-bg` | **2.87** | **3.42** | 3.48 | **4.55** |
| `--color-danger-bg` | **2.88** | **3.42** | 3.19 | **4.17** |
| `--color-surface` (inner edge) | 3.35 | 3.99 | 3.76 | 4.91 |

Three relations hold, and they are what the guard asserts rather than the six constants: the new token clears 3:1 on every plate in both themes; it is HEAVIER than `--color-text-faint` on every plate in both themes; and it stays LIGHTER than `--color-text-subtle` (light 5.79–6.13, dark 4.72–5.89) on every plate in both themes, so §1.2a's hover-stays-heavier-than-rest rule survives the new resting weight.

**The accent figures the comment gets wrong.** `--color-accent-on-bg` on `--color-bg`: **5.34:1** light, 9.39:1 dark. On the tinted Callout fills (`app/help/_components/Callout.tsx:6` and `app/help/_components/Callout.tsx:14` — `bg-info-bg` and `bg-warning-bg`): on `info-bg` 4.78 light and 8.19 dark; on `warning-bg` 5.05 light and 6.56 dark. The comment's "4.11:1" and "≈3.6–3.9:1 … below the 4.5:1 normal-text floor" are both wrong, and the second is wrong in the direction that makes the stated reason false rather than merely stale.

---

## 4. Tasks

TDD per task (invariant 1), one commit per task (invariant 6). Scope: `crew-page`, `admin`, `assets`, `plan`.

| # | Task | Test first | Commit scope |
|---|---|---|---|
| T1 | Correct both accent figures at `app/globals.css:1250-1252`; rewrite the reason clause so the ratified conclusion no longer rests on a false premise; re-point the `BL-` reference at `BACKLOG-archive.md:4983`. | A case that recomputes both figures from the live tokens and asserts the comment's stated numbers match — so the comment cannot rot again silently. | `fix(assets)` |
| T2 | ShareHub: `max-sm:border-border` → `max-sm:border-text-faint` on both arms and the kebab. | **Invert** the pin at `_metaControlOutlineFill.test.ts:306` — same case intent, asserting the new token on both arms, with a docstring recording D1 and its date. Never delete or weaken it. | `fix(admin)` |
| T3 | Add `--color-control-outline-tinted` (both themes), swap the 14 tinted-plate controls to it, add the §1.2 rows and the §1.2a paragraph. | Contrast cases pinning the three relations of §3, plus the site registry of §5. | `feat(admin)` |
| T4 | §1.2a pairing clause; both chips to `border-text-faint`. | A case asserting each chip carries the control's token and naming its in-frame twin. | `fix(admin)` |
| T5 | §1.1a `text-faint` condition; register the three sites that meet it; move `GHOST_RESOLVE` to `text-text`. | A registry case per site naming the non-colour affordance and the file it lives in, in the shape `subtleInteractiveExemptions.ts` already uses. | `fix(admin)` |
| T6 | FINANCIALS `<label>` shape in both files; staged-review radio floor. | Accessible-name assertions (the caution must NOT be absorbed) plus the census rows moving off `under-floor-filed`. | `fix(admin)` |
| T7 | Dev panel: ratify unstyled; move the two census rows to a documented limit with a re-file trigger. | The census category change, and a case pinning that `app/admin/dev/page.tsx` stays excluded at `app/globals.css:33`. | `docs(admin)` |
| T8 | `ANNOUNCE_LOG_TTL_MS` on both `Gallery.tsx` channels. | A case asserting both calls pass the TTL. | `fix(crew-page)` |
| T9 | `aria-hidden={!isActive}` on the lightbox `<figure>`; active-slide announcement. | Move the role-based queries in `tests/components/diagrams/GalleryLightbox.test.tsx`; assert exactly one slide is exposed and that a swipe announces. | `fix(crew-page)` |
| T10 | Urgent alert-pill branch gains `border border-warning-text`; sweep all three pill sites into one stated ladder. | A case deriving each pill's emphasis affordances from its class string and asserting the urgent branch carries strictly more than the monitoring one. | `fix(admin)` |
| T11 | Chevron on the run-of-show `<summary>` and on the three no-cue peers; §1.1a Family S sentence; update the registry row's caveat. | A case over the Family S registry asserting every marker-suppressing member renders a replacement cue. | `fix(crew-page)` |
| T12 | Playwright pass over every touched surface: `getBoundingClientRect().height >= 44` on each repaired tap target at 390px and 1280px, and computed colours at each repaired outline and text site **including below 640px** for the ShareHub arms. | The pass IS the test. jsdom computes no layout, so nothing above verifies a floor or a rendered colour. | `test(admin)` |
| T13 | Ledger graduation, closeout §12, `impeccable-gate:` marker. Markers come off in this commit. | `tests/docs/_metaLedgerInProgress.test.ts` and `_metaInvariant8Closeout.test.ts`. | `docs(plan)` |

---

## 5. The class sweep, and what it is derived from

Round 0, per AGENTS.md. Each shape was grepped across `app/` and `components/` before any named instance was patched.

**A1 — responsive outline downgrade.** `max-sm:border-border` / `sm:border-border` on a control: three occurrences, all ShareHub (`components/admin/showpage/ShareHub.tsx:804`, `components/admin/showpage/ShareHub.tsx:805`, `components/admin/showpage/ShareHub.tsx:829`). One non-peer, stated so a reviewer does not re-raise it: `components/admin/BellPanel.tsx:1271` carries `sm:border-border`, but it paints a POPOVER PANEL edge, and it ADDS the border at `sm` rather than dropping it. §1.2a puts panel edges out in both directions.

**A2 — controls on tinted plates.** Thirteen sites, fourteen controls, from the ledger's probe. The completeness direction is a documented limit; see §6.

**A3 — paired chrome.** Two sites, both named in `DESIGN.md` §1.2a's own "what did not move with the 21" paragraph, which is the derived record.

**A4 — resting `text-faint` on a control.** Four sites, all four live. The wider grep returns ~40 `text-text-faint` occurrences, but the rest are captions, eyebrows, separators and `aria-hidden` glyphs, none of which is an action target.

**C1 — `useAnnounceLog()` with no TTL.** Three call sites, not two: `Gallery.tsx:167`, `Gallery.tsx:175`, and `components/admin/review/ShowReviewSurface.tsx:389`. The third is **explicitly out**, and this is a ratification, not an oversight: the comment at `components/admin/review/ShowReviewSurface.tsx:382-388` records that announcer spec 2026-07-22 §2.2 ratifies no timer-based pruning on that channel, and its MutationObserver suite pins it. Invariant 7 says the spec wins. Sweeping it would silently supersede a ratified contract in another spec.

**D1 — alert-pill weight.** Three `-alert-pill` testids in one file, swept together.

**D2 — `<summary>` with a suppressed marker and no replacement cue.** The shape's derived cover is the walk in T11: every `<summary>` under `app/` and `components/` whose class suppresses the native marker, checked for a replacement cue in its own element body. Sixteen such summaries; eleven render a chevron, one carries an underline, and one (`components/admin/HelpTooltip.tsx:68`) IS a glyph target whose entire content is the affordance. Four have no cue at all: `components/crew/primitives/RunOfShowList.tsx:82` (the named row), `components/crew/sections/TodaySection.tsx:567`, `components/crew/sections/GearSection.tsx:380`, `components/messages/ErrorExplainer.tsx:114`. **All four are repaired in this PR.** "Same defect, different file" is not a deferral reason, and three of the four are crew surfaces, which is where a missing fold cue costs the most.

**Sites that ARE in the sweep's shape and are deferred: none.** Every peer this sweep found is repaired here.

---

## 6. Documented limits

Two, both process-facing. Under the 2026-08-25 freeze neither mints a `BL-` row; each is recorded on its owning surface with a re-file trigger.

**L1 — the tinted-plate cover is a registry, not an ancestor resolution.** `tests/styles/interactiveScanCore.ts` resolves an element's own `className` and has no notion of an enclosing fill, so "is this control standing on a tinted plate?" cannot be asked of it. Giving it ancestor resolution is recognizer growth of exactly the shape AGENTS.md **"Repair direction under same-axis recurrence"** declines, and it is the reason `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` was left untouched by this arc. So the cover is: the token relations of §3 (complete, computed), plus a registry of the thirteen sites with a fail-by-default arm **within those thirteen files** — a `border-text-faint` occurrence in a registered file that is not itself registered fails. A fourteenth file gaining its first tinted-plate control is outside the cover. Recorded in the guard file's header. **Re-file trigger:** a control on a tinted plate reaching `main` at `border-text-faint`, or the scanner gaining ancestor resolution for another reason.

**L2 — the dev panel's two under-floor sites are unmeasurable where they live.** D5 ratifies the surface as unstyled, so the census rows move from `under-floor-filed` to a dev-only documented limit. The floor is not enforced there and the guard no longer claims it is. Recorded in `tests/styles/tapTargetCensus.ts`. **Re-file trigger:** `ADMIN_DEV_PANEL_ENABLED` becoming true in a production build, or the panel gaining a non-developer audience.

---

## 7. Convergence criterion

Closed, and it is the only thing that converges this diff: **every row's done condition in §1 is demonstrated by a test or by a screenshot the PR body links, and the impeccable dual gate is P0/P1 clear.** Nothing else. One whole-diff Codex round, cap two. At the cap the arc ships and fences: residue is recorded in §6, and no new axis is opened.

---

## 8. Dimensional Invariants

Only the tap-floor repairs create a parent-to-child dimension relation. Each row names the class that guarantees it. Tailwind v4 does not default `.flex` to `align-items: stretch`, so nothing here relies on an implicit stretch.

| Parent | Child | Invariant | The class that guarantees it |
|---|---|---|---|
| FINANCIALS row `div` (`app/admin/settings/roles/RoleMappingRow.tsx`, `components/admin/RoleRecognizeControl.tsx`) | the new `<label>` wrapping the checkbox and its short caption | label height ≥ 44px, and the label is the toggling target | `min-h-tap-min` on the `<label>` itself, not on the row `div`. The row keeps `items-start`, so the label sizes to its own content plus the floor. |
| `<fieldset>` (`components/admin/StagedReviewCard.tsx:570`) | each option `<label>` | label height ≥ 44px | `min-h-tap-min` plus vertical padding on the `<label>`; the fieldset imposes no height. |
| `<summary>` (`components/crew/primitives/RunOfShowList.tsx:82` and the three peers) | the chevron glyph | the chevron must not reduce the summary below its existing 44px floor | the summary keeps `min-h-tap-min`; the chevron is `shrink-0` inside an `items-center` row, so it lays out beside the label rather than competing with it. |
| ShareHub band row below 640px (`components/admin/showpage/ShareHub.tsx:804-805`) | the primary trigger | one 44px line, unchanged by the token swap | `max-sm:min-h-tap-min` is untouched by this arc; only the border COLOUR moves, and border width stays 1px. |

T12 asserts every row above in a real browser with `getBoundingClientRect()`, at 390px and 1280px. jsdom computes no layout and cannot verify any of them.

## 9. Transition Inventory

Every touched surface with more than one visual state. Most entries are deliberately instant, and saying so is the point: an unlisted pair is how an animation bug ships.

| Surface | State pair | Treatment |
|---|---|---|
| Alert pill | monitoring ↔ urgent | Instant. The branches are distinct renders of one button; there is no in-place morph and never was. |
| Alert pill | urgent ↔ unavailable, urgent ↔ in-sync, monitoring ↔ unavailable | Instant. Different elements entirely (`<button>` vs `<span>`), swapped by the enclosing ternary. |
| Alert pill | any branch, resting ↔ hover | `transition-colors duration-fast`, already present, unchanged. The urgent branch's new border inherits it. |
| Lightbox slide | inactive → active | The Embla scroll is the motion; `aria-hidden` flips at the same commit as `isActive`, so exposure and paint agree. The new announcement fires on the settled index, not mid-scroll, or a fast swipe would queue one sentence per slide crossed. |
| Lightbox slide | active → inactive while the demote chip is up | Compound, and it stays correct: the chip is already `aria-hidden` and keyed to `demotedNotice.id`, so hiding its slide adds no second hide. The chip's entry-only fade is untouched. |
| `<summary>` chevron | closed ↔ open | Instant rotation via `group-open:rotate-90` where the peers already carry `group`, and no rotation at all where they do not. Reduced motion needs no branch: a discrete transform with no `transition-*` class does not animate. |
| ShareHub trigger | ≤640px ↔ >640px | Not a transition. A media-query boundary repaints; nothing tweens across it. Listed so the arms' new token is not read as a state change. |
| `GHOST_RESOLVE` | resting ↔ hover | `transition-colors duration-fast`, unchanged. Resting moves `text-faint` → `text-text`; hover keeps its `bg-surface-sunken` lift, so hover still visibly strengthens. |

## 10. Resolved scope — do not relitigate

Each of these is settled by a ratification that predates this arc, or by a decision in §1 that Eric reviews as a decision rather than as a defect.

- **The §3 R3 ShareHub mobile skin** (`components/admin/showpage/ShareHub.tsx:798-801`). D1 supersedes its border clause deliberately. The split-row layout it ratified is untouched.
- **The `text-text-subtle` census and its 14 exemption rows** (`tests/styles/_metaSubtleOnInteractive.test.ts`). This arc adds a second policed token's CONDITION to §1.1a; it does not re-open the ratified census or any of its rows.
- **The prose-link decision that the accent is used in no state** (`app/globals.css:1243-1255`). Ratified and kept. Only the two figures were wrong, and D11 replaces the reason that rested on them.
- **The paired-chrome sites are hierarchy, not SC 1.4.11** (`BACKLOG.md:462`). Neither chip is interactive. A finding arguing either as a contrast failure is refuted by the row itself.
- **`BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` stays open, untouched, unmarked.** Its done condition requires widening `tests/styles/interactiveScanCore.ts`'s tag vocabulary, which is recognizer growth. It is the successor arc once D2 and D3 are ratified, not part of this one.
- **`components/admin/review/ShowReviewSurface.tsx:389` keeps no TTL.** Ratified by announcer spec 2026-07-22 §2.2 and pinned by that surface's own MutationObserver suite.
- **The dev panel's Tailwind exclusion stays** (`app/globals.css:33`). D5 is the decision; L2 is its recorded cost.

---

## 11. What changed after this document was written

Recorded here rather than folded silently into §1, because two of the eleven decisions moved after the design was drafted and a reader comparing the diff to §1 would otherwise find a discrepancy with no explanation.

**D8 was ruled by the owner, not taken by this arc.** The design doc pre-decided the `aria-hidden` half and paired it with an announcement routed through the lightbox's existing zoom live region, specifically to avoid reversing audit P1-B, which had removed `aria-live` from the page indicator because two competing polite regions interleave. Eric ruled on 2026-08-25 that the row closes with BOTH halves and that the announcement is **associated with the visible indicator**. That is what shipped. P1-B's mechanism objection is still answered: the zoom region stays silent on a navigation-driven scale reset, so exactly one region speaks per gesture-end. Its redundancy argument ("the slide change is already user-initiated via a labeled chevron") stopped being true in the same commit, since a swipe now replaces the only exposed figure and involves no button at all.

**D3's two chips landed on different tokens.** §1 says both move to the control's weight, and the brief that commissioned this arc expected both at `border-text-faint`. The pairing clause points at the TWIN rather than at a named colour, and D2 had already moved the staged-preview picker link onto the tinted token, so its `aria-current` chip took that. The lightbox demote chip took `border-text-faint` from the Reset chip. One rule, two twins, two tokens.

**Three of the brief's own citations had drifted** and were re-derived rather than trusted: five tinted-plate line numbers (those sites paint through a file-local constant that moved while the call site did not), the stale-comment location, and the archived accent row's line.

## 12. Close-out

impeccable-gate: critique=PENDING audit=PENDING p0=0 p1=0 dispositions=none

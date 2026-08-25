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
| D4 | `text-faint` **is** admissible as a resting colour, under one condition named in §1.1a: *the control renders no text of its own and its glyph is the affordance, or a non-colour affordance at ≥3:1 carries it*. **Two of the four sites meet it and are registered; two do not and move to `text-text`.** | The condition is narrower than the drafted one, and the split moved with it: the faint rung is 3.35:1, over the 3:1 floor a glyph or boundary is held to and under the 4.5:1 floor for TEXT. So the two sites that render their own label — the crew source link and the bell ghost-resolve control — cannot rest there whatever one concludes about hierarchy. The two that stay are a glyph-only trigger and a bordered badge. |
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
| T12 | Playwright pass over what a browser UNIQUELY settles: `getBoundingClientRect().height >= 44` on all three repaired tap targets at 390px and 1280px, and the ShareHub outline's `max-sm:` CASCADE measured at both widths, plus the tinted token's rendered contrast against each of the three plates. **Scope corrected — see the note below this table.** | The pass IS the test. jsdom lays nothing out and applies no stylesheet. | `test(admin)` |
| T13 | Ledger graduation, closeout §12, `impeccable-gate:` marker. Markers come off in this commit. | `tests/docs/_metaLedgerInProgress.test.ts` and `_metaInvariant8Closeout.test.ts`. | `docs(plan)` |


**What T12 measures, and what it deliberately does not (scope corrected 2026-08-25 after diff round 1).** An earlier draft of the row above promised "computed colours at each repaired outline and text site", which is far wider than the shipped pass and wider than a browser is needed for. The three claims that genuinely need an engine are: a tap floor, which is a computed height; the ShareHub CASCADE, where two competing classes sit on one element and the winner depends on viewport width; and the rendered contrast of the new token against each plate.

Every other colour site in this diff is settled at SOURCE, and re-measuring it in a browser would measure the same token twice. The thirteen tinted-plate controls, the two paired chips and the two swapped text sites all carry a TOKEN; the token's contrast is asserted as a relation computed from the stylesheet, and which element wears it is a source fact the unit guards pin by name. There is no cascade to resolve at any of them.

The plate-contrast cases use a synthetic element on purpose. What they measure is a token against a plate — a fact about two custom properties, not about any one component — so binding it to a particular button would narrow the claim without strengthening it.

The three tap-floor subjects, by contrast, are all mounted for real, including both FINANCIALS rows. D6 asserts the two rows take an identical shape, and "identical" is exactly the sort of claim a measurement should not take on trust: those two components drifted apart once already.
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

**L0 — a scan that reads source must model comments, and this branch proved it four times.** **Corrected after round 3.** This entry originally argued that the sites needed genuinely different things and that one helper would be the speculative abstraction causing the next defect. That was reasoning from an absence I never checked: the repo already ships `tests/_shared/stripComments.ts` as a mandatory single source, and `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` fails any walked test that hand-rolls comment handling. It named five files on this branch, all mine. Three of them wanted the shared module outright and are now routed through it; the fourth reads a comment AS ITS SUBJECT and carries a reasoned allowlist row. So the abstraction was neither speculative nor mine to decline — the one real distinction was between stripping comments and reading them, which the allowlist already expresses. The lesson stands; the conclusion drawn from it did not:

| Where | What it did | Caught by |
|---|---|---|
| `pairedChromeOutline.test.ts` | stripped `//` AFTER joining the window, deleting the className two lines below | its own premise assertion |
| `summaryFoldCue.test.ts` | reported two files as unrepaired because a COMMENT named `<summary>`; then twice more on where a block comment ends | the walk, then diff round 2 |
| `tintedPlateOutline.test.ts` | counted a comment naming `border-text-faint` as an occurrence of it | itself, on the commit that added it |
| `alertPillLadder.test.ts` | a bare `monitoringOnly ? … : …` regex landed on the status DOT's ternary depending on where a comment sat | the ladder assertion |

The through-line: **prose that names a token is not an element that wears it**, and every one of these scans was written as if the file were only code. Two of them were caught by a premise assertion rather than by review, which is the argument for premises. RE-FILE TRIGGER: a fifth instance, at which point the shared helper stops being speculative.

Two more, both process-facing. Under the 2026-08-25 freeze neither mints a `BL-` row; each is recorded on its owning surface with a re-file trigger.

**L1 — the tinted-plate cover is a registry, not an ancestor resolution.** `tests/styles/interactiveScanCore.ts` resolves an element's own `className` and has no notion of an enclosing fill, so "is this control standing on a tinted plate?" cannot be asked of it. Giving it ancestor resolution is recognizer growth of exactly the shape AGENTS.md **"Repair direction under same-axis recurrence"** declines, and it is the reason `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` was left untouched by this arc. So the cover is three arms, and the third is the one this section originally described wrongly.

1. The token relations of §3 — complete, computed, and independent of any site list.
2. A derived sweep over every element whose own class string declares a tinted plate through `focus-visible:ring-offset-*`. A control added tomorrow that follows that contract fails here by default.
3. A registry of the sites the sweep cannot see, each anchored, **plus a pinned count of the NEUTRAL-ground outlines in the same file.**

Arm 3's second half is the fail-by-default part, and it counts rather than forbids. An unregistered `border-text-faint` in a registered file is **not** a defect — a neutral-ground control living beside a plate control is correct, and `app/admin/settings/roles/RoleMappingRow.tsx` is exactly that shape (its edit button sits on the row card, its remove-confirm button inside the warning plate). What is worth failing on is the COUNT moving, because the author who added one is the only person who knows which ground it stands on. An earlier draft of this paragraph claimed the guard failed on any unregistered occurrence; it did not do that, and it should not, because that rule would be wrong.

A fourteenth file gaining its first tinted-plate control is still outside the cover. Recorded in the guard file's header. **Re-file trigger:** a control on a tinted plate reaching `main` at `border-text-faint`, or the scanner gaining ancestor resolution for another reason.

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
| `<summary>` chevron | closed ↔ open | A 90° rotation via `group-open:rotate-90`, carried by `transition-transform duration-normal` on all four instances. Reduced motion needs no per-component branch, but not for the reason this row first gave: the rotation IS animated, and `app/globals.css` collapses every motion-token duration to 0ms under `prefers-reduced-motion`, so the token is what makes it instant there. The earlier claim that these carried no `transition-*` class was simply wrong about the code. |
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

**D4's split changed with its condition.** The drafted decision kept three sites and moved one. Writing the condition executably made it narrower — *renders no text of its own* rather than *some non-colour affordance exists* — and under that wording the crew source link renders the label "In sheet" and fails it. The shipped split is two kept, two moved, and §1 above now says so. The guard is the authority either way: `KEPT` and `SWAPPED` in `tests/styles/faintRestingControls.test.ts` are two and two.

**Three of the brief's own citations had drifted** and were re-derived rather than trusted: five tinted-plate line numbers (those sites paint through a file-local constant that moved while the call site did not), the stale-comment location, and the archived accent row's line.

## 12. Close-out

impeccable-gate: critique=RAN-DEGRADED audit=RAN-DEGRADED p0=0 p1=1 dispositions=recorded

### Why both halves are RAN-DEGRADED

The critique contract requires Assessment A and Assessment B to run as two isolated sub-agents. **Four sub-agent dispatches were made — two for A, two for B.** All four ran to completion and went idle **without their final message ever reaching the parent**, and their transcripts were not recoverable from disk (searched the project's transcript directory by content and by recency; the in-process agents write no file there). A delivery request was sent to each; none answered.

Both assessments were therefore run inline, and both halves are declared `RAN-DEGRADED` rather than `RAN`. The detector half loses nothing to this — it is deterministic, and the numbers are the numbers. The design-review half loses genuine independence, and that is the honest cost: the same context that wrote the diff judged it. Recorded here so a reader weights the 32/40 accordingly rather than reading it as a fresh-eyes score.

### Critique — Design Health 32/40 (Good, top of band)

Snapshot written under the gitignored `.impeccable/critique/` tree, slug `feat-ui-polish-class-sweep-diff`, timestamp 2026-08-25T19-41-23Z. Not tracked by design, so the findings that matter are transcribed below rather than left behind a path a reader cannot open. First run for this slug, no trend yet.

- **AI-slop verdict: not slop.** Nothing decorative; one token added with its ratios measured in both themes; the only motion is a 90° chevron rotation on a token duration.
- **Detector: exit 0, 9 findings, 9 false positives.** All nine are the literal string `<img>` inside code comments or docstrings; the detector's markup scan does not strip comments. Zero sit on a line this diff adds.
- **P0: none. P1: none** (from the critique half).

### Audit — Health 19/20 (Excellent)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 4 | The diff's purpose. Removes two sub-floor contrast states, repairs an accessible-name defect, makes three tap targets real, takes N-1 carousel slides out of the accessibility tree, announces the current slide, adds four fold cues. One P1 found **and fixed inside this gate** — see below. |
| 2 | Performance | 3 | Nothing costly added: only `transition-colors` / `-opacity` / `-transform`, no layout-property animation, no new images or dependencies, and reduced motion is free through the project's global duration collapse. Scored 3 rather than 4 because the announcement effect gained an `activeIndex` dependency and therefore re-runs per navigation — correct, but not measured, and an unmeasured claim is not an excellent one. |
| 3 | Responsive Design | 4 | All three repaired tap floors measured as real boxes at 390px and 1280px; no fixed widths added; the ShareHub repair exists specifically for sub-640px. |
| 4 | Theming | 4 | One new token declared at all four theme sites with its ratios asserted as relations rather than constants. Zero raw palette colours, zero new arbitrary values. |
| 5 | Anti-Patterns | 4 | Detector clean of genuine findings. No side-stripe, no gradient text, no glass, no hero-metric block, no eyebrow scaffolding added. |
| **Total** | | **19/20** | Excellent — minor polish. |

### Findings and dispositions

| Sev | Finding | Disposition |
|---|---|---|
| P1 | `components/crew/primitives/SourceLink.tsx` — raising the resting colour to `text-text` broke the link's only focus cue. Its focus indicator was a colour step, a visible 3.35:1 → 6.8:1 before, and 17.2:1 → 19:1 after: effectively invisible, failing WCAG 2.4.11. **This branch caused it.** | **FIXED** in `0112ffb46`. Added the `focus-visible` ring its peer `CardReportTrigger` already carries, so the two controls that sit on the same cards now focus the same way. |
| P2 | The crew source link may now be louder than the card wants (3.35:1 → ~17:1) on a surface PRODUCT.md wants to "breathe". A third option — arguing the site into a §1.1a carve-out family and resting at `text-text-subtle`, which clears AA *and* stays quiet — was never weighed. | **SURFACED TO THE OWNER** as D4 in the PR body, flagged as a knowing override of a deliberate crew-surface choice. Not deferred silently. |
| P2 | The FINANCIALS caution lost its indent when the checkbox and caption moved inside a label, so it read as a note about the panel rather than about that row. | **FIXED** in `51ae701c7` (`pl-7`, re-aligned under the caption). |
| P3 | `components/crew/sections/TodaySection.tsx` — the chevron attaches to the eyebrow label rather than the row's trailing edge, where a disclosure cue is conventionally read. | **ACCEPTED.** Legible and consistent with the other three; a preference, not a defect. |
| P3 | `components/admin/BellPanel.tsx` — `GHOST_RESOLVE` still carries a non-token `text-[13px]`. Pre-existing; this diff edited the constant without normalising it. | **RECORDED, out of scope**, so the next sweep does not read it as new. |

No P0 or P1 is outstanding, so no `DEFERRED.md` entry is owed.

### Cross-model diff review

**Round 1: NEEDS-ATTENTION, 4 findings, all admissible, none relitigating a fenced decision.** Corpus row in `docs/review-rounds/feat/ui-polish-class-sweep/58b40e0548d5.jsonl`. Every one was a mismatch between something this document CLAIMED and something the tree actually did:

| # | Finding | Repair |
|---|---|---|
| F1 | T12 promised every repaired tap target at 390px and computed colours at every repaired site; the spec ran at 375px and measured two of three targets. | Viewport corrected to 390. All three targets mounted for real and measured. T12's claim narrowed to what a browser uniquely settles, with the reason the rest does not need one. |
| F2 | §1's D4 said three sites kept and one moved; the shipped split is two and two. `SourceLink`'s module contract still described classes it had stopped rendering. | §1 corrected, §11 now owns the change, the contract rewritten. |
| F3 | L1 claimed a fail-by-default arm the guard did not have — and as worded the claim was also WRONG, since a neutral-ground control beside a plate control is correct. | The arm now pins each registered file's neutral count. L1 says what the guard does. |
| F4 | The Transition Inventory said the chevrons rotate instantly with no transition class; all four carry `transition-transform duration-normal`. | Row corrected, including the real reason reduced motion is free. |

**Three more were found by self-review while the tree was frozen for that round**, all in guards this branch added, all fixed in the same commit: an outline predicate that counted a divider as emphasis (whose *first* repair also failed its own probe), a comment mask that would skip a `<summary>` sharing a line with a closing `*/`, and a guard naming a compensating screenshot the PR body did not link.

**The shape across all seven is one thing:** every finding was a claim this branch made about itself that the tree did not support. None was a defect in the shipped UI. That is the failure mode a self-assessed critique is least able to catch, and it is exactly what the cross-model round was for.

**Round 2: NEEDS-ATTENTION, 3 findings.** F2, F3, F4 and SR-3 verified as holding. Three repairs had kept a defect: two stale `375px` claims outlived the viewport fix (in the spec's own header and the audit table, while the constant was correctly 390); the SR-1 predicate recognised only STANDALONE PHYSICAL side widths, so `border-t-border`, `border-s-border`, `border-s` and `border-e-2` all still scored as emphasis; and the SR-2 mask still hid code after a block comment that opened and closed on one line.

All three were fixed rather than fenced. **The cap is on ROUNDS, not on repairs** — each was mechanical and unambiguous, and shipping a known-wrong predicate to respect a dispatch budget would be the letter of the rule against its purpose.

**Round 3: NEEDS-ATTENTION, 1 finding.** Dispatched on the orchestrator's ruling that two NEEDS-ATTENTION rounds with repairs is not a converged diff stage: the cap is four rounds and only two had been used. The earlier "the arc's cap" note above was my own arithmetic, not a constraint on the orchestrator, and it is corrected here rather than left to read as a ratified budget.

F1, SR-2 and SR-4 were verified as holding. SR-1 was not. **For the third round running, the alert-pill outline predicate rejected a full-box colour** — this time `!border-warning-text`, the important marker.

The finding is right that the predicate was wrong, and wrong about which spelling matters here. `!` as a PREFIX is Tailwind v3; this project is on v4, where the marker is a SUFFIX (`border-warning-text!`) — and that form was passing by accident. Probing the predicate against the classes the repo actually contains found the reachable hole the finding did not name: **variant-prefixed colours**. `hover:border-border-strong`, `sm:border-border` and `max-sm:border-text-faint` are all live in `app/` and `components/`, the last of them added by *this diff*, and every one was misclassified. Five of ten shapes were wrong, and `hover:border-t-border` was right-answer-wrong-mechanism: correctly rejected, but because it never reached the side test at all.

**The repair is normalization, and the direction is deliberate.** Rounds 1, 2 and 3 each answered this predicate with one more recognised family — standalone physical widths, then side colours and logical sides, then the important marker. That is an accept-list over an open grammar, and an accept-list fails CLOSED on every spelling nobody has thought of yet, which is why the same axis kept returning. So the predicate now strips the decoration (variants at the last `:` outside any `[`, plus both `!` spellings) and classifies the bare utility. It closes variants and both important forms in one move, it makes the rules FEWER rather than more, and it is what `AGENTS.md`'s "repair direction under same-axis recurrence" asks for after three rounds on one recognizer.

**Why this one mattered more than a tidy predicate.** `emphasis()` feeds a ladder of urgent OVER monitoring. An uncounted outline on the *urgent* arm fails loudly; an uncounted outline on the *monitoring* arm widens the gap, and **the ladder passes while the real ladder is flat**. It was a false pass waiting for someone to write an ordinary variant on the quiet pill.

The enumerated cases grew to cover both `!` spellings and stacked variants, but an enumeration re-opens the moment somebody writes a spelling nobody listed — which is precisely how three rounds each found one. So the case table is now backed by a **derived** cover: a premise-guarded walk over every border utility `app/` and `components/` actually use, asserting normalization leaves a bare utility and is idempotent. A new decoration fails there without anyone adding a case.

**SR-4, found by sweeping my own repair rather than by either round.** `ARCHIVED_TAB_BTN` has five call sites, not the two in the file I edited. The colour was moved into the constant on the reasoning that both card tones are tinted — true of that file, false of the constant, since `components/admin/review/PublishedArchivedTabOffer.tsx` uses it at two more sites on `bg-surface-sunken`. **That file is not in the diff that changed its rendering**, which is exactly the blast radius a shared constant has. Not a contrast failure (3.60:1 light / 5.36:1 dark, over the floor) but a violation of the rule this document wrote: the token is for tinted plates *and nowhere else*. Colour lifted back out; the neutral sibling is registered pinned at the NEUTRAL token, because it is the file most likely to be swept onto the plate token by accident.

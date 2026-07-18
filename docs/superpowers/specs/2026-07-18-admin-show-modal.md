# Admin Show Review Modal — replace the published show page with a dashboard modal

**Date:** 2026-07-18
**Status:** Draft (autonomous ship; user review gates waived per AGENTS.md autonomous pipeline)
**Owner surface:** UI (Opus-only per routing convention); no DB migrations; no advisory-lock topology changes.

## 1. Overview

The consolidated per-show admin review page at `/admin/show/[slug]` (`app/admin/show/[slug]/page.tsx:76`) is replaced by a modal — `PublishedReviewModal` — rendered over the admin dashboard at `/admin?show=<slug>`. The modal reuses the wizard Step-3 modal's chrome by extracting a shared `ReviewModalShell` from `components/admin/wizard/Step3ReviewModal.tsx`, and reaches full content parity with today's page (overview + share/access, parsed sections with warning controls, alerts, changes feed, and the existing publish/archive controls — the StatusStrip inline toggle and the Overview archive row; the modal has NO footer). The old URL becomes a server redirect. Motivation (user-stated): chrome consistency between the wizard review modal and the published review surface, lower navigation friction, less duplicate shell code.

Non-goals: the wizard Step-3 modal's behavior, content, and footer variants are UNCHANGED (its existing test suite must pass; the only permitted diffs in step3 files are the mechanical shell-consumption refactor). The preview subtree `app/admin/show/[slug]/preview/[crewId]/` and the staged review page `app/admin/show/staged/[stagedId]/` are untouched.

## 2. Resolved decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | URL scheme: `/admin?show=<slug>` + `&alert_id=<uuid>` passthrough. Old route 307-redirects (Next `redirect()`), preserving the full query string. | Modal state in URL: refresh/share/back all work. Chosen over intercepting routes (keeps page alive) and client-state (breaks alert deep links). |
| D2 | Shell extraction (approach B): shared `ReviewModalShell` consumed by both `Step3ReviewModal` and new `PublishedReviewModal`. | Structural consistency, not copy-paste; step3 behavior pinned by existing tests. |
| D3 | Full content parity: everything today's page renders moves into the modal. | Modal is the sole surface; nothing orphaned. |
| D4 | **AMENDED from brainstorm:** server actions in `app/admin/show/[slug]/_actions/` **stay in place** (brainstorm said move to `app/admin/_actions/show/`). | The `[slug]` dir survives regardless (preview subtree + redirect page). Moving would stale-out 13 `AUDITABLE_MUTATIONS` `file:` rows (`tests/log/_auditableMutations.ts:56–373`), two `readFileSync` paths in `tests/auth/advisoryLockRpcDeadlock.test.ts:154,179`, the read-path-pin allowlist row (`tests/admin/_showReviewReadPathPin.test.ts:78`), and drop the files out of the `serverNoClientValueCall` audit root (`tests/admin/serverNoClientValueCall.test.ts:29`) — all churn, zero functional gain. Actions are route-agnostic `"use server"` modules. |
| D5 | Surviving showpage components (`OverviewSection`, `ChangesSection`, `StatusStrip`, `sectionWarningExtras`) stay in `components/admin/showpage/`; `PublishedReviewPage.tsx` is deleted and `PublishedReviewModal.tsx` is created in the same dir. | Dir is pinned by many tests (`tests/components/admin/showpage/*`, `tests/components/admin/dataGapsTransitionAudit.test.tsx:57,133`); renaming the dir is pure churn. |
| D6 | CSS data-attribute hooks: shell takes a `dataAttrPrefix` prop (`"step3-review"` for the wizard consumer, `"review-modal"` for the published consumer). `app/globals.css` entrance/reduced-motion rules (`app/globals.css:768–790`) gain the second selector alongside the first. | Step-3 DOM and its attr-name-asserting tests stay byte-identical; no duplicate animation CSS. |
| D7 | Hash-anchor deep links keep working inside the modal via a new `syncHash` opt-in on `ShowReviewSurface` (see §6.4). The restore effect today only accepts rail ids (`ShowReviewSurface.tsx:492-500`); under `syncHash` it gains a fallback: a non-rail target resolves via `getElementById` inside the scroller and `scrollIntoView`. This covers `#share-access` (a real inner DOM id, `OverviewSection.tsx:109`) and `#overview` (rail id). `#resync` has NO DOM id today (dead fragment — `OverviewSection.tsx:126-137`): the `RESYNC_SHRINK_HELD` builder (`lib/adminAlerts/alertActions.ts:112`) is updated to `#overview` (the sheet/sync block lives inside the Overview section), retiring the dead fragment. | Browsers re-apply the URL fragment across a redirect, so legacy emailed links land on `/admin?show=<slug>#share-access` and scroll correctly; legacy `#resync` links simply don't scroll — identical to their behavior today. |
| D8 | Unknown slug or snapshot `not_admin_or_missing` → `redirect("/admin")` (param stripped, no modal, no error). Snapshot `infra_error` → throw to the existing admin error boundary (`app/admin/error.tsx`), same as today (`app/admin/show/[slug]/page.tsx:142-144`). | Silent-drop matches dashboard filter posture; invariant 5 (no raw codes) preserved. |
| D9 | **Client-side** open/close navigation (`useShowModalNav`, backed by `useSearchParams`) mutates ONLY the `show` / `alert_id` params and preserves all others. CLIENT producers use that same helper — `ShowsTable` is a client island (`components/admin/ShowsTable.tsx:19`) so its row links (`ShowsTable.tsx:476`) build param-preserving hrefs via `buildShowModalHref`, as does `StagedReviewCard`'s `router.push`. **Server-rendered** producers cannot see current params (`Dashboard` passes no search-param context to rows — `components/admin/Dashboard.tsx:696-701`) and embed their own known context explicitly: `ArchivedShowRow` emits `/admin?bucket=archived&show=<slug>`; other server/off-dashboard producers (BellPanel entries, telemetry rows, inbox, alert builders) emit bare `/admin?show=<slug>` (+`alert_id` where applicable). | Archived-bucket context survives opening/closing a show without threading searchParams through server row producers. |

## 3. URL contract

- **Canonical:** `/admin?show=<slug>` renders the dashboard with `PublishedReviewModal` open for that show. `&alert_id=<uuid>` highlights the matching alert row (today's `highlightAlertId` mechanism, `components/admin/PerShowAlertSection.tsx:311,336-339`) AND scrolls to it via a NEW one-shot modal mount effect (highlight alone never scrolled anything, on the page either): when `alertId` is present, query `li[aria-current="true"]` within the modal scroller → `scrollIntoView({ block: "center" })`; no match → fall back to the `#overview` rail target. `alert_id` scroll takes precedence over hash restore when both are present.
- **Legacy:** `app/admin/show/[slug]/page.tsx` is rewritten to a minimal server component that calls `redirect("/admin?show=" + encodeURIComponent(slug) + <passthrough>)`. `<passthrough>` re-appends incoming searchParams (e.g. `alert_id`, the inert `review` param produced by `app/admin/show/staged/[stagedId]/page.tsx:238`) with normalization: an incoming `show` param is DROPPED (the path slug wins — no duplicate/conflicting `show`), and for any repeated key only the first value is kept. Fragment survives via browser behavior. The redirect page KEEPS `await requireAdmin()` before `redirect()` — the auth-chain registry row for this path (`lib/audit/trustDomains.ts:34-36`) and the auth audit remain true unchanged. `app/admin/show/[slug]/loading.tsx` is deleted (redirects don't paint).
- **Auth round-trip:** `validateNextParam` currently strips ALL query params from `/admin` next-targets (`lib/auth/validateNextParam.ts:70-88`, pinned by `tests/auth/validate-next-param-show-section.test.ts:82-83`), and `requireAdmin` → OAuth start carries only the sanitized path (`lib/auth/requireAdmin.ts:52-64`, `app/api/auth/google/start/route.ts:37-45`) — so a signed-out admin's `/admin?show=x&alert_id=y` would come back as bare `/admin`. `validateNextParam` gains a minimal `/admin` query ALLOWLIST: `show` and `alert_id` (first value, same `firstParam` normalization) survive sanitization; every other param is still stripped (pre-existing behavior for `bucket` etc. unchanged — out of scope). Tests: sanitizer unit rows (allowed pair survives, junk params stripped, non-`/admin` paths unaffected) + an auth-round-trip assertion that the OAuth `next` retains the modal params.
- **Wizard mode:** when `app/admin/page.tsx` takes an OnboardingWizard branch (`app/admin/page.tsx:171,199,211`), `?show` is ignored (no modal mounts). Wizard-mode admin has no published shows to review; silently inert, not an error.
- **Open:** dashboard link sites navigate with `<Link href={buildShowModalHref(slug, currentParams)} scroll={false}>`. **Close** (X button, scrim tap, Esc, sheet drag-dismiss, back button): `router.push` to the same URL minus `show`/`alert_id`, `{ scroll: false }`. A `useShowModalNav()` client helper owns both param computations (single source of truth).

### 3.1 Link-site migration (every producer of the old URL)

| Site | Today | Becomes |
|------|-------|---------|
| `components/admin/ShowsTable.tsx:476` | `/admin/show/${slug}` whole-row Link | `buildShowModalHref` (client island — preserves current params) |
| `components/admin/ArchivedShowRow.tsx:75` | same | modal href (keeps `bucket=archived`) |
| `components/admin/BellPanel.tsx:454` | same | modal href |
| `components/admin/NeedsAttentionInbox.tsx:128` | `/admin/show/${slug}?alert_id=${id}` | `/admin?show=<slug>&alert_id=<id>` |
| `components/admin/NeedsAttentionInbox.tsx:156` | `/admin/show/${slug}` | modal href |
| `components/admin/StagedReviewCard.tsx:356` | `router.push('/admin/show/${slug}')` | `router.push` modal href |
| `components/admin/telemetry/EventRow.tsx:82` | `/admin/show/${showSlug}` | modal href |
| `components/admin/telemetry/HealthAlertsPanel.tsx:137` | `/admin/show/${slug}` | modal href |
| `components/admin/PreviewBanner.tsx:116` | `/admin/show/${slug}` (exit preview) | modal href |
| `lib/adminAlerts/alertActions.ts:51` | `/admin/show/${slug}#share-access` | `/admin?show=<slug>#share-access` |
| `lib/adminAlerts/alertActions.ts:112` | `/admin/show/${slug}#resync` (dead fragment today) | `/admin?show=<slug>#overview` (D7) |
| `app/show/[slug]/unpublish/blocks.tsx:66` | `/admin/show/${slug}` | modal href |
| `app/admin/show/[slug]/preview/[crewId]/page.tsx:150,186,215` | `/admin/show/${slug}` (back links) | UNCHANGED — preview subtree is untouched (§1 non-goal); these links ride the legacy redirect (one 307) |
| `lib/notify/templates/digest.ts:16`, `lib/notify/templates/realtimeProblem.ts:93`, `lib/reports/submit.ts:312` | absolute `${origin}/admin/show/${slug}` | absolute `${origin}/admin?show=<slug>`; already-sent emails ride the redirect |
| `app/help/_affordanceMatrix.ts:112,239` | sourceRoute `/admin/show/rpas-central-2026` | `/admin?show=rpas-central-2026` |

`components/admin/wizard/step3ReviewSections.tsx:1310` (preview link) and staged-page routes are NOT migrated (preview subtree untouched).

## 4. Data flow

New async server component `app/admin/_showReviewModal.tsx` exporting `ShowReviewModal({ slug, alertId })`. It transplants today's page body verbatim (`app/admin/show/[slug]/page.tsx:87-380`):

1. Supabase server client (try/throw, `:87-98`).
2. Slug→id `.from("shows").select("id")` lookup (`:108-113`); missing → `redirect("/admin")` (replaces `notFound()`, D8).
3. `readShowReviewSnapshot(supabase, showId)` (`lib/admin/readShowReviewSnapshot.ts:40-43`); `not_admin_or_missing` → `redirect("/admin")`; `infra_error` → throw.
4. `buildPublishedSectionData`, gating `isShowEligibleForCrewLink = published && !archived` (`:159`), `readfinalizeowned_b2` RPC when `!archived` (`:171-195`).
5. Parallel wave (`:237-244`): feed (SyncInfraError → null), share token, `nowDate()`, ignored warnings, `fetchPerShowAlerts`.
6. Warning model, roster cap (`CREW_ROSTER_READ_CAP`, `:288-303`), isLive, openSheetHref — all unchanged.
7. Renders `<ShareTokenProvider key={showId} …>` wrapping `<PublishedReviewModal …>` with the same prop payload `PublishedReviewPage` receives today (`:352-380`), plus `alertId`.

`app/admin/page.tsx` changes: searchParams type gains `show?: string | string[]; alert_id?: string | string[]`, normalized through a shared `firstParam()` helper (first element wins, empty string → absent — §6.2 guard table); in the non-wizard branch, after `DashboardWithHeader`, when `show` is present render `<Suspense fallback={<ShowReviewModalSkeleton/>}><ShowReviewModal slug={sp.show} alertId={sp.alert_id ?? null}/></Suspense>`. Dashboard paints immediately; modal streams. Skeleton = shell chrome + loading blocks (replaces the deleted `loading.tsx` treatment) inside an open, non-interactive modal frame so the open gesture has immediate feedback.

Mutations: every server action reachable from the modal must revalidate `/admin`, or the modal UI goes stale after the action (a server action only re-renders the current route if it revalidates it). Already covered: `archive.ts:38`, `unarchive.ts:42`, `setPublished.ts:37`, `feed.ts:183,219` (`acceptChangeAction`/`acceptAllAction`). **Must be ADDED** — `revalidatePath("/admin", "page")` in `mi11ApproveAction` (`feed.ts:75-76`), `mi11RejectAction` (`feed.ts:109`), and `undoChangeAction` (`feed.ts:141-142`), each with a test asserting the call. `useRaw.ts`/`roleToken.ts` mutate via API-refresh flows whose UI updates client-side (`revalidateShow(id)` is the crew-page cache-tag bust — `lib/data/showCacheTag.ts:34-36` — not an admin-path revalidate); the plan's task for these controls verifies their in-modal refresh behavior explicitly. `revalidatePath("/admin/show/[slug]")` calls stay harmless (route still exists as redirect) but are dropped where touched.

Advisory locks, email canonicalization, snapshot RPC single-caller: untouched (invariants 2, 3; pin §7 row 1).

## 5. `ReviewModalShell` (`components/admin/review/ReviewModalShell.tsx`, client)

Extracted verbatim from `Step3ReviewModal.tsx` shell mechanics:

- Portal to `document.body` after `useHasMounted()` (`Step3ReviewModal.tsx:175,1019`; `lib/a11y/useHasMounted.ts:21-27`).
- Scrim button (tabIndex −1, onClick=onClose) with `data-<prefix>-scrim` (`:616-624`); panel with `data-<prefix>-panel`, `max-h-[85vh] sm:max-h-[80vh] sm:max-w-5xl rounded-t-md sm:rounded-md` (`:629-633`).
- `useDialogFocus(panelRef, closeRef)` (`lib/a11y/dialogFocus.ts:41-44`), body scroll lock (`:308-314`), `[data-inert-root]` inert effect (`:322-340`), document Esc (`:345-354`).
- Sheet drag-to-dismiss below `sm`: `DRAG_DISMISS_THRESHOLD_PX=110`, `DRAG_SLOP_PX=6`, fallback duration constants (`:96-107`), pointer capture + translateY + transitionend/fallback timers (`:363-497`), grab strip `sm:hidden` (`:639-654`).
- `matchMedia("(min-width:640px)")` mode-boundary cleanup (`:506-541`).
- Root layout `items-end sm:items-center sm:p-6` (`:609`); footer safe-area padding contract (`:866`).

API: `{ open: boolean; onClose(): void; labelledBy: string; dataAttrPrefix: "step3-review" | "review-modal"; header: ReactNode; children: ReactNode; footer?: ReactNode }`. NO `scrollerRef` — the scroll container is NOT shell-owned: `ShowReviewSurface` owns the live scroller (`ShowReviewSurface.tsx:136-150,784-790`) and each consumer owns the ref and passes it to the surface, exactly as Step3 does today (`Step3ReviewModal.tsx:297-300,761-765`). The shell's `children` region is a `flex-1 min-h-0` wrapper the consumer's scroller fills. Shell owns chrome ONLY — no title semantics (heading-safe h2 pattern stays in each consumer's header slot), no footer logic, no section knowledge. `Step3ReviewModal` refactors to consume it with `dataAttrPrefix="step3-review"`; its rendered DOM (attrs, classes, focus order, drag behavior) is unchanged and its full test suite (`tests/components/admin/wizard/Step3ReviewModal.test.tsx`, `Step3ReviewModalResolution.test.tsx`, `step3ReviewModal.transitions.test.tsx`, e2e `step3-review-modal.layout.spec.ts` / `.interactions.spec.ts`) passes WITHOUT edits. `RescanSheetButton` render sites stay inside `Step3ReviewModal.tsx` body content, keeping the freeze contract (`tests/components/admin/wizard/_metaStep3FreezeContract.test.ts:24-26`) green with zero changes.

`app/globals.css:768-790`: each rule's selector list gains the `review-modal` twin (e.g. `[data-step3-review-scrim], [data-review-modal-scrim]`), including the ≥640px and reduced-motion blocks. No rule bodies change.

## 6. `PublishedReviewModal` (`components/admin/showpage/PublishedReviewModal.tsx`, client)

### 6.1 Composition

- **Header slot:** heading-safe `<h2>` with ONLY the show title text (aria-labelledby target), adjacent separate 44px sheet deep-link icon anchor (pattern from `Step3ReviewModal.tsx:670-691`), close button. Below the title row: `<StatusStrip>` with a new `renderTitle?: boolean` prop (default `true`) — the modal passes `false`, suppressing StatusStrip's internal `<h1>` title (`StatusStrip.tsx:141-145`) so the modal contains exactly one title node (the `<h2>`) and no `<h1>`; all other StatusStrip content (PublishedToggle, live badge, copy-link) unchanged (`StatusStrip.tsx:54-81` props). A11y test: dialog accessible name === show title via `aria-labelledby`; no `h1` inside `[data-review-modal-panel]`.
- **Body slot:** `<ShowReviewSurface data={PublishedSectionData} layout="modal" syncHash extraSectionsBefore={[overview]} extraSectionsAfter={[changes]} renderSectionExtras={buildSectionWarningExtras(...)} bottomSlot={<RawUnrecognizedCallout/>} scrollerRef={shellScroller}>` — the exact composition `PublishedReviewPage` builds today (`PublishedReviewPage.tsx:191-199`), with `OverviewSection` (alertSlot → share-access `#share-access` → sheet/sync → archive row; `OverviewSection.tsx:102-163`) and `ChangesSection` (`ChangesSection.tsx:60-81`) as the extra sections.
- **Footer slot:** NONE for the published modal (shell `footer` prop omitted). Today's page has no footer either — the publish control is `<PublishedToggle variant="inline">` INSIDE StatusStrip (`StatusStrip.tsx:159-161`), and archive/unarchive is the Overview archive row (`OverviewSection.tsx:157-163`). Both transplant untouched; destructive-confirm treatments and registry rows unchanged. Mobile sheet keeps the shell's safe-area padding on the body's last element instead of a footer bar.
- **Warning controls:** `sectionWarningExtras` mounts keep `site="showpage"` (`components/admin/showpage/sectionWarningExtras.tsx:62,69`) — the `WarningControlSite` union (`components/admin/warningControlSite.ts:8`) is NOT renamed; testids stay `*-showpage`.

### 6.2 Guard conditions (per prop/input)

| Input | null/empty/edge | Renders |
|-------|-----------------|---------|
| `feed` | `null` (SyncInfraError) | ChangesSection infra notice (`ChangesSection.tsx:60-69`), modal otherwise healthy |
| share token | `null` / not eligible | shareSlot omitted, inactive notice (`OverviewSection.tsx:109-121`); StatusStrip copy-link hidden (`StatusStrip.tsx:121-123`) |
| alerts | infra error | notice per `PerShowAlertSection.tsx:250-263`; empty → section absent (`:265`) |
| `alertId` | absent / no matching row | no highlight; modal opens at top |
| roster | over `CREW_ROSTER_READ_CAP` | previewRoster + crewEmails blanked (`page.tsx:298-303`), unchanged |
| `archived === true` | — | read-only: no share slot, no publish footer action (unpublished-archived state), archive row shows unarchive |
| snapshot sections empty | — | `renderedSectionIds` drives rail exactly as today (`page.tsx:264`) |

Shell API + route-param guards:

| Input | Edge | Behavior |
|-------|------|----------|
| `open` | `false` | shell renders nothing (no portal, no scrim); effects (scroll lock, inert, Esc) torn down |
| `footer` | omitted/undefined | no footer element rendered — no empty bar, body extends to panel bottom (§6.6 equations) |
| `title` (modal header) | empty string | h2 renders `title \|\| slug` (published adapter can yield empty title — `publishedAdapter.ts:63`) |
| `openSheetHref` | `null` (`driveFileId` nullable, `publishedAdapter.ts:96`) | sheet deep-link icon omitted entirely (no dead anchor); a11y test covers both branches |
| `labelledBy` | — | required string; consumer MUST render an element with that id inside `header` (h2 pattern); a11y test asserts the wiring |
| `dataAttrPrefix` | — | closed union `"step3-review" \| "review-modal"` — compile-time exhaustive, no runtime guard needed |
| `header`/`children` | empty node | shell renders chrome regardless; content emptiness is the consumer's concern |
| `?show` | `""` or array (`?show=a&show=b`) | empty string → treated as absent (no modal); array → first element wins (one shared `firstParam()` normalizer in the dashboard page) |
| `?alert_id` | `""` / array / non-matching id | empty → null; array → first element; non-matching → no highlight (existing `PerShowAlertSection` behavior) |

### 6.3 Mode boundaries

Exactly one mode: published review (`PublishedSectionData`, discriminant `mode:"published"`, `components/admin/review/sectionData.ts:70-84`). No staged logic; `Step3ReviewResolution`, dirty-rescan, finalize-demoted footers belong to Step3 only. Responsive boundaries inherited from shell: bottom sheet `<sm` (grab strip, drag-dismiss, safe-area footer), centered panel `≥sm`, two-pane rail `≥lg` (ShowReviewSurface internal).

### 6.4 `syncHash` on ShowReviewSurface

New optional prop `syncHash?: boolean`, default `layout === "page"`. Gates the existing hash `replaceState` (`ShowReviewSurface.tsx:298`) and hash-restore-on-mount (`:492-506`) effects. `PublishedReviewModal` passes `syncHash` explicitly true; Step3 passes nothing (modal default false — behavior unchanged).

Restore-target resolution under `syncHash` (D7): (1) if the fragment is a rail id (`railItemIds.includes(target)`, today's behavior) → existing rail scroll; (2) else if `scroller.querySelector('#' + CSS.escape(target))` resolves → `scrollIntoView` on that element (covers `#share-access`); (3) else no-op. This fallback replaces the native browser fragment scroll that a portal-rendered modal cannot get for free. Producers after this change emit only `#share-access` and `#overview` (D7 retires `#resync`).

### 6.5 Transition inventory

| Transition | Treatment |
|------------|-----------|
| closed → open | shell entrance animation (scrim fade + panel rise / scale via `app/globals.css:768-784`) |
| open → closed (X/scrim/Esc/back) | instant unmount — pattern identical to Step3 today (no exit animation); back-button unmount is a route change |
| open → closed (sheet drag past threshold) | translateY transition + transitionend/fallback timer (shell, `Step3ReviewModal.tsx:388-497`) |
| reduced motion | `animation: none` (`app/globals.css:785-790`) |
| skeleton → loaded modal | in-place swap when Suspense resolves; instant — no animation needed |
| open while publish action pending | PublishedToggle's own pending treatment (unchanged component); no chrome transition |
| section scroll-spy rail states | inherited from ShowReviewSurface, unchanged |
| alert highlight | static ring (`PerShowAlertSection.tsx:336-339`), no animation |

Compound: drag-dismiss started, then viewport crosses `sm` → matchMedia cleanup releases drag (shell `:506-541`). Route change (close) while a server action is in flight → action completes server-side; dashboard revalidation covers state.

### 6.6 Dimensional invariants

- Panel: `max-h-[85vh]` (mobile sheet) / `sm:max-h-[80vh]`, `sm:max-w-5xl` — shell-owned (`Step3ReviewModal.tsx:629-633`).
- Panel internal column per mode (no footer in the published modal; real-browser assertions within 0.5px; Tailwind v4 does not default flex stretch):
  - **Sheet (`<sm`):** `grab.height + header.height + body.height === panel.clientHeight` — the grab strip is visible (`sm:hidden`, shell) and participates, matching the existing step3 equation (`tests/e2e/step3-review-modal.layout.spec.ts:219-235`).
  - **Popup (`≥sm`) and two-pane (`≥lg`):** `header.height + body.height === panel.clientHeight` (grab hidden, no footer).
  - "Body" in these equations = the shell's `children` wrapper (`flex-1 min-h-0`); the actual scroll container is `ShowReviewSurface`'s scroller filling that wrapper at 100% height (assert `scroller.height === wrapper.height` within 0.5px), matching today's step3 topology.
- ShowReviewSurface rail/panel dimensions inside `layout="modal"`: identical to Step3's usage; existing step3 layout spec covers the shell; a published-modal layout spec re-asserts against the taller content.

## 7. Meta-test / registry blast radius (every cell gets an action)

| Pinned surface | File | Action |
|----------------|------|--------|
| Read-path pin walk roots + non-vacuous list | `tests/admin/_showReviewReadPathPin.test.ts:36-42,129-137` | add `app/admin/_showReviewModal.tsx` to walked files + non-vacuous list; `page.tsx` remains (redirect, no `.from`) |
| Supabase infra-contract registry row | `tests/admin/_metaInfraContract.test.ts:405-407` (`surface: app/admin/show/[slug]/page.tsx` — client construction, slug lookup, finalize-owned RPC contract) | retarget `surface` to `app/admin/_showReviewModal.tsx`; contract text unchanged (reads transplant verbatim) |
| Admin-outcome forensic-code registry | `tests/log/_metaAdminOutcomeContract.test.ts:216-249` (`ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED`, `ADMIN_SHOW_LOOKUP_FAILED`, `ADMIN_SHOW_LOOKUP_THREW`, `ADMIN_SHOW_CHANGE_FEED_READ_FAILED`, `ADMIN_SHOW_CREW_ROSTER_OVERFLOW`, … pinned to `page.tsx`) | retarget every row's `file:` to `app/admin/_showReviewModal.tsx`; codes and emit sites unchanged |
| Page behavioral suite | `tests/app/admin/perShowPage.test.tsx` (returned-error + thrown coverage cited by the infra-contract row) | retarget to the loader component; assertions unchanged (same reads, same codes) |
| Snapshot RPC single-caller | same `:159-180` | unchanged (loader calls helper) |
| AUDITABLE_MUTATIONS rows | `tests/log/_auditableMutations.ts:56-373` | unchanged (D4: actions don't move) |
| Advisory-lock deadlock pin | `tests/auth/advisoryLockRpcDeadlock.test.ts:154,179` | unchanged (D4) |
| serverNoClientValueCall control | `tests/admin/serverNoClientValueCall.test.ts:29,114-151` | EXTEND the audit file list to include `app/admin/_showReviewModal.tsx` (hardcoded root `app/admin/show` alone would silently drop the moved server surface from coverage); retarget the control assertions from `page.tsx` to the loader |
| transitionAudit registry | `tests/components/admin/transitionAudit.test.tsx:34-41` | update `page.tsx` row (becomes redirect); add `PublishedReviewModal.tsx` + `ReviewModalShell.tsx` rows |
| pageTransitions count map | `tests/components/admin/showpage/pageTransitions.test.tsx:119-123` | replace `PublishedReviewPage.tsx` row with `PublishedReviewModal.tsx` |
| Bounded-reads pin | `tests/admin/_metaBoundedReads.test.ts:31-56` | move `page.tsx` row to `_showReviewModal.tsx` |
| Step3 freeze contract | `tests/components/admin/wizard/_metaStep3FreezeContract.test.ts:24-26` | unchanged (Rescan sites stay in step3 body) |
| WarningControlSite scoping tests | `tests/components/admin/showpage/sectionWarningControls.test.tsx:272-278`, `tests/components/RoleRecognizeControl.test.tsx:410-426` | unchanged (`showpage` token kept) |
| Sentinel-hiding contract | `tests/components/tiles/_metaSentinelHidingContract.test.ts:84-102` | N/A — scans tiles/crew only |
| Destructive-confirm registry | `tests/styles/_metaDestructiveConfirm.test.ts:29-79` | rows unchanged (components reused); verify registry still resolves paths |
| e2e page harnesses | `tests/e2e/_showPageLayoutHarness.tsx:35-36,197`, `showPageLayout.spec.ts`, `_statusStripToggleHarness.tsx:39` | rebuild as modal harnesses (render `PublishedReviewModal` inside shell) |
| e2e URL constructions | `admin-lifecycle-layout.spec.ts:211`, `admin-lifecycle-transitions.spec.ts:122-248`, `picker-flow.spec.ts:302,333`, `admin-changes-feed-layout.spec.ts:119`, `admin-parse-panel.spec.ts:115-241`, `admin-route-boundaries.spec.ts:146,158` | rewrite to `/admin?show=<slug>` + in-modal selectors; `crew-page.spec.ts:1333-1376` preview URLs unchanged |
| Help affordance matrix | `app/help/_affordanceMatrix.ts:112,239` | sourceRoute → `/admin?show=…`; staged (`:121-122`) + preview (`:229`) rows unchanged |
| Help screenshot manifest | `scripts/help-screenshots.manifest.ts:51-113` | `/admin` + preview routes only — no bare show-page capture exists today, so NO new capture is added (no help doc depicts this surface); existing `/admin` captures unaffected unless the dashboard's default render changes (it doesn't — modal only mounts with `?show=`) |
| Mutation-surface observability | `tests/log/mutationSurface/enumerate.ts:322-331,119` | discovery is path+gate based; nothing moves; new client components carry no server mutations. New loader `_showReviewModal.tsx` is read-only — no telemetry row needed (reads only) |
| No-inline-email guard | `tests/admin/no-inline-email-normalization.test.ts:63-67` | unchanged (no email surfaces touched) |
| Auth next-param sanitizer pins | `lib/auth/validateNextParam.ts:70-88`, `tests/auth/validate-next-param-show-section.test.ts:82-83` | extend sanitizer with `/admin` `show`/`alert_id` allowlist + update/extend the pinning tests (§3 auth round-trip) |

Help copy: `/help` pages that describe the show page get a copy pass ("show page" → "show details" modal), explicitly including `app/help/admin/per-show-panel/page.mdx:27-29`, whose layout description (footer/action placement) must be rewritten to match the modal (no footer; publish toggle in the status strip, archive in Overview). Longform error docs unaffected (no §12.4 changes — no new codes; invariant 5 satisfied by transplanting existing rendering).

## 8. Testing

TDD per task. Highlights (full breakdown in plan):

1. **Shell extraction proof:** entire existing step3 unit + transition + e2e suites pass with zero edits after the refactor. This is the acceptance test for "step3 stays how it is."
2. **Modal unit/RTL:** composition (sections order Overview→…→Changes), guard-condition matrix (§6.2 rows), StatusStrip publish-toggle gating (`published`/`archived` states unchanged), `syncHash` default-off for step3 usage (anti-regression: assert Step3 renders no hash effect).
3. **Real-browser (Playwright, pinned image):** layout spec — sheet `<sm` vs panel `≥sm`, `getBoundingClientRect` per-mode equations from §6.6 (sheet includes grab strip; popup/two-pane exclude it; no footer) at 375px and 1280px; interactions spec — focus trap (initial focus close, Tab cycle, restore), Esc, scrim, drag-dismiss threshold + slop, close preserves `bucket` param, back-button closes; deep-link spec — `/admin?show=<slug>` cold load, `alert_id` highlight ring + scroll, `#share-access` fragment scroll, legacy `/admin/show/<slug>?alert_id=x#share-access` redirect lands with param+fragment intact, unknown slug redirects to bare `/admin`.
4. **Anti-tautology:** deep-link assertions read from the live DOM inside `[data-review-modal-panel]` (scoped, not page-wide); expected show titles/params derived from seeded fixtures, not hardcoded; unknown-slug case asserts BOTH absence of modal AND stripped URL.
5. **Meta-test updates:** exactly the §7 matrix — each is its own plan task paired with the change that breaks it.
6. **Impeccable dual-gate** (critique + audit) on the affected diff before cross-model review (invariant 8); UI work is Opus-only.

Meta-test inventory (writing-plans rule): EXTENDS `_showReviewReadPathPin`, `transitionAudit`, `pageTransitions`, `_metaBoundedReads`, `serverNoClientValueCall`; CREATES none (no new invariant class); advisory-lock topology untouched.

## 9. Out of scope

- Wizard Step-3 content/behavior changes beyond mechanical shell consumption.
- Preview-As pages, staged review page, crew-facing pages.
- Any DB schema, RPC, or migration change.
- `ShareChip` / `CrewPageLink` (orphaned components, mounted nowhere — `app/admin/show/[slug]/ShareChip.tsx:17`, `CrewPageLink.tsx:15`); left as-is, cleanup is backlog material.
- New telemetry codes (no §12.4 rows).

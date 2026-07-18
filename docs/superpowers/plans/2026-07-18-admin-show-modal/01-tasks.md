# Tasks

Spec references (`§n`) point at `docs/superpowers/specs/2026-07-18-admin-show-modal.md`. All paths relative to the worktree root. Run commands from the worktree root. After EVERY task: tree is green (`pnpm test` scoped to touched suites at minimum), commit with the given message.

---

### Task 1: `ReviewModalShell` extraction + Step3 refactor (spec §5)

**Files:**
- Create: `components/admin/review/ReviewModalShell.tsx`
- Create: `tests/components/admin/review/reviewModalShell.test.tsx`
- Modify: `components/admin/wizard/Step3ReviewModal.tsx` (consume shell; body content unchanged)

**Interfaces — Produces:**
```ts
export type ReviewModalShellProps = {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  dataAttrPrefix: "step3-review" | "review-modal";
  testIdBase: string;
  initialFocusRef: RefObject<HTMLElement | null>;
  header: ReactNode;
  children: ReactNode; // mounts DIRECTLY in the panel flex column — NO wrapper (§5)
  footer?: ReactNode;  // omitted → no footer element at all
};
export function ReviewModalShell(props: ReviewModalShellProps): ReactNode;
```

- [ ] **Step 1: failing shell unit test.** `tests/components/admin/review/reviewModalShell.test.tsx`, RTL:
  - renders nothing when `open === false` (§6.2 guard);
  - when open: portal to `document.body`; scrim carries `data-${dataAttrPrefix}-scrim` + `${testIdBase}-backdrop`; panel carries `data-${dataAttrPrefix}-panel` + `${testIdBase}-modal` + `role="dialog"` `aria-modal="true"` `aria-labelledby={labelledBy}`; grab strip `${testIdBase}-grab`; header wrapper `${testIdBase}-header`; `footer` omitted → `queryByTestId("${testIdBase}-footer")` is null; `footer` provided → wrapper present;
  - Esc calls `onClose`; scrim click calls `onClose`;
  - initial focus lands on the element `initialFocusRef` points at (consumer-rendered button inside `header`).
  Use both `dataAttrPrefix` values in separate cases (attr names must interpolate, not hardcode).
- [ ] **Step 2: run — expect FAIL** (`ReviewModalShell` not found): `pnpm vitest run tests/components/admin/review/reviewModalShell.test.tsx`
- [ ] **Step 3: implement shell by EXTRACTION.** Move from `Step3ReviewModal.tsx` into the shell, changing ONLY: `data-step3-review-*` attrs → `` `data-${dataAttrPrefix}-*` ``; `` `wizard-step3-card-${dfid}-review-…` `` testids on shell-owned nodes (root :605, backdrop :618, grab :641, header wrapper :660, footer wrapper :865) → `` `${testIdBase}-…` ``; `useDialogFocus(panelRef, closeRef)` → `useDialogFocus(panelRef, initialFocusRef)`. Extract verbatim (per spec §5 line anchors): portal + `useHasMounted` (:175,1019), scrim (:616-624), panel + classes (:629-633), scroll lock (:308-314), inert (:322-340), Esc (:345-354), drag machinery + constants (:96-107,:363-497), grab strip (:639-654), matchMedia cleanup (:506-541), root layout (:609), footer safe-area wrapper (:866). Footer wrapper renders ONLY when `footer != null`.
- [ ] **Step 4: refactor `Step3ReviewModal` to consume the shell** with `dataAttrPrefix="step3-review"`, `` testIdBase={`wizard-step3-card-${dfid}-review`} ``, `initialFocusRef={closeRef}`, header/footer slots holding its existing header (:659-752) and footer variants (:865-1010), `ShowReviewSurface` subtree as direct `children`. Delete the moved code from Step3. Constants (`DRAG_DISMISS_THRESHOLD_PX` etc.) move to the shell and are RE-EXPORTED from `Step3ReviewModal.tsx` unchanged (existing importers/tests keep working).
- [ ] **Step 5: run the extraction acceptance gate — Step3 suites UNMODIFIED:**
  `pnpm vitest run tests/components/admin/wizard/ tests/components/step3SheetCard.transitions.test.tsx tests/components/admin/review/reviewModalShell.test.tsx` → ALL PASS with zero edits to any `tests/components/admin/wizard/*` file. Also `pnpm vitest run tests/components/admin/showpage/pageTransitions.test.tsx` (counts unchanged this task — shell file gets its OWN transitionAudit row in Task 8).
- [ ] **Step 6: commit** `refactor(admin): extract ReviewModalShell from Step3ReviewModal (behavior-frozen)`

### Task 2: globals.css selector twins (spec §5, D6)

**Files:** Modify `app/globals.css:768-790`; Test: extend `tests/components/admin/review/reviewModalShell.test.tsx`.

- [ ] **Step 1: failing test** — source-scan case in `reviewModalShell.test.tsx`: read `app/globals.css`, assert every rule that matches `[data-step3-review-scrim]` / `[data-step3-review-panel]` (base :768-773, ≥640px :777-784, reduced-motion :785-790) ALSO lists `[data-review-modal-scrim]` / `[data-review-modal-panel]` in its selector. Expect FAIL.
- [ ] **Step 2: add the twin selectors** (selector lists only — rule bodies unchanged). Run → PASS.
- [ ] **Step 3: commit** `feat(admin): review-modal CSS attr twins for shared entrance animation`

### Task 3: `ShowReviewSurface.syncHash` (spec §6.4, D7)

**Files:** Modify `components/admin/review/ShowReviewSurface.tsx` (props :136-157, hash effects :298,:492-506); Test: `tests/components/admin/review/showReviewSurfaceSyncHash.test.tsx` (new).

- [ ] **Step 1: failing tests:**
  - `syncHash` default: true iff `layout === "page"` (assert via replaceState spy firing on section change in page layout, not firing in modal layout without the prop — anti-regression for Step3);
  - `layout="modal" syncHash` + `location.hash="#share-access"` + a scroller child with `id="share-access"` → that element's `scrollIntoView` called (jsdom: spy on `Element.prototype.scrollIntoView`);
  - rail-id fragment still routes through the existing rail scroll path;
  - unknown fragment → no scroll, no throw. Derive ids from fixture data, not literals duplicated in the component (anti-tautology: assert against the element the FIXTURE defines).
- [ ] **Step 2: run — FAIL** (`syncHash` unknown prop / no fallback behavior).
- [ ] **Step 3: implement:** add `syncHash?: boolean` to props; `const hashSync = syncHash ?? layout === "page"`; gate `:298` and `:492-506` on `hashSync`; in the restore effect, after the `railItemIds.includes(target)` branch add:
```ts
const el = scroller?.querySelector(`#${CSS.escape(target)}`);
if (el) el.scrollIntoView();
```
- [ ] **Step 4: run new tests + step3 wizard suite + `tests/e2e` typecheck — PASS.**
- [ ] **Step 5: commit** `feat(admin): ShowReviewSurface syncHash with in-scroller fragment fallback`

### Task 4: `StatusStrip.renderTitle` (spec §6.1)

**Files:** Modify `components/admin/showpage/StatusStrip.tsx:139-158`; Tests: extend `tests/components/admin/showpage/statusStrip.test.tsx`, update `tests/components/admin/showpage/pageTransitions.test.tsx` StatusStrip conditional count (7 → 8).

- [ ] **Step 1: failing test:** `renderTitle={false}` → no `<h1>`, no title text node, no leading divider element; PublishedToggle/live badge/copy-link untouched. Default (`renderTitle` omitted) → h1 + divider exactly as today.
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement:** `renderTitle?: boolean` (default `true`); wrap the h1 + its adjacent divider (:139-157) in the conditional. Update pageTransitions count row.
- [ ] **Step 4: run statusStrip + pageTransitions suites — PASS.**
- [ ] **Step 5: commit** `feat(admin): StatusStrip renderTitle=false for modal header (suppresses h1 + divider)`

### Task 5: `useShowModalNav` (spec §3, D9)

**Files:** Create `lib/admin/showModalParams.ts` (SERVER-SAFE pure module — no hooks, no "use client"); Create `components/admin/useShowModalNav.ts` (client hook module importing the pure helpers); Tests: `tests/lib/admin/showModalParams.test.ts`, `tests/components/admin/useShowModalNav.test.tsx`.

**Interfaces — Produces:**
```ts
// lib/admin/showModalParams.ts — importable from RSC (app/admin/page.tsx) AND client
export function buildShowModalHref(slug: string, currentParams: URLSearchParams): string;
// preserves all params except `show`/`alert_id` (replaced/removed), sets show=slug
export function firstParam(v: string | string[] | undefined): string | null;
// array → first element; ""/undefined → null   (§6.2 guard table)

// components/admin/useShowModalNav.ts — "use client"
export function useShowModalNav(): {
  openHref: (slug: string) => string;      // buildShowModalHref over useSearchParams()
  close: () => void;                        // router.push minus show/alert_id, { scroll:false }
};
```
The split exists because `app/admin/page.tsx` is an RSC — importing a hook-bearing client module for `firstParam` is exactly the class `tests/admin/serverNoClientValueCall.test.ts:4-22` guards against.

- [ ] **Step 1: failing tests:** `buildShowModalHref("x", new URLSearchParams("bucket=archived"))` → `/admin?bucket=archived&show=x`; replaces existing `show`, strips `alert_id`; encodes slug. `firstParam`: `["a","b"]→"a"`, `""→null`, `undefined→null`, `"v"→"v"`. `close()` pushes current params minus `show`/`alert_id` with `{scroll:false}` (mock `useRouter`/`useSearchParams` from `next/navigation`).
- [ ] **Step 2: FAIL → Step 3: implement (pure param logic + thin hooks) → Step 4: PASS.**
- [ ] **Step 5: commit** `feat(admin): useShowModalNav param-preserving modal navigation helper`

### Task 6: `PublishedReviewModal` (spec §6)

**Files:**
- Create: `components/admin/showpage/PublishedReviewModal.tsx` (client)
- Create: `tests/components/admin/showpage/publishedReviewModal.test.tsx`
- Delete: `components/admin/showpage/PublishedReviewPage.tsx` — in **Task 7** (loader is its last importer until then; this task only ADDS).

**Interfaces — Consumes:** `ReviewModalShellProps` (Task 1), `syncHash` (Task 3), `renderTitle` (Task 4), `useShowModalNav.close` (Task 5). **Produces:** `PublishedReviewModalProps` = `PublishedReviewPageProps` (`components/admin/showpage/PublishedReviewPage.tsx:41-79`, reused verbatim) + `{ alertId: string | null }`.

- [ ] **Step 1: failing RTL tests** (fixture-derived `PublishedSectionData`, not literals):
  - header: dialog accessible name === show title via `aria-labelledby`; `title=""` → falls back to slug (§6.2); `openSheetHref=null` → no sheet anchor; NO `h1` inside `[data-review-modal-panel]`; close button carries the modal's initial focus;
  - body: StatusStrip present with publish toggle; ShowReviewSurface receives `layout="modal"`, `syncHash` true, Overview extra first / Changes extra last (transplant assertions from the deleted-in-Task-7 page suite where they exist);
  - guards (§6.2): `feed=null` → infra notice; not-eligible → inactive share notice; alerts empty → no Alerts area; over-cap roster props blanked upstream (loader-level, tested Task 7);
  - alert scroll effect: `alertId` set + a rendered `li[aria-current="true"]` → `scrollIntoView` spy called once (one-shot — rerender does not re-fire); `alertId` with no match → falls back to `#overview` rail target; `alertId=null` → no scroll;
  - no footer: `queryByTestId("published-show-review-footer")` null.
- [ ] **Step 2: FAIL → Step 3: implement.** Compose `ReviewModalShell` (`dataAttrPrefix="review-modal"`, `testIdBase="published-show-review"`, `initialFocusRef=closeRef`) + header (h2 `title || slug`, conditional sheet icon, close button) + `StatusStrip renderTitle={false}` + `ShowReviewSurface` with the exact extras composition from `PublishedReviewPage.tsx:113-199` (scrollerRef, overviewExtra :121-154, changesExtra :157-173, `buildSectionWarningExtras` :117, bottomSlot). `onClose` = `useShowModalNav().close`. Alert one-shot effect per spec §3 (query within surface scroller, `{block:"center"}`).
- [ ] **Step 4: run — PASS** (`pnpm vitest run tests/components/admin/showpage/`).
- [ ] **Step 5: commit** `feat(admin): PublishedReviewModal — published review surface in ReviewModalShell chrome`

### Task 7: server loader + dashboard mount + skeleton (spec §4)

**Files:**
- Create: `app/admin/_showReviewModal.tsx` (async server component `ShowReviewModal({ slug, alertId })` + `ShowReviewModalSkeleton`)
- Modify: `app/admin/page.tsx` (searchParams + Suspense mount, non-wizard branch only)
- Delete: `components/admin/showpage/PublishedReviewPage.tsx`
- Tests: create `tests/app/admin/showReviewModalLoader.test.tsx` (retarget of `tests/app/admin/perShowPage.test.tsx`), modify `tests/app/admin/` dashboard page suite, delete `tests/app/admin/perShowPage.test.tsx`

- [ ] **Step 1: failing loader tests** — copy `perShowPage.test.tsx` scenarios, retargeted (§7): client-construction throw → throws `supabase_client_construction_failed` + `ADMIN_SHOW_CLIENT_CONSTRUCTION_FAILED` emit; lookup returned-error → `ADMIN_SHOW_LOOKUP_FAILED` + **THROW** (infra fault — error boundary, unchanged from today, `page.tsx:114-122`); lookup throw → `ADMIN_SHOW_LOOKUP_THREW` + THROW; **`redirect("/admin")` ONLY for**: absent row (`maybeSingle` returns null) and snapshot `not_admin_or_missing` (D8 — these were the two `notFound()` sites); snapshot `infra_error` → throw; feed `SyncInfraError` → renders with `feed=null`; roster over `CREW_ROSTER_READ_CAP` → blanked previewRoster/crewEmails + `ADMIN_SHOW_CREW_ROSTER_OVERFLOW`; eligible gating of shareSlot/token. Mock `next/navigation` `redirect` to throw a sentinel (Next semantics).
- [ ] **Step 2: FAIL → Step 3: implement loader** — transplant `app/admin/show/[slug]/page.tsx:87-380` VERBATIM into `ShowReviewModal({ slug, alertId })` with exactly these deltas: `notFound()` → `redirect("/admin")` (both sites); drop `params`/`searchParams` plumbing (direct args); render `<PublishedReviewModal … alertId={alertId}>` instead of `<PublishedReviewPage>`; keep `ShareTokenProvider key={showId}` wrapper and every read/log/gate untouched. `ShowReviewModalSkeleton` = a CLIENT component (`components/admin/showpage/ShowReviewModalSkeleton.tsx`, `"use client"`) that owns its own no-op `onClose` and local ref internally and renders the shell frame with loading blocks mirroring the deleted `loading.tsx` skeleton — an RSC cannot pass functions/refs as props to the client shell, so the skeleton must close over them client-side; the server loader/page renders `<ShowReviewModalSkeleton />` with zero props.
- [ ] **Step 4: dashboard mount** in `app/admin/page.tsx`: searchParams type `{ step?: string; show_finalize?: string; bucket?: string; show?: string | string[]; alert_id?: string | string[] }`; after `DashboardWithHeader` (`:187,222` branch only — wizard branches ignore `show`):
```tsx
const showSlug = firstParam(sp.show);
{showSlug ? (
  <Suspense fallback={<ShowReviewModalSkeleton />}>
    <ShowReviewModal slug={showSlug} alertId={firstParam(sp.alert_id)} />
  </Suspense>
) : null}
```
- [ ] **Step 5: registry/meta-test retargeting — SAME task, BEFORE the commit** (spec §7; the pin suites break the moment `page.tsx` content moves, so the retargets land in this commit to keep the per-task-green invariant): `tests/admin/_showReviewReadPathPin.test.ts` (:36-42 walk roots + :129-137 non-vacuous list += `app/admin/_showReviewModal.tsx`), `tests/admin/_metaInfraContract.test.ts:405-407` (surface → `app/admin/_showReviewModal.tsx`), `tests/log/_metaAdminOutcomeContract.test.ts:216-249` (every `app/admin/show/[slug]/page.tsx` `file:` → `app/admin/_showReviewModal.tsx`), `tests/admin/_metaBoundedReads.test.ts:31-56` (row move), `tests/components/admin/transitionAudit.test.tsx:34-41` (page row stays until Task 9 rewrites the page — update its count only if the transplant changes it; add `PublishedReviewModal.tsx` + `ReviewModalShell.tsx` rows with audited counts), `tests/admin/serverNoClientValueCall.test.ts:29,114-151` (audit list += `app/admin/_showReviewModal.tsx`; control assertions → loader). No contract text weakened — paths only, plus the two NEW transitionAudit rows.
- [ ] **Step 6: dashboard page tests** — `?show=x` renders Suspense-mounted modal region; wizard-mode + `?show` → no modal; `show=""` / `show=["a","b"]` per guard table. Delete `perShowPage.test.tsx`. Run loader + dashboard suites + ALL SIX pin suites → PASS. `pnpm typecheck` (PublishedReviewPage deletion fan-out — fix imports: `tests/e2e/_showPageLayoutHarness.tsx` retarget happens in Task 12, so keep that harness compiling by switching its import to `PublishedReviewModal` NOW with minimal prop shim).
- [ ] **Step 7: commit** `feat(admin): ShowReviewModal server loader + dashboard mount + pin retargets (kills PublishedReviewPage)`

### Task 8: FOLDED INTO TASK 7 (retargeting must be atomic with the move — no separate commit)

### Task 9: redirect page (spec §3)

**Files:** Modify `app/admin/show/[slug]/page.tsx` (full rewrite, ~30 lines); Delete `app/admin/show/[slug]/loading.tsx`; Test: `tests/app/admin/showSlugRedirect.test.tsx` (new).

- [ ] **Step 1: failing tests:** awaits `requireAdmin()` then `redirect()`; target `/admin?show=<enc(slug)>`; incoming `alert_id`/`review` re-appended (first value each); incoming `show` param DROPPED; fragment untouched (not server-visible — no test).
- [ ] **Step 2: FAIL → Step 3: implement:**
```tsx
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
export const dynamic = "force-dynamic";
export default async function AdminShowRedirect({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const q = new URLSearchParams({ show: slug });
  for (const [k, v] of Object.entries(sp)) {
    if (k === "show") continue;
    const first = Array.isArray(v) ? v[0] : v;
    if (first) q.set(k, first);
  }
  redirect(`/admin?${q.toString()}`);
}
```
- [ ] **Step 4: PASS; re-run Task 7's six pin suites (read-path pin non-vacuous list still sees `page.tsx`; transitionAudit page row now reflects the redirect rewrite — update its count in THIS commit) → green.**
- [ ] **Step 5: commit** `feat(admin): /admin/show/[slug] → /admin?show= redirect (param passthrough, requireAdmin kept)`

### Task 10: feed.ts `/admin` revalidation (spec §4)

**Files:** Modify `app/admin/show/[slug]/_actions/feed.ts` (`mi11ApproveAction` :75-76, `mi11RejectAction` :109, `undoChangeAction` :141-142); Test: extend the existing feed-action suite (locate via `grep -rl "mi11ApproveAction" tests/`).

- [ ] **Step 1: failing tests:** each of the three actions calls `revalidatePath("/admin", "page")` on success AND no longer calls `revalidatePath("/admin/show/[slug]", "page")` (spec §4: stale show-route revalidations are DROPPED where touched — same rule applies to `acceptChangeAction`/`acceptAllAction` `:183,219` and the path-string calls in `archive.ts:37`/`setPublished.ts:36` are left alone, they're not touched by this task).
- [ ] **Step 2: FAIL → Step 3: swap the calls in the three actions → Step 4: PASS** (+ `tests/log/adminOutcomeBehavior.test.ts` collateral).
- [ ] **Step 5: commit** `fix(admin): mi11 approve/reject + undo revalidate /admin for modal freshness`

### Task 11: link-site migration + alertActions (spec §3.1, D7, D9)

**Files:** Modify `components/admin/ShowsTable.tsx:476` (+ `buildShowModalHref`), `ArchivedShowRow.tsx:75` (fixed `/admin?bucket=archived&show=`), `BellPanel.tsx:454`, `NeedsAttentionInbox.tsx:128,156`, `StagedReviewCard.tsx:356` (router.push via helper), `telemetry/EventRow.tsx:82`, `telemetry/HealthAlertsPanel.tsx:137`, `PreviewBanner.tsx:116`, `app/show/[slug]/unpublish/blocks.tsx:66`, `lib/adminAlerts/alertActions.ts:51,112` (`/admin?show=<slug>#share-access`, `/admin?show=<slug>#overview`). NOT touched (D10/§3.1): notify templates, `lib/reports/submit.ts`, preview pages, staged page, wizard step3ReviewSections.

- [ ] **Step 1: failing tests:** update every existing component/unit test asserting the old hrefs (locate: `grep -rln "admin/show/" tests/ --include="*.test.*" | grep -v e2e`) to the new URLs FIRST; add ShowsTable case: with `bucket=archived` in current params the row href preserves it.
- [ ] **Step 2: FAIL → Step 3: migrate the sites → Step 4: full unit suite green; sweep `grep -rn "admin/show/" components lib app --include="*.tsx" --include="*.ts" | grep -v "preview\|staged\|api/admin\|notify\|reports"` → only the redirect page + spec/plan docs remain.**
- [ ] **Step 5: commit** `feat(admin): migrate show links to /admin?show= modal URLs`

### Task 12: e2e — modal specs + URL rewrites (spec §6.5, §6.6, §8)

**Files:**
- Rewrite: `tests/e2e/_showPageLayoutHarness.tsx` → `_publishedReviewModalHarness.tsx` (render `PublishedReviewModal` open, real data fixtures); `tests/e2e/showPageLayout.spec.ts` → `published-review-modal.layout.spec.ts`
- Create: `tests/e2e/published-review-modal.interactions.spec.ts`, `tests/e2e/published-review-modal.deeplink.spec.ts`
- Modify: `_statusStripToggleHarness.tsx:39` (import path only), URL constructions in `admin-lifecycle-layout.spec.ts:211`, `admin-lifecycle-transitions.spec.ts:122-248`, `picker-flow.spec.ts:302,333`, `admin-changes-feed-layout.spec.ts:119`, `admin-parse-panel.spec.ts:115-241` (`/admin/show/<slug>` → `/admin?show=<slug>`; selectors scoped inside `[data-testid="published-show-review-modal"]`). `admin-route-boundaries.spec.ts:140-158` is NOT rewritten — those are staged/preview route-boundary cases (untouched scope); the legacy-redirect behavior is covered by the deeplink spec. Also modify `tests/e2e/standalone.config.ts:24-25`: the testMatch/entry that names `showPageLayout` must name the renamed `published-review-modal.layout.spec.ts`, or the mandatory layout-dimensions spec silently drops out of the standalone harness suite.

**Layout spec (mandatory layout-dimensions task — spec §6.6 Dimensional Invariants verbatim):** at 375×812 and 1280×900, `getBoundingClientRect` within 0.5px:
- sheet `<sm`: `grab.height + header.height + main.height === panel.clientHeight`
- popup/two-pane `≥sm`: `header.height + main.height === panel.clientHeight` (grab hidden, NO footer element exists)
- `main` = ShowReviewSurface root (`published-show-review` scoped), fills to panel bottom.

**Transition-audit coverage (spec §6.5 inventory verbatim):** closed→open entrance animation attrs present; open→close instant unmount (X/scrim/Esc/back); drag-dismiss transition + threshold/slop; reduced-motion `animation:none`; skeleton→loaded instant; compound: drag started then viewport crosses `sm` → drag released (resize mid-pointer).

**Interactions spec:** initial focus close button; Tab trap; Esc/scrim/X close → URL loses `show` (+`alert_id`), keeps `bucket`; browser Back closes; drag past 110px dismisses, under 6px slop clicks through.

**Deep-link spec:** cold `/admin?show=<slug>` opens modal (fixture-derived title asserted INSIDE panel — cloned tree, dashboard rows excluded, anti-tautology); `&alert_id=` → highlighted `li[aria-current]` ring + scrolled into scroller viewport; `#share-access` fragment → share panel in view; SIGNED-IN legacy `/admin/show/<slug>?alert_id=x` → 307 → modal + highlight; unknown slug → bare `/admin`, no modal; signed-out `/admin/show/<slug>` → sign-in → post-auth modal (reuse picker-flow auth harness pattern; if the harness cannot do full OAuth, assert the sign-in redirect carries `next=/admin/show/<slug>` — the path-preservation half D10 relies on — and cover the rest in the signed-in case).

- [ ] Steps: write specs (fail) → run against dev server (`pnpm exec playwright test tests/e2e/published-review-modal.*`) → implement any harness gaps → green → rewrite the six existing specs' URLs/selectors → full e2e suite green.
- [ ] **Commit** `test(e2e): published review modal layout/interactions/deeplink + admin show URL rewrites`

### Task 13: help copy (spec §7 tail)

**Files:** Modify `app/help/_affordanceMatrix.ts:112,239` (sourceRoute → `/admin?show=rpas-central-2026`), `app/help/admin/per-show-panel/page.mdx` (layout description: modal over dashboard, no footer, publish toggle in status strip, archive in Overview; "show page" → "show details"); Test: existing `tests/help/` suites + affordance matrix consumers.

- [ ] Update copy → run `pnpm vitest run tests/help` → PASS → **commit** `docs(admin): help copy for show review modal`

### Task 14: close-out gates

- [ ] `pnpm test` (full), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` — all green (paste outputs into the handoff notes).
- [ ] Local Playwright e2e suite green.
- [ ] `/impeccable critique` + `/impeccable audit` on the UI diff (canonical v3 setup gates); P0/P1 fixed or DEFERRED.md rows; findings + dispositions recorded.
- [ ] Help-screenshot drift: NO new captures (spec §7); if `/admin` baseline drifts, regenerate from the pinned Docker image with `--platform linux/amd64`, never host bytes.
- [ ] **Commit** any gate fixes per-task-style, then hand to Stage 4 (whole-diff Codex review → push → CI → merge).

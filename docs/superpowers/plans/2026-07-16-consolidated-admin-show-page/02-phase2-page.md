# Phase 2 — Snapshot RPC, published adapter, consolidated page

Spec sections: §3.3-§3.5, §4-§11, §13-§15. Precondition (spec header): design mock committed at `docs/superpowers/specs/2026-07-16-consolidated-admin-show-page-mock/` — verify with `ls` before Task 10; if absent, STOP.

---

### Task 6: Snapshot RPC migration

**Files:**
- Create: `supabase/migrations/20260716<hhmmss>_admin_show_review_snapshot_rpc.sql` (pick timestamp > newest existing; check `ls supabase/migrations | tail -1` AND `uniq -d` on 14-digit prefixes — version-collision lesson)
- Test: `tests/db/adminShowReviewSnapshotRpc.test.ts` (loopback-guarded like sibling `tests/db/*` DB tests — copy the guard idiom from an existing file in that dir)
- Modify: `supabase/__generated__/schema-manifest.json` (regenerated)

**Produces:** `public.get_admin_show_review_snapshot(p_show_id uuid) RETURNS jsonb`.

Migration body (idempotent — `create or replace` + re-runnable grants):

```sql
-- get_admin_show_review_snapshot: single-statement published-review snapshot (spec §3.3a).
-- SECURITY DEFINER + is_admin() gate (pattern: 20260501002000_rls_policies.sql).
-- STABLE, no writes, no advisory locks. One SELECT = statement-level snapshot.
create or replace function public.get_admin_show_review_snapshot(p_show_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.is_admin() then null else
    jsonb_build_object(
      'show',     (select to_jsonb(s) from public.shows s where s.id = p_show_id),
      'internal', (select to_jsonb(si) from public.shows_internal si where si.show_id = p_show_id),
      'crew_members',       coalesce((select jsonb_agg(to_jsonb(c) order by c.id)
                              from public.crew_members c where c.show_id = p_show_id), '[]'::jsonb),
      'rooms',              coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
                              from public.rooms r where r.show_id = p_show_id), '[]'::jsonb),
      'hotel_reservations', coalesce((select jsonb_agg(to_jsonb(h) order by h.ordinal, h.id)
                              from public.hotel_reservations h where h.show_id = p_show_id), '[]'::jsonb),
      'transportation',     coalesce((select jsonb_agg(to_jsonb(t) order by t.id)
                              from public.transportation t where t.show_id = p_show_id), '[]'::jsonb),
      'contacts',           coalesce((select jsonb_agg(to_jsonb(k) order by k.id)
                              from public.contacts k where k.show_id = p_show_id), '[]'::jsonb)
    )
  end
$$;

revoke all on function public.get_admin_show_review_snapshot(uuid) from public;
grant execute on function public.get_admin_show_review_snapshot(uuid) to authenticated, service_role;
```

(Verify at implementation: `rooms`/`transportation`/`contacts` PK column name is `id` and `hotel_reservations` has `ordinal` — schema manifest already confirms; if a PK differs, order by that PK. If `shows.id` is not uuid-typed, match the actual type.)

- [ ] **Step 1: failing test** — `tests/db/adminShowReviewSnapshotRpc.test.ts` (postgres.js against `TEST_DATABASE_URL`/local, loopback-guarded):
  - seeds one show + 2 crew + 2 rooms + 3 hotel_reservations (ordinals 3,1,2) + shows_internal row (inside a tx rolled back after)
  - calls the fn as service role: full payload; hotel order `1,2,3` by ordinal; arrays complete
  - show with NO shows_internal row → `internal` is null, arrays `[]`
  - volatility + grants: `select provolatile from pg_proc where proname='get_admin_show_review_snapshot'` = `'s'`; `has_function_privilege('authenticated', ...)` true, `('anon', ...)` false
  - non-admin gate: `set local role authenticated; set local request.jwt.claims = '<non-admin claims json>'` → returns null (copy the claims idiom from an existing RLS test under `tests/db/`)
- [ ] **Step 2:** run → FAIL (function does not exist)
- [ ] **Step 3:** apply migration locally (`psql $LOCAL_DB -f supabase/migrations/<file>.sql` or `supabase db reset` per project norm), rerun → PASS
- [ ] **Step 4:** `pnpm gen:schema-manifest`; commit regenerated manifest with the migration + test: `feat(db): add get_admin_show_review_snapshot single-statement review RPC`
- [ ] **Step 5:** surgical validation apply from MAIN checkout (validation creds live there): `psql "$TEST_DATABASE_URL" -f supabase/migrations/<file>.sql` then `notify pgrst, 'reload schema';` — record output in the task log. (validation-schema-parity CI gate proves it.)

---

### Task 7: Read helper + infra row + read-path pin

**Files:**
- Create: `lib/admin/readShowReviewSnapshot.ts`
- Test: `tests/admin/readShowReviewSnapshot.test.ts`; EXTEND `tests/admin/_metaInfraContract.test.ts` (registry row); create `tests/admin/_showReviewReadPathPin.test.ts`

**Produces:**
```ts
export type ShowReviewSnapshot = { show: ShowRowJson; internal: ShowsInternalJson | null;
  crew_members: unknown[]; rooms: unknown[]; hotel_reservations: unknown[]; transportation: unknown[]; contacts: unknown[] };
export type ReadSnapshotResult =
  | { kind: "ok"; snapshot: ShowReviewSnapshot }
  | { kind: "not_admin_or_missing" }        // RPC returned null
  | { kind: "infra_error"; message: string } // returned error OR thrown — both mapped here, discriminably logged
export async function readShowReviewSnapshot(supabase: SupabaseServerClient, showId: string): Promise<ReadSnapshotResult>;
```
- [ ] **Step 1: failing tests** — mock supabase `.rpc` returning `{data, error}` permutations: data→ok; `data:null`→not_admin_or_missing; `error`→infra_error; thrown→infra_error. Assert no bare-data destructure (behavioral: error path never returns ok).
- [ ] **Step 2:** FAIL → implement (destructure `{ data, error }`; try/catch thrown; `log.error` with a NON-`REPORT_*` forensic `code:` only if an existing §12.4-exempt admin code fits — otherwise no code-stamped log, this is a read path, `// no-telemetry: read-only helper, failures surface as typed result` NOT needed since not a mutation surface).
- [ ] **Step 3:** registry row in `tests/admin/_metaInfraContract.test.ts` for the new helper; run that meta-test.
- [ ] **Step 4:** `tests/admin/_showReviewReadPathPin.test.ts` — reads the SOURCE of `app/admin/show/[slug]/page.tsx` + `lib/admin/readShowReviewSnapshot.ts` and asserts: page contains NO `.from("crew_members"|"rooms"|"hotel_reservations"|"transportation"|"contacts")` builder call for review data (allowlist any pre-existing non-review reads by exact line-shape, e.g. share-token or alert reads keep their own tables); helper contains exactly one `.rpc("get_admin_show_review_snapshot"`.
- [ ] **Step 5:** commit `feat(admin): snapshot read helper with typed infra results + read-path pin`

---

### Task 8: publishedAdapter

**Files:**
- Create: `components/admin/review/publishedAdapter.ts`
- Test: `tests/components/admin/review/publishedAdapter.test.ts`

**Produces:** `buildPublishedSectionData(snapshot: ShowReviewSnapshot, opts: { slug: string }): PublishedSectionData`

Mapping = spec §3.2 table verbatim. Key concretes:
- `billing`: `{ coiStatus: show.coi_status ?? null, proposal: internal?.financials?.proposal ?? null, po: internal?.financials?.po ?? null, invoice: internal?.financials?.invoice ?? null, invoiceNotes: internal?.financials?.invoice_notes ?? null }` (verify financials field names against `lib/sync/applyParseResult.ts:48,:249` at implementation)
- `agendaBaseline`: `buildAdminAgendaPreview(links, { validatedHrefs: true, freshByLinkKey: new Set(links.map((l, i) => l.extracted != null ? i : -1).filter(i => i >= 0)) })` then post-map: `items.map((it, i) => links[i]?.fileId ? { ...it, href: \`/api/asset/agenda/\${showId}/\${links[i].fileId}\` } : it)`
- `archivedPullSheetTabs: []` always; `mode: "published"`; `driveFileId: show.drive_file_id ?? null`
- display sort in-adapter: rooms `(kind, name, id)`, contacts `(kind, name, id)`, transportation `(id)`, crew `(name, id)`; hotels keep RPC ordinal order
- missing `internal` → empty `warnings`/`useRawDecisions`/`ros`-empty/`rawUnrecognized: null`

- [ ] **Step 1: failing tests** — fixtures derive expectations from fixture values (anti-tautology): agenda fixture with 2 links (one `extracted`, one not) → exactly one block, fileId-backed href equals the asset route string built from the FIXTURE's ids; billing from fixture financials; null-internal guard row per spec §11; hotel ordinal preservation; rooms re-sorted by (kind,name).
- [ ] **Step 2-4:** FAIL → implement → PASS → `tsc --noEmit`.
- [ ] **Step 5:** commit `feat(admin): published SectionData adapter`

---

### Task 9: Mode forks — agenda static variant, diagram srcs, no-staged-traffic

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (agenda registry entry published branch; DiagramsBreakdown src builder prop)
- Test: `tests/components/admin/review/publishedNoStagedTraffic.test.tsx`

- [ ] **Step 1: failing test** — render EVERY section def from `step3Sections(publishedFixture)` plus the modal-level callout, with a fetch spy: assert (a) no rendered `src`/`href` contains `/api/admin/onboarding/`; (b) zero `fetch` calls to that prefix; (c) agenda section renders extraction blocks from the fixture (static variant); (d) diagram imgs use `/api/asset/diagram/<show>/<rev>/<key>` shape. Clone-and-strip siblings when scanning for labels (anti-tautology rule).
- [ ] **Step 2:** FAIL → implement: agenda entry renders `isStaged(s) ? <AgendaBreakdown .../> : <PublishedAgendaList items={s.agendaBaseline} />` (new small component in `step3ReviewSections.tsx` or `components/admin/review/`; static list reusing the existing block-rendering pieces, no POST/poll); `DiagramsBreakdown` gains `buildSrc: (stub) => string` prop — staged passes the existing staged-diagram URL builder, published passes the asset-route builder (crew `Gallery` pattern, `components/diagrams/Gallery.tsx:130-144`).
- [ ] **Step 3-4:** PASS; wizard suite STILL green (staged branch untouched behaviorally).
- [ ] **Step 5:** commit `feat(admin): published-mode agenda/diagram variants with zero onboarding traffic`

---

### Task 10: StatusStrip

**Files:**
- Create: `components/admin/showpage/StatusStrip.tsx` (client component)
- Test: `tests/components/admin/showpage/statusStrip.test.tsx`

Elements + sources: spec §4 table. `data-testid="show-status-strip"`; children testids: `strip-title`, `strip-publish-toggle` (wraps existing `PublishedToggle`), `strip-live-badge`, `strip-sync-age`, `strip-alert-badge` (anchor `href="#overview"`), `strip-copy-link`. Visual reference: mock section 3 (states a/b/c) — colors via tokens only (`bg-surface`, `border-border`, `text-text-subtle`, warning pair for the alert badge; the mock's teal all-clear is OVERRIDDEN per mock README delta 2 — use neutral subtle check).

- [ ] **Step 1: failing tests** — state matrix from spec §6: published+live (badge present), published+not-live (hidden), archived (read-only badge, Unarchive, toggle disabled), unpublished (copy-link hidden, inactive), alerts 0 (badge hidden). Async focus/toggle assertions use `waitFor`.
- [ ] **Step 2-4:** implement → PASS. Sticky positioning: `sticky top-<nav-offset> z-<semantic>`; strip wraps to two rows below `sm` (mock section 2 reference).
- [ ] **Step 5:** commit `feat(admin): pinned status strip for consolidated show page`

---

### Task 11: OverviewSection + ChangesSection + raw-unrecognized slot

**Files:**
- Create: `components/admin/showpage/OverviewSection.tsx`, `components/admin/showpage/ChangesSection.tsx`
- Test: `tests/components/admin/showpage/overviewSection.test.tsx`

Overview composition (spec §5.1, all relocated intact): `PerShowAlertSection`, share panel cluster (`CurrentShareLinkPanel`/`ShareChip`/`RotateShareTokenButton`/`CrewPageLink`/`PickerResetControl` inside `ShareTokenProvider`), sheet/sync cluster (`ReSyncButton`, `CorrectionLoopCallout mode="resync"`, open-sheet link), archive row. Changes = `ChangesFeed` + `readShowChangeFeed` data (server-fetched, passed down). Raw-unrecognized: page bottomSlot renders `RawUnrecognizedCallout raw={d.rawUnrecognized}` AFTER warnings section, BEFORE Changes (spec §5.3a).

- [ ] **Step 1: failing tests** — overview renders each relocated cluster (presence by testid/role, not snapshot); archived → mutating controls disabled/hidden; unpublished → inactive share notice; raw-unrecognized fixture renders callout, empty renders nothing.
- [ ] **Step 2-5:** implement → PASS → commit `feat(admin): overview + changes rail sections`

---

### Task 12: Per-section warning controls + Preview-As gate

**Files:**
- Create: `components/admin/showpage/sectionWarningExtras.tsx` (the `renderSectionExtras` implementation)
- Modify: crew section row rendering (published mode) for Preview-As links
- Test: `tests/components/admin/showpage/sectionWarningControls.test.tsx`

Behavior (spec §5.3, §5.5): for each section id, `warningsBySection` slice renders under the panel with existing per-item controls: `RoleRecognizeControlBoundary` on `UNKNOWN_ROLE_TOKEN`, `UseRawControlBoundary` on the three recoverable structural codes, `DataQualityWarningControls`+`BulkIgnoreControls` with `partitionByIgnored`/`loadIgnoredWarnings` data (server-loaded, passed via props). Rail chips reuse `deriveSectionStatuses` (already in surface). Preview-As: crew rows get `<Link href={/admin/show/${slug}/preview/${crewId}}>` ONLY when `published && !archived`; tests for all three states.

- [ ] **Step 1: failing tests** — control renders INSIDE its owning section container (query within section testid, siblings stripped); ignored partition collapses; Preview-As trio.
- [ ] **Step 2-5:** implement → PASS → commit `feat(admin): per-section warning controls + gated Preview-As`

---

### Task 13: Page rebuild

**Files:**
- Create: `components/admin/showpage/PublishedReviewPage.tsx` (client shell: strip + two-pane `ShowReviewSurface layout="page"` + Overview/Changes/extras wiring + hash deep links)
- Modify: `app/admin/show/[slug]/page.tsx` — fetch via `readShowReviewSnapshot`, build `PublishedSectionData`, server-load overview/feed/ignored-warnings data, render `PublishedReviewPage`; keep `requireAdmin`/`notFound` posture (`page.tsx:20-21`)
- Test: `tests/components/admin/showpage/publishedReviewPage.test.tsx` + update existing page tests that asserted the OLD layout (these are page tests, NOT wizard-pin tests — updating them is expected)

Hash deep links (spec §10): rail ids map to `#<sectionId>` + `#overview`/`#changes`; on mount, `location.hash` scrolls via the surface's single nav-click accessor. Server actions passed as DIRECT refs (RSC boundary lesson — run `pnpm build` in this task).

- [ ] **Step 1: failing tests** — page renders strip + rail incl. Overview first / Changes last; snapshot `infra_error` → existing error boundary path (no raw code); `not_admin_or_missing` → `notFound()`.
- [ ] **Step 2-4:** implement → PASS → `pnpm build` green (Server→Client action wiring).
- [ ] **Step 5:** commit `feat(admin): consolidated show page on shared review surface`

---

### Task 14: Real-browser layout assertions (MANDATORY, Playwright — jsdom insufficient)

**Files:**
- Create: `tests/e2e/showPageLayout.spec.ts` (or the project's real-browser harness dir — follow `reference_step3_modal_realbrowser_harnesses` pattern: pinned esbuild live bundle)

Dimensional invariants (spec §8 verbatim — assert with `getBoundingClientRect()`, 0.5px tolerance):
1. ≥lg two-pane: rail outer wrapper height === panel column height (pane container has explicit `items-stretch`)
2. strip width === content column width; after `scrollBy(0, 2000)`, `strip.getBoundingClientRect().top === <nav-offset>` (sticky holds)
3. <lg chip rail: `scrollHeight === clientHeight` within 1px (single row, horizontal scroll only)
4. every documented testid inside fixed-dimension parents measured (`show-status-strip`, rail, chip rail, panel column)

- [ ] Steps: write spec → run (FAIL against pre-layout stub if any) → fix CSS → PASS at 1360px and 390px viewports → commit `test(admin): real-browser layout invariants for consolidated page`

---

### Task 15: Transition audit (MANDATORY)

**Files:**
- Test: `tests/components/admin/showpage/pageTransitions.test.tsx`

Inventory (spec §9 verbatim): A rail-highlight instant; C disclosure existing treatment; D modal-over-page existing scrim/panel hooks + body scroll lock asserted when modal opens over page; E toggle existing pending treatment; compound D×scroll (lock), compound E×D (freeze contract — strip toggle disabled while publish run active, same `isPublishRunActive` signal), compound C×A (no coupling — instant). Enumerate every `AnimatePresence`/ternary/conditional in the new page components and assert each is either inherited-animated or deliberately instant.

- [ ] Steps: write audit test from the table → run → fix any missing exit/initial props → PASS → commit `test(admin): transition audit for consolidated page`

---

### Task 16: Screenshot rebaseline + Phase-2 close-out

- [ ] **Step 1:** help-screenshot manifest covers admin show route → regenerate ONLY from the pinned Playwright Docker image with `--platform linux/amd64` (byte-comparison discipline; NEVER from dev host). Pixel-diff before rebaseline; commit updated WebPs.
- [ ] **Step 2:** `/impeccable critique` + `/impeccable audit` on the UI diff (canonical v3 setup gates). P0/P1 fixed or DEFERRED.md rows. External attestation per standing rule.
- [ ] **Step 3:** FULL gates: `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check && pnpm build`.
- [ ] **Step 4:** close-out greps: `rg "pg_advisory"` diff-zero; `rg "/api/admin/onboarding" components/admin/review components/admin/showpage` zero; mutation-surface walker green (`pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts`); removed-testid sweep `grep -rn "<any removed testid>" tests/`.
- [ ] **Step 5:** commit any straggler fixes; hand off to Stage-4 whole-diff review.

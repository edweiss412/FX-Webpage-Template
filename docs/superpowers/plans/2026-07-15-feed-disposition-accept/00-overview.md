# Feed Disposition (Accept / Accepted) + "Sheet changes" Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-show Changes feed gains Accept / Accept-all affordances and an "Accepted" tag; heading renamed to "Sheet changes".

**Architecture:** Disposition rides in two new required `FeedEntry` fields (`acceptable`, `acknowledgedAt`) computed in `readShowChangeFeed` from newly-selected `source`/`acknowledged_at` columns; two new thin server actions in the per-show feed actions file delegate to the existing lock-free `acknowledgeChanges` helper; UI reuses the strip's `AcceptChangeButton`.

**Tech Stack:** Next.js 16 RSC + server actions, Supabase (existing `acknowledge_changes` RPC — NO migration), Vitest (+ real-DB psql suite for the feed read), Playwright e2e (existing spec only).

**Spec:** `docs/superpowers/specs/2026-07-15-feed-disposition-accept.md` (adversarial-APPROVED R2). Spec wins on any conflict.

## Global Constraints

- Invariant 2: `acknowledgeChanges` is lock-free; NEVER wrap in `withShowAdvisoryLock`. **Advisory-lock holder topology: this plan touches no `pg_advisory*` surface; no holder changes.**
- Invariant 5: failures surface via `ErrorExplainer` catalog copy; raw codes never reach DOM.
- Invariant 9: helper already wraps Supabase boundaries; actions only pass through typed results.
- Invariant 10: new actions ⇒ `AUDITABLE_MUTATIONS` rows + behavioral proof (Task 2). Refusals never emit telemetry.
- `FeedEntry` new fields are REQUIRED (no `?:`) — every literal constructor updates (Tasks 1, 3, 4, 5).
- Heading display text ONLY changes; testids / `id="admin-changes-feed-heading"` / help anchor `#changes-feed` stay.
- **Meta-test inventory (declared):** EXTENDS `tests/log/_auditableMutations.ts` (2 rows). RE-RUNS (no edits expected): `tests/log/_metaMutationSurfaceObservability.test.ts`, `tests/log/adminOutcomeBehavior.test.ts` (extended, Task 2), `tests/sync/_metaInfraContract.test.ts` (readShowChangeFeed registered `:346-349`; select edit is format-fragile), `tests/auth/advisoryLockRpcDeadlock.test.ts`. No new meta-test class.
- Commits: conventional style, one task per commit, `--no-verify` (worktree), so **run `pnpm format:check` + `pnpm lint` + `pnpm typecheck` before push** (hooks bypassed).

---

### Task 1: Data layer — `FeedEntry.acceptable` / `acknowledgedAt`

**Files:**
- Modify: `lib/sync/holds/types.ts:60-69` (FeedEntry)
- Modify: `lib/sync/feed/readShowChangeFeed.ts` (~`:70-78` ChangeLogRow, `:222` select, log-row + hold-row builders)
- Test: `tests/sync/feed/readShowChangeFeed.test.ts` (real-DB psql suite, loopback-guarded)

**Interfaces:**
- Produces: `FeedEntry` gains `acceptable: boolean; acknowledgedAt: string | null;` — required. Log rows: `acceptable = source==='auto_apply' && status==='applied' && acknowledged_at == null` (raw null-ness, spec §2 null-ness contract); `acknowledgedAt = toIso(acknowledged_at)`. Hold entries: `false` / `null`.

- [ ] **Step 1: Write the failing test.** In `readShowChangeFeed.test.ts`, extend the existing seeded-feed test (or add a sibling test in the same describe reusing its seed helpers) — seed via `runPsql` three `show_change_log` rows on one show: (a) `source='auto_apply', status='applied', acknowledged_at NULL`; (b) same but `acknowledged_at = now()` (capture the RAW stored value via `select acknowledged_at::text ...` — pg's text form carries the UTC offset, so `new Date(raw).toISOString()` is timezone-safe; do NOT `to_char` with a literal `"Z"`, which fabricates UTC from session-local time); (c) `source='mi11_approve', status='applied', acknowledged_at NULL`. Assert:

```ts
// (a) un-acknowledged auto-apply — acceptable, no acknowledgedAt
expect(rowA!.acceptable).toBe(true);
expect(rowA!.acknowledgedAt).toBeNull();
// (b) acknowledged — NOT acceptable; acknowledgedAt is the toIso of the stored timestamptz
expect(rowB!.acceptable).toBe(false);
expect(rowB!.acknowledgedAt).toBe(new Date(storedAckRawText).toISOString()); // raw ::text carries offset — session-tz safe
// (c) non-auto_apply source — never acceptable even when applied+unacknowledged
expect(rowC!.acceptable).toBe(false);
expect(rowC!.acknowledgedAt).toBeNull();
// hold-derived pending entry (existing seed): both defaults
expect(pending!.acceptable).toBe(false);
expect(pending!.acknowledgedAt).toBeNull();
```

Also seed one `status='undone'` auto-apply row WITH `acknowledged_at` set → `acceptable false`, `acknowledgedAt` non-null (accepted-then-undone; spec §4.1 total rule source of truth). Failure mode caught: predicate keyed on the wrong column/axis (e.g. status-only), or acknowledgedAt dropped for undone rows.

- [ ] **Step 2: Run** `pnpm vitest run tests/sync/feed/readShowChangeFeed.test.ts` — new assertions FAIL (`acceptable` undefined; TS error first: property does not exist).
- [ ] **Step 3: Implement.**

`lib/sync/holds/types.ts` — inside `FeedEntry` after `entityRef`:

```ts
  // Disposition axis (spec 2026-07-15 §2): true iff source='auto_apply' AND
  // status='applied' AND raw acknowledged_at IS NULL — mirrors the
  // acknowledge_changes RPC WHERE exactly, so the UI never offers an Accept
  // the RPC would no-op. Independent of `action` (a row can be undoable AND
  // acceptable).
  acceptable: boolean;
  // toIso(acknowledged_at) — non-null ⟺ Doug accepted; NEVER cleared by undo.
  acknowledgedAt: string | null;
```

`readShowChangeFeed.ts` — `ChangeLogRow` adds `source: string; acknowledged_at: string | null;`. Select becomes:

```ts
.select(
  "id, occurred_at, status, summary, entity_ref, change_kind, individually_undoable, source, acknowledged_at",
)
```

Log-row builder adds (alongside existing fields):

```ts
      acceptable:
        row.source === "auto_apply" && row.status === "applied" && row.acknowledged_at == null,
      acknowledgedAt: toIso(row.acknowledged_at),
```

Hold-row builder adds `acceptable: false, acknowledgedAt: null,`.

- [ ] **Step 4: Fix every literal `FeedEntry` constructor that now fails typecheck.** Run `pnpm typecheck`; expected failures ONLY in: `tests/components/admin/ChangesFeed.a11y.test.tsx`, `tests/components/admin/ChangesFeed.test.tsx`, `tests/components/admin/ChangeFeedEntry.test.tsx`, `tests/components/admin/Mi11GateActions.test.tsx`, `tests/app/admin/perShowPage.test.tsx`, `tests/admin/showPageFeed.test.tsx`, `tests/admin/feedTelemetry.test.tsx` (grep-verified inventory). Add `acceptable: false, acknowledgedAt: null,` to each fixture literal (Task 3/4 flip specific fixtures). If any file uses exact `toEqual` on produced entries, extend the expected object — never loosen to `toMatchObject`.
- [ ] **Step 5: Run** the feed test file + `pnpm typecheck` — PASS. Also `pnpm vitest run tests/sync/_metaInfraContract.test.ts tests/admin/_metaBoundedReads.test.ts` (select-list edit is comment/format-fragile).
- [ ] **Step 6: Commit** `feat(sync): FeedEntry disposition fields (acceptable/acknowledgedAt) from show_change_log`

### Task 2: Server actions — `acceptChangeAction` / `acceptAllAction`

**Files:**
- Modify: `app/admin/show/[slug]/_actions/feed.ts` (add two exports; extend header comment)
- Modify: `tests/log/_auditableMutations.ts` (2 rows after the `:155` feed undo row block or beside the Flow-4 rows)
- Modify: `tests/log/adminOutcomeBehavior.test.ts` (2 tests in the existing per-show feed describe; REUSES the file-level `acknowledgeChangesMock` at `:275-282`)
- Test (new): `tests/admin/showFeedAcceptActions.test.ts` (pattern: `tests/admin/autoAppliedActions.test.ts:1-80`)

**Interfaces:**
- Consumes: `acknowledgeChanges(showId: string, ids: string[]): Promise<AcknowledgeChangesResult>` (`lib/sync/holds/acknowledgeChanges.ts:23`).
- Produces: `acceptChangeAction(prev: AcknowledgeChangesResult | null, formData: FormData)` reading `showId`+`changeLogId`; `acceptAllAction(...)` reading `showId`+`ids` (comma-joined). Both exported from the `"use server"` feed actions file — Tasks 3-5 bind them.

- [ ] **Step 1: Write failing unit tests** in new `tests/admin/showFeedAcceptActions.test.ts` — copy the mock scaffold of `autoAppliedActions.test.ts:16-63` verbatim (requireAdminIdentity / next-cache / showCacheTag mocks, `setLogSink` capture, `vi.spyOn(ack, "acknowledgeChanges")`), importing from `@/app/admin/show/[slug]/_actions/feed`. Cases (spec §3 guard grid + §6.2):

```ts
// acceptChangeAction
it("success → acknowledgeChanges(showId,[changeLogId]) + BOTH revalidates + durable CHANGES_ACKNOWLEDGED source admin.show.feed.accept", ...);
it("empty showId → {ok:false,SYNC_INFRA_ERROR}; helper NOT called; no log row", ...);
it("empty changeLogId → same refusal (tightened vs dashboard near-copy — deliberate)", ...);
it("helper {ok:false} passthrough; no revalidate; no log row", ...);
// acceptAllAction
it("ids ' a, b ,,b, ' → delegates deduped ['a','b']; success logs count+requested", ...);
it("ids empty/whitespace-only → refusal; helper NOT called", ...);
it("count:0 success passthrough (stale-id race) still {ok:true} and logs", ...);
```

Key assertions: `expect(spy).toHaveBeenCalledWith(SHOW_ID, ["a", "b"])`; `expect(revalidatePath).toHaveBeenCalledWith("/admin/show/[slug]", "page")` AND `("/admin", "page")`; `expect(revalidateShow).not.toHaveBeenCalled()` (acknowledgement busts no crew-data tag); refusal cases assert `spy` not called and sink has no `CHANGES_ACKNOWLEDGED`.

- [ ] **Step 2: Run** `pnpm vitest run tests/admin/showFeedAcceptActions.test.ts` — FAIL (exports missing).
- [ ] **Step 3: Implement** in `app/admin/show/[slug]/_actions/feed.ts` (imports: `acknowledgeChanges`, `type AcknowledgeChangesResult` from `@/lib/sync/holds/acknowledgeChanges`):

```ts
/** Accept a SINGLE auto-applied change from the per-show Sheet-changes feed. */
export async function acceptChangeAction(
  _prev: AcknowledgeChangesResult | null,
  formData: FormData,
): Promise<AcknowledgeChangesResult> {
  const admin = await requireAdminIdentity();
  const showId = String(formData.get("showId") ?? "");
  const changeLogId = String(formData.get("changeLogId") ?? "");
  // Spec §3 input guards: refusals never call the helper and never emit telemetry.
  // changeLogId guard is a deliberate tightening vs the dashboard near-copy.
  if (!showId || !changeLogId) return { ok: false, code: "SYNC_INFRA_ERROR" };
  const result = await acknowledgeChanges(showId, [changeLogId]);
  if (result.ok) {
    // POST-COMMIT: the feed row flips to Accepted here AND the dashboard strip
    // must drop the row. No revalidateShow — acknowledgement mutates no crew data.
    revalidatePath("/admin/show/[slug]", "page");
    revalidatePath("/admin", "page");
    try {
      await logAdminOutcome({
        code: "CHANGES_ACKNOWLEDGED",
        source: "admin.show.feed.accept",
        actorEmail: admin.email,
        showId,
        extra: { changeLogId, count: result.count },
      });
    } catch {
      /* best-effort */
    }
  }
  return result;
}

/** Accept ALL currently-acceptable changes rendered in one show's feed. */
export async function acceptAllAction(
  _prev: AcknowledgeChangesResult | null,
  formData: FormData,
): Promise<AcknowledgeChangesResult> {
  const admin = await requireAdminIdentity();
  const showId = String(formData.get("showId") ?? "");
  const ids = Array.from(
    new Set(
      String(formData.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  // Empty payload is a malformed submission (button renders only with N>=1).
  if (!showId || ids.length === 0) return { ok: false, code: "SYNC_INFRA_ERROR" };
  const result = await acknowledgeChanges(showId, ids);
  if (result.ok) {
    revalidatePath("/admin/show/[slug]", "page");
    revalidatePath("/admin", "page");
    try {
      await logAdminOutcome({
        code: "CHANGES_ACKNOWLEDGED",
        source: "admin.show.feed.acceptAll",
        actorEmail: admin.email,
        showId,
        extra: { count: result.count, requested: ids.length },
      });
    } catch {
      /* best-effort */
    }
  }
  return result;
}
```

- [ ] **Step 4: Registry + behavioral proof.** `_auditableMutations.ts` — add beside the existing feed-file rows:

```ts
  // Sheet-changes feed accept (spec 2026-07-15): per-show Accept / Accept-all.
  {
    file: "app/admin/show/[slug]/_actions/feed.ts",
    fn: "acceptChangeAction",
    code: "CHANGES_ACKNOWLEDGED",
  },
  {
    file: "app/admin/show/[slug]/_actions/feed.ts",
    fn: "acceptAllAction",
    code: "CHANGES_ACKNOWLEDGED",
  },
```

`adminOutcomeBehavior.test.ts` — in the per-show feed describe (near `:1726`), two tests mirroring `:1566-1605` but `file: "app/admin/show/[slug]/_actions/feed.ts"`, importing the new actions via the existing `:338` import block. **Shared-mock rule:** `acknowledgeChangesMock` is file-level and NOT reset in `beforeEach` — set `mockImplementation(async () => ({ ok: true, count: 1 }))` inline at the top of each success case.

- [ ] **Step 5: Run** `pnpm vitest run tests/admin/showFeedAcceptActions.test.ts tests/log/adminOutcomeBehavior.test.ts tests/log/_metaMutationSurfaceObservability.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts` — PASS (walker sees registry rows; lock topology untouched).
- [ ] **Step 6: Commit** `feat(admin): per-show feed accept/accept-all server actions with audit registry + behavioral proof`

### Task 3: UI + wiring — `ChangeFeedEntry`, `ChangesFeed`, show page (ONE commit)

> Tasks 3a-3c below land as a SINGLE commit: each layer's new required props break the caller one level up, so intermediate per-layer commits would not typecheck/build. TDD still applies per layer (failing test first); the commit gate runs once, after 3c, when the whole tree is green.

#### Task 3a: `ChangeFeedEntry` — Accept button + Accepted tag

**Files:**
- Modify: `components/admin/ChangeFeedEntry.tsx`
- Test: `tests/components/admin/ChangeFeedEntry.test.tsx`

**Interfaces:**
- Consumes: `AcceptChangeButton` (`components/admin/AcceptChangeButton.tsx` — props `{acceptAction, hiddenFields, label?, stretch?}`, testid `change-feed-accept`); Task 1 `FeedEntry` fields; Task 2 action type.
- Produces: `ChangeFeedEntry` gains required props `showId: string` and `acceptAction: AcceptServerAction` (type alias local, structurally `(prev: AcceptButtonResult | null, formData: FormData) => ...` — import `AcceptButtonResult` from the button module). Task 4 threads them.

- [ ] **Step 1: Failing tests** (pattern-match the file's existing render helpers; pass new props `showId="show-1"` + a vi.fn async acceptAction everywhere):

```tsx
it("acceptable row renders Accept with hidden showId+changeLogId=entry.id payload", ...);
// query within the row: getByTestId("change-feed-accept"); assert hidden inputs
// name=showId value=show-1, name=changeLogId value=<entry.id> (NOT entry.changeLogId)
it("acceptable+undoable crew row renders BOTH Accept and Undo", ...);
it("acknowledged row renders Accepted tag (testid change-feed-accepted-tag), no Accept", ...);
it("accepted-then-undone row: Undone badge AND Accepted tag co-render", ...);
it("neither: no Accept, no tag (default fixtures from Task 1)", ...);
```

Anti-tautology: assert the accept form's hidden `changeLogId` equals the fixture's `entry.id` where the fixture ALSO carries a different `changeLogId` value (e.g. `id: "log-1", changeLogId: "log-1"` is wrong — use distinct sentinel `id: "row-id-1"` with `action: "none"` variant so a mixed-up implementation fails).

- [ ] **Step 2: Run** — FAIL (props missing / testid absent).
- [ ] **Step 3: Implement.** Add props; inside the row, after the existing Undo affordance block:

```tsx
{entry.acceptable ? (
  <AcceptChangeButton
    acceptAction={acceptAction}
    hiddenFields={{ showId, changeLogId: entry.id }}
  />
) : null}
{entry.acknowledgedAt !== null ? (
  <span
    data-testid="change-feed-accepted-tag"
    title="You accepted this change."
    className="inline-flex items-center rounded-pill bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-text-subtle"
  >
    Accepted
  </span>
) : null}
```

(Tag placement: same flex row as `ChangeFeedBadge`; match the badge's markup idiom in-file. Tokens = muted badge shape, `ChangeFeedBadge.tsx:33-43`. Tag renders REGARDLESS of status — spec §4.1 total rule.)

- [ ] **Step 4: Run** file — PASS (`pnpm typecheck` will fail until 3b/3c complete — expected; do NOT commit yet).

#### Task 3b: `ChangesFeed` — Accept-all header + "Sheet changes" heading

**Files:**
- Modify: `components/admin/ChangesFeed.tsx` (heading `:46-47`; header row; props)
- Test: `tests/components/admin/ChangesFeed.test.tsx`, `tests/components/admin/ChangesFeed.a11y.test.tsx:42`

**Interfaces:**
- Consumes: Task 3 `ChangeFeedEntry` props; Task 2 `acceptAllAction`.
- Produces: `ChangesFeed` gains required props `showId: string`, `acceptAction`, `acceptAllAction` (same action type). Task 5 threads them from the page.

- [ ] **Step 1: Failing tests.**

```tsx
it("heading reads Sheet changes; id admin-changes-feed-heading unchanged", ...);
it("Accept all (N) renders iff >=1 acceptable entry; hidden ids = comma-joined acceptable entry ids; hidden showId", ...);
it("zero acceptable entries → no Accept-all control at all (not disabled)", ...);
```

N derived from fixtures (e.g. 3 entries, 2 acceptable → label "Accept all (2)", ids exactly the 2 acceptable ids in feed order — never hardcode a count the fixture doesn't produce). Update `a11y.test.tsx:42` expectation to `"Sheet changes"`.

- [ ] **Step 2: Run** both files — FAIL.
- [ ] **Step 3: Implement.** Heading text → `Sheet changes`. Compute `const acceptableIds = entries.filter((e) => e.acceptable).map((e) => e.id);` and in the header row:

```tsx
{acceptableIds.length > 0 ? (
  <AcceptChangeButton
    acceptAction={acceptAllAction}
    hiddenFields={{ showId, ids: acceptableIds.join(",") }}
    label={`Accept all (${acceptableIds.length})`}
  />
) : null}
```

Thread `showId` + `acceptAction` into each `ChangeFeedEntry`. No confirm gate (spec §4.2 parity with strip Accept-all).

- [ ] **Step 4: Run** both files — PASS (typecheck still red until 3c — expected).

#### Task 3c: Page wiring + build proof

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx:832-840`
- Test: `tests/admin/showPageFeed.test.tsx`, `tests/admin/feedTelemetry.test.tsx`, `tests/app/admin/perShowPage.test.tsx` (fixtures already field-complete from Task 1; page-render assertions may need the new controls acknowledged)

**Interfaces:**
- Consumes: everything above. Server actions passed as DIRECT refs (RSC rule — never inline closures).

- [ ] **Step 1: Failing test.** In `showPageFeed.test.tsx` (page-level, mocked `readShowChangeFeed`): make one mocked entry `acceptable: true` and assert the rendered page contains `change-feed-accept`; assert heading "Sheet changes".
- [ ] **Step 2: Run** — FAIL (props not wired).
- [ ] **Step 3: Implement.** At `page.tsx:832`:

```tsx
<ChangesFeed
  entries={feed.entries}
  truncated={feed.truncated}
  now={now}
  showId={show.id}
  undoAction={undoChangeAction}
  approveAction={mi11ApproveAction}
  rejectAction={mi11RejectAction}
  acceptAction={acceptChangeAction}
  acceptAllAction={acceptAllAction}
/>
```

(import the two actions alongside the existing `:48` action imports).

- [ ] **Step 4: Run** the three page-level test files + ALL Task-3 test files + `pnpm typecheck` — PASS. Then `pnpm build` — MUST pass (Server→Client action wiring + client-boundary import chain are build-only failures; lessons: RSC direct-ref rule, no client value-import of server modules).
- [ ] **Step 5: Commit (single commit for 3a+3b+3c)** `feat(admin): Accept/Accept-all + Accepted tag + Sheet changes heading on per-show feed`

### Task 4: Help copy

**Files:**
- Modify: `app/help/admin/dashboard/page.mdx:41,53`, `app/help/admin/per-show-panel/page.mdx:12,14` (+ any other "Changes feed" refs — re-grep at edit time)

- [ ] **Step 1: Write the failing test** — new `tests/help/sheetChangesCopy.test.ts` pinning the rename contract in the two help pages:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dash = readFileSync("app/help/admin/dashboard/page.mdx", "utf8");
const panel = readFileSync("app/help/admin/per-show-panel/page.mdx", "utf8");

describe("help copy names the per-show feed 'Sheet changes' (spec 2026-07-15 §5)", () => {
  it("no stale 'changes feed' copy survives in ANY casing (only 'Sheet changes feed' is legal)", () => {
    // Strip every legal occurrence first, then forbid the phrase case-insensitively —
    // catches "Changes feed", "The changes feed" (the existing per-show h2), "changes feed".
    const stripLegal = (t: string) => t.replaceAll(/sheet changes feed/gi, "");
    expect(stripLegal(dash)).not.toMatch(/changes feed/i);
    expect(stripLegal(panel)).not.toMatch(/changes feed/i);
  });
  it("both pages use the new name; anchor id stays stable", () => {
    expect(dash).toMatch(/Sheet changes/);
    expect(panel).toMatch(/Sheet changes/);
    expect(panel).toContain('id="changes-feed"'); // anchor NEVER renamed
  });
  it("per-show panel documents the Accept affordance", () => {
    expect(panel).toMatch(/Accept all/);
    expect(panel).toMatch(/Accepted/);
  });
});
```

(Adjust the stale-copy regex to the exact phrases Step 2's grep enumerates — e.g. `\bChanges feed\b` case-sensitive, since "sheet changes feed" contains "changes feed" lowercase. Failure mode caught: a later copy edit reverting to the old name, or the anchor id getting renamed with the heading.)

- [ ] **Step 2: Run** `pnpm vitest run tests/help/sheetChangesCopy.test.ts` — FAIL (old copy present, new absent). Also `rg -n -i "changes feed" app/help/` to enumerate every live ref (spec counted 3 + h2; re-count now).
- [ ] **Step 3: Implement.** Update display copy to "Sheet changes feed" / heading "The Sheet changes feed" — anchors (`id="changes-feed"`) and hrefs unchanged. Mention the new Accept affordance in per-show-panel copy in ONE sentence: "Auto-applied changes you haven't reviewed yet show an **Accept** button (and **Accept all** in the header); accepted entries keep a quiet Accepted tag." Plain language, no code tokens.
- [ ] **Step 4: Run** `pnpm vitest run tests/help` — new test PASSES + help meta-tests green (coverage/asset-existence walkers; no screenshot manifest change — no captured route renders the feed heading, spec §5).
- [ ] **Step 5: Commit** `docs(help): Sheet changes rename + Accept affordance copy (pinned by copy test)`

### Task 5: Gates + close-out sweeps

- [ ] **Step 1: Class sweeps.** `rg -n '"Changes"' tests/ components/ app/` (any remaining display-text pin); `rg -ln "readShowChangeFeed" tests/` (hand-rolled mocks of the feed return missing new fields); `rg -n "change-feed-accept" tests/` (companion-file check — memory: env-bound/e2e tests excluded from `pnpm test`).
- [ ] **Step 2: Full local gates.** `pnpm test` (FULL suite — scoped gates miss chokepoint regressions), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` (if not already green in Task 5), e2e `admin-changes-feed-layout.spec.ts` if runnable locally (selector `/changes/i` tolerant — verify).
- [ ] **Step 3: Impeccable dual-gate** (invariant 8): `/impeccable critique` + `/impeccable audit` on the FULL affected UI surface: `components/admin/ChangeFeedEntry.tsx`, `components/admin/ChangesFeed.tsx`, `app/admin/show/[slug]/page.tsx` (page wiring diff — `app/` non-api is UI surface per invariant 8), and the two help mdx pages. P0/P1 fixed or `DEFERRED.md`. **Record every finding + disposition in `docs/superpowers/plans/2026-07-15-feed-disposition-accept/HANDOFF.md` §12** (create the handoff doc with a §12 findings table — this feature's close-out doc; invariant 8 requires the recorded dispositions, not just the passing runs).
- [ ] **Step 4:** Whole-diff Codex adversarial review (fresh-eyes, REVIEWER ONLY) → APPROVE.
- [ ] **Step 5: Ship + terminal verification.** Fetch/rebase onto origin/main if it moved; push; `gh pr create`; watch checks via PR NUMBER (`gh pr checks <PR#> --watch`) and confirm `mergeStateStatus == CLEAN`; `gh pr merge <PR#> --merge`; then `git checkout main && git pull --ff-only` in the MAIN checkout and verify `git rev-list --left-right --count main...origin/main` prints `0	0`. Pipeline is not done at remote merge — the local-main fast-forward check is the terminal gate.

## Self-review notes

- Spec coverage: §2→T1, §3→T2, §4.1→T3, §4.2→T4+T5, §5→T4+T6, §6.1-6.7→T1-T7 test steps. No gaps found.
- Type consistency: action type = `(prev: AcknowledgeChangesResult | null, formData: FormData) => Promise<AcknowledgeChangesResult>`; `AcceptButtonResult` is structurally identical (`AcceptChangeButton.tsx:26` comment) so direct prop pass is legal — used consistently T2-T5.
- Anti-tautology: T1 derives ack timestamp from stored DB value; T3 uses distinct id sentinels; T4 derives N/ids from fixtures.

# Modal State Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every static non-happy-path state of the published show modal reachable in the dev attention-gallery switcher (spec `docs/superpowers/specs/2026-07-22-modal-state-coverage-design.md`, APPROVED at Codex R12).

**Architecture:** Five new tier-2-only scenario fields (`changeLog`, `feedNull`, `fixture`, `ignoreWarningIndexes`, `landing`) flow through one mapping (`applyFixture`) into the existing `buildGallerySnapshot`/`buildGalleryModalData` pair; the change-log half of the production feed shaper is extracted pure (`shapeChangeFeed`) and reused; 36 new tier-2 scenarios exercise the states. The spec's §3.2 derivation-parity table and §4 guard matrix are the binding contracts.

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + jsdom, Playwright dev-build project (:3001).

## Global Constraints

- Spec is canonical; §1.1 do-not-relitigate rows bind (99+ pill, `sheetLinkAbsent`, staged-only callout all DESCOPED — do not implement).
- All new scenario fields are tier-2-only; materialize untouched (`lib/dev/materialize/plan.ts:60` already rejects non-tier-3).
- Invariant 8: `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts` + `components/admin/dev/AttentionModalSwitcher.tsx` are UI surfaces — impeccable critique + audit run on the diff (Task 8).
- Commit per task, `--no-verify`, conventional commits.
- No `Math.random`/`Date.now` in fixtures — deterministic index-derived values; times derive from `GALLERY_NOW`.
- Every §4 guard row gets a validation test (Task 2); every §3.2 parity row gets a walker assertion (Task 3).

## Meta-test inventory (writing-plans mandate)

- EXTENDS `tests/dev/attentionScenariosValidate.test.ts` (all §4 arms), `tests/dev/attentionScenariosIndex.test.ts` (no-tier-1/3 carrier pins for the five new fields), `tests/dev/attentionScenariosTier2.test.ts` (roster pins), `tests/app/admin/attentionModalGallery.serverProps.test.ts` (grouping/visibility/shareToken).
- CREATES tests/sync/feed/shapeChangeFeed.test.ts (new file), tests/dev/publishedModalFixtureKnobs.test.tsx (new file; jsdom pragma; incl. the §3.2 parity-table walker).
- Advisory locks: N/A — no DB mutation paths. Supabase call-boundary registry: N/A — `shapeChangeFeed` is pure; `readShowChangeFeed`'s calls unchanged. Mutation-surface observability: N/A — no new mutation surfaces. §12.4: N/A — no new codes.

---

### Task 1: Extract `shapeChangeFeed` (pure production shaper)

**Files:**
- Create: lib/sync/feed/shapeChangeFeed.ts (new file)
- Modify: `lib/sync/feed/readShowChangeFeed.ts`
- Test: tests/sync/feed/shapeChangeFeed.test.ts (new file)

**Interfaces (Produces):**
```ts
// lib/sync/feed/shapeChangeFeed.ts
export type ChangeLogRow = { /* moved verbatim from readShowChangeFeed.ts:71-82 */ };
export const CREW_DOMAIN_CHANGE_KINDS: ReadonlySet<string>; // moved
export function isCrewDomainChangeKind(kind: string): boolean; // moved
export function shapeChangeFeed(logRows: ChangeLogRow[], holdRows: HoldRow[]): FeedEntry[];
```

- [ ] **Step 1: failing test** — tests/sync/feed/shapeChangeFeed.test.ts (new file):

```ts
import { describe, expect, test } from "vitest";
import { shapeChangeFeed, type ChangeLogRow } from "@/lib/sync/feed/shapeChangeFeed";
import type { HoldRow } from "@/lib/sync/feed/shapeHoldEntry";

const log = (over: Partial<ChangeLogRow>): ChangeLogRow => ({
  id: "log-1",
  occurred_at: "2026-07-01T12:00:00.000100Z",
  status: "applied",
  summary: "Change",
  entity_ref: null,
  change_kind: "field_changed",
  individually_undoable: false,
  source: "auto_apply",
  acknowledged_at: null,
  ...over,
});
const hold: HoldRow = {
  id: "hold-1",
  entity_key: "crew_email:dana",
  held_value: { email: "old@example.test" },
  proposed_value: { disposition: "email_change", name: "Dana Reed", email: "new@example.test" },
  base_modified_time: "2026-07-01T12:00:00.000200Z",
  created_at: "2026-07-01T12:00:00.000200Z",
};

describe("shapeChangeFeed", () => {
  test("acceptable iff auto_apply + applied + ack null", () => {
    const [a] = shapeChangeFeed([log({})], []);
    expect(a?.acceptable).toBe(true);
    const [b] = shapeChangeFeed([log({ source: "mi11_approve" })], []);
    expect(b?.acceptable).toBe(false);
    const [c] = shapeChangeFeed([log({ acknowledged_at: "2026-07-01T13:00:00Z" })], []);
    expect(c?.acceptable).toBe(false);
  });
  test("undo action iff applied + crew-domain kind + individually_undoable", () => {
    const [e] = shapeChangeFeed(
      [log({ change_kind: "crew_renamed", individually_undoable: true, source: "mi11_approve" })],
      [],
    );
    expect(e?.action).toBe("undo");
    expect(e && "changeLogId" in e && e.changeLogId).toBe("log-1");
    const [f] = shapeChangeFeed([log({ change_kind: "crew_renamed" })], []);
    expect(f?.action).toBe("none");
  });
  test("microsecond merge: hold 100us newer than log sorts first", () => {
    const entries = shapeChangeFeed([log({})], [hold]);
    expect(entries.map((e) => e.id)).toEqual(["hold-1", "log-1"]);
    expect(entries.every((e) => !("sortKey" in e))).toBe(true);
  });
  test("acknowledgedAt survives non-applied statuses", () => {
    const [e] = shapeChangeFeed(
      [log({ status: "superseded", acknowledged_at: "2026-07-01T13:00:00Z" })],
      [],
    );
    expect(e?.status).toBe("superseded");
    expect(e?.acknowledgedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: run — FAIL** (`module not found`). `pnpm vitest run tests/sync/feed/shapeChangeFeed.test.ts`
- [ ] **Step 3: implement** — create lib/sync/feed/shapeChangeFeed.ts (new file); MOVE (not copy) from `readShowChangeFeed.ts`: the `ChangeLogRow` type, `CREW_DOMAIN_CHANGE_KINDS`, `isCrewDomainChangeKind`, the log-row mapping block (`lib/sync/feed/readShowChangeFeed.ts:154-183`) and the merge sort (`lib/sync/feed/readShowChangeFeed.ts:185-193`), composed as one pure function ending in the `sortKey`-strip map. Import `shapeHoldEntry`, `sortKeyFromRaw`, `toIso`, `UNDOABLE_CHANGE_KINDS` as the reader does today. Then refactor `readShowChangeFeed` to call `shapeChangeFeed(logData ?? [], holdData ?? [])` and RE-EXPORT `isCrewDomainChangeKind` and `ChangeLogRow` from `readShowChangeFeed.ts` (existing import path `tests/sync/feed/isCrewDomainChangeKind.test.ts:1` must keep passing unmodified).
- [ ] **Step 4: run — PASS** + existing feed suites: `pnpm vitest run tests/sync/feed/`
- [ ] **Step 5: commit** — `refactor(sync): extract pure shapeChangeFeed from readShowChangeFeed`

### Task 2: Scenario schema + validation arms

**Files:**
- Modify: `lib/dev/attentionScenarios/types.ts`, `lib/dev/attentionScenarios/validate.ts`
- Test: `tests/dev/attentionScenariosValidate.test.ts` (extend), `tests/dev/attentionScenariosIndex.test.ts` (extend)

**Interfaces (Produces):** the five spec §3.0 fields verbatim — `changeLog?: ScenarioChangeLogRow[]`, `feedNull?: boolean`, `fixture?: ScenarioFixture`, `ignoreWarningIndexes?: number[]`, `landing?: ScenarioGroupId` on `AttentionScenario`; exported types `ScenarioChangeLogRow` (spec §3.0 shape: `occurred_at`, `status` 5-union, `summary`, `entity_ref`, `change_kind: string`, `individually_undoable`, `source` 4-union, `acknowledged_at`) and `ScenarioFixture` (spec §3.0: lifecycle knobs incl. `checkedAbsent`, `alertFlash`, `clientAbsent`; `empty` 8-key array; `volumes` `{crew, rooms, hotels, schedule, diagramImages, packlist, agenda, agendaLinks, hotelGuests}`; `share`). `landing` imports `ScenarioGroupId` from `galleryModalTypes` — verify no client/server boundary issue (it is a type-only import).

- [ ] **Step 1: failing tests** — one `expect(validateScenario(...)).toContain(...)` per §4 guard row. Full inventory (each is a test case; scenario base = `{ id: "t2-guard-x", tier: 2, label: "g", alerts: [], holds: [] }`):
  0. per-field SHAPE checks (§3.7 "shape-checked" mandate), each with a failing negative case: `changeLog` non-array / row non-object / blank `summary` / `entity_ref` neither string nor null / non-boolean `individually_undoable`; non-boolean `feedNull`; non-object `fixture`; non-boolean lifecycle knobs; `lastSyncStatus` neither string nor null; `empty` member outside the 8-key union; `volumes.schedule` not `"overflow"`; `volumes.agenda` not `"overflow"`; malformed `packlist` (missing/non-integer `cases`/`itemsPerCase`); malformed `share` (missing `linkActive: true` literal / non-number `crewEmails`); `ignoreWarningIndexes` non-array or non-integer members
  1. any new field on tier 1 or 3 → `"tier 2 only"`
  2. `changeLog` bad `status`/`source` → error; blank `change_kind` → error; unparseable `occurred_at` or non-null unparseable `acknowledged_at` → error (parseability check per `validate.ts:141-143` template)
  3. `changeLog` length > 50 → error
  4. `feedNull` + `holds.length > 0` / non-empty `changeLog` / `feedTruncated: true` → error; `feedNull` + `changeLog: []` → NO error
  5. `fixture: {}`, `empty: []`, `volumes: {}`, knob = base default (`archived: false`, `published: true`, `finalizeOwned: false`, `isLive: false`, `lastSyncStatus: "ok"`, false absence flags, `neverSynced: false`, `checkedAbsent: false`, `alertFlash: false`) → error
  6. `volumes` value 0 or negative or non-integer → error; `crew: 6` / `rooms: 3` / `hotels: 2` (base counts) → error
  7. `empty` + `volumes` same section → error; duplicate `empty` entries → error
  8. `archived: true` + `published: true` → error; `archived: true` + `finalizeOwned: true` → error
  9. `isLive: true` + (`published: false` | `archived: true` | `datesAbsent: true`) → error
  10. `datesAbsent: true` + `volumes.schedule` → error
  11. `neverSynced: true` + any explicit `lastSyncStatus` (incl. null) or `checkedAbsent: true` → error
  12. `checkedAbsent: true` + explicit `lastSyncStatus !== "ok"` → error
  13. `empty:["agenda"]` + (`volumes.agenda` | `volumes.agendaLinks`) → error; `volumes.agenda` + `volumes.agendaLinks` → error
  14. `volumes.diagramImages` without diagrams-anchored alert → error
  15. `ignoreWarningIndexes` out of range / duplicate / target lacking non-blank `rawSnippet` / fingerprint colliding with an active warning → error
  16. `share.crewEmails` negative / non-integer / > 500 → error; `share.crewEmails >= 1` + `empty:["crew"]` → error (0 legal); `share.crewEmails` > `volumes.crew` when both set → error; `share.crewEmails >= 1` + effective roster > 500 → error; `share.linkActive` + (`published: false` | `archived: true`) → error
  17. `alertFlash: true` with zero surviving derived alert items → error (probe via `deriveScenarioAttention` — import from `lib/dev/deriveScenarioAttention`; NOTE: this makes validate depend on derivation; if that import creates a cycle, hoist the probe into a `validateScenarioDerived` second-phase called by the same test entry — decide at implementation, document choice inline)
  18. `landing` not in `GROUP_ORDER` → error
  19. structural index walk (in `tests/dev/attentionScenariosIndex.test.ts`, WRITTEN IN THIS STEP): no tier-1/3 scenario in `ALL_SCENARIOS` carries any of the five new fields
- [ ] **Step 2: run — FAIL.** `pnpm vitest run tests/dev/attentionScenariosValidate.test.ts`
- [ ] **Step 3: implement** — add fields to `types.ts` with the spec §3.0 doc comments; add `validate.ts` arms mirroring the `degraded`/`feedTruncated` pattern plus the cross-field guards above. Fingerprints via `warningFingerprint` (`lib/dataQuality/warningFingerprint.ts:9`).
- [ ] **Step 4: run — PASS** (including the index-walk test from Step 1).
- [ ] **Step 5: commit** — `feat(admin): tier-2 scenario schema for modal-state coverage (changeLog, feedNull, fixture, ignoreWarningIndexes, landing)`

### Task 3: Fixture knobs (`applyFixture`) + base enrichment + parity walker

**Files:**
- Modify: `lib/dev/publishedModalFixture.ts`
- Test: tests/dev/publishedModalFixtureKnobs.test.tsx (new file — `.tsx` with `// @vitest-environment jsdom` pragma on line 1: it RTL-renders the diagrams sub-block; Vitest defaults to node)

**Interfaces (Produces):**
```ts
export type AppliedFixture = {
  snapshot: ShowReviewSnapshot;
  // archived/published/finalizeOwned/isLive/lastSyncedAt/lastCheckedAt/lastSyncStatus/
  // title/crewEmails/pickerCrew/alertId - AND, when the roster exceeds 500, a `data`
  // transform blanking `previewRoster` (the over-cap rule lives HERE, in the single
  // mapping, never applied separately by the caller).
  dataOverrides: Partial<GalleryModalData>;
};
export function applyFixture(
  base: ShowReviewSnapshot,
  fixture: ScenarioFixture | undefined,
  opts: { firstSurvivingAlertId?: string },
): AppliedFixture;
```

- [ ] **Step 1: failing tests** — tests/dev/publishedModalFixtureKnobs.test.tsx (new file):
  - **Parity walker (spec §3.2 table, one assertion per row):** for each parity row build a knob scenario, run `applyFixture`, and assert the gallery value equals the production derivation applied to the same snapshot: `crewEmails` = email-bearing rows when roster ≤ 500 else `[]`; `previewRoster` blanked iff roster > 500; `pickerCrew` = `archived ? [] : rows.map({id,name,role})`; `isLive` knob ⇒ dates spanning `GALLERY_NOW` and `isShowLiveOnDate(dates, "2026-07-01") === true`; `titleAbsent` ⇒ `title === null` AND snapshot `show.title === ""`; `finalizeOwned` forced false under archived (guard-tested in Task 2; here assert applied output for `archived: true` has `published: false, finalizeOwned: false`); `clientAbsent` ⇒ snapshot `client_label === ""`; `neverSynced` ⇒ both timestamps null; `checkedAbsent` ⇒ `lastCheckedAt === null`, `lastSyncedAt` kept; `lastSyncStatus` knob ⇒ override carries exactly the knob value; `openSheetHref` ⇒ ALWAYS equals `buildSheetDeepLink(dfid)` where the test narrows locally (`const raw = snapshot.show.drive_file_id; const dfid = typeof raw === "string" ? raw : null;` — the adapter's `str` helper is private/unexported, do NOT import it); no knob can null the result; `archived`/`published` ⇒ snapshot `show.archived`/`show.published` and the modal overrides agree (both halves from one mapping); `feed` parity rows (feedNull ⇒ null; changeLog entries ⇒ `shapeChangeFeed` output) are walked in TASK 4's suite, not here — their wiring lands in Task 4 and asserting them in Task 3 would leave Task 3 red at commit time. The Task 3 walker covers every OTHER parity row.
  - **Empty keys:** each of the 8 keys empties its collection (`venue` → null; `billing` → `coi_status: null`; `agenda` → `agenda_links: []`); adapter output confirms the branch (e.g. `buildPublishedSectionData(snapshot).crewMembers.length === 0`).
  - **Volumes:** `crew: 31` ⇒ 31 rows (6 base + 25 generated, deterministic names); `rooms: 21`; `hotels: 13`; `hotels: 1` ⇒ 1; `hotelGuests: 7` ⇒ hotel 1 names length 7; `schedule: "overflow"` ⇒ `run_of_show` has 16 ros-only ISO days, days 1-15 with 8 agenda-kind entries, day 16 only strike+loadout; `diagramImages: 13` ⇒ 13 `PersistedEmbeddedImage`-shaped entries (string `objectId`/`mimeType`/`sheetTab` + `sheetsRevisionId`/`embeddedFingerprint`/`recovery_disposition` + snapshot path) surviving `stagedDiagramGuards`; `packlist: {cases: 13, itemsPerCase: 9}` ⇒ `pull_sheet` shape matches the adapter's `PullSheetCase`; `agendaLinks: 7` ⇒ 7 links with grammar-conforming labels (`AGENDA 1 - Breakout`, …); `agenda: "overflow"` ⇒ base link `extracted` yields dropped counters, asserted strict-safely:

```ts
const baseline = buildPublishedSectionData(snapshot, { slug: "gallery" }).agendaBaseline; // slug arg REQUIRED
const first = baseline[0];
if (!first || first.block === null) throw new Error("agenda overflow fixture produced no block");
expect(first.block.droppedSessions).toBeGreaterThan(0);
expect(first.block.droppedDays).toBeGreaterThan(0);
expect(first.block.droppedTracks).toBeGreaterThan(0);
```

  - **Diagram grid cap:** RTL-render the published diagrams sub-block with the `diagramImages: 13` snapshot and assert EXACTLY 12 tiles render before the note plus the "+1 more" text (spec §3.4).
  - **Share:** `share: {linkActive: true, crewEmails: 60}` ⇒ exactly 60 email-bearing snapshot rows and derived `crewEmails.length === 60`; `buildCrewLinkMailtos({emails, url: "https://x/show/gallery/tok", showTitle: "T"}).length > 1`; `crewEmails: 3` ⇒ 1 batch; `crewEmails: 0` + `empty:["crew"]` ⇒ `crewEmails: []`.
  - **Base enrichment (spec §3.6 tail):** default snapshot now renders dress code + one boolean chip (event anchor active), venue loading dock, transport loadout/notes/route legs, room 1 `floor` — assert via adapter output branches.
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement** — `applyFixture` as the single mapping; deterministic generators (`genCrew(i)`, `genRoom(i)`, `genHotel(i)`, `genEmail(i)` fixed-length ~64 chars, `genAgendaLink(i)` grammar labels, `genDiagramImage(i)`, `genPackCase(i)`, schedule builder); base-fixture enrichment per spec (loadingDock, dress_code + `polling: "Yes"` boolean key on event-anchor snapshots, transport loadout/notes/`schedule` legs, room floor). `buildScenarioModalData` consumes `applyFixture` in Task 4 — here keep `buildGallerySnapshot`/`buildGalleryModalData` signatures backward-compatible (existing callers unchanged).
- [ ] **Step 4: run — PASS** + `pnpm vitest run tests/dev/` green.
- [ ] **Step 5: commit** — `feat(admin): applyFixture knob mapping + rich-base enrichment for gallery fixture`

### Task 4: Feed + modal-data wiring

**Files:**
- Modify: `lib/dev/deriveScenarioAttention.ts`, `lib/dev/buildScenarioModalData.ts`
- Test: `tests/dev/deriveScenarioAttention.test.ts` (extend), `tests/dev/buildScenarioModalData.test.ts` (exists — extend; verified pre-draft). The Task 3-deferred feed parity rows (feedNull ⇒ `feed: null`; changeLog entries ⇒ `shapeChangeFeed` output) land HERE in Step 1.

Contracts (spec §3.1, R11-final): `buildScenarioFeed` returns `null` exactly when no holds AND no changeLog; otherwise `{ entries: shapeChangeFeed(toChangeLogRows(s), toHoldRows(s)), truncated: s.feedTruncated === true }` with synthesized ids `${s.id}-log-${i}`. `buildScenarioModalData`: `feedNull` ⇒ explicit `feed: null` override; `ignoreWarningIndexes` ⇒ fingerprint set passed to `buildSectionWarningModel`; fixture ⇒ `applyFixture` output feeds both halves; `alertFlash` ⇒ `alertId` = first SURVIVING derived item's alert id. Attention items: only hold entries feed `deriveAttentionItems` (log rows carry `action: "none"` and are filtered by `toHoldItem` anyway — pass the merged feed, pin with a test that a changeLog-only scenario derives zero items).

- [ ] **Step 1: failing tests** — changeLog-only scenario: feed has N entries, `deriveScenarioAttention` returns `[]`; holds+changeLog merge newest-first; **derivation-parity (the deferred §3.2 feed row, anti-tautology):** `buildScenarioFeed(s)!.entries` DEEP-EQUALS `shapeChangeFeed(toChangeLogRows(s), toHoldRows(s))` for a mixed holds+changeLog scenario (export or re-derive the row builders in the test; count/order alone is insufficient — a divergent mapper must fail); `feedNull` scenario ⇒ `buildScenarioModalData(...).feed === null`; no-feed scenario ⇒ base empty feed object; ignored indexes ⇒ `bySection` model has ignored entries; `alertFlash` scenario ⇒ `data.alertId === "<id of surviving alert>"`; every other scenario ⇒ `alertId === null`.
- [ ] **Step 2: run — FAIL.** **Step 3: implement.** **Step 4: run — PASS** + full `tests/dev/`.
- [ ] **Step 5: commit** — `feat(admin): scenario feed carries change-log rows; feedNull/ignored/alertFlash wiring`

### Task 5: Grouping, visibility, shareToken threading (UI surface)

Pre-code mechanical UI checklist (run BEFORE writing code): this task adds NO user-visible copy, tap targets, color tokens, or type classes — data routing and provider identity only. If that changes mid-implementation, apply the canonical classes (`min-h-tap-min`, `text-xs/relaxed`, `text-subtle`, no em-dash) before the impeccable gate.

**Files:**
- Modify: `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts`, `lib/dev/galleryModalTypes.ts`, `components/admin/dev/AttentionModalSwitcher.tsx`
- Test: `tests/app/admin/attentionModalGallery.serverProps.test.ts` (extend), `tests/components/admin/dev/attentionModalSwitcher.test.tsx` (extend)

- [ ] **Step 1: failing tests**
  - `isModalVisible`: cut-only alert + effective fixture / non-empty changeLog / feedNull ⇒ visible; cut-only alert alone ⇒ still excluded "cut".
  - `scenarioGroup`: fixture-only + `landing` ⇒ landing; landing + real sections ⇒ real group; **distinguisher:** agenda-routed warning + `empty:["agenda"]` ⇒ `warnings` (raw `sectionForWarning` would say `agenda`); **anchor-absent:** `T2_ANCHOR_ABSENT` ⇒ `overview` (mirrors the modal's unavailable-anchor redirect).
  - `GallerySwitcherScenario.shareToken`: set for `share.linkActive` scenarios, null otherwise; type stays function-free (compile guards in `galleryModalTypes.ts`).
  - Switcher: `ShareTokenProvider` receives `key={current.id}` and `initialToken={current.shareToken ?? null}`. The test must exercise the two transitions that PASS only with the key (the provider reconciles same-epoch seed changes, `app/admin/show/[slug]/ShareTokenContext.tsx:44-69`): (a) active-token scenario → null-token scenario asserts the share URL affordance is GONE (an un-keyed provider would preserve the old token); (b) within scenario A advance the held token to a higher epoch (via the context's rotate path or by seeding a higher `initialEpoch`), switch to scenario B, and assert B renders B's token — only a true remount resets the epoch-held value.
- [ ] **Step 2: run — FAIL.** **Step 3: implement** — visibility arm; `scenarioGroup` rendered-section fallback (compute rendered ids from the scenario's built data via `renderedSectionIds`) + effective-anchor remap for alert items (reuse `anchorsWantedFor`/`ATTENTION_ROUTES[code]?.anchor`: anchored item whose flag is absent groups `overview`); `shareToken` field + partition stamping (fixed token literal, e.g. `"gallery-share-token"`); switcher provider keying.
- [ ] **Step 4: run — PASS.** **Step 5: commit** — `feat(admin): switcher grouping fallbacks, visibility carriers, per-scenario share token`

### Task 6: The 36-scenario roster + pins

**Files:**
- Modify: `lib/dev/attentionScenarios/tier2.ts`
- Test: `tests/dev/attentionScenariosTier2.test.ts` (extend), `tests/app/admin/attentionModalGallery.serverProps.test.ts` (extend — enlarged-roster grouping assertions WRITTEN IN STEP 1, red first; no snapshot file exists, only ordinary assertions), `tests/e2e/attention-modal-gallery.spec.ts` (extend — §5 e2e specs, written red in Step 1)

Add the spec §3.6 roster verbatim: 3 changes-class (`t2-changelog-history` 11-row matrix + 1 hold; `t2-hold-dispositions` 4 holds incl. rename-plain/rename-folded; `t2-feed-infra-error`), 8 lifecycle (`t2-archived`, `t2-unpublished`, `t2-finalizing`, `t2-publishing`, `t2-live-now`, `t2-share-link`, `t2-share-single`, `t2-share-batches`), 10 sync postures, `t2-minimal-header`, `t2-nothing-parsed`, 9 volume/overflow (`t2-overflow-volumes`, `t2-roster-over-cap`, `t2-solo-hotel`, `t2-hotel-guest-stack`, `t2-packlist-overflow`, `t2-agenda-overflow`, `t2-multi-agenda`, `t2-warning-spread`, `t2-alert-deep-link`), `t2-diagram-images`, `t2-attention-extras`, `t2-ignored-warnings`, `t2-all-ignored`. Every literal (row shapes, hold dispositions, warning payloads incl. `blockRef.kind: "crew"` + `autocorrect.subject`) comes from the spec sections cited per scenario; export ids as consts and extend `T2_REQUIRED_IDS`.

- [ ] **Step 1: failing tests (unit pins AND the new e2e specs together)** — the e2e specs from spec §5 are WRITTEN IN THIS STEP, before the roster exists, and their first run FAILS (deep-linking `?scenario=t2-changelog-history` etc. resolves no scenario, so every assertion fails red). Unit pins — per scenario: id present in `tier2Scenarios()`, `validateScenario` clean, and a target-branch assertion (each spec §3.6 "Demonstrates" cell has one pin), e.g.: changelog-history feed length 12 with statuses `{applied×6 (matrix rows 1-5 and 10), rejected×1, undone×2, superseded×2, pending×1 (hold)}` and exactly 3 acceptable + 2 undo actions + 3 acknowledged; hold-dispositions summaries differ between rename-plain and rename-folded; roster-over-cap ⇒ `previewRoster` `[]` + 501 crew rows; attention-extras ⇒ 3 cards under one member via `bySection.crew`; all-ignored ⇒ zero active + 2 ignored; multi-agenda ⇒ 6 visible items with non-null badges; alert-deep-link ⇒ `alertId` matches a surviving item.
- [ ] **Step 2: run — FAIL** (unit pins + serverProps grouping assertions + e2e all red). **Step 3: implement scenarios.** **Step 4: run — PASS**: unit + serverProps, AND the newly authored e2e specs green on a quiet box (`pnpm playwright test tests/e2e/attention-modal-gallery.spec.ts --project=dev-build --grep "<new spec titles>"` — kill any orphaned :3001 first); group walk stays `GROUP_ORDER`-sorted. **Step 5: commit** — `feat(admin): 36 modal-state scenarios (changes feed, lifecycle, sync, empty, caps, ignored)`

### Task 7: e2e green run (specs authored in Task 6 Step 1)

**Files:**
- Test: `tests/e2e/attention-modal-gallery.spec.ts` (already extended in Task 6 — spec §5 list: `t2-changelog-history` 12 entries / 4 badges / "Accept all (3)" / 2 Undo / 3 "Accepted" / 1 gate; `t2-archived` badge + no toggle; `t2-nothing-parsed` "No crew parsed." + "No rooms parsed."; `t2-overflow-volumes` "+1 more people"; `t2-ignored-warnings` disclosure → muted cards; `t2-share-batches` popover multi-batch note; `t2-diagram-images` "Preview unavailable" + "+1 more"; group-select jump with enlarged roster. Deep-link via `?scenario=`; existing hydration helpers, never `networkidle` alone; `locator.evaluate` samplers detach-safe.)

- [ ] **Step 1: full-file regression run on a quiet box** (kill any orphaned :3001 first — known gotcha): `pnpm playwright test tests/e2e/attention-modal-gallery.spec.ts --project=dev-build` — ALL specs green, pre-existing and new together (the new specs already went green inside Task 6 Step 4; this run guards the pre-existing ones against the enlarged roster).
- [ ] **Step 2: commit** any e2e-only stabilization as `test(admin): …` (no product-code changes in this task).

### Task 8: Gates

- [ ] `/impeccable critique` + `/impeccable audit` on the affected diff (invariant 8; the two UI files from Task 5 + any copy), with the canonical v3 setup: the impeccable context load via the LOADED SKILL's base directory (`node <skill-base-dir>/scripts/context.mjs` — the `.claude/skills/...` relative path does not exist in this worktree; the skill announces its base dir when invoked), reading PRODUCT.md + DESIGN.md then register reference read (the skill's product register reference — admin tool register). P0/P1 fixed or DEFERRED.md. Findings + dispositions recorded in this plan's Review record (no milestone handoff doc exists; the plan is the §12-equivalent).
- [ ] Full local: `pnpm test`, `pnpm tsc --noEmit`, `pnpm lint`, `pnpm format:check`, full e2e (quiet box).
- [ ] Commit the gate record ALWAYS (`docs(plan): impeccable gate record` — the findings/dispositions edit to this plan is a tracked-file mutation even on a clean run), plus any gate fixes per type (`fix(admin): …`).

Close-out (pipeline, not plan tasks): whole-diff Codex review → APPROVE; push; PR; real CI green — INCLUDING explicitly dispatching the workflow_dispatch-only e2e gate on the branch and waiting for THAT run with a hard exit status (the PR's automatic checks do NOT run it):

```bash
gh workflow run dev-gate-e2e.yml --ref feat/modal-state-coverage
sleep 10
run_id=$(gh run list --workflow=dev-gate-e2e.yml --branch feat/modal-state-coverage --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$run_id" --exit-status
```
 `gh pr merge --merge`; ff local main; marker done + CronDelete.

## Review record

**Plan R3 (Codex via codex-guard, 2026-07-22): BLOCKING, 5 findings — all repaired.** F1: new e2e specs go green inside Task 6 Step 4 (before its commit); Task 7 is the full-file regression run. F2: drive_file_id narrowed locally (adapter `str` is private). F3: Task 4 gains the deep-equality feed-parity assertion (count/order insufficient). F4: impeccable context load uses the loaded skill's base dir. F5: gate record commit is unconditional.

**Plan R2 (Codex via codex-guard, 2026-07-22): BLOCKING, 8 findings — all repaired.** F1: feed parity rows moved to Task 4 (Task 3 commits green). F2: knobs test is `.tsx` with jsdom pragma; slug arg; `str()` narrowing for drive_file_id. F3: per-field shape-check negative inventory added as guard group 0. F4: index-walk + serverProps grouping + e2e all authored red in Step 1; Task 6 file inventory completed. F5: CI wait pinned to a concrete run id with `--exit-status`. F6: pre-dispatch evidence recorded below. F7: impeccable canonical setup + findings recording + Task 5 pre-code mechanical checklist. F8: Task 4 test file conditional resolved (file exists).

**Pre-dispatch evidence (R2 F6):** `pnpm spec:lint` on spec = 0 hard / on plan = 0 hard (transcripts in session); snippet typecheck: Task 1 test compiles against strict tsconfig (verified constructs: optional-chained tuple destructure, `"sortKey" in e` narrowing); selection wiring verified by reviewer + implementer: both new unit files match `BASE_INCLUDE` (vitest.projects.ts:34), land in the serial project, run in the unconditional PR `unit-suite` (.github/workflows/unit-suite.yml — no path filter); the gallery e2e file matches the `dev-build` Playwright project (playwright.config.ts:80) exercised by the workflow_dispatch `dev-gate-e2e.yml`.

**Plan R1 (Codex via codex-guard, 2026-07-22): BLOCKING, 7 findings — all repaired.** F1: e2e specs now authored red in Task 6 Step 1 (TDD); Task 7 is the green run. F2: parity walker completed (openSheetHref, archived/published mirroring, sync trio, feed row) and `AppliedFixture` owns the previewRoster blanking. F3: provider-remount test exercises the two key-only transitions (active→null; epoch-advanced switch). F4: changelog pin corrected to applied×6 / 12 entries. F5: explicit 12-tile + "+1 more" grid assertion added. F6: close-out explicitly dispatches `dev-gate-e2e.yml` via workflow_dispatch and waits. F7: agenda assertion rewritten strict-safe.

## Self-review record

Self-review (2026-07-22): spec-coverage walk — §3.0→Task 2, §3.1→Tasks 1+4, §3.2/3.3/3.4/3.5→Task 3, §3.6→Task 6, §3.7→Task 5, §4→Task 2 (18 guard groups enumerated), §5→Tasks 1-7, invariant 8→Task 8; no gaps found. Placeholder scan: Task 6 deliberately sources scenario literals from the APPROVED spec's §3.6 matrix (full row-by-row content lives there; duplicating 36 definitions verbatim would drift). Type-consistency: `applyFixture` signature consistent across Tasks 3/4; `shareToken` consistent across Tasks 5/6. Noted risk: Task 2 guard 17's `validate → deriveScenarioAttention` import — checked imports, no cycle (`deriveScenarioAttention` does not import `validate`); decision recorded inline.

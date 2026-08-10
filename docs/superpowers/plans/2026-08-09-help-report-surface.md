# /help/errors Non-Show Report Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/help/errors` trailing `mailto:` CTA with the M8 report flow as a fifth, non-show-scoped, admin-authenticated bug-report surface (`surface: "help"`, `show_id: null`).

**Architecture:** Widen `ReportSurface` to `"crew" | "admin" | "help"` with every modal behavior keyed crew-vs-rest; enforce the non-show invariant server-side in `readRequestBody`; render a hash-scoped `HelpReportCta` client island whose `surfaceId`/`key` bind the attempt to the code context. Spec of record: `docs/superpowers/specs/2026-08-09-help-report-surface-design.md` (APPROVE at review R6).

**Tech Stack:** Next.js 16 server/client components, existing `/api/report` route + `lib/reports/submit.ts`, vitest (jsdom for components), no DB change.

## Global Constraints

- Spec §1.1 is ratified scope — no recurrence dashboard, no new endpoint/table/migration, no §12.4 code changes.
- Invariant 1 (TDD per task), 5 (no raw codes in UI), 6 (conventional commits), 8 (impeccable dual-gate — closeout §12), 11 (this worktree), 12 (ledger marker choreography — Task 7).
- Copy rules: no em dashes, no `--`; curly apostrophes in user-visible copy (DESIGN.md §9).
- Existing four report surfaces keep byte-identical behavior; existing suites are the regression net.
- New tests: `tests/**/*.test.ts(x)` are auto-included by vitest (`vitest.config.ts` BASE_INCLUDE); no workflow path-filter edits needed. jsdom via `// @vitest-environment jsdom` pragma (house pattern).

## Meta-test inventory (declared per docs/agents/writing-plans.md)

- **CREATES:** tests/components/report/_metaSurfaceComparisons.test.ts (Task 2) — crew-vs-rest accept-set scan over `ReportModal.tsx`.
- **EXTENDS:** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — `BACKLOG_GRADUATED` gains `{ id: "BL-HELP-NON-SHOW-REPORT-SURFACE", provenance: "feat/help-report-surface" }` (Task 7); the registry enforces archive-only state and section-scoped branch provenance, which is Task 7's executable RED. Otherwise none: Not applicable registries: Supabase call boundaries (`tests/reports/_metaInfraContract.test.ts` — no new Supabase call sites; route auth mechanism unchanged), advisory-lock topology (no `pg_advisory*` touched), admin-alert catalog (no `admin_alerts.upsert`), sentinel-hiding (no tile rendering). Mutation-source registry: not enrolled — the new guard is a single-file regex scan with its own planted-fixture premise; enrollment cost exceeds its surface.

## Plan-time sweeps (authored AND run, 2026-08-09)

Sweep 1 — `grep -rn 'surface === "admin"\|"admin" === surface' components/shared/ReportModal.tsx components/shared/ReportButton.tsx`:

```
components/shared/ReportModal.tsx:154:  return surface === "admin" ? entry.dougFacing : entry.crewFacing;
components/shared/ReportModal.tsx:324:          ...(surface === "admin" && parsed.github_issue_url
components/shared/ReportModal.tsx:442:    const oppositeSurface: ReportSurface = surface === "admin" ? "crew" : "admin";
components/shared/ReportModal.tsx:589:            {surface === "admin" && success?.kind === "succeeded" && success.github_issue_url ? (
components/shared/ReportModal.tsx:615:            {surface === "admin" && error && error.kind === "code" ? (
components/shared/ReportModal.tsx:653:                  {surface === "admin" && error.kind === "code" ? (
```

Disposition: all six flip in Task 1 (line 154 → `surface === "crew" ? entry.crewFacing : entry.dougFacing`; line 442 → `surface === "crew" ? "admin" : "crew"`; the other four → `surface !== "crew"`). `ReportButton.tsx`: zero hits — nothing to flip.

Sweep 2 — `grep -rn "staged wizard sheet" lib/ components/ app/`:

```
lib/reports/submit.ts:272:  return body.show_id ?? "staged wizard sheet (no show record)";
lib/reports/submit.ts:453:    `**Reported by:** crew member of ... ?? "staged wizard sheet (no show record)"...`
```

Disposition: line 272 branches in Task 4. Line 453 is inside `buildCrewIssueBody`, unreachable for `help` (issue builder selected by `auth.kind === "admin"`, `lib/reports/submit.ts:490-495`) — no change.

Sweep 3 — "tell Eric" pins to update in Task 5: `tests/help/page-errors.test.tsx` (src-scan at :47-48 + rendered-link assertions at :60-63), `tests/help/errors-grouping.test.tsx` (single-CTA cases at :65-69 + header comment). `tests/help/help-prose-pages.test.ts:32` is a comment only — no assertion change.

Sweep 4 — `ReportModal` direct consumers: `components/shared/ReportButton.tsx:129` and `components/shared/CardReportTrigger.tsx:100` (`showId: string` prop, falsy-guard at :68). Both pass strings into the widened `string | null` — no edits. `ReportButton` consumers (`Footer`, `PreviewBanner`, `DataQualityWarningControls`, `StagedReviewCard`) — no edits.

---

## Acceptance criteria

- **AC-1** — `ReportSurface` includes `"help"`; modal behavior keys crew-vs-rest; `showId` nullable end-to-end; help defaults (label/variant/ring) exist. (Spec §2.2.)
- **AC-2** — structural scan: zero `surface === "admin"` comparisons in `ReportModal.tsx`, with executable premise. (Spec §3 test 6.)
- **AC-3** — route accepts `help`+null under admin identity; rejects `help` with `show_id`/`showTitle`/`showSlug`/absent `show_id` at 400 pre-auth. (Spec §2.3, §3 test 3.)
- **AC-4** — help issues render the non-show line, `Surface: help`, and the captured code; wizard copy preserved for admin+null. (Spec §2.4, §3 tests 4-5.)
- **AC-5** — `/help/errors` mounts the hash-scoped CTA, mailto gone; all seven §3-test-2 hash/attempt-binding cases pass. (Spec §2.1, §3 tests 1-2.)
- **AC-6** — master spec carries §13.1 surface 5 + §13.2.1 note; AC-11.11 carries r12. (Spec §2.5.)
- **AC-7** — ledger graduated with marker stripped in the archive commit; M11-I-D-1 closed. (Spec §2.6.)

<!-- tasks: depth=3 -->

### Task 1: Structural crew-vs-rest scan (guard, RED against live code)

**Files:**
- Create: tests/components/report/_metaSurfaceComparisons.test.ts

**Interfaces:**
- Produces: the accept-set guard Task 2 turns green. Written FIRST so its RED is the live production code: the six admin comparisons in Sweep 1 are the failing production lines (genuine RED, not a planted fixture).

- [ ] **Step 1: Write the guard:**

<!-- task: red=`pnpm vitest run tests/components/report/_metaSurfaceComparisons.test.ts` ac=AC-2 -->

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../../_shared/premise";

const SRC = readFileSync("components/shared/ReportModal.tsx", "utf8");
// Fresh literal per use; no g flag (lastIndex statefulness).
const ADMIN_COMPARISON = /surface\s*===\s*"admin"|"admin"\s*===\s*surface/;

describe("ReportModal surface accept-set (spec §2.2)", () => {
  it("scan can fail: planted admin comparison matches", () => {
    premiseHolds(
      "planted fixture must match or the scan below is vacuous",
      ADMIN_COMPARISON.test('x.surface === "admin"'),
    );
  });

  it("has no surface === admin comparisons (crew-vs-rest only)", () => {
    const hits = SRC.match(new RegExp(ADMIN_COMPARISON.source, "g")) ?? [];
    expect(hits, "behavior must key on crew-vs-rest; an admin comparison silently gives help the crew arm").toEqual([]);
  });
});
```

(API verified at plan time: `tests/_shared/premise.ts:36` exports `premiseHolds(description: string, condition: boolean)`; the numeric `premise(description, actual, mustExceed)` form at :26 is not used here.)

- [ ] **Step 2: Pre-dispatch mutants (string-presence guard — all four, record results in the commit message):** (a) empty the regex source → scan passes vacuously → premise case must FAIL; (b) append a suffix to a flipped site (`surface !== "crew!"`) → typecheck fails (not this guard's job — note); (c) re-add `surface === "admin"` in a comment inside ReportModal.tsx → scan FAILS (comment hits are in-scope by design — the accept-set is textual; note this as intended strictness); (d) vary the scanned path to a missing file → readFileSync throws (loud).
- [ ] **Step 3: Run** `pnpm vitest run tests/components/report/_metaSurfaceComparisons.test.ts`. Expected: FAIL listing the six live comparison hits (Sweep 1) — commit the guard RED with an expected-fail annotation is NOT the house pattern; instead keep the guard file staged/uncommitted until Task 2 flips the sites, then commit guard + flips together in Task 2 Step 5 (TDD red-green within one commit pair).
- [ ] **Step 4: Hold the commit** — lands with Task 2 Step 5 (the guard and the flips are one red-green cycle).

### Task 2: ReportSurface widening + crew-vs-rest flips (components)

**Files:**
- Modify: `components/shared/ReportModal.tsx` (types :40, :61; sites 154/324/442/589/615/653)
- Modify: `components/shared/ReportButton.tsx` (`showId` prop, `DEFAULT_LABEL`/`DEFAULT_VARIANT` :66-73, `RingOffset` :62 + `RING_OFFSET_CLASS` :75-82)
- Test: `tests/components/report/ReportModal.test.tsx`, `tests/components/report/ReportButton.test.tsx`

**Interfaces:**
- Consumes: Task 1's guard (red until this task's flips land).
- Produces: `ReportSurface = "crew" | "admin" | "help"`; `ReportModalProps.showId: string | null`; `ReportButtonProps.showId: string | null`; `RingOffset` gains `"info-bg"`; `DEFAULT_LABEL.help = "Report a recurring error"`, `DEFAULT_VARIANT.help = "accent"`. Tasks 3-5 rely on these exact values. This task turns Task 1's guard green.

- [ ] **Step 1: Write failing tests** — add to `tests/components/report/ReportModal.test.tsx` (follow the file's existing harness helpers for mounting/submitting; reuse its fetch-mock pattern):

<!-- task: red=`pnpm vitest run tests/components/report/ReportModal.test.tsx tests/components/report/ReportButton.test.tsx` ac=AC-1 -->

```tsx
describe("help surface (spec §2.2)", () => {
  it("submits show_id: null and spreads autocapture fieldRef", async () => {
    // mount with surface="help", showId={null},
    // autocapture={{ fieldRef: { helpCode: "AMBIGUOUS_EMAIL_BINDING" } }};
    // type a message, submit, then read the fetch body:
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.show_id).toBeNull();
    expect(body.surface).toBe("help");
    expect(body.fieldRef).toEqual({ helpCode: "AMBIGUOUS_EMAIL_BINDING" });
  });

  it("renders admin heading + github link for help surface", async () => {
    // surface="help": heading is "Report this" (crew-vs-rest, :408);
    // after a success response carrying github_issue_url, the
    // report-modal-success-link testid renders (flipped :324/:589).
  });

  it("falls back to crew-facing copy when dougFacing is null (test 5b)", async () => {
    // surface="help", error code ADMIN_SESSION_LOOKUP_FAILED
    // (catalog: dougFacing null, crewFacing set; lib/messages/catalog.ts:3004-3008):
    // rendered error copy equals the catalog's crewFacing string, read from
    // MESSAGE_CATALOG at test time (fixture-derived, not hardcoded).
  });
});
```

And to `tests/components/report/ReportButton.test.tsx`:

```tsx
it("help surface defaults: label, accent variant, info-bg ring offset", () => {
  // render <ReportButton surface="help" surfaceId="x" showId={null} ringOffset="info-bg" />
  // button accessible name "Report a recurring error";
  // className contains "focus-visible:ring-offset-info-bg" (full literal);
  // className contains "bg-accent" (the accent-variant fill class,
  // components/shared/ReportButton.tsx accent branch) so
  // DEFAULT_VARIANT.help = "text" cannot ship while name+ring pass.
});
```

- [ ] **Step 2: Run to verify failure.** Run: `pnpm vitest run tests/components/report/ReportModal.test.tsx tests/components/report/ReportButton.test.tsx`. Expected: RUNTIME failures (vitest strips types — the plan's own closeout note): the help-label assertion fails on `DEFAULT_LABEL` lacking a `help` row, the github-link/success cases fail on the admin-only gates, and the crew-facing-fallback case fails on today's `oppositeSurface` pair — those records and gate lines are the failing production lines. The `"help"`/`null` TYPE violations surface separately in `pnpm typecheck` (run it here too; expected: errors at `components/shared/ReportModal.tsx:40` and `components/shared/ReportModal.tsx:61` until Step 3).
- [ ] **Step 3: Implement.** In `ReportModal.tsx`: union + `showId: string | null` + the six flips from Sweep 1 (exact replacements listed there). In `ReportButton.tsx`: `showId: string | null`; add `help` rows; extend `RingOffset`/`RING_OFFSET_CLASS` with `"info-bg"` → `"focus-visible:ring-offset-info-bg"`.
- [ ] **Step 4: Run to verify pass** — same command, plus `pnpm vitest run tests/reports tests/components/report` (includes Task 1's guard, now green). Expected: PASS.
- [ ] **Step 4b: String-presence mutants (all four, results recorded in the commit message):** for the label/heading/ring-class assertions: (a) empty `DEFAULT_LABEL.help` → label test fails; (b) append a suffix to the label constant → fails; (c) move the ring-offset literal into a comment beside the record → className assertion fails (class absent from output); (d) vary the discriminating parameter (render with `surface="admin"`) → help-label assertion fails; (e) flip `DEFAULT_VARIANT.help` to `"text"` → the `bg-accent` class assertion fails (R2 F3's demonstrated escape).
- [ ] **Step 5: Commit** (includes Task 1's guard file). `feat(report): widen ReportSurface with help; crew-vs-rest modal behavior; nullable showId`

### Task 3: Route — help auth + non-show rejection

**Files:**
- Modify: `app/api/report/route.ts` (`readRequestBody` :32-47, auth branch :121)
- Test: `tests/reports/auth.test.ts`, `tests/reports/nullShow.test.ts`

**Interfaces:**
- Consumes: nothing new (route-internal).
- Produces: `POST /api/report` accepts `{ surface: "help", show_id: null }` under admin identity; rejects (400) `help` with non-null `show_id`, `showTitle`, or `showSlug`.

- [ ] **Step 1: Failing tests** — add to `tests/reports/nullShow.test.ts` (reuse its `makeDeps` harness):

<!-- task: red=`pnpm vitest run tests/reports/nullShow.test.ts tests/reports/auth.test.ts` ac=AC-3 -->

```ts
describe("help surface (spec §2.3)", () => {
  it("accepts help + show_id null under admin identity", async () => {
    // makeDeps with requireAdminIdentity resolving admin@example.com;
    // POST { ...validBody, surface: "help", show_id: null } → 200;
    // submitReport called with auth { kind: "admin" } and body.show_id === null.
  });

  it.each([
    ["non-null show_id", { show_id: "11111111-1111-4111-8111-111111111111" }],
    ["showTitle", { show_id: null, showTitle: "Wrong Show" }],
    ["showSlug", { show_id: null, showSlug: "wrong-show" }],
    ["absent show_id", {}],
  ])("rejects help body with %s (400, before auth)", async (_label, patch) => {
    // POST { ...validBody, surface: "help", ...patch } → 400;
    // requireAdminIdentity NOT called (rejection is in readRequestBody).
  });
});
```

And to `tests/reports/auth.test.ts` (help rides the admin error contract unchanged; both rows mirror the file's existing admin-surface arms):

```ts
// help + requireAdminIdentity throwing plain error → 403 { ok: false }
// help + requireAdminIdentity throwing AdminInfraError → 500 { ok: false, code: <the error's code> }
```

- [ ] **Step 2: Verify RED** — `pnpm vitest run tests/reports/nullShow.test.ts`. Expected: the accept case fails 400 (route line `if (body.surface !== "admin") return null` rejects help — the failing production line).
- [ ] **Step 3: Implement** in `readRequestBody` and the auth branch:

```ts
if (body.show_id === null) {
  // Spec §D4 + help (2026-08-09 spec §2.3): null ONLY for admin and help.
  if (body.surface !== "admin" && body.surface !== "help") return null;
} else if (!isUuidV4(body.show_id)) {
  return null;
}
// help is non-show by contract: reject the complete showLine identity
// field set (2026-08-09 spec §2.3, R2 F2 + R3 F2).
if (
  body.surface === "help" &&
  (body.show_id !== null || body.showTitle != null || body.showSlug != null)
) {
  return null;
}
```

Auth branch: `if (body.surface === "admin" || body.surface === "help") {` — body unchanged. Unknown surfaces keep today's picker-then-admin-fallback path untouched (spec §2.3; pinned by `tests/reports/auth.test.ts:178-184`).

- [ ] **Step 4: Verify GREEN + regression** — `pnpm vitest run tests/reports`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(report): help surface route auth + server-side non-show rejection`

### Task 4: Issue rendering — help show line

**Files:**
- Modify: `lib/reports/submit.ts` (`showLine` :265-273)
- Test: `tests/reports/issueBody.test.ts`

**Interfaces:**
- Produces: help issues render `**Show:** non-show recurrence report (/help/errors)`, `**Surface:** help`, title `Bug report: help`.

- [ ] **Step 1: Failing tests** in `tests/reports/issueBody.test.ts` (reuse its body-builder harness; derive the helpCode from the fixture constant):

<!-- task: red=`pnpm vitest run tests/reports/issueBody.test.ts` ac=AC-4 -->

```ts
describe("help surface issue body (spec §2.4)", () => {
  const HELP_CODE = "AMBIGUOUS_EMAIL_BINDING";

  it("renders non-show line, help surface, and helpCode; no wizard copy", () => {
    // buildAdminIssueBody(adminAuth, { ...body, surface: "help", show_id: null,
    //   fieldRef: { helpCode: HELP_CODE } }, null, undefined)
    // Show line is LINE-ANCHORED (suffix mutant must fail):
    //   expect(body).toMatch(/^\*\*Show:\*\* non-show recurrence report \(\/help\/errors\)$/m)
    //   expect(body).toMatch(/^\*\*Surface:\*\* help$/m)
    // contains HELP_CODE
    // does NOT contain "staged wizard sheet"
  });

  it("keeps wizard copy for admin + null show", () => {
    // surface: "admin", show_id: null → contains "staged wizard sheet (no show record)"
  });
});
```

- [ ] **Step 2: Verify RED** (help case renders wizard copy today — `lib/reports/submit.ts:272` is the failing production line).
- [ ] **Step 3: Implement:**

```ts
return (
  body.show_id ??
  (body.surface === "help"
    ? "non-show recurrence report (/help/errors)"
    : "staged wizard sheet (no show record)")
);
```

- [ ] **Step 4: Verify GREEN + regression** — `pnpm vitest run tests/reports`. Expected: PASS.
- [ ] **Step 4b: String-presence mutants (all four, recorded in the commit message):** (a) empty the help fallback string → help row fails; (b) append a suffix to the fallback string → fails because the assertion is LINE-ANCHORED (see Step 1 snippet: the Show line matches `/^\*\*Show:\*\* non-show recurrence report \(\/help\/errors\)$/m`, not a bare `includes`); (c) put the phrase in a nearby comment and revert the branch → fails (assertion reads builder OUTPUT, not source); (d) vary the discriminator (`surface: "admin"` with the same body) → wizard-copy row proves the branch, help row fails.
- [ ] **Step 5: Commit.** `feat(report): non-show recurrence show line for help surface issues`

### Task 5: HelpReportCta + page swap

**Files:**
- Create: app/help/errors/_components/HelpReportCta.tsx
- Modify: `app/help/errors/page.tsx` (Callout at :99-113; intro line :58-59)
- Test: create tests/help/helpReportCta.test.tsx; update `tests/help/page-errors.test.tsx`, `tests/help/errors-grouping.test.tsx`

**Interfaces:**
- Consumes: Task 1's `ReportButton` (`surface="help"`, `showId: null`, `ringOffset="info-bg"`).

- [ ] **Step 1: Failing component tests** — tests/help/helpReportCta.test.tsx (`// @vitest-environment jsdom`; drive the hash with `window.location.hash = "#..."` + `window.dispatchEvent(new HashChangeEvent("hashchange"))`; mock fetch as in `ReportModal.test.tsx`):

<!-- task: red=`pnpm vitest run tests/help/helpReportCta.test.tsx tests/help/page-errors.test.tsx tests/help/errors-grouping.test.tsx` ac=AC-5 -->

```tsx
// Cases (spec §3 test 2; every one mandatory):
// 1. hash "#AMBIGUOUS_EMAIL_BINDING" at mount → open, type, submit →
//    fetch body fieldRef.helpCode === "AMBIGUOUS_EMAIL_BINDING", show_id null.
// 2. empty hash → submit body has NO fieldRef key; surfaceId scope is
//    sessionStorage key "fxav-report-attempt-help-errors-none".
// 3. post-mount: mount at "#A", hashchange to "#B", open, submit →
//    helpCode "B"; sessionStorage key "fxav-report-attempt-help-errors-c-B".
// 4. attempt binding (i): draft under "#A", close, hashchange "#B", reopen →
//    textarea EMPTY (fresh scope).
// 5. attempt binding (ii): hashchange back to "#A", reopen → A's draft text
//    restored (assert the typed string), same idempotency key as A's first
//    submit attempt (read both fetch bodies).
// 6. mid-open remount (R5 F1): open at "#A", type, hashchange "#B" while
//    open → dialog role gone from DOM; sessionStorage
//    "fxav-report-attempt-help-errors-c-B" holds no entry containing A's
//    draft or key; reopen at B → fresh attempt.
// 7. collision (R3 F1): compose hashless, hashchange to "#no-code", reopen →
//    scope "fxav-report-attempt-help-errors-c-no-code" is fresh (empty
//    draft), distinct from "help-errors-none".
```

Update `tests/help/page-errors.test.tsx`: src-scan case now asserts the page mounts `HelpReportCta` and has NO `mailto:`; rendered case asserts the CTA button (accessible name "Report a recurring error") renders exactly once; keep the no-useState/no-"use client" case for the page file itself. Update `tests/help/errors-grouping.test.tsx` single-CTA cases the same way.

- [ ] **Step 2: Verify RED** — the DECLARED RED is the two updated page suites: their new assertions fail against the live mailto anchor (`app/help/errors/page.tsx:107` region is the failing production line). The new component suite fails at collection until Step 3 creates the file; that collection failure is scaffolding, not the RED of record.
- [ ] **Step 3: Implement** HelpReportCta:

```tsx
"use client";
// app/help/errors/_components/HelpReportCta.tsx (spec §2.1).
// Attempt identity is bound to the code context: surfaceId and key both
// derive from the live hash, so idempotency key, draft, and helpCode
// co-vary by construction (spec §2.1; R2 F1 / R3 F1 / R5 F1).
import { useSyncExternalStore } from "react";
import { ReportButton } from "@/components/shared/ReportButton";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function HelpReportCta() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => "",
  );
  return (
    <ReportButton
      key={hash}
      surface="help"
      surfaceId={hash ? `help-errors-c-${hash}` : "help-errors-none"}
      showId={null}
      ringOffset="info-bg"
      {...(hash ? { autocapture: { fieldRef: { helpCode: hash } } } : {})}
    />
  );
}
```

Page edit: in the trailing `Callout`, replace the `mailto:` anchor with `<HelpReportCta />`; prose becomes "Read your code&rsquo;s explanation above. Still seeing it after that?" (server component unchanged otherwise). Intro line :58-59 becomes "Still stuck after reading it? There is a report button at the foot of the page."

- [ ] **Step 4: Verify GREEN** — `pnpm vitest run tests/help tests/components/report`. Expected: PASS.
- [ ] **Step 4b: String-presence mutants (all four, recorded in the commit message):** (a) empty the CTA label override path (blank accessible name) → rendered-name assertion fails; (b) suffix the label → fails; (c) leave the mailto in a JSX comment → mailto-absence assertion still passes on rendered DOM but the src-scan case pins `mailto:` absent from the page source, so it fails (the pair covers both layers); (d) vary the hash (case 3's A→B) → helpCode assertion fails on the stale value.
- [ ] **Step 5: Commit.** `feat(help): hash-scoped report CTA replaces mailto on /help/errors`

### Task 6: Master-spec amendments

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§13.1 at :3400 region; §13.2.1)
- Modify: `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md` (AC-11.11 row :709)

<!-- task: red=`rg -q 'Recurring-error report on .?/help/errors' docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md && rg -q '2026-08-09-help-report-surface-design' docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md` ac=AC-6 -->

- [ ] **Step 1: RED** — both `rg` probes above fail before the edit (verified 2026-08-09: the surface-5 heading phrase appears nowhere in the master spec, and this design-spec's path appears nowhere in the AC-11.11 doc — unlike a bare `r12` token, which that doc already contains at :158/:292 for unrelated amendments). Mutant check: each probe anchors on a phrase unique to ITS required edit, so omitting either edit fails its own probe.
- [ ] **Step 2: Edit** per spec §2.5, verbatim scope: §13.1 gains "**Doug-facing (admin), non-show-scoped:** 5. **Recurring-error report on `/help/errors`.**..." (spec §2.5 carries the full sentence); §13.2.1 gains the one-line help note; AC-11.11 row gains the r12 amendment sentence citing `docs/superpowers/specs/2026-08-09-help-report-surface-design.md`.
- [ ] **Step 3: GREEN** — probes pass (probe 2's match must be inside the AC-11.11 row, verified by eye at edit time); run `pnpm vitest run tests/help/spec-citation-integrity.test.ts tests/cross-cutting/codes.test.ts` (catalog untouched — x1 must stay green).
- [ ] **Step 4: Commit.** `docs(spec): §13.1 surface 5 + AC-11.11 r12 for the help report surface`

### Task 7: Ledger graduation

**Files:**
- Modify: `BACKLOG.md` (remove entry), `BACKLOG-archive.md` (add resolution), `tests/docs/_metaDeferralLedgerGraduation.test.ts` (BACKLOG_GRADUATED row)
- Modify: `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md` (M11-I-D-1 resolution note)

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` ac=AC-7 -->

- [ ] **Step 0 (RED):** Add `{ id: "BL-HELP-NON-SHOW-REPORT-SURFACE", provenance: "feat/help-report-surface" }` to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (follow the file's dated comment convention). Run the marker command: FAILS — the id is still in `BACKLOG.md` and absent from the archive (the registry's archive-only + provenance cases are the failing production state).
- [ ] **Step 1:** Move the full `BL-HELP-NON-SHOW-REPORT-SURFACE` body to `BACKLOG-archive.md` with a dated resolution paragraph (Option A shipped per the 2026-08-09 spec; Option B un-fence trigger = report volume or owner ask; staleness repair + L→S resize noted). **Strip the `**Status:** IN PROGRESS · **Branch:**` marker in this same commit** (invariant 12 — archives reject in-flight entries; the RED above fails by name if the marker rides along).
- [ ] **Step 2:** M11-I-D-1: append a resolution line (closed by this branch; AC-11.11 r12; spec cross-ref). Follow that DEFERRED.md's local resolution convention (read neighboring resolved entries first).
- [ ] **Step 3:** graduation meta-test green (registry row satisfied by the archive move); `pnpm vitest run tests/docs` green, except `_metaInvariant8Closeout.test.ts`, which stays red by design until the closeout §12 marker fills (see the marker-lifecycle note there).
- [ ] **Step 4: Commit — SEQUENCING (invariant 12, operational form):** execute Task 7 only AFTER every §12 gate step that writes to the tree (impeccable marker fill, DEFERRED entries, repair-round corpus rows) has committed. Then: (1) this graduation commit lands (marker stripped here); (2) the FINAL confirming diff round dispatches against the tree at this commit (review-covers-what-merges); (3) on APPROVE, that round's machine-emitted corpus row (codex-guard appends it post-verdict) lands as one trailing `docs(review):` commit touching ONLY `docs/review-rounds/**`. Invariant 12's enforced property — no flight marker reaches main (`tests/docs/_metaLedgerInProgress.test.ts` on main) — holds; merged precedent shows trailing corpus/merge commits after the graduation commit (PR #751: merge-from-main after `docs: graduate BL-TASK-ENROLLMENT-SINGLE-DEPTH`; PR #750: graduation last with the merge after). `docs(plan): graduate BL-HELP-NON-SHOW-REPORT-SURFACE; close M11-I-D-1`
- [ ] **Step 5: Registry-count reconciliation (authored AND run 2026-08-09):** `awk '/^const BACKLOG_GRADUATED = \[/,/^\];/' tests/docs/_metaDeferralLedgerGraduation.test.ts | grep -c 'id: "'` → **76** today; this plan adds exactly 1 row (BL-HELP-NON-SHOW-REPORT-SURFACE), removes 0 → expected count after Task 7: **77**. Re-run at Step 4 and confirm 77.

<!-- tasks: end -->

## 12. Closeout (invariant 8 + gates) — runs BEFORE Task 7's final commit (see Task 7 Step 4 sequencing)

- [ ] **Impeccable dual gate FIRST:** `/impeccable critique` AND `/impeccable audit` on the affected diff (`app/help/**`, `components/shared/**`) with the canonical v3 setup gates (context.mjs → register read). Fix or defer P0/P1 via DEFERRED.md, then ADD the filled marker line directly below this step, on its own line (grammar: `impeccable-gate: critique=RAN audit=RAN p0=<n> p1=<n> dispositions=recorded`, RAN-DEGRADED where a half ran degraded; `dispositions=none` only when p0+p1 = 0). Marker-lifecycle note: this plan names both gate halves, so `tests/docs/_metaInvariant8Closeout.test.ts` reds on this file from this commit until the filled marker lands here — that is the guard's intended in-flight state; the marker MUST be filled before the full-gates step below, and no line starting with the marker prefix may exist before then.

- [ ] **Full gates:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` (memory: typecheck covers what vitest strips; format:check because commits use --no-verify).
- [ ] **Whole-diff cross-model review** (codex-guard, `--stage diff`) to APPROVE; round corpus rows land in `docs/review-rounds/feat/help-report-surface/`.
- [ ] **Push → PR → real CI green → `gh pr merge --merge` → fast-forward main (`git rev-list --left-right --count main...origin/main` == `0 0`)**; herdr labels + cron nudge cleared at Stage 4.4 only.

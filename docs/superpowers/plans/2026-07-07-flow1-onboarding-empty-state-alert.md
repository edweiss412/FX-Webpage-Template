# Flow 1 → A− (onboarding empty-state, Step-1 branch, first-seen hard-fail alert) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise Flow 1 ("Add a new show") from grade B toward A− by (1.1) giving a zero-staged scan a first-class empty state, (1.2) adding a "no folder yet?" walkthrough to Step 1, and (1.3) raising a pushed admin alert when a setup scan can't read a sheet.

**Architecture:** One backend task adds a new admin-alert code `ONBOARDING_SHEET_UNREADABLE`, emitted post-commit at the onboarding scan route when any file hard-fails, registered across the full admin-alert lockstep surface set. Two UI tasks add render-only status blocks to the two wizard step components. A final task runs the impeccable dual-gate on the UI diff.

**Tech Stack:** Next.js 16 (App Router), React client components, TypeScript, Supabase (Postgres RPC `upsert_admin_alert`), Vitest + Testing Library, the project's §12.4 message catalog.

**Spec:** `docs/superpowers/specs/2026-07-07-flow1-onboarding-empty-state-alert.md` (Codex-approved, 8 rounds).

## Global Constraints

- **TDD per task** — failing test → minimal implementation → passing test → commit. Never implementation before its test. (AGENTS.md inv 1)
- **No raw error codes in UI** — copy routes through `lib/messages/lookup.ts`; 1.1/1.2 copy is descriptive microcopy, no code surfaced. (inv 5)
- **Alert emit is POST-COMMIT, outside any advisory-lock tx** — emitted at the route after `runOnboardingScan` resolves, never inside `scanOnboardingPreparedFiles`. (inv 2/10)
- **Commit per task**, conventional-commits (`feat(onboarding|admin):`, `test(...)`). One task per commit.
- **UI work (Step2Verify, Step1Share) is Opus-only + impeccable dual-gate** before close-out. (inv 8)
- **New admin-alert code = full lockstep** (Task 1 §steps): union + §12.4 table + helpfulContext appendix + catalog + `gen:spec-codes` + `gen:internal-code-enums` + adminAlertsRegistry + write-site + lifecycle + audience contract + identity map/fixture/matrix. Run the FULL `pnpm test` before push.
- **Alert context** carries `{ folder_id, wizard_session_id, failed_drive_file_ids: string[] }` — NO `failedKeys` key (would trigger union-merge; last-write-wins is required), NO `failed_count` scalar, no PII/tokens.

## Meta-test inventory (declared)

- **CREATES:** none.
- **EXTENDS:** `tests/messages/_metaAdminAlertCatalog.test.ts` (write-site + lifecycle), `tests/messages/_metaAlertAudienceContract.test.ts` (DOUG + count 18→19), `tests/messages/adminAlertsRegistry.ts`, `tests/adminAlerts/adminAlertCodes.fixture.ts` + `tests/adminAlerts/_metaAlertIdentityMap.test.ts` (count 44→45) + `tests/adminAlerts/alertIdentityMatrix.test.ts` (FIXTURES + count 44→45), `lib/adminAlerts/alertIdentityMap.ts`, `tests/cross-cutting/codes.test.ts` (x1), `tests/cross-cutting/extract-spec-codes.test.ts`, `tests/cross-cutting/no-raw-codes.test.ts` (x2 generated).
- **Advisory-lock topology:** NO `pg_advisory*` change. The alert emit is deliberately OUTSIDE the lock (route-level, post-commit). No new lock holder; `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- **Layout-dimensions task:** N/A — spec §6.3: the new blocks are flow-layout (auto-height), no fixed-dimension parent with flex/grid children. No `getBoundingClientRect` Playwright task.
- **Transition-audit:** covered inline in Task 2 (the new blocks are deliberately instant — no `AnimatePresence`, no motion props; asserted).
- **Validation-schema-parity:** N/A — no migration.

---

## Task 1: `ONBOARDING_SHEET_UNREADABLE` alert — emit + full lockstep

**Files:**
- Modify: `app/api/admin/onboarding/scan/route.ts` (emit, ~`:274-294`)
- Modify: `lib/adminAlerts/upsertAdminAlert.ts` (`AdminAlertCode` union, `:3-38`)
- Modify: `lib/messages/catalog.ts` (new row near `LIVE_ROW_CONFLICT` `:1873-1888`)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table row + helpfulContext appendix `:3081+`)
- Modify: `lib/adminAlerts/alertIdentityMap.ts` (`:57+`)
- Modify: `tests/messages/adminAlertsRegistry.ts` (`:9-54`)
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts` (`ADMIN_ALERTS_WRITE_SITES`, `ADMIN_ALERTS_LIFECYCLE`)
- Modify: `tests/messages/_metaAlertAudienceContract.test.ts` (`DOUG` `:7`, count `:72`)
- Modify: `tests/adminAlerts/adminAlertCodes.fixture.ts`
- Modify: `tests/adminAlerts/_metaAlertIdentityMap.test.ts` (count 44→45)
- Modify: `tests/adminAlerts/alertIdentityMatrix.test.ts` (FIXTURES + count 44→45)
- Regenerate: `lib/messages/__generated__/spec-codes.ts`, `lib/messages/__generated__/internal-code-enums.ts`
- Test (new): `tests/onboarding/scanRouteAlertEmit.test.ts`

**Interfaces:**
- Consumes: `upsertAdminAlert(input: { showId: string | null; code: AdminAlertCode; context: Record<string, unknown> }): Promise<string | null>` (`lib/adminAlerts/upsertAdminAlert.ts`); `runOnboardingScan(...) → { outcome, processed: { driveFileId, outcome }[] }`.
- Produces: the string-literal call site `upsertAdminAlert({ showId: null, code: "ONBOARDING_SHEET_UNREADABLE", context: { folder_id, wizard_session_id, failed_drive_file_ids } })` at the route (the write-site the meta-test greps for), and the registered code in every catalog/registry.

> This task is one atomic commit: the completeness meta-tests couple the union member to every registry, and the write-site meta-test couples the registry to the emit. There is no green intermediate state, so all sub-changes land together, TDD-anchored by the behavioral route-emit test.

- [ ] **Step 1: Write the failing behavioral route-emit test**

Create `tests/onboarding/scanRouteAlertEmit.test.ts`. **Harness (verified):** mirror `tests/onboarding/scanRoute.test.ts` exactly — it builds a `FakeScanDb`, calls `deps(db, { runOnboardingScan: vi.fn(async () => result) })` to inject the scan result via `ScanRouteDeps` (`runOnboardingScan` IS injectable; `:48` of the route), POSTs a `new Request(".../api/admin/onboarding/scan", { method:"POST", ... })`, and reads the NDJSON stream. `logAdminOutcome` and `upsertAdminAlert` are DIRECT module imports in the route (`:17` + the import you add in Step 4), NOT `ScanRouteDeps` seams — so mock them with `vi.mock`, not via `deps`. Import the `deps` / `FakeScanDb` / request-builder helpers from (or copy the shape of) `tests/onboarding/scanRoute.test.ts`. The route reads `folder.folderId` and `wizardSessionId` internally from `verifyFolder` + reserve; use the same folder/session values the existing test uses (e.g. `"folder-1"`, `W1`) and assert those, not invented ids.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn().mockResolvedValue("alert-id"),
}));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: vi.fn().mockResolvedValue(undefined) }));
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
// import { POST }, deps, FakeScanDb, makeRequest from the scanRoute.test.ts harness

describe("onboarding scan route — ONBOARDING_SHEET_UNREADABLE emit", () => {
  // Use the folder/session the scanRoute.test.ts harness produces (grep it for
  // the exact folderId + wizard-session constants, e.g. "folder-1" / W1) and
  // assert those verbatim below. `runFolder`/`runWiz` are placeholders for them.
  beforeEach(() => {
    vi.mocked(upsertAdminAlert).mockClear().mockResolvedValue("alert-id");
    vi.mocked(logAdminOutcome).mockClear().mockResolvedValue(undefined);
  });

  it("emits exactly one alert when the completed scan has ≥1 hard_failed", async () => {
    const result = {
      outcome: "completed" as const,
      processed: [
        { driveFileId: "d-b", outcome: "hard_failed" as const },
        { driveFileId: "d-a", outcome: "hard_failed" as const },
        { driveFileId: "d-ok", outcome: "staged" as const },
      ],
    };
    // POST via the harness with deps(db, { runOnboardingScan: vi.fn(async () => result) });
    // read the stream to completion.
    expect(vi.mocked(upsertAdminAlert)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertAdminAlert)).toHaveBeenCalledWith({
      showId: null,
      code: "ONBOARDING_SHEET_UNREADABLE",
      context: {
        folder_id: runFolder,
        wizard_session_id: runWiz,
        failed_drive_file_ids: ["d-a", "d-b"], // sorted distinct
      },
    });
  });

  it("does NOT emit when no file hard_failed (incl. live_row_conflict only)", async () => {
    const result = {
      outcome: "completed" as const,
      processed: [
        { driveFileId: "d-ok", outcome: "staged" as const },
        { driveFileId: "d-lrc", outcome: "live_row_conflict" as const },
      ],
    };
    // POST via harness ...
    expect(vi.mocked(upsertAdminAlert)).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "ONBOARDING_SHEET_UNREADABLE" }),
    );
  });

  it("does NOT emit on a non-completed outcome", async () => {
    const result = { outcome: "schema_missing" as const, code: "WIZARD_ISOLATION_INDEXES_MISSING" };
    // POST via harness ...
    expect(vi.mocked(upsertAdminAlert)).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "ONBOARDING_SHEET_UNREADABLE" }),
    );
  });

  it("alert throw does not 500 or suppress logAdminOutcome", async () => {
    vi.mocked(upsertAdminAlert).mockRejectedValue(new Error("boom"));
    const result = {
      outcome: "completed" as const,
      processed: [{ driveFileId: "d-a", outcome: "hard_failed" as const }],
    };
    // POST via harness; assert the response still streams a terminal `result`
    // message (parse the NDJSON — last line has type:"result") and:
    expect(vi.mocked(logAdminOutcome)).toHaveBeenCalled(); // own try/catch, not suppressed
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/onboarding/scanRouteAlertEmit.test.ts`
Expected: FAIL (`ONBOARDING_SHEET_UNREADABLE` not in `AdminAlertCode`; no emit at the route).

- [ ] **Step 3: Add the code to the `AdminAlertCode` union**

In `lib/adminAlerts/upsertAdminAlert.ts`, add to the union (`:3-38`), keeping alpha-ish grouping near other setup codes:

```ts
  | "ONBOARDING_SHEET_UNREADABLE"
```

- [ ] **Step 4: Emit at the route**

In `app/api/admin/onboarding/scan/route.ts`, inside the `if (result.outcome === "completed") {` block (`:274`), AFTER the existing `logAdminOutcome` try/catch (`:275-286`) and BEFORE `emit({ type: "result", ... })` (`:287`), add a SEPARATE sibling try/catch:

```ts
        // First-seen/setup-scan hard-fail alert (spec 2026-07-07 §3). Own
        // best-effort boundary — independent of the logAdminOutcome emit above.
        // POST-COMMIT (all per-file txs committed inside runOnboardingScan), no
        // advisory lock held. Last-write-wins context (NO failedKeys key).
        const failedIds = Array.from(
          new Set(
            result.processed
              .filter((p) => p.outcome === "hard_failed")
              .map((p) => p.driveFileId),
          ),
        ).sort();
        if (failedIds.length > 0) {
          try {
            await upsertAdminAlert({
              showId: null,
              code: "ONBOARDING_SHEET_UNREADABLE",
              context: {
                folder_id: folder.folderId,
                wizard_session_id: wizardSessionId,
                failed_drive_file_ids: failedIds,
              },
            });
          } catch {
            /* best-effort */
          }
        }
```

Add the import if absent: `import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";` (verify whether the route already imports it or injects it via `runtime`/`deps`; wire the test's spy through the same seam the route uses for `logAdminOutcome`).

- [ ] **Step 5: Run the behavioral test — route cases pass, meta-tests now red**

Run: `pnpm vitest run tests/onboarding/scanRouteAlertEmit.test.ts`
Expected: PASS. But the code now exists in the union without its registries — the completeness meta-tests will fail in Step 11. Proceed to register everything.

- [ ] **Step 6: Add the §12.4 master-spec table row + helpfulContext appendix entry**

In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, find the onboarding/wizard subsection of §12.4 (near the `LIVE_ROW_CONFLICT` / `WIZARD_ISOLATION_INDEXES_MISSING` rows). Add a table row (columns: Code | Where it surfaces | Doug-facing message | Crew-facing message | Follow-up):

```
| `ONBOARDING_SHEET_UNREADABLE` | Setup scan (`app/api/admin/onboarding/scan/route.ts`) found ≥1 sheet it could not parse as a show; a folder-level `showId:null` admin alert is raised post-scan (last-write-wins context: `folder_id`, `wizard_session_id`, `failed_drive_file_ids`). Fires for first-run AND re-run setup. | "Some sheets in your show folder couldn't be read during setup and were skipped. To see which ones and fix them, re-run setup from Settings." | — | Doug → Settings → Re-run setup; fix the flagged sheets in Drive; re-scan |
```

Then in the `<!-- §12.4 helpfulContext appendix -->` YAML block (`:3081+`), add (keys are MessageCode identifiers, values non-empty strings):

```
ONBOARDING_SHEET_UNREADABLE: "During setup we scanned your Drive folder and found one or more files we couldn't read as a show sheet, so we skipped them — they aren't staged and won't appear on any crew page. The setup wizard's Step 3 lists each skipped sheet by name while setup is open; after setup you can see them again by re-running setup from Settings. Fix the sheet's layout in Drive (most often a missing or renamed section header), then re-scan."
```

- [ ] **Step 7: Add the runtime catalog row**

In `lib/messages/catalog.ts`, near the `LIVE_ROW_CONFLICT` row (`:1873`), add (mirror its field shape exactly; `dougFacing`/`helpfulContext` MUST match §12.4 verbatim for the x1 parity gate):

```ts
  ONBOARDING_SHEET_UNREADABLE: {
    code: "ONBOARDING_SHEET_UNREADABLE",
    resolution: "manual",
    audience: "doug",
    dougFacing:
      "Some sheets in your show folder couldn't be read during setup and were skipped. To see which ones and fix them, re-run setup from Settings.",
    crewFacing: null,
    followUp: "Doug → Settings → Re-run setup; fix the flagged sheets in Drive; re-scan",
    helpfulContext:
      "During setup we scanned your Drive folder and found one or more files we couldn't read as a show sheet, so we skipped them — they aren't staged and won't appear on any crew page. The setup wizard's Step 3 lists each skipped sheet by name while setup is open; after setup you can see them again by re-running setup from Settings. Fix the sheet's layout in Drive (most often a missing or renamed section header), then re-scan.",
    title: "Some sheets couldn't be read",
    longExplanation:
      "During setup we scanned your Drive folder and found one or more files we couldn't read as a show sheet, so we skipped them. They aren't staged and won't appear on any crew page. The setup wizard's Step 3 lists each skipped sheet by name; after setup, re-run setup from Settings to see them again. Fix the sheet's layout in Drive, then re-scan.",
    helpHref: "/help/errors#ONBOARDING_SHEET_UNREADABLE",
  },
```

- [ ] **Step 8: Register in every test/identity surface**

(a) `tests/messages/adminAlertsRegistry.ts` — add before `] as const` (`:54`):
```ts
  "ONBOARDING_SHEET_UNREADABLE", //     Flow-1 setup-scan hard-fail folder alert
```

(b) `tests/messages/_metaAdminAlertCatalog.test.ts` — add a `ADMIN_ALERTS_WRITE_SITES` entry. The real `WriteSite` shape is `{ path, pattern }` (verified, e.g. `AMBIGUOUS_EMAIL_BINDING` `:66`). Note string-literal `code:` sites need the QUOTE in the pattern (unlike `LIVE_ROW_CONFLICT` which uses the bare constant):
```ts
  ONBOARDING_SHEET_UNREADABLE: {
    path: "app/api/admin/onboarding/scan/route.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"ONBOARDING_SHEET_UNREADABLE"/,
  },
```
and an `ADMIN_ALERTS_LIFECYCLE` entry (near `:451`):
```ts
  ONBOARDING_SHEET_UNREADABLE: { class: "event-manual" },
```

(c) `tests/messages/_metaAlertAudienceContract.test.ts` — add to the `DOUG` array (`:7`, before `] as const`):
```ts
  "ONBOARDING_SHEET_UNREADABLE",
```
and bump the count assertion (`:72`): `expect(DOUG.length).toBe(19);`

(d) `lib/adminAlerts/alertIdentityMap.ts` — add a global entry (near the other `{ kind: "global" }` entries):
```ts
  ONBOARDING_SHEET_UNREADABLE: { kind: "global" },
```

(e) `tests/adminAlerts/adminAlertCodes.fixture.ts` — add before `] as const`:
```ts
  "ONBOARDING_SHEET_UNREADABLE", //     Flow-1 setup-scan hard-fail folder alert
```

(f) `tests/adminAlerts/_metaAlertIdentityMap.test.ts` — bump the numeric anchor `expect(ADMIN_ALERTS_CODES.length).toBe(44)` → `45` (near `:40`).

(g) `tests/adminAlerts/alertIdentityMatrix.test.ts` — add a global fixture to `FIXTURES`:
```ts
  {
    code: "ONBOARDING_SHEET_UNREADABLE",
    showId: null,
    context: {
      folder_id: "folder-x",
      wizard_session_id: "wiz-1",
      failed_drive_file_ids: ["d-a", "d-b"],
    },
  },
```
and update the test-name numeric anchor "exactly the 44 registered codes" → "45" (the assertion is set-equality, so it passes once FIXTURES + the fixture registry both include the code; update the name string for hygiene).

- [ ] **Step 9: Regenerate the two manifests**

Run: `pnpm gen:spec-codes && pnpm gen:internal-code-enums`
This rewrites `lib/messages/__generated__/spec-codes.ts` (from §12.4 table + appendix) and `lib/messages/__generated__/internal-code-enums.ts` (extracts the route `code:` literal as `admin_alerts.code`). Stage both regenerated files.

- [ ] **Step 10: Typecheck**

Run: `pnpm exec tsc --noEmit` (or the project's `typecheck` script)
Expected: clean. (`upsertAdminAlert` now accepts the new code; the route context typechecks.)

- [ ] **Step 11: Run the full alert + code lockstep suites**

Run:
```bash
pnpm vitest run tests/onboarding/scanRouteAlertEmit.test.ts tests/messages/ tests/adminAlerts/ tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts tests/cross-cutting/no-raw-codes.test.ts
```
Expected: PASS (behavioral emit + all completeness meta-tests + x1/x2 parity green). If a meta-test flags a missing surface, add it and re-run (that surface was under-enumerated — record it).

- [ ] **Step 12: Commit**

```bash
git add app/api/admin/onboarding/scan/route.ts lib/adminAlerts/upsertAdminAlert.ts lib/adminAlerts/alertIdentityMap.ts lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts lib/messages/__generated__/internal-code-enums.ts docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md tests/messages/adminAlertsRegistry.ts tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/_metaAlertAudienceContract.test.ts tests/adminAlerts/adminAlertCodes.fixture.ts tests/adminAlerts/_metaAlertIdentityMap.test.ts tests/adminAlerts/alertIdentityMatrix.test.ts tests/onboarding/scanRouteAlertEmit.test.ts
git commit --no-verify -m "feat(onboarding): raise ONBOARDING_SHEET_UNREADABLE alert on setup-scan hard-fail"
```

---

## Task 2: Step2Verify — empty-folder + nothing-ready status blocks (1.1)

**Files:**
- Modify: `components/admin/wizard/Step2Verify.tsx` (render branch `:445-483`; suppress footer popover when `staged===0`, `:305-307`)
- Test: `tests/components/wizard/Step2Verify.emptyState.test.tsx` (new)

**Interfaces:**
- Consumes: `FormState` `{ kind:"success"; result: ScanCompleted }` where `result.totals = { staged, hard_failed, skipped_non_sheet, live_row_conflict }`; `formatTotals(totals)`; `folderUrl` state; `parseDriveFolderId`.
- Produces: `data-testid="wizard-step2-empty"` (empty-folder block) and `data-testid="wizard-step2-nothing-ready"` (nothing-ready block); footer `Step2FoundSummary` renders only when `state.result.totals.staged > 0`.

- [ ] **Step 1: Write the failing component tests**

Create `tests/components/wizard/Step2Verify.emptyState.test.tsx`. Use the project's existing Step2Verify test harness (grep `tests/**/*Step2*` for how it mounts the component in a success state — it likely needs a router stub + a way to set `FormState` to success; follow that pattern). Anti-tautology: scope queries to the block testids; for the "popover absent" assertion, query the footer region specifically.

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
// mount helper from the existing Step2Verify tests

const empty = { staged: 0, hard_failed: 0, skipped_non_sheet: 0, live_row_conflict: 0 };
const unreadable = { staged: 0, hard_failed: 2, skipped_non_sheet: 1, live_row_conflict: 0 };
const lrcOnly = { staged: 0, hard_failed: 0, skipped_non_sheet: 0, live_row_conflict: 2 };
const staged = { staged: 2, hard_failed: 0, skipped_non_sheet: 0, live_row_conflict: 0 };

describe("Step2Verify staged-0 states", () => {
  // NOTE: the footer popover has NO plain `wizard-step2-found` element —
  // Step2FoundSummary passes testId="wizard-step2-found" rootTestId="wizard-step2-success"
  // to HoverHelp, which renders `wizard-step2-found-trigger`/`-body` and roots the
  // whole thing at `wizard-step2-success` (HoverHelp.tsx:135,154,182). Assert the
  // ROOT `wizard-step2-success` for popover presence/absence.

  it("empty folder → empty block, no found-summary popover", () => {
    // render success with totals=empty, folderUrl a valid Drive URL
    const block = screen.getByTestId("wizard-step2-empty");
    expect(within(block).getByText(/this folder is empty/i)).toBeInTheDocument();
    expect(within(block).getByRole("link", { name: /open the folder/i })).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step2-success")).not.toBeInTheDocument();
  });

  it("empty folder with no parseable folderUrl → no Open-folder link", () => {
    // render success with totals=empty, folderUrl=""
    const block = screen.getByTestId("wizard-step2-empty");
    expect(within(block).queryByRole("link", { name: /open the folder/i })).not.toBeInTheDocument();
  });

  it("empty folder → persistent submit button is relabeled 'Re-scan'", () => {
    // render success with totals=empty (fresh scan, no priorScan)
    expect(screen.getByTestId("wizard-step2-submit")).toHaveTextContent("Re-scan");
  });

  it("files present none staged → nothing-ready block, per-bucket non-zero lines only", () => {
    // render success with totals=unreadable
    const block = screen.getByTestId("wizard-step2-nothing-ready");
    expect(within(block).getByText(/none are ready to review/i)).toBeInTheDocument();
    expect(within(block).getByText(/could not parse/i)).toBeInTheDocument(); // hard_failed 2
    expect(within(block).getByText(/non-sheet files/i)).toBeInTheDocument(); // skipped 1
    expect(within(block).queryByText(/live-row conflicts/i)).not.toBeInTheDocument(); // 0 → omitted
    expect(screen.queryByTestId("wizard-step2-success")).not.toBeInTheDocument();
    expect(screen.getByTestId("wizard-step2-submit")).toHaveTextContent("Re-scan");
  });

  it("live-row-conflict-only scan → nothing-ready block, NO 'couldn't read' blanket", () => {
    // render success with totals=lrcOnly
    const block = screen.getByTestId("wizard-step2-nothing-ready");
    expect(within(block).getByText(/live-row conflicts/i)).toBeInTheDocument();
    expect(within(block).queryByText(/couldn.t read any as a show sheet/i)).not.toBeInTheDocument();
  });

  it("staged>0 → footer popover renders, no empty/nothing-ready block, label unchanged", () => {
    // render success with totals=staged
    expect(screen.getByTestId("wizard-step2-success")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step2-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step2-nothing-ready")).not.toBeInTheDocument();
    // staged>0 is out of scope for the relabel — button keeps its existing label
    expect(screen.getByTestId("wizard-step2-submit")).not.toHaveTextContent("Re-scan");
  });

  it("new blocks are instant — no AnimatePresence / motion props", () => {
    // render nothing-ready; assert the block element has no data-framer / initial /
    // animate attributes (deliberately instant per spec §6.2).
    const block = screen.getByTestId("wizard-step2-nothing-ready");
    expect(block).not.toHaveAttribute("data-framer-appear-id");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/components/wizard/Step2Verify.emptyState.test.tsx`
Expected: FAIL (no `wizard-step2-empty` / `wizard-step2-nothing-ready` testids exist).

- [ ] **Step 3: Suppress the footer popover for staged-0**

In `components/admin/wizard/Step2Verify.tsx`, change `foundSummary` (`:305-307`) so it renders only when there is ≥1 staged sheet:

```tsx
  const foundSummary =
    state.kind === "success" && state.result.totals.staged > 0 ? (
      <Step2FoundSummary result={state.result} />
    ) : undefined;
```

- [ ] **Step 4: Add the two status blocks in the non-submitting branch**

In the `else` branch of the lower region (the `<>…</>` after `isSubmitting && progress`, `:445-483`), ABOVE the error-alert / action-row block, add a success-staged-0 status block. Insert helper renders and the conditional. Use existing token classes (mirror the error-alert block `:451-459` for surface/spacing, and reuse the bucket-line labels from `Step2FoundSummary` `:553-571`).

```tsx
{state.kind === "success" && state.result.totals.staged === 0 ? (
  formatTotals(state.result.totals) === 0 ? (
    <div
      data-testid="wizard-step2-empty"
      className="mt-1 flex flex-col gap-2 rounded-sm border border-border bg-surface-sunken p-3 text-base text-text"
    >
      <p className="font-semibold text-text-strong">This folder is empty.</p>
      <p>Add a show sheet to the folder, then re-scan.</p>
      {parseDriveFolderId(folderUrl) ? (
        <a
          href={folderUrl.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-tap-min items-center self-start text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Open the folder →
        </a>
      ) : null}
    </div>
  ) : (
    <div
      data-testid="wizard-step2-nothing-ready"
      className="mt-1 flex flex-col gap-2 rounded-sm border border-border bg-surface-sunken p-3 text-base text-text"
    >
      <p className="font-semibold text-text-strong">
        We found {formatTotals(state.result.totals)}{" "}
        {formatTotals(state.result.totals) === 1 ? "item" : "items"}, but none are ready to review
        yet.
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {state.result.totals.hard_failed > 0 ? (
          <li>
            Sheets we could not parse:{" "}
            <span className="font-semibold tabular-nums text-text">
              {state.result.totals.hard_failed}
            </span>
          </li>
        ) : null}
        {state.result.totals.skipped_non_sheet > 0 ? (
          <li>
            Non-sheet files we skipped:{" "}
            <span className="font-semibold tabular-nums text-text">
              {state.result.totals.skipped_non_sheet}
            </span>
          </li>
        ) : null}
        {state.result.totals.live_row_conflict > 0 ? (
          <li>
            Live-row conflicts:{" "}
            <span className="font-semibold tabular-nums text-text">
              {state.result.totals.live_row_conflict}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  )
) : null}
```

(`parseDriveFolderId` is already imported, `:31`. Do NOT change the accent/primary logic — `submitIsPrimary`/`continueIsPrimary` stay untouched.)

- [ ] **Step 4b: Relabel the persistent submit button to "Re-scan" in staged-0 success**

Live `submitLabel` (`:282`) is `isSubmitting ? "Verifying…" : matchesScanned ? "Re-scan" : "Verify and scan"` — a FRESH successful scan (no `priorScan`, so `matchesScanned` false) reads "Verify and scan", not "Re-scan". Spec §4.1 requires the persistent button to read "Re-scan" in the staged-0 modes. Change ONLY the label (not the button class / primary logic):

```tsx
  const submitLabel = isSubmitting
    ? "Verifying…"
    : state.kind === "success" && state.result.totals.staged === 0
      ? "Re-scan"
      : matchesScanned
        ? "Re-scan"
        : "Verify and scan";
```

This is gated on `staged === 0` so the staged>0 success path is unchanged (avoids regressing existing Step2Verify tests).

- [ ] **Step 5: Run the tests — verify they pass**

Run: `pnpm vitest run tests/components/wizard/Step2Verify.emptyState.test.tsx`
Expected: PASS.

- [ ] **Step 6: Regression — existing Step2Verify tests still green + typecheck + lint**

Run:
```bash
pnpm vitest run tests/**/*Step2Verify* && pnpm exec tsc --noEmit && pnpm exec eslint components/admin/wizard/Step2Verify.tsx
```
Expected: PASS / clean (watch the `better-tailwindcss/enforce-canonical-classes` rule — use canonical class names).

- [ ] **Step 7: Commit**

```bash
git add components/admin/wizard/Step2Verify.tsx tests/components/wizard/Step2Verify.emptyState.test.tsx
git commit --no-verify -m "feat(admin): first-class empty-folder + nothing-ready states in onboarding step 2"
```

---

## Task 3: Step1Share — "Don't have a folder yet?" disclosure (1.2)

**Files:**
- Modify: `components/admin/wizard/Step1Share.tsx` (after the existing explainer `:176-191`)
- Test: `tests/components/wizard/Step1Share.noFolder.test.tsx` (new)

**Interfaces:**
- Consumes: existing `Step1Share({ serviceAccountEmail })` props (unchanged).
- Produces: `data-testid="wizard-step1-no-folder"` — a collapsed `<details>` with a 4-step walkthrough.

- [ ] **Step 1: Write the failing test**

Create `tests/components/wizard/Step1Share.noFolder.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Step1Share } from "@/components/admin/wizard/Step1Share";

describe("Step1Share — no-folder disclosure", () => {
  it("renders a collapsed 'Don't have a folder yet?' details with the 4-step walkthrough", () => {
    render(<Step1Share serviceAccountEmail="svc@example.iam.gserviceaccount.com" />);
    const details = screen.getByTestId("wizard-step1-no-folder");
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(within(details).getByText(/don.t have a folder yet/i)).toBeInTheDocument();
    expect(within(details).getByText(/new .*folder/i)).toBeInTheDocument();
    expect(within(details).getByText(/drop your show sheet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm vitest run tests/components/wizard/Step1Share.noFolder.test.tsx`
Expected: FAIL (`wizard-step1-no-folder` not present).

- [ ] **Step 3: Add the disclosure**

In `components/admin/wizard/Step1Share.tsx`, immediately AFTER the existing explainer `<details data-testid="wizard-step1-explainer">` block (`:176-191`), add:

```tsx
      <details
        data-testid="wizard-step1-no-folder"
        className="rounded-md border border-border bg-surface-sunken p-tile-pad"
      >
        <summary className="cursor-pointer text-sm font-semibold text-text-strong">
          Don&rsquo;t have a folder yet?
        </summary>
        <ol className="mt-3 flex max-w-prose list-decimal flex-col gap-2 pl-5 text-sm text-text-subtle">
          <li>In Google Drive, click New → Folder and give it a name (your show name works well).</li>
          <li>Open the folder and drop your show sheet(s) inside.</li>
          <li>Share the folder with the email above and give it Viewer access.</li>
          <li>Come back here and continue.</li>
        </ol>
      </details>
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm vitest run tests/components/wizard/Step1Share.noFolder.test.tsx`
Expected: PASS.

- [ ] **Step 5: Regression + lint + typecheck**

Run:
```bash
pnpm vitest run tests/**/*Step1Share* && pnpm exec tsc --noEmit && pnpm exec eslint components/admin/wizard/Step1Share.tsx
```
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add components/admin/wizard/Step1Share.tsx tests/components/wizard/Step1Share.noFolder.test.tsx
git commit --no-verify -m "feat(admin): add 'no folder yet?' walkthrough to onboarding step 1"
```

---

## Task 4: Impeccable dual-gate on the UI diff + full-suite gate

**Files:** none new (evaluation + any HIGH/CRITICAL fixes fold back into Tasks 2/3 files or a `DEFERRED.md` entry).

- [ ] **Step 1: Run `/impeccable critique` on the UI diff** (Step2Verify.tsx + Step1Share.tsx), with the v3 preflight gates (PRODUCT.md / DESIGN.md / register / preflight signal). Record findings.

- [ ] **Step 2: Run `/impeccable audit` on the same diff.** Record findings.

- [ ] **Step 3: Resolve HIGH/CRITICAL** — fix in the component files (re-running the relevant Task 2/3 tests after each fix), OR add an explicit `DEFERRED.md` entry per finding. LOW/MEDIUM may be deferred with a note.

- [ ] **Step 4: Full suite + quality gates** (catches cross-suite regressions before close-out):

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm format:check
```
Expected: all green. If `format:check` flags the new files, run `pnpm format` and amend the owning task's commit (or add a `chore: prettier` commit).

- [ ] **Step 5: Commit any fixes** (per owning task; impeccable dispositions recorded in the PR body / a handoff note).

---

## Self-review (author checklist — completed at plan time)

- **Spec coverage:** 1.1 → Task 2; 1.2 → Task 3; 1.3 (emit + full lockstep) → Task 1; impeccable dual-gate (inv 8) → Task 4. All spec §-items mapped.
- **Placeholder scan:** every code step carries literal code; the only "follow the existing harness" notes are for test-mounting scaffolds that vary by the repo's current test utilities (the implementer greps the named existing test dir) — the assertions themselves are concrete.
- **Type consistency:** `failed_drive_file_ids` (never `failedKeys`/`failed_count`) used in Task 1 emit, catalog-adjacent context, and the identity-matrix fixture. `ONBOARDING_SHEET_UNREADABLE` spelled identically across union/catalog/§12.4/registries/testids. `wizard-step2-empty` / `wizard-step2-nothing-ready` / `wizard-step1-no-folder` testids consistent between component and tests.
- **Advisory-lock:** no `pg_advisory*` touched; emit is route-level post-commit (declared in Meta-test inventory).

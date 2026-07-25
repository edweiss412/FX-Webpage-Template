# Plan — section-header rebuild + childless-spacer sweep

**Spec:** `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md` (APPROVED, adversarial round 8).
**Worktree:** `../FX-worktrees/section-header-rebuild`, branch `feat/section-header-rebuild-phantom-spacers`.
**Closes:** `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`, `BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW`, `BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET`.

**Task classes, stated honestly** (round-4 finding 3 — the earlier blanket "every task is TDD" was false
for several tasks, and invariant 1 is P0, so mislabelling matters):

- **TDD tasks** — failing test → minimal implementation → passing test → commit (invariant 1): **T1, T2,
  T3, T4, T5, T6, T9**. Each states its exact RED command and expected failure.
- **Infrastructure task — T0.** It adds test scaffolding and two product *seams*. It has no feature RED
  (there is no behaviour to fail yet), but every deliverable is **proved executable** before its commit,
  and the one product refactor it contains (the `BellActionRow` extraction) is guarded by a
  **characterization test written and passing BEFORE the extraction**, which must stay green through it. A
  refactor guard cannot be red first; claiming otherwise would be the dishonest option.
- **Documentation task — T8** (`DESIGN.md`). No RED exists for prose. Its verification contract is
  explicit instead: `pnpm format:check` plus `pnpm vitest run tests/styles` (the §7a token/contrast
  meta-tests), and it ends in a commit.
- **Close-out gates — T10, T11.** These are gates, not TDD tasks. Any code change a gate produces gets its
  own RED-first sub-task before it is committed; T10 commits its disposition artifact and T11 commits the
  merge.

One commit per task, conventional-commits style (invariant 6). All work stays in the worktree
(invariant 11).

**Test infrastructure comes FIRST (T0).** A new standalone Playwright spec is invisible until its name
is in an allow-list, so a plan that defers that edit cannot run any assertion RED — it gets "No tests
found". T0 makes every later RED step actually executable, and each task states its **exact RED
command, expected failure, PASS command, and expected passing count**.

---

## 0. Pre-draft declarations

### 0.1 Meta-test inventory

**CREATES none. EXTENDS one** (`tests/ci/_metaE2eWorkflowCoverage.test.ts`, see the table). The static guard that would have created one is **DESCOPED** by spec §6
(three adversarial rounds without convergence; it becomes T9's backlog spike). Each candidate registry
from `docs/agents/writing-plans.md` was checked:

| Candidate registry | Applies? |
| ------------------ | -------- |
| `tests/auth/_metaInfraContract.test.ts` (Supabase call boundaries) | No — no Supabase call site added or changed |
| `tests/components/tiles/_metaSentinelHidingContract.test.ts` | No — no sentinel-in-optional-text surface |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | No — no `admin_alerts` upsert, no catalog row |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | No — no `pg_advisory*` path touched |
| `tests/admin/no-inline-email-normalization.test.ts` | No — no email handling |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | No — no mutating route or server action added (invariant 10 N/A) |
| `tests/cross-cutting/codes.test.ts` (§12.4 parity) | No — no error codes (spec §7) |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | **YES — EXTENDED.** Not "possibly": the scanner treats every `pull_request.paths` workflow as path-gated and requires a `LOCAL_ONLY_ALLOWLIST` row per such spec (`tests/ci/_metaE2eWorkflowCoverage.test.ts:24-35`). Both new specs are deliberately added to a path-filtered workflow, so **two `PATH_GATED` rows are mandatory**, added and run in T0. |

### 0.2 Advisory-lock holder topology

**NOT N/A — round 5 correctly refuted the earlier declaration.** T6 adds execution of
`supabase/seedWalkerFixtures.ts`, which writes `shows`, `pending_syncs`, and `pending_ingestions` inside
a transaction, so a lock topology applies even though this batch writes no new SQL.

**Holder topology, enumerated (invariant 2's single-holder rule).** For each of the four
`show:<drive_file_id>` hashkeys the walker seed touches, the lock is acquired at **exactly one layer**:
the transaction-local, `drive_file_id`-sorted `pg_advisory_xact_lock` sweep inside the seed script itself
(`supabase/seedWalkerFixtures.ts:301-312`). There is no JS-side wrapper lock and no nested SECURITY
DEFINER acquisition, so no second holder exists and no deadlock surface is added. **This batch adds no
new lock holder** — it only invokes an existing, already-compliant script from a workflow step.

That topology is already structurally pinned by
`tests/db/seed-restage-fixture.test.ts:120-149` (exactly four per-show locks, in sorted order). **T6
re-runs it** — `pnpm vitest run tests/db/seed-restage-fixture.test.ts` — so a change to the seed's lock
set is caught by this batch rather than assumed stable.

No migration and no schema change, so `validation-schema-parity` and `pnpm gen:schema-manifest` remain
N/A.

### 0.3 e2e harness-readiness checklist

| | Static harness (T0's new specs) | Real-route probe (archived bucket, T6) |
| - | ------------------------------- | -------------------------------------- |
| **Boot** | none — `tests/e2e/standalone.config.ts`; markup rendered by a `tsx` subprocess, CSS compiled by the Tailwind CLI, served from `node:http` | `phantom-gap-e2e.yml` boots local Supabase + the :3000 baseline server (`BASELINE_SERVER_ONLY=1`) |
| **Readiness gate** | *Static cell/pusher harnesses:* `waitUntil: "load"` **plus** `emulateMedia({ reducedMotion: "reduce" })` so entrance animation is collapsed and geometry is final. *Live transition root (separate contract):* wait on an explicit **hydration readiness flag** the entry sets after `createRoot(...).render`, and run with **NORMAL motion** — no reduced-motion emulation, since that would suppress `motion-safe:` utilities the audit exists to catch. **Never `networkidle` alone.** | existing `expect(getByTestId("admin-dashboard")).toBeVisible()` **plus** `expect(getByTestId("archived-show-row-walker-archived-2026")).toBeAttached()` — the EXACT fixture, never a `[data-testid^=…]` prefix match (round-5 finding 9) — an empty bucket is a different tree and must fail loudly, not measure nothing |
| **Detach-safety** | each measurement is a single `page.evaluate` reading all rects synchronously in one pass; no `locator.evaluate` sampler that can outlive its element | anchors asserted attached before `scanForPhantomGaps` walks |
| **Env** | `HASH_FOR_LOG_PEPPER` + `JWT_SIGNING_SECRET` required or the harness throws at import (`lib/email/hashForLog.ts:9`) | the workflow already sets both |

### 0.4 Reconciliation sweeps — authored AND RUN, with the command and complete output

**Do not reuse the grep sweeps from spec drafting: they undercounted.** `grep` needs the `className="…"`
and the `/>` on one line, so it missed `components/admin/BulkIgnoreControls.tsx:200` (className spans
lines). The AST census is authoritative. It is a **one-off measurement, not a shipped guard** (spec §6
descope).

**Sweep A — census command.** Written to a scratch file and run with the repo's own `tsx`:

**The complete script, runnable as-is** (`pnpm dlx tsx <file>` from the repo root). T0 commits it to
tools/one-off/childless-growable-census.ts; it is reproducible now, not deferred:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const GROWABLE =
  /(^|[\s:])(flex-1|grow|flex-auto|basis-full)($|[\s])|(^|[\s:])(flex|grow|basis)-\[[^\]]*\]/;
const VOID_TAGS = new Set(["input", "img", "br", "hr", "source", "track", "area", "col"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (f.endsWith(".tsx")) out.push(f);
  }
  return out;
}

type Row = { file: string; line: number; bucket: "dom" | "component"; kind: "growable" | "opaque" };
const rows: Row[] = [];
let files = 0;
let childlessWithClass = 0;

for (const abs of [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))]) {
  files += 1;
  const sf = ts.createSourceFile(abs, readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (n: ts.Node): void => {
    let attrs: ts.JsxAttributes | undefined;
    let tag = "";
    if (ts.isJsxSelfClosingElement(n)) {
      tag = n.tagName.getText(sf);
      attrs = n.attributes;
    } else if (ts.isJsxElement(n)) {
      const kids = n.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces));
      if (kids.length === 0) {
        tag = n.openingElement.tagName.getText(sf);
        attrs = n.openingElement.attributes;
      }
    }
    const isDom = /^[a-z]/.test(tag);
    if (attrs && !(isDom && VOID_TAGS.has(tag))) {
      const cn = attrs.properties.find(
        (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText(sf) === "className",
      );
      const style = attrs.properties.find(
        (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText(sf) === "style",
      );
      const styleGrowable = style
        ? /flexGrow\s*:\s*(?!0)|flex\s*:\s*["'`]?\s*[1-9]/.test(style.getText(sf))
        : false;
      if (cn?.initializer || styleGrowable) {
        if (isDom) childlessWithClass += 1;
        const parts: string[] = [];
        let opaque = false;
        const collect = (e: ts.Node): void => {
          if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) parts.push(e.text);
          else if (ts.isTemplateExpression(e)) {
            parts.push(e.head.text);
            for (const sp of e.templateSpans) parts.push(sp.literal.text);
          } else if (ts.isConditionalExpression(e)) { collect(e.whenTrue); collect(e.whenFalse); }
          else if (ts.isArrayLiteralExpression(e)) { for (const el of e.elements) collect(el); }
          else if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)
                   && e.expression.name.getText(sf) === "join") collect(e.expression.expression);
          else if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            collect(e.left); collect(e.right);
          } else opaque = true;
        };
        if (cn?.initializer) {
          const i = cn.initializer;
          if (ts.isStringLiteral(i)) parts.push(i.text);
          else if (ts.isJsxExpression(i) && i.expression) collect(i.expression);
          else opaque = true;
        }
        const text = parts.join(" ");
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        const bucket = isDom ? "dom" : "component";
        if (styleGrowable || GROWABLE.test(text)) rows.push({ file: abs.slice(ROOT.length + 1), line: line + 1, bucket, kind: "growable" });
        else if (opaque) rows.push({ file: abs.slice(ROOT.length + 1), line: line + 1, bucket, kind: "opaque" });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
rows.sort((a, b) => (a.file + String(a.line)).localeCompare(b.file + String(b.line)));
console.log(`files=${files} childlessDomWithClassName=${childlessWithClass} rows=${rows.length}`);
for (const r of rows) console.log(`  ${r.bucket}/${r.kind}  ${r.file}:${r.line}`);
```

**Sweep A — complete output: 17 rows (244 files walked, 109 childless DOM elements with a className).
All 17 disposed; none omitted.**

DOM tag, growable (8):

| Site | Disposition |
| ---- | ----------- |
| `components/admin/wizard/step3ReviewSections.tsx:916` | **T2** deletes it |
| `components/admin/BellPanel.tsx:323` | **T3** deletes it, `ml-auto` on both trailing branches |
| `components/admin/nav/AdminNav.tsx:144` | **T3** deletes it, `ml-auto` on the cluster at `components/admin/nav/AdminNav.tsx:146` |
| `components/admin/nav/OnboardingTopBar.tsx:67` | **T3** deletes it, `ml-auto` on the cluster at `components/admin/nav/OnboardingTopBar.tsx:69` |
| `components/admin/wizard/step3ReviewSections.tsx:2150` | **T4** floors it (`min-w-4`) |
| `components/admin/BulkIgnoreControls.tsx:200` | untouched — already-repaired precedent (`hidden` + `min-w-6`) |
| `components/admin/OnboardingWizard.tsx:196` | untouched — **measured safe** (sweep B) |
| `components/crew/RightNowHero.tsx:549` | untouched — **reasoned safe** (sweep B) |

DOM tag, unresolvable className (5) — all fixed-size today, none touched:
`components/admin/BellPanel.tsx:575`, `components/admin/BellPanel.tsx:611`,
`components/admin/review/ShowReviewSurface.tsx:947`,
`components/admin/review/ShowReviewSurface.tsx:1013`,
`components/admin/settings/DeveloperToggleButton.tsx:96`.

Component tag, growable (2) — neither touched:
`components/admin/showpage/ShowReviewModalSkeleton.tsx:152` (spec §1.1 item 7 — its row is
`flex w-full items-center gap-2` with one sibling, so the bar always has width) and
`components/admin/telemetry/EventFilters.tsx:74` (`<FilterTextInput />` renders an `<input>`, not a
spacer).

Component tag, unresolvable className (2) — neither touched:
`components/admin/ReSyncButton.tsx:339`, `components/admin/wizard/step3ReviewSections.tsx:2061`.

**Sweep B — the two untouched growable sites, closed by measurement not assumption:**

- `components/crew/RightNowHero.tsx:549` — N progress segments, all `h-1.5 flex-1`, share
  `flex items-stretch gap-1.5` equally. `progressTotal` is show days (small); at 320px with 7 segments
  each still gets ~36px. **Safe.**
- `components/admin/OnboardingWizard.tsx:196` — childless `h-px max-w-[60px] flex-1` connector inside
  `<nav className="flex items-center gap-2 sm:gap-3">` (`components/admin/OnboardingWizard.tsx:132`), a
  gapped row, so a collapse would charge 8px either side of each of two connectors.
  **Measured: 50.3px at 320px, capped at 60px from 360px up, no nav overflow at
  320/360/375/390/430/640/768/1024.** Safe — below `sm` only the active step's label renders
  (`components/admin/OnboardingWizard.tsx:183`). Its pre-existing `max-w-[60px]` is **out of scope**.

**Sweep C — arbitrary growable tokens.**
Command: `grep -rnoE 'flex-\[[^]]+\]' components/ app/` → **0 hits.**

**Sweep D — tests asserting any of the five repaired spacers exist.**
Command: `grep -rn 'flex-1' tests/ | grep -E 'BellPanel|AdminNav|OnboardingTopBar|step3ReviewSections'`
→ **0 hits.** No test update needed.

**Sweep E — `ModalSectionChrome` usages, all of which T2 must cover.**
Command: `grep -n '<ModalSectionChrome' components/admin/wizard/step3ReviewSections.tsx` →
`components/admin/wizard/step3ReviewSections.tsx:1000` (via `BreakdownSection`),
`components/admin/wizard/step3ReviewSections.tsx:3405` (wizard agenda),
`components/admin/wizard/step3ReviewSections.tsx:3454` (published agenda).
The `sub` variant arrives via the context provider at
`components/admin/wizard/step3ReviewSections.tsx:3714-3715` and
`components/admin/wizard/step3ReviewSections.tsx:3769-3770` (Diagrams), both hardcoding `flagged: false`.

**Sweep F — callers of the two count predicates (T1's shared boundary).**
Command: `grep -rn 'shouldShowSectionCount' components/ app/ lib/` → exactly one caller,
`ModalSectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:876`). The legacy
`BreakdownSection` count renders on `count !== null` at
`components/admin/wizard/step3ReviewSections.tsx:1010`. **Both change in T1.**

### 0.5 New files and their wiring — VERIFIED, and done in T0 BEFORE any assertion

| New file | Wiring required |
| -------- | --------------- |
| tests/e2e/section-header-layout.layout.spec.ts | `standalone.config.ts` `testMatch` entry + `phantom-gap-e2e.yml` run step **and path filter** |
| tests/e2e/pusher-alignment.layout.spec.ts | same |
| tests/e2e/\_sectionHeaderCellHarness.tsx | new harness emitting the 15 matrix cells; needs a `phantom-gap-e2e.yml` **path filter** entry (it is not a spec, so it is never matched by `testMatch`) |
| tests/e2e/\_pusherRowsHarness.tsx | new real-component harness for the three pusher rows; same path-filter requirement |
| tests/e2e/\_sectionHeaderLiveEntry.tsx | new **live** (browser-bundled) entry that `createRoot`-renders the real header and exposes a `window` hook to push new props under an unchanged `key`; required for the same-key compound cases. Same path-filter requirement. |
| tests/e2e/\_sectionHeaderBundle.mjs | esbuild bundle step for the live entry, modelled on `tests/e2e/_step3ReviewModalBundle.mjs`; **reused, not reinvented** — same flags and `process` banner shim. Same path-filter requirement. |
| tools/one-off/childless-growable-census.ts | none (not a test) |

`standalone.config.ts:35` `testMatch` is a hardcoded regex allow-list whose own comment at `tests/e2e/standalone.config.ts:29-31`
warns that "a new standalone spec is NOT discovered until its name is added here. A spec file that
merely exists runs nowhere and silently proves nothing."

**Path filters are a separate failure mode from `testMatch`.** `phantom-gap-e2e.yml:27-59` lists
specific e2e files; the initial PR happens to trigger the job through its `components/**` edits, but a
later PR touching **only** a new spec or the new harness would skip the job entirely — the repo's
documented CI-dark class. T0 adds all three new paths to the filter list.

Unit tests added to existing files need no config edit: `BASE_INCLUDE` is
`["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`) and `tests/components/**`
matches `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:65`), correct for DB-free tests.

### 0.6 Snippet typecheck gate

Every snippet in a task body is typechecked against the repo tsconfig (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`) before dispatch. Traps specific to this work: never bare-index
`Range.getClientRects()` or `querySelectorAll` results (use `Array.from`), and
`getComputedStyle(el).minWidth` is a string — compare `parseFloat(...)`, not `=== 16`.

### 0.7 Pre-code mechanical UI sweep — runs BEFORE T1, not after

The `AGENTS.md` pre-code mechanical gate is a **discovery** step, so it runs first (T0's final step),
not alongside the impeccable verifier in T11: em-dash ban in user-visible copy, apostrophe literals,
44px tap targets (`min-h-tap-min` and companions), canonical type/token classes
(`text-xs/relaxed`, `text-subtle`). Findings are fixed inside the task that owns the surface.

---

## 1. Tasks

### T0 — test infrastructure, so every later RED is executable  `infra:`

Nothing in T0 changes product behaviour, so it has no RED step of its own; its proof is that the two
new specs are **discovered** and that the harness emits the 15 cells.

1. Create tests/e2e/\_pusherRowsHarness.tsx — a real-component harness mounting `BellPanel`'s action
   row (BOTH `entry.isAutoResolving` branches), `AdminNav`, and `OnboardingTopBar` via the
   **`tsx`-subprocess pattern** (`tests/e2e/_step3ReviewModalHarness.tsx:235-243` documents why a
   standalone spec cannot import a JSX tree directly: Playwright's transform rewrites JSX in every
   `.tsx` it loads, so `react-dom/server` cannot render it). Without this, T3 has nothing real to
   mount and would drift into synthetic markup that does not test the product components.

   **Two seams must be opened, and round 3 was right that the plan had not named them:**
   - **BellPanel's action row is unreachable as written.** `ActionCell` is private
     (`components/admin/BellPanel.tsx:259`) and server-rendering `<BellPanel>` yields only its initial
     loading state, so neither `isAutoResolving` branch can be emitted.

     **The state boundary, specified** (round 4 correctly noted `entry` + `onResolve` is insufficient):
     `ActionCell` owns `resolving` (`components/admin/BellPanel.tsx:259-279`) and the false branch uses it
     for the button's `disabled`/`aria-busy` and its pending copy (`components/admin/BellPanel.tsx:332-342`). So the **exported
     `BellActionRow` owns that state itself** — the `resolving` `useState`, the `onResolve` invocation, and
     the pending-label selection move WITH the markup — and `ActionCell` becomes a thin wrapper that
     renders `<BellActionRow entry={entry} onRefetch={onRefetch} />`. Nothing is left behind that the
     harness cannot reach.

     **This is a characterization-guarded refactor, not a feature**, and is labelled as such rather than
     dressed up as TDD (round-4 finding 3): the parity test is
     tests/components/admin/bellActionRowParity.test.tsx, run with
     `pnpm vitest run tests/components/admin/bellActionRowParity.test.tsx`. It is written **against the
     current `ActionCell` output BEFORE the extraction** (rendering `BellPanel` hydrated with a stubbed
     feed so `ActionCell` is reachable), snapshotting the accessible tree for both `isAutoResolving`
     branches including the resolving/pending state; it must stay green **through** the extraction. A
     refactor's guard cannot be red first — saying so is more honest than inventing a RED.
   - **AdminNav needs `PathnameContext`, NOT `AppRouterContext`** — round 4 corrected this and was right.
     `usePathname()` reads `PathnameContext` from Next's hooks-client-context shared-runtime module
     (Next's installed navigation client module, in the `usePathname` body), and the modal
     precedent covers `useRouter()`, a different hook. With no provider it returns `null` and
     `isNavItemActive()` calls `pathname.startsWith(...)` (`components/admin/nav/navConfig.ts:64-68`), so
     the harness would crash before rendering. T0 wraps `AdminNav` in **`PathnameContext.Provider`** with
     a concrete pathname (`"/admin"`), and adds `AppRouterContext.Provider` only if a mounted descendant
     genuinely calls `useRouter()`. `OnboardingTopBar` needs no seam.
2. Create tests/e2e/\_sectionHeaderCellHarness.tsx — a `tsx`-runnable harness (same main-guard pattern
   as `tests/e2e/_step3ReviewModalHarness.tsx`) emitting **one static tree per matrix cell** from the
   §1.1 input table below. The existing harness only emits fixed `normal` / `linkOnly` / `long` /
   `resolution` trees (`tests/e2e/_step3ReviewModalHarness.tsx:249-273`) and cannot produce the
   defensive, partial-provider, or status combinations, which is why a new harness is required.
3. Create both spec files with a single trivially-passing smoke assertion each, add their names to
   `standalone.config.ts:35` `testMatch`, and add **all SIX new paths (enumerated below)** to `phantom-gap-e2e.yml`'s path
   filters. **SIX entries, enumerated so an implementer cannot miscount** (round-5 finding 5 — the
   earlier "FIVE" was arithmetically wrong because the bundle script needs a filter of its own):
   1. tests/e2e/section-header-layout.layout.spec.ts
   2. tests/e2e/pusher-alignment.layout.spec.ts
   3. tests/e2e/_sectionHeaderCellHarness.tsx
   4. tests/e2e/_pusherRowsHarness.tsx
   5. tests/e2e/_sectionHeaderLiveEntry.tsx
   6. tests/e2e/_sectionHeaderBundle.mjs
   Plus two run steps. A helper is never matched by `testMatch`, so omitting any one leaves a later
   helper-only PR CI-dark.
4. **Add the two mandatory `PATH_GATED` rows** to `LOCAL_ONLY_ALLOWLIST`
   (`tests/ci/_metaE2eWorkflowCoverage.test.ts:24-35`) — mandatory, not conditional (§0.1) — and **run
   the meta-test**: `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts`, expected green.
4. Commit tools/one-off/childless-growable-census.ts (§0.4 sweep A).
5. Run the §0.7 mechanical sweep and record findings against the tasks that own them.
6. **Proof of discovery AND execution — `--list` alone is not enough** (round-3 finding 4): a listed
   spec can still fail to run. Both specs must be RUN and PASS before the T0 commit:
   - `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts` → **1 passed** (the smoke case), never "No tests found".
   - `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/pusher-alignment.layout.spec.ts` → **1 passed**.
   - `pnpm dlx tsx tests/e2e/_sectionHeaderCellHarness.tsx /tmp/cells.json && node -e "const c=require('/tmp/cells.json');const n=Object.keys(c.cells).length;if(n!==15)throw new Error('expected 15 cells, got '+n);if(!c.hairline)throw new Error('missing hairline fixture')"` → exits 0. **The hairline fixture is proven here too** (round-4 finding 3: T4 depended on a T0 deliverable that T0 neither built nor proved).
   - **Hydrated same-key smoke for the live entry**, so T2's first compound case cannot fail on bundle or
     hydration infrastructure instead of on its assertion: bundle the live entry, load it, wait for the
     readiness flag, call the update hook once with a changed pill state, and assert the DOM changed while
     the root node identity did NOT (same `key`). Expected: **1 passed**.
7. Commit.

#### T0.1 — the 15-cell fixture input table (metadata must never be the oracle)

Each cell is a distinct harness input. Spec §4.1a gives the reachable classes; the statuses per row are
the reachable ones only.

| Cell | heading TEXT (distinct per cell) | `dfid` | `sectionId` | `headingLevel` | `count` | status | expect link | expect pill |
| ---- | ------ | ----------- | -------------- | ------- | ------ | ----------- | ----------- |
| G1-clean | `Rooms & scope` | `"drive-abc"` | `"rooms"` | 3 | `4` | clean | yes | no |
| G1-flagged | `Sheet warnings` | `"drive-abc"` | `"warnings"` | 3 | **`128`** | flagged | yes | amber |
| G1-judgment | `Contacts` | `"drive-abc"` | `"contacts"` | 3 | `4` | judgment | yes | info |
| G2-clean | `Venue` | `"drive-abc"` | `"venue"` | 3 | `null` | clean | yes | no |
| G2-flagged | `Crew schedule` | `"drive-abc"` | `"schedule"` | 3 | `null` | flagged | yes | amber |
| G2-judgment | `Billing & docs` | `"drive-abc"` | `"billing"` | 3 | `null` | judgment | yes | info |
| G3-clean | `Report an issue` | `"drive-abc"` | `"report"` | 3 | `null` | clean | **no** | no |
| G4-clean | `Diagrams` | `undefined` | `undefined` | **4** | `null` | clean | **no** | no |
| G5-clean | `Standalone partial` | `undefined` | `undefined` | 3 | `null` | clean | **no** | no |
| G6a-clean | `Defensive counted clean` | `""` | `"rooms"` | 3 | `4` | clean | **no** | no |
| G6a-flagged | `Defensive counted flagged` | `""` | `"rooms"` | 3 | `4` | flagged | **no** | amber |
| G6a-judgment | `Defensive counted judgment` | `""` | `"rooms"` | 3 | `4` | judgment | **no** | info |
| G6b-clean | `Defensive uncounted clean` | `""` | `"venue"` | 3 | `null` | clean | **no** | no |
| G6b-flagged | `Defensive uncounted flagged` | `""` | `"venue"` | 3 | `null` | flagged | **no** | amber |
| G6b-judgment | `Defensive uncounted judgment` | `""` | `"venue"` | 3 | `null` | judgment | **no** | info |

**Independent cell-membership proof (mandatory).** Before using any cell's geometry, the test asserts
that cell's *rendered* identity: **the heading's exact TEXT** (distinct per cell — round 2 correctly
noted that G3/G5/G6b-clean were otherwise indistinguishable, all being `h3` + countless + linkless +
pill-free, so three copies of one fixture would have passed), the heading tag (`h3`/`h4`), the count
chip's rendered text or absence, the sheet link's presence **and its derived `href` + testid** where
one is expected, and the pill's presence + tone. Without all of that the metadata becomes the oracle.

**Coverage note:** G1-flagged deliberately carries `Sheet warnings` with a **three-digit count (128)**,
which is the exact content that produces spec §3.1.5's **−17px** offset. Without it T2's claim to
reproduce every listed offset would be unmeetable, since every other counted cell uses a single digit.

### T1 — non-finite count boundary  `fix(admin):`

Split from the header rebuild: it is logically independent, reviewable on its own, and its RED test
justifies its own implementation.

1. **RED** — new unit test asserting **both** render paths reject `NaN`, `Infinity`, and `-Infinity`:
   the modal path through `shouldShowSectionCount`, and the legacy `BreakdownSection` path that renders
   on `count !== null` (`components/admin/wizard/step3ReviewSections.tsx:1010`).
   - Command: `pnpm vitest run tests/components/admin/wizard/sectionCountBoundary.test.tsx`
   - Expected failure: **all six cases fail** — the modal path and the legacy path each accept `NaN`,
     `Infinity`, and `-Infinity` today, so the legacy path renders `(NaN)` and the modal path's helper
     returns true for all three. Test titles: `rejects NaN (modal path)`, `rejects Infinity (modal
     path)`, `rejects -Infinity (modal path)`, and the same three for `(legacy path)`.
2. **GREEN** — add exported `hasRenderableCount(count: number | null): boolean` →
   `count !== null && Number.isFinite(count)`; call it first inside `shouldShowSectionCount`
   (`components/admin/wizard/step3ReviewSections.tsx:708-714`), and **replace** the legacy conditional at
   `components/admin/wizard/step3ReviewSections.tsx:1010` with it. Membership and zero-suppression
   semantics unchanged.
   - PASS command: same.
   - **Regression suites re-run before committing** (round-2 finding 5): `pnpm vitest run
     tests/components/admin/wizard/sectionCountChip.test.ts
     tests/components/admin/showpage/flaggedZeroCountHeader.test.tsx` — these pin the membership and
     flagged-zero-suppression behaviour this task claims to leave unchanged, so the claim is proven
     rather than asserted.
3. Commit.

### T2 — `ModalSectionChrome` header rebuild  `feat(admin):`

Covers all three call sites (sweep E) and both heading levels. **Failure mode caught:** a flagged
section header at phone width crushes its own name — 2 lines at 375px, 5 lines and 124px of row height
at 320px.

1. **RED** — fill in tests/e2e/section-header-layout.layout.spec.ts against T0's harness, over all 15
   cells at 320/375/430/1280.
   - Command: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts`
   - Expected failure: name occupies 2 line boxes at 375px and 5 at 320px on the flagged counted cells.
   - Assertions:
     - **Cell membership** first, per T0.1.
     - **Name line count + heights:** exactly one text line box per cell; header 44px with no pill,
       72.8px with one. *Anti-tautology:* count lines from `Range.getClientRects()` on the name's own
       TEXT NODE, never the heading's bounding box — the box is inflated by the link and reports
       "1 line" even when the text wraps. Set `box-sizing: content-box` on the width-pinned wrapper.
     - **Width chain (spec §5), ±0.5px:**
       `registrySection.width === pane.clientWidth − paddingLeft − paddingRight` (the pane carries
       `p-tile-pad` and `clientWidth` INCLUDES padding, so a naive equality is off by 40px), then
       `breakdownSection`, `outerColumn`, `headerLine`, `pillLine`, and
       `panelCard.width === outerColumn.width`.
     - **The five remaining §5 invariants, each its own assertion:** status icon exactly 28px (24px when
       `sub`) and does not shrink; centred group absorbs all free width; sheet-link box exactly 20px;
       heading shrinks without overflowing its parent; count keeps its intrinsic width.
     - **Centring (spec §9.1):** formula oracle `+4px − (6px gap + measured count width) / 2` using the
       COUNT element's own measured box; name text centre within **±2px** of it, and §3.1.5's per-state
       offsets reproduced within **±1px**.
     - **Hit target:** `document.elementFromPoint` returns the link or a descendant just inside all four
       edges of the intended 44×44 area, and not just outside. **Not** a rect read — the anchor's rect
       stays 20×20 and excludes the `before:` overlay.
     - **Accessible names:** link name still `Open the source sheet for <label>`; heading name is the
       section name WITHOUT the count.
     - **Pill line keyed to the PILL, not `flagged`:** clean ⇒ exactly one child line and no pill wrapper
       in the DOM; flagged ⇒ two lines + amber pill; judgment ⇒ two lines + info pill.
     - **Header line height is asserted SEPARATELY from the total** (round-2 finding 8):
       `headerLine.height === 44px` in **every** cell including pill states, distinct from the whole
       header being 44px (no pill) or 72.8px (pill). Otherwise an implementation could hit the right
       total while shrinking or growing the first line.
     - **Transition audit (T7's inventory), in this same task and commit:** the 12-state loop and the
       five compound cases described in T7. They belong here because they can only be red against the
       post-rebuild structure, and a straddled task would violate commit-per-task.
2. **GREEN** — implement spec §3.1: delete the `components/admin/wizard/step3ReviewSections.tsx:916` spacer; outer column
   `flex w-full flex-col items-stretch gap-1.5` carrying the existing `mb-2`/`mb-3` with the panel card
   at `components/admin/wizard/step3ReviewSections.tsx:942` staying a sibling OUTSIDE it; header and
   pill lines each `w-full`; centred group `flex min-w-0 flex-1 items-center justify-center gap-1.5`
   plus `pr-header-link-slot` when `linkless`; add `--spacing-header-link-slot: 30px` to the `@theme`
   spacing block in `app/globals.css` beside `--spacing-tap-min` with a measured comment
   (`app/globals.css:169` `--spacing-confirm-box` is the style precedent) — **not** `pr-[30px]`, which
   `DESIGN.md:361` forbids; count inside the group, outside `<Heading>`; sheet link → corner glyph
   (`relative inline-grid size-5 shrink-0 place-items-center rounded-sm` + **`before:-inset-3`**,
   tokenized per `components/admin/HoverHelp.tsx:547`; glyph `size-3.5` → `size-4`; existing
   `aria-label`/`target`/`rel` unchanged); pill on its own `w-full justify-center` line, **no wrapper
   emitted when there is no pill**.
   - PASS command: same. Counts are stated as **`test()` cases, not assertions** (round-2 finding 7):
     one Playwright case per (cell × width) named `section-header <cell> @ <width>` ⇒ **60 cases**, plus
     `header transitions: <state>` × 12 and `header transitions: compound <n>` × 5 ⇒ **77 Playwright cases**
     in this spec after T2, plus the **2 Vitest cases** of the conditional-inventory test — counted
     separately because they run in a different runner (round-4 finding 1: the 77 did not account for it).
3. Delete the 2 `KNOWN_SHOW_MODAL_PHANTOM_ITEMS` rows
   (`tests/e2e/admin-layout-dimensions.spec.ts:500`) — the repair makes them stale and the stale-row
   assertion fails if they are kept. **Then re-run the probe that owns them, before committing**
   (round-2 finding 5): `pnpm exec playwright test --project=desktop-chromium
   tests/e2e/admin-layout-dimensions.spec.ts -g "T-NOPHANTOM-SHOW"` — a ledger deletion is load-bearing,
   so it must be proven green in this task rather than at final verification.
4. Commit.

### T3 — three childless pushers → `ml-auto`  `fix(admin):`

Per spec §9.3 the two parts catch different failures and **neither substitutes for the other**: (a) a
spacer that exists or returns, (b) a missing `ml-auto`.

1. **RED** — fill in tests/e2e/pusher-alignment.layout.spec.ts. **Per site, never aggregated** (an
   aggregate can go red on the nav rows while never exercising BellPanel).
   - **(a) Per the APPROVED spec §9.3, which this plan does not get to override.** Round 5 correctly
     caught that an earlier draft replaced the spec's oracle at all three sites with structural absence;
     the spec reserves that for BellPanel alone. Restored:
     - **`components/admin/nav/AdminNav.tsx:144` and `components/admin/nav/OnboardingTopBar.tsx:67` —
       CROWDED-ROW REALIZED ZERO-EXTENT**, as spec §9.3 requires: mount each row from
       tests/e2e/\_pusherRowsHarness.tsx in a deliberately crowded fixture and assert no in-flow child
       has zero main-axis extent. The crowding width is an **output of T0**, which measures each row's
       spacer across 320-1280 and records the width at which it reaches 0; T3 pins its fixture below
       that and cites the measured number. If T0's measurement shows a row cannot be driven to zero at
       any supported width, that is a spec-level finding and T3 escalates it rather than silently
       substituting a different oracle.
     - **`components/admin/BellPanel.tsx:323` — STRUCTURAL ABSENCE**, per spec §9.3, because its row is
       `flex-wrap` (`components/admin/BellPanel.tsx:288`): narrowing moves the trailing item to a new
       line and the spacer regains that line's free width, so zero extent occurs only at a calibrated
       boundary. Assert the action row directly contains no childless growable child.
   - **(b)** trailing cluster's right edge flush with the parent content-box right edge (±0.5px) at a
     wide width; no overflow at 320px. For `BellPanel`, **both** mutually exclusive trailing branches —
     `entry.isAutoResolving` true (auto-note `<p>`) and false (resolve `<button>`),
     `components/admin/BellPanel.tsx:324-338` — unwrapped at a wide width and wrapped at 320px for EACH.
   - Command: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/pusher-alignment.layout.spec.ts`
   - Expected failure: all three part-(a) assertions fail (spacer present / zero-extent).
2. **GREEN** — delete each spacer; `ml-auto` on `BellPanel`'s auto-note `<p>` AND resolve `<button>`, on
   `AdminNav`'s cluster at `components/admin/nav/AdminNav.tsx:146`, and on `OnboardingTopBar`'s cluster
   at `components/admin/nav/OnboardingTopBar.tsx:69`. `ml-auto` not `justify-between` —
   `components/admin/CompactAlertCard.tsx:138` records why.
   - PASS command: same. Named cases, counted as `test()` cases: `pusher absence: bell-panel`,
     `pusher absence: admin-nav`, `pusher absence: onboarding-top-bar` (3); `pusher alignment:
     bell-panel auto-note @ wide`, `… auto-note @ 320`, `… resolve-button @ wide`, `… resolve-button @
     320` (4); `pusher alignment: admin-nav @ wide`, `… @ 320`, `pusher alignment: onboarding-top-bar @
     wide`, `… @ 320` (4) ⇒ **11 cases**.
3. Commit.

### T4 — event-detail hairline floor  `fix(admin):`

**Measured branch (spec §3.2): floor only, no breakpoint** — 22.94px at the narrowest real row (240px),
reaching 0 only at ≤215px.

1. **RED** — the mount was missing and round 3 was right: T0's cell harness emits only the 15
   `ModalSectionChrome` cells, not the separate `EventDetailsBreakdown` hairline. **T0's cell harness
   gains one additional fixture** rendering the real `EventDetailsBreakdown`
   (`components/admin/wizard/step3ReviewSections.tsx:2099-2150`) with event-detail data whose only
   populated group is **"Wardrobe & key moments"** — the longest of the five titles
   (`components/admin/wizard/step3ReviewSections.tsx:386-401`) — inside a 240px-wide container. T0 adds
   `data-testid="event-detail-group-rule"` to the rule so the selector is not positional, and the label is
   its preceding sibling. Then in tests/e2e/section-header-layout.layout.spec.ts assert all three:
   (a) the rule is DRAWN (`width > 0`); (b) the resolved `min-width` is exactly **16px**; (c) the label
   does **not** wrap.
   - Command: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts -g "hairline"`
   - Expected failure: **the single case fails on assertion (b)** — (a) and (c) already hold on the
     no-floor tree (22.94px, no wrap), which is exactly why (b) is what makes this task red. One
     Playwright case named `hairline floor @ 240px row`, so the runner reports **1 failed** in RED and
     **1 passed** in GREEN — not "1 failing / 1 passing", which was incoherent (round-3 finding 5).
   - *Anti-tautology:* a short title cannot collapse, so the longest is mandatory or the test is vacuous.
2. **GREEN** — add `min-w-4` to `components/admin/wizard/step3ReviewSections.tsx:2150`. No breakpoint.
   - PASS command: same; expect **1 passing case** (`hairline floor @ 240px row`).
3. Commit.

### T5 — TravelRow eyebrow `empty:hidden`  `fix(crew-page):`

1. **RED** — extend the existing real-route crew spec `tests/e2e/crew-layout-dimensions.spec.ts` (it is
   already mounted by `phantom-gap-e2e.yml`'s `-g "T-NOPHANTOM-CREW"` step, so no new wiring). Measure
   as **sibling DISPLACEMENT** (spec §9.2 test 8): an empty `<p>` can be zero-height and still displace
   via the parent's gap, so "eyebrow height is 0" passes before the fix. For a **blank** eyebrow the
   primary line's top equals the `.tcol` stack's content-box top with **no 2px displacement**; for a
   **labelled** eyebrow the displacement equals eyebrow height **plus** the 2px `gap-0.5`.
   - Command: `pnpm exec playwright test --project=mobile-safari tests/e2e/crew-layout-dimensions.spec.ts -g "eyebrow displacement"`
   - Expected failure: blank-eyebrow displacement measures 2px, expected 0.
   - **Chosen, not left open** (round-2 finding 7): the case is named
     `T-NOPHANTOM-CREW [eyebrow displacement]` so it is selected by the workflow's existing
     `-g "T-NOPHANTOM-CREW"` step with **no workflow edit**. T5 verifies it actually ran by checking the
     reported case count rose by 2, not merely that CI was green.
2. **GREEN** — add `empty:hidden` to `components/crew/sections/TravelSection.tsx:124`. (Verified by
   compilation: `.empty\:hidden { &:empty { display: none } }` generates.)
   - PASS command: same; expect **2 passing cases** —
     `T-NOPHANTOM-CREW [eyebrow displacement] blank leg` and `… labelled leg`.
3. Delete the 2 `KNOWN_CREW_PHANTOM_ITEMS` rows (`tests/e2e/crew-layout-dimensions.spec.ts:1037`), then
   **re-run the probe that owns them before committing**: `pnpm exec playwright test
   --project=mobile-safari tests/e2e/crew-layout-dimensions.spec.ts -g "T-NOPHANTOM-CREW"`.
4. Commit.

### T6 — archived-bucket probe  `test(admin):`

**Test first, seed second** — the reverse of the earlier draft, which added the seed before the
assertion and so had no red proof.

1. **RED** — add `T-NOPHANTOM-DASH [archived]` at both existing widths (390, 1280) against
   `/admin?bucket=archived`. **The non-vacuity gate anchors `archived-show-row-walker-archived-2026` from
   the outset** — that exact testid, never a `[data-testid^='archived-show-row-']` prefix match, so an
   unrelated archived show can neither satisfy the gate nor mask the fixture's absence (round-4 finding 4).
   - **Anchor the EXACT fixture row, and prove THAT row absent — not "any archived show".** Round 4
     corrected my previous answer: `_locked_seed_ids` matches only `drive_file_id like 'seed-fixture:%'`
     (`supabase/seed.ts:546-552`), so `pnpm db:seed` does **not** remove unrelated archived shows. A
     `count(*) where archived → 0` gate is therefore wrong, and a generic "an archived row is attached"
     gate could pass on an unrelated archived show — making RED unreliable in both directions.
     1. `pnpm db:seed`
     2. Prove the SPECIFIC fixture is absent:
        `psql "$TEST_DATABASE_URL" -At -c "select count(*) from public.shows where slug = 'walker-archived-2026'"` → `0`.
        Unrelated archived rows are allowed to exist and must not affect the outcome.
     3. RED: `pnpm exec playwright test --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts -g "T-NOPHANTOM-DASH \[archived\]"`
   - Expected failure: the attached-row gate fails on an empty archived bucket — precisely the vacuity
     the gate exists to prevent.
2. **GREEN** — add `pnpm dlx tsx supabase/seedWalkerFixtures.ts` after the existing `pnpm db:seed` step
   in `.github/workflows/phantom-gap-e2e.yml`, and run it locally. The fixture already exists:
   `walker-archived-2026` with `archived: true` (`supabase/seedWalkerFixtures.ts:117-123`).
   - Anchor non-vacuity on `archived-show-row-walker-archived-2026`
     (`components/admin/ArchivedShowRow.tsx:48` is the testid template), **captured from a live `visited`
     dump** — `tests/e2e/admin-layout-dimensions.spec.ts:370-376` records why guessing fails.
   - PASS command: same; expect **2 passing cases** (`T-NOPHANTOM-DASH [archived] @ 390` and `@ 1280`).
3. Commit.

### T7 — (folded into T2)

Round 2 was right that a straddled RED/GREEN broke atomicity: T7's failing file would have sat
uncommitted across T1 and T2, T2 would have committed the code that turned it green, and T7 would have
committed only an already-green test — which is not failing-test → implementation → passing-test →
commit. **The transition assertions are therefore part of T2's own RED**, in the same commit as the
header rebuild they govern. This section records the inventory T2 implements.

**Why it must run in the real browser, not Vitest/jsdom.** Round 2 caught that
`getComputedStyle(...).transitionProperty` in Vitest sees jsdom defaults, with no compiled Tailwind
loaded, so it would pass vacuously. Round 3 then caught five further defects in the browser version.
All are addressed below; each bullet names the defect it answers.

**(a) Same-key compounds need a LIVE React root, not static markup.** A static-markup harness cannot
update props under one mounted key, so it cannot prove same-key reconciliation. T0 therefore adds
tests/e2e/\_sectionHeaderLiveEntry.tsx plus an esbuild bundle step, reusing the repo's existing live
pattern (`tests/e2e/_step3ReviewModalLiveEntry.tsx` + `tests/e2e/_step3ReviewModalBundle.mjs`), which
`createRoot`-renders the real component and exposes a `window` hook to push new props **without changing
`key`**. The five compounds are driven through that hook.

**(b) Normal motion, not reduced.** The cell harness sets `reducedMotion: "reduce"` for stable geometry,
which suppresses `motion-safe:` utilities and would let a real animation pass. The transition cases run
with **normal motion** (no `emulateMedia` reduced-motion), stated explicitly so the two case groups do
not share a fixture default.

**(c) EFFECTIVE transitions only.** `transition-property` computes to `all` on ordinary elements even
when `transition-duration` is `0s`, so "does not cover `all`" would fail everywhere. The assertion is
therefore: a violation exists only when `parseFloat(transitionDuration) > 0` **and** the property list
covers a layout property (or is `all`); likewise `animation-name !== "none"` **and**
`parseFloat(animationDuration) > 0`.

**(d) The layout-property set is complete**, not just height/width: `height`, `width`, `padding*`,
`margin*`, `gap`/`row-gap`/`column-gap`, `flex-basis`, `min-width`/`min-height`,
`max-width`/`max-height`, and `transform`.

**(e) Every affected element, not only the three wrappers:** outer column, header line, pill line
(**when present**), centred group, heading, count chip, sheet link, and pill. The sheet link's
`transition-colors duration-fast` is **allowed** — the assertion is that its effective transition covers
no layout property, so a colour-only transition passes and a layout one fails.

**(f) Clean states have no pill line — and there are FOUR of them, not six.** Round 4 caught the
arithmetic: with status(3) × count(2) × link(2) = 12, the pill-less states are the **clean** ones only,
i.e. 1 × 2 × 2 = **4 pill-less** and **8 pill-present**. The 12-state loop skips the pill-line element in
those four states and instead asserts it is **absent from the DOM** — which is also §T2's no-empty-wrapper
contract, checked from the same place.

**(g) "A new conditional fails the audit" is executable — with a CORRECTED registry.** Round 4 was right
that a four-entry registry could not equal the real set, and that I had miscounted what belongs in it.

Scope: the `ModalSectionChrome` function body only (`components/admin/wizard/step3ReviewSections.tsx`),
parsed with the TypeScript AST. Collected: every conditional (`?:` or `&&`) whose branches **produce JSX**.
**Excluded, explicitly:** the status-icon tone ternary at
`components/admin/wizard/step3ReviewSections.tsx:895`, which returns className **strings**, not JSX — so it
is not a render conditional and cannot carry a transition prop.

The pre-rebuild set is **five**, listed so the diff is auditable: count chip at
`components/admin/wizard/step3ReviewSections.tsx:911`, flag pill at `components/admin/wizard/step3ReviewSections.tsx:917`, judgment pill at `components/admin/wizard/step3ReviewSections.tsx:921`, sheet link at `components/admin/wizard/step3ReviewSections.tsx:928`, and the pre-existing section callout at `components/admin/wizard/step3ReviewSections.tsx:955`. Post-rebuild the two pill conditionals
collapse into one pill-line wrapper, giving an expected **four** — but the registry is asserted against the
**post-rebuild** body and its exact membership is recorded in the test at implementation time, not guessed
here. A conditional added later without a transition decision fails until registered.

Named and counted: tests/components/admin/wizard/sectionHeaderConditionalInventory.test.ts, run with
`pnpm vitest run tests/components/admin/wizard/sectionHeaderConditionalInventory.test.ts`, **2 cases**
(set-equality, and the string-ternary exclusion). Deliberately scoped to one function — not the repo-wide
guard descoped in spec §6.

**(h) Framer Motion is rejected at the SOURCE, because computed CSS cannot see it.** Round 4 correctly
noted this had been dropped in the rewrite. JS-driven animation shows up in neither
`transition-duration` nor `animation-name`, so the same inventory test asserts the header subtree's source
contains no `AnimatePresence`, no `motion.*` element, and no `initial`/`animate`/`exit`/`layout` prop.
CSS checks and source checks cover different mechanisms; both are required.

**(i) Comma-separated transition lists are zipped, not head-sampled.** `parseFloat(transitionDuration)`
reads only the FIRST value, so `transition-property: color, height` with
`transition-duration: 0s, 200ms` would slip through. The assertion splits both lists on `,`, pairs them by
index (repeating the duration list per CSS rules when it is shorter), and flags any pair whose duration is
non-zero and whose property is a layout property or `all`. Same treatment for
`animation-name`/`animation-duration`.

**Spec §8 inventory.** Heading level is fixed per call site and cannot transition, so the transitionable
axes are status (clean/flagged/judgment) × count (shown/absent) × link (present/absent) = **12 states,
66 pairs**, every pair **instant — no animation**. The 12-state loop plus (c)-(f) proves no state
attaches an effective layout transition, so no pair can animate; the five compounds cover interleaving.

### T8 — `DESIGN.md` updates  `docs(design):`

(a) the centred section-header pattern with its measured offsets and the `pr-header-link-slot`
compensation rule; (b) an explicit note that a childless **growable** element used as a right-pusher is
replaced by `ml-auto`, not hidden at a breakpoint — the existing §7a decorative-hairline rule does not
cover pushers, which is why five sites drifted; (c) the corrected hairline guidance (measure before
hiding; a rule that never collapses gets a floor, not a breakpoint); (d) **reconcile the now-false
sentence at `DESIGN.md:327`** — both real decorative rules ARE childless spans, so the empty-element
selector DOES match them; the needed distinction is painted-empty-element (keep visible;
`empty:hidden` is wrong for it) vs empty-content-slot (`empty:hidden` is right); (e) document
`--spacing-header-link-slot`; (f) **update §7a's "Current sites" list** at `DESIGN.md:325`, which today
names only `OverviewSection.tsx` and `ScheduleDayRow` — TravelRow becomes a third.

**Class: documentation task** (see the prologue) — no RED exists for prose, so the contract is the
verification below rather than a pretended failing test.

1. Verify: `pnpm format:check`, and `pnpm vitest run tests/styles` for the §7a token/contrast meta-tests.
2. **Commit.**

### T9 — backlog lifecycle  `docs:`

BACKLOG.md:5 (root) requires a shipped item to move **wholesale** into `BACKLOG-archive.md` rather than
being annotated in place, or the open queue silently becomes a changelog.

1. **RED first** (round-2 finding 9): add the three shipped ids to `BACKLOG_GRADUATED`
   (`tests/docs/_metaDeferralLedgerGraduation.test.ts:113-119`) and run
   `pnpm vitest run tests/docs` — it fails while the entries are still in the open queue, which is what
   makes this a real TDD task rather than an untested doc edit.
2. Move all three closed entries — `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`,
   `BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW`, `BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET` — into
   `BACKLOG-archive.md` with provenance (branch + spec path).
3. Add `BL-CHILDLESS-GROWABLE-STATIC-GUARD` to the OPEN queue carrying the R1–R3 constraints from spec
   §6: axis-awareness (a one-axis size token is not proof of extent), DOM-vs-component tags
   (`FilterTextInput` renders an `<input>`; `Skeleton` forwards to one div), runtime-empty children
   (`{null}`), style-prop and indirected-style pushers, shrink-to-zero items with no growable token, and
   the unresolved core — how opacity must propagate through composed classNames, with the census
   reconciled against a run (the written rule gives 27 rows, a static-parts prototype gives 17).
4. Verify `pnpm vitest run tests/docs` now passes (the graduation registry and the archive agree).
5. **Commit.**

### T10 — impeccable dual gate (invariant 8)

The §0.7 mechanical sweep already ran in T0. Here: `/impeccable critique` **and** `/impeccable audit` on
the diff, each with the canonical v3 setup gates — the skill's context.mjs context load
(PRODUCT.md + DESIGN.md) → register reference read (brand.md or product.md). P0/P1 fixed or explicitly
deferred via a `DEFERRED.md` entry.

**Disposition artifact:** findings + dispositions are recorded in a new
docs/superpowers/plans/2026-07-25-section-header-rebuild-closeout.md §12. Any resulting code edit is
tested and committed in this task (not folded silently into another), and **T10 ends with an explicit
commit of the close-out document itself** (round-2 finding 9) — `pnpm format:check` is its verification.

### T11 — close-out gate

**Class: close-out gate, not a TDD task.** Whole-diff fresh-eyes Codex review (split by surface per the
tight-scope rule), then **real CI green** as a separate gate from local green, then
`gh pr merge --merge` — **which is this gate's commit** — then fast-forward local `main` and verify
`git rev-list --left-right --count main...origin/main` reports `0  0`. Any code change this gate produces
gets its own RED-first sub-task first.

---

## 2. Task order and why

T0 (infrastructure) → T1 (count boundary) → **T2 (header layout AND transition audit — RED, implement,
PASS, one commit)** → T3 → T4 → T5 → T6 → T8 → T9 → T10 → T11.

**No task straddles another.** The transition audit lives inside T2 because it can only be red against
the post-rebuild structure; §T7 is inventory-only and produces no separate commit. Round 2 flagged the
straddled construction and round 3 correctly caught that this section still described it — it does not
any more.

## 3. Verification before push

`pnpm typecheck` · `pnpm lint` · `pnpm format:check` · full `pnpm test` (not a scoped subset — scoped
gates miss registry suites) · both new Playwright specs under the standalone config · the two extended
real-route specs · `pnpm spec:lint` on the spec and this plan. Then push and watch real CI, treating
green CI as a separate gate from local green.

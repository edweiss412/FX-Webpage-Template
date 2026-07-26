# Plan — section-header rebuild + childless-spacer sweep

**Spec:** `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md` (APPROVED, adversarial round 8).
**Worktree:** `../FX-worktrees/section-header-rebuild`, branch `feat/section-header-rebuild-phantom-spacers`.
**Closes:** `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`, `BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW`, `BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET`.

**Every committed task has a genuine failing contract.** Round 6 was right that classifying work as
"infrastructure", "characterization", "documentation" or a "gate" does not waive invariant 1, which is
non-negotiable. Each task below therefore carries a real RED — and where the obvious framing had none, a
better contract existed and is used:

- **T0a** — an **export contract**: a test importing `BellActionRow` fails to compile/resolve before the
  extraction exists, and passes after. That is a true RED, and it is stronger than the
  characterization-only framing it replaces. The parity snapshot rides alongside as a behaviour guard.
- **T0** — a **wiring contract**: create the two spec files FIRST, then run
  `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts`, which **fails** because two path-gated
  specs exist with no `LOCAL_ONLY_ALLOWLIST` rows. Add the rows and the filters; it passes. The specs'
  own discovery (`No tests found` → `1 passed`) is a second red-to-green in the same task.
- **T8** — a **documentation contract**: extend the §7a site list check so it asserts every component
  carrying `empty:hidden` appears in `DESIGN.md`'s "Current sites" list. It fails once T5 adds
  `empty:hidden` to `TravelSection` and `DESIGN.md` has not been updated; T8's edit turns it green.
- **T10** — a **disposition contract**: the close-out doc must exist with a §12 dispositions section, and
  any gate-produced code change gets its own RED-first sub-task before commit.
- **T11** — the merge gate. Its "commit" is `gh pr merge --merge`; any code change it produces takes its
  own RED-first sub-task.

One commit per task, conventional-commits style (invariant 6). All work stays in the worktree
(invariant 11).

**Test infrastructure comes FIRST (T0).** A new standalone Playwright spec is invisible until its name
is in an allow-list, so a plan that defers that edit cannot run any assertion RED — it gets "No tests
found". T0 makes every later RED step actually executable, and each task states its **exact RED
command, expected failure, PASS command, and expected passing count**.

---

## 0. Pre-draft declarations

### 0.1 Meta-test inventory

**CREATES two** (tests/docs/designSevenAEmptyHiddenSites.test.ts for T8's documentation contract, and tests/components/admin/wizard/sectionHeaderConditionalInventory.test.ts for T2's conditional registry). **EXTENDS one** (`tests/ci/_metaE2eWorkflowCoverage.test.ts`, see the table). The static guard that would have created one is **DESCOPED** by spec §6
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
| **Readiness gate** | *Static cell/pusher harnesses:* `waitUntil: "load"` **plus** `emulateMedia({ reducedMotion: "reduce" })` so entrance animation is collapsed and geometry is final. *Live transition root (separate contract):* wait on an explicit **hydration readiness flag set from a mounted component's `useEffect`/`useLayoutEffect`, NOT immediately after `createRoot(...).render`** — React commits asynchronously, so code following `render()` is not a commit gate and a synchronous `page.evaluate` could measure an empty or stale root (round-5 finding 4). The test awaits **both** that flag **and** the expected root element being attached before measuring. Run with **NORMAL motion** — no reduced-motion emulation, since that would suppress `motion-safe:` utilities the audit exists to catch. **Never `networkidle` alone.** | existing `expect(getByTestId("admin-dashboard")).toBeVisible()` **plus** `expect(getByTestId("archived-show-row-walker-archived-2026")).toBeAttached()` — the EXACT fixture, never a `[data-testid^=…]` prefix match (round-5 finding 9) — an empty bucket is a different tree and must fail loudly, not measure nothing |
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

### T0a — extract `BellActionRow`  `refactor(admin):`

Split out of T0 (round-5 finding 8): it is a product refactor with its own responsibility and its own
conventional scope, and bundling it with six e2e files plus workflow wiring made a single `infra:` commit
that mixed unrelated concerns.

**RED contract: an export contract.** Round 7 correctly caught that the prologue promised this while this
body still said a refactor guard cannot be red first. It can — the export does not exist yet.

1. **RED** — write tests/components/admin/bellActionRow.export.test.tsx importing `BellActionRow` from
   `components/admin/BellPanel` and rendering it for both `isAutoResolving` branches.
   Command: `pnpm vitest run tests/components/admin/bellActionRow.export.test.tsx`
   Expected failure: **1 failed** — the module has no `BellActionRow` export, so the import is
   unresolved. This is a true RED before any implementation.
2. Additionally write tests/components/admin/bellActionRowParity.test.tsx against the CURRENT `ActionCell` output,
   rendering `BellPanel` hydrated with a stubbed feed so the cell is reachable, snapshotting the
   accessible tree for **both** `isAutoResolving` branches including the resolving/pending state.
   Command: `pnpm vitest run tests/components/admin/bellActionRowParity.test.tsx` → **2 passed** BEFORE
   the extraction.
2. Extract the exported `BellActionRow`, which **owns the `resolving` state**, the `onResolve`
   invocation, and the pending-label selection (`components/admin/BellPanel.tsx:259-279` and `components/admin/BellPanel.tsx:332-342`);
   `ActionCell` becomes a thin wrapper rendering it.
3. Same command → **2 passed**, unchanged. A diff in the snapshot means the extraction changed behaviour.
4. Commit.

### T0 — test infrastructure, so every later RED is executable  `infra:`

**RED contract: a wiring contract.** Round 7 correctly caught that this body still declared "no RED"
while the prologue promised one. Ordering matters, so it is explicit:

- **RED (step 3a, before any wiring):** create the two spec files ONLY — no `testMatch` entry, no
  workflow filter, no allowlist row — then run
  `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` → **fails**, because two specs now exist
  that the scanner sees as path-gated with no `LOCAL_ONLY_ALLOWLIST` row. Also run
  `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts`
  → **"No tests found"**, the second red.
- **GREEN:** add the `testMatch` entries, the six path filters, and the two allowlist rows; both
  commands then pass.

T0's remaining deliverables (harnesses, live entry, census tool) are proved executable by the checks in
its steps rather than by a behaviour RED, since they add no product behaviour.

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
3. Create both spec files with a single trivially-passing smoke assertion each. **The smokes are
   REPLACED, not retained** (round-7 finding 5): T2 and T3 delete their file's smoke case when they add
   real cases, which is why T2's total is 77 and T3's is 11 with no extra smoke case counted. The
   hydrated same-key live smoke in step 8 is also a T0-only case, removed by T2. add their names to
   `standalone.config.ts:35` `testMatch`, and add **all SIX new paths (enumerated below)** to `phantom-gap-e2e.yml`'s path
   filters. **SIX entries, enumerated so an implementer cannot miscount** (round-5 finding 5 — the
   earlier "FIVE" was arithmetically wrong because the bundle script needs a filter of its own):
   1. tests/e2e/section-header-layout.layout.spec.ts
   2. tests/e2e/pusher-alignment.layout.spec.ts
   3. tests/e2e/_sectionHeaderCellHarness.tsx
   4. tests/e2e/_pusherRowsHarness.tsx
   5. tests/e2e/_sectionHeaderLiveEntry.tsx
   6. tests/e2e/_sectionHeaderBundle.mjs
   Plus **two run steps, given exactly** (round-6 finding 5 — "plus two run steps" named neither the
   commands nor the CI-visible result), inserted after the existing standalone helper-coverage step:

   ```yaml
   - name: Section-header layout (standalone)
     run: pnpm exec playwright test --reporter=list --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts
   - name: Pusher alignment (standalone)
     run: pnpm exec playwright test --reporter=list --config tests/e2e/standalone.config.ts tests/e2e/pusher-alignment.layout.spec.ts
   ```

   `--reporter=list` is what makes the counts CI-visible. Expected in the logs: **1 passed each at T0**
   (the smoke cases), rising to **77 passed** for the header spec after T2 and **11 passed** for the
   pusher spec after T3 — so a reviewer can confirm from the workflow diff and logs that the cases
   actually ran, rather than inferring it from a green tick.

   A helper is never matched by `testMatch`, so omitting any one leaves a later helper-only PR CI-dark.
4. **Add the two mandatory `PATH_GATED` rows** to `LOCAL_ONLY_ALLOWLIST`
   (`tests/ci/_metaE2eWorkflowCoverage.test.ts:24-35`) — mandatory, not conditional (§0.1) — and **run
   the meta-test**: `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts`, expected green.
4. Commit tools/one-off/childless-growable-census.ts (§0.4 sweep A).
5. Run the §0.7 mechanical sweep and record findings against the tasks that own them.
6. **The crowding sweep was RUN at plan time, and it triggered the escalation this step promised.**
   Method: the two nav rows rebuilt with their real class strings and child structure, spacer measured
   across 320-1280 in 10px steps.

   | viewport | `AdminNav` spacer | `OnboardingTopBar` spacer |
   | -------- | ----------------- | ------------------------- |
   | 320 | 72px | 146.09px |
   | **360 (minimum for both)** | **59.91px** | **134px** |
   | 390 | 89.91px | 164px |
   | 480 | 116.84px | 193.63px |
   | 840 | 223.13px | 405.11px |
   | 1280 | 663.13px | 845.11px |

   **Neither spacer ever reaches 0.** Their children collapse responsively faster than the row narrows —
   desktop nav links `hidden` below 840px, wordmark below 360px, brand pill below 440px — so the row
   sheds content instead of crowding. A crowded-zero-extent oracle is therefore **unachievable** for
   these two rows, and no threshold constant exists to record.

   **Escalated and resolved:** spec §9.3 has been AMENDED (2026-07-25) to require **structural absence**
   for both nav rows, with this measurement as the justification. Plan round 5 was procedurally right
   that a plan may not override a spec; the correct fix was to correct the spec on evidence, which is
   what happened. T3 follows the amended spec.
7. **Proof of discovery AND execution — `--list` alone is not enough** (round-3 finding 4): a listed
   spec can still fail to run. Both specs must be RUN and PASS before the T0 commit:
   - `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts` → **1 passed** (the smoke case), never "No tests found".
   - `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/pusher-alignment.layout.spec.ts` → **1 passed**.
   - `pnpm dlx tsx tests/e2e/_sectionHeaderCellHarness.tsx /tmp/cells.json && node -e "const c=require('/tmp/cells.json');const n=Object.keys(c.cells).length;if(n!==15)throw new Error('expected 15 cells, got '+n);if(!c.hairline)throw new Error('missing hairline fixture')"` → exits 0. **The hairline fixture is proven here too** (round-4 finding 3: T4 depended on a T0 deliverable that T0 neither built nor proved). The fixture adds no production `data-testid`; T4 selects the rule structurally (see T4).
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
     - **Width chain (spec §5), ±0.5px — measured on the REAL production chain, not cloned wrappers.**
       Round 5 was right that static per-cell trees plus copied wrapper classes could pass while the
       production upstream boundary regressed. So the chain cells mount the genuine
       `ShowReviewSurface` → registry section → `BreakdownSection` → header/panel path from the harness,
       and the test asserts each node's identity by its production `data-testid`
       (`wizard-step3-card-<dfid>-review-section-<id>`, the breakdown section's `testId`, and the
       panel-card testid) before measuring it. A synthetic wrapper carrying copied classes therefore
       fails identity before it can pass geometry. **G6a/G6b are NOT exempt** — round 7 correctly refuted that: the defensive state is *produced by*
       `ShowReviewSurface`'s `data.driveFileId ?? ""` fallback
       (`components/admin/review/ShowReviewSurface.tsx:249`), so those cells mount through the genuine
       defensive `ShowReviewSurface` path and assert the full chain like G1-G4. Exempting them would let
       G6 geometry pass in a direct chrome mount while the production pane→registry→breakdown chain
       regressed. **Only G5** (partial/standalone provider) omits the upstream boundaries, because those
       ancestors genuinely do not exist for it; it asserts only the boundaries it owns. Any pre-existing
       upstream failure is escalated, never silently repaired here.
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
       STRUCTURAL ABSENCE**, per the **amended** spec §9.3. T0's sweep proved neither spacer can reach
       zero at any supported width (minimums 59.91px and 134px, both at 360px), so the crowded oracle
       the spec originally required is unachievable; the amendment records the measurement. Assert that
       each row, rendered from tests/e2e/\_pusherRowsHarness.tsx, directly contains no childless
       growable child element.
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
   (`components/admin/wizard/step3ReviewSections.tsx:386-401`) — inside a 240px-wide container.
   **No production `data-testid` is added ahead of its test** (round-7 finding 3 — that would be a
   tracked product change committed before the test that exercises it). The rule is selected
   **structurally instead**: within the group row, the `h-px` span that is the next element sibling of
   the eyebrow label whose text is the group title. That is stable without touching production source.
   If a future refactor makes the structural selector fragile, adding a testid becomes its own RED-first
   task. Then in tests/e2e/section-header-layout.layout.spec.ts assert all three:
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

   **Row selection and non-vacuity — specified, because every row shares `data-testid="travelrow"` and
   the eyebrow has no testid of its own** (round-6 finding 3;
   `components/crew/sections/TravelSection.tsx:105-126`): enumerate ALL `travelrow` elements on the
   seeded crew page, partition them by the eyebrow `<p>`'s rendered text (empty vs non-empty), **assert
   BOTH partitions are non-empty**, assert the blank partition's size equals the count the seeded
   fixture is known to produce (the same **2** the crew ledger row records at
   `tests/e2e/crew-layout-dimensions.spec.ts:1037`), then run the displacement assertion on **every
   member of both partitions** — not one representative. Without this an implementation could measure an
   arbitrary labelled row, select zero blank rows, and still report green.
   - Command: `pnpm exec playwright test --project=mobile-safari tests/e2e/crew-layout-dimensions.spec.ts -g "eyebrow displacement"`
   - Expected failure: blank-eyebrow displacement measures 2px, expected 0.
   - **Chosen, not left open** (round-2 finding 7): the case is named
     `T-NOPHANTOM-CREW [eyebrow displacement]` so it is selected by the workflow's existing
     `-g "T-NOPHANTOM-CREW"` step with **no workflow edit**. T5 verifies it actually ran by checking the
     reported case count rose by 2, not merely that CI was green.
2. **GREEN** — add `empty:hidden` to `components/crew/sections/TravelSection.tsx:124`. (Verified by
   compilation: `.empty\:hidden { &:empty { display: none } }` generates.)
   - RED totals: **1 failed, 1 passed** — the blank-leg case fails, the labelled-leg case already
     passes (round-7 finding 5; the earlier wording named one case in RED and two in GREEN).
   - PASS command: same; expect **2 passed** —
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
   - PASS command (the new cases): same; expect **2 passing cases**
     (`T-NOPHANTOM-DASH [archived] @ 390` and `@ 1280`).
   - **Then the workflow-equivalent FULL admin run, before committing** (round-6 finding 4): the walker
     seed adds several shows and dashboard data ahead of EVERY admin phantom-gap case, so wiring it into
     the workflow can break the pre-existing active-dashboard and show-modal probes. That must be caught
     task-locally, not at close-out:
     `pnpm exec playwright test --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts -g "T-NOPHANTOM"`
     → all cases green, the archived pair included.
   - **Also run the advisory-lock structural pin here** (§0.2), not only in final verification:
     `pnpm vitest run tests/db/seed-restage-fixture.test.ts` → green.
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
parsed with the TypeScript AST. Collected: **every JSX-producing conditional FORM**, not just `?:` and
`&&` — round 5 correctly noted that `docs/agents/writing-plans.md:9` says "every ternary render and
conditional block", so an `if`/`switch` could otherwise introduce an unregistered conditional. The
collector matches: conditional expressions (`?:`), logical expressions (`&&`, `||`, `??`), `if`/`else`
statements, `switch` cases, and early `return`s — in each case only when a branch **produces JSX**
(a `JsxElement`, `JsxFragment`, or `JsxSelfClosingElement`, directly or via a returned expression).
**Excluded, explicitly:** the status-icon tone ternary at
`components/admin/wizard/step3ReviewSections.tsx:895`, which returns className **strings**, not JSX — so it
is not a render conditional and cannot carry a transition prop.

The pre-rebuild set is **five**, listed so the diff is auditable: count chip at
`components/admin/wizard/step3ReviewSections.tsx:911`, flag pill at `components/admin/wizard/step3ReviewSections.tsx:917`, judgment pill at `components/admin/wizard/step3ReviewSections.tsx:921`, sheet link at `components/admin/wizard/step3ReviewSections.tsx:928`, and the pre-existing section callout at `components/admin/wizard/step3ReviewSections.tsx:955`. Post-rebuild the two pill conditionals
collapse into one pill-line wrapper, giving an expected **four** — but the registry is asserted against the
**post-rebuild** body and its exact membership is recorded in the test at implementation time, not guessed
here. A conditional added later without a transition decision fails until registered.

Named, counted, **and given an explicit RED/GREEN chain inside T2** (round-5 finding 3 — it previously
had a command but no expected failure or pass): tests/components/admin/wizard/sectionHeaderConditionalInventory.test.ts,
**2 cases** (set-equality, and the string-ternary exclusion).

- **T2 RED**, run alongside the Playwright RED:
  `pnpm vitest run tests/components/admin/wizard/sectionHeaderConditionalInventory.test.ts` →
  **1 failed** (set-equality). The registry declares the post-rebuild membership, and today's body still
  has the pre-rebuild **five** conditionals, so the sets differ before the rebuild lands. The
  string-ternary exclusion case passes in both states.
- **T2 GREEN**, after the rebuild: same command → **2 passed**. Deliberately scoped to one function — not the repo-wide
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

**RED contract: a documentation contract.** Round 7 was right that this body still said no RED exists,
and right that no §7a site-list test exists to "extend" — so this task **CREATES** one, and §0.1's
meta-test inventory is corrected accordingly (it is no longer "CREATES none").

1. **RED** — create tests/docs/designSevenAEmptyHiddenSites.test.ts: scan `components/**` for files
   containing `empty:hidden`, and assert every one is named in `DESIGN.md` §7a's "Current sites" list.
   Command: `pnpm vitest run tests/docs/designSevenAEmptyHiddenSites.test.ts`
   Expected failure after T5: **1 failed** — `TravelSection.tsx` now carries `empty:hidden` and
   `DESIGN.md:325` still lists only `OverviewSection.tsx` and `ScheduleDayRow`.
2. **GREEN** — make the §7a edits (a)-(f); the test passes.
3. Verify: `pnpm format:check`, `pnpm vitest run tests/styles`, and the new test.
4. **Commit.**

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

**RED contract: a merge-readiness contract.** Round 7 was right that "not a TDD task" is not an
exemption. Before merging, run the full pre-push gate set (§3) and require every one green; the contract
that can fail is that gate set, and any code change this gate produces takes its own RED-first sub-task
before it is committed. Whole-diff fresh-eyes Codex review (split by surface per the
tight-scope rule), then **real CI green** as a separate gate from local green, then
`gh pr merge --merge` — **which is this gate's commit** — then fast-forward local `main` and verify
`git rev-list --left-right --count main...origin/main` reports `0  0`. Any code change this gate produces
gets its own RED-first sub-task first.

---

## 2. Task order and why

T0a (Bell extraction) → T0 (infrastructure) → T1 (count boundary) → **T2 (header layout AND transition audit — RED, implement,
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

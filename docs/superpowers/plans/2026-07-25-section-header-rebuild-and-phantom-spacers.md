# Plan — section-header rebuild + childless-spacer sweep

**Spec:** `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md` (APPROVED, adversarial round 8).
**Worktree:** `../FX-worktrees/section-header-rebuild`, branch `feat/section-header-rebuild-phantom-spacers`.
**Closes:** `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`, `BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW`, `BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET`.

Every task is TDD: failing test → minimal implementation → passing test → commit (invariant 1). One
commit per task, conventional-commits style (invariant 6) — **every task below ends in an explicit
commit step**. All work stays in the worktree (invariant 11).

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

**N/A — no `pg_advisory*` path is touched.** Presentational components, two count predicates, one CSS
token, test files, two workflow/config files, `DESIGN.md`, and the backlog files. No RPC, no migration,
no table write — so `validation-schema-parity` and `pnpm gen:schema-manifest` are N/A too.

### 0.3 e2e harness-readiness checklist

| | Static harness (T0's new specs) | Real-route probe (archived bucket, T6) |
| - | ------------------------------- | -------------------------------------- |
| **Boot** | none — `tests/e2e/standalone.config.ts`; markup rendered by a `tsx` subprocess, CSS compiled by the Tailwind CLI, served from `node:http` | `phantom-gap-e2e.yml` boots local Supabase + the :3000 baseline server (`BASELINE_SERVER_ONLY=1`) |
| **Readiness gate** | `waitUntil: "load"` **plus** `emulateMedia({ reducedMotion: "reduce" })` so entrance animation is collapsed and geometry final. **Never `networkidle` alone.** | existing `expect(getByTestId("admin-dashboard")).toBeVisible()` **plus** `expect(locator("[data-testid^='archived-show-row-']").first()).toBeAttached()` — an empty bucket is a different tree and must fail loudly, not measure nothing |
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
2. Create tests/e2e/\_sectionHeaderCellHarness.tsx — a `tsx`-runnable harness (same main-guard pattern
   as `tests/e2e/_step3ReviewModalHarness.tsx`) emitting **one static tree per matrix cell** from the
   §1.1 input table below. The existing harness only emits fixed `normal` / `linkOnly` / `long` /
   `resolution` trees (`tests/e2e/_step3ReviewModalHarness.tsx:249-273`) and cannot produce the
   defensive, partial-provider, or status combinations, which is why a new harness is required.
2. Create both spec files with a single trivially-passing smoke assertion each, add their names to
   `standalone.config.ts:35` `testMatch`, and add all three new paths to `phantom-gap-e2e.yml`'s path
   filters plus two run steps.
3. Check `tests/ci/_metaE2eWorkflowCoverage.test.ts` for whether the new specs need coverage rows; add
   them, or record "no row needed" with the reason.
4. Commit tools/one-off/childless-growable-census.ts (§0.4 sweep A).
5. Run the §0.7 mechanical sweep and record findings against the tasks that own them.
6. **Proof of discovery — exact commands and expected output:**
   - `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts --list` → expect **1 test listed**, NOT "No tests found".
   - same for tests/e2e/pusher-alignment.layout.spec.ts → **1 test listed**.
   - `pnpm dlx tsx tests/e2e/_sectionHeaderCellHarness.tsx /tmp/cells.json && node -e "const c=require('/tmp/cells.json');if(Object.keys(c.cells).length!==15)throw new Error('expected 15 cells, got '+Object.keys(c.cells).length)"` → exits 0.
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
     `header transitions: <state>` × 12 and `header transitions: compound <n>` × 5 ⇒ **77 cases total**
     in this spec after T2.
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
   - **(a) Structural absence at ALL THREE sites — no width calibration anywhere.** Assert that each
     row, rendered from tests/e2e/\_pusherRowsHarness.tsx, directly contains **no childless growable
     child element**. Red today (each row holds its `flex-1` span), green after deletion, red again on
     reintroduction. Uniform across the three because calibrating a "crowded" width is fragile for all
     of them, not just BellPanel: BellPanel's row is `flex-wrap`
     (`components/admin/BellPanel.tsx:288`) so narrowing moves the trailing item to a new line and the
     spacer regains width, while `AdminNav` and `OnboardingTopBar` gate children on breakpoints
     (`min-[360px]`, `min-[440px]`, `min-[840px]`), so their content is not monotonic in width either.
     Structural absence needs no calibrated number and cannot go quietly green.
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

1. **RED** — add a case to tests/e2e/section-header-layout.layout.spec.ts (same standalone config, so
   already discoverable) using the LONGEST real title ("Wardrobe & key moments", longest of the five in
   `components/admin/wizard/step3ReviewSections.tsx:386-401`) at a 240px row. Assert all three:
   (a) the rule is DRAWN (`width > 0`); (b) the resolved `min-width` is exactly **16px**; (c) the label
   does **not** wrap.
   - Command: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/section-header-layout.layout.spec.ts -g "hairline"`
   - Expected failure: **the single case fails on assertion (b)** — (a) and (c) already hold on the
     no-floor tree (22.94px, no wrap), which is exactly why (b) is what makes this task red. One
     Playwright case named `hairline floor @ 240px row`, so the runner reports **1 failing / 1 passing**,
     not three (round-2 finding 7).
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
2. **GREEN** — add `empty:hidden` to `components/crew/sections/TravelSection.tsx:121`. (Verified by
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
   `/admin?bucket=archived`, gated on an archived row being attached so an empty bucket fails loudly.
   - Command: `pnpm exec playwright test --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts -g "T-NOPHANTOM-DASH \[archived\]"`
   - Expected failure against the base seed: the attached-row gate fails — `pnpm db:seed` seeds no
     archived shows, which is precisely the vacuity the gate exists to prevent.
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

**Why it must run in the real browser, not Vitest/jsdom.** Round 2 caught a real error: the earlier
draft put `getComputedStyle(...).transitionProperty` in a Vitest test, where no compiled Tailwind
stylesheet is loaded, so it would have observed jsdom defaults and passed vacuously regardless of the
utilities in `app/globals.css`. The assertions live in tests/e2e/section-header-layout.layout.spec.ts,
which serves the compiled stylesheet.

**Spec §8 inventory, carried in full.** Heading level is fixed per call site and cannot transition, so
the transitionable axes are status (clean/flagged/judgment) × count (shown/absent) × link
(present/absent) = **12 states, 66 pairs**, every pair **instant — no animation**.

**How 66 pairs are covered executably** (round-2 finding 3 — "all 66 pairs" must not be prose): the
treatment is a property of each STATE's rendered output, not of the path between two states. If no state
attaches a transition or animation to the header's layout properties, then no pair can animate. So the
executable form is a **loop over all 12 states** asserting, on the outer column, header line, and pill
line:

- computed `transition-property` does not cover `height`, `width`, or `all`;
- computed `animation-name` is `none`;
- no `AnimatePresence` and no `initial`/`animate`/`exit` prop on any conditional site.

Plus the **five compound cases** driven as real prop updates under the same `key`, which is where
interleaving could otherwise hide: pill appears while count mutates; count changes while a pill is
already present; pill+link together; count+link together; pill+count+link together.

**The conditional sites enumerated** (post-rebuild equivalents of the pre-rebuild
`components/admin/wizard/step3ReviewSections.tsx:894-900` icon chip,
`components/admin/wizard/step3ReviewSections.tsx:911-926` heading/count group, and
`components/admin/wizard/step3ReviewSections.tsx:928-940` pill/link): the status-icon tone ternary, the
`showCount` conditional, the `sheetHref` conditional, and the pill-line conditional. Each is named in
the test so a new conditional added later without a transition decision fails the audit.

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

1. Verify: `pnpm spec:lint` is not applicable to `DESIGN.md`; run `pnpm format:check` and confirm the
   §7a contrast/token meta-tests still pass (`pnpm vitest run tests/styles`).
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

### T11 — close-out

Whole-diff fresh-eyes Codex review (split by surface per the tight-scope rule), then **real CI green** as
a separate gate from local green, then `gh pr merge --merge`, then fast-forward local `main` and verify
`git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## 2. Task order and why

T0 (infrastructure) → **T7 RED** → T1 (count) → T2 (header) → **T7 GREEN + commit** → T3 → T4 → T5 → T6
→ T8 → T9 → T10 → T11.

T7's red state depends on the post-rebuild structure being *absent*, so its RED runs before T2 and its
GREEN after — the only task whose two halves straddle another task, called out here rather than left
implicit.

## 3. Verification before push

`pnpm typecheck` · `pnpm lint` · `pnpm format:check` · full `pnpm test` (not a scoped subset — scoped
gates miss registry suites) · both new Playwright specs under the standalone config · the two extended
real-route specs · `pnpm spec:lint` on the spec and this plan. Then push and watch real CI, treating
green CI as a separate gate from local green.

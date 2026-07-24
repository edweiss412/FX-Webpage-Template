# Plan — close SETTINGS-DEVROW-GALLERY-RESIDUE-1

> **For agentic workers:** REQUIRED SUB-SKILL `superpowers:executing-plans` (inline).
> **Spec:** `docs/superpowers/specs/2026-07-24-settings-devrow-copy-close.md` — canonical for every copy string, the accessible-name contract (§4), the transition inventory (§5), and the out-of-scope list (§7). Where this plan and the spec disagree, the spec wins.

**Goal:** close all four deferred impeccable findings in the repo-root `DEFERRED.md` entry `SETTINGS-DEVROW-GALLERY-RESIDUE-1`, one finding per task, TDD throughout.

**Worktree:** `../FX-worktrees/settings-devrow-residue`, branch `fix/settings-devrow-gallery-residue`, based on `origin/main` `6c116b771`. `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight` all green before Task 1.

## 0. Pre-draft code verification (run 2026-07-24 at `6c116b771`)

Every file, symbol, and line this plan names was grepped in the worktree before drafting. Results are the citation table in spec §2 plus:

| Named thing | Verified |
| --- | --- |
| `devLinkClass` shared literal | `components/admin/settings/DevToolsRow.tsx:16-17` |
| `Open` link JSX | `components/admin/settings/DevToolsRow.tsx:53-55` |
| Row description `<p>` | `components/admin/settings/DevToolsRow.tsx:47-49` |
| Destination `<h1>` | `app/admin/dev/attention-gallery/page.tsx:54` |
| Test file under edit | `tests/components/admin/settings/DevToolsRow.test.tsx` (89 lines, `// @vitest-environment jsdom` pragma on line 1) |
| `toHaveAccessibleName` availability | `@testing-library/jest-dom/vitest` is imported at `tests/components/admin/settings/DevToolsRow.test.tsx:18`; the matcher ships with jest-dom and is used elsewhere in the suite |
| Existing assertions that MUST change | `tests/components/admin/settings/DevToolsRow.test.tsx:38` (`toHaveTextContent("Open")`) and `tests/components/admin/settings/DevToolsRow.test.tsx:51` (`toHaveTextContent(/^Open$/)`) |
| `sr-only` utility | Tailwind v4 built-in; already used at e.g. `components/admin/PerShowActionableWarnings.tsx` and throughout `components/` |

## 1. Meta-test inventory

**None created; none extended.** No Supabase call boundary, no `admin_alerts` code, no `§12.4` catalog row, no advisory lock, no new mutation surface, no new admin route or table, no new sentinel/tile. `tests/styles/_metaBgAccentInventory.test.ts` has no `DevToolsRow` row and this diff adds no accent background, so it is not touched. The one guard this plan adds (Task 3 T5, no bare ring offset) is a local assertion inside the component's own test file, deliberately NOT a registry — spec §7 explains why the app-wide sweep belongs to `BL-FOCUS-RING-CONTRAST`.

## 2. Advisory-lock topology

**N/A** — the diff contains no `pg_advisory*` call and touches no code path that mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, or `pending_ingestions`.

## 3. Mandatory-task applicability

| Rule | Applies? | Why |
| --- | --- | --- |
| Layout-dimensions task (real-browser `getBoundingClientRect`) | **No** | Spec §3.4 enumerates every parent→child dimension relationship in the row: all three are content-sized, none fixed. Nothing in this diff sets a dimension, and `sr-only` contributes zero layout box. |
| Transition-audit task | **Yes — discharged by spec §5 plus a step inside Task 3** (spec R1 F1) | No `AnimatePresence` and no new conditional block is added, but the component carries two pre-existing conditional-render branches (the null gate at `components/admin/settings/DevToolsRow.tsx:33` and `icon ? … : null` at `components/admin/settings/DevToolsRow.tsx:40-44`). Spec §5's structural-states table enumerates both plus their compound case, each declared instant-and-unreachable; Task 3 re-walks every `AnimatePresence`, ternary render, and conditional block in the two touched files against that table and records the walk in the commit body. |
| e2e harness-readiness checklist | **No** | No Playwright spec is added or changed. `tests/e2e/admin-dev.spec.ts:59-61` asserts by `data-testid` only, with no text or accessible-name locator, so it is unaffected — Task 1 re-verifies this by grep rather than assuming it. |
| Invariant 8 impeccable dual-gate | **Yes** | `components/admin/settings/DevToolsRow.tsx` and `app/admin/dev/attention-gallery/page.tsx` are UI surfaces. Task 6. |
| Invariant 10 mutation-surface telemetry | **No** | No route handler, no `"use server"` action. |
| Migration / validation parity | **No** | No `supabase/migrations/**`. |

---

## Task 1 — `Open` link accessible name (closes finding 1)

**Files:** modify `components/admin/settings/DevToolsRow.tsx`; modify `tests/components/admin/settings/DevToolsRow.test.tsx`. **No new test file is created by any task in this plan**, and `tests/components/admin/settings/DevToolsRow.absent.test.tsx` is never edited — it asserts an empty DOM and has no text assertions to update.

**Red.** In the existing `describe` block, replace the two stale `Open` text assertions and add the two new ones. The stale assertions at `tests/components/admin/settings/DevToolsRow.test.tsx:38` and `tests/components/admin/settings/DevToolsRow.test.tsx:51` MUST go in this task — `toHaveTextContent` normalizes and INCLUDES `sr-only` text, so `/^Open$/` fails the moment the suffix lands; leaving them would make the task's own red state ambiguous.

```tsx
// T1: accessible-name boundary (spec §4). Exact match, not a substring: the
// failure this catches is `Opendeveloper tools`, produced when the separating
// space lives INSIDE the sr-only span and the accessible-name algorithm trims
// that text node. A substring assertion cannot see that defect: it shipped
// once before on `View details<span className="sr-only"> for {title}</span>`
// and survived for months behind a /View details/ match.
expect(open).toHaveAccessibleName("Open developer tools");

// T1b: the name comes from a HIDDEN TEXT NODE, not from aria-label (R2 F6).
// T1 alone is satisfied by <Link aria-label="Open developer tools">Open</Link>,
// which has the right accessible name, no hidden qualifier at all, and violates
// spec §4's explicit no-aria-label decision: so the ratified mechanism could
// regress while T1 and T2 both stayed green.
expect(open).not.toHaveAttribute("aria-label");
expect(open).not.toHaveAttribute("aria-labelledby");
const hidden = open.querySelectorAll(".sr-only");
expect(hidden).toHaveLength(1);
expect(hidden[0]!.textContent).toBe("developer tools");

// T2: the visible label is still exactly `Open` (spec §1.1: the rejected
// option was a visible rename). Clone-and-strip, because the live node's
// textContent now legitimately contains the hidden suffix, so T1 alone would
// pass a visibly-renamed button.
const visibleOnly = open.cloneNode(true) as HTMLElement;
visibleOnly.querySelectorAll(".sr-only").forEach((n) => n.remove());
expect(visibleOnly.textContent?.trim()).toBe("Open");
```

Keep `expect(open).toHaveAttribute("href", "/admin/dev")` and the gallery link's `/^Attention gallery$/` assertion (T3) untouched.

**Green.**

```tsx
<Link href="/admin/dev" data-testid="admin-dev-tools-open" className={devLinkClass}>
  Open <span className="sr-only">developer tools</span>
</Link>
```

The separator is a visible text node on the SAME line as the `<span>`. Do not move the span to its own line (JSX strips whitespace-only text between elements on separate lines) and do not move the space inside the span (the accessible-name algorithm trims it). Run `pnpm format` and re-run the test after formatting — if prettier reflows that line, T1 catches it.

**Also in this task:** grep to confirm no locator anywhere selects this link by text or accessible name:

```
rg -n 'getByRole\(.*link.*name.*Open|getByText\(.*"Open"' tests/ app/ components/
```

Record the output in the commit body. Expected: no hit that resolves to this link.

**Commit:** `fix(admin): name the settings dev-tools Open link for screen readers`

---

## Task 2 — row description names the gallery (closes finding 4)

**Files:** modify `components/admin/settings/DevToolsRow.tsx`; modify `tests/components/admin/settings/DevToolsRow.test.tsx`.

**Red.** Add T6. The scoping is the whole point of this assertion:

```tsx
// T6: the description names the gallery (spec §3.1b). Scoped to the row's
// heading block, NOT the row root: the row root also contains a link whose
// visible text is `Attention gallery`, so an unscoped getByText(/attention
// gallery/i) would pass even with the OLD description still in place. Assert
// the paragraph's exact text, sourced from the element under test.
const row = screen.getByTestId("admin-dev-tools-row");
const heading = screen.getByText("Developer tools");
const description = heading.parentElement?.querySelector("p");
expect(description).not.toBeNull();
expect(description!.textContent).toBe(
  "Fixture tester, parse diagnostics, and the attention gallery. Hidden from normal use.",
);
// The description must NOT be the sibling link (anti-tautology self-check).
expect(row.querySelector('[data-testid="admin-dev-tools-gallery"]')).not.toBe(description);
```

**Green.** Replace the `<p>` body at `components/admin/settings/DevToolsRow.tsx:47-49` with the exact string above. No em dash, no apostrophe, no raw error code.

**Commit:** `fix(admin): mention the attention gallery in the dev-tools row description`

---

## Task 3 — `devLinkClass` transition parity (closes finding 3, transition half only)

**Files:** modify `components/admin/settings/DevToolsRow.tsx`; modify `tests/components/admin/settings/DevToolsRow.test.tsx`.

**Transition audit (spec §5 structural-states table).** Before writing the test, walk both touched files and record the result in the commit body: enumerate every `AnimatePresence` (expected: none), every ternary render, and every conditional block, and confirm each is either animated on purpose or declared instant. Expected inventory: `components/admin/settings/DevToolsRow.tsx:33` (early-return null gate — instant, unreachable as a transition because `DEV_PANEL_PRESENT` is a build constant and `isDeveloper` is server-resolved per request) and `components/admin/settings/DevToolsRow.tsx:40-44` (`icon ? … : null` — instant, `icon` constant for the life of the mount). `app/admin/dev/attention-gallery/page.tsx` adds none in this diff. If the walk finds a THIRD conditional the spec did not enumerate, stop and amend spec §5 before continuing.

**Red.** Extend the existing parity test:

```tsx
// T4: className parity survives, and the transition token is present on the
// SHARED literal. Catches (a) adding the transition to one link only, which
// breaks the byte-identical-className invariant the 2026-07-21 spec §3
// requires, and (b) satisfying parity by dropping the tap target or focus ring
// from BOTH links together.
expect(gallery.getAttribute("class")).toBe(open.getAttribute("class"));
// Split into class TOKENS first (R2 F4). `expect(classString).toContain(token)`
// is a substring assertion: `duration-fastest` satisfies "duration-fast",
// `focus-visible:ring-20` satisfies "focus-visible:ring-2", and
// `transition-colors-extra` satisfies "transition-colors": so the utility the
// contract requires could be entirely absent while the assertion passes.
const openTokens = Array.from(open.classList);
for (const token of [
  "min-h-tap-min",
  "focus-visible:ring-2",
  "transition-colors",
  "duration-fast",
]) {
  expect(openTokens).toContain(token);
}

// T5: no BARE focus ring offset (DESIGN.md:40; spec §7). A bare
// `focus-visible:ring-offset-2` with no container-matched
// `focus-visible:ring-offset-<backdrop>` companion is a dark-mode white-gap
// defect. Vacuous today by construction: kept as the regression pin that
// makes the deliberate omission in spec §7 a decision rather than an
// oversight, so a future "parity" pass cannot copy the sibling's bare offset
// without turning this red.
// BOTH halves scoped to the focus-visible variant (R2 F5). An unscoped
// predicate is wrong in two directions: `focus-visible:ring-offset-2
// hover:ring-offset-bg` would pass on the unrelated hover token even though the
// banned focus-visible configuration is present, and a lone `hover:ring-offset-2`
// would fail even though it is outside the ban.
const focusOffsets = openTokens.filter((t) => t.startsWith("focus-visible:ring-offset-"));
const hasNumericFocusOffset = focusOffsets.some((t) => /-\d+$/.test(t));
const hasNamedFocusOffset = focusOffsets.some((t) => /-[a-z][a-z-]*$/.test(t));
expect(hasNumericFocusOffset && !hasNamedFocusOffset).toBe(false);
```

**Green.** Insert `transition-colors duration-fast` into `devLinkClass` in the sibling's position (after `text-text-strong`, before `hover:bg-surface-sunken`), matching `components/admin/settings/DriveConnectionPanel.tsx:244`. Final token order is whatever `prettier-plugin-tailwindcss` emits; the contract is token membership.

**Do NOT** add any `focus-visible:ring-offset-*` token — spec §7.

**Commit:** `fix(admin): give the dev-tools links the sibling buttons' color transition`

---

## Task 4 — destination heading matches the link label (closes finding 2)

**Files:** modify `app/admin/dev/attention-gallery/page.tsx`; modify `tests/components/admin/settings/DevToolsRow.test.tsx`.

**Red.** Add T7 as a source-scan in the same test file, in its own `describe`:

```tsx
// T7: the destination heading matches the link label (spec §4, §9 T7). A
// source scan rather than a render: the page is an async Server Component whose
// FIRST line is `requireDeveloper()`, so rendering it in jsdom would mean
// mocking the whole auth chain to assert one string. The failure this catches
// is finding 2 recurring: link label and heading drifting apart again.
//
// Whitespace-tolerant, and it compares the CAPTURED heading text rather than
// searching the file (spec R1 F3): a comment or unrelated literal containing
// the phrase cannot satisfy it, and prettier reflowing the heading across lines
// cannot break it. The blanket `not.toContain("Attention modal gallery")` is
// deliberately absent: asserting the captured text already excludes the old
// value from the only place that matters, and the blanket form would fail on a
// comment that legitimately narrates the rename.
// NOTE: `readFileSync` is NOT imported in the live test file. This task adds
// `import { readFileSync } from "node:fs";` to the import block (R2 F2) -
// without it the red state fails to COMPILE, which is not the red state this
// task is asserting.
const pageSource = readFileSync(
  new URL("../../../../app/admin/dev/attention-gallery/page.tsx", import.meta.url),
  "utf8",
);
const h1 = /<h1[^>]*>\s*([^<]*?)\s*<\/h1>/.exec(pageSource);
expect(h1, "no <h1> found in the gallery page source").not.toBeNull();
expect(h1![1]).toBe("Attention gallery");
```

Path resolution is `new URL(..., import.meta.url)`, NOT `process.cwd()`, so the assertion is working-directory independent; the test file lives at `tests/components/admin/settings/DevToolsRow.test.tsx`, so the target is four levels up. **Verify the red state fails on the string comparison, not on `ENOENT`** — a path typo throws and looks like a pass-to-fail transition without testing anything. Residual limitation (accepted, stated in spec §9 T7): the regex takes the FIRST `<h1>`; the page has exactly one.

**Green.** `app/admin/dev/attention-gallery/page.tsx:54`: `Attention modal gallery` → `Attention gallery`.

**Commit:** `fix(admin): retitle the attention gallery heading to match its link`

---

## Task 5 — ledger + spec amendment (docs only)

**Files:** modify the repo-root `DEFERRED.md`, `DEFERRED-archive.md`, `docs/superpowers/specs/2026-07-21-settings-attention-gallery-link.md`, `docs/superpowers/plans/2026-07-21-settings-attention-gallery-link/closeout.md`.

1. `docs/superpowers/specs/2026-07-21-settings-attention-gallery-link.md` — append a dated amendment note to the "Row copy unchanged" bullet (lines 29-31) recording that the freeze is superseded by `docs/superpowers/specs/2026-07-24-settings-devrow-copy-close.md`, with the new description string inline.
2. `DEFERRED.md` — delete the `SETTINGS-DEVROW-GALLERY-RESIDUE-1` entry and update the "Last reconciled" line.
3. `DEFERRED-archive.md` — land the full entry plus a graduation note: date, **branch name** (`fix/settings-devrow-gallery-residue`), which change closed each finding, and the explicit record that finding 3 closed on its transition half ONLY, with the offset half tracked by `BL-FOCUS-RING-CONTRAST`. **Cite the branch, not a PR number** — this task runs before the branch is pushed, so no PR number exists yet (R2 F3). Task 7 backfills the PR number into this entry in the commit that opens the PR.
4. `docs/superpowers/plans/2026-07-21-settings-attention-gallery-link/closeout.md` — annotate the dispositions on that file's lines 49, 50 and 52 as closed by this change, so a reader is not sent to a `DEFERRED.md` entry that no longer exists.

**Red/green for a non-code task (R2 F1).** Plan-wide invariant 1 admits no docs-only exception, so this task carries a real mechanical red-to-green cycle rather than claiming exemption. The check is a two-command ledger assertion, run and recorded in the commit body BEFORE and AFTER the edits:

```
rg -c 'SETTINGS-DEVROW-GALLERY-RESIDUE-1' DEFERRED.md DEFERRED-archive.md
pnpm spec:lint docs/superpowers/specs/2026-07-21-settings-attention-gallery-link.md
```

- **Red (before):** the entry is present in `DEFERRED.md` and absent from `DEFERRED-archive.md` — the state this task exists to invert.
- **Green (after):** absent from `DEFERRED.md`, present in `DEFERRED-archive.md`, and `spec:lint` on the amended 2026-07-21 spec still reports 0 hard findings (the amendment note adds citations, which is exactly what that linter checks).

The assertion is a recorded command pair rather than a committed test file because the condition is one-shot: once the entry is archived it can never regress, so a permanent test would be dead weight. Both outputs go in the commit body.

Run `pnpm format` — `DEFERRED.md` conflicts and prettier drift after a resolution are a known trap on this repo.

**Commit:** `docs(plan): archive SETTINGS-DEVROW-GALLERY-RESIDUE-1 as closed`

---

## Task 6 — impeccable dual-gate + full local gates

**Invariant 8.** Run `/impeccable critique` AND `/impeccable audit` on the diff, with the canonical v3 setup gates (context.mjs context load of PRODUCT.md + DESIGN.md → register reference read). P0/P1 findings fixed or explicitly deferred with a `DEFERRED.md` entry.

**Findings + dispositions land in a NEW `closeout.md` created by this task under `docs/superpowers/plans/2026-07-24-settings-devrow-copy-close/`, section 12** (R2 F7). Explicitly NOT the 2026-07-21 closeout, which Task 5 edits and which records a different change's gate run. This new file is not part of the "four doc/ledger updates" count in spec §8; it is this plan's own artifact, counted separately in spec §11.

**Red/green (R2 F1).** The gate commands themselves are the cycle: each of the four listed gates is run and its output recorded, and the task is not green until all four exit 0 (checking `$?`, not the printed summary line). Any gate that fails is fixed and re-run before the commit.

**Pre-push gates, all of which must be green and whose output goes in the PR body:**

```
pnpm test            # full suite; check $? — vitest exits 1 on uncaught errors even when all tests pass
pnpm typecheck
pnpm lint
pnpm format:check
```

`pnpm test` excludes env-bound and e2e projects by design. Additionally run the two directly-affected files and the settings-page test:

```
pnpm vitest run tests/components/admin/settings/DevToolsRow.test.tsx tests/components/admin/settings/DevToolsRow.absent.test.tsx tests/app/admin/settings-developer-visibility.test.tsx
```

**Commit:** `chore(admin): impeccable dual-gate for the dev-tools row copy close-out`

---

## Task 7 — cross-model whole-diff review, CI, merge

Fresh-eyes Codex review of the whole diff (REVIEWER ONLY brief, do-not-relitigate list from spec §1.1 and §7, file list inlined per the split-tight-scope rule). Iterate to APPROVE; triage findings by deferral discipline.

Then push and open the PR. **In the same commit that opens the PR, backfill the PR number into the `DEFERRED-archive.md` graduation note Task 5 left citing only the branch** (R2 F3) — then push that commit too, so the archived entry is complete before the merge.

Wait for **real GitHub Actions green** (not local green), `gh pr merge --merge`, fast-forward local `main`, and verify `git rev-list --left-right --count main...origin/main` is `0  0`.

---

## Regression budget

If any review round patches a surface for a finding class, the next round's prep re-greps that class across the surface and confirms the relevant assertions still pass, noting both in the round closure. The classes in play here are narrow: accessible-name construction (Task 1), assertion scoping/tautology (Tasks 2-4), and Tailwind token membership (Task 3).

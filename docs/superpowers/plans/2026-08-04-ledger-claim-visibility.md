<!-- spec-lint: not-ui — no UI surface: a CLI script, a shared parser module, the preflight harness, three meta-tests, and AGENTS.md prose. impeccable-gate: N/A. -->

# Ledger Claim Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make in-flight ledger claims readable by a session that has fetched nothing but `origin/main`, before it does any work.

**Architecture:** Invariant 12's writer contract is unchanged — the marker still lives on the working branch. What ships is a *reader* that resolves claims across every live unmerged branch on origin, plus the wiring that makes it run without anyone choosing to: a print in `pnpm preflight`, a `--check` gate at Stage 0, and a CI backstop. Entry recognition delegates to the repository's authoritative ledger walker rather than introducing a second heading grammar.

**Tech Stack:** TypeScript run through `tsx`, Node's `node:child_process` for git/gh, `remark`/mdast via the existing `tests/docs/_ledgerMdast.ts`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-ledger-claim-visibility-design.md` — APPROVED at R19 (Codex, cross-model), 89 adversarial findings across nineteen rounds. Section references below (§n) are to that spec, which is canonical where this plan is silent.

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal implementation → passing test → commit. Never implementation before its test.
- **Commit per task** (invariant 6), conventional-commits style. Do not batch tasks.
- **Worktree only** (invariant 11). All work in `/Users/ericweiss/FX-worktrees/ledger-claim-visibility`.
- **Strict TypeScript.** `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are all `true` (`tsconfig.json:7-9`). Every array index and optional property access in these snippets is already guarded; keep it that way.
- **No second heading grammar.** Entry recognition is `extractEntries` (§3.1). Any regex that decides what an entry *is* is a defect.
- **Exit codes are load-bearing and distinct** (§3.3): `0` no collision, `1` a `declared` collision with **resolved** identity, `2` the check could not be trusted. Never collapse 1 and 2.
- **`inferred` never fails anything**, in any identity case (§4.4).
- **No new numeric bounds.** The complete set is §4.4's table: 14 days stale, 30 s fetch, 30 s `ls-remote`, 15 s preflight budget, 10 s `gh`, 100-branch display cap, 100 open-PR query limit, 12-line meta window.

## Meta-test inventory (mandatory declaration)

**CREATES:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- `tests/docs/_metaLedgerClaimCollision.test.ts` — cross-branch declared-collision backstop (Task 7).
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- `tests/docs/_metaAgentsMarkerContract.test.ts` — pins that AGENTS.md's three statements of the marker contract cannot drift apart (Task 8).

**EXTENDS:**
- `tests/docs/_metaLedgerInProgress.test.ts` — predicates widen (Task 2). Its existing planted-input suite becomes the shared module's regression coverage.
- `tests/docs/_metaLedgerReferentialIntegrity.test.ts` — `NOT_A_CITATION` rows for this spec. **Already landed** in commit `46e3d4ad5`; no task repeats it.

**N/A, with reason:** Supabase call-boundary (`tests/auth/_metaInfraContract.test.ts`) — no Supabase client call. Advisory-lock topology — no `pg_advisory*` in the diff. Admin-alert catalog, sentinel hiding, email normalization — no admin, tile, or email surface.

## Mutation-family closure (mandatory for guard work)

This plan ships structural guards, so the mutation families it converges against are enumerated up front (§7). A reviewer-proposed **new** family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| # | Family | Closed by |
| --- | --- | --- |
| M1 | Second heading grammar reintroduced (em-dash-requiring recognizer) | Task 1, no-em-dash fixture |
| M2 | Wrong `ExtractOpts` per ledger | Task 1, deferred-claim fixture |
| M3 | Predicate reads `fields.Status` instead of scanning lines | Task 2, collision fixture |
| M4 | Union applied to a derived helper instead of `fields` | Task 2, out-of-window shape/liveness fixtures |
| M5 | Identity cases collapsed (any two of three) | Task 3, four identity fixtures on both surfaces |
| M6 | Claim keyed by `fields.Branch` instead of the source ref | Task 3, three attribution fixtures |
| M7 | Universe answered from an unverified set | Task 5, six exit-2 fixtures |
| M8 | Display cap applied to resolution | Task 5, 101-candidate fixtures for `--check` and `--json` |
| M9 | `--no-fetch` accepted but network still touched | Task 6, non-invocation spy |
| M10 | Suppression implemented by discarding output rather than skipping work | Task 6, not-spawned assertions |
| M11 | AGENTS delta applied to one location, or a retired ordering paraphrased | Task 8, six positive assertions |

---

## File Structure

| File | Responsibility |
| --- | --- |
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
| `scripts/lib/ledger-fields.ts` (create) | Pure parsing: entry spans via `extractEntries` + `parseLedger`, meta-field extraction, the two predicates. No git, no network, one `readdirSync` in `ledgerFiles`. |
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
| `scripts/lib/ledger-claims-core.ts` (create) | Claim resolution over an injected git surface: candidates, identity, declared/inferred, degraded flags. No subprocess spawning of its own. |
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
| `scripts/lib/ledger-git.ts` (create) | The only module that spawns `git`/`gh`. Bounded, injectable, so Task 6's non-invocation spy has a single seam. |
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
| `scripts/ledger-claims.ts` (create) | CLI adapter: argv, report rendering, `--check`/`--json` modes, exit codes. |
| `scripts/preflight-env.mjs` (modify) | Claims print, placed before the DB probe. |
| `tests/docs/_metaLedgerInProgress.test.ts` (modify) | Imports the shared module; predicates widen. |
| `tests/scripts/ledgerClaims*.test.ts` (create) | Reader and `--check` behavior against planted git fixtures. |
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
| `tests/docs/_metaLedgerClaimCollision.test.ts` (create) | CI backstop. |
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
| `tests/docs/_metaAgentsMarkerContract.test.ts` (create) | AGENTS delta completeness. |
| `AGENTS.md` (modify) | The six edits of §6. |

**Test-project wiring, verified:** `tests/docs/**/*.test.{ts,tsx}` is in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:126`) so new files there are picked up with no config change. `tests/scripts/**` is **not** in that list, so it runs in the `serial` project (`vitest.config.ts:96`) — which is why Task 6 must clear `CI` explicitly.

---

### Task 1: Shared parser module with authoritative entry spans

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `scripts/lib/ledger-fields.ts`
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `tests/scripts/ledgerFields.test.ts`

**Interfaces:**
- Consumes: `extractEntries`, `parseLedger`, `ExtractOpts` from `tests/docs/_ledgerMdast.ts`.
- Produces: `type LedgerItem = { file: string; id: string; line: number; endLine: number; fields: Record<string, string>; bodyLines: string[] }` (Task 2 populates `bodyLines`; declaring it here keeps one type across both tasks); `optsFor(file: string): ExtractOpts`; `ledgerFiles(root?: string): string[]`; `fieldsOfLine(line: string): Record<string, string>`; `ledgerItems(file: string, text: string): LedgerItem[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractEntries } from "@/tests/docs/_ledgerMdast";
import { ledgerItems, optsFor } from "@/scripts/lib/ledger-fields";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("ledger-fields entry spans", () => {
  it("uses the authoritative grammar, not an em-dash regex (M1)", () => {
    // `## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)` has no em dash.
    // The retired local HEADING regex rejected it; extractEntries accepts it.
    const items = ledgerItems("BACKLOG.md", read("BACKLOG.md"));
    const hit = items.find((i) => i.id === "BL-NULLCODE-STAMP-BATCH-2");
    expect(hit, "no-em-dash entry must resolve").toBeDefined();
    expect(hit!.line).toBeGreaterThan(0);
    expect(hit!.endLine).toBeGreaterThanOrEqual(hit!.line);
  });

  it("points each id at the line its own heading is on (M1)", () => {
    // Positivity + monotonicity are NOT enough: plan-R1 finding 6 built a mutant
    // adding 1 to every resolved line, which passes both while shifting every span
    // and silently dropping inferred edits made on a heading line. This asserts the
    // line's CONTENT contains the id, which only the correct line can satisfy.
    for (const f of ["BACKLOG.md", "BACKLOG-archive.md", "DEFERRED.md", "DEFERRED-archive.md"]) {
      const text = read(f);
      const lines = text.split("\n");
      const items = ledgerItems(f, text);
      expect(items.length, `${f} parsed nothing`).toBeGreaterThan(0);
      items.forEach((it, n) => {
        const heading = lines[it.line - 1] ?? "";
        expect(heading.startsWith("#"), `${f}:${it.line} is not a heading`).toBe(true);
        expect(heading, `${f}:${it.line} does not name ${it.id}`).toContain(it.id);
        if (n > 0) expect(it.line).toBeGreaterThan(items[n - 1]!.line);
      });
    }
  });

  it("returns exactly the authoritative entry set, per ledger (M1/M2)", () => {
    // Plan-R2 findings 3 and 4: asserting only over RETURNED entries lets two
    // mutants through. A grammar accepting no-em-dash headings but dropping the
    // live struck heading `### ~~MODAL-CLOSE-EXIT-ANIM-1~~` loses one entry from
    // DEFERRED-archive.md; a `levels: [2]` mutant on the archive loses 85. Both
    // pass every per-entry assertion. Count parity against extractEntries is what
    // catches them, so the assertion is against the authoritative source itself,
    // not a hardcoded number that would rot as the corpus grows.
    for (const f of ["BACKLOG.md", "BACKLOG-archive.md", "DEFERRED.md", "DEFERRED-archive.md"]) {
      const text = read(f);
      const want = extractEntries(text, optsFor(f)).map((e) => e.id);
      expect(ledgerItems(f, text).map((i) => i.id), `${f} entry set drifted`).toEqual(want);
    }
  });

  it("resolves a struck heading and an archive H3 entry (M1/M2)", () => {
    const arch = read("DEFERRED-archive.md");
    expect(ledgerItems("DEFERRED-archive.md", arch).map((i) => i.id))
      .toContain("MODAL-CLOSE-EXIT-ANIM-1");
    // BACKLOG-archive.md carries H3 entries; a levels:[2] mutant drops them all
    // while leaving the file non-empty, so no vacuity gate fires.
    const backArch = read("BACKLOG-archive.md");
    const h3 = extractEntries(backArch, { requirePrefix: "BL-", levels: [3] }).map((e) => e.id);
    expect(h3.length, "fixture premise: the archive has H3 entries").toBeGreaterThan(0);
    const got = ledgerItems("BACKLOG-archive.md", backArch).map((i) => i.id);
    for (const id of h3) expect(got, `H3 entry ${id} dropped`).toContain(id);
  });

  it("uses per-ledger opts, so the deferred pair is not empty (M2)", () => {
    // Backlog opts on a deferred ledger yields 0: the silent-disappearance case.
    expect(optsFor("DEFERRED.md")).toEqual({ requirePrefix: null, levels: [3] });
    expect(optsFor("BACKLOG.md")).toEqual({ requirePrefix: "BL-", levels: [2, 3] });
    expect(ledgerItems("DEFERRED.md", read("DEFERRED.md")).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/scripts/ledgerFields.test.ts`
Expected: FAIL — `Cannot find module '@/scripts/lib/ledger-fields'`.

- [ ] **Step 3: Write minimal implementation**

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
Create `scripts/lib/ledger-fields.ts`. Move `fieldsOfLine` verbatim from `tests/docs/_metaLedgerInProgress.test.ts:70-86` and `ledgerFiles` from the same file. Delete the local `HEADING` regex — do not move it.

```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { extractEntries, flattenLines, parseLedger, type ExtractOpts } from "../../tests/docs/_ledgerMdast";

const BACKLOG_OPTS: ExtractOpts = { requirePrefix: "BL-", levels: [2, 3] };
const DEFERRED_OPTS: ExtractOpts = { requirePrefix: null, levels: [3] };

/** Per-ledger opts. Applying BACKLOG_OPTS to a deferred file yields zero entries (§3.1). */
export function optsFor(file: string): ExtractOpts {
  return /^DEFERRED(-archive)?\.md$/.test(file) ? DEFERRED_OPTS : BACKLOG_OPTS;
}

export function ledgerFiles(root: string = join(__dirname, "..", "..")): string[] {
  return readdirSync(root)
    .filter((f) => /^(BACKLOG|DEFERRED)(-archive)?\.md$/.test(f))
    .sort();
}

export type LedgerItem = {
  file: string;
  id: string;
  line: number;
  endLine: number;
  fields: Record<string, string>;
};

export function fieldsOfLine(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const marks: { key: string; end: number; at: number }[] = [];
  const re = /\*\*([^*\n]{1,60}?):?\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const key = (m[1] ?? "").replace(/:\s*$/, "").trim();
    if (key) marks.push({ key, at: m.index, end: m.index + m[0].length });
  }
  marks.forEach((mark, i) => {
    const next = marks[i + 1];
    const stop = next ? next.at : line.length;
    const raw = line.slice(mark.end, stop).replace(/^[:\s]*/, "").replace(/\s*·\s*$/, "").trim();
    if (out[mark.key] === undefined) out[mark.key] = raw;
  });
  return out;
}

/**
 * Entry ids and spans. The grammar is `extractEntries`; the positions come from
 * the raw mdast root, because `LedgerEntry.headingLine` carries none (§3.1).
 */
export function ledgerItems(file: string, text: string): LedgerItem[] {
  const opts = optsFor(file);
  const entries = extractEntries(text, opts);
  const ids = entries.map((e) => e.id);
  const root = parseLedger(text) as { children: unknown[] };
  const heads = root.children.filter(
    (n): n is { position: { start: { line: number } } } =>
      typeof n === "object" && n !== null && (n as { type?: string }).type === "heading" &&
      Boolean((n as { position?: unknown }).position),
  );
  const lines = text.split("\n");

  // Pair each entry with its heading by NORMALIZED TEXT, not by substring.
  // Plan-R1 finding 1: `.includes(id)` pairs `## Notes about BL-X` with BL-X,
  // putting the span on the mention rather than the entry. Probed: that rule gives
  // line 1 where the answer is line 5.
  //
  // The comparison is endsWith + id presence rather than equality, because
  // extractEntries strips a struck id from headingLine.text while flattenLines
  // keeps it: `### ~~MODAL-CLOSE-EXIT-ANIM-1~~, RESOLVED` is the live instance,
  // and equality alone leaves it unresolved.
  //
  // Measured over all four ledgers: 478 entries, 0 unresolved, spans monotonic.
  const norm = entries.map(() => "");
  const headNorm = heads.map((h) => ({
    line: h.position.start.line,
    text: flattenLines([h as never], "id")[0]?.text ?? "",
  }));

  const starts: number[] = [];
  let cursor = 0;
  for (const e of entries) {
    const want = e.headingLine.text;
    const idx = headNorm.findIndex(
      (n, i) => i >= cursor && n.text.endsWith(want) && n.text.includes(e.id),
    );
    if (idx === -1) continue;
    cursor = idx + 1;
    starts.push(headNorm[idx]!.line);
  }
  void norm;

  return ids.slice(0, starts.length).map((id, n) => {
    const line = starts[n]!;
    const endLine = (starts[n + 1] ?? lines.length + 1) - 1;
    const fields: Record<string, string> = {};
    for (const l of lines.slice(line, Math.min(endLine, line + 12))) {
      for (const [k, v] of Object.entries(fieldsOfLine(l))) if (fields[k] === undefined) fields[k] = v;
    }
    return { file, id, line, endLine, fields };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/scripts/ledgerFields.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. If `noUncheckedIndexedAccess` complains, add the guard — do not add `!` where the index can genuinely be out of range.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/ledger-fields.ts tests/scripts/ledgerFields.test.ts
git commit -m "feat(ledger): shared parser module with authoritative entry spans"
```

---

### Task 2: Widen the guard's predicates

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Modify: `scripts/lib/ledger-fields.ts`
- Modify: `tests/docs/_metaLedgerInProgress.test.ts`

**Interfaces:**
- **Changes** `LedgerItem` to `{ file; id; line; endLine; fields; bodyLines: string[] }` and `ledgerItems`'s return type with it. Self-review caught the earlier draft introducing a separate `LedgerItemWithBody` that `ledgerItems` never returned, which would not have compiled at the first call site.
- Produces: `isInProgress(item: LedgerItem): boolean` — scans `item.bodyLines`, never `item.fields.Status`; `flightFieldsOn(item: LedgerItem): string[]`. `LedgerItem.fields` gains the same-line union.
- Task 3 consumes both predicates and the widened `fields`; no other caller exists yet.

Two behavior changes land here, and they are not separable: widening detection without widening `fields` makes an out-of-window marker detected but unvalidated (§3.1, M4).

- [ ] **Step 1: Write the failing tests**

Append to `tests/docs/_metaLedgerInProgress.test.ts`'s planted-input suite. `plant()` already exists there.

```ts
it("sees a marker below the 12-line window (M1/M4)", () => {
  const body = ["**Status:** OPEN", ...Array<string>(15).fill("filler"),
    "**Status:** IN PROGRESS · **Branch:** chore/real-branch"].join("\n\n");
  const it0 = plant(body);
  expect(isInProgress(it0)).toBe(true);
  expect(it0.fields.Branch, "same-line union must reach fields").toBe("chore/real-branch");
});

it("does not let the window's Status mask a deeper one (M3)", () => {
  // fields.Status stays OPEN by the window-wins rule; the predicate must not read it.
  const body = ["**Status:** OPEN · **Severity:** low", ...Array<string>(15).fill("filler"),
    "**Status:** IN PROGRESS · **Branch:** feat/live"].join("\n\n");
  const it0 = plant(body);
  expect(it0.fields.Status).toBe("OPEN");
  expect(isInProgress(it0), "predicate must scan lines, not read fields.Status").toBe(true);
  expect(flightFieldsOn(it0)).toEqual(["Branch"]);
});

it("still ignores a bare Branch quoted deep in a body", () => {
  const body = ["**Status:** OPEN", ...Array<string>(14).fill("filler"),
    "**Branch:** feat/quoted-in-discussion"].join("\n\n");
  const it0 = plant(body);
  expect(isInProgress(it0)).toBe(false);
  expect(flightFieldsOn(it0)).toEqual([]);
});

it("still catches IN PROGRESS with nothing to point at", () => {
  const it0 = plant("**Status:** IN PROGRESS · **Severity:** low");
  expect(isInProgress(it0)).toBe(true);
  expect(flightFieldsOn(it0)).toEqual([]);
});

it("newly subjects an out-of-window branch to the shape rule", () => {
  const body = ["**Status:** OPEN", ...Array<string>(15).fill("filler"),
    "**Status:** IN PROGRESS · **Branch:** not a branch"].join("\n\n");
  expect(plant(body).fields.Branch).toBe("not a branch"); // BRANCH_SHAPE then rejects it
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts`
Expected: FAIL — the window-only `fields` returns `undefined` for `Branch`, and `isInProgress` reads `fields.Status`.

- [ ] **Step 3: Implement**

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
In `scripts/lib/ledger-fields.ts`, union the same-line-with-status fields into `fields` (window value wins), and make detection scan lines:

```ts
const IN_PROGRESS = /\b(in[\s-]?progress|in[\s-]?flight|wip|underway)\b/i;
const FLIGHT_FIELDS = ["Branch", "PR", "Owner", "Assignee", "In progress"] as const;

// `bodyLines` is added to LedgerItem in Task 1's type and populated in ledgerItems,
// so predicates need no second read of the file.
export const isInProgress = (it: LedgerItem): boolean =>
  it.bodyLines.some((l) => IN_PROGRESS.test(fieldsOfLine(l).Status ?? ""));

export const flightFieldsOn = (it: LedgerItem): string[] =>
  FLIGHT_FIELDS.filter((f) => (it.fields[f] ?? "").length > 0);
```

In `ledgerItems`, after the windowed pass, add the union and attach `bodyLines`:

```ts
const bodyLines = lines.slice(line, endLine);
for (const l of bodyLines) {
  const f = fieldsOfLine(l);
  if (!IN_PROGRESS.test(f.Status ?? "")) continue;
  for (const [k, v] of Object.entries(f)) if (fields[k] === undefined) fields[k] = v;
}
```

Also move and export `FLIGHT_FIELDS`, `BRANCH_SHAPE`, and `PR_SHAPE` (currently declared near the top of
`tests/docs/_metaLedgerInProgress.test.ts`, at lines 117, 123, and 124). Plan-R1 finding 8: §3.1 lists them
in the shared module's API, and leaving them behind either strands them as private or deletes them
into unresolved identifiers — the guard's shape rules read all three.

Then update `tests/docs/_metaLedgerInProgress.test.ts` to import `isInProgress`, `flightFieldsOn`,
`ledgerItems`, `ledgerFiles`, `FLIGHT_FIELDS`, `BRANCH_SHAPE`, `PR_SHAPE`, and the `LedgerItem` type
from `@/scripts/lib/ledger-fields`, deleting the local copies. Leave every pre-existing assertion untouched — a diff to one is the signal the move was not behavior-preserving.

- [ ] **Step 4: Run the full docs suite**

Run: `pnpm exec vitest run tests/docs/`
Expected: PASS. **If any pre-existing entry newly fails, stop.** §7.4a measured 6 newly-visible entries and 0 newly-flagged; a non-zero count is pre-existing ledger content this branch did not author, and is a reconcile-with-the-user event, not a fix-forward.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ledger-fields.ts tests/docs/_metaLedgerInProgress.test.ts
git commit -m "feat(ledger): position-independent in-progress detection"
```

---

### Task 3: Claim resolution core — candidates, identity, declared

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `scripts/lib/ledger-git.ts`, `scripts/lib/ledger-claims-core.ts`
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `tests/scripts/ledgerClaims.test.ts`

**Interfaces:**
- Produces: the complete subprocess seam. **Every** network or `git` operation is a member, so Task 6's spy has one boundary and nothing can spawn outside it:

```ts
export type Hunk = { file: string; start: number; count: number };
export type PrRow = { number: number; headRefName: string; headRepositoryOwner: string | null; isCrossRepository: boolean };

export type GitSurface = {
  fetch(): void;                                   // +refs/heads/*, --prune, 30 s
  lsRemote(): Map<string, string>;                 // name -> OID, HEAD filtered out, 30 s
  localRefs(): Map<string, string>;                // name -> OID for refs/remotes/origin/*, origin/HEAD excluded
  mergedIntoMain(): string[];
  showFile(ref: string, file: string): string | null;   // stderr discarded
  mergeBase(ref: string): string | null;
  diffHunks(base: string, ref: string, files: string[]): Hunk[];
  tipEpoch(ref: string): number;
  isShallow(): boolean;
  currentBranch(): string | null;
  headRepo(): string | null;                       // event payload; null when unreadable
  repo(): string | null;
  inCI(): boolean;
  prList(): PrRow[];                               // gh, 10 s, [] on any failure
};
```

`localRefs` and `lsRemote` are both name→OID maps because §4.1 compares them **as maps, in both
directions** — a `string[]` cannot express the changed-OID-under-unchanged-name case. `prList` is a
member so its 10 s bound and its `--no-fetch` suppression are observable; `type Claim = { id: string; branch: string; kind: "declared" | "inferred"; pr: number | null; tipAgeDays: number; stale: boolean }`; `resolveClaims(git: GitSurface, opts: { fetch: boolean }): { claims: Claim[]; degraded: string[]; identity: "local" | "ci-resolved" | "ci-unknown"; selfBranch: string | null }`.

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
`GitSurface` is injected so every test plants git state as data. `scripts/lib/ledger-git.ts` is the
only module that spawns, and it spawns **only** to implement these members — which is what makes
Task 6's non-invocation assertion meaningful rather than decorative.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveClaims, type GitSurface } from "@/scripts/lib/ledger-claims-core";

const MARKER = (b: string) => `## BL-X\n\n**Status:** IN PROGRESS · **Branch:** ${b}\n`;

// Must satisfy the FULL GitSurface: plan-R2 finding 5 caught an earlier fake
// declaring `remoteRefs` (which does not exist on the type) while omitting
// `fetch`, `localRefs`, and `prList`. `Partial<GitSurface>` on the override
// parameter does not excuse the base object from being complete.
function fake(over: Partial<GitSurface> = {}): GitSurface {
  return {
    fetch: () => {},
    lsRemote: () => new Map([["main", "aaa"], ["feat/a", "bbb"]]),
    localRefs: () => new Map([["main", "aaa"], ["feat/a", "bbb"]]),
    prList: () => [],
    mergedIntoMain: () => [],
    showFile: (ref, file) =>
      file === "BACKLOG.md" && ref === "origin/feat/a" ? MARKER("feat/a") : null,
    mergeBase: () => "base",
    diffHunks: () => [],
    tipEpoch: () => Math.floor(Date.now() / 1000),
    isShallow: () => false,
    currentBranch: () => null,
    headRepo: () => null,
    repo: () => null,
    inCI: () => false,
    ...over,
  };
}

describe("resolveClaims", () => {
  it("reports a declared claim keyed by its source ref (M6)", () => {
    const r = resolveClaims(fake(), { fetch: false });
    expect(r.claims).toEqual([
      expect.objectContaining({ id: "BL-X", branch: "feat/a", kind: "declared" }),
    ]);
  });

  it("keys by the ref even when the marker names another branch (M6)", () => {
    const r = resolveClaims(
      fake({ showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/feat/a" ? MARKER("feat/b") : null) }),
      { fetch: false },
    );
    expect(r.claims[0]?.branch, "source ref wins over fields.Branch").toBe("feat/a");
  });

  it("keys by the ref when the named branch EXISTS (M6)", () => {
    // Plan-R2 finding 6: the mismatch fixture above uses feat/b, which the fake
    // does not have, so an existence-aware `fields.Branch` mutant falls back to
    // the ref and passes. When the named branch exists the mutant misattributes.
    const r = resolveClaims(fake({
      lsRemote: () => new Map([["main", "aaa"], ["feat/a", "bbb"], ["feat/b", "ccc"]]),
      localRefs: () => new Map([["main", "aaa"], ["feat/a", "bbb"], ["feat/b", "ccc"]]),
      showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/feat/a" ? MARKER("feat/b") : null),
    }), { fetch: false });
    expect(r.claims[0]?.branch, "an existing named branch must not steal the claim").toBe("feat/a");
  });

  it("keys by the ref when the marker names NO branch (M6)", () => {
    const r = resolveClaims(fake({
      showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/feat/a"
        ? "## BL-X\n\n**Status:** IN PROGRESS · **Severity:** low\n" : null),
    }), { fetch: false });
    expect(r.claims[0]).toMatchObject({ id: "BL-X", branch: "feat/a", kind: "declared" });
  });

  it("excludes origin/main and origin/HEAD as candidates (M5)", () => {
    const r = resolveClaims(
      fake({ showFile: (ref, f) => (f === "BACKLOG.md" && ref !== "origin/feat/a" ? MARKER("main") : null) }),
      { fetch: false },
    );
    expect(r.claims).toEqual([]);
  });

  it("excludes branches merged into main", () => {
    const r = resolveClaims(fake({ mergedIntoMain: () => ["origin/feat/a"] }), { fetch: false });
    expect(r.claims).toEqual([]);
  });

  it("resolves identity as local when not in CI (M5)", () => {
    const r = resolveClaims(fake({ inCI: () => false, currentBranch: () => "feat/a" }), { fetch: false });
    expect(r.identity).toBe("local");
    expect(r.selfBranch).toBe("feat/a");
  });

  it("resolves identity as ci-unknown when the payload is unreadable (M5)", () => {
    const r = resolveClaims(fake({ inCI: () => true, headRepo: () => null }), { fetch: false });
    expect(r.identity).toBe("ci-unknown");
    expect(r.selfBranch, "no branch is self when identity is unknown").toBeNull();
  });

  it("disables self-exclusion on a fork PR (M5)", () => {
    const r = resolveClaims(
      fake({ inCI: () => true, headRepo: () => "fork/x", repo: () => "base/x", currentBranch: () => "feat/a" }),
      { fetch: false },
    );
    expect(r.selfBranch).toBeNull();
  });

  it("lists a stale-tipped branch rather than dropping it", () => {
    const old = Math.floor(Date.now() / 1000) - 20 * 86_400;
    const r = resolveClaims(fake({ tipEpoch: () => old }), { fetch: false });
    expect(r.claims[0]?.stale).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/scripts/ledgerClaims.test.ts`
Expected: FAIL — module not found.

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- [ ] **Step 3: Implement `ledger-claims-core.ts`**

Candidate rule (§3.2 step 2): every `refs/remotes/origin/*` except `origin/main` and `origin/HEAD`; subtract `mergedIntoMain()` only when `!isShallow()`. Identity (§3.2 step 3): `inCI()` false → `local`, self = `currentBranch()`; `inCI()` true and `headRepo()` non-null → `ci-resolved`, self = `currentBranch()` unless `headRepo() !== repo()`; otherwise `ci-unknown`, self = `null`. Declared claims: for each candidate × `ledgerFiles()`, `showFile` then `ledgerItems`, keep `isInProgress`, key on the ref's short name. Stale when tip age > 14 days.

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- [ ] **Step 4: Do NOT implement `ledger-git.ts` here**

Plan-R2 finding 7: writing the real subprocess adapter in this task would ship an
entire module with no test exercising it, which violates invariant 1. Nothing in
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
Task 3 touches it — these tests inject `fake()`. `ledger-git.ts` is written in
**Task 5**, where its `fetch`, head-map, and `prList` behavior are the things
under assertion, and its non-invocation seam is asserted in Task 6.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run tests/scripts/ledgerClaims.test.ts && pnpm typecheck`
Expected: PASS, 8 tests; no type errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/ledger-claims-core.ts tests/scripts/ledgerClaims.test.ts \
        tests/docs/_metaLedgerReferentialIntegrity.test.ts
git commit -m "feat(ledger): claim resolution core with injected git surface"
```

---

### Task 4: Inferred claims and hunk mapping

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Modify: `scripts/lib/ledger-claims-core.ts`
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Modify: `tests/scripts/ledgerClaims.test.ts`

- [ ] **Step 1: Write the failing tests** — one per §3.2 step 6 rule.

```ts
it("drops a hunk that lands outside every entry span", () => {
  // BACKLOG.md:7 is the reconciliation preamble; the first entry starts at 11.
  const r = resolveClaims(fake({
    showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/feat/a"
      ? "preamble\n\n\n\n\n\n\n\n\n\n## BL-X\n\nbody\n" : null),
    diffHunks: () => [{ file: "BACKLOG.md", start: 7, count: 1 }],
  }), { fetch: false });
  expect(r.claims).toEqual([]);
});

it("drops a pure deletion, which has no new-side line", () => {
  const r = resolveClaims(fake({
    showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/feat/a" ? "## BL-X\n\nbody\n" : null),
    diffHunks: () => [{ file: "BACKLOG.md", start: 1, count: 0 }],
  }), { fetch: false });
  expect(r.claims).toEqual([]);
});

it("attributes a boundary-spanning hunk to every entry it overlaps", () => {
  const r = resolveClaims(fake({
    showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/feat/a"
      ? "## BL-X\n\nbody\n\n## BL-Y\n\nbody\n" : null),
    diffHunks: () => [{ file: "BACKLOG.md", start: 2, count: 5 }],
  }), { fetch: false });
  expect(r.claims.map((c) => c.id).sort()).toEqual(["BL-X", "BL-Y"]);
  expect(r.claims.every((c) => c.kind === "inferred")).toBe(true);
});

it("disables inferred when merge-base is unresolvable, keeping declared", () => {
  const r = resolveClaims(fake({ mergeBase: () => null }), { fetch: false });
  expect(r.claims.map((c) => c.kind)).toEqual(["declared"]);
  expect(r.degraded).toContain("merge-base-unavailable");
});
```

- [ ] **Step 2–5:** Run (FAIL) → implement the three mapping rules → run (PASS) → `pnpm typecheck`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/ledger-claims-core.ts tests/scripts/ledgerClaims.test.ts
git commit -m "feat(ledger): inferred claims with specified hunk mapping"
```

---

### Task 5: CLI, exit codes, and universe verification

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `scripts/ledger-claims.ts`, `tests/scripts/ledgerClaimsCheck.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests** — the exit table (§3.3) plus every §4.1 universe row, and the identity matrix.

Required cases, each asserting an exit code: declared collision with resolved identity → **1**; inferred-only collision → **0** with `WARN`; zero ids → **2**; per-file vacuity (a non-empty ledger yielding zero entries) → **2**; fetch failure → **2**; zero refs → **2**; head map differing by OID under an unchanged name → **2**; head map with an extra local name → **2**; head map missing a remote-advertised name → **2**; `ls-remote` throwing → **2**; a declared claim planted in `DEFERRED.md` → **1**, and the claim is **found** (plan-R2 finding 10: "parsed with backlog opts → 2" is not executable against the correct program, since no opts-mutation seam exists; the positive form is what a wrong mapping actually fails); 101 candidates with the collision in the 101st → **1**; `--json` with 101 candidates → all 101 emitted; `origin/HEAD` present and otherwise healthy → **0**; only `main` on origin → **0**; a candidate predating the ledgers → **0**; genuinely empty candidate ledgers → **0**; merged-main snapshot carrying a marker → **0**; local identity on the declaring branch → **0**; CI + readable payload + same repo → **0**; CI + readable payload + fork with a same-name base branch → **1**; CI + absent payload + `GITHUB_HEAD_REF` naming the declaring branch → **2**.

Plus the six cases plan-R1 finding 3 found omitted, each with the mutant it catches:

| Case | Required | Mutant it catches |
| --- | --- | --- |
| Global vacuity, **isolated from per-file** | **2** | plan-R2 finding 8: the naive form cannot fail. A non-empty candidate yielding zero already trips per-file vacuity, so deleting the global gate changes the outcome not at all. The fixture must make per-file PASS and global FAIL: one candidate whose ledger files are genuinely empty on disk (per-file stays silent) beside one whose files are non-empty and parse normally, with every branch still yielding zero claims |
| `resolved = {main, stale-a, stale-b}` vs `remote = {main, claimed}`, strictly **larger** | **2** | plan-R2 finding 9: a validator rejecting changed OIDs, isolated extras, isolated missing names, AND equal-cardinality substitution still trusts a larger cache whose extras conceal the missing claimed branch |
| `resolved = {main, stale}` vs `remote = {main, claimed}` | **2** | a count-plus-shared-OID comparison that trusts equal-cardinality substitution |
| `--json` healthy-empty vs fetch-failed | distinguishable payloads | a bare array serializing both as `[]` |
| `isShallow()` given the literal string `"false"` | treated as **not** shallow | `Boolean("false") === true`, which classifies every full clone as shallow and permanently disables the merged-exclusion |
| A genuinely shallow fixture clone (`git clone --depth=1`) | merged-exclusion skipped, `declared` still resolves | a shallow branch that is dead code no test enters |
| §4.3 argument handling: lowercase and backticked ids, duplicates, an id defined nowhere | normalized / de-duplicated / noted-and-continued | an implementation that only ever sees canonical input |

**PR display (plan-R1 finding 4, corrected by plan-R2 finding 11).** `prList()` is exercised here,
since nothing else assigns it. The earlier phrasing was incoherent with the data model: `Claim` rows
key on base-repository `origin` heads and carry no repository identity, so there is no fork claim row
for a second PR to attach to. The assertion is **non-attachment** — given two open PRs sharing the
head name `fix/shared`, one from the base repo and one from a fork, the claim on the base branch
shows the **base** PR number and not the fork's. A `prList()` that throws or exceeds its 10 s bound
leaves the column blank while the table still prints and the exit code is unchanged.

Derive every expected id from the planted fixture text; never hardcode a literal the fixture does not produce.

- [ ] **Step 2–4:** Run (FAIL) → implement the CLI → run (PASS).

The `--json` envelope is `{ status, degraded, claims }` and is **never capped**; the 100-branch cap applies to the human table only.

- [ ] **Step 5: Wire the script**

Add to `package.json` scripts, after `"spec:lint"`:

```json
"ledger:claims": "tsx scripts/ledger-claims.ts",
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ledger-claims.ts tests/scripts/ledgerClaimsCheck.test.ts package.json
git commit -m "feat(ledger): ledger:claims CLI with distinct exit-code semantics"
```

---

### Task 6: Preflight wiring

**Files:**
- Modify: `scripts/preflight-env.mjs`
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `tests/scripts/preflightClaims.test.ts`

- [ ] **Step 1: Write the failing tests**

Positive wiring first — every assertion below is conditional on it (§7.5):

```ts
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveClaims, type GitSurface } from "@/scripts/lib/ledger-claims-core";
import { recordingGitSurface } from "./_recordingGitSurface";

const ROOT = join(__dirname, "..", "..");
const SENTINEL = "CLAIMS-CHILD-RAN";

/**
 * Runs preflight with a stub `tsx` earlier on PATH, so the claims child is
 * observable without touching the network. `CI` is cleared explicitly: this file
 * runs in the `serial` project (vitest.config.ts:96), which has CI=true in
 * Actions, and §3.4 suppresses claims under CI. Without this, the one assertion
 * that makes this file non-vacuous is green locally and red in CI.
 */
function runPreflight(args: string[], env: Record<string, string | undefined> = {}) {
  const r = spawnSync("node", [join(ROOT, "scripts/preflight-env.mjs"), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, CI: undefined, PATH: `${join(ROOT, "tests/scripts/__stubbin__")}:${process.env.PATH ?? ""}`, ...env },
  });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

describe("preflight claims wiring", () => {
  it.each([
    ["default", [] as string[]],
    ["--no-db", ["--no-db"]],
  ])("spawns the claims child on the %s success path", (_label, args) => {
    // Both paths print `env ✓`; --no-db exits at scripts/preflight-env.mjs:132,
    // so a step appended after the DB probe is dark there.
    expect(runPreflight(args).out).toContain(SENTINEL);
  });

  it("spawns the claims child when psql is absent from PATH", () => {
    // The ENOENT path exits at scripts/preflight-env.mjs:142.
    const r = runPreflight([], { PATH: join(ROOT, "tests/scripts/__stubbin__") });
    expect(r.out).toContain(SENTINEL);
  });

  it("passes --no-fetch to the child", () => {
    // The stub echoes its argv, so this asserts the flag actually reaches it.
    expect(runPreflight([]).out).toContain("--no-fetch");
  });

  it.each([
    ["CI set", [] as string[], { CI: "true" }],
    ["--no-claims", ["--no-claims"], {}],
    ["PREFLIGHT_NO_CLAIMS=1", [], { PREFLIGHT_NO_CLAIMS: "1" }],
  ])("does NOT spawn the child under %s", (_label, args, env) => {
    // Asserts non-spawn, not absent output: a suppression that runs the child and
    // discards its stdout would pass an output-only assertion (M10).
    expect(runPreflight(args, env).out).not.toContain(SENTINEL);
  });

  it("exits 0 when the claims child fails", () => {
    expect(runPreflight([], { CLAIMS_STUB_MODE: "fail" }).status).toBe(0);
  });

  it("exits 0 when the claims child times out", () => {
    expect(runPreflight([], { CLAIMS_STUB_MODE: "hang" }).status).toBe(0);
  });
});

describe("the reader honors --no-fetch behaviorally (M9)", () => {
  it("creates no git fetch and no git ls-remote child", () => {
    // NOT a completion assertion: connection refusal is immediate (0.03 s for
    // ls-remote, 0.04 s for gh), so "it finished" proves nothing. This asserts
    // non-invocation at the seam by counting spawns through a recording GitSurface.
    const argv: string[][] = [];
    // Records at the PROCESS boundary, not the GitSurface interface: a mutant
    // running `git ls-remote` inside localRefs() would be invisible to a
    // member-name spy (plan-R2 finding 14).
    const spy: GitSurface = recordingGitSurface((a: string[]) => { argv.push(a); return ""; });
    resolveClaims(spy, { fetch: false });
    expect(argv.filter((a) => a[0] === "git" && a[1] === "fetch")).toEqual([]);
    expect(argv.filter((a) => a[0] === "git" && a[1] === "ls-remote")).toEqual([]);
  });
});
```

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
`tests/scripts/_recordingGitSurface.ts` is created by this task too — plan-R2 finding 12 caught both
`recordingGitSurface` and `resolveClaims` used but never imported or defined, so the block did not
compile. **And plan-R2 finding 14 refutes the member-name spy it was going to be**: recording which
`GitSurface` members were called proves nothing, because a mutant running `git ls-remote` *inside*
`localRefs()` records only `localRefs`. The recorder therefore wraps the **process boundary**, not
the interface: it takes an injected spawn function, records every argv it receives, and returns
canned data without spawning. The assertion is over recorded argv (`no argv beginning
["git","fetch"]`, none beginning `["git","ls-remote"]`), which is the boundary §7.5 specifies.

The `tests/scripts/__stubbin__/tsx` stub is created by this task: an executable shell script that
echoes `CLAIMS-CHILD-RAN` plus its argv, then honors `CLAIMS_STUB_MODE` (`fail` exits 1, `hang`
sleeps past the 15 s budget). Create it with `printf` and `chmod +x`, never `echo >>`.

**Every spawn in these tests sets `env: { ...process.env, CI: undefined }`.** `tests/scripts/**` runs in the `serial` project (`vitest.config.ts:96`), which runs with `CI=true` in Actions — without clearing it, the one assertion that makes this file non-vacuous is green locally and red in CI.

Suppression cases assert the child was **not spawned**, not merely that output was absent (M10).

- [ ] **Step 2–4:** Run (FAIL) → implement → run (PASS).

Placement: after the env checks, **before** the DB probe at `scripts/preflight-env.mjs:130`. Never changes preflight's exit code.

- [ ] **Step 5: Commit**

```bash
git add scripts/preflight-env.mjs tests/scripts/preflightClaims.test.ts
git commit -m "feat(ledger): surface live claims in preflight"
```

---

### Task 7: CI collision backstop

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `tests/docs/_metaLedgerClaimCollision.test.ts`
- Modify: `tests/docs/_metaLedgerReferentialIntegrity.test.ts` — add **three** paths to `NOT_CITATIONS`, not one: this guard plus the two reader test files, all of which plant `BL-X`/`BL-Y` fixtures. Plan-R1 finding 5: the citation guard walks every tracked `*.ts` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:106`), so the reader tests turn CI red the moment Tasks 3-5 commit — before Task 7 runs. **Move this registration into Task 3's commit** rather than leaving it here; a row that arrives two tasks after the file it exempts is two tasks of red CI.

- [ ] **Step 1: Write the test**

Declared-versus-declared only. Fetches its own heads at depth 1 (measured at 1.8 s, §2.7b). Under `CI` a fetch failure **fails**; locally it skips. Vacuous-pass guard asserts **`origin/main` resolved** — never that a non-main head exists, which would reject legitimate fork PRs (§7.3). Identity via the same three-case rule as the reader, with all four fixtures.

- [ ] **Step 2–4:** Run (FAIL on the planted collision) → implement → run (PASS).

- [ ] **Step 5: Commit**

```bash
git add tests/docs/_metaLedgerClaimCollision.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts
git commit -m "test(ledger): CI backstop for cross-branch declared collisions"
```

---

### Task 8: AGENTS.md delta and its contract guard

**Files:**
- Modify: `AGENTS.md`
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `tests/docs/_metaAgentsMarkerContract.test.ts`

- [ ] **Step 1: Write the failing guard** — one assertion per §6 edit, six rows, per §7.5a's table. Row 6.1 asserts the reading rule is present **and** that no sentence asserts the marker reaches main at merge (a paraphrase walks past literal retired-phrase checks). Row 6.6 asserts an **ordering**, the only one in the set.

- [ ] **Step 2: Run to verify it fails** against the unedited `AGENTS.md`.

- [ ] **Step 3: Apply the six edits** of §6.1–§6.6 verbatim.

- [ ] **Step 4: Run to verify it passes**, then `pnpm exec vitest run tests/docs/`.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md tests/docs/_metaAgentsMarkerContract.test.ts
git commit -m "docs(agents): read claims from origin's branches; move marker removal pre-merge"
```

---

### Task 9: Full verification

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm format:check`
- [ ] **Step 2:** `pnpm exec vitest run tests/docs/ tests/scripts/`
- [ ] **Step 3:** `pnpm preflight` — confirm the claims table prints and the exit code is unchanged.
- [ ] **Step 4:** `pnpm ledger:claims` against the live repo — confirm it reports the declarations §2.3 measured, and `pnpm ledger:claims --check BL-LEDGER-MDAST-SHARED-HOME` exits 0.
- [ ] **Step 5:** Commit any fixes; push; confirm **real CI green** before merge (local green is necessary, not sufficient).

---

## 12. Close-out

impeccable-gate: N/A — no UI surface

No file under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md` is touched, so invariant 8's dual gate does not apply.

**Adversarial review (cross-model):** mandatory between self-review and execution handoff. Dispatch via `node scripts/codex-guard.mjs review --brief <file> --cwd <worktree> --out <fresh timestamped dir>`, backgrounded. Iterate to APPROVE with no round budget.

**Ledger bookkeeping (invariant 12):** this branch opens no `BL-`/`DEF-` entry for its own work (§9.1). The three rows it files — `BL-LEDGER-BODY-DEFINED-ID-OVERMINT`, `BL-LEDGER-MDAST-SHARED-HOME`, `BL-LEDGER-DISCOVERY-FAMILY-SCOPED` — are filed OPEN, not in flight, and each names its deferral exception per `AGENTS.md:227`.

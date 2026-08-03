# Plan — settle `BL-LEAD-CAPABILITY-PROSE-STALE`

**Spec:** `docs/superpowers/specs/2026-08-03-lead-capability-prose-settle-design.md` (canonical) · **Branch:** `docs/settle-lead-capability-prose` · **Implementer:** Opus / Claude Code

Six instances of one class — a hand-maintained restatement of a predicate or structure that nothing forces to stay true — plus two structural guards that make the load-bearing ones self-enforcing, plus the ledger graduation and one descoped-class filing. No UI, no DB, no migration, no advisory lock, no runtime behavior change.

---

## 0. Pre-draft verification pass (RUN, not planned)

Every file, symbol, and line named below was opened and confirmed before this plan was drafted. Transcript:

```
$ sed -n '118,124p' lib/visibility/capabilityTransitions.ts
 * Tile-visibility rules from `lib/visibility/scopeTiles.ts` (verbatim
 * branch logic):
 *
 *   audioScopeVisible    = A1 || A2 || LEAD       (…)
 *   videoScopeVisible    = V1 || LEAD              (…)
 *   lightingScopeVisible = L1 || LEAD              (…)
 *   financialsVisible    = isAdmin || LEAD          (LEAD-or-admin)

$ grep -n 'export function .*Visible' lib/visibility/scopeTiles.ts
85:export function audioScopeVisible(flags: RoleFlag[]): boolean {
96:export function videoScopeVisible(flags: RoleFlag[]): boolean {
113:export function lightingScopeVisible(flags: RoleFlag[]): boolean {
140:export function financialsVisible(flags: RoleFlag[], isAdmin: boolean): boolean {

$ grep -n 'export const\|export function\|export type' lib/visibility/capabilityTransitions.ts
53:export type CapabilityPredicate = "hasLead" | "hasA1" | "hasV1" | "hasL1" | "hasAdmin";
60:export type GatedTile =            (4 members: Financials/Audio/Video/LightingScopeTile)
70:export type FlipDirection
79:export interface CapabilityTransitionEntry
109:export interface TileVisibilityDelta
132:export const CAPABILITY_TRANSITION_MATRIX
296:export function affectedTilesOnFlip

$ grep -rn 'capabilityTransitions' --include='*.ts' --include='*.tsx' . | grep -v '^./lib/visibility/capabilityTransitions.ts'
tests/visibility/capabilityTransitions.test.ts:17
tests/visibility/transportTransitions.test.ts:27      (imports affectedTilesOnFlip + type CapabilityPredicate)
                                                      → zero production importers

$ awk 'NR>=146 && NR<=175 && /^  \| "/ {c++} END{print c}' lib/parser/types.ts
20
```

Important shape note discovered in this pass, which the implementation must accommodate: **the block header at `lib/visibility/capabilityTransitions.ts:118-119` is wrapped across two comment lines** (`… (verbatim` / `branch logic):`). A single-line sentinel is therefore not present today and Task 1 creates one.

### Reconciliation sweep (RUN, with output and per-hit disposition)

```
$ rg -n 'admin/ops' lib app components tests
(no output — zero hits)

$ rg -n 'admin/ops' docs BACKLOG.md BACKLOG-archive.md
docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627        → FIXED by Task 5 (instance B)
BACKLOG.md:7                                                        → reconciliation-log history; left as written
BACKLOG.md:645,653,654,656 (the entry itself)                       → moves to BACKLOG-archive.md by Task 7
docs/superpowers/specs/2026-08-02-copy-deadcode-sweep-design.md:34,80,107,119,167,264   → the filing + its census; history, left
docs/superpowers/plans/2026-08-02-copy-deadcode-sweep.md:52,63      → history, left
docs/superpowers/plans/2026-08-02-docs-hygiene-citation-rot-financials-vocab.md:142     → the endorsement; left, per spec §2.5
docs/superpowers/plans/alerts/2026-07-17-condensed-alert-copy.md:409                    → quotes retired copy; history, left
docs/superpowers/specs/2026-07-18-alert-copy-full-sweep-design.md:239,244               → history, left
docs/superpowers/specs/step3-onboarding/2026-07-17-mi9-lead-autoapply-fyi.md:45         → history, left
docs/superpowers/specs/alerts/2026-07-17-role-flags-notice-lead-only-doug.md:6,159,178  → history, left
```

Every hit is dispositioned. After Task 5 the master spec's hit is gone and the only remaining ones are history plus this branch's own documents.

---

## 1. Meta-test inventory (mandatory declaration)

- **CREATES** `tests/visibility/_metaDocumentedPredicateParity.test.ts` — documented-predicate behavioral parity (spec §2.2b). **Wiring, verified: no new entry is required.** `vitest.projects.ts:92` already globs `tests/visibility/**/*.test.{ts,tsx}`, so the file is collected by `pnpm test` on creation, and `.github/workflows/unit-suite.yml` runs on `pull_request` and on `push` to `main` with no path filter, so it is merge-gating from its first commit. No `testMatch` addition, no workflow edit, no path-filter change.
- **EXTENDS** `tests/visibility/capabilityTransitions.test.ts` — matrix-size expectations derived from `CAPABILITY_PREDICATES` rather than literals (spec §2.2c), and the duplicate `ALL_PREDICATES` list retired (instance F).
- **EXTENDS** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — one `BACKLOG_GRADUATED` row.
- **Descoped, no edit:** the coverage-claim class is handed to `BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES` (spec §1.2, §2.7). No file outside the three census files is touched.
- **No other registry applies.** Not a Supabase call boundary (invariant 9 — no Supabase client call is added), not a mutation surface (invariant 10 — no route handler, no `"use server"` action), not an advisory-lock surface (invariant 2 — no `pg_advisory*` anywhere in the diff), not a tile-render or sentinel surface, not an `admin_alerts` catalog change.

## 2. Mutation-family closure (mandatory for guard work)

This enumeration **is the closure set the review converges against.** A reviewer-proposed additional family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| # | Mutation | Caught by | How it fails |
| --- | --- | --- | --- |
| M1 | A flag token deleted from a documented line while the live function keeps it (**the shipped bug**) | parity guard | `fn([tok], false)` true, `tokens.includes(tok)` false |
| M2 | A flag token added to a documented line the live function does not have | parity guard | mirror of M1 |
| M3 | A flag branch added to a live function without a comment update | parity guard | same assertion, opposite origin |
| M4 | A flag branch removed from a live function without a comment update | parity guard | same |
| M5 | A `*Visible` export renamed or deleted | parity guard, three-way name-set equality | reflected export set ≠ documented set ≠ invoker table |
| M6 | A new `*Visible` export with no documented line | parity guard, same equality | reflected set gains a member the other two lack |
| M7 | The block header removed, renamed, or re-wrapped | parity guard, parser throws | "documented-predicate block not found" |
| M8 | The block emptied or truncated to ≠ 4 lines | parity guard, arity assertion | expected 4, received n |
| M9 | A documented line rewritten with an unsupported operator (`&&`, `!`, nesting) | parity guard, shape assertion | expression fails the `token (\|\| token)*` shape |
| M10 | A documented token that is neither a `RoleFlag` nor `isAdmin` (typo) | parity guard, vocabulary assertion | token ∉ `ALL_ROLE_FLAGS ∪ {isAdmin}` |
| M11 | The `isAdmin` arm dropped from `financialsVisible`, or claimed for a predicate that takes no `isAdmin` argument | parity guard, `isAdmin` arm assertion | `fn([], true)` disagrees with `tokens.includes("isAdmin")` |
| M12 | A `RoleFlag` added to the union without extending the guard's universe | **compile time** — `Exclude<RoleFlag, …> extends never` | `pnpm typecheck` fails |
| M13 | A predicate added to `CAPABILITY_PREDICATES` without the matrix growing | matrix guard, derived pair-set | expected `C(n,2)` pairs, matrix has fewer; message names each missing pair |
| M14 | A matrix entry deleted | matrix guard, pair-set equality | names the missing pair |
| M15 | A duplicate pair or a diagonal entry | matrix guard (pre-existing assertions, retained) | unchanged behavior |
| M16 | A **conjunctive** branch added to a live function (`V1 && L1`), which no singleton sweep can see — **added at spec review R1 with a live escaping mutant** | parity guard, exhaustive powerset | the two-flag subset disagrees; the mismatch names it |
| M17 | An `isAdmin × flags` interaction in `financialsVisible` (e.g. admin suppressed when flags are non-empty) | parity guard, full `subset × isAdmin` cross product | same |
| M18 | A new exported `*Visible` function that is neither documented nor exempted — **added at R2 with a live escaping export** (`transportTileVisible`) | parity guard, unclassified-export assertion | the export appears in neither the documented set nor `NOT_FLAG_GATED` |
| M20 | An exemption row hollowed out to a blank or citation-less reason — **added at R3 with a live escaping mutation** | parity guard, exemption-reason assertion | reason is under 20 chars or cites no `file:line` |
| M19 | A documented line claiming `isAdmin` for a predicate whose arity cannot receive it — **added at R2 with a probe: three predicates were never evaluated at `isAdmin = true`** | parity guard, arity-derived `adminGrants` assertion | `expect(adminGrants).toBe(false)` fails before the sweep runs |

M16 and M17 are why the sweep is exhaustive rather than singleton-based; M18 and M19 are why nothing about *which* functions to check or *how* to call them is hand-maintained — both hand lists in the R1 draft (`INVOKERS`, `TAKES_IS_ADMIN`) were themselves instances of the class under settlement, and R2 produced an escaping mutant for each. With the powerset sweep the family list is closed **by exhaustion, not by enumeration**: for a documented pure disjunction over 20 flags, every possible predicate body over that input domain is checked at every input, so no branch of any shape or arity can escape. A further mutation family in this guard is not merely unadmitted, it is unconstructible.

**Explicitly outside the closure set** (stated so it is not re-proposed as a gap): free-text prose in either module remains unguarded — spec §2.3's named accepted limit. The guards cover predicate *expressions* and matrix *completeness*, not sentences about them.

## 3. N/A declarations

| Mandatory task type | Disposition |
| --- | --- |
| Layout-dimensions task (real-browser `getBoundingClientRect`) | **N/A** — no fixed-dimension parent, no rendered component, no file under `app/` or `components/` |
| Transition-audit task | **N/A** — no `AnimatePresence`, no ternary render, no component visual state. The "transition matrix" here is a data structure |
| e2e harness-readiness checklist | **N/A** — no Playwright spec is added or modified; no server boot |
| Advisory-lock holder topology | **N/A** — `rg 'pg_advisory' <diff>` is empty |
| §12.4 three-way lockstep | **N/A** — the master-spec edit is in §6.8, not the error-code catalog. Task 5 nonetheless runs `pnpm test:audit:x1-catalog-parity` as a negative check |

---

## 4. Tasks

Each task is TDD: failing test → minimal implementation → passing test → commit. One commit per task, conventional-commits style.

### Task 1 — the parity guard, and the comment fix that turns it green (instances A + D-neighbour)

**This is ONE task and ONE commit.** The draft split it into a RED commit and a GREEN commit; spec review R2 correctly called that a violation of AGENTS.md invariant 1, whose sequence is "failing test -> minimal implementation -> passing test -> commit". A commit is never landed red. Both observed RED states are recorded in the commit message as evidence, not as a committed state.

**Two RED observations, in order.** R2's probe established that the first one is not the one the draft claimed:

1. Write the guard, run it against the unmodified tree. The block header currently wraps across `lib/visibility/capabilityTransitions.ts:118-119` (`... (verbatim` / `branch logic):`), so no line carries a complete sentinel, the parser throws during collection, and the whole file aborts:

   ```
   Error: documented-predicate block not found: no line contains "(verbatim branch logic from"
   ```

   That IS a genuine failing test (mutation family M7 firing on the real tree), but it is not yet evidence for AC-1.

2. Apply ONLY the sentinel repair (put the header on one line, change nothing else). Re-run. Now the block parses and the real defect surfaces:

   ```
   financialsVisible: documented tokens equal the live function over the ENTIRE flag powerset
     expected [] , received [ "financialsVisible([FINANCIALS], isAdmin=false): documented false, live true" ]
   ```

   This is AC-1.

3. Apply the expression repair (Task 1's second half, below). Re-run: green. Commit.

**Algorithm pre-validated out of tree** before this plan was finalized, so the numbers below are measurements rather than estimates:

```
$ node <standalone probe: the four live predicate bodies + the sweep algorithm below, run outside the repo>
CLEAN TREE (all four must be []):
  audioScopeVisible []
  videoScopeVisible []
  lightingScopeVisible []
  financialsVisible []
  total wall clock: 804 ms
SHIPPED BUG (comment omits FINANCIALS):
  ([FINANCIALS], isAdmin=false): documented false, live true
R1 ESCAPING MUTANT (conjunctive V1 && L1 spliced into audioScopeVisible):
  singleton-only sweep would report: 0 mismatches
  exhaustive sweep reports: ([V1,L1], isAdmin=false): documented false, live true
M17 (admin suppressed when flags non-empty):
  exhaustive sweep reports: ([A1], isAdmin=true): documented true, live false
```

The middle result is the whole argument for exhaustion: the mutant R1 found escapes a singleton sweep with **zero** mismatches and is caught by the powerset sweep at `[V1,L1]`.

#### 1a. `tests/visibility/_metaDocumentedPredicateParity.test.ts` (new)

Header, flag universe, and the compile-time exhaustiveness check:

```ts
/**
 * Structural meta-test: every predicate line documented in
 * `lib/visibility/capabilityTransitions.ts` must match the BEHAVIOR of the
 * live `lib/visibility/scopeTiles.ts` function it claims to quote.
 *
 * Expected values are parsed from the comment; actual values come from
 * calling the live function. Neither side derives from the other, so this
 * cannot pass tautologically.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as scopeTiles from "@/lib/visibility/scopeTiles";
import type { RoleFlag } from "@/lib/parser/types";

const MODULE_REL = "lib/visibility/capabilityTransitions.ts";
const BLOCK_SENTINEL = "(verbatim branch logic from";

const ALL_ROLE_FLAGS = [
  "LEAD", "A1", "A2", "V1", "L1", "GS", "BO", "CAM_OP", "PTZ", "LED",
  "STREAM", "GAV", "FLOATER", "FLOOR", "SHOW_CALLER", "GREEN_ROOM",
  "OWNER", "CONTENT_CREATION", "FINANCIALS", "ONLY",
] as const satisfies readonly RoleFlag[];

// A RoleFlag added to lib/parser/types.ts and not added above is a COMPILE
// error here, so the sweep below can never silently under-test. (M12)
type NoFlagOmitted = Exclude<RoleFlag, (typeof ALL_ROLE_FLAGS)[number]> extends never ? true : never;
const _exhaustive: NoFlagOmitted = true;
void _exhaustive;

/**
 * Exported `*Visible` functions that are NOT capability-flag gates and so
 * have no place in a block of flag disjunctions. Registry-or-exemption
 * idiom, same shape as invariants 9 and 10: reflection finds every export,
 * and each must be documented OR exempted here with a reason, so a NEW
 * export is uncovered-by-default rather than silently skipped.
 */
const NOT_FLAG_GATED: Record<string, string> = {
  transportTileVisible:
    "takes an options object (transportation row, viewerId, transportationOwnerIds, viewerName), not a RoleFlag[]; gates on transport ownership, not on a capability flag. lib/visibility/scopeTiles.ts:180",
};
```

Parser (pure — takes source text so the negative cases can drive it):

```ts
interface DocumentedPredicate {
  readonly name: string;
  readonly tokens: readonly string[];
}

function stripCommentPrefix(line: string): string {
  return line.replace(/^\s*\*[ \t]?/, "");
}

function parseDocumentedPredicates(source: string): DocumentedPredicate[] {
  const lines = source.split("\n");
  const headerIdx = lines.findIndex((line) => line.includes(BLOCK_SENTINEL));
  if (headerIdx === -1) {
    throw new Error(
      `documented-predicate block not found: no line contains "${BLOCK_SENTINEL}". ` +
        `If the comment was re-wrapped, restore the sentinel to a single line.`,
    );
  }
  const out: DocumentedPredicate[] = [];
  let started = false;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) break;
    const body = stripCommentPrefix(raw).trim();
    if (body === "") {
      if (started) break;
      continue;
    }
    started = true;
    const m = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^(]*)/.exec(body);
    if (m === null) {
      throw new Error(`documented-predicate line is not "<name> = <expr>": ${body}`);
    }
    const name = m[1]!;
    const expr = m[2]!.trim();
    if (!/^[A-Za-z0-9_]+(\s*\|\|\s*[A-Za-z0-9_]+)*$/.test(expr)) {
      throw new Error(
        `documented predicate "${name}" uses an expression shape this guard does not ` +
          `interpret (only "a || b || c" is supported): ${expr}`,
      );
    }
    out.push({ name, tokens: expr.split("||").map((t) => t.trim()) });
  }
  return out;
}
```

Live side — reflected, arity-derived, nothing hand-maintained except the exemption reasons:

```ts
type FlagPredicate = (flags: RoleFlag[], isAdmin?: boolean) => boolean;

const REFLECTED: ReadonlyArray<readonly [string, FlagPredicate]> = Object.entries(
  scopeTiles as Record<string, unknown>,
)
  .filter(([key, value]) => key.endsWith("Visible") && typeof value === "function")
  .map(([key, value]) => [key, value as FlagPredicate] as const)
  .sort((a, b) => a[0].localeCompare(b[0]));

const GATED = REFLECTED.filter(([name]) => !(name in NOT_FLAG_GATED));

/** Arity decides the call shape, NOT a hand-written set. (R2 finding 3) */
function callPredicate(fn: FlagPredicate, flags: RoleFlag[], isAdmin: boolean): boolean {
  return fn.length >= 2 ? fn(flags, isAdmin) : fn(flags);
}
```

Assertions:

```ts
const SOURCE = readFileSync(join(process.cwd(), MODULE_REL), "utf8");

describe("documented predicate lines match live scopeTiles behavior", () => {
  const documented = parseDocumentedPredicates(SOURCE);

  test("every NOT_FLAG_GATED exemption carries a real reason", () => {
    // Key presence alone would make "blank the reason" an escaping mutation. (R3 finding 2)
    const hollow = Object.entries(NOT_FLAG_GATED).filter(
      ([, reason]) => reason.trim().length < 20 || !/\.ts:\d+/.test(reason),
    );
    expect(hollow).toEqual([]);
  });

  test("every reflected *Visible export is either documented or exempted", () => {
    const documentedNames = new Set(documented.map((d) => d.name));
    const unclassified = REFLECTED.map(([name]) => name).filter(
      (name) => !documentedNames.has(name) && !(name in NOT_FLAG_GATED),
    );
    expect(unclassified).toEqual([]);
  });

  test("every documented name is a real, non-exempted export", () => {
    expect(documented.map((d) => d.name).sort()).toEqual(GATED.map(([name]) => name));
  });

  test.each(documented.map((d) => [d.name, d] as const))(
    "%s: every documented token is real vocabulary",
    (_name, doc) => {
      const vocabulary = new Set<string>([...ALL_ROLE_FLAGS, "isAdmin"]);
      for (const token of doc.tokens) expect(vocabulary.has(token)).toBe(true);
    },
  );

  test.each(documented.map((d) => [d.name, d] as const))(
    "%s: documented tokens equal the live function over the ENTIRE flag powerset",
    (name, doc) => {
      const entry = GATED.find(([n]) => n === name);
      expect(entry).toBeDefined();
      const fn = entry![1];

      const takesIsAdmin = fn.length >= 2;
      const adminGrants = doc.tokens.includes("isAdmin");
      // An arity-1 predicate cannot be granted by isAdmin, so a documented
      // line claiming it is false regardless of any flag input. (R2 finding 3)
      if (!takesIsAdmin) expect(adminGrants).toBe(false);

      let tokenMask = 0;
      ALL_ROLE_FLAGS.forEach((flag, i) => {
        if (doc.tokens.includes(flag)) tokenMask |= 1 << i;
      });

      const mismatches: string[] = [];
      const total = 1 << ALL_ROLE_FLAGS.length; // 2**20 = 1_048_576
      for (const isAdmin of takesIsAdmin ? [false, true] : [false]) {
        for (let mask = 0; mask < total; mask++) {
          const subset: RoleFlag[] = [];
          for (let i = 0; i < ALL_ROLE_FLAGS.length; i++) {
            if (mask & (1 << i)) subset.push(ALL_ROLE_FLAGS[i]!);
          }
          const expected = (isAdmin && adminGrants) || (mask & tokenMask) !== 0;
          if (callPredicate(fn, subset, isAdmin) !== expected) {
            mismatches.push(
              `${name}([${subset.join(",")}], isAdmin=${isAdmin}) documented=${expected} live=${!expected}`,
            );
            if (mismatches.length >= 5) break;
          }
        }
        if (mismatches.length >= 5) break;
      }

      expect(mismatches).toEqual([]); // ONE assertion, not 2**20 of them
    },
  );
});

describe("the parser fails loudly rather than silently passing", () => {
  test("M7: missing sentinel throws", () => {
    expect(() => parseDocumentedPredicates("/**\n * nothing here\n */")).toThrow(
      /documented-predicate block not found/,
    );
  });

  test("M8: a short block yields fewer entries than there are gated predicates", () => {
    const short = ` * (verbatim branch logic from x):\n *\n *   audioScopeVisible = A1\n *\n`;
    expect(parseDocumentedPredicates(short)).toHaveLength(1);
    expect(parseDocumentedPredicates(short).length).toBeLessThan(GATED.length);
  });

  test("M9: an unsupported operator throws", () => {
    const bad = ` * (verbatim branch logic from x):\n *\n *   financialsVisible = isAdmin && LEAD\n *\n`;
    expect(() => parseDocumentedPredicates(bad)).toThrow(/expression shape this guard does not/);
  });
});
```

Two implementation constraints carry the powerset cost, and getting either wrong is the whole risk: the expected side is a **bitmask AND**, not a nested `includes` scan; and there is **one terminal `expect`**, never one per subset. The mismatch list caps at five so a genuine failure prints a readable message naming the exact subset and both verdicts.

#### 1b. The comment repair that turns it green

In `lib/visibility/capabilityTransitions.ts`, the block becomes:

```
 * Tile-visibility rules (verbatim branch logic from scopeTiles.ts):
 *
 *   audioScopeVisible    = A1 || A2 || LEAD
 *   videoScopeVisible    = V1 || LEAD
 *   lightingScopeVisible = L1 || LEAD
 *   financialsVisible    = isAdmin || LEAD || FINANCIALS
 *
 * FINANCIALS is deliberately NOT a matrix predicate: it unlocks
 * FinancialsTile and nothing else, so it is held false throughout the
 * matrix, exactly as the entries below hold every unflipped predicate.
 * Add it to CAPABILITY_PREDICATES to model it — the derived pair-set
 * expectations then name every entry the matrix is missing.
 *
 * `transportTileVisible` is NOT in this block: it gates on transport
 * ownership via an options object, not on capability flags. The guard
 * carries that classification as its one NOT_FLAG_GATED row.
 *
 * The per-flip commentary each line used to carry moved into the entry
 * `reason` fields below, which is where it is read.
```

The sentinel `(verbatim branch logic from` must remain on ONE line — a re-wrap is exactly what family M7 catches, and the current wrapped header is why RED observation 1 above is a parse abort rather than a mismatch.

The four expressions lose their trailing parentheticals: the parser cuts at the first `(`, and `(LEAD-or-admin)` restating the expression it annotated is how instance A survived a change to that expression. Before deleting, verify each conditional-flip note already exists in the matrix entries' `reason` fields (`lib/visibility/capabilityTransitions.ts:151`, `lib/visibility/capabilityTransitions.ts:201`, `lib/visibility/capabilityTransitions.ts:213`); move any that does not into the relevant `reason` in this same commit rather than dropping it.

**Commit:** `test(visibility): pin documented predicates to live scopeTiles behavior over the whole flag powerset`

### Task 2 — RED then GREEN: derive the matrix expectations from the predicate list

**RED first.** In `tests/visibility/capabilityTransitions.test.ts`:

- Delete the hand-listed `ALL_PREDICATES` (`tests/visibility/capabilityTransitions.test.ts:26-32`, instance F) and import `CAPABILITY_PREDICATES` instead.
- Replace the three literals with derivations:

```ts
function allUnorderedPairs(items: readonly CapabilityPredicate[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      out.push(pairKey(items[i]!, items[j]!));
    }
  }
  return out;
}

const EXPECTED_PAIRS = allUnorderedPairs(CAPABILITY_PREDICATES);

test("the matrix covers exactly the C(n,2) unordered pairs of CAPABILITY_PREDICATES", () => {
  const actual = new Set(CAPABILITY_TRANSITION_MATRIX.map((e) => pairKey(e.a, e.b)));
  expect([...actual].sort()).toEqual([...EXPECTED_PAIRS].sort());
});

test("every predicate appears in exactly n-1 entries (its partners)", () => {
  // …counts derived from CAPABILITY_PREDICATES.length - 1
});

test("allUnorderedPairs tracks n: a synthetic 6-predicate list demands 15 pairs", () => {
  const synthetic = ["p1", "p2", "p3", "p4", "p5", "p6"] as unknown as readonly CapabilityPredicate[];
  expect(allUnorderedPairs(synthetic)).toHaveLength(15);
});
```

The synthetic-list case (AC-6, family M13) is what proves the expectation tracks `n` rather than coincidentally equalling 10. Without it, `allUnorderedPairs` could return a hardcoded 10-element list and every other assertion would still pass.

This is RED because `CAPABILITY_PREDICATES` does not exist yet — the import fails. The GREEN half below lands in the SAME commit (invariant 1: a commit is never landed red).

**GREEN.** In `lib/visibility/capabilityTransitions.ts`, invert the derivation:

```ts
export const CAPABILITY_PREDICATES = [
  "hasLead",
  "hasA1",
  "hasV1",
  "hasL1",
  "hasAdmin",
] as const;

export type CapabilityPredicate = (typeof CAPABILITY_PREDICATES)[number];
```

The exported type is byte-identical in effect; `tests/visibility/transportTransitions.test.ts:26` imports it as a type only and is unaffected. Confirm with `pnpm typecheck`.

**Commit:** `test(visibility): derive matrix size from CAPABILITY_PREDICATES instead of literals`

### Task 3 — correct the mechanism claim (instance C)

`lib/visibility/capabilityTransitions.ts:47-52` currently promises a TypeScript error that does not exist. Replace with what Task 2 actually built:

```
/**
 * The capability predicates that gate scope-tile and financials
 * visibility on the crew page. This array is the single source: the
 * `CapabilityPredicate` union is derived from it, and the matrix tests
 * derive their expected pair set from its length — so adding a
 * predicate here FAILS `tests/visibility/capabilityTransitions.test.ts`
 * until the matrix carries every new pair.
 */
```

No test changes. Task 2's guard is the thing this comment now describes; the claim is verified by the synthetic-6 case already shipped.

**Commit:** `docs(visibility): describe the completeness guard that exists, not one that does not`

### Task 4 — remove the drifted counts (instances D and E)

Two edits in `lib/visibility/capabilityTransitions.ts`:

- `lib/visibility/capabilityTransitions.ts:6-7` — the sentence beginning `Five derived predicates gate the five gated tiles` (which then names four, and points at `scopeTiles.ts`) becomes a sentence naming `CAPABILITY_PREDICATES` and the `GatedTile` union instead of counting either.
- `lib/visibility/capabilityTransitions.ts:56` — "The five gated tiles whose visibility this matrix covers." becomes "The gated tiles whose visibility this matrix covers."

Counts are deleted rather than corrected to four: a number that no longer exists cannot drift, and the authoritative counts are one line away in the code.

**Commit:** `docs(visibility): drop the drifted gated-tile counts`

### Task 5 — master spec MI-9 (instance B)

One edit inside the MI-9 row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1627`. Replace exactly:

```
; LEAD additionally grants the admin/ops surface)
```

with:

```
; LEAD additionally unlocks the Audio / Video / Lighting scope tiles — `audioScopeVisible` / `videoScopeVisible` / `lightingScopeVisible`, `lib/visibility/scopeTiles.ts`. **No `role_flags` element grants admin**: `is_admin()` reads the JWT `app_metadata.role` claim and the `admin_emails` table and never consults `role_flags` (`supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql`), and §4.4's posture is the converse — an admin viewer is a super-LEAD, not the reverse)
```

Constraints: the row is a single markdown table cell, so the replacement must contain no newline; the file's line count must not change. **Never run prettier on the master spec** (the condensed-alert-copy plan records the same constraint at `docs/superpowers/plans/alerts/2026-07-17-condensed-alert-copy.md:409`).

Verification in the same commit:

```
rg -n 'admin/ops' docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md   # expect 0
git diff --stat docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md      # expect 1 insertion, 1 deletion
pnpm test:audit:x1-catalog-parity                                            # negative check — §12.4 untouched
```

**Commit:** `docs(spec): MI-9 states what LEAD actually grants, and that admin is not it`

### Task 6 — file `BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES` (the descoped class)

No source file is edited. Add the row to `BACKLOG.md` carrying, verbatim from spec §2.7: the twelve known instances, the ground-truth probe block, the single blocker (`tests/e2e/right-now-transitions.spec.ts:285-290`), the two already-honest sites that must NOT be "fixed" (`tests/visibility/capabilityTransitions.test.ts:224` and `tests/visibility/capabilityTransitions.test.ts:272`), and the methodological finding that a hand-run grep cannot bound the class, with both failed patterns named so the next pass does not repeat them.

Status OPEN, severity LOW-MEDIUM (dark coverage on documented contracts; no product impact), effort L, class "docs/contract — test-coverage claims". Record that the set is **not known to be complete** and that its open question is a design call: guard the class mechanically, or delete the class of sentence rather than maintain it.

Verify: `pnpm vitest run tests/docs/` — `_metaLedgerReferentialIntegrity` resolves every `BL-` id this branch's documents cite.

**Commit:** `docs(backlog): file BL-COVERAGE-CLAIMS-CITE-SKIPPED-SUITES with three rounds of evidence`

### Task 7 — ledger graduation

- Move the `BL-LEAD-CAPABILITY-PROSE-STALE` section from `BACKLOG.md` into `BACKLOG-archive.md` under `## BL-LEAD-CAPABILITY-PROSE-STALE — RESOLVED (2026-08-03, docs/settle-lead-capability-prose)`, preserving the entry body and **dropping the `**Status:** IN PROGRESS · **Branch:** …` marker** — `tests/docs/_metaLedgerInProgress.test.ts` forbids an archive holding in-flight work.
- Append `{ id: "BL-LEAD-CAPABILITY-PROSE-STALE", provenance: "docs/settle-lead-capability-prose" }` to `BACKLOG_GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts:90`, with the leading comment block the neighbouring rows use.
- Prepend this pass to `BACKLOG.md`'s "Last reconciled" header line, demoting the current text behind `Prior:` per the file's own convention.

Verify: `pnpm vitest run tests/docs/`.

**Commit:** `docs(backlog): graduate BL-LEAD-CAPABILITY-PROSE-STALE as RESOLVED`

### Task 8 — full-suite gates

`pnpm typecheck` (also proves families M12 and M19's compile-time half), `pnpm test`, `pnpm lint`, `pnpm format:check`, and `pnpm spec:lint` on both new documents. Fix anything red; no commit if all green and nothing changed.

### Task 9 — Adversarial review (cross-model)

Whole-diff Codex review to APPROVE, per AGENTS.md. Brief inlines the fresh-eyes posture, `REVIEWER ONLY`, the do-not-relitigate list from spec §1.1, the §2 mutation-family closure set as the convergence criterion, and the finding-admissibility contract. No nested reviews.

---

## 5. Acceptance criteria

Inherited from spec §4 (AC-1 … AC-11). Task→AC map: Task 1 → AC-1, AC-2, AC-3; Task 2 → AC-4, AC-5, AC-6; Task 3 → AC-5; Task 5 → AC-8; Task 6 → AC-11; Task 7 → AC-9; Task 8 → AC-7, AC-10.

## 12. Close-out

impeccable-gate: N/A — no UI surface

No file under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md` is touched; `lib/visibility/**` is not a UI surface under invariant 8's definition. The invariant-8 dual gate is therefore not run.

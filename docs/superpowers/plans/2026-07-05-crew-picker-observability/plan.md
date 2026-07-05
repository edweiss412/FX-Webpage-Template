# Crew-Picker Observability — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-05-crew-picker-observability.md` (Codex-APPROVED, 2 rounds).
Every anchor below verified against live code in this worktree (`feat/crew-picker-observability` off `origin/main`).

**Goal:** Close `BL-CREW-PICKER-OBSERVABILITY` — emit 3 crew-telemetry codes at the picker
mutation boundaries, empty the `KNOWN_UNINSTRUMENTED` ledger, keep the invariant-#10
discovery floor green.

## Global constraints

- **TDD per task, commit per task** (invariants 1 + 6). Conventional commits: `feat(auth):` / `test(auth):` / `chore(log):` / `docs(backlog):`.
- **Crew telemetry = plain coded `log.info`**, NOT `logAdminOutcome` (actor is an anonymous crew member — no admin email). Each `code` literal lives ONLY inside a `log.info(...)` span → §12.4-scanner-exempt (stripped by `lib/messages/__internal__/codeProducers.ts:6-12`; verified by `tests/cross-cutting/codes.test.ts`). No `catalog.ts` edit.
- **Mutation-boundary discipline:** emit ONLY on a committed state change — never on invalid-input / no-op / RPC-reject / throw.
- **No return-type changes.** Emit inside the private `*Impl`; the emit fields object is `{ message, { code, source, showId, … } }`.
- **Derive test expectations from fixtures** (`SHOW_ID`/`CREW_ID`/epoch already defined in each suite), never hardcode a fresh literal.
- **No new Supabase call site** (invariant 9), **no advisory lock** acquired (invariant 2), **no UI** file touched.

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/log/mutationSurface/exemptions.test.ts` — the `KNOWN_UNINSTRUMENTED` describe block (hard-pins 6 rows) is rewritten to a debt-closed empty assertion (Task 4).
- **KEEPS GREEN** `tests/log/_metaMutationSurfaceObservability.test.ts` (discovery floor + ledger hygiene) and `tests/log/_metaAdminOutcomeContract.test.ts` (Assertion 4 forensic-leak check).
- **Advisory-lock topology:** N/A — this plan touches no `pg_advisory*` path (the picker cookie functions hold no lock; the emit is a plain `log.info` after the cookie write).
- **Supabase call-boundary meta-test:** N/A — no new Supabase call site; `log.info` is not a Supabase call.

## New codes (3)

| Code | Emit site | `source` | Fields |
|---|---|---|---|
| `PICKER_IDENTITY_SELECTED` | `selectIdentityCoreImpl` (after cookie set, before `return {ok:true}`) | `auth.picker.selectIdentity` | `showId`, `crewMemberId`, `epoch` |
| `PICKER_IDENTITY_CLEARED` | `clearIdentityCoreImpl` (real-delete branch, `existed===true` only) | `auth.picker.clearIdentity` | `showId` |
| `PICKER_STALE_ENTRY_CLEANED` | `cleanupStaleEntryCoreImpl` (`action:"cleaned"` branch) | `auth.picker.cleanupStaleEntry` | `showId`, `epoch`, `crewMemberId` |

---

## Task 1 — `PICKER_IDENTITY_SELECTED`

**Files:** modify `lib/auth/picker/selectIdentity.ts`; test `tests/auth/picker/selectIdentity.test.ts` (already mocks `@/lib/log` via `logMock` at `:22-28`; `logMock.info` exists).

- [ ] **Step 1 — failing test.** In `beforeEach`, add `logMock.info.mockClear();` beside `logMock.warn.mockClear();` (`:57`). In `describe("selectIdentityCore")`, add:

```ts
test("emits PICKER_IDENTITY_SELECTED on a committed selection", async () => {
  await selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID });
  expect(logMock.info).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      code: "PICKER_IDENTITY_SELECTED",
      source: "auth.picker.selectIdentity",
      showId: SHOW_ID, // rpcRow.out_show_id
      crewMemberId: CREW_ID,
      epoch: 7, // rpcRow.out_picker_epoch
    }),
  );
});

test("does NOT emit PICKER_IDENTITY_SELECTED on rejection / infra fault", async () => {
  rpcRow = {
    out_show_id: null,
    out_picker_epoch: null,
    out_observed_at_millis: null,
    out_rejection_code: "PICKER_INVALID_SHARE_TOKEN",
  };
  await selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID });
  rpcError = { message: "db failed" };
  await selectIdentityCore({ slug: SLUG, shareToken: TOKEN, crewMemberId: CREW_ID });
  await selectIdentityCore({ slug: "", shareToken: TOKEN, crewMemberId: CREW_ID }); // invalid input
  expect(logMock.info).not.toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ code: "PICKER_IDENTITY_SELECTED" }),
  );
});
```

- [ ] **Step 2 — run, expect FAIL** — `pnpm vitest run tests/auth/picker/selectIdentity.test.ts` (info never called with the code).

- [ ] **Step 3 — implement.** In `selectIdentityCoreImpl`, after `revalidatePath(...)` (`:145`) and before `return { ok: true }` (`:146`):

```ts
log.info("picker identity selected", {
  source: "auth.picker.selectIdentity",
  code: "PICKER_IDENTITY_SELECTED",
  showId,
  crewMemberId: input.crewMemberId,
  epoch: pickerEpoch,
});
```

Add a `// no-telemetry:` delegation comment INSIDE `selectIdentityCore`'s body (`:73-81`, the try/catch wrapper):

```ts
export async function selectIdentityCore(input: SelectIdentityInput): Promise<SelectIdentityResult> {
  // no-telemetry: try/catch wrapper; PICKER_IDENTITY_SELECTED emit fires at the mutation boundary in selectIdentityCoreImpl
  try {
    return await selectIdentityCoreImpl(input);
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}
```

(`selectIdentity` FormData wrapper is UNTOUCHED — already accounted by its `PICKER_IDENTITY_CLAIMED_TAMPER` warn at `:56-65`. `log` already imported at `:14`.)

- [ ] **Step 4 — run tests + typecheck** — `pnpm vitest run tests/auth/picker/selectIdentity.test.ts` PASS; `pnpm typecheck` clean.

- [ ] **Step 5 — commit** — `feat(auth): PICKER_IDENTITY_SELECTED telemetry on committed picker selection`

---

## Task 2 — `PICKER_IDENTITY_CLEARED` (existence-guarded)

**Files:** modify `lib/auth/picker/clearIdentity.ts` (add `log` import; NOT imported today); test `tests/auth/picker/clearIdentity.test.ts` (add a `@/lib/log` mock — NOT present today).

- [ ] **Step 1 — failing test.** At the top of the test file add a hoisted log mock (mirror `selectIdentity.test.ts:22-28`):

```ts
const logMock = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock("@/lib/log", () => ({ log: logMock }));
```

Add `logMock.info.mockClear();` in `beforeEach`. Then:

```ts
test("emits PICKER_IDENTITY_CLEARED when an existing entry is cleared", async () => {
  existingCookie = encodePickerCookie(
    { v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } }, KEY,
  );
  await clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
  expect(logMock.info).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      code: "PICKER_IDENTITY_CLEARED",
      source: "auth.picker.clearIdentity",
      showId: SHOW_ID,
    }),
  );
});

test("does NOT emit when there is no picker cookie (nothing to clear)", async () => {
  existingCookie = undefined;
  await clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
  expect(logMock.info).not.toHaveBeenCalledWith(
    expect.any(String), expect.objectContaining({ code: "PICKER_IDENTITY_CLEARED" }),
  );
});

test("does NOT emit when the cookie has no entry for this show (no-op)", async () => {
  existingCookie = encodePickerCookie(
    { v: 1, selections: { [OTHER_SHOW_ID]: { id: OTHER_CREW_ID, e: 2, t: 200 } } }, KEY,
  );
  await clearIdentityCore({ slug: SLUG, shareToken: TOKEN, showId: SHOW_ID });
  expect(logMock.info).not.toHaveBeenCalledWith(
    expect.any(String), expect.objectContaining({ code: "PICKER_IDENTITY_CLEARED" }),
  );
});

test("does NOT emit on invalid input", async () => {
  await clearIdentityCore({ slug: "", shareToken: TOKEN, showId: SHOW_ID });
  expect(logMock.info).not.toHaveBeenCalledWith(
    expect.any(String), expect.objectContaining({ code: "PICKER_IDENTITY_CLEARED" }),
  );
});
```

- [ ] **Step 2 — run, expect FAIL** (`log` not imported / not emitted).

- [ ] **Step 3 — implement.** Add `import { log } from "@/lib/log";` to `clearIdentity.ts`. In `clearIdentityCoreImpl`, capture existence BEFORE the `delete` (`:86`):

```ts
const existed = env.selections[input.showId] !== undefined;
delete env.selections[input.showId];
```

Then before `return { ok: true }` (`:106`, the real-delete branch), after `revalidatePath` (`:105`):

```ts
if (existed) {
  log.info("picker identity cleared", {
    source: "auth.picker.clearIdentity",
    code: "PICKER_IDENTITY_CLEARED",
    showId: input.showId,
  });
}
```

The `!env` early-return branch (`:81-83`) is unchanged (no emit). Add `// no-telemetry:` comments INSIDE each of the three exported wrappers:
- `clearIdentity` (`:47-50`): `// no-telemetry: FormData-parse wrapper; PICKER_IDENTITY_CLEARED emit fires in clearIdentityCoreImpl`
- `clearIdentityAndSkip` (`:53-59`): `// no-telemetry: FormData-parse + skip redirect; PICKER_IDENTITY_CLEARED emit fires in clearIdentityCoreImpl`
- `clearIdentityCore` (`:61-67`): `// no-telemetry: try/catch wrapper; PICKER_IDENTITY_CLEARED emit fires at the mutation boundary in clearIdentityCoreImpl`

- [ ] **Step 4 — run tests + typecheck** — `pnpm vitest run tests/auth/picker/clearIdentity.test.ts` PASS; `pnpm typecheck` clean.

- [ ] **Step 5 — commit** — `feat(auth): PICKER_IDENTITY_CLEARED telemetry on committed picker clear`

---

## Task 3 — `PICKER_STALE_ENTRY_CLEANED`

**Files:** modify `lib/auth/picker/cleanupStaleEntry.ts` (add `log` import; NOT imported today); test `tests/auth/picker/cleanupStaleEntry.test.ts` (add a `@/lib/log` mock).

- [ ] **Step 1 — failing test.** Add the hoisted `logMock` + `vi.mock("@/lib/log", …)` (as Task 2) and `logMock.info.mockClear();` in `beforeEach`. Then:

```ts
test("emits PICKER_STALE_ENTRY_CLEANED on the cleaned branch", async () => {
  existingCookie = encodePickerCookie(
    { v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 1, t: 100 } } }, KEY,
  );
  await cleanupStaleEntryCore({
    slug: SLUG, shareToken: TOKEN, showId: SHOW_ID, expectedEpoch: 1, expectedCrewMemberId: CREW_ID,
  });
  expect(logMock.info).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      code: "PICKER_STALE_ENTRY_CLEANED",
      source: "auth.picker.cleanupStaleEntry",
      showId: SHOW_ID,
      epoch: 1,
      crewMemberId: CREW_ID,
    }),
  );
});

test("does NOT emit on a noop (epoch/crew mismatch, no entry for this show, or no cookie)", async () => {
  // (a) mismatch: newer epoch present (hits cleanupStaleEntry.ts:82-84 mismatch return)
  existingCookie = encodePickerCookie(
    { v: 1, selections: { [SHOW_ID]: { id: CREW_ID, e: 5, t: 100 } } }, KEY,
  );
  await cleanupStaleEntryCore({
    slug: SLUG, shareToken: TOKEN, showId: SHOW_ID, expectedEpoch: 1, expectedCrewMemberId: CREW_ID,
  });
  // (b) cookie present but NO entry for this show (hits the distinct !entry return, cleanupStaleEntry.ts:81)
  existingCookie = encodePickerCookie(
    { v: 1, selections: { [OTHER_SHOW_ID]: { id: OTHER_CREW_ID, e: 2, t: 200 } } }, KEY,
  );
  await cleanupStaleEntryCore({
    slug: SLUG, shareToken: TOKEN, showId: SHOW_ID, expectedEpoch: 1, expectedCrewMemberId: CREW_ID,
  });
  // (c) no cookie at all (hits the !env return, cleanupStaleEntry.ts:78)
  existingCookie = undefined;
  await cleanupStaleEntryCore({
    slug: SLUG, shareToken: TOKEN, showId: SHOW_ID, expectedEpoch: 1, expectedCrewMemberId: CREW_ID,
  });
  expect(logMock.info).not.toHaveBeenCalledWith(
    expect.any(String), expect.objectContaining({ code: "PICKER_STALE_ENTRY_CLEANED" }),
  );
});
```

- [ ] **Step 2 — run, expect FAIL.**

- [ ] **Step 3 — implement.** Add `import { log } from "@/lib/log";` to `cleanupStaleEntry.ts`. In `cleanupStaleEntryCoreImpl`, before `return { ok: true, action: "cleaned" }` (`:121`), after the best-effort `upsertAdminAlert` try/catch (`:106-119`):

```ts
log.info("picker stale entry cleaned", {
  source: "auth.picker.cleanupStaleEntry",
  code: "PICKER_STALE_ENTRY_CLEANED",
  showId: input.showId,
  epoch: input.expectedEpoch,
  crewMemberId: input.expectedCrewMemberId,
});
```

The three `action:"noop"` returns (`:78`, `:81`, `:83`) are unchanged (no emit). Add `// no-telemetry:` comments INSIDE the two exported wrappers:
- `cleanupStaleEntry` (`:29-49`): `// no-telemetry: FormData-parse wrapper; PICKER_STALE_ENTRY_CLEANED emit fires in cleanupStaleEntryCoreImpl`
- `cleanupStaleEntryCore` (`:51-59`): `// no-telemetry: try/catch wrapper; PICKER_STALE_ENTRY_CLEANED emit fires at the mutation boundary in cleanupStaleEntryCoreImpl`

- [ ] **Step 4 — run tests + typecheck** — PASS; clean. Confirm the existing `PICKER_SELECTION_RACE` upsert test at `:53-99` still passes.

- [ ] **Step 5 — commit** — `feat(auth): PICKER_STALE_ENTRY_CLEANED telemetry on self-service stale cleanup`

---

## Task 4 — Empty the ledger + registry lockstep

**Files:** `tests/log/mutationSurface/exemptions.ts`, `tests/log/mutationSurface/exemptions.test.ts`, `tests/log/_metaMutationSurfaceObservability.test.ts`, `tests/log/_auditableMutations.ts`.

**Why after Tasks 1-3:** once the emits + `// no-telemetry:` comments exist, all 6 surfaces pass the discovery floor via the comment path, so emptying the ledger keeps the floor green. `evaluateUnit` checks coded-emit / no-telemetry BEFORE the ledger (`_metaMutationSurfaceObservability.test.ts:177-182`), so during Tasks 1-3 the surfaces pass redundantly and the floor never goes red.

- [ ] **Step 1 — failing test first: rewrite the ledger assertion.** In `tests/log/mutationSurface/exemptions.test.ts`, replace the entire `describe("KNOWN_UNINSTRUMENTED — exactly the 6 crew/system picker fns …")` block (`:18-40`) with:

```ts
describe("KNOWN_UNINSTRUMENTED — empty (BL-CREW-PICKER-OBSERVABILITY closed 2026-07-05)", () => {
  test("the ledger is empty; the 6 crew picker fns are now instrumented", () => {
    expect(KNOWN_UNINSTRUMENTED).toHaveLength(0);
  });
});
```

Run `pnpm vitest run tests/log/mutationSurface/exemptions.test.ts` → FAIL (ledger still has 6 rows).

- [ ] **Step 2 — empty the ledger.** In `exemptions.ts`, set `export const KNOWN_UNINSTRUMENTED: readonly KnownUninstrumented[] = [];` and refresh the doc comment (`:79-82`) to: the ledger is empty — the 6 crew/system picker fns are instrumented via `auth.picker.*` coded `log.info` emits (BL-CREW-PICKER-OBSERVABILITY, 2026-07-05); admin-gated picker mutations remain instrumented via `logAdminOutcome`.

- [ ] **Step 3 — hygiene title.** In `_metaMutationSurfaceObservability.test.ts:551`, rename the test title from `"the live KNOWN_UNINSTRUMENTED ledger's 6 rows are all non-admin-gated (live-tree check)"` to `"the live KNOWN_UNINSTRUMENTED ledger's rows are all non-admin-gated (live-tree check)"` (body unchanged — loops vacuously when empty).

- [ ] **Step 4 — register the forensic codes.** In `tests/log/_auditableMutations.ts`, add to the `NEW_FORENSIC_CODES` set (NOT `SANCTIONED_CODES`), with a comment:

```ts
// Crew-picker observability (2026-07-05) — non-admin crew coded log.info emits
// (BL-CREW-PICKER-OBSERVABILITY; inside log.* spans, NOT cataloged, NOT logAdminOutcome).
"PICKER_IDENTITY_SELECTED",
"PICKER_IDENTITY_CLEARED",
"PICKER_STALE_ENTRY_CLEANED",
```

- [ ] **Step 5 — run the meta suites.** `pnpm vitest run tests/log/mutationSurface/exemptions.test.ts tests/log/_metaMutationSurfaceObservability.test.ts tests/log/_metaAdminOutcomeContract.test.ts` → all PASS. (Floor "every discovered mutation surface unit is accounted for" green; Assertion 4 leak-check green with the 3 new codes present in `NEW_FORENSIC_CODES` and absent from the §12.4 producer scan.)

- [ ] **Step 6 — negative-regression (non-tautology proof, do NOT commit the break).** Temporarily remove one `// no-telemetry:` comment (e.g. from `clearIdentityCore`) and confirm the floor's "every discovered mutation surface unit is accounted for" test FAILS naming that surface; restore. Temporarily add `"PICKER_IDENTITY_SELECTED"` to a `catalog.ts` producer path (or assert via a scratch) is out of scope — instead confirm Assertion 4 would catch a leak by temporarily adding a bogus already-cataloged code to `NEW_FORENSIC_CODES` and seeing it fail; restore.

- [ ] **Step 7 — commit** — `chore(log): close KNOWN_UNINSTRUMENTED ledger; register crew picker forensic codes`

---

## Task 5 — Close the backlog entry

**Files:** `BACKLOG.md`.

- [ ] **Step 1 — edit.** At `BL-CREW-PICKER-OBSERVABILITY` (`:234-238`), change `**Status:** OPEN` → `**Status:** CLOSED (2026-07-05, PR)` and append a one-line closure note: shipped the `auth.picker.*` crew-telemetry taxonomy (`PICKER_IDENTITY_SELECTED` / `PICKER_IDENTITY_CLEARED` / `PICKER_STALE_ENTRY_CLEANED`), emptied `KNOWN_UNINSTRUMENTED`.

- [ ] **Step 2 — commit** — `docs(backlog): close BL-CREW-PICKER-OBSERVABILITY`

---

## Task 6 — Whole-diff verification

- [ ] **Step 1 — scanner no-op** — `pnpm gen:internal-code-enums` → **no diff** (no code escaped the generator); `git diff --exit-code` on generated files → clean.
- [ ] **Step 2 — catalog parity** — `pnpm vitest run tests/cross-cutting/codes.test.ts` → PASS (the 3 codes are stripped log-span literals, not producers).
- [ ] **Step 3 — targeted suites** — `pnpm vitest run tests/auth/picker tests/log` → PASS.
- [ ] **Step 4 — typecheck** — `pnpm typecheck` → clean.
- [ ] **Step 5 — lint + format** — `pnpm lint` and `pnpm format:check` → clean (canonical-tailwind N/A; `--no-verify` commits bypass the prettier hook, so run it explicitly).
- [ ] **Step 6 — full suite** — `pnpm test` → green except known env-only failures (`test-auth-gate`, `email-canonicalization`, `pg-cron-coverage`, `validation-schema-parity` — need live DB/HTTP the worktree lacks). Verify each is unrelated by confirming it also fails at the merge-base (`origin/main`).

---

## Self-review checklist (run after drafting)

- **Spec coverage:** S2.1→T1/T2/T3 codes; S3 ledger+comments→T1-T4; S4 registry→T4; backlog→T5; verify→T6. ✓
- **Mutation-boundary:** T1 excludes reject/infra/invalid; T2 existence-guarded + no-op silent; T3 gates `cleaned`. ✓
- **Scanner-safety:** every code inside a `log.info(...)` span; T6 verifies gen no-op + catalog parity. ✓
- **Anti-tautology:** expectations derived from each suite's `SHOW_ID`/`CREW_ID`/epoch fixtures; each test states its concrete negative (reject / no-op / invalid). T4 Step 6 proves the floor is non-tautological. ✓
- **Green-at-commit:** floor stays green through T1-T3 (redundant accounting), then T4 empties the ledger with comments already in place. ✓

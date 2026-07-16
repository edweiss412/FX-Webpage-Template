# Tasks 9–12 — catalog lockstep, dedup/key folds, the four actions

---

### Task 9: Catalog lockstep + jargon sweep + dedup/key folds

Spec §10 (codes), §8.1 (dedup + React keys). Grouped in one task because the §12.4 edit, the two gen scripts, `catalog.ts`, and the sweep must land in the SAME commit (lockstep discipline).

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (ADD `ROLE_TOKEN_MAPPED` row; EDIT `UNKNOWN_ROLE_TOKEN` row — **NEVER run prettier on this file**), `lib/messages/catalog.ts` (:1193-1205 edit + new row), `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`), internal code enums (via `pnpm gen:internal-code-enums`), `tests/messages/_metaCatalogCopyHygiene.test.ts` (D7 banned-vocab block), `lib/parser/dataGaps.ts` (:360-362 dedup key), `lib/dataQuality/warningIdentity.ts` (:4-8 identity)
- Test: `tests/messages/` existing suites + `tests/dataQuality/roleTokenIdentity.test.ts` (new)

- [ ] **Step 1: §12.4 prose edits (master spec)**

Add a `ROLE_TOKEN_MAPPED` row following the table's exact column format (copy an adjacent info-level row's structure):
- dougFacing: `_<token>_, a role you added, matched someone on this show — we set up their page the way you chose.`
- crewFacing: null · followUp: `Doug → recognize role (or optional Report)` is the UNKNOWN row's; for ROLE_TOKEN_MAPPED use `none — informational`
- helpfulContext: `A role you added from a warning matched a crew member during a sheet check, so their page now shows what you picked. Rendering note: with no extra choices the summary reads "the standard show page".`

Edit `UNKNOWN_ROLE_TOKEN`: dougFacing/helpfulContext/longExplanation tails change from "let us know and we'll add it" to "you can add it right from this warning."; followUp → `Doug → recognize role (or optional Report)`.

- [ ] **Step 2: Regenerate + mirror in catalog.ts**

```bash
pnpm gen:spec-codes && pnpm gen:internal-code-enums
```

Then edit `lib/messages/catalog.ts`: update the `UNKNOWN_ROLE_TOKEN` row (:1193-1205) to the new strings VERBATIM, and add the `ROLE_TOKEN_MAPPED` entry (same field set as neighboring info rows: code/dougFacing/crewFacing:null/followUp/helpfulContext/title "Recognized a role you added"/longExplanation/helpHref "/help/errors#ROLE_TOKEN_MAPPED"). Empty-grants rendering branch (spec §10 point 6) lives wherever the event copy is rendered — grants summary join helper resolves `[]` → "the standard show page"; add it beside the catalog consumer that renders event context, with a unit test.

Run: `pnpm exec vitest run tests/cross-cutting/codes.test.ts tests/messages` — x1 parity green, help families green (add the `/help/errors#ROLE_TOKEN_MAPPED` anchor wherever the help error page enumerates codes — the families test will name the gap; follow it).

Rendered-copy test (Codex plan-R1 F8, spec §10 point 6): a unit test renders the `ROLE_TOKEN_MAPPED` dougFacing through the real placeholder/renderer path with (a) `grants: ["A1","V1"]` context → output contains "Audio and Video details"-style summary and the interpolated token; (b) `grants: []` → output contains "the standard show page" and NEVER an empty join artifact ("see .", "and details"). Assert against the RENDERED string, not the catalog literal.

- [ ] **Step 3: Jargon sweep extension**

In `tests/messages/_metaCatalogCopyHygiene.test.ts`, add a block after the existing `JARGON_LEAK_PATTERNS` test:

```ts
// D7 banned vocabulary for the role-recognition feature (spec §9/§10):
// standalone words only; placeholders excluded; "role"/"refresh" allowed.
const D7_CODES = ["ROLE_TOKEN_MAPPED", "UNKNOWN_ROLE_TOKEN"] as const;
const D7_BANNED = /\b(scope|flag|token|mapping|capability|sync|overlay|parse)\b/i;
const D7_FIELDS = ["dougFacing", "crewFacing", "helpfulContext", "followUp", "title", "longExplanation"] as const;

test("role-recognition Doug-facing copy avoids D7 banned vocabulary", () => {
  for (const code of D7_CODES) {
    const row = MESSAGE_CATALOG[code] as Record<string, unknown>;
    for (const field of D7_FIELDS) {
      const v = row[field];
      if (typeof v !== "string") continue;
      const stripped = v.replace(/_<[^>]+>_|<[^>]+>/g, ""); // placeholder spans excluded
      expect(D7_BANNED.test(stripped), `${code}.${field}: "${v}"`).toBe(false);
    }
  }
});
```

(Note: the copy must therefore avoid the word "warning"-adjacent jargon too? No — only the eight listed words are banned. The Step 1 strings above contain none of them; if a draft uses one, reword the PROSE, never the test.)

- [ ] **Step 4: Dedup + React key folds (spec §8.1)**

`lib/parser/dataGaps.ts` — extend the `rowDisc` at :360 (FIELD_UNREADABLE exception precedent; folding can only REDUCE collapsing):

```ts
      const rowDisc =
        w.code === FIELD_UNREADABLE && w.blockRef?.index != null
          ? `\0${w.blockRef.index}`
          : w.code === "UNKNOWN_ROLE_TOKEN" && typeof w.roleToken === "string"
            ? `\0${w.roleToken}`
            : "";
```

`lib/dataQuality/warningIdentity.ts` — fold `roleToken` into the identity: add `"roleToken"` to the `IdentityFields` Pick (:4) and append it in `warningIdentityKey` (:6-20 region): `const rt = w.code === "UNKNOWN_ROLE_TOKEN" && typeof w.roleToken === "string" ? w.roleToken : ""; return `${w.code}|${cell}|${snippet}|${br}|${rt}`;`

New test `tests/dataQuality/roleTokenIdentity.test.ts`:

```ts
test("two same-cell UNKNOWN_ROLE_TOKEN warnings get distinct stable keys and both render", () => {
  const base = { code: "UNKNOWN_ROLE_TOKEN", rawSnippet: "Drone Op / Grip",
    sourceCell: { gid: 1, a1: "C4" }, blockRef: { kind: "crew", index: 0, name: "Marcus Webb" } };
  const a = { ...base, severity: "warn" as const, message: "", roleToken: "DRONE OP" };
  const b = { ...base, severity: "warn" as const, message: "", roleToken: "GRIP" };
  const keys = stableWarningKeys([a, b]);
  expect(new Set(keys).size).toBe(2);
  expect(keys[0]).not.toMatch(/#1$/); // distinct BASE keys, not positional suffixes (reorder-stable)
  expect(operatorActionableWarnings([a, b])).toHaveLength(2);      // dedup fold
  const legacyA = { ...a }; delete (legacyA as Record<string, unknown>).roleToken;
  const legacyB = { ...b }; delete (legacyB as Record<string, unknown>).roleToken;
  expect(operatorActionableWarnings([legacyA, legacyB])).toHaveLength(1); // legacy collapse unchanged
});
```

- [ ] **Step 5: Run + commit (ONE commit — lockstep)**

Run: `pnpm exec vitest run tests/cross-cutting/codes.test.ts tests/messages tests/dataQuality tests/parser` → PASS.

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages tests/messages lib/parser/dataGaps.ts lib/dataQuality tests/dataQuality
git commit --no-verify -m "feat(messages): ROLE_TOKEN_MAPPED catalog row + UNKNOWN_ROLE_TOKEN affordance copy + roleToken dedup/identity folds (§12.4 lockstep)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Live action `mapRoleToken`

Spec §8.3 — the full pinned contract: validation → existing-row branch → provenance → upsert (canonicalizeEmail) → logAdminOutcome → runManualSyncForShow → state. Precedent to mirror throughout: `app/admin/show/[slug]/_actions/useRaw.ts`.

**Files:**
- Create: `app/admin/show/[slug]/_actions/roleToken.ts`
- Modify: `tests/log/_auditableMutations.ts` (row), `tests/log/adminOutcomeBehavior.test.ts` (proof)
- Test: `tests/admin/mapRoleTokenAction.test.ts` (new)

**Interfaces (Produces):**

```ts
export type MapRoleTokenResult =
  | { ok: true; state: "applied" | "apply_pending" }
  | { ok: false; code: "stale" | "conflict" | "infra_error" | "show_not_found" | "validation_error" };
export async function mapRoleToken(showId: string, token: string, grants: string[]): Promise<MapRoleTokenResult>;
```

- [ ] **Step 1: Write the failing tests** — mirror the mocking style of `tests/admin/setUseRawDecisionAction.test.ts` (module mocks for `requireAdminIdentity`, the DB layer, `runManualSyncForShow`). Cases (each expectation derived from the §8.3 pinned matrix):

```ts
describe("mapRoleToken (spec §8.3)", () => {
  test("upsert failure → infra_error AND no ROLE_TOKEN_MAPPING_SET emitted (post-commit ordering)");
  test("validation: blank token / >64 chars / built-in token / bad grant → validation_error, nothing written");
  test("grants deduped + stable-ordered before write");
  test("existing row, set-equal grants: NO provenance check, proceeds to re-sync; state from outcome");
  test("existing row, different grants: conflict, row unchanged (concurrent-admins scenario)");
  test("no row + no matching current warning: stale, nothing written");
  test("no row + matching warning: row created; decided_by = canonicalizeEmail(identity); mixed-case identity persists lowercased");
  test("malformed identity (canonicalize → null): infra_error, nothing written");
  test("re-sync applied → state 'applied'; re-sync throws AFTER commit → state 'apply_pending', row still present");
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** (shape; adapt DB calls to the same client/tx layer `useRaw.ts` uses — read it first):

```ts
"use server";
import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin"; // exact import path per useRaw.ts
import { canonicalize } from "@/lib/email/canonicalize";
import { canonicalRoleToken, isBuiltInRoleToken } from "@/lib/parser/roleVocabulary";
import { normalizeGrants, GRANTABLE_FLAGS } from "@/lib/sync/roleMappingOverlay";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { runManualSyncForShow } from "@/lib/sync/runManualSyncForShow";

export async function mapRoleToken(showId: string, rawToken: string, rawGrants: string[]): Promise<MapRoleTokenResult> {
  await requireAdmin();
  const { email } = await requireAdminIdentity();
  const actor = canonicalize(email);
  if (actor === null) return { ok: false, code: "infra_error" };            // R10 F5
  const token = canonicalRoleToken(rawToken);
  if (token.length === 0 || token.length > 64) return { ok: false, code: "validation_error" };
  if (isBuiltInRoleToken(token)) return { ok: false, code: "validation_error" };
  const grants = normalizeGrants(rawGrants);
  if (grants === null) return { ok: false, code: "validation_error" };      // fail-closed, not filtered

  // resolve show (useRaw.ts pattern: resolveShowById from ./shared)
  // 1) EXISTING ROW FIRST (R11 F1/R12 F1): select by token.
  //    set-equal -> skip to re-sync below; different -> return conflict.
  // 2) NO ROW: provenance — read the show's persisted parse warnings; require one
  //    UNKNOWN_ROLE_TOKEN with roleToken === token, else return stale.
  // 3) upsert { token, grants, decided_by: actor, decided_at: now, updated_at: now }
  //    logAdminOutcome fires ONLY AFTER the upsert succeeds (post-commit forensic,
  //    invariant 10 — Codex plan-R1 F4): a failed upsert returns infra_error and
  //    emits NOTHING. Explicit test case: upsert failure -> no ROLE_TOKEN_MAPPING_SET.
  await logAdminOutcome({ code: "ROLE_TOKEN_MAPPING_SET", source: "admin.show.roleToken", actorEmail: actor, showId });
  // 4) follow-up re-sync, useRaw.ts:155-170 pattern VERBATIM (thrown fault caught):
  let applied = false;
  try {
    const sync = await runManualSyncForShow(driveFileId);
    applied = sync !== null && typeof sync === "object" && "outcome" in sync && sync.outcome === "applied";
  } catch { applied = false; }
  revalidateShow(id);
  return { ok: true, state: applied ? "applied" : "apply_pending" };
}
```

The set-equal comparison uses the normalized (deduped, stable-ordered) arrays — plain `JSON.stringify(a) === JSON.stringify(b)` is correct after normalization.

- [ ] **Step 4: Registry + behavioral proof**

`tests/log/_auditableMutations.ts`: `{ file: "app/admin/show/[slug]/_actions/roleToken.ts", fn: "mapRoleToken", code: "ROLE_TOKEN_MAPPING_SET" }`. In `tests/log/adminOutcomeBehavior.test.ts`, add a sink-spy proof following the `setAutoPublish` case (:881 pattern): success path emits `ROLE_TOKEN_MAPPING_SET` via `observeSuccessCodes` + `recordAdminOutcomeBehavior`; failure path (validation_error) emits nothing. NEVER mock `@/lib/log` in that file.

- [ ] **Step 5: Run** — `pnpm exec vitest run tests/admin/mapRoleTokenAction.test.ts tests/log` → PASS.

- [ ] **Step 6: Commit** — `feat(admin): mapRoleToken warning-attached create action`.

---

### Task 11: Staged action `mapRoleTokenStaged`

Spec §8.3 staged twin. Precedent: `app/admin/onboarding/_actions/useRawStaged.ts` (pre-lock `verifyStagedSheet`, staged-parse provenance, re-stage as the follow-up).

**Files:**
- Create: `app/admin/onboarding/_actions/roleTokenStaged.ts`
- Modify: `tests/log/_auditableMutations.ts`, `tests/log/adminOutcomeBehavior.test.ts`
- Test: `tests/admin/mapRoleTokenStagedAction.test.ts`

**Interfaces (Produces):** `mapRoleTokenStaged(wizardSessionId: string, driveFileId: string, token: string, grants: string[]): Promise<MapRoleTokenResult>` (same result union; import the type from the live action).

Same step structure as Task 10 with these deltas:
- Provenance reads the wizard session's STAGED parse warnings (`pending_syncs` row via the `verifyStagedSheet` chain `useRawStaged.ts:118` uses).
- Follow-up = re-stage through the existing staging entry point the wizard uses to refresh a sheet (find the function `useRawStaged`'s surrounding flow calls to refresh staged state after a decision; the wizard's re-stage path — NOT a direct jsonb write, since role mappings live in the global table, not on the pending_syncs row).
- Staged `state: "applied"` = re-stage completed and the refreshed staged parse no longer contains the warning (spec Codex R14 F1); failed/thrown re-stage after the durable upsert → `"apply_pending"` (explicit test, Codex R5 F6).
- Registry row `{ file: "app/admin/onboarding/_actions/roleTokenStaged.ts", fn: "mapRoleTokenStaged", code: "ROLE_TOKEN_MAPPING_SET" }` + behavioral proof.
- Commit: `feat(admin): mapRoleTokenStaged wizard create action`.

---

### Task 12: Settings actions `updateRoleTokenMapping` / `deleteRoleTokenMapping`

Spec §8.3 settings mutations. Precedent: `app/admin/settings/_actions/setAutoPublish.ts` (gate → write → revalidate → outcome).

**Files:**
- Create: `app/admin/settings/_actions/roleTokenMappings.ts` (both actions)
- Modify: `tests/log/_auditableMutations.ts` (2 rows), `tests/log/adminOutcomeBehavior.test.ts` (2 proofs)
- Test: `tests/admin/roleTokenMappingsSettingsActions.test.ts`

**Interfaces (Produces):**

```ts
export type UpdateRoleTokenMappingResult = { ok: true } | { ok: false; code: "stale" | "infra_error" | "validation_error" };
export type DeleteRoleTokenMappingResult = { ok: true } | { ok: false; code: "infra_error" };
export async function updateRoleTokenMapping(token: string, grants: string[]): Promise<UpdateRoleTokenMappingResult>;
export async function deleteRoleTokenMapping(token: string): Promise<DeleteRoleTokenMappingResult>;
```

Pinned behaviors the tests encode (each its own test):
- Both skip `isBuiltInRoleToken` (guard is create-only, Codex R14 F3); both canonicalize the token param for lookup.
- `update`: grants validated + deduped; EXISTING row only — absent row → `stale`, NEVER recreates (Codex R12 F5/R14 F5); sets `grants`, `decided_by = canonicalize(identity)`, `decided_at = now()`, `updated_at = now()` (last-decided, Codex R12 F3/R13 F1); persistence test: admin B edit over admin A's row → `decided_by = B`, fresh timestamps (Codex R13 F4).
- `delete`: absent row → idempotent `{ ok: true }`.
- Outcomes: `ROLE_TOKEN_MAPPING_SET` (update) / `ROLE_TOKEN_MAPPING_DELETED` (delete), source `"admin.settings.roleTokenMappings"`, emitted post-write only on success; `revalidatePath("/admin/settings/roles")`.
- Registry rows + behavioral proofs for both.
- Commit: `feat(admin): settings role-mapping update/delete actions`.

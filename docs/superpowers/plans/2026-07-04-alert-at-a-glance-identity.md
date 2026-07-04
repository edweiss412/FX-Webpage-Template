# At-a-glance Alert Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface who/which-show/which-sheet identity on admin alerts — starting with `OAUTH_IDENTITY_CLAIMED` (crew + OAuth email + show), sweeping all 42 codes via a centralized render-time resolver.

**Architecture:** A pure per-code identity map + a pure sanitizing projection (`projectIdentityContext`) + a batched read-only resolver (`resolveAlertIdentities`) that emits a `SerializedAlertIdentity`. Web surfaces (AlertBanner, PerShowAlertSection) read `admin_alerts` directly and resolve; the `pnpm observe alerts` CLI resolves in the read-core (`queryAlerts`). Two/three tiny producer edits add the few values that aren't ID-resolvable.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript, Supabase (postgres.js + PostgREST), Vitest + jsdom, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-04-alert-at-a-glance-identity.md` (ratified — 18 adversarial rounds). Every task's contract detail lives there; this plan is the ordered TDD execution.

## Global Constraints

- **TDD per task:** failing test → run (fail) → minimal impl → run (pass) → commit. Never impl before its test.
- **Commit per task**, conventional-commits (`feat(scope):`/`test(scope):`/`docs(scope):`). `--no-verify` allowed (shared hook); run `pnpm format:check` + `pnpm typecheck` before pushing (vitest strips types).
- **Invariant 5:** identity is entity names/counts only — never a MessageCode/SQLSTATE/PostgREST code/error message. Enforced by the allowlist (no diagnostic keys) + sanitizer.
- **Invariant 9 (Supabase call-boundary):** every client call destructures `{ data, error }`; `resolveAlertIdentities` returns a discriminable `{ kind: 'ok' | 'infra_error' }`, never a silent throw.
- **Invariant 8 (UI quality gate):** AlertBanner/PerShowAlertSection are UI → `/impeccable critique` + `/impeccable audit` before Codex whole-diff review; HIGH/CRITICAL fixed or DEFERRED.md.
- **Invariant 3 (email canonicalization):** the one raw-email field is populated from the already-canonicalized `canonicalEmail`.
- **No DDL, no migration, no advisory-lock change.**
- **PII:** raw email only via `includePii`/`--reveal-email`; token-like substrings ALWAYS redacted.
- **Sanitizer order (load-bearing):** strip Unicode control/format/bidi → redact (token always; email if `!includePii`) on the FULL string → length-cap 120.

## Meta-test inventory (declared per AGENTS.md)

- **CREATE** `tests/adminAlerts/_metaAlertIdentityMap.test.ts` — every `ADMIN_ALERTS_CODES` code (registry `tests/messages/_metaAdminAlertCatalog.test.ts:57`) has a map entry that is `global` or has ≥1 segment.
- **CREATE** `tests/observe/_metaAlertsRedactionContract.test.ts` — `queryAlerts` returns only `SerializedAlertIdentity` (no `resolution`, no raw `context`, no context-derived IDs); email gated; display strings sanitized.
- **Supabase call-boundary (invariant 9):** `resolveAlertIdentities` (new read surface) either registers in `tests/auth/_metaInfraContract.test.ts` (`INFRA_PRODUCERS`) or carries inline `// not-subject-to-meta:` waivers — decided in Task 4 Step 4b by the meta-test's actual scan scope.
- **Advisory-lock topology:** N/A — this plan touches no `pg_advisory*` path.
- **Existing meta-tests to keep green:** `tests/messages/_metaAdminAlertCatalog.test.ts` (INTERPOLATED_DOUG_FACING_CODES unaffected — no new copy placeholders), `tests/observe/_metaReadOnlyQueryCore.test.ts` (queryAlerts stays `.select`-only), `tests/cross-cutting/email-canonicalization.test.ts` (new `user_email` derives from `canonicalize()`).

## File structure

**New (`lib/adminAlerts/`):** `sanitizeIdentityString.ts`, `projectIdentityContext.ts`, `alertIdentityMap.ts`, `resolveAlertIdentities.ts`, `describeAlert.ts`, `identityTypes.ts` (shared `IdentityContext`, `SerializedAlertIdentity`, `AlertIdentity`, `AlertIdentitySegment`).
**New tests:** `tests/adminAlerts/{sanitizeIdentityString,projectIdentityContext,alertIdentityMap,resolveAlertIdentities,describeAlert,_metaAlertIdentityMap}.test.ts`, `tests/observe/_metaAlertsRedactionContract.test.ts`, `tests/e2e/alert-identity-banner-layout.spec.ts` (or chrome-devtools harness).
**Modified:** `app/auth/callback/route.ts`, `app/api/auth/picker-bootstrap/route.ts`, `lib/sync/wizardSessionRollback.ts`, `lib/sync/{applyStaged,discardStaged,retrySingleFile}.ts`, the 4 wizard routes, `components/admin/AlertBanner.tsx`, `components/admin/PerShowAlertSection.tsx`, `lib/observe/query/alerts.ts`, `lib/observe/query/types.ts`, `scripts/observe.ts` + `scripts/observe/args.ts` + `scripts/observe/format.ts`, `AGENTS.md`, `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, `BACKLOG.md`, and (per Task 4 Step 4b) either `tests/auth/_metaInfraContract.test.ts` or an inline resolver waiver.

---

### Task 1: Shared identity types + `sanitizeIdentityString`

**Files:** Create `lib/adminAlerts/identityTypes.ts`, `lib/adminAlerts/sanitizeIdentityString.ts`; Test `tests/adminAlerts/sanitizeIdentityString.test.ts`.

**Interfaces — Produces:**
- `identityTypes.ts`: `AlertIdentitySegment = { label: string | null; value: string; pii?: boolean }`; `AlertIdentity = { segments: AlertIdentitySegment[]; global: boolean }`; `SerializedAlertIdentity = { segments: AlertIdentitySegment[]; global: boolean }` (display-only; no resolution IDs); `IdentityContext = { resolution: {...}; display: {...}; counts: {...} }` per spec §3.1.
- `sanitizeIdentityString(raw: unknown, opts: { includePii: boolean }): string` — strip Unicode control/format/bidi + collapse ws; redact token-like (`/[A-Za-z0-9+/_-]{24,}/` hex/base64) → `[redacted-token]` ALWAYS; redact email-like (`/\S+@\S+/`) → `[redacted-email]` when `!includePii`; THEN cap 120 (+`…`). Redact before cap.

- [ ] **Step 1: failing test** — `tests/adminAlerts/sanitizeIdentityString.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
describe("sanitizeIdentityString", () => {
  it("strips control/bidi/zero-width chars", () => {
    expect(sanitizeIdentityString("a‮b​c\nd", { includePii: true })).toBe("abc d");
  });
  it("redacts token substrings always, even with includePii", () => {
    const t = "x".repeat(40);
    expect(sanitizeIdentityString(`file ${t}`, { includePii: true })).toBe("file [redacted-token]");
  });
  it("redacts email only when !includePii", () => {
    expect(sanitizeIdentityString("bob jane@x.com", { includePii: false })).toBe("bob [redacted-email]");
    expect(sanitizeIdentityString("bob jane@x.com", { includePii: true })).toBe("bob jane@x.com");
  });
  it("redacts a boundary-straddling token BEFORE capping (no leaked prefix)", () => {
    const s = "y".repeat(110) + "a".repeat(40); // 40-char hex token crosses the 120 cap
    const out = sanitizeIdentityString(s, { includePii: true });
    expect(out).not.toMatch(/a{20,}/); // no live token prefix survived
    expect(out).toContain("[redacted-token]");
    expect(out.length).toBeLessThanOrEqual(121); // 120 + ellipsis
  });
  it("does not redact a 23-char run, redacts a 24-char run", () => {
    expect(sanitizeIdentityString("a".repeat(23), { includePii: true })).toBe("a".repeat(23));
    expect(sanitizeIdentityString("a".repeat(24), { includePii: true })).toBe("[redacted-token]");
  });
});
```
- [ ] **Step 2: run → FAIL** `pnpm vitest run tests/adminAlerts/sanitizeIdentityString.test.ts` (module not found).
- [ ] **Step 3: implement** `identityTypes.ts` (the three type groups per spec §3.1) + `sanitizeIdentityString.ts`:
```ts
// Codex P6: zero-width + bidi format chars are REMOVED (invisible — must not
// become spaces); C0/C1 controls incl. \n\t become a SPACE; then collapse.
const FORMAT = /[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g; // zero-width+bidi → remove
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;                     // C0/C1 (\n,\t) → space
const TOKEN = /[A-Za-z0-9+/_-]{24,}/g;
const EMAIL = /\S+@\S+/g;
export function sanitizeIdentityString(raw: unknown, opts: { includePii: boolean }): string {
  let s = String(raw ?? "").replace(FORMAT, "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  s = s.replace(TOKEN, "[redacted-token]");
  if (!opts.includePii) s = s.replace(EMAIL, "[redacted-email]");
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}
```
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(admin-alerts): identity types + sanitizeIdentityString (unicode strip, redact-before-cap, token-always)`.

---

### Task 2: `projectIdentityContext`

**Files:** Create `lib/adminAlerts/projectIdentityContext.ts`; Test `tests/adminAlerts/projectIdentityContext.test.ts`.

**Interfaces — Consumes:** `sanitizeIdentityString`, `IdentityContext` (Task 1). **Produces:** `projectIdentityContext(rawContext: Record<string, unknown> | null, opts: { includePii: boolean }): IdentityContext` per spec §3.1 — validate resolution IDs (UUID for `*_id`; `/^[A-Za-z0-9_-]{10,200}$/` for `drive_file_id`, else drop, NOT sanitized); sanitize display strings (`file_name`, `sheet_name`, `repo`, `attempted_action`[enum-constrained], `email`/`user_email`[gated], `role_change_crew_names`[derived from `changes[].crew_name`, cap 3]); derive counts (`role_change_count`, `crew_member_count`). Drop all other keys.

- [ ] **Step 1: failing test** — cover: resolution IDs pass through unsanitized (real Drive ID survives, malformed dropped); `changes` composite → `role_change_crew_names` + `role_change_count`, NO `prior_flags`/`new_flags`; planted `error_message`/`orphan_url`/`rpc_error_code` absent; `attempted_action` out-of-enum dropped; email gated. Example:
```ts
it("keeps a real drive_file_id un-sanitized (not token-redacted)", () => {
  const out = projectIdentityContext({ drive_file_id: "1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY" }, { includePii: false });
  expect(out.resolution.drive_file_id).toBe("1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY");
});
it("sanitizes changes to names+count, drops flag deltas", () => {
  const out = projectIdentityContext({ drive_file_id: "abcdef1234", changes: [{ crew_name: "Jane", prior_flags: ["X"], new_flags: ["Y"] }] }, { includePii: false });
  expect(out.display.role_change_crew_names).toEqual(["Jane"]);
  expect(out.counts.role_change_count).toBe(1);
  expect(JSON.stringify(out)).not.toContain("prior_flags");
});
it("drops non-allowlisted + diagnostic keys", () => {
  const out = projectIdentityContext({ error_message: "secret", rpc_error_code: "42501", orphan_url: "u" }, { includePii: true });
  expect(JSON.stringify(out)).not.toMatch(/secret|42501|orphan_url/);
});
```
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** per spec §3.1 (`WIZARD_ACTION_ENUM` = the 5 `attemptedAction` values from `lib/sync/wizardSessionRollback.ts:2`; UUID regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`).
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(admin-alerts): projectIdentityContext (validated resolution IDs, sanitized display, derived counts)`.

---

### Task 3: `alertIdentityMap` + completeness meta-test

**Files:** Create `lib/adminAlerts/alertIdentityMap.ts`; Test `tests/adminAlerts/_metaAlertIdentityMap.test.ts`, `tests/adminAlerts/alertIdentityMap.test.ts`.

**Interfaces — Produces:** `ALERT_IDENTITY_MAP: Record<string, IdentityMapEntry>` where `IdentityMapEntry = { kind: "global" } | { segments: SegmentSpec[] }`; `SegmentSpec` per spec §3.1 (`showName`/`sheetName`/`crewName(key)`/`contextField(key,label)`/`count(key,label)`/`email`). Populate all 42 codes exactly per spec §4 (13 `global`: 4,5,11,12,17,18,19,21,22,23,33,38,39; 29 with segments).

- [ ] **Step 1: failing test** `_metaAlertIdentityMap.test.ts`:
```ts
import { ADMIN_ALERTS_CODES } from "@/tests/messages/_metaAdminAlertCatalog.test"; // or re-declare the import per repo convention
import { ALERT_IDENTITY_MAP } from "@/lib/adminAlerts/alertIdentityMap";
it("has an entry for every admin alert code, each global or ≥1 segment", () => {
  for (const code of ADMIN_ALERTS_CODES) {
    const e = ALERT_IDENTITY_MAP[code];
    expect(e, `missing identity map entry for ${code}`).toBeDefined();
    expect("kind" in e && e.kind === "global" ? true : e.segments.length > 0).toBe(true);
  }
});
```
(If `ADMIN_ALERTS_CODES` isn't exported, copy the 42-code array from `tests/messages/_metaAdminAlertCatalog.test.ts:57-100` into a shared fixture and have BOTH tests import it — single source of truth.)
- [ ] **Step 2: run → FAIL** (map missing / incomplete).
- [ ] **Step 3: implement** `ALERT_IDENTITY_MAP` per the §4 matrix.
- [ ] **Step 4: run → PASS**; also add `alertIdentityMap.test.ts` asserting 3 representative rows (OAUTH_IDENTITY_CLAIMED segments = crewName+email+showName; SYNC_STALLED = global; ROLE_FLAGS_NOTICE = sheetName + role_change_crew_names + count).
- [ ] **Step 5: commit** `feat(admin-alerts): per-code identity map + completeness meta-test`.

---

### Task 4: `resolveAlertIdentities` + `describeAlert`

**Files:** Create `lib/adminAlerts/resolveAlertIdentities.ts`, `lib/adminAlerts/describeAlert.ts`; Test `tests/adminAlerts/resolveAlertIdentities.test.ts`, `tests/adminAlerts/describeAlert.test.ts`.

**Interfaces — Consumes:** map (Task 3), `IdentityContext` (Task 2), `sanitizeIdentityString` (Task 1). **Produces:**
- `resolveAlertIdentities(rows: ResolverRow[], supabase, opts: { includePii: boolean }): Promise<{ kind: "ok" | "infra_error"; identities: Map<string, AlertIdentity> }>` where `ResolverRow = { id: string; code: string; show_id: string | null; occurrence_count: number; identityContext: IdentityContext }`. The `opts.includePii` is REQUIRED (Codex P1) — it threads into `makeSegment` so resolved DB names (`crew_members.name`, `shows.title`) get the same email-redaction policy as projected display strings (web `true`; CLI from `--reveal-email`). ≤3 batched `.select().in().limit()` reads (`crew_members(id,show_id,name)`, `shows(id,title,slug)`, `shows(drive_file_id,title,slug)`); show-scoped crew; `makeSegment(label, value, { pii })` = sole segment constructor, always `sanitizeIdentityString(value, { includePii })`; append `(most recent of N)` when `occurrence_count>1` and non-global with ≥1 segment; `{ kind:"infra_error" }` on any returned/thrown DB error (partial map still returned; never throws out).
- `describeAlert(identity: AlertIdentity, opts?: { includePii?: boolean }): string | null` — drop `pii` segments when `!includePii`; join surviving with ` · `; null if global/empty.

- [ ] **Step 1: failing tests** covering: OAUTH end-to-end (crew+email+show); legacy OAUTH (no `user_email`) → crew+show, no email (assert no `@`); show-scoped crew (crew of another show → dropped); resolved-name sanitization (crew name with email/token/bidi → redacted per policy via makeSegment); coalescing `(most recent of 2)`; typed `infra_error` on a stubbed erroring `.in()` (returned-error AND thrown); drive_file_id resolves a show; global → describeAlert null. Use a fake supabase whose `.from().select().in().limit()` returns seeded maps.
- [ ] **Step 1b: exhaustive 42-code identity matrix (Codex P11, spec §9.1)** — a code × context table test over ALL 42 codes. Each fixture uses the code's REAL producer context shape (e.g. `ROLE_FLAGS_NOTICE` → `{ drive_file_id, changes:[{crew_name,prior_flags,new_flags}] }` per `phase2.ts`; `PICKER_BOOTSTRAP_RPC_FAILED` → `{ show_id, attempted_email_hash, rpc_error_code, rpc_error_message, route }`), NEVER a synthetic key a producer never emits. Assert the produced `AlertIdentity` per code (segment labels/values derived from the seeded lookup fixture, not hardcoded — anti-tautology). Include a **helper cross-check**: for every non-`global` code, assert at least one key the identity map reads for that code is present in the fixture — so an entity-bearing code whose real producer writes no readable key FAILS (the WATCH_CHANNEL_ORPHANED trap). This is the load-bearing per-code correctness test; the completeness meta-test (Task 3) only proves presence.
- [ ] **Step 1c: batching + bounded-read invariants (Codex P12, spec §3.2/§9.2)** — assert: a mixed batch issues **at most 3** DB reads (spy on the fake supabase `.from` calls); an empty id-set **skips** its query (0 reads when no crew/drive/show ids); **every** issued read carries a `.limit(...)` (assert the fake records a limit arg). Catches N+1 / unbounded regressions.
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** per spec §3.2/§3.3/§6.4a. Every call `const { data, error } = await …`; on error set an `infra` flag and skip that lookup.
- [ ] **Step 4: run → PASS**.
- [ ] **Step 4b: Supabase call-boundary registration (Codex P2, invariant 9)** — `resolveAlertIdentities` is a new Supabase read surface. Either register it in the applicable call-boundary meta-test (`tests/auth/_metaInfraContract.test.ts` `INFRA_PRODUCERS` at :69 if its scan covers `lib/adminAlerts`) with an assertion that returned-error AND thrown-error both yield `{ kind: "infra_error" }`, OR — if the meta-test's scan scope is auth-only — add an inline `// not-subject-to-meta: read-only identity resolution; returns typed {kind:'infra_error'}, no mutation` waiver on each `.select` boundary. Add the resolver's returned-error + thrown-error cases to the Task-4 unit test regardless. Run `pnpm vitest run tests/auth/_metaInfraContract.test.ts` — green.
- [ ] **Step 5: commit** `feat(admin-alerts): batched show-scoped resolver + describeAlert (typed infra_error, makeSegment sanitize chokepoint)`.

---

### Task 5: Producer — `OAUTH_IDENTITY_CLAIMED` raw email

**Files:** Modify `app/auth/callback/route.ts:134-142`; Test `tests/auth/callback-claim-stamp.test.ts` (extend).

- [ ] **Step 1: failing test** — assert the emitted context for a claimed row includes `user_email: canonicalEmail` (the canonicalized address) alongside existing `crew_member_id`/`show_id`/`user_email_hash`.
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** — add `user_email: canonicalEmail,` to the `context` object (keep `user_email_hash`).
- [ ] **Step 4: run → PASS**; run `pnpm vitest run tests/cross-cutting/email-canonicalization.test.ts` — Layer-6 JSONB guard must still pass (value derives from `canonicalize()`).
- [ ] **Step 5: commit** `feat(auth): stamp canonical OAuth email into OAUTH_IDENTITY_CLAIMED alert context`.

---

### Task 6: Producer — `PICKER_BOOTSTRAP_RPC_FAILED` context.show_id

**Files:** Modify `app/api/auth/picker-bootstrap/route.ts` (`emitClaimFailure` sig + both call sites 192/197); Test `tests/api/auth/picker-bootstrap.*` (extend or create).

- [ ] **Step 1: failing test** — the emitted `PICKER_BOOTSTRAP_RPC_FAILED` row keeps `showId` column `null` (upsert arg) AND context carries `show_id: targetShowId`.
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** — add `showId: string` param to `emitClaimFailure`, add `show_id: input.showId` to its context object, pass `targetShowId` at both call sites (guaranteed non-null past the route.ts:176 guard). `upsertAdminAlert` `showId` stays `null`.
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(auth): carry resolved show_id in PICKER_BOOTSTRAP_RPC_FAILED context (row stays null-scoped)`.

---

### Task 7: Producer — `WIZARD_SESSION_SUPERSEDED_RACE` file_name (all 4 emitters)

**Files:** Modify `lib/sync/wizardSessionRollback.ts` (add `driveFileName?: string` to `WizardSessionRollbackContext`), `lib/sync/applyStaged.ts` (1152/1182/1681), `lib/sync/discardStaged.ts` (470/487), `lib/sync/retrySingleFile.ts` (182), the retry route local `rollbackContext` (`.../retry/route.ts:472`) and its emission (543), and emissions in staged-apply (219), staged-discard (158), manifest-ignore (255). Tests: producer tests per route.

- [ ] **Step 1: failing tests** — for EACH of the 4 emitters, assert the emitted `WIZARD_SESSION_SUPERSEDED_RACE` context carries `file_name` (from `error.context.driveFileName`); for the retry route, exercise the `retrySingleFile` throw AND **each** local throw (Codex P8, spec §9.1): manifest-transition (route.ts:479), deferral (route.ts:493), and delete (route.ts:504) — all three, so no `driveFileName`/`file_name` branch is left unpinned.
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** — add `driveFileName` to the context type; populate at each throw site from the drive file name in scope (`current.row.drive_file_name` in the retry route's `rollbackContext`; the analogous name at applyStaged/discardStaged/retrySingleFile/ignore throws); set `file_name: error.context.driveFileName` in all 4 emissions. Guard: omit when unavailable.
- [ ] **Step 3b: structural emitter-set guard (Codex P13, spec §9.1)** — add a structural test that greps the repo for every `code: "WIZARD_SESSION_SUPERSEDED_RACE"` emission site and asserts the set is EXACTLY the four known routes (retry, staged-apply, staged-discard, manifest-ignore) AND that each emission's `context` literal includes a `file_name` key. A future 5th emitter (or an emitter that forgets `file_name`) fails CI. (Pattern: walk `app/` + `lib/` sources, regex the `upsertAdminAlert({...code: "WIZARD_SESSION_SUPERSEDED_RACE"...})` blocks, assert count === 4 and each block contains `file_name`.)
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(sync): capture drive file name for WIZARD_SESSION_SUPERSEDED_RACE at all four emitters`.

---

### Task 8: Read-core — `queryAlerts` returns `SerializedAlertIdentity`

**Files:** Modify `lib/observe/query/alerts.ts`, `lib/observe/query/types.ts`; Test `tests/observe/queryAlerts.test.ts` (extend), CREATE `tests/observe/_metaAlertsRedactionContract.test.ts`.

**Interfaces — Consumes:** `projectIdentityContext`, `resolveAlertIdentities` (Tasks 2/4). **Produces:** `AlertFilters` gains `includePii?: boolean`; `AlertRow` gains `identity: SerializedAlertIdentity` (replaces any `context` exposure). `queryAlerts` selects `context`, runs project+resolve (sole owner), returns `identity` only.

- [ ] **Step 1: failing tests** — (a) a row whose context carries `error_message`/`orphan_url` → returned `AlertRow.identity` has no such key, no `resolution`, no `context`, no `drive_file_id`/`crew_member_id`/context-`show_id`; (b) email segment absent by default, present with `includePii:true`; (c) a token/email planted inside `file_name` is redacted by default; token stays redacted with `includePii:true`; (d) **resolver infra-fault handling (Codex P5):** when `resolveAlertIdentities` returns `{ kind: "infra_error" }` (stub its DB read to error), `queryAlerts` STILL returns `{ kind: "ok", alerts }` with the alerts present and each `AlertRow.identity` a valid (possibly empty/partial) `SerializedAlertIdentity` — NOT a dropped alert, NOT a crash. The read-core does NOT log (it must stay `lib/log`-free per `_metaReadOnlyQueryCore`); the degraded resolve is surfaced by logging in the WEB caller (Task 10) which can import `lib/log`. (The alert-row READ faulting is separate and still returns `queryAlerts`'s own `{ kind: "infra_error" }`.) Plus the meta-test `_metaAlertsRedactionContract.test.ts` per spec §8.3 (source-scan `alerts.ts` for raw `context` passthrough + behavioral assertions; iterate display string-field set).
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** — add `context` to `SELECT`; after fetch, per row `projectIdentityContext(context, { includePii: filters.includePii ?? false })` then `resolveAlertIdentities(rows, supabase, { includePii: filters.includePii ?? false })`; on the resolver returning `{ kind: "infra_error" }`, use its partial `identities` map (empty `SerializedAlertIdentity` for unresolved rows) and STILL return `{ kind: "ok", alerts }` — do NOT import `lib/log` here (read-core stays log-free); map each row to `AlertRow.identity`. Replace the NOTE comment (spec §7 wording). Keep `.select`-only (no `.rpc`) so `_metaReadOnlyQueryCore` stays green.
- [ ] **Step 4: run → PASS**; run `pnpm vitest run tests/observe/` (all green, incl. `_metaReadOnlyQueryCore`).
- [ ] **Step 5: commit** `feat(observe): queryAlerts resolves SerializedAlertIdentity (allowlisted, PII-gated) + redaction meta-test`.

---

### Task 9: CLI — `--reveal-email` + identity line

**Files:** Modify `scripts/observe/args.ts` (add the `reveal-email` boolean to the `parseArgs` options ~56-59 + the typed args shape ~15), `scripts/observe.ts` (`alerts` handler ~107-110 — pass `includePii` into the `queryAlerts` filters), `scripts/observe/format.ts` (`formatAlerts` at :20-28 — render the identity per row); Test `tests/observe/dispatch.test.ts` (extend). (Codex P3: parsing lives in `args.ts`, formatting in `format.ts` — NOT a `formatAlerts` defined in `observe.ts`.)

- [ ] **Step 1: failing test** — `pnpm observe alerts` output (via the dispatch/format path) shows the identity per row (crew/show/sheet) but NO email by default; `--reveal-email` sets `includePii:true` on the `queryAlerts` filters and shows the email; a `--json` snapshot has no `user_email` and no non-display key by default. (An unknown flag must not be rejected — hence adding it to `args.ts` options.)
- [ ] **Step 2: run → FAIL** (flag rejected by `parseArgs`, or no identity in output).
- [ ] **Step 3: implement** — in `scripts/observe/args.ts` add `"reveal-email": { type: "boolean", default: false }` to the options and `revealEmail: boolean` to the parsed shape; in `scripts/observe.ts` alerts handler pass `includePii: args.revealEmail` into the `queryAlerts` filters + stderr notice when set; in `scripts/observe/format.ts` `formatAlerts`, render each row's identity via `describeAlert(row.identity, { includePii: true })` (Codex P9: the **read-core is the sole PII gate** — it already included/withheld the email segment per `filters.includePii` from `--reveal-email`; the formatter renders whatever segments are present and must NOT re-gate, or it would double-drop a revealed email). Both table and `--json` shapes use the pre-serialized `row.identity`. Format-only — no second resolve. Add flag to the USAGE/help string.
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(observe): --reveal-email flag + at-a-glance identity in alerts CLI`.

---

### Task 10: UI — `AlertBanner` identity line

**Files:** Modify `components/admin/AlertBanner.tsx`; Test `tests/components/AlertBanner.test.tsx` (extend).

- [ ] **Step 1: failing tests (jsdom)** — with an `OAUTH_IDENTITY_CLAIMED` row + resolver stub, the banner renders `data-testid="admin-alert-identity"` containing crew name, email, show title; a `global` code renders no identity element; an unknown code renders none and does not throw; `resolveAlertIdentities` returning `infra_error` still renders the alert copy (no crash) and logs. Clone-and-remove sibling nodes before scanning for the name (anti-tautology).
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** — extend the SELECT to `shows(slug, title)` + `occurrence_count`; `projectIdentityContext(alert.context, { includePii: true })` → `resolveAlertIdentities([row], supabase, { includePii: true })` (web is admin-only → PII allowed); on `infra_error` log via `lib/log` + render partial; render the identity in TWO places with DISTINCT test ids (Codex P10 — avoid ambiguous nodes when expanded): the collapsed line (grid-sibling associated with the summary) gets `data-testid="admin-alert-identity"` (this is the ONE Task 12 measures), and the expanded-panel copy (above helpful-context) gets `data-testid="admin-alert-identity-panel"`. jsdom (this task) verifies content/presence on both; the exact collapsed-line placement geometry (grid-sibling row-2, not inside the 44px summary flex) is driven by Task 12's real-browser gate on `admin-alert-identity`. Suppress both when `describeAlert` → null. Add `data-testid="admin-alert-summary"` to the `<summary>` for Task 12's rect assertions.
- [ ] **Step 4: run → PASS**; `pnpm typecheck`.
- [ ] **Step 5: commit** `feat(admin): at-a-glance identity line on AlertBanner`.

---

### Task 11: UI — `PerShowAlertSection` identity line

**Files:** Modify `components/admin/PerShowAlertSection.tsx`; Test `tests/components/PerShowAlertSection.*` (extend/create).

- [ ] **Step 1: failing tests (jsdom)** — identity line renders per alert (`data-testid="per-show-alert-identity"`); a show-only code with NO `drive_file_id` (e.g. `EMAIL_DELIVERY_FAILED`/`PENDING_SNAPSHOT_PROMOTE_STUCK`) renders the show-name segment (proves parent `showId` injection); `ROLE_FLAGS_NOTICE` renders crew names + count. Clone-and-remove siblings before scanning.
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** — select `occurrence_count`; build resolver rows injecting the section's `showId` prop as each row's `show_id`; `projectIdentityContext(ctx,{includePii:true})` → `resolveAlertIdentities(rows, supabase, { includePii: true })` → render identity near the existing `failedKeys`/`data_gaps` sub-lines.
- [ ] **Step 4: run → PASS**; `pnpm typecheck`.
- [ ] **Step 5: commit** `feat(admin): at-a-glance identity line on per-show alert section`.

---

### Task 12: Layout-dimensions task (real browser — AlertBanner identity)

**Files:** Create `tests/e2e/alert-identity-banner-layout.spec.ts` (Playwright; harness precedent `tests/e2e/`). Dimensional invariant (spec §9.4): the identity line must not overlap/overflow the banner; the first-row icon/summary/action alignment (`min-h-tap-min`, 0.5px vertical-center) must be preserved with the identity present; `+N more` chip + raised-at row correctly placed. Assert at **375px** and **≥1024px**, **collapsed AND expanded**.

TDD ordering note (Codex P4): the identity ELEMENT already exists after Task 10, so this task's failing test is NOT "element absent" — it is a **geometry** assertion. To keep TDD honest, Task 10 Step 3 renders the identity line with a deliberately-minimal placement (e.g. appended inside the `<summary>` flex row, the naive spot); THIS test fails on the resulting overlap/tap-height violation, and its Step 3 fixes the placement (grid-sibling row-2). If Task 10 already placed it correctly, this test passes first-try and stands as a regression guard — acceptable for a layout gate, but prefer the fail-first path.

- [ ] **Step 1: failing test** — render a seeded `OAUTH_IDENTITY_CLAIMED` alert on `/admin`; `getBoundingClientRect()` on `admin-alert-identity`, `admin-alert-icon`, `admin-alert-message`, `admin-alert-action`, `admin-alert-summary`; assert ALL of: (i) identity visible; (ii) **identity is strictly BELOW the summary — `identityRect.top >= summaryRect.bottom - 0.5`** (proves it is a grid sibling on row-2, NOT nested inside the summary flex — Codex P7; a naive in-summary render fails this because the identity's top sits inside the summary's box); (iii) the `<summary>` row height stays within a single-line tap box — **`44 <= summaryRect.height <= 56`** (a two-line summary from a nested identity exceeds 56 and fails); (iv) identity rect does NOT intersect the action cell; (v) identity right edge ≤ banner content right edge (no horizontal overflow). Parametrize the two widths (375 / ≥1024) + toggle `details[open]`.
- [ ] **Step 2: run → FAIL** on assertion (ii)/(iii) — with the identity naively inside the summary flex (Task 10 minimal render), the identity top is inside the summary box and the summary row height exceeds 56.
- [ ] **Step 3: fix placement** — move the identity render to a grid-sibling `row-start-2` line (like the panel) in `components/admin/AlertBanner.tsx` so the summary keeps its 44px single-row box and the identity sits below without intersecting the action cell.
- [ ] **Step 4: run → PASS** against a real browser (Playwright; pin the runner image per byte-comparison discipline if it captures screenshots — geometry-only asserts don't need pixel baselines).
- [ ] **Step 5: commit** `test(admin): real-browser layout assertion for AlertBanner identity line`.

---

### Task 13: Docs — redaction posture + BACKLOG deferral

**Files:** Modify `AGENTS.md` ("Telemetry access → Redaction posture" bullet + add `--reveal-email` to the `alerts` command-table row), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§3.3/§5 redaction amendment note — **do NOT run prettier on the master spec**), `BACKLOG.md` (BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC — already drafted in the spec branch; confirm present).

- [ ] **Step 1:** update AGENTS.md redaction bullet to the spec §7 wording (`queryAlerts` selects `context` but returns only an allowlisted `SerializedAlertIdentity`; raw email gated by `includePii`/`--reveal-email`; token substrings always redacted); add the CLI flag to the table.
- [ ] **Step 2:** add the master-spec §3.3/§5 amendment line (hand-edit, no prettier).
- [ ] **Step 3:** verify `BACKLOG.md` BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC entry exists.
- [ ] **Step 4:** `pnpm format:check` (excludes the master spec via existing prettierignore? verify — if not, only stage the AGENTS.md/BACKLOG changes through prettier, never the master spec).
- [ ] **Step 5: commit** `docs: redaction posture for queryAlerts identity projection + watch-diagnostic backlog`.

---

### Task 14: Impeccable dual-gate (UI) + full-suite verification

- [ ] **Step 1:** run `/impeccable critique` on the AlertBanner + PerShowAlertSection diff (invariant 8). Record findings.
- [ ] **Step 2:** run `/impeccable audit` on the same diff. HIGH/CRITICAL → fix or `DEFERRED.md` with rationale. Put dispositions in the handoff §12.
- [ ] **Step 3:** `pnpm typecheck && pnpm vitest run && pnpm format:check` — full suite green (per feedback: touched-suite runs miss namespace/format failures). Capture the SUMMARY line as evidence.
- [ ] **Step 4:** commit any fixes `fix(admin): impeccable dual-gate dispositions for alert identity`.

---

### Task 15: Adversarial review (cross-model) + execution handoff

- [ ] **Step 1:** whole-diff Codex adversarial review (fresh-eyes, REVIEWER ONLY) via the codex-companion (or `codex exec` fallback with `-o` verdict capture). Iterate to APPROVE; triage findings via deferral discipline (land-now / DEFERRED.md / BACKLOG.md).
- [ ] **Step 2:** push; open PR; **real CI green** (confirm `mergeStateStatus == CLEAN`, not a false-green SHA watch — pass PR#). Reconcile if DIRTY/behind base.
- [ ] **Step 3:** `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

## Self-Review

**Spec coverage:** §3.1 sanitizer/projection → Tasks 1-2; §3.2/§3.3/§6.4a resolver+describe → Task 4; §4 identity map → Task 3; §5a/§5b/§5c producers → Tasks 5/6/7; §6.1 banner → Task 10; §6.2 CLI → Tasks 8-9; §6.3 per-show → Task 11; §7 redaction posture → Tasks 8/13; §8.3 meta-tests → Tasks 3/8; §9.4 layout → Task 12; invariant-8 → Task 14. All spec sections mapped.

**Placeholder scan:** none — every code step has concrete test/impl; regexes and field names are exact.

**Type consistency:** `IdentityContext`/`SerializedAlertIdentity`/`AlertIdentity`/`AlertIdentitySegment` defined in Task 1, consumed unchanged in 2/4/8/10/11. `resolveAlertIdentities` signature in Task 4 matches its callers (Tasks 8/10/11). `sanitizeIdentityString(raw, {includePii})` consistent across Tasks 1/2/4.

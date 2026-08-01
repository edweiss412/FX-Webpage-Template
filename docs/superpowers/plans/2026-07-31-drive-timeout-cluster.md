# Drive-Timeout Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound the eight unbounded Drive/Sheets calls under `app/api/`, bound the GoogleAuth token POST via a URL-scoped transporter, fix the dead gaxios-timeout classifier, and ship a structural guard so new unbounded call sites fail CI by default.

**Architecture:** Per spec `docs/superpowers/specs/2026-07-31-drive-timeout-cluster-design.md` (R5, adversarial-APPROVEd after 5 rounds — cite it as "the spec" throughout). Metadata sites get `{timeout, retry:false}`; stream sites get a stall-guard-bounded await; the token fetch gets a `TokenBoundGaxios` transporter; classification keys on the PROBED gaxios-7 shape (GaxiosError, no `code`, `cause.name === "AbortError"`).

**Tech Stack:** Next.js 16 routes, googleapis 171 / gaxios 7.1.4 (gaxios becomes a direct dep), vitest, TypeScript compiler API (guard).

## Global Constraints

- Spec is canonical; its §2 D1–D10 and §2.1 MF1–MF7 are ratified — do not re-decide.
- Commit per task, conventional commits, `--no-verify` (worktree rule).
- TDD per task: failing test → minimal implementation → green → commit.
- Budgets (spec-fixed): `DRIVE_FILES_GET_TIMEOUT_MS = 8_000` (moved, value unchanged), `DRIVE_ASSET_STALL_TIMEOUT_MS = 30_000` (unchanged), `GOOGLE_AUTH_TOKEN_TIMEOUT_MS = 10_000` (new).
- New §12.4 code `ONBOARDING_FOLDER_VERIFY_UNAVAILABLE` (status 504) — three-way lockstep in ONE commit (Task 6).
- No new telemetry surfaces; no DB changes; no advisory-lock changes (zero holders on any edited function — spec §5).
- Full suites that must stay green locally before push: `pnpm exec vitest run --project parallel --project serial` (or `pnpm test` equivalent per package.json), `pnpm typecheck`, `pnpm lint`, `pnpm spec:lint` on both docs.

## Meta-test inventory (declared per docs/agents/writing-plans.md)

- **CREATES** tests/drive/_metaDriveCallBounds.test.ts (structural guard, Task 7).
- **EXTENDS** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — three `BACKLOG_GRADUATED` registry rows (Task 8).
- Not applicable: `tests/auth/_metaInfraContract.test.ts` (no Supabase call sites added/changed), advisory-lock topology test (zero `pg_advisory*` holders touched — verified `grep -rn 'pg_advisory' <edited files>` returns nothing), sentinel/tile and admin-alert registries (no such surfaces).

## Advisory-lock holder topology

No task touches `pg_advisory*`. The scan route's downstream wizard-reservation transaction (deletes on `pending_syncs`/`pending_ingestions`, serialized by `app_settings` `FOR UPDATE`, `app/api/admin/onboarding/scan/route.ts:160-203`) is NOT edited by any task; spec §5 invariant-2 entry is the ratified statement.

## Plan-time sweep: `grep -rn 'TimeoutError' lib/ --include='*.ts'` (run 2026-07-31, per-hit disposition)

| Hit | Disposition |
|---|---|
| `lib/drive/fetch.ts:92`, line 181, line 185, line 190 | REWRITTEN in Task 2 (classifier + its comments). |
| `lib/drive/list.ts:15` | Comment corrected in Task 2. |
| `lib/drive/sheetGids.ts:18` | Comment corrected in Task 2. |
| `lib/sync/verifyReelOnApply.ts:64` | Comment corrected in Task 2. |
| `lib/sync/applyStaged.ts:993` | Comment corrected in Task 2. |
| `lib/sync/runScheduledCronSync.ts:2103` | Comment corrected in Task 2. |
| runScheduledCronSync.ts lines 135, 150, 1860, 1865, 2016, 2509 | KEEP — `SyncStepTimeoutError` is the repo's own class, unrelated to gaxios. |
| geocoding/client.ts lines 57 and 130 | KEEP — native-fetch path using `AbortSignal.timeout`, where top-level `name === "TimeoutError"` IS the real shape (no gaxios involved). |
| `lib/drive/agendaDrive.ts:67` | FIX in Task 2 (plan-review r3 F4 corrected the earlier disposition — this is NOT a raw-fetch-only path: `isTransientDriveError` is called from `getAgendaChips` after `sheets.spreadsheets.get`, so a gaxios per-call-timeout error whose signature lives on `cause.name` reaches it and MISSES the name check). Extend the line-67 check to walk the bounded `.cause` chain for the names `AbortError` / `TimeoutError` ONLY — deliberately NOT `isDriveTimeoutShape`, which also matches `ETIMEDOUT`/`ECONNABORTED`, socket shapes this site leaves to its transient classification. Unit case in `tests/drive/agendaDrive.test.ts`: a GaxiosError-like error with `cause.name === "AbortError"` is classified NOT transient (no retry), matching the existing intent for top-level abort names. |

Watch comments (`lib/drive/watchErrors.ts:86` region, `lib/drive/watch.ts:310`, `lib/drive/watch.ts:484` regions) are corrected in Task 3 when the token bound makes them stale.

---

### Task 1: Lean timeouts module

**Files:**
- Create: lib/drive/timeouts.ts
- Modify: `lib/drive/fetch.ts` (move constant out, re-export)
- Test: tests/drive/timeouts.test.ts

**Interfaces:**
- Produces: `DRIVE_FILES_GET_TIMEOUT_MS` (8_000) importable from `@/lib/drive/timeouts` with NO transitive imports; `@/lib/drive/fetch` re-exports it unchanged for existing importers (`lib/sync/applyStaged.ts:11`, `lib/sync/runScheduledCronSync.ts:33`, `lib/sync/verifyReelOnApply.ts:4`, `lib/drive/sheetGids.ts:3`, `lib/drive/agendaDrive.ts:42`).

- [ ] **Step 1: Write the failing test** at tests/drive/timeouts.test.ts:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRIVE_FILES_GET_TIMEOUT_MS } from "@/lib/drive/timeouts";
import { DRIVE_FILES_GET_TIMEOUT_MS as reexported } from "@/lib/drive/fetch";

describe("lib/drive/timeouts", () => {
  it("holds the 8s metadata budget and is re-exported by fetch.ts", () => {
    expect(DRIVE_FILES_GET_TIMEOUT_MS).toBe(8_000);
    expect(reexported).toBe(DRIVE_FILES_GET_TIMEOUT_MS);
  });
  it("is a leaf module: no imports AND no re-exports (routes must not inherit fetch.ts's xlsx cost)", () => {
    const src = readFileSync("lib/drive/timeouts.ts", "utf8");
    expect(src).not.toMatch(/^\s*import /m);
    // Plan-review r3 F3: a circular `export ... from "@/lib/drive/fetch"` re-export
    // would satisfy both value assertions while pulling xlsx right back in. No
    // module specifier of any kind may appear in this file.
    expect(src).not.toMatch(/\bfrom\s+["']/);
  });
});
```

Failure mode caught: constant moved back behind the xlsx-bearing module, or value drift.

- [ ] **Step 2: Run** `pnpm exec vitest run tests/drive/timeouts.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement.** Create lib/drive/timeouts.ts: move the `DRIVE_FILES_GET_TIMEOUT_MS` export and its full doc comment verbatim from `lib/drive/fetch.ts:110` region (no-imports module, header comment: "Lean timeout constants importable from request routes without pulling lib/drive/fetch.ts's xlsx dependency; see lib/drive/errorStatus.ts's header for the cost rationale"). In `lib/drive/fetch.ts`, delete the moved block, add `import { DRIVE_FILES_GET_TIMEOUT_MS } from "@/lib/drive/timeouts";` (fetch.ts's own references at line 337 and elsewhere keep compiling) plus a separate `export { DRIVE_FILES_GET_TIMEOUT_MS };` re-export for existing importers (plan-review r1 F1: a bare `export ... from` re-export alone leaves no local binding and fetch.ts stops compiling).
- [ ] **Step 4: Run** the test (PASS) + `pnpm typecheck`.
- [ ] **Step 5: Commit** `refactor(sync): move DRIVE_FILES_GET_TIMEOUT_MS to lean lib/drive/timeouts module`

### Task 2: Timeout-shape classifier + comment sweep

**Files:**
- Modify: `package.json` (add `"gaxios": "^7.1.4"` to dependencies + `pnpm install` — moved here from Task 3 because THIS task's live-socket test imports `gaxios` first; plan-review r1 F2. Lockfile must not fork the version — verify `pnpm why gaxios` shows the single 7.1.4), `lib/drive/errorStatus.ts` (new export + header sentence updated: the header's "what deliberately does NOT live here" list keeps retry POLICY out but now names the SHAPE-level `isDriveTimeoutShape` as in-scope, plan-review r1 F3), `lib/drive/fetch.ts` (delegate at line 190 region + rewrite comments line 92/line 181-185), `lib/drive/agendaDrive.ts:67` (cause-chain walk for AbortError/TimeoutError names per the sweep table's FIX row), comment-only: lib/drive/timeouts.ts (the constant's doc comment arrives from Task 1 VERBATIM — including the refuted code-TimeoutError claim — deliberately, so the move stays a pure move; THIS task corrects it where the constant now lives, plan-review r7 F2), `lib/drive/list.ts:15`, `lib/drive/sheetGids.ts:18`, `lib/sync/verifyReelOnApply.ts:64`, `lib/sync/applyStaged.ts:993`, `lib/sync/runScheduledCronSync.ts:2103`
- Test: tests/drive/errorStatus.test.ts (extend or create), `tests/drive/fetch.test.ts` (extend), `tests/drive/agendaDrive.test.ts` (extend — cause-chain abort case)

**Interfaces:**
- Produces: `isDriveTimeoutShape(error: unknown): boolean` from `@/lib/drive/errorStatus` (no-imports module contract preserved).

- [ ] **Step 1: Write failing tests.** In tests/drive/errorStatus.test.ts:

```ts
import http from "node:http";
import { describe, expect, it } from "vitest";
import { isDriveTimeoutShape } from "@/lib/drive/errorStatus";

describe("isDriveTimeoutShape", () => {
  it("classifies a REAL gaxios-7 per-call timeout (live stalled socket, no mocks)", async () => {
    const { Gaxios } = await import("gaxios");
    const srv = http.createServer(() => {});
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const { port } = srv.address() as { port: number };
    let caught: unknown;
    try {
      await new Gaxios().request({ url: `http://127.0.0.1:${port}/x`, timeout: 250, retry: false });
    } catch (e) {
      caught = e;
    } finally {
      srv.close();
    }
    expect(caught).toBeTruthy();
    expect(isDriveTimeoutShape(caught)).toBe(true);
  }, 10_000);
  it("classifies legacy/defensive shapes", () => {
    expect(isDriveTimeoutShape(Object.assign(new Error("t"), { code: "TimeoutError" }))).toBe(true);
    expect(isDriveTimeoutShape(Object.assign(new Error("t"), { code: "ETIMEDOUT" }))).toBe(true);
    expect(isDriveTimeoutShape(new Error("x", { cause: Object.assign(new Error("a"), { name: "AbortError" }) }))).toBe(true);
  });
  it("rejects non-timeout shapes", () => {
    expect(isDriveTimeoutShape(new Error("plain"))).toBe(false);
    expect(isDriveTimeoutShape(Object.assign(new Error("s"), { status: 404 }))).toBe(false);
    expect(isDriveTimeoutShape(null)).toBe(false);
    const cyc: { cause?: unknown } = new Error("c");
    cyc.cause = cyc;
    expect(isDriveTimeoutShape(cyc)).toBe(false); // cycle guard
  });
});
```

In `tests/drive/fetch.test.ts`, add: the transient-mapping path returns 504 for the probed shape (construct `new Error("The operation was aborted.")` with `cause` named `AbortError`, pass through the module's exported retry-status mapper the existing tests already exercise; follow the file's existing harness — the assertion is `mapsTo(504)` for that shape, which FAILS today).

Failure mode caught: classifier drift from the real gaxios shape (the §1.3 dead-code class); a client-abort-free false negative.

- [ ] **Step 2: Run** both test files — FAIL (`isDriveTimeoutShape` not exported; 504 mapping absent).
- [ ] **Step 3: Implement** in `lib/drive/errorStatus.ts` (append; module keeps zero imports):

```ts
const TIMEOUT_SIGNATURES = new Set(["TimeoutError", "AbortError", "ETIMEDOUT", "ECONNABORTED"]);

/**
 * True iff the error or its bounded `.cause` chain (depth <= 4, cycle-guarded)
 * carries a timeout/abort signature on `name` or `code`. Probed 2026-07-31
 * against gaxios@7.1.4 + node-fetch: a per-call timeout is a GaxiosError with
 * NO `code`, `name === "Error"`, and `cause.name === "AbortError"`, the
 * spec's §1.3 transcript. Top-level "TimeoutError"/"ETIMEDOUT"/"ECONNABORTED"
 * are retained for native-fetch (AbortSignal.timeout) and socket-level shapes.
 */
export function isDriveTimeoutShape(error: unknown): boolean {
  let node: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth <= 4 && node && typeof node === "object" && !seen.has(node); depth++) {
    seen.add(node);
    const { name, code } = node as { name?: unknown; code?: unknown };
    if (typeof name === "string" && TIMEOUT_SIGNATURES.has(name)) return true;
    if (typeof code === "string" && TIMEOUT_SIGNATURES.has(code)) return true;
    node = (node as { cause?: unknown }).cause;
  }
  return false;
}
```

In `lib/drive/fetch.ts`: replace the `code === "TimeoutError" || code === "ETIMEDOUT" || code === "ECONNABORTED"` branch (line 190) with `if (isDriveTimeoutShape(error)) return 504;` (import from `@/lib/drive/errorStatus`), and rewrite the comments at line 92 and line 181-185 to state the probed shape (cause-chain AbortError; `code` absent) instead of the refuted `code === "TimeoutError"` claim. Correct the same refuted claim in the five comment-only files listed above (one sentence each: "gaxios-7 timeout = GaxiosError with cause.name 'AbortError', classified by isDriveTimeoutShape → 504"). Check `lib/drive/agendaDrive.ts:67` per the sweep table disposition.
- [ ] **Step 4: Run** both files + `pnpm exec vitest run tests/drive/` — PASS.
- [ ] **Step 5: Commit** `fix(sync): classify real gaxios-7 timeout shape (cause AbortError) as transient 504; sweep refuted code-TimeoutError comments`

### Task 3: TokenBoundGaxios + token bound + watch comment corrections

**Files:**
- Modify: `lib/drive/client.ts` (gaxios direct dep already added in Task 2), comment-only: `lib/drive/watchErrors.ts:86` region, `lib/drive/watch.ts:310` + line 484 regions
- Test: tests/drive/clientAuthTimeout.test.ts (NEW), `tests/drive/client.test.ts` (UPDATE — the exact-argument assertions at `tests/drive/client.test.ts:48` and `tests/drive/client.test.ts:86` expect `GoogleAuth` to receive exactly `{credentials, scopes}`; they gain the `clientOptions: { transporter: expect.any(TokenBoundGaxios) }` shape, plan-review r1 F5, and the suite runs in this task's green command; ALSO update the nested exact assertion at `tests/drive/client.test.ts:52-58` — the GoogleAuth mock returns `{ options }`, so `driveMock`'s expected `auth.options` shape gains the same `clientOptions` field, plan-review r4 F2)

**Interfaces:**
- Produces: `TokenBoundGaxios` (exported class, constructor `(tokenTimeoutMs: number, tokenHost?: string)`), `GOOGLE_AUTH_TOKEN_TIMEOUT_MS = 10_000`, `getDriveAuth()` unchanged signature (wires the transporter).

- [ ] **Step 1: Write failing tests** at tests/drive/clientAuthTimeout.test.ts (spec T6, all three arms):

```ts
import http from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_AUTH_TOKEN_TIMEOUT_MS, TokenBoundGaxios, getDriveAuth } from "@/lib/drive/client";
import { isDriveTimeoutShape } from "@/lib/drive/errorStatus";

function stallServer(): Promise<{ port: number; close: () => void; seen: string[] }> {
  const seen: string[] = [];
  const srv = http.createServer((req) => { seen.push(String(req.url)); /* never respond */ });
  return new Promise((r) =>
    srv.listen(0, "127.0.0.1", () => r({ port: (srv.address() as { port: number }).port, close: () => srv.close(), seen })),
  );
}

describe("TokenBoundGaxios", () => {
  it("aborts a stalled token-host request at the budget (real socket)", async () => {
    const { port, close, seen } = await stallServer();
    const t = new TokenBoundGaxios(250, `127.0.0.1:${port}`);
    const started = Date.now();
    let caught: unknown;
    try {
      await t.request({ url: `http://127.0.0.1:${port}/token`, method: "POST", retry: false });
    } catch (e) {
      caught = e;
    }
    const elapsed = Date.now() - started;
    // Plan-review r2 F2: an immediate arbitrary throw must NOT pass. Prove all three:
    expect(seen).toContain("/token");                 // the server was actually reached
    expect(elapsed).toBeGreaterThanOrEqual(250);      // the wait ran to the budget...
    expect(elapsed).toBeLessThan(5_000);              // ...and not past the test ceiling
    expect(isDriveTimeoutShape(caught)).toBe(true);   // rejection carries the probed timeout shape
    close();
  }, 10_000);
  it("injects NO timeout for non-token hosts (slow-but-healthy response above token budget completes)", async () => {
    const srv = http.createServer((req, res) => setTimeout(() => res.end("{}"), 600));
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const { port } = srv.address() as { port: number };
    const t = new TokenBoundGaxios(250, "oauth2.googleapis.com"); // token host elsewhere
    const res = await t.request({ url: `http://127.0.0.1:${port}/api`, retry: false });
    expect(res.status).toBe(200);
    srv.close();
  }, 10_000);
  it("caller-set timeout wins on the token host (no override of explicit budgets)", async () => {
    const { port, close, seen } = await stallServer();
    const t = new TokenBoundGaxios(60_000, `127.0.0.1:${port}`);
    const started = Date.now();
    let caught: unknown;
    try {
      await t.request({ url: `http://127.0.0.1:${port}/token`, timeout: 250, retry: false });
    } catch (e) {
      caught = e;
    }
    const elapsed = Date.now() - started;
    // Plan-review r3 F2: same three-way proof as arm 1, keyed to the CALLER budget:
    // an implementation that clobbers caller timeouts (e.g. with 1ms) fails elapsed >= 250;
    // one that ignores them entirely (using 60s) fails the 5s ceiling.
    expect(seen).toContain("/token");
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(5_000);
    expect(isDriveTimeoutShape(caught)).toBe(true);
    close();
  }, 10_000);
});

describe("getDriveAuth wiring", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("constructs the auth client with a TokenBoundGaxios at the production budget", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    vi.stubEnv(
      "GOOGLE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({ type: "service_account", client_email: "t@t.iam.gserviceaccount.com", private_key: pem }),
    );
    const auth = getDriveAuth();
    const transporter = (auth as unknown as { clientOptions?: { transporter?: unknown } }).clientOptions?.transporter;
    expect(transporter).toBeInstanceOf(TokenBoundGaxios);
    expect((transporter as { tokenTimeoutMs: number }).tokenTimeoutMs).toBe(GOOGLE_AUTH_TOKEN_TIMEOUT_MS);
  });
});
```

(If `clientOptions` is private on the installed GoogleAuth, read the wiring via the constructed JWT client instead: `await auth.getClient()` then assert its `transporter` — decide by what the installed d.ts exposes; the assertion target is "our transporter instance, our budget", not a specific property path.)

Failure mode caught: flat-default regression (arm 2 fails if a default timeout leaks to non-token hosts); token bound not firing on a real socket; wiring dropped.

- [ ] **Step 2: Run** — FAIL (no `TokenBoundGaxios` export).
- [ ] **Step 3: Implement** in `lib/drive/client.ts` per spec §3.3: add `gaxios` import, `GOOGLE_AUTH_TOKEN_TIMEOUT_MS = 10_000` (doc comment: bounds ONLY the gtoken token POST; probe transcript reference to the spec §1.3/§3.3), `TokenBoundGaxios extends Gaxios` with `readonly tokenTimeoutMs` and `readonly tokenHost = "oauth2.googleapis.com"`; the override signature is `override async request<T = unknown>(opts: GaxiosOptions = {})` (default parameter — gaxios declares `request(opts?: GaxiosOptions)`, so bare `opts.url` fails strict null checks; plan-review r1 F4; this exact shape passed the plan's standalone strict typecheck): parse with `try { new URL(String(opts.url ?? "")) } catch`, inject `timeout: this.tokenTimeoutMs` only when `url.host === this.tokenHost && opts.timeout == null`, else pass through. Wire `clientOptions: { transporter: new TokenBoundGaxios(GOOGLE_AUTH_TOKEN_TIMEOUT_MS) }` in `getDriveAuth()`. Correct the three watch comments (state the token POST is now bounded by `GOOGLE_AUTH_TOKEN_TIMEOUT_MS`, pointing at the spec).
- [ ] **Step 4: Run** the new file + `tests/drive/client.test.ts` + `tests/drive/watch.test.ts` + `pnpm typecheck` — PASS.
- [ ] **Step 5: Commit** `fix(sync): bound GoogleAuth token POST via URL-scoped TokenBoundGaxios transporter (10s)`

### Task 4: Agenda route bounds (S1, S2, S3)

**Files:**
- Modify: `app/api/asset/agenda/[show]/[id]/route.ts` (line 320, line 481, line 524 + the local `DriveClient`-shape interface options types)
- Test: `tests/api/agenda-asset-route.test.ts` (extend)

**Interfaces:**
- Consumes: `DRIVE_FILES_GET_TIMEOUT_MS` from `@/lib/drive/timeouts` (Task 1); `createStallGuard`, `DRIVE_ASSET_STALL_TIMEOUT_MS` from `@/lib/drive/stallGuard` (existing).

- [ ] **Step 1: Write failing tests.** In `tests/api/agenda-asset-route.test.ts`, extend the drive mock (line 175 region) so each `files.get` records its SECOND argument into a shared `capturedOptions: unknown[]`. Add:

```ts
it("bounds BOTH metadata gets with {timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false}", async () => {
  // drive stub resolves normally; capturedMetadataOptions collects the 2nd arg of EVERY files.get
  // without alt:"media". Per-site strictness (plan-review r1 F7: arrayContaining alone passes
  // when only one of S1/S2 is bounded):
  expect(capturedMetadataOptions).toHaveLength(2);
  for (const opts of capturedMetadataOptions) {
    expect(opts).toMatchObject({ timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false });
  }
});
it("passes an AbortSignal to the stream call and leaves no armed timer on success", async () => {
  vi.useFakeTimers();
  // stream stub captures options; assert options.signal instanceof AbortSignal
  // run handler to success; expect(vi.getTimerCount()).toBe(baselineCount), guard cleared
});
it("aborts a stalled stream-open at DRIVE_ASSET_STALL_TIMEOUT_MS (runtime expiry proof)", async () => {
  vi.useFakeTimers();
  // stream stub returns a promise that resolves ONLY when its received signal aborts
  // (then rejects with an AbortError-caused error, mirroring gaxios abort semantics).
  // Drive the handler; vi.advanceTimersByTime(DRIVE_ASSET_STALL_TIMEOUT_MS);
  // assert the captured signal.aborted === true AND the response is the infra-error JSON.
  // Plan-review r1 F6: this is the case that fails on a never-firing guard; signal
  // presence alone (previous test) is shape, THIS is the behavioral bound.
});
it("maps a probed-shape timeout rejection to the existing infra error (regression pin)", async () => {
  // metadata stub rejects new Error("aborted", {cause: Object.assign(new Error("x"), {name: "AbortError"})})
  // expect 5xx JSON with code AGENDA_ASSET_LOOKUP_FAILED, NOT gone()/404
});
```

(Adapt to the file's existing harness idioms — request builder, `parseJson` helpers, testids; the three assertions above are the contract. Real code goes in at implementation following the file's local helpers; the options-capture array and signal assertion are the failing-first elements.)

Failure mode caught: bound dropped; timeout misread as asset-gone (cache-poisoning); guard timer leak.

- [ ] **Step 2: Run** the file — new tests FAIL (no options captured / no signal).
- [ ] **Step 3: Implement** per spec §3.1/§3.2: S1/S2 add `{ timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false }`; S3 wraps with `createStallGuard(DRIVE_ASSET_STALL_TIMEOUT_MS)`, `signal: guard.signal` in the options, `guard.clear()` after the await and in the catch. Structural option types: the route's local option declarations currently REQUIRE `responseType: "stream"` (`app/api/asset/agenda/[show]/[id]/route.ts:304` and line 466 region), so `{timeout, retry:false}` alone would not compile (plan-review r1 F8) — make `responseType` optional (`responseType?: "stream"`) and add `timeout?: number; retry?: boolean; signal?: AbortSignal` to each local options shape (or split a metadata-options type; pick whichever keeps the existing stream call sites untouched).
- [ ] **Step 4: Run** the whole file — PASS (all pre-existing tests too).
- [ ] **Step 5: Commit** `fix(assets): bound agenda route Drive calls — 8s metadata timeout, 30s stream-open stall guard`

### Task 5: Reel route bounds (S4–S7)

**Files:**
- Modify: `app/api/asset/reel/[show]/route.ts` (line 397, line 527, line 568, line 661 + `ReelDriveClient` options types)
- Test: `tests/api/reel-asset-route.test.ts` (extend)

Same shape as Task 4 — including the per-site strict metadata assertion (both of S4/S5, F7), the stalled-stream runtime-expiry case (advance fake timers by `DRIVE_ASSET_STALL_TIMEOUT_MS`, assert `signal.aborted` and the infra JSON — F6), and the `ReelDriveOptions` widening (`responseType` becomes optional; `app/api/asset/reel/[show]/route.ts:56` currently requires it — F8) — with one addition (spec T4): a fallback pair of tests (plan-review r5 F1 — signal PRESENCE alone would pass if S7 reused S6's already-cleared signal): (i) S6 rejects fallback-eligible, S7's stub never settles → advance fake timers by `DRIVE_ASSET_STALL_TIMEOUT_MS`; assert S7's captured signal is a DIFFERENT object from S6's captured signal, that it is `aborted`, and the response is the infra JSON (behavioral expiry of S7's OWN guard); (ii) S6 rejects fallback-eligible, S7 succeeds → timer-count delta 0 (S7's guard cleared on its success path).

- [ ] **Step 1: Write failing tests** (options-capture on line 397/line 527; signal-presence on line 568/line 661; fallback-signal case; probed-shape rejection → `REEL_ASSET_LOOKUP_FAILED` regression pin).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per spec §3.1/§3.2 (S7 arms its OWN guard inside S6's catch).
- [ ] **Step 4: Run** the whole file — PASS.
- [ ] **Step 5: Commit** `fix(assets): bound reel route Drive calls — metadata timeouts, stream-open stall guards incl. md5 fallback`

### Task 6: Scan route timeout mapping + new §12.4 code (single lockstep commit)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 new row; and the §~6 watch-create clause "Still unbounded" amendment — spec D9), `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`), `lib/messages/catalog.ts` (new row), `app/api/admin/onboarding/scan/route.ts` (`defaultVerifyFolder` timeout branch + `FolderVerificationResult` widening line 28-39 + S8 options arg line 109), `components/admin/wizard/Step2Verify.tsx:52` (`RECOGNIZED_CODES` + the new code)
- Test: tests/onboarding/defaultVerifyFolder.test.ts (NEW), `tests/onboarding/scanRoute.test.ts` (extend), `tests/components/admin/wizard/Step2Verify.test.tsx` (extend)

**Interfaces:**
- Consumes: `isDriveTimeoutShape` (Task 2), `DRIVE_FILES_GET_TIMEOUT_MS` (Task 1).
- Produces: catalog code `ONBOARDING_FOLDER_VERIFY_UNAVAILABLE` (504). Copy (catalog `dougFacing`, exact): "Google Drive didn't respond while we checked the folder. Nothing was scanned. Wait a moment and try again." — §12.4 row mirrors it; `helpHref: "/help/errors#ONBOARDING_FOLDER_VERIFY_UNAVAILABLE"`; no action link; `resolution` posture matching sibling ONBOARDING_FOLDER_* rows (copy adjustments allowed to match §12.4 house style, but route/UI/tests must all read the final catalog text via `messageFor`, never a duplicate literal).

- [ ] **Step 1: Write failing tests.** Test seams (plan-review r1 F10 — the scan suite is `tests/onboarding/scanRoute.test.ts`, NOT tests/api/admin/onboarding/, and its `deps()` harness always injects `verifyFolder`, bypassing `defaultVerifyFolder`): (a) NEW file tests/onboarding/defaultVerifyFolder.test.ts targeting the EXPORTED `defaultVerifyFolder` (`app/api/admin/onboarding/scan/route.ts:106`) directly, with `vi.mock("@/lib/drive/client")` supplying a `files.get` stub — options-arg assertion (`{timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false}`); probed-shape rejection → `{ok:false, status:504, code:"ONBOARDING_FOLDER_VERIFY_UNAVAILABLE"}`; plain status-less error → the existing 400 `OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA` (regression pin); 403/404 statuses keep their branches (regression pins). (b) In `tests/onboarding/scanRoute.test.ts`, one handler-level case: injected `verifyFolder` returns the new `{ok:false, status:504, code:"ONBOARDING_FOLDER_VERIFY_UNAVAILABLE"}` shape → response body carries the code and status (pass-through proof against the widened type). (c) Step2Verify component test cloning the `ONBOARDING_SCAN_FAILED` recognized-copy test at `tests/components/admin/wizard/Step2Verify.test.tsx:494-523`: terminal `{ok:false, code:"ONBOARDING_FOLDER_VERIFY_UNAVAILABLE"}` renders `messageFor("ONBOARDING_FOLDER_VERIFY_UNAVAILABLE").dougFacing`, NOT the generic fallback.
- [ ] **Step 2: Run** — FAIL (unknown code fails the catalog lookup/x1 parity; route lacks the branch).
- [ ] **Step 3: Implement, one commit:** §12.4 row AND its helpfulContext appendix YAML entry — the generator hard-fails any non-null-dougFacing code without one (`scripts/extract-spec-codes.ts:389-394`, plan-review r1 F9) — (+ the D9 watch-clause amendment in the same master-spec edit); `pnpm gen:spec-codes`; `pnpm gen:internal-code-enums` and commit the regenerated `lib/messages/__generated__/internal-code-enums.ts` in the SAME commit (plan-review r5 F2: the extractor scans admin-API files and the X.2 CI gate runs the generator + `git diff --exit-code`, so a missing regen fails CI); catalog row; route: S8 options arg, `isDriveTimeoutShape` branch in `defaultVerifyFolder` returning `{ ok: false, status: 504, code: "ONBOARDING_FOLDER_VERIFY_UNAVAILABLE" }` BEFORE the status-less tail, `FolderVerificationResult` failure union widened (`status: 400 | 403 | 404 | 504`, code union + the new code); Step2Verify `RECOGNIZED_CODES` addition.
- [ ] **Step 4: Run** scan suites + Step2Verify suite + `pnpm exec vitest run tests/cross-cutting/codes.test.ts` (x1 parity) — PASS.
- [ ] **Step 5: Commit** `feat(onboarding): 504 ONBOARDING_FOLDER_VERIFY_UNAVAILABLE for pre-scan Drive stalls (S8 bound + §12.4 lockstep + wizard copy)`

### Task 7: Structural guard meta-test

**Files:**
- Create: tests/drive/_metaDriveCallBounds.test.ts

**Interfaces:**
- Produces: exported pure checker `auditDriveCallBounds(sourceText: string, filePath: string): { line: number; reason: string }[]` (exported for the negative controls; the walk test consumes it).

- [ ] **Step 1: Write the meta-test** (checker + controls + live-tree walk in one file; the controls are the failing-first element — write them against the not-yet-written checker):

Checker rules (spec D7 + §2.1, verbatim contract):
- Parse each non-test `.ts` under `lib/` and `app/` (skip .d.ts, `__generated__`) with `ts.createSourceFile`; walk `CallExpression`s.
- MATCH when the callee property chain contains a NON-terminal segment in {`files`, `channels`, `revisions`, `spreadsheets`, `values`} and the terminal method name is NOT in the JS-collection blocklist (`map filter forEach some every find findIndex includes join slice splice reduce flat flatMap indexOf keys entries sort concat push pop shift unshift at` — `at` added per plan-review r5 F3: the live tree's `revisions.at(-1)` at `lib/sync/runScheduledCronSync.ts:2134` is an array access, and without it the zero-finding walk is false).
- A matched call is BOUND iff it has AT LEAST TWO arguments and its LAST argument (never the first — googleapis treats the first object as request PARAMS, where a `timeout` key is silently ignored; plan-review r7 F1, spec §1.1's judge-by-the-SECOND-argument rule) is an object literal containing a `timeout` or `signal` property whose initializer is one of an enumerated WHITELIST of AST shapes (plan-review r2 F1: a blacklist loses to logical-expression mutants like `0 && DRIVE_FILES_GET_TIMEOUT_MS`, which gaxios treats as no-timeout since it skips falsy values): (w1) a positive numeric literal; (w2) an identifier; (w3) a non-optional property-access chain (no `?.`) whose ROOT is an identifier or `this` (plan-review r6 F1: `({value: 0}).value` roots a chain in an object literal with a visibly-degenerate embedded value — an identifier-rooted chain cannot embed a value in the expression, so requiring the root closes the embedded-receiver family by construction, not enumeration) and whose FINAL segment is not one of the degenerate global names `NaN` / `undefined` / `null` (plan-review r3 F1: `Number.NaN` is a member chain and gaxios installs no timeout for falsy values — the degeneracy is VISIBLE IN THE EXPRESSION, so caught). **Guard soundness boundary, ratified (plan-review r5 F4):** the guard judges the initializer EXPRESSION, never resolved VALUES — it performs no symbol resolution, so an identifier or member chain whose value happens to be degenerate (`const T = 0`, `enum Budget { Zero = 0 }` → `Budget.Zero`, an imported constant) is trusted, exactly as MF5 trusts un-aliased receivers. Degeneracy is caught iff it is spelled in the expression itself (literals, the global degenerate names). Named-value laundering joins MF7's ceiling — carried by the behavioral tests for every in-scope site and by review for future ones; the module header states this boundary verbatim. Further named-value mutants are inside this ratified ceiling and are not new findings; (w4) a nullish-coalescing expression `A ?? B` whose right operand is w1/w2/w3 AND whose LEFT operand is a w2/w3 shape (identifier or property chain, optional chaining allowed on the left since `??` supplies the fallback) — a left operand that is a call expression, literal, or any other form is REJECTED (plan-review r4 F1: `Number.parseInt("x") ?? CONST` is statically decidable, never nullish, evaluates NaN, and gaxios installs no timeout for falsy values; constraining the left to possibly-nullish READS closes call-expression laundering by construction). EVERYTHING ELSE is unbound — ternaries, logical `&&`/`||` expressions, `undefined`/`null`/`0`/`NaN` literals, optional chains without a `??` safe fallback, call expressions, template strings. Whitelisting closes the mutant family by construction instead of enumerating escapes.
- Exemption: line (or preceding line) contains `// drive-call-bound: `.
- UNBOUND matches are findings; the walk test asserts ZERO findings tree-wide.

Negative controls (spec §3.4 (a)–(g), each a `it(...)` against the exported checker): (a) bare `drive.files.get({fileId: "x"})` → 1 finding; (b) bounded with options on later line → 0; (c) `formData.files.map((f) => f)` → 0; (d) `drive.files.get(p, { signal: opts?.signal })` → 1; (e) `sheets.spreadsheets.getByDataFilter({ spreadsheetId: "s" })` → 1; (f) exempted line → 0; (g) `{timeout: undefined}` / `{timeout: 0}` / `{timeout: NaN}` / `{signal: null}` → 1 each; (h) single-argument `drive.files.get({fileId: "x", timeout: 8_000})` → 1 (params-object laundering — googleapis ignores a `timeout` key in request params; plan-review r7 F1). Plus the live-idiom acceptance: `drive.files.get(p, { timeout: deps.timeoutMs ?? DRIVE_FILES_GET_TIMEOUT_MS, retry: false })` → 0.

Module header states the MF5/MF7 honest ceiling verbatim from spec §2.1.

- [ ] **Step 2: Run** — controls FAIL (checker not implemented).
- [ ] **Step 3: Implement** the checker in the same file (TypeScript compiler API only — `import ts from "typescript"`).
- [ ] **Step 4: Run** the file — controls pass AND the live-tree walk passes with ZERO exemption comments (spec AC-1/AC-5; if the walk flags a legit site, fix the SITE per D1/D2 patterns or correct the checker — never add an exemption to ship).
- [ ] **Step 5: Commit** `test(sync): structural guard — every Drive/Sheets call carries a non-degenerate timeout/signal`

### Task 8: Ledger graduations + spec-doc lint

**Files:**
- Modify: `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`BACKLOG_GRADUATED` +3 rows), `BACKLOG.md` (remove three entries), `BACKLOG-archive.md` (add them with provenance)

- [ ] **Step 1 (failing-first):** add registry rows `{ id: "BL-DRIVE-API-CALLS-UNBOUNDED-APP-ROUTES", provenance: "fix/drive-api-call-timeouts" }`, `{ id: "BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED", provenance: "fix/drive-api-call-timeouts" }`, `{ id: "BL-WATCH-DRIVE-CALL-TIMEOUT", provenance: "fix/drive-api-call-timeouts" }` following the file's row format (line 229-319). Run the test — FAIL (entries still in BACKLOG.md).
- [ ] **Step 2:** Move the three whole entries to `BACKLOG-archive.md` with a provenance line each (branch + spec path + one-line disposition; `BL-WATCH-DRIVE-CALL-TIMEOUT`'s notes that the watch-renewal PR closed the API-call half and this diff the credential half).
- [ ] **Step 3: Run** `pnpm exec vitest run tests/docs/`, then `pnpm spec:lint docs/superpowers/specs/2026-07-31-drive-timeout-cluster-design.md`, then `pnpm spec:lint docs/superpowers/plans/2026-07-31-drive-timeout-cluster.md` (one document per invocation — the CLI rejects two positionals; plan-review r1 F11) — PASS/0 hard each.
- [ ] **Step 4: Commit** `docs(plan): graduate the three drive-timeout backlog entries with registry coverage`

### Task 9: Gates

- [ ] Invariant-8 dual-gate on the UI diff (Step2Verify one-liner): `/impeccable critique` + `/impeccable audit` scoped to the affected diff, with the canonical v3 setup gates; P0/P1 fixed or DEFERRED.md'd. Findings + dispositions recorded in a `## 12. Invariant-8 close-out` section APPENDED TO THIS PLAN DOCUMENT (the durable handoff artifact for this non-milestone branch — AGENTS.md requires a §12 in the milestone's handoff doc, and this plan is that doc here; plan-review r1 F12), and summarized in the PR body.
- [ ] Post-append hygiene (plan-review r2 F3): after writing the §12 section, re-run `pnpm spec:lint docs/superpowers/plans/2026-07-31-drive-timeout-cluster.md` (0 hard) and commit the appended section as its own commit: `docs(plan): invariant-8 close-out for drive-timeout cluster`.
- [ ] Full local suite: `pnpm typecheck && pnpm lint && pnpm exec vitest run` (both default projects) — green before push.
- [ ] Snippet-typecheck note: plan snippets for Tasks 2/3/7 were compile-checked standalone against `--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes` during plan authoring; route-test snippets are contracts to be adapted to each file's existing harness idioms (stated inline).

### Task 10: Autonomous close-out pipeline (plan-review r2 F4 — the plan carries its own terminus)

- [ ] Whole-diff cross-model adversarial review (Codex, fresh-eyes, REVIEWER ONLY, split tight-scope briefs if the diff is large per AGENTS.md) — iterate to APPROVE; triage findings land-now / DEFERRED.md / BACKLOG.md.
- [ ] Push branch; open PR (merge-commit convention; PR body summarizes stages, review rounds, invariant-8 dispositions, and ends with the standard generated-with footer).
- [ ] REAL CI green on the GitHub Actions run (not just local); reconcile if DIRTY/behind-base before claiming green.
- [ ] `gh pr merge --merge` in the same turn CI goes green (never park a green PR).
- [ ] Fast-forward local main: `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only` then verify `git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main` prints `0	0`.
- [ ] Set ship-state marker `stage: "done"`, CronDelete the nudge job, clear the herdr pane label.

## Self-review + adversarial review

- Spec coverage: S1–S8 → Tasks 4/5/6; credential → Task 3; classifier → Task 2; guard → Task 7; graduations + master-spec amendment → Tasks 6/8; §12.4 lockstep → Task 6; invariant-8 → Task 9. AC-1..AC-7 each land in a named task.
- CI wiring: all new test files are under `tests/drive/` (parallel project glob `vitest.projects.ts:96`) or extend existing wired files; no workflow edits needed.
- Adversarial review (cross-model, Codex) follows this plan's self-review; iterate to APPROVE before implementation.

---

## 12. Invariant-8 close-out

Ran 2026-08-01 on the affected UI diff (one string in Step2Verify's RECOGNIZED_CODES set + the ONBOARDING_FOLDER_VERIFY_UNAVAILABLE catalog row it renders), canonical v3 setup gates (context.mjs PRODUCT.md load, product register), critique per the two-isolated-assessments contract.

**Critique:** PASS. Error-recovery heuristic 4/4; system-real-world match 4/4. Detector (Assessment B) ran clean on Step2Verify.tsx: zero findings; no browser run needed (zero layout/styling change, stated, not skipped silently). Findings and dispositions:

| Finding | Tier | Disposition |
|---|---|---|
| Hardcoded frame heading "We could not verify that folder." mildly redundant with the new copy, register mismatch (uncontracted) | P3 | ACCEPTED, not fixed: the frame is pre-existing and shared by ALL verify-failure codes; changing it is a copy decision across six codes, out of this diff's scope. |
| dougFacing says "try again" while helpfulContext says "click Verify again" | P3 | ACCEPTED, not fixed: harmless precision delta; the disclosure copy is deliberately more specific than the one-line message, same shape as sibling rows. |

**Audit:** zero findings across the diff surface (no em-dash in user copy; straight-apostrophe convention matches the catalog-wide 141-contraction pattern; no raw code in rendered DOM, code appears only in the helpHref fragment per the established row pattern; no hardcoded colors / side stripes / gradient text; no tap-target or layout deltas — the diff renders through the existing error container, which wraps multi-sentence copy without truncation).

P0/P1 count: zero. Nothing deferred to DEFERRED.md.

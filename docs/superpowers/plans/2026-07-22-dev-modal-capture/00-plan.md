# Dev-gated show-modal capture bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline — this is an autonomous ship-feature run; UI work is Opus-inline per ROUTING). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Developer-only capture button in both show review modals producing a downloaded zip (full-height modal screenshot + redacted telemetry JSON).

**Architecture:** Shared client capture module (`lib/devcapture/*` pure cores + `components/admin/dev/*` React shell) feeding a dev-gated read-only `"use server"` action that reuses the `lib/observe/query` read-core. Spec: `docs/superpowers/specs/2026-07-22-dev-modal-capture.md` (converged — §12 review record). Spec section references below (§n) point there.

**Tech Stack:** Next.js 16, React, Tailwind v4, fflate (installed), capture library chosen by Task 1 spike (html-to-image vs modern-screenshot vs html2canvas), Vitest (jsdom where noted), Playwright.

## Global Constraints

- Every task: failing test → minimal implementation → green → commit (`--no-verify`, conventional commits).
- New unit tests live under `tests/devcapture/` and `tests/admin/` — auto-discovered by `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`), serial project, no config edit needed. New e2e lives under `tests/e2e/` (Playwright, env-bound local).
- Copy rules: no em-dash in user-visible copy; exact strings from §7.2 (`Capturing the modal…` / `Capture failed. Details are in the browser console.`); label `Capture debug bundle`.
- Tap targets: `size-tap-min` / `min-h-tap-min` tokens.
- No `lib/log` import anywhere in `lib/devcapture/**` or the action; no direct Supabase calls outside the read-core.
- Strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) — snippets below were written against it; executor fixes residual type nits inside the task's own cycle, never by loosening config.
- Numeric literals: §10 of the spec is the single source. No new numbers.

## Meta-test inventory (declared)

- EXTENDS `tests/log/mutationSurface/exemptions.ts` — add `{ file: "app/admin/_devCaptureAction.ts", fn: "captureShowTelemetry", kind: "read-only" }` to `ADMIN_SURFACE_EXEMPTIONS` (Task 5). `tests/log/_metaMutationSurfaceObservability.test.ts` fails-by-default until the row lands — that failing state IS the task's failing test.
- COVERED-BY (no edit): `tests/observe/_metaReadOnlyQueryCore.test.ts` (read-core extensions stay select-only).
- Advisory locks: none touched (read-only feature) — no holder topology section needed.

## File structure

- `lib/devcapture/redact.ts` — pure value+key walk (email/hex/JWT, commitSha shape-gated exemption).
- `lib/devcapture/bundle.ts` — telemetry assembly + redaction + fflate zip + filename + download (objectURL lifecycle).
- `lib/devcapture/captureElement.ts` — DOM-to-image wrapper (library per spike).
- `components/admin/dev/DeveloperFlagContext.tsx` — provider + `useViewerIsDeveloper`.
- `components/admin/dev/snapshots.ts` — `buildPublishedSnapshot` / `buildStagedSnapshot` allowlists.
- `components/admin/dev/DevCaptureControl.tsx` — `useDevCapture` hook.
- `app/admin/_devCaptureAction.ts` — `"use server"` telemetry action.
- Modified: `lib/observe/query/types.ts`, `lib/observe/query/alerts.ts`, `lib/observe/query/failures.ts`, `app/admin/layout.tsx`, `components/admin/showpage/ShareHub.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`, `tests/log/mutationSurface/exemptions.ts`.

---

### Task 1: Capture-library spike (§3.3)

**Files:**
- Create: `docs/superpowers/plans/2026-07-22-dev-modal-capture/SPIKE.md`
- Create (temporary, committed with SPIKE.md, deleted in Task 7 if unused): `scripts/devcapture-spike.mjs`

**Interfaces:** Produces the library decision + exact clone-override list consumed by Task 7's `captureElement.ts`.

- [ ] **Step 1:** `pnpm add -D html-to-image modern-screenshot html2canvas` (all three as devDeps; winner promoted to `dependencies` in Task 7, losers removed).
- [ ] **Step 2:** Write `scripts/devcapture-spike.mjs` — Playwright chromium script that (a) boots `pnpm dev` (reuse the port/readiness pattern from `playwright.config.ts` webServer), (b) signs in via `tests/e2e/helpers/signInAs.ts` flow (POST `/api/test-auth/set-session`, `ENABLE_TEST_AUTH=true`), (c) seeds a published show via the existing e2e seed helper (`tests/e2e/helpers/seedShowWithCrew.ts`), (d) opens the published review modal, (e) for each candidate library: `page.addScriptTag` its IIFE/dist build, evaluate a capture of `[data-review-modal-panel]` twice — once as-is, once with clone-side overrides lifting `max-height`/`overflow` on the panel and the two inner panes (`ShowReviewSurface` rail + main pane) — and save PNGs to `scratch/spike/<lib>-{plain,expanded}.png`.
- [ ] **Step 3:** Evaluate per §3.3: (a) full-height expansion achievable, (b) CSS fidelity (`shadow-(--shadow-tile)`, `overflow-clip`, rounded corners, tokens — visual inspection of PNGs), (c) bundle cost (`npm view <lib> dist.unpackedSize` + minified size). Record a decision table + the exact clone-override list in `SPIKE.md`.
- [ ] **Step 4:** Commit: `git add docs/superpowers/plans/2026-07-22-dev-modal-capture/SPIKE.md scripts/devcapture-spike.mjs package.json pnpm-lock.yaml && git commit --no-verify -m "chore(admin): dev-modal-capture library spike findings"`

### Task 2: Redaction core (§4.5)

**Files:**
- Create: `lib/devcapture/redact.ts`
- Test: `tests/devcapture/redact.test.ts`

**Interfaces:** Produces `redactTelemetry(doc: unknown): unknown` (deep-copies; applies rules to every string value AND key; exempts `meta.commitSha`/`server.commitSha` from the hex rule only when exactly 40 hex). Consumed by Task 3.

- [ ] **Step 1: Failing test** — `tests/devcapture/redact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { redactTelemetry } from "@/lib/devcapture/redact";

const HEX64 = "a".repeat(32) + "b".repeat(32);
const HEX40 = "0123456789abcdef0123456789abcdef01234567";
const HEX32 = "c".repeat(32);
const HEX31 = "d".repeat(31);
const JWT = "eyJabc._payload-x.sig_y";

describe("redactTelemetry", () => {
  it("redacts emails, >=32-hex runs, and JWT shapes in nested string values", () => {
    const out = redactTelemetry({
      meta: { url: "https://x.test/admin" },
      clientSnapshot: {
        data: { deep: [{ note: `mail me at crew.member+1@example.co.uk today` }] },
        token: HEX64,
        boundary: HEX32,
        under: HEX31,
        jwt: `prefix ${JWT} suffix`,
      },
      server: {},
    }) as Record<string, never> & { clientSnapshot: Record<string, unknown> };
    const snap = out.clientSnapshot;
    expect(JSON.stringify(snap)).not.toContain("@example");
    expect(JSON.stringify(snap)).toContain("[email redacted]");
    expect(snap["token"]).toBe("[redacted]");
    expect(snap["boundary"]).toBe("[redacted]");
    expect(snap["under"]).toBe(HEX31);
    expect(snap["jwt"]).toBe("prefix [redacted] suffix");
  });

  it("applies the same rules to keys; legit identifiers survive", () => {
    const out = redactTelemetry({
      meta: {},
      clientSnapshot: {
        lastFinalizeFailureCodeUnrecognized: "ok",
        [HEX64]: "hexkey",
        ["contact: a@b.io"]: "emailkey",
      },
      server: {},
    }) as { clientSnapshot: Record<string, string> };
    expect(out.clientSnapshot["lastFinalizeFailureCodeUnrecognized"]).toBe("ok");
    expect(Object.keys(out.clientSnapshot)).not.toContain(HEX64);
    expect(Object.keys(out.clientSnapshot).some((k) => k.includes("@"))).toBe(false);
  });

  it("shape-gates the commitSha exemption at BOTH paths", () => {
    const out = redactTelemetry({
      meta: { commitSha: HEX40 },
      clientSnapshot: {},
      server: { commitSha: HEX40 },
    }) as { meta: { commitSha: string }; server: { commitSha: string } };
    expect(out.meta.commitSha).toBe(HEX40);
    expect(out.server.commitSha).toBe(HEX40);
    const planted = redactTelemetry({
      meta: { commitSha: HEX64 },
      clientSnapshot: {},
      server: { commitSha: HEX64 },
    }) as { meta: { commitSha: string }; server: { commitSha: string } };
    expect(planted.meta.commitSha).toBe("[redacted]");
    expect(planted.server.commitSha).toBe("[redacted]");
  });
});
```

- [ ] **Step 2:** `pnpm vitest run tests/devcapture/redact.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implementation** — `lib/devcapture/redact.ts`:

```ts
/**
 * lib/devcapture/redact.ts — §4.5 value-walk redaction for the dev capture
 * bundle. Pure; no imports. Applies three rules to every string VALUE and
 * every object KEY in the tree:
 *   1. email grammar        -> "[email redacted]"
 *   2. hex runs >= 32 chars -> "[redacted]"   (share token is 64-hex)
 *   3. JWT shape            -> "[redacted]"
 * Exemption (rule 2 only): meta.commitSha / server.commitSha when the value
 * is EXACTLY 40 hex chars (git SHA provenance).
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HEX_RE = /[0-9a-fA-F]{32,}/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const SHA40_RE = /^[0-9a-f]{40}$/i;

function redactString(s: string, hexExempt: boolean): string {
  let out = s.replace(EMAIL_RE, "[email redacted]").replace(JWT_RE, "[redacted]");
  if (!(hexExempt && SHA40_RE.test(s))) out = out.replace(HEX_RE, "[redacted]");
  return out;
}

function walk(node: unknown, path: readonly string[]): unknown {
  if (typeof node === "string") {
    const hexExempt =
      path.length === 2 &&
      (path[0] === "meta" || path[0] === "server") &&
      path[1] === "commitSha";
    return redactString(node, hexExempt);
  }
  if (Array.isArray(node)) return node.map((v, i) => walk(v, [...path, String(i)]));
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[redactString(k, false)] = walk(v, [...path, k]);
    }
    return out;
  }
  return node;
}

export function redactTelemetry(doc: unknown): unknown {
  return walk(doc, []);
}
```

- [ ] **Step 4:** `pnpm vitest run tests/devcapture/redact.test.ts` — PASS.
- [ ] **Step 5:** Commit `feat(admin): dev-capture redaction core`.

### Task 3: Bundle + filename + download core (§4, §4.3 pipeline steps 2-3, §4.5 order, §6)

**Files:**
- Create: `lib/devcapture/bundle.ts`
- Test: `tests/devcapture/bundle.test.ts` (jsdom for the download part — pragma `// @vitest-environment jsdom`)

**Interfaces:**
- Consumes `redactTelemetry` (Task 2).
- Produces:
  - `buildTelemetryDoc(input: { meta: TelemetryMeta; clientSnapshot: unknown; server: unknown }): unknown` — snapshot stringify→parse (drop functions), 1,000,000-char bound → `{ kind: "too_large", chars }`, throw → `{ kind: "unserializable", reason: "serialize_threw" }`, then `redactTelemetry` over the whole doc.
  - `zipBundle(png: Uint8Array, telemetryJson: string): Uint8Array` — fflate `zipSync`, entries exactly `screenshot.png` (level 0) + `telemetry.json`.
  - `bundleFilename(seed: string, now: Date): string` — sanitize `[^a-z0-9-]`, truncate 64, empty→`show`, stamp `YYYYMMDD-HHmmss` local.
  - `downloadBlob(bytes: Uint8Array, filename: string): void` — objectURL + anchor click; revoke in `finally`.
  - `type TelemetryMeta = { capturedAt: string; commitSha: string | null; url: string; userAgent: string; viewport: { w: number; h: number; dpr: number }; modalKind: "published" | "staged"; showId: string | null; driveFileId: string | null; panelRect: { w: number; h: number } }`.

- [ ] **Step 1: Failing tests** (complete file):

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildTelemetryDoc,
  zipBundle,
  bundleFilename,
  downloadBlob,
} from "@/lib/devcapture/bundle";

const META = {
  capturedAt: "2026-07-22T12:00:00.000Z",
  commitSha: null,
  url: "https://x.test/admin",
  userAgent: "ua",
  viewport: { w: 1280, h: 800, dpr: 2 },
  modalKind: "published" as const,
  showId: "00000000-0000-4000-8000-000000000000",
  driveFileId: null,
  panelRect: { w: 900, h: 700 },
};

describe("buildTelemetryDoc", () => {
  it("has exactly three top-level keys and an OBJECT snapshot (no double encoding)", () => {
    const doc = buildTelemetryDoc({
      meta: META,
      clientSnapshot: { a: 1, fn: () => 1 },
      server: { kind: "unavailable", reason: "network_error" },
    }) as Record<string, unknown>;
    expect(Object.keys(doc).sort()).toEqual(["clientSnapshot", "meta", "server"]);
    expect(typeof doc["clientSnapshot"]).toBe("object");
    expect(JSON.stringify(doc)).not.toContain('"fn"');
  });
  it("degrades an oversize snapshot to too_large", () => {
    const doc = buildTelemetryDoc({
      meta: META,
      clientSnapshot: { big: "x".repeat(1_000_001) },
      server: {},
    }) as { clientSnapshot: { kind: string } };
    expect(doc.clientSnapshot.kind).toBe("too_large");
  });
  it("degrades a throwing snapshot to unserializable and keeps going", () => {
    const cyc: Record<string, unknown> = {};
    cyc["self"] = cyc; // JSON.stringify throws
    const doc = buildTelemetryDoc({ meta: META, clientSnapshot: cyc, server: {} }) as {
      clientSnapshot: { kind: string; reason: string };
    };
    expect(doc.clientSnapshot).toEqual({ kind: "unserializable", reason: "serialize_threw" });
  });
});

describe("zipBundle", () => {
  it("round-trips exactly two byte-identical entries", () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const json = JSON.stringify({ ok: true });
    const entries = unzipSync(zipBundle(png, json));
    expect(Object.keys(entries).sort()).toEqual(["screenshot.png", "telemetry.json"]);
    expect(Array.from(entries["screenshot.png"] ?? new Uint8Array())).toEqual(Array.from(png));
    expect(strFromU8(entries["telemetry.json"] ?? new Uint8Array())).toBe(json);
  });
});

describe("bundleFilename", () => {
  const now = new Date(2026, 6, 22, 9, 5, 7); // local
  it("sanitizes, truncates to 64, stamps local time", () => {
    expect(bundleFilename("My Show! #2", now)).toBe("dev-capture-myshow2-20260722-090507.zip");
    const long = "a".repeat(70);
    expect(bundleFilename(long, now)).toBe(`dev-capture-${"a".repeat(64)}-20260722-090507.zip`);
    expect(bundleFilename("!!!", now)).toBe("dev-capture-show-20260722-090507.zip");
    expect(bundleFilename("ok", now)).toMatch(/^dev-capture-[a-z0-9-]+-\d{8}-\d{6}\.zip$/);
  });
});

describe("downloadBlob", () => {
  afterEach(() => vi.restoreAllMocks());
  it("revokes the created URL on success AND when the click throws", () => {
    const create = vi.fn(() => "blob:u1");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    downloadBlob(new Uint8Array([1]), "f.zip");
    expect(revoke).toHaveBeenCalledWith("blob:u1");
    click.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => downloadBlob(new Uint8Array([1]), "f.zip")).toThrow("boom");
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2:** Run — FAIL (module not found).
- [ ] **Step 3: Implementation** — `lib/devcapture/bundle.ts`:

```ts
/**
 * lib/devcapture/bundle.ts — telemetry assembly (§4), snapshot bounds (§4.3),
 * document-wide redaction ordering (§4.5), zip + filename + download (§6).
 * Client-only. No lib/log import (reading telemetry never writes it).
 */
import { zipSync } from "fflate";
import { redactTelemetry } from "@/lib/devcapture/redact";

export type TelemetryMeta = {
  capturedAt: string;
  commitSha: string | null;
  url: string;
  userAgent: string;
  viewport: { w: number; h: number; dpr: number };
  modalKind: "published" | "staged";
  showId: string | null;
  driveFileId: string | null;
  panelRect: { w: number; h: number };
};

const SNAPSHOT_CHAR_BOUND = 1_000_000; // §10

function normalizeSnapshot(snapshot: unknown): unknown {
  try {
    const s = JSON.stringify(snapshot, (_k, v: unknown) =>
      typeof v === "function" ? undefined : v,
    );
    if (s === undefined) return null;
    if (s.length > SNAPSHOT_CHAR_BOUND) return { kind: "too_large", chars: s.length };
    return JSON.parse(s) as unknown;
  } catch {
    return { kind: "unserializable", reason: "serialize_threw" };
  }
}

export function buildTelemetryDoc(input: {
  meta: TelemetryMeta;
  clientSnapshot: unknown;
  server: unknown;
}): unknown {
  return redactTelemetry({
    meta: input.meta,
    clientSnapshot: normalizeSnapshot(input.clientSnapshot),
    server: input.server,
  });
}

export function zipBundle(png: Uint8Array, telemetryJson: string): Uint8Array {
  return zipSync({
    "screenshot.png": [png, { level: 0 }],
    "telemetry.json": new TextEncoder().encode(telemetryJson),
  });
}

export function bundleFilename(seed: string, now: Date): string {
  const clean = seed.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64) || "show";
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1, 2)}${p(now.getDate(), 2)}-${p(
    now.getHours(),
    2,
  )}${p(now.getMinutes(), 2)}${p(now.getSeconds(), 2)}`;
  return `dev-capture-${clean}-${stamp}.zip`;
}

export function downloadBlob(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(admin): dev-capture bundle core`.

### Task 4: Read-core filter extensions (§4.2)

**Files:**
- Modify: `lib/observe/query/types.ts:17-22` (`AlertFilters` + `showIdOrGlobal?: string`), `lib/observe/query/types.ts:82-88` (`FailureFilters` + `driveFileId?: string`)
- Modify: `lib/observe/query/alerts.ts` (inside `queryAlerts`, after the existing filter chain, before `.limit`): `if (filters.showIdOrGlobal) query = query.or(\`show_id.eq.${filters.showIdOrGlobal},show_id.is.null\`);`
- Modify: `lib/observe/query/failures.ts` (same position): `if (filters.driveFileId) query = query.eq("drive_file_id", filters.driveFileId);`
- Test: `tests/devcapture/readCoreFilters.test.ts`

**Interfaces:** Produces the two optional filter fields consumed by Task 5. NOTE: match each file's existing builder-variable naming convention exactly (`alerts.ts` chains on its local builder; see the `_metaInfraContract` comment in `events.ts:64-79` about builder-name tracking before renaming anything).

- [ ] **Step 1: Failing test** — mock `createSupabaseServiceRoleClient` with a recording builder (copy the recording-builder shape from an existing read-core test under `tests/observe/` if present; otherwise):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<[string, ...unknown[]]> = [];
function makeBuilder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "in", "or", "ilike", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return m === "limit" ? Promise.resolve({ data: [], error: null, count: 0 }) : b;
    };
  }
  return b;
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({ from: () => makeBuilder() }),
}));

import { queryAlerts } from "@/lib/observe/query/alerts";
import { queryIngestFailures } from "@/lib/observe/query/failures";

describe("read-core capture filters", () => {
  beforeEach(() => calls.splice(0));
  it("showIdOrGlobal builds the show-or-global .or clause", async () => {
    await queryAlerts({ openOnly: true, limit: 101, showIdOrGlobal: "abc-id" });
    expect(calls).toContainEqual(["or", "show_id.eq.abc-id,show_id.is.null"]);
  });
  it("driveFileId builds .eq on drive_file_id", async () => {
    await queryIngestFailures({ limit: 101, driveFileId: "drive-1" });
    expect(calls).toContainEqual(["eq", "drive_file_id", "drive-1"]);
  });
});
```

(Executor: adjust the terminal-await shape to each file's real chain — `alerts.ts` ends `.order(...).limit(...)`; make the LAST chained method return the resolved `{ data, error }` promise. Verify against the live file first; the assertion targets `calls`, the data source, not the result.)

- [ ] **Step 2:** Run — FAIL (`or` never called / type error: unknown field).
- [ ] **Step 3:** Implement the two type fields + two filter branches.
- [ ] **Step 4:** Run new test + `pnpm vitest run tests/observe` — PASS (read-only meta-test still green).
- [ ] **Step 5:** Commit `feat(admin): read-core show-or-global and driveFileId capture filters`.

### Task 5: Telemetry server action (§5, §4.2) + exemption row (invariant 10)

**Files:**
- Create: `app/admin/_devCaptureAction.ts`
- Modify: `tests/log/mutationSurface/exemptions.ts:75` area (add row to `ADMIN_SURFACE_EXEMPTIONS`)
- Test: `tests/admin/devCaptureAction.test.ts`

**Interfaces:**
- Consumes Task 4 filters + `requireDeveloper` + read-core functions.
- Produces:

```ts
export type CaptureTelemetryRequest =
  | { kind: "published"; showId: string }
  | { kind: "staged"; driveFileId: string };
export type CaptureList<T> = { rows: T[]; truncated: boolean };
export type CaptureTelemetryResult =
  | { kind: "bad_request" }
  | { kind: "ok"; commitSha: string | null; events?: unknown; alerts?: CaptureList<unknown>;
      syncLog?: CaptureList<unknown>; staged?: CaptureList<unknown>; failures?: CaptureList<unknown> };
```

- [ ] **Step 1: Failing test** — `tests/admin/devCaptureAction.test.ts`. Mock `@/lib/auth/requireDeveloper` (spy `requireDeveloper`), mock the five read-core modules. Cases: (a) gate called first — read-core NOT called when request invalid (`{ kind: "published", showId: "not-a-uuid" }` → `bad_request`, zero read-core invocations); (b) published happy path — mocks return 101/51 rows → embedded 100/50 + `truncated: true`; exactly 100 → `truncated: false`; (c) `infra_error` sub-result embedded verbatim; (d) nested `warnings` array of 201 entries → capped 200 + `warningsTruncated: true`; (e) `VERCEL_GIT_COMMIT_SHA` env of 64-hex → `commitSha: null`; 40-hex → passed through (use `vi.stubEnv`); (f) staged path: `queryStagedParses` called with `{ driveFileId, sinceHours: 168, limit: 11 }`, failures with `driveFileId`.
- [ ] **Step 2:** Run — FAIL. Also run `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts` — FAIL (new unregistered `"use server"` surface) once the file exists in Step 3; that failure is the invariant-10 TDD signal.
- [ ] **Step 3: Implementation** — `app/admin/_devCaptureAction.ts`:

```ts
"use server";
/**
 * app/admin/_devCaptureAction.ts — §5 of the dev-modal-capture spec.
 * Developer-gated READ-ONLY telemetry pull for the capture bundle. Deliberately
 * NOT under app/admin/dev/ (that tree is build-gated aside in prod;
 * scripts/with-admin-dev-flag.mjs FILES list) — this surface ships to prod
 * for developer users. No lib/log import; no direct Supabase calls (read-core
 * only). Registered read-only in ADMIN_SURFACE_EXEMPTIONS (invariant 10).
 */
import { requireDeveloper } from "@/lib/auth/requireDeveloper";
import { queryEvents } from "@/lib/observe/query/events";
import { queryAlerts } from "@/lib/observe/query/alerts";
import { querySyncLog } from "@/lib/observe/query/syncLog";
import { queryStagedParses } from "@/lib/observe/query/staged";
import { queryIngestFailures } from "@/lib/observe/query/failures";

export type CaptureTelemetryRequest =
  | { kind: "published"; showId: string }
  | { kind: "staged"; driveFileId: string };
export type CaptureList<T> = { rows: T[]; truncated: boolean };
export type CaptureTelemetryResult =
  | { kind: "bad_request" }
  | {
      kind: "ok";
      commitSha: string | null;
      events?: unknown;
      alerts?: CaptureList<unknown>;
      syncLog?: CaptureList<unknown>;
      staged?: CaptureList<unknown>;
      failures?: CaptureList<unknown>;
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA40_RE = /^[0-9a-f]{40}$/i;
const SINCE_HOURS = 168; // §10
const WARNINGS_CAP = 200; // §10

function probeList<T>(rows: readonly T[], cap: number): CaptureList<T> {
  return { rows: rows.slice(0, cap) as T[], truncated: rows.length > cap };
}

function capNestedWarnings(row: unknown): unknown {
  if (row === null || typeof row !== "object") return row;
  const r = { ...(row as Record<string, unknown>) };
  for (const key of ["warnings", "lastWarnings"]) {
    const v = r[key];
    if (Array.isArray(v) && v.length > WARNINGS_CAP) {
      r[key] = v.slice(0, WARNINGS_CAP);
      r[`${key}Truncated`] = true;
    }
  }
  return r;
}

function envCommitSha(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha !== undefined && SHA40_RE.test(sha) ? sha : null;
}

export async function captureShowTelemetry(
  request: CaptureTelemetryRequest,
): Promise<CaptureTelemetryResult> {
  await requireDeveloper();
  if (request.kind === "published") {
    if (!UUID_RE.test(request.showId)) return { kind: "bad_request" };
    const [events, alerts, syncLog] = await Promise.all([
      queryEvents({ showId: request.showId, sinceHours: SINCE_HOURS }),
      queryAlerts({ openOnly: true, limit: 101, showIdOrGlobal: request.showId }),
      querySyncLog({ showId: request.showId, sinceHours: SINCE_HOURS, limit: 51 }),
    ]);
    return {
      kind: "ok",
      commitSha: envCommitSha(),
      events:
        events.kind === "ok"
          ? { rows: events.events, truncated: events.hasMore }
          : events,
      alerts:
        alerts.kind === "ok" ? probeList(alerts.alerts, 100) : (alerts as never),
      syncLog:
        syncLog.kind === "ok"
          ? probeList(syncLog.rows.map(capNestedWarnings), 50)
          : (syncLog as never),
    };
  }
  if (request.kind === "staged") {
    const id = request.driveFileId;
    if (id.length === 0 || id.length > 128) return { kind: "bad_request" };
    const [staged, failures] = await Promise.all([
      queryStagedParses({ driveFileId: id, sinceHours: SINCE_HOURS, limit: 11 }),
      queryIngestFailures({ sinceHours: SINCE_HOURS, limit: 101, driveFileId: id }),
    ]);
    return {
      kind: "ok",
      commitSha: envCommitSha(),
      staged:
        staged.kind === "ok"
          ? probeList(staged.rows.map(capNestedWarnings), 10)
          : (staged as never),
      failures:
        failures.kind === "ok"
          ? probeList(failures.rows.map(capNestedWarnings), 100)
          : (failures as never),
    };
  }
  return { kind: "bad_request" };
}
```

  (Result property names verified against `lib/observe/query/types.ts` at plan time: `events.events` (`events.ts:116`), `alerts.alerts` (`types.ts:37`), `syncLog.rows` (`types.ts:141`), `staged.rows` (`types.ts:79`), `failures.rows` (`types.ts:103`).)
- [ ] **Step 4:** Add the exemption row to `ADMIN_SURFACE_EXEMPTIONS` (after the `app/admin/dev/actions.ts` read-only rows, `exemptions.ts:75-76`): `{ file: "app/admin/_devCaptureAction.ts", fn: "captureShowTelemetry", kind: "read-only" },`
- [ ] **Step 5:** Run: new test PASS; `pnpm vitest run tests/log` PASS (discovery + read-only shape verification green).
- [ ] **Step 6:** Commit `feat(admin): dev-capture telemetry action with read-only exemption row`.

### Task 6: DeveloperFlagContext + layout wiring (§2.1)

**Files:**
- Create: `components/admin/dev/DeveloperFlagContext.tsx`
- Modify: `app/admin/layout.tsx` (wrap children with the provider; `viewerIsDeveloper` already resolved at `:77`)
- Test: `tests/devcapture/developerFlagContext.test.tsx` (jsdom)

**Interfaces:** Produces `DeveloperFlagProvider` + `useViewerIsDeveloper(): boolean` (no provider → `false`). Consumed by Tasks 7-8.

- [ ] **Step 1: Failing test:**

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DeveloperFlagProvider,
  useViewerIsDeveloper,
} from "@/components/admin/dev/DeveloperFlagContext";

function Probe() {
  return <span data-testid="flag">{String(useViewerIsDeveloper())}</span>;
}

describe("DeveloperFlagContext", () => {
  it("defaults false without a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("flag").textContent).toBe("false");
  });
  it("provides true", () => {
    render(
      <DeveloperFlagProvider viewerIsDeveloper={true}>
        <Probe />
      </DeveloperFlagProvider>,
    );
    expect(screen.getByTestId("flag").textContent).toBe("true");
  });
});
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement:

```tsx
"use client";
/**
 * components/admin/dev/DeveloperFlagContext.tsx — §2.1. Visibility-only
 * developer flag, resolved server-side in app/admin/layout.tsx via
 * isCurrentUserDeveloper() (fail-to-false) and provided panel-wide so deep
 * mounts (ShareHub kebab, Step3 header) need no prop drilling. NOT a
 * security gate — the capture action enforces requireDeveloper() itself.
 */
import { createContext, useContext, type ReactNode } from "react";

const DeveloperFlagContext = createContext<boolean>(false);

export function DeveloperFlagProvider(props: {
  viewerIsDeveloper: boolean;
  children: ReactNode;
}) {
  return (
    <DeveloperFlagContext.Provider value={props.viewerIsDeveloper}>
      {props.children}
    </DeveloperFlagContext.Provider>
  );
}

export function useViewerIsDeveloper(): boolean {
  return useContext(DeveloperFlagContext);
}
```

Layout edit: wrap the layout's returned children subtree with `<DeveloperFlagProvider viewerIsDeveloper={viewerIsDeveloper}>` (executor: locate the single return of the children region in `app/admin/layout.tsx` — wrap at the outermost point common to BOTH the full-nav branch and the slim onboarding branch so the wizard chain gets the flag too).
- [ ] **Step 4:** Run test + `pnpm build` sanity (client component imported from a server layout is a legal boundary). **Step 5:** Commit `feat(admin): developer flag context provided from admin layout`.

### Task 7: Capture element + snapshots + useDevCapture hook (§3, §4.3, §7)

**Files:**
- Create: `lib/devcapture/captureElement.ts` (library per SPIKE.md; promote winner to `dependencies`, `pnpm remove` the losers; delete `scripts/devcapture-spike.mjs`)
- Create: `components/admin/dev/snapshots.ts`
- Create: `components/admin/dev/DevCaptureControl.tsx`
- Test: `tests/devcapture/snapshots.test.ts`, `tests/devcapture/useDevCapture.test.tsx` (jsdom)

**Interfaces:**
- `captureElementPng(el: HTMLElement): Promise<Blob>` (§3.1; clone-based, expands panel + inner panes per SPIKE.md override list; DPR cap 2).
- `buildPublishedSnapshot(p: PublishedSnapshotInput): Record<string, unknown>` — allowlist §4.3 published (caps 50 + `attentionItemsTruncated`/`feedTruncated`); input type mirrors the data props of `PublishedReviewModalProps` (`PublishedReviewModal.tsx:77-123`), NEVER `crewEmails`/`pickerCrew`/functions/`now`.
- `buildStagedSnapshot(p: StagedSnapshotInput): Record<string, unknown>` — §4.3 staged; `resolution` omitted when absent, else `{ stagedId, reviewItemsCorrupt, isPublishRunActive, triggeredReviewItemCount }`.
- `useDevCapture(opts: { target: () => HTMLElement | null; request: CaptureTelemetryRequest; clientSnapshot: () => unknown; filenameSeed: string }): { state: "idle" | "busy" | "error"; run: () => void }` — §7 machine: concurrent capture+action, §4.5 reason classification, screenshot-reject ⇒ error, telemetry-reject ⇒ proceed, mounted-ref guard, 6 s error auto-clear with cleanup, busy no-reentry.

- [ ] **Step 1: Failing tests.** `snapshots.test.ts`: published fixture with `crewEmails`, `pickerCrew`, a function prop, 51 attentionItems + 51 feed entries → output lacks excluded keys, arrays len 50, both `*Truncated: true`; 50 exactly → no marker key. Staged fixture without `resolution` → key absent; with resolution (2 triggered items + callbacks) → the exact 4-field projection. `useDevCapture.test.tsx`: mock `captureElementPng`, mock action module, spy `downloadBlob`; assert the §7 matrix rows: no-reentry, screenshot-reject error + telemetry-success, telemetry-reject success with `server:{kind:"unavailable",reason:"network_error"}` and `meta.commitSha` null, `target()` null → error with capture util never called, unmount mid-busy → no download + timer cleared (fake timers) — the download spy also lets us assert the doc actually passed through `buildTelemetryDoc` (feed a fixture email in snapshot, assert redacted in the JSON handed to `zipBundle`). Write the assertions against the JSON string given to `zipBundle` (data-source, not UI).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement the three files. `useDevCapture` core shape:

```tsx
"use client";
/**
 * components/admin/dev/DevCaptureControl.tsx — §2.4/§7 shared orchestration.
 * State machine idle -> busy -> idle|error; all transitions instant (§7.4).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { captureShowTelemetry, type CaptureTelemetryRequest } from "@/app/admin/_devCaptureAction";
import { captureElementPng } from "@/lib/devcapture/captureElement";
import {
  buildTelemetryDoc,
  bundleFilename,
  downloadBlob,
  zipBundle,
  type TelemetryMeta,
} from "@/lib/devcapture/bundle";

export type DevCaptureState = "idle" | "busy" | "error";
const ERROR_AUTO_CLEAR_MS = 6000; // §10

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0; // §7.3 non-finite normalization
}

export function useDevCapture(opts: {
  target: () => HTMLElement | null;
  request: CaptureTelemetryRequest;
  clientSnapshot: () => unknown;
  filenameSeed: string;
}): { state: DevCaptureState; run: () => void } {
  const [state, setState] = useState<DevCaptureState>("idle");
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(() => {
    if (state === "busy") return;
    setState("busy");
    void (async () => {
      const el = opts.target();
      if (el === null) throw new Error("capture target unmounted");
      const rect = el.getBoundingClientRect();
      const [png, server] = await Promise.all([
        captureElementPng(el).then((b) => b.arrayBuffer()),
        captureShowTelemetry(opts.request).then(
          (r) =>
            r.kind === "ok"
              ? r
              : ({ kind: "unavailable", reason: r.kind === "bad_request" ? "bad_request" : "action_failed" } as const),
          () => ({ kind: "unavailable", reason: "network_error" }) as const,
        ),
      ]);
      const commitSha = "commitSha" in server ? server.commitSha : null;
      const meta: TelemetryMeta = {
        capturedAt: new Date().toISOString(),
        commitSha,
        url: `${location.origin}${location.pathname}`,
        userAgent: navigator.userAgent,
        viewport: {
          w: finite(window.innerWidth),
          h: finite(window.innerHeight),
          dpr: finite(window.devicePixelRatio),
        },
        modalKind: opts.request.kind,
        showId: opts.request.kind === "published" ? opts.request.showId : null,
        driveFileId: opts.request.kind === "staged" ? opts.request.driveFileId : null,
        panelRect: { w: finite(rect.width), h: finite(rect.height) },
      };
      const doc = buildTelemetryDoc({ meta, clientSnapshot: opts.clientSnapshot(), server });
      if (!mounted.current) return;
      downloadBlob(
        zipBundle(new Uint8Array(png), JSON.stringify(doc)),
        bundleFilename(opts.filenameSeed, new Date()),
      );
      if (mounted.current) setState("idle");
    })().catch((err: unknown) => {
      console.error("dev capture failed", err);
      if (!mounted.current) return;
      setState("error");
      timer.current = setTimeout(() => {
        if (mounted.current) setState("idle");
      }, ERROR_AUTO_CLEAR_MS);
    });
  }, [state, opts]);

  return { state, run };
}
```

  (`captureElementPng` implementation follows SPIKE.md exactly — chosen library call with the recorded clone-override list, `pixelRatio: Math.min(devicePixelRatio, 2)`.) `snapshots.ts` is two pure allowlist functions per the Interfaces block.
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat(admin): dev-capture element wrapper, snapshots, and orchestration hook`.

### Task 8: Host mounts — ShareHub row + lockout + status line; Step3 icon (§2.2, §2.3, §7)

**Files:**
- Modify: `components/admin/showpage/ShareHub.tsx` (dev row in the Show section of the popover; busy lockout on both `toggle` calls + `aria-disabled`; status line `share-hub-dev-capture-status` after the kebab button)
- Modify: `components/admin/wizard/Step3ReviewModal.tsx:417-448` (icon button between chip and close)
- Test: `tests/devcapture/hostMounts.test.tsx` (jsdom)

**Interfaces:** Consumes Tasks 6-7. ShareHub needs `slug`/`showId` (already props, `ShareHub.tsx:92-93`) for request+seed; snapshot inputs come from props already in scope at each mount — ShareHub's capture row receives its `clientSnapshot` and `target` via new OPTIONAL props `devCapture?: { snapshot: () => unknown }` threaded from `StatusStrip` (which PublishedReviewModal already feeds — executor: thread one optional prop `devCaptureSnapshot` PublishedReviewModal → StatusStrip → ShareHub, built with `buildPublishedSnapshot`; target resolves `document.querySelector('[data-review-modal-panel]')`). Step3 mount builds request `{ kind: "staged", driveFileId: dfid }`, seed `dfid`, snapshot `buildStagedSnapshot`, target `[data-step3-review-panel]`.

- [ ] **Step 1: Failing tests** (queries by testid only; §9.8): dev flag false/absent → `share-hub-dev-capture` and `wizard-step3-card-<dfid>-dev-capture` absent; true → present with 44px-token classes; busy (mock hook state) → both ShareHub toggles `aria-disabled="true"`, clicking kebab does NOT render `share-hub-popover`, status line shows `Capturing the modal…`; error → §7.2 error copy, gone after 6 s (fake timers); after settle → `aria-disabled` removed; staged icon `disabled` while busy.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement both mounts (row markup mirrors the mailto-row classes `ShareHub.tsx:455`; kebab activate handler: `setOpen(false)`, two `requestAnimationFrame`s, then `run()`).
- [ ] **Step 4:** Run + full `pnpm vitest run tests/devcapture tests/components tests/admin` — PASS.
- [ ] **Step 5:** Commit `feat(admin): dev capture mounts in ShareHub kebab and Step3 header`.

### Task 9: Real-browser sentinel proof + download e2e (§3.4, §9 e2e)

**Files:**
- Create: `tests/e2e/dev-capture.spec.ts`

**Interfaces:** Consumes everything. Uses `signInAs` (developer fixture = `ADMIN_FIXTURE`, non-dev = normal-admin fixture, `tests/e2e/helpers/fixtures.ts:38-48`), `seedShowWithCrew`.

- [ ] **Step 1:** Write spec: (a) developer session, published modal open, seed content so both inner panes overflow, inject two sentinel divs (distinct colors, via `page.evaluate` appending to rail + main pane ends), click kebab → `share-hub-dev-capture`, await Playwright `download` event, unzip in-test (fflate), decode PNG (`pngjs` devDep or raw-pixel via canvas in `page.evaluate` on an `<img>` of the blob), assert ≥1 pixel of EACH sentinel color, assert `telemetry.json` parses with the three top-level keys and `modalKind: "published"`; (b) same for staged modal via wizard route, `modalKind: "staged"`; (c) non-developer session → capture testids absent on both surfaces; (d) telemetry JSON string contains neither the seeded crew email nor the show's 64-hex share token (fetch the token via the seed helper's return, assert absent — the REAL token, not a fixture).
- [ ] **Step 2:** Run at ≥lg viewport (`page.setViewportSize({ width: 1280, height: 800 })`); gate env-bound like sibling admin specs. Expected: FAIL before Tasks 7-8 wiring nits are fixed, PASS after.
- [ ] **Step 3:** Commit `test(admin): dev-capture sentinel and download e2e`.

### Task 10: Impeccable dual-gate (invariant 8)

- [ ] Run `/impeccable critique` then `/impeccable audit` on the UI diff (ShareHub, Step3ReviewModal, layout, DeveloperFlagContext, DevCaptureControl). Fix P0/P1 or defer via `DEFERRED.md` entry. Commit fixes as `fix(admin): impeccable findings on dev capture surfaces`.

### Task 11: Full local gates + transition audit

- [ ] `pnpm test` (full suite) — green; `pnpm typecheck` — green; `pnpm lint` (eslint) — green; `pnpm format:check` — green; `pnpm build` — green.
- [ ] Transition audit (§7.4): `rg "AnimatePresence|motion\." lib/devcapture components/admin/dev` → zero hits; grep the ShareHub/Step3 diff hunks for conditional renders and confirm each is in the §7.4 inventory (all instant).
- [ ] Commit any residue `chore(admin): dev-capture close-out gates`.

## Self-review record

- Spec coverage: §2.1→T6; §2.2/§2.3/§7→T8; §2.4/§3/§4.3-hook→T7; §3.3→T1; §3.4/e2e→T9; §4.5→T2; §4/§6→T3; §4.2→T4+T5; §5/inv-10→T5; inv-8→T10; §9 gates→per-task + T11. No uncovered section.
- Type consistency: `CaptureTelemetryRequest`/`CaptureList`/`TelemetryMeta` defined once (T3/T5), consumed by name in T7; `useDevCapture` signature identical in T7 interface and code.
- Snippet typecheck: `redact.ts` and `bundle.ts` snippets typechecked standalone against the repo tsconfig during plan drafting (see plan commit); action snippet carries an executor verification note for read-core result property names (deliberate — verify-not-invent).
- Known risk: T4's mocked-builder test shape must match each file's real chain; the executor instruction to verify first is explicit.

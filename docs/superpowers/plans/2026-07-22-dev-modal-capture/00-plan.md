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

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- `lib/devcapture/redact.ts` — pure value+key walk (email/hex/JWT, commitSha shape-gated exemption).
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- `lib/devcapture/bundle.ts` — telemetry assembly + redaction + fflate zip + filename + download (objectURL lifecycle).
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- `lib/devcapture/captureElement.ts` — DOM-to-image wrapper (library per spike).
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- `components/admin/dev/DeveloperFlagContext.tsx` — provider + `useViewerIsDeveloper`.
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- `components/admin/dev/snapshots.ts` — `buildPublishedSnapshot` / `buildStagedSnapshot` allowlists.
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- `components/admin/dev/DevCaptureControl.tsx` — `useDevCapture` hook.
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- `app/admin/_devCaptureAction.ts` — `"use server"` telemetry action.
- Modified: `lib/observe/query/types.ts`, `lib/observe/query/alerts.ts`, `lib/observe/query/failures.ts`, `app/admin/layout.tsx`, `components/admin/showpage/ShareHub.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`, `tests/log/mutationSurface/exemptions.ts`.

---

### Task 1: Capture-library spike (§3.3)

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `docs/superpowers/plans/2026-07-22-dev-modal-capture/SPIKE.md`
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create (temporary, committed with SPIKE.md, deleted in Task 7): `scripts/devcapture-spike.mts` (TypeScript; run with `pnpm exec tsx scripts/devcapture-spike.mts` — tsx is the repo's script runner, same as `pnpm observe`'s `scripts/observe.ts`, so the TS helpers `signInAs.ts` / `seedShowWithCrew.ts` import directly with no separate transpilation step)
- Modify: `package.json` + `pnpm-lock.yaml` (three candidate devDeps)

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
**Interfaces:** Produces the library decision + exact clone-override list consumed by Task 7's `captureElement.ts`.

- [ ] **Step 1:** `pnpm add -D html-to-image modern-screenshot html2canvas` (all three as devDeps; winner promoted to `dependencies` in Task 7, losers removed).
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 2:** Write `scripts/devcapture-spike.mts` — Playwright chromium script that (a) boots `pnpm dev` (reuse the port/readiness pattern from `playwright.config.ts` webServer), (b) calls `deleteFixtureUsers()` FIRST (the set-session endpoint is create-only — `signInAs.ts:12` requires the wipe before each sign-in) then signs in via the `signInAs` helper (POST `/api/test-auth/set-session`, `ENABLE_TEST_AUTH=true`), (c) seeds a published show via the existing e2e seed helper (`tests/e2e/helpers/seedShowWithCrew.ts`), (d) opens the published review modal, (e) for each candidate library: `page.addScriptTag` its IIFE/dist build — and when a candidate ships no injectable browser artifact (ESM-only), bundle one first with `pnpm exec esbuild node_modules/<lib>/dist/index.js --bundle --format=iife --global-name=<libGlobal> --outfile=scratch/spike/<lib>.iife.js` (precedent: `tests/e2e/_step3ReviewModalBundle.mjs`) — evaluate a capture of `[data-review-modal-panel]` twice — once as-is, once with clone-side overrides lifting `max-height`/`overflow` on the panel and the two inner panes (`ShowReviewSurface` rail + main pane) — and save PNGs to `scratch/spike/<lib>-{plain,expanded}.png`.
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 3:** Execute: `pnpm exec tsx scripts/devcapture-spike.mts` (expected: six PNGs written under `scratch/spike/`). Evaluate per §3.3 FROM THAT RUN'S OUTPUT (SPIKE.md records the exact command and pastes the run's stdout summary alongside the decision table): (a) full-height expansion achievable, (b) CSS fidelity (`shadow-(--shadow-tile)`, `overflow-clip`, rounded corners, tokens — visual inspection of PNGs), (c) bundle cost (`npm view <lib> dist.unpackedSize` + minified size). Record a decision table + the exact clone-override list in `SPIKE.md`.
- [ ] **Step 4:** Commit: `git add docs/superpowers/plans/2026-07-22-dev-modal-capture/SPIKE.md scripts/devcapture-spike.mjs package.json pnpm-lock.yaml && git commit --no-verify -m "chore(admin): dev-modal-capture library spike findings"`

### Task 2: Redaction core (§4.5)

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `lib/devcapture/redact.ts`
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Test: `tests/devcapture/redact.test.ts`

**Interfaces:** Produces `redactTelemetry(doc: unknown): unknown` (deep-copies; applies rules to every string value AND key; exempts `meta.commitSha`/`server.commitSha` from the hex rule only when exactly 40 hex). Consumed by Task 3.

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
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

  it("applies rules in spec order (email, hex, JWT) on overlapping shapes", () => {
    // A JWT whose middle segment is a 32-hex run: hex rule (2) fires inside it
    // before the JWT rule (3) sees the whole; the final string must contain no
    // hex run and no JWT shape either way - order pinned by exact output.
    const overlap = `eyJhead.${"a".repeat(32)}.tail0`;
    const out = redactTelemetry({ meta: {}, clientSnapshot: { overlap }, server: {} }) as {
      clientSnapshot: { overlap: string };
    };
    expect(out.clientSnapshot.overlap).toBe("eyJhead.[redacted].tail0");
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
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 3: Implementation** — `lib/devcapture/redact.ts`:

```ts
/**
 * lib/devcapture/redact.ts - §4.5 value-walk redaction for the dev capture
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
  // §4.5 rule order is fixed: email (1), hex (2), JWT (3).
  let out = s.replace(EMAIL_RE, "[email redacted]");
  if (!(hexExempt && SHA40_RE.test(s))) out = out.replace(HEX_RE, "[redacted]");
  return out.replace(JWT_RE, "[redacted]");
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
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `lib/devcapture/bundle.ts`
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Test: `tests/devcapture/bundle.test.ts` (jsdom for the download part — pragma `// @vitest-environment jsdom`)

**Interfaces:**
- Consumes `redactTelemetry` (Task 2).
- Produces:
  - `buildTelemetryDoc(input: { meta: TelemetryMeta; clientSnapshot: unknown; server: unknown }): unknown` — snapshot stringify→parse (drop functions), 1,000,000-char bound → `{ kind: "too_large", chars }`, throw → `{ kind: "unserializable", reason: "serialize_threw" }`, then `redactTelemetry` over the whole doc.
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
  - `zipBundle(png: Uint8Array, telemetryJson: string): Uint8Array` — fflate `zipSync`, entries exactly `screenshot.png` (level 0) + `telemetry.json`.
  - `bundleFilename(seed: string, now: Date): string` — sanitize `[^a-z0-9-]`, truncate 64, empty→`show`, stamp `YYYYMMDD-HHmmss` local.
  - `downloadBlob(bytes: Uint8Array, filename: string, shouldClick?: () => boolean): void` — creates the objectURL, clicks ONLY if `shouldClick?.() !== false` (the hook passes `() => mounted.current`, implementing §6's unmount-between-create-and-click path), revokes in `finally` on every path (success, click-throw, skipped click).
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
  it("revokes on success, on click-throw, and on skipped click (shouldClick false)", () => {
    const create = vi.fn(() => "blob:u1");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    downloadBlob(new Uint8Array([1]), "f.zip");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:u1");
    click.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => downloadBlob(new Uint8Array([1]), "f.zip")).toThrow("boom");
    expect(revoke).toHaveBeenCalledTimes(2);
    click.mockImplementation(() => undefined);
    downloadBlob(new Uint8Array([1]), "f.zip", () => false); // owner unmounted
    expect(click).toHaveBeenCalledTimes(2); // NOT called a third time
    expect(revoke).toHaveBeenCalledTimes(3); // still revoked
  });
});
```

- [ ] **Step 2:** Run — FAIL (module not found).
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 3: Implementation** — `lib/devcapture/bundle.ts`:

```ts
/**
 * lib/devcapture/bundle.ts - telemetry assembly (§4), snapshot bounds (§4.3),
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

export function downloadBlob(
  bytes: Uint8Array,
  filename: string,
  shouldClick?: () => boolean,
): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
  try {
    if (shouldClick?.() === false) return; // owner unmounted between create and click (§6)
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
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Test: `tests/devcapture/readCoreFilters.test.ts`

**Interfaces:** Produces the two optional filter fields consumed by Task 5. NOTE: match each file's existing builder-variable naming convention exactly (`alerts.ts` chains on its local builder; see the `_metaInfraContract` comment in `events.ts:64-79` about builder-name tracking before renaming anything).

- [ ] **Step 1: Failing test** — mock `createSupabaseServiceRoleClient` with a recording builder (copy the recording-builder shape from an existing read-core test under `tests/observe/` if present; otherwise):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<[string, ...unknown[]]> = [];
function makeBuilder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "in", "or", "ilike", "is", "order", "limit"]) {
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

(Builder method list includes `is` — `queryAlerts({ openOnly: true })` chains `.is("resolved_at", null)`. Executor: verify each file's real chain FIRST (`rg '\.(is|or|eq|order|limit)\(' lib/observe/query/alerts.ts lib/observe/query/failures.ts`) and make the file's LAST chained method return the resolved `{ data, error, count }` promise; if a chain method is missing from the mock the test dies on TypeError instead of proving the filter — that is a mock bug, fix the mock. The assertion targets `calls`, the data source, not the result.)

- [ ] **Step 2:** Run — FAIL (`or` never called / type error: unknown field).
- [ ] **Step 3:** Implement the two type fields + two filter branches.
- [ ] **Step 4:** Run new test + `pnpm vitest run tests/observe` — PASS (read-only meta-test still green).
- [ ] **Step 5:** Commit `feat(admin): read-core show-or-global and driveFileId capture filters`.

### Task 5: Telemetry server action (§5, §4.2) + exemption row (invariant 10)

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `app/admin/_devCaptureAction.ts`
- Modify: `tests/log/mutationSurface/exemptions.ts:75` area (add row to `ADMIN_SURFACE_EXEMPTIONS`)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Test: `tests/admin/devCaptureAction.test.ts`

**Interfaces:**
- Consumes Task 4 filters + `requireDeveloper` + read-core functions.
- Produces:

```ts
export type CaptureTelemetryRequest =
  | { kind: "published"; showId: string }
  | { kind: "staged"; driveFileId: string };
export type CaptureList<T> = { rows: T[]; truncated: boolean };
export type CaptureInfraError = { kind: "infra_error"; message: string };
export type CaptureSection<T> = CaptureList<T> | CaptureInfraError; // §4.2 verbatim infra_error embedding
export type CaptureTelemetryResult =
  | { kind: "bad_request" }
  | { kind: "ok"; commitSha: string | null;
      events?: CaptureSection<unknown>;  // events truncated = read-core hasMore
      alerts?: CaptureSection<unknown>; syncLog?: CaptureSection<unknown>;
      staged?: CaptureSection<unknown>; failures?: CaptureSection<unknown> };
```

Runtime validation is fail-closed via an explicit shape guard (`parseRequest`), never the TS union alone.

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 1: Failing test** — `tests/admin/devCaptureAction.test.ts`. Mock `@/lib/auth/requireDeveloper` (spy `requireDeveloper`), mock the five read-core modules. Full matrix:
  - (a) **Gate-first, both directions:** gate mock REJECTS (forbidden) → action rejects AND zero read-core calls; gate resolves + invalid request → `bad_request` with zero read-core calls (gate still called exactly once, asserted via call order: gate spy invoked before any read-core spy).
  - (b) **Fail-closed shape guard** (each returns `bad_request`, zero read-core calls): `null`, `undefined`, `42`, `{}`, `{ kind: "published" }` (missing showId), `{ kind: "published", showId: "not-a-uuid" }`, `{ kind: "staged" }`, `{ kind: "staged", driveFileId: 7 }`, `{ kind: "staged", driveFileId: "" }`, `{ kind: "staged", driveFileId: "x".repeat(129) }`, `{ kind: "other" }`, `{ kind: "published", showId: <valid-uuid>, extra: 1 }` (extra key), `{ kind: "published", showId: <valid-uuid>, driveFileId: "x" }` (hybrid), `Object.create({ kind: "published", showId: <valid-uuid> })` (inherited-only props → no own keys → rejected). (Cast through `unknown` to bypass TS.)
  - (c) **Probe-row truncation, all four lists × three cases:** cap+1 rows → embedded length == cap AND `truncated: true`; exactly cap → `truncated: false`; fewer → `truncated: false`. Caps: alerts 100, syncLog 50, staged 10, failures 100.
  - (d) **Events mapping:** read-core `{ kind: "ok", events: [...], hasMore: true }` → embedded `{ rows, truncated: true }`; `hasMore: false` → `truncated: false`.
  - (e) **infra_error embedding, all five:** each of events/alerts/syncLog/staged/failures independently returning `{ kind: "infra_error", message }` is embedded verbatim while siblings stay `ok`.
  - (f) **Nested warnings caps, exact spec surface:** staged row `warnings` of 201 → capped 200 + sibling `warningsTruncated: true`; failures row `lastWarnings` of 201 → capped 200 + sibling `warningsTruncated: true` (marker name IS `warningsTruncated` for both, spec §4.2); syncLog rows pass through UNTRANSFORMED (no cap, no marker — §4.2 enumerates only the two arrays).
  - (g) **commitSha env gate:** 64-hex env → `null`; 40-hex → passed through; unset → `null` (`vi.stubEnv`).
  - (h) **Filter plumbing (every argument pinned):** events called with `{ showId, sinceHours: 168 }`; alerts with `{ openOnly: true, limit: 101, showIdOrGlobal: showId }`; syncLog with `{ showId, sinceHours: 168, limit: 51 }`; staged with `{ driveFileId, sinceHours: 168, limit: 11 }`; failures with `{ sinceHours: 168, limit: 101, driveFileId }`. Assert the exact object per call (drift in show scoping or time bound fails the test).
- [ ] **Step 2:** Run — FAIL (module not found). (The invariant-10 meta-test sequencing lives in Step 4/5: the moment Step 3 creates the `"use server"` file, `tests/log/_metaMutationSurfaceObservability.test.ts` goes red — run it then to OBSERVE the red — and Step 4's registry row turns it green. That red-then-green pair is the invariant-10 proof; it cannot precede file creation and the plan does not pretend otherwise.)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 3: Implementation** — `app/admin/_devCaptureAction.ts`:

```ts
"use server";
/**
 * app/admin/_devCaptureAction.ts - §5 of the dev-modal-capture spec.
 * Developer-gated READ-ONLY telemetry pull for the capture bundle. Deliberately
 * NOT under app/admin/dev/ (that tree is build-gated aside in prod;
 * scripts/with-admin-dev-flag.mjs FILES list) - this surface ships to prod
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
export type CaptureInfraError = { kind: "infra_error"; message: string };
export type CaptureSection<T> = CaptureList<T> | CaptureInfraError;
export type CaptureTelemetryResult =
  | { kind: "bad_request" }
  | {
      kind: "ok";
      commitSha: string | null;
      events?: CaptureSection<unknown>;
      alerts?: CaptureSection<unknown>;
      syncLog?: CaptureSection<unknown>;
      staged?: CaptureSection<unknown>;
      failures?: CaptureSection<unknown>;
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA40_RE = /^[0-9a-f]{40}$/i;
const SINCE_HOURS = 168; // §10
const WARNINGS_CAP = 200; // §10

function parseRequest(input: unknown): CaptureTelemetryRequest | null {
  // Exact-shape guard: OWN keys must be exactly the union variant's keys (§5
  // fail-closed - extra keys, hybrid objects, and prototype-inherited matches
  // are all rejected).
  if (input === null || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const keys = Object.keys(r).sort();
  if (
    keys.length === 2 &&
    keys[0] === "kind" &&
    keys[1] === "showId" &&
    r["kind"] === "published" &&
    typeof r["showId"] === "string" &&
    UUID_RE.test(r["showId"])
  ) {
    return { kind: "published", showId: r["showId"] };
  }
  if (
    keys.length === 2 &&
    keys[0] === "driveFileId" &&
    keys[1] === "kind" &&
    r["kind"] === "staged" &&
    typeof r["driveFileId"] === "string" &&
    r["driveFileId"].length > 0 &&
    r["driveFileId"].length <= 128
  ) {
    return { kind: "staged", driveFileId: r["driveFileId"] };
  }
  return null;
}

function probeList<T>(rows: readonly T[], cap: number): CaptureList<T> {
  return { rows: rows.slice(0, cap) as T[], truncated: rows.length > cap };
}

/** §4.2: cap EXACTLY the enumerated nested arrays; the sibling marker is
 * `warningsTruncated` for both (staged `warnings`, failure `lastWarnings`). */
function capNestedWarnings(row: unknown, key: "warnings" | "lastWarnings"): unknown {
  if (row === null || typeof row !== "object") return row;
  const r = { ...(row as Record<string, unknown>) };
  const v = r[key];
  if (Array.isArray(v) && v.length > WARNINGS_CAP) {
    r[key] = v.slice(0, WARNINGS_CAP);
    r["warningsTruncated"] = true;
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
  const parsed = parseRequest(request);
  if (parsed === null) return { kind: "bad_request" };
  if (parsed.kind === "published") {
    const [events, alerts, syncLog] = await Promise.all([
      queryEvents({ showId: parsed.showId, sinceHours: SINCE_HOURS }),
      queryAlerts({ openOnly: true, limit: 101, showIdOrGlobal: parsed.showId }),
      querySyncLog({ showId: parsed.showId, sinceHours: SINCE_HOURS, limit: 51 }),
    ]);
    return {
      kind: "ok",
      commitSha: envCommitSha(),
      events:
        events.kind === "ok" ? { rows: events.events, truncated: events.hasMore } : events,
      alerts: alerts.kind === "ok" ? probeList(alerts.alerts, 100) : alerts,
      syncLog: syncLog.kind === "ok" ? probeList(syncLog.rows, 50) : syncLog,
    };
  }
  const [staged, failures] = await Promise.all([
    queryStagedParses({ driveFileId: parsed.driveFileId, sinceHours: SINCE_HOURS, limit: 11 }),
    queryIngestFailures({ sinceHours: SINCE_HOURS, limit: 101, driveFileId: parsed.driveFileId }),
  ]);
  return {
    kind: "ok",
    commitSha: envCommitSha(),
    staged:
      staged.kind === "ok"
        ? probeList(staged.rows.map((r) => capNestedWarnings(r, "warnings")), 10)
        : staged,
    failures:
      failures.kind === "ok"
        ? probeList(failures.rows.map((r) => capNestedWarnings(r, "lastWarnings")), 100)
        : failures,
  };
}
```

  (Result property names verified against `lib/observe/query/types.ts` at plan time: `events.events` (`events.ts:116`), `alerts.alerts` (`types.ts:37`), `syncLog.rows` (`types.ts:141`), `staged.rows` (`types.ts:79`), `failures.rows` (`types.ts:103`).)
- [ ] **Step 4:** Add the exemption row to `ADMIN_SURFACE_EXEMPTIONS` (after the `app/admin/dev/actions.ts` read-only rows, `exemptions.ts:75-76`): `{ file: "app/admin/_devCaptureAction.ts", fn: "captureShowTelemetry", kind: "read-only" },`
- [ ] **Step 5:** Run: new test PASS; `pnpm vitest run tests/log` PASS (discovery + read-only shape verification green).
- [ ] **Step 6:** Commit `feat(admin): dev-capture telemetry action with read-only exemption row`.

### Task 6: DeveloperFlagContext + layout wiring (§2.1)

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `components/admin/dev/DeveloperFlagContext.tsx`
- Modify: `app/admin/layout.tsx` (wrap children with the provider; `viewerIsDeveloper` already resolved at `app/admin/layout.tsx:77`)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
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
 * components/admin/dev/DeveloperFlagContext.tsx - §2.1. Visibility-only
 * developer flag, resolved server-side in app/admin/layout.tsx via
 * isCurrentUserDeveloper() (fail-to-false) and provided panel-wide so deep
 * mounts (ShareHub kebab, Step3 header) need no prop drilling. NOT a
 * security gate - the capture action enforces requireDeveloper() itself.
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
- [ ] **Step 4:** Run test + `pnpm build` sanity (client component imported from a server layout is a legal boundary). TDD honesty note: the unit test proves the CONTEXT only; the layout WIRING has no jsdom-reachable proof (server layout) — its executable proof is Task 9's dev/non-dev e2e, which flows through the real layout, plus the build. Declared here, not pretended otherwise. **Step 5:** Commit `feat(admin): developer flag context provided from admin layout`.

### Task 7: Capture element + snapshots + useDevCapture hook (§3, §4.3, §7)

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `lib/devcapture/captureElement.ts` (library per SPIKE.md)
- Modify: `package.json` + `pnpm-lock.yaml` (promote winner to `dependencies`, `pnpm remove` losing devDeps)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Delete: `scripts/devcapture-spike.mts`
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `components/admin/dev/snapshots.ts`
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `components/admin/dev/DevCaptureControl.tsx`
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Test: `tests/devcapture/snapshots.test.ts`, `tests/devcapture/useDevCapture.test.tsx` (jsdom)

**Interfaces:**
- `captureElementPng(el: HTMLElement): Promise<Blob>` (§3.1; clone-based, expands panel + inner panes per SPIKE.md override list; DPR cap 2).
- `buildPublishedSnapshot(p: PublishedSnapshotInput): Record<string, unknown>` — allowlist §4.3 published (caps 50 + `attentionItemsTruncated`/`feedTruncated`); input type mirrors the data props of `PublishedReviewModalProps` (`PublishedReviewModal.tsx:77-123`), NEVER `crewEmails`/`pickerCrew`/functions/`now`.
- `buildStagedSnapshot(p: StagedSnapshotInput): Record<string, unknown>` — §4.3 staged; `resolution` omitted when absent, else `{ stagedId, reviewItemsCorrupt, isPublishRunActive, triggeredReviewItemCount }`.
- `useDevCapture(opts: { target: () => HTMLElement | null; request: CaptureTelemetryRequest; clientSnapshot: () => unknown; filenameSeed: string; preCapture?: () => Promise<void> }): { state: "idle" | "busy" | "error"; run: () => void }` — `run()` enters `busy` SYNCHRONOUSLY (inFlight ref + setState before any await; spec §2.2 amendment #2), then awaits `preCapture` (ShareHub passes popover-close + two-rAF here) INSIDE the busy window, then captures — §7 machine: concurrent capture+action, §4.5 reason classification, screenshot-reject ⇒ error, telemetry-reject ⇒ proceed, mounted-ref guard, 6 s error auto-clear with cleanup, busy no-reentry.

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 1: Failing tests.** `snapshots.test.ts`: published fixture with `crewEmails`, `pickerCrew`, a function prop, 51 attentionItems + 51 feed entries → output lacks excluded keys, arrays len 50, both `*Truncated: true`; 50 exactly → no marker key. Staged fixture without `resolution` → key absent; with resolution (2 triggered items + callbacks) → the exact 4-field projection. `useDevCapture.test.tsx` (mock `captureElementPng` and the ACTION module; use the REAL `bundle.ts` with spies on `URL.createObjectURL`/`revokeObjectURL` and `HTMLAnchorElement.prototype.click` so download/revocation are proven at hook level, not mocked away) — full §7 matrix:
  - single-flight: two synchronous `run()` calls in one tick → `captureElementPng` invoked once (inFlight-ref proof, not state-closure);
  - concurrency: deferred capture + deferred action; assert BOTH were invoked before either resolves;
  - screenshot-reject ⇒ error even when telemetry resolved ok;
  - telemetry rejection ⇒ success, `server: { kind: "unavailable", reason: "network_error" }`, `meta.commitSha` null;
  - resolved `{ kind: "bad_request" }` ⇒ reason `"bad_request"`; resolved `null`, resolved `undefined`, and resolved `{ junk: 1 }` ⇒ reason `"action_failed"` (no throw);
  - resolved `{ kind: "ok" }` WITHOUT `commitSha` ⇒ success, `meta.commitSha` null (guarded access — malformed ok tolerated as diagnostic passthrough, documented);
  - `clientSnapshot()` throwing ⇒ run still SUCCEEDS with `clientSnapshot: { kind: "unserializable", reason: "serialize_threw" }`;
  - `target()` null ⇒ error state, `captureElementPng` never called;
  - published request ⇒ `meta.driveFileId === null`; staged request ⇒ `meta.showId === null`;
  - `meta.url` from a stubbed `location` with query+hash contains neither;
  - NaN/Infinity stubs for `innerWidth`/`devicePixelRatio`/rect ⇒ 0 in `meta`;
  - error → rerun before the 6 s timer fires ⇒ old timer cleared (advance timers past 6 s mid-second-run; state stays `busy`);
  - unmount while `error` timer active ⇒ timer cleared, no late setState (fake timers + act warnings clean);
  - unmount mid-busy ⇒ anchor click NOT called, `revokeObjectURL` STILL called with the created URL;
  - error auto-clear: error state transitions to idle after exactly 6 s untouched (fake timers);
  - Strict Mode: render the host under `<StrictMode>`, run a happy-path capture ⇒ download fires (mounted-ref survives the setup→cleanup→setup replay);
  - happy path ⇒ click called, revoke called;
  - redaction integration: fixture email in snapshot ⇒ absent from the JSON string handed to the zip (assert via the blob bytes passed to `createObjectURL`'s Blob or by spying `zipBundle`) — data-source assertion.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement the three files. `useDevCapture` core shape:

```tsx
"use client";
/**
 * components/admin/dev/DevCaptureControl.tsx - §2.4/§7 shared orchestration.
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

/** §4.5 deterministic reason classification for a RESOLVED action result. */
function classifyResolved(
  r: unknown,
): { kind: "ok"; [k: string]: unknown } | { kind: "unavailable"; reason: "bad_request" | "action_failed" } {
  if (r !== null && typeof r === "object" && "kind" in r) {
    const k = (r as { kind: unknown }).kind;
    if (k === "ok") return r as { kind: "ok" };
    if (k === "bad_request") return { kind: "unavailable", reason: "bad_request" };
  }
  return { kind: "unavailable", reason: "action_failed" }; // null/undefined/junk resolved shapes
}

export function useDevCapture(opts: {
  target: () => HTMLElement | null;
  request: CaptureTelemetryRequest;
  clientSnapshot: () => unknown;
  filenameSeed: string;
  preCapture?: () => Promise<void>;
}): { state: DevCaptureState; run: () => void } {
  const [state, setState] = useState<DevCaptureState>("idle");
  const inFlight = useRef(false); // SYNCHRONOUS single-flight guard (state alone races two same-tick runs)
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true; // Strict Mode replays setup after cleanup; without this the ref stays false forever
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const run = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (timer.current !== null) {
      clearTimeout(timer.current); // error -> busy rerun: stale auto-clear must not fire mid-run
      timer.current = null;
    }
    setState("busy");
    void (async () => {
      await opts.preCapture?.(); // popover close + settle frames, INSIDE the busy lockout (spec §2.2 amendment #2)
      const el = opts.target();
      if (el === null) throw new Error("capture target unmounted");
      const rect = el.getBoundingClientRect();
      // Concurrent by construction: both promises created before either await.
      const [png, server] = await Promise.all([
        captureElementPng(el).then((b) => b.arrayBuffer()),
        captureShowTelemetry(opts.request).then(classifyResolved, () => ({
          kind: "unavailable" as const,
          reason: "network_error" as const,
        })),
      ]);
      const commitSha =
        server.kind === "ok" && typeof server["commitSha"] === "string"
          ? (server["commitSha"] as string)
          : null;
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
      // clientSnapshot() may throw (§7.3): degrade, never fail the run.
      let snapshot: unknown;
      try {
        snapshot = opts.clientSnapshot();
      } catch {
        snapshot = { kind: "unserializable", reason: "serialize_threw" };
      }
      const doc = buildTelemetryDoc({ meta, clientSnapshot: snapshot, server });
      downloadBlob(
        zipBundle(new Uint8Array(png), JSON.stringify(doc)),
        bundleFilename(opts.filenameSeed, new Date()),
        () => mounted.current, // §6: unmount between URL creation and click
      );
      if (mounted.current) setState("idle");
    })()
      .catch((err: unknown) => {
        console.error("dev capture failed", err);
        if (!mounted.current) return;
        setState("error");
        timer.current = setTimeout(() => {
          timer.current = null;
          if (mounted.current) setState("idle");
        }, ERROR_AUTO_CLEAR_MS);
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [opts]);

  return { state, run };
}
```

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
  (`captureElementPng` implementation follows SPIKE.md exactly — chosen library call with the recorded clone-override list; pixel ratio is `Math.min(Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1, 2)` so a non-finite DPR reaches the raster library as 1, never NaN — the meta-level 0-normalization protects only `meta.viewport.dpr`, this guard protects the capture path itself; unit-test the exported ratio helper with NaN/Infinity/3/1.5 inputs.) `snapshots.ts` is two pure allowlist functions per the Interfaces block.
- [ ] **Step 4:** Run — PASS. **Step 5:** Commit `feat(admin): dev-capture element wrapper, snapshots, and orchestration hook`.

### Task 8: Host mounts — ShareHub row + lockout + status line; Step3 icon (§2.2, §2.3, §7)

**Files:**
- Modify: `components/admin/showpage/ShareHub.tsx` (dev row as the popover's own final "Developer" section — lifecycle-independent per the §2.2 amendment: renders under the dev flag alone, in archived, paused, AND finalize-owned modes, OUTSIDE the `archived || !finalizeOwned` Show-section branch at `ShareHub.tsx:514`; busy lockout on BOTH toggle calls + `aria-disabled`; status line `share-hub-dev-capture-status` immediately after the kebab button)
- Modify: `components/admin/showpage/StatusStrip.tsx` (thread the new optional prop through to `<ShareHub` at `StatusStrip.tsx:312`)
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (build the snapshot thunk with `buildPublishedSnapshot` from its own props; pass to StatusStrip)
- Modify: `components/admin/wizard/Step3ReviewModal.tsx:417-448` (icon button between chip and close)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `tests/e2e/dev-capture.spec.ts` (SKELETON in Step 1a — visibility cases only; Task 9 MODIFIES it)
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Test: `tests/devcapture/hostMounts.test.tsx` (jsdom)

**Interfaces:** Consumes Tasks 6-7. The threaded prop is named `devCaptureSnapshot?: () => unknown` — SAME name at every hop (PublishedReviewModal → StatusStrip → ShareHub). ShareHub builds the request from its existing `showId` prop (`ShareHub.tsx:93`), seed from `slug` (`ShareHub.tsx:92`), target `() => document.querySelector('[data-review-modal-panel]')`. Step3 mount: request `{ kind: "staged", driveFileId: dfid }`, seed `dfid`, snapshot `buildStagedSnapshot` from its own props, target `[data-step3-review-panel]`.

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 1a: Author the failing e2e spec** `tests/e2e/dev-capture.spec.ts` (skeleton: dev/non-dev visibility cases; sentinel/download cases filled in Task 9) and run its visibility cases once — RED (testids absent). This is the integration-level failing test for the whole mount surface.
- [ ] **Step 1b: Failing jsdom tests** (queries by testid only; §9.8):
  - dev flag false/absent → `share-hub-dev-capture` and `wizard-step3-card-<dfid>-dev-capture` absent; true → present with tap-token classes;
  - threading proof: render `PublishedReviewModal` itself (minimal props fixture) inside `DeveloperFlagProvider true` → the row exists (proves PublishedReviewModal → StatusStrip → ShareHub threading, not just a direct ShareHub render);
  - lifecycle matrix: row present with `archived: true`, with `finalizeOwned: true`, with `published: false` (paused), and with all false (the §2.2 amendment's point);
  - busy — REAL hook with a deferred `captureElementPng` mock (never a mocked hook state, so the 6 s machinery is executable): while the deferral is pending, BOTH ShareHub toggles are `aria-disabled="true"`, clicking the kebab does NOT render `share-hub-popover`, clicking the SHARE-LINK toggle does not either (behavioral click on both toggles), status line shows `Capturing the modal…`;
  - activation-interval attack (the R2 P0): click the capture row, then in the SAME tick and again after one `requestAnimationFrame`, click the kebab — popover never appears (busy-first lockout covers the pre-rasterize window);
  - snapshot threading canary: fixture props carry `title: "SNAPSHOT-CANARY"`; with real bundle + spied `createObjectURL`, run a full capture and assert the zipped telemetry JSON contains the canary at `clientSnapshot.title` AND contains no `crewEmails` — proves PublishedReviewModal → StatusStrip → ShareHub → useDevCapture end-to-end, not mere visibility; equivalent staged canary via `data` fixture through `buildStagedSnapshot`;
  - error: reject the deferred capture — §7.2 error copy in `share-hub-dev-capture-status`, gone after 6 s (fake timers); after settle → `aria-disabled` removed;
  - staged icon while busy: `disabled` AND `aria-disabled="true"` AND spinner glyph present; staged adjacent `role="status"` node shows busy copy, then error copy on error, clearing after 6 s (fake timers).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement all four files (row markup mirrors the mailto-row classes `ShareHub.tsx:455`; activation is BUSY-FIRST per spec §2.2 amendment #2: the row's onClick calls `run()` directly; ShareHub supplies `preCapture: () => { setOpen(false); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))); }` so the popover close + two settle frames happen inside the busy lockout).
- [ ] **Step 4:** Run + full `pnpm vitest run tests/devcapture tests/components tests/admin` — PASS; re-run the e2e visibility cases — GREEN.
- [ ] **Step 5:** Commit `feat(admin): dev capture mounts in ShareHub kebab and Step3 header`.

### Task 9: Real-browser sentinel proof + download e2e (§3.4, §9 e2e)

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Modify: `tests/e2e/dev-capture.spec.ts` (skeleton created in Task 8; this task adds the sentinel/download/redaction cases)
- Modify: `package.json` + `pnpm-lock.yaml` (add `pngjs` devDep for PNG pixel decode)

**Ordering note (TDD):** this spec file is WRITTEN during Task 8 Step 1 (before the host mounts exist) and run once to observe the red state (capture testids absent → spec fails); Tasks 8's implementation turns the visibility cases green; the sentinel/download cases go green once Task 7's `captureElementPng` (already implemented per SPIKE.md) is wired through the mounts. `captureElementPng` itself has no earlier executable unit proof — jsdom cannot render — its red state is the SPIKE's plain-capture PNGs (clipped content visibly absent) and its green state is this spec. Declared honestly; do not reorder commits to fake unit-level TDD for a layout-bound util.

**Interfaces:** Consumes everything. Uses `signInAs` (developer fixture = `ADMIN_FIXTURE`, non-dev = normal-admin fixture, `tests/e2e/helpers/fixtures.ts:38-48`), `seedShowWithCrew`.

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] **Step 1:** Flesh out the spec authored in Task 8 Step 1. Every session-establishing case calls `deleteFixtureUsers()` before `signInAs` (create-only endpoint, `signInAs.ts:12`) — spike, developer cases, and the non-developer case alike. (a) developer session (`ADMIN_FIXTURE` — exported at `fixtures.ts:25` — via `signInAs`), published modal open (copy the open flow from `tests/e2e/published-review-modal.layout.spec.ts`), seed content so both inner panes overflow, inject two sentinel divs (distinct colors, `page.evaluate` appending to the rail + main pane located by their `-review-rail` / `-review-main` testids from `ShowReviewSurface.tsx:841/833`), click kebab → `share-hub-dev-capture`, await Playwright `download` event, unzip in-test (fflate), decode PNG with `pngjs`, assert ≥1 pixel of EACH sentinel color, assert `telemetry.json` parses with the three top-level keys and `modalKind: "published"`; (b) same for the staged modal — copy the staged-modal open flow from `tests/e2e/step3-review-modal.interactions.spec.ts` (existing precedent), `modalKind: "staged"`; (c) non-developer session (normal-admin fixture) → capture testids absent on both surfaces; (d) telemetry JSON string contains neither the seeded crew email nor the show's REAL 64-hex share token (`seedShowWithCrew` returns `shareToken` — `seedShowWithCrew.ts:86`).
- [ ] **Step 2:** Run at ≥lg viewport (`page.setViewportSize({ width: 1280, height: 800 })`); gate env-bound like sibling admin specs. Expected: FAIL before Tasks 7-8 wiring nits are fixed, PASS after.
- [ ] **Step 3:** Commit `test(admin): dev-capture sentinel and download e2e`.

### Task 10: Impeccable dual-gate (invariant 8)

**Files:**
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Create: `docs/superpowers/plans/2026-07-22-dev-modal-capture/HANDOFF.md` (§12 findings/dispositions)
- Modify (only if deferrals): `DEFERRED.md`

<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] Run `/impeccable critique` AND `/impeccable audit` on the UI diff (ShareHub, StatusStrip, PublishedReviewModal, Step3ReviewModal, layout, DeveloperFlagContext, DevCaptureControl) with the canonical v3 setup gates: `context.mjs` context load (PRODUCT.md + DESIGN.md) then the reference-register read, per AGENTS.md invariant 8.
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- [ ] Record findings + dispositions in `docs/superpowers/plans/2026-07-22-dev-modal-capture/HANDOFF.md` §12 (create the file with just that section if nothing else needs recording). Fix P0/P1 or defer via `DEFERRED.md` entry.
- [ ] Commit `fix(admin): impeccable findings on dev capture surfaces` (or `docs(plan): impeccable clean record` if zero findings).

### Task 11: Full local gates + transition audit

- [ ] `pnpm test` (full suite) — green; `pnpm typecheck` — green; `pnpm lint` (eslint) — green; `pnpm format:check` — green; `pnpm build` — green.
- [ ] Transition audit (§7.4): `rg "AnimatePresence|motion\." lib/devcapture components/admin/dev` → zero hits; grep the ShareHub/Step3 diff hunks for conditional renders and confirm each is in the §7.4 inventory (all instant).
- [ ] Commit any residue `chore(admin): dev-capture close-out gates`.

### Task 12: Ship (pipeline Stage 4 — encoded here so the plan is self-contained)

- [ ] Whole-diff cross-model adversarial review (Codex, fresh-eyes, REVIEWER ONLY) — split tight-scope briefs if the diff is large (AGENTS.md split-review default); iterate to APPROVE or exhaust the documented dispatch ladder (retry → self-certify with recorded evidence, per the spec §12 precedent).
- [ ] Push branch; `gh pr create`; verify REAL GitHub Actions CI green (`gh pr checks <PR#> --watch`; reconcile DIRTY/behind-base before claiming green).
- [ ] `gh pr merge --merge` in the same turn CI goes green.
- [ ] Fast-forward local main IN THE MAIN CHECKOUT (this worktree has the feature branch checked out; a bare `git pull --ff-only` here pulls the wrong branch): `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only && git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main` → `0  0`.
- [ ] Set ship-state marker `stage: "done"`; `CronDelete` the marker's `cronJobId`.

## Self-review record

- Spec coverage: §2.1→T6; §2.2/§2.3/§7→T8; §2.4/§3/§4.3-hook→T7; §3.3→T1; §3.4/e2e→T9; §4.5→T2; §4/§6→T3; §4.2→T4+T5; §5/inv-10→T5; inv-8→T10; §9 gates→per-task + T11. No uncovered section.
- Type consistency: `CaptureTelemetryRequest`/`CaptureList`/`TelemetryMeta` defined once (T3/T5), consumed by name in T7; `useDevCapture` signature identical in T7 interface and code.
<!-- spec-lint: ignore — file created by this plan; not yet tracked -->
- Snippet typecheck: `redact.ts` and `bundle.ts` snippets typechecked standalone against the repo tsconfig during plan drafting (see plan commit); action snippet carries an executor verification note for read-core result property names (deliberate — verify-not-invent).
- Known risk: T4's mocked-builder test shape must match each file's real chain; the executor instruction to verify first is explicit.

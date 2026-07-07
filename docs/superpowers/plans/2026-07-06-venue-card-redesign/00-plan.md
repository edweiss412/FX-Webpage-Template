# Venue Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `FieldRowList` body of the admin Stage-3 review Venue card with a bespoke two-column layout (venue name/address + a real Google Static Maps tile served through a key-safe admin proxy, with a stylized-tile fallback) above a full-bleed loading-dock footer.

**Architecture:** Four units — (1) shared `isParseableUrl` helper; (2) `lib/maps/staticMap.ts` pure URL/config helper; (3) `app/api/admin/venue-map` GET proxy route (key stays server-side); (4) `VenueMapTile` client component (always-painted stripe base + `<img>` overlay + Directions) — composed by a rewritten `VenueBreakdown`. Fail-open: any proxy non-200 → `<img> onError` → stripe fallback, so CI is green without a Static Maps key.

**Tech Stack:** Next.js 16 App Router (route handler), React client component, Tailwind v4 `@theme` tokens, lucide-react icons, vitest + @testing-library/react (jsdom), Playwright (real-browser layout).

**Spec:** `docs/superpowers/specs/2026-07-06-venue-card-redesign-design.md` (Codex-APPROVED, 2 rounds).

## Global Constraints

- **TDD per task; commit per task** — failing test → minimal impl → green → commit. Conventional commits `<type>(<scope>): <summary>` (scope `crew-page` for UI, `admin` acceptable for the route).
- **No inline hex in CSS/JSX** — every color/spacing/radius in styles/classes via `@theme` token (`app/globals.css`). Token map is spec §2. **Carve-out:** the Google Static Maps **URL query params** (`markers=color:0xRRGGBB`, `style=…color:0xRRGGBB`) are a **provider API format** that accepts only `0xRRGGBB` literals, not CSS variables. These two literals are defined as named constants in `lib/maps/staticMap.ts`, each mirroring the exact runtime value of its token (`0xff8c1a` === `--color-accent-runtime` #ff8c1a; `0x1a1b1f` === `--color-text-runtime` #1a1b1f), with a comment citing the token. This is the only place hex appears, and it is not a style value.
- **No raw error codes / upstream error bodies in UI or route bodies** (invariant 5). Route failure bodies are empty.
- **No em dashes in rendered copy** (DESIGN.md).
- **Key never reaches the browser** — the `<img>` src is the same-origin proxy; the Google key lives only in the route.
- **Status contract** (spec §3.3): `200` PNG success; `400` empty `q`; `404` no key; `502` upstream fail. Component branches ONLY on `<img>` load success/failure, never on status.
- **Tailwind v4 has NO default `items-stretch`** — every parent→child dimension relationship uses an explicit class and is verified in a REAL browser (jsdom insufficient).
- **Scope:** admin `VenueBreakdown` only. Crew `components/crew/sections/VenueSection.tsx` is OUT OF SCOPE — do not edit it.
- **`--no-verify` on commits** (shared lint-staged hook belongs to the main checkout). Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck` before the close-out.

## Meta-test inventory (declared)

**No structural meta-test is created or extended.** Rationale (spec §12 "Meta-test inventory"):
- The proxy route is an HTTP client to Google (like `lib/geocoding/client.ts`), **not** a Supabase call boundary → out of scope for `tests/auth/_metaInfraContract.test.ts`.
- It is a **read-only GET** → out of scope for `tests/log/_metaMutationSurfaceObservability.test.ts` (mutations only) and needs no `AUDITABLE_MUTATIONS` row (invariant 10 is mutation-scoped).
- No `pg_advisory*` surface → no `tests/auth/advisoryLockRpcDeadlock.test.ts` extension.
- No new §12.4 error code (failures degrade silently) → no `tests/messages/` catalog touch.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/url/isParseableUrl.ts` (create) | shared http(s)-URL predicate for the admin side | 1 |
| `lib/maps/staticMap.ts` (create) | `isStaticMapConfigured`, `buildStaticMapUrl`, `DARK_MAP_STYLE` | 2 |
| `app/api/admin/venue-map/route.ts` (create) | admin GET proxy → Google Static Maps; key-safe; status contract | 3 |
| `.env.local.example` (modify) | document optional `GOOGLE_STATIC_MAPS_API_KEY` | 3 |
| `components/admin/wizard/VenueMapTile.tsx` (create) | client tile: stripe base + `<img>` overlay + Directions; theme read | 4 |
| `components/admin/wizard/step3ReviewSections.tsx` (modify `VenueBreakdown` ~:783; add `Navigation` import) | bespoke two-column body + dock footer; parent-owns-collapse; count | 5 |
| `tests/e2e/_step3ReviewModalHarness.tsx` + `_step3ReviewFixture.ts` (modify) + `tests/e2e/step3-review-modal.layout.spec.ts` (modify) | real-browser DI-1..DI-6 | 6 |
| Test files per task under `tests/…` | TDD | 1-6 |

---

### Task 1: Shared `isParseableUrl` helper

**Files:**
- Create: `lib/url/isParseableUrl.ts`
- Test: `tests/lib/url/isParseableUrl.test.ts`

**Interfaces:**
- Produces: `export function isParseableUrl(value: string | null | undefined): boolean` — true iff `value` parses as an `http:`/`https:` URL. Mirrors the private logic at `components/crew/sections/VenueSection.tsx:79` (crew copy left untouched, per scope).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/url/isParseableUrl.test.ts
import { describe, expect, test } from "vitest";
import { isParseableUrl } from "@/lib/url/isParseableUrl";

describe("isParseableUrl", () => {
  test("accepts http(s) URLs", () => {
    expect(isParseableUrl("https://maps.google.com/?q=1")).toBe(true);
    expect(isParseableUrl("http://example.com")).toBe(true);
  });
  test("rejects non-URLs, sentinels, empty, null/undefined", () => {
    for (const v of ["TBD", "N/A", "", "   ", "ftp://x", "not a url", null, undefined]) {
      expect(isParseableUrl(v)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm vitest run tests/lib/url/isParseableUrl.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the minimal implementation**

```ts
// lib/url/isParseableUrl.ts
/** True iff `value` parses as an http(s) URL. Shared by the admin venue card
 * (mirrors the private crew copy at components/crew/sections/VenueSection.tsx:79,
 * intentionally left untouched — crew is out of scope for the venue redesign). */
export function isParseableUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm vitest run tests/lib/url/isParseableUrl.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/url/isParseableUrl.ts tests/lib/url/isParseableUrl.test.ts
git commit --no-verify -m "feat(crew-page): shared isParseableUrl helper for admin venue card"
```

---

### Task 2: `lib/maps/staticMap.ts` — config + URL builder

**Files:**
- Create: `lib/maps/staticMap.ts`
- Test: `tests/lib/maps/staticMap.test.ts`

**Interfaces:**
- Produces:
  - `export function isStaticMapConfigured(): boolean`
  - `export function staticMapKey(): string | null` (dedicated var first, geocoding var second)
  - `export function buildStaticMapUrl(query: string, theme: "light" | "dark"): string | null` (null when no key)
  - `export const DARK_MAP_STYLE: string` (inline `style=` param value for dark)

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/maps/staticMap.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildStaticMapUrl,
  isStaticMapConfigured,
  staticMapKey,
  DARK_MAP_STYLE,
} from "@/lib/maps/staticMap";

const OLD = { ...process.env };
afterEach(() => {
  process.env = { ...OLD };
  vi.unstubAllEnvs();
});

describe("staticMap config", () => {
  test("unconfigured when neither key set", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "");
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
    expect(isStaticMapConfigured()).toBe(false);
    expect(staticMapKey()).toBeNull();
    expect(buildStaticMapUrl("Foo, SF", "light")).toBeNull();
  });
  test("dedicated key takes precedence over geocoding key", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "DEDICATED");
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "GEO");
    expect(staticMapKey()).toBe("DEDICATED");
  });
  test("falls back to geocoding key", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "");
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "GEO");
    expect(staticMapKey()).toBe("GEO");
    expect(isStaticMapConfigured()).toBe(true);
  });
});

describe("buildStaticMapUrl", () => {
  test("encodes address into center + marker, includes key", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    const url = buildStaticMapUrl("The Masonic, 1111 California St", "light")!;
    expect(url).toContain("center=The%20Masonic%2C%201111%20California%20St");
    expect(url).toContain("markers=");
    expect(url).toContain("The%20Masonic");
    expect(url).toContain("key=KEY123");
    expect(url).not.toContain("style="); // light omits dark style
  });
  test("dark theme appends the dark style ruleset", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    const url = buildStaticMapUrl("X", "dark")!;
    expect(url).toContain(encodeURIComponent(DARK_MAP_STYLE).slice(0, 12)); // style present
    expect(url).toContain("style=");
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm vitest run tests/lib/maps/staticMap.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the minimal implementation**

```ts
// lib/maps/staticMap.ts
/**
 * Google Static Maps URL + config helper for the admin venue card's map tile.
 * The KEY is read here (server-only) and reused from the existing geocoding key
 * unless a dedicated GOOGLE_STATIC_MAPS_API_KEY is set — no new required secret
 * (same GCP project). Mirrors lib/geocoding/client.ts's key posture. This module
 * is pure (builds a URL); the route (app/api/admin/venue-map) does the fetch.
 */
const ENDPOINT = "https://maps.googleapis.com/maps/api/staticmap";

// Google Static Maps URL params accept ONLY 0xRRGGBB literals (provider API
// format, not CSS). Each mirrors the exact runtime value of a design token
// (app/globals.css), so there is a single conceptual source (plan global-
// constraint carve-out). MARKER_COLOR === --color-accent-runtime (#ff8c1a);
// DARK_MAP_STYLE geometry === --color-text-runtime (#1a1b1f).
const MARKER_COLOR = "0xff8c1a"; // === --color-accent-runtime

/** Compact dark map styling (overall dark geometry) applied via `style=` when
 * the venue card is in dark mode. Geometry color mirrors --color-text-runtime. */
export const DARK_MAP_STYLE = "feature:all|element:geometry|color:0x1a1b1f";

/** The Static Maps key: dedicated var first, geocoding var (same GCP project)
 * second. Null when neither is set. */
export function staticMapKey(): string | null {
  return (
    process.env.GOOGLE_STATIC_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_GEOCODING_API_KEY?.trim() ||
    null
  );
}

export function isStaticMapConfigured(): boolean {
  return staticMapKey() !== null;
}

/** Build the Static Maps URL for an address string. Null when no key configured.
 * Google geocodes the `center`/`markers` address server-side (no lat/lng needed). */
export function buildStaticMapUrl(query: string, theme: "light" | "dark"): string | null {
  const key = staticMapKey();
  if (!key) return null;
  const enc = encodeURIComponent(query);
  const params = [
    `center=${enc}`,
    `markers=color:${MARKER_COLOR}%7C${enc}`,
    "zoom=15",
    "size=176x120",
    "scale=2",
    "format=png",
  ];
  if (theme === "dark") params.push(`style=${encodeURIComponent(DARK_MAP_STYLE)}`);
  params.push(`key=${encodeURIComponent(key)}`);
  return `${ENDPOINT}?${params.join("&")}`;
}
```

Note: the `center=` assertion in the test expects raw `%20`/`%2C` from `encodeURIComponent`; keep `enc` as `encodeURIComponent(query)`.

- [ ] **Step 4: Run test, verify it passes** — `pnpm vitest run tests/lib/maps/staticMap.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/maps/staticMap.ts tests/lib/maps/staticMap.test.ts
git commit --no-verify -m "feat(crew-page): static-map URL/config helper (key-safe, geocoding-key reuse)"
```

---

### Task 3: `app/api/admin/venue-map` GET proxy route

**Files:**
- Create: `app/api/admin/venue-map/route.ts`
- Modify: `.env.local.example` (append optional key doc)
- Test: `tests/app/api/venueMapRoute.test.ts`

**Interfaces:**
- Consumes: `requireAdminIdentity`, `AdminInfraError` (`@/lib/auth/requireAdmin`); `buildStaticMapUrl`, `isStaticMapConfigured` (Task 2).
- Produces: `export async function GET(req: Request): Promise<Response>` with the status contract; `export const dynamic = "force-dynamic"`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/api/venueMapRoute.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/admin/venue-map/route";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";

vi.mock("@/lib/auth/requireAdmin", () => {
  class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
    constructor(m: string) { super(m); this.name = "AdminInfraError"; }
  }
  return { AdminInfraError, requireAdminIdentity: vi.fn() };
});

const requireAdminMock = vi.mocked(requireAdminIdentity);
const OLD = { ...process.env };

function req(qs: string): Request {
  return new Request(`http://localhost/api/admin/venue-map${qs}`);
}

beforeEach(() => {
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue({ email: "admin@fxav.test" } as never);
});
afterEach(() => {
  process.env = { ...OLD };
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/admin/venue-map", () => {
  test("AdminInfraError → 503, empty body", async () => {
    requireAdminMock.mockRejectedValue(new AdminInfraError("x"));
    const res = await GET(req("?q=SF"));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(""); // no raw error text (invariant 5)
  });

  test("empty q → 400, empty body", async () => {
    const res = await GET(req("?q=%20"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("");
  });

  test("no key configured → 404, empty body", async () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "");
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
    const res = await GET(req("?q=The%20Masonic"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  test("configured + upstream OK → 200 image/png with private cache", async () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200, headers: { "content-type": "image/png" },
      })),
    );
    const res = await GET(req("?q=The%20Masonic&theme=dark"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("private");
    // theme threaded into the upstream URL
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(call).toContain("style="); // dark
  });

  test("upstream 500 (after retries) → 502, empty body, no upstream text", async () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("GOOGLE_INTERNAL_BOOM", { status: 500 })),
    );
    const res = await GET(req("?q=X"));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toBe("");
    expect(body).not.toContain("GOOGLE_INTERNAL_BOOM");
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm vitest run tests/app/api/venueMapRoute.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the minimal implementation**

```ts
// app/api/admin/venue-map/route.ts
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { buildStaticMapUrl } from "@/lib/maps/staticMap";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;

/** Admin-gated, READ-ONLY (GET) proxy to Google Static Maps. Read-only → NOT a
 * mutation surface (AGENTS.md invariant 10 is mutation-scoped), so no telemetry
 * registry row. The Google key lives only here; the browser never sees it. Any
 * non-200 is a fail-open signal → the client's <img> onError shows the stripe. */
export async function GET(req: Request): Promise<Response> {
  try {
    await requireAdminIdentity();
  } catch (err) {
    if (err instanceof AdminInfraError) return new Response(null, { status: 503 });
    throw err; // forbidden()/notFound() control flow propagates to Next
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 512);
  if (!q) return new Response(null, { status: 400 });
  const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";

  const upstreamUrl = buildStaticMapUrl(q, theme);
  if (!upstreamUrl) return new Response(null, { status: 404 }); // no key configured

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < MAX_RETRIES;
    let res: Response;
    try {
      res = await fetch(upstreamUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      if (canRetry) continue;
      return new Response(null, { status: 502 }); // network/timeout — no raw text
    }
    if ((res.status === 429 || res.status >= 500) && canRetry) continue;
    if (!res.ok) return new Response(null, { status: 502 }); // no upstream body echoed
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "private, max-age=3600",
      },
    });
  }
}
```

- [ ] **Step 4: Run test, verify it passes** — `pnpm vitest run tests/app/api/venueMapRoute.test.ts` → PASS.

- [ ] **Step 5: Document the optional key in `.env.local.example`**

Add, immediately after the existing `GOOGLE_GEOCODING_API_KEY=` line (currently `.env.local.example:15`):

```bash
# Optional: dedicated Google Static Maps API key for the admin venue card's map
# tile. If unset, the venue map reuses GOOGLE_GEOCODING_API_KEY (same GCP
# project). If neither is set, the card shows a stylized placeholder tile.
# GOOGLE_STATIC_MAPS_API_KEY=
```

Verify the file still has a trailing newline (`printf`-style discipline): `tail -c1 .env.local.example | xxd` shows `0a`.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/venue-map/route.ts tests/app/api/venueMapRoute.test.ts .env.local.example
git commit --no-verify -m "feat(admin): key-safe venue-map static-map proxy route (200/400/404/502)"
```

---

### Task 4: `VenueMapTile` client component

**Files:**
- Create: `components/admin/wizard/VenueMapTile.tsx`
- Test: `tests/components/admin/wizard/venueMapTile.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (self-contained; theme via `document.documentElement.dataset.theme`).
- Produces: `export function VenueMapTile({ query, mapHref }: { query: string; mapHref: string | null }): JSX.Element | null`. Root has `data-testid="venue-map-tile"` and `h-full` (DI-1). Returns `null` on empty `query` (defensive; parent owns collapse). The `<img>` has `data-testid="venue-map-img"`; the Directions anchor `data-testid="venue-directions"`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/components/admin/wizard/venueMapTile.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { VenueMapTile } from "@/components/admin/wizard/VenueMapTile";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("VenueMapTile", () => {
  test("empty query → renders nothing (parent owns collapse)", () => {
    const { container } = render(<VenueMapTile query="" mapHref="https://m.co" />);
    expect(container.querySelector('[data-testid="venue-map-tile"]')).toBeNull();
  });

  test("query + mapHref → tile IS the anchor (href/target) + img proxy src + Directions visual", () => {
    const { container } = render(
      <VenueMapTile query="The Masonic, SF" mapHref="https://maps.google.com/?q=x" />,
    );
    const img = container.querySelector('[data-testid="venue-map-img"]') as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("/api/admin/venue-map?q=");
    expect(img.getAttribute("src")).toContain("theme=light");
    // The whole tile is the anchor (the 44px target) — href/target live on it.
    const tile = container.querySelector('[data-testid="venue-map-tile"]') as HTMLAnchorElement;
    expect(tile.tagName).toBe("A");
    expect(tile.getAttribute("href")).toBe("https://maps.google.com/?q=x");
    expect(tile.getAttribute("target")).toBe("_blank");
    expect(tile.getAttribute("rel")).toContain("noopener");
    // The Directions visual span is present (decorative; no href of its own).
    const dir = container.querySelector('[data-testid="venue-directions"]') as HTMLElement;
    expect(dir).not.toBeNull();
    expect(dir.tagName).toBe("SPAN");
  });

  test("no mapHref → tile is a non-anchor div, no Directions visual (no dead link)", () => {
    const { container } = render(<VenueMapTile query="X" mapHref={null} />);
    const tile = container.querySelector('[data-testid="venue-map-tile"]') as HTMLElement;
    expect(tile.tagName).toBe("DIV");
    expect(container.querySelector('[data-testid="venue-directions"]')).toBeNull();
    // stripe base + img still present
    expect(container.querySelector('[data-testid="venue-map-img"]')).not.toBeNull();
  });

  test("img onError hides the img, revealing the always-present stripe base", () => {
    const { container } = render(<VenueMapTile query="X" mapHref={null} />);
    const img = container.querySelector('[data-testid="venue-map-img"]') as HTMLImageElement;
    const stripe = container.querySelector('[data-testid="venue-map-fallback"]') as HTMLElement;
    expect(stripe).not.toBeNull(); // base layer always painted
    fireEvent.error(img);
    expect(img.style.visibility).toBe("hidden");
  });

  test("dark theme after hydration → src carries theme=dark", () => {
    document.documentElement.dataset.theme = "dark";
    const { container } = render(<VenueMapTile query="X" mapHref={null} />);
    const img = container.querySelector('[data-testid="venue-map-img"]') as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("theme=dark");
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Write the minimal implementation**

```tsx
// components/admin/wizard/VenueMapTile.tsx
"use client";

import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";

/** Read the pre-hydration-stamped theme (app/layout.tsx NO_FOUC_SCRIPT →
 * document.documentElement.dataset.theme; same read as ThemeToggle.tsx:69). */
function readTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The admin venue card's map tile. Three stacked layers in one region:
 *  (1) an always-painted token-driven stripe base (revealed if the map fails);
 *  (2) the <img> proxy overlay (hides itself on error — no swap state);
 *  (3) the Directions affordance (only when mapHref is a real URL).
 * The parent (VenueBreakdown) owns region collapse and never mounts this with
 * an empty query; the empty-query guard here is defensive. */
export function VenueMapTile({
  query,
  mapHref,
}: {
  query: string;
  mapHref: string | null;
}): JSX.Element | null {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => setTheme(readTheme()), []);
  if (!query) return null;

  const src = `/api/admin/venue-map?q=${encodeURIComponent(query)}&theme=${theme}`;

  const inner = (
    <>
      {/* (1) stripe base — always painted. Inline style for the gradient (no
          arbitrary-class → avoids the better-tailwindcss canonical-class lint);
          colors still come from tokens. */}
      <span
        data-testid="venue-map-fallback"
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--color-surface-sunken) 0 10px, var(--color-surface) 10px 20px)",
        }}
      />
      <span className="absolute top-2.5 left-2.5 rounded-sm bg-surface/85 px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
        map
      </span>
      {/* (2) real map overlay — hides itself on error (instant; §8 declares no
          fade, so NO transition class here — an opacity transition would be
          inert and would trip the transition audit). */}
      <img
        data-testid="venue-map-img"
        src={src}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* (3) Directions visual — only for a real URL. Decorative span (the
          ANCHOR is the whole tile, testid venue-map-tile, and is the 44px
          target); this span carries venue-directions so tests can assert its
          presence/absence follows mapHref. */}
      {mapHref ? (
        <span
          data-testid="venue-directions"
          className="absolute right-2.5 bottom-2.5 left-2.5 inline-flex min-h-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface text-xs font-semibold text-text"
        >
          <Navigation aria-hidden="true" className="size-3.5" />
          Directions
        </span>
      ) : null}
    </>
  );

  const common = "relative block h-full min-h-tile-min-h w-full overflow-hidden";
  return mapHref ? (
    <a
      data-testid="venue-map-tile"
      href={mapHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open directions to the venue"
      className={common}
    >
      {/* anchor wraps the button visual; the inner Directions span is decorative */}
      {inner}
    </a>
  ) : (
    <div data-testid="venue-map-tile" className={common}>
      {inner}
    </div>
  );
}
```

Note: when `mapHref` is set the whole tile is the anchor, so the inner `Directions` span is a non-interactive visual (the anchor is the 44px target). When absent, no anchor renders. `min-h-tile-min-h` (utility generated from `--spacing-tile-min-h` = 96px; confirmed in use at `components/atoms/Section.tsx:174`) guarantees a measurable tile height in the stacked mobile layout.

- [ ] **Step 4: Run test, verify it passes** — `pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/VenueMapTile.tsx tests/components/admin/wizard/venueMapTile.test.tsx
git commit --no-verify -m "feat(crew-page): VenueMapTile — stripe base + proxy img overlay + Directions"
```

---

### Task 5: Rewrite `VenueBreakdown` body

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`VenueBreakdown` at ~:783; add `Navigation` is in Task 4's component, but `VenueBreakdown` imports `VenueMapTile` + uses `Truck` — ensure `Truck` is in the lucide import block ~:64; `MapPin` already used by the registry).
- Test: `tests/components/admin/wizard/venueBreakdown.test.tsx`

**Interfaces:**
- Consumes: `VenueMapTile` (Task 4), `isParseableUrl` (Task 1), `contentRows` (`step3ReviewSections.tsx:206`), `BreakdownSection` (`:628`).
- Produces: same export `VenueBreakdown({ dfid, venue })`. Body testids: `data-testid="venue-body"` wrapper; `data-testid="venue-text-col"` left column; `data-testid="venue-map-region"` right region; `data-testid="venue-dock"` footer.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/components/admin/wizard/venueBreakdown.test.tsx
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { VenueBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ShowRow } from "@/lib/parser/types";

const DFID = "drive-abc-123";
function venue(over: Partial<NonNullable<ShowRow["venue"]>> = {}): ShowRow["venue"] {
  return {
    name: "The Masonic Auditorium",
    address: "1111 California St",
    city: "San Francisco, CA 94108",
    loadingDock: "Rear alley off Taylor St, 2 bays, 9ft clearance",
    googleLink: "https://maps.google.com/?q=masonic",
    ...over,
  };
}
afterEach(cleanup);

describe("VenueBreakdown", () => {
  test("null venue → empty copy, no map, no dock", () => {
    const { container, getByText } = render(<VenueBreakdown dfid={DFID} venue={null} />);
    getByText("No venue details parsed.");
    expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
    expect(container.querySelector('[data-testid="venue-dock"]')).toBeNull();
  });

  test("full venue → name/address/city, map region, dock footer", () => {
    const { container } = render(<VenueBreakdown dfid={DFID} venue={venue()} />);
    const body = container.querySelector('[data-testid="venue-body"]') as HTMLElement;
    expect(within(body).getByText("The Masonic Auditorium")).toBeTruthy();
    expect(within(body).getByText(/1111 California St/)).toBeTruthy();
    expect(within(body).getByText(/San Francisco, CA 94108/)).toBeTruthy();
    expect(container.querySelector('[data-testid="venue-map-region"]')).not.toBeNull();
    const dock = container.querySelector('[data-testid="venue-dock"]') as HTMLElement;
    expect(within(dock).getByText(/Rear alley off Taylor St/)).toBeTruthy();
  });

  test("loadingDock absent → no dock footer", () => {
    const { container } = render(
      <VenueBreakdown dfid={DFID} venue={venue({ loadingDock: null })} />,
    );
    expect(container.querySelector('[data-testid="venue-dock"]')).toBeNull();
  });

  test("name+address both empty → map region collapses (parent owns), no map tile mounted", () => {
    const { container } = render(
      <VenueBreakdown
        dfid={DFID}
        venue={venue({ name: "", address: "", googleLink: "https://m.co" })}
      />,
    );
    expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
    expect(container.querySelector('[data-testid="venue-map-tile"]')).toBeNull();
  });

  test("notes never render in the venue card", () => {
    const v = { ...venue(), notes: "SECRET NOTE STRING" } as NonNullable<ShowRow["venue"]>;
    const { container } = render(<VenueBreakdown dfid={DFID} venue={v} />);
    expect(container.textContent).not.toContain("SECRET NOTE STRING");
  });

  test("non-URL googleLink → map region present but no Directions anchor", () => {
    const { container } = render(
      <VenueBreakdown dfid={DFID} venue={venue({ googleLink: "TBD" })} />,
    );
    expect(container.querySelector('[data-testid="venue-map-region"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="venue-directions"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm vitest run tests/components/admin/wizard/venueBreakdown.test.tsx` → FAIL (old FieldRowList body; testids/assertions absent).

- [ ] **Step 3: Write the minimal implementation** — replace the `VenueBreakdown` body (`step3ReviewSections.tsx:783-806`). Add `VenueMapTile` + `isParseableUrl` imports at the top of the file, and ensure `Truck` is in the lucide import block.

```tsx
export function VenueBreakdown({ dfid, venue }: { dfid: string; venue: ShowRow["venue"] }) {
  const rows = venue
    ? contentRows([
        ["Venue", venue.name],
        ["Address", venue.address],
        ["City", venue.city],
        ["Loading dock", venue.loadingDock],
        ["Maps link", venue.googleLink],
      ])
    : [];

  const name = venue?.name?.trim() ?? "";
  const address = venue?.address?.trim() ?? "";
  const city = venue?.city?.trim() ?? "";
  const dock = venue?.loadingDock?.trim() ?? "";
  const mapHref = isParseableUrl(venue?.googleLink) ? venue!.googleLink!.trim() : null;
  // Geocodable query mirrors geocodeQuery (lib/geocoding/client.ts:44). Empty →
  // the parent collapses the map region (never mounts VenueMapTile).
  const query = [name, address].filter(Boolean).join(", ");

  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-venue`}
      label="Venue"
      count={rows.length}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">No venue details parsed.</p>
      ) : (
        // Full-bleed body: cancel the panel p-tile-pad and clip to its radius so
        // the map divider + dock band reach the card edges (one card, no nesting).
        <div
          data-testid="venue-body"
          className="-m-tile-pad overflow-hidden rounded-md"
        >
          {/* Region A: two-column (stacks below sm) */}
          <div className="flex flex-col sm:flex-row sm:items-stretch">
            <div
              data-testid="venue-text-col"
              className="flex min-w-0 flex-1 flex-col gap-1 p-tile-pad"
            >
              <span
                className="text-[10px] font-semibold text-text-faint uppercase"
                style={{ letterSpacing: "var(--tracking-eyebrow)" }}
              >
                Venue
              </span>
              {name ? (
                <span className="text-lg leading-tight font-bold wrap-break-word text-text-strong">
                  {name}
                </span>
              ) : null}
              {address || city ? (
                <span className="mt-1 text-sm leading-snug text-text-subtle">
                  {address ? <span className="block wrap-break-word">{address}</span> : null}
                  {city ? <span className="block wrap-break-word">{city}</span> : null}
                </span>
              ) : null}
            </div>
            {query ? (
              <div
                data-testid="venue-map-region"
                className="h-40 w-full self-stretch border-t border-border sm:h-auto sm:w-[172px] sm:shrink-0 sm:border-t-0 sm:border-l"
              >
                <VenueMapTile query={query} mapHref={mapHref} />
              </div>
            ) : null}
          </div>
          {/* Region B: loading-dock footer — only when present */}
          {dock ? (
            <div
              data-testid="venue-dock"
              className="flex items-start gap-2.5 border-t border-border bg-surface-sunken p-tile-pad"
            >
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-sm border border-border bg-surface text-accent-on-bg"
              >
                <Truck className="size-3.5" />
              </span>
              <div className="min-w-0">
                <span
                  className="text-[10px] font-semibold text-text-faint uppercase"
                  style={{ letterSpacing: "var(--tracking-eyebrow)" }}
                >
                  Loading dock
                </span>
                <p className="mt-0.5 text-sm leading-snug wrap-break-word text-text">{dock}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </BreakdownSection>
  );
}
```

Import additions (top of `step3ReviewSections.tsx`): `import { VenueMapTile } from "@/components/admin/wizard/VenueMapTile";` and `import { isParseableUrl } from "@/lib/url/isParseableUrl";`; add `Truck` to the existing `lucide-react` import block (`~:1-64`).

- [ ] **Step 4: Run test, verify it passes** — `pnpm vitest run tests/components/admin/wizard/venueBreakdown.test.tsx` → PASS. Then run the existing modal + section suites to confirm no regression: `pnpm vitest run tests/components/admin/wizard/ tests/components/admin/`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/venueBreakdown.test.tsx
git commit --no-verify -m "feat(crew-page): bespoke two-column venue card body + dock footer"
```

---

### Task 6: Real-browser layout invariants (DI-1..DI-6)

**Files:**
- Modify: `tests/components/admin/wizard/_step3ReviewFixture.ts` (ensure the default venue has `loadingDock` + parseable `googleLink` so the harness renders map region + dock)
- Modify: `tests/e2e/step3-review-modal.layout.spec.ts` (add a venue-geometry test block)
- Test: (the spec file above IS the test)

**Interfaces:**
- Consumes: the harness at `tests/e2e/_step3ReviewModalHarness.tsx` (renders the real modal to static markup) + `buildParseResult`/`showOverrides` in `_step3ReviewFixture.ts`.

- [ ] **Step 1: Ensure the harness venue fixture populates map + dock**

In `tests/components/admin/wizard/_step3ReviewFixture.ts`, confirm `buildParseResult().show.venue` includes `loadingDock` (non-empty) and a parseable `googleLink`. If either is missing, add them to the default venue:

```ts
venue: {
  name: "The Masonic Auditorium",
  address: "1111 California St",
  city: "San Francisco, CA 94108",
  loadingDock: "Rear alley off Taylor St, 2 bays, 9ft clearance",
  googleLink: "https://maps.google.com/?q=masonic",
},
```

- [ ] **Step 2: Write the failing layout test block**

Append to `tests/e2e/step3-review-modal.layout.spec.ts` (uses the file's existing `openHarness`/`rect`/`tid` helpers and `MODES`). The map region test IDs come from Task 4/5 (`venue-map-region`, `venue-text-col`).

```ts
// ── Venue card redesign (spec 2026-07-06 §7 DI-1..DI-6) ─────────────────────
test("§DI-1 venue map region height === text column height @ popup 800px", async ({ page }) => {
  await openHarness(page, { width: 800, height: 900 });
  const region = await rect(page, '[data-testid="venue-map-region"]');
  const textCol = await rect(page, '[data-testid="venue-text-col"]');
  expect(region.height, "map region and text column render").toBeGreaterThan(0);
  // Tailwind v4 items-stretch collapse catcher: without sm:items-stretch +
  // self-stretch the region shrinks to the tile's intrinsic height.
  expect(
    Math.abs(region.height - textCol.height),
    `map region ${region.height} === text col ${textCol.height}`,
  ).toBeLessThanOrEqual(TOL);
});

test("§DI-2 venue map img fills its region box (no letterbox) @ popup 800px", async ({ page }) => {
  await openHarness(page, { width: 800, height: 900 });
  const region = await rect(page, '[data-testid="venue-map-region"]');
  const img = await rect(page, '[data-testid="venue-map-img"]');
  // h-full w-full object-cover on the img over an absolute-inset stripe base:
  // the img fills the region box exactly (catches a collapsed/auto-sized img).
  expect(Math.abs(img.width - region.width), `img w ${img.width} === region w ${region.width}`).toBeLessThanOrEqual(TOL);
  expect(Math.abs(img.height - region.height), `img h ${img.height} === region h ${region.height}`).toBeLessThanOrEqual(TOL);
});

test("§DI-3 venue map region is 172px wide @ popup 800px", async ({ page }) => {
  await openHarness(page, { width: 800, height: 900 });
  const region = await rect(page, '[data-testid="venue-map-region"]');
  expect(Math.abs(region.width - 172), `region width ${region.width} === 172`).toBeLessThanOrEqual(TOL);
});

test("§DI-5 venue full-bleed body + dock reach the panel inner edges @ popup 800px", async ({ page }) => {
  await openHarness(page, { width: 800, height: 900 });
  // The venue section's panel card is the BreakdownSection panel. The full-bleed
  // body (-m-tile-pad) + dock footer span the panel's inner content width, and
  // the map region's right edge aligns to the body's right edge (bleeds to edge).
  const body = await rect(page, '[data-testid="venue-body"]');
  const dock = await rect(page, '[data-testid="venue-dock"]');
  const region = await rect(page, '[data-testid="venue-map-region"]');
  expect(Math.abs(dock.left - body.left), `dock.left ${dock.left} === body.left ${body.left}`).toBeLessThanOrEqual(TOL);
  expect(Math.abs(dock.right - body.right), `dock.right ${dock.right} === body.right ${body.right}`).toBeLessThanOrEqual(TOL);
  expect(Math.abs(region.right - body.right), `map region.right ${region.right} === body.right ${body.right}`).toBeLessThanOrEqual(TOL);
  // overflow-hidden on the body wrapper clips the square-cornered regions to the
  // panel radius (mechanism pinned via computed style; env-independent).
  const overflow = await page.locator('[data-testid="venue-body"]').evaluate((el) => getComputedStyle(el).overflow);
  expect(overflow, "venue body clips full-bleed regions (overflow hidden)").toContain("hidden");
});

test("§DI-4 venue columns STACK below sm @ sheet 390px", async ({ page }) => {
  await openHarness(page, { width: 390, height: 844 });
  const region = await rect(page, '[data-testid="venue-map-region"]');
  const textCol = await rect(page, '[data-testid="venue-text-col"]');
  // Stacked: the map region's top is at/below the text column's bottom.
  expect(region.top, `region.top ${region.top} ≥ textCol.bottom ${textCol.bottom}`).toBeGreaterThanOrEqual(
    textCol.bottom - TOL,
  );
  // Full-width map region when stacked (=== text column width).
  expect(
    Math.abs(region.width - textCol.width),
    `region.width ${region.width} === textCol.width ${textCol.width}`,
  ).toBeLessThanOrEqual(TOL);
});

test("§DI-6 venue Directions target ≥ 44px tall @ popup 800px", async ({ page }) => {
  await openHarness(page, { width: 800, height: 900 });
  const dir = await rect(page, '[data-testid="venue-map-tile"]'); // whole tile is the anchor
  expect(dir.height, `venue map anchor height ${dir.height} ≥ 44`).toBeGreaterThanOrEqual(TAP_MIN - TOL);
});
```

- [ ] **Step 3: Run the layout spec, verify the new blocks fail then pass**

Run: `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts -g "venue"`
Expected: initially FAIL if DI classes are wrong; PASS once Task 5's classes are correct. (If the static `<img>` 404s in the harness's node server, the region height is still driven by the stretched parent — geometry holds. Verify all four venue tests green.)

- [ ] **Step 4: Run the full layout spec to confirm no regression** — same command without `-g`, all green.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/step3-review-modal.layout.spec.ts tests/components/admin/wizard/_step3ReviewFixture.ts
git commit --no-verify -m "test(crew-page): real-browser venue card layout invariants (DI-1..DI-6)"
```

---

### Task 7: Transition audit

**Files:**
- Test: `tests/components/admin/wizard/venueTransitionAudit.test.ts`

**Interfaces:** none; static source assertion over BOTH new/edited surfaces — the `VenueMapTile` component AND the `VenueBreakdown` region of `step3ReviewSections.tsx` (that region is where the card's conditional renders live: the map-region gated on `query`, the dock footer gated on `loadingDock`, the directions anchor-vs-div swap). §8 covers the whole venue card, not just the tile, so the audit MUST enumerate every conditional block on both surfaces (per the project's "Transition-audit task" rule: list every `AnimatePresence`, ternary render, and `{cond && …}` block; assert each is deliberately instant). Scanning only the tile is the coverage gap.

- [ ] **Step 1: Write the failing test**

```ts
// tests/components/admin/wizard/venueTransitionAudit.test.ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const tile = readFileSync(join(ROOT, "components/admin/wizard/VenueMapTile.tsx"), "utf8");
const sections = readFileSync(
  join(ROOT, "components/admin/wizard/step3ReviewSections.tsx"),
  "utf8",
);

// Slice out ONLY the VenueBreakdown function body so the assertions cannot be
// satisfied (or violated) by unrelated sections in this large shared file.
function venueBreakdownSource(): string {
  const start = sections.indexOf("function VenueBreakdown");
  expect(start, "VenueBreakdown function not found").toBeGreaterThan(-1);
  // Next top-level `function ` declaration terminates the slice.
  const rest = sections.slice(start + "function VenueBreakdown".length);
  const nextFn = rest.search(/\nfunction \w/);
  return rest.slice(0, nextFn === -1 ? undefined : nextFn);
}

describe("venue card transition inventory (spec §8 — all instant)", () => {
  test("tile: no AnimatePresence / exit / initial props (card is static)", () => {
    expect(tile).not.toMatch(/AnimatePresence|(?:^|\s)exit=|(?:^|\s)initial=/);
  });
  test("tile: no transition classes at all — fully instant (§8)", () => {
    // §8 declares every state pair instant, incl. image load (no fade) and the
    // onError visibility swap. A `transition-*` class would be inert (the
    // component performs no opacity/transform state change) and dishonest.
    expect(tile).not.toMatch(/\btransition(-\w+)?\b/);
    // The fallback swap is a visibility flip in onError, not an animation.
    expect(tile).toContain('style.visibility = "hidden"');
  });

  // The three enumerated conditional renders of the venue card (§8) live in
  // VenueBreakdown, not the tile. Prove they EXIST (non-tautological — a broken
  // rewrite that drops them fails here) and that each is INSTANT (no transition
  // or AnimatePresence wrapping the state change).
  test("VenueBreakdown: enumerated conditional renders exist and are instant", () => {
    const src = venueBreakdownSource();
    // (a) map region rendered only when the geocode query is non-empty.
    expect(src, "map-region conditional").toContain("venue-map-region");
    // (b) dock footer rendered only when loadingDock has content.
    expect(src, "dock-footer conditional").toContain("venue-dock");
    // (c) directions target: anchor when mapHref, decorative element otherwise —
    // routed through VenueMapTile, which the card always renders.
    expect(src, "map tile mounted").toContain("VenueMapTile");
    // None of these three state changes animates: no transition/AnimatePresence
    // in the VenueBreakdown region (compound transitions — e.g. dock toggling
    // while the map region is absent — are therefore instant by construction).
    expect(src, "no transition classes in VenueBreakdown").not.toMatch(
      /\btransition(-\w+)?\b/,
    );
    expect(src, "no AnimatePresence in VenueBreakdown").not.toMatch(/AnimatePresence/);
  });
});
```

- [ ] **Step 2: Run, verify it passes** (Tasks 4 + 5 already wrote/edited the surfaces to satisfy this) — `pnpm vitest run tests/components/admin/wizard/venueTransitionAudit.test.ts`. If it fails, the offending surface violated the transition inventory; fix the component/`VenueBreakdown`, not the test.

- [ ] **Step 3: Commit**

```bash
git add tests/components/admin/wizard/venueTransitionAudit.test.ts
git commit --no-verify -m "test(crew-page): venue card transition-inventory audit (§8)"
```

---

## Close-out (ship-pipeline stages — not per-task commits)

These run after all tasks are green; they are the ship pipeline's Stage 3-finish + Stage 4, listed here so nothing is missed.

- [ ] **Full local gate:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run` (full suite — scoped gates miss regressions) + the Playwright layout spec.
- [ ] **UI quality gate (invariant 8):** run `/impeccable critique` AND `/impeccable audit` on the diff (UI surface = `components/admin/wizard/VenueMapTile.tsx`, the `VenueBreakdown` edit, no new `@theme` tokens). HIGH/CRITICAL findings fixed or deferred via `DEFERRED.md`. Record dispositions.
- [ ] **Whole-diff cross-model adversarial review** → Codex, fresh-eyes, REVIEWER ONLY, iterate to APPROVE.
- [ ] **Push, open PR, real CI green** (not just local). Reconcile if DIRTY/behind base.
- [ ] **Merge** `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-review (plan author checklist — completed inline)

1. **Spec coverage:** §3.1 VenueBreakdown → Task 5; §3.2 VenueMapTile → Task 4; §3.3 route → Task 3; §2 isParseableUrl → Task 1; §2 staticMap helper → Task 2; §5 guards → Tasks 4/5 tests; §6 dark theme → Tasks 2/4 tests; §7 DI → Task 6; §8 transitions → Task 7; §10 env doc → Task 3 Step 5; §12 tests → all; meta-test inventory → declared above. No gaps.
2. **Placeholder scan:** none — every step carries real code/commands.
3. **Type consistency:** `buildStaticMapUrl(query, theme)` signature consistent across Tasks 2/3; `VenueMapTile({ query, mapHref })` consistent across Tasks 4/5; testids (`venue-map-region`, `venue-text-col`, `venue-map-tile`, `venue-directions`, `venue-dock`, `venue-map-fallback`, `venue-map-img`) consistent across Tasks 4/5/6.

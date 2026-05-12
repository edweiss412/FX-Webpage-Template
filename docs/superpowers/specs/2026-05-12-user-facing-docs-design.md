# FXAV User-Facing Docs (`/help`) — Design Spec

**Spec date:** 2026-05-12
**Working title:** Milestone 12 — Operator-facing documentation site
**Status:** Draft (pending user review, then adversarial review)
**Companion HTML version:** [`2026-05-12-user-facing-docs-design.html`](./2026-05-12-user-facing-docs-design.html)
**Milestone dependency:** M12 starts only after **M10** (onboarding wizard) closes. Real screenshots in v1 (see §3.6 + §6) require the documented UI surfaces to exist and be stable.

---

## 1. Goal & scope

Build an in-app wiki-style documentation site at `/help` whose primary reader is **Doug Larson** (the sole admin of `/admin`). The site exists to:

1. **Carry Doug across the adoption gap** from his current Google-Sheets-only workflow to the FXAV-augmented workflow — explicit, narrative, finite.
2. **Provide operational reference** for every operator-facing surface he uses (dashboard triage, review queues, parse warnings, per-show panel, preview-as-crew, signed-link distribution, onboarding wizard).
3. **Showcase the capability set** in a single "tour" page Doug can use to orient himself or a future successor.

Phase 2 (out of scope for this milestone) extends the site with crew-facing pages at `/help/crew/*` once Doug-facing content has settled.

### 1.1 Why this milestone exists now

The crew-pages spec at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` §9.0.1 mandates contextual in-app help affordances ("?" tooltips, "Take the tour", "What does this mean?" links). Those affordances land with their owning milestones (M4 / M9 / M10) as **plain-text-only** explanations. This milestone (M12) builds the **destination** those affordances deep-link into, and retrofits each affordance with a `Learn more →` link to the new pages.

### 1.2 Audience cut

| Audience | v1 (M12) | Phase 2 |
| --- | --- | --- |
| Doug (admin) | ✅ all 13 pages | — |
| Crew (signed-link viewers) | ❌ none | ✅ `/help/crew/*` |
| Public / unauthenticated | ❌ blanket 403 on `/help/*` | ✅ open for `/help/crew/*` only |

Auth gating is **admin-only across the whole `/help/*` tree in v1**. Phase 2 splits via App Router groups (`(admin)` / `(public)`) without changing any URL.

---

## 2. Out of scope (explicit deferrals)

- **Crew-facing pages.** No `/help/crew/*` content in v1. Auth gating is admin-only for the whole tree.
- **Full-text search.** v1 relies on sidebar nav + browser Ctrl-F. Phase-2 trigger: total page count exceeds ~25.
- **In-app authoring / CMS.** Docs are MDX/TSX in the repo, authored by Eric, reviewed via PR. Doug reads; he does not edit.
- **Versioned docs.** Single "latest" version only.
- **Changelog / release notes.** Out of scope.
- **Dev / internals explainers.** Parser internals, RLS, advisory locks, sync mechanics, schema — these stay in `docs/superpowers/specs/*` and are not surfaced under `/help`.
- **Concepts / vocabulary track.** Explanations live inline on operator pages, not in a separate "concepts" subtree.
- **External hosting (Notion / GitBook / external wiki).** Considered and rejected — divergence from `DESIGN.md` tokens and loss of in-repo review gate.
- **Separate docs framework (Nextra / Docusaurus / Fumadocs).** Considered and rejected — adds framework weight for 13 pages and a second theme to maintain.

---

## 3. Architecture

### 3.1 System overview

```
                          ┌──────────────────────────────────┐
                          │  app/help/                       │
                          │    layout.tsx  (requireAdmin)    │
                          │    page.mdx                      │
                          │    <category>/page.mdx           │
                          │    _components/                  │
                          │    _nav.ts                       │
                          │    errors/page.tsx  (catalog →)  │
                          └────────────┬─────────────────────┘
                                       │
                                       │ deep-link contract
                                       │ (messageFor().helpHref)
                                       ▼
              ┌────────────────────────────────────────────┐
              │  lib/messages/lookup.ts                    │
              │    messageFor(code) → MessageCatalogEntry  │
              │    (longExplanation + helpHref new in M12) │
              │    sourced from §12.4 catalog              │
              └────────────────────────────────────────────┘
                                       ▲
                                       │ called by
                                       │
              ┌────────────────────────┴───────────────────┐
              │  /admin surfaces                           │
              │    dashboard tooltips  ──→  /help/admin/*  │
              │    parse-warning rows  ──→  /help/admin/parse-warnings#<code>
              │    error toasts        ──→  /help/errors#<code>
              │    "Take the tour"     ──→  /help/tour     │
              └────────────────────────────────────────────┘
```

### 3.2 Pipeline choice

- **`@next/mdx` (native).** Three deps (`@next/mdx` + `@mdx-js/loader` + `@mdx-js/react`), all maintained by the Next.js team. Integrates with App Router via `pageExtensions: ['ts','tsx','mdx']` and a `withMDX()` wrapper in `next.config.ts`. No content-collections layer; no third-party docs framework.
- **Rationale.** 13 pages do not justify a framework. Reuses the existing `app/globals.css` Tailwind v4 theme tokens. Stays in the project's existing build pipeline (`pnpm build` produces static HTML for every page).

### 3.3 File layout

```
app/help/
  layout.tsx                    # shared chrome: sidebar, header, theme toggle, requireAdmin gate
  page.mdx                      # /help (landing)
  getting-started/page.mdx
  daily-rhythm/page.mdx
  whats-different/page.mdx
  tour/page.mdx
  errors/page.tsx               # iterates §12.4 catalog → one anchored section per code
  admin/
    dashboard/page.mdx
    review-queues/page.mdx
    parse-warnings/page.mdx     # anchored sections per warning class
    per-show-panel/page.mdx
    preview-as-crew/page.mdx
    sharing-links/page.mdx
    onboarding-wizard/page.mdx
  _components/                  # underscore prefix → not a route per App Router convention
    Sidebar.tsx
    Header.tsx
    Breadcrumb.tsx
    Callout.tsx
    Step.tsx
    Screenshot.tsx                # primary: renders <picture> with light/dark sources
    ScreenshotPlaceholder.tsx     # draft-only; lint-prohibited at v1 close-out
    RefAnchor.tsx
    TipFromSheets.tsx
  _nav.ts                       # single source for sidebar + breadcrumb + next/prev
mdx-components.tsx              # project-root, required by @next/mdx App Router integration
public/help/screenshots/        # WebP output of the capture harness; committed
scripts/help-screenshots.ts             # Playwright capture entry point
scripts/help-screenshots.manifest.ts    # per-surface { key, route, fixture, viewport, theme, waitFor }
```

### 3.4 Rendering posture

- **Dynamic at request time.** `app/help/layout.tsx` calls `requireAdmin()` (see §3.5), which runs Supabase queries (`auth.getUser()` + `rpc("is_admin")`) on every request. The auth gate forces the entire `/help/*` tree out of static prerender into the dynamic / on-demand path — same posture as `/admin`. MDX content itself is statically *compiled* (RSC output), but each request still pays the auth-gate roundtrip before the prerendered tree is served.
- **Client hydration only for:** theme toggle, sidebar current-page highlight. No other interactive elements in v1.
- **Mobile-first.** Single-column under 768px with sidebar collapsed into a top-of-page disclosure. Same 390px baseline as the crew page.

### 3.5 Auth gating

- `app/help/layout.tsx` calls `lib/auth/requireAdmin.ts` (the existing helper at `lib/auth/requireAdmin.ts:52-126`). The helper uses `forbidden()` from `experimental.authInterrupts` for confirmed non-admin (auth-deny) and throws `AdminInfraError` (defined at `lib/auth/requireAdmin.ts:41-48`) for infra faults (server-client construction failure, `getUser()` throw or error, `is_admin` RPC throw or error).
- **AdminInfraError handling mirrors `app/admin/layout.tsx:47-71` verbatim.** The `/help` layout wraps `await requireAdmin()` in a try/catch, catches `AdminInfraError`, calls `messageFor(err.code as never)` against the live catalog (which already declares the `ADMIN_SESSION_LOOKUP_FAILED` entry), and renders the same cataloged 500-class surface (`data-testid="admin-layout-infra-error"` or a `help-layout-infra-error` sibling — implementation picks; behavior is identical). Confirmed non-admin → `forbidden()` 403 still propagates.
- Phase 2 splits via route groups: `app/help/(admin)/layout.tsx` (gated, same `requireAdmin` + `AdminInfraError` catch) vs `app/help/(public)/layout.tsx` (no auth gate, static prerender restored). No URL changes; mobile/crew users can be opened to `/help/crew/*` without touching the admin tree.

### 3.6 Screenshot harness (new in revision 2; reproducibility hardening in r3)

Real screenshots ship in v1. Capture is scripted, deterministic, and reproducible.

#### 3.6.1 Pipeline

1. **Manifest** at `scripts/help-screenshots.manifest.ts` is the single source of truth. Per-entry shape: `{ key, route, fixture, viewport, theme, waitFor, captureSelector?, expectStableMs? }`. `<Screenshot key="...">` references manifest keys.
2. **Capture script** at `scripts/help-screenshots.ts` reads the manifest, drives Playwright through the **reproducibility preconditions** below, captures one screenshot per `{key, theme}` pair, and writes WebP output (quality 90) to `public/help/screenshots/<key>-{light,dark}.webp`.
3. **`<Screenshot>` component** at `app/help/_components/Screenshot.tsx` renders `<picture>` with `<source media="(prefers-color-scheme: dark)" srcset="…-dark.webp">` + a default `<img src="…-light.webp" alt={alt}>`. Reader's theme picks the variant automatically. AC-12.20 is enforced by a component-level test (§7.1 test 10).
4. **Invocation:** `pnpm screenshot:help` runs the full pipeline end-to-end on a clean checkout.

#### 3.6.2 Reproducibility preconditions (mandatory)

The capture script MUST establish each precondition before any screenshot is taken. Without these, "idempotent / byte-stable" is not achievable.

| Precondition | How | Source-of-truth |
| --- | --- | --- |
| **Dedicated Playwright project** | Add `screenshots-help` project to `playwright.config.ts` with its own `webServer` block, `use.timezoneId`, `use.locale`, `use.colorScheme`, `use.viewport`, and a `globalSetup` that runs the env + seed steps below. | `playwright.config.ts` (existing patterns for `e2e-dev` / `e2e-prod` are the template) |
| **Test-auth env at server start** | `ENABLE_TEST_AUTH=true` and `TEST_AUTH_SECRET=<fixture>` must be set for the `webServer` Playwright launches. Same contract enforced by `app/api/test-auth/set-session/route.ts`. | `tests/e2e/helpers/signInAs.ts:1-23` documents the env requirement |
| **DB seed before capture** | `globalSetup` runs `pnpm db:seed` (the existing seed script) so every manifest entry's named fixture (default `RPAS Central 2026`) is present at known state. | Existing E2E seed pattern; reuse, don't re-invent |
| **Sign in via reusable helper** | Capture script calls `signInAs(page, adminFixture)` from `tests/e2e/helpers/signInAs.ts` — no parallel admin-login implementation. | `tests/e2e/helpers/signInAs.ts:43-73` |
| **Deterministic browser settings** | `timezoneId: 'America/New_York'`, `locale: 'en-US'`, `colorScheme` set per manifest entry, `reducedMotion: 'reduce'`, font hinting disabled via `chromium` launch flags (e.g., `--font-render-hinting=none --disable-skia-runtime-opts`), animations explicitly disabled via CSS injection (`* { animation: none !important; transition: none !important; }`). | All standard Playwright config; values pinned in the `screenshots-help` project. |
| **Quiescence wait** | After navigation, await `waitFor` selector AND `page.waitForLoadState('networkidle')` AND optional `expectStableMs` settle period (default 500 ms). Captures only after a frame is rendered post-quiescence. | Manifest-driven |
| **Theme application** | For each entry, run twice: once with `colorScheme: 'light'` + `<html data-theme="light">` set via `addInitScript`, once with `dark` equivalent. Theme is *imposed*, not inferred from OS. | App's existing `data-theme` mechanism |
| **Output normalization** | WebP output via `sharp` with fixed encoder settings (`q=90`, `effort=4`, `smartSubsample=true`, `nearLossless=false`). Pinning encoder version prevents the same pixels from producing different bytes across machines. | `package.json` pins `sharp` version; CI uses the same version. |

#### 3.6.3 CI drift gate

A CI step runs `pnpm screenshot:help` against a clean checkout, then `git diff --exit-code public/help/screenshots/`. **Non-zero exit fails the PR.** This is the load-bearing drift signal — if a UI change shifts a documented surface, the PR cannot merge without regenerated screenshots. AC-12.19 (idempotency) is what makes this safe: a second run on unchanged UI is byte-identical.

#### 3.6.4 Defaults (not relitigated)

| Decision | Value | Rationale |
| --- | --- | --- |
| Format | WebP, quality 90, fixed `sharp` encoder settings (see 3.6.2) | Repo-committable size; reproducible encoder output |
| Density | Single representative rendition (no `1x`/`2x` split) | Manifest names viewport; one crisp WebP per theme |
| Storage | Committed to `public/help/screenshots/` | Version-controlled with docs; no external pipeline |
| Theme variants | **Both required**; light + dark always paired via imposed `data-theme` | PRODUCT.md "both modes first-class" |
| Viewport | Per-manifest. Default desktop 1280×800; mobile-flow surfaces 390×844 | Surface-appropriate |
| Fixture | `RPAS Central 2026` default; manifest may override per-entry | Most populated 2026 sheet |
| Drift detection | Git diff on WebP bytes + CI `git diff --exit-code` gate (§3.6.3) | Automatic, unmissable |

#### 3.6.5 Authoring scaffold (separate from shipped state)

`<ScreenshotPlaceholder>` is preserved as a **draft-only** component for pages being written before the underlying surface stabilizes. It must not appear in any MDX file at v1 close-out — lint enforces (§7.1 test 7).

---

## 4. Content inventory (v1)

### 4.1 Adoption track (read-once, narrative)

| Route | Purpose |
| --- | --- |
| `/help` | Landing. "What this app does for you," elevator-pitch, three jump-buttons into the next three pages. Also the "Take the tour" target from §9.0.1. |
| `/help/getting-started` | First-time setup mirroring §9.0 wizard. Mostly historical post-onboarding, kept for reference / successor handoff. |
| `/help/daily-rhythm` | "Your new check-in routine": open `/admin`, scan Active Shows, glance at review queues, address anything yellow. |
| `/help/whats-different` | Explicit Sheets-vs-FXAV diff. Same / automated / new. |

### 4.2 Capability reference (one page per operator surface)

| Route | Surface it documents | Spec section it mirrors |
| --- | --- | --- |
| `/help/admin/dashboard` | `/admin` dashboard, status badges, the two review-queue panels | §9.1, §9.1.1 |
| `/help/admin/review-queues` | First-seen vs. re-stage, Apply vs. Discard semantics | §9.1, §9.1.1, §5.2 routing |
| `/help/admin/parse-warnings` | One anchored section per warning class from §12.4 | §9.2 sub-section 2, §12.4 |
| `/help/admin/per-show-panel` | `/admin/show/<slug>` (sync health, warnings, preview links) | §9.2 |
| `/help/admin/preview-as-crew` | `/admin/show/<slug>/preview/<crew-id>` impersonation; role-based hiding explained in operator terms | §9.3, §7.4 |
| `/help/admin/sharing-links` | Signed crew-page link generation and distribution; what crew see; wrong-recipient handling | §7.2 |
| `/help/admin/onboarding-wizard` | §9.0 folder-share flow reference | §9.0 |

### 4.3 Capability tour & errors

| Route | Purpose |
| --- | --- |
| `/help/tour` | One-paragraph-per-surface tour with anchored links to each reference page. Linked from `/help` and from §9.0.1 footer "Take the tour". |
| `/help/errors` | TSX page that iterates the §12.4 catalog and renders one `<RefAnchor id={code}>` section per code. Each section shows `title` + `longExplanation` + "If this keeps happening, tell Eric →" link. |

**Total: 13 pages.**

### 4.4 Pages explicitly NOT in v1

Crew-facing pages, concepts/vocabulary track, internals explainers, versioned docs, changelog, in-app editor. See §2 for full deferral list.

---

## 5. Deep-link contract

### 5.1 `MessageCatalogEntry` schema extension

The catalog uses the existing `messageFor` accessor (not a new `lookup`). Live shape per `lib/messages/lookup.ts:11` and `lib/messages/catalog.ts:1-8`:

```ts
// lib/messages/lookup.ts
export function messageFor(code: MessageCode, params?: MessageParams): MessageCatalogEntry;

// lib/messages/catalog.ts
export type MessageCatalogEntry = {
  code: string;
  severity?: "info" | "warning";
  dougFacing: string | null;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
};
```

`messageFor` keeps its signature; the **return type gains two new fields**:

```ts
export type MessageCatalogEntry = {
  code: string;
  severity?: "info" | "warning";
  dougFacing: string | null;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
  longExplanation: string | null;   // NEW in M12
  helpHref: string | null;          // NEW in M12
};
```

Both new fields are declared `string | null` (matching the existing field shape — uniform with `dougFacing`/`crewFacing`/`followUp`/`helpfulContext`). Existing callers continue to compile: TS sees the type widen but every caller pre-r3 ignores these properties.

**Required-when predicate:** `severity !== "info"`.

This is the load-bearing change from r2. Live `components/admin/AlertBanner.tsx:39-50` treats only `severity === "info"` as excluded from the alert banner; unset severity is rendered as warning-equivalent. Many user-visible entries currently omit `severity` (e.g., `LEAKED_LINK_DETECTED` at `lib/messages/catalog.ts:46-53`). The r2 predicate (`severity === "warning"`) would have let those ship without docs, breaking the §9.0.1 "every error has a help link" affordance. The corrected predicate covers them.

| Field | Type | Required when | Purpose |
| --- | --- | --- | --- |
| `longExplanation` | `string \| null`; non-null required | `severity !== "info"` AND (`dougFacing` is non-null OR `crewFacing` is non-null) | Long-form plain-language explanation; rendered on `/help/errors#<code>` |
| `helpHref` | `string \| null`; non-null required | Same predicate as above | Deep-link target for "Learn more →" links |

The compound predicate excludes catalog entries that have severity but no user-visible string (defensive — currently none, but future-proofs against records that are alerts-only). Info-tier entries are not required to carry docs but may opt in; the meta-test does not require them.

A meta-test (`tests/messages/_metaErrorCatalogDocs.test.ts`) asserts the contract. New codes added without docs fail CI.

### 5.2 Affordance wiring (retrofits to earlier milestones)

| Affordance | Spec section | What this milestone adds |
| --- | --- | --- |
| Section header "?" tooltip | §9.0.1 | Trailing "Learn more →" link to the relevant `/help/...` page. Conditional on `helpHref` presence; degrades cleanly when absent. |
| Parse warning row | §9.2 | Sibling `Learn more →` button next to "Report this to Eric"; resolves to `/help/admin/parse-warnings#<code>` via `messageFor(code).helpHref`. |
| Error toast / banner | §12.4 | Inline `Learn more →` when `messageFor(code).helpHref` is non-null. Single change point in the rendering helper. |
| Dashboard footer "Take the tour" | §9.0.1 | `<Link href="/help/tour">Take the tour →</Link>`. |
| "What does this mean?" expansion on errors | §9.0.1 | Body text stays as the M9/M10-shipped copy; appended `Learn more →` link to `/help/errors#<code>`. |

The retrofit is **link-only**. This milestone does not change the text content of any tooltip, error message, or expansion shipped by M4/M9/M10.

### 5.3 `?ref=` analytics convention

Links from `/admin` into `/help` may carry `?ref=<source-surface>` (e.g., `?ref=parse-panel`). Pure read-side; no behavior depends on it. Useful for observing which surfaces drive help traffic without per-link instrumentation. Optional, not required.

### 5.4 Slug stability invariant

Page slugs and anchor IDs under `/help/*` are **committed contracts**. Renaming any slug or anchor requires a redirect entry in the same change. The build-time anchor resolver (§7.1 test 1) fails CI on any `helpHref` that points at a missing anchor or page.

### 5.5 Auth interaction with deep-links

A non-admin who hits a deep-linked `/help/...` URL gets the same `forbidden()` 403 as bare `/help`. Acceptable: only Doug should be following these links from inside `/admin`. Phase 2 will allow `/help/crew/*` to bypass auth without affecting admin links.

---

## 6. Components

### 6.1 Page chrome

| Component | Purpose | File |
| --- | --- | --- |
| `<Sidebar>` | Left-rail nav with current-page highlight; collapses to top-of-page `<details>` disclosure under 768px | `app/help/_components/Sidebar.tsx` |
| `<Header>` | Logo, theme toggle, "Back to admin →" link | `app/help/_components/Header.tsx` |
| `<Breadcrumb>` | Group → page; derived from `_nav.ts` | `app/help/_components/Breadcrumb.tsx` |

### 6.2 MDX components

| Component | Purpose | File |
| --- | --- | --- |
| `<Callout type>` | `note` / `warning` / `tip` — colored block using `app/globals.css` palette tokens. Each type has a fixed icon + heading color. | `app/help/_components/Callout.tsx` |
| `<Step n>` | Numbered procedural step. Used in adoption-track and onboarding-wizard pages. | `app/help/_components/Step.tsx` |
| `<Screenshot key>` | Renders `<picture>` with light/dark WebP sources from `public/help/screenshots/<key>-{light,dark}.webp`. Key must exist in the manifest at `scripts/help-screenshots.manifest.ts`. Required props: `key`, `alt`. Optional: `caption`. | `app/help/_components/Screenshot.tsx` |
| `<ScreenshotPlaceholder>` | **Draft-only.** Labeled empty box for pages authored before the underlying surface exists. Must not appear in any MDX file at v1 close-out — lint enforces (§7.1 test 7). | `app/help/_components/ScreenshotPlaceholder.tsx` |
| `<RefAnchor id>` | Stable anchor wrapper for catalog deep-links; renders as a heading with `id={id}` and a click-to-copy link icon. | `app/help/_components/RefAnchor.tsx` |
| `<TipFromSheets>` | Adoption-track aside: "In your old workflow, you'd … now …" framing. Distinct background color so it reads as a side-note, not body. | `app/help/_components/TipFromSheets.tsx` |

### 6.3 Guard conditions per component

| Component | Null prop | Empty prop | Edge case |
| --- | --- | --- | --- |
| `<Callout>` | `type` is required; missing → TypeScript error, never reaches runtime. `children` optional → renders empty bubble (acceptable). | n/a | Unknown `type` value → defaults to `note` styling (defensive). |
| `<Step>` | `n` is required; missing → TypeScript error. `children` required for content. | Empty children → renders empty step (acceptable for skeleton drafts). | `n=0` or negative → renders as given; spec does not constrain values. |
| `<Screenshot>` | `key` and `alt` required; `caption` optional. Missing → TS error. | Empty `key` → build fails (manifest lookup throws). | Manifest key without on-disk WebP → screenshot-coverage test fails (§7.1 test 8). |
| `<ScreenshotPlaceholder>` | `alt` required for a11y. `caption` optional. | Missing `alt` → TypeScript error. | Width/height fixed via CSS aspect-ratio. **Lint-prohibited in shipped v1 MDX (§7.1 test 7).** |
| `<RefAnchor>` | `id` required, must match regex `/^[A-Z_]+$/` (catalog code shape). | Empty `id` → build-time anchor-resolver fails. | Duplicate `id` on same page → React duplicate-key warning + anchor-resolver flags as ambiguous. |
| `<TipFromSheets>` | `children` required; empty → renders empty aside (acceptable). | n/a | n/a |
| `<Sidebar>` | Reads from `_nav.ts` (no props). Current page derived from `usePathname()`. | If `_nav.ts` is empty → sidebar renders empty container (covered by `_metaNavSync` test). | n/a |
| `<Breadcrumb>` | Reads `_nav.ts`. If current path not in `_nav.ts` → renders only the "Help" root crumb (degrades cleanly). | n/a | n/a |
| `<Header>` | No props. Theme toggle reads `localStorage` + `prefers-color-scheme`. | n/a | First paint before hydration → respects `prefers-color-scheme` to avoid FOUC. |

All components honor `prefers-reduced-motion`. None have motion in v1 (the contract is fixed for future additions). All meet WCAG AA contrast minimum per PRODUCT.md; AAA where cheap.

---

## 7. Testing strategy

### 7.1 Test inventory

1. **Build-time anchor resolver** (load-bearing for §5.4 slug-stability invariant)
   - Vitest test at `tests/help/anchor-resolver.test.ts`
   - For every catalog entry with `helpHref`, parses the target file (MDX or TSX) and confirms a matching `<RefAnchor id="<anchor>">` exists
   - Fails CI on any broken deep-link
   - **Anti-tautology:** reads catalog source as the assertion side; reads MDX/TSX file as the page-under-test. The two cannot self-satisfy.

2. **Catalog meta-test** (`tests/messages/_metaErrorCatalogDocs.test.ts`)
   - Asserts: every catalog entry where `severity !== "info"` AND (`dougFacing != null` OR `crewFacing != null`) has `longExplanation` (non-null, non-empty) AND `helpHref` (non-null, matching `/^\/help\/.+/`) populated
   - Predicate explicitly covers both `severity === "warning"` and entries with unset severity (per `components/admin/AlertBanner.tsx:39-50` default-warning rule)
   - Mirrors the existing `_metaAdminAlertCatalog.test.ts` pattern (per AGENTS.md meta-test inventory invariant)
   - Catches new error codes added without docs entries

3. **Auth-gating + AdminInfraError mapping** (`tests/help/auth.test.ts`)
   - Unauthenticated GET on `/help/`, `/help/admin/dashboard`, `/help/errors`, `/help/tour` → 403
   - Authenticated-as-admin GET on the same → 200
   - Authenticated-as-crew (signed-link viewer) → 403 in v1 (phase-2 will relax for `/help/crew/*` only)
   - **AdminInfraError mapping:** with the Supabase RPC stubbed to throw, GET on `/help/` returns the cataloged 500-class surface (matching the `data-testid="admin-layout-infra-error"` or `help-layout-infra-error` sibling per §3.5) — verified by rendering `messageFor("ADMIN_SESSION_LOOKUP_FAILED").dougFacing` text. Mirrors the existing `/admin` infra-error behavior test pattern.

4. **MDX smoke test** (`tests/help/render.test.ts`)
   - Every `.mdx` and `.tsx` page under `app/help/` returns a non-empty rendered HTML body via the Next.js test renderer
   - Catches malformed MDX, missing required components, broken imports

5. **Nav consistency meta-test** (`tests/help/_metaNavSync.test.ts`)
   - Every entry in `_nav.ts` resolves to a real route under `app/help/`
   - Every route under `app/help/` is referenced in `_nav.ts`
   - Prevents orphan pages and dead nav entries

6. **Mobile-layout Playwright test** (`tests/playwright/help-mobile.spec.ts`)
   - Viewport: 390 × 844
   - Navigates to a representative content page (`/help/admin/dashboard`)
   - Asserts: sidebar is collapsed (top-of-page `<details>`); body content `width <= 390 - 2 * gutter`; no horizontal scroll (`document.documentElement.scrollWidth === window.innerWidth`); every interactive target ≥ 44 × 44 px
   - **Real-browser assertion** — jsdom is insufficient per the project's Tailwind v4 flex-stretch lesson

7. **No-placeholder-in-shipped-v1 lint** (`tests/help/no-placeholders.test.ts`)
   - Greps `app/help/**/*.mdx` for `<ScreenshotPlaceholder` and fails if found
   - Forces every documented surface to ship with a real `<Screenshot key="...">` referencing a manifest entry
   - Inverts the previous (revision-1) lint, which prohibited real screenshots

8. **Screenshot coverage** (`tests/help/screenshot-coverage.test.ts`)
   - For every `<Screenshot key="...">` reference across `app/help/**/*.mdx`, asserts: (a) the key exists in `scripts/help-screenshots.manifest.ts`, (b) both `<key>-light.webp` and `<key>-dark.webp` exist on disk under `public/help/screenshots/`, (c) both files are non-empty
   - Anti-tautology: assertion reads MDX source + manifest source + filesystem; the rendered page is not the side of the test

9. **Manifest integrity** (`tests/help/_metaScreenshotManifest.test.ts`)
   - Every manifest entry's `route` resolves to a real page under `app/help/`
   - Every manifest entry has both light + dark output on disk
   - Every fixture named in a manifest entry exists in `fixtures/shows/`
   - Catches stale manifest entries (UI deleted but manifest not pruned) and orphan WebP files (output for a removed entry)

10. **`<Screenshot>` `<picture>` contract test** (`tests/help/screenshot-picture-contract.test.ts`)
    - Renders `<Screenshot key="<test-key>" alt="<test-alt>" />` against a stub manifest with a known key
    - Asserts the rendered output contains `<picture>` with a `<source media="(prefers-color-scheme: dark)" srcset="…-dark.webp">` and a default `<img src="…-light.webp" alt="<test-alt>">`
    - **Anti-tautology:** assertion reads the rendered HTML from the component; the snapshot/regex specifically pins both the media query string and the WebP path pattern. A broken `<picture>` rendering cannot pass because the absence of either element would fail the regex.
    - Directly enforces AC-12.20 — without this test, the `<picture>` contract has only the visual fixtures to prove it works.

11. **CI drift gate** (CI workflow step, not a unit test)
    - CI runs `pnpm screenshot:help` against a clean checkout (with `pnpm db:seed` precondition)
    - Then `git diff --exit-code public/help/screenshots/`
    - Non-zero exit → PR fails. The PR review surface shows the diff.
    - This is the load-bearing drift signal; idempotency (AC-12.19) is what makes it safe.

### 7.2 Anti-tautology guardrails

- Anchor resolver (test 1) reads the **catalog source**, not the rendered `/help/errors` page. A broken `<RefAnchor>` cannot self-satisfy because assertion side and page-under-test are different files.
- Nav consistency (test 5) reads the **filesystem**, not the rendered `<Sidebar>` DOM. Same separation.
- Auth-gating (test 3) asserts HTTP status codes from the Next.js server response, not from DOM scraping. A broken `requireAdmin` cannot pass by accident.

### 7.3 Out of scope for v1 testing

- Full-text search testing (no search in v1).
- **Pixel-diff screenshot regression** — v1 detects drift via git diff on WebP bytes (any changed pixel produces a non-empty diff in the PR). Pixel-level comparison with thresholds (e.g., `pixelmatch`) is a phase-1.5 candidate if false-positive churn becomes a problem.
- A11y full audit beyond AA contrast + 44 × 44 px targets — this is the impeccable v3 audit's territory, not unit-test territory.
- Performance / Lighthouse benchmarks — covered by the broader app's perf pipeline, not duplicated here.

---

## 8. Plan-wide invariants this milestone interacts with

(See AGENTS.md for full text. Listed here for the implementer's preflight.)

| Invariant | This milestone | Notes |
| --- | --- | --- |
| **#1 TDD per task** | Applies | Each component + each test gets its own red → green → commit loop. |
| **#2 Per-show advisory lock** | n/a | `/help/*` does no DB write paths against `shows` / `crew_members` / etc. |
| **#3 Email canonicalization** | n/a | No email handling. |
| **#4 No global sync cursor** | n/a | No sync code. |
| **#5 No raw error codes in user-visible UI** | Applies | `/help/errors` renders codes **as anchor IDs only**, never as visible text. The visible heading per error is the catalog `title`; the code shows up in the URL fragment. |
| **#6 Commit per task** | Applies | Authoring all 13 pages is ~13–20 commits depending on slicing. The plan slices accordingly. |
| **#7 Spec is canonical** | Applies | Any disagreement with the crew-pages spec is resolved in favor of the crew-pages spec. |
| **#8 UI quality gate (impeccable v3)** | Applies | Every `/help/*` page is a UI surface. `/impeccable critique` + `/impeccable audit` are mandatory before milestone close-out. Findings + dispositions go in §12 of the milestone's handoff doc. |
| **#9 Supabase call-boundary** | **Applies** | `/help/layout.tsx` calls `requireAdmin()`, which makes Supabase queries (`auth.getUser()` + `rpc("is_admin")`). Same single-call-site pattern as `/admin/layout.tsx`. Both error paths (returned-error and thrown) are already distinguished inside `requireAdmin`; the layout catches `AdminInfraError` and renders a cataloged 500-class surface per §3.5. No new Supabase call sites are introduced by this milestone (the helper is the boundary). Meta-test registry coverage: `requireAdmin` is already registered in `tests/auth/_metaInfraContract.test.ts` — no new registry entry required, but reviewer should grep to confirm post-implementation. |

---

## 9. Flag lifecycle table

This milestone introduces no new boolean config flags. The only new fields on the §12.4 catalog (`longExplanation`, `helpHref`) are strings, not flags.

| Storage | Write path | Read path | Effect on output |
| --- | --- | --- | --- |
| n/a (no new flags) | — | — | — |

The optional `?ref=<source-surface>` query param (§5.3) is **not a flag** — it is read-only telemetry. No code path branches on it.

---

## 10. Open implementation questions (deferred to writing-plans, not to user)

1. **Catalog file location.** Where exactly the §12.4 catalog lives today (`lib/messages/catalog.ts`? `lib/messages/codes.ts`? something else). Implementation reads existing source-of-truth.
2. **Sidebar primitive reuse.** Whether `<Sidebar>` reuses an existing `/admin` nav primitive or is bespoke. Implementation surveys the codebase.
3. **`_nav.ts` shape.** Flat array of `{slug,title,group}` vs. nested groups. Implementation picks based on what reads cleanest with current TS conventions.
4. **Anchor resolver invocation.** Whether the build-time anchor resolver runs as a `prebuild` script (in `package.json`) or as a vitest test in CI. Implementation picks based on existing build hooks.
5. **Theme toggle reuse.** Whether `<Header>`'s theme toggle reuses the same component the crew page uses, or duplicates the pattern.
6. **Recapture obligation for downstream milestones.** When a post-M12 milestone changes a UI surface documented in `/help`, that milestone's plan must include a "regenerate screenshots" task. The CI drift gate (§3.6.3 / §7.1 item 11) is the automatic signal — the PR will fail until `pnpm screenshot:help` is rerun and the new bytes are committed. Plan-writing decision per downstream milestone, not spec-blocking.

(R3 note: open questions 6 (test-auth helper reuse) and the screenshot-harness reproducibility shape — both flagged in round 1 — are resolved upstream in §3.6.2. `signInAs` from `tests/e2e/helpers/signInAs.ts:43-73` is the canonical helper.)

These are all "consult the codebase" calls. None changes the design.

---

## 11. Disagreement-loop preempt

(Per AGENTS.md / global guidance: contracts the reviewer is likely to relitigate; cited so the handoff §6 watchpoints can pre-load.)

| Contract | Resolution in this spec | Cite |
| --- | --- | --- |
| **Hosting choice** (in-app vs. external) | In-app `/help/*` chosen explicitly. External hosted wikis considered and rejected (§2). | §2, §3.2 |
| **Framework choice** (`@next/mdx` vs. Nextra/Fumadocs) | Native `@next/mdx` chosen explicitly. Framework alternatives considered and rejected for 13-page surface. | §2, §3.2 |
| **Screenshots in v1** | **Real screenshots ship in v1** via scripted Playwright harness (§3.6). Light + dark always paired via `<picture>` + `prefers-color-scheme`. WebP q90, committed. `<ScreenshotPlaceholder>` is draft-only and lint-prohibited at v1 close-out. | §3.6, §6.2, §7.1 tests 7–9 |
| **M12 milestone sequencing** | M12 starts only after M10 closes. Real screenshots require their documented surfaces (M3 / M4 / M9 / M10) to be built and stable. | §1 metadata |
| **Search in v1** | No full-text search. Sidebar + Ctrl-F is sufficient for 13 pages. | §2 |
| **Auth gating breadth** | All of `/help/*` is admin-gated in v1. Phase 2 splits via route groups; URLs do not change. | §3.5 |
| **`/help/errors` rendering** | TSX page iterating the catalog. MDX considered and rejected (would duplicate the short message). | §4.3 |
| **`/help/admin/parse-warnings` rendering** | MDX with anchored sections. TSX considered and rejected (content is editorial). | §4.2 |
| **Catalog API surface** | The accessor is `messageFor(code): MessageCatalogEntry` (per `lib/messages/lookup.ts:11`). M12 does NOT introduce a new `lookup` function — it extends the existing `MessageCatalogEntry` type (per `lib/messages/catalog.ts:1-8`) with two new optional fields. **Per round-1 finding 1.** | §5.1 |
| **Catalog schema extension shape** | Two new fields: `longExplanation: string \| null` and `helpHref: string \| null`. Required when `severity !== "info"` AND (`dougFacing != null` OR `crewFacing != null`). The `severity !== "info"` predicate covers both `"warning"` and unset severity, matching the live `AlertBanner` default-warning rule at `components/admin/AlertBanner.tsx:39-50`. **r2's `severity === "warning"` predicate was wrong (round-1 finding 3); corrected here.** Enforced by meta-test. | §5.1 |
| **Rendering posture** | **Dynamic at request time** for `/help/*` (not statically prerendered). `requireAdmin()` runs Supabase queries on every request. MDX content is statically compiled to RSC; the layout gate is dynamic. **Per round-1 finding 2.** | §3.4 |
| **`AdminInfraError` handling on `/help`** | Mirrors `app/admin/layout.tsx:47-71` verbatim. `/help/layout.tsx` wraps `requireAdmin()` in try/catch, catches `AdminInfraError`, renders the cataloged 500-class surface via `messageFor("ADMIN_SESSION_LOOKUP_FAILED")`. Test #3 verifies. **Per round-1 finding 2.** | §3.5, §7.1 test 3 |
| **Screenshot harness reproducibility** | The harness specifies a dedicated Playwright project, `globalSetup` running `pnpm db:seed`, reuse of `signInAs` from `tests/e2e/helpers/signInAs.ts`, pinned `sharp` encoder settings, deterministic browser settings (timezone, locale, color-scheme, reduced motion, font hinting, animations off), quiescence wait, and a CI `git diff --exit-code` gate. **Per round-1 finding 4.** | §3.6.2, §3.6.3 |
| **Concept track** | Excluded from v1. Explanations live inline on operator pages. | §2 |
| **Doug as bug-report triager** | **No.** Doug receives content questions from crew via his existing channels (phone/text); app bug reports route to Eric via M8 GitHub pipeline. `/help` covers no bug-triage surface. | (Resolved during brainstorm; codified here.) |
| **`Learn more →` text vs. icon** | Implementation chooses based on `impeccable` audit; spec does not constrain. | §10 |

---

## 12. Existing-code citations

(Per AGENTS.md self-review additions: every factual claim about current code MUST cite `file:line`.)

| Claim | Citation | Verified |
| --- | --- | --- |
| `experimental.authInterrupts` is enabled, enabling `forbidden()` | `next.config.ts:17` | ✅ |
| `requireAdmin()` and `requireAdminIdentity()` exist, throw `AdminInfraError` on infra paths, call `forbidden()` on auth-deny | `lib/auth/requireAdmin.ts:41-48` (`AdminInfraError` class) and `:52-126` (`requireAdminIdentity`) | ✅ |
| Existing admin layout catches `AdminInfraError` and renders cataloged 500-class surface | `app/admin/layout.tsx:47-71` | ✅ |
| `messageFor(code): MessageCatalogEntry` is the live catalog accessor (NOT `lookup`) | `lib/messages/lookup.ts:11` | ✅ |
| `MessageCatalogEntry` shape: `{ code, severity?, dougFacing, crewFacing, followUp, helpfulContext }` | `lib/messages/catalog.ts:1-8` | ✅ |
| `severity` is OPTIONAL on catalog entries; many user-visible codes omit it (e.g. `LEAKED_LINK_DETECTED`) and are rendered as warning-equivalent | `lib/messages/catalog.ts:46-53`; default-warning rule at `components/admin/AlertBanner.tsx:39-50` | ✅ |
| Test-auth pattern: `signInAs(page, fixture)` POSTing to `/api/test-auth/set-session` with `Authorization: Bearer ${TEST_AUTH_SECRET}` | `tests/e2e/helpers/signInAs.ts:43-73` | ✅ |
| `ENABLE_TEST_AUTH` + `TEST_AUTH_SECRET` env vars required at server start for test-auth | `tests/e2e/helpers/signInAs.ts:1-23` (documentation block) | ✅ |
| `ADMIN_SESSION_LOOKUP_FAILED` is the cataloged code thrown by `AdminInfraError` | `lib/auth/requireAdmin.ts:42` | ✅ |
| App Router uses `app/` not `pages/` | `app/layout.tsx` exists; `app/admin/`, `app/api/`, `app/show/` exist | ✅ |
| Tailwind v4 is in use, with `app/globals.css` `@theme` tokens | AGENTS.md global-rules § (the flex-stretch warning) | ✅ |
| Existing crew-pages spec section §9.0.1 mandates the "?" / "What does this mean?" / "Take the tour" affordances | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2540–2549` | ✅ |
| §12.4 is the error-code catalog | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2681` heading | ✅ |
| §9.2 parse-warnings panel is at `/admin/show/<slug>` | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2581` heading | ✅ |
| `/admin/show/<slug>/preview/<crew-id>` is the impersonation route | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2596` heading | ✅ |
| `pageExtensions` is the App Router escape hatch for MDX routing | `@next/mdx` documentation; standard Next 16 pattern | n/a (Next.js framework convention) |
| `requireAdmin` is the project's existing admin gate (not a new helper) | next.config.ts comment block confirms its existence | ✅ |

The exact file/line for `requireAdmin.ts` and the catalog-codes file are **deferred to the implementation phase** — implementation begins by reading the existing source-of-truth files. The spec does not name internal lines that would rot if the catalog file is moved.

---

## 13. Acceptance criteria

| ID | Criterion |
| --- | --- |
| **AC-12.1** | All 13 pages under `app/help/*` exist and render non-empty HTML at build time. |
| **AC-12.2** | `app/help/layout.tsx` gates the tree to admin via `requireAdmin()`. Unauthenticated and crew requests → 403. |
| **AC-12.3** | Sidebar renders on every `/help/*` page; current page is visually highlighted; collapses to top-of-page disclosure under 768 px. |
| **AC-12.4** | Theme toggle is present in `<Header>` on every page and respects `prefers-color-scheme` on first paint. |
| **AC-12.5** | `MessageCatalogEntry` (declared in `lib/messages/catalog.ts:1-8`) is extended with `longExplanation: string \| null` and `helpHref: string \| null` per §5.1. `messageFor` signature unchanged; all existing callers continue to compile. |
| **AC-12.6** | Every §12.4 catalog entry where `severity !== "info"` AND (`dougFacing != null` OR `crewFacing != null`) has `longExplanation` (non-null, non-empty) AND `helpHref` (non-null, `^/help/...`) populated; meta-test (§7.1 test 2) enforces. |
| **AC-12.7** | The build-time anchor resolver passes — every `helpHref` resolves to a real `<RefAnchor>` on a real page. |
| **AC-12.8** | Parse-warning rows in the §9.2 panel render a `Learn more →` link when `helpHref` is present. |
| **AC-12.9** | Dashboard tooltips per §9.0.1 render a trailing `Learn more →` link when their mapped page exists. |
| **AC-12.10** | Dashboard footer renders `Take the tour →` linking to `/help/tour`. |
| **AC-12.11** | `/help/errors` iterates the catalog and renders one anchored section per entry matching the AC-12.6 predicate (i.e., every entry that would surface to a user). |
| **AC-12.12** | All 10 unit/integration tests in §7.1 pass; nav-consistency, anchor-resolver, screenshot-coverage, manifest-integrity, and `<picture>`-contract tests are red on the conditions they guard. CI drift gate (§7.1 item 11) is wired and fails on uncommitted screenshot drift. |
| **AC-12.13** | `/impeccable critique` and `/impeccable audit` pass on every `app/help/*` page (per invariant #8). |
| **AC-12.14** | No `<ScreenshotPlaceholder>` references in `app/help/**/*.mdx` at v1 close-out (lint enforces, §7.1 test 7). Every documented surface ships with a real `<Screenshot key="...">`. |
| **AC-12.15** | Mobile Playwright test at 390 × 844 passes the dimensional + no-horizontal-scroll + 44 × 44 px-target assertions. |
| **AC-12.16** | No new boolean flags, no new env vars, no new Supabase tables. (Screenshot harness reuses existing Playwright config; no new env vars.) |
| **AC-12.17** | All milestone work is committed in conventional-commits format (`feat(help): …`, `test(help): …`, etc.) per invariant #6. |
| **AC-12.18** | `scripts/help-screenshots.manifest.ts` exists and is the single source of truth for every documented surface. Every `<Screenshot key>` reference resolves to a manifest entry. |
| **AC-12.19** | `scripts/help-screenshots.ts` (the capture script) runs end-to-end via `pnpm screenshot:help` against a clean checkout and produces every manifest entry's light + dark WebP output. Idempotent: a second run on unchanged UI produces byte-identical output. |
| **AC-12.20** | `<Screenshot>` MDX component renders `<picture>` with a `(prefers-color-scheme: dark)` `<source>` and a default light `<img>`. Reader's theme picks the variant automatically. |
| **AC-12.21** | Manifest-integrity meta-test (§7.1 test 9) passes: no stale entries, no orphan WebPs, every named fixture exists in `fixtures/shows/`. |
| **AC-12.22** | M12 work begins only after M10 closes (sequencing constraint, recorded in milestone-routing handoff). |
| **AC-12.23** | `/help/*` renders dynamically (not statically prerendered) — auth gate runs Supabase queries per request. Verified by the auth-gating test (#3) observing distinct responses for admin vs. unauthenticated vs. AdminInfraError-stubbed cases. |
| **AC-12.24** | `app/help/layout.tsx` catches `AdminInfraError` and renders the cataloged 500-class surface via `messageFor("ADMIN_SESSION_LOOKUP_FAILED").dougFacing`. Mirrors `app/admin/layout.tsx:47-71`. Test #3 verifies. |
| **AC-12.25** | `<Screenshot>` `<picture>` contract test (§7.1 test 10) passes — output contains `<source media="(prefers-color-scheme: dark)" srcset="…-dark.webp">` and a default light `<img>` with the provided `alt`. |
| **AC-12.26** | CI drift gate is wired: a CI step runs `pnpm screenshot:help` against a clean checkout, then `git diff --exit-code public/help/screenshots/`. PR fails on non-zero exit. |
| **AC-12.27** | The `screenshots-help` Playwright project in `playwright.config.ts` declares: a dedicated `webServer` with `ENABLE_TEST_AUTH=true` + `TEST_AUTH_SECRET` env, a `globalSetup` running `pnpm db:seed`, deterministic browser settings (`timezoneId`, `locale`, `colorScheme`, `reducedMotion`, font-render-hinting=none, animations-off CSS injection), and reuses `signInAs` from `tests/e2e/helpers/signInAs.ts`. |
| **AC-12.28** | The `messageFor` signature is unchanged. Existing call sites (e.g., `app/admin/layout.tsx:51`, `components/admin/AlertBanner.tsx`) continue to compile and behave identically. Only the return type widens. |

---

## 14. Appendix — relationship to phase 2

Phase 2 (`/help/crew/*`) is intentionally not designed here. When it lands:

1. Route-group split: `app/help/(admin)/layout.tsx` keeps `requireAdmin`; `app/help/(public)/layout.tsx` is unguarded.
2. Sidebar `_nav.ts` grows a `visibility: 'admin' | 'public' | 'both'` field per entry; the rendered sidebar filters by viewer role.
3. The crew-facing pages reuse all existing MDX components — no component rework.
4. The auth-gating test (§7.1 test 3) splits into admin-tree and public-tree variants.
5. URLs already established in M12 do not change.

No phase-2 work is in M12 scope.

---

*End of spec.*

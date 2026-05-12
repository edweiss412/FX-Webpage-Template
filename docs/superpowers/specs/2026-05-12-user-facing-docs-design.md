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
                                       │ (lookup().helpHref)
                                       ▼
              ┌────────────────────────────────────────────┐
              │  lib/messages/lookup.ts                    │
              │    returns { title, body, helpHref? }      │
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

- **Static.** Every `/help/*` page is statically rendered at build time. MDX compiles to React Server Components.
- **Client hydration only for:** theme toggle, sidebar current-page highlight. No other interactive elements in v1.
- **Mobile-first.** Single-column under 768px with sidebar collapsed into a top-of-page disclosure. Same 390px baseline as the crew page.

### 3.5 Auth gating

- `app/help/layout.tsx` calls `lib/auth/requireAdmin.ts` (the existing helper that uses `forbidden()` from `experimental.authInterrupts`).
- Non-admin requests get a clean 403 (matches the rest of `/admin`).
- Phase 2 splits via route groups: `app/help/(admin)/layout.tsx` (gated) vs `app/help/(public)/layout.tsx` (open). No URL changes; mobile/crew users can be opened to `/help/crew/*` without touching the admin tree.

### 3.6 Screenshot harness (new in revision 2)

Real screenshots ship in v1. Capture is scripted, not manual.

**Pipeline:**

1. **Manifest** at `scripts/help-screenshots.manifest.ts` declares every documented surface: `{ key, route, fixture, viewport, theme, waitFor, captureSelector? }`. The manifest is the single source of truth; `<Screenshot key="...">` components reference manifest keys.
2. **Capture script** at `scripts/help-screenshots.ts` reads the manifest, drives Playwright to authenticate as admin (reusing existing test-auth helpers), navigates to each route against the named fixture, waits on `waitFor`, optionally crops to `captureSelector`, captures at the manifest's viewport, and writes WebP output (quality 90) to `public/help/screenshots/<key>-{light,dark}.webp`.
3. **`<Screenshot>` component** at `app/help/_components/Screenshot.tsx` takes `key` (and optional `caption`, `alt`) and renders `<picture>` with `<source media="(prefers-color-scheme: dark)" srcset=".../<key>-dark.webp">` + a default `<img src=".../<key>-light.webp" alt={alt}>`. The reader's theme picks the variant automatically.
4. **Invocation:** `pnpm screenshot:help` regenerates all screenshots. Idempotent. Hash-stable output for unchanged surfaces (so CI can detect drift).

**Defaults (not relitigated):**

| Decision | Value | Rationale |
| --- | --- | --- |
| Format | WebP, quality 90 | Repo-committable size; visual fidelity preserved |
| Density | Single representative rendition (no `1x`/`2x` split) | Manifest names the viewport; one crisp WebP per theme is enough |
| Storage | Committed to `public/help/screenshots/` | Version-controlled with docs; no external asset pipeline in v1 |
| Theme variants | **Both required**; light + dark always paired | Matches PRODUCT.md "both modes first-class"; `<picture>` swaps via `prefers-color-scheme` |
| Viewport | Per-manifest, surface-appropriate | Most surfaces: 1280×800 desktop. Sharing-links + mobile-flow surfaces: 390×844 mobile. |
| Fixture | RPAS Central 2026 by default (from `fixtures/shows/`) | Most populated 2026 sheet; predictable content |
| Drift detection | Git diff on WebP bytes | If a screenshot would change, the regen produces a diff; reviewer sees it |

**Authoring scaffold (separate from shipped state):** `<ScreenshotPlaceholder>` is preserved as a **draft-only** component for pages being written before the underlying surface stabilizes. It must not appear in any MDX file at v1 close-out — lint enforces (see §7.1 test 7).

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

### 5.1 `lib/messages/lookup.ts` API extension

Current signature (from spec §12.4):

```ts
lookup(code: ErrorCode): { title: string; body: string }
```

Extended signature (additive — existing callers keep compiling):

```ts
lookup(code: ErrorCode): { title: string; body: string; helpHref?: string }
```

The §12.4 catalog (`lib/messages/catalog.ts:3` declares the existing entry shape with `severity?: "info" | "warning"`) gains two new optional fields per entry:

| Field | Type | Required when | Purpose |
| --- | --- | --- | --- |
| `longExplanation` | `string` (non-empty) | `severity === "warning"` | Long-form plain-language explanation; rendered on `/help/errors#<code>` |
| `helpHref` | `string` (URL fragment form `/help/...#<anchor>` or `/help/...`) | `severity === "warning"` | Deep-link target for "Learn more →" links |

A meta-test (`tests/messages/_metaErrorCatalogDocs.test.ts`) asserts that every entry with `severity === "warning"` has both fields populated. New codes added to the catalog without docs entries fail CI. Entries with `severity === "info"` or unset severity are not required to have docs (info-tier surfaces are typically transient toasts that don't warrant a wiki entry); implementation may render `helpHref` on info entries that opt in, but the meta-test does not require it.

### 5.2 Affordance wiring (retrofits to earlier milestones)

| Affordance | Spec section | What this milestone adds |
| --- | --- | --- |
| Section header "?" tooltip | §9.0.1 | Trailing "Learn more →" link to the relevant `/help/...` page. Conditional on `helpHref` presence; degrades cleanly when absent. |
| Parse warning row | §9.2 | Sibling `Learn more →` button next to "Report this to Eric"; resolves to `/help/admin/parse-warnings#<code>` via `lookup(code).helpHref`. |
| Error toast / banner | §12.4 | Inline `Learn more →` when `lookup(code).helpHref` is present. Single change point in the rendering helper. |
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
   - Asserts every §12.4 catalog entry with `severity === "warning"` has both `longExplanation` (non-empty) and `helpHref` populated
   - Mirrors the existing `_metaAdminAlertCatalog.test.ts` pattern (per AGENTS.md meta-test inventory invariant)
   - Catches new error codes added without docs entries

3. **Auth-gating test** (`tests/help/auth.test.ts`)
   - Unauthenticated GET on `/help/`, `/help/admin/dashboard`, `/help/errors`, `/help/tour` → 403
   - Authenticated-as-admin GET on the same → 200
   - Authenticated-as-crew (signed-link viewer) → 403 in v1 (phase-2 will relax for `/help/crew/*` only)

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
| **#9 Supabase call-boundary** | n/a | `/help/*` does no Supabase I/O. Auth is via existing `requireAdmin()`. |

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
6. **Screenshot harness reuse of test auth.** The capture script must authenticate as admin to reach `/help/admin/*`. Implementation surveys whether the existing Playwright test harness (used by the mobile-layout test #6) already has an admin-login helper that can be reused, or whether a new one is needed.
7. **Recapture trigger for downstream milestones.** When a post-M12 milestone changes a UI surface documented in `/help`, that milestone's plan must include a "regenerate screenshots" task. Git diff on WebP bytes is the automatic drift signal; a future CI rule could fail the PR if `pnpm screenshot:help` output would change without a matching update. Plan-writing decision, not spec-blocking.

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
| **Catalog schema extension shape** | Two new optional fields (`longExplanation`, `helpHref`). Required when `severity === "warning"` (the only non-info value the existing enum permits per `lib/messages/catalog.ts:3`), enforced by meta-test. | §5.1 |
| **Concept track** | Excluded from v1. Explanations live inline on operator pages. | §2 |
| **Doug as bug-report triager** | **No.** Doug receives content questions from crew via his existing channels (phone/text); app bug reports route to Eric via M8 GitHub pipeline. `/help` covers no bug-triage surface. | (Resolved during brainstorm; codified here.) |
| **`Learn more →` text vs. icon** | Implementation chooses based on `impeccable` audit; spec does not constrain. | §10 |

---

## 12. Existing-code citations

(Per AGENTS.md self-review additions: every factual claim about current code MUST cite `file:line`.)

| Claim | Citation | Verified |
| --- | --- | --- |
| `experimental.authInterrupts` is enabled, enabling `forbidden()` | `next.config.ts:17` | ✅ |
| `requireAdmin()` exists and uses `forbidden()` | `lib/auth/requireAdmin.ts` (referenced from `next.config.ts:10`) | ✅ (file reference; internal line TBD by implementation) |
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
| **AC-12.5** | `lib/messages/lookup.ts` returns `helpHref?: string` per the §5.1 contract; existing callers continue to compile. |
| **AC-12.6** | Every §12.4 catalog entry with `severity === "warning"` has `longExplanation` (non-empty) and `helpHref` populated; meta-test enforces. |
| **AC-12.7** | The build-time anchor resolver passes — every `helpHref` resolves to a real `<RefAnchor>` on a real page. |
| **AC-12.8** | Parse-warning rows in the §9.2 panel render a `Learn more →` link when `helpHref` is present. |
| **AC-12.9** | Dashboard tooltips per §9.0.1 render a trailing `Learn more →` link when their mapped page exists. |
| **AC-12.10** | Dashboard footer renders `Take the tour →` linking to `/help/tour`. |
| **AC-12.11** | `/help/errors` iterates the catalog and renders one anchored section per entry with `severity === "warning"`. |
| **AC-12.12** | All 9 tests in §7.1 pass; nav-consistency, anchor-resolver, screenshot-coverage, and manifest-integrity meta-tests are red on the conditions they guard. |
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

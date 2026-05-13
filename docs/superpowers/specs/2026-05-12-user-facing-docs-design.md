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
- **Rationale.** 13 pages do not justify a framework. Reuses the existing `app/globals.css` Tailwind v4 theme tokens. Stays in the project's existing build pipeline.
- **Compilation, not prerender (corrected r4).** `pnpm build` **compiles** every `.mdx`/`.tsx` page to an RSC chunk. It does NOT pre-generate static HTML because the `requireAdmin()` gate in the layout forces dynamic-at-request-time rendering (see §3.4). The compile step verifies MDX validity and component resolution; the per-request render happens on every authenticated GET. `app/help/layout.tsx` exports `export const dynamic = "force-dynamic"` to make this explicit to the framework.

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
| **Fixed clock (r4 → r5 → r6 → r7 request-scoped)** | All time-dependent rendering is captured at a fixed instant. **`frozenClockInstant` is REQUIRED per manifest entry** — no project-wide default. Mechanism: (a) browser — Playwright's `context.clock.install({ time: frozenClockInstant })` pins `Date`/`Date.now`; (b) **server — a request-scoped test-only header `X-Screenshot-Frozen-Now: <ISO>`** sent by the capture script via `page.setExtraHTTPHeaders({ "X-Screenshot-Frozen-Now": frozenClockInstant, Authorization: \`Bearer ${TEST_AUTH_SECRET}\` })`. Consumed by exactly ONE server-side time utility (new `lib/time/now.ts` or equivalent) that reads the header via Next 16's `headers()` API. Per-request scope means each capture can carry its own frozen instant against a single long-running Next server — **r6's per-entry env approach was infeasible** (Playwright's `webServer` starts the Next process once; `globalSetup` cannot mutate `process.env.SCREENSHOT_FROZEN_NOW` per capture). Gating contract: the header is honored ONLY when (i) `process.env.ENABLE_TEST_AUTH === "true"` AND (ii) the request includes `Authorization: Bearer ${TEST_AUTH_SECRET}` matching the existing test-auth route's verification (`app/api/test-auth/set-session/route.ts`). Production builds with `ENABLE_TEST_AUTH` unset ignore the header entirely. | `tests/e2e/right-now.spec.ts:87-114`; `app/api/test-auth/set-session/route.ts` gating pattern |
| **Frozen-instant fixture validation (r5, r6 source corrected)** | Pre-capture validation: for every manifest entry, parse the fixture's INFO tab DATES rows directly (the raw markdown fixture under `fixtures/shows/raw/<show>/INFO.md`) to derive the operational date range [SET earliest .. STRIKE latest]. Assert `frozenClockInstant` falls within that range. **r5 incorrectly cited `fixtures/shows/_schema-diff.md` as the source of operational ranges; that file documents field shapes, not per-fixture date ranges.** Implementation adds a small parser at `scripts/help-screenshots-fixture-range.ts` that reads each fixture and returns the range; the parser is unit-tested against the known fixture corpus. Capture fails fast if any manifest entry's clock is outside its fixture's window. | `fixtures/shows/raw/<show>/INFO.md` (per-fixture); existing fixture INFO-tab schema documented in `fixtures/shows/_schema-diff.md` |
| **CSRF / session-cookie volatility (r4)** | Sign in once at `globalSetup`, persist `storageState`, reuse across captures. Subsequent navigations carry stable cookies; no per-request CSRF nonce churn enters the rendered output. | Playwright's `storageState` pattern, already used by existing E2E suite |
| **Supabase Realtime suppression (r4)** | The capture script disables Realtime subscriptions before navigation: either `page.addInitScript` overrides `window.WebSocket` to a no-op for the duration of capture, or the test-only build flag disables Realtime subscribe paths entirely. Live data flicker from Realtime push during the quiescence wait would otherwise produce non-deterministic captures. | Implementation picks the lighter option; both are reversible per-test. |

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

`messageFor` keeps its signature; the **return type gains three new fields (r5)**:

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
  selfContainedAction?: boolean;           // NEW in M12 (r5) — opt-out for self-contained admin-log entries
};
```

`longExplanation` and `helpHref` are `string | null`. `selfContainedAction` is optional `boolean`; defaults `false`. Existing callers continue to compile.

**`selfContainedAction` semantics (r5, clarified r7).** Some catalog entries that ARE rendered to Doug (non-null `dougFacing`, surfaces in the admin alert banner) have their action embedded directly in the message text ("refresh the admin page", "retry shortly"). These don't need `/help/errors` pages — Doug doesn't need to "learn more"; he needs to follow the action. M12 sets `selfContainedAction: true` on these entries.

**Distinction from master-spec "admin-log-only":** master-spec §12.4 also defines a category called *admin-log-only* — those entries have `dougFacing: null`, are never rendered to Doug, and exist for Eric's logs/alerts only. The two categories are disjoint: master-spec admin-log-only has `dougFacing == null`; M12 `selfContainedAction` has `dougFacing != null`. The codes M12 flags (e.g., `STALE_WRITE_ABORTED`) have non-null `dougFacing` per `lib/messages/catalog.ts:177` and DO render to Doug — that's intentional master-spec behavior; M12 just opts them out of the help-link requirement.

Known codes set to `selfContainedAction: true` (9 codes, verified non-null `dougFacing` in catalog): `STALE_WRITE_ABORTED`, `STALE_PUSH_ABORTED`, `STALE_MANUAL_REPLAY_ABORTED`, `CONCURRENT_SYNC_SKIPPED`, `STAGED_PARSE_REVISION_RACE`, `STAGED_PARSE_REVISION_RACE_COOLDOWN`, `WEBHOOK_NOOP_ALREADY_SYNCED`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`.

The render-side gate (below) strips `Learn more →` from any entry where `selfContainedAction === true`, even if `helpHref` is accidentally populated.

**Required-when predicate (r5):** `severity !== "info"` AND `dougFacing != null` AND `selfContainedAction !== true`.

This is the v1 admin-scoped predicate. Live `components/admin/AlertBanner.tsx:39-50` treats only `severity === "info"` as excluded from the alert banner; unset severity is rendered as warning-equivalent. The narrowed predicate covers warning + unset-severity entries AND restricts to admin-facing rows.

**Why admin-only in v1.** v1 gates the entire `/help/*` tree to admin (§3.5 / §5.5). Crew-only catalog entries (e.g., `LINK_EXPIRED` at `lib/messages/catalog.ts:11-17` — `dougFacing: null`, `crewFacing` non-null) would link crew users to a page they cannot open (403). Forcing `helpHref` on those entries in v1 would create a broken UX. Phase 2 ships `/help/crew/*` and the predicate widens to cover crew-facing entries — at that point `LINK_EXPIRED` gets a help link.

| Field | Type | Required when | Purpose |
| --- | --- | --- | --- |
| `longExplanation` | `string \| null`; non-null required | `severity !== "info"` AND `dougFacing != null` AND `selfContainedAction !== true` | Long-form plain-language explanation; rendered on `/help/errors#<code>` |
| `helpHref` | `string \| null`; non-null required | Same predicate as above | Deep-link target for "Learn more →" links |

Info-tier entries: not required. Crew-only entries (`dougFacing == null`, `crewFacing != null`): both fields stay `null` in v1; phase 2 fills them. `selfContainedAction === true` entries (see semantics above): both fields stay `null`; the entry's own `dougFacing` is its self-contained action.

**Render-side guard (r5):** The shared error renderer adds `Learn more →` only when **all** of these hold: (a) `helpHref` is non-null, (b) rendering context is admin (`/admin/*` or `/help/admin/*`), AND (c) `selfContainedAction !== true`. Crew-facing surfaces (`/show/<slug>`) MUST NOT emit admin-gated `/help` links. `selfContainedAction` entries skip the link even on admin contexts — Doug doesn't need to "learn more" about a transient sync race; the embedded action ("refresh", "retry") is sufficient. Enforced by `tests/messages/_metaErrorRendererGate.test.ts` — see §7.1 test 12.

A meta-test (`tests/messages/_metaErrorCatalogDocs.test.ts`) asserts the catalog contract. New codes added without docs fail CI.

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

A non-admin who hits a deep-linked `/help/...` URL gets the same `forbidden()` 403 as bare `/help`. Acceptable: only Doug should be following these links from inside `/admin`. Phase 2 will allow `/help/crew/*` to bypass auth without affecting admin links. The render-side gate (§5.1) ensures crew-facing surfaces don't emit admin-gated links even if the catalog accidentally populates `helpHref` on a crew-only entry.

### 5.6 §9.0.1 surface affordance matrix (new in r4, expanded in r5)

Every `?` tooltip / "Learn more" / "What does this mean?" / "Take the tour" link in the master spec §9.0.1 is enumerated below with its M12 deep-link target AND a stable `data-testid`. Test #13 walks the matrix by `data-testid`, locates the affordance in the rendered DOM, asserts the link is present (or absent for crew rows), and asserts the link's `href` matches the matrix target.

**Discovery mechanism (r5):** the test does NOT depend on file:line citations (those rot when components move). It uses `data-testid` attributes that owning milestones (M3/M9/M10) MUST add when they ship the affordance. The testid naming convention: `help-affordance--<source-surface-slug>--<affordance-kind>`.

| Source surface | Affordance | `data-testid` | Target | Owning milestone |
| --- | --- | --- | --- | --- |
| `/admin` dashboard — Active Shows panel header | `?` tooltip | `help-affordance--dashboard-active-shows--tooltip` | `/help/admin/dashboard#active-shows` | M3 / M9 |
| `/admin` dashboard — "Sheets we couldn't auto-apply" panel header | `?` tooltip | `help-affordance--dashboard-pending-ingestion--tooltip` | `/help/admin/review-queues#first-seen` | M3 / M9 |
| `/admin` dashboard — "Review staged changes" status badge | `?` tooltip | `help-affordance--dashboard-restage-badge--tooltip` | `/help/admin/review-queues#re-stage` | M9 |
| `/admin` dashboard footer | "Take the tour" link | `help-affordance--dashboard-footer--tour` | `/help/tour` | M9 |
| `/admin/show/<slug>` — Staged review card (re-stage) | `?` tooltip on header | `help-affordance--per-show-restage-card--tooltip` | `/help/admin/review-queues#re-stage` | M9 |
| **`/admin/show/staged/<stagedId>` — first-seen staged review card (r5)** | **`?` tooltip on header** | **`help-affordance--first-seen-review-card--tooltip`** | **`/help/admin/review-queues#first-seen`** | **M9** |
| `/admin/show/<slug>` — Sync health section header | `?` tooltip | `help-affordance--per-show-sync-health--tooltip` | `/help/admin/per-show-panel#sync-health` | M9 |
| `/admin/show/<slug>` — Parse warnings section header | `?` tooltip | `help-affordance--per-show-parse-warnings--tooltip` | `/help/admin/parse-warnings` | M9 |
| `/admin/show/<slug>` — individual parse-warning row | `Learn more →` | `help-affordance--parse-warning-row--learn-more` | `/help/admin/parse-warnings#<warning-code>` via `messageFor(code).helpHref` | M9 |
| `/admin/show/<slug>` — Crew preview links section header | `?` tooltip | `help-affordance--per-show-preview-links--tooltip` | `/help/admin/preview-as-crew` | M9 |
| `/admin/show/<slug>/preview/<crew-id>` — sticky preview banner | `?` icon | `help-affordance--preview-banner--tooltip` | `/help/admin/preview-as-crew#impersonation-banner` | M9 |
| Onboarding wizard — Step 1 (service-account email) | `?` icon | `help-affordance--wizard-step1--tooltip` | `/help/admin/onboarding-wizard#service-account` | M10 |
| Onboarding wizard — Step 2 header | `?` tooltip | `help-affordance--wizard-step2--tooltip` | `/help/admin/onboarding-wizard#step-2` | M10 |
| Onboarding wizard — Step 3 header | `?` tooltip | `help-affordance--wizard-step3--tooltip` | `/help/admin/onboarding-wizard#step-3` | M10 |
| **(template-family row, r6)** Any error message rendered through `messageFor(code)` in `/admin/*` (excludes `selfContainedAction === true`) | `Learn more →` | Testid family `help-affordance--error-message--<code>--learn-more` where `<code>` is a lowercase-kebab transform of the catalog code. **Walked by family rule in test #13, NOT by AC-12.36's single-testid regex** — implementation iterates the catalog and asserts presence per-code. | `/help/errors#<code>` via `messageFor(code).helpHref` | M9 / M10 |
| **(negative-assertion row, r6 — not a matrix-walker row)** Crew-facing surfaces (`/show/<slug>`) | **No** `Learn more →` link in v1 | (no testid) Test #13 asserts no `data-testid^="help-affordance--"` exists in the rendered crew page DOM | n/a in v1 | (Phase 2) |

The matrix is the source of truth for test #13. Owning milestones ship the affordance text via spec §9.0.1; M12 retrofits the `helpHref` resolution and the link element. **Owning milestones MUST also add the `data-testid` attribute exactly as named in this matrix** — see §7.1 test 13 for the discovery mechanism.

**Class-sweep guarantee:** any new section header in `/admin/*` that would carry a §9.0.1 tooltip MUST add (a) a row to this matrix, (b) the matching `data-testid` in the component, (c) the target `/help/...` page or anchor — all in the same PR. Test #13 fails if a `data-testid` named `help-affordance--*` exists in the codebase without a matrix row, OR if a matrix row's `data-testid` is missing from the rendered output.

**Phase-2 widening:** when crew docs ship, the bottom row gains a `data-testid` and target; `selfContainedAction` entries are unaffected since they don't get crew-facing affordances either.

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
   - Asserts: every catalog entry where `severity !== "info"` AND `dougFacing != null` AND `selfContainedAction !== true` has `longExplanation` (non-null, non-empty) AND `helpHref` (non-null, matching `/^\/help\/.+/`) populated. (r7: predicate matches AC-12.6 verbatim — earlier rounds left the third conjunct off this description.)
   - **Forced fixture cases (anti-tautology):**
     - synthetic entry with `severity: "warning"`, `dougFacing: "..."`, `selfContainedAction: true`, `helpHref: null` → must PASS (proves the opt-out works)
     - synthetic entry with `severity: "warning"`, `dougFacing: "..."`, `selfContainedAction: undefined`, `helpHref: null` → must FAIL (proves the predicate fires when opt-out absent)
     - synthetic entry with `severity: "info"`, `dougFacing: "..."`, `helpHref: null` → must PASS (info-tier exempt)
     - synthetic entry with `dougFacing: null`, `crewFacing: "..."`, `helpHref: null` → must PASS (crew-only deferred to phase 2)
   - Predicate covers both `severity === "warning"` and entries with unset severity (per `components/admin/AlertBanner.tsx:39-50` default-warning rule), restricted to admin-facing rows so crew users never link to admin-gated `/help` URLs in v1
   - Mirrors the existing `_metaAdminAlertCatalog.test.ts` pattern (per AGENTS.md meta-test inventory invariant)
   - Catches new admin-facing error codes added without docs entries
   - Phase 2: predicate widens to also cover `crewFacing != null` once `/help/crew/*` ships

3. **Auth-gating + AdminInfraError mapping** (`tests/help/auth.test.ts`)
   - Unauthenticated GET on `/help/`, `/help/admin/dashboard`, `/help/errors`, `/help/tour` → 403
   - Authenticated-as-admin GET on the same → 200
   - Authenticated-as-crew (signed-link viewer) → 403 in v1 (phase-2 will relax for `/help/crew/*` only)
   - **AdminInfraError mapping:** with the Supabase RPC stubbed to throw, GET on `/help/` returns the cataloged 500-class surface (matching the `data-testid="admin-layout-infra-error"` or `help-layout-infra-error` sibling per §3.5). Assertion text is the **resolved fallback chain** `entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."` (mirroring `app/admin/layout.tsx:58-60` verbatim). For the live `ADMIN_SESSION_LOOKUP_FAILED` entry (`lib/messages/catalog.ts:148-154`) where `dougFacing == null`, this resolves to the `crewFacing` string ("Something is misconfigured for this show. Doug has been notified."). Test asserts the rendered text matches the fallback expression's actual output — NOT a hard-coded string the spec invents.

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

12. **Error-renderer gate** (`tests/messages/_metaErrorRendererGate.test.ts`) — new in r4
    - Renders each catalog entry through the shared error renderer in three contexts: admin (`/admin/*`), help-admin (`/help/admin/*`), and crew (`/show/<slug>`)
    - Asserts: admin and help-admin contexts emit `Learn more →` when `helpHref` is non-null; crew context does NOT emit `Learn more →` regardless of `helpHref` value
    - Prevents future widening of the catalog predicate from accidentally leaking admin-gated `/help` links into crew-rendered surfaces
    - **Anti-tautology:** the rendering helper is called against a mock catalog entry with `helpHref` populated even on crew-only rows (a forced-mismatch); the test asserts the gate's behavior, not the catalog's predicate

13. **Deep-link affordance walker** (`tests/help/deep-link-walker.test.ts`) — r4 → r5 → r6 → r7 unit-level template family
    - **Discovery mechanism:** the test reads §5.6's matrix (as a typed `affordanceMatrix.ts` import). Three row classes:
       - **Concrete-testid rows** (E2E via Playwright): walks each row by its documented `data-testid` against the source-surface route. Asserts the affordance is present and the link's `href` matches the matrix target. ~11 rows, finite, fast.
       - **Template-family row (UNIT-LEVEL, not E2E — r7):** the renderer is exercised via a unit test that feeds each catalog entry matching the AC-12.6 predicate (mocked, in-memory) into the shared error-renderer component, asserts the rendered output contains the expected per-code testid `help-affordance--error-message--<lowercase-kebab(code)>--learn-more` AND a `Learn more →` link whose `href` matches `messageFor(code).helpHref`. r6 specified per-code E2E navigation; round-5 finding 5 caught that this doesn't scale (104 catalog entries, dozens matching). r7 moves it to renderer-level. Plus ONE representative E2E surface that renders a real error code end-to-end (smoke check that the wiring works in the live UI).
       - **Negative-assertion row** (E2E): navigates as a signed-link viewer to `/show/<slug>`, asserts no `data-testid^="help-affordance--"` element exists.
    - **Reverse-direction check:** greps the codebase for any `data-testid="help-affordance--*"` literal and asserts each is enumerated in `affordanceMatrix.ts` (concrete rows) OR matches the template-family pattern.
    - File:line citations are NOT used — components can move freely as long as the testid travels with the affordance.

14. **Fixture-range parser unit test** (`tests/help/fixture-range-parser.test.ts`) — new in r7
    - Unit-tests `scripts/help-screenshots-fixture-range.ts` against the known fixture corpus (`fixtures/shows/raw/*`): for each fixture, asserts the parser returns the expected operational date range parsed from the INFO tab DATES rows.
    - Coverage: at least one show per template version represented in `fixtures/shows/_schema-diff.md` (2024 / 2025 / 2026 schema generations).
    - Catches parser regressions that would let manifest entries with out-of-window `frozenClockInstant` slip through.

15. **`lib/time/now.ts` gating unit test** (`tests/time/now-gate.test.ts`) — new in r7
    - Asserts the utility returns the frozen instant ONLY when ALL three preconditions hold (header present, `ENABLE_TEST_AUTH === "true"`, valid `Authorization: Bearer`).
    - Production-mode case: with `ENABLE_TEST_AUTH` unset, the header is ignored and the utility returns real `Date.now()`.
    - Capture-boundary case: two consecutive calls with the same frozen header 60+ seconds apart return byte-identical ISO strings (per AC-12.37).
    - This replaces r6's E2E capture-boundary check, which was too expensive for CI.

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
| **Catalog schema extension shape** | Three new fields: `longExplanation: string \| null`, `helpHref: string \| null`, `selfContainedAction?: boolean` (r5). Required predicate: `severity !== "info"` AND `dougFacing != null` AND `selfContainedAction !== true`. **r5 added `selfContainedAction` opt-out (round-3 finding 2)** so self-contained admin-log codes (STALE_WRITE_ABORTED etc.) skip the docs requirement; their `dougFacing` is its own action. r4 narrowed from r3's overly-broad predicate (round-2 finding 1); r2's `=== "warning"` predicate missed default-warning entries (round-1 finding 3). Enforced by meta-test + render-side gate. | §5.1, §7.1 test 12, AC-12.35 |
| **Rendering posture** | **Dynamic at request time** for `/help/*` (not statically prerendered). `requireAdmin()` runs Supabase queries on every request. MDX content is statically compiled to RSC; the layout gate is dynamic. **Per round-1 finding 2.** | §3.4 |
| **`AdminInfraError` handling on `/help`** | Mirrors `app/admin/layout.tsx:47-71` verbatim. `/help/layout.tsx` wraps `requireAdmin()` in try/catch, catches `AdminInfraError`, renders the cataloged 500-class surface via `messageFor("ADMIN_SESSION_LOOKUP_FAILED")`. Test #3 verifies. **Per round-1 finding 2.** | §3.5, §7.1 test 3 |
| **Screenshot harness reproducibility** | The harness specifies a dedicated Playwright project, `globalSetup` running `pnpm db:seed`, reuse of `signInAs` from `tests/e2e/helpers/signInAs.ts`, pinned `sharp` encoder settings, deterministic browser settings (timezone, locale, color-scheme, reduced motion, font hinting, animations off), quiescence wait, **fixed clock (browser + server) per r4**, **CSRF/cookie stability via `storageState` reuse per r4**, **Supabase Realtime suppression per r4**, and a CI `git diff --exit-code` gate. **Per round-1 finding 4 + round-2 finding 3.** | §3.6.2, §3.6.3 |
| **Crew-rendered errors never link to `/help`** | Predicate narrows to `dougFacing != null` in v1 + render-side gate strips `Learn more →` from crew contexts even if `helpHref` is accidentally populated. **Per round-2 finding 1.** Phase 2 widens predicate + renders crew links to `/help/crew/*`. | §5.1, §7.1 test 12 |
| **AdminInfraError rendered text is the fallback chain, not `dougFacing` literally** | `entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."` (matches `app/admin/layout.tsx:58-60`). For live `ADMIN_SESSION_LOOKUP_FAILED` (`dougFacing: null`), resolves to `crewFacing`. **Per round-2 finding 2.** | §3.5, AC-12.24, §7.1 test 3 |
| **Static-vs-dynamic build contract** | `pnpm build` **compiles** MDX to RSC chunks; does NOT prerender static HTML. `app/help/layout.tsx` exports `dynamic = "force-dynamic"` to be explicit. AC-12.1 asserts compilation, not prerender. **Per round-2 finding 4.** | §3.2, §3.4, AC-12.1, AC-12.31 |
| **§9.0.1 surface coverage** | §5.6 enumerates every section header / `Learn more →` / "Take the tour" affordance per master-spec §9.0.1, with explicit `/help/...` target per row. Test #13 walks the matrix. New tooltips added in `/admin` must add a matrix row in the same PR. **Per round-2 finding 5.** | §5.6, §7.1 test 13 |
| **Existing-code citation discipline** | All citations in §12 cite `file:line` (no "deferred to implementation"). r3's `next.config.ts:13` corrected to `:17` in r3; r3's directory-only citations corrected to file:line in r4 (`app/layout.tsx:1`, `app/globals.css:1`). **Per round-2 finding 6.** | §12 |
| **First-seen staged-review surface in matrix** | §5.6 row added for `/admin/show/staged/<stagedId>` per master-spec §9.1 / §9.2 sub-section 0. Same review-card UI as `/admin/show/<slug>?review=`, slug-less variant. Target: `/help/admin/review-queues#first-seen`. **Per round-3 finding 1.** | §5.6 row "first-seen staged review card" |
| **`selfContainedAction` is M12-specific, NOT master-spec admin-log-only** | The M12 flag (r5, renamed r7) applies to Doug-VISIBLE codes whose `dougFacing` text embeds the action ("refresh", "retry"). Master-spec admin-log-only entries have `dougFacing: null` and are never rendered — disjoint category. The original `adminLogOnly` name (r5/r6) was a misnomer that conflicted with the master-spec contract; renamed to `selfContainedAction` in r7. **Per round-5 finding 3.** | §5.1, §5.2 gate, AC-12.35 |
| **Walker discovery uses `data-testid`, not file:line** | §5.6 matrix gains a `data-testid` column with `help-affordance--*` naming convention. Owning milestones (M3/M9/M10) ship the testids; test #13 walks them. File:line citations would rot when components move. **Per round-3 finding 3.** | §5.6, §7.1 test 13, AC-12.36 |
| **`frozenClockInstant` is per-entry required, no default** | r4's project default (`2026-04-15T14:30:00Z`) fell outside the default fixture's window (RPAS Central 2026: 3/22–3/26). r5 removes the default — manifest entries MUST declare `frozenClockInstant` per-entry, validated against the fixture's date window pre-capture. **Per round-3 finding 4.** | §3.6.2 "Fixed clock" + "Frozen-instant fixture validation", AC-12.32, AC-12.34 |
| **Fixed-clock contract preserves AC-12.16** | ~~r5 drops the hypothetical `SCREENSHOT_FROZEN_NOW` env var. Server-rendered relative time stays deterministic via fixture seed timestamps anchored relative to `frozenClockInstant` — no new env var.~~ **Reversed in r6 (round-4 finding 3):** fixture-seed-only doesn't work — server `Date.now()` runs at real wall-clock, so "X min ago" still drifts. r6 reintroduces `SCREENSHOT_FROZEN_NOW` as a test-only env gated by `ENABLE_TEST_AUTH`. AC-12.16 enumerates it explicitly; AC-12.37 enforces production-build rejection + minute-boundary stability. | §3.6.2, AC-12.16, AC-12.32, AC-12.37 |
| **Catalog predicate consistency with `selfContainedAction`** | AC-12.6 / AC-12.11 / test #2 all explicitly include `selfContainedAction !== true` in the predicate (not just §5.1 prose). **Per round-4 finding 1.** Test #12 explicitly mocks an `selfContainedAction: true` entry with `helpHref` non-null and asserts no link renders. | AC-12.6, AC-12.11, §7.1 test 2, §7.1 test 12 |
| **`selfContainedAction` enumeration is a derivation rule, not a fixed list** | AC-12.35's 9-code list is the set known at write time; the rule is "any code master-spec §12.4 classifies as admin-log-only OR alert-feed-only-with-no-help-destination." Implementation walks the entire live catalog against §12.4 and flags every match. **Per round-4 finding 2** (added 3 codes: WEBHOOK_NOOP_ALREADY_SYNCED, ASSET_RECOVERY_REVISION_DRIFT, ASSET_RECOVERY_DRIFT_COOLDOWN). | AC-12.35 |
| **Matrix testid regex applies to concrete-testid rows only** | The single-testid regex `^help-affordance--[a-z0-9-]+--(tooltip\|tour\|learn-more)$` applies to rows with a single concrete testid. The error-message template-family row is walked by family rule (per-code iteration); the crew-negative row is a separate negative assertion. Step 2 + Step 3 row split into separate rows. **Per round-4 finding 4.** | AC-12.36, §5.6, §7.1 test 13 |
| **Fixture date range source is the raw INFO tab, not `_schema-diff.md`** | r5 incorrectly cited `fixtures/shows/_schema-diff.md` as the operational-range source — that file documents field shapes, not per-fixture ranges. r6 corrects: a small parser at `scripts/help-screenshots-fixture-range.ts` reads each fixture's raw INFO tab DATES rows directly and returns the operational range. Parser is unit-tested against the known fixture corpus. **Per round-4 finding 5.** | §3.6.2 row "Frozen-instant fixture validation", AC-12.34 |
| **Catalog meta-test predicate matches AC-12.6 verbatim** | Test #2's description includes `selfContainedAction !== true` (r7 — earlier rounds left the third conjunct off the test description even after AC fixes). Test #2 carries 4 forced-fixture cases to prove all three exclusion bands work independently. **Per round-5 finding 1.** | §7.1 test 2 |
| **Server-side clock is request-scoped header, not env var** | r6's per-entry env approach was infeasible: Playwright's `webServer` starts the Next process once, `globalSetup` cannot mutate `process.env` per capture. r7 replaces with a request-scoped header `X-Screenshot-Frozen-Now` validated by the existing `ENABLE_TEST_AUTH` + `Authorization: Bearer ${TEST_AUTH_SECRET}` gating. **Per round-5 finding 2.** AC-12.16 simplified — no new env var. | §3.6.2 Fixed clock r7, AC-12.16, AC-12.32, AC-12.37 |
| **`selfContainedAction` (r7 rename) is M12-specific, NOT master-spec admin-log-only** | Master spec's admin-log-only entries have `dougFacing: null` and don't render to Doug at all. M12's `selfContainedAction` (renamed from `adminLogOnly` in r7) flags Doug-VISIBLE entries whose `dougFacing` text embeds the action — the two categories are disjoint. r5/r6 misnamed this concept. **Per round-5 finding 3.** | §5.1 distinction note, AC-12.35 |
| **r7 tests live in §7.1 inventory and count in AC-12.12** | r6 added AC-12.34/12.37 but the new tests weren't enumerated in §7.1 — implementation could pass the listed tests while missing the new safety checks. r7 adds test #14 (fixture-range parser) and #15 (`lib/time/now.ts` gating + boundary). AC-12.12 updated to 14 unit/integration tests. **Per round-5 finding 4.** | §7.1 tests 14 + 15, AC-12.12 |
| **Per-code error-renderer check is unit-level, not E2E** | r6's template-family rule iterated every catalog code via E2E navigation (104 entries, dozens matching). r7 moves it to a renderer-level unit test feeding mock catalog entries; one representative E2E surface remains as a smoke check. **Per round-5 finding 5.** | §7.1 test 13 (Template-family row) |
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
| App Router uses `app/` not `pages/` | `app/layout.tsx:1` (root layout) | ✅ |
| Tailwind v4 in use; `app/globals.css` declares `@theme` tokens | `app/globals.css:1` (`@import "tailwindcss"`) and `@theme` block within | ✅ |
| Existing crew-pages spec section §9.0.1 mandates the "?" / "What does this mean?" / "Take the tour" affordances | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2540–2549` | ✅ |
| §12.4 is the error-code catalog | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2681` heading | ✅ |
| §9.2 parse-warnings panel is at `/admin/show/<slug>` | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2581` heading | ✅ |
| `/admin/show/<slug>/preview/<crew-id>` is the impersonation route | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:2596` heading | ✅ |
| `pageExtensions` is the App Router escape hatch for MDX routing | `@next/mdx` documentation; standard Next 16 pattern | n/a (Next.js framework convention) |
| `requireAdmin` is the project's existing admin gate (not a new helper) | next.config.ts comment block confirms its existence | ✅ |

All citations in this table cite `file:line` as required by AGENTS.md self-review additions. Where the spec previously deferred internal line numbers to implementation, that text has been replaced with verified `file:line` evidence (r4). Future moves of these files require updating the citations in the same PR (caught by code review per invariant #7).

---

## 13. Acceptance criteria

| ID | Criterion |
| --- | --- |
| **AC-12.1** | All 13 pages under `app/help/*` exist and **compile** to RSC chunks during `pnpm build` (no static HTML prerender — see §3.2 / §3.4). At runtime, each page renders non-empty HTML when GET'd by an authenticated admin. |
| **AC-12.2** | `app/help/layout.tsx` gates the tree to admin via `requireAdmin()`. Unauthenticated and crew requests → 403. |
| **AC-12.3** | Sidebar renders on every `/help/*` page; current page is visually highlighted; collapses to top-of-page disclosure under 768 px. |
| **AC-12.4** | Theme toggle is present in `<Header>` on every page and respects `prefers-color-scheme` on first paint. |
| **AC-12.5** | `MessageCatalogEntry` (declared in `lib/messages/catalog.ts:1-8`) is extended with `longExplanation: string \| null` and `helpHref: string \| null` per §5.1. `messageFor` signature unchanged; all existing callers continue to compile. |
| **AC-12.6** | Every §12.4 catalog entry where `severity !== "info"` AND `dougFacing != null` AND `selfContainedAction !== true` has `longExplanation` (non-null, non-empty) AND `helpHref` (non-null, `^/help/...`) populated; meta-test (§7.1 test 2) enforces. Three exclusion bands: (a) info-tier entries opt out by `severity === "info"`; (b) crew-only entries (`dougFacing == null`) stay `null` in v1, fill in phase 2; (c) admin-log-only entries (`selfContainedAction === true`, AC-12.35) stay `null` because their `dougFacing` is self-contained. |
| **AC-12.7** | The build-time anchor resolver passes — every `helpHref` resolves to a real `<RefAnchor>` on a real page. |
| **AC-12.8** | Parse-warning rows in the §9.2 panel render a `Learn more →` link when `helpHref` is present. |
| **AC-12.9** | Dashboard tooltips per §9.0.1 render a trailing `Learn more →` link when their mapped page exists. |
| **AC-12.10** | Dashboard footer renders `Take the tour →` linking to `/help/tour`. |
| **AC-12.11** | `/help/errors` iterates the catalog and renders one anchored section per entry matching the AC-12.6 predicate — `severity !== "info"` AND `dougFacing != null` AND `selfContainedAction !== true`. |
| **AC-12.12** | All 14 unit/integration tests in §7.1 (items 1–10 plus 12 + 13 + 14 + 15) pass; nav-consistency, anchor-resolver, screenshot-coverage, manifest-integrity, `<picture>`-contract, error-renderer-gate, deep-link-walker, fixture-range-parser, and `lib/time/now.ts`-gate tests are red on the conditions they guard. CI drift gate (§7.1 item 11) is wired and fails on uncommitted screenshot drift. |
| **AC-12.13** | `/impeccable critique` and `/impeccable audit` pass on every `app/help/*` page (per invariant #8). |
| **AC-12.14** | No `<ScreenshotPlaceholder>` references in `app/help/**/*.mdx` at v1 close-out (lint enforces, §7.1 test 7). Every documented surface ships with a real `<Screenshot key="...">`. |
| **AC-12.15** | Mobile Playwright test at 390 × 844 passes the dimensional + no-horizontal-scroll + 44 × 44 px-target assertions. |
| **AC-12.16** | No new boolean flags, no new env vars (r7 — r6's `SCREENSHOT_FROZEN_NOW` env was infeasible with the server-start env model, replaced by a request-scoped header), no new Supabase tables. The screenshot harness uses a request-scoped test-only header `X-Screenshot-Frozen-Now: <ISO>` plus the existing `Authorization: Bearer ${TEST_AUTH_SECRET}` for gating — both honored only when `ENABLE_TEST_AUTH === "true"`. AC-12.37 enforces production-build rejection. |
| **AC-12.17** | All milestone work is committed in conventional-commits format (`feat(help): …`, `test(help): …`, etc.) per invariant #6. |
| **AC-12.18** | `scripts/help-screenshots.manifest.ts` exists and is the single source of truth for every documented surface. Every `<Screenshot key>` reference resolves to a manifest entry. |
| **AC-12.19** | `scripts/help-screenshots.ts` (the capture script) runs end-to-end via `pnpm screenshot:help` against a clean checkout and produces every manifest entry's light + dark WebP output. Idempotent: a second run on unchanged UI produces byte-identical output. |
| **AC-12.20** | `<Screenshot>` MDX component renders `<picture>` with a `(prefers-color-scheme: dark)` `<source>` and a default light `<img>`. Reader's theme picks the variant automatically. |
| **AC-12.21** | Manifest-integrity meta-test (§7.1 test 9) passes: no stale entries, no orphan WebPs, every named fixture exists in `fixtures/shows/`. |
| **AC-12.22** | M12 work begins only after M10 closes (sequencing constraint, recorded in milestone-routing handoff). |
| **AC-12.23** | `/help/*` renders dynamically (not statically prerendered) — auth gate runs Supabase queries per request. Verified by the auth-gating test (#3) observing distinct responses for admin vs. unauthenticated vs. AdminInfraError-stubbed cases. |
| **AC-12.24** | `app/help/layout.tsx` catches `AdminInfraError` and renders the cataloged 500-class surface using the same fallback chain as `app/admin/layout.tsx:58-60`: `entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."` For the live `ADMIN_SESSION_LOOKUP_FAILED` entry (`lib/messages/catalog.ts:148-154`, `dougFacing: null`), this resolves to the `crewFacing` string. Test #3 verifies the rendered text equals the fallback expression's actual output (not a hard-coded string). |
| **AC-12.25** | `<Screenshot>` `<picture>` contract test (§7.1 test 10) passes — output contains `<source media="(prefers-color-scheme: dark)" srcset="…-dark.webp">` and a default light `<img>` with the provided `alt`. |
| **AC-12.26** | CI drift gate is wired: a CI step runs `pnpm screenshot:help` against a clean checkout, then `git diff --exit-code public/help/screenshots/`. PR fails on non-zero exit. |
| **AC-12.27** | The `screenshots-help` Playwright project in `playwright.config.ts` declares: a dedicated `webServer` with `ENABLE_TEST_AUTH=true` + `TEST_AUTH_SECRET` env, a `globalSetup` running `pnpm db:seed`, deterministic browser settings (`timezoneId`, `locale`, `colorScheme`, `reducedMotion`, font-render-hinting=none, animations-off CSS injection), and reuses `signInAs` from `tests/e2e/helpers/signInAs.ts`. |
| **AC-12.28** | The `messageFor` signature is unchanged. Existing call sites (e.g., `app/admin/layout.tsx:51`, `components/admin/AlertBanner.tsx`) continue to compile and behave identically. Only the return type widens. |
| **AC-12.29** | Error-renderer gate test (§7.1 test 12) passes: admin / help-admin contexts emit `Learn more →` when `helpHref` is non-null; crew context never emits the link regardless of catalog `helpHref` value. |
| **AC-12.30** | Deep-link affordance walker test (§7.1 test 13) passes: every row in §5.6's matrix is wired (or explicitly absent where the matrix says so). |
| **AC-12.31** | `app/help/layout.tsx` exports `export const dynamic = "force-dynamic"` to make the dynamic-rendering posture explicit to Next.js. |
| **AC-12.32** | Screenshot harness pins a fixed clock per §3.6.2 row "Fixed clock": `frozenClockInstant` is required per manifest entry (no project-wide default). Browser side: `context.clock.install({ time: frozenClockInstant })`. Server side: capture script sends `X-Screenshot-Frozen-Now: <ISO>` header on every request via `page.setExtraHTTPHeaders`; consumed by `lib/time/now.ts` (or equivalent) reading the request header through Next's `headers()` API; gated to honor only when `ENABLE_TEST_AUTH === "true"` AND the request includes a valid `Authorization: Bearer ${TEST_AUTH_SECRET}`. Plus fixture seed timestamps anchored relative to `frozenClockInstant` so seeded data stays consistent with the pinned now. |
| **AC-12.34** | Frozen-instant fixture validation passes: for every manifest entry, `frozenClockInstant` falls within the named fixture's operational date range as parsed by `scripts/help-screenshots-fixture-range.ts` from the raw fixture INFO tab. Capture fails fast if a clock is outside its fixture's window. The parser is unit-tested against the known fixture corpus (`fixtures/shows/raw/*`). |
| **AC-12.35** | Catalog entries flagged `selfContainedAction: true` (a M12-specific category — distinct from master-spec admin-log-only; see §5.1 distinction note). Required: `dougFacing != null` (the entry IS rendered to Doug) AND the `dougFacing` text embeds an action like "refresh", "retry", "wait", or equivalent. Known set at write time (9 codes, r6 sweep): `STALE_WRITE_ABORTED`, `STALE_PUSH_ABORTED`, `STALE_MANUAL_REPLAY_ABORTED`, `CONCURRENT_SYNC_SKIPPED`, `STAGED_PARSE_REVISION_RACE`, `STAGED_PARSE_REVISION_RACE_COOLDOWN`, `WEBHOOK_NOOP_ALREADY_SYNCED`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`. **Derivation rule (binding for implementation):** sweep the live catalog for any code with non-null `dougFacing` whose text is a self-contained instruction (no follow-up action required from Doug besides what the text says) — flag it. These entries' `longExplanation` and `helpHref` stay `null`; renderer-gate (test #12) verifies no `Learn more →` is emitted even if `helpHref` is mocked non-null. |
| **AC-12.36** | Every row in §5.6's affordance matrix that has a concrete `data-testid` cell has that testid match `^help-affordance--[a-z0-9-]+--(tooltip|tour|learn-more)$`. Rows that emit a family of testids (e.g., per-error-code `Learn more`) are excluded from the regex and walked by family rule in test #13. The crew-negative row is not a matrix-walker row; it is a separate negative assertion in test #13. |
| **AC-12.37** | `lib/time/now.ts` (or equivalent) returns the frozen instant ONLY when (i) the current request carries an `X-Screenshot-Frozen-Now` header with a valid ISO timestamp, (ii) `process.env.ENABLE_TEST_AUTH === "true"`, AND (iii) the request includes a valid `Authorization: Bearer ${TEST_AUTH_SECRET}`. Production-mode unit test asserts: with `ENABLE_TEST_AUTH` unset, sending the header has no effect on the utility's output. Capture-boundary unit test (NOT a full screenshot run): two consecutive calls to the time utility 60+ seconds apart with the same frozen header return byte-identical ISO strings, proving wall-clock minute crossings don't leak. (The full E2E boundary check is too expensive for CI; the unit test on the utility is sufficient.) |
| **AC-12.33** | Screenshot harness suppresses Supabase Realtime push during capture (per §3.6.2). Stable cookies persist across captures via `globalSetup` `storageState` reuse. |

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

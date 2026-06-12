# FXAV User-Facing Docs (`/help`) — Design Spec

**Spec date:** 2026-05-12
**Working title:** Milestone 11 — Operator-facing documentation site
**Status:** Draft (pending user review, then adversarial review)
**Companion HTML version:** [`2026-05-12-user-facing-docs-design.html`](./2026-05-12-user-facing-docs-design.html)
**Milestone dependency:** M11 starts only after **M10** (onboarding wizard) closes. Real screenshots in v1 (see §3.6 + §6) require the documented UI surfaces to exist and be stable.

---

## 1. Goal & scope

Build an in-app wiki-style documentation site at `/help` whose primary reader is **Doug Larson** (the sole admin of `/admin`). The site exists to:

1. **Carry Doug across the adoption gap** from his current Google-Sheets-only workflow to the FXAV-augmented workflow — explicit, narrative, finite.
2. **Provide operational reference** for every operator-facing surface he uses (dashboard triage, review queues, parse warnings, per-show panel, preview-as-crew, signed-link distribution, onboarding wizard).
3. **Showcase the capability set** in a single "tour" page Doug can use to orient himself or a future successor.

Phase 2 (out of scope for this milestone) extends the site with crew-facing pages at `/help/crew/*` once Doug-facing content has settled.

### 1.1 Why this milestone exists now

The crew-pages spec at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §9.0.1 mandates contextual in-app help affordances ("?" tooltips, "Take the tour", "What does this mean?" links). Those affordances land with their owning milestones (M4 / M9 / M10) as **plain-text-only** explanations. This milestone (M11) builds the **destination** those affordances deep-link into, and retrofits each affordance with a `Learn more →` link to the new pages.

### 1.2 Audience cut

| Audience | v1 (M11) | Phase 2 |
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
              │    (longExplanation + helpHref new in M11) │
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

1. **Manifest** at `scripts/help-screenshots.manifest.ts` is the single source of truth. Per-entry shape: `{ key, route, fixture, viewport, theme, waitFor, captureSelector?, expectStableMs? }`. `<Screenshot name="...">` references manifest keys.
2. **Capture script** at `scripts/help-screenshots.ts` reads the manifest, drives Playwright through the **reproducibility preconditions** below, captures one screenshot per `{key, theme}` pair, and writes WebP output (quality 90) to `public/help/screenshots/<key>-{light,dark}.webp`.
3. **`<Screenshot>` component** at `app/help/_components/Screenshot.tsx` renders `<picture>` with `<source media="(prefers-color-scheme: dark)" srcset="…-dark.webp">` + a default `<img src="…-light.webp" alt={alt}>`. Reader's theme picks the variant automatically. AC-11.20 is enforced by a component-level test (§7.1 test 10).
4. **Invocation:** `pnpm screenshot:help` runs the full pipeline end-to-end on a clean checkout.

#### 3.6.2 Reproducibility preconditions (mandatory)

The capture script MUST establish each precondition before any screenshot is taken. Without these, "idempotent / byte-stable" is not achievable.

| Precondition | How | Source-of-truth |
| --- | --- | --- |
| **Dedicated Playwright project** | Add `screenshots-help` project to `playwright.config.ts` (and to `playwright.screenshots.config.ts` for the dedicated harness invocation) with its own `webServer` block, `use.timezoneId`, `use.locale`, `use.colorScheme`, `use.viewport`, and a paired `screenshots-help-setup` PROJECT (not a `globalSetup` default export) running the env + seed steps below. **r12 amendment (Phase I Codex R2):** the original "`globalSetup` that runs the env + seed steps" wording was implemented as a Playwright setup-project pattern instead — cleaner separation of concerns, real test-framework reporting on seed failures, can sequence against the `webServer` being up. The setup-project file at `tests/e2e/screenshots-help-setup.ts` is a real Playwright test (uses `test()`, not `export default async function globalSetup`); the `screenshots-help` project lists it as a `dependencies:` entry. Structural test `tests/help/playwright-config.test.ts:135-145` actively asserts the setup-project (not `globalSetup`) pattern, including `expect(setupSource).not.toMatch(/export\s+default\s+async\s+function\s+globalSetup/)`. | `playwright.config.ts` (existing patterns for `e2e-dev` / `e2e-prod` are the template) + Playwright setup-project pattern docs |
| **Test-auth env at server start** | `ENABLE_TEST_AUTH=true` and `TEST_AUTH_SECRET=<fixture>` must be set for the `webServer` Playwright launches. Same contract enforced by `app/api/test-auth/set-session/route.ts`. | `tests/e2e/helpers/signInAs.ts:1-23` documents the env requirement |
| **DB seed before capture** | The `screenshots-help-setup` project (per r12 amendment above) runs `pnpm db:seed` (the existing seed script) so every manifest entry's named fixture (default `RPAS Central 2026`) is present at known state. The `screenshots-help` capture project lists `screenshots-help-setup` as a `dependencies:` entry, so Playwright runs the setup project first and only proceeds to capture once it passes. | Existing E2E seed pattern; reuse, don't re-invent |
| **Sign in via reusable helper** | Capture script calls `signInAs(page, adminFixture)` from `tests/e2e/helpers/signInAs.ts` — no parallel admin-login implementation. | `tests/e2e/helpers/signInAs.ts:43-73` |
| **Deterministic browser settings** | `timezoneId: 'America/New_York'`, `locale: 'en-US'`, `colorScheme` set per manifest entry, `reducedMotion: 'reduce'`, font hinting disabled via `chromium` launch flags (e.g., `--font-render-hinting=none --disable-skia-runtime-opts`), animations explicitly disabled via CSS injection (`* { animation: none !important; transition: none !important; }`). | All standard Playwright config; values pinned in the `screenshots-help` project. |
| **Quiescence wait** | After navigation, await `waitFor` selector AND `page.waitForLoadState('networkidle')` AND optional `expectStableMs` settle period (default 500 ms). Captures only after a frame is rendered post-quiescence. | Manifest-driven |
| **Theme application** | For each entry, run twice: once with `colorScheme: 'light'` + `<html data-theme="light">` set via `addInitScript`, once with `dark` equivalent. Theme is *imposed*, not inferred from OS. | App's existing `data-theme` mechanism |
| **Output normalization** | WebP output via `sharp` with fixed encoder settings (`q=90`, `effort=4`, `smartSubsample=true`, `nearLossless=false`). Pinning encoder version prevents the same pixels from producing different bytes across machines. | `package.json` pins `sharp` version; CI uses the same version. |
| **Fixed clock (r4 → r5 → r6 → r7 request-scoped)** | All time-dependent rendering is captured at a fixed instant. **`frozenClockInstant` is REQUIRED per manifest entry** — no project-wide default. Mechanism: (a) browser — Playwright's `context.clock.install({ time: frozenClockInstant })` pins `Date`/`Date.now`; (b) **server — a request-scoped test-only header `X-Screenshot-Frozen-Now: <ISO>`** sent by the capture script via `page.setExtraHTTPHeaders({ "X-Screenshot-Frozen-Now": frozenClockInstant, Authorization: \`Bearer ${TEST_AUTH_SECRET}\` })`. Consumed by exactly ONE server-side time utility (new `lib/time/now.ts` or equivalent) that reads the header via Next 16's `headers()` API. Per-request scope means each capture can carry its own frozen instant against a single long-running Next server — **r6's per-entry env approach was infeasible** (Playwright's `webServer` starts the Next process once; `globalSetup` cannot mutate `process.env.SCREENSHOT_FROZEN_NOW` per capture). Gating contract: the header is honored ONLY when (i) `process.env.ENABLE_TEST_AUTH === "true"` AND (ii) the request includes `Authorization: Bearer ${TEST_AUTH_SECRET}` matching the existing test-auth route's verification (`app/api/test-auth/set-session/route.ts`). Production builds with `ENABLE_TEST_AUTH` unset ignore the header entirely. | `tests/e2e/right-now.spec.ts:87-114`; `app/api/test-auth/set-session/route.ts` gating pattern |
| **Frozen-instant fixture validation (r5 → r6 → r9 path corrected)** | Pre-capture validation: for every manifest entry, parse the fixture's INFO-tab DATES rows directly from the raw markdown fixture. **Actual corpus layout (verified r9):** flat files at `fixtures/shows/raw/<fixture>.md` (each fixture is a single markdown file containing all tabs delimited by `## TAB:` headings, including INFO); the special pdf-only case uses suffix-split files `fixtures/shows/pdf-only/<fixture>__INFO.md` / `__GEAR.md`. r8 incorrectly assumed nested `<show>/INFO.md` directories. Implementation adds `scripts/help-screenshots-fixture-range.ts` that reads each fixture file, locates the INFO tab, parses DATES rows, and returns the operational range [SET earliest .. STRIKE latest]. Parser handles both layouts: flat single-file and pdf-only split-file. Unit-tested against the known fixture corpus. Capture fails fast if any manifest entry's clock is outside its fixture's window. | `fixtures/shows/raw/<fixture>.md` (flat — verified `ls fixtures/shows/raw/`); `fixtures/shows/pdf-only/<fixture>__INFO.md` (split, pdf-only); schema documented in `fixtures/shows/_schema-diff.md` |
| **Server-side `Date.now()` / `new Date()` migration inventory (r8, r14 amendment)** | The browser clock pin doesn't reach server-rendered timestamps. Every server component reachable from a screenshot manifest route that calls `new Date()` or `Date.now()` for **render-side** output MUST migrate to `lib/time/now.ts`. The original wording named `app/show/[slug]/page.tsx:646` as "the named render-side site" with `const today = new Date()`. **r14 (Phase I Codex R3 / orchestrator comprehensive sweep):** the migration is complete; `app/show/[slug]/page.tsx` is now 575 lines and contains zero `new Date()` / `Date.now()` matches. The grep guard at test #16 is the structural enforcement going forward — it walks every server-side `.ts`/`.tsx` under `app/show/`, `app/admin/`, and other manifest-reachable routes and fails CI on any render-side match without the `lib/time/now.ts` import or `// not-render-side:` waiver. Historical M9.5 waiver inventory entry no longer exists: `app/show/[slug]/p/actions.ts:142` (`issuedAt`) and no longer exists: `app/admin/show/[slug]/actions.ts:69` (signed-link audit-log mutation timestamp). Current mutation-side call sites that still carry `// not-render-side:` waivers are `app/admin/dev/actions.ts` (dev-only mutation timestamps) and the `app/admin/actions.ts` `resolved_at` writers. | Test #16 grep guard is the live enforcement |
| **`Date.now()` / `new Date()` grep guard (r8)** | Test #16 greps every server-side `.ts`/`.tsx` file under `app/show/`, `app/admin/`, and any other route exercised by the screenshot manifest. Asserts: every match is either inside a function that imports from `lib/time/now.ts` (allowed: the utility itself), OR is on a line carrying the comment `// not-render-side: <reason>` (an inline waiver — required for mutation-path call sites). New render-side `new Date()` additions fail CI until migrated or waivered. Mirrors the AGENTS.md `// not-subject-to-meta: <reason>` waiver pattern from invariant #9. | `lib/time/now.ts` (utility); existing waiver-comment pattern from `tests/auth/_metaInfraContract.test.ts` |
| **CSRF / session-cookie volatility (r4, r13 amendment)** | The original wording named `globalSetup` + `storageState` reuse. **r13 (Phase I Codex R3):** the shipped harness uses per-capture sign-in instead. `scripts/help-screenshots.ts:162` calls `signInAs(page, adminFixture)` per capture; deterministic stability across captures comes from the same fixture identity being signed in on every capture, plus `ENABLE_TEST_AUTH=true` bypassing CSRF nonce churn for the test session. No `storageState` reuse is required because `signInAs(adminFixture)` is itself idempotent and deterministic. | `scripts/help-screenshots.ts:162` (per-capture sign-in); `tests/e2e/helpers/signInAs.ts` (helper) |
| **Supabase Realtime suppression (r4)** | The capture script disables Realtime subscriptions before navigation: either `page.addInitScript` overrides `window.WebSocket` to a no-op for the duration of capture, or the test-only build flag disables Realtime subscribe paths entirely. Live data flicker from Realtime push during the quiescence wait would otherwise produce non-deterministic captures. | Implementation picks the lighter option; both are reversible per-test. |

#### 3.6.3 CI drift gate

A CI step runs `pnpm screenshot:help` against a clean checkout, then `git diff --exit-code public/help/screenshots/`. **Non-zero exit fails the PR.** This is the load-bearing drift signal — if a UI change shifts a documented surface, the PR cannot merge without regenerated screenshots. AC-11.19 (idempotency) is what makes this safe: a second run on unchanged UI is byte-identical.

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

The catalog uses the existing `messageFor` accessor (not a new `lookup`). The accessor lives at `lib/messages/lookup.ts:31`. The post-r8 9-field `MessageCatalogEntry` is shown below at `lib/messages/catalog.ts:1-11`. The original wording named the pre-M11 six-field shape at `lib/messages/catalog.ts:1-8`, included here historically to make the r5+r8 extension diff legible — the post-extension shape that follows is the current, live state.

Pre-M11 shape (historical reference — the original spec wording cited `lib/messages/catalog.ts:1-8` for this six-field form before the r5+r8 extension landed):

```ts
// lib/messages/lookup.ts
export function messageFor(code: MessageCode, params?: MessageParams): MessageCatalogEntry;

// lib/messages/catalog.ts (pre-M11 shape — drifted from :1-8 to :1-11 with the r8 extension)
export type MessageCatalogEntry = {
  code: string;
  severity?: "info" | "warning";
  dougFacing: string | null;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
};
```

`messageFor` keeps its signature; the **return type gains three new fields (r5 + r8)**, which are now live in the catalog:

```ts
export type MessageCatalogEntry = {
  code: string;
  severity?: "info" | "warning";
  dougFacing: string | null;
  crewFacing: string | null;
  followUp: string | null;
  helpfulContext: string | null;
  title: string | null;             // NEW in M11 (r8) — short heading for /help/errors#<code>
  longExplanation: string | null;   // NEW in M11
  helpHref: string | null;          // NEW in M11
};
```

All three new fields are `string | null`. Existing callers continue to compile.

**`title` field (new r8):** the visible heading rendered above each error section on `/help/errors`. Round 6 caught that r7 referenced "title + longExplanation" in §4.3 but never added `title` to the schema. The catalog's existing `dougFacing` is the full Doug-rendered message (often a sentence), not heading material; raw `code` cannot be used (per invariant #5: no raw error codes in user-visible UI — code stays as the URL anchor only).

**`selfContainedAction` removed in r8 — catalog drift is M11's responsibility.** r5/r6/r7 invented a `selfContainedAction` opt-out for codes like `STALE_WRITE_ABORTED`, `CONCURRENT_SYNC_SKIPPED`, etc. Round 6 surfaced that these codes are canonically *master-spec admin-log-only* per master-spec line 2701: "a row whose Doug-facing message cell is `(admin log only ...)` / `—` and Crew-facing message cell is `—` is admin-log-only — the code is emitted to structured logs and sync_log for operator/Eric debugging, but is NEVER rendered to Doug's UI or crew's UI. The X.1 extractor normalizes the row's dougFacing and crewFacing to null." The runtime catalog has DRIFTED from master spec — it currently has non-null `dougFacing` for these codes. Per AGENTS.md invariant #7 (spec is canonical), the catalog must be reconciled, not blessed.

**M11 catalog-alignment subtask (r8 — replaces selfContainedAction):**

M11 reconciles `lib/messages/catalog.ts` with master-spec §12.4 admin-log-only contract by setting `dougFacing: null`, `crewFacing: null`, and `helpfulContext: null` on every code master-spec line 2701 names as admin-log-only. **The canonical list is derived programmatically** from master-spec §12.4 via `scripts/extract-admin-log-only-codes.ts` (plan Phase B). The derived set is the source of truth — any hand-enumeration below is illustrative only.

Illustrative subset (master-spec line 2701 examples; non-exhaustive):

> `STALE_WRITE_ABORTED`, `STALE_PUSH_ABORTED`, `WEBHOOK_NOOP_ALREADY_SYNCED`, `CONCURRENT_SYNC_SKIPPED`, `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `LOCK_OWNERSHIP_ASSERTION_FAILED`, `STAGED_PARSE_REVISION_RACE`, `DIAGRAMS_TAB_MISSING`

(plus the asset-recovery and cooldown variants that follow the same pattern: `STAGED_PARSE_REVISION_RACE_COOLDOWN`, `ASSET_RECOVERY_REVISION_DRIFT`, `ASSET_RECOVERY_DRIFT_COOLDOWN`).

**r11 amendment (reconciliation against master-spec §12.4):**

- `STALE_MANUAL_REPLAY_ABORTED` is **NOT** admin-log-only. Master-spec line 2734 (drifted from original wording `:2724` as master spec grew) carries explicit Doug-facing copy ("This manual sync is stale — a newer parse has already been applied. Refresh the page to see the current state."). Earlier spec drafts grouped it with the asset-recovery cooldown variants by surface-pattern similarity, but its master-spec row contradicts that grouping. The extractor (parser at master-spec line 2701's contract) correctly does not derive it. STALE_MANUAL_REPLAY_ABORTED is a Doug-facing entry that gets `title` / `longExplanation` / `helpHref` like any other Doug-facing entry in Phase E.

**r12 amendment (parser is the single source of truth for what gets stubbed):**

- The B.3 hard-gate alignment task adds null-stub entries to `lib/messages/catalog.ts` for **exactly the codes that B.2's parser derives from master-spec §12.4 AND that are absent from the live catalog** — no more, no less. The parser's contract (master-spec line 2701: Doug cell AND Crew cell are one of `—` / empty / `(admin log only ...)`) is canonical.
- Examples of codes the parser **DOES** derive AND that need stub-creation as of master-spec r-latest: `UNEXPECTED_PARENT`, `TYPO_NORMALIZED`, `WIZARD_FINALIZE_BATCHES_PENDING`, `SHOW_REALTIME_SUBSCRIPTION_FAILED`, `SHOW_REALTIME_JWT_RENEWED`, `SLUG_COLLISION_EXHAUSTED`. (Implementer runs the parser at execution time and aligns whatever it returns — this list is illustrative.) The original wording named `BRANCH_PROTECTION_DRIFT` in this list; master-spec line 2839 has since been amended to carry Doug-facing copy ("Branch protection no longer matches the X.6 contract..."), so the parser no longer derives it — removed from the illustrative list per Phase I Codex R7 verification (live `scripts/extract-admin-log-only-codes.ts` output confirms).
- Examples of codes the parser **does NOT** derive (so Phase B does NOT add stubs):
  - `LINK_CROSS_SHOW_REUSE` — master-spec line 2860 (drifted from original wording `:2846` as master spec grew) Doug cell starts with `(operator log only`, which is NON-canonical per master-spec line 2702. **M11 explicitly does not add or modify this entry**; if/when master-spec is amended to use `(admin log only`, the parser will derive it on the next run and the next milestone's alignment pass will null-stub it. **r20 amendment (Phase I Codex R9):** a null stub for `LINK_CROSS_SHOW_REUSE` IS now present in the live catalog at `lib/messages/catalog.ts:1276`, added by the **X.1** catalog-parity work (commit `7342f4f`, "feat(messages): X.1 catalog-parity extractor + tests + CI gate") — a separate-milestone catalog-parity pass landed AFTER the M11 spec was authored. M11 did not add it; X.1 did, for X.1-parity reasons orthogonal to the admin-log-only contract. The original M11-spec wording "absent from the live catalog" reflected the pre-X.1 state; reading the spec today, the entry is present-but-null and the X.1 parity gate carries it.
  - Any other entry whose Doug cell is a non-canonical pseudo-null sentinel.
- The plan-side B.3 task and the spec are now in lockstep: the parser is canonical for membership; both surfaces defer to whatever the parser returns at execution time.

Behavior change: AlertBanner stops surfacing the derived admin-log-only codes to Doug — which is master-spec-correct. Any test exercising the current (drifted) behavior breaks; those tests were testing drift.

With the catalog aligned, the docs-required predicate becomes a simple admin-visible filter without needing a `selfContainedAction` opt-out.

**Required-when predicate (r8 → r13 — single source of truth):** `predicate(entry) := severity !== "info" AND dougFacing != null`. The M11-added fields (`title`, `longExplanation`, `helpHref`) are the **consequent** — entries satisfying the predicate must have all three populated AND `helpHref` matching `/^\/help\/.+/`; entries NOT satisfying the predicate must have all three exactly `null`. The validator module `lib/messages/catalogDocsValidator.ts` (plan Task B.4) implements this contract as `contractViolations(entry)`; both forced fixtures (B.4) and the live-catalog assertion (E.13) import from it. **The earlier r8 wording that included the M11 fields inside the predicate definition was self-referential and is retracted in r13** — the M11 fields are what the predicate's truth value determines must be populated, not part of the predicate itself.

A tighter formulation: the meta-test asserts the **biconditional** that for every catalog entry where `severity !== "info"` AND `dougFacing != null`, all three M11 fields are non-null AND match shape (`helpHref` matches `/^\/help\/.+/`); for every entry where `dougFacing == null` OR `severity === "info"`, all three M11 fields ARE `null`. Crew-only entries (`dougFacing == null`, `crewFacing != null`) have all three `null` in v1; phase 2 widens the predicate and adds the fields then.

This is the v1 admin-scoped predicate. Live `components/admin/AlertBanner.tsx:57 (`INFO_SEVERITY_CODES` filter; drifted from original wording `:39-50` as the file's leading prose comments grew)` treats only `severity === "info"` as excluded from the alert banner; unset severity is rendered as warning-equivalent. The narrowed predicate covers warning + unset-severity entries AND restricts to admin-facing rows.

**Why admin-only in v1.** v1 gates the entire `/help/*` tree to admin (§3.5 / §5.5). Crew-only catalog entries (e.g., `LINK_EXPIRED` at `lib/messages/catalog.ts:11-17` — `dougFacing: null`, `crewFacing` non-null) would link crew users to a page they cannot open (403). Forcing `helpHref` on those entries in v1 would create a broken UX. Phase 2 ships `/help/crew/*` and the predicate widens to cover crew-facing entries — at that point `LINK_EXPIRED` gets a help link.

| Field | Type | Required when | Purpose |
| --- | --- | --- | --- |
| `title` | `string \| null`; non-null required | `severity !== "info"` AND `dougFacing != null` | Short heading rendered on `/help/errors#<code>` (raw code is anchor only per invariant #5) |
| `longExplanation` | `string \| null`; non-null required | Same predicate as above | Long-form plain-language explanation; rendered on `/help/errors#<code>` |
| `helpHref` | `string \| null`; non-null required | Same predicate as above | Deep-link target for "Learn more →" links |

Info-tier entries: not required. Crew-only entries (`dougFacing == null`, `crewFacing != null`): all M11 fields stay `null` in v1; phase 2 fills them. Master-spec admin-log-only entries: post-r8 catalog alignment, those have `dougFacing == null` and naturally fall into the "not required" bucket — no separate flag needed.

**Render-side guard (r5 → r8 simplified → r10 preview clarified):** The shared error renderer adds `Learn more →` only when **both** of these hold: (a) `helpHref` is non-null, AND (b) the rendering context is admin.

**Admin-context allowlist (precise definition, r10):** a rendering context is "admin" when it is `/admin/*` OR `/help/admin/*` — **EXCEPT** `/admin/show/<slug>/preview/<crew-id>` (impersonation), which is an admin URL that renders the crew page. Inside the previewed crew content, the renderer MUST treat the context as CREW (no `Learn more →` links emitted), so what Doug sees in preview matches what crew actually see. The ONLY admin-context element on the preview surface is the sticky preview banner at the top of the page (the `Previewing as Eric Weiss (A1) — [Exit preview]` element per master-spec §9.3), which DOES emit admin-context affordances (e.g., the `?` icon → `/help/admin/preview-as-crew#impersonation-banner`).

Crew-facing surfaces (`/show/<slug>`) and the previewed crew content within `/admin/show/<slug>/preview/<crew-id>` MUST NOT emit admin-gated `/help` links. Enforced by `tests/messages/_metaErrorRendererGate.test.ts` (§7.1 test 12) plus a new explicit case for preview (r10).

(r5/r6/r7's third conjunct `selfContainedAction !== true` is removed — once the catalog is aligned with master spec, the codes formerly flagged with that field have `dougFacing == null` and never render to Doug at all.)

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

> **Amendment (2026-06-11, M12.12):** this section was amended by the M12.12 affordance-matrix realignment (`docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-11-affordance-matrix-realignment-design.md`). The amendment records:
>
> 1. **Five testid renames** re-pointing rows orphaned by the M12.2 dashboard redesign onto the live surfaces: `dashboard-pending-ingestion` → `dashboard-needs-attention` (the "Sheets we couldn't auto-apply" panel became the Needs-attention inbox); `dashboard-restage-badge` → `dashboard-restage--legend` with an **affordance-kind change** from `?` tooltip to a conditional **legend link** under ShowsTable (owner-selected option C — a button-based tooltip cannot legally nest inside the whole-row `<Link>`); `per-show-sync-health` → `per-show-sync-footer` (the section became the quiet sync footer strip); `per-show-parse-warnings` → `per-show-alerts` (the section header is now "Alerts"); `per-show-preview-links` → `per-show-crew` (the section header is now "Crew").
> 2. **Needs-attention two-row split:** the single pending-ingestion row became two rows — the desktop dashboard inbox header tooltip (`visibleAt: desktop`; the header lives in the `hidden min-[720px]:flex` block) and the `/admin/needs-attention` page header tooltip (`visibleAt: both`; the mobile home for the same concept, shipped by the mobile needs-attention milestone).
> 3. **New `visibleAt` field + two-viewport walker contract:** every concrete row declares `visibleAt: "mobile" | "desktop" | "both"`. The deep-link walker runs as two Playwright projects (mobile + desktop viewports). Row **registration is unconditional** — every concrete row registers a test in both projects so a row can never silently drop out of the suite; the **runtime skip is by project** — the test body skips (not fails) when the current project's viewport is outside the row's `visibleAt`.
> 4. **`DEFERRED_TESTIDS` relocated into the matrix module** (`app/help/_affordanceMatrix.ts`): the still-deferred-row set moved out of the Playwright spec so the Vitest parity meta-test can import it without executing Playwright test registration.

Every `?` tooltip / "Learn more" / "What does this mean?" / "Take the tour" link in the master spec §9.0.1 is enumerated below with its M11 deep-link target AND a stable `data-testid`. Test #13 walks the matrix by `data-testid`, locates the affordance in the rendered DOM, asserts the link is present (or absent for crew rows), and asserts the link's `href` matches the matrix target.

**Discovery mechanism (r5):** the test does NOT depend on file:line citations (those rot when components move). It uses `data-testid` attributes that owning milestones (M3/M9/M10) MUST add when they ship the affordance. The testid naming convention: `help-affordance--<source-surface-slug>--<affordance-kind>`.

| Source surface | `sourceRoute` | Affordance | `data-testid` | Target | `visibleAt` | Owning milestone |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard - Active Shows header | `/admin` | `?` tooltip | `help-affordance--dashboard-active-shows--tooltip` | `/help/admin/dashboard#active-shows` | both | M3 / M9 |
| Dashboard - Needs attention summary card header (desktop inbox) | `/admin` | `?` tooltip | `help-affordance--dashboard-needs-attention--tooltip` | `/help/admin/review-queues#first-seen` | desktop | M12.12 |
| Needs attention page header (`/admin/needs-attention`) | `/admin/needs-attention` | `?` tooltip | `help-affordance--needs-attention-page--tooltip` | `/help/admin/review-queues#first-seen` | both | M12.12 |
| Dashboard - Review staged changes legend link | `/admin` | legend link | `help-affordance--dashboard-restage--legend` | `/help/admin/review-queues#re-stage` | both | M12.12 |
| Dashboard - Archived shows bucket header (`?bucket=archived`) | `/admin?bucket=archived` | `?` tooltip | `help-affordance--dashboard-archived-shows--tooltip` | `/help/admin/dashboard#archived` | both | M12.12 |
| Dashboard footer - Take the tour | `/admin` | Take the tour | `help-affordance--dashboard-footer--tour` | `/help/tour` | both | M9 |
| Per-show - Sync health footer strip | `/admin/show/rpas-central-2026` | `?` tooltip | `help-affordance--per-show-sync-footer--tooltip` | `/help/admin/per-show-panel#sync-health` | both | M12.12 |
| Per-show - Alerts section header | `/admin/show/rpas-central-2026` | `?` tooltip | `help-affordance--per-show-alerts--tooltip` | `/help/admin/parse-warnings` | both | M12.12 |
| Per-show - Crew section header | `/admin/show/rpas-central-2026` | `?` tooltip | `help-affordance--per-show-crew--tooltip` | `/help/admin/preview-as-crew` | both | M12.12 |
| First-seen staged review card (`/admin/show/staged/<stagedId>`) | `/admin/show/staged/STAGED_ID_PLACEHOLDER` | `?` tooltip | `help-affordance--first-seen-review-card--tooltip` | `/help/admin/review-queues#first-seen` | both | M9 |
| Settings - Administrators section header | `/admin/settings` | `?` tooltip | `help-affordance--settings-administrators--tooltip` | `/help/admin/settings#administrators` | both | M12.12 |
| Settings - Drive connection section header | `/admin/settings` | `?` tooltip | `help-affordance--settings-drive-connection--tooltip` | `/help/admin/settings#drive-connection` | both | M12.12 |
| Settings - Drive health status badge | `/admin/settings` | `?` tooltip (badge trigger) | `help-affordance--settings-drive-health-badge--tooltip` | `/help/admin/settings#drive-health` | both | M12.12 |
| Settings - Preferences section header | `/admin/settings` | `?` tooltip | `help-affordance--settings-preferences--tooltip` | `/help/admin/settings#preferences` | both | M12.12 |
| Onboarding wizard - Step 1 (service-account email) | `/admin` | `?` icon | `help-affordance--wizard-step1--tooltip` | `/help/admin/onboarding-wizard#service-account` | both | M10 |
| Onboarding wizard - Step 2 header | `/admin?step=2` | `?` tooltip | `help-affordance--wizard-step2--tooltip` | `/help/admin/onboarding-wizard#step-2` | both | M10 |
| Onboarding wizard - Step 3 header | `/admin?step=3` | `?` tooltip | `help-affordance--wizard-step3--tooltip` | `/help/admin/onboarding-wizard#step-3` | both | M10 |
| Per-show - Staged review card (re-stage) | `/admin/show/rpas-central-2026` | `?` tooltip (DEFERRED M11-G-D-2) | `help-affordance--per-show-restage-card--tooltip` | `/help/admin/review-queues#re-stage` | both | M9 |
| Preview-as-crew sticky banner | `/admin/show/rpas-central-2026/preview/eric-weiss` | `?` icon (DEFERRED M11-G-D-3) | `help-affordance--preview-banner--tooltip` | `/help/admin/preview-as-crew#impersonation-banner` | both | M9 |
| **(template-family row, r6 — r8 catalog-aligned)** Any error message rendered through `messageFor(code)` in `/admin/*` where `helpHref != null` (i.e., catalog entries matching the AC-11.6 predicate, naturally excluding the admin-log-only codes after r8 alignment) | `/admin/show/rpas-central-2026` | `Learn more →` | Testid family `help-affordance--error-message--<code>--learn-more` where `<code>` is a lowercase-kebab transform of the catalog code. **Walked by family rule in test #13, NOT by AC-11.36's single-testid regex** — implementation iterates the catalog and asserts presence per-code. | `/help/errors#<code>` via `messageFor(code).helpHref` | n/a (template-family) | M9 / M10 |
| **(negative-assertion row, r6 — not a matrix-walker row)** Crew-facing surfaces (`/show/<slug>`) | `/show/SLUG_PLACEHOLDER/SHARETOKEN_PLACEHOLDER` | **No** `Learn more →` link in v1 | (no testid) Test #13 asserts no `data-testid^="help-affordance--"` exists in the rendered crew page DOM | n/a in v1 | n/a (negative) | (Phase 2) |

The matrix is the source of truth for test #13. Owning milestones ship the affordance text via spec §9.0.1; M11 retrofits the `helpHref` resolution and the link element. **Owning milestones MUST also add the `data-testid` attribute exactly as named in this matrix** — see §7.1 test 13 for the discovery mechanism.

**Class-sweep guarantee:** any new section header in `/admin/*` that would carry a §9.0.1 tooltip MUST add (a) a row to this matrix, (b) the matching `data-testid` in the component, (c) the target `/help/...` page or anchor — all in the same PR. Test #13 fails if a `data-testid` named `help-affordance--*` exists in the codebase without a matrix row, OR if a matrix row's `data-testid` is missing from the rendered output. Enforced at CI time by `tests/help/_metaAffordanceMatrixParity.test.ts` (x-audits job `affordance-matrix-parity`, every PR) and the two-viewport deep-link walker (`help-affordances.yml`, path-filtered PRs + dispatch).

**Phase-2 widening:** when crew docs ship, the bottom row gains a `data-testid` and target; master-spec admin-log-only entries are unaffected since they never render to either Doug or crew.

---

## 6. Components

### 6.1 Page chrome

| Component | Purpose | File |
| --- | --- | --- |
| `<Sidebar>` | Left-rail nav with current-page highlight; collapses to top-of-page button-controlled disclosure (`<button aria-expanded aria-controls>` toggling a sibling `<div id={navListId}>` via React state — Codex R2 amendment; the original wording named `<details>` but the shipped implementation uses an explicit button to avoid the iOS Safari `<summary>` event-handling foot-guns) under 768px | `app/help/_components/Sidebar.tsx` |
| `<Header>` | Logo, theme toggle, "Back to admin →" link | `app/help/_components/Header.tsx` |
| `<Breadcrumb>` | Group → page; derived from `_nav.ts` | `app/help/_components/Breadcrumb.tsx` |

### 6.2 MDX components

| Component | Purpose | File |
| --- | --- | --- |
| `<Callout type>` | `note` / `warning` / `tip` — colored block using `app/globals.css` palette tokens. Each type has a fixed icon + heading color. | `app/help/_components/Callout.tsx` |
| `<Step n>` | Numbered procedural step. Used in adoption-track and onboarding-wizard pages. | `app/help/_components/Step.tsx` |
| `<Screenshot name>` | Renders `<picture>` with light/dark WebP sources from `public/help/screenshots/<name>-{light,dark}.webp`. The `name` value must exist in the manifest at `scripts/help-screenshots.manifest.ts` (the manifest's field is still called `key` as a plain JS object property; only the React prop is renamed). Required props: `name`, `alt`. Optional: `caption`. **r14 amendment:** prop renamed from `key` to `name` because `key` is a React reserved attribute and is never delivered to component props. | `app/help/_components/Screenshot.tsx` |
| `<ScreenshotPlaceholder>` | **Draft-only.** Labeled empty box for pages authored before the underlying surface exists. Must not appear in any MDX file at v1 close-out — lint enforces (§7.1 test 7). | `app/help/_components/ScreenshotPlaceholder.tsx` |
| `<RefAnchor id>` | Stable anchor wrapper for catalog deep-links; renders as a heading with `id={id}` and a click-to-copy link icon. | `app/help/_components/RefAnchor.tsx` |
| `<TipFromSheets>` | Adoption-track aside: "In your old workflow, you'd … now …" framing. Distinct background color so it reads as a side-note, not body. | `app/help/_components/TipFromSheets.tsx` |

### 6.3 Guard conditions per component

| Component | Null prop | Empty prop | Edge case |
| --- | --- | --- | --- |
| `<Callout>` | `type` is required; missing → TypeScript error, never reaches runtime. `children` optional → renders empty bubble (acceptable). | n/a | Unknown `type` value → defaults to `note` styling (defensive). |
| `<Step>` | `n` is required; missing → TypeScript error. `children` required for content. | Empty children → renders empty step (acceptable for skeleton drafts). | `n=0` or negative → renders as given; spec does not constrain values. |
| `<Screenshot>` | **r14:** `name` and `alt` required; `caption` optional. Missing → TS error. (Prop renamed from `key` to `name` because `key` is React-reserved and never delivered to component props.) | Empty `name` → build fails (manifest lookup throws). | Manifest entry without on-disk WebP → screenshot-coverage test fails (§7.1 test 8). |
| `<ScreenshotPlaceholder>` | `alt` required for a11y. `caption` optional. | Missing `alt` → TypeScript error. | Width/height fixed via CSS aspect-ratio. **Lint-prohibited in shipped v1 MDX (§7.1 test 7).** |
| `<RefAnchor>` | `id` required, must match regex `/^(MI-\d+[a-z]?_)?[A-Z][A-Z0-9_]*$/` — covers standard `SCREAMING_SNAKE_CASE` codes AND `MI-N[a-z]?_BODY` codes present in the live `lib/messages/catalog.ts` (e.g., `MI-1_VERSION_DETECTION_FAILED`, `MI-5a_DUPLICATE_CREW_NAME`). **r15 amendment:** broadened in Phase D R3 (commit `504b533`) after Codex R3 surfaced that the original `/^[A-Z_]+$/` rejected the ~30 MI-class entries Phase E.13 will render. `as` prop union `"h2" \| "h3"` with synchronous runtime guard (commit `5f508ad`) since MDX call sites are not typechecked. | Empty `id` → build-time anchor-resolver fails. | Duplicate `id` on same page → React duplicate-key warning + anchor-resolver flags as ambiguous. |
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

2. **Catalog meta-test** (`tests/messages/_metaErrorCatalogDocs.test.ts`) — r8 simplified
   - **Biconditional assertion:**
     - For every entry where `severity !== "info"` AND `dougFacing != null` → `title`, `longExplanation`, AND `helpHref` are all non-null; `helpHref` matches `/^\/help\/.+/`.
     - For every entry where `dougFacing == null` OR `severity === "info"` → `title`, `longExplanation`, AND `helpHref` are all `null`.
   - **Forced fixture cases (anti-tautology):**
     - synthetic entry with `severity: "warning"`, `dougFacing: "..."`, all M11 fields non-null → must PASS
     - synthetic entry with `severity: "warning"`, `dougFacing: "..."`, `helpHref: null` (one M11 field missing) → must FAIL
     - synthetic entry with `severity: "info"`, `dougFacing: "..."`, all M11 fields `null` → must PASS (info-tier)
     - synthetic entry with `dougFacing: null`, `crewFacing: "..."`, all M11 fields `null` → must PASS (crew-only)
     - synthetic entry with `dougFacing: null`, `crewFacing: "..."`, `helpHref: "/help/errors#X"` → must FAIL (biconditional violation — admin-log-only / crew-only must have null M11 fields)
   - Predicate covers both `severity === "warning"` and entries with unset severity (per `components/admin/AlertBanner.tsx:57 (`INFO_SEVERITY_CODES` filter; drifted from original wording `:39-50` as the file's leading prose comments grew)` default-warning rule)
   - Catches: (a) new admin-facing codes added without docs, (b) admin-log-only or crew-only codes accidentally populated with `helpHref` (would link to nonexistent or wrong-audience pages)
   - **r5/r6/r7's `selfContainedAction` opt-out is GONE in r8** — once the catalog is reconciled with master spec (M11 catalog-alignment subtask sets `dougFacing: null` on master-spec admin-log-only codes), those codes naturally satisfy the right-side of the biconditional with all-`null` M11 fields. No third conjunct needed.
   - Phase 2: predicate widens to also cover `crewFacing != null` once `/help/crew/*` ships

3. **Auth-gating + AdminInfraError mapping** (`tests/e2e/help-auth.spec.ts` — r14: path corrected to match Phase H's actual test location)
   - Unauthenticated GET on `/help/`, `/help/admin/dashboard`, `/help/errors`, `/help/tour` → 403
   - Authenticated-as-admin GET on the same → 200
   - Authenticated-as-crew (signed-link viewer) → 403 in v1 (phase-2 will relax for `/help/crew/*` only)
   - **AdminInfraError mapping:** with the Supabase RPC stubbed to throw, GET on `/help/` returns the cataloged 500-class surface (matching the `data-testid="admin-layout-infra-error"` or `help-layout-infra-error` sibling per §3.5). Assertion text is the **resolved fallback chain** `entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."` (mirroring `app/admin/layout.tsx:58-60` verbatim). For the live `ADMIN_SESSION_LOOKUP_FAILED` entry (`lib/messages/catalog.ts:1366` (moved from `:148-154` per AC-11.24 r15 line-citation correction — original wording named the older line range)) where `dougFacing == null`, this resolves to the `crewFacing` string ("Something is misconfigured for this show. Doug has been notified."). Test asserts the rendered text matches the fallback expression's actual output — NOT a hard-coded string the spec invents.

4. **MDX smoke test** (`tests/help/render.test.ts`)
   - Every `.mdx` and `.tsx` page under `app/help/` returns a non-empty rendered HTML body via the Next.js test renderer
   - Catches malformed MDX, missing required components, broken imports

5. **Nav consistency meta-test** (`tests/help/_metaNavSync.test.ts`)
   - Every entry in `_nav.ts` resolves to a real route under `app/help/`
   - Every route under `app/help/` is referenced in `_nav.ts`
   - Prevents orphan pages and dead nav entries

6. **Mobile-layout Playwright test** (`tests/e2e/help-mobile.spec.ts` — r14: path corrected to match live `playwright.config.ts` `testDir: "tests/e2e"`; the originally-named `tests/playwright/` directory was an early-draft convention superseded by the project-standard layout)
   - Viewport: 390 × 844
   - Navigates to a representative content page (`/help/admin/dashboard`)
   - Asserts: sidebar is collapsed (top-of-page button-controlled disclosure — `<button aria-expanded aria-controls>` per Codex R2 amendment; original wording named `<details>`); body content `width <= 390 - 2 * gutter`; no horizontal scroll (`document.documentElement.scrollWidth === window.innerWidth`); every interactive target ≥ 44 × 44 px (with WCAG 2.5.5 inline-prose exception per PRODUCT.md:59 / help-mobile.spec.ts filter)
   - **Real-browser assertion** — jsdom is insufficient per the project's Tailwind v4 flex-stretch lesson

7. **No-placeholder-in-shipped-v1 lint** (`tests/help/no-placeholders.test.ts`)
   - Greps `app/help/**/*.mdx` for `<ScreenshotPlaceholder` and fails if found
   - Forces every documented surface to ship with a real `<Screenshot name="...">` referencing a manifest entry
   - Inverts the previous (revision-1) lint, which prohibited real screenshots

8. **Screenshot coverage** (`tests/help/screenshot-coverage.test.ts`)
   - For every `<Screenshot name="...">` reference across `app/help/**/*.mdx`, asserts: (a) the key exists in `scripts/help-screenshots.manifest.ts`, (b) both `<key>-light.webp` and `<key>-dark.webp` exist on disk under `public/help/screenshots/`, (c) both files are non-empty
   - Anti-tautology: assertion reads MDX source + manifest source + filesystem; the rendered page is not the side of the test

9. **Manifest integrity** (`tests/help/_metaScreenshotManifest.test.ts`)
   - Every manifest entry's `route` resolves to a real page under `app/help/`
   - Every manifest entry has both light + dark output on disk
   - Every fixture named in a manifest entry exists in `fixtures/shows/`
   - Catches stale manifest entries (UI deleted but manifest not pruned) and orphan WebP files (output for a removed entry)

10. **`<Screenshot>` `<picture>` contract test** (`tests/help/screenshot-picture-contract.test.tsx`)
    - Renders `<Screenshot name="<test-key>" alt="<test-alt>" />` against a stub manifest with a known key
    - Asserts the rendered output contains `<picture>` with a `<source media="(prefers-color-scheme: dark)" srcset="…-dark.webp">` and a default `<img src="…-light.webp" alt="<test-alt>">`
    - **Anti-tautology:** assertion reads the rendered HTML from the component; the snapshot/regex specifically pins both the media query string and the WebP path pattern. A broken `<picture>` rendering cannot pass because the absence of either element would fail the regex.
    - Directly enforces AC-11.20 — without this test, the `<picture>` contract has only the visual fixtures to prove it works.

11. **CI drift gate** (CI workflow step, not a unit test)
    - CI runs `pnpm screenshot:help` against a clean checkout (with `pnpm db:seed` precondition)
    - Then `git diff --exit-code public/help/screenshots/`
    - Non-zero exit → PR fails. The PR review surface shows the diff.
    - This is the load-bearing drift signal; idempotency (AC-11.19) is what makes it safe.

12. **Error-renderer gate** (`tests/messages/_metaErrorRendererGate.test.ts`) — r4, r10 expanded
    - Renders each catalog entry through the shared error renderer in **four** contexts: admin (`/admin/*`), help-admin (`/help/admin/*`), crew (`/show/<slug>`), and **preview-as-crew** (`/admin/show/<slug>/preview/<crew-id>` — r10 new case)
    - Asserts: admin and help-admin contexts emit `Learn more →` when `helpHref` is non-null; crew context does NOT emit `Learn more →` regardless of `helpHref` value; **preview-as-crew context is treated identically to crew** for the renderer — no admin links inside the previewed content. The sticky preview banner is tested separately as admin-context.
    - Prevents future widening of the catalog predicate from accidentally leaking admin-gated `/help` links into crew-rendered surfaces, AND prevents Doug-preview-view from diverging visually from real-crew-view.
    - **Anti-tautology:** the rendering helper is called against a mock catalog entry with `helpHref` populated even on crew-only rows (a forced-mismatch); the test asserts the gate's behavior, not the catalog's predicate

13. **Deep-link affordance walker** (`tests/e2e/deep-link-walker.spec.ts` + companion `tests/help/deep-link-walker-template-family.test.tsx` + `tests/help/deep-link-walker-reverse.test.ts`; the original wording named `tests/help/deep-link-walker.test.ts`, replaced by the actual shipped test layout) — r4 → r5 → r6 → r7 unit-level template family
    - **Discovery mechanism:** the test reads §5.6's matrix (as a typed `affordanceMatrix.ts` import). Three row classes:
       - **Concrete-testid rows** (E2E via Playwright): walks each row by its documented `data-testid` against the source-surface route. Asserts the affordance is present and the link's `href` matches the matrix target. 13 rows after M11 Amendment 1 collapsed the parse-warning row into the template family — pinned by `tests/help/_affordance-matrix-shape.test.ts:33` (original wording named "~11 rows" before the matrix expanded to the current 13 concrete + 1 template-family + 1 negative shape).
       - **Template-family row (UNIT-LEVEL, not E2E — r7):** the renderer is exercised via a unit test that feeds each catalog entry matching the AC-11.6 predicate (mocked, in-memory) into the shared error-renderer component, asserts the rendered output contains the expected per-code testid `help-affordance--error-message--<lowercase-kebab(code)>--learn-more` AND a `Learn more →` link whose `href` matches `messageFor(code).helpHref`. r6 specified per-code E2E navigation; round-5 finding 5 caught that this doesn't scale (104 catalog entries, dozens matching). r7 moves it to renderer-level. Plus ONE representative E2E surface that renders a real error code end-to-end (smoke check that the wiring works in the live UI).
       - **Negative-assertion row** (E2E): navigates as a signed-link viewer to `/show/<slug>`, asserts no `data-testid^="help-affordance--"` element exists.
    - **Reverse-direction check:** greps the codebase for any `data-testid="help-affordance--*"` literal and asserts each is enumerated in `affordanceMatrix.ts` (concrete rows) OR matches the template-family pattern.
    - File:line citations are NOT used — components can move freely as long as the testid travels with the affordance.

14. **Fixture-range parser unit test** (`tests/help/fixture-range-parser.test.ts`) — new in r7
    - Unit-tests `scripts/help-screenshots-fixture-range.ts` against the known fixture corpus (`fixtures/shows/raw/*`): for each fixture, asserts the parser returns the expected operational date range parsed from the INFO tab DATES rows.
    - Coverage: at least one show per template version represented in `fixtures/shows/_schema-diff.md` (2024 / 2025 / 2026 schema generations).
    - Catches parser regressions that would let manifest entries with out-of-window `frozenClockInstant` slip through.

15. **`lib/time/now.ts` gating unit test** (`tests/time/now.test.ts`; original wording named `tests/time/now-gate.test.ts`, renamed in implementation) — new in r7
    - Asserts the utility returns the frozen instant ONLY when ALL three preconditions hold (header present, `ENABLE_TEST_AUTH === "true"`, valid `Authorization: Bearer`).
    - Production-mode case: with `ENABLE_TEST_AUTH` unset, the header is ignored and the utility returns real `Date.now()`.
    - Capture-boundary case: two consecutive calls with the same frozen header 60+ seconds apart return byte-identical ISO strings (per AC-11.37).
    - This replaces r6's E2E capture-boundary check, which was too expensive for CI.

16. **Server-side time-call grep guard** (`tests/help/_metaServerTimeGuard.test.ts`) — r8 introduced; r9 tightened
    - **Scan-path derivation (r9):** scanned route roots are derived programmatically from `scripts/help-screenshots.manifest.ts` — the test reads the manifest's `route` field for every entry, collapses to the unique top-level segments (`app/show`, `app/admin`, and any future additions), and scans those subtrees. NOT a hard-coded path list. Adding a new manifest entry pointing at a previously-unscanned route directory automatically widens the scan.
    - **Per-match rule (r9 tightened):** for each match of `new Date()` / `Date.now()` in a scanned file: the test asserts EITHER (a) the match is inside `lib/time/now.ts` itself (the utility's implementation), OR (b) the matched **line** (not file) carries `// not-render-side: <reason>` waiver comment. A file-level import of `lib/time/now.ts` does NOT exempt other lines in the same file — every raw `Date` call gets its own per-line allowance. r8's "file imports utility" loophole closed.
    - Catches new render-side time call sites added without migration to the utility AND mixed-mode files where some paths migrated but others didn't.
    - Anti-tautology: reads source files directly (filesystem), not the rendered output.

17. **Catalog-alignment meta-test** (`tests/messages/_metaCatalogAdminLogOnlyAlignment.test.ts`) — new in r9
    - Derives the canonical admin-log-only set by running `scripts/extract-admin-log-only-codes.ts` against `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4
    - For each code in the derived set, asserts the live `MESSAGE_CATALOG` entry has `dougFacing: null` AND `crewFacing: null` AND `helpfulContext: null` AND (new M11 fields) `title: null` AND `longExplanation: null` AND `helpHref: null`
    - **Anti-tautology:** the test reads master-spec markdown as the assertion side and live `lib/messages/catalog.ts` as the page-under-test. Bypassing via mocks is impossible — both files are read directly.
    - **Parser normalization (r10 — clarified per round-8 finding 4):** the extractor classifies a row as admin-log-only when the `Doug-facing message` cell — after trimming whitespace — is EITHER (a) the literal em-dash `—` (U+2014), (b) an empty cell, OR (c) a parenthetical starting with `(admin log only` (with optional `— short hint)` suffix per master-spec line 2702). Other null-shaped sentinels (`null`, `none`, `n/a`) are NOT recognized — they would force a master-spec edit instead, matching the line-2702 em-dash-normalization rule. Forced parser fixtures cover all three accepted shapes.
    - Catches: (a) new admin-log-only rows added to master spec but not yet reflected in catalog; (b) accidental population of any user-facing field on an admin-log-only entry; (c) r8 enumeration drift (the test enforces derivation, not enumeration).
    - This is the structural guard that round-7 finding 1 surfaced — without it, M11 could ship with admin-log-only codes still rendering to Doug via drifted catalog state.

18. **End-to-end clock-pipeline proof** (`tests/e2e/help-screenshots-clock-pipeline.spec.ts`; original wording named `tests/playwright/help-screenshots-clock-pipeline.spec.ts`, the project's e2e tests live under `tests/e2e/` not `tests/playwright/`) — new in r10 per round-8 finding 2
    - Captures the `/admin/show/<slug>/preview/<crew-id>` manifest entry TWICE in the same test run with two different `frozenClockInstant` values (e.g., one mid-show, one pre-show).
    - Asserts the two captured WebP files differ byte-wise — proving the request-scoped `X-Screenshot-Frozen-Now` header actually reaches the server component's render path (NOT just `lib/time/now.ts` in isolation).
    - Lives in the dedicated `screenshots-help` Playwright project (same harness as the production screenshot captures). Runs ONCE per CI pipeline — not gated on each PR for speed (the daily/branch-protection schedule covers it).
    - This is the missing test home for AC-11.39 (round-8 finding 2); without it, AC-11.39's "end-to-end proof" claim had no concrete implementation.

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

1. **Catalog file location.** Where exactly the §12.4 catalog lives today — resolved to `lib/messages/catalog.ts`. The original wording asked between two candidates; `lib/messages/codes.ts` was never created and no longer exists as a path. Implementation reads existing source-of-truth.
2. **Sidebar primitive reuse.** Whether `<Sidebar>` reuses an existing `/admin` nav primitive or is bespoke. Implementation surveys the codebase.
3. **`_nav.ts` shape.** Flat array of `{slug,title,group}` vs. nested groups. Implementation picks based on what reads cleanest with current TS conventions.
4. **Anchor resolver invocation.** Whether the build-time anchor resolver runs as a `prebuild` script (in `package.json`) or as a vitest test in CI. Implementation picks based on existing build hooks.
5. **Theme toggle reuse.** Whether `<Header>`'s theme toggle reuses the same component the crew page uses, or duplicates the pattern.
6. **Recapture obligation for downstream milestones.** When a post-M11 milestone changes a UI surface documented in `/help`, that milestone's plan must include a "regenerate screenshots" task. The CI drift gate (§3.6.3 / §7.1 item 11) is the automatic signal — the PR will fail until `pnpm screenshot:help` is rerun and the new bytes are committed. Plan-writing decision per downstream milestone, not spec-blocking.

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
| **M11 milestone sequencing** | M11 starts only after M10 closes. Real screenshots require their documented surfaces (M3 / M4 / M9 / M10) to be built and stable. | §1 metadata |
| **Search in v1** | No full-text search. Sidebar + Ctrl-F is sufficient for 13 pages. | §2 |
| **Auth gating breadth** | All of `/help/*` is admin-gated in v1. Phase 2 splits via route groups; URLs do not change. | §3.5 |
| **`/help/errors` rendering** | TSX page iterating the catalog. MDX considered and rejected (would duplicate the short message). | §4.3 |
| **`/help/admin/parse-warnings` rendering** | MDX with anchored sections. TSX considered and rejected (content is editorial). | §4.2 |
| **Catalog API surface** | The accessor is `messageFor(code): MessageCatalogEntry` (per `lib/messages/lookup.ts:31`). M11 does NOT introduce a new `lookup` function — it extends the existing `MessageCatalogEntry` type (per `lib/messages/catalog.ts:1-11` — the type now spans lines 1-11 after r8's three-field extension; original wording named `:1-8` for the pre-extension shape) with **three** new fields: `title`, `longExplanation`, `helpHref` (per AC-11.5 / §5.1 r8 — the original wording named "two new optional fields" before r8 added `title`). **Per round-1 finding 1, r8 field-count correction.** | §5.1 |
| **Catalog schema extension shape (final r8)** | Three new fields: `title: string \| null` (r8), `longExplanation: string \| null`, `helpHref: string \| null`. Required-when predicate: `severity !== "info"` AND `dougFacing != null`. The meta-test asserts a **biconditional** between the predicate and "all three fields non-null." **Predicate evolution (resolved):** r2 used `severity === "warning"` (missed unset-severity default-warning entries — round-1 finding 3); r3 broadened with `OR crewFacing != null` (would link crew to 403 — round-2 finding 1); r4–r7 introduced `adminLogOnly`/`selfContainedAction` opt-out flags (round-3/4/5 escalation); **r8 removes the opt-out flag entirely** and instead reconciles the catalog with master-spec admin-log-only contract (AC-11.35). With the catalog aligned, the simple predicate suffices. | §5.1, §7.1 test 2, AC-11.5, AC-11.6, AC-11.11, AC-11.35 |
| **Rendering posture** | **Dynamic at request time** for `/help/*` (not statically prerendered). `requireAdmin()` runs Supabase queries on every request. MDX content is statically compiled to RSC; the layout gate is dynamic. **Per round-1 finding 2.** | §3.4 |
| **`AdminInfraError` handling on `/help`** | Mirrors `app/admin/layout.tsx:47-71` verbatim. `/help/layout.tsx` wraps `requireAdmin()` in try/catch, catches `AdminInfraError`, renders the cataloged 500-class surface via `messageFor("ADMIN_SESSION_LOOKUP_FAILED")`. Test #3 verifies. **Per round-1 finding 2.** | §3.5, §7.1 test 3 |
| **Screenshot harness reproducibility** | The harness specifies a dedicated Playwright project, ~~`globalSetup` running `pnpm db:seed`~~ (superseded by **r12**: a paired `screenshots-help-setup` Playwright setup-project at `tests/e2e/screenshots-help-setup.ts`), reuse of `signInAs` from `tests/e2e/helpers/signInAs.ts`, pinned `sharp` encoder settings, deterministic browser settings (timezone, locale, color-scheme, reduced motion, font hinting, animations off), quiescence wait, **fixed clock (browser + server) per r4**, ~~**CSRF/cookie stability via `storageState` reuse per r4**~~ (superseded by **r13**: per-capture `signInAs(adminFixture)` at `scripts/help-screenshots.ts:162` — deterministic sign-in identity + `ENABLE_TEST_AUTH=true` CSRF bypass replace storageState persistence), **Supabase Realtime suppression per r4** (no-op WebSocket init script at `scripts/help-screenshots.ts:71`), and a CI `git diff --exit-code` gate. **Per round-1 finding 4 + round-2 finding 3 + Phase I Codex R2 (r12) + R3 (r13).** | §3.6.2, §3.6.3, AC-11.27, AC-11.33 |
| **Crew-rendered errors never link to `/help`** | Predicate narrows to `dougFacing != null` in v1 + render-side gate strips `Learn more →` from crew contexts even if `helpHref` is accidentally populated. **Per round-2 finding 1.** Phase 2 widens predicate + renders crew links to `/help/crew/*`. | §5.1, §7.1 test 12 |
| **AdminInfraError rendered text is the fallback chain, not `dougFacing` literally** | `entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."` (matches `app/admin/layout.tsx:58-60`). For live `ADMIN_SESSION_LOOKUP_FAILED` (`dougFacing: null`), resolves to `crewFacing`. **Per round-2 finding 2.** | §3.5, AC-11.24, §7.1 test 3 |
| **Static-vs-dynamic build contract** | `pnpm build` **compiles** MDX to RSC chunks; does NOT prerender static HTML. `app/help/layout.tsx` exports `dynamic = "force-dynamic"` to be explicit. AC-11.1 asserts compilation, not prerender. **Per round-2 finding 4.** | §3.2, §3.4, AC-11.1, AC-11.31 |
| **§9.0.1 surface coverage** | §5.6 enumerates every section header / `Learn more →` / "Take the tour" affordance per master-spec §9.0.1, with explicit `/help/...` target per row. Test #13 walks the matrix. New tooltips added in `/admin` must add a matrix row in the same PR. **Per round-2 finding 5.** | §5.6, §7.1 test 13 |
| **Existing-code citation discipline** | All citations in §12 cite `file:line` (no "deferred to implementation"). r3's `next.config.ts:13` corrected to `:17` in r3; r3's directory-only citations corrected to file:line in r4 (`app/layout.tsx:1`, `app/globals.css:1`). **Per round-2 finding 6.** | §12 |
| **First-seen staged-review surface in matrix** | §5.6 row added for `/admin/show/staged/<stagedId>` per master-spec §9.1 / §9.2 sub-section 0. Same review-card UI as `/admin/show/<slug>?review=`, slug-less variant. Target: `/help/admin/review-queues#first-seen`. **Per round-3 finding 1.** | §5.6 row "first-seen staged review card" |
| **Catalog drift is M11's responsibility (r8 final)** | r6 found master-spec line 2701 names codes like STALE_WRITE_ABORTED / CONCURRENT_SYNC_SKIPPED as admin-log-only with `dougFacing: null`; live catalog has non-null `dougFacing` — drift. r5/r6/r7 invented `adminLogOnly`/`selfContainedAction` flags to dodge this; r8 instead **reconciles the catalog** (M11 catalog-alignment subtask sets `dougFacing: null` on all master-spec admin-log-only codes per AC-11.35). After alignment, the simple predicate `severity !== "info" AND dougFacing != null` suffices — no opt-out flag, no third conjunct. | AC-11.35, §5.1 |
| **Walker discovery uses `data-testid`, not file:line** | §5.6 matrix gains a `data-testid` column with `help-affordance--*` naming convention. Owning milestones (M3/M9/M10) ship the testids; test #13 walks them. File:line citations would rot when components move. **Per round-3 finding 3.** | §5.6, §7.1 test 13, AC-11.36 |
| **`frozenClockInstant` is per-entry required, no default** | r4's project default (`2026-04-15T14:30:00Z`) fell outside the default fixture's window (RPAS Central 2026: 3/22–3/26). r5 removes the default — manifest entries MUST declare `frozenClockInstant` per-entry, validated against the fixture's date window pre-capture. **Per round-3 finding 4.** | §3.6.2 "Fixed clock" + "Frozen-instant fixture validation", AC-11.32, AC-11.34 |
| **Fixed-clock contract preserves AC-11.16** | ~~r5 drops the hypothetical `SCREENSHOT_FROZEN_NOW` env var. Server-rendered relative time stays deterministic via fixture seed timestamps anchored relative to `frozenClockInstant` — no new env var.~~ ~~**Reversed in r6 (round-4 finding 3):** fixture-seed-only doesn't work — server `Date.now()` runs at real wall-clock, so "X min ago" still drifts. r6 reintroduces `SCREENSHOT_FROZEN_NOW` as a test-only env gated by `ENABLE_TEST_AUTH`. AC-11.16 enumerates it explicitly; AC-11.37 enforces production-build rejection + minute-boundary stability.~~ **Superseded by r7 — see next §11 row "Server-side clock is request-scoped header, not env var".** Final state: no new env var; capture script sends `X-Screenshot-Frozen-Now` request-scoped header consumed by `lib/time/now.ts` under `ENABLE_TEST_AUTH` + bearer-secret gating. AC-11.16 enumerates "no new env vars". | §3.6.2, AC-11.16, AC-11.32, AC-11.37 |
| **Predicate-consistency + flag-enumeration history (collapsed r8)** | Rounds 4 and 5 surfaced individual omissions in r5/r6/r7's `selfContainedAction` opt-out (predicate inconsistency across AC/test, incomplete enumeration list). All resolved in r8 by removing the flag entirely; the catalog-alignment subtask in AC-11.35 covers the same surface canonically. | AC-11.35 |
| **Matrix testid regex applies to concrete-testid rows only** | The single-testid regex `^help-affordance--[a-z0-9-]+--(tooltip\|tour\|learn-more)$` applies to rows with a single concrete testid. The error-message template-family row is walked by family rule (per-code iteration); the crew-negative row is a separate negative assertion. Step 2 + Step 3 row split into separate rows. **Per round-4 finding 4.** | AC-11.36, §5.6, §7.1 test 13 |
| **Fixture date range source is the raw INFO tab, not `_schema-diff.md`** | r5 incorrectly cited `fixtures/shows/_schema-diff.md` as the operational-range source — that file documents field shapes, not per-fixture ranges. r6 corrects: a small parser at `scripts/help-screenshots-fixture-range.ts` reads each fixture's raw INFO tab DATES rows directly and returns the operational range. Parser is unit-tested against the known fixture corpus. **Per round-4 finding 5.** | §3.6.2 row "Frozen-instant fixture validation", AC-11.34 |
| **Catalog meta-test asserts a biconditional, not just a forward implication (r8)** | r4–r7's test #2 predicate kept getting out of sync with AC text as the third conjunct moved. r8 reformulates as a biconditional: predicate ↔ "all three M11 fields non-null." Catches accidental population of `helpHref` on non-renderable entries (which would link to nonexistent or wrong-audience pages). Symmetric forced fixtures prove both directions. | §7.1 test 2 |
| **Server-side clock is request-scoped header, not env var** | r6's per-entry env approach was infeasible: Playwright's `webServer` starts the Next process once, `globalSetup` cannot mutate `process.env` per capture. r7 replaces with a request-scoped header `X-Screenshot-Frozen-Now` validated by the existing `ENABLE_TEST_AUTH` + `Authorization: Bearer ${TEST_AUTH_SECRET}` gating. **Per round-5 finding 2.** AC-11.16 simplified — no new env var. | §3.6.2 Fixed clock r7, AC-11.16, AC-11.32, AC-11.37 |
| **r5/r6/r7's flag concept retired** | The `adminLogOnly`/`selfContainedAction` flag was an attempt to dodge catalog-master-spec drift. r8 retires the flag and aligns the catalog instead. Spec-text references to `selfContainedAction` in earlier sections are historical only; the spec contract is the simplified r8 predicate. | (n/a — historical) |
| **Admin-log-only set derived from master spec, not enumerated** | r8 enumerated 14 codes; round-7 finding 1 named 3 more (`DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `PENDING_SNAPSHOT_ROLLBACK_STUCK`, `PENDING_SNAPSHOT_PROMOTE_STUCK`) that r8 missed. r9 replaces the enumeration with a derivation: `scripts/extract-admin-log-only-codes.ts` parses master-spec §12.4 markdown and emits the canonical set. New meta-test #17 enforces. The spec doesn't re-list codes; the master-spec markdown IS the source. | AC-11.35, §7.1 test 17 |
| **Test #16 scan paths derive from manifest, not hard-coded** | r8 hard-coded `app/show/`, `app/admin/`; r9 derives scan roots from `scripts/help-screenshots.manifest.ts` so future manifest additions widen the scan automatically. Plus per-match (not per-file) waiver rule. **Per round-7 finding 2.** | §7.1 test 16 |
| **Fixture path shape is flat single-file, not nested directories (r10)** | r5–r9 referenced `fixtures/shows/raw/<show>/INFO.md` (nested). Actual corpus is flat `fixtures/shows/raw/<fixture>.md` plus pdf-only split `fixtures/shows/pdf-only/<fixture>__INFO.md`. **Per round-8 finding 1.** | §3.6.2 row, AC-11.34 |
| **AC-11.39 has a named test home: §7.1 item #18 (r10)** | AC-11.39 mandated an end-to-end clock-pipeline proof but had no test home. r10 adds test #18 (E2E clock-pipeline proof, dedicated Playwright project, runs daily not per-PR). **Per round-8 finding 2.** | §7.1 test 18 |
| **Preview-as-crew is CREW context for the renderer, despite being on an /admin/ URL (r10)** | The render-side gate's admin-context allowlist includes `/admin/*` AND `/help/admin/*` — EXCEPT `/admin/show/<slug>/preview/<crew-id>` impersonation, where the previewed crew content is rendered as crew-context (no Learn-more links). Only the sticky preview banner on that surface is admin-context. Without this exception, Doug's preview diverges visually from real crew view. **Per round-8 finding 3.** | §5.2 admin-context allowlist, §7.1 test 12 (now 4-context) |
| **Admin-log-only parser handles all three null-cell shapes (r10)** | The line-2701 normalization rule accepts: (a) literal em-dash `—`, (b) empty cell, (c) parenthetical starting `(admin log only`. r9's parser-spec mentioned (a) and (c); r10 adds (b) explicitly. Forced parser fixtures cover all three. Other sentinels (`null`, `none`, `n/a`) are NOT recognized — forcing master-spec edits to use the canonical shapes. **Per round-8 finding 4.** | §7.1 test 17 normalization clause |
| **/help/errors trailing CTA is "tell Eric", not self-linking "Learn more"** | §4.3 said each section ends with "If this keeps happening, tell Eric →". AC-11.11 said the trailing link is `Learn more → entry.helpHref` — but on `/help/errors` itself, `helpHref` points back to the same page. r10 aligns AC-11.11 with §4.3: trailing CTA is the bug-report link; `Learn more →` lives on source surfaces (admin pages where the error renders) per §5.6 matrix, NOT on the destination page. **Per round-8 finding 5.** | §4.3, AC-11.11 |
| **r7 tests live in §7.1 inventory and count in AC-11.12** | r6 added AC-11.34/12.37 but the new tests weren't enumerated in §7.1 — implementation could pass the listed tests while missing the new safety checks. r7 adds test #14 (fixture-range parser) and #15 (`lib/time/now.ts` gating + boundary). AC-11.12 updated to 14 unit/integration tests. **Per round-5 finding 4.** | §7.1 tests 14 + 15, AC-11.12 |
| **Per-code error-renderer check is unit-level, not E2E** | r6's template-family rule iterated every catalog code via E2E navigation (104 entries, dozens matching). r7 moves it to a renderer-level unit test feeding mock catalog entries; one representative E2E surface remains as a smoke check. **Per round-5 finding 5.** | §7.1 test 13 (Template-family row) |
| **Concept track** | Excluded from v1. Explanations live inline on operator pages. | §2 |
| **Doug as bug-report triager** | **No.** Doug receives content questions from crew via his existing channels (phone/text); app bug reports route to Eric via M8 GitHub pipeline. `/help` covers no bug-triage surface. | (Resolved during brainstorm; codified here.) |
| **`Learn more →` text vs. icon** | Implementation chooses based on `impeccable` audit; spec does not constrain. | §10 |

---

## 12. Existing-code citations

(Per AGENTS.md self-review additions: every factual claim about current code MUST cite `file:line`.)

| Claim | Citation | Verified |
| --- | --- | --- |
| `experimental.authInterrupts` is enabled, enabling `forbidden()` | `next.config.ts:23` (drifted from `:17` — that line is now a comment; the flag itself moved to `:23`) | ✅ |
| `requireAdmin()` and `requireAdminIdentity()` exist, throw `AdminInfraError` on infra paths, call `forbidden()` on auth-deny | `lib/auth/requireAdmin.ts:41-48` (`AdminInfraError` class) and `:52-126` (`requireAdminIdentity`) | ✅ |
| Existing admin layout catches `AdminInfraError` and renders cataloged 500-class surface | `app/admin/layout.tsx:47-71` | ✅ |
| `messageFor(code): MessageCatalogEntry` is the live catalog accessor (NOT `lookup`) | `lib/messages/lookup.ts:31` | ✅ |
| `MessageCatalogEntry` shape: `{ code, severity?, dougFacing, crewFacing, followUp, helpfulContext, title, longExplanation, helpHref }` (M11 r8 extension; original wording named `:1-8` for the pre-extension six-field shape) | `lib/messages/catalog.ts:1-11` | ✅ |
| `severity` is OPTIONAL on catalog entries; many user-visible codes omit it (e.g. `LEAKED_LINK_DETECTED`) and are rendered as warning-equivalent | `lib/messages/catalog.ts:64` (drifted from `:46-53` as catalog grew during M9.5/M10); default-warning rule at `components/admin/AlertBanner.tsx:57 (`INFO_SEVERITY_CODES` filter; drifted from original wording `:39-50` as the file's leading prose comments grew)` | ✅ |
| Test-auth pattern: `signInAs(page, fixture)` POSTing to `/api/test-auth/set-session` with `Authorization: Bearer ${TEST_AUTH_SECRET}` | `tests/e2e/helpers/signInAs.ts:43-73` | ✅ |
| `ENABLE_TEST_AUTH` + `TEST_AUTH_SECRET` env vars required at server start for test-auth | `tests/e2e/helpers/signInAs.ts:1-23` (documentation block) | ✅ |
| `ADMIN_SESSION_LOOKUP_FAILED` is the cataloged code thrown by `AdminInfraError` | `lib/auth/requireAdmin.ts:42` | ✅ |
| App Router uses `app/` not `pages/` | `app/layout.tsx:1` (root layout) | ✅ |
| Tailwind v4 in use; `app/globals.css` declares `@theme` tokens | `app/globals.css:1` (`@import "tailwindcss"`) and `@theme` block within | ✅ |
| Existing crew-pages spec section §9.0.1 mandates the "?" / "What does this mean?" / "Take the tour" affordances | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2548-2556` (heading + affordance bullets; original wording named `:2540–2549` which has drifted as the master spec grew) | ✅ |
| §12.4 is the error-code catalog | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2691` heading (drifted from original `:2681` which is now §12.2 Observability) | ✅ |
| §9.2 parse-warnings panel is at `/admin/show/<slug>` | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2589` heading (drifted from original `:2581` which is now §9.1.1 existing-show staged-review) | ✅ |
| `/admin/show/<slug>/preview/<crew-id>` is the impersonation route | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2596` heading | ✅ |
| `pageExtensions` is the App Router escape hatch for MDX routing | `@next/mdx` documentation; standard Next 16 pattern | n/a (Next.js framework convention) |
| `requireAdmin` is the project's existing admin gate (not a new helper) | next.config.ts comment block confirms its existence | ✅ |

All citations in this table cite `file:line` as required by AGENTS.md self-review additions. Where the spec previously deferred internal line numbers to implementation, that text has been replaced with verified `file:line` evidence (r4). Future moves of these files require updating the citations in the same PR (caught by code review per invariant #7).

---

## 13. Acceptance criteria

| ID | Criterion |
| --- | --- |
| **AC-11.1** | All 13 pages under `app/help/*` exist and **compile** to RSC chunks during `pnpm build` (no static HTML prerender — see §3.2 / §3.4). At runtime, each page renders non-empty HTML when GET'd by an authenticated admin. |
| **AC-11.2** | `app/help/layout.tsx` gates the tree to admin via `requireAdmin()`. Unauthenticated and crew requests → 403. |
| **AC-11.3** | Sidebar renders on every `/help/*` page; current page is visually highlighted; collapses to top-of-page disclosure under 768 px. |
| **AC-11.4** | Theme toggle is present in `<Header>` on every page and respects `prefers-color-scheme` on first paint. |
| **AC-11.5** | `MessageCatalogEntry` (declared in `lib/messages/catalog.ts:1-11` — line range moved from the original `:1-8` after the r8 three-field extension landed) is extended with three new fields: `title: string \| null`, `longExplanation: string \| null`, `helpHref: string \| null` (per §5.1, r8). `messageFor` signature unchanged; all existing callers continue to compile. |
| **AC-11.6** | Every §12.4 catalog entry where `severity !== "info"` AND `dougFacing != null` has `title`, `longExplanation`, AND `helpHref` all non-null (with `helpHref` matching `/^\/help\/.+/`). Conversely, every entry where `dougFacing == null` OR `severity === "info"` has all three M11 fields `null`. Meta-test (§7.1 test 2) enforces both directions as a biconditional. Exclusion bands: (a) info-tier (severity); (b) crew-only entries — phase-2 backfill; (c) master-spec admin-log-only entries — AC-11.35 aligns the catalog to have `dougFacing: null` for those, so they fall into the second arm naturally. |
| **AC-11.7** | The build-time anchor resolver passes — every `helpHref` resolves to a real `<RefAnchor>` on a real page. |
| **AC-11.8** | Parse-warning rows in the §9.2 panel render a `Learn more →` link when `helpHref` is present. |
| **AC-11.9** | Dashboard tooltips per §9.0.1 render a trailing `Learn more →` link when their mapped page exists. |
| **AC-11.10** | Dashboard footer renders `Take the tour →` linking to `/help/tour`. |
| **AC-11.11** | `/help/errors` iterates the catalog and renders one anchored section per entry matching the AC-11.6 predicate — `severity !== "info"` AND `dougFacing != null`. Each section's visible heading is `entry.title` (NOT the code — invariant #5). Body is `entry.longExplanation`. **Trailing call-to-action (r10 corrected per round-8 finding 5):** the trailing link is "If this keeps happening, tell Eric →". The original AC text named "the bug-report flow (per §4.3)" as the target; the Phase I Codex R1 review (2026-05-22) surfaced that master-spec §13.1 defines four SHOW-SCOPED bug-report surfaces and no non-show-scoped recurrence-report surface exists. **r11 amendment (Phase I Codex R1):** for v1, the trailing CTA is a `mailto:edweiss412@gmail.com` link with subject/body pre-populated for the recurrence-report use case. The non-show-scoped report surface is deferred per `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md` `M11-I-D-1` + speculative future surface tracked at `docs/superpowers/plans/BACKLOG.md` `BL-HELP-NON-SHOW-REPORT-SURFACE`. The `Learn more →` affordance lives on the SOURCE surfaces (admin pages where the error renders) per §5.6 matrix — `/help/errors` is the destination, not a hop. |
| **AC-11.12** | All 17 unit/integration tests in §7.1 (items 1–10 plus 12 + 13 + 14 + 15 + 16 + 17 + 18) pass; nav-consistency, anchor-resolver, screenshot-coverage, manifest-integrity, `<picture>`-contract, error-renderer-gate (4 contexts), deep-link-walker, fixture-range-parser, `lib/time/now.ts`-gate, server-time grep-guard, catalog-alignment meta-test, and end-to-end clock-pipeline proof are red on the conditions they guard. CI drift gate (§7.1 item 11) is wired and fails on uncommitted screenshot drift. |
| **AC-11.13** | `/impeccable critique` and `/impeccable audit` pass on every `app/help/*` page (per invariant #8). |
| **AC-11.14** | No `<ScreenshotPlaceholder>` references in `app/help/**/*.mdx` at v1 close-out (lint enforces, §7.1 test 7). Every documented surface ships with a real `<Screenshot name="...">`. |
| **AC-11.15** | Mobile Playwright test at 390 × 844 passes the dimensional + no-horizontal-scroll + 44 × 44 px-target assertions. |
| **AC-11.16** | No new boolean flags, no new env vars (r7 — r6's `SCREENSHOT_FROZEN_NOW` env was infeasible with the server-start env model, replaced by a request-scoped header), no new Supabase tables. The screenshot harness uses a request-scoped test-only header `X-Screenshot-Frozen-Now: <ISO>` plus the existing `Authorization: Bearer ${TEST_AUTH_SECRET}` for gating — both honored only when `ENABLE_TEST_AUTH === "true"`. AC-11.37 enforces production-build rejection. |
| **AC-11.17** | All milestone work is committed in conventional-commits format (`feat(help): …`, `test(help): …`, etc.) per invariant #6. |
| **AC-11.18** | `scripts/help-screenshots.manifest.ts` exists and is the single source of truth for every documented surface. Every `<Screenshot name>` reference resolves to a manifest entry. |
| **AC-11.19** | `scripts/help-screenshots.ts` (the capture script) runs end-to-end via `pnpm screenshot:help` against a clean checkout and produces every manifest entry's light + dark WebP output. Idempotent: a second run on unchanged UI produces byte-identical output. |
| **AC-11.20** | `<Screenshot>` MDX component renders `<picture>` with a `(prefers-color-scheme: dark)` `<source>` and a default light `<img>`. Reader's theme picks the variant automatically. |
| **AC-11.21** | Manifest-integrity meta-test (§7.1 test 9) passes: no stale entries, no orphan WebPs, every named fixture exists in `fixtures/shows/`. |
| **AC-11.22** | M11 work begins only after M10 closes (sequencing constraint, recorded in milestone-routing handoff). |
| **AC-11.23** | `/help/*` renders dynamically (not statically prerendered) — auth gate runs Supabase queries per request. Verified by the auth-gating test (#3) observing distinct responses for admin vs. unauthenticated vs. AdminInfraError-stubbed cases. |
| **AC-11.24** | `app/help/layout.tsx` catches `AdminInfraError` and renders the cataloged 500-class surface using the same fallback chain as `app/admin/layout.tsx:58-60`: `entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."` For the live `ADMIN_SESSION_LOOKUP_FAILED` entry (`lib/messages/catalog.ts:1366`, `dougFacing: null`; **r15 line-citation correction** — the catalog file grew during M9.5/M10/M11 and the entry's location drifted from the original `:148-154`), this resolves to the `crewFacing` string. Test #3 verifies the rendered text equals the fallback expression's actual output (not a hard-coded string). |
| **AC-11.25** | `<Screenshot>` `<picture>` contract test (§7.1 test 10) passes — output contains `<source media="(prefers-color-scheme: dark)" srcset="…-dark.webp">` and a default light `<img>` with the provided `alt`. |
| **AC-11.26** | CI drift gate is wired: a CI step runs `pnpm screenshot:help` against a clean checkout, then `git diff --exit-code public/help/screenshots/`. PR fails on non-zero exit. |
| **AC-11.27** | The `screenshots-help` Playwright project in `playwright.config.ts` (and `playwright.screenshots.config.ts`) declares: a dedicated `webServer` with `ENABLE_TEST_AUTH=true` + `TEST_AUTH_SECRET` env, a paired `screenshots-help-setup` PROJECT (Playwright setup-project pattern; NOT a `globalSetup` default export) at `tests/e2e/screenshots-help-setup.ts` that runs `pnpm db:seed`, deterministic browser settings (`timezoneId`, `locale`, `colorScheme`, `reducedMotion`, font-render-hinting=none, animations-off CSS injection), and reuses `signInAs` from `tests/e2e/helpers/signInAs.ts`. **r12 amendment (Phase I Codex R2):** the original wording named `globalSetup running pnpm db:seed`; the shipped implementation uses a setup-project instead — cleaner separation of concerns, real test-framework reporting on seed failures, sequences against the `webServer` being up via `dependencies:` entry. Structural test `tests/help/playwright-config.test.ts:135-145` pins the setup-project pattern + asserts no `globalSetup` default export exists. See §3.6.2 row 1 for the same amendment. |
| **AC-11.28** | The `messageFor` signature is unchanged. Existing call sites (e.g., `app/admin/layout.tsx:51`, `components/admin/AlertBanner.tsx`) continue to compile and behave identically. Only the return type widens. |
| **AC-11.29** | Error-renderer gate test (§7.1 test 12) passes across all FOUR contexts pinned by `tests/messages/_metaErrorRendererGate.test.ts:19` (the `contexts` array; the original wording named `:15` which is the `ErrorRendererHelpAffordance` type prop block): `admin` and `help-admin` emit `Learn more →` when `helpHref` is non-null; `crew` never emits; `preview-as-crew` (admin previewing a crew page at `/admin/show/<slug>/preview/<crew-id>`) is treated as crew and never emits regardless of catalog `helpHref` value. **r19 amendment (Phase I Codex R8):** original wording named only three contexts (admin / help-admin / crew); the R10 ratified four-context behavior including preview-as-crew was already pinned in the test but not echoed in the AC. |
| **AC-11.30** | Deep-link affordance walker test (§7.1 test 13) passes: every row in §5.6's matrix is wired (or explicitly absent where the matrix says so). |
| **AC-11.31** | `app/help/layout.tsx` exports `export const dynamic = "force-dynamic"` to make the dynamic-rendering posture explicit to Next.js. |
| **AC-11.32** | Screenshot harness pins a fixed clock per §3.6.2 row "Fixed clock": `frozenClockInstant` is required per manifest entry (no project-wide default). Browser side: `context.clock.install({ time: frozenClockInstant })`. Server side: capture script sends `X-Screenshot-Frozen-Now: <ISO>` header on every request via `page.setExtraHTTPHeaders`; consumed by `lib/time/now.ts` (or equivalent) reading the request header through Next's `headers()` API; gated to honor only when `ENABLE_TEST_AUTH === "true"` AND the request includes a valid `Authorization: Bearer ${TEST_AUTH_SECRET}`. Plus fixture seed timestamps anchored relative to `frozenClockInstant` so seeded data stays consistent with the pinned now. |
| **AC-11.34** | Frozen-instant fixture validation passes: for every manifest entry, `frozenClockInstant` falls within the named fixture's operational date range as parsed by `scripts/help-screenshots-fixture-range.ts`. The parser reads the actual fixture corpus layout — flat `fixtures/shows/raw/<fixture>.md` files (single-file, multi-tab) and the pdf-only split form `fixtures/shows/pdf-only/<fixture>__INFO.md`. Capture fails fast if a clock is outside its fixture's window. Parser is unit-tested against every file in `fixtures/shows/raw/*.md` AND every file in `fixtures/shows/pdf-only/*__INFO.md`. |
| **AC-11.35** | M11 catalog-alignment subtask (r8 — reformulated from r5–r7 flag concept; sourcing tightened r9). `lib/messages/catalog.ts` is reconciled with master-spec §12.4 admin-log-only contract. **Derivation source (r9):** the admin-log-only set is derived **mechanically from the master-spec §12.4 markdown** — every table row whose `Doug-facing message` cell renders as `(admin log only ...)` / `—` per master-spec line 2701 normalization rule. The set is NOT the prose-named line-2701 examples list, which is explicitly non-exhaustive ("Examples (non-exhaustive)"). A new parser `scripts/extract-admin-log-only-codes.ts` reads `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4, scans every table row, classifies admin-log-only rows by the line-2701 normalization rule, and emits the canonical set. **Known misses in r8's manual enumeration (round-7 finding 1):** `DIAGRAMS_EMBEDDED_CAP_EXCEEDED` (master-spec line 2809 — drifted from original wording `:2795`). The original wording also named `PENDING_SNAPSHOT_ROLLBACK_STUCK` (`:2821` → `:2838`) and `PENDING_SNAPSHOT_PROMOTE_STUCK` (`:2822` → `:2837`) as known misses; the master spec has since been amended to give both PENDING_SNAPSHOT_* rows Doug-facing copy ("A diagram snapshot rollback stalled..." / "A diagram snapshot promotion has been stuck..."), so the r9 derivation rule correctly does NOT classify them as admin-log-only and they are no longer "known misses" — the live `scripts/extract-admin-log-only-codes.ts` output excludes them, per Phase I Codex R7 verification. The r9 derivation rule catches `DIAGRAMS_EMBEDDED_CAP_EXCEEDED` and any future additions automatically. For every code in the derived set, the catalog-alignment subtask sets `dougFacing: null`, `crewFacing: null`, AND `helpfulContext: null` (per master-spec line 2701 normalization). M11 also sets the new M11 fields (`title`, `longExplanation`, `helpHref`) to `null` for these. New meta-test (§7.1 test 17) asserts the live catalog matches the derived set: every master-spec-admin-log-only row has all user-facing fields (`dougFacing` / `crewFacing` / `helpfulContext` / `title` / `longExplanation` / `helpHref`) set to `null`. |
| **AC-11.36** | Every row in §5.6's affordance matrix that has a concrete `data-testid` cell has that testid match `^help-affordance--[a-z0-9-]+--(tooltip|tour|learn-more)$`. Rows that emit a family of testids (e.g., per-error-code `Learn more`) are excluded from the regex and walked by family rule in test #13. The crew-negative row is not a matrix-walker row; it is a separate negative assertion in test #13. |
| **AC-11.37** | `lib/time/now.ts` (or equivalent) returns the frozen instant ONLY when (i) the current request carries an `X-Screenshot-Frozen-Now` header with a valid ISO timestamp, (ii) `process.env.ENABLE_TEST_AUTH === "true"`, AND (iii) the request includes a valid `Authorization: Bearer ${TEST_AUTH_SECRET}`. Production-mode unit test asserts: with `ENABLE_TEST_AUTH` unset, sending the header has no effect on the utility's output. Capture-boundary unit test (NOT a full screenshot run): two consecutive calls to the time utility 60+ seconds apart with the same frozen header return byte-identical ISO strings, proving wall-clock minute crossings don't leak. (The full E2E boundary check is too expensive for CI; the unit test on the utility is sufficient.) |
| **AC-11.38** | Server-side render-time call sites reachable from the screenshot manifest are migrated to `lib/time/now.ts` per §3.6.2 row "Server-side `Date.now()` / `new Date()` migration inventory". **r14 amendment (Phase I Codex R3 / orchestrator sweep, completed in R4):** the original wording named `app/show/[slug]/page.tsx:646` as the named render-side site; the migration is complete and the file no longer contains any `new Date()` / `Date.now()` matches. Historical mutation-path sites no longer exist: `app/show/[slug]/p/actions.ts`; no longer exists: `app/admin/show/[slug]/actions.ts:69` (M9.5 signed-link audit-log path; r17 inventory addition per Phase I Codex R6). Current mutation-path sites in `app/admin/actions.ts` and `app/admin/dev/actions.ts` carry inline `// not-render-side: <reason>` waivers. Grep guard (test #16) is the live structural enforcement going forward; no per-AC line citation is maintained. |
| **AC-11.39** | One representative end-to-end screenshot capture proves the request-scoped header pipeline actually changes a rendered page (not just the utility in isolation). The manifest entry for `/admin/show/<slug>/preview/<crew-id>` (impersonation surface) captures the crew page with a `frozenClockInstant` that would render "today" as a fixture-relative date. Test asserts the captured WebP differs byte-wise when captured with a different `frozenClockInstant` — proving the header reaches the server component's render. |
| **AC-11.33** | Screenshot harness suppresses Supabase Realtime push during capture (per §3.6.2) via a no-op `WebSocket` init script (`scripts/help-screenshots.ts:71`). **r13 amendment (Phase I Codex R3):** the original wording named "stable cookies persist across captures via `globalSetup` `storageState` reuse" — the shipped harness uses a paired setup-project (per r12 amendment on AC-11.27) plus per-capture sign-in instead. `tests/e2e/screenshots-help-setup.ts` only seeds the DB; `scripts/help-screenshots.ts:162` calls `signInAs(page, adminFixture)` inside each capture and creates a fresh browser context per entry/theme (`scripts/help-screenshots.ts:194`). The "stable cookies across captures" property is provided not by `storageState` reuse but by the deterministic `signInAs(adminFixture)` reusing the same fixture identity on every capture, plus `ENABLE_TEST_AUTH=true` bypassing CSRF nonce churn for the test session. The Realtime-suppression half of this AC continues to apply to the WebSocket init-script path. See §3.6.2 row "CSRF / session-cookie volatility" for the same amendment. |

---

## 14. Appendix — relationship to phase 2

Phase 2 (`/help/crew/*`) is intentionally not designed here. When it lands:

1. Route-group split: `app/help/(admin)/layout.tsx` keeps `requireAdmin`; `app/help/(public)/layout.tsx` is unguarded.
2. Sidebar `_nav.ts` grows a `visibility: 'admin' | 'public' | 'both'` field per entry; the rendered sidebar filters by viewer role.
3. The crew-facing pages reuse all existing MDX components — no component rework.
4. The auth-gating test (§7.1 test 3) splits into admin-tree and public-tree variants.
5. URLs already established in M11 do not change.

No phase-2 work is in M11 scope.

---

*End of spec.*

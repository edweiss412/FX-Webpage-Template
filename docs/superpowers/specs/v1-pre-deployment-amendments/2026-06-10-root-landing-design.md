# Root `/` landing — design

**Date:** 2026-06-10
**Status:** Draft (pending self-review + cross-model adversarial review)
**Branch:** `spec/root-landing` (git worktree at `../FX-Webpage-Template-root-landing`; main checkout stays free for parallel feature work)
**Origin:** M12.3 follow-up — "Root `/` is a bare scaffold stub (`app/page.tsx` = just `<h1>FXAV Crew Pages</h1>`) — offered a real landing/redirect; pending owner." Owner picked it up 2026-06-10.
**Routing:** UI milestone → **Opus implements** (impeccable v3 dual-gate, external attestation), **Codex reviews**. No DB changes, no migrations, no new API routes.

---

## 1. Summary

Replace the root stub with a real front door. Signed-in visitors never see it — the page server-redirects them into the existing sign-in resolution, which already routes admin → `/admin` and non-admin → `/me`. Anonymous visitors get one calm branded card (option C of the explored variants, trimmed per owner): FXAV mark, "Sign in with Google" CTA, divider, one line of lost-link guidance for crew.

## 2. Resolved decisions (owner Q&A, 2026-06-10)

Ratified; do not relitigate.

| # | Decision |
|---|----------|
| D-1 | `/` = **branded landing + sign-in CTA** for anonymous visitors; **server redirect** for signed-in visitors. Not a pure redirect; not a session-inspecting smart router beyond what sign-in already does. |
| D-2 | Post-sign-in routing reuses the EXISTING `/auth/sign-in?next=/admin` resolution — confirmed admin keeps `/admin`, confirmed non-admin falls back to `/me` (`app/auth/sign-in/page.tsx:117-134` semantics). The landing adds ZERO new auth logic. |
| D-3 | Visual = **option C ("card on warm surface"), with the description line above the button removed**. Card contents exactly: mark row, Google CTA, divider, crew lost-link line. |
| D-4 | CTA is a plain `<Link>` to `/auth/sign-in?next=/admin` — no client JS on the page. Trade-off acknowledged: a signed-OUT visitor clicks "Sign in with Google" and lands on the sign-in page's own "Sign in with Google" button (two doors). Accepted: it keeps OAuth initiation, PKCE cookies, and the cataloged error block on the single existing surface (`app/auth/sign-in/page.tsx` + `SignInButton.tsx`). The rejected alternative (embedding `SignInButton` on `/` for one-click OAuth) would create a second OAuth entry surface whose failure modes render on a different page than the user initiated from. |

## 3. Current state (verified citations, 2026-06-10 @ `main` `3284a4cc`)

- `app/page.tsx` — the stub: `<main className="p-8"><h1 className="text-3xl font-bold">FXAV Crew Pages</h1></main>` (whole file, 7 lines).
- Sign-in already-authenticated guard: `app/auth/sign-in/page.tsx:74-116` — `createSupabaseServerClient()` + `supabase.auth.getUser()` BOTH wrapped in try/catch (R19 F4); throw ⇒ `ADMIN_SESSION_LOOKUP_FAILED` block; returned-error ⇒ fall through to CTA; valid user ⇒ redirect via the `next` resolution.
- Admin/crew split: `app/auth/sign-in/page.tsx:117-134` — `isAdminPath` (`:60-62`, regex `/^\/admin(?:\/|$)/`) gates an adminship check; confirmed admin keeps the `/admin` path; confirmed non-admin ⇒ `redirectPath = "/me"`.
- `validateNextParam` lives with the sign-in surface (consumed at `app/auth/sign-in/page.tsx:71`); `/admin` is a valid `next` (the regex above admits it).
- Sign-in page chrome to mirror: wordmark `img src="/brand/fxav-wordmark.png"` … `className="mx-auto mb-6 h-auto w-24 select-none"` (`app/auth/sign-in/page.tsx:181-188`), headline `text-3xl font-bold text-text-strong` (`:190-195`), OAuth initiation via `<SignInButton validatedNext={...} />` (`:202`, component `app/auth/sign-in/SignInButton.tsx`).
- `/me` = cross-show crew landing: identity gate + `listShowsForCrew` + empty state (`app/me/page.tsx` header block).
- Auth-chain audit walks `app/api`, `app/admin`, `app/show`, `app/me` only (`lib/audit/protectedRoutes.ts:43`) — root `app/page.tsx` is outside the walk; no `PROTECTED_ROUTES` row exists or is needed (public page).
- Tokens available: `--spacing-tap-min: 44px` (`app/globals.css:141`), card vocabulary `rounded-md border border-border bg-surface …` used across admin/sign-in surfaces; warm page background + `bg-surface-sunken`/`bg-surface` pairs in `app/globals.css` `@theme`.
- Root layout `app/layout.tsx` provides the html/body shell + theme; the landing renders inside it like every other public page.

## 4. Design

### 4.1 `app/page.tsx` (full replacement, server component)

1. **Session probe (redirect-only concern):** construct `createSupabaseServerClient()` and call `auth.getUser()` with BOTH wrapped in try/catch — the `app/auth/sign-in/page.tsx:74-116` pattern, but with the OPPOSITE degraded posture: any throw OR returned error OR no user ⇒ **fall through and render the landing** (the page is public; rendering it can never be wrong). A validated user ⇒ `redirect("/auth/sign-in?next=/admin")` — the sign-in page's session-present branch immediately resolves admin → `/admin`, non-admin → `/me` (D-2; one extra 302 for this rare path, zero duplicated logic).
2. **Invariant 9:** the probe is a Supabase call boundary — destructure `{ data, error }`; the deliberate render-on-fault posture gets an inline `// not-subject-to-meta: public landing fails open to its own anonymous render; no degraded state exists` comment OR a registry row, decided at plan time per the meta-test inventory rule (the helper is page-local, not a shared `lib/` helper, so the inline comment is the expected outcome).
3. `redirect()` must be called OUTSIDE the try/catch (Next's redirect throws `NEXT_REDIRECT` control flow; catching it would break the redirect — read the user-presence result into a local first, exactly as sign-in does).

### 4.2 The card (D-3)

Page: full-viewport centered flex (`min-h-dvh items-center justify-center`), page background `bg-surface-sunken` (the warm neutral), padding `p-page-pad-mobile sm:p-page-pad-desktop`.

Card (`data-testid="root-landing-card"`): `w-full max-w-sm rounded-md border border-border bg-surface p-tile-pad flex flex-col gap-3` —

1. **Mark row:** FXAV wordmark image (same asset + sizing class as sign-in, `/brand/fxav-wordmark.png`, `w-24`) is NOT reused here — at card scale the icon mark reads better: `<img src="/brand/fxav-icon.png" … className="size-7">` + `FXAV` (`text-lg font-semibold tracking-tight text-text-strong`) + `Crew Pages` accented (`text-accent-on-bg font-semibold`) — mirroring the admin nav brand row vocabulary (`components/admin/nav/AdminNav.tsx:44-61`). Plain `<img>`/`Image` per surrounding convention; alt `"FXAV"` on the icon is decorative-adjacent — use `alt="" aria-hidden` with the text carrying the name, exactly like AdminNav (`:49-56`).
2. **CTA:** `<Link href="/auth/sign-in?next=/admin" data-testid="root-landing-signin">` styled as the primary dark button (`inline-flex min-h-tap-min items-center justify-center gap-2 rounded-md bg-text-strong px-4 font-semibold text-surface …` — exact classes resolved at plan time against the sign-in button's shipped styles so the two doors look identical), label **"Sign in with Google"**, `self-start`.
3. **Divider + crew line:** `border-t border-border pt-3` … `<p className="text-sm text-text-subtle">On a crew? The link Doug sent goes straight to your show.</p>`.

No headline `<h1>` inside the card beyond the mark row — but the PAGE must still have an `h1` for a11y/landmarks: the mark row's text renders inside an `<h1 className="…">` (visually identical to the mark-row spec above; `text-lg` h1 is fine — size is presentation, the landmark is structure).

### 4.3 Guard conditions / mode boundaries

| Input/state | Behavior |
|---|---|
| No session / `getUser` returned error | render landing |
| `getUser` or client construction THROWS | render landing (fail-open, §4.1.2 posture) |
| Valid session | `redirect("/auth/sign-in?next=/admin")` (never renders) |
| Any viewport | same single card, centered; no mode boundaries, no responsive variants beyond padding |
| Dark mode | token pairs handle it (no raw colors); verify with the theme toggle in e2e spot-check |

### 4.4 Transition inventory

Static server-rendered page; zero client state, zero conditional client renders, no AnimatePresence. The only "transition" is route-level and outside scope (root is not under the admin `PageTransition` wrapper). **All states: instant — no animation needed.** No compound transitions possible.

### 4.5 Dimensional invariants

One fixed-relationship set: CTA `min-h-tap-min` (≥44px) at 390/720/1280; card horizontally centered (`|card.center.x − viewport.center.x| ≤ 1px`) and `max-w-sm` respected; no horizontal overflow at 390px. Real-browser asserted (Playwright), not jsdom.

### 4.6 Copy (verbatim; DESIGN.md §9 register, no em-dashes)

- CTA: `Sign in with Google`
- Crew line: `On a crew? The link Doug sent goes straight to your show.`
- Page `<title>` stays the root default from `app/layout.tsx` metadata (no change).

## 5. Error handling

No user-visible failure states exist (§4.3). No catalog rows touched; no §12.4 lockstep. Invariant 5 trivially satisfied (no codes anywhere).

## 6. DB / migration matrices

**N/A — declared explicitly:** no tables, columns, CHECKs, enums, RPCs, triggers, migrations, validation-project applies, or schema-manifest regen. `validation-schema-parity` unaffected.

## 7. Watchpoints / do-not-relitigate

1. **Two-door CTA is ratified** (D-4, with the rejected one-click alternative documented). Do not propose embedding `SignInButton` on `/`.
2. **Signed-in `/` visitors take two hops** (`/` → `/auth/sign-in?next=/admin` → destination). Ratified D-2: zero duplicated auth logic beats one saved 302 on a rare path.
3. **Fail-open render posture** (§4.1) is deliberate and safe — the page is public; there is nothing to fail closed TO.
4. **No `PROTECTED_ROUTES` row** — root is public and outside the audit walk (`lib/audit/protectedRoutes.ts:43`). Adding one would make the audit fail (path not in walked trees ⇒ "listed but not live" class).
5. **No screenshot-manifest entry** — root is not a help-documented surface (YAGNI; can be added if a help page ever references it).
6. Card visual language intentionally mirrors AdminNav brand row + sign-in button — consistency findings should point THERE, not invent a third vocabulary.

## 8. Out of scope

Marketing content, SEO beyond existing metadata, per-session deep links beyond sign-in's resolution, crew "find my show" search, screenshot baseline, changes to `/auth/sign-in` or `/me`.

## 9. Testing

1. **Unit (jsdom)** — anonymous (mocked `getUser` → no user): card renders with exact CTA href `/auth/sign-in?next=/admin`, crew line verbatim, h1 present; *catches: wrong next param silently breaking the admin/crew split*. Mocked valid user: `redirect` called with exactly that path and the card NOT rendered; *catches: landing flashing for signed-in users*. Mocked construction/getUser THROW: renders card, no unhandled rejection; *catches: fail-open regression (R19 F4 class)*. Anti-tautology: href asserted via the link element's attribute, scoped to `root-landing-card`.
2. **E2E (Playwright, prod build)** — signed-in admin fixture hits `/` → final URL `/admin`; signed-in non-admin crew fixture → final URL `/me`; anonymous → card visible, CTA tap lands on `/auth/sign-in?next=%2Fadmin` (or unencoded — assert the sign-in page rendered with its headline). *Catches: the full redirect chain breaking at either hop.*
3. **Layout dimensions (real browser, §4.5 invariants verbatim)** — CTA ≥44px, card centered ±1px, no horizontal overflow, at 390/720/1280.
4. Meta-test inventory (declared): NONE extended — the page-local probe carries the inline `not-subject-to-meta` comment (§4.1.2); no registries apply (no DB writes, no alerts, no locks, no protected route). If plan-time review concludes the probe should be a shared helper instead, it gets a `_metaInfraContract` row like every `lib/admin` helper.

## 10. Implementation shape

Single small milestone on `spec/root-landing` (worktree): 1 page file + tests + e2e; impeccable v3 dual-gate (external) before close-out; Codex adversarial review (spec now, whole-milestone at end); real CI; merge. Standing directive: autonomous through merge.

# Root `/` collapse to sign-in — design (supersedes the root-landing card)

**Date:** 2026-06-11
**Status:** Draft (pending adversarial review)
**Branch:** `spec/root-collapse` (worktree `../FX-Webpage-Template-root-collapse`; main checkout free for parallel work)
**Supersedes:** the landing-card portion of `2026-06-10-root-landing-design.md` (PR #21, merged `16199d7a`). **Owner ratification 2026-06-11:** after seeing both pages live on the validation deploy, the owner relitigated D-1/D-4 — the landing card and the sign-in page are ~80% the same surface; the sign-in page is the real front door. Decision: **option 2 — collapse.** The §4.1.5 sign-in returned-error hardening from that milestone is UNAFFECTED and stays.

---

## 1. Summary

`/` becomes an unconditional server redirect to `/auth/sign-in?next=/admin`. The sign-in page absorbs the one piece of unique landing content (the crew lost-link line). The now-unused `rootSessionProbe` and the landing card (+ their tests and registry rows) are removed. Net: one brand surface, no double-door, identical routing outcomes.

## 2. Resolved decisions (owner, 2026-06-11 — ratified, do not relitigate)

| # | Decision |
|---|----------|
| C-1 | `/` = unconditional `redirect("/auth/sign-in?next=/admin")`. No probe, no card, no conditional logic — the sign-in page's existing session guard already resolves signed-in visitors (admin → `/admin`, non-admin → `/me`) and its CTA serves anonymous ones. |
| C-2 | The crew lost-link line moves to the sign-in page: a second paragraph under the existing subtitle, same `text-text-subtle` register: `On a crew? The link Doug sent goes straight to your show.` Rendered on the sign-in page universally (the line is true for every `next`). |
| C-3 | `lib/auth/rootSessionProbe.ts` is DELETED along with its unit tests and ALL its registry rows in `tests/auth/_metaInfraContract.test.ts` (constructor-list entry, R41 source-regex row, behavioral block) — orphan rows for a deleted helper would fail the registry's own helper-exists greps. The §4.1.5 sign-in branch + its tests stay (independent hardening, shipped). |
| C-4 | The superseded spec/plan/handoff docs from the landing milestone stay in git history untouched; this spec records the supersession. No doc rewrites. |

## 3. Current state (verified, 2026-06-11 @ `main` `16199d7a`)

- `app/page.tsx` — the landing card + probe consumption (shipped yesterday, PR #21); DELETED by this milestone.
- `next.config.ts` exists (no `redirects()` today — grep verified); gains the entry in §4.1.
- `lib/auth/rootSessionProbe.ts` — used ONLY by `app/page.tsx` (verify with `rg -l rootSessionProbe` before deleting; if any other consumer appeared, stop and reassess).
- Sign-in page: session guard + admin/crew `next` resolution (`app/auth/sign-in/page.tsx:74-140` region incl. the §4.1.5 branch); header block with subtitle "Use the Google account on your show's crew sheet to continue." (`:203-205` region); `SignInButton`; OR divider + View show list; error block; help line.
- Tests touching the removed surfaces: `tests/auth/rootSessionProbe.test.ts` (delete), `tests/app/rootLanding.test.tsx` (rewrite), `tests/e2e/root-landing.spec.ts` (rewrite), `tests/auth/_metaInfraContract.test.ts` (remove the three probe registrations), `playwright.config.ts` testMatch (keep — the e2e file persists under the same name).
- No copy pins on the subtitle exist in `tests/e2e/sign-in-page.spec.ts` / `tests/auth/signInPageRedirect.test.ts` / `tests/components/SignInBrand.test.tsx` (grepped).

## 4. Design

1. **Route-level redirect (R1 amendment — first-hop HTTP 3xx, not a page):** `redirect()` inside a Server Component page emits a META-TAG redirect in a 200 HTML response (Next 16.2.4, `node_modules/next/dist/esm/client/components/redirect.js` comments) — wrong mechanism for an unconditional route alias. Instead:
   - **DELETE `app/page.tsx` entirely** (no root page surface exists).
   - Add to `next.config.ts`:

```ts
async redirects() {
  return [
    {
      source: "/",
      destination: "/auth/sign-in?next=/admin",
      permanent: false, // 307 — keep reversible while the front-door shape is young
    },
  ];
},
```

   Config redirects run before the filesystem, emit a true first-hop 307 with a `Location` header, and behave identically for crawlers, no-JS clients, and monitors.
2. **Sign-in page:** add under the existing subtitle paragraph, inside the same `<header>`: `<p className="mt-2 text-base text-text-subtle">On a crew? The link Doug sent goes straight to your show.</p>` (exact placement/classes verified against the live header block at implementation time; copy verbatim from C-2; no em-dash).
3. **Deletions per C-3.** Registry hygiene: after removal, `pnpm vitest run tests/auth/_metaInfraContract.test.ts` green with zero references to the probe.
4. **Guard conditions / transitions:** none — `/` has no states; the sign-in page's states are unchanged except one added static paragraph. **Dimensional invariants:** none new (no fixed-dimension parents touched).

## 5. Error handling / DB

`/` can no longer fail (no I/O). Sign-in's error surfaces unchanged. No DB/migrations (N/A declared). No catalog changes.

## 6. Watchpoints (do not relitigate)

1. C-1..C-4 are owner-ratified 2026-06-11, explicitly overturning the landing-card D-1/D-4 with live-deploy evidence. Do not argue for keeping the card or for a conditional `/`.
2. Deleting registry rows for a deleted helper is REQUIRED, not optional (the registry asserts helper existence).
3. The §4.1.5 sign-in hardening and its tests are out of scope and must NOT be touched.
4. The unauthed "View show list" loop noted by the owner stays as-is (separate question, not in scope).

## 7. Testing

1. **Unit:** `tests/app/rootLanding.test.tsx` → DELETED (no page to test). New structural pin `tests/config/rootRedirect.test.ts`: imports `next.config.ts`, awaits `redirects()`, asserts an entry with `source: "/"`, `destination: "/auth/sign-in?next=/admin"`, `permanent: false`. *Catches: the redirect entry being dropped or retargeted.* Sign-in header test (extend whichever unit file covers the header, or `SignInBrand.test.tsx`): the crew line renders verbatim. *Catches: the absorbed content silently dropped.*
2. **E2E:** `tests/e2e/root-landing.spec.ts` → rewritten: (a) **first-hop contract (R1):** `page.request.get("/", { maxRedirects: 0 })` → status 307 AND `Location` header `/auth/sign-in?next=/admin` — a 200-with-meta-tag response FAILS this; (b) anonymous `/` (browser) → final pathname `/auth/sign-in` with `next=/admin`, `sign-in-headline` AND the crew line visible; (c) signed-in admin `/` → final pathname `/admin` (pathname-exact); (d) signed-in `NON_ADMIN_CREW_FIXTURE` `/` → `/me`. *Catches: either hop breaking; the redirect silently degrading to a rendered page.*
3. Full suite + typecheck + prettier; impeccable dual-gate (external) on the sign-in copy addition (UI mutation, invariant 8) with handoff §12 appended to the landing handoff doc (new §14 "Collapse amendment"); whole-milestone adversarial review; real CI; merge.

## 8. Meta-test inventory

REMOVES the three probe registrations from `tests/auth/_metaInfraContract.test.ts` (C-3). Nothing added — `app/page.tsx` no longer touches Supabase. No PROTECTED_ROUTES change (root stays public/outside the walk; sign-in unchanged).

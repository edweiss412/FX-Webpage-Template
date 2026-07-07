# Flow 5 — Rotate re-pick disclosure + mailto re-send affordance

**Date:** 2026-07-07
**Source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §"Flow 5 — Publish + share crew links (B → A−)", items 5.1 + 5.2.
**Scope:** admin-only UI on `app/admin/show/[slug]/` — copy changes, one read-select widened, one new pure helper, two anchors. No DB writes, no migrations, no advisory locks, no new §12.4 codes, no new mutation surfaces.

All `file:line` citations verified against worktree HEAD `13df05f33` (origin/main, PR #361 merged).

---

## 1. Problem

1. **Under-disclosed rotate consequence (audit 5.1).** The rotate confirm warns only that the URL breaks: "The existing show URL will stop working. Crew need the new URL to reach the page." (`app/admin/show/[slug]/RotateShareTokenButton.tsx:296-298`). The RPC also bumps `shows.picker_epoch` atomically, invalidating every crew member's picker cookie — documented only in the component's own header comment (`RotateShareTokenButton.tsx:7-10`), never shown to Doug. He learns crew must re-pick their names only when they complain.
2. **No re-send path (audit 5.2).** After rotate, the success banner shows the new URL with a Copy button (`RotateShareTokenButton.tsx:209-248`) and says "Send the URL below to crew" — but re-distribution is a manual hunt (copy, open mail/SMS app, find addresses). The roster already carries canonicalized crew emails (`lib/parser/blocks/crew.ts:412` — `email: emailUnreadable ? null : canonicalEmail`), unused for this. The persistent `CurrentShareLinkPanel` has the same gap for initial distribution.

## 2. Design (user-approved 2026-07-07)

### 2.1 Copy changes (item 5.1)

**Confirm warning** — the paragraph at `RotateShareTokenButton.tsx:295-299` (id `admin-rotate-share-token-warning`, the `aria-describedby` target of the Confirm button at `:307`) becomes exactly:

> The existing show URL will stop working. Every crew member will need the new URL and will have to re-pick their name.

**Success banner lead line** — `RotateShareTokenButton.tsx:220` becomes exactly:

> New share-link ready. Send the URL below to crew; the old link no longer works and everyone will re-pick their name.

Element structure, ids, testids, and roles are unchanged. Text-only edits.

### 2.2 Mailto helper (item 5.2)

New client-safe pure module `app/admin/show/[slug]/crewLinkMailto.ts` (sibling of `resolveOrigin.ts`, which is the established pattern for shared client-safe helpers in this route — `resolveOrigin.ts:9`):

```ts
export const MAX_MAILTO_HREF_CHARS = 1900;
export const MAILTO_TITLE_MAX_CHARS = 80;

export type CrewLinkMailto = { href: string; batch: number; batchCount: number };

export function buildCrewLinkMailtos(opts: {
  emails: readonly string[];
  url: string;
  showTitle: string;
}): CrewLinkMailto[];
```

Behavior (each clause is a unit-test case):

- **Empty → `[]`.** After filtering, zero recipients returns an empty array (callers hide the affordance).
- **Filter + dedupe (email-shape validator; adversarial R5).** Canonicalization at the parse boundary only lowercases/trims and nulls no-`@` values (`lib/parser/blocks/crew.ts:317-318,412`), so a bad sheet cell can persist spaces, commas, CR/LF, `?`, `&`, or other mailto-significant characters into `crew_members.email`. The helper therefore admits ONLY addresses matching the conservative shape `/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/` AND ≤ 254 characters (RFC 5321 path ceiling; also guarantees any single recipient fits a batch — see chunking). This structurally rejects whitespace, control characters (CR/LF header-injection shapes), commas, `?`, `&`, quotes, and angle brackets. `%` is legal in the local part and is neutralized by `encodeURIComponent` (`%` → `%25`), so no encoded-CRLF smuggling survives a single client-side decode. Dedupe exact duplicates preserving first-seen order. Invariant 3 untouched: this is a read-side guard on already-canonicalized data, not a second canonicalization.
- **BCC, not To.** Recipients go in `bcc` so addresses are not cross-exposed by default. The `to` part of the mailto is empty: `mailto:?bcc=…`.
- **Encoding.** Each address is `encodeURIComponent`-encoded individually, joined with literal `,` (the RFC 6068 address separator; `,` is legal unencoded in the query part). `subject` and `body` values are `encodeURIComponent`-encoded.
- **Chunking (deterministic length guard; adversarial R1).** Recipients are greedily packed, in order, into the fewest batches such that each batch's complete href (`mailto:?bcc=<batch>&subject=…&body=…`) is ≤ `MAX_MAILTO_HREF_CHARS` (1900 — under the 2083-character legacy Windows/IE URL floor, the most restrictive mainstream mailto handler; modern clients allow far more). A 254-char address encodes to ≤ 762 chars and subject+body for any realistic title/URL stay well under the remainder, so every filtered recipient lands in some batch — **no recipient is ever silently dropped**. Each result carries `batch` (1-based) and `batchCount` so callers can label multi-batch anchors. The common case (roster ≤ ~50 typical-length addresses) yields exactly one batch.
- **Title budget (adversarial R4 — the cap is unconditional).** `shows.title` is unbounded text, so the helper never trusts its length: the effective title is `showTitle.trim()` truncated to `MAILTO_TITLE_MAX_CHARS` (80) **code points** (surrogate-pair-safe — a code-unit slice could mint a lone surrogate and make `encodeURIComponent` throw) with a trailing `…` when cut; unpaired surrogates already present in sheet-derived input are replaced with U+FFFD before encoding. If a single-recipient href using the truncated title would still exceed `MAX_MAILTO_HREF_CHARS`, the helper rebuilds with a blank title (fallback subject/body below). If even the blank-title single-recipient href exceeds the cap (a pathologically long `url` — not producible by `origin/show/<slug>/<token>`, but the contract must not depend on that), the helper returns `[]` and the affordance is hidden (the Copy button always remains). Net contract: **every emitted href is ≤ `MAX_MAILTO_HREF_CHARS`, no exceptions, and no recipient is ever silently dropped — either all filtered recipients are batched under the cap or nothing renders.**
- **Subject.** `Crew link: ${effectiveTitle}` when the effective title is non-blank; plain `Crew link` otherwise.
- **Body.** Exactly (before encoding):

  ```
  Here's the link to your crew page{ for ${showTitle}}:

  ${url}

  Open it and pick your name to see your schedule.
  ```

  where the ` for ${effectiveTitle}` fragment is included only when the effective title is non-blank (same truncated value as the subject).

### 2.3 Anchor in the rotate success banner

Inside the existing success banner (`RotateShareTokenButton.tsx:209-248`), the URL/Copy row gains sibling anchor(s) rendered **only when** `newUrl !== null` **and** `buildCrewLinkMailtos(...)` is non-empty:

- Element (one per batch): `<a href={m.href} data-testid="admin-rotate-share-token-email-button">…</a>` — plain anchor, no `target`, no `rel` (mailto scheme). Visible text **Email crew** when `batchCount === 1`; **Email crew (N of M)** per batch otherwise. Multi-batch anchors wrap in the same action row (`flex flex-wrap gap-2`).
- Placement: a second action row directly below the URL/Copy row, inside the same banner container, full-width start-aligned.
- Style: secondary bordered button-anchor using existing tokens, matching the compact idle button's recipe (`RotateShareTokenButton.tsx:194`): `inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`. A `Mail` icon from `lucide-react` (`size={14}`, `aria-hidden`) precedes the text, matching the icon convention at `RotateShareTokenButton.tsx:199-202`.
- The Copy button remains the primary (accent) action; the mailto anchor is deliberately secondary.
- **Multi-batch instruction (impeccable critique P1).** When more than one batch renders, a `text-xs text-text-subtle` paragraph precedes the anchors: "Your crew list needs {M} separate emails. Send each one; addresses go in Bcc." (testids `admin-rotate-share-token-email-note` / `admin-current-share-link-email-note`). Absent for a single batch. Mailto copy carries no em dashes (DESIGN.md copy ban): the subject separator is a colon.

The `rotatedInactive` state (`RotateShareTokenButton.tsx:249-262`) is unchanged — no URL exists, so no anchor.

### 2.4 Anchor in CurrentShareLinkPanel

In `app/admin/show/[slug]/CurrentShareLinkPanel.tsx`, when a token exists (the branch building `url` at `:93`), a new row below the URL/Copy row (`:104-112`) renders the same style of anchor(s) with `data-testid="admin-current-share-link-email-button"`, hrefs from `buildCrewLinkMailtos({ emails, url, showTitle })`. Visible text **Email this link to crew** for a single batch; **Email this link to crew (N of M)** per batch otherwise. Hidden when the helper returns `[]`. The token-unavailable branch (`:73-91`) never renders it. This is a Server Component; the anchors are static markup (no client boundary needed).

### 2.5 Prop threading

- **`RotateShareTokenButton`** gains optional props `crewEmails?: readonly string[]` (default `[]`) and `showTitle?: string` (default `""`).
- **`CurrentShareLinkPanel`** gains the same two optional props with the same defaults.
- **`app/admin/show/[slug]/page.tsx`:**
  - `CrewMemberRow` (`page.tsx:96-100`) gains `email: string | null`.
  - `readCrew` (`page.tsx:244`) currently declares its return as `PerShowCrewRow[]` (`components/admin/PerShowCrewSection.tsx:20-24` — `id`/`name`/`role` only), which would erase the new field at the type level. Change its return type to `{ crew: CrewMemberRow[]; crewLookupFailed: boolean }`; `CrewMemberRow` is a structural superset of `PerShowCrewRow`, so the existing consumers (`PerShowCrewSection` crew prop, `PickerResetControl` at `page.tsx:805`) accept it unchanged. `PerShowCrewRow` itself is NOT widened — components that don't need email keep the narrower type.
  - `readCrew`'s select (`page.tsx:248`) widens from `"id, name, role"` to `"id, name, role, email"`, and (adversarial R6) gains an explicit bound: `.limit(CREW_ROSTER_READ_CAP + 1)` with `export const CREW_ROSTER_READ_CAP = 500` defined in `crewLinkMailto.ts` (the distribution-affordance module owns the completeness bound). When the read returns more than `CREW_ROSTER_READ_CAP` rows, the roster MAY be incomplete at the PostgREST row cap, so the page **fails closed everywhere, visibly** (adversarial R7 — no silently partial display either): `readCrew` returns `{ crew: [], crewLookupFailed: true }`, reusing the EXISTING visible degraded state (`components/admin/PerShowCrewSection.tsx:34-47` renders the `per-show-crew-lookup-failed` alert; `PickerResetControl` receives an empty roster, same as today's failure path), and `crewEmails` is `[]` (both mailto affordances hidden; Copy remains). No new UI state, no sliced list. A realistic roster is ≤ ~100, so the branch is unreachable in practice but deterministic by contract — roster-derived surfaces are provably complete or visibly absent, never silently partial. The call keeps its existing `{ data, error }` destructure + try/catch (infra-contract registry row `tests/admin/_metaInfraContract.test.ts:393` unchanged in meaning; no comment inserted between `supabase` and `.from` per the scanner's format sensitivity).
  - Derive once: `const crewEmails = crew.map((c) => c.email).filter((e): e is string => e !== null && e.includes("@"));`
  - Pass `crewEmails` + `showTitle={show.title}` (`page.tsx:86` `title` field; used at `:558`) to both `<RotateShareTokenButton …>` (`page.tsx:797`) and `<CurrentShareLinkPanel …>` (`page.tsx:787`).
  - `PickerResetControl` (`page.tsx:805`) keeps receiving `crew`; the widened row type is a structural superset, no change needed there.

## 3. Guard conditions (every prop)

| Input | null / empty / absent | Behavior |
| --- | --- | --- |
| `crewEmails` prop | `undefined` or `[]` | anchors hidden on both surfaces; copy nudge text remains |
| `crewEmails` entries | `""`, no-`"@"`, longer than 254 chars, failing the email-shape regex (spaces/commas/CR-LF/`?`/`&`/quotes), duplicates | filtered/deduped inside the helper (server filter is a pre-pass, helper is authoritative) |
| `showTitle` | `undefined`, `""`, whitespace | subject falls back to `Crew link`; body drops the ` for …` fragment |
| `showTitle` | longer than `MAILTO_TITLE_MAX_CHARS` | truncated with `…`; blank-title fallback if still over budget; cap never exceeded |
| `crew_members.email` column | `null` (sentinel/unreadable at parse) | dropped by the server-side filter |
| `readCrew` failure | `crew: []` (existing failure path `page.tsx:244-272`) | `crewEmails` = `[]` → anchors hidden; no new failure surface |
| `readCrew` overflow | more rows than `CREW_ROSTER_READ_CAP` | fail closed everywhere: `{ crew: [], crewLookupFailed: true }` → existing visible crew-unavailable alert; `crewEmails` = `[]`, anchors hidden |
| `token` (panel) | `null` | existing unavailable branch; no anchor |
| `isCrewLinkActive` (rotate) | `false` | no `newUrl` → no anchor; `rotatedInactive` message unchanged |

## 4. Mode boundaries / transition inventory

`RotateShareTokenButton`'s state machine (`idle → confirm → resolving → idle`, `RotateShareTokenButton.tsx:29`) is unchanged — no new states. The mailto anchor lives inside the existing success banner and appears/disappears with it, instantly, exactly like the existing Copy button; no animation anywhere in this component today and none added. Compact vs non-compact layouts both render `banners` unchanged in position (`:283`, `:288`); the anchor rides inside `banners`. `CurrentShareLinkPanel` has no client state. No fixed-dimension parents are introduced (all rows are intrinsic-height flex) — no Dimensional Invariants section needed.

## 5. What this deliberately does not do

- **No SMS/share-sheet (`navigator.share`).** User chose the mailto approach; Web Share can be a follow-up.
- **No re-notify tracking.** We do not record whether Doug re-sent the link; audit item 5.2 asks for a one-tap affordance, not delivery telemetry.
- **No crew-email editing/visibility UI.** Emails come from the parsed roster as-is.
- **No new telemetry.** No mutation surface is created (anchors + a widened read); invariant 10's discovery walker finds no new route/action. Copy-only + read-only changes carry no `code:` obligations.
- **No error-code changes.** Nothing in `lib/messages/**` is touched (invariant 5 N/A — no codes rendered or added).

## 6. Tests (TDD; each lands before its implementation)

1. **`tests/admin/crewLinkMailto.test.ts`** (new, pure unit): empty/whitespace-only/no-`@`/over-254-char inputs → `[]` or filtered; **shape rejection (adversarial R5)**: addresses containing spaces, commas, CR/LF, `?`, `&`, quotes, or angle brackets are dropped (each a distinct case); a local-part `%` survives the filter and appears in the href only as `%25`; dedupe preserves first-seen order; bcc joins encoded addresses with literal commas; `subject`/`body` are `encodeURIComponent`-encoded and each body contains the raw URL exactly once; blank `showTitle` fallback subject `Crew link` and body without the `for` fragment; non-blank title appears in both; **chunking**: a recipient list constructed to cross `MAX_MAILTO_HREF_CHARS` (derive count from address length + the exported constant, never hardcode a magic count) yields >1 batch, every href ≤ the cap, every input recipient appears in exactly one batch, `batch`/`batchCount` are consistent, and a typical roster (e.g. 40 × ~25-char addresses) yields exactly one batch; **title/url budget (adversarial R4)**: an overlong `showTitle` (well past `MAILTO_TITLE_MAX_CHARS`) yields hrefs all ≤ `MAX_MAILTO_HREF_CHARS` with the truncated-`…` title in subject and body and zero recipients dropped; a `showTitle` so hostile it forces the blank-title fallback still keeps every href ≤ cap; a pathological `url` that cannot fit a single blank-title recipient href under the cap returns `[]`. Failure mode caught: malformed hrefs that open a mail client with corrupted recipients; silent recipient drops past the length cap; over-cap hrefs from unbounded titles; an anchor rendered for a show with zero usable emails.
2. **`tests/components/RotateShareTokenButton.test.tsx`** (extend): confirm warning contains the exact new sentence ("will have to re-pick their name"); success banner lead line contains "everyone will re-pick their name"; with `crewEmails` provided, success state renders `admin-rotate-share-token-email-button` whose `href` equals `buildCrewLinkMailtos`'s single-batch output for the same inputs (assert against the helper — the data source — not a hand-hardcoded string, per the anti-tautology rule; the helper itself is pinned by test 1); with `crewEmails: []` or prop omitted the anchor is absent; in the `isCrewLinkActive={false}` rotated state the anchor is absent; **multi-batch (adversarial R2)**: with a helper-derived roster that crosses `MAX_MAILTO_HREF_CHARS` (build the fixture from the exported constant), the rendered anchors' count equals `buildCrewLinkMailtos(...).length`, each anchor's label carries the matching `(N of M)`, and each anchor's `href` equals the corresponding batch's href — an implementation rendering only `mailtos[0]` fails. Failure mode caught: disclosure regression (5.1), anchor leaking into inactive/empty states, and silent omission of batches 2..N.
3. **`tests/components/CurrentShareLinkPanel.test.tsx`** (extend): with token + emails the anchor renders with the helper-derived href; with token + no emails it is absent; in the unavailable branch it is absent; **multi-batch (adversarial R2)**: same helper-derived threshold-crossing roster — anchor count equals batch count, labels carry `(N of M)`, hrefs match per batch. Failure mode caught: dead `mailto:?bcc=` with zero recipients, an anchor on the broken-token state, and silent omission of batches 2..N.
4. **`tests/app/admin/perShowPage.test.tsx`** (extend): the crew select string includes `email`; with a seeded roster mixing `email: null` and real emails, the rendered panel anchor's `href` contains only the non-null addresses (derives expected values from the fixture rows, not hardcoded counts); **rotate prop threading (adversarial R3)**: assert the real page threads the derived `crewEmails` AND `show.title` into `RotateShareTokenButton` — mock the component module and assert its received props equal the fixture-derived non-null emails and the seeded show title (component-level tests alone can't catch the page forgetting to pass them, which would silently remove the post-rotate re-send anchor). Failure mode caught: select not widened (all anchors silently vanish), null-email rows leaking into recipients, and unpassed props killing the rotate-banner affordance while every component test stays green; **row-cap fail-closed (adversarial R6/R7)**: with `CREW_ROSTER_READ_CAP + 1` seeded rows, both mailto affordances are absent AND the crew section renders the existing `per-show-crew-lookup-failed` visible alert (never a normal-looking partial roster).

## 7. Meta-test inventory (writing-plans rule, declared here for continuity)

- `tests/admin/_metaBoundedReads.test.ts` — **EXTENDED (adversarial R6)**: `app/admin/show/[slug]/page.tsx` joins `READ_MODULES` (`_metaBoundedReads.test.ts:30-42`). The scanner accepts only `.limit`/`.range`/`count:'exact'`/parent-`.in` as bounds (`_metaBoundedReads.test.ts:75-79` — `.maybeSingle()` does NOT count), so registering the module also requires `.limit(1)` on the `shows` lookup (`page.tsx:167-172`, semantically a no-op beside `.maybeSingle()`) alongside the crew read's new `.limit(CREW_ROSTER_READ_CAP + 1)`. The `shows_internal` parse-warnings read (`page.tsx:319`) is not in `UNBOUNDED_TABLES` and is unaffected.
- `tests/admin/_metaInfraContract.test.ts` — **no new registry row**: no new Supabase call site; the existing row for this surface (`:393`) still describes the widened select accurately.
- `tests/log/_metaMutationSurfaceObservability.test.ts` — **no entry**: no new mutation surface.
- No `pg_advisory*` touched — holder-topology declaration N/A.

## 8. Invariant 8 (impeccable dual-gate)

The diff touches `app/admin/show/[slug]/**` UI files → `/impeccable critique` + `/impeccable audit` run on the affected diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`-logged.

## 9. Numeric sweep

Literal numbers in this spec: 1900 (`MAX_MAILTO_HREF_CHARS`, defined once in §2.2, referenced by name elsewhere), 80 (`MAILTO_TITLE_MAX_CHARS`, defined once in §2.2, referenced by name elsewhere), 2083 (legacy IE floor rationale, once), 254 (RFC 5321 filter, §2.2 + guard table + tests — same value everywhere), 762 (encoded worst case of 254, once), ~50 / 40 (typical-roster illustrations, §2.2 / §6), line citations verified against `13df05f33`. No cross-section numeric contradiction.

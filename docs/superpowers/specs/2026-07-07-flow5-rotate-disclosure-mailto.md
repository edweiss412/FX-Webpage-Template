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

export type CrewLinkMailto = { href: string; batch: number; batchCount: number };

export function buildCrewLinkMailtos(opts: {
  emails: readonly string[];
  url: string;
  showTitle: string;
}): CrewLinkMailto[];
```

Behavior (each clause is a unit-test case):

- **Empty → `[]`.** After filtering, zero recipients returns an empty array (callers hide the affordance).
- **Filter + dedupe.** Drop falsy entries, entries without `"@"`, and entries longer than 254 characters (RFC 5321 path ceiling; also guarantees any single recipient fits a batch — see chunking). Dedupe exact duplicates preserving first-seen order. (Emails are already canonicalized-or-null at the parse boundary — `lib/parser/blocks/crew.ts:317-318,412` — so no re-canonicalization here; the filter is a belt, not the mechanism. Invariant 3 untouched: this is a read of already-canonical data.)
- **BCC, not To.** Recipients go in `bcc` so addresses are not cross-exposed by default. The `to` part of the mailto is empty: `mailto:?bcc=…`.
- **Encoding.** Each address is `encodeURIComponent`-encoded individually, joined with literal `,` (the RFC 6068 address separator; `,` is legal unencoded in the query part). `subject` and `body` values are `encodeURIComponent`-encoded.
- **Chunking (deterministic length guard; adversarial R1).** Recipients are greedily packed, in order, into the fewest batches such that each batch's complete href (`mailto:?bcc=<batch>&subject=…&body=…`) is ≤ `MAX_MAILTO_HREF_CHARS` (1900 — under the 2083-character legacy Windows/IE URL floor, the most restrictive mainstream mailto handler; modern clients allow far more). A 254-char address encodes to ≤ 762 chars and subject+body for any realistic title/URL stay well under the remainder, so every filtered recipient lands in some batch — **no recipient is ever silently dropped**. Each result carries `batch` (1-based) and `batchCount` so callers can label multi-batch anchors. The common case (roster ≤ ~50 typical-length addresses) yields exactly one batch.
- **Subject.** `Crew link — ${showTitle}` when `showTitle` is non-blank after trim; plain `Crew link` otherwise.
- **Body.** Exactly (before encoding):

  ```
  Here's the link to your crew page{ for ${showTitle}}:

  ${url}

  Open it and pick your name to see your schedule.
  ```

  where the ` for ${showTitle}` fragment is included only when `showTitle` is non-blank after trim.

**Pathological-input floor (explicit decision):** if `showTitle` + `url` alone made a single-recipient href exceed the cap (they can't for real data — titles are sheet-derived short strings, URLs are `origin/show/<slug>/<token>`), the greedy packer still emits one recipient per batch rather than dropping anyone; hrefs may then exceed the cap, which is accepted for that unreachable corner rather than adding a truncation path. Stated so the behavior is deterministic, not undefined.

### 2.3 Anchor in the rotate success banner

Inside the existing success banner (`RotateShareTokenButton.tsx:209-248`), the URL/Copy row gains sibling anchor(s) rendered **only when** `newUrl !== null` **and** `buildCrewLinkMailtos(...)` is non-empty:

- Element (one per batch): `<a href={m.href} data-testid="admin-rotate-share-token-email-button">…</a>` — plain anchor, no `target`, no `rel` (mailto scheme). Visible text **Email crew** when `batchCount === 1`; **Email crew (N of M)** per batch otherwise. Multi-batch anchors wrap in the same action row (`flex flex-wrap gap-2`).
- Placement: a second action row directly below the URL/Copy row, inside the same banner container, full-width start-aligned.
- Style: secondary bordered button-anchor using existing tokens, matching the compact idle button's recipe (`RotateShareTokenButton.tsx:194`): `inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`. A `Mail` icon from `lucide-react` (`size={14}`, `aria-hidden`) precedes the text, matching the icon convention at `RotateShareTokenButton.tsx:199-202`.
- The Copy button remains the primary (accent) action; the mailto anchor is deliberately secondary.

The `rotatedInactive` state (`RotateShareTokenButton.tsx:249-262`) is unchanged — no URL exists, so no anchor.

### 2.4 Anchor in CurrentShareLinkPanel

In `app/admin/show/[slug]/CurrentShareLinkPanel.tsx`, when a token exists (the branch building `url` at `:93`), a new row below the URL/Copy row (`:104-112`) renders the same style of anchor(s) with `data-testid="admin-current-share-link-email-button"`, hrefs from `buildCrewLinkMailtos({ emails, url, showTitle })`. Visible text **Email this link to crew** for a single batch; **Email this link to crew (N of M)** per batch otherwise. Hidden when the helper returns `[]`. The token-unavailable branch (`:73-91`) never renders it. This is a Server Component; the anchors are static markup (no client boundary needed).

### 2.5 Prop threading

- **`RotateShareTokenButton`** gains optional props `crewEmails?: readonly string[]` (default `[]`) and `showTitle?: string` (default `""`).
- **`CurrentShareLinkPanel`** gains the same two optional props with the same defaults.
- **`app/admin/show/[slug]/page.tsx`:**
  - `CrewMemberRow` (`page.tsx:96-100`) gains `email: string | null`.
  - `readCrew` (`page.tsx:244`) currently declares its return as `PerShowCrewRow[]` (`components/admin/PerShowCrewSection.tsx:20-24` — `id`/`name`/`role` only), which would erase the new field at the type level. Change its return type to `{ crew: CrewMemberRow[]; crewLookupFailed: boolean }`; `CrewMemberRow` is a structural superset of `PerShowCrewRow`, so the existing consumers (`PerShowCrewSection` crew prop, `PickerResetControl` at `page.tsx:805`) accept it unchanged. `PerShowCrewRow` itself is NOT widened — components that don't need email keep the narrower type.
  - `readCrew`'s select (`page.tsx:248`) widens from `"id, name, role"` to `"id, name, role, email"`. The call keeps its existing `{ data, error }` destructure + try/catch (infra-contract registry row `tests/admin/_metaInfraContract.test.ts:393` unchanged in meaning; no comment inserted between `supabase` and `.from` per the scanner's format sensitivity).
  - Derive once: `const crewEmails = crew.map((c) => c.email).filter((e): e is string => e !== null && e.includes("@"));`
  - Pass `crewEmails` + `showTitle={show.title}` (`page.tsx:86` `title` field; used at `:558`) to both `<RotateShareTokenButton …>` (`page.tsx:797`) and `<CurrentShareLinkPanel …>` (`page.tsx:787`).
  - `PickerResetControl` (`page.tsx:805`) keeps receiving `crew`; the widened row type is a structural superset, no change needed there.

## 3. Guard conditions (every prop)

| Input | null / empty / absent | Behavior |
| --- | --- | --- |
| `crewEmails` prop | `undefined` or `[]` | anchors hidden on both surfaces; copy nudge text remains |
| `crewEmails` entries | `""`, no-`"@"`, longer than 254 chars, duplicates | filtered/deduped inside the helper (server filter is a pre-pass, helper is authoritative) |
| `showTitle` | `undefined`, `""`, whitespace | subject falls back to `Crew link`; body drops the ` for …` fragment |
| `crew_members.email` column | `null` (sentinel/unreadable at parse) | dropped by the server-side filter |
| `readCrew` failure | `crew: []` (existing failure path `page.tsx:244-272`) | `crewEmails` = `[]` → anchors hidden; no new failure surface |
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

1. **`tests/admin/crewLinkMailto.test.ts`** (new, pure unit): empty/whitespace-only/no-`@`/over-254-char inputs → `[]` or filtered; dedupe preserves first-seen order; bcc joins encoded addresses with literal commas; `subject`/`body` are `encodeURIComponent`-encoded and each body contains the raw URL exactly once; blank `showTitle` fallback subject `Crew link` and body without the `for` fragment; non-blank title appears in both; **chunking**: a recipient list constructed to cross `MAX_MAILTO_HREF_CHARS` (derive count from address length + the exported constant, never hardcode a magic count) yields >1 batch, every href ≤ the cap, every input recipient appears in exactly one batch, `batch`/`batchCount` are consistent, and a typical roster (e.g. 40 × ~25-char addresses) yields exactly one batch. Failure mode caught: malformed hrefs that open a mail client with corrupted recipients; silent recipient drops past the length cap; an anchor rendered for a show with zero usable emails.
2. **`tests/components/RotateShareTokenButton.test.tsx`** (extend): confirm warning contains the exact new sentence ("will have to re-pick their name"); success banner lead line contains "everyone will re-pick their name"; with `crewEmails` provided, success state renders `admin-rotate-share-token-email-button` whose `href` equals `buildCrewLinkMailtos`'s single-batch output for the same inputs (assert against the helper — the data source — not a hand-hardcoded string, per the anti-tautology rule; the helper itself is pinned by test 1); with `crewEmails: []` or prop omitted the anchor is absent; in the `isCrewLinkActive={false}` rotated state the anchor is absent. Failure mode caught: disclosure regression (5.1) and anchor leaking into inactive/empty states.
3. **`tests/components/CurrentShareLinkPanel.test.tsx`** (extend): with token + emails the anchor renders with the helper-derived href; with token + no emails it is absent; in the unavailable branch it is absent. Failure mode caught: dead `mailto:?bcc=` with zero recipients, and an anchor on the broken-token state.
4. **`tests/app/admin/perShowPage.test.tsx`** (extend): the crew select string includes `email`; with a seeded roster mixing `email: null` and real emails, the rendered panel anchor's `href` contains only the non-null addresses (derives expected values from the fixture rows, not hardcoded counts). Failure mode caught: select not widened (all anchors silently vanish) and null-email rows leaking into recipients.

## 7. Meta-test inventory (writing-plans rule, declared here for continuity)

- `tests/admin/_metaBoundedReads.test.ts` — **not extended**: `app/admin/show/[slug]/page.tsx` is not in `READ_MODULES` (`_metaBoundedReads.test.ts:30-42`); the crew read is per-show `.eq("show_id", …)` scoped and pre-existing.
- `tests/admin/_metaInfraContract.test.ts` — **no new registry row**: no new Supabase call site; the existing row for this surface (`:393`) still describes the widened select accurately.
- `tests/log/_metaMutationSurfaceObservability.test.ts` — **no entry**: no new mutation surface.
- No `pg_advisory*` touched — holder-topology declaration N/A.

## 8. Invariant 8 (impeccable dual-gate)

The diff touches `app/admin/show/[slug]/**` UI files → `/impeccable critique` + `/impeccable audit` run on the affected diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`-logged.

## 9. Numeric sweep

Literal numbers in this spec: 1900 (`MAX_MAILTO_HREF_CHARS`, defined once in §2.2, referenced by name elsewhere), 2083 (legacy IE floor rationale, once), 254 (RFC 5321 filter, §2.2 + guard table + tests — same value everywhere), 762 (encoded worst case of 254, once), ~50 / 40 (typical-roster illustrations, §2.2 / §6), line citations verified against `13df05f33`. No cross-section numeric contradiction.

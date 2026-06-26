# Spec — BL-HOTEL-VIEWER-NAME-MATCH: per-viewer hotel visibility name matching

**Date:** 2026-06-26
**Slug:** hotel-viewer-name-match
**Status:** ratified design (user-approved 2026-06-26: matcher strictness = LENIENT; slash-split = INCLUDED; ship autonomously). These three are **not open for relitigation**.

## 1. Problem

`getShowForViewer` shows a non-admin crew viewer only the hotel reservations whose guest list contains them. The current predicate (`lib/data/getShowForViewer.ts:641-646`) is:

```ts
const hotelReservations =
  isAdmin || viewerName === null
    ? allHotels
    : allHotels.filter((res) =>
        res.names.some((n) => n.toLowerCase().includes((viewerName as string).toLowerCase())),
      );
```

`viewerName` is the **full roster name** from `crew_members.name` (`getShowForViewer.ts:288`, set on the `kind:"crew"` picker path). `res.names` are **parsed hotel-guest names**. The `guest.includes(viewer)` primitive requires the guest string to literally contain the full roster name, which fails whenever the hotel guest name is a first-name, nickname, or initialed form of the roster name. Grounded against all 7 `exporter-xlsx` shows this session, it is broken for ~5 of 7:

| Show | Roster crew | Parsed hotel guests | Currently MISS (broken) |
|---|---|---|---|
| east-coast | Doug Larson, Carl Fenton, Eric Weiss | Doug, Carl, Eric W | **all 3** (first-names) |
| ria | Doug Larson, Eric Weiss, Calvin Saller | Doug, Eric | **all** (first-names) |
| rpas | Doug Larson, Eric Weiss, John Carleo, Calvin Saller | Douglas Larson, John Carleo, Eric Weiss | **Doug Larson** (Douglas) |
| consultants | Doug Larson, John Clark, Alex Rodrigues, Eric Weiss, Calvin Saller, Kari Rose | Doug Larson, John Clark, Alexandre Rodrigues, Eric Weiss | **Alex Rodrigues** (Alexandre) |
| fixed-income | Jeffrey Justice, DJ Johnson, Eric Weiss, Maria Davila, Rob Frye | "David Johnson / Jeffrey Justice" (one unsplit entry) | **DJ Johnson** (David) + the slash-merge |
| redefining-fi | Eric Carroll, Eric Weiss, Connor Hester, … | Eric Carroll, Eric Weiss, Connor Hester | — (exact) |
| fintech | John Carleo, Eric Weiss, Calvin Saller | John Carleo, Eric Weiss, Carlos Pineda | — (exact) |

**Two root causes:** (1) the wrong matching primitive; (2) a parser bug — `parseGuestCell` (`lib/parser/blocks/hotels.ts:108`) does not split a slash-separated "Names on Reservation" cell, so fixed-income's `fixed-income.md:49` `David Johnson / Jeffrey Justice` is one `names[]` entry.

### Security / privacy framing (load-bearing)

The per-viewer hotel filter is **UX, not security**. `hotel_reservations` is show-wide crew-readable at the DB layer (RLS `crew_read` + SELECT to `authenticated`); any crew member can already read every hotel row via PostgREST. The filter only decides which cards `getShowForViewer` surfaces. Therefore:

- **Under-match is the real harm** — a missed match hides the viewer's own hotel entirely.
- **Over-match is benign** — an extra card shows information already DB-readable. The conf#-not-persisted invariant (the actual privacy boundary, `hotels.ts:100-106`, `#4 PRIVACY` meta-test) is untouched by this change.

So the matcher is tuned to minimize under-match, accepting a small, documented over-match bound.

## 2. Out of scope / what does NOT change

- **Admin / unknown-viewer fallback** (`isAdmin || viewerName === null → allHotels`) is unchanged — admins and date-restricted/unknown viewers still see all hotels.
- **DB RLS / grants** — unchanged; this is a pure in-memory filter over the already-fetched `allHotels`. No new `.from()`/`.rpc()` call → the Supabase call-boundary meta-test is not implicated.
- **conf# privacy** — conf# stays parsed-but-not-persisted; the slash-split must keep `#4 PRIVACY` green.
- **Transportation `assigned_names`** — shown verbatim (not viewer-filtered, `getShowForViewer.ts:99`); not touched.
- **No UI files** — `lib/data` + `lib/parser` only → invariant-8 (impeccable dual-gate) is N/A.

## 3. Design

### 3.1 `namesRefer(a, b): boolean` — new pure helper in `lib/data/nameMatch.ts`

Symmetric. Decides whether two human-name strings refer to the same person, tolerant of first-name-only, nickname-prefix, and initialed forms.

```
toks(s): s.normalize("NFD").replace(/\p{M}/gu, "")  // fold diacritics + normalize (José == Jose,
                                                     // precomposed == decomposed)
           .toLowerCase()
           .replace(/[\/,]/g, " ")        // slash + comma → space (defensive un-merge)
           .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")  // drop generational suffixes before tokenizing
           .replace(/[^\p{L}\s-]/gu, "")   // strip remaining punctuation, KEEP hyphen + space
           .split(/\s+/)
           .map(t => t.replace(/^-+|-+$/g, ""))  // trim stray edge hyphens
           .filter(Boolean)

tokCompat(x, y): x === y || x.startsWith(y) || y.startsWith(x)
   // prefix covers same-initial nicknames (doug⊂douglas, alex⊂alexandre) AND initials (w⊂weiss, e⊂eric)

namesRefer(a, b):
  A = toks(a); B = toks(b)
  if A.length === 0 || B.length === 0: return false
  if A.length === 1: return tokCompat(A[0], B[0]) || tokCompat(A[0], B[B.length-1])
  if B.length === 1: return tokCompat(B[0], A[0]) || tokCompat(B[0], A[A.length-1])
  // both multi-token: SURNAME compatible. The surname is the strong identity signal;
  // the first name is intentionally NOT required to match, because non-prefix
  // nicknames (Bill↔William, Bob↔Robert, Joey↔Joseph, Jim↔James) share neither a
  // prefix nor a first letter, yet are the same person — and the fixtures already
  // carry exactly this (crew "Bill Werner" / legal "William Werner Jr",
  // fixtures/shows/raw/2025-10-fixed-income-trading-summit.md:536).
  return tokCompat(A[last], B[last])
```

**Why these tiers (LENIENT, ratified — under-match is the harm, over-match benign):**
- **single-token side** (guest `Carl`, `Doug`, `Eric`): a lone token matches the other's first **or** last token — catches first-name guests (`Carl`↔`Carl Fenton`) and a lone-surname guest (`Larson`↔`Doug Larson`).
- **both multi-token → surname-compatible ONLY** (`tokCompat` on the last token: `Larson`=`Larson`, `Werner`=`Werner`, `Weiss`⊃`W`). Dropping the first-name gate is deliberate: it catches **every** nickname/legal-name form (Bill↔William, Bob↔Robert, DJ↔David, Doug↔Douglas) since the surname carries the identity, **and still passes every over-match exclusion in §1** because those all have **distinct surnames** (`Carroll`≠`Weiss`, `Saller`≠`Pineda`, `Carleo`≠`Pineda`, `Clark`≠`Carleo`). Generational suffixes (`Jr`/`Sr`/`III`) are stripped in `toks` so `William Werner Jr` ⇒ surname `Werner`.

**Over-match bound (documented, accepted):** two **distinct** people who share a (prefix-compatible) surname — e.g. crew `Doug Larson` and an unrelated hotel guest `Pat Larson` — both match; a single-token guest first-name shared by two crew also matches. Both are benign per §1 (the surfaced card is already DB-readable; no further distinguishing signal exists in the data). **Under-match residual (rare, documented):** a single-token *cross-initial nickname* guest with no surname (a bare `Bob` vs viewer `Robert Smith`) does not match — not in the corpus (the only single-token guests are `Doug`/`Carl`/`Eric`, all prefix-compatible).

### 3.2 Wire into the hotel filter

Replace the `.includes` predicate at `getShowForViewer.ts:644-645`:

```ts
allHotels.filter((res) => res.names.some((n) => namesRefer(n, viewerName as string)))
```

(Extract the predicate into a tiny pure `hotelVisibleToViewer(res, viewerName)` if it improves testability; the integration test exercises the real `res.names.some(namesRefer)` path either way.)

### 3.3 Parser fix — split slash-separated guests in `parseGuestCell`

`parseGuestCell` (`hotels.ts:108`) tokenizes a "Names on Reservation" cell. Add a pre-split on `/` (with surrounding spaces) so `David Johnson / Jeffrey Justice` yields two guest names. Keep all existing behavior: conf# is parsed only to strip it from names (not persisted), `&#10;`/space delimiting, accented names. Run conf-stripping per split segment so no conf# leaks.

### 3.4 Guard conditions (every input edge)

| Input | Behavior |
|---|---|
| `viewerName === null` (admin / unknown) | filter not applied — all hotels (unchanged) |
| `res.names` empty `[]` | `.some` → false → reservation hidden for known viewer (a reservation with no guests has nobody to match; unchanged behavior) |
| guest name `""` / whitespace-only | `toks` → `[]` → `namesRefer` false (no match, no crash) |
| viewerName `""` | `toks` → `[]` → false (treated as no-match; pre-existing `viewerName` is non-empty from a crew row, but guarded) |
| single-letter guest/viewer token | handled by `tokCompat` prefix (`w`⊂`weiss`) |
| accented names (`José` precomposed vs decomposed vs `Jose`) | `toks` does `NFD` + strip `\p{M}` → all fold to `jose`; equal |
| generational suffix (`William Werner Jr`) | `toks` strips `jr/sr/ii/iii/iv` → surname token is `werner` |
| non-prefix nickname (`Bill`↔`William`, multi-token) | surname-only multi-token rule matches on the shared surname |
| hyphenated surname (`Smith-Jones`) | hyphen kept in token; `tokCompat` prefix lets `Smith` match `Smith-Jones` |

## 4. Test plan (TDD)

1. **`namesRefer` unit matrix** (`tests/data/nameMatch.test.ts`): every roster↔guest pair from the §1 oracle, asserting the exact match/no-match, **derived from a data table** (not hand-listed booleans where avoidable). Explicit **over-match exclusions**: `Eric Carroll`↮`Eric Weiss`, `Eric Weiss`↮`Eric Carroll`, `Calvin Saller`↮`Carlos Pineda`, `John Carleo`↮`Carlos Pineda`. Explicit **nickname/legal-name matches**: `Bill Werner`↔`William Werner` and `Bill Werner`↔`William Werner Jr` (suffix-stripped); `DJ Johnson`↔`David Johnson`; `Doug Larson`↔`Douglas Larson`; `Alex Rodrigues`↔`Alexandre Rodrigues`. Explicit **accent/normalization**: `José Núñez` precomposed ↔ decomposed ↔ `Jose Nunez` all match. Assert **symmetry** (`namesRefer(a,b) === namesRefer(b,a)`) for every pair. Edge cases from §3.4 (empty, whitespace, single-token both sides, hyphenated surname). *Failure mode caught:* a regression to substring-only matching (would fail east-coast/ria/rpas/consultants/fixed-income rows), an over-broad matcher (would fail the distinct-surname exclusions), or a re-introduction of the first-name gate (would fail Bill↔William).
2. **Filter integration** (`tests/data/...`): exercise the real `res.names.some((n) => namesRefer(n, viewerName))` predicate (or full `getShowForViewer` with mocked reads) — a `kind:"crew"` viewer named `Carl Fenton` sees the `names:["Carl"]` reservation; a viewer `Eric Weiss` does **not** see a `names:["Eric Carroll"]` reservation; admin/`viewerName===null` sees all. *Failure mode caught:* the matcher works in isolation but is wired wrong (e.g. argument order, still calling `.includes`).
3. **Parser slash-split** (extend `tests/parser/blocks/hotels.test.ts` or `exporterFixtures.test.ts`): fixed-income's structured cell yields two guests `["David Johnson","Jeffrey Justice"]`, no conf# in either, `#4 PRIVACY` meta-test still green. *Failure mode caught:* the slash-merge regressing, or a conf# leaking through the new split path.
4. **Anti-tautology:** matcher expectations derive from the oracle data table; the integration test asserts membership in the filtered result, not a re-statement of the matcher.

## 5. Citations (verified live, 2026-06-26)

- Filter: `lib/data/getShowForViewer.ts:641-646`. `viewerName` source: `:288` (`viewerName = (lookup.data.name as string) ?? null`). `Viewer` type: `:87-90` (`crew` | `admin` | `admin_preview`).
- Verbatim transport: `getShowForViewer.ts:99`. conf# privacy note: `hotels.ts:100-106`.
- `parseGuestCell`: `lib/parser/blocks/hotels.ts:108`. Slash cell: `fixtures/shows/exporter-xlsx/fixed-income.md:49`.
- Existing harness: `tests/data/getShowForViewer.test.ts` (+ siblings).

## 6. Watchpoints (pre-load the reviewer)

- **Do-not-relitigate:** matcher strictness = LENIENT (user-ratified); slash-split scope = INCLUDED (user-ratified); UX-not-security framing (M11.5 picker pivot — `project_crew_auth_pivot_to_show_link_picker`); the over-match bound is accepted by design.
- The filter is pure in-memory over `allHotels` — **no new Supabase call**, so the call-boundary meta-test is not in scope.
- `viewerName` is non-null on the filtered branch (the `=== null` case short-circuits to `allHotels`), but `namesRefer` is defensively total over empty/whitespace input.

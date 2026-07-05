# FORM-tab contact fallback — design spec

**Date:** 2026-07-05
**Bug:** GitHub #316 item 4 (reported by Doug Larson, show "II - Fixed Income Trading Summit 2025", drive_file_id `1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4`, validation)
**Type:** Parser data-fidelity fix. No UI, no DB, no migration, no advisory-lock, no new §12.4 code.

---

## 1. Problem

Doug: *"contacts and contact information is missing from source sheet, no av contact ashley morgan's 'ashley.morgan@institutionalinvestor.com' is missing."*

On this show the INFO-tab contact cells are **empty**; the real contact data sits only in the **FORM tab** (the client-intake Google Form response). The parser harvests contacts only from the INFO-tab labels, so contacts drop.

### 1.1 Ground truth (live sheet, verified via gsheets MCP 2026-07-05)

INFO tab (`INFO!A6:E11`, `INFO!A67:A68`):

| INFO label | INFO value |
|---|---|
| `Contact` | `Ashley Morgan` |
| `Contact Cell` | *(empty)* |
| `Contact Office` | *(empty)* |
| `Contact Email` | *(empty)* |
| `Hotel Contact Info` | *(empty)* |
| `In House AV` | *(empty)* |

FORM tab (`FORM!A3:B45`):

| FORM label | FORM value |
|---|---|
| `Your Name` | `Ashley Morgan` |
| `Email Address` | `ashley.morgan@institutionalinvestor.com` |
| `Phone Number` | `8452701900` |
| `Logistics Director Name(s)` | `Ashley Morgan` |
| `Hotel Contact Information` | `Kurt.Ashcraft@hyatt.com` |
| `Onsite AV Contact` | `chris.mercado@encoreglobal.com` |

### 1.2 Fixture divergence (important)

The committed fixture `fixtures/shows/raw/2025-10-fixed-income-trading-summit.md` is a **stale snapshot** where the INFO cells were populated (line 5 `Contact Cell | 845-270-1900`, line 7 `Contact Email | ashley...`, line 56 `Hotel Contact Info | Kurt Ashcraft ...`, line 57 `In House AV | Chris Mercado ... Danilo Scekic ...`). It does NOT reproduce the live bug. Per repo policy (never regenerate `fixtures/shows/raw/**`; markdown fixtures are not the sheet source of truth) this spec adds a **new purpose-built fixture** mirroring the live shape (INFO contact cells blank, FORM populated) rather than editing the raw fixture.

### 1.3 Verified current behavior (real parser, live shape)

Running `parseContacts` / `parseClient` on a live-shape markdown (INFO contact cells blanked, FORM rows intact) yields:

- **venue**: `{ kind:"venue", email:"kurt.ashcraft@hyatt.com", name:null, phone:null }` — **already surfaced**. `VENUE_LABEL_RE` (`contacts.ts:31`) already matches the FORM label `Hotel Contact Information`. No change needed for venue.
- **in_house_av (AV)**: **dropped**. The FORM label `Onsite AV Contact` is not matched by `IN_HOUSE_AV_LABEL_RE` (`contacts.ts:34` = `/^\s*in\s+house\s+av\s*$/i`), and the INFO `In House AV` cell is empty.
- **client_contact**: `{ name:"Ashley Morgan", email:null, phone:null }` — name parses from INFO `Contact`; email/phone are null because INFO `Contact Email`/`Contact Cell` are empty and `client.ts` does not read the FORM `Email Address`/`Phone Number` rows.

So exactly **two** code gaps must close: (A) AV contact, (B) client email/phone. Venue is already correct and is out of scope for new code (but must not regress).

---

## 2. Scope (user-ratified 2026-07-05, do not relitigate)

- Harvest three FORM contact kinds as fallback: **AV**, **client email/phone**, **venue/hotel**. (Venue already works — the fix must preserve it, no new code required.)
- Policy: **fill-only-if-INFO-empty**. A FORM contact is used ONLY when the corresponding INFO-sourced contact produced nothing. INFO stays authoritative; FORM is fallback. This is the narrowest possible reversal of the deliberate FORM-PII exclusion — contacts only, never other FORM PII (names-as-prose, budget, PO#, etc. stay excluded).
- The `In House AV` cell being genuinely empty in the source is NOT "no AV contact" — the AV contact exists on the FORM tab and must be surfaced.

### 2.1 Out of scope

- Editing `fixtures/shows/raw/**` (policy: never regenerate raw fixtures).
- `harvestFormLayout` (event.ts) EVENT-DETAILS closed-vocab behavior — untouched. This spec adds contact-specific FORM fallback in `contacts.ts` and `client.ts`, NOT in the event-details harvest.
- Secondary client contact from FORM (the FORM has exactly one submitter → main contact only).
- Synthesizing a client_contact from FORM when INFO has no CLIENT block at all (if `client_contact` is `null`, this fix is a no-op — that is a different, un-reported condition).
- Any new §12.4 error code / warning. Surfacing more real data is not a gap; the fallback is silent-correct.

---

## 3. Design

Two independent halves, each internal to one existing parser function. No change to `lib/parser/index.ts` (both functions already receive the full `markdown` + `version` + `agg`; call sites `index.ts:564` and `index.ts:577`).

### 3.A AV contact fallback — `lib/parser/blocks/contacts.ts`

Add a FORM-fallback AV label and merge it fill-only-if-empty.

1. New constant (module scope, next to the existing label regexes at `contacts.ts:31-34`):

   ```ts
   // FORM-tab fallback label for the onsite AV contact. Matches the exact Google-Form
   // question label "Onsite AV Contact" — deliberately NOT "Onsite AV Contact Info"
   // (a separate checklist-boolean row that carries TRUE/FALSE, e.g. fixtures line 341).
   const ONSITE_AV_LABEL_RE = /^\s*onsite\s+av\s+contact\s*$/i;
   ```

2. In the scan loop (`contacts.ts:80-124`), add a third branch AFTER the venue/in_house_av detection. When `col0` matches `ONSITE_AV_LABEL_RE`, the row is a **FORM-fallback AV candidate**: set `labelMatched = true`, apply the same `rawValue` extraction (`cells[1]`), `hasContactSignal` guard, and `parseContactCell(rawValue, "in_house_av")`, but push the parsed rows into a **separate** `formAvContacts: ContactRow[]` array instead of `contacts`. (Do NOT let an `ONSITE_AV_LABEL_RE` row fall through to the `venue`/`in_house_av` push.)

3. After the existing email-dedup (`contacts.ts:131-140`) produces `deduped`, apply fill-only-if-empty:

   ```ts
   // Fill-only-if-INFO-empty: the FORM "Onsite AV Contact" fallback is used ONLY when the
   // INFO "In House AV" label produced no in_house_av contact. When INFO already yielded an
   // AV contact, the FORM fallback is discarded entirely (never appended, never merged) so
   // curated INFO data is authoritative and no duplicate/second AV contact can appear.
   const hasInfoAv = deduped.some((c) => c.kind === "in_house_av");
   if (!hasInfoAv && formAvContacts.length > 0) {
     const seen = new Set<string>();
     for (const c of formAvContacts) {
       if (c.email) {
         const k = `in_house_av::${c.email.toLowerCase().trim()}`;
         if (seen.has(k)) continue;
         seen.add(k);
       }
       deduped.push(c);
     }
   }
   ```

4. The D1 empty-section guard (`contacts.ts:145`) fires on `labelMatched && deduped.length === 0` — unchanged; `ONSITE_AV_LABEL_RE` participates in `labelMatched`, so an AV-label row that yields nothing still fails loud, consistent with the existing contract.

**Multi-person:** `parseContactCell` already splits a multi-email FORM cell into one `ContactRow` per person, so a FORM `Onsite AV Contact` cell listing two AV techs yields two rows (matches the INFO multi-person behavior).

### 3.B Client email/phone fallback — `lib/parser/blocks/client.ts`

Add a FORM-fallback harvest for the client contact's email + phone, applied fill-only-if-empty to the MAIN contact only.

1. New constants + helper (module scope):

   ```ts
   // FORM-tab fallback labels for the client-side contact (the Google-Form submitter — the
   // client's logistics director). Exact-label match; the FORM tab is unique per show and
   // each label appears once. Used ONLY to fill an INFO client contact whose email/phone are
   // empty (fill-only-if-INFO-empty) — never to override a real INFO value.
   const FORM_CLIENT_EMAIL_LABEL = "email address";
   const FORM_CLIENT_PHONE_LABEL = "phone number";

   function harvestFormClientContact(rows: string[][]): { email: string | null; phone: string | null } {
     let email: string | null = null;
     let phone: string | null = null;
     for (const row of rows) {
       const label = (row[0] ?? "").toLowerCase().trim();
       const val = clean(row[1] ?? "");
       if (!val) continue;
       // Accept the email row only when the value actually looks like an email; accept the
       // phone row only when it carries digits — guards against a blank/placeholder cell.
       if (label === FORM_CLIENT_EMAIL_LABEL && email === null && /@/.test(val)) {
         email = canonicalize(val);
       } else if (label === FORM_CLIENT_PHONE_LABEL && phone === null && /\d/.test(val)) {
         phone = presence(val);
       }
     }
     return { email, phone };
   }
   ```

2. In `parseClient` (`client.ts:374`), AFTER the version-branch produces `result` (`{ client_label, client_contact }`), apply the fallback only when a main contact exists and is missing email or phone:

   ```ts
   const result = version === "v4" ? parseClientV4(rows, agg) : parseClientV2orV1(rows, agg);
   const contact = result.client_contact;
   if (contact && (contact.email === null || contact.phone === null)) {
     const form = harvestFormClientContact(rows);
     if (contact.email === null && form.email !== null) contact.email = form.email;
     if (contact.phone === null && form.phone !== null) contact.phone = form.phone;
   }
   return result;
   ```

   `parseClient` already computes `rows = parseTableRows(markdown)` at `client.ts:380`; reuse it (pass `rows` into both the version branch and the fallback so the FORM rows are in scope).

**Guard conditions:**
- `client_contact === null` (no INFO CLIENT block) → fallback is a no-op (the `if (contact && ...)` guard).
- Both email + phone already present from INFO → no FORM scan side effects on output (values unchanged; `form` is computed but neither branch writes).
- FORM `Email Address` empty / non-email → `email` stays null → nothing filled.
- FORM `Phone Number` empty / non-numeric → `phone` stays null → nothing filled.
- Secondary contact → never touched (FORM has one submitter).

### 3.3 Email canonicalization (invariant 3)

Every email that enters the system routes through `canonicalize` (`@/lib/email/canonicalize`): §3.A reuses `parseContactCell` which already calls `canonicalize` (`contacts.ts:283`); §3.B calls `canonicalize` in `harvestFormClientContact`. No raw email is stored.

---

## 4. Guard-condition / edge matrix

| Input condition | AV (§3.A) | Client email/phone (§3.B) |
|---|---|---|
| INFO cell populated, FORM cell populated | INFO wins; FORM discarded | INFO wins; FORM not written |
| INFO cell empty, FORM cell populated | FORM surfaced | FORM fills |
| INFO cell empty, FORM cell empty | nothing (D1 empty-section if any AV label seen) | stays null |
| INFO cell empty, FORM value is placeholder ("FALSE"/"N/A"/blank) | `hasContactSignal` rejects | `/@/` or `/\d/` guard rejects |
| FORM cell multi-person | multiple `in_house_av` rows | N/A (single email/phone) |
| `client_contact === null` | N/A | no-op |
| `Onsite AV Contact Info` row (`| ... | FALSE |`) | not matched (regex requires exact "Onsite AV Contact") + `hasContactSignal` rejects | N/A |

---

## 5. Testing (anti-tautology; failure modes named)

New test file `tests/parser/formTabContactFallback.test.ts`. Test inputs are **inline markdown** built to the live shape (INFO contact cells blank, FORM rows populated) — NOT a mutation of `fixtures/shows/raw/**`. Expected values are derived from the FORM cell contents in each test's own input.

1. **AV fallback when INFO empty** — live-shape markdown (INFO `In House AV` blank, FORM `Onsite AV Contact | chris.mercado@encoreglobal.com`) → `parseContacts` returns a contact `{ kind:"in_house_av", email:"chris.mercado@encoreglobal.com" }`. *Catches: FORM AV label unrecognized (the actual bug).* Expected email is read from the fixture input, not hardcoded independently.
2. **AV INFO wins (fill-only-if-empty)** — INFO `In House AV | Chris Mercado chris.mercado@encoreglobal.com` populated AND FORM `Onsite AV Contact | different.person@x.com` → result contains the INFO contact and does NOT contain `different.person@x.com`. *Catches: FORM fallback wrongly appending a second AV contact when INFO already has one.*
3. **Client email/phone fallback when INFO empty** — INFO CLIENT block with `Contact | Ashley Morgan`, empty `Contact Email`/`Contact Cell`; FORM `Email Address | ashley.morgan@institutionalinvestor.com`, `Phone Number | 8452701900` → `client_contact` = `{ name:"Ashley Morgan", email:"ashley.morgan@institutionalinvestor.com", phone:"8452701900" }`. *Catches: client email/phone dropped (the actual bug).* Email asserted canonicalized.
4. **Client INFO wins** — INFO `Contact Email | real@info.com` populated AND FORM `Email Address | other@form.com` → `client_contact.email === "real@info.com"`. *Catches: FORM override clobbering curated INFO email.*
5. **Client fallback no-op when no CLIENT block** — markdown with a FORM `Email Address` row but no INFO CLIENT block → `client_contact === null` (unchanged). *Catches: synthesizing a phantom client from FORM PII.*
6. **Placeholder rejection** — FORM `Onsite AV Contact | FALSE` and `Email Address | N/A` with empty INFO → no AV contact, client email stays null. *Catches: placeholder form values leaking as contacts.*
7. **Regression — populated fixture unchanged** — run `parseContacts`/`parseClient` on the existing `fixtures/shows/raw/2025-10-fixed-income-trading-summit.md` (INFO populated) and assert the result is byte-identical to today's output (Chris Mercado + Danilo from INFO AV; Ashley email `ashley.morgan@institutionalinvestor.com` + phone `845-270-1900` from INFO; venue Kurt Ashcraft). *Catches: the fallback altering shows whose INFO is populated.*
8. **Venue not regressed** — live-shape markdown → venue contact `kurt.ashcraft@hyatt.com` still surfaced (via existing `VENUE_LABEL_RE`). *Catches: the AV change accidentally breaking the already-working venue path.*

---

## 6. Watchpoints (pre-load the reviewer)

- **Fixture divergence is intentional (§1.2).** Do NOT "fix" the tests by editing `fixtures/shows/raw/2025-10-fixed-income-trading-summit.md`. The live bug only reproduces against the live shape; the raw fixture is a stale populated snapshot and is deliberately left alone (repo policy: never regenerate raw fixtures).
- **Venue needs no new code (§1.3).** `VENUE_LABEL_RE` already matches the FORM `Hotel Contact Information` label. The user selected "venue" in scope, but the correct implementation is "preserve existing behavior + regression test," not new code. This is not an omission.
- **`fill-only-if-INFO-empty` is the ratified policy (§2), not "always prefer FORM."** The FORM fallback must be discarded when INFO already produced the contact.
- **No new §12.4 code by design (§2.1).** The fallback surfaces real data silently; it is not a warning condition. Do not request a catalog row.
- **`Email Address` / `Phone Number` map to the CLIENT contact** because the FORM is the client's intake form (submitter = logistics director = client side); Doug explicitly wants the submitter (Ashley) surfaced as the contact. This is a deliberate mapping, gated by fill-only-if-empty so it can only fill an empty INFO field.

---

## 7. Invariant checklist

- Inv. 1 (TDD): every task failing-test-first. ✓ (plan)
- Inv. 2 (advisory lock): N/A — pure parser, no DB mutation.
- Inv. 3 (email canonicalization): ✓ all emails via `canonicalize`.
- Inv. 4 (no global sync cursor): N/A.
- Inv. 5 (no raw error codes in UI): N/A — no UI, no new code.
- Inv. 8 (UI quality gate): N/A — no file under `app/`, `components/`, CSS, tokens, or `DESIGN.md` is touched. Data flows into existing render paths (`CrewSection`/`TodaySection` already render `in_house_av`; client contact already rendered).
- Inv. 9 (Supabase call-boundary): N/A — no Supabase call.
- Inv. 10 (mutation-surface telemetry): N/A — no mutation surface.
- Meta-test inventory: no-inline-email-normalization guard scans `lib/drive` + `lib/sync` only, NOT `lib/parser` (contacts.ts already uses `.toLowerCase().trim()` unexempted at line 135) — no new registry row. No other structural meta-test applies.

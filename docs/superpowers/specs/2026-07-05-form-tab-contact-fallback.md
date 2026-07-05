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

2. In the scan loop (`contacts.ts:80-124`), add a third branch AFTER the venue/in_house_av detection. When `col0` matches `ONSITE_AV_LABEL_RE`, the row is a **FORM-fallback AV candidate**: set `labelMatched = true`, apply the same `rawValue` extraction (`cells[1]`), then a **stricter** signal guard than the INFO path — `EMAIL_RE.test(rawValue) || PHONE_RE.test(rawValue)` (require an email or phone, NOT the name-only branch of `hasContactSignal`) — and `parseContactCell(rawValue, "in_house_av")`, pushing the parsed rows into a **separate** `formAvContacts: ContactRow[]` array instead of `contacts`. (Do NOT let an `ONSITE_AV_LABEL_RE` row fall through to the `venue`/`in_house_av` push.)

   **Rationale for the stricter guard (Codex R1 MEDIUM):** the INFO `hasContactSignal` accepts any two capitalized words, so a placeholder like `Onsite AV Contact | Not Applicable` or `To Be Determined` would emit a bogus `in_house_av` row (name = "Not Applicable"). A real onsite-AV contact always carries an email or phone (the live value is `chris.mercado@encoreglobal.com`); requiring email-or-phone for the FORM fallback rejects every prose placeholder while keeping every real contact.

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

4. The D1 empty-section guard (`contacts.ts:145`) fires on `labelMatched && deduped.length === 0` — **unchanged**. Note (Codex R1 LOW, corrected): D1 is a whole-section guard, not a per-label one — it fires only when NO contact of any kind survived across every matched label. So an empty/placeholder FORM AV row that yields nothing does NOT independently "fail loud" if a venue contact is present; it simply contributes no AV contact. That is the existing contract for every label (e.g. an empty INFO `In House AV` row today), and is acceptable: the fallback's job is to surface real FORM data, and a genuinely empty FORM AV cell means there is nothing to surface. `ONSITE_AV_LABEL_RE` still participates in `labelMatched` so a show with ONLY an AV label and no contact anywhere still fails loud.

**Multi-person:** `parseContactCell` already splits a multi-email FORM cell into one `ContactRow` per person, so a FORM `Onsite AV Contact` cell listing two AV techs yields two rows (matches the INFO multi-person behavior).

### 3.B Client email/phone fallback — `lib/parser/blocks/client.ts`

Add a FORM-fallback harvest for the client contact's email + phone, applied fill-only-if-empty to the MAIN contact only.

1. New constants + helper (module scope):

   ```ts
   // FORM-tab fallback labels for the client-side contact (the Google-Form submitter — the
   // client's logistics director). Exact-label match, BOUNDED to the single FORM intake block.
   const FORM_CLIENT_EMAIL_LABEL = "email address";
   const FORM_CLIENT_PHONE_LABEL = "phone number";
   // The FORM intake block always opens with one of these header rows.
   const FORM_BLOCK_ANCHORS = new Set(["timestamp", "your name"]);
   // Full email shape (mirrors contacts.ts EMAIL_RE) — `canonicalize` only trims/lowercases and
   // does NOT validate, so the label guard must prove the value is actually an email.
   const CLIENT_EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

   // Scans the RAW markdown (line-by-line, like parseContacts) so block boundaries — blank/
   // non-table lines — are visible. Harvests email/phone ONLY from the FIRST contiguous table
   // run that contains a FORM anchor, then stops (`formBlockDone`). This bounds the harvest to
   // the one FORM intake block: a stray "Email Address"/"Phone Number" row in any LATER block
   // (after the FORM run ends) is never reached.
   function harvestFormClientContact(markdown: string): { email: string | null; phone: string | null } {
     let email: string | null = null;
     let phone: string | null = null;
     let inFormBlock = false;
     let formBlockDone = false;
     for (const line of markdown.split("\n")) {
       const trimmed = line.trim();
       if (!trimmed.startsWith("|")) {
         if (inFormBlock) {
           inFormBlock = false;
           formBlockDone = true; // the FORM run ended — do not re-enter on a later anchor
         }
         continue;
       }
       if (formBlockDone) continue;
       const cells = splitRow(trimmed);
       const label = clean(cells[0] ?? "").toLowerCase();
       if (FORM_BLOCK_ANCHORS.has(label)) {
         inFormBlock = true;
         continue;
       }
       if (!inFormBlock) continue;
       const val = clean(cells[1] ?? "");
       if (!val) continue;
       if (label === FORM_CLIENT_EMAIL_LABEL && email === null && CLIENT_EMAIL_RE.test(val)) {
         email = canonicalize(val);
       } else if (label === FORM_CLIENT_PHONE_LABEL && phone === null && /\d/.test(val)) {
         phone = presence(val);
       }
     }
     return { email, phone };
   }
   ```

   Requires adding `splitRow` to the `./_helpers` import in `client.ts` (it already imports `clean, presence, parseTableRows`).

   **Bounding rationale (Codex R1 #1 / R2 HIGH):** across the entire fixture corpus the exact labels `Email Address` / `Phone Number` appear only inside the FORM intake block (9 fixtures × once each, always immediately after `Timestamp` / `Your Name`, in one contiguous table run). Scanning raw markdown lines lets the harvest see the run boundary (a blank/non-table line) and STOP after the first FORM block, so no `Email Address` row in any later block — before or after any anchor — can fill the client contact. `parseTableRows` flattens every table row across the whole markdown into one array with no block boundaries, which is why the harvest scans `markdown` directly rather than the pre-parsed `rows`.
   **Email-validation rationale (Codex R2 MEDIUM):** the guard is the full `CLIENT_EMAIL_RE`, not a bare `/@/`, so a prose value containing `@` (e.g. `TBD @ client`) is rejected — matching the strength of the AV path's `EMAIL_RE`.

2. In `parseClient` (`client.ts:374`), AFTER the version-branch produces `result` (`{ client_label, client_contact }`), apply the fallback only when a main contact exists and is missing email or phone:

   ```ts
   const result = version === "v4" ? parseClientV4(rows, agg) : parseClientV2orV1(rows, agg);
   const contact = result.client_contact;
   if (contact && (contact.email === null || contact.phone === null)) {
     const form = harvestFormClientContact(markdown);
     if (contact.email === null && form.email !== null) contact.email = form.email;
     if (contact.phone === null && form.phone !== null) contact.phone = form.phone;
   }
   return result;
   ```

   `parseClient` already receives `markdown` (param) and computes `rows = parseTableRows(markdown)` at `client.ts:380`; the version branch keeps using `rows`, while the fallback scans `markdown` directly (block boundaries are only visible in the raw text — see the bounding rationale above).

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
| INFO cell empty, FORM value is prose placeholder ("Not Applicable"/"To Be Determined"/"FALSE"/"N/A"/"TBD @ client"/blank) | email-or-phone guard rejects (no `EMAIL_RE`, no `PHONE_RE`) | `CLIENT_EMAIL_RE` (email) / `/\d/` (phone) guard rejects |
| INFO email present, INFO phone empty (partial) | N/A | phone filled from FORM, email untouched |
| INFO phone present, INFO email empty (partial) | N/A | email filled from FORM, phone untouched |
| FORM `Email Address`/`Phone Number` outside the first FORM run (no anchor, OR in a later table run after the FORM run ended) | N/A | not harvested (bounded to the first FORM block: `inFormBlock` + `formBlockDone`) |
| FORM cell multi-person | multiple `in_house_av` rows | N/A (single email/phone) |
| `client_contact === null` | N/A | no-op |
| `Onsite AV Contact Info` row (`| ... | FALSE |`) | not matched (regex requires exact "Onsite AV Contact") + email-or-phone guard rejects | N/A |

---

## 5. Testing (anti-tautology; failure modes named)

New test file `tests/parser/formTabContactFallback.test.ts`. Test inputs are **inline markdown** built to the live shape (INFO contact cells blank, FORM rows populated) — NOT a mutation of `fixtures/shows/raw/**`. Expected values are derived from the FORM cell contents in each test's own input.

1. **AV fallback when INFO empty** — live-shape markdown (INFO `In House AV` blank, FORM `Onsite AV Contact | chris.mercado@encoreglobal.com`) → `parseContacts` returns a contact `{ kind:"in_house_av", email:"chris.mercado@encoreglobal.com" }`. *Catches: FORM AV label unrecognized (the actual bug).* Expected email is read from the fixture input, not hardcoded independently.
2. **AV INFO wins (fill-only-if-empty)** — INFO `In House AV | Chris Mercado chris.mercado@encoreglobal.com` populated AND FORM `Onsite AV Contact | different.person@x.com` → result contains the INFO contact and does NOT contain `different.person@x.com`. *Catches: FORM fallback wrongly appending a second AV contact when INFO already has one.*
3. **Client email/phone fallback when INFO empty** — INFO CLIENT block with `Contact | Ashley Morgan`, empty `Contact Email`/`Contact Cell`; FORM `Email Address | ashley.morgan@institutionalinvestor.com`, `Phone Number | 8452701900` → `client_contact` = `{ name:"Ashley Morgan", email:"ashley.morgan@institutionalinvestor.com", phone:"8452701900" }`. *Catches: client email/phone dropped (the actual bug).* Email asserted canonicalized.
4. **Client INFO wins** — INFO `Contact Email | real@info.com` populated AND FORM `Email Address | other@form.com` → `client_contact.email === "real@info.com"`. *Catches: FORM override clobbering curated INFO email.*
5. **Client fallback no-op when no CLIENT block** — markdown with a FORM `Email Address` row but no INFO CLIENT block → `client_contact === null` (unchanged). *Catches: synthesizing a phantom client from FORM PII.*
6. **Placeholder rejection** — FORM `Onsite AV Contact | Not Applicable` (prose, no email/phone) and, inside a FORM block, `Email Address | TBD @ client` (prose containing `@` but not a valid email) with empty INFO → no AV contact, client email stays null. *Catches: prose placeholders leaking as contacts past the name-only signal AND past a bare `/@/` check (Codex R1 MEDIUM + R2 MEDIUM — must use a two-word prose AV placeholder and a prose-with-`@` email value, not just `FALSE`/`N/A`).*
7. **Client fallback bounding (false-positive, both sides)** — two cases with an INFO CLIENT block (empty email/phone): (a) a stray `| Email Address | stray@x.com |` with NO `Timestamp`/`Your Name` anchor anywhere → stays null; (b) a real FORM block (Timestamp/Your Name + empty `Email Address` cell) followed later, in a SEPARATE table run (after a blank line), by a stray `| Email Address | stray@x.com |` → stays null (the harvest stopped when the FORM run ended). *Catches: global scan (case a) AND the post-anchor unbounded scan (case b — Codex R2 HIGH).*
8. **Client partial fill** — two cases: (a) INFO `Contact Email | keep@info.com` present but `Contact Cell` empty, FORM `Phone Number | 8452701900` present → email stays `keep@info.com`, phone filled `8452701900`; (b) INFO phone present, email empty, FORM email present → phone stays INFO value, email filled from FORM. *Catches: fill-only-if-empty applied per-field, not all-or-nothing (Codex R1 MEDIUM).*
9. **Regression — populated fixture unchanged** — run `parseContacts`/`parseClient` on the existing `fixtures/shows/raw/2025-10-fixed-income-trading-summit.md` (INFO populated) and assert the result is byte-identical to today's output (Chris Mercado + Danilo from INFO AV; Ashley email `ashley.morgan@institutionalinvestor.com` + phone `845-270-1900` from INFO; venue Kurt Ashcraft). *Catches: the fallback altering shows whose INFO is populated.*
10. **Venue not regressed** — live-shape markdown → venue contact `kurt.ashcraft@hyatt.com` still surfaced (via existing `VENUE_LABEL_RE`). *Catches: the AV change accidentally breaking the already-working venue path.*

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

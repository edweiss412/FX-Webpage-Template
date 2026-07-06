# FORM-tab contact fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When the INFO-tab contact cells are empty, surface the AV contact and the client email/phone from the FORM tab (fill-only-if-INFO-empty), so bug #316 item 4's missing contacts appear.

**Architecture:** Two internal changes, one per existing parser function. `lib/parser/blocks/contacts.ts` gains a FORM `Onsite AV Contact` fallback merged only when INFO produced no `in_house_av`. `lib/parser/blocks/client.ts` gains a FORM-block-bounded `Email Address`/`Phone Number` harvest that fills an INFO client contact's null email/phone. No change to `lib/parser/index.ts` (both functions already receive the full markdown; call sites `index.ts:564`, `index.ts:577`). No UI, DB, migration, advisory-lock, or new §12.4 code.

**Tech Stack:** TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-07-05-form-tab-contact-fallback.md`.

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal implementation → passing test → commit.
- **Email canonicalization** (invariant 3): every email routes through `canonicalize` (`@/lib/email/canonicalize`).
- **fill-only-if-INFO-empty** (spec §2): a FORM contact is used only when the INFO-sourced contact produced nothing for that field/kind. INFO is authoritative.
- **Do not edit `fixtures/shows/raw/**`** (spec §1.2 / repo policy). Test inputs are inline markdown.
- **No new §12.4 code / warning** (spec §2.1). Silent-correct fallback.
- Commit per task, conventional-commits: `test(parser):` / `feat(parser):`.

## Meta-test inventory

- **CREATES/EXTENDS:** none. The no-inline-email-normalization guard (`tests/admin/no-inline-email-normalization.test.ts`) scans `lib/drive` + `lib/sync` only, NOT `lib/parser` (`contacts.ts:135` already uses `.toLowerCase().trim()` unexempted). All new emails route through `canonicalize`. No advisory-lock (`pg_advisory*`) surface. No other structural meta-test applies. Declared per the writing-plans meta-test-inventory rule.

## File Structure

- Modify: `lib/parser/blocks/contacts.ts` (Task 1) — add `ONSITE_AV_LABEL_RE`, `formAvContacts`, fill-only-if-empty merge.
- Modify: `lib/parser/blocks/client.ts` (Task 2) — add `harvestFormClientContact`, restructure `parseClient` to post-process the version result.
- Create: `tests/parser/formTabContactFallback.test.ts` (Tasks 1-2) — all behavioral tests.
- Create: `tests/parser/formTabContactFallback.regression.test.ts` (Task 3) — populated-fixture regression.

---

## Task 1: AV contact FORM fallback (`contacts.ts`)

**Files:**
- Modify: `lib/parser/blocks/contacts.ts`
- Test: `tests/parser/formTabContactFallback.test.ts`

**Interfaces:**
- Consumes: `parseContacts(markdown: string, version: "v1"|"v2"|"v4", agg?: ParseAggregator): ContactRow[]` (unchanged signature).
- Produces: same. `ContactRow = { kind:"venue"|"in_house_av"; name:string|null; email:string|null; phone:string|null; notes:string|null }`.

Shared inline-markdown builder used across tests (put at the top of the test file):

```ts
import { describe, it, expect } from "vitest";
import { parseContacts } from "@/lib/parser/blocks/contacts";
import { parseClient } from "@/lib/parser/blocks/client";

// Minimal live-shape markdown: INFO CLIENT block (name only, empty email/phone), empty INFO
// In House AV / Hotel Contact Info, then a FORM intake block. Callers override the FORM rows.
function md(opts: {
  infoAv?: string; // value cell for INFO "In House AV" (default empty)
  infoHotel?: string; // value cell for INFO "Hotel Contact Info" (default empty)
  infoEmail?: string; // value for INFO "Contact Email" (default empty)
  infoCell?: string; // value for INFO "Contact Cell" (default empty)
  clientBlock?: boolean; // include the INFO CLIENT block (default true)
  formBlock?: boolean; // include the FORM intake block (default true)
  formEmail?: string; // FORM "Email Address" value
  formPhone?: string; // FORM "Phone Number" value
  formAv?: string; // FORM "Onsite AV Contact" value
  formHotel?: string; // FORM "Hotel Contact Information" value (inside the FORM block)
  trailingStrayEmail?: string; // a stray "| Email Address | x |" AFTER the FORM block (separate run)
}): string {
  const {
    infoAv = "", infoHotel = "", infoEmail = "", infoCell = "",
    clientBlock = true, formBlock = true,
    formEmail = "", formPhone = "", formAv = "", formHotel, trailingStrayEmail,
  } = opts;
  const lines: string[] = [];
  if (clientBlock) {
    lines.push(
      "| CLIENT | Institutional Investor | | | |",
      "| :--: | :--: | :--: | :--: | :--: |",
      "| | MAIN | SECONDARY | | |",
      "| Contact | Ashley Morgan | | | |",
      `| Contact Cell | ${infoCell} | | | |`,
      "| Contact Office | | | | |",
      `| Contact Email | ${infoEmail} | | | |`,
      "",
    );
  }
  lines.push(
    `| Hotel Contact Info | ${infoHotel} | | |`,
    `| In House AV | ${infoAv} | | |`,
    "",
  );
  if (formBlock) {
    lines.push(
      "| Timestamp | 9/23/2025 16:13:24 |",
      "| :--: | :--: |",
      "| Your Name | Ashley Morgan |",
      `| Email Address | ${formEmail} |`,
      `| Phone Number | ${formPhone} |`,
      ...(formHotel !== undefined ? [`| Hotel Contact Information | ${formHotel} |`] : []),
      `| Onsite AV Contact | ${formAv} |`,
      "",
    );
  }
  if (trailingStrayEmail !== undefined) {
    lines.push("| Some Other Section | header |", `| Email Address | ${trailingStrayEmail} |`, "");
  }
  return lines.join("\n");
}
```

- [ ] **Step 1: Write failing tests (AV fallback + INFO-wins + placeholder + venue regression)**

Anti-tautology convention (Codex plan-R1 MEDIUM): every flow-through value is bound to a `const` that is passed into the builder AND referenced in the assertion, so a parser that drops or mutates the value fails the assertion (two independent literals could silently drift). Canonicalized/extracted expectations are computed from the input via `canonicalize`, never re-typed.

```ts
import { canonicalize } from "@/lib/email/canonicalize";

describe("FORM-tab AV contact fallback", () => {
  it("surfaces the FORM Onsite AV Contact when INFO In House AV is empty", () => {
    const AV = "chris.mercado@encoreglobal.com";
    const contacts = parseContacts(md({ formAv: AV }), "v4");
    const av = contacts.filter((c) => c.kind === "in_house_av");
    expect(av).toHaveLength(1);
    expect(av[0]!.email).toBe(canonicalize(AV)); // expected derived from the input, canonicalized
  });

  it("keeps INFO AV and discards the FORM fallback when INFO In House AV is populated", () => {
    const INFO_AV = "chris.mercado@encoreglobal.com";
    const FORM_AV = "different.person@x.com";
    const contacts = parseContacts(
      md({ infoAv: `Chris Mercado ${INFO_AV}`, formAv: FORM_AV }),
      "v4",
    );
    const emails = contacts.filter((c) => c.kind === "in_house_av").map((c) => c.email);
    expect(emails).toContain(canonicalize(INFO_AV));
    expect(emails).not.toContain(canonicalize(FORM_AV));
  });

  it("rejects a prose placeholder in the FORM Onsite AV Contact cell", () => {
    const contacts = parseContacts(md({ formAv: "Not Applicable" }), "v4");
    expect(contacts.filter((c) => c.kind === "in_house_av")).toHaveLength(0);
  });

  it("does not regress the venue contact from the FORM Hotel Contact Information label", () => {
    // VENUE_LABEL_RE already matches "Hotel Contact Information" INSIDE the FORM block; verify the
    // AV change is inert on the venue path (Codex plan-R1 LOW: venue label lives in the FORM block).
    const VENUE = "kurt.ashcraft@hyatt.com";
    const AV = "chris.mercado@encoreglobal.com";
    const contacts = parseContacts(md({ formAv: AV, formHotel: VENUE }), "v4");
    expect(contacts.some((c) => c.kind === "venue" && c.email === canonicalize(VENUE))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd <worktree> && pnpm vitest run tests/parser/formTabContactFallback.test.ts -t "AV contact fallback"`
Expected: FAIL (AV fallback returns 0 in_house_av; placeholder test may pass vacuously but the first test fails).

- [ ] **Step 3: Implement in `contacts.ts`**

Add the label regex next to the existing ones (after `contacts.ts:34`):

```ts
// FORM-tab fallback label for the onsite AV contact. Matches the exact Google-Form question
// label "Onsite AV Contact" — deliberately NOT "Onsite AV Contact Info" (a separate
// checklist-boolean row carrying TRUE/FALSE).
const ONSITE_AV_LABEL_RE = /^\s*onsite\s+av\s+contact\s*$/i;
```

In `parseContacts`, declare `const formAvContacts: ContactRow[] = [];` alongside `contacts`. In the scan loop, after the existing venue/in_house_av `kind` detection and BEFORE the `if (!kind) continue;`, add a dedicated branch for the FORM AV label (so it does not fall through to the venue/in_house_av push):

```ts
if (ONSITE_AV_LABEL_RE.test(col0)) {
  labelMatched = true;
  const rawValue = clean(cells[1] ?? "");
  // Stricter than hasContactSignal: a real onsite-AV contact carries an email or phone; this
  // rejects prose placeholders ("Not Applicable"/"To Be Determined") the name-only path accepts.
  if (rawValue && (EMAIL_RE.test(rawValue) || PHONE_RE.test(rawValue))) {
    formAvContacts.push(...parseContactCell(rawValue, "in_house_av"));
  }
  continue;
}
```

After the email-dedup produces `deduped` (`contacts.ts:131-140`), before the D1 guard (`contacts.ts:145`), add the fill-only-if-empty merge:

```ts
// Fill-only-if-INFO-empty: use the FORM "Onsite AV Contact" fallback ONLY when the INFO
// "In House AV" label produced no in_house_av contact; otherwise discard it entirely so INFO
// is authoritative and no duplicate/second AV contact appears.
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

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/formTabContactFallback.test.ts -t "AV contact fallback"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/contacts.ts tests/parser/formTabContactFallback.test.ts
git commit --no-verify -m "feat(parser): FORM Onsite AV Contact fallback when INFO In House AV empty"
```

---

## Task 2: Client email/phone FORM fallback (`client.ts`)

**Files:**
- Modify: `lib/parser/blocks/client.ts`
- Test: `tests/parser/formTabContactFallback.test.ts` (same file, new `describe`)

**Interfaces:**
- Consumes: `parseClient(markdown, version, agg): { client_label; client_contact: ClientContact|null }`.
- `ClientContact = { name; email:string|null; phone:string|null; officePhone?; secondary? }`.

- [ ] **Step 1: Write failing tests**

Same anti-tautology convention: bind flow-through values to `const`s; derive canonicalized expectations via `canonicalize`.

```ts
describe("FORM-tab client email/phone fallback", () => {
  it("fills client email + phone from the FORM block when INFO cells are empty", () => {
    const EMAIL = "ashley.morgan@institutionalinvestor.com";
    const PHONE = "8452701900";
    const { client_contact } = parseClient(md({ formEmail: EMAIL, formPhone: PHONE }), "v4");
    expect(client_contact).toMatchObject({
      name: "Ashley Morgan", // from the builder's INFO Contact row (constant across the suite)
      email: canonicalize(EMAIL),
      phone: PHONE,
    });
  });

  it("keeps the INFO client email when populated (INFO wins)", () => {
    const INFO = "real@info.com";
    const FORM = "other@form.com";
    const { client_contact } = parseClient(md({ infoEmail: INFO, formEmail: FORM }), "v4");
    expect(client_contact!.email).toBe(canonicalize(INFO));
    expect(client_contact!.email).not.toBe(canonicalize(FORM));
  });

  it("is a no-op when there is no INFO CLIENT block", () => {
    const { client_contact } = parseClient(
      md({ clientBlock: false, formEmail: "ashley.morgan@institutionalinvestor.com" }),
      "v4",
    );
    expect(client_contact).toBeNull();
  });

  it("does not fill from a stray Email Address with no FORM anchor (case a)", () => {
    const stray = md({ formBlock: false }) + "\n| Email Address | stray@x.com |\n";
    const { client_contact } = parseClient(stray, "v4");
    expect(client_contact!.email).toBeNull();
  });

  it("does not fill from a stray Email Address after the FORM run ends (case b)", () => {
    // FORM block present with EMPTY Email Address; a stray in a later separate run must not fill.
    const { client_contact } = parseClient(
      md({ formEmail: "", trailingStrayEmail: "stray@x.com" }),
      "v4",
    );
    expect(client_contact!.email).toBeNull();
  });

  it("extracts only the email substring from a wrapped FORM value", () => {
    const EMAIL = "ashley.morgan@institutionalinvestor.com";
    const { client_contact } = parseClient(md({ formEmail: `Ashley Morgan <${EMAIL}>` }), "v4");
    expect(client_contact!.email).toBe(canonicalize(EMAIL)); // substring extracted from the wrapper
  });

  it("fills only the empty field on partial INFO data", () => {
    // INFO email present, INFO phone empty → phone filled, email kept.
    const INFO_EMAIL = "keep@info.com";
    const FORM_PHONE = "8452701900";
    const a = parseClient(md({ infoEmail: INFO_EMAIL, formPhone: FORM_PHONE }), "v4");
    expect(a.client_contact!.email).toBe(canonicalize(INFO_EMAIL));
    expect(a.client_contact!.phone).toBe(FORM_PHONE);
    // INFO phone present, INFO email empty → email filled, phone kept.
    const INFO_PHONE = "111-222-3333";
    const FORM_EMAIL = "fill@form.com";
    const b = parseClient(md({ infoCell: INFO_PHONE, formEmail: FORM_EMAIL }), "v4");
    expect(b.client_contact!.phone).toBe(INFO_PHONE);
    expect(b.client_contact!.email).toBe(canonicalize(FORM_EMAIL));
  });

  it("rejects a prose email placeholder (TBD @ client)", () => {
    const { client_contact } = parseClient(md({ formEmail: "TBD @ client" }), "v4");
    expect(client_contact!.email).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/parser/formTabContactFallback.test.ts -t "client email/phone fallback"`
Expected: FAIL (email/phone null; fill tests fail).

- [ ] **Step 3: Implement in `client.ts`**

Add `splitRow` to the `_helpers` import:

```ts
import { clean, presence, parseTableRows, splitRow } from "./_helpers";
```

Add module-scope constants + helper (above `parseClient`):

```ts
const FORM_CLIENT_EMAIL_LABEL = "email address";
const FORM_CLIENT_PHONE_LABEL = "phone number";
const FORM_BLOCK_ANCHORS = new Set(["timestamp", "your name"]);
// Full email shape (mirrors contacts.ts EMAIL_RE); canonicalize does NOT validate.
const CLIENT_EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

// Scans raw markdown line-by-line so block boundaries (blank/non-table lines) are visible.
// Harvests email/phone ONLY from the FIRST contiguous table run containing a FORM anchor, then
// stops — bounding the harvest to the single FORM intake block.
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
        formBlockDone = true;
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
    if (label === FORM_CLIENT_EMAIL_LABEL && email === null) {
      const m = CLIENT_EMAIL_RE.exec(val);
      if (m) email = canonicalize(m[0]);
    } else if (label === FORM_CLIENT_PHONE_LABEL && phone === null && /\d/.test(val)) {
      phone = presence(val);
    }
  }
  return { email, phone };
}
```

Restructure the public `parseClient` body (`client.ts:374-387`) to post-process the version result:

```ts
export function parseClient(
  markdown: string,
  version: "v1" | "v2" | "v4",
  agg?: ParseAggregator,
): Pick<ShowRow, "client_label" | "client_contact"> {
  const rows = parseTableRows(markdown);
  const result = version === "v4" ? parseClientV4(rows, agg) : parseClientV2orV1(rows, agg);
  // FORM-tab fallback (fill-only-if-INFO-empty): fill a null email/phone on the MAIN client
  // contact from the FORM intake block. No-op when there is no client_contact, or when both
  // fields are already present.
  const contact = result.client_contact;
  if (contact && (contact.email === null || contact.phone === null)) {
    const form = harvestFormClientContact(markdown);
    if (contact.email === null && form.email !== null) contact.email = form.email;
    if (contact.phone === null && form.phone !== null) contact.phone = form.phone;
  }
  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/formTabContactFallback.test.ts -t "client email/phone fallback"`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/client.ts tests/parser/formTabContactFallback.test.ts
git commit --no-verify -m "feat(parser): FORM client email/phone fallback when INFO client cells empty"
```

---

## Task 3: Regression — populated fixture unchanged

**Files:**
- Test: `tests/parser/formTabContactFallback.regression.test.ts`

**Interfaces:** consumes `parseContacts` / `parseClient` and the committed fixture.

- [ ] **Step 1: Capture the pre-change baseline, then write the regression test**

First, on the CURRENT branch tip (before any Task 1/2 code change is applied), capture the exact parser output so the baseline is the real pre-change snapshot, not a hand-typed guess:

Run: `pnpm tsx -e 'import{readFileSync}from"node:fs";import{parseContacts}from"@/lib/parser/blocks/contacts";import{parseClient}from"@/lib/parser/blocks/client";const R=readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md","utf8");console.log(JSON.stringify({contacts:parseContacts(R,"v4"),client:parseClient(R,"v4")},null,2))'`

The known baseline (captured from the committed fixture on `origin/main`) is:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseContacts } from "@/lib/parser/blocks/contacts";
import { parseClient } from "@/lib/parser/blocks/client";

// The committed fixture has INFO POPULATED, so the FORM fallback must be INERT (INFO wins). This
// is a full-output snapshot regression: any change to contacts[] or client_contact from today's
// baseline fails. The baseline below was captured by running the parser on the committed fixture
// BEFORE this change (Step 1 command); if the capture differs, use the captured value verbatim.
const RAW = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");

const BASELINE_CONTACTS = [
  {
    kind: "venue",
    name: "Kurt Ashcraft",
    email: "kurt.ashcraft@hyatt.com",
    phone: "312 239 4217",
    notes: "Kurt Ashcraft Senior Event Planning Manager 312 239 4217 kurt.ashcraft@hyatt.com",
  },
  {
    kind: "in_house_av",
    name: "Chris Mercado",
    email: "chris.mercado@encoreglobal.com",
    phone: null,
    notes: "Chris Mercado chris.mercado@encoreglobal.com",
  },
  {
    kind: "in_house_av",
    name: "Danilo Scekic",
    email: "danilo.scekic@encoreglobal.com",
    phone: null,
    notes: "Danilo Scekic danilo.scekic@encoreglobal.com",
  },
];
const BASELINE_CLIENT = {
  client_label: "Institutional Investor",
  client_contact: {
    name: "Ashley Morgan",
    email: "ashley.morgan@institutionalinvestor.com",
    phone: "845-270-1900",
  },
};

describe("FORM fallback is byte-identical-inert on an INFO-populated show", () => {
  it("produces identical parseContacts output (full array)", () => {
    expect(parseContacts(RAW, "v4")).toEqual(BASELINE_CONTACTS);
  });
  it("produces identical parseClient output (full object)", () => {
    expect(parseClient(RAW, "v4")).toEqual(BASELINE_CLIENT);
  });
});
```

- [ ] **Step 2: Run to verify pass (regression guard)**

Run: `pnpm vitest run tests/parser/formTabContactFallback.regression.test.ts`
Expected: PASS (2 tests, full-output equality). If either fails, the fallback wrongly altered a populated show — STOP and fix Task 1/2. (Run this test BOTH before Task 1/2 to confirm the baseline matches, and after, to confirm inertness.)

- [ ] **Step 3: Commit**

```bash
git add tests/parser/formTabContactFallback.regression.test.ts
git commit --no-verify -m "test(parser): regression — FORM fallback inert on INFO-populated show"
```

---

## Task 4: Full-suite + typecheck verification

- [ ] **Step 1:** `pnpm vitest run tests/parser/` — all parser tests green.
- [ ] **Step 2:** `pnpm test` (full suite) — triage any failures as environmental (`.db.test.ts` live-DB contention) vs real; the diff touches only `lib/parser/**` + `tests/parser/**`.
- [ ] **Step 3:** `pnpm typecheck` (or `pnpm tsc --noEmit`) — no type errors (vitest strips types; `next build`/quality-tsc would catch them).
- [ ] **Step 4:** `pnpm format:check` and `pnpm lint` on the changed files (CI `quality` runs eslint + prettier; `--no-verify` bypasses the local hook).

---

## Self-Review checklist

- **Spec coverage:** Task 1 → spec §3.A + tests 1,2,6-AV,10. Task 2 → spec §3.B + tests 3,4,5,6-client,7,7b,8. Task 3 → test 9. All spec tests mapped.
- **Anti-tautology:** expected values derived from each test's own inline input; regression values derived from the fixture's INFO cells; each test names its failure mode.
- **Type consistency:** `harvestFormClientContact(markdown: string)`, `formAvContacts: ContactRow[]`, `ONSITE_AV_LABEL_RE`, `CLIENT_EMAIL_RE` consistent across tasks. `parseClient`/`parseContacts` signatures unchanged.
- **No placeholders:** every step shows the actual code.

## Ordering (unambiguous)

Task 1 → Task 2 → Task 3 → Task 4. Then whole-diff Codex adversarial review → push → CI green → `gh pr merge --merge` → fast-forward local main. Invariant 8 (impeccable dual-gate) is N/A — no UI file is touched (verified: only `lib/parser/**` + `tests/parser/**`).

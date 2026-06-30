# Close the Step-3 review-modal blind spots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add operator-only review sections to the Step-3 modal so the publish gate shows everything parsed: Venue (address/dock/maps), Transport, Contacts (client + secondary + venue/in-house-AV), Ops (COI/Proposal/PO#/Invoice), plus crew phone and hotel address.

**Architecture:** Modal-only, render-only. Four new `BreakdownSection`s + two extended ones in `components/admin/wizard/Step3SheetCard.tsx`, all reading `ParseResult` (`pr = row.parseResult`), all **as-parsed** via the existing `hasContent` predicate (sentinels shown). Two small shared helpers (`contentRows`, `FieldRowList`) DRY the field-group sections.

**Tech Stack:** Next.js Server Components, TypeScript, Vitest + Testing Library. Spec: `docs/superpowers/specs/2026-06-30-review-modal-completeness-design.md` (Codex-APPROVED round 3).

## Global Constraints

- Edits ONLY in `components/admin/wizard/Step3SheetCard.tsx` + `tests/components/admin/wizard/Step3Review.test.tsx` (+ `tests/components/step3SheetCard.test.tsx` if a single-card test fits). No `lib/`, parser, DB, projection, crew-page, or DESIGN.md change.
- **As-parsed contract:** primary values via `hasContent(v)` (`Step3SheetCard.tsx:97-99`; `typeof === "string" && trim().length > 0`) — sentinels (`TBD`/`N/A`) render verbatim; non-strings + whitespace are treated as absent. Do NOT use `shouldHideGenericOptional` (that's the crew surface).
- Arrays from untyped JSONB guarded with the existing `arr<T>()` helper (`:106`). Optional nested objects accessed null-safe (`?.`).
- New `BreakdownSection`s carry NO `SourceLink` (the existing 6 don't) → `sourceLinkCoverage` + `CARD_REGION_MAP` untouched.
- TDD per task; commit per task (`feat(admin):`). `--no-verify`. Run `pnpm exec prettier --check .` (ALL files) before any push (per-file checks miss test files).
- Worktree: `/Users/ericweiss/fxav-review-modal-completeness` (branch `feat/review-modal-completeness`).

---

## File Structure

- **Modify** `components/admin/wizard/Step3SheetCard.tsx`:
  - Add type imports: `ShowRow`, `TransportationRow`, `ContactRow`, `ClientContact` (into the existing `import type {…}` block, `:39-49`).
  - Add shared helpers `contentRows()` + `FieldRowList` (near `hasContent`, `:97-99`).
  - Add 4 components: `VenueBreakdown`, `OpsBreakdown`, `TransportBreakdown`, `ContactsBreakdown`.
  - Extend `CrewBreakdown` (+phone, `:183-207`) + `HotelsBreakdown` (+address, `:529-560`).
  - Wire all into the breakdown grid (`:1466-1476`).
- **Modify** `tests/components/admin/wizard/Step3Review.test.tsx` — one test per new section + the two extensions.

---

## Task 1: Shared helpers + VenueBreakdown (NEW)

**Files:** Modify `Step3SheetCard.tsx`, `tests/components/admin/wizard/Step3Review.test.tsx`.

**Interfaces — Produces:** `contentRows(pairs)`, `FieldRowList`, `VenueBreakdown`.

- [ ] **Step 1: Failing test** — in `Step3Review.test.tsx`, inside the gear-review `describe` (mirror the existing GEAR_PR/GEAR_ROW pattern at :516-557). Add:

```ts
  test("venue breakdown shows address/loading dock/maps as-parsed (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      show: {
        ...GEAR_PR.show,
        venue: {
          name: "Four Seasons",
          address: "120 E Delaware Pl",
          city: "TBD", // sentinel → shown as-parsed
          loadingDock: "64 East Walton St",
          googleLink: "https://maps.google.com/x",
        },
      },
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-venue", parseResult: pr };
    const { getByTestId } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />);
    fireEvent.click(getByTestId("wizard-step3-card-drive-venue-more"));
    const t = getByTestId("wizard-step3-card-drive-venue-breakdown-venue").textContent ?? "";
    expect(t).toContain("Address:");
    expect(t).toContain("120 E Delaware Pl");
    expect(t).toContain("Loading dock:");
    expect(t).toContain("Maps link:");
    expect(t).toContain("https://maps.google.com/x"); // raw text, not a live link
    expect(t).toContain("City:");
    expect(t).toContain("TBD"); // sentinel as-parsed
  });
```

- [ ] **Step 2: Run, verify fail** — `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx -t "venue breakdown"` → FAIL (no `-breakdown-venue`).

- [ ] **Step 3: Implement** — `Step3SheetCard.tsx`:

(a) Extend the type-import block (`:39-49`) to add `ShowRow` (keep alphabetical-ish; the block is unsorted, just add the line):
```ts
  ShowRow,
```
(b) Add shared helpers after `hasContent` (`:99`):
```ts
/** Build {label,value} rows from [label, rawValue] pairs, keeping only as-parsed
 *  content (hasContent — non-null, non-whitespace string). Used by the operator
 *  review-modal field-group sections. */
function contentRows(
  pairs: ReadonlyArray<readonly [string, unknown]>,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [label, val] of pairs) if (hasContent(val)) out.push({ label, value: val });
  return out;
}

/** Vertical label:value list shared by the review-modal field-group sections. */
function FieldRowList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((r) => (
        <li key={r.label} className="wrap-break-word text-sm text-text">
          <span className="font-medium text-text-strong">{r.label}:</span> {r.value}
        </li>
      ))}
    </ul>
  );
}
```
(c) Add `VenueBreakdown` (near the other Breakdown components):
```tsx
function VenueBreakdown({ dfid, venue }: { dfid: string; venue: ShowRow["venue"] }) {
  const rows = venue
    ? contentRows([
        ["Venue", venue.name],
        ["Address", venue.address],
        ["City", venue.city],
        ["Loading dock", venue.loadingDock],
        ["Maps link", venue.googleLink],
      ])
    : [];
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-venue`}
      label="Venue"
      count={rows.length}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">No venue details parsed.</p>
      ) : (
        <FieldRowList rows={rows} />
      )}
    </BreakdownSection>
  );
}
```
(d) Wire into the grid (`:1466-1476`) — after `<RoomsBreakdown … />`:
```tsx
            <VenueBreakdown dfid={dfid} venue={pr.show.venue} />
```

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx -t "venue breakdown"` → PASS. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/Step3SheetCard.tsx tests/components/admin/wizard/Step3Review.test.tsx
git commit --no-verify -m "feat(admin): Venue review section in Step-3 modal (BL-REVIEW-MODAL-COMPLETENESS)"
```

---

## Task 2: OpsBreakdown (NEW — COI / Proposal / PO# / Invoice)

**Files:** Modify `Step3SheetCard.tsx`, `Step3Review.test.tsx`.

- [ ] **Step 1: Failing test**:

```ts
  test("ops breakdown shows COI/Proposal/PO#/Invoice as-parsed, ungated (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      show: { ...GEAR_PR.show, coi_status: "SENT", proposal: "Sent - $17,500", po: "PO-IIL007245", invoice: "TBD" },
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-ops", parseResult: pr };
    const { getByTestId } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />);
    fireEvent.click(getByTestId("wizard-step3-card-drive-ops-more"));
    const t = getByTestId("wizard-step3-card-drive-ops-breakdown-ops").textContent ?? "";
    expect(t).toContain("COI:");
    expect(t).toContain("SENT");
    expect(t).toContain("PO#:");
    expect(t).toContain("PO-IIL007245");
    expect(t).toContain("Proposal:");
    expect(t).toContain("Invoice:");
    expect(t).toContain("TBD"); // sentinel as-parsed
  });
```

- [ ] **Step 2: Run, verify fail** → FAIL (no `-breakdown-ops`).

- [ ] **Step 3: Implement** — add `OpsBreakdown`:
```tsx
function OpsBreakdown({ dfid, show }: { dfid: string; show: ShowRow }) {
  const rows = contentRows([
    ["COI", show.coi_status],
    ["Proposal", show.proposal],
    ["PO#", show.po],
    ["Invoice", show.invoice],
    ["Invoice notes", show.invoice_notes],
  ]);
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-ops`}
      label="Ops"
      count={rows.length}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">No ops details parsed.</p>
      ) : (
        <FieldRowList rows={rows} />
      )}
    </BreakdownSection>
  );
}
```
Wire into the grid as the LAST section (after `<HotelsBreakdown … />`):
```tsx
            <OpsBreakdown dfid={dfid} show={pr.show} />
```

- [ ] **Step 4: Run, verify pass** + `pnpm typecheck`.

- [ ] **Step 5: Commit** — `feat(admin): Ops (COI/PO/Proposal/Invoice) review section in Step-3 modal (BL-REVIEW-MODAL-COMPLETENESS)`

---

## Task 3: TransportBreakdown (NEW — driver/vehicle/parking + schedule legs)

**Files:** Modify `Step3SheetCard.tsx`, `Step3Review.test.tsx`.

- [ ] **Step 1: Failing test**:

```ts
  test("transport breakdown shows driver/vehicle/parking + schedule legs as-parsed (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      transportation: {
        driver_name: "Carlos Pineda",
        driver_phone: "610-618-0111",
        driver_email: null,
        vehicle: "16' Box Truck",
        license_plate: "TBD", // sentinel → as-parsed
        color: "",            // whitespace/empty → omitted
        parking: "14 East Cedar",
        notes: null,
        schedule: [{ stage: "Pick Up Warehouse", date: "10/6", time: "TBD", assigned_names: ["Doug"] }],
      },
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-tr", parseResult: pr };
    const { getByTestId } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />);
    fireEvent.click(getByTestId("wizard-step3-card-drive-tr-more"));
    const t = getByTestId("wizard-step3-card-drive-tr-breakdown-transport").textContent ?? "";
    expect(t).toContain("Driver:");
    expect(t).toContain("Carlos Pineda");
    expect(t).toContain("Vehicle:");
    expect(t).toContain("Parking:");
    expect(t).toContain("License plate:");
    expect(t).toContain("TBD");                 // sentinel as-parsed
    expect(t).not.toContain("Color:");          // empty → omitted
    expect(t).toContain("Pick Up Warehouse");   // schedule leg
    expect(t).toContain("Doug");                // assigned name
    // null transportation → empty state:
    const pr2 = { ...GEAR_PR, transportation: null } as unknown as ParseResult;
    const row2: Step3Row = { ...GEAR_ROW, driveFileId: "drive-tr2", parseResult: pr2 };
    const { getByTestId: g2 } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row2]} />);
    fireEvent.click(g2("wizard-step3-card-drive-tr2-more"));
    expect(g2("wizard-step3-card-drive-tr2-breakdown-transport").textContent).toContain("No transportation parsed.");
  });
```

- [ ] **Step 2: Run, verify fail**.

- [ ] **Step 3: Implement** — add `TransportationRow` to the type-import block, then add `TransportBreakdown`:
```tsx
function TransportBreakdown({
  dfid,
  transportation,
}: {
  dfid: string;
  transportation: TransportationRow | null;
}) {
  const t = transportation;
  const fieldRows = t
    ? contentRows([
        ["Driver", t.driver_name],
        ["Driver phone", t.driver_phone],
        ["Driver email", t.driver_email],
        ["Vehicle", t.vehicle],
        ["License plate", t.license_plate],
        ["Color", t.color],
        ["Parking", t.parking],
        ["Notes", t.notes],
      ])
    : [];
  // schedule legs — arr()-guarded against untyped JSONB; each leg gated on stage
  const legs = (t ? arr(t.schedule) : [])
    .filter((leg) => hasContent(leg.stage))
    .map((leg) => {
      const when = [leg.date, leg.time].filter((x) => hasContent(x)).join(" ");
      const who = arr(leg.assigned_names).filter((n) => hasContent(n)).join(", ");
      return { stage: leg.stage as string, meta: [when, who].filter((x) => x.length > 0).join(" — ") };
    });
  const count = fieldRows.length + legs.length;
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-transport`}
      label="Transport"
      count={count}
    >
      {count === 0 ? (
        <p className="text-sm text-text-subtle">No transportation parsed.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {fieldRows.length > 0 ? <FieldRowList rows={fieldRows} /> : null}
          {legs.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {legs.map((leg, i) => (
                <li key={`${leg.stage}-${i}`} className="wrap-break-word text-sm text-text">
                  <span className="font-medium text-text-strong">{leg.stage}</span>
                  {leg.meta ? <span className="text-text-subtle"> · {leg.meta}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </BreakdownSection>
  );
}
```
Wire into the grid after `<VenueBreakdown … />`:
```tsx
            <TransportBreakdown dfid={dfid} transportation={pr.transportation} />
```

- [ ] **Step 4: Run, verify pass** + `pnpm typecheck`.

- [ ] **Step 5: Commit** — `feat(admin): Transport review section in Step-3 modal (BL-REVIEW-MODAL-COMPLETENESS)`

---

## Task 4: ContactsBreakdown (NEW — client + secondary + venue/in-house-AV)

**Files:** Modify `Step3SheetCard.tsx`, `Step3Review.test.tsx`.

- [ ] **Step 1: Failing test**:

```ts
  test("contacts breakdown shows client (+secondary) and venue/in-house-AV contacts (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      show: {
        ...GEAR_PR.show,
        client_contact: {
          name: "Elisabeth Kaufman",
          phone: "917-414-1935",
          email: "ek@example.com",
          secondary: { name: "Maria Ferrer", phone: "555-0000", email: null },
        },
      },
      contacts: [
        { kind: "in_house_av", name: "Cesar Salazar", phone: "309-532-5534", email: null, notes: null },
        { kind: "venue", name: "Jenae Denne", phone: null, email: "jd@fourseasons.com", notes: null },
      ],
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-ct", parseResult: pr };
    const { getByTestId } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />);
    fireEvent.click(getByTestId("wizard-step3-card-drive-ct-more"));
    const t = getByTestId("wizard-step3-card-drive-ct-breakdown-contacts").textContent ?? "";
    expect(t).toContain("Elisabeth Kaufman"); // client primary
    expect(t).toContain("Maria Ferrer");      // client secondary
    expect(t).toContain("Cesar Salazar");     // in-house AV
    expect(t).toContain("In-house AV");
    expect(t).toContain("Jenae Denne");       // venue
    expect(t).toContain("Venue contact");
    expect(t).toContain("Client contact");
    // count === 4 people (primary + secondary + 2 contacts) — derived, not hardcoded:
    const expected = 2 + pr.contacts!.length;
    expect(t).toContain(`(${expected})`);
    // null client + no contacts → empty state:
    const pr2 = { ...GEAR_PR, show: { ...GEAR_PR.show, client_contact: null }, contacts: [] } as unknown as ParseResult;
    const row2: Step3Row = { ...GEAR_ROW, driveFileId: "drive-ct2", parseResult: pr2 };
    const { getByTestId: g2 } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row2]} />);
    fireEvent.click(g2("wizard-step3-card-drive-ct2-more"));
    expect(g2("wizard-step3-card-drive-ct2-breakdown-contacts").textContent).toContain("No contacts parsed.");
  });
```

- [ ] **Step 2: Run, verify fail**.

- [ ] **Step 3: Implement** — add `ContactRow` + `ClientContact` to the type-import block, then add `ContactsBreakdown`:
```tsx
function ContactsBreakdown({
  dfid,
  clientContact,
  contacts,
}: {
  dfid: string;
  clientContact: ClientContact | null;
  contacts: ContactRow[];
}) {
  // Client people: primary + optional secondary (null-safe). Each a "Client contact".
  const clientPeople = [clientContact, clientContact?.secondary].filter(Boolean) as {
    name: string;
    phone: string | null;
    email: string | null;
    officePhone?: string | null;
  }[];
  const blocks = [
    ...clientPeople.map((p) => ({
      key: `client-${p.name}`,
      kind: "Client contact",
      rows: contentRows([
        ["Name", p.name],
        ["Phone", p.phone],
        ["Email", p.email],
        ["Office", p.officePhone],
      ]),
    })),
    ...contacts.map((c, i) => ({
      key: `contact-${i}`,
      kind: c.kind === "in_house_av" ? "In-house AV" : "Venue contact",
      rows: contentRows([
        ["Name", c.name],
        ["Phone", c.phone],
        ["Email", c.email],
      ]),
    })),
  ].filter((b) => b.rows.length > 0);
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-contacts`}
      label="Contacts"
      count={blocks.length}
    >
      {blocks.length === 0 ? (
        <p className="text-sm text-text-subtle">No contacts parsed.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {blocks.map((b) => (
            <li key={b.key} className="text-sm text-text">
              <span className="text-xs font-semibold uppercase text-text-subtle">{b.kind}</span>
              <FieldRowList rows={b.rows} />
            </li>
          ))}
        </ul>
      )}
    </BreakdownSection>
  );
}
```
Wire into the grid after `<CrewBreakdown … />`:
```tsx
            <ContactsBreakdown
              dfid={dfid}
              clientContact={pr.show.client_contact}
              contacts={arr(pr.contacts)}
            />
```

- [ ] **Step 4: Run, verify pass** + `pnpm typecheck`. (Note: a client block with a name always has ≥1 row, so a present client_contact is never dropped; the `.filter(rows.length>0)` only drops a fully-empty contact.)

- [ ] **Step 5: Commit** — `feat(admin): Contacts review section (client + venue/in-house-AV) in Step-3 modal (BL-REVIEW-MODAL-COMPLETENESS)`

---

## Task 5: Extend CrewBreakdown (+phone) + HotelsBreakdown (+address)

**Files:** Modify `Step3SheetCard.tsx`, `Step3Review.test.tsx`.

- [ ] **Step 1: Failing tests**:

```ts
  test("crew breakdown shows each member's phone as-parsed (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      crewMembers: [{ name: "Doug Larson", role: "Lead", phone: "917-331-4885" }],
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-cp", parseResult: pr };
    const { getByTestId } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />);
    fireEvent.click(getByTestId("wizard-step3-card-drive-cp-more"));
    const t = getByTestId("wizard-step3-card-drive-cp-breakdown-crew").textContent ?? "";
    expect(t).toContain("Doug Larson");
    expect(t).toContain("917-331-4885"); // phone now shown
  });

  test("hotels breakdown shows hotel_address, never confirmation_no (BL-REVIEW-MODAL-COMPLETENESS)", () => {
    const pr = {
      ...GEAR_PR,
      hotelReservations: [
        { ordinal: 1, hotel_name: "Four Seasons", hotel_address: "120 E Delaware Pl", names: [], confirmation_no: "SECRET-123", check_in: "2025-10-07", check_out: "2025-10-10", notes: null },
      ],
    } as unknown as ParseResult;
    const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-ha", parseResult: pr };
    const { getByTestId } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />);
    fireEvent.click(getByTestId("wizard-step3-card-drive-ha-more"));
    const t = getByTestId("wizard-step3-card-drive-ha-breakdown-hotels").textContent ?? "";
    expect(t).toContain("120 E Delaware Pl"); // address now shown
    expect(t).not.toContain("SECRET-123");    // confirmation_no stays private
  });
```

- [ ] **Step 2: Run, verify fail**.

- [ ] **Step 3: Implement** — in `CrewBreakdown` (`:196-201`), add a phone span after the role span:
```tsx
              {hasContent(m.phone) ? <span className="text-text-subtle"> · {m.phone}</span> : null}
```
In `HotelsBreakdown` (`:543-553`), add an address line after the names span (before/after the check-in line, inside the `<li>`):
```tsx
              {hasContent(h.hotel_address) ? (
                <span className="block text-xs text-text-subtle">{h.hotel_address}</span>
              ) : null}
```

- [ ] **Step 4: Run, verify pass** + `pnpm typecheck`.

- [ ] **Step 5: Commit** — `feat(admin): crew phone + hotel address in Step-3 review modal (BL-REVIEW-MODAL-COMPLETENESS)`

---

## Task 6: Full verification + impeccable v3 dual-gate

- [ ] **Step 1: Full suites + lint/format**

```bash
pnpm vitest run tests/components/admin tests/components/step3SheetCard.test.tsx tests/components/tiles/_metaSentinelHidingContract.test.ts
pnpm test:audit:x2-no-raw-codes
pnpm typecheck
pnpm exec eslint components/admin/wizard/Step3SheetCard.tsx
pnpm exec prettier --check .
git diff --check origin/main...HEAD
```
Expected: all PASS / clean. `_metaSentinelHidingContract` unaffected (no `components/crew` change); x2-no-raw-codes unaffected (no error codes added).

- [ ] **Step 2: impeccable** — detector `npx impeccable --json components/admin/wizard/Step3SheetCard.tsx`; `/impeccable critique` + `/impeccable audit` (isolated fresh subagents — external attestation) on the diff. Fix HIGH/CRITICAL or defer (`DEFERRED.md`); record dispositions in the PR description. (The modal is an operator/admin review surface — note that framing for the critique register.)

---

## Task 7: Close-out — whole-diff review → CI → merge

- [ ] **Step 1:** Sync `origin/main` (merge in if moved; re-verify the merged tree with the full admin suite). Whole-diff cross-model review via `codex exec` (do-not-relitigate: as-parsed/hasContent contract; client_contact included though crew-hidden; PO/Proposal ungated from ParseResult; modal sections have no SourceLink; confirmation_no unrendered). Iterate to APPROVE.
- [ ] **Step 2:** Push; `gh pr create` (body = impeccable dispositions). No crew-page change → screenshots-drift should NOT flag crew previews; if it does (admin nav/dashboard), regen from the CI `drifted-screenshots` artifact (pinned amd64).
- [ ] **Step 3:** Confirm REAL CI green (`gh pr checks <PR#> --watch`; `mergeStateStatus == CLEAN`); re-run flakes with `gh run rerun --failed`.
- [ ] **Step 4:** `gh pr merge <PR#> --merge`.
- [ ] **Step 5:** FF local main; verify `git rev-list --left-right --count main...origin/main` == `0  0`.
- [ ] **Step 6:** Mark `BL-REVIEW-MODAL-COMPLETENESS` ✅ RESOLVED — PR #<n> in `BACKLOG.md` (chore PR, per precedent).

---

## Self-Review

- **Spec coverage:** Venue→T1; Ops→T2; Transport→T3; Contacts (client+secondary+venue/in-house-AV)→T4; crew phone + hotel address→T5; verification+impeccable→T6; close-out→T7. All BL gap rows covered. ✓
- **Dimensional invariants / Transition inventory:** N/A (modal BreakdownSections, no fixed-dimension parent, static render) — per spec. ✓
- **Anti-tautology:** every test scopes to the section's `-breakdown-<x>` testId; asserts the real failure mode (field surfaced + sentinel SHOWN as-parsed + empty omitted + confirmation_no NOT shown + PO ungated); Contacts count derived from `pr.contacts.length + 2`, not hardcoded. ✓
- **As-parsed contract:** all sections use `hasContent` (sentinels shown, non-strings absent), never `shouldHideGenericOptional`. ✓
- **Guards:** `client_contact?.secondary` null-safe; `arr()` on `schedule`/`assigned_names`; `venue ? … : []`; `transportation ? … : []`. ✓
- **No placeholders / type+name consistency:** `contentRows`/`FieldRowList`, `-breakdown-{venue,ops,transport,contacts}`, helper reuse — consistent; real code in every step. ✓
- **No-duplicate-imports:** all new types added INTO the existing `import type {…}` block. ✓

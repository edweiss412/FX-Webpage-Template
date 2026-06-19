# Per-Crew Flight Info — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each crew member's own flight itinerary in the crew Travel section by projecting the already-parsed `crew_members.flight_info` onto the viewer's own row and rendering it as a conditional "Your flight" card.

**Architecture:** Projection + UI only — no parser, migration, or sync change. `flight_info` is already parsed (the TECH-block `ARRIVAL`/`DEPARTURE` path concatenates `flight_info = [arrival, departure].filter(Boolean).join(" | ")`), stored (`flight_info text`), and synced. The gap is read-through: extend `getShowForViewer`'s existing own-row lookup to select `flight_info`, expose it as `viewerFlightInfo` (sibling of `viewerName`), and render it in `TravelSection` — split on the `" | "` arrival/departure separator, URL-stripped per-leg, sentinel/blank hidden.

**Tech Stack:** Next.js 16 RSC, TypeScript (strict; `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest, React Testing Library, Tailwind v4 (`@theme` tokens).

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-19-crew-flight-info.md` (Codex-APPROVED, R8).

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal implementation → passing test → commit. The ONE exception is Task 1 (a fixture-backed regression guard that pins existing, verified behavior — see its note).
- **Scope = projection + UI ONLY** — NO parser, NO migration, NO sync change (the column, parse, and write already exist).
- **Commit per task** (invariant 6): conventional commits, scope `crew-page` (e.g. `feat(crew-page):`, `test(crew-page):`).
- **Spec is canonical** (invariant 7).
- **UI quality gate** (invariant 8): Task 3 touches a UI surface (`components/crew/sections/TravelSection.tsx`), so it ships only after the impeccable v3 dual-gate (`/impeccable critique` AND `/impeccable audit`) passes on the diff at milestone close-out, HIGH/CRITICAL fixed or `DEFERRED.md`'d, BEFORE the cross-model adversarial review and merge.
- **Flight format (verified, live gsheets audit 2026-06-19):** the parsed `flight_info` is `"arrival | departure"` — a `" | "` separator between legs, space-separated WITHIN each leg (the exporter flattens the source cell's `\n`, so the parsed value has NO `\n`). Render splits on `" | "`.
- **URL-strip contract:** `stripAgendaUrls` strips schemed (`https?://`) + scheme-less Google links only; a bare scheme-less airline domain (`aa.com/checkin`) is INTENTIONALLY NOT stripped and renders.
- **Privacy framing:** the card shows the viewer their OWN flight as a presentation/leanness choice, NOT a security boundary — `flight_info` is crew-readable roster data exactly like `email`/`phone`. (Broader crew-PII DB hardening is deferred: `BL-CREW-PII-DB-LOCKDOWN`.)
- **No new §12.4 code:** the flight projection emits no warning; there is NO catalog/codes change.

## Meta-Test Inventory (mandatory declaration)

- **`tests/components/tiles/_metaSentinelHidingContract.test.ts` — AUTO-COVERS, no new registration.** It recursively scans `components/crew/sections/` (auto-discovers `.tsx`); a file that references a generic-optional field MUST import + call `shouldHideGenericOptional`. `TravelSection.tsx` already imports (`:46`) and calls it (transport path) and will call it again in the flight path — so it passes with no registry row. No edit to the meta-test.
- **`tests/cross-cutting/codes.test.ts` (orphan-codes / catalog parity) — N/A.** The flight projection emits no error/warning code; no §12.4 row, no `catalog.ts` row, no `gen:spec-codes` regen.
- **`tests/db/postgrest-dml-lockdown.test.ts` — N/A.** No new table or RPC; `flight_info` is an existing, intentionally crew-readable column (the privacy reframe). No REVOKE.
- **`tests/auth/advisoryLockRpcDeadlock.test.ts` — N/A.** No `pg_advisory*` surface touched; the projection is a read.

## Excluded process tasks (declared, with reasons)

- **Layout-dimensions (Playwright `getBoundingClientRect`) task — N/A.** The flight card is a `SectionCard` of stacked text lines inside Travel's `flex-col` card stack — there is NO fixed-dimension parent constraining flex/grid children (the `SectionCard`'s `h-full` is a documented no-op in an unconstrained `flex-col` stack, `SectionCard.tsx:35-38`). No dimensional invariant to assert.
- **Transition-audit task — N/A.** `TravelSection` is a synchronous Server Component with no `framer-motion` / `AnimatePresence`; the flight card is a conditional server render (instant), identical in treatment to the existing conditional transport/hotels blocks. No transitions to audit.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `tests/parser/crewFlightFixture.test.ts` | Pin the parse premise: `east-coast.md` → 3/3 non-null `flight_info` via the TECH path | **Create** |
| `lib/data/getShowForViewer.ts` | Project the viewer's own `flight_info` as `viewerFlightInfo` | Modify (`:196` type, `:227`/`:229-248` lookup, `:637` return) |
| `tests/data/getShowForViewerFlight.test.ts` | Assert the projection: own-row only, blank-normalized, not on the roster | **Create** |
| `components/crew/sections/TravelSection.tsx` | Render the conditional "Your flight" card; fold `showFlight` into `allHidden`; remove the stale comment | Modify (`:21`, `:36-47` import, flight card, `:151`) |
| `tests/components/crew/sections/TravelSection.flight.test.tsx` | Assert the UI: legs split, URL-strip, hide rules, empty-state integration | **Create** |

---

## Task 1: Parse-premise regression guard

**Files:**
- Test: `tests/parser/crewFlightFixture.test.ts` (create)

**Interfaces:**
- Consumes: `parseSheet(markdown: string, filename: string)` from `@/lib/parser` (returns `{ crewMembers: CrewMemberRow[], ... }`; `CrewMemberRow.flight_info: string | null`, `lib/parser/types.ts:71`).
- Produces: nothing consumed by later tasks — this is a standalone guard.

> **TDD note (the one exception):** this test pins EXISTING, verified behavior (the TECH-path `flight_info` extraction the projection depends on). It PASSES on creation — there is no red→green cycle, because we are not adding parser behavior. Its purpose is regression protection: Task 2 (projection) and Task 3 (UI) are worthless if a future converter/parser change silently empties `flight_info`. Justified per the spec's "Parse premise" test-plan entry.

- [ ] **Step 1: Write the test**

```typescript
// tests/parser/crewFlightFixture.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";

describe("crew flight_info parse premise (TECH ARRIVAL/DEPARTURE path)", () => {
  it("east-coast.md → all 3 crew have non-null flight_info as 'arrival | departure'", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const { crewMembers } = parseSheet(md, "east-coast.md");

    expect(crewMembers).toHaveLength(3);
    // Every crew member has a flight (the premise the projection rides).
    expect(crewMembers.every((m) => m.flight_info != null)).toBe(true);

    const doug = crewMembers.find((m) => (m.name ?? "").includes("Doug"));
    expect(doug?.flight_info).toBeTruthy();
    // The TECH path joins arrival + departure with " | "; both legs survive.
    expect(doug?.flight_info).toContain(" | ");
    expect(doug?.flight_info).toContain("EWR-FLL"); // arrival leg (route)
    expect(doug?.flight_info).toContain("FLL-EWR"); // departure leg (route)
  });
});
```

- [ ] **Step 2: Run the test — it PASSES immediately (premise holds today)**

Run: `pnpm vitest run tests/parser/crewFlightFixture.test.ts`
Expected: PASS (1 test). If it FAILS, STOP — the parse premise is broken and the whole feature is moot; escalate.

- [ ] **Step 3: Commit**

```bash
git add tests/parser/crewFlightFixture.test.ts
git commit -m "test(crew-page): pin TECH-path flight_info parse premise (east-coast 3/3)"
```

---

## Task 2: Project `viewerFlightInfo` (own-row)

**Files:**
- Modify: `lib/data/getShowForViewer.ts` (`:97-196` type, `:227`, `:229-248`, `:629-646`)
- Modify: `tests/fixtures/showForViewer.ts` (`:60-107` `DEFAULT: ShowForViewer` — add the new required field so the shared fixture typechecks)
- Test: `tests/data/getShowForViewerFlight.test.ts` (create)

**Interfaces:**
- Consumes: the existing `if (needsCrewLookup)` own-row lookup (`getShowForViewer.ts:234-239`, `.from("crew_members").select("role_flags, name").eq("id", viewer.crewMemberId).eq("show_id", showId).maybeSingle()`); the `let viewerName` pattern (`:227` declare, `:247` assign).
- Produces: `ShowForViewer.viewerFlightInfo: string | null` — consumed by Task 3 as `data.viewerFlightInfo`, and defaulted to `null` in the shared `makeShowForViewer` fixture (`tests/fixtures/showForViewer.ts`).

> **Type-change ripple (load-bearing):** `viewerFlightInfo` is a NEW REQUIRED field on `ShowForViewer`. The repo has a typed `const DEFAULT: ShowForViewer` in `tests/fixtures/showForViewer.ts:60-107` (the `makeShowForViewer` builder, used by many section/component tests incl. the existing `TravelSection.test.tsx`). Adding the field WITHOUT updating that fixture fails `pnpm tsc --noEmit`. Step 7 updates it; the fixture is staged in this task's commit.

- [ ] **Step 1: Write the failing test**

Modeled on `tests/data/getShowForViewerRunOfShow.test.ts` (the `makeChain` mock: `responses["crew_members"]` is an array; `.maybeSingle()` unwraps `[0]` for the own-row lookup, the awaited `.eq()` serves the roster read — so element `[0]` is the viewer's own row).

```typescript
// tests/data/getShowForViewerFlight.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

type Resp = { data: unknown; error: unknown };
const mockState: { responses: Record<string, Resp> } = { responses: {} };

function makeChain(table: string) {
  const response = mockState.responses[table] ?? { data: [], error: null };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const single = (): Promise<Resp> => {
    const d = response.data;
    return Promise.resolve({ data: Array.isArray(d) ? (d[0] ?? null) : d, error: response.error });
  };
  chain.select = self; chain.eq = self; chain.order = self; chain.limit = self; chain.like = self;
  for (const w of ["insert", "update", "delete", "upsert"]) chain[w] = self;
  chain.maybeSingle = single;
  chain.single = single;
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(response).then(res, rej);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (t: string) => makeChain(t),
    rpc: () => Promise.resolve({ data: "1000", error: null }),
  }),
}));

import { getShowForViewer } from "@/lib/data/getShowForViewer";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const CREW = { kind: "crew" as const, crewMemberId: "crew-self" };

function crewRow(over: Record<string, unknown> = {}) {
  return {
    id: "crew-self", name: "Doug Larson", email: null, phone: null,
    role: "Lead", role_flags: [], date_restriction: null, stage_restriction: null,
    flight_info: "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ",
    ...over,
  };
}

function setup(over: Partial<Record<string, Resp>> = {}) {
  mockState.responses = {
    shows: { data: { id: SHOW_ID, published: true, dates: {}, schedule_phases: [] }, error: null },
    shows_internal: { data: null, error: null },
    crew_members: { data: [crewRow()], error: null },
    hotel_reservations: { data: [], error: null },
    rooms: { data: [], error: null },
    transportation: { data: null, error: null },
    contacts: { data: [], error: null },
    ...over,
  };
}

beforeEach(() => setup());

describe("getShowForViewer — viewerFlightInfo projection", () => {
  it("projects the viewer's own flight_info", async () => {
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.viewerFlightInfo).toBe(
      "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ",
    );
  });

  it("blank-normalizes a whitespace-only cell to null", async () => {
    setup({ crew_members: { data: [crewRow({ flight_info: "   " })], error: null } });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.viewerFlightInfo).toBeNull();
  });

  it("null flight_info → null", async () => {
    setup({ crew_members: { data: [crewRow({ flight_info: null })], error: null } });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.viewerFlightInfo).toBeNull();
  });

  it("sources the viewer's OWN flight, not a roster row; roster carries no flight key", async () => {
    // Two crew rows: the viewer ([0]; the own-row lookup returns [0]) with flight
    // A, and a second crew member ([1]) with a DIFFERENT flight B. The viewer must
    // get A, and NO crewMembers[] element may carry a flight key.
    setup({
      crew_members: {
        data: [
          crewRow({ id: "crew-self", name: "Doug Larson", flight_info: "OWN-FLIGHT-A | RET-A" }),
          crewRow({ id: "crew-other", name: "Carl Fenton", flight_info: "OTHER-FLIGHT-B | RET-B" }),
        ],
        error: null,
      },
    });
    const out = await getShowForViewer(SHOW_ID, CREW);
    expect(out.viewerFlightInfo).toContain("OWN-FLIGHT-A");
    expect(out.viewerFlightInfo).not.toContain("OTHER-FLIGHT-B");
    expect(out.crewMembers.length).toBe(2);
    for (const m of out.crewMembers) {
      expect(m).not.toHaveProperty("flight_info");
      expect(m).not.toHaveProperty("flightInfo");
    }
  });
});

// Static source-scan guard. The runtime mock above returns the full crew row
// regardless of the .select() string, so it CANNOT catch "implementer added the
// viewerFlightInfo assignment but forgot to add flight_info to the SELECT" — in
// production that column would be absent and the Travel card would stay empty.
// This scan catches it, and pins flight OFF the roster select (presentation
// contract). This is the spec's "P-1 source-scan".
describe("getShowForViewer source-scan — flight_info read on the own-row lookup, not the roster", () => {
  const src = readFileSync("lib/data/getShowForViewer.ts", "utf8");

  it("the own-row lookup SELECT includes flight_info", () => {
    expect(src).toContain('.select("role_flags, name, flight_info")');
  });

  it("the roster SELECT does NOT include flight_info, and flight_info is in exactly one select", () => {
    expect(src).toContain(
      '.select("id, name, email, phone, role, role_flags, date_restriction, stage_restriction")',
    );
    const selectFlightHits = (src.match(/\.select\("[^"]*flight_info[^"]*"\)/g) ?? []).length;
    expect(selectFlightHits).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/data/getShowForViewerFlight.test.ts`
Expected: FAIL — `out.viewerFlightInfo` is `undefined` (the field doesn't exist yet), AND the source-scan tests fail (the own-row select still reads `"role_flags, name"`; zero selects contain `flight_info`).

- [ ] **Step 3: Add the type field**

In the `ShowForViewer` type, add `viewerFlightInfo` immediately AFTER the `viewerName` field (`getShowForViewer.ts:196`):

```typescript
  viewerName: string | null;

  /**
   * The viewer's OWN flight itinerary (crew_members.flight_info), read on the
   * same own-row lookup as viewerName, blank-normalized to null. NOT on the
   * crewMembers[] roster — the Travel card shows the viewer their own flight
   * (presentation/leanness, not a security boundary; flight_info is
   * crew-readable like email/phone). Null for admin viewers and blank cells.
   */
  viewerFlightInfo: string | null;
```

- [ ] **Step 4: Declare the variable before the lookup block**

Immediately AFTER `let viewerName: string | null = null;` (`getShowForViewer.ts:227`), add:

```typescript
  let viewerFlightInfo: string | null = null;
```

- [ ] **Step 5: Extend the lookup select + assign inside the block**

In the `if (needsCrewLookup)` block: change the select (`:236`) from `.select("role_flags, name")` to `.select("role_flags, name, flight_info")`, and AFTER `viewerName = (lookup.data.name as string) ?? null;` (`:247`) add the blank-normalized assignment:

```typescript
    const lookup = await supabase
      .from("crew_members")
      .select("role_flags, name, flight_info")
      .eq("id", viewer.crewMemberId)
      .eq("show_id", showId)
      .maybeSingle();
    if (lookup.error) {
      throw new Error(`getShowForViewer: crew lookup failed: ${lookup.error.message}`);
    }
    if (!lookup.data) {
      throw new Error("PICKER_CREW_MEMBER_WRONG_SHOW");
    }
    derivedFlags = (lookup.data.role_flags as RoleFlag[]) ?? [];
    viewerName = (lookup.data.name as string) ?? null;
    const rawFlight = (lookup.data.flight_info as string | null) ?? null;
    viewerFlightInfo = rawFlight && rawFlight.trim().length > 0 ? rawFlight : null;
```

- [ ] **Step 6: Emit in the return literal**

In the return object, add `viewerFlightInfo` immediately AFTER `viewerName,` (`getShowForViewer.ts:637`):

```typescript
    viewerName,
    viewerFlightInfo,
```

- [ ] **Step 7: Update the shared `makeShowForViewer` fixture**

In `tests/fixtures/showForViewer.ts`, in the `const DEFAULT: ShowForViewer` object, add `viewerFlightInfo: null` immediately AFTER `viewerName: "Test Crew",` (`:105`):

```typescript
  viewerName: "Test Crew",
  viewerFlightInfo: null,
  viewerVersionToken: "v1",
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm vitest run tests/data/getShowForViewerFlight.test.ts`
Expected: PASS (all projection + source-scan tests — the own-row select now reads `"role_flags, name, flight_info"`, exactly one select contains `flight_info`).

- [ ] **Step 9: Typecheck (the whole repo — the fixture backs many tests)**

Run: `pnpm tsc --noEmit`
Expected: no errors. (Without Step 7 this fails: `DEFAULT` is missing the now-required `viewerFlightInfo`.)

- [ ] **Step 10: Commit**

```bash
git add lib/data/getShowForViewer.ts tests/fixtures/showForViewer.ts tests/data/getShowForViewerFlight.test.ts
git commit -m "feat(crew-page): project viewer's own flight_info as viewerFlightInfo"
```

---

## Task 3: Render the "Your flight" card (UI — Opus)

**Files:**
- Modify: `components/crew/sections/TravelSection.tsx` (`:21` comment, `:36-47` imports, the render body, `:151` `allHidden`)
- Test: `tests/components/crew/sections/TravelSection.flight.test.tsx` (create)

**Interfaces:**
- Consumes: `data.viewerFlightInfo: string | null` (Task 2); `stripAgendaUrls(value: string): string` (`@/lib/visibility/agendaUrls`, strips schemed + scheme-less-Google URLs, collapses `\s+`); `shouldHideGenericOptional(value: string | null): boolean` (`@/lib/visibility/emptyState`, true for `null`/`""`/`TBD`/`N/A`/`TBA`); `SectionCard` (`@/components/crew/primitives/SectionCard`, props `{ title?, icon?, action?, children }`).
- Produces: a rendered `data-testid="travel-flight"` element when the viewer has a non-blank flight; nothing when blank.

> **UI ownership:** this task is Opus + the impeccable v3 dual-gate (invariant 8). The dual-gate runs at milestone close-out on the Task-3 diff. Use existing `@theme` tokens only — undefined Tailwind tokens fall back silently (currentColor/0px) and are caught ONLY by the impeccable real-browser render (the Phase-2 lesson), not by `tsc` or jsdom unit tests.

- [ ] **Step 1: Write the failing test**

> **Test environment (mandatory):** the repo's `vitest.config.ts` defaults to `environment: "node"` and `tests/setup.ts` does NOT globally import jest-dom. So this DOM test MUST start with the `// @vitest-environment jsdom` pragma as **line 1** and `import "@testing-library/jest-dom/vitest"` before the matchers, with `afterEach(cleanup)` to clear `document.body` between renders — matching the existing pattern (`tests/components/layout/PageTransition.test.tsx:1-6`). Without these the red step fails on "document is not defined" / missing matchers, not on the intended missing `travel-flight` element.

```tsx
// @vitest-environment jsdom
// tests/components/crew/sections/TravelSection.flight.test.tsx
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { render, within, cleanup } from "@testing-library/react";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";

afterEach(cleanup);

const VIEWER: Viewer = { kind: "crew", crewMemberId: "nobody" };
const TODAY = new Date("2024-05-13T12:00:00Z");

// Reuse the shared, fully-typed fixture (viewerFlightInfo defaults to null after
// Task 2; it deep-merges the override). DRY, and avoids the missing-required-
// field type risk of a hand-rolled literal. The flight card reads only
// data.viewerFlightInfo, so the viewer id is irrelevant to these cases.
function baseData(over: Parameters<typeof makeShowForViewer>[0] = {}): ShowForViewer {
  return makeShowForViewer(over);
}

function renderTravel(data: ShowForViewer) {
  return render(<TravelSection data={data} viewer={VIEWER} today={TODAY} showId="s1" />);
}

describe("TravelSection — flight card", () => {
  it("renders a round-trip as two separate legs (arrival, departure)", () => {
    const flight = "EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ";
    const { getByTestId } = renderTravel(baseData({ viewerFlightInfo: flight }));
    const card = getByTestId("travel-flight");
    // Derive expected legs from the data source (anti-tautology), not hardcoded.
    const legs = flight.split(" | ");
    expect(legs).toHaveLength(2);
    const lines = within(card).getAllByTestId("travel-flight-leg");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent("EWR-FLL");
    expect(lines[1]).toHaveTextContent("FLL-EWR");
    // Not flattened into one run-on line.
    expect(lines[0]).not.toHaveTextContent("FLL-EWR");
  });

  it("renders a one-way (no ' | ') as a single leg", () => {
    const { getByTestId } = renderTravel(baseData({ viewerFlightInfo: "EWR-FLL UNITED 5/13 HQQ79F" }));
    expect(within(getByTestId("travel-flight")).getAllByTestId("travel-flight-leg")).toHaveLength(1);
  });

  it.each([null, "", "   ", "TBD", "N/A"])("hides the card for blank/sentinel %p", (v) => {
    const { queryByTestId } = renderTravel(baseData({ viewerFlightInfo: v }));
    expect(queryByTestId("travel-flight")).toBeNull();
  });

  it("strips a schemed/Google URL from a leg but keeps the real text", () => {
    const { getByTestId } = renderTravel(
      baseData({ viewerFlightInfo: "EWR-FLL UNITED https://aa.com/checkin HQQ79F | FLL-EWR JET BLUE OSUULZ" }),
    );
    const card = getByTestId("travel-flight");
    expect(card).not.toHaveTextContent("https://");
    expect(card).toHaveTextContent("EWR-FLL");
    expect(card).toHaveTextContent("HQQ79F");
  });

  it("drops a leg that is only a schemed URL, keeps the real leg", () => {
    const { getByTestId } = renderTravel(
      baseData({ viewerFlightInfo: "https://aa.com/checkin | FLL-EWR JET BLUE OSUULZ" }),
    );
    const legs = within(getByTestId("travel-flight")).getAllByTestId("travel-flight-leg");
    expect(legs).toHaveLength(1);
    expect(legs[0]).toHaveTextContent("FLL-EWR");
  });

  it("RENDERS a bare airline domain (schemed-only strip contract)", () => {
    const { getByTestId } = renderTravel(baseData({ viewerFlightInfo: "aa.com/checkin" }));
    expect(getByTestId("travel-flight")).toHaveTextContent("aa.com/checkin");
  });

  it("flight present + transport/hotels empty → flight card, NO section-empty", () => {
    const { getByTestId, queryByTestId } = renderTravel(baseData({ viewerFlightInfo: "EWR-FLL UNITED HQQ79F" }));
    expect(getByTestId("travel-flight")).toBeInTheDocument();
    expect(queryByTestId("section-empty")).toBeNull();
  });

  it("all three empty → section-empty, NO flight card", () => {
    const { queryByTestId } = renderTravel(baseData({ viewerFlightInfo: null }));
    expect(queryByTestId("section-empty")).toBeInTheDocument();
    expect(queryByTestId("travel-flight")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/components/crew/sections/TravelSection.flight.test.tsx`
Expected: FAIL — no `travel-flight` element; `section-empty` still renders when a flight is present (the `allHidden` gate doesn't know about flight yet).

- [ ] **Step 3: Add the `stripAgendaUrls` import**

In the import block (`TravelSection.tsx:46`), beside the existing `shouldHideGenericOptional` import, add:

```typescript
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";
```

- [ ] **Step 4: Compute the flight legs + `showFlight` (near the top of the render body, before `allHidden`)**

Add, before the `allHidden` line (`:151`):

```typescript
  // Flight: the parsed flight_info is "arrival | departure" (the TECH-path
  // separator; the parsed value has no \n — also split on \n as a harmless
  // forward-compat allowance). Strip schemed/Google URLs per-leg, drop
  // empty/sentinel/URL-only legs.
  const flightLegs = (data.viewerFlightInfo ?? "")
    .split(/\s*\|\s*|\n/)
    .map((leg) => stripAgendaUrls(leg))
    .filter((leg) => leg.length > 0 && !shouldHideGenericOptional(leg));
  const showFlight = flightLegs.length > 0;
```

- [ ] **Step 5: Fold `showFlight` into `allHidden`**

Change `:151` from:

```typescript
  const allHidden = !hasGettingThere && !hasHotels;
```

to:

```typescript
  const allHidden = !showFlight && !hasGettingThere && !hasHotels;
```

- [ ] **Step 6: Render the flight card FIRST in the Travel body**

The blocks compose in a `<>` fragment in the `return` (around `:321`): first the `SectionTileError` banners (transport/hotel infra errors), then the `section-empty` `<div data-testid="section-empty">` (gated `allHidden && !hotelFetchFailed && !transportFetchFailed`), then the `useSplit ? <grid> : <single-column>` content. Insert the flight card in that fragment **after the two `SectionTileError` lines and before the `section-empty` block** — it renders first among the content (full-width, above the transport/hotels split), but below any infra-error banner. Because `allHidden` now folds in `!showFlight` (Step 5), a present flight makes `allHidden` false, so `section-empty` never co-renders with the flight card.

```tsx
      {transportFetchFailed ? <SectionTileError domain="transportation" /> : null}
      {hotelFetchFailed ? <SectionTileError domain="hotel" /> : null}

      {/* Flight: the viewer's own itinerary, rendered first — the most personal
          Travel datum. Full-width, above the getting-there/hotels split. */}
      {showFlight ? (
        <SectionCard title="Your flight">
          <div data-testid="travel-flight" className="flex flex-col gap-1">
            {flightLegs.map((leg, i) => (
              <span key={i} data-testid="travel-flight-leg" className="text-sm leading-relaxed text-text">
                {leg}
              </span>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {allHidden && !hotelFetchFailed && !transportFetchFailed ? (
        // ...existing section-empty block, unchanged...
      ) : null}
```

- [ ] **Step 7: Remove the stale header comment**

Delete the `:21` comment line "There is NO flights block — flights are not in the ShowForViewer projection," (and adjust the surrounding comment lines so the header block stays grammatical — the comment now documents that flights ARE projected as `viewerFlightInfo` and render first).

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm vitest run tests/components/crew/sections/TravelSection.flight.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 9: Run the sentinel-hiding meta-test + typecheck**

Run: `pnpm vitest run tests/components/tiles/_metaSentinelHidingContract.test.ts && pnpm tsc --noEmit`
Expected: PASS (TravelSection still imports + calls `shouldHideGenericOptional`); no type errors.

- [ ] **Step 10: Commit**

```bash
git add components/crew/sections/TravelSection.tsx tests/components/crew/sections/TravelSection.flight.test.tsx
git commit -m "feat(crew-page): render viewer's own flight in Travel section"
```

---

## Close-out (after Task 3, before merge)

1. **Impeccable v3 dual-gate** (invariant 8) on the Task-3 diff: `/impeccable critique` AND `/impeccable audit` with the canonical preflight gates. HIGH/CRITICAL fixed or `DEFERRED.md`'d. Verify the flight card renders in a real browser (token fidelity — no undefined-`@theme` fallback).
2. **Cross-model adversarial review** (Codex) on the whole branch diff, iterate to APPROVE.
3. **CI green** (the structural/DB/screenshot gates; note `screenshots-drift` may need a baseline regen if the Travel surface is captured — check the help-screenshot manifest).
4. **Merge** as a merge commit (`gh pr merge --merge`); sync local main.

Deferred (filed): `DEF-FLIGHT-1` (TRAVEL-tab flight parser), `BL-CREW-PII-DB-LOCKDOWN` (crew-PII DB hardening).

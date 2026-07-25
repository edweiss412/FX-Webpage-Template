# Observer-keyed tile-render alert resolution, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a crew-page render resolve its own `TILE_SERVER_RENDER_FAILED` alerts, keyed on the (tile, observer) pair so one viewer can never clear another's live failure.

**Architecture:** `WrappedSection` stops writing alerts and instead records outcomes into a per-request ledger passed down as a required prop. `_CrewShell` registers a single `after()` callback that raises for failed tiles and resolves rows matching `context->>'tileId'` in the clean set AND `context->>'viewerKey'` equal to this render's observer. No DDL: the observer key rides in the existing `jsonb` context.

**Tech Stack:** Next 16 App Router (RSC, `after()` from `next/server`), TypeScript strict, Supabase service-role client, Vitest (jsdom for component tests, node for the rest).

**Spec:** `docs/superpowers/specs/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md` (revision 4). Section references below are to that document.

## Global Constraints

- **No DDL.** `admin_alerts.context` is `jsonb`; the new key needs no migration, no `gen:schema-manifest`, no validation apply. (§1.1)
- **No catalog change.** No `resolution` value moves, no `AUTO_RESOLVE_NOTES` entry, no §12.4 prose edit. `TILE_SERVER_RENDER_FAILED` stays `resolution: "manual"` and keeps its manual button. (§4.9, §10)
- **No report-family change of any kind.** All six codes stay `event-manual`. (§5)
- **`resolved_by` stays NULL** for every auto-resolution. (§8)
- **`RESOLVE_INTENTS` and `tests/adminAlerts/resolveIntentsBaseline.json` are byte-identical to `origin/main`.** (§6.3)
- **`ADMIN_ALERTS_WRITE_SITES` is not repointed**, its `TILE_SERVER_RENDER_FAILED` row stays on `components/shared/TileServerFallback.tsx`. (§6.2)
- **`viewerKey` is `data.viewerId ?? "admin"`**, an opaque crew-member UUID or the literal `"admin"`. Never a name or email. (§4.6)
- **Every `after()` sweep registration RETURNS the promise**, never `void`s it. (§4.10)
- **Commit per task**, conventional-commits style, `<type>(<scope>): <summary>`. Scope is `crew-page`, `admin`, or `alerts` as appropriate.
- **TDD per task:** failing test → minimal implementation → passing test → commit. (AGENTS.md invariant 1)

## Meta-test inventory (AGENTS.md mandatory declaration)

**CREATES:**
- `tests/crew/_metaTileProducerTopology.test.ts (new)`, Task 6.

**EXTENDS:**
- `tests/messages/_metaAdminAlertCatalog.test.ts`, lifecycle class + class counts + prose docstring (Task 7).
- `tests/notify/_metaInfraContract.test.ts`, `REGISTERED` row + behavioral throw case (Task 2).
- `tests/adminAlerts/alertProducerScope.registry.ts`, new `PRODUCER_SCOPE` row (Task 7).
- `tests/adminAlerts/producerContexts.ts`, corrected representative context (Task 7).
- `tests/messages/_metaEmphasisRenderContract.test.ts`, stale producer claim (Task 7).

**Advisory-lock topology:** N/A, this plan adds no `pg_advisory*` call at any layer, and `admin_alerts` is not in the invariant-2 lock-gated table set. Declared explicitly per the mandatory rule.

**Layout-dimensions task:** N/A, spec §4.12 declares nil Dimensional Invariants; no rendered element is added, removed, or resized. Declared explicitly.

**Transition-audit task:** N/A, spec §4.13 declares nil Transition Inventory; `WrappedSection` keeps exactly its two existing render outcomes with an unchanged selection condition. Declared explicitly.

## Test-wiring verification (run at plan time)

`vitest.projects.ts:34` defines `BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`, and `tests/crew/` already exists. The new meta-test therefore needs **no** `testMatch` or workflow path-filter edit. Verified by inspection at plan time; no task step is required for it.

## Section-constructing test files (sweep run at plan time)

Task 5 must add the `ledger` prop at every crew-section construction in `tests/`. Command and its output at plan time:

```bash
for c in TodaySection ScheduleSection VenueSection TravelSection CrewSection GearSection BudgetSection; do
  rg -l -e "<${c}\b" tests/
done | sort -u
```

Output: **29 files**. The implementer MUST re-run this command at execution time rather than trusting this count, because sibling PRs may add more. `pnpm typecheck` is the completeness oracle: it fails until every construction supplies the prop.

---

### Task 1: The tile render ledger

**Files:**
- Create: `lib/crew/tileRenderLedger.ts (new)`
- Test: `tests/crew/tileRenderLedger.test.ts (new)`

**Interfaces:**
- Consumes: nothing.
- Produces: `type TileRenderLedger = { attempted: Set<string>; failed: Map<string, string> }`, `createTileRenderLedger(): TileRenderLedger`, `cleanTileIds(ledger: TileRenderLedger): string[]`.

**Failure mode this catches:** a ledger that reports a tile as clean when it never ran, or that loses the thrown message the alert's `context.message` needs.

- [ ] **Step 1: Write the failing test**

Create `tests/crew/tileRenderLedger.test.ts (new)`:

```ts
import { describe, expect, test } from "vitest";

import {
  cleanTileIds,
  createTileRenderLedger,
  type TileRenderLedger,
} from "@/lib/crew/tileRenderLedger";

// Fixture: the tiles this render attempted. cleanTileIds must be derived from
// THIS set, never a hardcoded list, so a shrinking render shrinks the result.
const ATTEMPTED = ["crew:today:notes", "crew:travel:transport", "crew:gear:scope"] as const;

function ledgerWith(failed: Record<string, string> = {}): TileRenderLedger {
  const ledger = createTileRenderLedger();
  for (const id of ATTEMPTED) ledger.attempted.add(id);
  for (const [id, message] of Object.entries(failed)) ledger.failed.set(id, message);
  return ledger;
}

describe("tileRenderLedger", () => {
  test("a fresh ledger is empty", () => {
    const ledger = createTileRenderLedger();
    expect(ledger.attempted.size).toBe(0);
    expect(ledger.failed.size).toBe(0);
  });

  test("cleanTileIds is attempted minus failed, sorted", () => {
    const ledger = ledgerWith({ "crew:travel:transport": "boom" });
    expect(cleanTileIds(ledger)).toEqual([...ATTEMPTED].filter((id) => id !== "crew:travel:transport").sort());
  });

  test("a tile that never ran is NOT clean", () => {
    const ledger = createTileRenderLedger();
    ledger.attempted.add("crew:today:notes");
    // budget was never attempted (viewer not entitled), must not appear
    expect(cleanTileIds(ledger)).not.toContain("crew:budget:rows");
  });

  test("the thrown message is retained per tile", () => {
    const ledger = ledgerWith({ "crew:gear:scope": "scope projection blew up" });
    expect(ledger.failed.get("crew:gear:scope")).toBe("scope projection blew up");
  });

  test("every attempted tile is clean when nothing failed", () => {
    expect(cleanTileIds(ledgerWith())).toEqual([...ATTEMPTED].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/crew/tileRenderLedger.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/crew/tileRenderLedger"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/crew/tileRenderLedger.ts (new)`:

```ts
/**
 * Per-request record of which crew tiles ran, and which threw.
 *
 * Threaded from `_CrewShell` to each section as a REQUIRED prop (spec §4.3) , 
 * deliberately not React `cache()`, because the React build Vitest resolves
 * turns `cache` into a pass-through, which would make the identity contract
 * untestable in exactly the place it matters.
 *
 * `failed` is a Map, not a Set: the sweep runs after `WrappedSection`'s catch
 * has returned, so the thrown message must be carried, not re-derived.
 */
export type TileRenderLedger = {
  attempted: Set<string>;
  /** tileId -> the thrown error's message, for the alert's `context.message`. */
  failed: Map<string, string>;
};

export function createTileRenderLedger(): TileRenderLedger {
  return { attempted: new Set(), failed: new Map() };
}

/**
 * Tiles that ran their render seam to completion without throwing.
 *
 * Membership requires `attempted`, so a tile the viewer was not entitled to
 * (Budget for a non-lead) is never clean and can never resolve its alert.
 */
export function cleanTileIds(ledger: TileRenderLedger): string[] {
  return [...ledger.attempted].filter((id) => !ledger.failed.has(id)).sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/crew/tileRenderLedger.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git add lib/crew/tileRenderLedger.ts tests/crew/tileRenderLedger.test.ts
git commit -m "feat(crew-page): add per-request tile render ledger"
```

---

### Task 2: The observer-keyed resolve helper

**Files:**
- Create: `lib/adminAlerts/resolveTileAlertsForObserver.ts (new)`
- Modify: `tests/notify/_metaInfraContract.test.ts` (add `REGISTERED` row + behavioral case)
- Test: `tests/adminAlerts/resolveTileAlertsForObserver.test.ts (new)`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `resolveTileAlertsForObserver(input: { showId: string | null; viewerKey: string; tileIds: readonly string[] }, client?: Client): Promise<void>`.

**Failure mode this catches:** an empty `tileIds` list reaching PostgREST as an empty `.in()` (which matches nothing but still issues a query), and a Supabase fault being swallowed instead of thrown (invariant 9).

- [ ] **Step 1: Write the failing test**

Create `tests/adminAlerts/resolveTileAlertsForObserver.test.ts (new)`:

```ts
import { describe, expect, test, vi } from "vitest";

import { resolveTileAlertsForObserver } from "@/lib/adminAlerts/resolveTileAlertsForObserver";

/** Minimal PostgREST builder double: every filter returns `this`, `select` settles. */
function clientReturning(result: { error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  for (const m of ["update", "eq", "is", "in"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.select = vi.fn(async () => result);
  const from = vi.fn(() => builder);
  return { client: { from } as never, from, builder };
}

describe("resolveTileAlertsForObserver", () => {
  test("empty tileIds issues NO supabase call", async () => {
    const { client, from } = clientReturning({ error: null });
    await resolveTileAlertsForObserver({ showId: "show-1", viewerKey: "crew-1", tileIds: [] }, client);
    expect(from).not.toHaveBeenCalled();
  });

  test("filters on code, show, observer and tiles", async () => {
    const { client, builder, from } = clientReturning({ error: null });
    await resolveTileAlertsForObserver(
      { showId: "show-1", viewerKey: "crew-1", tileIds: ["crew:gear:scope"] },
      client,
    );
    expect(from).toHaveBeenCalledWith("admin_alerts");
    expect(builder.eq).toHaveBeenCalledWith("code", "TILE_SERVER_RENDER_FAILED");
    expect(builder.eq).toHaveBeenCalledWith("show_id", "show-1");
    expect(builder.eq).toHaveBeenCalledWith("context->>viewerKey", "crew-1");
    expect(builder.is).toHaveBeenCalledWith("resolved_at", null);
    expect(builder.in).toHaveBeenCalledWith("context->>tileId", ["crew:gear:scope"]);
  });

  test("a null showId filters IS NULL rather than eq", async () => {
    const { client, builder } = clientReturning({ error: null });
    await resolveTileAlertsForObserver(
      { showId: null, viewerKey: "admin", tileIds: ["crew:gear:scope"] },
      client,
    );
    expect(builder.is).toHaveBeenCalledWith("show_id", null);
  });

  test("sets resolved_at only, never resolved_by", async () => {
    const { client, builder } = clientReturning({ error: null });
    await resolveTileAlertsForObserver(
      { showId: "show-1", viewerKey: "crew-1", tileIds: ["crew:gear:scope"] },
      client,
    );
    const patch = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(patch)).toEqual(["resolved_at"]);
  });

  test("throws on a returned DB error", async () => {
    const { client } = clientReturning({ error: { message: "boom" } });
    await expect(
      resolveTileAlertsForObserver(
        { showId: "show-1", viewerKey: "crew-1", tileIds: ["crew:gear:scope"] },
        client,
      ),
    ).rejects.toThrow(/boom/);
  });

  test("throws on a thrown query fault", async () => {
    const builder: Record<string, unknown> = {};
    for (const m of ["update", "eq", "is", "in"]) builder[m] = vi.fn(() => builder);
    builder.select = vi.fn(async () => {
      throw new Error("socket closed");
    });
    const client = { from: vi.fn(() => builder) } as never;
    await expect(
      resolveTileAlertsForObserver(
        { showId: "show-1", viewerKey: "crew-1", tileIds: ["crew:gear:scope"] },
        client,
      ),
    ).rejects.toThrow(/socket closed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/adminAlerts/resolveTileAlertsForObserver.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/adminAlerts/resolveTileAlertsForObserver.ts (new)`:

```ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export type ResolveTileAlertsForObserverInput = {
  showId: string | null;
  /** The observer whose render made this observation: crew member id, or "admin". */
  viewerKey: string;
  /** Tiles that demonstrably rendered clean THIS request. */
  tileIds: readonly string[];
};

/**
 * Resolve TILE_SERVER_RENDER_FAILED rows this observer is entitled to clear.
 *
 * Keyed on BOTH discriminators (spec §4.6): permission gates live inside the
 * wrapped seam, so a viewer who skips the failing path must not clear an alert
 * that is still live for the viewer who reaches it.
 *
 * Sets `resolved_at` only; `resolved_by` stays NULL, the system-resolved
 * convention of every precedent.
 */
export async function resolveTileAlertsForObserver(
  input: ResolveTileAlertsForObserverInput,
  client?: Client,
): Promise<void> {
  // An empty `.in()` list must never reach PostgREST (mirrors resolveAdminAlerts).
  if (input.tileIds.length === 0) return;

  const supabase = client ?? createSupabaseServiceRoleClient();
  let query = supabase
    .from("admin_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("code", "TILE_SERVER_RENDER_FAILED")
    .eq("context->>viewerKey", input.viewerKey)
    .in("context->>tileId", [...input.tileIds])
    .is("resolved_at", null);

  query = input.showId === null ? query.is("show_id", null) : query.eq("show_id", input.showId);

  const { error } = await query.select("id");

  if (error) {
    throw new Error(`tile alert resolve failed: ${error.message ?? String(error)}`);
  }
}
```

- [ ] **Step 4: Verify the service-role import path**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && rg -n "createSupabaseServiceRoleClient" lib/adminAlerts/resolveAdminAlert.ts`
Copy the exact import specifier from that file into the new module if it differs from the one written above. Do not guess.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/adminAlerts/resolveTileAlertsForObserver.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Register in the infra-contract registry**

In `tests/notify/_metaInfraContract.test.ts`, add to the `REGISTERED` array (alongside the existing `lib/adminAlerts/resolveAdminAlert.ts` row):

```ts
  { path: "lib/adminAlerts/resolveTileAlertsForObserver.ts" },
```

- [ ] **Step 7: Run the infra-contract meta-test**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/notify/_metaInfraContract.test.ts`
Expected: PASS. If it fails on a missing behavioral case, add one mirroring the existing `resolveAdminAlert` case at `tests/notify/_metaInfraContract.test.ts:177` asserting both the returned-error and thrown-fault paths throw.

- [ ] **Step 8: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git add lib/adminAlerts/resolveTileAlertsForObserver.ts tests/adminAlerts/resolveTileAlertsForObserver.test.ts tests/notify/_metaInfraContract.test.ts
git commit -m "feat(admin): add observer-keyed tile alert resolver"
```

---

### Task 3: The sweep

**Files:**
- Create: `lib/crew/sweepTileRenderAlerts.ts (new)`
- Test: `tests/crew/sweepTileRenderAlerts.test.ts (new)`

**Interfaces:**
- Consumes: `TileRenderLedger`, `cleanTileIds` (Task 1); `resolveTileAlertsForObserver` (Task 2).
- Produces: `sweepTileRenderAlerts(ledger: TileRenderLedger, args: { showId: string | null; sheetName: string | null; viewerKey: string }): Promise<void>`.

**Failure mode this catches:** the four that rounds 1 to 3 found, a lost `context.message`, a resolve that clears the row a raise just wrote, a resolve that clears another observer's live failure, and a spurious resolve that never re-raises.

- [ ] **Step 1: Write the failing test**

Create `tests/crew/sweepTileRenderAlerts.test.ts (new)`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

const { upsertMock, resolveMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(async () => null),
  resolveMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert: upsertMock }));
vi.mock("@/lib/adminAlerts/resolveTileAlertsForObserver", () => ({
  resolveTileAlertsForObserver: resolveMock,
}));

import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { sweepTileRenderAlerts } from "@/lib/crew/sweepTileRenderAlerts";

const ARGS = { showId: "show-1", sheetName: "RPAS Central 2026", viewerKey: "crew-dana" };

function ledger(attempted: string[], failed: Record<string, string> = {}): TileRenderLedger {
  const l = createTileRenderLedger();
  for (const id of attempted) l.attempted.add(id);
  for (const [id, msg] of Object.entries(failed)) l.failed.set(id, msg);
  return l;
}

beforeEach(() => {
  upsertMock.mockClear();
  resolveMock.mockClear();
});

describe("sweepTileRenderAlerts", () => {
  // T2, message carriage (spec §7.2)
  test("carries the thrown message into context.message", async () => {
    await sweepTileRenderAlerts(
      ledger(["crew:gear:scope"], { "crew:gear:scope": "scope projection blew up" }),
      ARGS,
    );
    expect(upsertMock).toHaveBeenCalledWith({
      showId: "show-1",
      code: "TILE_SERVER_RENDER_FAILED",
      context: {
        tileId: "crew:gear:scope",
        message: "scope projection blew up",
        sheet_name: "RPAS Central 2026",
        viewerKey: "crew-dana",
      },
    });
  });

  // T3, raise before resolve (spec §7.2)
  test("the failed tile is raised and is NOT in the resolve set", async () => {
    await sweepTileRenderAlerts(
      ledger(["crew:gear:scope", "crew:today:notes"], { "crew:gear:scope": "boom" }),
      ARGS,
    );
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const resolved = resolveMock.mock.calls[0]?.[0] as { tileIds: string[] };
    expect(resolved.tileIds).toEqual(["crew:today:notes"]);
    expect(resolved.tileIds).not.toContain("crew:gear:scope");
  });

  test("raise happens before resolve", async () => {
    const order: string[] = [];
    upsertMock.mockImplementationOnce(async () => {
      order.push("raise");
      return null;
    });
    resolveMock.mockImplementationOnce(async () => {
      order.push("resolve");
    });
    await sweepTileRenderAlerts(
      ledger(["crew:gear:scope", "crew:today:notes"], { "crew:gear:scope": "boom" }),
      ARGS,
    );
    expect(order).toEqual(["raise", "resolve"]);
  });

  // T6, observer keying (spec §7.2)
  test("the resolve carries THIS render's viewerKey", async () => {
    await sweepTileRenderAlerts(ledger(["crew:today:notes"]), ARGS);
    expect(resolveMock).toHaveBeenCalledWith({
      showId: "show-1",
      viewerKey: "crew-dana",
      tileIds: ["crew:today:notes"],
    });
  });

  // T7, the admin sentinel (spec §7.2)
  test("a plain-admin render sweeps under the admin key", async () => {
    await sweepTileRenderAlerts(ledger(["crew:today:notes"]), { ...ARGS, viewerKey: "admin" });
    expect(resolveMock).toHaveBeenCalledWith(
      expect.objectContaining({ viewerKey: "admin" }),
    );
  });

  test("an all-clean render raises nothing", async () => {
    await sweepTileRenderAlerts(ledger(["crew:today:notes", "crew:gear:scope"]), ARGS);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("a tile that never ran is neither raised nor resolved", async () => {
    await sweepTileRenderAlerts(ledger(["crew:today:notes"]), ARGS);
    const resolved = resolveMock.mock.calls[0]?.[0] as { tileIds: string[] };
    expect(resolved.tileIds).not.toContain("crew:budget:rows");
  });

  // T4, the race is self-healing (spec §4.7, §7.2)
  test("a spuriously resolved tile is re-raised by the next failing sweep", async () => {
    // Sweep 1: the observer sees the tile clean (stale view) -> it resolves.
    await sweepTileRenderAlerts(ledger(["crew:travel:transport"]), ARGS);
    expect(upsertMock).not.toHaveBeenCalled();
    // Sweep 2: the condition is in fact still true for this observer -> re-raised.
    upsertMock.mockClear();
    await sweepTileRenderAlerts(
      ledger(["crew:travel:transport"], { "crew:travel:transport": "still broken" }),
      ARGS,
    );
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]?.[0]).toMatchObject({
      context: expect.objectContaining({ tileId: "crew:travel:transport" }),
    });
  });

  test("an upsert failure does not prevent the resolve", async () => {
    upsertMock.mockRejectedValueOnce(new Error("supabase down"));
    await expect(
      sweepTileRenderAlerts(
        ledger(["crew:gear:scope", "crew:today:notes"], { "crew:gear:scope": "boom" }),
        ARGS,
      ),
    ).resolves.toBeUndefined();
    expect(resolveMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/crew/sweepTileRenderAlerts.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/crew/sweepTileRenderAlerts"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/crew/sweepTileRenderAlerts.ts (new)`:

```ts
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { resolveTileAlertsForObserver } from "@/lib/adminAlerts/resolveTileAlertsForObserver";
import { cleanTileIds, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { log } from "@/lib/log";

export type SweepTileRenderAlertsArgs = {
  showId: string | null;
  sheetName: string | null;
  /** crew member id, or "admin" for a plain-admin render (spec §4.6). */
  viewerKey: string;
};

/**
 * Post-response reconcile for TILE_SERVER_RENDER_FAILED (spec §4.10).
 *
 * Pure with respect to the request: takes the ledger as a parameter so it is
 * testable without an RSC scope. Raise-before-resolve, so a tile raised here is
 * by construction absent from the clean set and cannot be cleared by step 2.
 *
 * Best-effort by contract: a failure here must never affect the crew render, so
 * both halves are fail-quiet with their own forensic log codes.
 */
export async function sweepTileRenderAlerts(
  ledger: TileRenderLedger,
  args: SweepTileRenderAlertsArgs,
): Promise<void> {
  for (const [tileId, message] of ledger.failed) {
    try {
      await upsertAdminAlert({
        showId: args.showId,
        code: "TILE_SERVER_RENDER_FAILED",
        context: {
          tileId,
          message,
          sheet_name: args.sheetName,
          viewerKey: args.viewerKey,
        },
      });
    } catch (e) {
      void log.warn("tile render alert upsert failed (fail-quiet):", {
        source: "crew.tileSweep",
        code: "CREW_TILE_ALERT_UPSERT_FAILED",
        tileId,
        error: e,
      });
    }
  }

  try {
    await resolveTileAlertsForObserver({
      showId: args.showId,
      viewerKey: args.viewerKey,
      tileIds: cleanTileIds(ledger),
    });
  } catch (e) {
    void log.warn("tile render alert resolve failed (fail-quiet):", {
      source: "crew.tileSweep",
      code: "CREW_TILE_ALERT_RESOLVE_FAILED",
      error: e,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/crew/sweepTileRenderAlerts.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify the log-code scanner accepts the two new codes**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/cross-cutting/codes.test.ts`
Expected: PASS. These are `app_events` log codes, not §12.4 catalog codes, so no catalog row is required, the same posture as the existing `CREW_PROJECTION_ALERT_UPSERT_FAILED` at `app/show/[slug]/[shareToken]/_CrewShell.tsx:175`. If the scanner flags them, mirror whatever exemption that existing code carries.

- [ ] **Step 6: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git add lib/crew/sweepTileRenderAlerts.ts tests/crew/sweepTileRenderAlerts.test.ts
git commit -m "feat(crew-page): add post-response tile alert sweep"
```

---

### Task 4: `WrappedSection` records instead of raising

**Files:**
- Modify: `components/crew/WrappedSection.tsx`
- Modify: `tests/components/crew/wrappedSection.test.tsx`
- Modify: `tests/components/crew/wrappedSectionDurability.test.tsx`

**Interfaces:**
- Consumes: `TileRenderLedger` (Task 1).
- Produces: `WrappedSectionProps` gains a required `ledger: TileRenderLedger`.

**Failure mode this catches:** a section that throws but leaves no trace in the ledger (so the sweep can neither raise nor keep the alert open), and a stale test that still asserts the removed upsert.

- [ ] **Step 1: Rewrite the two existing test files**

In `tests/components/crew/wrappedSection.test.tsx`, replace every assertion about `upsertAdminAlert` with ledger assertions. The three tests at line 55, line 90 and line 105 become:

```tsx
test("WrappedSection catches a synchronous render() throw, renders the fallback, and records the failure", () => {
  const ledger = createTileRenderLedger();
  const { getByTestId } = render(
    <WrappedSection
      tileId="crew:gear:scope"
      showId="show-xyz"
      sheetName="RPAS Central 2026"
      ledger={ledger}
      render={() => {
        throw new Error("scope projection blew up");
      }}
    />,
  );
  expect(getByTestId("tile-error-fallback")).toBeTruthy();
  expect(ledger.attempted.has("crew:gear:scope")).toBe(true);
  expect(ledger.failed.get("crew:gear:scope")).toBe("scope projection blew up");
});

test("WrappedSection renders the block output unchanged when render() succeeds, and records it clean", () => {
  const ledger = createTileRenderLedger();
  const { getByText } = render(
    <WrappedSection
      tileId="crew:gear:scope"
      showId="show-xyz"
      sheetName="RPAS Central 2026"
      ledger={ledger}
      render={() => <p>gear body</p>}
    />,
  );
  expect(getByText("gear body")).toBeTruthy();
  expect(ledger.attempted.has("crew:gear:scope")).toBe(true);
  expect(ledger.failed.size).toBe(0);
});
```

Add the import `import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";`. Replace `tile-error-fallback` with whatever `data-testid` `TileErrorFallback` actually renders, run `rg -n "data-testid" components/shared/TileErrorFallback.tsx` and use the real value.

For the third test at line 105 (a real `CrewSection` throw), keep the containment assertion and swap the upsert assertion for `expect(ledger.failed.size).toBe(1)`.

`tests/components/crew/wrappedSectionDurability.test.tsx` **inverts**. Replace its whole body with:

```tsx
// @vitest-environment jsdom
//
// Inverted premise (spec §4.5): WrappedSection no longer owns the alert write,
// so it must register NO after() work on either path. The durability guarantee
// moved to the shell sweep and is pinned by tests/components/crew/crewShellSweep.test.tsx.
import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

const { afterMock } = vi.hoisted(() => ({ afterMock: vi.fn() }));
vi.mock("next/server", () => ({ after: afterMock }));

import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { WrappedSection } from "@/components/crew/WrappedSection";

describe("WrappedSection no longer schedules post-response work", () => {
  test("a throwing render registers no after() work", () => {
    render(
      <WrappedSection
        tileId="crew:gear:scope"
        showId="show-xyz"
        sheetName="RPAS Central 2026"
        ledger={createTileRenderLedger()}
        render={() => {
          throw new Error("boom");
        }}
      />,
    );
    expect(afterMock).not.toHaveBeenCalled();
  });

  test("a successful render registers no after() work", () => {
    render(
      <WrappedSection
        tileId="crew:gear:scope"
        showId="show-xyz"
        sheetName="RPAS Central 2026"
        ledger={createTileRenderLedger()}
        render={() => <p>ok</p>}
      />,
    );
    expect(afterMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/components/crew/wrappedSection.test.tsx tests/components/crew/wrappedSectionDurability.test.tsx`
Expected: FAIL, `ledger` is not a known prop.

- [ ] **Step 3: Modify the component**

In `components/crew/WrappedSection.tsx`:

1. Replace the `next/server` and `upsertAdminAlert` imports with `import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";`. Keep the `log` import.
2. Add to `WrappedSectionProps` (after `sheetName`):

```tsx
  /**
   * Per-request ledger this section records into. REQUIRED so a section cannot
   * be mounted without one; §7.1 assertion 2 additionally bounds who may
   * construct a section at all (spec §4.3).
   */
  ledger: TileRenderLedger;
```

3. Destructure `ledger` in the parameter list and replace the body:

```tsx
export function WrappedSection({
  tileId,
  showId,
  sheetName,
  ledger,
  render,
  fallback,
}: WrappedSectionProps): ReactNode {
  ledger.attempted.add(tileId);
  try {
    return render();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    ledger.failed.set(tileId, err.message);
    log.error("render threw", {
      source: "crew.wrappedSection",
      tileId,
      showId,
      error: err,
    });
    return fallback ?? <TileErrorFallback />;
  }
}
```

`showId` and `sheetName` stay in the props even though this component no longer writes the alert: they remain part of the documented contract and `showId` is still logged. Do not remove them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/components/crew/wrappedSection.test.tsx tests/components/crew/wrappedSectionDurability.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git add components/crew/WrappedSection.tsx tests/components/crew/wrappedSection.test.tsx tests/components/crew/wrappedSectionDurability.test.tsx
git commit -m "refactor(crew-page): WrappedSection records to the ledger instead of raising"
```

---

### Task 5: Thread the ledger and register the sweep

**Files:**
- Modify: `app/show/[slug]/[shareToken]/_CrewShell.tsx`
- Modify: all 7 files in `components/crew/sections/`
- Create: `tests/components/crew/crewShellSweep.test.tsx (new)`
- Modify: the section-constructing test files (list derived at execution time)

**Interfaces:**
- Consumes: `createTileRenderLedger` (Task 1), `sweepTileRenderAlerts` (Task 3), `WrappedSectionProps.ledger` (Task 4).
- Produces: each section's props type gains `ledger: TileRenderLedger`.

**Failure mode this catches:** a sweep registered as `void`ed fire-and-forget (which a serverless freeze can drop), and a section wired to a ledger the sweep never reads.

- [ ] **Step 1: Write the failing sweep test**

Create `tests/components/crew/crewShellSweep.test.tsx (new)`:

```tsx
// @vitest-environment jsdom
//
// T5, durability (spec §7.2). The assertion that matters is that the callback
// RETURNS its promise: `after(() => { void sweep() })` would satisfy a
// "was after() called" check while still letting a serverless freeze drop the
// write, which is the defect round 2 identified.
import { describe, expect, test, vi } from "vitest";

const { afterMock, sweepMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  sweepMock: vi.fn(),
}));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@/lib/crew/sweepTileRenderAlerts", () => ({ sweepTileRenderAlerts: sweepMock }));

describe("the crew shell's tile sweep is durable", () => {
  test("the registered callback returns the sweep promise", async () => {
    let settled = false;
    sweepMock.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            settled = true;
            resolve();
          }, 0),
        ),
    );

    // Find the sweep registration among the shell's after() calls. The shell also
    // registers the projection-alert resolve, so filter to the one that invokes
    // the sweep rather than assuming a call index.
    const { runShellForTest } = await import("./_crewShellSweepHarness");
    await runShellForTest();

    const returned = afterMock.mock.calls
      .map(([cb]) => (cb as () => unknown)())
      .filter((r): r is Promise<unknown> => r instanceof Promise);

    expect(returned.length).toBeGreaterThan(0);
    await Promise.all(returned);
    expect(settled).toBe(true);
    expect(sweepMock).toHaveBeenCalled();
  });
});
```

**Note for the implementer:** `_crewShellSweepHarness` does not exist. Before writing this test, decide the cheapest way to exercise the registration: either (a) export the callback factory from `_CrewShell.tsx` and call it directly, or (b) render `CrewShell` with the existing fixture used by `tests/components/crew/crewShellAlert.test.tsx` and read `afterMock`. Prefer (b), reusing that file's fixture verbatim, read it first with `rg -n "CrewShell" tests/components/crew/crewShellAlert.test.tsx`, and delete the `_crewShellSweepHarness` import above in favour of the real render. The assertion body (returned promise settles, sweep called) is what must survive whichever route you take.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/components/crew/crewShellSweep.test.tsx`
Expected: FAIL, no sweep is registered yet.

- [ ] **Step 3: Add the ledger prop to all 7 sections**

In each of `components/crew/sections/{Today,Schedule,Venue,Travel,Crew,Gear,Budget}Section.tsx`:

1. Add `import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";`
2. Add `ledger: TileRenderLedger;` to the props type.
3. Destructure `ledger` in the parameter list.
4. Pass `ledger={ledger}` to the `<WrappedSection>` invocation.

The exact `<WrappedSection>` line numbers are: `TodaySection.tsx:174`, `ScheduleSection.tsx:184`, `VenueSection.tsx:328`, `TravelSection.tsx:163`, `CrewSection.tsx:116`, `GearSection.tsx:163`, `BudgetSection.tsx:67`. Re-verify each with `rg -n "<WrappedSection" components/crew/sections/` before editing, line numbers drift.

- [ ] **Step 4: Wire the shell**

In `app/show/[slug]/[shareToken]/_CrewShell.tsx`:

1. Add imports:

```tsx
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { sweepTileRenderAlerts } from "@/lib/crew/sweepTileRenderAlerts";
```

2. Immediately before `const renderOne = (id: SectionId): JSX.Element => {` (currently line 332), create the ledger and derive the observer key:

```tsx
  // Per-request tile ledger (spec §4.3). Created ONCE here, in the component
  // body, never inside the after() callback, which runs after the render
  // lifecycle and would observe a different object.
  const tileLedger = createTileRenderLedger();
  // Observer key (spec §4.6): a crew member id, or the "admin" sentinel for a
  // plain-admin render, whose all-flags path differs from every crew member's.
  const viewerKey = data.viewerId ?? "admin";
```

3. Pass `ledger={tileLedger}` to all 7 section elements inside `renderOne`.

4. After the `sectionNodes` assignment (currently lines 413-415) and before the `return (`, register the sweep:

```tsx
  // Post-response reconcile for TILE_SERVER_RENDER_FAILED. Registered
  // UNCONDITIONALLY, independent of the projection-alert branch above, whose
  // condition is a different observation. The callback RETURNS the promise so
  // the runtime keeps the function alive until the write settles (spec §4.10);
  // a voided call would let a serverless freeze drop the row.
  try {
    after(() => sweepTileRenderAlerts(tileLedger, { showId, sheetName: data.show.title, viewerKey }));
  } catch {
    // no request scope (unit tests): skip, the next real request sweeps
  }
```

- [ ] **Step 5: Fix every section-constructing test**

Run the sweep to get the current list:

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
for c in TodaySection ScheduleSection VenueSection TravelSection CrewSection GearSection BudgetSection; do
  rg -l -e "<${c}\b" tests/
done | sort -u
```

Expected: 29 files at plan time. Add a shared helper so each file takes one edit. Create `tests/components/crew/sections/_ledgerProp.ts (new)`:

```ts
import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";

/** Spread into any crew-section construction in tests: `{...ledgerProp()}`. */
export function ledgerProp(): { ledger: TileRenderLedger } {
  return { ledger: createTileRenderLedger() };
}
```

Then in each listed file, import it and spread `{...ledgerProp()}` into every section construction.

- [ ] **Step 6: Typecheck as the completeness oracle**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && pnpm typecheck`
Expected: PASS. Any remaining construction missing the prop fails here with `Property 'ledger' is missing`. Fix and re-run until clean. **Do not skip this step**, it is the only exhaustive check that every construction was updated.

- [ ] **Step 7: Run the sweep test and the crew suite**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/components/crew/ tests/crew/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git add app/show/ components/crew/sections/ tests/components/crew/ tests/crew/
git commit -m "feat(crew-page): thread the tile ledger and register the shell sweep"
```

---

### Task 6: The topology meta-test

**Files:**
- Create: `tests/crew/_metaTileProducerTopology.test.ts (new)`

**Interfaces:**
- Consumes: nothing at runtime, it reads source files from disk.
- Produces: nothing.

**Failure mode this catches:** a future route mounting a crew section outside the shell (which would record into an unswept ledger and silently emit no alert), a re-added per-component raise, and a sweep regressed to a voided call.

- [ ] **Step 1: Write the failing test**

Create `tests/crew/_metaTileProducerTopology.test.ts (new)`:

```ts
/**
 * Structural defense for the tile-render alert producer (spec §7.1).
 *
 * Filesystem-walked so a NEW surface fails by default. The required `ledger`
 * prop removes the silent-omission variant; assertion 2 here is what actually
 * bounds ownership, because a caller could otherwise type-safely pass a
 * throwaway ledger the sweep never reads.
 */
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SHELL = "app/show/[slug]/[shareToken]/_CrewShell.tsx";

const SECTION_COMPONENTS = [
  "TodaySection",
  "ScheduleSection",
  "VenueSection",
  "TravelSection",
  "CrewSection",
  "GearSection",
  "BudgetSection",
] as const;

/** tileId per SectionId, spec §4.4. */
const EXPECTED_TILE_IDS = [
  "crew:budget:rows",
  "crew:crew:roster",
  "crew:gear:scope",
  "crew:schedule:days",
  "crew:today:notes",
  "crew:travel:transport",
  "crew:venue:diagrams",
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, acc);
    else if (rel.endsWith(".tsx") || rel.endsWith(".ts")) acc.push(rel);
  }
  return acc;
}

const PRODUCTION_FILES = [...walk("components"), ...walk("app")];
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("META tile producer topology", () => {
  test("every <WrappedSection> call site lives in components/crew/sections/", () => {
    const offenders = PRODUCTION_FILES.filter(
      (f) => /<WrappedSection[\s/>]/.test(read(f)) && !f.startsWith(join("components", "crew", "sections")),
    );
    expect(offenders, `unexpected <WrappedSection> outside the sections dir: ${offenders.join(", ")}`).toEqual([]);
  });

  test("the tileId literals are exactly the documented set", () => {
    const found = new Set<string>();
    for (const f of PRODUCTION_FILES) {
      for (const m of read(f).matchAll(/tileId="(crew:[^"]+)"/g)) found.add(m[1] as string);
    }
    expect([...found].sort()).toEqual(EXPECTED_TILE_IDS);
  });

  test("sections are constructed ONLY in the crew shell", () => {
    const offenders: string[] = [];
    for (const f of PRODUCTION_FILES) {
      if (f === SHELL) continue;
      const src = read(f);
      for (const name of SECTION_COMPONENTS) {
        // Word boundary matters: `<CrewSection` without it also matches
        // `<CrewSections`, the client controller.
        if (new RegExp(`<${name}[\\s/>]`).test(src)) offenders.push(`${f}:${name}`);
      }
    }
    expect(offenders, `crew sections constructed outside the shell: ${offenders.join(", ")}`).toEqual([]);
  });

  test("the shell registers the sweep and RETURNS its promise", () => {
    const src = read(SHELL);
    expect(src).toMatch(/after\(\(\)\s*=>\s*sweepTileRenderAlerts\(/);
    expect(src, "the sweep promise must be returned, not voided").not.toMatch(
      /after\(\(\)\s*=>\s*\{\s*void\s+sweepTileRenderAlerts/,
    );
  });

  test("the ledger is created once, in the component body", () => {
    const src = read(SHELL);
    expect(src.match(/createTileRenderLedger\(\)/g) ?? []).toHaveLength(1);
    expect(src, "createTileRenderLedger() must not be called inside the after() callback").not.toMatch(
      /after\([^)]*createTileRenderLedger/,
    );
  });

  test("WrappedSection contains no alert write", () => {
    expect(read("components/crew/WrappedSection.tsx")).not.toMatch(/upsertAdminAlert/);
  });

  test("WrappedTile has no production call site, keeping TileServerFallback dormant", () => {
    const offenders = PRODUCTION_FILES.filter(
      (f) => f !== join("components", "shared", "WrappedTile.tsx") && /<WrappedTile[\s/>]/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes against the Task 5 state**

Run: `cd /Users/ericweiss/FX-worktrees/alert-autoresolve && npx vitest run tests/crew/_metaTileProducerTopology.test.ts`
Expected: PASS, 7 tests. If assertion 3 fails, a section is constructed outside the shell, investigate rather than relaxing the assertion.

- [ ] **Step 3: Prove each assertion fails when violated**

For each of these, make the edit, confirm the named test FAILS, then revert with `git checkout -- <file>`:

1. Add `<WrappedSection tileId="crew:x:y" showId={null} sheetName={null} ledger={l} render={() => null} />` to `components/crew/DiagramsBlock.tsx` → assertion 1 fails.
2. Add `upsertAdminAlert({})` inside `components/crew/WrappedSection.tsx` → assertion 6 fails.
3. Change the shell's registration to `after(() => { void sweepTileRenderAlerts(...) })` → assertion 4 fails.
4. Move `createTileRenderLedger()` inside the `after()` callback → assertion 5 fails.

**Commit nothing from this step.** Verify `git status` is clean before continuing.

- [ ] **Step 4: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git add tests/crew/_metaTileProducerTopology.test.ts
git commit -m "test(crew-page): pin tile producer topology"
```

---

### Task 7: Registry lockstep

**Files:**
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts`
- Modify: `tests/adminAlerts/alertProducerScope.registry.ts`
- Modify: `tests/adminAlerts/producerContexts.ts`
- Modify: `tests/messages/_metaEmphasisRenderContract.test.ts`

**Interfaces:** none, registry data only.

**Failure mode this catches:** a lifecycle class that no longer matches the code's behavior, a producer whose context keys are undeclared, and a representative-context fixture that describes a producer that does not exist.

- [ ] **Step 1: Reclassify the lifecycle entry**

In `tests/messages/_metaAdminAlertCatalog.test.ts`, replace the entry at line 455:

```ts
  // Hybrid (spec 2026-07-24 §4.9): self-clears when the SAME observer renders the
  // tile clean, while the manual Resolve button stays because re-detection needs
  // that specific observer to load the page again.
  TILE_SERVER_RENDER_FAILED: {
    class: "hybrid",
    resolveSites: [
      {
        file: "app/show/[slug]/[shareToken]/_CrewShell.tsx",
        pattern: /sweepTileRenderAlerts/,
      },
    ],
  },
```

Remove the now-empty `state-manual-justified` section comment above it.

- [ ] **Step 2: Update the counts and the prose docstring**

At lines 736-739 change the hybrid expectation from `.toBe(1)` to `.toBe(2)` and update its message to name both hybrid codes. Update the state-manual-justified expectation to 0. Do **not** touch the auto assertion at lines 732-734.

In the docstring at lines 272-280, change `1 "hybrid"` to `2 "hybrid"`, `1 "state-manual-justified"` to `0 "state-manual-justified"`, and update the arithmetic line to `26 + 17 + 2 + 0 = 45`.

- [ ] **Step 3: Add the producer-scope row**

In `tests/adminAlerts/alertProducerScope.registry.ts`, add:

```ts
  {
    site: "app/show/[slug]/[shareToken]/_CrewShell.tsx",
    computedContext: true,
    contextKeys: ["tileId", "message", "sheet_name", "viewerKey"],
    code: "TILE_SERVER_RENDER_FAILED",
    scope: "per-show",
    dynamic: true,
    note: "post-response sweep; viewerKey is the observer discriminator (spec 2026-07-24 §4.6)",
  },
```

Re-read a neighbouring row first and match its field set exactly, if `dynamic` or `computedContext` is not present on comparable rows, drop it rather than inventing it.

- [ ] **Step 4: Correct the representative context**

In `tests/adminAlerts/producerContexts.ts:276-280`, replace the `TILE_SERVER_RENDER_FAILED` entry's context with the keys the producer actually writes:

```ts
    context: {
      tileId: "crew:gear:scope",
      message: "scope projection blew up",
      sheet_name: "My Sheet",
      viewerKey: "00000000-0000-4000-8000-000000000001",
    },
```

The previous `{ drive_file_id, sheet_name, section }` described a producer that does not exist; the gate at `tests/adminAlerts/producerKeyAggregation.test.ts:50-59` was dormant only because the code had no producer row.

- [ ] **Step 5: Fix the stale producer claim**

In `tests/messages/_metaEmphasisRenderContract.test.ts:162-170`, update the reference to `WrappedSection` as the `TILE_SERVER_RENDER_FAILED` producer to name `_CrewShell.tsx`. Read the block first, if it is a comment only, update the comment; if it is an assertion, update the asserted path.

- [ ] **Step 6: Run every affected gate**

Run:
```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
npx vitest run tests/messages/_metaAdminAlertCatalog.test.ts tests/adminAlerts/ tests/messages/_metaEmphasisRenderContract.test.ts
```
Expected: PASS. `producerKeyAggregation` is the one most likely to fail first; its offender list names the exact key mismatch.

- [ ] **Step 7: Verify the untouched invariants**

Run:
```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git diff --stat origin/main -- lib/adminAlerts/resolveActionLabel.ts tests/adminAlerts/resolveIntentsBaseline.json lib/messages/catalog.ts
```
Expected: **empty output**. Any diff here violates a global constraint, revert it.

- [ ] **Step 8: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git add tests/messages/ tests/adminAlerts/
git commit -m "test(alerts): reclassify tile render alert to hybrid and register its producer"
```

---

### Task 8: Close the four backlog entries

**Files:**
- Modify: `BACKLOG.md`
- Modify: `BACKLOG-archive.md`
- Modify: `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md`

**Interfaces:** none.

**Failure mode this catches:** a shipped design still advertised as open work, and a parent spec whose class counts contradict the registry.

- [ ] **Step 1: Move all four entries**

Cut these from `BACKLOG.md` (currently lines 153-175) and paste each into `BACKLOG-archive.md`, id and body preserved verbatim per that file's stated convention, appending a `**Status:** ✅ RESOLVED` paragraph to each:

1. `BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE`, cite spec §2.1's table (already shipped by the resolve-truthing spec; no code shipped here).
2. `BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE`, cite spec §2.2, and state the dormancy plus the re-enable pointer at `DEFERRED-archive.md:861`.
3. `BL-ALERT-REPORT-FAMILY-AUTORESOLVE`, resolved as EVALUATED, no change; cite spec §5 and name both rejected designs with the clause each fails.
4. `BL-ALERT-TILE-RENDER-PER-TILE-KEYING`, resolved by this PR; cite spec §4 and note that keying is on (tileId, viewerKey) via `context`, with no DDL.

- [ ] **Step 2: Correct the parent spec**

In `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md`:
- Remove the two `DEFER` rows at lines 96-97 (`BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`) and replace each with an auto row citing `scripts/verify-branch-protection.ts:253`.
- Update the §3 class counts line at line 51 so it no longer reads `2 DEFER`.
- Leave the `TILE_SERVER_RENDER_FAILED` EVENT\* row's text but append: *"Superseded by `2026-07-24-alert-autoresolve-tile-and-report-family.md` §4: resolved per (tileId, viewerKey)."*

**Do not run prettier on this file**, it is the parent spec and reformatting it produces a large spurious diff.

- [ ] **Step 3: Verify no entry is left behind**

Run:
```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
rg -n "BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE|BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE|BL-ALERT-REPORT-FAMILY-AUTORESOLVE|BL-ALERT-TILE-RENDER-PER-TILE-KEYING" BACKLOG.md
```
Expected: **no output**. Then confirm all four appear in `BACKLOG-archive.md`.

- [ ] **Step 4: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git add BACKLOG.md BACKLOG-archive.md docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md
git commit -m "docs(alerts): archive the four resolved alert-autoresolution backlog entries"
```

---

### Task 9: Full-suite gates and the UI dual-gate

**Files:** none (verification only, plus any fixes the gates surface).

- [ ] **Step 1: Run the full local suite**

Run:
```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
pnpm test; echo "EXIT=$?"
```
Expected: `EXIT=0`. **Check the exit code, not the summary line**, vitest exits 1 on uncaught errors even when every test passes.

- [ ] **Step 2: Run the remaining pre-push gates**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
pnpm typecheck && pnpm lint && pnpm format:check
```
Expected: all pass. `format:check` matters because commits here use `--no-verify`-equivalent hook bypass, so prettier never ran automatically.

- [ ] **Step 3: Run the impeccable dual-gate**

Two UI-surface files changed (`_CrewShell.tsx`, `WrappedSection.tsx`) plus 7 section files, so invariant 8 applies even though no rendered output changes. Run `/impeccable critique` and then `/impeccable audit` on the diff. Fix every P0 and P1, or record an explicit `DEFERRED.md` entry for each. Record findings and dispositions in the PR body.

- [ ] **Step 4: Re-attempt the adversarial spec review**

Round 4 was blocked by an upstream Codex outage (spec §13). Re-attempt it now:

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
node scripts/codex-guard.mjs review --brief .review/spec-r4/brief.md --cwd "$PWD" --out .review/spec-r5/out
```
If it returns a verdict, triage findings as usual. If it still returns `no_verdict` with 503s, proceed, spec §13 records the self-certification and the whole-diff review below is the remaining gate.

- [ ] **Step 5: Whole-diff cross-model review**

Dispatch a fresh-eyes review of the complete diff against `origin/main`, with the do-not-relitigate list from spec §12 inlined. Iterate to APPROVE.

- [ ] **Step 6: Push and merge**

```bash
cd /Users/ericweiss/FX-worktrees/alert-autoresolve
git push -u origin feat/alert-autoresolve-tile-report
gh pr create --fill
gh pr checks --watch
gh pr merge --merge
```
Then sync main and verify:
```bash
cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only && git rev-list --left-right --count main...origin/main
```
Expected: `0  0`.

---

## Self-review

**1. Spec coverage.** AC1–AC19 map to tasks as: AC1/AC4/AC5 → Task 3 + Task 5; AC2/AC3 → Task 3; AC6 → Task 3; AC7 → Task 3; AC8 → Task 4 + Task 5; AC9/AC10 → Task 6; AC11/AC12 → Task 7; AC13 → Task 5 Step 6; AC14 → Task 2; AC15/AC16 → Task 7 Step 7 + Task 8; AC17 → Task 9; AC18 → Task 9 Step 3; AC19 → Task 8. No AC is unassigned.

**2. Placeholder scan.** One deliberate soft spot: Task 5 Step 1's harness import is explicitly flagged as non-existent with two concrete alternatives and a stated preference, because the right route depends on the existing fixture's shape, which the implementer must read. Every other step carries real code.

**3. Type consistency.** `TileRenderLedger`, `createTileRenderLedger`, `cleanTileIds`, `sweepTileRenderAlerts`, `resolveTileAlertsForObserver` are used with identical names and signatures across Tasks 1, 2, 3, 4, 5 and 6. `viewerKey` is a `string` everywhere.

## Adversarial review (cross-model)

Required before execution handoff. Dispatch the plan to Codex with the spec §12 do-not-relitigate list inlined, plus: the pasted snippets have NOT yet been typechecked against the repo's strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), so ask the reviewer to attack them specifically.

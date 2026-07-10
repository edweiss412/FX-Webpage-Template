// @vitest-environment jsdom
/**
 * tests/admin/showOverrideBlocks.test.tsx — Task 14, Surface-B render (REST2-2).
 *
 * Proves the live-show override presenters render ALL SIX overridable fields through
 * <OverrideableField>, each wired with its LOADER-DERIVED props — matchKey (§8.2a,
 * derived from SOURCE, never the display value), expectedCurrentValue (CAS-B, RAW
 * loader-source, R17), currentLiveHotelName (§5.3) — and the REAL
 * setFieldOverrideAction as `onSave`.
 *
 * Anti-tautology: the crew fixture has an ACTIVE name override (sheet_name "Jon",
 * live name "John"), so a correct loader yields matchKey === "Jon" (the parsed key)
 * and expectedCurrentValue === "John" (the live value) — the test derives BOTH from
 * the fixture and asserts matchKey !== the display name. It runs the REAL
 * loadShowOverrides against a fixture Supabase client, then renders the presenters,
 * so a loader that keyed on the display value fails RED.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// Capture every <OverrideableField> the presenters mount, with its props.
type Capture = {
  domain: string;
  field: string;
  matchKey: string;
  expectedCurrentValue: unknown;
  currentLiveHotelName?: string;
  onSave: unknown;
};
const captured: Capture[] = [];
vi.mock("@/components/admin/overrides/OverrideableField", () => ({
  OverrideableField: (props: Capture) => {
    captured.push(props);
    return null;
  },
}));

import {
  ShowDetailsOverrideBlock,
  CrewOverrideFields,
  HotelsOverrideBlock,
  OrphanedOverridesBlock,
} from "@/components/admin/overrides/ShowOverrideBlocks";
import type { OrphanOverrideView } from "@/lib/overrides/loadShowOverrides";
import { loadShowOverrides } from "@/lib/overrides/loadShowOverrides";
import { setFieldOverrideAction } from "@/app/admin/show/[slug]/_actions/overrides";

const SHOW_ID = "55555555-5555-4555-8555-555555555555";
const DRIVE_FILE_ID = "drive-render";

// Fixture Supabase client — `.from(table)` resolves to that table's rows. Every
// chain method returns the same thenable node (the loader terminates each read on
// an awaited `.returns()`).
function fixtureClient(byTable: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const result = { data: byTable[table] ?? [], error: null };
      const node: Record<string, unknown> = {};
      const self = () => node;
      for (const m of ["select", "eq", "order", "returns", "limit"]) node[m] = self;
      node.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej);
      return node;
    },
  } as unknown as Parameters<typeof loadShowOverrides>[0];
}

afterEach(() => {
  captured.length = 0;
  cleanup();
});

describe("Surface-B live-show override presenters render all six fields (REST2-2)", () => {
  test("every (domain, field, row) mounts one <OverrideableField> with loader-derived props + the real action as onSave", async () => {
    // Fixture: crew member with an ACTIVE name override; one unique-name hotel.
    const crew = [{ id: "crew-1", name: "John", role: "Gaffer", sheet_name: "Jon" }];
    const showDates = { travelIn: "2026-06-13", showDays: ["2026-06-14"] };
    const showVenue = "Riverside Arena";

    const overrides = await loadShowOverrides(
      fixtureClient({
        admin_overrides: [
          {
            domain: "crew",
            field: "name",
            match_key: "Jon", // parsed key
            override_value: "John",
            sheet_value: "Jon",
            active: true,
            deactivation_code: null,
            version: 2,
          },
        ],
        hotel_reservations: [
          {
            id: "hotel-1",
            ordinal: 0,
            hotel_name: "Hilton Downtown",
            hotel_address: "1 Market St",
            check_in: "2026-06-14",
            confirmation_no: null,
          },
        ],
      }),
      { showId: SHOW_ID, crew, showDates, showVenue },
    );

    // Loader derivation (anti-tautology): crew matchKey is the SOURCE key, not display.
    expect(overrides.crew[0]!.matchKey).toBe("Jon");
    expect(overrides.crew[0]!.matchKey).not.toBe("John");

    render(
      <>
        <ShowDetailsOverrideBlock
          driveFileId={DRIVE_FILE_ID}
          show={overrides.show}
          onSave={setFieldOverrideAction}
        />
        {overrides.crew.map((view) => (
          <CrewOverrideFields
            key={view.id}
            driveFileId={DRIVE_FILE_ID}
            view={view}
            onSave={setFieldOverrideAction}
          />
        ))}
        <HotelsOverrideBlock
          driveFileId={DRIVE_FILE_ID}
          hotels={overrides.hotels}
          onSave={setFieldOverrideAction}
        />
      </>,
    );

    const key = (c: Capture) => `${c.domain}.${c.field}`;
    const byKey = new Map(captured.map((c) => [key(c), c]));

    // All six fields present, exactly one each.
    expect(captured.map(key).sort()).toEqual([
      "crew.name",
      "crew.role",
      "hotel.hotel_address",
      "hotel.hotel_name",
      "show.dates",
      "show.venue",
    ]);

    // Every field wired with the REAL action.
    for (const c of captured) expect(c.onSave).toBe(setFieldOverrideAction);

    // show — singleton match_key '', RAW loader-source CAS-B.
    expect(byKey.get("show.dates")!.matchKey).toBe("");
    expect(byKey.get("show.dates")!.expectedCurrentValue).toEqual(showDates);
    expect(byKey.get("show.venue")!.matchKey).toBe("");
    expect(byKey.get("show.venue")!.expectedCurrentValue).toBe("Riverside Arena");

    // crew — name + role SHARE the parsed matchKey; CAS-B is the LIVE value.
    expect(byKey.get("crew.name")!.matchKey).toBe("Jon");
    expect(byKey.get("crew.name")!.expectedCurrentValue).toBe("John");
    expect(byKey.get("crew.role")!.matchKey).toBe("Jon");
    expect(byKey.get("crew.role")!.expectedCurrentValue).toBe("Gaffer");

    // hotel — unique name → matchKey = hotel_name; both fields share it; live-name locator set.
    expect(byKey.get("hotel.hotel_name")!.matchKey).toBe("Hilton Downtown");
    expect(byKey.get("hotel.hotel_name")!.currentLiveHotelName).toBe("Hilton Downtown");
    expect(byKey.get("hotel.hotel_name")!.expectedCurrentValue).toBe("Hilton Downtown");
    expect(byKey.get("hotel.hotel_address")!.matchKey).toBe("Hilton Downtown");
    expect(byKey.get("hotel.hotel_address")!.expectedCurrentValue).toBe("1 Market St");
  });

  // R3 G2: the orphan block mounts an <OverrideableField> per orphaned override, wired
  // with the orphan's parsed matchKey + its paused (active:false) state + the real
  // action — so the paused-override needs-attention deep-link lands on a real
  // Re-point/Discard control instead of a dead end.
  test("OrphanedOverridesBlock mounts a paused OverrideableField for each orphan (G2)", async () => {
    const orphans: OrphanOverrideView[] = [
      {
        domain: "crew",
        field: "name",
        matchKey: "Jon",
        override: {
          overrideValue: "John",
          sheetValue: "Jon",
          active: false,
          deactivationCode: "target_missing",
          version: 2,
        },
      },
      {
        domain: "hotel",
        field: "hotel_name",
        matchKey: "Grand Marriott",
        override: {
          overrideValue: "Marriott Downtown",
          sheetValue: "Grand Marriott",
          active: false,
          deactivationCode: "target_missing",
          version: 2,
        },
      },
    ];

    render(
      <OrphanedOverridesBlock
        driveFileId={DRIVE_FILE_ID}
        orphans={orphans}
        onSave={setFieldOverrideAction}
      />,
    );

    const byKey = new Map(captured.map((c) => [`${c.domain}.${c.field}`, c]));
    // One field per orphan, keyed on the parsed matchKey (not any display value).
    expect(captured.map((c) => `${c.domain}.${c.field}`).sort()).toEqual([
      "crew.name",
      "hotel.hotel_name",
    ]);
    expect(byKey.get("crew.name")!.matchKey).toBe("Jon");
    expect(byKey.get("hotel.hotel_name")!.matchKey).toBe("Grand Marriott");
    // Wired paused (so OverrideableField renders the Re-point/Discard branch) + real action.
    for (const c of captured) {
      expect(c.onSave).toBe(setFieldOverrideAction);
      expect((c as unknown as { override: { active: boolean } }).override.active).toBe(false);
    }
    // critique P1: the value cell shows Doug's OWN correction (override value), not "—",
    // so he can decide Re-point vs Discard without recalling what he typed.
    expect((byKey.get("crew.name") as unknown as { currentValue: string }).currentValue).toBe(
      "John",
    );
    expect(
      (byKey.get("hotel.hotel_name") as unknown as { currentValue: string }).currentValue,
    ).toBe("Marriott Downtown");
  });

  // critique P1: the block carries the #paused-overrides scroll anchor the needs-attention
  // deep-link targets, so a target_missing card lands here, not at the page top.
  test("OrphanedOverridesBlock section carries the #paused-overrides deep-link anchor (G2)", () => {
    const { container } = render(
      <OrphanedOverridesBlock
        driveFileId={DRIVE_FILE_ID}
        orphans={[
          {
            domain: "crew",
            field: "name",
            matchKey: "Jon",
            override: {
              overrideValue: "John",
              sheetValue: "Jon",
              active: false,
              deactivationCode: "target_missing",
              version: 2,
            },
          },
        ]}
        onSave={setFieldOverrideAction}
      />,
    );
    expect(container.querySelector("section#paused-overrides")).not.toBeNull();
  });

  test("OrphanedOverridesBlock renders nothing when there are no orphans", () => {
    const { container } = render(
      <OrphanedOverridesBlock
        driveFileId={DRIVE_FILE_ID}
        orphans={[]}
        onSave={setFieldOverrideAction}
      />,
    );
    expect(container.querySelector('[data-testid="per-show-orphaned-overrides-block"]')).toBeNull();
    expect(captured).toHaveLength(0);
  });
});

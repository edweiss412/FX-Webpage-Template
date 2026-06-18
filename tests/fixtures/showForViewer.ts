/**
 * tests/fixtures/showForViewer.ts
 *
 * Typed fixture builder for ShowForViewer. Used by all section-tile tests so
 * a wrong-name or wrong-type override fails tsc (no `as any`, no broad casts).
 *
 * Key constraints honoured:
 *   - `financials` is OMITTED from DEFAULT (exactOptionalPropertyTypes means
 *     `financials: undefined` would be a type error on optional fields).
 *   - Partial `rooms` override elements are completed against DEFAULT_ROOM so
 *     callers can pass `{ id, kind, name }` and get a full ProjectedRoomRow.
 *   - All other array overrides REPLACE the array wholesale (elements must be
 *     complete), which is the safest merge for crewMembers / hotelReservations /
 *     contacts where partial shapes would silently omit required fields.
 */

import type { ShowForViewer, FinancialsRow } from "@/lib/data/getShowForViewer";
import type { ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";

// ---------------------------------------------------------------------------
// DeepPartial — objects recurse; arrays accept partial elements; primitives
// pass through unchanged. Special-casing arrays allows callers to write
// `rooms: [{ id, kind, name }]` without satisfying every nullable field.
// ---------------------------------------------------------------------------
type DeepPartial<T> = T extends (infer E)[]
  ? DeepPartial<E>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

// ---------------------------------------------------------------------------
// Default complete ProjectedRoomRow (RoomRow & { id: string }) — used to
// complete partial room override elements so a `{ id, kind, name }` override
// produces a valid ProjectedRoomRow.
// ---------------------------------------------------------------------------
const DEFAULT_ROOM: ProjectedRoomRow = {
  id: "room-default",
  kind: "gs",
  name: "Default Room",
  dimensions: null,
  floor: null,
  setup: null,
  set_time: null,
  show_time: null,
  strike_time: null,
  audio: null,
  video: null,
  lighting: null,
  scenic: null,
  power: null,
  digital_signage: null,
  other: null,
  notes: null,
};

// ---------------------------------------------------------------------------
// Default complete ShowForViewer — every required field populated; `financials`
// intentionally OMITTED so the default satisfies exactOptionalPropertyTypes.
// ---------------------------------------------------------------------------
const DEFAULT: ShowForViewer = {
  show: {
    title: "Test Show",
    client_label: "Test Client",
    client_contact: null,
    template_version: "v4",
    venue: { name: "Test Venue", address: "123 Main St" },
    dates: {
      travelIn: null,
      set: null,
      showDays: [],
      travelOut: null,
    },
    schedule_phases: {},
    event_details: {},
    agenda_links: [],
    coi_status: null,
    po: null,
    proposal: null,
    invoice: null,
    invoice_notes: null,
  },
  crewMembers: [
    {
      id: "c1",
      name: "Test Crew",
      email: null,
      phone: null,
      role: "",
      roleFlags: [],
      dateRestriction: { kind: "none" },
      stageRestriction: { kind: "none" },
    },
  ],
  hotelReservations: [],
  rooms: [],
  transportation: null,
  contacts: [],
  pullSheet: null,
  diagrams: null,
  openingReelHasVideo: false,
  lastSyncedAt: null,
  lastSyncStatus: null,
  tileErrors: {},
  viewerName: "Test Crew",
  viewerVersionToken: "v1",
};

// ---------------------------------------------------------------------------
// Deep-merge helpers
// ---------------------------------------------------------------------------

/**
 * Merge two plain-object values recursively. Arrays at any level are REPLACED
 * by the override value — callers provide a complete array (or use the rooms
 * specialisation below which completes partial elements).
 */
function deepMergeObjects<T extends object>(base: T, override: DeepPartial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override) as (keyof typeof override)[]) {
    const overrideVal = override[key];
    if (overrideVal === undefined) continue;
    const baseVal = (base as Record<string, unknown>)[key as string];
    if (
      overrideVal !== null &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      // Both sides are plain objects — recurse
      result[key as string] = deepMergeObjects(
        baseVal as object,
        overrideVal as DeepPartial<object>,
      );
    } else {
      // Primitive, null, or array — replace
      result[key as string] = overrideVal;
    }
  }
  return result as T;
}

/**
 * Complete each element of a partial rooms override array against DEFAULT_ROOM,
 * producing a fully-typed ProjectedRoomRow[].
 */
function completeRooms(partialRooms: DeepPartial<ProjectedRoomRow>[]): ProjectedRoomRow[] {
  return partialRooms.map((partial) =>
    deepMergeObjects<ProjectedRoomRow>(DEFAULT_ROOM, partial),
  );
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export function makeShowForViewer(overrides?: DeepPartial<ShowForViewer>): ShowForViewer {
  if (!overrides) return structuredClone(DEFAULT);

  // Start from a deep clone of the default
  let result: ShowForViewer = structuredClone(DEFAULT);

  // Pull out the rooms override before the generic merge so we can complete
  // partial elements; then merge everything else generically.
  const { rooms: roomsOverride, financials: financialsOverride, ...rest } = overrides;

  // Generic deep-merge for all non-special fields
  result = deepMergeObjects<ShowForViewer>(result, rest as DeepPartial<ShowForViewer>);

  // Rooms: complete each partial element against DEFAULT_ROOM
  if (roomsOverride !== undefined) {
    result = { ...result, rooms: completeRooms(roomsOverride) };
  }

  // Financials: apply if present, omit if not (exactOptionalPropertyTypes)
  if (financialsOverride !== undefined) {
    const completedFinancials: FinancialsRow = {
      po: financialsOverride.po ?? null,
      proposal: financialsOverride.proposal ?? null,
      invoice: financialsOverride.invoice ?? null,
      invoice_notes: financialsOverride.invoice_notes ?? null,
    };
    result = { ...result, financials: completedFinancials };
  } else {
    // Ensure financials is not set (omit the key entirely)
    const { financials: _removed, ...withoutFinancials } = result as ShowForViewer & {
      financials?: FinancialsRow;
    };
    void _removed;
    result = withoutFinancials as ShowForViewer;
  }

  return result;
}

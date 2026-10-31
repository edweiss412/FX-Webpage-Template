/**
 * tests/auth/picker/_savedCopyWorld.ts
 *
 * One fake world the saved-copy identity parity suite and the status route suite
 * share: the show row, the roster, the signed-in email, the picker cookie, the
 * admin and Google sessions. Only the identity boundaries are faked
 * (`@/lib/auth/isAdminSession`, `@/lib/auth/validateGoogleSession`,
 * `@/lib/supabase/server`); every caller of this module mocks those three, and the
 * real `resolveCrewIdentity` and `resolvePickerSelection` run on top of them.
 *
 * The fake query builder answers by filtering the table's rows on every `.eq`
 * and projecting exactly the columns the code selected, and it throws on a
 * column the row does not have, so a typo in a select fails loudly here.
 */
import { vi } from "vitest";
import { isAdminSession, type AdminSessionResult } from "@/lib/auth/isAdminSession";
import {
  COOKIE_NAME,
  encodePickerCookie,
  type PickerEntry,
} from "@/lib/auth/picker/cookieEnvelope";
import {
  validateGoogleSession,
  type GoogleSessionValidationResult,
} from "@/lib/auth/validateGoogleSession";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import { savedCopyStatusUrl } from "@/lib/offline/protocol";
import { viewerKey } from "@/lib/offline/viewerKey";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const ORIGIN = "https://crew.fxav.show";
export const SLUG = "show-one";
export const SHARE_TOKEN = "a".repeat(64);
export const SHOW_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_SHOW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const CREW_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_CREW_ID = "33333333-3333-4333-8333-333333333333";
export const CREW_EMAIL = "alice@example.com";
export const OTHER_CREW_EMAIL = "bob@example.com";
/** The picker epoch the copy was saved under; the archive bumps the row to EPOCH + 1. */
export const EPOCH = 7;
export const PICKED_AT_MS = Date.parse("2026-10-20T12:00:00.000Z");
export const SAVED_AT = "2026-10-21T12:00:00.000Z";

export type ShowRow = {
  id: string;
  published: boolean;
  archived: boolean;
  picker_epoch: number;
  unpublished_at: string | null;
};

export type CrewRow = {
  id: string;
  show_id: string;
  email: string | null;
  claimed_via_oauth_at: string | null;
  selections_reset_at: string | null;
};

export type World = {
  show: ShowRow | null;
  crew: CrewRow[];
  /** What `auth_email_canonical` answers: the signed-in email, or null for none. */
  sessionEmail: string | null;
  /** The picker cookie's selections; null sends no cookie. */
  selections: Record<string, PickerEntry> | null;
  admin: AdminSessionResult;
  google: GoogleSessionValidationResult;
  serviceRoleThrows: boolean;
  /** A returned error on every `shows` read. */
  showReadError: unknown;
  showReadThrows: boolean;
  /** Runs once, after the first `shows` read answers (a lifecycle change mid-request). */
  afterFirstShowRead: ((show: ShowRow) => void) | null;
  /** Observers. */
  serviceRoleConstructions: number;
  fromCalls: string[];
  showReads: number;
};

export function baseWorld(): World {
  return {
    show: {
      id: SHOW_ID,
      published: true,
      archived: false,
      picker_epoch: EPOCH,
      unpublished_at: null,
    },
    crew: [
      {
        id: CREW_ID,
        show_id: SHOW_ID,
        email: CREW_EMAIL,
        claimed_via_oauth_at: null,
        selections_reset_at: null,
      },
      {
        id: OTHER_CREW_ID,
        show_id: SHOW_ID,
        email: OTHER_CREW_EMAIL,
        claimed_via_oauth_at: null,
        selections_reset_at: null,
      },
    ],
    sessionEmail: null,
    selections: { [SHOW_ID]: { id: CREW_ID, e: EPOCH, t: PICKED_AT_MS } },
    admin: { ok: false, reason: "not_admin" },
    google: { kind: "continue" },
    serviceRoleThrows: false,
    showReadError: null,
    showReadThrows: false,
    afterFirstShowRead: null,
    serviceRoleConstructions: 0,
    fromCalls: [],
    showReads: 0,
  };
}

/**
 * The same show after an archive, in the state production holds: archived, unpublished (the
 * archive sets `published = false` in the same update), and the archive's own epoch bump.
 * Leaving `published` true would hide a saved-mode regression that checked `!published`.
 */
export function archive(world: World): World {
  if (world.show) {
    world.show.archived = true;
    world.show.published = false;
    world.show.picker_epoch += 1;
  }
  return world;
}

export function crewRow(world: World, id: string): CrewRow {
  const row = world.crew.find((member) => member.id === id);
  if (!row) throw new Error(`no crew row ${id} in this world`);
  return row;
}

function project(row: Record<string, unknown>, columns: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of columns.split(",").map((name) => name.trim())) {
    if (!(column in row)) throw new Error(`fake row has no column "${column}"`);
    out[column] = row[column];
  }
  return out;
}

function queryOn(world: World, table: string) {
  world.fromCalls.push(table);
  let columns = "";
  const filters: Array<[string, unknown]> = [];
  const rows = (): Array<Record<string, unknown>> => {
    if (table === "shows") return world.show ? [world.show] : [];
    if (table === "crew_members") return world.crew;
    throw new Error(`unexpected table ${table}`);
  };
  const read = () => {
    const row = rows().find((candidate) =>
      filters.every(([column, value]) => candidate[column] === value),
    );
    return row === undefined ? null : project(row, columns);
  };
  const builder = {
    select(selected: string) {
      columns = selected;
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return builder;
    },
    async maybeSingle() {
      if (table !== "shows") return { data: read(), error: null };
      world.showReads += 1;
      if (world.showReadThrows) throw new Error("fetch failed");
      if (world.showReadError) return { data: null, error: world.showReadError };
      const data = read();
      if (world.showReads === 1 && world.afterFirstShowRead && world.show) {
        world.afterFirstShowRead(world.show);
      }
      return { data, error: null };
    },
    async single() {
      const data = read();
      return data
        ? { data, error: null }
        : { data: null, error: { code: "PGRST116", message: "no rows returned" } };
    },
  };
  return builder;
}

/** Points the three mocked boundary modules at this world. */
export function installWorld(world: World): void {
  vi.mocked(createSupabaseServiceRoleClient).mockImplementation(() => {
    world.serviceRoleConstructions += 1;
    if (world.serviceRoleThrows) throw new Error("service-role client construction failed");
    return {
      rpc: async (fn: string) => {
        if (fn !== "resolve_show_by_slug_and_token") throw new Error(`unexpected rpc ${fn}`);
        return { data: world.show?.id ?? null, error: null };
      },
      from: (table: string) => queryOn(world, table),
    } as never;
  });
  vi.mocked(createSupabaseServerClient).mockImplementation(
    async () =>
      ({
        rpc: async (fn: string) => {
          if (fn !== "auth_email_canonical") throw new Error(`unexpected rpc ${fn}`);
          return { data: world.sessionEmail, error: null };
        },
      }) as never,
  );
  vi.mocked(isAdminSession).mockImplementation(async () => world.admin);
  vi.mocked(validateGoogleSession).mockImplementation(async () => world.google);
}

/** A real signed picker cookie under the key the code reads (tests/setup.ts). */
function headersFor(world: World): HeadersInit {
  if (world.selections === null) return {};
  const cookie = encodePickerCookie(
    { v: 1, selections: world.selections },
    pickerCookieSigningKey(),
  );
  return { cookie: `other=1; ${COOKIE_NAME}=${cookie}` };
}

/** The crew page's request for this show. */
export function pageRequest(world: World): Request {
  return new Request(`${ORIGIN}/show/${SLUG}/${SHARE_TOKEN}`, { headers: headersFor(world) });
}

export type SavedCopyIds = { showId: string; epoch: number; viewer: string; savedAt: string };

/** The ids a copy saved for `crewMemberId` at EPOCH carries. */
export function savedCopy(crewMemberId: string = CREW_ID): SavedCopyIds {
  const viewer = viewerKey(SHOW_ID, crewMemberId);
  if (viewer === null) throw new Error("viewer key unavailable in the test environment");
  return { showId: SHOW_ID, epoch: EPOCH, viewer, savedAt: SAVED_AT };
}

/**
 * The status route's request for a copy, built with the worker's own URL builder
 * (ruling D22), so a parameter-name drift fails the route suites too. `edit`
 * changes the built URL for the malformed-parameter cases.
 */
export function statusRequest(
  world: World,
  copy: SavedCopyIds = savedCopy(),
  edit?: (url: URL) => void,
): Request {
  const url = new URL(savedCopyStatusUrl(copy), ORIGIN);
  edit?.(url);
  return new Request(url, { headers: headersFor(world) });
}

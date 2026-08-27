// lib/admin/identityHolds.ts: cross-show open-holds read for the needs-attention
// rollup (spec 2026-08-03 section 4). Pure grouping core shared by the PostgREST
// reader below and the digest's raw-SQL transport (lib/notify/digest.ts), so page,
// inbox, badge, and email share one grouping semantics. Both render caps live here
// (NOT in the client island): the server inbox needs them too, and server code
// cannot read values from a "use client" module.
import { log } from "@/lib/log";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { shapeHoldEntry, type HoldRow } from "@/lib/sync/feed/shapeHoldEntry";

// Flat, READER-normalized row: no nested embed, no Date, no null slug (spec §4).
export type IdentityHoldRow = HoldRow & {
  show_id: string;
  slug: string;
  title: string | null;
};

export type IdentityHoldGroup = {
  showId: string;
  slug: string;
  title: string | null;
  // newest-first; length >= 1; each from shapeHoldEntry(row).summary (spec R8)
  summaries: string[];
  newestCreatedAt: string;
};

export const HOLDS_ROW_CAP = 200;
export const HOLD_SUMMARIES_RENDER_CAP = 10;

export function groupHoldRows(rows: IdentityHoldRow[]): IdentityHoldGroup[] {
  const groups = new Map<string, IdentityHoldGroup>();
  for (const row of rows) {
    const summary = shapeHoldEntry(row).summary;
    const existing = groups.get(row.show_id);
    if (existing) {
      existing.summaries.push(summary);
    } else {
      groups.set(row.show_id, {
        showId: row.show_id,
        slug: row.slug,
        title: row.title,
        summaries: [summary],
        newestCreatedAt: row.created_at,
      });
    }
  }
  return [...groups.values()];
}

export type HoldsClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type LoadOpenIdentityHoldsResult =
  | { kind: "ok"; groups: IdentityHoldGroup[] }
  | { kind: "infra_error"; message: string };

type RawHoldRow = Record<string, unknown>;

/**
 * Cross-show read of every OPEN MI-11 identity hold on an active show, grouped
 * per show for the needs-attention rollup (spec §4). Service-role because the
 * dashboard badge and the needs-attention page both read across shows.
 *
 * Invariant-9 discipline: client construction throw, query throw, and returned
 * {error} each resolve to a typed { kind: "infra_error" }. Registered in
 * tests/admin/_metaInfraContract.test.ts. Bounded via .limit(HOLDS_ROW_CAP + 1):
 * the sentinel row is what makes the overflow warn possible, then dropped.
 */
export async function loadOpenIdentityHolds(deps?: {
  client?: HoldsClient;
}): Promise<LoadOpenIdentityHoldsResult> {
  let supabase = deps?.client;
  if (!supabase) {
    try {
      supabase = createSupabaseServiceRoleClient();
    } catch (err) {
      void log.error("identity-holds client construction failed", {
        source: "admin.loadOpenIdentityHolds",
        code: "IDENTITY_HOLDS_CLIENT_THREW",
        error: err,
      });
      return {
        kind: "infra_error",
        message: `service-role client construction failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  let rows: RawHoldRow[];
  try {
    const { data, error } = await supabase
      .from("sync_holds")
      .select(
        "id, show_id, entity_key, held_value, proposed_value, base_modified_time, created_at, shows!inner(slug, title)",
      )
      .eq("kind", "mi11_pending")
      .eq("shows.archived", false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(HOLDS_ROW_CAP + 1);
    if (error) {
      void log.error("sync_holds read returned error", {
        source: "admin.loadOpenIdentityHolds",
        code: "IDENTITY_HOLDS_READ_RETURNED_ERROR",
        error,
      });
      return { kind: "infra_error", message: `sync_holds query failed: ${error.message}` };
    }
    rows = (data ?? []) as RawHoldRow[];
  } catch (err) {
    void log.error("sync_holds read threw", {
      source: "admin.loadOpenIdentityHolds",
      code: "IDENTITY_HOLDS_READ_THREW",
      error: err,
    });
    return {
      kind: "infra_error",
      message: `sync_holds query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Everything below is inside its own guarded region. groupHoldRows calls
  // shapeHoldEntry, which resolves copy through getRequiredDougFacing — a
  // function that THROWS when a catalog code carries no Doug-facing copy
  // (lib/messages/lookup.ts:124-130). A malformed proposed_value would
  // therefore reject this promise and escape the typed contract, which is
  // exactly what invariant 9 forbids: an infra fault must surface as a
  // discriminable typed result, never as a rejection.
  try {
    return { kind: "ok", groups: groupHoldRows(normalizeHoldRows(rows)) };
  } catch (err) {
    void log.error("sync_holds shaping threw", {
      source: "admin.loadOpenIdentityHolds",
      code: "IDENTITY_HOLDS_SHAPING_THREW",
      error: err,
    });
    return {
      kind: "infra_error",
      message: `sync_holds shaping threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Cap enforcement + embed flattening for the rows the reader read. Split out so
 * the guarded region above is one expression; every throw inside (including a
 * catalog-copy throw from the shared summary generator) lands in that catch.
 */
function normalizeHoldRows(input: RawHoldRow[]): IdentityHoldRow[] {
  let rows = input;
  if (rows.length > HOLDS_ROW_CAP) {
    void log.warn("sync_holds row cap exceeded", {
      source: "admin.loadOpenIdentityHolds",
      cap: HOLDS_ROW_CAP,
      seen: rows.length,
    });
    rows = rows.slice(0, HOLDS_ROW_CAP);
  }

  // Flatten the shows!inner embed (object under a to-one FK, array under some
  // PostgREST shapes) and skip any row whose embed carries no slug — a dead
  // /admin?show=undefined link is worse than a missing card.
  return rows.flatMap((r): IdentityHoldRow[] => {
    const embed = r.shows as
      | { slug?: string; title?: string | null }
      | Array<{ slug?: string; title?: string | null }>
      | null;
    const show = Array.isArray(embed) ? embed[0] : embed;
    if (!show?.slug) {
      void log.warn("identity hold missing show slug", {
        source: "admin.loadOpenIdentityHolds",
        holdId: r.id as string,
      });
      return [];
    }
    return [
      {
        id: r.id as string,
        show_id: r.show_id as string,
        slug: show.slug,
        title: (show.title as string | null) ?? null,
        entity_key: r.entity_key as string,
        held_value: r.held_value,
        proposed_value: r.proposed_value as IdentityHoldRow["proposed_value"],
        base_modified_time: (r.base_modified_time as string | null) ?? null,
        created_at: r.created_at as string,
      },
    ];
  });
}

// The hold-to-FeedEntry shaping step, extracted verbatim from
// readShowChangeFeed (spec 2026-07-20-attention-scenario-gallery-design §3.3).
// The dev scenario gallery calls this so a materialized hold and a gallery hold
// render identically; `summary` is GENERATED here from the disposition, never
// authored, so a catalog that invented its own copy would diverge on sight.
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { canonEmail } from "@/lib/sync/holds/holdPort";
import type { Disposition, FeedEntry, FeedGate } from "@/lib/sync/holds/types";
import { toIso, sortKeyFromRaw } from "./sortKey";

export type HoldRow = {
  id: string;
  entity_key: string;
  held_value: unknown;
  proposed_value: Disposition;
  base_modified_time: string | null;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function strOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function fill(template: string, params: { name: string; old: string; new: string }): string {
  return template
    .replaceAll("{name}", params.name)
    .replaceAll("{old}", params.old)
    .replaceAll("{new}", params.new);
}

// Render the pending MI-11 summary via lib/messages (invariant 5 — no raw
// codes). The catalog dougFacing carries {name}/{old}/{new} placeholders; this
// layer interpolates them from the hold's held_value (old) + proposed_value
// (proposed) — the only renderer for pending holds, which have no
// show_change_log row of their own.
function renderPendingSummary(hold: HoldRow): string {
  const disposition = hold.proposed_value;
  const held = asRecord(hold.held_value);
  const proposed = asRecord(hold.proposed_value);

  if (disposition.disposition === "email_change") {
    return fill(getRequiredDougFacing("mi11_pending_email_change"), {
      name: hold.entity_key,
      old: strOrEmpty(held.email),
      new: strOrEmpty(proposed.email),
    });
  }
  if (disposition.disposition === "rename") {
    // P5-F3: a FOLDED rename (Phase-2 Task 2.5 retargets an open email_change
    // hold to {disposition:'rename', name, email} when an added row matches the
    // held/proposed email) ALSO moves the email / OAuth-login anchor. Doug sees
    // ONLY entry.summary, so a folded rename must warn that the email changes
    // too — the settled contract reserves `mi11_pending_rename_folded` for
    // exactly this. The anchor MOVES iff the proposed email differs from the
    // held identity email (the email the OAuth claim currently uses). A future
    // pure rename (same email) keeps the plain `mi11_pending_rename` copy — the
    // branch is conditional, never hardcoded-folded. Compare canonicalized so
    // it matches the fold's own canonEmail-keyed match (holdAwareApply.ts:241).
    const heldEmail = canonEmail(strOrEmpty(held.email) || null);
    const proposedEmail = canonEmail(strOrEmpty(proposed.email) || null);
    const emailAnchorMoved = proposedEmail !== heldEmail;
    if (emailAnchorMoved) {
      return fill(getRequiredDougFacing("mi11_pending_rename_folded"), {
        name: hold.entity_key,
        old: strOrEmpty(held.name) || hold.entity_key,
        new: strOrEmpty(proposed.name),
      });
    }
    return fill(getRequiredDougFacing("mi11_pending_rename"), {
      name: hold.entity_key,
      old: strOrEmpty(held.name) || hold.entity_key,
      new: strOrEmpty(proposed.name),
    });
  }
  // removal
  return fill(getRequiredDougFacing("mi11_pending_removal"), {
    name: hold.entity_key,
    old: "",
    new: "",
  });
}

/** FeedEntry plus the full-precision sort key the caller orders on, then strips. */
export type RankedHoldEntry = FeedEntry & { sortKey: string };

export function shapeHoldEntry(hold: HoldRow): RankedHoldEntry {
  const gate: FeedGate = {
    holdId: hold.id,
    disposition: hold.proposed_value,
    // P5-F4 / PF40: gate.baseModifiedTime is the OPAQUE optimistic-concurrency
    // token the MI-11 RPCs compare EXACTLY (base_modified_time IS DISTINCT FROM
    // p_expected_base_modified_time). It MUST carry the raw timestamptz string
    // as returned by the query (full PostgreSQL microsecond precision) — NOT a
    // Date/toIso()-normalized value, which drops postgres microseconds
    // (...123456Z → ...123Z) and would falsely trip MI11_TARGET_MOVED on a hold
    // that never retargeted. Display timestamps (occurredAt below) stay
    // normalized; only this concurrency token must be byte-exact.
    baseModifiedTime: hold.base_modified_time,
  };
  return {
    id: hold.id,
    occurredAt: toIso(hold.created_at) ?? hold.created_at, // display only (Date-normalized)
    sortKey: sortKeyFromRaw(hold.created_at), // sort key — full precision (P5-F5)
    status: "pending",
    summary: renderPendingSummary(hold),
    action: "approve_reject",
    entityRef: hold.entity_key,
    // Hold-derived entries never carry the disposition axis (spec §2).
    acceptable: false,
    acknowledgedAt: null,
    gate,
  };
}

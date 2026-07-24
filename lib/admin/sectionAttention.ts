// lib/admin/sectionAttention.ts
//
// The attention bucketing boundary (attention-alert-routing §2.5/§3.2). Two
// channels, deliberately: pre-rendered CARDS (opaque, nothing downstream inspects
// them) and DOMAIN note items (the warnings section composes them because the copy
// variant depends on warnings.length). Resolution is section-first, then anchor,
// so an item is never dropped: an unavailable section falls back to Overview,
// which always mounts to receive it.
import type { ReactNode } from "react";
import {
  ATTENTION_ROUTES,
  type AttentionItem,
  type RoutedSectionId,
} from "@/lib/admin/attentionItems";
import { toNoteItem, type NoteItem } from "@/lib/admin/parseAttentionNote";

export type SectionAttentionBucket = {
  /** Pre-rendered cards mounted at the top of the section. Opaque by design. */
  sectionTop: ReactNode[];
  /** CREW ONLY: per-crew-member under-row banners. */
  byCrewKey?: Map<string, ReactNode[]>;
  /** CREW ONLY (§6.3): id-matched under-row banners keyed by RENDERED row index.
   *  Parallel to `byCrewKey` but populated by DB-id fan-out, not display name. */
  byRowIndex?: Map<number, ReactNode[]>;
  /** Pre-rendered anchored cards, keyed by the content anchor they mount at. */
  byAnchor?: Map<string, ReactNode[]>;
  /** DOMAIN items (not nodes): the two parse notices the warnings section composes. */
  notes?: NoteItem[];
};

export type SectionAttention = Map<RoutedSectionId, SectionAttentionBucket>;

export type BucketOpts = {
  renderCard: (item: AttentionItem) => ReactNode;
  /** Whether the routed section is rendered for this show; else fall back to Overview. */
  sectionAvailable: (sectionId: RoutedSectionId) => boolean;
  /** Whether the routed anchor's content slot is present in its section. */
  anchorAvailable: (sectionId: RoutedSectionId, anchor: string) => boolean;
  /** CREW ONLY: whether a crew key maps to a rendered row (else the crew banner
   *  goes to the crew section top). Defaults to always-rendered. */
  crewKeyRendered?: (crewKey: string) => boolean;
  /** CREW ONLY (§6.3): the modal partially applies the pure crew-row resolver
   *  over its roster. Given an item's `crewMatch`, returns the RENDERED-row
   *  indexes to fan the banner into, or null → section-top. Absent (staged) →
   *  never fans out. */
  crewRowIndexesForIds?: (expected: {
    crewMemberIds: readonly string[];
    expectedCount: number;
  }) => number[] | null;
};

/** The availability predicates `bucketAttention` uses to place a card — the same
 *  pair drives `resolveEffectiveSection` so the nav signal can NEVER disagree with
 *  placement, even under inconsistent predicates (Codex PR3 R3). */
export type PlacementPredicates = {
  sectionAvailable: (id: RoutedSectionId) => boolean;
  anchorAvailable: (id: RoutedSectionId, anchor: string) => boolean;
};

/**
 * The section an item's banner ACTUALLY renders in (attention-alert-routing §3.3),
 * computed to MIRROR `bucketAttention`'s placement branch-for-branch so the nav dot,
 * deep-link jump, and menu jump can never disagree with where the card lands:
 *   - section unavailable → Overview (fallback);
 *   - rooms/event with the anchor UNavailable → Overview (bucketAttention's redirect,
 *     Codex R3: `sectionAvailable` alone was insufficient — rooms/event placement is
 *     gated by `anchorAvailable`, not `sectionAvailable`);
 *   - otherwise the declared section (byAnchor / byCrewKey / sectionTop all render there).
 */
export function resolveEffectiveSection(
  item: AttentionItem,
  { sectionAvailable, anchorAvailable }: PlacementPredicates,
): RoutedSectionId {
  const declared = item.sectionId;
  if (!sectionAvailable(declared)) return "overview";
  const anchor = item.alert ? ATTENTION_ROUTES[item.alert.code]?.anchor : undefined;
  if (
    anchor &&
    (declared === "rooms" || declared === "event") &&
    !anchorAvailable(declared, anchor)
  ) {
    return "overview";
  }
  return declared;
}

function bucket(map: SectionAttention, sectionId: RoutedSectionId): SectionAttentionBucket {
  let b = map.get(sectionId);
  if (!b) {
    b = { sectionTop: [] };
    map.set(sectionId, b);
  }
  return b;
}

export function bucketAttention(
  items: readonly AttentionItem[],
  opts: BucketOpts,
): SectionAttention {
  const map: SectionAttention = new Map();
  const crewKeyRendered = opts.crewKeyRendered ?? (() => true);

  for (const item of items) {
    // Hold items are NOT an attention-bucket surface: they render in the Changes
    // feed via Mi11GateActions and are counted separately (holdCount), never as a
    // banner or card. Excluding them here preserves the pre-existing bucketing
    // behavior (the retired inline modal code was also alert-only). No drop: they
    // have their own consumer. Pinned by the conservation test.
    if (item.kind !== "alert" || !item.alert) continue;

    // Notes channel: the two parse codes travel as domain items to the warnings
    // section, which composes them (the copy variant needs warnings.length). They
    // never become cards — UNLESS the warnings section is unavailable, in which
    // case they fall through to the card path and land in Overview (no drop). The
    // warnings section is unconditional today, so the fallback is defensive.
    const note = toNoteItem(item);
    if (note && item.sectionId === "warnings" && opts.sectionAvailable("warnings")) {
      const b = bucket(map, "warnings");
      (b.notes ??= []).push(note);
      continue;
    }

    // Section-first resolution: an unavailable section falls back to Overview.
    const section: RoutedSectionId = opts.sectionAvailable(item.sectionId)
      ? item.sectionId
      : "overview";
    const anchor = ATTENTION_ROUTES[item.alert.code]?.anchor;
    const card = opts.renderCard(item);
    const b = bucket(map, section);

    // §6.3 id-matched crew fan-out: a crew item carrying a derived `crewMatch`
    // whose ids map one-to-one onto RENDERED rows fans the banner out in-row via
    // `byRowIndex` (one card per matched index). Any non-match — resolver absent
    // (staged), null result (roster drift / row beyond CREW_CAP / duplicate
    // rendered id) — falls THROUGH to the existing placement (section-top today).
    // Never both channels: this is the first arm of the if-else chain.
    const fanoutIndexes =
      section === "crew" && item.crewMatch && opts.crewRowIndexesForIds
        ? opts.crewRowIndexesForIds(item.crewMatch)
        : null;

    if (fanoutIndexes) {
      const byRowIndex = (b.byRowIndex ??= new Map());
      for (const idx of fanoutIndexes) {
        byRowIndex.set(idx, [...(byRowIndex.get(idx) ?? []), card]);
      }
    } else if (anchor && section === item.sectionId && opts.anchorAvailable(section, anchor)) {
      (b.byAnchor ??= new Map()).set(anchor, [...(b.byAnchor.get(anchor) ?? []), card]);
    } else if (section === "crew" && item.crewKey && crewKeyRendered(item.crewKey)) {
      (b.byCrewKey ??= new Map()).set(item.crewKey, [
        ...(b.byCrewKey.get(item.crewKey) ?? []),
        card,
      ]);
    } else if (section === "rooms" || section === "event") {
      // rooms/event have NO section-top consumer — they host cards ONLY at their
      // content anchor. Any card that resolved to one of them but did NOT land at
      // the anchor (e.g. a caller passed inconsistent availability predicates) is
      // redirected to Overview rather than pushed to a section-top that renders
      // nothing. Structural no-drop, independent of caller predicate consistency
      // (Codex PR3 R2). With the modal's single-map wiring this branch is unreached.
      bucket(map, "overview").sectionTop.push(card);
    } else {
      b.sectionTop.push(card);
    }
  }
  return map;
}

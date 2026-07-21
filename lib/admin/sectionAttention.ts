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
  /** Pre-rendered anchored cards, keyed by the content anchor they mount at. */
  byAnchor?: Map<string, ReactNode[]>;
  /** DOMAIN items (not nodes): the two parse notices the warnings section composes. */
  notes?: NoteItem[];
};

export type SectionAttention = Map<RoutedSectionId, SectionAttentionBucket>;

type BucketOpts = {
  renderCard: (item: AttentionItem) => ReactNode;
  /** Whether the routed section is rendered for this show; else fall back to Overview. */
  sectionAvailable: (sectionId: RoutedSectionId) => boolean;
  /** Whether the routed anchor's content slot is present in its section. */
  anchorAvailable: (sectionId: RoutedSectionId, anchor: string) => boolean;
  /** CREW ONLY: whether a crew key maps to a rendered row (else the crew banner
   *  goes to the crew section top). Defaults to always-rendered. */
  crewKeyRendered?: (crewKey: string) => boolean;
};

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
    if (item.kind !== "alert" || !item.alert) continue;

    // Notes channel: the two parse codes travel as domain items to the warnings
    // section, which composes them. They never become cards.
    const note = toNoteItem(item);
    if (note && item.sectionId === "warnings") {
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

    if (anchor && section === item.sectionId && opts.anchorAvailable(section, anchor)) {
      (b.byAnchor ??= new Map()).set(anchor, [...(b.byAnchor.get(anchor) ?? []), card]);
    } else if (section === "crew" && item.crewKey && crewKeyRendered(item.crewKey)) {
      (b.byCrewKey ??= new Map()).set(item.crewKey, [
        ...(b.byCrewKey.get(item.crewKey) ?? []),
        card,
      ]);
    } else {
      b.sectionTop.push(card);
    }
  }
  return map;
}

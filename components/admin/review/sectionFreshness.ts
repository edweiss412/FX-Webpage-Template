/**
 * components/admin/review/sectionFreshness.ts
 *
 * The freshness-cue DETECTOR (spec 2026-08-03-modal-freshness-cue sections 4.1
 * and 4.6). Pure: no React, no Supabase, no clock, no randomness.
 *
 * THE PROBLEM IT SOLVES. When a realtime broadcast lands, the admin published
 * review modal calls `router.refresh()` and RSC reconciles the new payload in
 * place. React hands the client no list of what changed — the props are simply a
 * new object with new content. To point at "the updated field" we have to derive
 * that list ourselves, and the only honest way is to compare CONTENT, never
 * object identity: the modal's own once-per-mount refresh re-serialises identical
 * content into a fresh object, so an identity comparison would flash the whole
 * modal every time it opened.
 *
 * WHY A SECTION'S CONTENT IS NOT JUST ITS OWN FIELDS. Three things render inside
 * a section's panel card and change independently of that section's data:
 *
 *   1. the warnings ROUTED to it, which arrive as `bySection` (the server-derived
 *      per-section model) and render as the card's last child;
 *   2. the use-raw decision attached to each of those routed warnings, which IS
 *      the rendered state of that control;
 *   3. the section's own source anchor, which is where its "In sheet" link points.
 *
 * A projection over own-fields-only left a warn arriving for Crew flashing only
 * the Sheet-warnings section while the Crew card, which visibly changed, stayed
 * silent. Crew additionally carries `previewRoster` (what the row actions target)
 * and pack list `archivedTabOffer` (visible offer cards) for the same reason.
 *
 * THE HASH IS A CHANGE DETECTOR, NOT A DIGEST. A collision costs exactly one
 * missed cue on content that is already correct on screen, so a cryptographic
 * hash would buy nothing and would drag `node:crypto` into a module that a client
 * component imports.
 */
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { ParseWarning } from "@/lib/parser/types";
import { renderedSectionIds } from "@/components/admin/review/sectionInclusion";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import { SECTION_REGION_MAP, type SectionId } from "@/lib/admin/step3SectionStatus";
import { findUseRawDecision } from "@/components/admin/wizard/step3ReviewSections";

/**
 * One-shot cue duration, paired with the `section-freshness-flash-*` keyframes in
 * `app/globals.css` and pinned against them by a drift test.
 *
 * A NEW constant deliberately holding the same value as `WARNING_HIGHLIGHT_MS`
 * and `SHARE_LINK_FLASH_MS`, not a reuse of either: this project's convention is
 * one constant per owning module per surface, ratified as R8 of the share-link
 * chrome spec.
 */
export const SECTION_FRESHNESS_FLASH_MS = 1600;

/**
 * Above this many changed sections, no card flashes at all and the announcement
 * degrades to a whole-surface sentence. A full re-parse was measured changing all
 * eleven of the probe fixture's sections at once; flashing eleven cards is a
 * strobe, and a cue that points at everything points at nothing.
 */
export const SECTION_FRESHNESS_MAX_CUES = 3;

export type SectionSignatures = ReadonlyMap<SectionId, string>;

export type SectionSignatureInput = {
  data: PublishedSectionData;
  bySection: SectionWarningRecord;
  /**
   * The actionable attention items routed to each section, keyed by the SAME
   * effective section id the modal buckets them under.
   *
   * Round-2 review found this omission by probe: attention items render inline
   * card content in crew, event, rooms and warnings, so a refresh that adds,
   * updates or resolves one changes visible card content while every own-field
   * signature stays equal. The caller supplies the grouping because it already
   * computes the placement predicate; duplicating that resolution here would be
   * a second source of truth for which section an item belongs to.
   */
  attentionBySection: ReadonlyMap<string, readonly AttentionItem[]>;
};

/**
 * djb2 over the JSON form, joined with the length so two strings that collide on
 * the integer still have to agree on size.
 */
function hash(value: unknown): string {
  const s = JSON.stringify(value ?? null) ?? "null";
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${h}:${s.length}`;
}

/**
 * The own-fields projection, section by section. Every entry mirrors the feed the
 * corresponding panel actually renders from; see the spec's section 4.1 table for
 * the per-row citation into `step3ReviewSections.tsx`.
 */
const OWN_FIELDS: Record<Exclude<SectionId, "report">, (d: PublishedSectionData) => unknown> = {
  venue: (d) => d.venue,
  event: (d) => d.eventDetails,
  // `previewRoster` is not decoration: it carries the persisted ids the crew row
  // actions target, so a row swap that reads identically still changed the card.
  crew: (d) => [d.crewMembers, d.previewRoster ?? null],
  contacts: (d) => [d.clientContact, d.contacts],
  schedule: (d) => [d.ros, d.dates],
  agenda: (d) => d.agendaBaseline,
  hotels: (d) => d.hotels,
  transport: (d) => d.transportation,
  rooms: (d) => [d.rooms, d.diagrams],
  packlist: (d) => [
    d.pullSheet,
    d.archivedPullSheetTabs,
    d.pullSheetOverride,
    d.pullSheetOverrideWire,
    d.archivedTabOffer ?? null,
  ],
  billing: (d) => d.billing,
  // NOT the full warning list. The published Sheet-warnings panel renders the
  // warnings routed to IT, and those arrive through `bySection` like every other
  // section's do. Hashing `d.warnings` wholesale here over-cued: round-2 probes
  // showed an edit to a CREW-routed warning reported `["crew","warnings"]` while
  // the rendered warnings panel was byte-identical.
  warnings: () => null,
  // A sub-block, never a rail id in its own right; present so the record is total.
  diagrams: (d) => d.diagrams,
};

/**
 * One signature per RENDERED rail section. A section that is not rendered gets no
 * entry, so it can never be cued.
 */
export function buildSectionSignatures(input: SectionSignatureInput): SectionSignatures {
  const { data, bySection, attentionBySection } = input;
  const out = new Map<SectionId, string>();
  for (const id of renderedSectionIds(data)) {
    const own = OWN_FIELDS[id as Exclude<SectionId, "report">];
    const routed = bySection[id] ?? null;
    // The decisions attached to THIS section's routed warnings, matched through
    // the canonical matcher rather than a reimplementation: a second matcher
    // would be a second source of truth for `(code, contentHash)`.
    const routedDecisions = warningsOf(routed).map((w) =>
      renderedDecisionState(findUseRawDecision(w, data.useRawDecisions)),
    );
    const region = SECTION_REGION_MAP[id];
    const anchor = region === null ? null : (data.sourceAnchors?.[region] ?? null);
    const attention = attentionBySection.get(id) ?? null;
    out.set(
      id,
      hash([own === undefined ? null : own(data), routed, routedDecisions, anchor, attention]),
    );
  }
  return out;
}

/**
 * ONLY the parts of a use-raw decision that reach the rendered control:
 * `preference` and `applied`, keyed by the identity that matched it. `target` is
 * documented as display-only, and `decidedAt` / `decidedBy` are not rendered at
 * all, so hashing the whole row cued a card whose HTML was unchanged (round-2
 * probe: `routedControlHtmlEqual:true` while the signature moved).
 */
function renderedDecisionState(d: ReturnType<typeof findUseRawDecision>) {
  if (d === undefined) return null;
  return { code: d.code, contentHash: d.contentHash, preference: d.preference, applied: d.applied };
}

/**
 * Every warning in a section's model, both partitions. Written defensively over
 * the record's shape rather than destructured, so a future partition added to
 * `SectionWarningModel` widens the signature instead of being silently ignored.
 */
function warningsOf(model: SectionWarningRecord[SectionId] | null): ParseWarning[] {
  if (model === null || model === undefined) return [];
  const out: ParseWarning[] = [];
  for (const value of Object.values(model)) {
    if (!Array.isArray(value)) continue;
    for (const item of value as unknown[]) {
      const w = (item as { warning?: unknown }).warning;
      if (w !== undefined && w !== null) out.push(w as ParseWarning);
    }
  }
  return out;
}

/**
 * Ids whose signature differs, over the UNION of both maps' keys.
 *
 * The union is load-bearing: a section can change by DISAPPEARING (agenda drops
 * out of the rail when its baseline empties), and a diff that walked only the new
 * map would report that as no change at all.
 *
 * Results come back in registry order, because the announcement reads them aloud
 * and document order is the only order a reader can follow.
 */
export function changedSectionIds(
  prev: SectionSignatures,
  next: SectionSignatures,
): SectionId[] {
  const changed = new Set<SectionId>();
  for (const [id, sig] of prev) if (next.get(id) !== sig) changed.add(id);
  for (const [id, sig] of next) if (prev.get(id) !== sig) changed.add(id);
  const order = [...next.keys(), ...prev.keys()];
  const seen = new Set<SectionId>();
  const out: SectionId[] = [];
  for (const id of order) {
    if (!changed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * The announcement, from the SAME ids the visual cue uses so the two legs can
 * never disagree.
 *
 * `labelOf` is a callback rather than a table in this module on purpose: the
 * caller reads it from `step3Sections(data)`, the list that renders the rail chip
 * and the section heading, so the spoken name is the rendered name by
 * construction. An earlier draft wrote sample copy from memory and produced
 * "Updated: Crew, Rooms and scope." — which no real combination can generate,
 * because the registry label is the single item "Rooms & scope". A duplicated
 * label map would have made that drift permanent and a "verbatim" test would have
 * pinned the wrong strings.
 *
 * `stillRendered` gates rather than filters. Naming only the survivors when one
 * section DISAPPEARED states something true and implies something false: that the
 * survivors are all that moved. So any removal degrades the whole sentence to the
 * surface statement, which is true and sends nobody hunting for a section that is
 * no longer on screen.
 */
export function freshnessAnnouncement(
  changed: readonly SectionId[],
  stillRendered: ReadonlySet<SectionId>,
  labelOf: (id: SectionId) => string | null,
): string {
  if (changed.length === 0) return "";
  const anyRemoved = changed.some((id) => !stillRendered.has(id));
  const labels = changed.map(labelOf).filter((l): l is string => l !== null && l.length > 0);
  if (anyRemoved || labels.length !== changed.length) return SURFACE_ANNOUNCEMENT;
  if (changed.length > SECTION_FRESHNESS_MAX_CUES) return SURFACE_ANNOUNCEMENT;
  return `Updated: ${joinLabels(labels)}.`;
}

/** The whole-surface fallback: over the cap, or when a section is gone. */
export const SURFACE_ANNOUNCEMENT = "Show details updated.";

/** Commas between, "and" before the last. No em dashes, no apostrophes. */
function joinLabels(labels: readonly string[]): string {
  if (labels.length === 1) return labels[0] as string;
  const head = labels.slice(0, -1).join(", ");
  return `${head} and ${labels[labels.length - 1] as string}`;
}

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
import {
  CREW_CAP,
  DIAGRAM_TILE_CAP,
  EVENT_DETAIL_GROUPS,
  HOTELS_CAP,
  PACK_LIST_CASES_CAP,
  PACK_LIST_ITEMS_CAP,
  ROOMS_CAP,
  SCHEDULE_DAYS_CAP,
  SCHEDULE_ENTRIES_CAP,
  findUseRawDecision,
} from "@/components/admin/wizard/step3ReviewSections";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";

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
/** Pick a fixed key set off a row, so unrendered persistence fields cannot leak in. */
function pick<T extends object>(row: T | null | undefined, keys: readonly string[]): unknown {
  if (row === null || row === undefined) return null;
  const r = row as Record<string, unknown>;
  return keys.map((k) => r[k] ?? null);
}
/**
 * Rows a body actually renders: the first `cap` of them, and the length.
 *
 * WHY THE CAP IS PART OF THE PROJECTION, AND WHY IT IS IMPORTED. Every list body
 * here slices to a permanent cap before rendering, so row 31 of a 30-row crew
 * table is not "content that will scroll into view" — it is content the card can
 * never show. Hashing it flashes a byte-identical card. The cap is imported from
 * the module that applies it rather than re-typed as a literal, so the two cannot
 * drift: raising `CREW_CAP` widens the signature in the same commit, and a
 * structural test (N11) pins that no cap is written here as a bare number.
 *
 * The LENGTH is kept alongside, because the bodies render a count and an
 * over-cap note; a 31st row appearing is invisible in the rows and visible in
 * the count.
 */
const pickAll = (
  rows: readonly unknown[] | undefined,
  keys: readonly string[],
  cap: number | null,
) => [
  (cap === null ? (rows ?? []) : (rows ?? []).slice(0, cap)).map((row) =>
    pick(row as object, keys),
  ),
  (rows ?? []).length,
];

/**
 * The own-fields projection, section by section, narrowed to what each body
 * actually RENDERS.
 *
 * WHY NARROWED, AND WHY THAT MATTERS MORE THAN IT SOUNDS. The first version hashed
 * whole persistence objects. That is not a conservative default: it produces FALSE
 * cues, and this spec's own priority is that a false cue is worse than a missed one
 * because it teaches the reader the cue means nothing. A sync touching only a
 * hotel's `confirmation_no` flashed a byte-identical card, and `confirmation_no` is
 * documented as NEVER rendered (`step3ReviewSections.tsx:2719`). Same for
 * `role_flags` / `stage_restriction` / `flight_info` on crew, `power` /
 * `digital_signage` / `notes` on rooms, `notes` on a contact, and `notes` /
 * `timezone` on the venue: every one is read by the adapter and reaches no DOM.
 *
 * Each key list below is the RENDERED set for that body. When a body starts
 * rendering a field it did not before, its list has to grow in the same commit,
 * which is the same discipline the section registry already lives under.
 */
const VENUE_KEYS = ["name", "address", "city", "loadingDock", "googleLink"] as const;
const CREW_KEYS = ["name", "role", "date_restriction", "phone", "email"] as const;
const CONTACT_KEYS = ["kind", "name", "phone", "email"] as const;
const HOTEL_KEYS = ["hotel_name", "hotel_address", "names", "check_in", "check_out"] as const;
// The five ROOM_SCOPE rows plus the identity and timing fields the card shows.
const ROOM_KEYS = [
  "name",
  "kind",
  "floor",
  "setup",
  "dimensions",
  "set_time",
  "show_time",
  "strike_time",
  "audio",
  "video",
  "lighting",
  "scenic",
  "other",
] as const;

/** Only the closed event-detail vocabulary renders; any other key is invisible. */
function renderedEventDetails(d: PublishedSectionData): unknown {
  const details = (d.eventDetails ?? {}) as Record<string, unknown>;
  const keys = EVENT_DETAIL_GROUPS.flatMap((g) => g.keys as readonly string[]);
  return keys.map((k) => details[k] ?? null);
}

/** Schedule entries render start/title/kind plus the day's own meta, both capped. */
function renderedRunOfShow(d: PublishedSectionData): unknown {
  const ros = (d.ros ?? {}) as Record<string, unknown>;
  const isos = Object.keys(ros).sort();
  return [
    isos.slice(0, SCHEDULE_DAYS_CAP).map((iso) => {
      const day = (ros[iso] ?? {}) as Record<string, unknown>;
      const entries = Array.isArray(day.entries) ? day.entries : [];
      return [
        iso,
        day.showStart ?? null,
        day.window ?? null,
        day.showEnd ?? null,
        entries
          .slice(0, SCHEDULE_ENTRIES_CAP)
          .map((e) => pick(e as object, ["start", "title", "kind"])),
        entries.length,
      ];
    }),
    isos.length,
  ];
}

/**
 * The four date fields the schedule body renders, via `aggregateDays`
 * (`lib/crew/agendaDisplay.ts:119`, called at `step3ReviewSections.tsx:1961`).
 * `loadIn` exists on the parsed type (`lib/parser/types.ts:222`) and reaches no
 * DOM anywhere under `components/admin/`, so hashing the whole `dates` object
 * cued the schedule card on a field nobody can see.
 */
const DATE_KEYS = ["travelIn", "set", "showDays", "travelOut"] as const;

/** A pack case renders its label and each item's qty/item/cat/subCat, never the raw snippet. */
function renderedPullSheet(d: PublishedSectionData): unknown {
  const cases = d.pullSheet ?? [];
  return [
    cases.slice(0, PACK_LIST_CASES_CAP).map((c) => {
      const row = (c ?? {}) as Record<string, unknown>;
      const items = Array.isArray(row.items) ? row.items : [];
      return [
        row.caseLabel ?? null,
        items
          .slice(0, PACK_LIST_ITEMS_CAP)
          .map((i) =>
            typeof i === "string" ? i : pick(i as object, ["qty", "item", "cat", "subCat"]),
          ),
        items.length,
      ];
    }),
    cases.length,
  ];
}

/**
 * The diagrams sub-block renders three things and no more: the linked-folder
 * link, the first `DIAGRAM_TILE_CAP` embedded images as tiles, and a COUNT of
 * linked folder items (`step3ReviewSections.tsx:3741`, `:3745`, `:3752`). The
 * per-item contents of `linkedFolderItems` never reach the DOM, so only its
 * length belongs in the signature.
 *
 * (Round-2 review also named `diagrams.pending`. Refuted by probe: no such field
 * exists on `ParseResult["diagrams"]` (`lib/parser/types.ts:513`); the wrapper
 * that has one resolves to `current` before this data is built
 * (`lib/data/diagrams.ts:54`), so it can never be hashed here.)
 */
function renderedDiagrams(d: PublishedSectionData): unknown {
  const dg = (d.diagrams ?? null) as Record<string, unknown> | null;
  if (dg === null) return null;
  const images = Array.isArray(dg.embeddedImages) ? dg.embeddedImages : [];
  const items = Array.isArray(dg.linkedFolderItems) ? dg.linkedFolderItems : [];
  return [dg.linkedFolder ?? null, images.slice(0, DIAGRAM_TILE_CAP), images.length, items.length];
}

const OWN_FIELDS: Record<Exclude<SectionId, "report">, (d: PublishedSectionData) => unknown> = {
  venue: (d) => pick(d.venue, VENUE_KEYS),
  event: renderedEventDetails,
  // `published` / `archived` are RENDERED state here, not lifecycle trivia: they
  // gate the crew row actions entirely (`step3ReviewSections.tsx:4183`), so a
  // toggle adds or removes a control on every row. `previewRoster` carries the
  // persisted ids those actions target.
  crew: (d) => [
    pickAll(d.crewMembers, CREW_KEYS, CREW_CAP),
    d.published && !d.archived ? (d.previewRoster ?? null) : null,
  ],
  contacts: (d) => [
    pick(d.clientContact, ["name", "phone", "email", "officePhone", "secondary"]),
    // No cap: the contacts body renders every row it is given.
    pickAll(d.contacts, CONTACT_KEYS, null),
  ],
  schedule: (d) => [renderedRunOfShow(d), pick(d.dates, DATE_KEYS)],
  agenda: (d) => d.agendaBaseline,
  hotels: (d) => pickAll(d.hotels, HOTEL_KEYS, HOTELS_CAP),
  transport: (d) => d.transportation,
  rooms: (d) => [pickAll(d.rooms, ROOM_KEYS, ROOMS_CAP), renderedDiagrams(d)],
  // The archived-tab affordances are gated on the same lifecycle pair
  // (`step3ReviewSections.tsx:4310`), so they belong to this section's render.
  packlist: (d) => [
    renderedPullSheet(d),
    d.archivedPullSheetTabs,
    d.pullSheetOverride,
    d.pullSheetOverrideWire,
    d.archivedTabOffer ?? null,
    d.published && !d.archived,
  ],
  billing: (d) => d.billing,
  // Handled in `buildSectionSignatures`, not here: this card's body depends on
  // the WHOLE routed map, which no `(data) => unknown` projection can see. See
  // `pointerState` below.
  warnings: () => null,
  // A sub-block, never a rail id in its own right; present so the record is total.
  diagrams: renderedDiagrams,
};

/**
 * One signature per RENDERED rail section. A section that is not rendered gets no
 * entry, so it can never be cued.
 */
export function buildSectionSignatures(input: SectionSignatureInput): SectionSignatures {
  const { data, bySection, attentionBySection } = input;
  const ids = renderedSectionIds(data);
  const out = new Map<SectionId, string>();

  /**
   * The Sheet-warnings card's "warnings are elsewhere" state, which round-2
   * review found the detector blind to.
   *
   * When that panel has no rows of its own it renders a sentence NAMING the
   * other sections that carry warnings (`step3ReviewSections.tsx:2906`, sentence
   * at `:782`, cap at `:739`). So its rendered body is a function of the whole
   * routed map, and a warn moving from Crew to Rooms rewrites this card while
   * `bySection.warnings` never moves. `null` when the panel has rows of its
   * own: the sentence is not rendered then, and hashing the map unconditionally
   * would cue this card for content that belongs to another one.
   *
   * The ordered id list plus the section total is the EXACT input
   * `pointerSentenceParts` consumes, so named / extra / missCount are all
   * derived from what is hashed here rather than approximated.
   */
  const warningsHasOwnRows = warningsOf(bySection.warnings ?? null).length > 0;
  const pointerTargets = ids.filter(
    (id) => id !== "warnings" && warningsOf(bySection[id] ?? null).length > 0,
  );
  // Both halves of the render gate, not just the first. With no targets at all
  // the panel renders no sentence, so the section TOTAL is not on screen either;
  // hashing it unconditionally cued this card whenever any unrelated section
  // appeared or vanished.
  const pointerState =
    warningsHasOwnRows || pointerTargets.length === 0 ? null : [pointerTargets, ids.length];

  for (const id of ids) {
    const own = OWN_FIELDS[id as Exclude<SectionId, "report">];
    const routed = bySection[id] ?? null;
    // The decisions attached to THIS section's routed warnings, matched through
    // the canonical matcher rather than a reimplementation: a second matcher
    // would be a second source of truth for `(code, contentHash)`.
    const routedDecisions = warningsOf(routed).map((w) =>
      renderedDecisionState(findUseRawDecision(w, data.useRawDecisions)),
    );
    // The RESOLVED href, not the raw anchor. `buildSheetDeepLink` collapses every
    // anchor outside `SOURCE_LINK_ALLOWLIST`, and every one with a non-numeric
    // `gid`, onto the same `#gid=0` (`lib/sheet-links/buildSheetDeepLink.ts:22`),
    // discarding `gid` and `a1` on the way. Hashing the raw value cued the card
    // when one unusable anchor replaced another and the link did not move. The
    // drive id is a constant here because only the anchor's contribution to the
    // fragment varies per section.
    const region = SECTION_REGION_MAP[id];
    const anchor = region === null ? null : (data.sourceAnchors?.[region] ?? null);
    const href = buildSheetDeepLink(ANCHOR_PROBE_DFID, anchor);
    const attention = (attentionBySection.get(id) ?? []).map(renderedAttentionState);
    out.set(
      id,
      hash([
        own === undefined ? null : own(data),
        id === "warnings" ? pointerState : null,
        routed,
        routedDecisions,
        href,
        attention,
      ]),
    );
  }
  return out;
}

/**
 * A stand-in drive id, so `buildSheetDeepLink` performs its real normalization
 * while the constant prefix contributes nothing that varies between sections.
 * Never rendered; never leaves this module.
 */
const ANCHOR_PROBE_DFID = "anchor-probe";

/**
 * ONLY the parts of an attention item that `AttentionBanner` renders: the alert
 * payload, the tone that picks its stripe, the actionable/clearing pair that
 * picks its copy, and the id it anchors on
 * (`components/admin/review/AttentionBanner.tsx:103`, `:108`, `:162`, `:261`).
 *
 * `menuTitle` / `menuSubtitle` are deliberately absent: they render in the
 * attention MENU, which is modal chrome and not a section card, so a refresh
 * that rewrites only the menu copy must not flash the card below it. `crewKey`,
 * `crewMatch` and `sectionId` are routing inputs the caller has already consumed
 * by bucketing the item.
 */
function renderedAttentionState(item: AttentionItem): unknown {
  return [
    item.id,
    item.kind,
    item.tone,
    item.actionable,
    item.clearingKind ?? null,
    item.kind === "alert" ? item.alert : null,
  ];
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
export function changedSectionIds(prev: SectionSignatures, next: SectionSignatures): SectionId[] {
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

/**
 * Commas only, with NO trailing conjunction. Design review caught why: a registry
 * label can itself contain "and" as an ampersand, so `Rooms & scope` joined with
 * a final "and" produced "Crew, Rooms & scope and Hotels", which reads as four
 * items rather than three. A plain comma list is unambiguous at every length.
 * No em dashes, no apostrophes (DESIGN.md).
 */
function joinLabels(labels: readonly string[]): string {
  return labels.join(", ");
}

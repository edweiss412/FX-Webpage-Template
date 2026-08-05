/**
 * components/admin/review/sectionFreshness.ts
 *
 * The freshness-cue DETECTOR (spec 2026-08-03-modal-freshness-cue sections 4.1
 * and 4.6). Its own code is pure: no hooks, no JSX, no Supabase, no clock, no
 * randomness. Stated that precisely because it is NOT dependency-free — see the
 * note below.
 *
 * WHAT IT IMPORTS, AND THE TENSION THERE. Getting the projection right means
 * reaching the same decisions the renderers reach, which is why the caps, the
 * key normalizer, the paint-or-fallback call, the anchor builder and the note
 * ordering are all IMPORTED rather than re-typed — four review rounds were spent
 * on divergence between a re-typed value and the shipped one. The cost is that
 * this module depends on `step3ReviewSections.tsx`, a component file, for the
 * render caps and the event vocabulary. That edge predates and outlives this
 * comment; it is recorded rather than hidden, and `attentionBannerPaint.ts`
 * exists because the same pressure nearly added a SECOND such edge and that one
 * was cheap to avoid. A future cleanup would lift the caps into their own module
 * the way the paint helpers now are.
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
import { resolveCurrentDiagrams } from "@/lib/data/diagrams";
import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";
import { agendaOverflowNotes, driftNote } from "@/lib/agenda/agendaPaint";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import { orderNotes, toNoteItem } from "@/lib/admin/parseAttentionNote";
import {
  FAILED_KEYS_CAP,
  hasVisibleText,
  usableFailedKeys,
} from "@/components/admin/review/attentionBannerPaint";
import { formatDataGapBreakdown } from "@/lib/parser/dataGaps";
import {
  PLACEHOLDER_RE,
  isMessageCode,
  lookupHelpfulContext,
  type MessageParams,
} from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { SECTION_REGION_MAP, type SectionId } from "@/lib/admin/step3SectionStatus";
import {
  CREW_CAP,
  DIAGRAM_TILE_CAP,
  EVENT_DETAIL_GROUPS,
  HOTELS_CAP,
  PACK_LIST_CASES_CAP,
  hasContent,
  PACK_LIST_ITEMS_CAP,
  ROOMS_CAP,
  roomHasScope,
  SCHEDULE_DAYS_CAP,
  SCHEDULE_ENTRIES_CAP,
  findUseRawDecision,
  packItemLabel,
  contactBlocks,
} from "@/components/admin/wizard/step3ReviewSections";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
// BL-FRESHNESS-PROJECTION-NARROWING: the four renderer collapses the bodies
// apply before painting. IMPORTED, never re-typed — a hand-copied collapse that
// drifts from its renderer is the same defect this whole module exists to
// prevent, one indirection further out.
import { isParseableUrl } from "@/lib/url/isParseableUrl";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";
import { formatIsoDate } from "@/lib/format/date";

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
 * Every string leaf, normalized the way EVERY card body normalizes it before it
 * paints: `String(v ?? "").trim()`, with empty collapsing to `null`
 * (`components/admin/wizard/step3ReviewSections.tsx:256`, and `hasContent` at
 * `:223` which is the same predicate spelled as a guard).
 *
 * WHY THIS IS A NORMALIZER AND NOT A LIST OF FIELDS. Round-3 review probed the
 * shipped renderers and found that changing `"x"` to `" x "` on ANY of ~40 fields
 * across venue, event, billing and transport moved the signature while the DOM
 * stayed byte-identical. That is one defect with forty faces, and patching forty
 * projections would leave the forty-first. Normalizing at the leaf closes it for
 * every field that exists now and every one added later, because the detector
 * and the renderer now agree on what "the same value" means.
 */
function normalize(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = normalize(v);
    return out;
  }
  return value ?? null;
}

/**
 * Two independent rolling hashes over the normalized JSON form, joined with its
 * length.
 *
 * WHY TWO. A single 32-bit djb2 plus a length has constructible same-length
 * collisions, and round-3 review constructed one: two crew payloads that render
 * DIFFERENT HTML hashed identically, which is a MISSED cue on a card that really
 * changed. A second lane with a different multiplier and seed makes an accidental
 * collision require agreement on both lanes and the length at once. Still a change
 * DETECTOR, not a digest: nothing here is a security boundary, so the bar is
 * "does not collide on real payloads", not preimage resistance.
 */
function hash(value: unknown): string {
  const s = JSON.stringify(normalize(value)) ?? "null";
  let a = 5381;
  let b = 2166136261;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = ((a << 5) + a + c) | 0;
    b = (Math.imul(b ^ c, 16777619) + i) | 0;
  }
  return `${a}:${b}:${s.length}`;
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
  /**
   * Extra painted facets for a row, appended to the flat key pick
   * (BL-FRESHNESS-PROJECTION-NARROWING). This is where a field that reaches the
   * DOM through a renderer COLLAPSE goes — the field leaves `keys`, and the
   * collapse comes back here as a call to the shipped function. Keeping both in
   * one place is deliberate: a reader can see, per section, exactly which fields
   * are raw and which are projected, without cross-referencing a second table.
   */
  project?: (row: Record<string, unknown>) => unknown,
) => [
  (cap === null ? (rows ?? []) : (rows ?? []).slice(0, cap)).map((row) =>
    project === undefined
      ? pick(row as object, keys)
      : [pick(row as object, keys), project((row ?? {}) as Record<string, unknown>)],
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
/** VENUE_KEYS minus the link, which the projection handles through its own two
 *  painted facets (presence for the count, parsed href for the tile). */
const VENUE_KEYS_NARROWED = VENUE_KEYS.filter((k) => k !== "googleLink");
const CREW_KEYS = ["name", "role", "date_restriction", "phone", "email"] as const;
/** CREW_KEYS minus the restriction object, which the projection replaces with the
 *  single label the row actually paints. */
const CREW_KEYS_NARROWED = CREW_KEYS.filter((k) => k !== "date_restriction");
const CONTACT_KEYS = ["kind", "name", "phone", "email"] as const;
const HOTEL_KEYS = ["hotel_name", "hotel_address", "names", "check_in", "check_out"] as const;
/** HOTEL_KEYS minus the three the projection paints through the renderer's own
 *  collapses (name filter, date humanizer). */
const HOTEL_KEYS_NARROWED = HOTEL_KEYS.filter(
  (k) => k !== "names" && k !== "check_in" && k !== "check_out",
);
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
/** The contact and vehicle fields the transportation body renders. */
const TRANSPORT_KEYS = [
  "driver_name",
  "driver_phone",
  "driver_email",
  "loadout_name",
  "loadout_phone",
  "loadout_email",
  "vehicle",
  "license_plate",
  "color",
  "parking",
  "notes",
] as const;

/** Only the closed event-detail vocabulary renders; any other key is invisible. */
function renderedEventDetails(d: PublishedSectionData): unknown {
  const details = (d.eventDetails ?? {}) as Record<string, unknown>;
  const keys = EVENT_DETAIL_GROUPS.flatMap((g) => g.keys as readonly string[]);
  // BL-FRESHNESS-PROJECTION-NARROWING: the body coerces every value with
  // `String(...).trim()` and puts `opening_reel` through `stripOpeningReelText`
  // first (`step3ReviewSections.tsx:2224-2231`), which erases embedded
  // Drive/Docs URLs. Two raw values differing only inside a stripped URL paint
  // the same characters, so hashing the raw text over-cues.
  //
  // The trim applies to EVERY key, not just the reel: `" house"` and `"house"`
  // paint identically too, and a projection that narrowed only the named field
  // would leave the same defect standing on the other twenty.
  return keys.map((k) => {
    const raw = details[k];
    if (raw === undefined || raw === null) return null;
    const text = String(raw).trim();
    return k === "opening_reel" ? stripOpeningReelText(text) : text;
  });
}

/**
 * The synthetic group the day body never caps (`step3ReviewSections.tsx:1836`).
 */
function isSyntheticEntry(e: unknown): boolean {
  const kind = (e as Record<string, unknown> | null)?.kind;
  return kind === "strike" || kind === "loadout";
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
        // The SAME cap-exemption partition the day body applies
        // (`step3ReviewSections.tsx:1835-1837`): only the agenda group is capped,
        // and the synthetic strike/load-out group ALWAYS renders after it. A flat
        // slice hashed neither a strike row past the cap nor an edit to one, so a
        // same-day load-out could change on screen with no cue (class-sweep, this
        // round). `hidden` is derived from `agenda.length`, which the count below
        // already covers.
        entries
          .filter((e) => !isSyntheticEntry(e))
          .slice(0, SCHEDULE_ENTRIES_CAP)
          .map((e) => pick(e as object, ["start", "title", "kind"])),
        entries.filter(isSyntheticEntry).map((e) => pick(e as object, ["start", "title", "kind"])),
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
          // BL-FRESHNESS-PROJECTION-NARROWING: the item paints as
          // `packItemLabel(item)` and nothing else (`step3ReviewSections.tsx:2383`),
          // which erases `TBD`/`N/A`/`TBA` from `cat`/`subCat` through
          // `shouldHideGenericOptional`. One sentinel edited into another is a
          // byte-identical row. Calling the shipped label rather than the four
          // raw fields makes the projection exactly as wide as the string.
          .map((i) => (typeof i === "string" ? i : packItemLabel(i as never))),
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
 * THE UNWRAP IS THE WHOLE POINT. Post-M7 the persisted jsonb is a
 * `{ current, pending }` wrapper, and `publishedAdapter.ts:78` passes it through
 * UNCHANGED — it is the RENDERER that unwraps, calling `resolveCurrentDiagrams`
 * at `step3ReviewSections.tsx:3874`. Reading `embeddedImages` off the wrapper
 * finds `undefined` on every field, so every wrapped show collapsed to one
 * constant tuple and NO diagram edit could cue: the whole-diff review probed the
 * revision id, the folder URL, the image alt, the folder item count and current
 * presence, and all five were missed. (An earlier comment here asserted the
 * adapter resolved it first. It does not — that claim is what the probe killed.)
 *
 * Calling the shipped resolver rather than re-testing for `.current` also means
 * a malformed row fails the SAME way on both sides: `resolveCurrentDiagrams`
 * returns null unless `snapshot_revision_id` is a string, and a null resolve
 * paints nothing.
 *
 * `snapshot_revision_id` is in the signature because it is painted — it is a
 * path segment of every tile's asset URL (`:3880`).
 *
 * DOCUMENTED LIMIT: the tile slice hashes whole image entries, so a field on
 * `PersistedEmbeddedImage` that the tile does not paint would over-cue. Left
 * as-is deliberately — no probe demonstrates such a field today, and an unprobed
 * tightening is how a projection drifts away from its renderer.
 */
function renderedDiagrams(d: PublishedSectionData): unknown {
  const dg = resolveCurrentDiagrams(d.diagrams);
  if (dg === null) return null;
  const images = Array.isArray(dg.embeddedImages) ? dg.embeddedImages : [];
  const items = Array.isArray(dg.linkedFolderItems) ? dg.linkedFolderItems : [];
  return [
    dg.snapshot_revision_id,
    dg.linkedFolder ?? null,
    images.slice(0, DIAGRAM_TILE_CAP),
    images.length,
    items.length,
  ];
}

/**
 * A field the renderer tests with `!== null` before painting, kept distinguishable
 * from a blank one.
 *
 * `normalize()` collapses `" "` to `null` because every card body in
 * `step3ReviewSections.tsx` paints `String(v ?? "").trim()`. The agenda schedule
 * block does NOT: `normalizeAgendaExtraction` type-checks `title`/`room`/`drift`/
 * `date` and passes blanks straight through, and `AgendaScheduleBlock` branches
 * on `!== null` (`:121`, `:165`, `:177`, `:195`), so `null -> " "` MOUNTS a
 * paragraph. Wrapping the value in a one-element array survives the leaf trim as
 * `[null]`, which is distinct from a bare `null` — the presence bit is preserved
 * while the value itself stays trimmed (HTML collapses whitespace, so `" "` and
 * `"  "` really are the same paint).
 */
function nullable(v: string | null | undefined): unknown {
  return v === null || v === undefined ? null : [v];
}

/**
 * The agenda exactly as `PublishedAgendaList` -> `AgendaItemRow` ->
 * `AgendaScheduleBlock` paints it (`step3ReviewSections.tsx:4238`).
 *
 * Hashing `agendaBaseline` wholesale was wrong in both directions, and the
 * whole-diff review probed both: `corrections`, `extractorVersion` and
 * `sourceRevision` ride on the extraction and are painted NOWHERE (false cues),
 * while the renderer's null branches make blank-vs-absent visible (missed cues).
 *
 * `normalizeAgendaExtraction` is called here for the same reason the diagrams
 * resolver is: `AgendaScheduleBlock` runs it itself (`:73`) and renders nothing
 * unless it returns a high-confidence extraction with days, so two payloads it
 * rejects paint the same nothing and must hash alike.
 *
 * `label` is deliberately absent: it is the React key in `PublishedAgendaList`
 * (`:3554`) and reaches no DOM text. `fullExtraction` contributes only its
 * PRESENCE, which with a non-zero drop count is what gates the "Show all"
 * button (`:3221`); its contents paint only after a click, which no refresh can
 * cause.
 */
function renderedAgenda(d: PublishedSectionData): unknown {
  return d.agendaBaseline.map((item) => {
    const block = item.block;
    if (block === null) return [item.badge ?? null, nullable(item.href), null];
    const ext = normalizeAgendaExtraction(block.extraction);
    const painted =
      ext === null || ext.confidence !== "high" || ext.days.length === 0
        ? null
        : ext.days.map((day) => [
            day.dayLabel,
            nullable(day.date),
            day.sessions.map((session) => [
              session.time,
              nullable(session.title),
              nullable(session.room),
              // The raw drift never paints — only this derived sentence does.
              session.drift === null ? null : [driftNote(session.drift)],
              session.tracks.map((track) => [
                track.label,
                nullable(track.title),
                nullable(track.room),
              ]),
            ]),
          ]);
    return [
      item.badge ?? null,
      nullable(item.href),
      painted,
      // The drop counts reach the screen ONLY through these strings.
      agendaOverflowNotes(block),
      block.fullExtraction !== undefined,
    ];
  });
}

/**
 * Transportation as the body renders it: the contact/vehicle block, plus only
 * those schedule legs with a real stage (`step3ReviewSections.tsx:1349`). A
 * stage-less leg is filtered out before paint, so mutating its date, time or
 * assigned names changes nothing on screen.
 */
function renderedTransportation(d: PublishedSectionData): unknown {
  const t = (d.transportation ?? null) as Record<string, unknown> | null;
  if (t === null) return null;
  const legs = Array.isArray(t.schedule) ? t.schedule : [];
  return [
    pick(t, TRANSPORT_KEYS),
    // BL-FRESHNESS-PROJECTION-NARROWING, INSIDE a surviving leg: the body joins
    // date and time into ONE `when` string and filters passenger names by
    // `hasContent` (`step3ReviewSections.tsx:1351-1355`). Two legs whose
    // date/time split differently across the same joined line are the same
    // painted characters, and a blank name is dropped before it can render.
    legs
      .filter((leg) => hasContent((leg as Record<string, unknown>)?.stage))
      .map((leg) => {
        const row = (leg ?? {}) as Record<string, unknown>;
        const names = Array.isArray(row.assigned_names) ? row.assigned_names : [];
        return [
          row.stage ?? null,
          [row.date, row.time].filter((x) => hasContent(x)).join(" "),
          names.filter((n) => hasContent(n)),
        ];
      }),
  ];
}

const OWN_FIELDS: Record<Exclude<SectionId, "report">, (d: PublishedSectionData) => unknown> = {
  // BL-FRESHNESS-PROJECTION-NARROWING. `googleLink` reaches the DOM only as
  // `isParseableUrl(link) ? link.trim() : null` (`step3ReviewSections.tsx:1253`),
  // so one unparseable value edited into another paints nothing.
  //
  // THE PRESENCE BIT IS KEPT, AND THE PROBE IS WHY. The obvious narrowing —
  // replace the raw link with the gated href — is WRONG, and wrong in the
  // missed-cue direction this entry's parent findings were about: the field
  // COUNT in the section eyebrow counts the link whether or not it parses, so
  // absent-to-unparseable moves a painted "(3)" to "(4)" that the gated href
  // cannot see. Probed, not reasoned: `sectionFreshnessProjection.probe.test.tsx`
  // renders both pairs and the count difference is in the transcript.
  venue: (d) => [
    pick(d.venue, VENUE_KEYS_NARROWED),
    hasContent(d.venue?.googleLink),
    isParseableUrl(d.venue?.googleLink) ? (d.venue?.googleLink ?? "").trim() : null,
  ],
  event: renderedEventDetails,
  // `published` / `archived` are RENDERED state here, not lifecycle trivia: they
  // gate the crew row actions entirely (`step3ReviewSections.tsx:4183`), so a
  // toggle adds or removes a control on every row. `previewRoster` carries the
  // persisted ids those actions target.
  crew: (d) => [
    // BL-FRESHNESS-PROJECTION-NARROWING: `date_restriction` paints ONLY through
    // `partialAttendanceLabel(dr, { humanize: false })`
    // (`step3ReviewSections.tsx:1682`), which collapses `kind:"none"` to nothing,
    // ignores `days` entirely for `unknown_asterisk`, and drops blank days. The
    // raw object moved the hash on all three.
    pickAll(d.crewMembers, CREW_KEYS_NARROWED, CREW_CAP, (row) => [
      partialAttendanceLabel(row.date_restriction as never, { humanize: false }),
    ]),
    d.published && !d.archived ? (d.previewRoster ?? null) : null,
  ],
  // BL-FRESHNESS-PROJECTION-NARROWING: the body does not render the two source
  // lists — it renders `contactBlocks(clientContact, contacts)`
  // (`step3ReviewSections.tsx:1155`), which DROPS any block with no name and no
  // content rows. An all-blank contact row therefore moved the hash and nothing
  // else. Calling the shipped builder makes the projection the painted list by
  // construction, so the drop rule cannot be transcribed wrong or drift later.
  // No cap: the body renders every block it is given.
  contacts: (d) =>
    contactBlocks(
      (d.clientContact ?? null) as never,
      (d.contacts ?? []) as never,
    ) as unknown as unknown[],
  schedule: (d) => [renderedRunOfShow(d), pick(d.dates, DATE_KEYS)],
  agenda: renderedAgenda,
  // BL-FRESHNESS-PROJECTION-NARROWING: guest names are filtered by `hasContent`
  // and the two dates paint as `formatIsoDate(..., "weekday-short")`
  // (`step3ReviewSections.tsx:2733-2734`), so a blank name and any two ISO
  // strings that humanize to the same day were both over-cueing.
  hotels: (d) =>
    pickAll(d.hotels, HOTEL_KEYS_NARROWED, HOTELS_CAP, (row) => {
      const names = Array.isArray(row.names) ? row.names : [];
      return [
        names.filter((n) => hasContent(n)),
        row.check_in ? formatIsoDate(row.check_in as string, "weekday-short") : null,
        row.check_out ? formatIsoDate(row.check_out as string, "weekday-short") : null,
      ];
    }),
  // The SAME leg filter the body applies (`step3ReviewSections.tsx:1349`): a leg
  // whose stage is blank is dropped before render, so its other fields cannot
  // reach the DOM and must not reach the signature. Round-3 review found four
  // of them cueing a byte-identical card.
  transport: (d) => renderedTransportation(d),
  // The rail count is `rooms.filter(roomHasScope).length` over the UNCAPPED list
  // (`step3ReviewSections.tsx:4260`), so a room PAST the cap gaining or losing
  // scope moves a painted number that the capped projection cannot see. Calling
  // the shipped predicate keeps `N/A`-style empty scope values collapsing the
  // same way on both sides (`isEmptyScopeValue`, `:237`).
  rooms: (d) => [
    pickAll(d.rooms, ROOM_KEYS, ROOMS_CAP),
    d.rooms.filter(roomHasScope).length,
    renderedDiagrams(d),
  ],
  // The archived-tab affordances are gated on the same lifecycle pair
  // (`step3ReviewSections.tsx:4310`), so they belong to this section's render.
  packlist: (d) => [
    renderedPullSheet(d),
    d.archivedPullSheetTabs,
    d.pullSheetOverride,
    // ONLY the tab name. `PullSheetOverrideWire` also carries a `fingerprint`
    // (`components/admin/review/sectionData.ts:88`) that the active-override card
    // never paints — it renders the tab name and the mutation controls — so a
    // fingerprint-only change flashed byte-identical Pack-list HTML (round-6
    // review probe).
    pick(d.pullSheetOverrideWire, ["tabName"]),
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
  const warningsRendered = ids.includes("warnings");
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
    const attention = renderedAttentionState(attentionBySection.get(id) ?? [], warningsRendered);
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
 * An attention item contributes ONLY what its own render site paints, and there
 * are TWO sites with disjoint field sets.
 *
 * ROUND-3 REVIEW probed this exhaustively and reported that every field of the
 * payload was a false cue. That is true of the NOTE channel and false of the
 * banner: the probe used a note-path item, where the composer reads two fields
 * and nothing else. Branching here on the SAME predicate the router uses is what
 * makes both answers right at once.
 *
 * - **Note channel** (`lib/admin/sectionAttention.ts:143`): an item enters it
 *   only if `toNoteItem` accepts it AND it routed to `warnings` AND that section
 *   is rendered. `composeParseNote` then reads `alert.code` and
 *   `alert.errorCode` (`lib/admin/parseAttentionNote.ts:44`, `:48`), and the DOM
 *   adds `item.id` as key and testid (`step3ReviewSections.tsx:2883`). The
 *   warning COUNT in that sentence comes from `rows.length`, not the item, and
 *   the routed warnings are already in the signature.
 * - **Banner channel** (`components/admin/review/AttentionBanner.tsx`): the
 *   stripe reads `tone` (`:108`), the clearing copy reads `actionable` and
 *   `clearingKind` (`:162`), the anchor reads `id` (`:261`), and the payload
 *   renders `alertId`, `code`, `template`, `params`, `action`, `helpHref`,
 *   `raisedAt`, `autoClearNote`, `failedKeys` and `dataGaps`.
 *
 * `occurrenceCount` is excluded from BOTH: it is written at
 * `lib/admin/attentionItems.ts:311` and has no non-test reader anywhere, so a
 * repeated occurrence bumped the signature and cued a byte-identical card.
 * `errorCode` is excluded from the BANNER only, where nothing reads it.
 *
 * `menuTitle` / `menuSubtitle` stay excluded from both: they paint in the
 * attention MENU, which is modal chrome rather than a section card.
 */
const BANNER_ALERT_KEYS_SANS_TEMPLATE = [
  "alertId",
  "code",
  "action",
  "helpHref",
  "raisedAt",
  "autoClearNote",
] as const;

/**
 * The alert payload as the banner PAINTS it, not as it is stored.
 *
 * Round-4 review probed the shipped `AttentionBanner` and found seven more
 * false-cue inputs inside the payload, all the same shape as the whitespace
 * class before it: the renderer caps, sorts, drops or formats a value and the
 * detector hashed the raw one. So this runs the payload through the SAME pure
 * functions the banner calls, which is the mechanism `N12` already pins for
 * anchors. A cap raised or a formatter changed then moves both at once.
 *
 * - `failedKeys` through `usableFailedKeys`, which drops blank keys, then the
 *   banner's own `FAILED_KEYS_CAP`. The LENGTH stays, because the banner paints
 *   a `+N more` tail: a seventh key is invisible as a key and visible as a count.
 * - `dataGaps` through `formatDataGapBreakdown`, which IS the painted string, so
 *   classes past its four-class cap cannot cue. Paired with the render gate
 *   (`total > 0`, `components/admin/review/AttentionBanner.tsx:134`), which is
 *   the only way `total` reaches the screen — as a boolean, never as a number.
 * - `params` narrowed to keys the `template` actually interpolates. A param the
 *   template never names cannot change a glyph.
 */
/**
 * `formatDataGapBreakdown` reads `summary.classes` without guarding it, so a
 * payload whose `classes` is absent throws. That payload is JSONB off the wire,
 * not a typed literal, so "cannot happen" is not available here — and a throw in
 * the DETECTOR would take down the whole modal render for a cosmetic cue. On a
 * shape the formatter cannot read, fall back to the raw value: the cue may then
 * be conservative rather than exact, which is the correct direction to fail.
 */
/**
 * Every param name a template interpolates, in all three spellings the renderer
 * will accept for it. `PLACEHOLDER_RE` is a module-level GLOBAL regex, so
 * `lastIndex` is reset before use exactly as the renderer does
 * (`components/messages/renderEmphasis.tsx:112`); skipping that would make the
 * result depend on whoever scanned last.
 */
function placeholderKeys(template: string): Set<string> {
  const out = new Set<string>();
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(template)) !== null) {
    const key = m[1];
    if (key !== undefined) out.add(key);
  }
  return out;
}

/** The catalog help copy for this alert, or null when the code has none. */
function helpfulContextOf(code: unknown, params: Record<string, unknown>): string | null {
  if (typeof code !== "string" || !isMessageCode(code)) return null;
  try {
    return lookupHelpfulContext(code as MessageCode, params as MessageParams);
  } catch {
    return null;
  }
}

function paintedGapBreakdown(gaps: unknown): unknown {
  try {
    return formatDataGapBreakdown(gaps as Parameters<typeof formatDataGapBreakdown>[0]);
  } catch {
    return gaps;
  }
}

function renderedAlertState(alert: Record<string, unknown>): unknown {
  const keys = usableFailedKeys(alert.failedKeys as string[] | null | undefined);
  const gaps = alert.dataGaps as { total?: unknown } | null | undefined;
  const gapTotal = gaps?.total;
  const showGaps =
    gaps !== null &&
    gaps !== undefined &&
    typeof gapTotal === "number" &&
    Number.isFinite(gapTotal) &&
    gapTotal > 0;
  // The template as the banner DECIDES it: it paints `template` only when the
  // trimmed string still has visible text, and otherwise paints a fixed fallback
  // (`components/admin/review/AttentionBanner.tsx:116`). So a null template and
  // a marker-only one ("**"), which render the SAME sentence, must hash the
  // same. Round-6 review probed both producing identical HTML and a cue.
  const rawTemplate = typeof alert.template === "string" ? alert.template.trim() : "";
  const paints = rawTemplate.length > 0 && hasVisibleText(rawTemplate);
  const template = paints ? rawTemplate : "";
  const params = (alert.params ?? {}) as Record<string, unknown>;
  return [
    pick(alert, BANNER_ALERT_KEYS_SANS_TEMPLATE),
    // The painted sentence, not the stored one: `null` and a marker-only string
    // both fall back to the same copy.
    paints ? rawTemplate : null,
    keys === null ? null : [keys.slice(0, FAILED_KEYS_CAP), keys.length],
    showGaps,
    showGaps ? paintedGapBreakdown(gaps) : null,
    // Through the SHIPPED placeholder regex, twice-corrected and now sourced
    // rather than spelled.
    //
    // The first version tested `template.includes(k)`, a bare substring: a param
    // named `id` matched a template containing "identity". The second hand-wrote
    // `{k}` — and round-5 review render-probed it: the real syntax is `<k>`
    // (`lib/messages/lookup.ts:12`), so that version dropped params that DO
    // paint, turning a false-cue guard into a MISSED cue across 13 reachable
    // templates. Guessing a syntax twice is what makes this an imported constant
    // now: `PLACEHOLDER_RE` is the same binding the renderer interpolates with.
    //
    // The `-`/`_` normalization mirrors the renderer's own key lookup
    // (`components/messages/renderEmphasis.tsx:116`), so `<crew-row-count>`
    // resolves a `crew_row_count` param exactly as it does on screen.
    // Resolved EXACTLY as the renderer resolves them, first-wins per placeholder
    // (`components/messages/renderEmphasis.tsx:116`), not "every key that could
    // match". Round-6 review probed the difference: with both `crew_row_count`
    // and `crew-row-count` present, the renderer paints the exact key and
    // ignores the alias, so hashing both cued a byte-identical card whenever the
    // shadowed one moved. One placeholder contributes one value.
    [...placeholderKeys(template)].sort().map((key) => {
      const value =
        params[key] ?? params[key.replace(/-/g, "_")] ?? params[key.replace(/_/g, "-")] ?? null;
      return [key, value];
    }),
    // The OTHER place the payload paints copy: the help text, looked up from the
    // catalog by code (`components/admin/review/AttentionBanner.tsx:122`).
    //
    // STATED PRECISELY, because it is a GUARD and not a repair. Probed against
    // `lib/messages/catalog.ts`: no `helpfulContext` entry interpolates a param
    // today, so this contributes a per-code constant and fixes no live missed
    // cue. It is here because the filter above can only ever see the payload's
    // OWN template, so the first catalog entry that interpolates would be
    // invisible to it — and because hashing the resolved copy also covers a
    // catalog COPY edit, which is a real rendered change nothing else in this
    // signature could see.
    helpfulContextOf(alert.code, params),
  ];
}

function renderedAttentionState(
  items: readonly AttentionItem[],
  warningsRendered: boolean,
): unknown {
  const notes: ReturnType<typeof toNoteItem>[] = [];
  const banners: AttentionItem[] = [];
  for (const item of items) {
    const note = toNoteItem(item);
    if (note !== null && item.sectionId === "warnings" && warningsRendered) notes.push(note);
    else banners.push(item);
  }
  return [
    // Through `orderNotes`, because `WarningsBreakdown` renders them sorted by a
    // fixed code precedence (`lib/admin/parseAttentionNote.ts:32`). Round-4
    // review reordered the input and cued a byte-identical panel: the arrival
    // order is not a rendered property. And NOT `item.id` — it is a React key
    // here, while the rendered testid is built from the CODE
    // (`components/admin/wizard/step3ReviewSections.tsx:2884`).
    orderNotes(notes.filter((n): n is NonNullable<typeof n> => n !== null)).map((n) => [
      "note",
      n.alert.code,
      n.alert.errorCode ?? null,
    ]),
    // Banner order is NOT normalized: unlike the notes there is no sort between
    // the bucket and the paint, so a reorder there really does move the DOM.
    banners.map((item) => [
      "banner",
      item.id,
      item.tone,
      item.actionable,
      item.clearingKind ?? null,
      item.kind === "alert"
        ? renderedAlertState(item.alert as unknown as Record<string, unknown>)
        : null,
    ]),
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

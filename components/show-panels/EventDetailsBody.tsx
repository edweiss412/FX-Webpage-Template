/**
 * components/show-panels/EventDetailsBody.tsx
 *
 * The Event details section body both surfaces render (crew page redesign spec
 * §6.2, `event` row): the grouped field list of the admin's
 * `EventDetailsBreakdown`, eyebrow-titled groups of label:value rows, Yes/No chips
 * and the sunken dress code block.
 *
 * - Admin: every key, sentinels as parsed and muted (`sentinels: "show"`), the
 *   chips, and the attention cards the wrapper reads from context in `reelCards`.
 *   It passes nothing else, so every prop below defaults to its output.
 * - Crew (components/crew/sections/EventSection.tsx): the crew keys, sentinels
 *   hidden, rows in place of chips, `h4` titles, the crew's title map, a field card
 *   per key that keeps its card id and actions, the reel player in its slot, rows
 *   that read their container, and search targets.
 *
 * Plain props, hook-free, no context: the crew page calls it as a function inside
 * `WrappedSection`'s render callback (spec §6.1, error containment), and it calls
 * its own pieces the same way, so every line it runs is inside that catch. Its one
 * test id, `event-opening-reel`, is the admin's and stays unprefixed, so it takes
 * no `testIdPrefix`.
 */
import { Fragment, type ReactNode } from "react";
import { Check, Minus } from "lucide-react";

import { DressCodeLines } from "@/components/crew/DressCodeLines";
import { EYEBROW_CLASS, EYEBROW_STYLE } from "@/components/show-panels/FieldRowList";
import {
  CREW_EVENT_GROUP_ORDER,
  EVENT_DETAIL_GROUPS,
  EVENT_DETAILS_LABELS,
  type EventDetailField,
  type EventDetailGroup,
  type EventDetailKey,
  withoutHiddenEventFields,
} from "@/lib/crew/eventDetailsSpecs";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export { eventDetailGroups } from "@/lib/crew/eventDetailsSpecs";

/** A field that keeps its own card: the id `CARD_REGION_MAP` holds, and its header actions. */
export type EventFieldCard = { cardId: string; actions: ReactNode };

export type EventDetailsBodyProps = {
  /** The groups to render (`eventDetailGroups`). */
  groups: readonly EventDetailGroup[];
  /** true (the default, admin): the boolean keys render as Yes/No chips. false: as rows. */
  chips?: boolean;
  /** The admin's attention cards, mounted under the reel's row. */
  reelCards?: readonly ReactNode[];
  /** "show" (the default, admin): a sentinel renders muted. "hide": its row is omitted. */
  sentinels?: "show" | "hide";
  /** The group title's element: "span" (the default, admin), or "h4" (crew, plan decision 8). */
  titleAs?: "span" | "h4";
  /** Maps a group's title for display (plan decision 7). The default is identity. */
  groupTitle?: (title: string) => string;
  /** Per key, the card a row keeps (plan decision 4). Rows only: a chip carries none. */
  fieldCards?: Partial<Record<EventDetailKey, EventFieldCard>>;
  /** The crew's proxied video, under the reel's row, or under its label when there is no text. */
  reelPlayer?: ReactNode;
  /**
   * "fixed" (the default, admin): an 8rem label track at every width. "fluid" (crew):
   * the rows read their section's container (`ROW_LONG`, `ROW_SHORT`).
   */
  rowLayout?: "fixed" | "fluid";
  /**
   * Per key, a search target per line it renders (lib/search/entryId.ts): one for a
   * row, one per phase line for the dress code. Given, the body also marks what
   * is not a line. A chip carries no marker: the crew, the one surface with
   * targets, renders none.
   */
  targets?: Partial<Record<EventDetailKey, readonly (string | undefined)[]>>;
};

const EVENT_DETAIL_BOOLEAN_KEYS = new Set<string>([
  "polling",
  "record",
  "virtual_speaker",
  "virtual_audience",
]);

/**
 * Classify a boolean-field value as affirmative / negative for the state chip.
 * Returns null for anything that is neither (a sentinel like `TBD`, or richer
 * free text) so the review surface shows the raw parsed token muted rather than
 * coercing an ambiguous value into a false "No".
 */
function interpretBooleanValue(value: string): "yes" | "no" | null {
  const v = value.trim().toLowerCase();
  if (/^(y|yes|true|yep|yeah)\b/.test(v)) return "yes";
  if (/^(n|no|none|false|nope)\b/.test(v)) return "no";
  return null;
}

/**
 * `groups` with a textless `opening_reel` field when none is present, so a playable
 * video with a hidden cell still shows under its label: at the key's place in its
 * group. The given groups keep their order. A group the keys left empty is created
 * where the crew's order puts it, since only the crew passes a player: the admin's
 * order would drop it ahead of the crew's first group and push the dress code down.
 */
function withReelSlot(groups: readonly EventDetailGroup[]): readonly EventDetailGroup[] {
  if (groups.some((g) => g.fields.some((f) => f.key === "opening_reel"))) return groups;
  const reel: EventDetailField = {
    key: "opening_reel",
    label: EVENT_DETAILS_LABELS.opening_reel,
    value: "",
  };
  const home = EVENT_DETAIL_GROUPS.find((g) => g.keys.includes(reel.key))!;
  const given = groups.find((g) => g.title === home.title);
  if (given !== undefined) {
    const at = home.keys.indexOf(reel.key);
    const before = given.fields.filter((f) => home.keys.indexOf(f.key) < at);
    const after = given.fields.filter((f) => home.keys.indexOf(f.key) > at);
    return groups.map((g) => (g === given ? { ...g, fields: [...before, reel, ...after] } : g));
  }
  const rank = (title: string) => CREW_EVENT_GROUP_ORDER.indexOf(title);
  const next = groups.findIndex((g) => rank(g.title) > rank(home.title));
  const place = next === -1 ? groups.length : next;
  return [...groups.slice(0, place), { title: home.title, fields: [reel] }, ...groups.slice(place)];
}

/** The admin's row: a desk pane holds the label's track at every width. */
const ROW_FIXED = "grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-x-4";

/**
 * A crew row whose value runs to several lines: the label sits over it below the crew
 * split, since a value that long has left its label out of sight anyway and the track
 * only takes its width (gate repair 1: 74px of dress code at a 320 phone, 53 lines).
 */
const ROW_LONG =
  "grid grid-cols-1 items-baseline gap-x-4 gap-y-1 @min-crew-split:grid-cols-[8rem_minmax(0,1fr)]";

/**
 * A crew row whose value is a short fact: a scannable two-column list, down to the
 * container that can still hold it, so page zoom never leaves the value a track of
 * nothing. 280px is the 8rem label, its 1rem gap, a 94px value and the panel's 42px of
 * padding and border: a 320 phone's 286px sheet keeps two columns, and a 390 phone at
 * 150% zoom (226px) stacks. A literal, not a `@theme` token: a build on a warm
 * Turbopack cache dropped a new container token from the production CSS (measured
 * 2026-11-06), and with it this rule.
 */
const ROW_SHORT =
  "grid grid-cols-1 items-baseline gap-x-4 gap-y-0.5 @min-[280px]:grid-cols-[8rem_minmax(0,1fr)]";

const LONG_FORM_KEYS = new Set<EventDetailKey>([
  "dress_code",
  "keynote_requirements",
  "notes",
  "opening_reel",
]);

function rowClass(key: EventDetailKey, rowLayout: "fixed" | "fluid"): string {
  if (rowLayout === "fixed") return ROW_FIXED;
  return LONG_FORM_KEYS.has(key) ? ROW_LONG : ROW_SHORT;
}

type SearchMarker = { "data-search-group"?: ""; "data-search-skip"?: "" };

function FieldLabel({ label, marker }: { label: string; marker: SearchMarker }) {
  return (
    <span {...marker} className="wrap-break-word text-xs font-medium text-text-subtle">
      {label}
    </span>
  );
}

/** One label:value row inside an event-details group; `muted` for a sentinel the surface shows. */
function EventDetailRow({
  label,
  value,
  muted,
  marker,
  searchTarget,
  className,
}: {
  label: string;
  value: string;
  muted: boolean;
  marker: SearchMarker;
  searchTarget: string | undefined;
  className: string;
}) {
  return (
    <div data-search-target={searchTarget} className={className}>
      {FieldLabel({ label, marker })}
      <span className={`wrap-break-word text-sm ${muted ? "text-text-subtle" : "text-text"}`}>
        {value}
      </span>
    </div>
  );
}

/** A neutral Yes/No state chip (no green/red — Yes is filled, No is outlined). */
function BooleanChip({ label, value }: { label: string; value: string }) {
  const state = interpretBooleanValue(value);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2">
      <span className="wrap-break-word text-xs font-medium text-text-subtle">{label}</span>
      {state === "yes" ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-border-strong bg-surface px-2.5 py-0.5 text-xs font-semibold text-text-strong">
          <Check className="size-3" aria-hidden="true" />
          Yes
        </span>
      ) : state === "no" ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-border px-2.5 py-0.5 text-xs font-semibold text-text-subtle">
          <Minus className="size-3" aria-hidden="true" />
          No
        </span>
      ) : (
        // Neither yes nor no (sentinel / richer text) → raw parsed token, muted.
        <span className="wrap-break-word text-xs text-text-subtle">{value}</span>
      )}
    </div>
  );
}

/**
 * A row that keeps its own card: `data-card-id` is its search region and its report
 * target, and the actions sit in the slot every source-link check scopes to
 * (tests/components/crew/sourceLinkCoverage.test.tsx). The row's basis is the width
 * that keeps a value whole on every phone: `flex-wrap` decides on the basis alone, so
 * a smaller one keeps the actions beside the row on a wider phone and takes their
 * width from the value, as the fixed label's 240px basis did (107px at a 430 viewport,
 * 170px at 390). Stacking the label did not move that: rechecked with it stacked, a
 * 240px basis gives 251px at 430 where this one gives the row's 354px. Past the basis,
 * the actions take their own line, right-aligned, the crew card header's wrap rule,
 * under half the rows' gap so they read as this row's and not the next one's.
 */
function FieldCard({ card, children }: { card: EventFieldCard; children: ReactNode }) {
  return (
    <div
      data-card-id={card.cardId}
      className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1"
    >
      <div className="min-w-0 grow basis-88">{children}</div>
      <div data-slot="section-card-action" className="ml-auto flex shrink-0 items-center">
        {card.actions}
      </div>
    </div>
  );
}

/**
 * The search marker a field's label takes. A field card's label is its region's
 * group heading (plan decision 4); a row's is plain text inside its target; a label
 * in neither is skipped, so no text is left uncovered (tests/search/_parity.ts).
 */
function labelMarker(
  targets: EventDetailsBodyProps["targets"],
  card: EventFieldCard | undefined,
  insideTarget: boolean,
): SearchMarker {
  if (targets === undefined) return {};
  if (card !== undefined) return { "data-search-group": "" };
  return insideTarget ? {} : { "data-search-skip": "" };
}

/**
 * Renders a group's fields: booleans as a Yes/No chip grid, `dress_code` as a
 * sunken block of phase/attire pairs (DressCodeLines), everything else as label:value
 * rows. Rows render before chips so the Production group (all-boolean) reads as
 * a clean chip grid and mixed groups keep their text rows on top.
 */
function EventDetailGroupBody({
  fields,
  chips,
  reelCards,
  sentinels,
  fieldCards,
  reelPlayer,
  rowLayout,
  targets,
}: {
  fields: readonly EventDetailField[];
  chips: boolean;
  reelCards: readonly ReactNode[];
  sentinels: "show" | "hide";
  fieldCards: EventDetailsBodyProps["fieldCards"];
  reelPlayer: ReactNode;
  rowLayout: "fixed" | "fluid";
  targets: EventDetailsBodyProps["targets"];
}) {
  const isChip = (f: EventDetailField) => chips && EVENT_DETAIL_BOOLEAN_KEYS.has(f.key);
  const chipFields = fields.filter(isChip);
  const rows = fields.filter((f) => !isChip(f));

  const plainRow = (f: EventDetailField, card: EventFieldCard | undefined) =>
    EventDetailRow({
      label: f.label,
      value: f.value,
      muted: sentinels === "show" && shouldHideGenericOptional(f.value),
      marker: labelMarker(targets, card, true),
      searchTarget: targets?.[f.key]?.[0],
      className: rowClass(f.key, rowLayout),
    });

  const dressRow = (f: EventDetailField, card: EventFieldCard | undefined) => {
    const searchTargets = targets?.[f.key];
    return (
      <div className={rowClass(f.key, rowLayout)}>
        {FieldLabel({ label: f.label, marker: labelMarker(targets, card, false) })}
        <div className="rounded-md border border-border bg-surface-sunken px-3 py-2">
          {DressCodeLines({
            value: f.value,
            ...(searchTargets === undefined ? {} : { searchTargets }),
          })}
        </div>
      </div>
    );
  };

  const reelRow = (f: EventDetailField, card: EventFieldCard | undefined) => {
    const row =
      f.value.length > 0
        ? plainRow(f, card)
        : FieldLabel({ label: f.label, marker: labelMarker(targets, card, false) });
    if (reelCards.length === 0 && !reelPlayer) return row;
    // The anchored asset cards mount immediately BELOW the reel value, inside a
    // testid'd wrapper that co-locates both — a DOM-ancestry check binds the card
    // to the reel field it belongs to (§3.3). gap-2 (tighter than the gap-2.5
    // between sibling rows) plus min-w-0 binds the cards to their reel field and
    // keeps a wide/unbreakable banner child from forcing horizontal overflow at
    // 320px (impeccable P3).
    return (
      <div
        data-testid={reelCards.length > 0 ? "event-opening-reel" : undefined}
        className="flex min-w-0 flex-col gap-2"
      >
        {row}
        {reelCards.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-2">{reelCards}</div>
        ) : null}
        {reelPlayer}
      </div>
    );
  };

  const fieldRow = (f: EventDetailField) => {
    const card = fieldCards?.[f.key];
    const row =
      f.key === "opening_reel"
        ? reelRow(f, card)
        : f.key === "dress_code"
          ? dressRow(f, card)
          : plainRow(f, card);
    return <Fragment key={f.key}>{card ? FieldCard({ card, children: row }) : row}</Fragment>;
  };

  return (
    <>
      {rows.length > 0 ? <div className="flex flex-col gap-2.5">{rows.map(fieldRow)}</div> : null}
      {chipFields.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {chipFields.map((f) => (
            <Fragment key={f.key}>{BooleanChip({ label: f.label, value: f.value })}</Fragment>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function EventDetailsBody({
  groups,
  chips = true,
  reelCards = [],
  sentinels = "show",
  titleAs: Title = "span",
  groupTitle = (title) => title,
  fieldCards,
  reelPlayer,
  rowLayout = "fixed",
  targets,
}: EventDetailsBodyProps) {
  const unhidden = sentinels === "hide" ? withoutHiddenEventFields(groups) : groups;
  const shown = reelPlayer ? withReelSlot(unhidden) : unhidden;
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      {shown.map((g) => (
        <div key={g.title} className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Title
              {...(targets === undefined ? {} : { "data-search-skip": "" })}
              className={EYEBROW_CLASS}
              style={EYEBROW_STYLE}
            >
              {groupTitle(g.title)}
            </Title>
            {/* Decorative rule. `min-w-4` is a FLOOR, not a breakpoint hide: measured, this
                rule never collapses in the supported range — 22.94px at the narrowest real
                row (240px, being a 320px viewport's 280px pane minus `--spacing-tile-pad`
                each side) and 0 only at rows <=215px, because its five group titles are a
                closed set whose longest is "Wardrobe & key moments". Hiding a rule that
                draws correctly everywhere would be a regression, so it gets a floor that
                makes the zero state unreachable instead. 16px and not `min-w-6`: 24px
                exceeds the width actually available at 240px, so it would bind and wrap the
                label. Spec 2026-07-25 §3.2; DESIGN.md §7a. */}
            <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border" />
          </div>
          {EventDetailGroupBody({
            fields: g.fields,
            chips,
            reelCards,
            sentinels,
            fieldCards,
            reelPlayer,
            rowLayout,
            targets,
          })}
        </div>
      ))}
    </div>
  );
}

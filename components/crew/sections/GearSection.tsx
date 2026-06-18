/**
 * components/crew/sections/GearSection.tsx — crew-redesign §9 "Gear" section.
 *
 * The single synchronous Server Component that homes the gear-facing surfaces
 * the deleted AudioScopeTile / VideoScopeTile / LightingScopeTile / PackListTile
 * / OpeningReelTile / keynote-requirements row carried, into one curated page:
 *
 *   - A/V/L scope cards — one card per discipline (Audio, Video, Lighting),
 *     each listing the non-sentinel per-room scalar value for that discipline
 *     (`room.audio` / `room.video` / `room.lighting`, sentinel-guarded via
 *     `shouldHideGenericOptional`). EMPHASIS FLIP, not a gate: every card is
 *     shown to everyone; the viewer's own discipline(s) (derived from their
 *     roleFlags via the canonical `audioScopeVisible` / `videoScopeVisible` /
 *     `lightingScopeVisible` predicates) sort FIRST and carry a "Your scope"
 *     eyebrow + a thin accent left-edge + `data-emphasis="you"`. Non-viewer
 *     cards are neutral (no `data-emphasis`). A card whose discipline has ZERO
 *     non-sentinel room values is OMITTED — including the viewer's own.
 *   - Pack list — ported PackListTile, rendered ONLY when
 *     `isPackListVisibleToday({ show, restriction, today })` (the `today` prop
 *     is threaded straight through). Cap 12 cases + `[data-tile-show-more]`
 *     overflow stub.
 *   - Keynote requirements — `event_details.keynote_requirements`, sentinel-
 *     guarded.
 *   - Opening reel — when `openingReelHasVideo` and the cell isn't hidden:
 *     a URL-stripped TEXT line (`stripOpeningReelText`, so no raw Drive URL
 *     reaches the DOM) + the proxied `<OpeningReelVideo showId={showId}>`
 *     player (`/api/asset/reel/${showId}` — uses the showId PROP, NEVER
 *     `data.show.id`, which doesn't exist on ShowRow).
 *
 * When ALL blocks are hidden, a section-level `<EmptyState data-testid=
 * "section-empty">` renders so the surface is never blank.
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no `new Date()`).
 * `today` + `showId` are passed in; `viewer` flags resolve via
 * `resolveViewerContext` (which throws MalformedProjectionError on a malformed
 * crewMembers projection — this section does not swallow it).
 */
import type { JSX, ReactNode } from "react";
import { Lightbulb, Video, Volume2 } from "lucide-react";

import { EmptyState } from "@/components/atoms/EmptyState";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { KeyValueRows, type KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { OpeningReelVideo } from "@/components/tiles/OpeningReelVideo";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { shouldHideOpeningReel } from "@/lib/visibility/emptyState";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";
import { isPackListVisibleToday } from "@/lib/visibility/packList";
import { roomLabel } from "@/lib/visibility/roomLabel";
import {
  audioScopeVisible,
  lightingScopeVisible,
  videoScopeVisible,
} from "@/lib/visibility/scopeTiles";
import type { RoleFlag } from "@/lib/parser/types";

type GearSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
};

type Discipline = "audio" | "video" | "lighting";

/**
 * Per-discipline static metadata: canonical A→V→L order, lucide glyph, the
 * human heading, and the per-room scalar accessor. The accessor reads
 * `r.audio` / `r.video` / `r.lighting` so the meta-test's
 * `\br\.(audio|video|lighting)\b` pattern matches and is sentinel-guarded.
 */
const DISCIPLINES: ReadonlyArray<{
  id: Discipline;
  heading: string;
  icon: ReactNode;
  value: (r: ProjectedRoomRow) => string | null;
}> = [
  { id: "audio", heading: "Audio", icon: <Volume2 size={14} strokeWidth={2} />, value: (r) => r.audio },
  { id: "video", heading: "Video", icon: <Video size={14} strokeWidth={2} />, value: (r) => r.video },
  {
    id: "lighting",
    heading: "Lighting",
    icon: <Lightbulb size={14} strokeWidth={2} />,
    value: (r) => r.lighting,
  },
];

/**
 * Which disciplines does this viewer "own"? Routes the freshly-derived
 * roleFlags through the canonical SCOPE_TILE_VISIBILITY_RULE predicates — the
 * SAME predicates that used to GATE the M4 scope tiles now drive the redesign's
 * emphasis flip (all scope shown to everyone; the viewer's own discipline(s)
 * sort first + carry the accent). This is an EMPHASIS signal, NOT a gate.
 */
function viewerDisciplines(flags: RoleFlag[]): Set<Discipline> {
  const set = new Set<Discipline>();
  if (audioScopeVisible(flags)) set.add("audio");
  if (videoScopeVisible(flags)) set.add("video");
  if (lightingScopeVisible(flags)) set.add("lighting");
  return set;
}

export function GearSection({ data, viewer, today, showId }: GearSectionProps): JSX.Element {
  // Single canonical viewer resolution. admin → all-flags + none-restriction;
  // crew/admin_preview → matched row; malformed projection throws
  // MalformedProjectionError (the page's existing infra arm catches it).
  const ctx = resolveViewerContext(viewer, data);
  const owned = viewerDisciplines(ctx.viewerFlags);

  // Build each discipline's present (non-sentinel) room values. A discipline
  // with zero present values is omitted — INCLUDING the viewer's own.
  const built = DISCIPLINES.map((d) => {
    const rows: KeyValueRow[] = data.rooms
      .filter((r) => !shouldHideGenericOptional(d.value(r)))
      .map((r) => ({ k: roomLabel(r), v: d.value(r)! }));
    return { ...d, rows, emphasized: owned.has(d.id) };
  }).filter((d) => d.rows.length > 0);

  // Emphasis order: the viewer's owned discipline cards FIRST (in canonical
  // A→V→L order, which is the DISCIPLINES array order — already preserved by
  // the .map above), then the remaining disciplines in the same canonical
  // order. A stable partition preserves canonical order within each group.
  const scopeCards = [
    ...built.filter((d) => d.emphasized),
    ...built.filter((d) => !d.emphasized),
  ];

  // Pack list — gated by the canonical predicate; `today` threads straight
  // through. The pullSheet/empty-array fall-through mirrors PackListTile.
  const packVisible =
    data.pullSheet !== null &&
    data.pullSheet.length > 0 &&
    isPackListVisibleToday({
      show: data.show,
      restriction: ctx.stageRestriction,
      today,
    });
  const CASE_CAP = 12;
  const visibleCases = packVisible ? data.pullSheet!.slice(0, CASE_CAP) : [];
  const overflowCount = packVisible ? Math.max(0, data.pullSheet!.length - CASE_CAP) : 0;

  // Keynote requirements — sentinel-guarded generic-optional text field.
  const rawKeynote = data.show.event_details["keynote_requirements"] ?? null;
  const keynote = shouldHideGenericOptional(rawKeynote) ? null : rawKeynote!.trim();

  // Opening reel — URL-stripped text + the proxied player. The text line is
  // shown only when the cell isn't hidden (shouldHideOpeningReel); the player
  // is shown when the projection says a playable video exists.
  const rawReel = data.show.event_details["opening_reel"] ?? null;
  const reelText = shouldHideOpeningReel(rawReel) ? null : stripOpeningReelText(rawReel);
  const showReelPlayer = data.openingReelHasVideo;
  const hasReel = showReelPlayer || reelText !== null;

  const allHidden = scopeCards.length === 0 && !packVisible && keynote === null && !hasReel;

  return (
    <div data-testid="section-gear" className="flex flex-col gap-4">
      {allHidden ? (
        <div data-testid="section-empty">
          <EmptyState label="No gear details on file yet." />
        </div>
      ) : null}

      {scopeCards.map((d) => (
        <div
          key={d.id}
          data-testid={`gear-scope-${d.id}`}
          {...(d.emphasized ? { "data-emphasis": "you" } : {})}
          className={
            d.emphasized
              ? "rounded-md border-l-2 border-l-accent-on-bg"
              : undefined
          }
        >
          <SectionCard
            icon={d.icon}
            title={d.heading}
            action={
              d.emphasized ? (
                <span className="text-xs font-medium uppercase tracking-eyebrow text-accent-on-bg">
                  Your scope
                </span>
              ) : undefined
            }
          >
            <KeyValueRows rows={d.rows} />
          </SectionCard>
        </div>
      ))}

      {packVisible ? (
        <div data-testid="gear-pack-list">
          <SectionCard title="Pack list">
            <ol className="flex flex-col gap-2">
              {visibleCases.map((c, idx) => (
                <li
                  key={`${c.caseLabel}-${idx}`}
                  data-testid="gear-pack-list-case"
                  className="rounded-sm border border-border bg-surface"
                >
                  <details className="group">
                    <summary
                      className={[
                        "flex min-h-tap-min cursor-pointer list-none",
                        "items-center justify-between gap-3",
                        "px-3 py-2 text-sm font-semibold text-text-strong",
                        "rounded-sm",
                        "[&::-webkit-details-marker]:hidden",
                      ].join(" ")}
                    >
                      <span className="flex flex-1 items-baseline gap-2 truncate">
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-xs font-medium tabular-nums text-text-faint"
                        >
                          {idx + 1}.
                        </span>
                        <span className="truncate">{c.caseLabel || `Case ${idx + 1}`}</span>
                      </span>
                      <span className="text-xs font-medium uppercase tracking-eyebrow text-text-faint tabular-nums">
                        {c.items.length} {c.items.length === 1 ? "item" : "items"}
                      </span>
                    </summary>
                    <ul className="flex flex-col gap-1.5 border-t border-border px-3 py-3 text-sm text-text">
                      {c.items.map((item, itemIdx) => {
                        const cat = shouldHideGenericOptional(item.cat) ? null : item.cat;
                        const subCat = shouldHideGenericOptional(item.subCat) ? null : item.subCat;
                        const taxonomy = [cat, subCat].filter(Boolean).join(" / ");
                        const qtyPart = item.qty !== null ? `${item.qty} × ` : "";
                        const label = `${qtyPart}${item.item}${taxonomy ? ` (${taxonomy})` : ""}`;
                        return (
                          <li
                            key={`${item.item}-${itemIdx}`}
                            className="flex flex-wrap items-baseline gap-x-2"
                          >
                            <span>{label}</span>
                            {item.rawSnippet ? (
                              <span
                                data-testid="gear-pack-list-item-raw-snippet"
                                className="text-xs italic text-text-subtle"
                              >
                                {item.rawSnippet}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </li>
              ))}
            </ol>
            {overflowCount > 0 ? (
              <div
                data-testid="gear-pack-list-overflow-stub"
                data-tile-show-more="true"
                className="rounded-sm bg-surface-sunken px-3 py-2 text-sm text-text-subtle"
              >
                <span className="tabular-nums">+{overflowCount}</span>{" "}
                {overflowCount === 1 ? "more case" : "more cases"} on the source pull sheet
              </div>
            ) : null}
          </SectionCard>
        </div>
      ) : null}

      {keynote !== null ? (
        <div data-testid="gear-keynote">
          <SectionCard title="Keynote requirements">
            <p className="text-sm text-text">{keynote}</p>
          </SectionCard>
        </div>
      ) : null}

      {hasReel ? (
        <div data-testid="gear-opening-reel">
          <SectionCard title="Opening reel">
            <div className="flex flex-col gap-3">
              {reelText !== null ? (
                <KeyValueRows rows={[{ k: "Status", v: reelText }] satisfies KeyValueRow[]} />
              ) : null}
              {showReelPlayer ? <OpeningReelVideo showId={showId} /> : null}
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}

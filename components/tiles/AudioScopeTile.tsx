/**
 * components/tiles/AudioScopeTile.tsx — audio scope/spec tile (M4 Task 4.6;
 * spec §8.1).
 *
 * Aggregates `props.rooms[*].audio` across General Session, breakouts, and
 * additional rooms. The viewer sees this tile only when `audioScopeVisible`
 * (the canonical SCOPE_TILE_VISIBILITY_RULE predicate from
 * lib/visibility/scopeTiles.ts) returns true for their freshly-derived
 * role_flags. NO ad-hoc role check here — the predicate is the single
 * source of truth.
 *
 * Leading icon (Task 4.13.distill — Finding 8 close-out):
 *   The eyebrow renders a small lucide-react `Volume2` glyph to the
 *   left of the heading so the three otherwise-similar scope tiles
 *   (Audio / Video / Lighting) differentiate at a glance. The icon
 *   inherits the eyebrow's `text-text-faint` color via Section's
 *   `headingIcon` slot — no special-case styling here.
 *
 * Empty-state discipline (spec §8.3):
 *   - Predicate FALSE → tile NEVER renders. Caller (page.tsx) decides
 *     whether to mount the component at all; this component returns null
 *     in that case as defense-in-depth.
 *   - Predicate TRUE but no rooms have a non-null `audio` value → render
 *     the required-field EmptyState ("No audio details for any room yet.").
 *     A LEAD-only viewer on a no-audio show STILL gets the tile so
 *     they can see the missing-data signal.
 *   - Per-room rendering: only rooms with a non-null audio string are
 *     listed. Each row uses a KeyValue with the room label as the key
 *     and the audio string as the value.
 *
 * Server Component (no `'use client'`).
 */
import { Volume2 } from "lucide-react";
import type { RoleFlag, RoomRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";
import { audioScopeVisible } from "@/lib/visibility/scopeTiles";
import { roomLabel } from "@/lib/visibility/roomLabel";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type AudioScopeTileProps = {
  rooms: RoomRow[];
  /**
   * Freshly-derived role_flags from getShowForViewer. The component
   * re-checks the predicate as defense in depth — even if the page
   * accidentally mounts the tile for a non-audio viewer, the predicate
   * gate here returns null and the user sees nothing.
   */
  viewerFlags: RoleFlag[];
};

export function AudioScopeTile({ rooms, viewerFlags }: AudioScopeTileProps) {
  // Defense-in-depth predicate gate — if the page mistakenly mounts the
  // tile, the predicate's null return reflows the grid as if the tile
  // were never there.
  if (!audioScopeVisible(viewerFlags)) return null;

  // §8.3 generic-optional sentinel-hiding (Codex round-12): room.audio
  // is a generic optional text field. Sentinels (`'TBD'`/`'N/A'`/
  // `'TBA'`) must be filtered out so an all-sentinel rooms list falls
  // through to the empty-state placeholder. Routes through the central
  // predicate per lib/visibility/emptyState.ts:27-29.
  const withAudio = rooms.filter((r) => !shouldHideGenericOptional(r.audio));

  if (withAudio.length === 0) {
    return (
      <Section
        testId="audio-scope-tile"
        heading="Audio"
        headingTone="eyebrow"
        variant="reference"
        headingIcon={<Volume2 size={14} strokeWidth={2} />}
        ariaLabel="Audio scope"
        bodyAs="div"
      >
        <EmptyState label="No audio details for any room yet." />
      </Section>
    );
  }

  return (
    <Section
      testId="audio-scope-tile"
      heading="Audio"
      headingTone="eyebrow"
      variant="reference"
      headingIcon={<Volume2 size={14} strokeWidth={2} />}
      ariaLabel="Audio scope"
      bodyAs="dl"
    >
      {withAudio.map((room, idx) => (
        <div key={`${room.kind}-${idx}`} data-testid="audio-scope-room">
          <KeyValue label={roomLabel(room)} value={room.audio} />
        </div>
      ))}
    </Section>
  );
}

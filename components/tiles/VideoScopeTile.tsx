/**
 * components/tiles/VideoScopeTile.tsx — video scope/spec tile (M4 Task 4.6;
 * spec §8.1).
 *
 * Mirrors AudioScopeTile in structure; differs only in predicate import
 * (`videoScopeVisible`), data field (`room.video`), heading, and testIds.
 * See AudioScopeTile.tsx for the empty-state contract documentation.
 *
 * Server Component (no `'use client'`).
 */
import { Video } from "lucide-react";
import type { RoleFlag, RoomRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";
import { videoScopeVisible } from "@/lib/visibility/scopeTiles";
import { roomLabel } from "@/lib/visibility/roomLabel";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type VideoScopeTileProps = {
  rooms: RoomRow[];
  viewerFlags: RoleFlag[];
};

export function VideoScopeTile({ rooms, viewerFlags }: VideoScopeTileProps) {
  if (!videoScopeVisible(viewerFlags)) return null;

  // §8.3 generic-optional sentinel-hiding (Codex round-12): see
  // AudioScopeTile.tsx for the contract — same routing applies.
  const withVideo = rooms.filter((r) => !shouldHideGenericOptional(r.video));

  if (withVideo.length === 0) {
    return (
      <Section
        testId="video-scope-tile"
        heading="Video"
        headingTone="eyebrow"
        variant="reference"
        headingIcon={<Video size={14} strokeWidth={2} />}
        ariaLabel="Video scope"
        bodyAs="div"
      >
        <EmptyState label="No video details for any room yet." />
      </Section>
    );
  }

  return (
    <Section
      testId="video-scope-tile"
      heading="Video"
      headingTone="eyebrow"
      variant="reference"
      headingIcon={<Video size={14} strokeWidth={2} />}
      ariaLabel="Video scope"
      bodyAs="dl"
    >
      {withVideo.map((room, idx) => (
        <div key={`${room.kind}-${idx}`} data-testid="video-scope-room">
          <KeyValue label={roomLabel(room)} value={room.video} />
        </div>
      ))}
    </Section>
  );
}


/**
 * View alias + async loader for M9 Task 9.2 — `VideoScopeTile` is
 * already pure; the loader is identity but provides the seam where
 * future per-tile derivation can throw and be caught by
 * <TileServerFallback>.
 */
export const VideoScopeTileView = VideoScopeTile;

export async function loadVideoScopeTileData(
  props: VideoScopeTileProps,
): Promise<VideoScopeTileProps> {
  return props;
}

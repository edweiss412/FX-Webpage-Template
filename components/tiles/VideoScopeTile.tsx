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

type VideoScopeTileProps = {
  rooms: RoomRow[];
  viewerFlags: RoleFlag[];
};

export function VideoScopeTile({ rooms, viewerFlags }: VideoScopeTileProps) {
  if (!videoScopeVisible(viewerFlags)) return null;

  const withVideo = rooms.filter(
    (r) => typeof r.video === "string" && r.video.trim() !== "",
  );

  if (withVideo.length === 0) {
    return (
      <Section
        testId="video-scope-tile"
        heading="Video"
        headingTone="eyebrow"
        headingIcon={<Video size={14} strokeWidth={2} />}
        ariaLabel="Video scope"
        bodyAs="div"
      >
        <EmptyState />
      </Section>
    );
  }

  return (
    <Section
      testId="video-scope-tile"
      heading="Video"
      headingTone="eyebrow"
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

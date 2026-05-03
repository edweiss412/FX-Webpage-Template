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
import type { RoleFlag, RoomRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";
import { videoScopeVisible } from "@/lib/visibility/scopeTiles";

type VideoScopeTileProps = {
  rooms: RoomRow[];
  viewerFlags: RoleFlag[];
};

function roomLabel(room: RoomRow): string {
  if (room.kind === "gs") return room.name || "General Session";
  if (room.kind === "breakout") return room.name || "Breakout";
  return room.name || "Additional";
}

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
        ariaLabel="Video scope"
        bodyAs="div"
      >
        <EmptyState variant="required-field" />
      </Section>
    );
  }

  return (
    <Section
      testId="video-scope-tile"
      heading="Video"
      headingTone="eyebrow"
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

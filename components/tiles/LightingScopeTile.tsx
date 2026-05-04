/**
 * components/tiles/LightingScopeTile.tsx — lighting scope/spec tile (M4
 * Task 4.6; spec §8.1).
 *
 * Mirrors AudioScopeTile in structure; differs only in predicate import
 * (`lightingScopeVisible`), data field (`room.lighting`), heading, and
 * testIds.
 *
 * IMPORTANT — visibility asymmetry: lightingScopeVisible returns true ONLY
 * for L1, NOT for LEAD. Spec §8.1 carves lighting out as a discipline
 * LEADs don't manage hands-on. A LEAD-only viewer (no L1 atomic flag)
 * sees Audio + Video + Financials but NOT Lighting.
 *
 * Server Component (no `'use client'`).
 */
import { Lightbulb } from "lucide-react";
import type { RoleFlag, RoomRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";
import { lightingScopeVisible } from "@/lib/visibility/scopeTiles";
import { roomLabel } from "@/lib/visibility/roomLabel";

type LightingScopeTileProps = {
  rooms: RoomRow[];
  viewerFlags: RoleFlag[];
};

export function LightingScopeTile({
  rooms,
  viewerFlags,
}: LightingScopeTileProps) {
  if (!lightingScopeVisible(viewerFlags)) return null;

  const withLighting = rooms.filter(
    (r) => typeof r.lighting === "string" && r.lighting.trim() !== "",
  );

  if (withLighting.length === 0) {
    return (
      <Section
        testId="lighting-scope-tile"
        heading="Lighting"
        headingTone="eyebrow"
        variant="reference"
        headingIcon={<Lightbulb size={14} strokeWidth={2} />}
        ariaLabel="Lighting scope"
        bodyAs="div"
      >
        <EmptyState />
      </Section>
    );
  }

  return (
    <Section
      testId="lighting-scope-tile"
      heading="Lighting"
      headingTone="eyebrow"
      variant="reference"
      headingIcon={<Lightbulb size={14} strokeWidth={2} />}
      ariaLabel="Lighting scope"
      bodyAs="dl"
    >
      {withLighting.map((room, idx) => (
        <div key={`${room.kind}-${idx}`} data-testid="lighting-scope-room">
          <KeyValue label={roomLabel(room)} value={room.lighting} />
        </div>
      ))}
    </Section>
  );
}

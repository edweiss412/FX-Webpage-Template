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
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type LightingScopeTileProps = {
  rooms: RoomRow[];
  viewerFlags: RoleFlag[];
};

export function LightingScopeTile({ rooms, viewerFlags }: LightingScopeTileProps) {
  if (!lightingScopeVisible(viewerFlags)) return null;

  // §8.3 generic-optional sentinel-hiding (Codex round-12): see
  // AudioScopeTile.tsx for the contract — same routing applies.
  const withLighting = rooms.filter((r) => !shouldHideGenericOptional(r.lighting));

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
        <EmptyState label="No lighting details for any room yet." />
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


/**
 * View alias + async loader for M9 Task 9.2 — `LightingScopeTile` is
 * already pure; the loader is identity but provides the seam where
 * future per-tile derivation can throw and be caught by
 * <TileServerFallback>.
 */
export const LightingScopeTileView = LightingScopeTile;

export async function loadLightingScopeTileData(
  props: LightingScopeTileProps,
): Promise<LightingScopeTileProps> {
  return props;
}

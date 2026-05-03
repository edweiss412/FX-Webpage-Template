/**
 * components/tiles/ShowStatusTile.tsx — show-status tile (M4 Task 4.8;
 * spec §4.4 + §8.1; closes AC-4.1).
 *
 * Surfaces the public, every-crew-member-sees-it status fields:
 *   - coi_status (Certificate of Insurance) — explicit per AC-4.1.
 *   - dress code — venue / event-details lookup.
 *   - venue notes — show.venue.notes (when present).
 *
 * The dress code lives in `show.event_details` as a free-text key/value
 * map (lib/parser/blocks/event.ts:88+). Different fixtures use different
 * keys for it; this component probes a small set of candidate keys (in
 * priority order) and uses the first match. Missing → field is omitted
 * (it's optional).
 *
 * Empty-state discipline (spec §8.3):
 *   - The tile always renders (every show has a status, conceptually,
 *     even if all the fields are missing).
 *   - When ALL fields (coi_status + dress + venue.notes) are
 *     null/empty, the body falls back to the required-field
 *     EmptyState ("Doug hasn't filled this in yet").
 *
 * `coi_status` is rendered inside an element with
 * `data-testid="coi-status"` so AC-4.1 can assert the visible value
 * without scanning prose.
 *
 * Server Component (no `'use client'`).
 */
import type { ShowRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";

type ShowStatusTileProps = {
  show: Pick<ShowRow, "coi_status" | "venue" | "event_details">;
};

/**
 * Pull the dress-code value from event_details. The key Doug uses
 * varies across fixtures; check a small set of candidates in priority
 * order. The keys in the parser's CANONICAL_KEY_MAP are lowercased
 * with underscores, but unknown keys land verbatim — so we lowercase
 * for the probe.
 */
function pickDressCode(
  eventDetails: Record<string, string> | null | undefined,
): string | null {
  if (!eventDetails) return null;
  const lowercase = new Map(
    Object.entries(eventDetails).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const candidates = ["dress_code", "dress code", "dress", "attire"];
  for (const key of candidates) {
    const v = lowercase.get(key);
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

export function ShowStatusTile({ show }: ShowStatusTileProps) {
  const coi = show.coi_status?.trim() || null;
  const dress = pickDressCode(show.event_details);
  const venueNotes = show.venue?.notes?.trim() || null;

  const allEmpty = !coi && !dress && !venueNotes;

  return (
    <Section
      testId="show-status-tile"
      heading="Show status"
      headingTone="eyebrow"
      ariaLabel="Show status"
      bodyAs="dl"
    >
      {allEmpty ? (
        <EmptyState />
      ) : (
        <>
          {/*
            COI status — primary AC-4.1 contract surface. Every crew
            viewer sees this regardless of role_flags. Tabular figures
            via the KeyValue.tabular flag since COI labels often
            contain dates ("SENT 4/15") or ID numbers.
          */}
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
              COI
            </dt>
            <dd
              data-testid="coi-status"
              className="text-sm font-semibold tabular-nums text-text-strong"
            >
              {coi ?? (
                <span className="font-normal italic text-text-faint">
                  Doug hasn&apos;t filled this in yet
                </span>
              )}
            </dd>
          </div>

          {dress ? <KeyValue label="Dress code" value={dress} /> : null}
          {venueNotes ? <KeyValue label="Venue notes" value={venueNotes} /> : null}
        </>
      )}
    </Section>
  );
}

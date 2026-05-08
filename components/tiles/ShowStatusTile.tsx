/**
 * components/tiles/ShowStatusTile.tsx — show-status tile (M4 Task 4.8;
 * spec §4.4 + §8.1; closes AC-4.1; extended in Task 4.14 to surface
 * opening_reel + a curated set of optional event_details fields).
 *
 * Surfaces the public, every-crew-member-sees-it status fields:
 *   - coi_status (Certificate of Insurance) — explicit per AC-4.1.
 *   - dress code — venue / event-details lookup.
 *   - venue notes — show.venue.notes (when present).
 *   - opening_reel — §10 URL-stripped text-only render. M4 ships TEXT
 *     ONLY (`Opening reel: <stripped value>`); inline <video> ships in
 *     M7 Task 7.6. Crew DOM MUST NEVER contain raw URL or Google document
 *     host substrings — see
 *     `lib/visibility/openingReelText.ts` + `lib/visibility/emptyState.ts`.
 *   - power / internet / keynote_requirements — generic optional event
 *     details. Hidden when null/empty/`TBD`/`N/A`/`TBA` per the per-field
 *     predicate table.
 *
 * Rendering note (Task 4.14 review fix-round): opening-reel, power, and
 * internet rows all use the same `<dt>label</dt><dd>bare value</dd>`
 * pattern — the `<dt>` carries the human-readable label; the `<dd>`
 * holds the value with NO inline label prefix. Earlier drafts repeated
 * the label inside `<dd>` ("Opening reel: YES"), which was redundant
 * with the `<dt>` and inconsistent with the Internet row. Spec §10's
 * literal phrase `Opening reel: <stripped value>` is still satisfied —
 * the rendered text content (combined `<dt>` + `<dd>` siblings) reads
 * "Opening reel YES" because dt/dd are sibling block elements; tests
 * assert the value via the testid-scoped `<dd>` rather than via the
 * literal "Opening reel: " prefix substring. Do NOT re-add the inline
 * prefix in a future "make it match the spec" pass.
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
 *   - When ALL surfaced fields are missing/hidden, the body falls back
 *     to the required-field EmptyState atom with crew-facing copy
 *     ("No show status filled in yet.").
 *
 * `coi_status` is rendered inside an element with
 * `data-testid="coi-status"` so AC-4.1 can assert the visible value
 * without scanning prose. Opening reel + power are likewise testid-scoped
 * so AC-4.5 (`tests/e2e/empty-state.spec.ts`) can assert their visibility
 * without scanning sibling tiles.
 *
 * Server Component (no `'use client'`).
 */
import type { ShowRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";
import { shouldHideOpeningReel, shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";

type ShowStatusTileProps = {
  show: Pick<ShowRow, "coi_status" | "venue" | "event_details">;
};

/**
 * Pull the dress-code value from event_details. The key Doug uses
 * varies across fixtures; check a small set of candidates in priority
 * order. The keys in the parser's CANONICAL_KEY_MAP are lowercased
 * with underscores, but unknown keys land verbatim — so we lowercase
 * for the probe.
 *
 * §8.3 generic-optional sentinel-hiding (Codex round-11 MEDIUM):
 * dress_code is a generic optional text field — a sheet with
 * `dress_code: "N/A"` / `"TBD"` / `"TBA"` previously rendered a
 * "Dress code" row with the sentinel value, defeating the §8.3
 * promise that meaningless values reflow out. Now routes through
 * lib/visibility/emptyState.ts:shouldHideGenericOptional just like
 * power/internet/keynote/venue notes in this same tile.
 */
function pickDressCode(eventDetails: Record<string, string> | null | undefined): string | null {
  if (!eventDetails) return null;
  const lowercase = new Map(Object.entries(eventDetails).map(([k, v]) => [k.toLowerCase(), v]));
  const candidates = ["dress_code", "dress code", "dress", "attire"];
  for (const key of candidates) {
    const v = lowercase.get(key);
    if (typeof v !== "string") continue;
    if (shouldHideGenericOptional(v)) continue;
    return v;
  }
  return null;
}

export function ShowStatusTile({ show }: ShowStatusTileProps) {
  const coi = show.coi_status?.trim() || null;
  const dress = pickDressCode(show.event_details);
  // §8.3 generic-optional (Codex round-10): venue.notes follows the
  // same sentinel-hiding rule as power/internet/keynote below. The
  // file already imports shouldHideGenericOptional for those fields;
  // we extend the same routing to venue notes.
  const rawVenueNotes = show.venue?.notes ?? null;
  const venueNotes = shouldHideGenericOptional(rawVenueNotes) ? null : (rawVenueNotes ?? "").trim();

  // Per-field empty-state dispatch (Task 4.14). The predicate table
  // lives in `lib/visibility/emptyState.ts`; tiles MUST NOT inline
  // string-list checks. opening_reel uses §10-aware semantics
  // (preserves `N/A`/`MAYBE`/`TBA`/`BACKUP ONLY`); generic-optional
  // fields hide the universal `TBD`/`N/A`/`TBA` sentinels.
  const eventDetails = show.event_details ?? {};
  const rawOpeningReel = eventDetails["opening_reel"] ?? null;
  const openingReelHidden = shouldHideOpeningReel(rawOpeningReel);
  // §10 URL-strip render contract: never expose Drive/Docs URLs to the
  // crew DOM. The strip is the ONLY render path for opening_reel.
  const openingReelText = openingReelHidden ? null : stripOpeningReelText(rawOpeningReel);

  const rawPower = eventDetails["power"] ?? null;
  const powerHidden = shouldHideGenericOptional(rawPower);
  const power = powerHidden ? null : (rawPower ?? "").trim();

  const rawInternet = eventDetails["internet"] ?? null;
  const internetHidden = shouldHideGenericOptional(rawInternet);
  const internet = internetHidden ? null : (rawInternet ?? "").trim();

  const rawKeynote = eventDetails["keynote_requirements"] ?? null;
  const keynoteHidden = shouldHideGenericOptional(rawKeynote);
  const keynote = keynoteHidden ? null : (rawKeynote ?? "").trim();

  const allEmpty =
    !coi && !dress && !venueNotes && !openingReelText && !power && !internet && !keynote;

  return (
    <Section
      testId="show-status-tile"
      heading="Show status"
      headingTone="eyebrow"
      variant="reference"
      ariaLabel="Show status"
      bodyAs="dl"
    >
      {allEmpty ? (
        <EmptyState label="No show status filled in yet." />
      ) : (
        <>
          {/*
            COI status — primary AC-4.1 contract surface. Every crew
            viewer sees this regardless of role_flags. Tabular figures
            via the KeyValue.tabular flag since COI labels often
            contain dates ("SENT 4/15") or ID numbers.
          */}
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">COI</dt>
            <dd
              data-testid="coi-status"
              className="text-sm font-semibold tabular-nums text-text-strong"
            >
              {coi ?? <EmptyState label="No certificate of insurance status yet." />}
            </dd>
          </div>

          {dress ? <KeyValue label="Dress code" value={dress} /> : null}
          {venueNotes ? <KeyValue label="Venue notes" value={venueNotes} /> : null}
          {/*
            Opening reel — §10 URL-stripped text-only line. The
            `data-testid` lets AC-4.5 e2e assertions scope to this row
            without scanning sibling tiles. M4 emits TEXT only; M7
            Task 7.6 will add the inline <video src="/api/asset/reel/…">
            element when the post-Apply pin columns are non-NULL.
          */}
          {openingReelText ? (
            <div data-testid="opening-reel" className="flex flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
                Opening reel
              </dt>
              <dd className="text-sm/snug text-text">{openingReelText}</dd>
            </div>
          ) : null}
          {power ? (
            <div data-testid="power" className="flex flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
                Power
              </dt>
              <dd className="text-sm/snug text-text">{power}</dd>
            </div>
          ) : null}
          {internet ? (
            <div data-testid="internet" className="flex flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
                Internet
              </dt>
              <dd className="text-sm/snug text-text">{internet}</dd>
            </div>
          ) : null}
          {keynote ? <KeyValue label="Keynote requirements" value={keynote} /> : null}
        </>
      )}
    </Section>
  );
}

import { inScopeAliases } from "@/lib/parser/aliases";
import { EVENT_LABEL_VOCAB } from "@/lib/parser/blocks/event";
import { TRANSPORT_SCHEDULE_VOCAB, PASSENGERS_VOCAB } from "@/lib/parser/blocks/transport";
import { V4_BARE_LABEL_VOCAB } from "@/lib/parser/blocks/rooms";
import { CLIENT_V4_LABELS, CLIENT_V2_LABELS } from "@/lib/parser/blocks/client";

export type VocabEntry = {
  id: string;
  klass: "fuzzable" | "excluded";
  members: readonly string[];
  minLen?: number;
};

// Venue field-alias fuzzable set, DERIVED (not hand-listed) so it always mirrors what
// resolveAliasScoped("…","venue.") actually fuzzes — it cannot drift as FIELD_ALIASES
// changes (PR-B Codex R1 HIGH). Uppercased to compare against the (uppercase) excluded
// vocabs in the collision meta-test; gatedVocabCorrect fuzzes the lowercase originals —
// same Damerau distances, so the meta-test faithfully guards it.
const VENUE_FIELD_ALIASES = inScopeAliases("venue.")
  .filter((a) => a.length >= 5)
  .map((a) => a.toUpperCase());

// Ops/financials field-alias fuzzable set (PR-C), DERIVED identically to the venue set so
// it always mirrors what resolveAliasScoped("…","ops.") actually fuzzes. The minLen-5 filter
// keeps COI/PO# exact-only (their aliases are < 5 chars); only Invoice/Proposal/Invoice Notes
// participate.
const OPS_FIELD_ALIASES = inScopeAliases("ops.")
  .filter((a) => a.length >= 5)
  .map((a) => a.toUpperCase());

/**
 * Central registry of closed vocabs for typo-tolerance. `fuzzable` entries name the
 * PR-A surfaces that get a gated fuzzy pass; `excluded` entries name the cross-vocab /
 * do-not-fuzz sets the collision meta-test (tests/parser/typoVocabCollision.test.ts)
 * guards against. Single source of truth for the meta-test + the gate's exclusion sets.
 * See spec §3 of docs/superpowers/specs/2026-06-27-parser-typo-tolerance-design.md.
 */
export const TYPO_VOCABS: readonly VocabEntry[] = [
  {
    id: "multiWordRole",
    klass: "fuzzable",
    members: ["CONTENT CREATION", "SHOW CALLER", "GREEN ROOM", "CAM OP"],
  },
  { id: "crewColumn", klass: "fuzzable", members: ["NAME", "ROLE", "PHONE", "EMAIL"] },
  // v4 transport passenger column header. detectPassengersColIdx's exact regex /^passengers?$/i
  // covers singular+plural; only the canonical plural is fuzzable. DERIVED from PASSENGERS_VOCAB.
  { id: "passengerColumn", klass: "fuzzable", minLen: 5, members: [...PASSENGERS_VOCAB] },
  {
    id: "longSectionHeader",
    klass: "fuzzable",
    members: ["TRANSPORTATION", "EVENT DETAILS", "GS DETAILS"],
  },
  // PR-B: venue field-alias fuzzy fallback (resolveAliasScoped), derived above.
  { id: "venueFieldAlias", klass: "fuzzable", minLen: 5, members: VENUE_FIELD_ALIASES },
  // PR-C: ops/financials field-alias fuzzy fallback (resolveAliasScoped), derived above.
  { id: "opsFieldAlias", klass: "fuzzable", minLen: 5, members: OPS_FIELD_ALIASES },
  // PR-D1: EVENT DETAILS field-label fuzzy fallback (gatedVocabCorrect over the block's
  // local CANONICAL_KEY_MAP). Members are the SAME derived vocab the gate fuzzes, so the
  // tripwire guards exactly what ships. (Not resolveAliasScoped — event uses a local map.)
  { id: "eventFieldAlias", klass: "fuzzable", minLen: 5, members: EVENT_LABEL_VOCAB },
  // PR-D2: v2 transport schedule-label fuzzy fallback (gatedVocabCorrect over V2_SCHEDULE_LABELS).
  // Members are the SAME derived vocab the gate fuzzes, so the tripwire guards exactly what ships.
  { id: "transportScheduleLabel", klass: "fuzzable", minLen: 5, members: TRANSPORT_SCHEDULE_VOCAB },
  // PR-D3: v4 room field-label fuzzy fallback (gatedVocabCorrect over V4_BARE_LABELS). Members
  // are the SAME derived vocab the gate fuzzes, so the tripwire guards exactly what ships.
  { id: "roomV4Label", klass: "fuzzable", minLen: 5, members: V4_BARE_LABEL_VOCAB },
  // PR-D4: client field-label fuzzy fallback (gatedVocabCorrect over CLIENT_V4_LABELS /
  // CLIENT_V2_LABELS). Members are the SAME derived vocabs the gate fuzzes (uppercased).
  {
    id: "clientV4Label",
    klass: "fuzzable",
    minLen: 5,
    members: CLIENT_V4_LABELS.map((s) => s.toUpperCase()),
  },
  {
    id: "clientV2Label",
    klass: "fuzzable",
    minLen: 5,
    members: CLIENT_V2_LABELS.map((s) => s.toUpperCase()),
  },
  // excluded / do-not-fuzz neighborhoods (spec §8) the meta-test guards against:
  {
    id: "shortRoleCodes",
    klass: "excluded",
    members: ["A1", "A2", "V1", "L1", "GS", "BO", "PTZ", "LED", "GAV", "LEAD"],
  },
  { id: "knownSubLabels", klass: "excluded", members: ["DATE", "DAY", "ROOM"] },
  { id: "sentinels", klass: "excluded", members: ["TBD", "TBA", "N/A"] },
];

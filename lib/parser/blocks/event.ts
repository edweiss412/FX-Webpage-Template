/**
 * EVENT DETAILS block parser (§2.10).
 *
 * Returns Record<string, string> — a flat map of field label → value.
 * All values are stored as raw strings (free-text preserved, no normalization).
 *
 * Layout variants:
 *
 * 1. v4/v2 "EVENT DETAILS" block (2025+):
 *    Header row: | EVENT DETAILS | |
 *    Followed by rows: | <label> | <value> |
 *    Labels include: DIagrams, LED, Backdrop / Scenic, Stage Size, Opening Reel,
 *    Keynote Requirements, Virtual Speaker, Virtual Audience, GS Podium Type,
 *    Record, Polling, Internet, Power, Equipment Storage, Staff Office Room, etc.
 *
 * 2. v2 "DETAILS" block (2025 older):
 *    Header: | DETAILS |
 *    Single-column list of field LABELS only (no values on same row).
 *    Values do not appear in this block; return empty record for these.
 *
 * 3. v1 "DETAILS/Room Diagram" block (2024):
 *    Header: | DETAILS/Room Diagram | DETAILS |
 *    Rows: | <label> | <value> |
 *
 * 4. v2 "GS DETAILS (FOR BOTH)" block (DCI RPAS):
 *    Same format as DETAILS but label "GS DETAILS".
 *
 * Key normalization: labels are lowercased and spaces replaced with underscores
 * to form canonical keys (e.g., "Virtual Audience" → "virtual_audience").
 * The original-case label is also stored for round-trip fidelity where needed.
 */

import { clean, presence, splitRow } from "./_helpers";
import { type ParseAggregator, emitEmptySection, emitUnknownField } from "@/lib/parser/warnings";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { isSensitiveCanonicalKey } from "@/lib/parser/gearClassification";
import { buildCol0HeaderRe } from "./_sectionHeaderMatch";

// The EVENT DETAILS block header labels (all variants found in corpus)
export const SECTION_HEADER_TOKENS = [
  "EVENT DETAILS",
  "DETAILS",
  "DETAILS/ROOM DIAGRAM",
  "GS DETAILS",
  "GS DETAILS (FOR BOTH)",
] as const;
const EVENT_DETAILS_HEADER_RE = buildCol0HeaderRe(SECTION_HEADER_TOKENS, { caseInsensitive: true });

// Labels that terminate the event details block
const TERMINATING_LABELS = new Set([
  "general session",
  "breakout",
  "crew",
  "hotel",
  "hotels",
  "transportation",
  "venue name",
  "venue address",
  "dates",
  "pull sheet",
  "pull",
  // Note: "diagrams" is NOT a terminator — it is a field within the event details block
  "no_header",
]);

// Field label → canonical key mapping (for well-known fields)
export const CANONICAL_KEY_MAP: Record<string, string> = {
  "virtual audience": "virtual_audience",
  "virtaul audience": "virtual_audience", // typo variant
  "virtual speaker": "virtual_speaker",
  "opening reel": "opening_reel",
  "opening sizzle reel": "opening_reel", // form-layout label (consultants/ria/fixed-income/redefining)
  "keynote requirements": "keynote_requirements",
  "backdrop / scenic": "scenic",
  "backdrop/scenic": "scenic",
  "gs podium type": "podium_type",
  "podium type": "podium_type",
  "stage size": "stage_size",
  diagrams: "diagrams",
  "diagrams link": "diagrams",
  // Pre-2026 INFO/DETAILS template split the diagram row into two ("Floor Plan" + "Room Diagram");
  // the 2026 template collapsed both into the single recognized "DIagrams" row above. Recognize the
  // legacy pair as their own known-but-unread keys so the near-universal pre-2026 corpus stops
  // raising UNKNOWN_FIELD (report #237). The value (often the link display text) is kept in
  // event_details like `diagrams`; the actual diagram content is surfaced by the Diagrams tile.
  "floor plan": "floor_plan",
  "room diagram": "room_diagram",
  led: "led",
  record: "record",
  polling: "polling",
  internet: "internet",
  power: "power",
  "equipment storage": "equipment_storage",
  "staff office room": "staff_office_room",
  "test pattern": "test_pattern",
  fonts: "fonts",
  "fonts (ii only)": "fonts",
  "digital signage": "digital_signage",
  gooseneck: "gooseneck",
  goosneck: "gooseneck",
  goosenecks: "gooseneck",
  notes: "notes",
  // M4-D1: dress-code family. The four labels below all collapse to the single
  // canonical `dress_code` key (the parser is now the sole dress-key authority;
  // the consumer reads `event_details.dress_code` only). Because several labels
  // map to one key, the write site applies SENTINEL-AWARE PRECEDENCE so a
  // sentinel value for one label never clobbers a real value for another (see
  // the write block in parseEventDetails). `dress_code` itself round-trips via
  // the fallback, but is listed for documentation of the full family.
  dress_code: "dress_code",
  "dress code": "dress_code",
  dress: "dress_code",
  attire: "dress_code",
};

// Uppercase label spellings the EVENT DETAILS fuzzy fallback corrects toward — DERIVED
// from CANONICAL_KEY_MAP keys (single source of truth; lib/parser/typoVocabRegistry.ts
// imports this exact const so the registry can't drift). The len>=5 filter keeps short
// keys (notably "led", 3 chars) OUT of the correction targets, so nothing fuzzes to "led"
// and the LED↔LEAD security adjacency (spec §8) cannot arise here; "led" remains a valid
// EXACT field via the known-map path.
export const EVENT_LABEL_VOCAB: readonly string[] = Object.keys(CANONICAL_KEY_MAP)
  .filter((k) => k.length >= 5)
  .map((k) => k.toUpperCase());

// Do-not-fuzz tokens passed to the gate's cross-vocab exclusion. minLen:5 already drops
// every one of these (all < 5 chars), so this is belt-and-suspenders matching the
// milestone's gate-exclusion convention + robustness if a >=5 do-not-fuzz token is added.
const EVENT_GATE_EXCLUDE = ["LED", "LEAD", "DATE", "DAY", "ROOM", "TBD", "TBA", "N/A"] as const;
const EVENT_GATE_OPTS = { minLen: 5, tieAbort: true, exclude: EVENT_GATE_EXCLUDE } as const;

export function parseEventDetails(
  markdown: string,
  _version: "v1" | "v2" | "v4",

  agg?: ParseAggregator,
): Record<string, string> {
  const result: Record<string, string> = {};

  // PR-D1 deferred-commit state: canonicals an EXACT label gave a REAL value (a real exact
  // value wins over any fuzzy sibling — empty/sentinel exact does NOT claim, so a real fuzzy
  // can still recover), and the surviving fuzzy candidate per canonical (last-write-wins).
  const exactReal = new Set<string>();
  const fuzzyCandidates = new Map<string, { rawLabel: string; value: string }>();

  // Find the event details block
  const headerMatch = EVENT_DETAILS_HEADER_RE.exec(markdown);
  if (!headerMatch) return result;

  const section = markdown.slice(headerMatch.index);
  const lines = section.split("\n");
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line.startsWith("|")) {
      if (inBlock) break; // end of block
      continue;
    }

    const cells = splitRow(line);
    if (cells.every((c) => /^[\s:|*-]*$/.test(c))) continue; // separator

    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");

    // The first row is the header itself
    if (!inBlock) {
      inBlock = true;
      // If this row is the header with no value, skip it
      if (EVENT_DETAILS_HEADER_RE.test(line)) continue;
    }

    if (!col0) continue;

    // Check for terminating labels (new block starting)
    const col0Lower = col0.toLowerCase();
    if (TERMINATING_LABELS.has(col0Lower)) break;
    // Also break on GENERAL SESSION / BREAKOUT headers
    if (/^GENERAL SESSION\b/.test(col0) || /^BREAKOUT \d/.test(col0)) break;

    // Two-column row: col0 is label, col1 is value
    if (col1) {
      const val = presence(col1);
      const exactCanon = CANONICAL_KEY_MAP[col0Lower];
      if (exactCanon !== undefined) {
        // Known label — unchanged write; a REAL value claims the canonical so fuzzy can't
        // shadow it (an empty/sentinel exact value does NOT claim — see PR-D1 contract).
        if (val) {
          writeField(result, exactCanon, val);
          if (!shouldHideGenericOptional(val)) exactReal.add(exactCanon);
        }
      } else {
        // Not a known label: try a gated fuzzy recovery on the LABEL only (never the value).
        // (`fix.corrected === false` — an EXACT gate hit — is unreachable here: an exact label
        // would have matched `CANONICAL_KEY_MAP[col0Lower]` above, since EVENT_LABEL_VOCAB is
        // derived solely from the map's keys. If it ever did occur it falls through to the
        // fallback below, which is the safe default.)
        const fix = gatedVocabCorrect(col0.toUpperCase(), EVENT_LABEL_VOCAB, EVENT_GATE_OPTS);
        if (fix?.corrected) {
          const canon = CANONICAL_KEY_MAP[fix.match.toLowerCase()];
          if (canon && val) {
            // Defer; apply post-loop unless an exact label claims this canonical. Among fuzzy
            // siblings: last-write-wins with the SAME sentinel-aware precedence as exact labels
            // (a sentinel never displaces a real candidate), so `rawLabel` tracks the winning value.
            const prev = fuzzyCandidates.get(canon);
            const incomingIsSentinel = shouldHideGenericOptional(val);
            const prevIsReal = prev !== undefined && !shouldHideGenericOptional(prev.value);
            if (!(incomingIsSentinel && prevIsReal)) {
              fuzzyCandidates.set(canon, { rawLabel: col0, value: val });
            }
          }
        } else {
          // Genuinely-unknown label (no fuzzy hit, tie-aborted, or below-minLen): preserve the
          // existing normalize-and-keep fallback. Defense-in-depth (§3.4): never let an
          // unknown label normalize into a financial/internal key (PO#/Budget/Invoice/…).
          // A kept fallback key is rendered by nothing, so ALSO surface it to the operator via
          // UNKNOWN_FIELD (kept + visible). Sensitive-looking labels stay silently dropped and
          // are NOT flagged — flagging would leak the value through the warning rawSnippet.
          // (unknown-label coverage)
          const key = toCanonicalKey(col0);
          if (key && val && !isSensitiveCanonicalKey(key)) {
            writeField(result, key, val);
            emitUnknownField(agg, {
              block: "event_details",
              kind: "details",
              key: col0,
              value: val,
            });
          }
        }
      }
    }
    // Single-column row (label only, no value) — skip
  }

  // Apply fuzzy candidates, skipping any canonical an EXACT label claimed with a real value
  // (exact-real wins). writeField still applies, so a fuzzy value correctly overrides an
  // empty/sentinel exact value but a sentinel fuzzy never clobbers a real value.
  for (const [canon, cand] of fuzzyCandidates) {
    if (exactReal.has(canon)) continue;
    writeField(result, canon, cand.value);
    agg?.warnings.push({
      severity: "warn",
      code: "FIELD_LABEL_AUTOCORRECTED",
      message: `Read likely-misspelled EVENT DETAILS label '${cand.rawLabel}' as field '${canon}'`,
      blockRef: { kind: "details" },
      rawSnippet: cand.rawLabel,
    });
  }

  // Closed-vocabulary form-layout harvest (§3.4) — runs ONLY when the classic EVENT DETAILS
  // block was dropped (event_details still empty), recovering the form-layout intake block for
  // shows whose classic block fails (e.g. consultants / dci-rpas / asset-mgmt-2025-04). Working
  // shows with a populated classic block are left UNCHANGED — the harvest is scoped to Bug #2
  // ("event_details dropped on form-layout shows"), so it never mutates a working show
  // (no sentinel "upgrades", no tangential field adds). Closed-vocab by construction: only
  // labels resolving to a KNOWN canonical key are harvested — unknown labels (Your Name /
  // Email / Phone / Budget / PO# / room headers …) are skipped, so no PII/financial/metadata
  // can ever enter crew-visible event_details. fillIfAbsentOrSentinel = first-real-wins.
  if (Object.keys(result).length === 0) harvestFormLayout(markdown, result, agg);

  // D1: the no-header case already returned above, so reaching here with an empty result
  // means a recognized EVENT DETAILS header parsed zero fields AND the form harvest found no
  // anchored block — fail loud instead of dropping it silently.
  if (Object.keys(result).length === 0) emitEmptySection(agg, "event_details");
  return result;
}

// Canonical keys recognized in the CLASSIC EVENT DETAILS block (where they carry the diagram
// link value) but EXCLUDED from the form-layout harvest: in a form-layout intake block these
// labels appear as PROSE questions, not field values, so harvesting them would inject junk
// prose into crew-adjacent event_details (report #237: consultants' form row "Room Diagram |
// You are familiar with this room/hotel. If you need a Room Diagram please let me know").
const HARVEST_EXCLUDED_CANON = new Set(["floor_plan", "room_diagram"]);

/**
 * Resolve a form label to its KNOWN canonical key (CANONICAL_KEY_MAP exact, or a gated
 * fuzzy correction into EVENT_LABEL_VOCAB) — or `null` if the label is not a known event
 * field. The closed-vocabulary gate for the form harvest: `null` means "skip this row".
 * Keys in HARVEST_EXCLUDED_CANON also resolve to `null` here (harvest-only exclusion; the
 * classic-block exact path at CANONICAL_KEY_MAP[col0Lower] still recognizes them).
 *
 * Returns `{ canon, corrected }` so the harvest can honor the "always warn / never a silent
 * re-route" contract (spec §2 rule 4): `corrected:false` on an EXACT map hit, `corrected:true`
 * on a gated FUZZY recovery. A fuzzy recovery that is actually harvested MUST emit a
 * FIELD_LABEL_AUTOCORRECTED warn (see harvestFormLayout) — the exact path never warns.
 */
function resolveKnownCanon(label: string): { canon: string; corrected: boolean } | null {
  const exact = CANONICAL_KEY_MAP[label.toLowerCase().trim()];
  if (exact !== undefined) {
    return HARVEST_EXCLUDED_CANON.has(exact) ? null : { canon: exact, corrected: false };
  }
  const fix = gatedVocabCorrect(label.toUpperCase(), EVENT_LABEL_VOCAB, EVENT_GATE_OPTS);
  if (fix?.corrected) {
    const canon = CANONICAL_KEY_MAP[fix.match.toLowerCase()];
    if (canon && !HARVEST_EXCLUDED_CANON.has(canon)) return { canon, corrected: true };
  }
  return null;
}

/**
 * Fill-if-absent-or-sentinel write: set `result[key]` only when it is currently absent OR a
 * hideable sentinel — never overwrite an existing REAL value. Because the classic pass runs
 * first, this yields deterministic first-real-wins across classic + form sources. Returns `true`
 * iff the value was actually written, so the harvest can warn ONLY for rows it truly recovered
 * (a no-op fill — a real value already present — must not warn).
 */
function fillIfAbsentOrSentinel(result: Record<string, string>, key: string, val: string): boolean {
  const existing = result[key];
  if (existing === undefined || shouldHideGenericOptional(existing)) {
    result[key] = val;
    return true;
  }
  return false;
}

/**
 * Closed-vocabulary form-layout harvest (spec §3.4). Scans the markdown for contiguous runs
 * of 2-cell `| label | value |` rows; a run ANCHORS when ≥3 of its labels resolve to a known
 * canonical key. For an anchored run, harvest ONLY the rows whose label is known (unknown
 * labels skipped — the closed-vocab principle that structurally excludes PII/financial), and
 * write via `fillIfAbsentOrSentinel`. Separator/blank/non-2-cell rows end a run.
 */
function harvestFormLayout(
  markdown: string,
  result: Record<string, string>,
  agg?: ParseAggregator,
): void {
  let run: {
    canon: string | null;
    corrected: boolean;
    rawLabel: string;
    value: string | null;
  }[] = [];
  const flush = (): void => {
    if (run.filter((r) => r.canon !== null).length >= 3) {
      for (const r of run) {
        if (r.canon === null) continue; // closed-vocab: skip unknown labels entirely
        if (isSensitiveCanonicalKey(r.canon)) continue; // defense-in-depth (map has none)
        if (!r.value) continue; // never clobber/fill with an empty form value
        if (/^(TRUE|FALSE)$/i.test(r.value)) continue; // INTERNAL checklist booleans, not field values
        const wrote = fillIfAbsentOrSentinel(result, r.canon, r.value);
        // "Always warn / never a silent re-route" (spec §2 rule 4): a FUZZY-corrected known label
        // that is ACTUALLY harvested (value written) emits the SAME warn shape as the classic pass
        // (event.ts fuzzyCandidates loop). Exact hits never warn; a no-op fill (a real value already
        // present) never warns; skipped/unknown rows never warn.
        if (wrote && r.corrected) {
          agg?.warnings.push({
            severity: "warn",
            code: "FIELD_LABEL_AUTOCORRECTED",
            message: `Read likely-misspelled EVENT DETAILS label '${r.rawLabel}' as field '${r.canon}'`,
            blockRef: { kind: "details" },
            rawSnippet: r.rawLabel,
          });
        }
      }
    }
    run = [];
  };
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) {
      flush();
      continue;
    }
    const cells = splitRow(t);
    if (cells.length !== 2 || cells.every((c) => /^[\s:|*-]*$/.test(c))) {
      flush();
      continue;
    }
    const col0 = clean(cells[0] ?? "");
    if (!col0) {
      flush();
      continue;
    }
    const resolved = resolveKnownCanon(col0);
    run.push({
      canon: resolved?.canon ?? null,
      corrected: resolved?.corrected ?? false,
      rawLabel: col0,
      value: presence(cells[1] ?? ""),
    });
  }
  flush();
}

/**
 * Sentinel-aware field write (M4-D1 precedence, extracted so the post-loop fuzzy
 * application reuses the identical rule): a sentinel value never clobbers a real value
 * already held for the same canonical key; otherwise last-write-wins.
 */
function writeField(result: Record<string, string>, key: string, val: string): void {
  const existing = result[key];
  const incomingIsSentinel = shouldHideGenericOptional(val);
  const existingIsReal = existing !== undefined && !shouldHideGenericOptional(existing);
  if (incomingIsSentinel && existingIsReal) return; // keep the real value, drop the sentinel
  result[key] = val;
}

function toCanonicalKey(label: string): string {
  const lower = label.toLowerCase().trim();
  // Check known map first
  if (CANONICAL_KEY_MAP[lower]) return CANONICAL_KEY_MAP[lower]!;
  // Fallback: lowercase + underscores
  return lower.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

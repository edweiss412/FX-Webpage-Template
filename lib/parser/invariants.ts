/**
 * lib/parser/invariants.ts
 *
 * Pure function: runInvariants(prior, next) — evaluates all MI-1..MI-14
 * minimum invariants against a (prior | null, next) ParseResult pair.
 *
 * Outcome priority: hard_fail > stage > pass
 *
 * When prior === null (first sync), only MI-1..MI-5b run. MI-6..MI-14
 * require a comparison baseline and are skipped entirely on first sync.
 *
 * No DB calls. No Drive calls. Pure logic over parsed data.
 */

import { randomUUID } from "node:crypto";
import type { ParseResult, InvariantOutcome, TriggeredReviewItem, RoleFlag } from "./types";
import { canonicalize } from "@/lib/email/canonicalize";

// ---------------------------------------------------------------------------
// Levenshtein distance helper (inline, ~20 lines)
// Handles empty strings and identical strings efficiently.
// Time: O(m*n), Space: O(min(m,n))
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use shorter string as column to minimize space
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const aLen = a.length;
  const bLen = b.length;
  let prev = Array.from({ length: aLen + 1 }, (_, i) => i);
  let curr = new Array<number>(aLen + 1);

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j;
    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        (prev[i] ?? 0) + 1, // deletion
        (curr[i - 1] ?? 0) + 1, // insertion
        (prev[i - 1] ?? 0) + cost, // substitution
      );
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[aLen] ?? 0;
}

/**
 * Levenshtein threshold for MI-13/MI-14 pairing.
 * Rationale: distance ≤ 2 handles single-char typos in short names and
 * 1–2 char additions/deletions in longer names (e.g., "Jon" → "John",
 * "Tim Allen" → "Tom Allen"). Distance ≤ 3 adds coverage for slightly
 * larger edits while staying conservative to avoid false pairings.
 * We use: threshold = max(2, floor(name.length / 4)) capped at 3.
 * This scales with name length without being too permissive.
 */
function levenshteinThreshold(name: string): number {
  return Math.min(3, Math.max(2, Math.floor(name.length / 4)));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Normalize coi_status: treat null and "" as equivalent empty sentinel */
function normalizeCoi(v: string | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** Set equality for RoleFlag arrays (order-insensitive) */
function roleFlagsEqual(a: RoleFlag[], b: RoleFlag[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set<RoleFlag>(a);
  return b.every((f) => setA.has(f));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Evaluate MI-1..MI-14 invariants.
 *
 * @param prior  The last applied ParseResult for this show, or null on first sync.
 * @param next   The freshly parsed ParseResult to validate.
 * @returns      InvariantOutcome discriminated union: 'pass' | 'hard_fail' | 'stage'
 */
export function runInvariants(prior: ParseResult | null, next: ParseResult): InvariantOutcome {
  const failedCodes: string[] = [];
  const messages: string[] = [];
  const triggeredItems: TriggeredReviewItem[] = [];

  // -------------------------------------------------------------------------
  // MI-1: Version detection succeeded
  // Fails if template_version is outside {v1, v2, v4} OR if
  // MI-1_VERSION_DETECTION_FAILED appears in hardErrors.
  // -------------------------------------------------------------------------
  const validVersions = new Set(["v1", "v2", "v4"]);
  const versionFailed =
    !validVersions.has(next.show.template_version) ||
    next.hardErrors.some((e) => e.code === "MI-1_VERSION_DETECTION_FAILED");

  if (versionFailed) {
    failedCodes.push("MI-1_VERSION_DETECTION_FAILED");
    messages.push(
      `Version detection failed: got '${next.show.template_version}', expected v1/v2/v4`,
    );
  }

  // -------------------------------------------------------------------------
  // MI-2: show.title is non-empty
  // -------------------------------------------------------------------------
  if (next.show.title.trim().length === 0) {
    failedCodes.push("MI-2_EMPTY_TITLE");
    messages.push("show.title is empty");
  }

  // -------------------------------------------------------------------------
  // MI-3: At least one of travelIn, set, showDays[0] is a valid date
  // -------------------------------------------------------------------------
  const dates = next.show.dates;
  const hasDate =
    dates.travelIn != null ||
    dates.set != null ||
    (dates.showDays.length > 0 && dates.showDays[0] != null);

  if (!hasDate) {
    failedCodes.push("MI-3_NO_VALID_DATES");
    messages.push("No valid dates found (travelIn, set, showDays[0] are all null/empty)");
  }

  // -------------------------------------------------------------------------
  // MI-4: crewMembers.length >= 1
  // -------------------------------------------------------------------------
  if (next.crewMembers.length < 1) {
    failedCodes.push("MI-4_NO_CREW");
    messages.push("crewMembers is empty");
  }

  // -------------------------------------------------------------------------
  // MI-5: rooms.length >= 1
  // -------------------------------------------------------------------------
  if (next.rooms.length < 1) {
    failedCodes.push("MI-5_NO_ROOMS");
    messages.push("rooms is empty");
  }

  // -------------------------------------------------------------------------
  // MI-5a: No duplicate crew names
  // -------------------------------------------------------------------------
  const nameCounts = new Map<string, number>();
  for (const cm of next.crewMembers) {
    nameCounts.set(cm.name, (nameCounts.get(cm.name) ?? 0) + 1);
  }
  for (const [name, count] of nameCounts) {
    if (count > 1) {
      failedCodes.push("MI-5a_DUPLICATE_CREW_NAME");
      messages.push(`Duplicate crew name: '${name}' appears ${count} times`);
      break; // one code suffices; all violations are surfaced via messages
    }
  }
  // Add any additional duplicate names to messages (codes only emitted once)
  {
    let first = true;
    for (const [name, count] of nameCounts) {
      if (count > 1) {
        if (!first) {
          messages.push(`Duplicate crew name: '${name}' appears ${count} times`);
        }
        first = false;
      }
    }
  }

  // -------------------------------------------------------------------------
  // MI-5b: No duplicate canonicalized emails (when non-null)
  // -------------------------------------------------------------------------
  const emailCounts = new Map<string, number>();
  for (const cm of next.crewMembers) {
    const canon = canonicalize(cm.email);
    if (canon != null) {
      emailCounts.set(canon, (emailCounts.get(canon) ?? 0) + 1);
    }
  }
  for (const [email, count] of emailCounts) {
    if (count > 1) {
      failedCodes.push("MI-5b_DUPLICATE_CREW_EMAIL");
      messages.push(`Duplicate crew email: '${email}' appears ${count} times`);
      break;
    }
  }
  // Add remaining duplicates to messages
  {
    let first = true;
    for (const [email, count] of emailCounts) {
      if (count > 1) {
        if (!first) {
          messages.push(`Duplicate crew email: '${email}' appears ${count} times`);
        }
        first = false;
      }
    }
  }

  // -------------------------------------------------------------------------
  // If ANY hard-fail fired, return immediately — do NOT evaluate MI-6..MI-14
  // -------------------------------------------------------------------------
  if (failedCodes.length > 0) {
    return { outcome: "hard_fail", failedCodes, messages };
  }

  // -------------------------------------------------------------------------
  // If prior is null (first sync), skip all comparison-based invariants
  // -------------------------------------------------------------------------
  if (prior === null) {
    return { outcome: "pass" };
  }

  // =========================================================================
  // Stage-for-approval invariants (MI-6..MI-14) — require prior
  // =========================================================================

  // -------------------------------------------------------------------------
  // MI-6: Crew shrinkage guard
  // Fires if prior.crewMembers.length - next.crewMembers.length > 1
  // -------------------------------------------------------------------------
  const crewDrop = prior.crewMembers.length - next.crewMembers.length;
  if (crewDrop > 1) {
    triggeredItems.push({ id: randomUUID(), invariant: "MI-6" });
  }

  // -------------------------------------------------------------------------
  // MI-7: Section shrinkage guard
  // hotelReservations, rooms, contacts: >50% drop, OR any drop when prior <= 2
  // transportation: prior populated → new null
  // -------------------------------------------------------------------------

  // Hotels
  {
    const pc = prior.hotelReservations.length;
    const nc = next.hotelReservations.length;
    if (pc > 0 && nc < pc) {
      const triggers = pc <= 2 || nc < pc / 2;
      if (triggers) {
        triggeredItems.push({
          id: randomUUID(),
          invariant: "MI-7",
          section: "hotel_reservations",
          prior_count: pc,
          new_count: nc,
        });
      }
    }
  }

  // Rooms
  {
    const pc = prior.rooms.length;
    const nc = next.rooms.length;
    if (pc > 0 && nc < pc) {
      const triggers = pc <= 2 || nc < pc / 2;
      if (triggers) {
        triggeredItems.push({
          id: randomUUID(),
          invariant: "MI-7",
          section: "rooms",
          prior_count: pc,
          new_count: nc,
        });
      }
    }
  }

  // Contacts
  {
    const pc = prior.contacts.length;
    const nc = next.contacts.length;
    if (pc > 0 && nc < pc) {
      const triggers = pc <= 2 || nc < pc / 2;
      if (triggers) {
        triggeredItems.push({
          id: randomUUID(),
          invariant: "MI-7",
          section: "contacts",
          prior_count: pc,
          new_count: nc,
        });
      }
    }
  }

  // Transportation: prior populated → new null
  {
    if (prior.transportation != null && next.transportation == null) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-7",
        section: "transportation",
        prior_count: 1,
        new_count: 0,
      });
    }
  }

  // -------------------------------------------------------------------------
  // MI-7b: Keyed preservation across re-syncs
  // Hotels keyed on ordinal; rooms on (kind, name); contacts on (kind, name) or (kind, email)
  // -------------------------------------------------------------------------

  // Hotels — keyed on ordinal
  {
    const nextOrdinals = new Set(next.hotelReservations.map((h) => h.ordinal));
    for (const ph of prior.hotelReservations) {
      if (!nextOrdinals.has(ph.ordinal)) {
        triggeredItems.push({
          id: randomUUID(),
          invariant: "MI-7b",
          section: "hotel_reservations",
          missingKey: String(ph.ordinal),
        });
      }
    }
  }

  // Rooms — keyed on (kind, name)
  {
    const nextRoomKeys = new Set(next.rooms.map((r) => `${r.kind}::${r.name}`));
    for (const pr of prior.rooms) {
      const key = `${pr.kind}::${pr.name}`;
      if (!nextRoomKeys.has(key)) {
        triggeredItems.push({
          id: randomUUID(),
          invariant: "MI-7b",
          section: "rooms",
          missingKey: `${pr.kind}::${pr.name}`,
        });
      }
    }
  }

  // Contacts — keyed name-first with email fallback (Codex round-4 fix).
  //
  // Round-2 used email-first keying. Round-4 identified the regression: when
  // prior has {name:'Kurt Ashcraft', email:X} and next has {name:null, email:X}
  // (parser regression collapsing named row to email-only), both rows hashed to
  // the same email key → MI-7b returned 'pass' and missed the degradation.
  //
  // Name-first keying assigns different keys to the two shapes:
  //   {name:'Kurt Ashcraft', email:X} → 'venue::name::kurt ashcraft'
  //   {name:null, email:X}            → 'venue::email::X'
  // So the named→email-only degradation correctly fires MI-7b.
  //
  // The round-2 concern (title edits producing spurious fires) is already
  // mitigated by Task 1.6's NAME_STOP_TOKENS: the parser now consistently
  // produces name:'Kurt Ashcraft' regardless of title text in the cell.
  //
  // Email change with same name ({name:'Kurt', email:A}→{name:'Kurt', email:B})
  // is detected by MI-11 (email change), not MI-7b.
  //
  // Fix (Codex round-3 finding 2): use a count-aware multiset (Map<string,number>)
  // instead of a Set<string>. When prior has 2 rows with the same key and next
  // has only 1, the Set-based check would see the key as "present" and miss the
  // partial deletion. The count-aware comparison fires MI-7b for any drop in count.
  {
    const contactKey = (c: {
      kind: string;
      email: string | null;
      name: string | null;
      phone: string | null;
    }): string => {
      // Name-first: stable key based on parsed name when present.
      // Task 1.6 NAME_STOP_TOKENS ensures consistent name extraction across title edits.
      if (c.name) return `${c.kind}::name::${c.name.toLowerCase().trim()}`;
      // Email fallback for name-less reference rows.
      if (c.email) return `${c.kind}::email::${c.email.toLowerCase().trim()}`;
      // Phone fallback when neither name nor email.
      if (c.phone) return `${c.kind}::phone::${c.phone}`;
      // Last resort.
      return `${c.kind}::?`;
    };

    const makeContactCounts = (
      contacts: { kind: string; email: string | null; name: string | null; phone: string | null }[],
    ): Map<string, number> => {
      const counts = new Map<string, number>();
      for (const c of contacts) {
        const key = contactKey(c);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    };

    const priorCounts = makeContactCounts(prior.contacts);
    const nextCounts = makeContactCounts(next.contacts);
    for (const [key, priorCount] of priorCounts) {
      const nextCount = nextCounts.get(key) ?? 0;
      if (nextCount < priorCount) {
        triggeredItems.push({
          id: randomUUID(),
          invariant: "MI-7b",
          section: "contacts",
          missingKey: key,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // MI-8: Financial-field preservation
  // po, proposal, invoice, invoice_notes: non-empty → empty/null stages
  // -------------------------------------------------------------------------
  const financialFields: Array<{
    field: "po" | "proposal" | "invoice" | "invoiceNotes";
    priorVal: string | null;
    nextVal: string | null;
  }> = [
    { field: "po", priorVal: prior.show.po, nextVal: next.show.po },
    { field: "proposal", priorVal: prior.show.proposal, nextVal: next.show.proposal },
    { field: "invoice", priorVal: prior.show.invoice, nextVal: next.show.invoice },
    { field: "invoiceNotes", priorVal: prior.show.invoice_notes, nextVal: next.show.invoice_notes },
  ];

  for (const { field, priorVal, nextVal } of financialFields) {
    const hadValue = priorVal != null && priorVal.trim().length > 0;
    const nowEmpty = nextVal == null || nextVal.trim().length === 0;
    if (hadValue && nowEmpty) {
      triggeredItems.push({ id: randomUUID(), invariant: "MI-8", field });
    }
  }

  // -------------------------------------------------------------------------
  // MI-8b: COI status — any change stages (null/"" are equivalent)
  // -------------------------------------------------------------------------
  {
    const priorCoi = normalizeCoi(prior.show.coi_status);
    const nextCoi = normalizeCoi(next.show.coi_status);
    if (priorCoi !== nextCoi) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-8b",
        prior: prior.show.coi_status,
        next: next.show.coi_status,
      });
    }
  }

  // -------------------------------------------------------------------------
  // MI-8c: Pull-sheet structural regression
  // (a) prior non-null → new null (collapse)
  // (b) PULL_SHEET_AMBIGUOUS_FORMAT warning in next AND prior was non-ambiguous
  // (c) new.cases.length < prior.cases.length / 2 (halved)
  // (d) a caseLabel present in prior is missing from new (case dropped)
  // -------------------------------------------------------------------------
  {
    const priorPS = prior.pullSheet;
    const nextPS = next.pullSheet;

    if (priorPS != null) {
      // (a) Full collapse
      if (nextPS == null) {
        triggeredItems.push({ id: randomUUID(), invariant: "MI-8c", mode: "collapse" });
      } else {
        // (b) Ambiguous format warning in next, prior had no such warning
        const nextAmbiguous = next.warnings.some((w) => w.code === "PULL_SHEET_AMBIGUOUS_FORMAT");
        const priorAmbiguous = prior.warnings.some((w) => w.code === "PULL_SHEET_AMBIGUOUS_FORMAT");
        if (nextAmbiguous && !priorAmbiguous) {
          triggeredItems.push({
            id: randomUUID(),
            invariant: "MI-8c",
            mode: "ambiguous_format",
          });
        }

        // (c) Case count halved
        if (nextPS.length < priorPS.length / 2) {
          triggeredItems.push({ id: randomUUID(), invariant: "MI-8c", mode: "halved" });
        }

        // (d) Case label dropped
        // Only fire if not already covered by 'halved' to avoid double-firing
        // But spec says these are independent conditions; emit all that apply
        const nextCaseLabels = new Set(nextPS.map((c) => c.caseLabel));
        for (const pc of priorPS) {
          if (!nextCaseLabels.has(pc.caseLabel)) {
            triggeredItems.push({
              id: randomUUID(),
              invariant: "MI-8c",
              mode: "case_dropped",
              details: `Case '${pc.caseLabel}' missing from new parse`,
            });
          }
        }
      }
    }
  }

  // =========================================================================
  // Crew delta invariants (MI-9, MI-10, MI-11, MI-12, MI-13, MI-14)
  // Build lookup maps for prior and next crew.
  // =========================================================================

  // Build name → crew maps
  const priorByName = new Map(prior.crewMembers.map((cm) => [cm.name, cm]));
  const nextByName = new Map(next.crewMembers.map((cm) => [cm.name, cm]));

  // -------------------------------------------------------------------------
  // MI-9: role_flags change for existing crew (matched by name)
  // -------------------------------------------------------------------------
  for (const [name, priorCm] of priorByName) {
    const nextCm = nextByName.get(name);
    if (nextCm == null) continue; // not in new — covered by removal logic
    if (!roleFlagsEqual(priorCm.role_flags, nextCm.role_flags)) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-9",
        crew_name: name,
        prior_flags: priorCm.role_flags,
        new_flags: nextCm.role_flags,
      });
    }
  }

  // -------------------------------------------------------------------------
  // MI-10: LEAD flag toggle — documented as a safety-net alongside MI-9.
  // Per spec: "Treat MI-9 as the canonical implementation; MI-10 exists as a
  // documentation-level safety net." MI-9 above already covers this. We
  // emit an additional MI-10 item only when LEAD changes but MI-9 wasn't
  // emitted for the same crew member (e.g., edge case where they were both
  // set equal but LEAD state changed — logically impossible, so this is
  // purely a belt-and-suspenders path). In practice, MI-9 always fires first.
  // Spec says: "Treat MI-9 as the canonical implementation" — so we emit
  // MI-10 only if MI-9 did NOT fire for the same member (redundancy safety net).
  // -------------------------------------------------------------------------
  {
    const mi9Names = new Set(
      triggeredItems
        .filter((i) => i.invariant === "MI-9")
        .map((i) => (i.invariant === "MI-9" ? i.crew_name : "")),
    );

    for (const [name, priorCm] of priorByName) {
      const nextCm = nextByName.get(name);
      if (nextCm == null) continue;
      const priorHasLead = priorCm.role_flags.includes("LEAD");
      const nextHasLead = nextCm.role_flags.includes("LEAD");
      if (priorHasLead !== nextHasLead && !mi9Names.has(name)) {
        triggeredItems.push({ id: randomUUID(), invariant: "MI-10" });
      }
    }
  }

  // -------------------------------------------------------------------------
  // MI-11: Email change for existing crew (matched by name)
  // Any normalized email delta stages (null→non-null, non-null→null, both differ)
  // -------------------------------------------------------------------------
  for (const [name, priorCm] of priorByName) {
    const nextCm = nextByName.get(name);
    if (nextCm == null) continue;
    const priorEmail = canonicalize(priorCm.email);
    const nextEmail = canonicalize(nextCm.email);
    if (priorEmail !== nextEmail) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-11",
        crew_name: name,
        prior_email: priorCm.email,
        new_email: nextCm.email,
      });
    }
  }

  // =========================================================================
  // MI-12, MI-13, MI-14: Symmetric-difference rename detection
  //
  // Compute:
  //   removedNames = names in prior but not in next
  //   addedNames   = names in next but not in prior
  //
  // First pass (MI-12): among removed with non-null email, find added with
  // same canonicalized email → probable rename.
  //
  // Remaining unmatched removals and additions feed MI-13 (both have email)
  // and MI-14 (both have null email).
  // =========================================================================

  const removedNames = new Set<string>();
  const addedNames = new Set<string>();

  for (const name of priorByName.keys()) {
    if (!nextByName.has(name)) removedNames.add(name);
  }
  for (const name of nextByName.keys()) {
    if (!priorByName.has(name)) addedNames.add(name);
  }

  // Track which removed/added names have been paired
  const pairedRemoved = new Set<string>();
  const pairedAdded = new Set<string>();

  // -------------------------------------------------------------------------
  // MI-12: Removed with non-null email matches added with same canonical email
  // -------------------------------------------------------------------------
  for (const removedName of removedNames) {
    const removedCm = priorByName.get(removedName);
    if (removedCm == null) continue;
    const removedEmail = canonicalize(removedCm.email);
    if (removedEmail == null) continue; // MI-12 requires non-null email on removed side

    // Find added crew with same canonicalized email
    for (const addedName of addedNames) {
      if (pairedAdded.has(addedName)) continue;
      const addedCm = nextByName.get(addedName);
      if (addedCm == null) continue;
      const addedEmail = canonicalize(addedCm.email);
      if (addedEmail === removedEmail) {
        triggeredItems.push({
          id: randomUUID(),
          invariant: "MI-12",
          removed_name: removedName,
          added_name: addedName,
          email: removedEmail,
        });
        pairedRemoved.add(removedName);
        pairedAdded.add(addedName);
        break; // one match per removed name
      }
    }
  }

  // -------------------------------------------------------------------------
  // MI-13: Combined name+email change — unmatched removed (with email) and
  // unmatched added (with email) paired by Levenshtein distance.
  // -------------------------------------------------------------------------
  // Build lists of unmatched removals/additions with emails
  const mi13RemovedCandidates: string[] = [];
  const mi13AddedCandidates: string[] = [];

  for (const name of removedNames) {
    if (pairedRemoved.has(name)) continue;
    const cm = priorByName.get(name);
    if (cm == null) continue;
    if (canonicalize(cm.email) != null) {
      mi13RemovedCandidates.push(name);
    }
  }
  for (const name of addedNames) {
    if (pairedAdded.has(name)) continue;
    const cm = nextByName.get(name);
    if (cm == null) continue;
    if (canonicalize(cm.email) != null) {
      mi13AddedCandidates.push(name);
    }
  }

  // Greedy Levenshtein pairing: for each removed, find the closest unmatched add
  const mi13PairedRemoved = new Set<string>();
  const mi13PairedAdded = new Set<string>();

  for (const removedName of mi13RemovedCandidates) {
    let bestDist = Infinity;
    let bestAdded: string | null = null;

    for (const addedName of mi13AddedCandidates) {
      if (mi13PairedAdded.has(addedName)) continue;
      const dist = levenshtein(removedName, addedName);
      // Use lexicographic tie-breaking (per spec: "breaking ties by lexicographic order on removed_name")
      if (dist < bestDist || (dist === bestDist && bestAdded != null && addedName < bestAdded)) {
        bestDist = dist;
        bestAdded = addedName;
      }
    }

    const threshold = levenshteinThreshold(removedName);
    if (bestAdded != null && bestDist <= threshold) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-13",
        removed_name: removedName,
        added_name: bestAdded,
      });
      mi13PairedRemoved.add(removedName);
      mi13PairedAdded.add(bestAdded);
    }
  }

  // Orphan removals from MI-13 set (unmatched removals with email)
  for (const name of mi13RemovedCandidates) {
    if (!mi13PairedRemoved.has(name)) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-13-orphan-remove",
        removed_name: name,
      });
    }
  }

  // Orphan additions from MI-13 set (unmatched additions with email)
  for (const name of mi13AddedCandidates) {
    if (!mi13PairedAdded.has(name)) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-13-orphan-add",
        added_name: name,
      });
    }
  }

  // -------------------------------------------------------------------------
  // MI-14: No-email rename — both sides null email
  // Same Levenshtein-distance heuristic as MI-13 but without email constraint.
  // -------------------------------------------------------------------------
  const mi14RemovedCandidates: string[] = [];
  const mi14AddedCandidates: string[] = [];

  for (const name of removedNames) {
    if (pairedRemoved.has(name) || mi13PairedRemoved.has(name)) continue;
    // Also skip names already emitted as MI-13 orphan-remove
    const cm = priorByName.get(name);
    if (cm == null) continue;
    if (canonicalize(cm.email) == null) {
      mi14RemovedCandidates.push(name);
    }
  }
  for (const name of addedNames) {
    if (pairedAdded.has(name) || mi13PairedAdded.has(name)) continue;
    const cm = nextByName.get(name);
    if (cm == null) continue;
    if (canonicalize(cm.email) == null) {
      mi14AddedCandidates.push(name);
    }
  }

  const mi14PairedRemoved = new Set<string>();
  const mi14PairedAdded = new Set<string>();

  for (const removedName of mi14RemovedCandidates) {
    let bestDist = Infinity;
    let bestAdded: string | null = null;

    for (const addedName of mi14AddedCandidates) {
      if (mi14PairedAdded.has(addedName)) continue;
      const dist = levenshtein(removedName, addedName);
      if (dist < bestDist || (dist === bestDist && bestAdded != null && addedName < bestAdded)) {
        bestDist = dist;
        bestAdded = addedName;
      }
    }

    const threshold = levenshteinThreshold(removedName);
    if (bestAdded != null && bestDist <= threshold) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-14",
        removed_name: removedName,
        added_name: bestAdded,
      });
      mi14PairedRemoved.add(removedName);
      mi14PairedAdded.add(bestAdded);
    }
  }

  // Orphan removals from MI-14 set
  for (const name of mi14RemovedCandidates) {
    if (!mi14PairedRemoved.has(name)) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-14-orphan-remove",
        removed_name: name,
      });
    }
  }

  // Orphan additions from MI-14 set
  for (const name of mi14AddedCandidates) {
    if (!mi14PairedAdded.has(name)) {
      triggeredItems.push({
        id: randomUUID(),
        invariant: "MI-14-orphan-add",
        added_name: name,
      });
    }
  }

  // =========================================================================
  // Final outcome
  // =========================================================================
  if (triggeredItems.length > 0) {
    return { outcome: "stage", triggeredItems };
  }

  return { outcome: "pass" };
}

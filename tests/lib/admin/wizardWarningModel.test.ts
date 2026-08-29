/**
 * tests/lib/admin/wizardWarningModel.test.ts
 * (wizard-warning-ignore-controls spec §2.1 — Task 1)
 *
 * `buildWizardWarningModel` is the one place the wizard's active/ignored split
 * is computed. Everything downstream (panel list, disclosure, card glyph, rail
 * counts, attention pill) re-joins against ORIGINAL indices carried here, so an
 * index that drifts by one silently sends every menu jump to the wrong row.
 *
 * Expected fingerprints are produced by the REAL `warningFingerprint` at test
 * time, never hardcoded: a stale hash constant would let the partition assert
 * pass against a fingerprint the production code can no longer mint.
 *
 * `normalizeStagedIgnoredWarnings` is the read-side coercion for the untrusted
 * `pending_syncs.ignored_warnings` jsonb column (spec §3, fail toward VISIBLE).
 */
import { describe, expect, it, test } from "vitest";
import { premiseHolds } from "@/tests/_shared/premise";
import { warningFingerprint, buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";
import {
  buildWizardWarningModel,
  normalizeStagedIgnoredWarnings,
  reconcileWizardWarningItems,
  type WizardWarningItem,
} from "@/lib/admin/wizardWarningModel";

const SCOPE = "east-coast-2026";

const warnA: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized field.",
  rawSnippet: "Hotel notes | double occupancy",
};
const warnB: ParseWarning = {
  severity: "warn",
  code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  message: "Ambiguous guest split.",
  rawSnippet: "2 guests, 1 room",
};
const infoC: ParseWarning = {
  severity: "info",
  code: "SCHEDULE_NOTE",
  message: "Informational.",
  rawSnippet: "call time moved",
};

describe("buildWizardWarningModel", () => {
  it("partitions by fingerprint and carries ORIGINAL indices", () => {
    const fpB = warningFingerprint(warnB);
    premiseHolds(
      "the fixture's ignored warning actually produces a fingerprint (a snippet-less " +
        "fixture could never partition, so the assertion below would pass vacuously)",
      typeof fpB === "string",
    );
    const model = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warnA, warnB, infoC],
      ignoredFingerprints: new Set([fpB as string]),
    });

    expect(model.ignored.map((i) => i.index)).toEqual([1]);
    expect(model.active.map((i) => i.index)).toEqual([0, 2]);
  });

  it("keeps a fingerprint-less warning active even when a colliding one is ignored", () => {
    // Same code + snippet content, but the second carries no rawSnippet at all,
    // so `warningFingerprint` returns null and no ignored-set membership can
    // ever match it. Fail toward VISIBLE.
    const snippetless: ParseWarning = {
      severity: "warn",
      code: warnA.code,
      message: warnA.message,
    };
    const fpA = warningFingerprint(warnA);
    premiseHolds("the ignorable twin fingerprints", typeof fpA === "string");
    premiseHolds("the snippet-less twin does not", warningFingerprint(snippetless) === null);

    const model = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warnA, snippetless],
      ignoredFingerprints: new Set([fpA as string]),
    });

    expect(model.ignored.map((i) => i.index)).toEqual([0]);
    expect(model.active.map((i) => i.index)).toEqual([1]);
  });

  it("returns an empty model for an empty warnings array", () => {
    expect(
      buildWizardWarningModel({
        reportScope: SCOPE,
        warnings: [],
        ignoredFingerprints: new Set(),
      }),
    ).toEqual({ active: [], ignored: [] });
  });

  it("stamps reportSurfaceId from the scope and the warning identity", () => {
    const fpB = warningFingerprint(warnB);
    const model = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warnA, warnB],
      ignoredFingerprints: new Set([fpB as string]),
    });

    // Expected values come from a SECOND DIRECT call to the production id
    // builder against the source warning — not from re-reading the model.
    expect(model.active[0]?.reportSurfaceId).toBe(buildReportSurfaceId(SCOPE, warnA));
    expect(model.ignored[0]?.reportSurfaceId).toBe(buildReportSurfaceId(SCOPE, warnB));
    // The scope must actually reach the id: a different scope yields a different id.
    premiseHolds(
      "the scope is load-bearing in the id (otherwise the assertion above cannot " +
        "distinguish a stamped scope from an ignored one)",
      buildReportSurfaceId("other-scope", warnA) !== buildReportSurfaceId(SCOPE, warnA),
    );
  });

  it("sends BOTH duplicate-fingerprint rows to ignored", () => {
    const dup: ParseWarning = { ...warnA };
    const fpA = warningFingerprint(warnA);
    const model = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warnA, dup],
      ignoredFingerprints: new Set([fpA as string]),
    });
    expect(model.ignored.map((i) => i.index)).toEqual([0, 1]);
    expect(model.active).toEqual([]);
  });
});

describe("normalizeStagedIgnoredWarnings", () => {
  it("strips each entry to exactly fingerprint, code and ignored_by", () => {
    const out = normalizeStagedIgnoredWarnings([
      { fingerprint: "fp-1", code: "UNKNOWN_FIELD", ignored_by: "doug@example.com" },
      {
        fingerprint: "fp-2",
        code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
        ignored_by: "doug@example.com",
        // An extra key that must NOT survive: the column is untrusted input and
        // the store is deterministic. A spread-through implementation fails here.
        note: "smuggled",
      },
    ]);

    expect(out).toEqual([
      { fingerprint: "fp-1", code: "UNKNOWN_FIELD", ignored_by: "doug@example.com" },
      { fingerprint: "fp-2", code: "HOTEL_GUEST_SPLIT_AMBIGUOUS", ignored_by: "doug@example.com" },
    ]);
    expect(Object.keys(out[1] as object).sort()).toEqual(["code", "fingerprint", "ignored_by"]);
  });

  it("returns an empty array for every non-array shape", () => {
    for (const raw of [null, undefined, {}, "[]", 7, true]) {
      expect(normalizeStagedIgnoredWarnings(raw)).toEqual([]);
    }
  });

  it("drops entries without a string fingerprint", () => {
    const out = normalizeStagedIgnoredWarnings([
      { code: "C", ignored_by: "a@b.co" },
      { fingerprint: 12, code: "C", ignored_by: "a@b.co" },
      { fingerprint: "", code: "C", ignored_by: "a@b.co" },
      null,
      "fp-loose",
      { fingerprint: "fp-keep", code: "C", ignored_by: "a@b.co" },
    ]);
    expect(out).toEqual([{ fingerprint: "fp-keep", code: "C", ignored_by: "a@b.co" }]);
  });

  it("coerces a missing or non-string code to the empty string", () => {
    expect(
      normalizeStagedIgnoredWarnings([{ fingerprint: "fp-1", ignored_by: "doug@example.com" }]),
    ).toEqual([{ fingerprint: "fp-1", code: "", ignored_by: "doug@example.com" }]);
  });

  it("DROPS an entry whose ignored_by cannot be canonicalized (whole-diff R1 P0)", () => {
    // The read side and the finalize carry have to agree on what a usable entry is.
    // While this coerced a missing identity to "", the read side HID the warning and
    // the carry — which cannot satisfy the durable table's canonical CHECK — dropped
    // it, so a dismissal the operator had seen confirmed came back after publishing
    // with nothing said. An entry that cannot become a durable row must not hide a
    // warning either.
    for (const raw of [{ fingerprint: "fp-1" }, { fingerprint: "fp-1", ignored_by: "   " }]) {
      expect(normalizeStagedIgnoredWarnings([raw])).toEqual([]);
    }
  });

  it("canonicalizes ignored_by on the way in", () => {
    expect(
      normalizeStagedIgnoredWarnings([
        { fingerprint: "fp-1", ignored_by: "  Doug.W@Example.COM " },
      ]),
    ).toEqual([{ fingerprint: "fp-1", code: "", ignored_by: "doug.w@example.com" }]);
  });
});

/**
 * Whole-diff R1 P1: the rail and the panel must count the SAME items.
 *
 * `wizardPanelCount` already exists so the heading and the rail share one predicate,
 * and its own comment says a rail and heading that disagree is the defect it prevents.
 * The discipline was applied to the function and not to its INPUTS: the panel counts
 * the items it actually renders (in-range only), while the rail subtracted the RAW
 * partition length. One stale out-of-range item is enough to make the two disagree,
 * and the operator sees a rail saying 0 over a panel showing 1.
 *
 * The reconciliation belongs to the model, so no caller can spell it differently.
 */
describe("reconcileWizardWarningItems", () => {
  const item = (index: number): WizardWarningItem => ({ index, reportSurfaceId: `s-${index}` });

  test("drops items addressing indices the warnings array does not have", () => {
    // The exact drift case: one live warning at 0, one stale ignored item at 7.
    expect(reconcileWizardWarningItems([item(0), item(7)], 1)).toEqual([item(0)]);
  });

  test("drops negative indices", () => {
    expect(reconcileWizardWarningItems([item(-1), item(0)], 1)).toEqual([item(0)]);
  });

  test("is identity when every index is addressable", () => {
    const partition = [item(0), item(1), item(2)];
    expect(reconcileWizardWarningItems(partition, 3)).toEqual(partition);
  });

  test("an empty warnings array reconciles every partition to empty", () => {
    // Guard case: a model built against a previous parse, paired with a row whose
    // re-scan removed every warning. Counting the stale partition here would show a
    // negative-clamped rail over an empty panel.
    expect(reconcileWizardWarningItems([item(0), item(1)], 0)).toEqual([]);
  });

  test("the reconciled count is the one that differs from the raw length", () => {
    // The bug was counting `.length` on the raw partition. This pins the DIFFERENCE:
    // if the reconciliation ever became identity, raw and reconciled would agree and
    // this fails — which is what makes it a test of the fix rather than of itself.
    const ignored = [item(0), item(7)];
    expect(ignored.length).toBe(2);
    expect(reconcileWizardWarningItems(ignored, 1).length).toBe(1);
  });
});

/**
 * Whole-diff R1 P0: a fingerprint can live in BOTH stores, and neither single store
 * is the right answer.
 *
 * The first repair chose `staged` on the reasoning that the durable route would delete
 * its own copy and leave the staged one still hiding the row. True — and exactly as true
 * the other way round. Picking either horn removes one copy, the enrichment union puts
 * the other one straight back, and the operator is told "Warning restored" about a
 * warning that is still hidden. Reported success that the very next read contradicts is
 * the silently-wrong case the spec's §1.1.7 posture forbids.
 *
 * Reachable without a race: dismiss a warning in the wizard (staged), then dismiss the
 * same warning on the published show page (durable). The published surface reads only
 * the durable table, so it offers Ignore on a row the wizard is already hiding.
 */
describe("dual-store ignore attribution", () => {
  // `rawSnippet` is what makes a warning fingerprintable — the suite above pins that a
  // snippet-less twin returns null — so this fixture carries one. Without it the premise
  // guard fires and every assertion below would have proved nothing.
  const warn: ParseWarning = {
    severity: "warn",
    code: "ROLE_TBD",
    message: "TBD role",
    rawSnippet: "A1 — TBD",
  };

  it("attributes a fingerprint held in both stores to BOTH, not to either one", () => {
    const fp = warningFingerprint(warn);
    premiseHolds("the fixture warning must fingerprint", fp !== null);
    const model = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warn],
      // The union, exactly as a linked row's enrichment builds it...
      ignoredFingerprints: new Set([fp as string]),
      // ...plus the two provenance sets it now also passes.
      stagedFingerprints: new Set([fp as string]),
      durableFingerprints: new Set([fp as string]),
    });
    expect(model.ignored).toHaveLength(1);
    expect(model.ignored[0]!.ignoreOrigin).toBe("both");
  });

  it("still attributes a staged-only fingerprint to staged", () => {
    const fp = warningFingerprint(warn) as string;
    const model = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warn],
      ignoredFingerprints: new Set([fp]),
      stagedFingerprints: new Set([fp]),
      durableFingerprints: new Set([fp]),
    });
    // Guard against a repair that simply renames every origin to "both": with the
    // fingerprint absent from the staged set the answer must go back to "show".
    const showOnly = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warn],
      ignoredFingerprints: new Set([fp]),
      stagedFingerprints: new Set<string>(),
      durableFingerprints: new Set([fp]),
    });
    // And a staged-only fingerprint must still say "staged", so the three-way split is
    // a real partition rather than "both whenever durable data is available".
    const stagedOnly = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warn],
      ignoredFingerprints: new Set([fp]),
      stagedFingerprints: new Set([fp]),
      durableFingerprints: new Set<string>(),
    });
    expect(stagedOnly.ignored[0]!.ignoreOrigin).toBe("staged");
    expect(model.ignored[0]!.ignoreOrigin).toBe("both");
    expect(showOnly.ignored[0]!.ignoreOrigin).toBe("show");
  });
});

/**
 * Whole-diff R3 P0: an UNRESOLVED durable read must not read as "not durable".
 *
 * The durable loader fails open to an empty set by design (§1.1.7, fail toward
 * VISIBLE), which is right for rendering: over-showing a warning is the safe error.
 * It is the wrong default the moment that same value ROUTES A MUTATION. With the
 * durable set empty because the read FAULTED, a genuine dual-store dismissal reads as
 * `staged`, the durable arm is never issued, and Un-ignore announces "Warning restored"
 * while the durable copy survives — so the warning comes back once the read recovers,
 * with no failure signal anywhere.
 *
 * So resolvedness is threaded, not inferred from emptiness, and an unresolved read
 * routes to `both`: issuing a delete against a store that holds nothing is a harmless
 * no-op, while skipping one that does is the data-visible bug.
 */
describe("unresolved durable read routes conservatively", () => {
  const warn2: ParseWarning = {
    severity: "warn",
    code: "ROLE_TBD",
    message: "TBD role",
    rawSnippet: "A1 — TBD",
  };

  it("treats a staged fingerprint as BOTH when the durable read did not resolve", () => {
    const fp = warningFingerprint(warn2);
    premiseHolds("the fixture warning must fingerprint", fp !== null);
    const model = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warn2],
      ignoredFingerprints: new Set([fp as string]),
      stagedFingerprints: new Set([fp as string]),
      // Empty AND unresolved — the exact shape a faulted loader produces.
      durableFingerprints: new Set<string>(),
      durableResolved: false,
    });
    expect(model.ignored[0]!.ignoreOrigin).toBe("both");
  });

  it("still says staged when the durable read RESOLVED and held nothing", () => {
    // The discrimination that makes the fix meaningful: same empty set, opposite
    // answer, decided by whether the read is trustworthy rather than by its size.
    const fp = warningFingerprint(warn2) as string;
    const model = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warn2],
      ignoredFingerprints: new Set([fp]),
      stagedFingerprints: new Set([fp]),
      durableFingerprints: new Set<string>(),
      durableResolved: true,
    });
    expect(model.ignored[0]!.ignoreOrigin).toBe("staged");
  });

  it("an unresolved read does not invent an origin for a show-only ignore", () => {
    // Nothing staged: there is no staged store to pair with, so the answer stays
    // `show` and the conservative widening cannot leak into unrelated rows.
    const fp = warningFingerprint(warn2) as string;
    const model = buildWizardWarningModel({
      reportScope: SCOPE,
      warnings: [warn2],
      ignoredFingerprints: new Set([fp]),
      stagedFingerprints: new Set<string>(),
      durableFingerprints: new Set<string>(),
      durableResolved: false,
    });
    expect(model.ignored[0]!.ignoreOrigin).toBe("show");
  });
});

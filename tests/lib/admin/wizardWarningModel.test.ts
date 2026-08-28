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
import { describe, expect, it } from "vitest";
import { premiseHolds } from "@/tests/_shared/premise";
import { warningFingerprint, buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";
import {
  buildWizardWarningModel,
  normalizeStagedIgnoredWarnings,
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

  it("coerces a missing or non-string code / ignored_by to the empty string", () => {
    expect(normalizeStagedIgnoredWarnings([{ fingerprint: "fp-1" }])).toEqual([
      { fingerprint: "fp-1", code: "", ignored_by: "" },
    ]);
  });
});

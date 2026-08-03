// Referential-integrity guard over the BL- backlog namespace.
//
// WHY THIS EXISTS. `BL-` ids are the repo's cross-document join key: plans,
// specs, handoffs, and structural tests all cite them to say "this decision is
// tracked." Nothing enforced that a cited id resolves to an entry anywhere, so
// the join key drifted silently — an id could be cited by a plan and defined in
// no ledger at all, and the only way to find out was to grep by hand.
//
// The failure this catches, concretely: an author writes "deferred, filed as
// BL-FOO-BAR" in a handoff, never adds the entry, and the reference reads as
// tracked work forever. That is worse than no reference, because it retires the
// thought. This guard makes the dangling citation fail at CI time instead.
//
// SCOPE. Definition-side is the BL--prefixed heading ids of the ledger files
// listed in LEDGERS. Citation-side is every `BL-` token in tracked `.md`/`.ts`/
// `.tsx` files except those in NOT_CITATIONS — chiefly this file, since scanning
// it would let KNOWN_DANGLING justify its own rows, the exact tautology the
// ratchet exists to prevent.
//
// This guard deliberately does NOT check field schemas or item shape. Those are
// a separate change: the ledgers have no universal field set today (across 43
// BACKLOG entries, Status appears on 34, Severity on 29, Class on 26, and ~20
// labels appear once), so a schema assertion would be a rewrite, not a guard.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ledgerIds, type ExtractOpts } from "./_ledgerMdast";

const ROOT = join(__dirname, "..", "..");

/** Same options the graduation guard uses for the backlog pair. */
const BACKLOG_OPTS: ExtractOpts = { requirePrefix: "BL-", levels: [2, 3] };

/**
 * Every file whose headings DEFINE a BL- id — the complete registry.
 *
 * There used to be a second one at `docs/superpowers/plans/BACKLOG.md`: 53
 * entries under the same `BL-` prefix, sharing exactly one id with this pair and
 * cross-referenced from neither side. It was merged into the root pair on
 * 2026-08-02 and deleted, because two registries under one namespace means a
 * citation has no single place to resolve — which is precisely what this guard
 * asserts. Keeping this list SHORT is the point: a new ledger file added here
 * should be a deliberate, reviewed decision, not a way to make a red run green.
 */
const LEDGERS = [
  "BACKLOG.md",
  "BACKLOG-archive.md",
  "DEFERRED.md",
  "DEFERRED-archive.md",
] as const;

/**
 * An id never ends in `-`. Allowing it would capture the head of a soft-wrapped
 * id (`BL-ADMIN-\nEYEBROW-…` -> `BL-ADMIN-`) and report a fragment as a distinct
 * dangling reference.
 */
const CITATION = /BL-[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?/g;

/**
 * Files excluded from the citation scan, each for a reason that would otherwise
 * make the guard lie:
 *  - this file, because KNOWN_DANGLING would justify its own rows;
 *  - the ledger-guard tests, because they build SYNTHETIC ledgers whose ids
 *    (`BL-X`, `BL-Y`, …) are fixtures, not references to real work.
 */
const NOT_CITATIONS = new Set([
  "tests/docs/_metaLedgerReferentialIntegrity.test.ts",
  "tests/docs/_ledgerMdast.walker.test.ts",
  "tests/docs/_metaDeferralLedgerGraduation.test.ts",
  "tests/docs/_ledgerMdast.ts",
]);

/**
 * Citations that resolve to no ledger entry, recorded at the time this guard
 * landed. Every row is debt, not an exemption: the id is either a real untracked
 * item that needs an entry, or prose that should stop looking like an id.
 *
 * Rows are removed, never added, unless the addition is deliberate and reviewed.
 * Two ratchets keep the list honest — a row that starts resolving fails as
 * stale, and a row nobody cites any more fails as dead.
 */
const KNOWN_DANGLING: Record<string, string> = {
  "BL-904":
    "cited in docs/superpowers/plans/2026-07-26-stripcomments-shared.md +2 more — no entry as of 2026-08-02",
  "BL-ADMIN-EYEBROW-FAINT-CONTRAST":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-ATTENTION-PILL-FOCUS-UNWIRED":
    "cited in docs/superpowers/plans/2026-07-24-attention-index.md — no entry as of 2026-08-02",
  "BL-AUTOAPPLIED-KINDDOT-NONCOLOR-TELL":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-B2UI":
    "cited in BACKLOG.md — no entry as of 2026-08-02",
  "BL-BLOCKRES-DISABLED-WIRING":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-BLOCKRES-ESCALATED-HELP":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-BLOCKRES-HELP-GATING":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-CASP2":
    "cited in docs/superpowers/plans/2026-07-19-spec-lint.md — no entry as of 2026-08-02",
  "BL-CASP2-POPOVER-PROXIMITY":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-CI-P3-FILE-GRANULAR-SERIAL":
    "cited in docs/superpowers/specs/ci/2026-07-20-ci-overlap-boot-with-setup.md — no entry as of 2026-08-02",
  "BL-CI-UNIT-SUITE-PHASE2":
    "cited in docs/superpowers/plans/2026-07-19-ci-unit-suite-under-5min/00-plan.md — no entry as of 2026-08-02",
  "BL-CLOSED-LOOP-FIX":
    "cited in docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md — no entry as of 2026-08-02",
  "BL-COLLAPSEPANEL-REGION-OPTOUT":
    "cited in DEFERRED-archive.md +1 more — no entry as of 2026-08-02",
  "BL-CRON-SYNTHETIC-SHOW-SKIP":
    "cited in lib/sync/runScheduledCronSync.ts +2 more — no entry as of 2026-08-02",
  "BL-DATAQUALITY-BADGE-SEGMENT-GLYPH":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-DATAQUALITY-BADGE-TOUCH-DETAIL":
    "cited in DEFERRED-archive.md +1 more — no entry as of 2026-08-02",
  "BL-DESTRUCT-FORK-FOCUS-TRANSFER":
    "cited in docs/superpowers/plans/admin/2026-07-25-destruct-thumb-order-drift-guard.md +1 more — no entry as of 2026-08-02",
  "BL-DRIVE-RESOLVED":
    "cited in docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md — no entry as of 2026-08-02",
  "BL-E2E-REPORT-MODAL-UNRUNNABLE":
    "cited in docs/superpowers/plans/2026-07-26-ci-dark-descoped-closeout/plan.md — no entry as of 2026-08-02",
  "BL-EVENT-DETAILS":
    "cited in docs/superpowers/plans/parser/2026-06-30-room-detail-unrendered.md +1 more — no entry as of 2026-08-02",
  "BL-FLOW4":
    "cited in docs/superpowers/plans/step3-onboarding/2026-07-16-mobile-autoapplied-parity.md +1 more — no entry as of 2026-08-02",
  "BL-FLOW4-BULK-UNDO-ERROR-SURFACE":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-FLOW4-CONFIRM-DANGER-STYLE":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-FLOW4-MOBILE-AUTOAPPLIED-PARITY":
    "cited in DEFERRED-archive.md +1 more — no entry as of 2026-08-02",
  "BL-HEADER-REACT-RECONCILE-HARNESS":
    "cited in tests/e2e/section-header-layout.layout.spec.ts — no entry as of 2026-08-02",
  "BL-HERO-SEGMENT-VIBRANCY":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-HOTEL-VIEWER-NAME-MATCH":
    "cited in BACKLOG-archive.md +7 more — no entry as of 2026-08-02",
  "BL-INTERNAL-CODE-ENUM-SCAN-WIDEN":
    "cited in docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md +1 more — no entry as of 2026-08-02",
  "BL-MOBILEPARITY-STRIP-HEADING-SIZE":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-MUTATION-COLUMN-SHIFT":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-MUTATION-LEDGER":
    "cited in BACKLOG-archive.md — no entry as of 2026-08-02",
  "BL-MUTATION-MERGED-CELL":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-MUTATION-REF-SUB":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-MUTATION-SECTION-ORDER":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-MUTATION-UNICODE":
    "cited in BACKLOG.md +1 more — no entry as of 2026-08-02",
  "BL-NAME":
    "cited in docs/superpowers/plans/admin/2026-07-17-casp2-strip-polish.md — no entry as of 2026-08-02",
  "BL-NEEDS-ATTENTION-HOLDS-ROLLUP":
    "cited in docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-mobile-needs-attention-design.md — no entry as of 2026-08-02",
  "BL-NEWTAB-DOUBLE-ANNOUNCE":
    "cited in docs/superpowers/specs/2026-08-01-announce-a11y-pass-design.md — no entry as of 2026-08-02",
  "BL-ONBOARDING-SCAN-EXPORT-HANG":
    "cited in tests/drive/fetch.test.ts — no entry as of 2026-08-02",
  "BL-OVERRIDE-CONTROL-ARIA-FIELD-QUALIFIER":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-OVERRIDE-ORPHAN-SALIENCE":
    "cited in DEFERRED-archive.md — no entry as of 2026-08-02",
  "BL-P4":
    "cited in docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md — no entry as of 2026-08-02",
  "BL-P5":
    "cited in docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md — no entry as of 2026-08-02",
  "BL-PARSER":
    "cited in BACKLOG-archive.md +2 more — no entry as of 2026-08-02",
  "BL-PARSER-ADDRESS-SPLIT-AMBIGUITY":
    "cited in docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md +3 more — no entry as of 2026-08-02",
  "BL-PARSER-HOTEL-INLINE-AMBIGUITY":
    "cited in docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md +3 more — no entry as of 2026-08-02",
  "BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL":
    "cited in docs/superpowers/plans/2026-07-27-inline-later-group-own-hotel/00-overview.md +5 more — no entry as of 2026-08-02",
  "BL-PG-CRON-HOST-ASSERTION":
    "cited in docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md — no entry as of 2026-08-02",
  "BL-PHANTOM-GAP-HAIRLINE-CROWDED-ROW":
    "cited in BACKLOG-archive.md +4 more — no entry as of 2026-08-02",
  "BL-REAL-ID":
    "cited in docs/superpowers/handoffs/2026-07-25-newtab-announcement-handoff.md — no entry as of 2026-08-02",
  "BL-RESOLVED":
    "cited in docs/audits/pr-38-217-bug-audit-2026-07-02.md — no entry as of 2026-08-02",
  "BL-RESYNC-STAGED-REVIEW-UI":
    "cited in docs/superpowers/plans/data-quality/2026-07-04-resync-quality-gate/00-plan.md +1 more — no entry as of 2026-08-02",
  "BL-ROOM-DETAIL":
    "cited in docs/superpowers/plans/parser/2026-06-30-room-detail-unrendered.md +1 more — no entry as of 2026-08-02",
  "BL-SHOWSTABLE-720-TITLE-FLOOR":
    "cited in docs/superpowers/plans/admin/2026-07-01-shows-720-title-floor.md +2 more — no entry as of 2026-08-02",
  "BL-STEP3-FULL-CREW-PREVIEW":
    "cited in docs/superpowers/specs/step3-onboarding/2026-06-23-onboarding-step3-review-redesign.md — no entry as of 2026-08-02",
  "BL-STRIPCOMMENTS":
    "cited in docs/superpowers/plans/2026-07-26-stripcomments-shared.md +1 more — no entry as of 2026-08-02",
  "BL-STRUCK":
    "cited in docs/superpowers/handoffs/2026-07-25-newtab-announcement-handoff.md — no entry as of 2026-08-02",
  "BL-SYNCFEED-UI-1":
    "cited in BACKLOG.md — no entry as of 2026-08-02",
  "BL-SYNCFEED-UI-2":
    "cited in BACKLOG.md — no entry as of 2026-08-02",
  "BL-SYNCFEED-UI-3":
    "cited in BACKLOG.md — no entry as of 2026-08-02",
  "BL-TEST":
    "cited in tests/log/_metaMutationSurfaceObservability.test.ts — no entry as of 2026-08-02",
  "BL-TRANSPORT-VIEWER-NAME-MATCH":
    "cited in lib/data/getShowForViewer.ts +3 more — no entry as of 2026-08-02",
  "BL-UNPUBLISH-TO-HELD":
    "cited in docs/superpowers/specs/step3-onboarding/2026-06-23-onboarding-step3-review-redesign.md — no entry as of 2026-08-02",
  "BL-VENUE-DEGRADED-TILE-LABEL":
    "cited in DEFERRED-archive.md +2 more — no entry as of 2026-08-02",
  "BL-VERSION-AMBIGUOUS-V1-OVERRIDE":
    "cited in docs/superpowers/specs/data-quality/2026-07-04-version-detection-confidence-gate-design.md — no entry as of 2026-08-02",
  "BL-WIZARD":
    "cited in docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M11.5-crew-auth-pivot.md — no entry as of 2026-08-02",
  "BL-X":
    "cited in docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md — no entry as of 2026-08-02",
};

type Cited = { id: string; files: string[] };

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", "*.md", "*.ts", "*.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter((f) => f !== "" && !NOT_CITATIONS.has(f));
}

function definedIds(): Set<string> {
  const ids = new Set<string>();
  for (const rel of LEDGERS) {
    for (const id of ledgerIds(readFileSync(join(ROOT, rel), "utf8"), BACKLOG_OPTS)) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * Prose routinely names a FAMILY of ids rather than one id — "the other
 * `BL-ADMIN-*` entries", "`BL-FLOW4-\*`". The citation regex stops at the `-`
 * before the glob, so the stem would be reported as its own dangling id.
 *
 * A match is a family reference, not a citation, when BOTH hold: the character
 * that follows it continues an id or opens a glob (`-`, `*`, `\`), AND the stem
 * is a strict prefix of at least one id that really exists. Requiring the
 * second condition is what keeps this from swallowing genuine typos — a stem
 * matching no real id stays dangling and still fails.
 */
export function isFamilyReference(text: string, end: number, stem: string, defined: Set<string>): boolean {
  const next = text.charAt(end);
  if (next !== "-" && next !== "*" && next !== "\\") return false;
  for (const id of defined) {
    if (id.length > stem.length && id.startsWith(stem)) return true;
  }
  return false;
}

/** id -> files citing it, across every tracked file but the excluded ones. */
function citedIds(files: readonly string[], defined: Set<string>): Map<string, string[]> {
  const cited = new Map<string, string[]>();
  for (const rel of files) {
    let text: string;
    try {
      text = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue; // deleted-but-tracked during a rebase; not this guard's business
    }
    for (const m of text.matchAll(CITATION)) {
      if (isFamilyReference(text, m.index + m[0].length, m[0], defined)) continue;
      const list = cited.get(m[0]);
      if (list) {
        if (!list.includes(rel)) list.push(rel);
      } else {
        cited.set(m[0], [rel]);
      }
    }
  }
  return cited;
}

/**
 * The unit under test, factored out so the fail-by-default property can be
 * exercised against a synthetic corpus rather than only against a repo that
 * currently passes.
 */
export function unresolved(
  cited: Map<string, string[]>,
  defined: Set<string>,
  known: Readonly<Record<string, string>>,
): Cited[] {
  const out: Cited[] = [];
  for (const [id, files] of cited) {
    if (defined.has(id)) continue;
    if (Object.prototype.hasOwnProperty.call(known, id)) continue;
    out.push({ id, files });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

describe("BL- referential integrity", () => {
  const files = trackedFiles();
  const defined = definedIds();
  const cited = citedIds(files, defined);

  it("every cited BL- id resolves to a ledger entry", () => {
    const bad = unresolved(cited, defined, KNOWN_DANGLING);
    const detail = bad
      .map((b) => `  ${b.id}\n${b.files.map((f) => `      ${f}`).join("\n")}`)
      .join("\n");
    expect(
      bad,
      bad.length === 0
        ? ""
        : `${bad.length} BL- id(s) are cited but defined in no ledger.\n` +
            `Add the entry to BACKLOG.md, or add a KNOWN_DANGLING row with a reason.\n${detail}`,
    ).toEqual([]);
  });

  it("no KNOWN_DANGLING row has started resolving", () => {
    const stale = Object.keys(KNOWN_DANGLING)
      .filter((id) => defined.has(id))
      .sort();
    expect(
      stale,
      `These ids now have ledger entries — delete their KNOWN_DANGLING rows: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("no KNOWN_DANGLING row has stopped being cited", () => {
    const dead = Object.keys(KNOWN_DANGLING)
      .filter((id) => !cited.has(id))
      .sort();
    expect(
      dead,
      `These ids are no longer cited anywhere — delete their KNOWN_DANGLING rows: ${dead.join(", ")}`,
    ).toEqual([]);
  });

  it("the ledger set actually yields ids (guards a silent parse regression)", () => {
    // A walker change that stopped extracting ids would make every assertion
    // above vacuously green. Pin a floor well below the real count.
    expect(defined.size).toBeGreaterThan(100);
  });

  describe("family-reference suppression", () => {
    const real = new Set(["BL-ADMIN-DASHBOARD-ROW-ACTIONS", "BL-ADMIN-EYEBROW"]);

    it("suppresses a glob over a stem that real ids extend", () => {
      const t = "bundles this with the other BL-ADMIN-* entries";
      expect(isFamilyReference(t, t.indexOf("-*") , "BL-ADMIN", real)).toBe(true);
      const esc = "the other BL-ADMIN-\\* entries";
      expect(isFamilyReference(esc, esc.indexOf("-\\*"), "BL-ADMIN", real)).toBe(true);
    });

    it("does NOT suppress a stem no real id extends — a typo must still fail", () => {
      const t = "see BL-ADMEN-* for details";
      expect(isFamilyReference(t, t.indexOf("-*"), "BL-ADMEN", real)).toBe(false);
    });

    it("does NOT suppress a bare mention, even of a real stem", () => {
      // "see BL-ADMIN status above" is an ambiguous reference, not a glob:
      // it names one item that does not exist, and must keep failing.
      const t = "see BL-ADMIN status above";
      expect(isFamilyReference(t, t.indexOf(" status"), "BL-ADMIN", real)).toBe(false);
    });

    it("does NOT suppress an exact id that merely prefixes a longer one", () => {
      // stem === a real id, but nothing longer extends it beyond itself
      expect(isFamilyReference("BL-ADMIN-EYEBROW-", 17, "BL-ADMIN-EYEBROW", real)).toBe(false);
    });
  });

  it("flags an unregistered citation (fail-by-default, synthetic)", () => {
    const synthetic = new Map<string, string[]>([
      ["BL-DEFINED-ELSEWHERE", ["docs/a.md"]],
      ["BL-ON-THE-DEBT-LIST", ["docs/b.md"]],
      ["BL-BRAND-NEW-DANGLER", ["docs/c.md"]],
    ]);
    const bad = unresolved(
      synthetic,
      new Set(["BL-DEFINED-ELSEWHERE"]),
      { "BL-ON-THE-DEBT-LIST": "debt" },
    );
    expect(bad.map((b) => b.id)).toEqual(["BL-BRAND-NEW-DANGLER"]);
    expect(bad[0]?.files).toEqual(["docs/c.md"]);
  });
});

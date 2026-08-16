import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AcceptedSurvivor } from "../source/ledger";

/**
 * The browser-mutant registry (spec §2).
 *
 * Enrollment is opt-in and explicit, exactly as the vitest mode's registry is
 * (`tests/mutation/source/registry.ts`): one row per surface, no discovery, no
 * inference from path or filename.
 *
 * The ONE structural difference is the operator family. A Playwright guard
 * suite's mutants are bespoke component edits no declared operator expresses, so
 * this mode's family is a CLOSED, hand-enumerated list of explicit edits per
 * surface — deliberately not a generic className/AST operator, because each
 * widening of a recognizer is a bigger target for the next review round
 * (spec §1.1.2).
 */
export type MutantEdit = {
  /** Repo-relative (or absolute) path of the file the edit targets. Must exist. */
  file: string;
  /** Exact source text to replace. MUST occur exactly once in `file`. */
  from: string;
  /** Replacement text. `""` expresses a removal. MUST differ from `from`. */
  to: string;
};

export type ExplicitMutant = {
  /** Surface-unique stable key; the ledger/site id is `explicit:<key>`. */
  key: string;
  /** 1..N substitutions applied together as ONE atomic mutant. */
  edits: MutantEdit[];
  /** What production defect this mutant isolates, with its origin citation. */
  reason: string;
};

export type DecidingSuite =
  | { kind: "playwright"; config: string; filter: string; project: string }
  | { kind: "vitest"; path: string };

export type BrowserGuardSurface = {
  id: string;
  /** All suites run per mutant; a mutant is KILLED if ANY suite rejects it. */
  suites: DecidingSuite[];
  mutants: ExplicitMutant[];
  /** Minimum acceptable mutation score, in (0, 1]. */
  scoreFloor: number;
  /** Liveness control: a hand-chosen edit the suites must obviously kill. */
  control: ExplicitMutant;
  accepted: AcceptedSurvivor[];
};

/**
 * The ledger/site id of an explicit mutant.
 *
 * CONTENT-anchored, not positional. The vitest mode derives ids from position so
 * that drift surfaces as a stale-plus-new pair
 * (`tests/mutation/source/operators.ts:42-47`); an explicit mutant's anchor is
 * the `from` text itself, so drift surfaces EARLIER and LOUDER — a `from` that
 * no longer occurs exactly once fails validation before any child spawns.
 */
export const browserSiteId = (mutant: { key: string }): string => `explicit:${mutant.key}`;

/** A `BACKLOG.md` / `DEFERRED.md` entry id, matching the repo-wide citation shape. */
const BACKLOG_REF = /^(BL|DEF)-[A-Z0-9]+(-[A-Z0-9]+)*$/;

/**
 * Per-edit anchor rules, applied to every mutant AND to the control.
 *
 * Zero occurrences is an unreachable mutant, two is an ambiguous anchor — both
 * authoring errors, and the same rule the vitest control anchor carries
 * (`tests/mutation/source/registry.ts:88-98`).
 */
function validateEdits(label: string, edits: readonly MutantEdit[], problems: string[]): void {
  if (edits.length === 0) {
    problems.push(`${label}: edits is empty; it mutates nothing`);
    return;
  }

  edits.forEach((edit, i) => {
    const where = `${label} edit ${i}`;
    if (edit.from === edit.to) {
      problems.push(`${where}: from and to are identical; it mutates nothing`);
    }
    if (!edit.file || !existsSync(edit.file)) {
      problems.push(`${where}: file does not exist on disk: ${edit.file}`);
      return;
    }
    // An empty `from` would make `split` report one occurrence per character
    // boundary; reject it as its own problem rather than as a count.
    if (edit.from === "") {
      problems.push(`${where}: from is empty; an empty anchor targets nothing`);
      return;
    }
    const occurrences = readFileSync(edit.file, "utf8").split(edit.from).length - 1;
    if (occurrences === 0) {
      problems.push(`${where}: from does not occur in ${edit.file}: ${JSON.stringify(edit.from)}`);
    } else if (occurrences > 1) {
      problems.push(
        `${where}: from occurs ${occurrences} times in ${edit.file}; ` +
          `an ambiguous anchor makes the edit's target unknowable, so it must occur exactly once`,
      );
    }
  });
}

function validateMutant(label: string, mutant: ExplicitMutant, problems: string[]): void {
  if (mutant.key.trim() === "") {
    problems.push(`${label}: key is empty; every mutant needs a stable site id`);
  }
  if (mutant.reason.trim() === "") {
    problems.push(`${label}: reason is empty; a mutant must name the defect it isolates`);
  }
  validateEdits(label, mutant.edits, problems);
}

/**
 * Static validation. Returns a list of problems; empty means valid.
 *
 * Every problem is reported — never short-circuited — because a validation
 * failure is a gate failure raised BEFORE any child spawns, and one problem per
 * run turns one ~25-minute run into N of them.
 *
 * The ledger checks below RESTATE rather than import the vitest mode's rules:
 * they live inline in `validateSurface` (`tests/mutation/source/registry.ts:100-138`)
 * with no exported seam, and extracting one would edit the vitest-mode registry,
 * which spec §10 fences off. The one rule that is NOT carried over is the
 * operator-prefix check, which has no meaning for a content-anchored
 * `explicit:<key>` id; its analogue — the row must name a mutant this surface
 * declares — replaces it.
 */
export function validateBrowserSurface(surface: BrowserGuardSurface): string[] {
  const problems: string[] = [];
  const id = surface.id;

  if (surface.suites.length === 0) {
    problems.push(`${id}: suites is empty; no suite can decide any verdict`);
  }
  for (const suite of surface.suites) {
    if (suite.kind === "vitest") {
      if (!existsSync(suite.path)) {
        problems.push(`${id}: vitest suite path does not exist: ${suite.path}`);
      }
      continue;
    }
    if (!existsSync(suite.config)) {
      problems.push(`${id}: playwright suite config does not exist: ${suite.config}`);
      continue;
    }
    // A filter resolving zero tests is the no-tests trap: every mutant would run
    // nothing and score SURVIVED. The baseline closes it at run time (spec §3.3
    // step 1); this closes it at authoring time, which is cheaper by ~25 minutes.
    const specDir = dirname(suite.config);
    const matches = readdirSync(specDir).filter((f) => f.includes(suite.filter));
    if (matches.length === 0) {
      problems.push(
        `${id}: playwright suite filter matches no spec file in ${specDir}: ${suite.filter}`,
      );
    }
  }

  if (surface.mutants.length === 0) {
    problems.push(`${id}: mutants is empty; the run would generate 0 mutants and score NaN`);
  }

  const seenKeys = new Set<string>();
  for (const mutant of surface.mutants) {
    if (seenKeys.has(mutant.key)) {
      problems.push(`${id}: duplicate mutant key: ${mutant.key}`);
    }
    seenKeys.add(mutant.key);
    validateMutant(`${id}: mutant ${mutant.key}`, mutant, problems);
  }

  validateMutant(`${id}: control ${surface.control.key}`, surface.control, problems);

  const floor = surface.scoreFloor;
  if (!Number.isFinite(floor) || floor <= 0 || floor > 1) {
    problems.push(`${id}: scoreFloor must be a finite number in (0, 1], got ${floor}`);
  }

  const declaredSites = new Set(surface.mutants.map(browserSiteId));
  const seenRows = new Set<string>();
  for (const row of surface.accepted) {
    if (seenRows.has(row.siteId)) problems.push(`${id}: duplicate ledger siteId: ${row.siteId}`);
    seenRows.add(row.siteId);

    if (!declaredSites.has(row.siteId)) {
      problems.push(
        `${id}: ledger row siteId names no mutant this surface declares: ${row.siteId}`,
      );
    }

    if (row.reason.trim() === "") {
      problems.push(`${id}: ledger row has an empty reason: ${row.siteId}`);
    }

    // Asymmetric on purpose, exactly as the vitest mode is: a deliberately
    // uncovered gap is debt and must be tracked; a proven equivalence is not.
    if (row.kind === "accepted-gap") {
      const ref = row.ref?.trim() ?? "";
      if (ref === "") {
        problems.push(`${id}: accepted-gap row requires a ref: ${row.siteId}`);
      } else if (!BACKLOG_REF.test(ref)) {
        problems.push(
          `${id}: accepted-gap ref must be a BL-*/DEF-* ledger id, got "${ref}" (${row.siteId})`,
        );
      }
    }
  }

  return problems;
}

const WIZARD = "components/admin/OnboardingWizard.tsx";
const TOOLTIP = "components/admin/HelpTooltip.tsx";
const SHEET = "components/admin/HelpSheet.tsx";
const NAV = "components/admin/nav/AdminNav.tsx";

/** The caret className both mounts carry, byte-identical (payload #9). */
const CARET_CLASS =
  'className="ml-1 inline-block size-4 shrink-0 transition-transform duration-normal group-open:rotate-90"';

/** The StepIndicator's two pill sites, whose radius must move TOGETHER (payload #6, #7). */
const PILL_BASE =
  '"flex size-7 shrink-0 items-center justify-center rounded-pill border text-xs font-semibold tabular-nums transition-colors duration-fast",';
const PILL_TARGET =
  '"group -m-2 flex size-tap-min shrink-0 cursor-pointer items-center justify-center rounded-pill",';

/**
 * Enrolled browser surfaces.
 *
 * NO DARK ROWS (spec §1.1.5): a surface is listed here only once the runner can
 * execute its mutants.
 *
 * The nineteen mutants below are not invented for this registry — each was
 * observed KILLING the tap-target guard during the step3-a11y arc and then
 * reverted by hand (`BACKLOG.md`, `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT`), and
 * each `reason` carries the commit it came from plus the failure line it drew.
 * That is what makes this list a closed operator family rather than a sample:
 * enrolling it converts nineteen hand-run probes into one machine-checked score.
 */
export const BROWSER_SURFACES: BrowserGuardSurface[] = [
  {
    id: "tapTargetFloor",
    // Vitest FIRST: it is seconds against a browser boot, and one mutant (#17,
    // the partial heading revert) is killed by it and by nothing in the
    // Playwright spec — without the vitest kind that mutant would enrol as a
    // guaranteed survivor (spec §1.1.5).
    suites: [
      { kind: "vitest", path: "tests/components/admin/wizard/Step3Review.test.tsx" },
      {
        kind: "playwright",
        config: "tests/e2e/standalone.config.ts",
        filter: "tap-target-floor",
        project: "standalone-chromium",
      },
    ],
    scoreFloor: 1,
    mutants: [
      {
        key: "drop-group-operator-error",
        edits: [
          {
            file: WIZARD,
            from: '<details className="group text-sm">',
            to: '<details className="text-sm">',
          },
        ],
        reason:
          "893793235: dropping `group` from OperatorErrorBlock's <details> drew " +
          "'caret did not rotate on open' — the group-open:* utilities resolve against nothing.",
      },
      {
        key: "strip-transition-helptooltip-visual",
        edits: [
          {
            file: TOOLTIP,
            from: "text-text-subtle transition-colors duration-fast group-hover:bg-surface",
            to: "text-text-subtle group-hover:bg-surface",
          },
        ],
        reason:
          "893793235: stripping `transition-colors duration-fast` from HelpTooltip's visual drew " +
          "'colour transition was retimed (got 0s)'.",
      },
      {
        key: "add-group-helptooltip-details",
        edits: [
          {
            file: TOOLTIP,
            from: 'className="inline-block list-none align-middle [&::-webkit-details-marker]:hidden',
            to: 'className="group inline-block list-none align-middle [&::-webkit-details-marker]:hidden',
          },
        ],
        reason:
          "893793235: adding `group` to HelpTooltip's <details> drew 'hovering the disclosed body " +
          "leaked color onto the trigger' — the ancestor must not carry it.",
      },
      {
        key: "strip-aria-label-brand",
        edits: [{ file: NAV, from: '          aria-label="FXAV Admin"\n', to: "" }],
        reason:
          "95e9eb4a7: deleting the brand link's aria-label drew 'brand link has no accessible name " +
          "at 320px' — both wordmark spans are display:none below 360px.",
      },
      {
        key: "relabel-aria-label-brand",
        edits: [{ file: NAV, from: 'aria-label="FXAV Admin"', to: 'aria-label="Dashboard"' }],
        reason:
          "06cc09ed1: relabelling to 'Dashboard' drew 'brand link name is empty or contradicts its " +
          'visible "FXAV" wordmark at 320px\' (WCAG 2.5.3).',
      },
      {
        key: "rounded-sm-both-pill-sites",
        // BOTH sites, one mutant: the guard's claim is that the visual and its
        // target stay EQUAL and non-zero, so a single-site edit is a different
        // mutant with a different failure line.
        edits: [
          { file: WIZARD, from: PILL_BASE, to: PILL_BASE.replace("rounded-pill", "rounded-sm") },
          {
            file: WIZARD,
            from: PILL_TARGET,
            to: PILL_TARGET.replace("rounded-pill", "rounded-sm"),
          },
        ],
        reason:
          "95e9eb4a7: `rounded-sm` on both pill sites drew 'pill 1 is no longer pill-shaped: " +
          "radius 6px on a 28px box' (and pill 2).",
      },
      {
        key: "rounded-14px-both-pill-sites",
        // Distinct from the row above: at 14px the 28px VISUAL stays circular
        // and only the 44px target squares off, so it isolates the target's own
        // radius assertion.
        edits: [
          {
            file: WIZARD,
            from: PILL_BASE,
            to: PILL_BASE.replace("rounded-pill", "rounded-[14px]"),
          },
          {
            file: WIZARD,
            from: PILL_TARGET,
            to: PILL_TARGET.replace("rounded-pill", "rounded-[14px]"),
          },
        ],
        reason:
          "cc9fcfe4d: `rounded-[14px]` on both drew 'pill 1 target is no longer pill-shaped: " +
          "radius 14px on a 44px box'.",
      },
      {
        key: "caret-nothing-drawable",
        // Tree drift, honoured rather than papered over: e9e80ec25 replaced the
        // `▸` TEXT caret with a lucide <ChevronRight> SVG, so the guard branches
        // on `isSvg ? drawable > 0 : text !== ""`
        // (tests/e2e/tap-target-floor.layout.spec.ts:970-988). The equivalent
        // mutant is "same box, same classes, nothing drawable": an empty <span>
        // keeps area, display, visibility, opacity and rotation valid and fails
        // only the branch the original mutant defeated.
        edits: [
          {
            file: WIZARD,
            from: `<ChevronRight\n              aria-hidden="true"\n              ${CARET_CLASS}\n            />`,
            to: `<span\n              aria-hidden="true"\n              ${CARET_CLASS}\n            />`,
          },
        ],
        reason:
          "95e9eb4a7: deleting only the caret's glyph drew 'operator-error caret renders no glyph'. " +
          "Reconstructed against the SVG caret e9e80ec25 introduced; verified locally before enrolment.",
      },
      {
        key: "text-transparent-both-carets",
        // Two files, byte-identical className: the substitution is file-scoped,
        // and each occurrence is unique WITHIN its own file.
        edits: [
          {
            file: WIZARD,
            from: CARET_CLASS,
            to: CARET_CLASS.replace("size-4 shrink-0", "size-4 shrink-0 text-transparent"),
          },
          {
            file: "components/admin/settings/AdministratorsSection.tsx",
            from: CARET_CLASS,
            to: CARET_CLASS.replace("size-4 shrink-0", "size-4 shrink-0 text-transparent"),
          },
        ],
        reason:
          "06cc09ed1: `text-transparent` on both carets drew 'caret text is fully transparent " +
          "(color rgba(0, 0, 0, 0))' on operator-error AND administrators. Lucide icons stroke with " +
          "currentColor, so the alpha read still kills it on the SVG caret.",
      },
      {
        key: "helpsheet-trigger-margin",
        edits: [
          {
            file: SHEET,
            from: 'className="group -m-2 inline-flex size-tap-min shrink-0 cursor-pointer items-center justify-center rounded-pill focus-visible:outline-none',
            to: 'className="group -m-1 inline-flex size-tap-min shrink-0 cursor-pointer items-center justify-center rounded-pill focus-visible:outline-none',
          },
        ],
        reason:
          "fc628f3e9: `-m-1` drew 'HelpSheet trigger horizontal margin box changed'. The " +
          "`cursor-pointer` token is what makes the anchor unique — the close button at :169 shares " +
          "the rest of the prefix.",
      },
      {
        key: "drop-items-center-steppill-target",
        edits: [
          {
            file: WIZARD,
            from: PILL_TARGET,
            to: PILL_TARGET.replace(
              "cursor-pointer items-center justify-center",
              "cursor-pointer justify-center",
            ),
          },
        ],
        reason:
          "fc628f3e9: dropping `items-center` from the split target drew 'pill 1 visual is not " +
          "vertically centred in its target'.",
      },
      {
        key: "relocate-cursor-pointer-helptooltip",
        // A remove-and-add pair: the token moves from the target to its inner
        // visual, which a single-edit mutant cannot express.
        edits: [
          {
            file: TOOLTIP,
            from: 'className="group -m-2 inline-flex size-tap-min shrink-0 cursor-pointer list-none items-center justify-center rounded-pill',
            to: 'className="group -m-2 inline-flex size-tap-min shrink-0 list-none items-center justify-center rounded-pill',
          },
          {
            file: TOOLTIP,
            from: 'className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-sm',
            to: 'className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-pill bg-surface-sunken text-sm',
          },
        ],
        reason:
          "fc628f3e9: relocating `cursor-pointer` to the inner span drew 'HelpTooltip trigger target " +
          "lost its pointer cursor'.",
      },
      {
        key: "narrow-transition-helptooltip-visual",
        edits: [
          {
            file: TOOLTIP,
            from: "text-text-subtle transition-colors duration-fast group-hover:bg-surface",
            to: "text-text-subtle transition-[background-color] duration-fast group-hover:bg-surface",
          },
        ],
        reason:
          "cc9fcfe4d: `transition-[background-color]` drew 'the visual span no longer transitions " +
          "color (got background-color)' — narrowing the property, distinct from removing it.",
      },
      {
        key: "topbar-gap-collapse",
        edits: [
          {
            file: NAV,
            from: 'className="mb-4 flex items-center gap-3 border-b border-border pb-3"',
            to: 'className="mb-4 flex items-center gap-0 border-b border-border pb-3"',
          },
        ],
        reason:
          "cc9fcfe4d: the `gap-3 -> gap-0` overlap mutant, the one already machine-observed in the " +
          "BACKLOG probe block — it kills exactly its own case per container " +
          "(BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE).",
      },
      {
        key: "narrow-transition-steppill-base",
        edits: [
          {
            file: WIZARD,
            from: 'tabular-nums transition-colors duration-fast",',
            to: 'tabular-nums transition-[background-color] duration-fast",',
          },
        ],
        reason:
          "e88e7e0f6: the pill's `transition-[background-color]` drew 'the visual span lost its " +
          "colour transition (got background-color)' — the second substring-matcher site.",
      },
      {
        key: "drop-justify-center-helpsheet-visual",
        edits: [
          {
            file: SHEET,
            from: 'className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface-sunken align-middle',
            to: 'className="inline-flex size-7 shrink-0 items-center rounded-pill bg-surface-sunken align-middle',
          },
        ],
        reason:
          "e88e7e0f6: dropping `justify-center` from the trigger's VISUAL drew 'HelpSheet trigger " +
          "glyph is not horizontally centred in its visual'.",
      },
      {
        key: "partial-heading-revert",
        // The one mutant killed by the VITEST suite and by nothing in the
        // Playwright spec (tests/components/admin/wizard/Step3Review.test.tsx:809-813).
        // Reverting ONE of the two promoted headings leaves h1, h2, h3 — a
        // monotonic outline that a "no skipped levels" check would accept.
        edits: [
          {
            file: "components/admin/wizard/Step3Review.tsx",
            from: '<h2 className="text-sm font-semibold text-text-subtle">\n          {heading} <span className="tabular-nums text-text-faint">({rows.length})</span>\n        </h2>',
            to: '<h3 className="text-sm font-semibold text-text-subtle">\n          {heading} <span className="tabular-nums text-text-faint">({rows.length})</span>\n        </h3>',
          },
        ],
        reason:
          "e88e7e0f6: the partial heading revert drew 'the grouped-rows section heading is not an " +
          'h2: expected "H3" to be "H2"\'.',
      },
      {
        key: "w-fit-strip-five-summaries",
        // FIVE sites on the current tree, not the six the BACKLOG prose records:
        // e9e80ec25 moved the administrators summary to `flex w-full`, and the
        // guard now asserts that mount INVERTED by name (DI2_FULL_WIDTH_BY_DESIGN,
        // tests/e2e/tap-target-floor.layout.spec.ts:86), so applying `w-fit`
        // there would fail a different assertion and is a different mutant.
        // HelpAffordance:111 is deliberately NOT stripped — it is the Learn-more
        // link, not a <summary>, and sits outside the guard's scope.
        edits: [
          {
            file: "components/admin/HelpAffordance.tsx",
            from: 'className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center underline-offset-2',
            to: 'className="inline-flex min-h-tap-min cursor-pointer list-none items-center underline-offset-2',
          },
          {
            file: WIZARD,
            from: 'className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center font-medium"',
            to: 'className="inline-flex min-h-tap-min cursor-pointer list-none items-center font-medium"',
          },
          {
            file: "components/messages/ErrorExplainer.tsx",
            from: 'className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center"',
            to: 'className="inline-flex min-h-tap-min cursor-pointer list-none items-center"',
          },
          {
            file: "app/me/meShowSections.tsx",
            from: 'className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center text-xs',
            to: 'className="inline-flex min-h-tap-min cursor-pointer list-none items-center text-xs',
          },
          {
            file: "components/crew/primitives/RunOfShowList.tsx",
            from: "className={`inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center text-sm",
            to: "className={`inline-flex min-h-tap-min cursor-pointer list-none items-center text-sm",
          },
        ],
        reason:
          "0bce8e51c: stripping `w-fit` from the Class-A summaries drew 'help-affordance summary " +
          "dropped the spec-required w-fit token'. Verified locally as a FIVE-site mutant before " +
          "enrolment; DI-2's width comparison still passes under it, which is why the token pin exists.",
      },
      {
        key: "delete-transition-steppill-base",
        // Distinct from the narrowing row: removing the utility lets the
        // property compute to the CSS `all` default, which the PRE-repair
        // matcher accepted — so this mutant isolates the repair itself.
        edits: [
          {
            file: WIZARD,
            from: 'tabular-nums transition-colors duration-fast",',
            to: 'tabular-nums",',
          },
        ],
        reason:
          "50f2478e1: deleting `transition-colors duration-fast` from the pill's base drew 'the " +
          "visual span lost its colour transition (got all)'.",
      },
    ],
    // Liveness control, disjoint from every mutant site above: the HelpSheet
    // CLOSE button carries the tap floor as `size-tap-min` (probed 2026-08-15),
    // and the 44px floor assertions cover it, so stripping the token is an edit
    // the suite must obviously notice.
    control: {
      key: "control-helpsheet-close-tap-floor",
      edits: [
        {
          file: SHEET,
          from: "size-tap-min shrink-0 items-center justify-center rounded-sm",
          to: "shrink-0 items-center justify-center rounded-sm",
        },
      ],
      reason:
        "Overlay-liveness control: the HelpSheet close button falls below the 44px floor. A harness " +
        "whose overlay silently failed would report a perfect score with every other gate condition " +
        "still passing, so this edit must be killed on every run.",
    },
    accepted: [],
  },
];

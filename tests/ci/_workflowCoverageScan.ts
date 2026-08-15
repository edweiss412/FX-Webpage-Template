/**
 * tests/ci/_workflowCoverageScan.ts
 *
 * Pure scanner for the e2e workflow-coverage meta-test (spec
 * 2026-07-24-archive-row-menu-idiom §6 item 6). Answers: which
 * tests/e2e/*.spec.ts paths are invoked by an AUTOMATIC, PR-BLOCKING-CAPABLE
 * workflow run?
 *
 * An invocation COUNTS only when ALL hold:
 *   - the workflow declares a `pull_request` trigger (workflow_dispatch-only
 *     and push-only are post-merge/manual discovery, not a PR gate);
 *   - the workflow has NO `pull_request.paths` or `paths-ignore` filter (either form
 *     is a filter: the job does not run on every PR. An enumerated filter
 *     that fires on the spec file but not on production dependencies is the
 *     documented dark-path hole — spec R12-R16);
 *   - neither the job head nor the RUN STEP itself carries `if:` or
 *     `continue-on-error` — a diagnostic SIBLING step (`if: failure()` trace
 *     upload, present in every real e2e workflow here) must NOT disqualify;
 *   - the run command does not suppress the exit code (`|| true`, `; exit 0`,
 *     a trailing status-swallowing pipe).
 * Commands are resolved transitively through package.json scripts (`pnpm
 * test:e2e:*`-style aliases carry the real spec list).
 *
 * Regex-on-YAML is deliberate and TESTED in the meta-test's self-suite (the
 * _rowWrapperScan lesson: a scanner that silently matches nothing is worse
 * than none).
 */

import { parse, stringify } from "yaml";

const SPEC_RE = /tests\/e2e\/[\w.-]+\.spec\.ts/g;

/**
 * Canonicalize YAML before any regex sees it (R6 structural defense): parse
 * with the same library the census trusts, re-stringify in plain block
 * style with folding OFF (lineWidth: 0 — folding a long run command would
 * split tokens across lines and silently un-cover live specs). Quoted keys,
 * tags, anchors/aliases, explicit keys, flow mappings, and comments all
 * collapse to the canonical spelling the line-anchored regexes actually
 * read — the whole spelling class dies at the door instead of being
 * enumerated (spec §7 R3–R6 chased five probe-backed instances; the
 * calibration rule says ship the structure, not round seven). Returns null
 * when the text does not parse — an unparseable workflow never runs on
 * GitHub either, so the caller treats it as claim-nothing (safe-dark) or
 * poison (manifests). stringify re-emits anchors only for genuinely shared
 * nodes, which the anchor belt then refuses — fail-closed both ways.
 */
/**
 * The ONE composite-manifest validator both guard layers use (R8): the layers
 * had drifted — the scanner checked `using:`/`steps:` textually, the census
 * only `Array.isArray(steps)` — and twelve step shapes escaped one or both.
 * GitHub's runner schema (src/Runner.Worker/action_yaml.json) requires
 * `runs.using === "composite"` and `runs.steps` to be a sequence of run-steps
 * (`run` + `shell`, both non-empty strings) or uses-steps (non-empty `uses`,
 * NO `shell`), never both and never neither, with only known step keys. An
 * invalid manifest fails the job AT THE USE SITE, so downstream steps never
 * run — reading one as a clean composite is false coverage. Returns the
 * validated steps, or null meaning OPAQUE (caller poisons fail-closed).
 */
export type ActionStep = {
  run?: unknown;
  uses?: unknown;
  if?: unknown;
  shell?: unknown;
  env?: unknown;
};
/**
 * NARROW-ACCEPT profile (R9). The R8 version was a blacklist — it rejected
 * enumerated defects and accepted whatever it had not thought of, so each
 * round produced another accepted-but-invalid shape (extra `runs` keys,
 * `with` on a run step, mapping-valued `name`/`id`/`if`/`env`/`with`, …).
 * This version inverts the burden: a manifest is walkable ONLY if it matches
 * this exact profile — the key sets are per-step-kind allowlists and every
 * value must be a scalar of the declared shape. Anything else, VALID OR NOT,
 * is opaque and poisons fail-closed. That terminates the enumeration: there
 * is no "accepted but invalid" left to find, only "refused but valid", which
 * costs a reasoned allowlist row and never false coverage.
 */
const RUNS_KEYS = new Set(["using", "steps"]);
const RUN_STEP_KEYS = new Set([
  "name",
  "id",
  "if",
  "run",
  "shell",
  "working-directory",
  "env",
  "continue-on-error",
]);
const USES_STEP_KEYS = new Set(["name", "id", "if", "uses", "with", "env", "continue-on-error"]);
const nonEmptyString = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";
/**
 * The ONE `uses:` shape classifier (R10). GitHub requires a remote ref to be
 * `{owner}/{repo}[/path]@{ref}`. As shipped (R10-R14) this accepts exactly
 * two shapes: a local `./…` ref, and a pinned `owner/repo[/path]@ref` whose
 * ref passes the narrow well-formed allowlist (or is a 40-hex SHA).
 * Everything else — refless remotes, the whole `docker://` family, and
 * Git-invalid refs — is INVALID, so callers poison fail-closed (spec §5 L8).
 */
/**
 * The ONE `runs-on` validator both layers use (R17). R16 shipped textual /
 * shape-counting heuristics in each layer separately, and the next round
 * produced numeric scalars, sequences with non-string members, and
 * group/labels mappings with wrong-typed or extra keys — all accepted,
 * none schedulable. GitHub permits exactly: a non-empty string, a non-empty
 * sequence of non-empty strings, or a mapping whose keys are a non-empty
 * subset of {group, labels} with a non-empty string `group` and a `labels`
 * that is a non-empty string or a non-empty array of non-empty strings.
 * Narrow ACCEPT, typed (not textual): anything else is unschedulable, so
 * the job's steps never run and any claim from them is false coverage.
 */
/**
 * The ONE workflow-shape validator both layers use (R19). The narrow-accept
 * profile had covered composite MANIFESTS but not workflow FILES, so unknown
 * root/job/step keys, `with:` on a run step, and non-numeric timeouts all
 * classified cleanly although GitHub rejects the file and runs nothing.
 * Same posture as `validatedCompositeSteps`: key allowlists per mapping and
 * typed values; anything off-profile is unschedulable, so the file claims
 * nothing (scanner) and its blocks start poisoned (census).
 */
/**
 * Workflow shape as a TYPE TABLE (R21). R19 shipped key allowlists and R20
 * added per-kind sets, but each round still found values that passed
 * unvalidated (sequence-valued `name`, `concurrency`, `permissions`,
 * `continue-on-error`; empty or numeric `run`/`uses`; out-of-range
 * timeouts). Enumerating those one round at a time is the losing game this
 * arc retired for manifests at R9, so the burden is inverted here too:
 * EVERY key of every mapping we walk declares a type predicate, and a key
 * whose value fails its predicate — or a key with no entry at all — makes
 * the file unschedulable. There is no "unvalidated key" left by
 * construction; the residue is refused-but-valid (spec §5 L9), never
 * accepted-but-invalid.
 */
type Pred = (v: unknown) => boolean;
const str: Pred = (v) => nonEmptyString(v);
const strOrBool: Pred = (v) => typeof v === "boolean" || nonEmptyString(v);
const mapping: Pred = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const strOrMapping: Pred = (v) => nonEmptyString(v) || mapping(v);
const strOrSeqOrMapping: Pred = (v) =>
  nonEmptyString(v) || mapping(v) || (Array.isArray(v) && v.length > 0);
const strOrSeq: Pred = (v) =>
  nonEmptyString(v) || (Array.isArray(v) && v.every((x) => nonEmptyString(x)));
/** GitHub: a positive integer of at most 360 minutes. */
const timeout: Pred = (v) => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 360;
const scalars: Pred = (v) => scalarMap(v);

/**
 * Nested tables (R22): `mapping`/`strOrMapping` validated only the OUTER
 * container, so `permissions: {contents: bogus}`, a keyless `concurrency`,
 * an unknown `strategy` key, and similar nested junk still passed. The same
 * inversion applies one level down — each container key declares the shape
 * of its CONTENTS, and anything else makes the file unschedulable.
 */
const PERM_LEVELS = new Set(["read", "write", "none"]);
const PERM_SCOPES = new Set([
  "actions",
  "attestations",
  "checks",
  "contents",
  "deployments",
  "discussions",
  "id-token",
  "issues",
  "models",
  "packages",
  "pages",
  "pull-requests",
  "repository-projects",
  "security-events",
  "statuses",
]);
const permissions: Pred = (v) =>
  v === "read-all" ||
  v === "write-all" ||
  (mapping(v) &&
    Object.entries(v as Record<string, unknown>).every(
      ([k, x]) => PERM_SCOPES.has(k) && typeof x === "string" && PERM_LEVELS.has(x),
    ));
const concurrency: Pred = (v) =>
  nonEmptyString(v) ||
  (mapping(v) &&
    typedShape(v as Record<string, unknown>, {
      group: str,
      "cancel-in-progress": strOrBool,
    }));
const strategy: Pred = (v) =>
  mapping(v) &&
  typedShape(v as Record<string, unknown>, {
    matrix: (x) => mapping(x) || nonEmptyString(x),
    "fail-fast": strOrBool,
    "max-parallel": (x) => typeof x === "number" || nonEmptyString(x),
  });
const environment: Pred = (v) =>
  nonEmptyString(v) ||
  (mapping(v) && typedShape(v as Record<string, unknown>, { name: str, url: str }));
const services: Pred = (v) =>
  mapping(v) &&
  Object.values(v as Record<string, unknown>).every(
    (svc) =>
      mapping(svc) &&
      typedShape(svc as Record<string, unknown>, {
        image: str,
        credentials: scalars,
        env: scalars,
        ports: (x) => Array.isArray(x),
        volumes: (x) => Array.isArray(x),
        options: str,
      }),
  );
/** GitHub workflow events this guard models; anything else is unschedulable
 *  for our purposes and refused (narrow accept, spec §5 L9). */
const KNOWN_EVENTS = new Set([
  "pull_request",
  "pull_request_target",
  "push",
  "schedule",
  "workflow_dispatch",
  "workflow_call",
  "workflow_run",
  "merge_group",
  "release",
  "issues",
  "issue_comment",
  "create",
  "delete",
  "fork",
  "watch",
  "repository_dispatch",
  "registry_package",
  "check_run",
  "check_suite",
  "deployment",
  "deployment_status",
  "discussion",
  "discussion_comment",
  "label",
  "milestone",
  "page_build",
  "project",
  "project_card",
  "project_column",
  "public",
  "pull_request_review",
  "pull_request_review_comment",
  "status",
  "gollum",
]);
/**
 * Per-EVENT config tables (R29). A single 12-key union accepted
 * `workflow_dispatch.branches` and `workflow_dispatch.inputs: 7` — GitHub
 * permits only an `inputs` MAPPING there, and an invalid trigger config
 * stops the workflow running. Each event declares its own keys and value
 * shapes; an event with no entry accepts only `types`.
 */
const strSeq: Pred = (v) => Array.isArray(v) && v.every((x) => nonEmptyString(x));
const FILTERS: Record<string, Pred> = {
  types: strSeq,
  branches: strSeq,
  "branches-ignore": strSeq,
  tags: strSeq,
  "tags-ignore": strSeq,
  paths: strSeq,
  "paths-ignore": strSeq,
};
const EVENT_CFG: Record<string, Record<string, Pred>> = {
  pull_request: {
    types: FILTERS.types!,
    branches: FILTERS.branches!,
    "branches-ignore": FILTERS["branches-ignore"]!,
    paths: FILTERS.paths!,
    "paths-ignore": FILTERS["paths-ignore"]!,
  },
  pull_request_target: {
    types: FILTERS.types!,
    branches: FILTERS.branches!,
    "branches-ignore": FILTERS["branches-ignore"]!,
    paths: FILTERS.paths!,
    "paths-ignore": FILTERS["paths-ignore"]!,
  },
  push: {
    branches: FILTERS.branches!,
    "branches-ignore": FILTERS["branches-ignore"]!,
    tags: FILTERS.tags!,
    "tags-ignore": FILTERS["tags-ignore"]!,
    paths: FILTERS.paths!,
    "paths-ignore": FILTERS["paths-ignore"]!,
  },
  workflow_dispatch: { inputs: mapping },
  workflow_call: { inputs: mapping, outputs: mapping, secrets: mapping },
  workflow_run: {
    workflows: strSeq,
    types: FILTERS.types!,
    branches: FILTERS.branches!,
    "branches-ignore": FILTERS["branches-ignore"]!,
  },
};
const DEFAULT_EVENT_CFG: Record<string, Pred> = { types: FILTERS.types! };

/** `on`: an event name, a list of them, or a mapping of event -> null|config. */
const onTrigger: Pred = (v) =>
  nonEmptyString(v) ||
  (Array.isArray(v) && v.length > 0 && v.every((x) => nonEmptyString(x))) ||
  (mapping(v) &&
    Object.entries(v as Record<string, unknown>).every(
      // `schedule:` is a SEQUENCE of cron mappings, not a mapping — the
      // live x-audits/dev-gate/mutation-harness/screenshots-drift
      // workflows carry it, and the live-tree tripwire caught the
      // over-refusal immediately.
      ([k, cfg]) =>
        KNOWN_EVENTS.has(k) &&
        (cfg === null ||
          (k === "schedule"
            ? Array.isArray(cfg) &&
              cfg.length > 0 &&
              cfg.every(
                (x) =>
                  mapping(x) &&
                  Object.keys(x as Record<string, unknown>).every((ek) => ek === "cron") &&
                  nonEmptyString((x as { cron?: unknown }).cron),
              )
            : mapping(cfg) &&
              typedShape(cfg as Record<string, unknown>, EVENT_CFG[k] ?? DEFAULT_EVENT_CFG))),
    ));

const WF_ROOT: Record<string, Pred> = {
  name: str,
  "run-name": str,
  on: onTrigger,
  env: scalars,
  defaults: mapping,
  concurrency: concurrency,
  permissions: permissions,
  jobs: mapping,
};
const WF_STEPS_JOB: Record<string, Pred> = {
  name: str,
  needs: strOrSeq,
  if: strOrBool,
  // Presence is required below; the VALUE is validated by the dedicated
  // `validRunsOn` gate so the refusal reports its own precise reason
  // rather than a generic schema rejection (R16/R17 fixtures pin that).
  "runs-on": () => true,
  environment: environment,
  concurrency: concurrency,
  outputs: scalars,
  env: scalars,
  defaults: mapping,
  steps: (v) => Array.isArray(v),
  "timeout-minutes": timeout,
  strategy: strategy,
  "continue-on-error": strOrBool,
  container: strOrMapping,
  services: services,
  permissions: permissions,
};
const WF_USES_JOB: Record<string, Pred> = {
  name: str,
  needs: strOrSeq,
  if: strOrBool,
  // A reusable-workflow ref: a local `./…​.yml` path or `owner/repo/path@ref`.
  // R27: a reusable workflow lives at `.github/workflows/<name>.yml` — not
  // elsewhere in the repo, not nested below that directory — and a remote
  // one carries a ref the shared classifier accepts.
  uses: (v) => {
    if (typeof v !== "string") return false;
    const s = v.trim();
    if (/^\.\/\.github\/workflows\/[\w.-]+\.ya?ml$/.test(s)) return true;
    const m = /^([\w.-]+\/[\w.-]+)\/\.github\/workflows\/[\w.-]+\.ya?ml@(.+)$/.exec(s);
    return m !== null && usesKind(`${m[1]}/x@${m[2]}`) === "remote";
  },
  with: scalars,
  secrets: (v) => v === "inherit" || scalars(v),
  strategy: strategy,
  concurrency: concurrency,
  permissions: permissions,
};
const WF_RUN_STEP: Record<string, Pred> = {
  name: str,
  id: str,
  if: strOrBool,
  run: str,
  shell: str,
  "working-directory": str,
  env: scalars,
  "continue-on-error": strOrBool,
  "timeout-minutes": timeout,
};
const WF_USES_STEP: Record<string, Pred> = {
  name: str,
  id: str,
  if: strOrBool,
  uses: str,
  with: scalars,
  env: scalars,
  "continue-on-error": strOrBool,
  "timeout-minutes": timeout,
};
/** Every present key must have an entry AND satisfy its predicate. */
function typedShape(obj: Record<string, unknown>, table: Record<string, Pred>): boolean {
  return Object.entries(obj).every(([k, v]) => table[k] !== undefined && table[k]!(v));
}
/** GitHub job IDs: start with a letter or _, then alphanumerics, - or _. */
const JOB_ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export function validWorkflowShape(doc: unknown): boolean {
  if (!mapping(doc)) return false;
  const root = doc as Record<string, unknown>;
  if (!typedShape(root, WF_ROOT)) return false;
  const jobs = root.jobs;
  if (!mapping(jobs)) return false;
  for (const [jobId, job] of Object.entries(jobs as Record<string, unknown>)) {
    if (!JOB_ID_RE.test(jobId)) return false;
    if (!mapping(job)) return false;
    const j = job as Record<string, unknown>;
    const hasSteps = "steps" in j;
    const hasUses = "uses" in j;
    if (hasSteps === hasUses) return false; // a job is one kind or the other
    if (!typedShape(j, hasSteps ? WF_STEPS_JOB : WF_USES_JOB)) return false;
    if (hasUses) continue;
    // `runs-on` presence AND value are owned by the dedicated gate, which
    // reports the precise reason; a steps job missing it is refused there.
    for (const step of j.steps as unknown[]) {
      if (!mapping(step)) return false;
      const s = step as Record<string, unknown>;
      const hasRun = "run" in s;
      const hasStepUses = "uses" in s;
      if (hasRun === hasStepUses) return false;
      if (!typedShape(s, hasRun ? WF_RUN_STEP : WF_USES_STEP)) return false;
    }
  }
  return true;
}

export function validRunsOn(v: unknown): boolean {
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v))
    return v.length > 0 && v.every((x) => typeof x === "string" && x.trim() !== "");
  if (v === null || typeof v !== "object") return false;
  const keys = Object.keys(v as Record<string, unknown>);
  if (keys.length === 0 || !keys.every((k) => k === "group" || k === "labels")) return false;
  const { group, labels } = v as { group?: unknown; labels?: unknown };
  if ("group" in (v as object) && !(typeof group === "string" && group.trim() !== "")) return false;
  if ("labels" in (v as object)) {
    const ok =
      (typeof labels === "string" && labels.trim() !== "") ||
      (Array.isArray(labels) &&
        labels.length > 0 &&
        labels.every((x) => typeof x === "string" && x.trim() !== ""));
    if (!ok) return false;
  }
  return true;
}

export type UsesKind = "local" | "remote" | "invalid";
export function usesKind(v: unknown): UsesKind {
  if (typeof v !== "string") return "invalid";
  const s = v.trim();
  if (s.startsWith("./")) return "local";
  // docker:// is refused WHOLESALE (R13). R12 replaced a `\S+` check with a
  // hand-written image grammar, and the next round produced four more forms
  // Docker rejects (hyphen-edged registry labels, >128-char tags, >255-char
  // repository paths, bare 64-hex names) — each an invalid reference whose
  // failed pull kills the job, so trusting it was false coverage. Docker's
  // reference grammar is its own specification with length and character
  // rules; re-implementing it here is the losing game this arc has retired
  // twice already. Zero live workflows use docker:// (calibrated), so the
  // whole family is opaque: it poisons fail-closed and costs a reasoned
  // allowlist row if one ever appears (spec §5 L8).
  // Remote GitHub actions: `owner/repo[/path]@ref` with a NARROW ref
  // allowlist (R14). The previous character class admitted Git-INVALID refs
  // — `..`, leading/trailing/repeated slashes, dot-leading components,
  // `.lock` suffixes, a terminal dot — each unresolvable, so the action
  // step fails before the claimed downstream test runs. Rather than
  // re-implement git-check-ref-format (the same losing game the docker
  // grammar just cost two rounds), accept only the shape this repo uses and
  // that no ref rule can reject: a tag/branch of alphanumerics, dots,
  // hyphens and underscores starting alphanumeric, with no `..`, no
  // trailing dot, and no `.lock` ending — or a full 40-hex SHA. A valid but
  // slash-bearing ref (`release/v1`) is REFUSED: conservative, documented
  // in spec §5 L8, and zero live refs use one (live set: v1, v4, v7).
  // R27: validate the COORDINATE segment by segment — `owner./repo`,
  // `owner/..`, and `owner/repo//` all passed a lax character class while
  // GitHub cannot resolve any of them.
  const at = s.lastIndexOf("@");
  const m = at > 0 ? ([s.slice(0, at), s.slice(at + 1)] as const) : null;
  if (m) {
    const segs = m[0].split("/");
    const segOk = (x: string) =>
      /^[A-Za-z0-9._-]+$/.test(x) && x !== "." && x !== ".." && !x.endsWith(".");
    const ref = m[1]!;
    if (segs.length < 2 || !segs.every(segOk)) return "invalid";
    const wellFormed =
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref) &&
      !ref.includes("..") &&
      !ref.endsWith(".") &&
      !ref.endsWith(".lock");
    if (wellFormed) return "remote";
  }
  return "invalid";
}
/** A scalar map (env/with): non-empty string keys, scalar values only. */
const scalarMap = (v: unknown): boolean => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k.trim() === "") return false;
    if (val !== null && typeof val === "object") return false;
  }
  return true;
};
/** R30: `continue-on-error` is a boolean or an expression token — a literal
 *  like `nope` is runner-invalid, so any-non-empty-string was too loose. */
const okFlag = (v: unknown): boolean =>
  typeof v === "boolean" || (typeof v === "string" && /^\$\{\{.*\}\}$/.test(v.trim()));
/** GitHub action-manifest root: typed, and only these keys (R30). */
const ACTION_ROOT: Record<string, Pred> = {
  name: str,
  description: str,
  author: str,
  branding: mapping,
  inputs: mapping,
  outputs: mapping,
  runs: mapping,
};
/** Step ids follow the runner's identifier syntax and must be unique. */
const STEP_ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export function validatedCompositeSteps(doc: unknown): ActionStep[] | null {
  if (!mapping(doc)) return null;
  if (!typedShape(doc as Record<string, unknown>, ACTION_ROOT)) return null;
  const runs = (doc as { runs?: unknown } | null | undefined)?.runs;
  if (runs === null || typeof runs !== "object" || Array.isArray(runs)) return null;
  for (const k of Object.keys(runs as Record<string, unknown>)) if (!RUNS_KEYS.has(k)) return null;
  const { using, steps } = runs as { using?: unknown; steps?: unknown };
  if (using !== "composite") return null;
  if (!Array.isArray(steps)) return null;
  const seenIds = new Set<string>();
  for (const step of steps) {
    if (step === null || typeof step !== "object" || Array.isArray(step)) return null;
    const s = step as Record<string, unknown>;
    if ("id" in s) {
      if (typeof s.id !== "string" || !STEP_ID_RE.test(s.id) || seenIds.has(s.id)) return null;
      seenIds.add(s.id);
    }
    const hasRun = "run" in s;
    const hasUses = "uses" in s;
    if (hasRun === hasUses) return null; // neither, or both
    const allowed = hasRun ? RUN_STEP_KEYS : USES_STEP_KEYS;
    for (const k of Object.keys(s)) if (!allowed.has(k)) return null;
    if (hasRun && (!nonEmptyString(s.run) || !nonEmptyString(s.shell))) return null;
    if (hasUses && usesKind(s.uses) === "invalid") return null;
    for (const k of ["name", "id", "if", "working-directory"]) {
      if (k in s && !nonEmptyString(s[k])) return null;
    }
    for (const k of ["env", "with"]) {
      if (k in s && !scalarMap(s[k])) return null;
    }
    if ("continue-on-error" in s && !okFlag(s["continue-on-error"])) return null;
  }
  return steps as ActionStep[];
}

function canonicalYaml(text: string): string | null {
  try {
    const doc: unknown = parse(text);
    if (doc === null || typeof doc !== "object") return null;
    return stringify(doc, { lineWidth: 0, singleQuote: false });
  } catch {
    return null;
  }
}
/**
 * Whether the line that invokes a spec can swallow a non-zero exit.
 *
 * ALLOWLIST, not a leak hunt. The previous version enumerated three leak
 * forms (`|| true`, `; exit 0`, a trailing `tee|cat|grep` pipe) and an
 * adversarial round walked straight past all three with `|| :`, `; true`, and
 * `| sed -n 1p`. Enumerating bad shapes loses to whoever writes the next one,
 * so this asks the opposite question: is anything AT ALL chained after the
 * invocation that could replace its status?
 *
 * `;`, `|`, and `||` are all status-replacing (`a; b` and `a | b` both report
 * b's status absent `pipefail`, and `a || b` runs b precisely when a failed).
 * `&&` is NOT: `setup && playwright test …` still fails the step when either
 * side fails, and real workflows here use it, so it stays allowed.
 *
 * Scoped to the lines that actually carry an invocation, so an unrelated
 * `echo … | tee` elsewhere in a multi-line run block does not disqualify a
 * step. Where it is ambiguous this errs toward REJECTING — a false "dark"
 * reading costs an allowlist row with a reason, while a false "covered" one
 * silently deletes real coverage.
 */
function suppressesExit(cmd: string): boolean {
  return cmd
    .split("\n")
    .filter((line) => /\bplaywright\b|\bpnpm\b/.test(line))
    .some((line) => /[;|]/.test(line));
}

/**
 * The ONE command form that covers a whole config rather than a named spec.
 *
 * A whole-config command names no spec, so spec-path extraction finds nothing
 * and the job would claim nothing at all — not "rejected", but invisible. That
 * gap is closed by recognizing a single exact literal and nothing else.
 *
 * Deliberately not a grammar. Four adversarial rounds failed to make general
 * narrowing semantics (`--grep`, `--shard`, positional filters, arguments
 * forwarded from a call site) sound, and each repair introduced the next
 * contradiction; those ambitions are filed as backlog items instead. Anything
 * that is not this exact string yields no whole-config claim, which cannot be
 * attacked on grammar because there is none.
 *
 * Spec: docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §4.1.
 */
const WHOLE_CONFIG_RE = /^pnpm exec playwright test --config (\S+)$/;

type Opts = {
  /** workflow file basename -> raw YAML text */
  workflows: Record<string, string>;
  /** package.json "scripts" map, for alias resolution */
  packageScripts: Record<string, string>;
  /**
   * config path -> the spec paths its `testMatch` resolves to. Supplied by the
   * caller (the meta-test resolves it from the live config) so this module
   * stays pure and hardcodes no membership. A config absent from this map
   * yields no whole-config claim.
   */
  configSpecs?: Record<string, string[]>;
  /**
   * Local composite-action ref exactly as written in `uses:` (e.g.
   * "./.github/actions/setup") -> that action's raw YAML text. Composite
   * steps execute in the CALLER's job env, so a local action that writes
   * GITHUB_ENV/GITHUB_PATH poisons the caller's later steps (cross-step-env
   * spec §2.2). A `./` ref ABSENT from this map is an opaque same-env
   * executor and poisons fail-closed. A non-local ref is trusted ONLY when
   * `usesKind` classifies it `remote` (a pinned `owner/repo[/path]@ref`);
   * setup-node writes GITHUB_PATH by design and remote action internals are
   * out of universe (spec §5 L1), but an unpinned or docker ref is invalid
   * rather than trusted (spec §5 L8).
   */
  localActions?: Record<string, string>;
  /**
   * Env-key allowlist override for fixtures (static-env spec §2.1). Live
   * callers omit it and get ENV_KEY_ALLOWLIST.
   */
  envKeyAllowlist?: EnvKeyAllowlist;
};

/**
 * Static env-block allowlist (static-env spec §2.0). A static `env:` block
 * at workflow, job, or step level can set PATH (or any loader/interpreter
 * control variable) so a textually clean `pnpm exec playwright test` runs a
 * fake pnpm that exits 0 — no ordering to thread, the key is simply there.
 * Rows pin exact (key, value-TEXT) pairs, NOT key names (spec §7 R2: a
 * key-name registry needed a name-inertness judgment per row, and
 * MODAL_PREFETCH_E2E/MODAL_REALTIME_E2E failed it — their values gate
 * test.skip, so a value-only flip was a green run with no tests). A novel
 * key OR a novel value for a pinned key fails closed: `path`, `LD_PRELOAD`,
 * `NODE_OPTIONS`, `BASH_ENV`, `PERL5LIB`, GITHUB_-prefixed names have no
 * row, and `MODAL_PREFETCH_E2E: "0"` is off-list the same way — there is no
 * dangerous-key enumeration and no per-key inertness debate left. Expression
 * values pin as TEXT (`${{ secrets.X }}` is one pinned string); what an
 * expression resolves to at runtime is out of universe (spec §5 LS1). The
 * hygiene suite reds a row whose (key, value) pair no live parsed env: map
 * carries, so the list cannot rot.
 *
 * `governs` (spec §7 R3): the SORTED spec paths whose claiming workflow
 * steps this key currently governs (workflow-root, job, or step env scope),
 * derived mechanically from the live tree. The hygiene suite asserts set
 * EQUALITY against a fresh derivation, so RELOCATING a pair away from the
 * claims it gates (the R3 live mutant: park MODAL_PREFETCH_E2E elsewhere,
 * the spec self-skips on absence, pair-level hygiene stays green) forces a
 * reviewable registry edit instead of passing silently. Scan-time behavior
 * ignores `governs` — absence is a hygiene-layer contract, not a per-scan
 * refusal.
 */
const DEMO_ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DEMO_SERVICE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export type EnvKeyAllowlist = Record<
  string,
  { values: Array<{ text: string; governs: string[] }>; reason: string }
>;

/** The derived-governance map key: a (key, value-text) PAIR, not a bare key.
 *  Keying by key alone drops value identity, and the final review (a) R2
 *  probe showed what that costs: a row pinning two live values keeps
 *  `governs` identical when those values SWAP between the claiming site and a
 *  non-claiming one, so a value-gated spec self-skips with pair hygiene,
 *  completeness, and governance equality all green. NUL is the separator
 *  because it cannot occur in YAML scalar text. */
export const govKey = (key: string, valueText: string) => `${key}\u0000${valueText}`;
export const ENV_KEY_ALLOWLIST: EnvKeyAllowlist = {
  FONT_ARTIFACT_DIR: {
    values: [{ text: ".next-prod", governs: [] }],
    reason:
      "Names the production build directory that tests/styles/fontBuiltArtifact.test.ts reads " +
      "@font-face declarations out of. Governs no spec: it selects nothing and skips nothing — " +
      "it is a READ path into an already-built artifact, and the reading test fails LOUD when " +
      "the variable is set but the directory is absent rather than degrading to a silent skip, " +
      "which is the property that makes an unset-vs-wrong-value confusion impossible to mistake " +
      "for a pass.",
  },
  DATABASE_URL: {
    values: [
      {
        text: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        // The tap-target step's wizard renders reach
        // lib/onboarding/sessionLifecycle.ts's postgres.js path, which resolves
        // `TEST_DATABASE_URL ?? DATABASE_URL` and THROWS under NODE_ENV=production
        // when neither is set. So this pair governs that spec: without it the
        // spec runs and fails, which is a loud outcome rather than a silent one,
        // but it is still the difference between the step proving something and
        // proving nothing.
        governs: ["tests/e2e/tap-target-inline-controls.layout.spec.ts"],
      },
    ],
    reason:
      "The LOCAL Supabase stack's Postgres DSN for the lifecycle-layout-e2e job's tap-target " +
      "step. Deliberately DATABASE_URL rather than TEST_DATABASE_URL: this repo uses the latter " +
      "for the REMOTE validation project (x-audits.yml feeds it a secret), so naming it here " +
      "would read as pointing CI at validation. A wrong value fails loud — the app throws on " +
      "connect — rather than selecting or skipping anything.",
  },
  PLAYWRIGHT_JSON_OUTPUT_NAME: {
    values: [
      {
        text: "test-results/crew-e2e-report.json",
        // Empty by live derivation, and correctly so — but for the trigger, not the command:
        // crew-e2e.yml filters with `pull_request.paths-ignore`, so the census classifies all four
        // of its specs as path-gated and attributes none of them to this step. (An earlier version
        // of this comment blamed the step's `--reporter=list,json`; that was wrong — whole-diff
        // review R16 probed it by removing only the paths-ignore block, which made all four specs
        // derive here with the reporter argument still in place.) Their CI coverage is asserted by
        // tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts, which replays the command through
        // Playwright, and by the executed-count oracle — not by this row.
        governs: [],
      },
      {
        text: "test-results/app-e2e-report.json",
        // app-e2e.yml is UNfiltered pull_request, so unlike the crew value
        // above this one derives real governance: it sits step-level on the
        // claiming run step for every batch-1 spec. A DISTINCT path from the
        // crew value by design — two jobs writing one report path is exactly
        // the artifact confusion the "oracle reads the run's own report" rule
        // exists to prevent.
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
        ],
      },
      {
        text: "test-results/lifecycle-layout-tap-target-report.json",
        // lifecycle-layout-e2e.yml is UNfiltered pull_request too, so this derives
        // real governance for the one spec its step names. A THIRD distinct path,
        // for the same reason the app value is distinct from the crew one: this job
        // runs four playwright steps, and a report path shared with another step
        // would let one step's output stand in for another's oracle.
        governs: ["tests/e2e/tap-target-inline-controls.layout.spec.ts"],
      },
      {
        text: "test-results/phantom-gap-diagrams-report.json",
        // Empty by live derivation, for the crew value's reason and not the app
        // value's: phantom-gap-e2e.yml filters with `pull_request.paths`, so the
        // census classifies its specs as path-gated and attributes none of them
        // to this step. A FOURTH distinct path, by the same design rule as the
        // three above — two jobs writing one report path is the artifact
        // confusion the "oracle reads the run's OWN report" rule exists to
        // prevent — and this report is read by a checker whose requirements are
        // per (case, PROJECT) rather than per file.
        governs: [],
      },
    ],
    reason:
      "Destination for a Playwright run's own json report, which that job's post-run " +
      "executed-count oracle (scripts/check-crew-e2e-executed.mjs, " +
      "scripts/check-app-e2e-executed.mjs, scripts/check-lifecycle-layout-executed.mjs, " +
      "scripts/check-phantom-gap-executed.mjs) reads. " +
      "Inert with respect to what runs: it " +
      "names a Playwright OUTPUT path only — it cannot select, skip or redirect a test, and a " +
      "wrong value makes the oracle fail closed on a missing report rather than pass.",
  },
  SUPABASE_URL: {
    values: [
      { text: "${{ secrets.SUPABASE_URL }}", governs: [] },
      {
        text: "http://127.0.0.1:54321",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "Supabase endpoint read by app/test code",
  },
  NEXT_PUBLIC_SUPABASE_URL: {
    values: [
      {
        text: "http://127.0.0.1:54321",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "Supabase endpoint read by app code",
  },
  SUPABASE_SECRET_KEY: {
    values: [
      { text: "${{ secrets.SUPABASE_SECRET_KEY }}", governs: [] },
      {
        text: DEMO_SERVICE_JWT,
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "Supabase credential read by app/test code",
  },
  SUPABASE_ANON_KEY: {
    values: [
      {
        text: DEMO_ANON_JWT,
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "Supabase credential read by app/test code",
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    values: [
      {
        text: DEMO_SERVICE_JWT,
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "Supabase credential read by app/test code",
  },
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
    values: [
      {
        text: DEMO_ANON_JWT,
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "Supabase credential read by app code",
  },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: {
    values: [
      {
        text: DEMO_ANON_JWT,
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "Supabase credential read by app code",
  },
  SUPABASE_JWT_SECRET: {
    values: [
      {
        text: "super-secret-jwt-token-with-at-least-32-characters-long",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "local-stack JWT secret read by test bridge code",
  },
  SUPABASE_REALTIME_ISS: {
    values: [
      {
        text: "supabase-demo",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "realtime issuer read by test bridge code",
  },
  SUPABASE_TEST_REST_URL: {
    values: [{ text: "${{ vars.SUPABASE_TEST_REST_URL }}", governs: [] }],
    reason: "test-project endpoint read by test code",
  },
  SUPABASE_TEST_JWT_SECRET: {
    values: [{ text: "${{ secrets.SUPABASE_TEST_JWT_SECRET }}", governs: [] }],
    reason: "test-project secret read by test code",
  },
  SUPABASE_TEST_PUBLISHABLE_KEY: {
    values: [{ text: "${{ vars.SUPABASE_TEST_PUBLISHABLE_KEY }}", governs: [] }],
    reason: "test-project credential read by test code",
  },
  VALIDATION_SUPABASE_PROJECT_REF: {
    values: [{ text: "vzakgrxqwcalbmagufjh", governs: [] }],
    reason: "validation project ref read by audit scripts",
  },
  TEST_DATABASE_URL: {
    values: [{ text: "${{ secrets.SUPABASE_TEST_DATABASE_URL }}", governs: [] }],
    reason: "database URL read by test code via postgres client",
  },
  HASH_FOR_LOG_PEPPER: {
    values: [
      {
        text: "fxav-r41-test-pepper-32-chars-min-deterministic",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "log-hash pepper read by app code",
  },
  ENABLE_TEST_AUTH: {
    values: [
      {
        text: "true",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "test-auth toggle read by app code",
  },
  TEST_AUTH_SECRET: {
    values: [
      {
        text: "fxav-m3-test-auth-2026-DO-NOT-SHIP",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
      { text: "test-secret-fixture", governs: [] },
    ],
    reason: "test-auth secret read by app code",
  },
  JWT_SIGNING_SECRET: {
    values: [
      {
        text: "redeem-link-test-secret-32-bytes-min",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "JWT secret read by app code",
  },
  PICKER_COOKIE_SIGNING_KEY: {
    values: [
      {
        text: "7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "cookie-signing key read by app code",
  },
  GOOGLE_SERVICE_ACCOUNT_JSON: {
    values: [
      {
        text: '{"client_email":"walker-fixture@seed-mode.iam.gserviceaccount.com"}',
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "service-account JSON read by sync code",
  },
  BASELINE_SERVER_ONLY: {
    values: [
      {
        text: "1",
        governs: [
          "tests/e2e/admin-changes-feed-layout.spec.ts",
          "tests/e2e/admin-layout.spec.ts",
          "tests/e2e/admin-lifecycle-layout.spec.ts",
          "tests/e2e/admin-phase2-surfaces.spec.ts",
          "tests/e2e/canonical-class-dimensions.spec.ts",
          "tests/e2e/help-pages.spec.ts",
          "tests/e2e/me-page.spec.ts",
          "tests/e2e/notify-toggles.spec.ts",
          "tests/e2e/report-modal.spec.ts",
          "tests/e2e/root-landing.spec.ts",
          "tests/e2e/sample.spec.ts",
          "tests/e2e/tap-target-inline-controls.layout.spec.ts",
        ],
      },
    ],
    reason: "capture-mode flag read by screenshot scripts",
  },
  VITEST_EXCLUDE_ENV_BOUND: {
    values: [{ text: "1", governs: [] }],
    reason: "suite-selection flag read by vitest config",
  },
  VITEST_INCLUDE_MUTATION_HARNESS: {
    values: [{ text: "1", governs: [] }],
    reason: "suite-selection flag read by vitest config",
  },
  DEV_GATE_ONLY: {
    values: [{ text: "1", governs: [] }],
    reason: "suite-selection flag read by playwright config",
  },
  CREW_E2E_ONLY: {
    values: [{ text: "1", governs: [] }],
    reason: "suite-selection flag read by playwright config",
  },
  STEP3_LIVE_BUNDLE_ONLY: {
    values: [{ text: "1", governs: [] }],
    reason: "suite-selection flag read by playwright config",
  },
  HELP_DOCS_WALKER_ONLY: {
    values: [{ text: "1", governs: [] }],
    reason: "suite-selection flag read by playwright config",
  },
  MODAL_PREFETCH_E2E: {
    values: [{ text: "1", governs: [] }],
    reason: "suite-selection flag gating test.skip (value-pinned: any flip reds, spec §7 R2)",
  },
  MODAL_REALTIME_E2E: {
    values: [{ text: "1", governs: [] }],
    reason: "suite-selection flag gating test.skip (value-pinned: any flip reds, spec §7 R2)",
  },
  REPEATS: {
    values: [{ text: "${{ github.event.inputs.transitions_repeats || '1' }}", governs: [] }],
    reason: "repeat-count input read by test scripts",
  },
  BRANCH: {
    values: [{ text: "${{ github.ref_name }}", governs: [] }],
    reason: "branch name read by regen scripts",
  },
  PG_CRON_COVERAGE_TARGET: {
    values: [{ text: "validation", governs: [] }],
    reason: "coverage target read by audit scripts",
  },
  GH_TOKEN: {
    values: [{ text: "${{ github.token }}", governs: [] }],
    reason: "GitHub token read by gh CLI",
  },
  BRANCH_PROTECTION_PAT: {
    values: [{ text: "${{ secrets.BRANCH_PROTECTION_PAT }}", governs: [] }],
    reason: "GitHub token read by audit scripts",
  },
  GH_APP_TOKEN: {
    values: [{ text: "${{ secrets.GH_APP_TOKEN }}", governs: [] }],
    reason: "GitHub App token read by the branch-protection drift detector",
  },
};

/**
 * The SORTED off-allowlist keys of a static env: map (static-env spec §2.0):
 * keys with no row, plus keys whose VALUE TEXT is outside their row's pinned
 * set. Membership is OWN-property membership — `Object.hasOwn`, never `in`:
 * the prototype chain would silently allowlist keys named `constructor`,
 * `toString`, `__proto__`, `hasOwnProperty` (spec §7 R1 F2). Scalar coercion
 * mirrors the parser: strings as-is, other scalars via String(). Non-mapping
 * input returns [] — structural validity is validWorkflowShape's job.
 */
export function offAllowlistEnvKeys(
  env: unknown,
  allowlist: EnvKeyAllowlist = ENV_KEY_ALLOWLIST,
): string[] {
  if (env === null || typeof env !== "object" || Array.isArray(env)) return [];
  return Object.entries(env)
    .filter(([k, v]) => {
      if (!Object.hasOwn(allowlist, k)) return true;
      const text = typeof v === "string" ? v : String(v);
      return !allowlist[k]!.values.some((entry) => entry.text === text);
    })
    .map(([k]) => k)
    .sort();
}

/**
 * Cross-step env-state predicate (cross-step-env-guard spec §2.0): after
 * dropping full-line `#` lines (they never execute, and the step-splitter
 * glues BETWEEN-step comment prose onto the preceding chunk), any mention of
 * GITHUB_ENV or GITHUB_PATH marks the environment of every LATER same-job
 * step untrusted — `echo "PATH=/fake:$PATH" >> "$GITHUB_PATH"` makes a
 * textually clean downstream `pnpm exec playwright test` run a fake pnpm
 * that exits 0. Deliberately NO write-shape grammar (>> vs > vs tee vs
 * heredoc) and no read/write distinction: that is shell modeling, the losing
 * game. Matched against the WHOLE step chunk (name:/with:/env: lines
 * included) — broader than the census's run-block match, in the safe
 * direction (spec §5 L5).
 */
/**
 * The env-file mention family (R31): the uppercase variables AND the
 * documented `github.env` / `github.path` context properties, which name
 * the same files — a step writing through either mutates every later
 * step in the job, so recognizing only the variables missed a real
 * charter-surface vector (not a constructed-name obfuscation). R32: GitHub
 * documents INDEX syntax as equivalent to property dereference, so
 * `github['env']` / `github["path"]` are first-class spellings too.
 */
const ENV_FILE_MENTION =
  // The quote class tolerates a leading backslash: the census and the
  // scanner both test JSON-serialized step values, where an inner quote
  // arrives escaped (`github[\\"path\\"]`).
  /GITHUB_ENV|GITHUB_PATH|github\s*(?:\.\s*(?:env|path)\b|\[\s*\\?['"](?:env|path)\\?['"]\s*\])/i;

function writesJobEnv(chunk: string): boolean {
  return ENV_FILE_MENTION.test(
    chunk
      .split("\n")
      .filter((l) => !/^[ \t]*#/.test(l))
      .join("\n"),
  );
}

/**
 * Whether a step chunk's `uses:` refs make the job env untrusted. Shapes are
 * decided by the shared `usesKind` (pinned remote trusted; local resolved;
 * everything else, docker included, invalid). Local
 * (`./`) refs resolve through `localActions` and RECURSE — a composite may
 * `uses:` another local composite (spec R1's escaping mutant #2). Poison
 * fail-closed when the ref is unknown, cyclic (PATH-scoped guard;
 * sequential reuse is legit), NOT `using: composite` (a javascript/docker
 * action's entry code can call core.addPath / core.exportVariable with
 * nothing for a text scan to see — spec R1's escaping mutant #1), or when
 * any resolved manifest mentions GITHUB_ENV/GITHUB_PATH outside comments.
 * Quotes around the ref are stripped first — `uses: "./x"` must not dodge
 * the `./` test into the trusted-marketplace branch. Non-`./` refs stay
 * trusted (spec §5 L1: setup-node writes GITHUB_PATH by design).
 */
/** Comment-stripped text (full-line `#` lines never execute). */
function stripCommentLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^[ \t]*#/.test(l))
    .join("\n");
}

/**
 * YAML spellings that re-key or re-shape a mapping so a line-anchored regex
 * scan reads a DIFFERENT document than the YAML parser does (R3: quoted keys
 * `"uses":`, flow-mapping steps `- {uses: x}`, anchored/aliased values
 * `uses: &a ./x` / `uses: *a` — all parse to the same `uses` the typed
 * census resolves, while a plain-spelling regex sees nothing). The doctrine
 * is refuse-what-you-cannot-model: any of these in step METADATA or a job
 * head rejects the step/job's claims and poisons the job env fail-closed.
 * Applied to metadata only — the run VALUE is stripped first, so JSON
 * payloads or prose inside run bodies (and the live single-line JSON `env:`
 * values, which sit mid-line after a plain key) cannot false-dark a step.
 * One mechanism closes the whole spelling class for every key the scanner
 * reads (`uses`, `if`, `continue-on-error`, `run`, …).
 */
const UNMODELLED_SPELLING_RE =
  /(^|\n)\s*(?:-\s*)?["'][\w-]+["']\s*:|(^|\n)\s*(?:-\s*)?\{|(^|\n)[^\n]*:\s*[&*][\w-]|(^|\n)\s*-?\s*[&*][\w-]|(^|\n)[ \t]*(?:-[ \t]+)?\?(?=[ \t]|\r?\n|$)|(^|\n)[ \t]*:(?=[ \t]|\r?\n|$)|(^|\n)[ \t]*(?:-[ \t]+)?!/;

/** A step chunk minus its run VALUE — the metadata the spelling refusal reads. */
function stepMetaOf(chunk: string): string {
  const runMatch = chunk.match(/(^|\n)\s*run\s*:([\s\S]*)$/);
  return runMatch ? chunk.replace(runMatch[2]!, "") : chunk;
}

/**
 * Strict `uses:` VALUE extraction (R3): the value must be a plain scalar —
 * optionally quoted — that is either a local `./` ref, a `docker://` image,
 * or a PINNED marketplace `owner/repo[/path]@ref` token whose ref passes
 * the narrow allowlist. Anything else — refless, `docker://` in any form,
 * Git-invalid refs (empty →
 * block/folded scalar on the next line, `&`/`*` → anchor/alias, stray
 * tokens) is unprovable by a line scan and poisons fail-closed.
 */
/**
 * Poison decision for a PARSED `uses:` VALUE (R28). Reconstructing
 * `uses: <value>` and re-scanning it as text meant a block-scalar value was
 * classified on its first line only — the runner consumes the whole scalar.
 * This takes the value itself: local refs resolve through the manifest
 * profile (recursively), pinned remotes are trusted, everything else
 * poisons fail-closed.
 */
export function usesValuePoisons(
  value: unknown,
  localActions: Record<string, string>,
  seen: ReadonlySet<string>,
  envKeyAllowlist: EnvKeyAllowlist = ENV_KEY_ALLOWLIST,
): boolean {
  const kind = usesKind(value);
  if (kind === "invalid") return true;
  if (kind === "remote") return false;
  const ref = (value as string).trim();
  if (seen.has(ref)) return true;
  const raw = localActions[ref];
  if (raw === undefined) return true;
  let doc: unknown;
  try {
    doc = parse(raw);
  } catch {
    return true;
  }
  const steps = validatedCompositeSteps(doc);
  if (steps === null) return true;
  const text = canonicalYaml(raw);
  if (text === null || writesJobEnv(text)) return true;
  // Static-env spec §2.1 (LS3): a composite step of EITHER kind handed an
  // off-allowlist env: key poisons fail-closed — the step (or the action it
  // invokes) executes with a hostile static env this scan cannot model.
  if (steps.some((s) => offAllowlistEnvKeys(s.env, envKeyAllowlist).length > 0)) return true;
  const next = new Set(seen).add(ref);
  return steps.some(
    (s) => "uses" in s && usesValuePoisons(s.uses, localActions, next, envKeyAllowlist),
  );
}

/**
 * Every (key, value-text) env pair carried by the steps of the composite a
 * `uses:` value resolves to, at any depth (static-env spec §2.3, final
 * review (a) R5 F2). Governance-only: an allowlisted pair at an
 * action-scoped site never trips the refusal path (a dirty one already
 * poisons via usesValuePoisons), but it IS part of the job's execution
 * context, so relocating it away must red the declaring row like any other
 * relocation. Remote refs are trusted and contribute nothing; unresolvable
 * or cyclic refs contribute nothing here because they already poison.
 */
export function compositeEnvPairs(
  value: unknown,
  localActions: Record<string, string>,
  seen: ReadonlySet<string>,
): Array<[string, string]> {
  if (usesKind(value) !== "local") return [];
  const ref = (value as string).trim();
  if (seen.has(ref)) return [];
  const raw = localActions[ref];
  if (raw === undefined) return [];
  let doc: unknown;
  try {
    doc = parse(raw);
  } catch {
    return [];
  }
  const steps = validatedCompositeSteps(doc);
  if (steps === null) return [];
  const next = new Set(seen).add(ref);
  const out: Array<[string, string]> = [];
  for (const s of steps) {
    // A composite step carrying `if:` provably may not run, so its env
    // configures nothing, and a guarded parent hides its whole subtree.
    // (R6 F2, CORRECTED at R7: an earlier probe used YAML boolean
    // `if: false`, which `validatedCompositeSteps` rejects on TYPE, and
    // wrongly concluded that `if:` on a composite step always poisons. A
    // STRING condition — `if: "${{ false }}"` — is accepted, leaves the
    // claim COVERED, and its env did confer governance. The skip is live.)
    if ("if" in (s as Record<string, unknown>)) continue;
    const env = (s as { env?: unknown }).env;
    if (env !== null && typeof env === "object" && !Array.isArray(env))
      for (const [k, v] of Object.entries(env))
        out.push([k, typeof v === "string" ? v : String(v)]);
    if ("uses" in s) out.push(...compositeEnvPairs(s.uses, localActions, next));
  }
  return out;
}

function localActionPoisons(
  chunk: string,
  localActions: Record<string, string>,
  seen: ReadonlySet<string>,
): boolean {
  for (const m of stripCommentLines(chunk).matchAll(/(^|\n)\s*(?:-\s*)?uses\s*:([^\n]*)/g)) {
    const rawValue = (m[2] ?? "").trim();
    const unquoted = rawValue.replace(/^(["'])(.*)\1$/, "$2").trim();
    if (unquoted.startsWith("./")) {
      const ref = unquoted;
      if (seen.has(ref)) return true;
      const raw = localActions[ref];
      if (raw === undefined) return true;
      // Manifests are PARSED and schema-validated (R8) through the ONE
      // shared validator both layers use — a text scan cannot see step
      // SHAPE, and twelve invalid shapes escaped the textual checks.
      // Unparseable or invalid => opaque, fail-closed.
      let doc: unknown;
      try {
        doc = parse(raw);
      } catch {
        return true;
      }
      const steps = validatedCompositeSteps(doc);
      if (steps === null) return true;
      const text = canonicalYaml(raw);
      if (text === null || writesJobEnv(text)) return true;
      // Child uses: recurse through the VALIDATED steps (typed values, so
      // prose outside runs: can neither masquerade nor false-poison).
      const next = new Set(seen).add(ref);
      for (const s of steps) {
        if (typeof s.uses !== "string") continue;
        if (localActionPoisons(`uses: ${s.uses}`, localActions, next)) return true;
      }
      continue;
    }
    // Remote refs must carry @ref (R10) — a refless owner/repo fails GitHub's
    // validation before any step runs, so it is INVALID, not trusted.
    if (usesKind(unquoted) === "remote") continue; // trusted (spec §5 L1)
    return true; // refless, anchored, aliased, folded/block, empty, or unmodelable
  }
  return false;
}

/** The `on:` block (from the `on:` line to the next top-level key). */
function onBlock(yaml: string): string {
  const m = yaml.match(/(^|\n)on\s*:\s*\n([\s\S]*?)(?=\n\S|$)/);
  return m ? m[2]! : "";
}

/** The pull_request SUB-block inside `on:` - its own indented lines only, so a
 *  `paths:` under `push:` (or anywhere else) cannot false-positive (plan R1
 *  medium finding: an unbounded regex crossed block boundaries). */
function pullRequestBlock(on: string): string | null {
  const m = on.match(/(^|\n)(\s*)pull_request\s*:([^\n]*)\n?((?:\2\s+[^\n]*\n?)*)/);
  if (!m) return null;
  return (m[3] ?? "") + "\n" + (m[4] ?? "");
}

/** Split the `jobs:` body into per-job chunks (2-space-indent job keys), and
 *  each job into its pre-steps HEAD and its individual STEP blocks. `if:` and
 *  `continue-on-error` are scoped to the JOB head and the RUN STEP itself
 *  (plan R1 blocking finding: a file-level check could never count any real
 *  workflow — they all carry an `if: failure()` upload step). */
function jobs(yaml: string): Array<{ head: string; steps: string[] }> {
  const m = yaml.match(/(^|\n)jobs\s*:\s*\n([\s\S]*)$/);
  if (!m) return [];
  return m[2]!.split(/\n(?=  [\w-]+\s*:)/).map((job) => {
    const idx = job.search(/(^|\n)\s*steps\s*:/);
    if (idx === -1) return { head: job, steps: [] };
    const head = job.slice(0, idx);
    const steps = job
      .slice(idx)
      .split(/\n(?=\s*-\s)/)
      .slice(1)
      // Normalize the list marker so `- run:` / `- if:` inline forms match the
      // same line-anchored regexes as the two-line `- name:` + `run:` form
      // (plan R2 blocking finding: without this, inline `- run:` steps were
      // INVISIBLE - the exact silently-matches-nothing class this guard cites
      // _rowWrapperScan to prevent).
      .map((st) => st.replace(/^(\s*)-\s*/, "$1"));
    return { head, steps };
  });
}

/**
 * Whether a block declares `continue-on-error` in any status-swallowing form.
 *
 * ALLOWLIST again: only a literal `false` is safe. Matching literal `true`
 * missed `${{ true }}` — an expression GitHub evaluates to true — and would
 * equally miss `${{ github.event_name == 'push' }}` or a `yes`/`on` YAML
 * boolean. Anything that is not exactly `false` is treated as swallowing,
 * because the scanner cannot evaluate an expression and must not guess in the
 * permissive direction.
 */
function hasContinueOnError(block: string): boolean {
  const m = block.match(/(^|\n)\s*continue-on-error\s*:\s*([^\n]*)/);
  if (!m) return false;
  return (
    m[2]!
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase() !== "false"
  );
}

/**
 * Constructs that change WHERE or WHETHER a `run:` command executes, and that
 * this scanner deliberately refuses to model.
 *
 * An adversarial round produced false coverage through six of them:
 * `shell: bash -c ":" {0}` at step, job-default, or workflow-default level
 * (the command never runs, the step succeeds); `working-directory:` at the
 * same three levels (a relative config path resolves to a DIFFERENT config);
 * and `needs: gate` where `gate` carries `if: false`, so Actions skips the
 * job even though its own head has no condition.
 *
 * Modelling these is a losing game — the previous two rounds died the same way
 * — so a workflow using ANY of them yields no coverage at all. That is
 * conservative in the correct direction: a spec reads as dark and keeps its
 * allowlist row, rather than reading as covered by a job that never ran it.
 * Nothing in this repo's e2e workflows uses any of them.
 */
const UNMODELLED_RE = /(^|\n)\s*-?\s*(shell|working-directory|defaults|container|needs)\s*:/;

/**
 * Shell constructs INSIDE a run block that make "this block executes this
 * spec" unprovable by a line scan (R12 finding — the census's sibling
 * refusal, mirrored here because the two layers fell to the same vector):
 *
 *   - shell-STATE mutation: variable assignment in every form (inline
 *     `PATH=fixtures/fake pnpm exec playwright test …` runs a fake pnpm that
 *     exits 0 — green step, no tests; standalone, `+=` append, `A[i]=`
 *     array), the assignment builtins (export/declare/typeset/readonly/
 *     local/let/read/mapfile/readarray/getopts), source/dot scripts,
 *     directory changes (cd/pushd/popd — a relative spec or config path now
 *     resolves elsewhere), builtin/command/enable wrappers, and the census's
 *     R11 blacklist (hash/alias/unalias/shopt/trap/unset/exec/set/eval/
 *     exit/return);
 *   - control FLOW: an invocation inside an if/case/loop branch or a
 *     function body may never execute (`if false; then … fi` is a green
 *     step that ran nothing).
 *
 * Matched at COMMAND POSITION only — start of a line or after `;`, `&`,
 * `|`, `(`, `{` — so `pnpm setup && playwright test` (the ratified
 * &&-chain allowance: a failing predecessor fails the step) and option
 * tokens like `--reporter=list` (not command position) stay clean. Whole
 * run block, not just invocation lines: state mutated on line 1 governs an
 * invocation on line 2. Refusal direction per the header contract: a false
 * "dark" costs a reasoned allowlist row; a false "covered" silently deletes
 * real coverage.
 *
 * R13 additions, mirroring the census: function NAMES are any
 * metacharacter-free word, not \w (`foo-bar ( ) {` is a valid definition
 * with padded parens); brace-group tokens at command position (`a && {
 * true`) are control flow; `printf` (-v writes a variable) and `(( ))`
 * arithmetic assignment join the state changers; and ANY `$` or backtick
 * anywhere in the block is refused outright — `${VAR:=default}` assigns
 * during expansion on any command's arguments, and $(…)/backticks splice
 * state no scan can model. The brace-token alternative deliberately
 * excludes `(`/`{` from its anchor so a GitHub `${{ … }}` expression is
 * caught by the `$` rule, not misparsed as a shell brace group. A false
 * real coverage.
 */
const UNMODELLED_SHELL_RE =
  /[$`]|(?:^|[\n;&|])[ \t]*[{}]|(?:^|[\n;&|({])[ \t]*(?:(?:if|then|else|elif|fi|case|esac|while|until|for|do|done|function|exit|return|exec|set|eval|hash|alias|unalias|shopt|trap|unset|export|declare|typeset|readonly|local|source|cd|pushd|popd|builtin|command|enable|let|read|mapfile|readarray|getopts|printf)\b|\.[ \t]|\(\(|[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=|[^\s;&|(){}]+[ \t]*\([ \t]*\))/;

const INVOKER_SEG =
  /^[ \t]*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*[ \t]+)*(?:pnpm|npx|yarn|bun|playwright)\b/;

/**
 * The ONE claim recognizer (R13 command-position + alias resolution + the
 * whole-config literal), shared by the scan loop AND the governance
 * derivation. R4 (static-env spec §7): a governance derivation using a bare
 * path regex credited `echo tests/e2e/…` prose as a claim, so a reviewed
 * pair parked on an echo step laundered its declared governs set while the
 * real Playwright step ran flagless. Recognition — not qualification — is
 * what governance needs, and it must be THIS recognizer or the two diverge.
 */
function resolveAliasClaims(cmd: string, packageScripts: Record<string, string>): string[] {
  const out: string[] = [];
  for (const line of cmd.split("\n")) {
    for (const seg of line.split(/(?:&&|\|\||[;&|])/)) {
      if (!INVOKER_SEG.test(seg)) continue;
      out.push(...(seg.match(SPEC_RE) ?? []));
      // pnpm alias resolution: `pnpm foo` / `pnpm run foo` -> scripts.foo
      for (const mm of seg.matchAll(/pnpm(?:\s+run)?\s+([\w:.-]+)/g)) {
        const name = mm[1]!;
        if (name in packageScripts)
          out.push(...resolveAliasClaims(packageScripts[name]!, packageScripts));
      }
    }
  }
  return out;
}

export function claimedSpecsOf(
  cmd: string,
  packageScripts: Record<string, string>,
  configSpecs: Record<string, string[]> = {},
): string[] {
  const out = resolveAliasClaims(cmd, packageScripts);
  // The whole-config literal applies to the TOP-LEVEL run block ONLY and
  // deliberately NOT through alias resolution (ratified — an adversarial
  // round claimed full coverage for a wrapped alias because recursion
  // applied the exact match to the package-script BODY while qualification
  // only ever saw the outer command; the R4 refactor briefly reintroduced
  // exactly that and the wrapped-literal fixture caught it pre-commit).
  const wholeConfigMatch = cmd.trim().match(WHOLE_CONFIG_RE);
  if (wholeConfigMatch) out.push(...(configSpecs[wholeConfigMatch[1]!] ?? []));
  return out;
}

/**
 * Key -> spec paths its env scope governs (static-env spec §2.3): governance
 * IS the scan — a thin wrapper reading the `governance` map that
 * scanWorkflowCoverage credits at its covered.add site, so it shares the
 * recognizer AND the whole qualification chain (R4 closed prose laundering;
 * R5 closed duplicate-claim substitution through disqualified sites). Specs
 * the scan does not cover (path-gated, guarded, dark) confer no governance —
 * they are outside the coverage guarantee and carry their own dark rows
 * (spec §5 LS7).
 */
export function envPairGovernance(
  workflows: Record<string, string>,
  packageScripts: Record<string, string>,
  configSpecs: Record<string, string[]> = {},
  envKeyAllowlist: EnvKeyAllowlist = ENV_KEY_ALLOWLIST,
  localActions: Record<string, string> = {},
): Map<string, Set<string>> {
  return scanWorkflowCoverage({
    workflows,
    packageScripts,
    configSpecs,
    localActions,
    envKeyAllowlist,
  }).governance;
}

/** governs-equality check (S8): every row's declared governs must equal the
 *  derived set — relocation, prose-laundering, and silent governance gain
 *  all force a reviewable registry edit. */
export function governanceViolations(
  allowlist: EnvKeyAllowlist,
  derived: Map<string, Set<string>>,
): string[] {
  const out: string[] = [];
  for (const [key, row] of Object.entries(allowlist)) {
    for (const entry of row.values) {
      const want = JSON.stringify([...(derived.get(govKey(key, entry.text)) ?? [])].sort());
      if (want !== JSON.stringify([...entry.governs].sort()))
        out.push(
          `${key}=${entry.text}: declared governs ${JSON.stringify(entry.governs)} != live ${want}`,
        );
    }
  }
  return out;
}

/** Pair-level allowlist hygiene (S6, static-env spec §2.3): stale keys,
 *  value-less rows, stale pinned values, and empty reasons, as problem
 *  strings. Pure over (allowlist, live pairs) so the live gate and the
 *  doctored twin run the SAME assertion logic — a deleted live assertion
 *  cannot leave the twin green (plan-R1 F1 tautology repair). */
export function envAllowlistHygieneProblems(
  allowlist: EnvKeyAllowlist,
  livePairs: Map<string, Set<string>>,
): string[] {
  const out: string[] = [];
  for (const [key, row] of Object.entries(allowlist)) {
    const live = livePairs.get(key);
    if (!live) {
      out.push(`stale env-key row: ${key} — remove it`);
      continue;
    }
    if (row.values.length === 0) out.push(`value-less env-key row: ${key}`);
    for (const { text } of row.values)
      if (!live.has(text)) out.push(`stale pinned value for ${key}: ${text} — remove it`);
    if (row.reason.trim().length === 0) out.push(`reason-less env-key row: ${key}`);
  }
  return out;
}

/** Completeness direction of pair-level hygiene (plan-R2): every LIVE
 *  (key, value) pair must have a reviewed allowlist row. The stale-row check
 *  alone is declared→live only, so a NEW live pair (the plan-R2 probe:
 *  GH_APP_TOKEN landed in x-audits.yml with no row) sits unreviewed while
 *  every gate stays green — an over-tight seed the live-green gate claims
 *  to exclude. Pure over (allowlist, live pairs) like its sibling checker. */
export function unreviewedLivePairs(
  allowlist: EnvKeyAllowlist,
  livePairs: Map<string, Set<string>>,
): string[] {
  const out: string[] = [];
  for (const [key, values] of livePairs) {
    const row = Object.hasOwn(allowlist, key) ? allowlist[key] : undefined;
    for (const v of values)
      if (!row || !row.values.some((entry) => entry.text === v))
        out.push(`unreviewed live env pair: ${key}=${v} — add a reasoned row`);
  }
  return out.sort();
}

export function scanWorkflowCoverage({
  workflows,
  packageScripts,
  configSpecs = {},
  localActions = {},
  envKeyAllowlist = ENV_KEY_ALLOWLIST,
}: Opts): {
  covered: Set<string>;
  rejected: Array<{ file: string; spec: string; reason: string }>;
  governance: Map<string, Set<string>>;
} {
  const covered = new Set<string>();
  const rejected: Array<{ file: string; spec: string; reason: string }> = [];
  // Static-env spec §2.3 (R5): env (key, value-text) PAIR -> specs it governs,
  // credited ONLY at the covered.add site — governance shares the scan's full
  // qualification chain by construction, so a duplicate claim the scan REJECTS
  // (path filter, if:, non-PR trigger, poison) confers nothing. R5's live
  // mutant parked the pair on a path-gated duplicate of the real invocation; a
  // recognition-only derivation credited it while the real job ran flagless.
  // Keyed by PAIR, not by key (final review (a) R2): a key-keyed map cannot
  // see two live values of one row SWAP between the claiming site and a
  // non-claiming one, which leaves a value-gated spec self-skipping green.
  const governance = new Map<string, Set<string>>();
  const envPairsOf = (env: unknown): Array<[string, string]> =>
    env !== null && typeof env === "object" && !Array.isArray(env)
      ? Object.entries(env).map(([k, v]) => [k, typeof v === "string" ? v : String(v)])
      : [];

  // R13: a claim requires COMMAND POSITION. SPEC_RE and the alias grammar
  // used to grep the whole run block, so `echo tests/e2e/foo.spec.ts` — or a
  // spec path inside a docker/bash -lc quoted string — counted as coverage
  // (the census refuses those same lines as outside command position; the
  // two layers now agree). Each ;/&&/||/|/&-split segment claims only when
  // it BEGINS with a recognized runner/invocation word.
  // Leading env-assignment prefixes stay CLAIMABLE on purpose: the claim
  // must survive to the qualification chain so UNMODELLED_SHELL_RE rejects
  // it WITH a reason ("REPORTED, not silently dropped").
  for (const [file, rawYaml] of Object.entries(workflows)) {
    // Everything below reads the CANONICAL text; an unparseable workflow
    // never runs on GitHub, so it claims nothing (safe-dark).
    const yaml = canonicalYaml(rawYaml);
    if (yaml === null) continue;
    let parsedDoc: unknown = null;
    try {
      parsedDoc = parse(yaml);
    } catch {
      continue;
    }
    const on = onBlock(yaml);
    const pr = pullRequestBlock(on);
    const hasPr = pr !== null || /(^|\n)on\s*:\s*\[[^\]\n]*pull_request/.test(yaml);
    // `paths-ignore` is a path filter too. Matching only `paths:` mis-classified an
    // exclusion-filtered workflow as PR-blocking-capable, which would silently mark
    // its specs "covered" even though the job does not run on every PR (found while
    // reviewing fix/picker-flow-app-bugs, where crew-e2e.yml moved to paths-ignore).
    const hasPathsFilter = pr !== null && /(^|\n)\s*paths(-ignore)?\s*:/.test(pr);
    // R24: a `pull_request` trigger counts as per-PR ONLY when it is BARE.
    // Enumerating filter keys one round at a time (paths, paths-ignore,
    // types, then branches, branches-ignore) is the losing shape this arc
    // has retired repeatedly, so the rule inverts: ANY configuration under
    // `pull_request` — any key at all, or a sequence form — means the
    // workflow does not run on every PR, exactly like the paths filter this
    // guard has always refused. A future filter key needs no new code.
    const parsedOn = (parsedDoc as { on?: unknown } | null)?.on;
    const parsedPr = mapping(parsedOn)
      ? (parsedOn as Record<string, unknown>)["pull_request"]
      : undefined;
    const prIsBare =
      parsedPr === null ||
      (mapping(parsedPr) && Object.keys(parsedPr as Record<string, unknown>).length === 0);
    const prActivityFilter = parsedPr !== undefined && !prIsBare;
    // Checked against the WHOLE file: `shell:`/`working-directory:`/`defaults:`
    // apply at workflow, job, or step level, and `needs:` can point at a job
    // that is skipped. Any of them anywhere means this scanner cannot say what
    // ran, so it says nothing.
    const unmodelled = UNMODELLED_RE.test(yaml);
    // Document markers: retained as an INERT belt. R6 canonicalization
    // strips markers before this test sees them, and a genuine
    // multi-document file fails `parse()` above (claim-nothing), so the
    // parse failure is what refuses. Kept because it costs nothing and
    // documents the intent (whole-diff R5/R9).
    const docMarkers = /(^|\n)(---|\.\.\.|%YAML|%TAG)/.test(yaml);
    // R4: EXPLICIT-KEY syntax (`? key` / `: value` lines) resolves to
    // ordinary scanner-read keys in the parser while every line-anchored
    // regex here is blind to it — probe showed false coverage through
    // explicit-key paths filters, if:, needs:, container:, shell:,
    // working-directory:, continue-on-error:, and uses: at every level. The
    // check reads METADATA segments only (the pre-jobs head here; job heads
    // and step metas below) — run VALUES legitimately start lines with the
    // shell `:` builtin (the census R13 fixtures do), so a file-level test
    // would false-dark them.
    const jobsIdx = yaml.search(/(^|\n)jobs\s*:/);
    const wfSpelling = UNMODELLED_SPELLING_RE.test(
      stripCommentLines(jobsIdx === -1 ? yaml : yaml.slice(0, jobsIdx)),
    );

    // R15 (file-level; typed at R18): a step carrying BOTH `run:` and
    // `uses:` is schema-invalid, so GitHub rejects the WHOLE workflow.
    // Read from the PARSED document — a text scan that truncated at
    // `run:` missed the run-first mapping order, and a scan that did not
    // truncate would false-positive on `uses:` inside a run body.
    const parsedJobsAll = (parsedDoc as { jobs?: Record<string, { steps?: unknown }> })?.jobs;
    const schemaInvalid = !validWorkflowShape(parsedDoc);
    // Static-env spec §2.1: workflow-root env: governs every job. Scope-
    // correct, not file-generic — the reason names the keys so the human
    // routes to the ENV_KEY_ALLOWLIST registry, not a schema hunt.
    const wfEnvOff = offAllowlistEnvKeys(
      (parsedDoc as { env?: unknown } | null)?.env,
      envKeyAllowlist,
    );
    const mixedStepAnywhere = Object.values(parsedJobsAll ?? {}).some((jb) =>
      (Array.isArray(jb?.steps) ? (jb.steps as Array<Record<string, unknown>>) : []).some(
        (st) => st !== null && typeof st === "object" && "run" in st && "uses" in st,
      ),
    );
    for (const job of jobs(yaml)) {
      // R16/R17: `runs-on` decided by the SHARED TYPED validator against
      // the PARSED document — the R16 textual heuristics accepted numeric
      // scalars, non-string sequence members, and wrong-typed group/labels.
      const jobName = /^[ \t]*([\w-]+)[ \t]*:/.exec(job.head)?.[1];
      const parsedJobs = (parsedDoc as { jobs?: Record<string, { "runs-on"?: unknown }> })?.jobs;
      const validRunsOnJob =
        jobName !== undefined && parsedJobs !== undefined && jobName in parsedJobs
          ? validRunsOn(parsedJobs[jobName]!["runs-on"])
          : false;
      const parsedJob =
        jobName !== undefined && parsedJobs !== undefined ? parsedJobs[jobName] : undefined;
      // Static-env spec §2.1: job env: governs this job's steps only.
      const jobEnvOff = offAllowlistEnvKeys(
        (parsedJob as { env?: unknown } | undefined)?.env,
        envKeyAllowlist,
      );
      // R18: keys placed AFTER `steps:` are invisible to the head text, so
      // read job-level if:/continue-on-error: from the parsed job too.
      const jobIf =
        /(^|\n)\s*if\s*:/.test(job.head) ||
        (parsedJob !== undefined && "if" in (parsedJob as Record<string, unknown>));
      const parsedJobCoe = (parsedJob as { "continue-on-error"?: unknown } | undefined)?.[
        "continue-on-error"
      ];
      const jobCoe =
        hasContinueOnError(job.head) ||
        (parsedJobCoe !== undefined &&
          String(parsedJobCoe)
            .trim()
            .replace(/^["']|["']$/g, "")
            .toLowerCase() !== "false");
      // R3: a quoted-key/flow/anchor spelling in the job HEAD could hide an
      // `if:`/`continue-on-error:` this scanner reads by plain spelling only.
      const headSpelling = UNMODELLED_SPELLING_RE.test(stripCommentLines(job.head));
      // Cross-step env state, threaded across ALL step chunks of this job in
      // order (uses: and other run-less steps included — bookkeeping must not
      // sit behind the run:-presence early-continue). Qualification runs
      // BEFORE this step's own bookkeeping: a step that both invokes and
      // writes poisons only LATER steps — its own within-block write is the
      // R12 class ($GITHUB_ENV trips UNMODELLED_SHELL_RE if the block
      // claims). Per-job flag: env state does not cross jobs, and
      // over-poisoning would force reason-free allowlist rows.
      let envPoisoned = false;
      // R25: iterate the PARSED steps, not the regex-split chunks — an
      // indented `- run:` inside a shell BODY made the splitter invent a
      // phantom claiming step, so text GitHub runs as one shell command was
      // read as a second step and covered specs it never executed. The
      // typed steps are exactly what the runner executes; each chunk is
      // still used for the text-level gates that need raw source.
      // Action-scoped env pairs seen so far in THIS job (R5 F2). Reset per
      // job: an action invoked in job A configures nothing in job B.
      const jobActionEnvPairs: Array<[string, string]> = [];
      const parsedSteps: Array<Record<string, unknown>> =
        parsedJob !== undefined && Array.isArray((parsedJob as { steps?: unknown }).steps)
          ? ((parsedJob as { steps: unknown[] }).steps as Array<Record<string, unknown>>)
          : [];
      for (const parsedStep of parsedSteps) {
        // R26: NO pairing with regex chunks. Index-pairing shifted whenever
        // a block-scalar line looked like a step, which silently moved a
        // later step's if:/continue-on-error:/env/uses gates onto the wrong
        // text. Every per-step gate below reads the PARSED step, so there is
        // no association to drift.
        const runValue = typeof parsedStep.run === "string" ? parsedStep.run : null;
        const runMatch: [string, string, string] | null =
          runValue === null ? null : ["", "", runValue];
        // Canonical stringify double-quotes scalars that plain style cannot
        // carry (e.g. a shell command ending in a colon). Unquote the
        // single-line double-quoted form (JSON-compatible by construction —
        // singleQuote: false is pinned) so the command text is scanned and
        // its suppression/shell constructs stay REPORTED rather than the
        // claim silently vanishing behind a quote character.
        if (runMatch) {
          const q = runMatch[2]!.match(/^[ \t]*("(?:[^"\\\n]|\\.)*")\s*$/);
          if (q) {
            try {
              runMatch[2] = ` ${JSON.parse(q[1]!) as string}`;
            } catch {
              /* leave quoted — belt refusals see the quote characters */
            }
          }
        }
        // R3: spelling refusal reads step METADATA only (run value stripped),
        // so JSON/prose inside a run body cannot false-dark the step. A bad
        // spelling rejects this step's own claims AND poisons the job env —
        // the unreadable metadata may hide a `uses:`/`run:` that mutates it.
        // A parsed step needs no spelling refusal: the parser already
        // resolved whatever spelling produced these keys (that refusal
        // remains for the workflow head and job heads, which are still read
        // as text).
        const stepSpelling = false;
        if (runMatch) {
          // Full-line YAML/shell comments never execute, and the step-splitter
          // glues BETWEEN-step comment lines onto the preceding step's chunk —
          // prose there routinely carries backticks/$/braces that would trip
          // the shell-construct refusal on an innocent step. Inline comments
          // are NOT stripped (the pre-# part executes; conservative).
          const cmd = runMatch[2]!
            .split("\n")
            .filter((l) => !/^[ \t]*#/.test(l))
            .join("\n");
          const stepIf = "if" in parsedStep;
          const coeValue = parsedStep["continue-on-error"];
          const stepCoe =
            coeValue !== undefined &&
            String(coeValue)
              .trim()
              .replace(/^["']|["']$/g, "")
              .toLowerCase() !== "false";
          // Whole-config claim. Evaluated against the ENTIRE run block, and
          // deliberately NOT through alias resolution: an adversarial round
          // claimed full coverage for `echo pnpm test:e2e:standalone`, for a
          // `set +e` block, and for a backgrounded `… &`, because alias
          // recursion applied the exact match to the package-script BODY while
          // qualification only ever saw the outer command. Requiring the whole
          // run block to BE the literal removes the shell reasoning entirely —
          // there is no surrounding context left to smuggle anything into.

          // Static-env spec §2.1: the union of every scope governing THIS
          // step (workflow < job < step precedence all reach its process
          // env), sorted and deduped so the reason is deterministic and
          // lists every key (§3 S5 pins the first-key-only mutant).
          const envOff = [
            ...new Set([
              ...wfEnvOff,
              ...jobEnvOff,
              ...offAllowlistEnvKeys(parsedStep.env, envKeyAllowlist),
            ]),
          ].sort();

          for (const spec of claimedSpecsOf(cmd, packageScripts, configSpecs)) {
            if (!hasPr) rejected.push({ file, spec, reason: "no pull_request trigger" });
            else if (unmodelled)
              rejected.push({ file, spec, reason: "unmodelled execution override" });
            else if (
              docMarkers ||
              wfSpelling ||
              headSpelling ||
              stepSpelling ||
              mixedStepAnywhere ||
              schemaInvalid
            )
              rejected.push({ file, spec, reason: "unmodelled YAML spelling" });
            else if (!validRunsOnJob)
              rejected.push({ file, spec, reason: "job has no valid runs-on" });
            else if (envPoisoned)
              rejected.push({
                file,
                spec,
                // Generalized with the static-env layer (static-env spec
                // §2.1): the poison flag now has two sources, and the
                // write-only wording sent a human hunting an env-file write
                // that may not exist.
                reason:
                  "earlier same-job step writes GITHUB_ENV/GITHUB_PATH or carries an unmodelled static env: key",
              });
            else if (envOff.length > 0)
              rejected.push({
                file,
                spec,
                reason: `env block sets unmodelled key(s): ${envOff.join(", ")}`,
              });
            else if (hasPathsFilter || prActivityFilter)
              rejected.push({ file, spec, reason: "pull_request.paths/paths-ignore filter" });
            else if (jobIf || stepIf)
              rejected.push({ file, spec, reason: "if: condition present" });
            else if (jobCoe || stepCoe) rejected.push({ file, spec, reason: "continue-on-error" });
            else if (suppressesExit(cmd))
              rejected.push({ file, spec, reason: "exit-code suppression" });
            else if (UNMODELLED_SHELL_RE.test(cmd))
              rejected.push({ file, spec, reason: "unmodelled shell construct" });
            else {
              covered.add(spec);
              // EFFECTIVE value only (final review (a) R5 F1). GitHub env
              // precedence is step > job > workflow, so crediting every
              // syntactically in-scope pair let a SHADOWED value keep the
              // governance of the value that actually reaches the runner:
              // root `K: inert` + job `K: required` credited BOTH, so
              // swapping them (effective value now `inert`, spec self-skips)
              // left governance byte-identical. Later writes win, so a Map
              // filled root -> job -> step holds exactly what the step sees.
              const effective = new Map<string, string>([
                ...envPairsOf((parsedDoc as { env?: unknown } | null)?.env),
                ...envPairsOf((parsedJob as { env?: unknown } | undefined)?.env),
                ...envPairsOf(parsedStep.env),
              ]);
              // Action-scoped pairs from EARLIER same-job steps (R5 F2): a
              // pair handed to a `uses:` invocation, or carried by a step of
              // the composite it resolves, is part of this job's execution
              // context from that step onward — an action gated on it can
              // decide whether the later spec does anything. Never shadows a
              // directly-scoped value; forward-only, like poison.
              const credit = (k: string, text: string) => {
                const pair = govKey(k, text);
                const set = governance.get(pair) ?? new Set<string>();
                set.add(spec);
                governance.set(pair, set);
              };
              for (const [k, text] of effective) credit(k, text);
              // EVERY distinct action-scoped value, not just the last one:
              // two actions can each be handed a different value of one key
              // and each affect the later spec independently (R6 F1).
              // ADDITIVE, never suppressed by a same-key direct value
              // (R7 F1): precedence resolves what ONE step sees, and an
              // earlier action saw its own value regardless of what the
              // claiming step later sets. Suppressing them let `K=required`
              // at an action be relocated freely whenever the claiming step
              // carried `K=inert`.
              for (const [k, text] of jobActionEnvPairs) credit(k, text);
            }
          }
        }
        if (stepSpelling) envPoisoned = true;
        // Env-write and local-action bookkeeping read the PARSED step too:
        // every scalar the step carries is serialized for the mention
        // predicate, and the uses value goes through the shared classifier.
        if (writesJobEnv(JSON.stringify(parsedStep))) envPoisoned = true;
        // Static-env spec §2.1 (LS3): a uses: step handed an off-allowlist
        // env: key is an untrusted action invocation — the action's process
        // receives the hostile env (NODE_OPTIONS into a javascript action)
        // and what it does to the job is thereafter unmodellable. Coarse
        // poison, deliberately not step-local.
        if ("uses" in parsedStep && offAllowlistEnvKeys(parsedStep.env, envKeyAllowlist).length > 0)
          envPoisoned = true;
        if (
          "uses" in parsedStep &&
          usesValuePoisons(parsedStep.uses, localActions, new Set(), envKeyAllowlist)
        )
          envPoisoned = true;
        // Accumulate action-scoped pairs for LATER claims in this job (R5 F2):
        // the invocation's own env plus every env pair inside the composite it
        // resolves, at any depth.
        // A guarded invocation provably may not run, so it configures
        // nothing (R6 F2) — same qualification the claim site already
        // applies. A Map here would also collapse two action-scoped VALUES
        // of one key and credit only the last (R6 F1), so this is a LIST.
        if ("uses" in parsedStep && !("if" in parsedStep)) {
          for (const [k, text] of envPairsOf(parsedStep.env)) jobActionEnvPairs.push([k, text]);
          for (const [k, text] of compositeEnvPairs(parsedStep.uses, localActions, new Set()))
            jobActionEnvPairs.push([k, text]);
        }
      }
    }
  }
  return { covered, rejected, governance };
}

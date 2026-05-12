import { Octokit } from "@octokit/rest";

export const FXAV_APP_REPORT_LABEL = "fxav-app:report";
export const ORPHAN_LABEL = "fxav-orphan-lost-lease";

const PAGE_SIZE = 100;
const PAGE_BOUND = 1000;

export type CreatedIssue = {
  htmlUrl: string;
  labels: string[];
  issueNumber: number;
};

export type FoundIssue = {
  htmlUrl: string;
};

export type LookupInconclusiveCode =
  | "BOT_LOGIN_MISSING"
  | "PAGINATION_ERROR"
  | "PAGINATION_BOUND"
  | "SHAPE_ERROR"
  | "DUPLICATE_LIVE_MATCHES"
  | "OPEN_ISSUE_WITH_ORPHAN_LABEL";

export class LookupInconclusive extends Error {
  readonly code: LookupInconclusiveCode;
  readonly reason: string;
  override readonly cause: unknown;

  constructor(code: LookupInconclusiveCode, reason: string, cause?: unknown) {
    super(`findIssueByMarker inconclusive (${code}): ${reason}`);
    this.name = "LookupInconclusive";
    this.code = code;
    this.reason = reason;
    this.cause = cause;
  }
}

export class GitHubIssueInfraError extends Error {
  readonly operation: "createIssue" | "closeIssueAsOrphan";
  readonly source: "returned_error" | "thrown_error";
  override readonly cause: unknown;

  constructor(operation: GitHubIssueInfraError["operation"], cause: unknown) {
    super(`GitHub issue ${operation} failed`);
    this.name = "GitHubIssueInfraError";
    this.operation = operation;
    this.source = "thrown_error";
    this.cause = cause;
  }
}

type GitHubEnv = {
  GITHUB_API_TOKEN?: string | undefined;
  GITHUB_REPO?: string | undefined;
  GITHUB_BOT_LOGIN?: string | undefined;
};

type IssueLabel = string | { name?: string | null } | null | undefined;

type IssueLike = {
  html_url?: unknown;
  number?: unknown;
  body?: unknown;
  created_at?: unknown;
  state?: unknown;
  state_reason?: unknown;
  labels?: unknown;
  pull_request?: unknown;
};

type IssuesOctokit = {
  rest: {
    issues: {
      create?: (params: Record<string, unknown>) => Promise<{ data: unknown }>;
      listForRepo?: (params: Record<string, unknown>) => Promise<{ data: unknown }>;
      update?: (params: Record<string, unknown>) => Promise<{ data: unknown }>;
    };
  };
};

type IssuesDeps = {
  octokit?: IssuesOctokit;
  env?: GitHubEnv;
};

function envFromDeps(deps?: IssuesDeps): GitHubEnv {
  return deps?.env ?? {
    GITHUB_API_TOKEN: process.env.GITHUB_API_TOKEN,
    GITHUB_REPO: process.env.GITHUB_REPO,
    GITHUB_BOT_LOGIN: process.env.GITHUB_BOT_LOGIN,
  };
}

function parseRepo(env: GitHubEnv): { owner: string; repo: string } {
  const repoValue = env.GITHUB_REPO?.trim();
  if (!repoValue) {
    throw new LookupInconclusive("SHAPE_ERROR", "GITHUB_REPO env var is unset");
  }
  const [owner, repo] = repoValue.split("/");
  if (!owner || !repo || repoValue.split("/").length !== 2) {
    throw new LookupInconclusive("SHAPE_ERROR", `invalid GITHUB_REPO: ${repoValue}`);
  }
  return { owner, repo };
}

function octokitFromDeps(deps?: IssuesDeps): IssuesOctokit {
  if (deps?.octokit) return deps.octokit;
  const token = envFromDeps(deps).GITHUB_API_TOKEN;
  return new Octokit({ auth: token, request: { timeout: 15_000 } }) as unknown as IssuesOctokit;
}

function labelNames(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label: IssueLabel) => {
      if (typeof label === "string") return label;
      if (label && typeof label === "object" && typeof label.name === "string") return label.name;
      return null;
    })
    .filter((label): label is string => Boolean(label));
}

function labelsWithReserved(labels: string[]): string[] {
  return labels.includes(FXAV_APP_REPORT_LABEL) ? labels : [...labels, FXAV_APP_REPORT_LABEL];
}

function labelsWithOrphan(labels: string[]): string[] {
  const withReport = labelsWithReserved(labels);
  return withReport.includes(ORPHAN_LABEL) ? withReport : [...withReport, ORPHAN_LABEL];
}

function issueMarker(idempotencyKey: string): string {
  return `<!-- fxav-report-id: ${idempotencyKey} -->`;
}

function assertIssueCreateShape(data: unknown): CreatedIssue {
  const issue = data as IssueLike;
  if (typeof issue?.html_url !== "string" || typeof issue.number !== "number") {
    throw new Error("createIssue returned unexpected issue shape");
  }

  return {
    htmlUrl: issue.html_url,
    issueNumber: issue.number,
    labels: labelNames(issue.labels),
  };
}

export async function createIssue(
  opts: { title: string; body: string; labels: string[] },
  deps?: IssuesDeps,
): Promise<CreatedIssue> {
  const { owner, repo } = parseRepo(envFromDeps(deps));
  const octokit = octokitFromDeps(deps);
  const create = octokit.rest.issues.create;
  if (!create) {
    throw new GitHubIssueInfraError("createIssue", new Error("octokit.rest.issues.create is missing"));
  }

  try {
    const response = await create({
      owner,
      repo,
      title: opts.title,
      body: opts.body,
      labels: labelsWithReserved(opts.labels),
    });
    return assertIssueCreateShape(response.data);
  } catch (cause) {
    throw new GitHubIssueInfraError("createIssue", cause);
  }
}

export async function closeIssueAsOrphan(issue: CreatedIssue, deps?: IssuesDeps): Promise<void> {
  const { owner, repo } = parseRepo(envFromDeps(deps));
  const octokit = octokitFromDeps(deps);
  const update = octokit.rest.issues.update;
  if (!update) {
    throw new GitHubIssueInfraError(
      "closeIssueAsOrphan",
      new Error("octokit.rest.issues.update is missing"),
    );
  }

  try {
    await update({
      owner,
      repo,
      issue_number: issue.issueNumber,
      state: "closed",
      state_reason: "not_planned",
      labels: labelsWithOrphan(issue.labels),
    });
  } catch (cause) {
    throw new GitHubIssueInfraError("closeIssueAsOrphan", cause);
  }
}

function issueCreatedAtMs(issue: IssueLike): number {
  if (typeof issue.created_at !== "string") {
    throw new LookupInconclusive("SHAPE_ERROR", "issue.created_at is not a string");
  }
  const createdAtMs = Date.parse(issue.created_at);
  if (Number.isNaN(createdAtMs)) {
    throw new LookupInconclusive("SHAPE_ERROR", `invalid issue.created_at: ${issue.created_at}`);
  }
  return createdAtMs;
}

function candidateFromIssue(issue: IssueLike, marker: string, cutoffMs: number): FoundIssue | null {
  if (issue.pull_request) return null;

  const createdAtMs = issueCreatedAtMs(issue);
  if (createdAtMs < cutoffMs) return null;

  if (typeof issue.body !== "string") {
    throw new LookupInconclusive("SHAPE_ERROR", "in-window issue.body is not a string");
  }
  if (!issue.body.includes(marker)) return null;

  if (issue.state !== "open" && issue.state !== "closed") {
    throw new LookupInconclusive("SHAPE_ERROR", "marker-bearing issue.state is not open/closed");
  }
  if (!Array.isArray(issue.labels)) {
    throw new LookupInconclusive("SHAPE_ERROR", "marker-bearing issue.labels is not an array");
  }
  if (typeof issue.html_url !== "string") {
    throw new LookupInconclusive("SHAPE_ERROR", "marker-bearing issue.html_url is not a string");
  }

  const labels = labelNames(issue.labels);
  if (issue.state === "closed" && issue.state_reason === "not_planned") return null;
  if (issue.state === "open" && labels.includes(ORPHAN_LABEL)) {
    throw new LookupInconclusive(
      "OPEN_ISSUE_WITH_ORPHAN_LABEL",
      "open marker-bearing issue carries orphan cleanup label",
    );
  }
  return { htmlUrl: issue.html_url };
}

export async function findIssueByMarker(
  idempotencyKey: string,
  cutoffIso: string,
  deps?: IssuesDeps,
): Promise<FoundIssue | null> {
  const env = envFromDeps(deps);
  const botLogin = env.GITHUB_BOT_LOGIN?.trim();
  if (!botLogin) {
    throw new LookupInconclusive("BOT_LOGIN_MISSING", "GITHUB_BOT_LOGIN env var is unset");
  }

  const cutoffMs = Date.parse(cutoffIso);
  if (Number.isNaN(cutoffMs)) {
    throw new LookupInconclusive("SHAPE_ERROR", `invalid cutoffIso: ${cutoffIso}`);
  }

  const { owner, repo } = parseRepo(env);
  const octokit = octokitFromDeps(deps);
  const listForRepo = octokit.rest.issues.listForRepo;
  if (!listForRepo) {
    throw new LookupInconclusive("SHAPE_ERROR", "octokit.rest.issues.listForRepo is missing");
  }

  const marker = issueMarker(idempotencyKey);
  const matches: FoundIssue[] = [];

  for (let page = 1; page <= PAGE_BOUND; page += 1) {
    let data: unknown;
    try {
      const response = await listForRepo({
        owner,
        repo,
        creator: botLogin,
        labels: FXAV_APP_REPORT_LABEL,
        since: cutoffIso,
        state: "all",
        per_page: PAGE_SIZE,
        page,
      });
      data = response.data;
    } catch (cause) {
      throw new LookupInconclusive("PAGINATION_ERROR", "listForRepo threw during pagination", cause);
    }

    if (!Array.isArray(data)) {
      throw new LookupInconclusive("SHAPE_ERROR", "listForRepo response.data is not an array");
    }

    for (const rawIssue of data) {
      const candidate = candidateFromIssue(rawIssue as IssueLike, marker, cutoffMs);
      if (candidate) matches.push(candidate);
    }

    if (data.length < PAGE_SIZE) {
      if (matches.length === 0) return null;
      if (matches.length === 1) return matches[0] ?? null;
      throw new LookupInconclusive(
        "DUPLICATE_LIVE_MATCHES",
        `found ${matches.length} live marker-bearing issues`,
      );
    }
  }

  throw new LookupInconclusive("PAGINATION_BOUND", `exceeded ${PAGE_BOUND} pages`);
}

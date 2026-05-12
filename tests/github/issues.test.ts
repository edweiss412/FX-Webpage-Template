import { describe, expect, test } from "vitest";

import {
  FXAV_APP_REPORT_LABEL,
  ORPHAN_LABEL,
  GitHubIssueInfraError,
  LookupInconclusive,
  createIssue,
  findIssueByMarker,
} from "@/lib/github/issues";

const repoEnv = {
  GITHUB_API_TOKEN: "ghp_test",
  GITHUB_REPO: "edweiss412/FX-Webpage-Template",
  GITHUB_BOT_LOGIN: "fxav-bot",
};

function issue(overrides: Record<string, unknown> = {}) {
  return {
    html_url: "https://github.com/edweiss412/FX-Webpage-Template/issues/123",
    number: 123,
    body: "<!-- fxav-report-id: 018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5 -->",
    created_at: "2026-05-12T12:00:00Z",
    state: "open",
    state_reason: null,
    labels: [{ name: FXAV_APP_REPORT_LABEL }],
    ...overrides,
  };
}

function octokitWithPages(pages: unknown[][]) {
  const listCalls: unknown[] = [];
  return {
    listCalls,
    octokit: {
      rest: {
        issues: {
          listForRepo: async (params: unknown) => {
            listCalls.push(params);
            return { data: pages.shift() ?? [] };
          },
          create: async () => {
            throw new Error("unexpected create call");
          },
        },
      },
    },
  };
}

describe("GitHub Issues client", () => {
  test("createIssue appends the reserved recovery label and returns normalized issue shape", async () => {
    const createCalls: unknown[] = [];
    const octokit = {
      rest: {
        issues: {
          create: async (params: unknown) => {
            createCalls.push(params);
            return {
              data: {
                html_url: "https://github.com/edweiss412/FX-Webpage-Template/issues/7",
                number: 7,
                labels: ["bug-report", { name: FXAV_APP_REPORT_LABEL }],
              },
            };
          },
        },
      },
    };

    const result = await createIssue(
      { title: "Bug", body: "Body", labels: ["bug-report", "reporter:admin"] },
      { octokit, env: repoEnv },
    );

    expect(createCalls).toEqual([
      {
        owner: "edweiss412",
        repo: "FX-Webpage-Template",
        title: "Bug",
        body: "Body",
        labels: ["bug-report", "reporter:admin", FXAV_APP_REPORT_LABEL],
      },
    ]);
    expect(result).toEqual({
      htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/7",
      issueNumber: 7,
      labels: ["bug-report", FXAV_APP_REPORT_LABEL],
    });
  });

  test("createIssue wraps Octokit throws as GitHubIssueInfraError", async () => {
    const octokit = {
      rest: {
        issues: {
          create: async () => {
            throw new Error("GitHub unavailable");
          },
        },
      },
    };

    await expect(
      createIssue({ title: "Bug", body: "Body", labels: ["bug-report"] }, { octokit, env: repoEnv }),
    ).rejects.toBeInstanceOf(GitHubIssueInfraError);
  });

  test("findIssueByMarker uses listForRepo creator/since/state/reserved-label filters and paginates", async () => {
    const matching = issue();
    const { octokit, listCalls } = octokitWithPages([
      Array.from({ length: 100 }, (_, idx) =>
        issue({
          html_url: `https://github.com/edweiss412/FX-Webpage-Template/issues/${idx}`,
          body: "unrelated",
        }),
      ),
      [matching],
    ]);

    const result = await findIssueByMarker(
      "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
      "2026-05-11T12:00:00Z",
      { octokit, env: repoEnv },
    );

    expect(result).toEqual({
      htmlUrl: "https://github.com/edweiss412/FX-Webpage-Template/issues/123",
    });
    expect(listCalls).toEqual([
      {
        owner: "edweiss412",
        repo: "FX-Webpage-Template",
        creator: "fxav-bot",
        labels: FXAV_APP_REPORT_LABEL,
        since: "2026-05-11T12:00:00Z",
        state: "all",
        per_page: 100,
        page: 1,
      },
      {
        owner: "edweiss412",
        repo: "FX-Webpage-Template",
        creator: "fxav-bot",
        labels: FXAV_APP_REPORT_LABEL,
        since: "2026-05-11T12:00:00Z",
        state: "all",
        per_page: 100,
        page: 2,
      },
    ]);
  });

  test("findIssueByMarker filters by issue.created_at using caller DB-derived cutoff", async () => {
    const { octokit } = octokitWithPages([
      [
        issue({
          created_at: "2026-05-10T11:59:59Z",
          html_url: "https://github.com/edweiss412/FX-Webpage-Template/issues/old",
        }),
      ],
    ]);

    const result = await findIssueByMarker(
      "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
      "2026-05-11T12:00:00Z",
      { octokit, env: repoEnv },
    );

    expect(result).toBeNull();
  });

  test("findIssueByMarker skips closed not_planned orphan issues even without the orphan label", async () => {
    const { octokit } = octokitWithPages([
      [issue({ state: "closed", state_reason: "not_planned", labels: [FXAV_APP_REPORT_LABEL] })],
    ]);

    const result = await findIssueByMarker(
      "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
      "2026-05-11T12:00:00Z",
      { octokit, env: repoEnv },
    );

    expect(result).toBeNull();
  });

  test("findIssueByMarker fails closed on open issue carrying orphan label", async () => {
    const { octokit } = octokitWithPages([
      [issue({ labels: [FXAV_APP_REPORT_LABEL, ORPHAN_LABEL] })],
    ]);

    await expect(
      findIssueByMarker("018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5", "2026-05-11T12:00:00Z", {
        octokit,
        env: repoEnv,
      }),
    ).rejects.toMatchObject({ code: "OPEN_ISSUE_WITH_ORPHAN_LABEL" });
  });

  test("findIssueByMarker fails closed on duplicate live matches", async () => {
    const { octokit } = octokitWithPages([
      [
        issue({ html_url: "https://github.com/edweiss412/FX-Webpage-Template/issues/1" }),
        issue({ html_url: "https://github.com/edweiss412/FX-Webpage-Template/issues/2" }),
      ],
    ]);

    await expect(
      findIssueByMarker("018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5", "2026-05-11T12:00:00Z", {
        octokit,
        env: repoEnv,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_LIVE_MATCHES" });
  });

  test("findIssueByMarker fails closed on missing bot login and pagination errors", async () => {
    const { octokit } = octokitWithPages([[]]);

    await expect(
      findIssueByMarker("018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5", "2026-05-11T12:00:00Z", {
        octokit,
        env: { ...repoEnv, GITHUB_BOT_LOGIN: "" },
      }),
    ).rejects.toMatchObject({ code: "BOT_LOGIN_MISSING" });

    const failingOctokit = {
      rest: {
        issues: {
          listForRepo: async () => {
            throw new Error("pagination failed");
          },
        },
      },
    };

    await expect(
      findIssueByMarker("018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5", "2026-05-11T12:00:00Z", {
        octokit: failingOctokit,
        env: repoEnv,
      }),
    ).rejects.toBeInstanceOf(LookupInconclusive);
    await expect(
      findIssueByMarker("018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5", "2026-05-11T12:00:00Z", {
        octokit: failingOctokit,
        env: repoEnv,
      }),
    ).rejects.toMatchObject({ code: "PAGINATION_ERROR" });
  });
});

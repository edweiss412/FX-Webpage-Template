// tests/parser/mutation/fixtures.ts
import { readFileSync } from "node:fs";

export type FixtureRef = { slug: string; family: "xlsx" | "raw"; path: string };

const XLSX = ["consultants", "east-coast", "fintech", "fixed-income", "redefining-fi", "ria", "rpas"];
const RAW = [
  "2024-05-east-coast-family-office", "2025-03-dci-rpas-central", "2025-04-asset-mgmt-cfo-coo",
  "2025-05-redefining-fixed-income-private-credit", "2025-06-ria-investment-forum",
  "2025-10-consultants-roundtable", "2025-10-fixed-income-trading-summit",
  "2026-03-rpas-central-four-seasons", "2026-04-asset-mgmt-cfo-coo-waldorf", "2026-05-fintech-forum-cto-summit",
];

export const FIXTURES: FixtureRef[] = [
  ...XLSX.map((slug): FixtureRef => ({ slug, family: "xlsx", path: `fixtures/shows/exporter-xlsx/${slug}.md` })),
  ...RAW.map((slug): FixtureRef => ({ slug, family: "raw", path: `fixtures/shows/raw/${slug}.md` })),
];

export const readFixture = (f: FixtureRef): string => readFileSync(f.path, "utf8");

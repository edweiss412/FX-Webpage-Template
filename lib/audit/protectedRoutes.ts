import { execFileSync } from "node:child_process";

import { PROTECTED_ROUTES, classifyTrustDomain } from "@/lib/audit/trustDomains";
import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

export function liveRouteFilesFromGit(): string[] {
  const out = execFileSync(
    "git",
    [
      "ls-files",
      "app/api/**/route.ts",
      "app/admin/page.tsx",
      "app/admin/**/page.tsx",
      "app/show/**/page.tsx",
      "app/me/page.tsx",
      "app/me/**/page.tsx",
    ],
    { encoding: "utf8" },
  );
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

export function auditProtectedRouteCompleteness(): string[] {
  const findings: string[] = [];
  const listed = new Set(PROTECTED_ROUTES.map((route) => route.path));
  for (const file of liveRouteFilesFromGit()) {
    if (!listed.has(file)) {
      findings.push(`${file} is not classified in TRUST_DOMAINS`);
    }
  }
  const live = liveRouteFilesFromGit();
  for (const route of PROTECTED_ROUTES) {
    if (route.path === "middleware.ts") continue;
    if (!live.includes(route.path) && route.path.startsWith("app/") && route.path.endsWith("/page.tsx")) {
      findings.push(`${route.path} is listed in PROTECTED_ROUTES but is not a live route`);
    }
  }

  for (const file of walkSourceFiles(["app/api", "app/admin", "app/show", "app/me"])) {
    if (classifyTrustDomain(file) === "unclassified") {
      findings.push(`${file} is not classified in TRUST_DOMAINS`);
    }
  }
  return findings;
}

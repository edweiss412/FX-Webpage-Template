# Phase A — Foundation

**Scope:** Land the MDX pipeline, the gated `/help` layout, the nav registry, and the page-chrome components (`<Sidebar>`, `<Header>`, `<Breadcrumb>`). Phase A unblocks everything else; it does NOT depend on any other M11 phase.

**Prereqs:** M10 close-out (per AC-11.22). No M11 dependency.

**Tasks:** A.1 → A.7 (7 tasks). Linear order; intra-phase parallelization not recommended (each task depends on the previous task's commits).

---

### Task A.1: Add `@next/mdx` pipeline + `pageExtensions`

**Files:**
- Modify: `package.json` (add three deps)
- Modify: `next.config.ts` (wrap with `withMDX`, add `pageExtensions`)
- Create: `mdx-components.tsx` (project root)

- [ ] **Step 1: Write the failing test**

Create `tests/help/_mdx-pipeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("MDX pipeline", () => {
  it("mdx-components.tsx exists at project root", () => {
    expect(existsSync(join(process.cwd(), "mdx-components.tsx"))).toBe(true);
  });

  it("next.config.ts registers mdx in pageExtensions", async () => {
    const cfg = await import("@/next.config");
    expect(cfg.default.pageExtensions).toContain("mdx");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/_mdx-pipeline.test.ts`
Expected: FAIL (`mdx-components.tsx` does not exist; `pageExtensions` does not include `mdx`).

- [ ] **Step 3: Add four deps to `package.json`**

Run two commands:

```bash
pnpm add @next/mdx @mdx-js/loader @mdx-js/react
pnpm add -D @types/mdx
```

Expected `package.json` additions (versions may differ — accept whatever pnpm resolves):

```json
// dependencies:
"@next/mdx": "^15.x",
"@mdx-js/loader": "^3.x",
"@mdx-js/react": "^3.x",
// devDependencies:
"@types/mdx": "^2.x"
```

The `@types/mdx` dev dep is required for `import type { MDXComponents } from "mdx/types"` in Step 4 — without it, `pnpm typecheck` fails with a module-resolution error (r3 fix per Phase A round-2 finding 1).

- [ ] **Step 4: Create `mdx-components.tsx` at project root**

```tsx
// mdx-components.tsx
import type { MDXComponents } from "mdx/types";

/**
 * M11 Phase A — required by @next/mdx App Router integration.
 *
 * Returns the global MDX component overrides used by every .mdx file under
 * app/help/. Phase D will add the help-specific components (Callout, Step,
 * Screenshot, etc.) by extending the returned object.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    // Phase D will register Callout / Step / Screenshot / RefAnchor / TipFromSheets here.
  };
}
```

- [ ] **Step 5: Update `next.config.ts` — add `pageExtensions` + wrap with `withMDX`**

```ts
// next.config.ts
import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX({
  // No remark/rehype plugins in v1 — keep MDX vanilla.
});

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    authInterrupts: true,
  },
  pageExtensions: ["ts", "tsx", "mdx"],
};

export default withMDX(nextConfig);
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm typecheck && pnpm test tests/help/_mdx-pipeline.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts mdx-components.tsx tests/help/_mdx-pipeline.test.ts
git commit -m "feat(help): wire @next/mdx pipeline + pageExtensions + @types/mdx (Task A.1)"
```

---

### Task A.2: Create `app/help/layout.tsx` with `requireAdmin` + `AdminInfraError` catch

**Files:**
- Create: `app/help/layout.tsx`
- Create: `app/help/page.mdx` (placeholder landing page — Phase E replaces content)
- Create: `tests/help/auth-stub.test.ts` (smoke test; full auth gate test is Phase H Task H.1)

- [ ] **Step 1: Write the failing test (smoke)**

Create `tests/help/auth-stub.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("/help layout (Phase A smoke)", () => {
  it("app/help/layout.tsx exists", () => {
    expect(existsSync(join(process.cwd(), "app/help/layout.tsx"))).toBe(true);
  });

  it("app/help/layout.tsx calls requireAdmin and catches AdminInfraError", () => {
    const src = readFileSync(join(process.cwd(), "app/help/layout.tsx"), "utf8");
    expect(src).toContain("requireAdmin");
    expect(src).toContain("AdminInfraError");
  });

  it("app/help/layout.tsx exports dynamic = 'force-dynamic'", () => {
    const src = readFileSync(join(process.cwd(), "app/help/layout.tsx"), "utf8");
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  });

  it("app/help/page.mdx exists", () => {
    expect(existsSync(join(process.cwd(), "app/help/page.mdx"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/auth-stub.test.ts`
Expected: FAIL (files don't exist).

- [ ] **Step 3: Create `app/help/layout.tsx`**

Per spec §3.5 and §3.4 — mirror `app/admin/layout.tsx:47-71` for the AdminInfraError catch:

```tsx
// app/help/layout.tsx
import type { ReactNode } from "react";
import {
  AdminInfraError,
  requireAdmin,
} from "@/lib/auth/requireAdmin";
import { messageFor } from "@/lib/messages/lookup";

// Spec §3.2 / §3.4: requireAdmin runs Supabase queries per request, so
// the /help tree is dynamic, not statically prerendered. Explicit flag
// makes this visible to Next.js and to readers.
export const dynamic = "force-dynamic";

export default async function HelpLayout({ children }: { children: ReactNode }) {
  // Mirrors app/admin/layout.tsx:47-71 verbatim. Phase H Task H.1 verifies
  // both arms (admin OK, unauth/crew 403, infra-stub 500-class surface).
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminInfraError) {
      const entry = messageFor(err.code as never);
      return (
        <div
          data-testid="help-layout-infra-error"
          className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-page-pad-mobile sm:p-page-pad-desktop text-center"
        >
          <h1 className="text-2xl font-semibold">Help unavailable</h1>
          <p className="mt-4 text-base text-text-subtle">
            {entry.dougFacing ?? entry.crewFacing ?? "Please try again in a moment."}
          </p>
          <a
            href="/admin"
            className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
          >
            Try again
          </a>
        </div>
      );
    }
    throw err;
  }

  // Phase A.4 + A.5 + A.6 will add the Sidebar / Header / Breadcrumb chrome
  // around children. Placeholder until those tasks land.
  return <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>;
}
```

- [ ] **Step 4: Create `app/help/page.mdx` (placeholder)**

```mdx
{/* app/help/page.mdx — Phase A placeholder; Phase E Task E.1 replaces content */}

# Help

Phase E will replace this placeholder with the landing copy.
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm typecheck && pnpm test tests/help/auth-stub.test.ts`
Expected: PASS.

- [ ] **Step 6: Manually verify the page renders for an admin**

Run: `pnpm dev` (port 3000)
Visit: `http://localhost:3000/help` with an authenticated admin session
Expected: placeholder "Help" heading renders.
Visit: `http://localhost:3000/help` unauthenticated
Expected: 403 (forbidden() per `requireAdmin`).

- [ ] **Step 7: Commit**

```bash
git add app/help/layout.tsx app/help/page.mdx tests/help/auth-stub.test.ts
git commit -m "feat(help): create /help layout with requireAdmin + AdminInfraError catch (Task A.2)"
```

---

### Task A.3: Create `_nav.ts` nav registry

**Files:**
- Create: `app/help/_nav.ts`

The registry is the single source of truth for the sidebar nav, breadcrumb derivation, and the nav-consistency meta-test (Task A.7). Per spec §3.3, the registry uses the underscore-prefix App Router convention so it's not a route.

- [ ] **Step 1: Write the failing test**

Create `tests/help/_nav-shape.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NAV, type NavEntry } from "@/app/help/_nav";

describe("app/help/_nav.ts shape", () => {
  it("NAV is a non-empty array", () => {
    expect(Array.isArray(NAV)).toBe(true);
    expect(NAV.length).toBeGreaterThan(0);
  });

  it("every entry has slug, title, and group", () => {
    for (const entry of NAV) {
      expect(typeof entry.slug).toBe("string");
      expect(typeof entry.title).toBe("string");
      expect(["get-started", "admin-surface", "reference"]).toContain(entry.group);
    }
  });

  it("includes all 13 v1 pages by slug", () => {
    const slugs = NAV.map((e: NavEntry) => e.slug).sort();
    expect(slugs).toEqual(
      [
        "/help",
        "/help/admin/dashboard",
        "/help/admin/onboarding-wizard",
        "/help/admin/parse-warnings",
        "/help/admin/per-show-panel",
        "/help/admin/preview-as-crew",
        "/help/admin/review-queues",
        "/help/admin/sharing-links",
        "/help/daily-rhythm",
        "/help/errors",
        "/help/getting-started",
        "/help/tour",
        "/help/whats-different",
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/_nav-shape.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `app/help/_nav.ts`**

```ts
// app/help/_nav.ts — M11 Phase A.3
//
// Single source of truth for the /help sidebar nav, breadcrumb derivation, and
// the nav-consistency meta-test (Phase A.7). Spec §3.3 + §4.1–§4.3.

export type NavGroup = "get-started" | "admin-surface" | "reference";

export type NavEntry = {
  slug: string;       // e.g., "/help/admin/dashboard"
  title: string;      // sidebar + breadcrumb label
  group: NavGroup;
};

export const NAV: ReadonlyArray<NavEntry> = [
  // Get started
  { slug: "/help", title: "What this app does for you", group: "get-started" },
  { slug: "/help/getting-started", title: "First-time setup", group: "get-started" },
  { slug: "/help/daily-rhythm", title: "Your new daily rhythm", group: "get-started" },
  { slug: "/help/whats-different", title: "What's different from Sheets", group: "get-started" },

  // Admin surface
  { slug: "/help/admin/dashboard", title: "Reading the dashboard", group: "admin-surface" },
  { slug: "/help/admin/review-queues", title: "Review queues", group: "admin-surface" },
  { slug: "/help/admin/parse-warnings", title: "Parse warnings", group: "admin-surface" },
  { slug: "/help/admin/per-show-panel", title: "Per-show panel", group: "admin-surface" },
  { slug: "/help/admin/preview-as-crew", title: "Preview as crew", group: "admin-surface" },
  { slug: "/help/admin/sharing-links", title: "Sharing crew links", group: "admin-surface" },
  { slug: "/help/admin/onboarding-wizard", title: "Onboarding wizard", group: "admin-surface" },

  // Reference
  { slug: "/help/tour", title: "Tour", group: "reference" },
  { slug: "/help/errors", title: "Errors", group: "reference" },
];

export const NAV_GROUP_TITLES: Record<NavGroup, string> = {
  "get-started": "Get started",
  "admin-surface": "The admin surface",
  reference: "Reference",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm typecheck && pnpm test tests/help/_nav-shape.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/help/_nav.ts tests/help/_nav-shape.test.ts
git commit -m "feat(help): _nav.ts registry with 13 v1 pages (Task A.3)"
```

---

### Task A.4: `<Sidebar>` component

**Files:**
- Create: `app/help/_components/Sidebar.tsx`

Renders the registry from `_nav.ts` grouped by `NavGroup`; current page highlighted via `usePathname()`; collapses to a top-of-page `<details>` disclosure under 768px (spec §6.1).

- [ ] **Step 1: Write the failing test**

Create `tests/help/sidebar.test.tsx`. **Vitest env note (r2 — round-1 finding 1):** the live vitest config has `environment: "node"` + `globals: false`. React DOM tests MUST start with the `// @vitest-environment jsdom` comment AND import `vi` explicitly:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/app/help/_components/Sidebar";

// Mock usePathname so the current-page highlight is testable.
// r3 (Phase A round-2 finding 2): use vi.hoisted to lift the mock fn
// definition above vi.mock's hoisting. A plain `const mockUsePathname`
// would still be in the temporal-dead zone when vi.mock's factory runs.
const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/help/admin/dashboard"),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("<Sidebar>", () => {
  it("renders every nav entry as a link", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "What this app does for you" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reading the dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Errors" })).toBeInTheDocument();
  });

  it("renders the three group headings", () => {
    render(<Sidebar />);
    expect(screen.getByText("Get started")).toBeInTheDocument();
    expect(screen.getByText("The admin surface")).toBeInTheDocument();
    expect(screen.getByText("Reference")).toBeInTheDocument();
  });

  it("marks the current page with aria-current", () => {
    render(<Sidebar />);
    const current = screen.getByRole("link", { name: "Reading the dashboard" });
    expect(current).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/sidebar.test.tsx`
Expected: FAIL (component not found).

- [ ] **Step 3: Implement `Sidebar`**

```tsx
// app/help/_components/Sidebar.tsx
"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NAV, NAV_GROUP_TITLES, type NavGroup } from "../_nav";

export function Sidebar() {
  const pathname = usePathname();
  const grouped: Record<NavGroup, typeof NAV[number][]> = {
    "get-started": [],
    "admin-surface": [],
    reference: [],
  };
  for (const entry of NAV) grouped[entry.group].push(entry);

  return (
    <nav aria-label="Help navigation" className="md:w-60 md:shrink-0 md:pr-6">
      {/* Mobile: collapsed disclosure under 768px (spec §6.1) */}
      <details className="md:hidden mb-4">
        <summary className="cursor-pointer min-h-tap-min text-base font-semibold py-2">
          Browse help pages
        </summary>
        <NavList grouped={grouped} pathname={pathname} />
      </details>
      {/* Desktop: always-visible sidebar */}
      <div className="hidden md:block">
        <NavList grouped={grouped} pathname={pathname} />
      </div>
    </nav>
  );
}

function NavList({
  grouped,
  pathname,
}: {
  grouped: Record<NavGroup, typeof NAV[number][]>;
  pathname: string;
}) {
  return (
    <ul className="space-y-section-gap">
      {(Object.keys(grouped) as NavGroup[]).map((g) => (
        <li key={g}>
          <h3 className="text-xs uppercase tracking-wider text-text-subtle mb-2">
            {NAV_GROUP_TITLES[g]}
          </h3>
          <ul className="space-y-1">
            {grouped[g].map((entry) => {
              const isCurrent = entry.slug === pathname;
              return (
                <li key={entry.slug}>
                  <Link
                    href={entry.slug}
                    aria-current={isCurrent ? "page" : undefined}
                    // r2 (round-1 finding 3): use live @theme tokens.
                    // Verified at plan-write time via
                    // grep -E "^\s*--color-(accent|surface)" app/globals.css:
                    // available: surface, surface-raised, surface-sunken,
                    // accent, accent-hover, accent-text, accent-on-bg.
                    // No "accent-soft" or "surface-2" exist; use
                    // surface-raised for hover + accent-text + accent
                    // background for current.
                    className={
                      isCurrent
                        ? "block min-h-tap-min py-1 px-2 -mx-2 rounded bg-accent text-accent-text font-semibold"
                        : "block min-h-tap-min py-1 px-2 -mx-2 rounded text-text-subtle hover:bg-surface-raised"
                    }
                  >
                    {entry.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm typecheck && pnpm test tests/help/sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/help/_components/Sidebar.tsx tests/help/sidebar.test.tsx
git commit -m "feat(help): Sidebar component with mobile-collapse + aria-current highlight (Task A.4)"
```

---

### Task A.5: `<Header>` component

**Files:**
- Create: `app/help/_components/Header.tsx`

Logo + theme toggle + "Back to admin →" link. Spec §6.1. Reuses theme toggle pattern; do NOT duplicate the toggle implementation — survey existing `/admin` or `/show` theme-toggle component during implementation (open question #5 in the spec).

- [ ] **Step 1: Write the failing test**

Create `tests/help/header.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "@/app/help/_components/Header";

// ThemeToggle reads/writes localStorage; mock it so Header tests focus on
// Header structure, not theme behavior.
vi.mock("@/components/layout/ThemeToggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

describe("<Header>", () => {
  it("renders 'Back to admin →' link to /admin", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: /back to admin/i });
    expect(link).toHaveAttribute("href", "/admin");
  });

  it("renders the FXAV brand mark", () => {
    render(<Header />);
    expect(screen.getByTestId("help-header-brand")).toBeInTheDocument();
  });

  it("renders the theme toggle (AC-11.4)", () => {
    // r2 (Phase A round-1 finding 2): the Header MUST render the existing
    // components/layout/ThemeToggle. Test asserts presence so the toggle
    // can't silently drop out in a future Header edit.
    render(<Header />);
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/header.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `Header`**

```tsx
// app/help/_components/Header.tsx
import Link from "next/link";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border py-4 mb-6">
      <Link href="/help" data-testid="help-header-brand" className="font-semibold text-text-strong">
        FXAV Help
      </Link>
      <div className="flex items-center gap-4">
        {/* r2 — round-1 finding 2: ThemeToggle is REQUIRED per AC-11.4.
            The component lives at components/layout/ThemeToggle.tsx
            (verified at plan-write time via `find components -name ThemeToggle`). */}
        <ThemeToggle />
        <Link
          href="/admin"
          className="text-sm text-text-subtle hover:text-text-strong underline underline-offset-2 min-h-tap-min flex items-center"
        >
          Back to admin →
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm typecheck && pnpm test tests/help/header.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/help/_components/Header.tsx tests/help/header.test.tsx
git commit -m "feat(help): Header component with brand + back-to-admin link (Task A.5)"
```

---

### Task A.6: `<Breadcrumb>` component + wire chrome into `layout.tsx`

**Files:**
- Create: `app/help/_components/Breadcrumb.tsx`
- Modify: `app/help/layout.tsx` (compose Sidebar / Header / Breadcrumb around `{children}`)

- [ ] **Step 1: Write the failing test**

Create `tests/help/breadcrumb.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumb } from "@/app/help/_components/Breadcrumb";

// r3 (Phase A round-2 finding 2): vi.hoisted to lift the mock fn above
// vi.mock's hoisting — same TDZ-avoidance pattern as Sidebar test.
const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/help/admin/dashboard"),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("<Breadcrumb>", () => {
  it("renders Help > group > page for a known route", () => {
    mockUsePathname.mockReturnValue("/help/admin/dashboard");
    render(<Breadcrumb />);
    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.getByText("The admin surface")).toBeInTheDocument();
    expect(screen.getByText("Reading the dashboard")).toBeInTheDocument();
  });

  it("degrades to just 'Help' when pathname is not in the registry", () => {
    mockUsePathname.mockReturnValue("/help/unknown");
    render(<Breadcrumb />);
    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.queryByText("The admin surface")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/breadcrumb.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `Breadcrumb`**

```tsx
// app/help/_components/Breadcrumb.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, NAV_GROUP_TITLES } from "../_nav";

export function Breadcrumb() {
  const pathname = usePathname();
  const entry = NAV.find((e) => e.slug === pathname);

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-text-subtle mb-4">
      <ol className="flex items-center gap-2">
        <li>
          <Link href="/help" className="hover:text-text-strong">Help</Link>
        </li>
        {entry && (
          <>
            <li aria-hidden="true">/</li>
            <li>{NAV_GROUP_TITLES[entry.group]}</li>
            <li aria-hidden="true">/</li>
            <li className="text-text-strong" aria-current="page">{entry.title}</li>
          </>
        )}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 4: Wire chrome into `app/help/layout.tsx`**

Replace the placeholder `return` in Task A.2's layout with:

```tsx
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <Header />
      <div className="md:flex md:gap-6">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Breadcrumb />
          {children}
        </main>
      </div>
    </div>
  );
```

(Add the corresponding `import { Header } from "./_components/Header";` etc.)

- [ ] **Step 5: Run tests + manually verify rendering**

Run: `pnpm typecheck && pnpm test tests/help/breadcrumb.test.tsx tests/help/sidebar.test.tsx tests/help/auth-stub.test.ts`
Expected: PASS.

Run: `pnpm dev` and visit `/help` as admin. Expected: header at top, sidebar on left desktop / collapsed on mobile, breadcrumb above placeholder content.

- [ ] **Step 6: Commit**

```bash
git add app/help/_components/Breadcrumb.tsx app/help/layout.tsx tests/help/breadcrumb.test.tsx
git commit -m "feat(help): Breadcrumb component + chrome composition in /help layout (Task A.6)"
```

---

### Task A.7: Nav-consistency meta-test (test #5)

**Files:**
- Create: `tests/help/_metaNavSync.test.ts`

Per spec §7.1 test 5: every entry in `_nav.ts` resolves to a real route under `app/help/`; every route under `app/help/` is referenced in `_nav.ts`. Prevents orphan pages and dead nav entries.

- [ ] **Step 1: Write the failing test**

Create `tests/help/_metaNavSync.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NAV } from "@/app/help/_nav";

/**
 * Walk app/help/ recursively, collecting every directory that contains
 * page.mdx or page.tsx. Each such directory corresponds to a route slug
 * (relative to app/help) — collapse "" → "/help", "admin/dashboard" →
 * "/help/admin/dashboard", etc.
 */
function discoverRoutes(): string[] {
  const root = join(process.cwd(), "app/help");
  const found: string[] = [];

  function walk(dir: string, segments: string[]) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith("_")) continue; // _components, _nav.ts, etc. are not routes
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) {
        walk(full, [...segments, entry]);
      } else if (entry === "page.mdx" || entry === "page.tsx") {
        found.push("/" + ["help", ...segments].join("/"));
      }
    }
  }
  walk(root, []);
  return found.sort();
}

describe("_nav.ts ↔ filesystem consistency (test #5)", () => {
  it("every NAV entry has a real page on disk", () => {
    const routes = discoverRoutes();
    for (const entry of NAV) {
      expect(routes).toContain(entry.slug);
    }
  });

  it("every page.mdx/page.tsx on disk is referenced in NAV", () => {
    const routes = discoverRoutes();
    const navSlugs = NAV.map((e) => e.slug);
    for (const route of routes) {
      expect(navSlugs).toContain(route);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/_metaNavSync.test.ts`
Expected: at this point only `/help` exists on disk (Task A.2's placeholder). The "every NAV entry has a real page" assertion FAILS for 12 of the 13 entries.

- [ ] **Step 3: Create stub `page.mdx` files for the other 12 routes (TDD: implementation step that makes the test pass)**

Per AGENTS.md plan-wide invariant #1, every task commits in a green state. A.7 makes the test pass by creating 12 placeholder pages — Phase E tasks then REPLACE the placeholder content (each E.N task edits in place, not creating new files).

Create each of the 12 stub files. Each stub is a single line of MDX:

```mdx
{/* M11 Phase A.7 stub — Phase E task E.<N> replaces the entire body. */}

# <Page Title>
```

The `<Page Title>` matches each entry's `title` field in `_nav.ts`. Files to create (one stub each):

```
app/help/getting-started/page.mdx        # E.2 will replace
app/help/daily-rhythm/page.mdx           # E.3
app/help/whats-different/page.mdx        # E.4
app/help/admin/dashboard/page.mdx        # E.5
app/help/admin/review-queues/page.mdx    # E.6
app/help/admin/parse-warnings/page.mdx   # E.7
app/help/admin/per-show-panel/page.mdx   # E.8
app/help/admin/preview-as-crew/page.mdx  # E.9
app/help/admin/sharing-links/page.mdx    # E.10
app/help/admin/onboarding-wizard/page.mdx # E.11
app/help/tour/page.mdx                   # E.12
app/help/errors/page.tsx                 # E.13 (TSX, not MDX — see below)
```

For `app/help/errors/page.tsx` specifically (it's TSX iterating the catalog, not MDX), the stub is:

```tsx
// M11 Phase A.7 stub — Phase E.13 replaces with the catalog-iterating implementation.
export default function ErrorsPage() {
  return <h1>Errors</h1>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/help/_metaNavSync.test.ts`
Expected: PASS — every NAV entry has a page on disk; every page on disk is in NAV.

- [ ] **Step 5: Commit (green state)**

```bash
git add tests/help/_metaNavSync.test.ts app/help/
git commit -m "test(help): _metaNavSync meta-test + 12 page stubs (Task A.7 — TDD green)"
```

(r4: earlier draft committed the test in a red state pending Phase E. AGENTS.md plan-wide invariant #1 requires every commit to be green; r4 creates stubs so A.7 lands green. Phase E tasks now edit-in-place rather than create.)

---

## Phase A close-out

After A.1 – A.7 commits land:

- [ ] All Phase A tests pass green (including `_metaNavSync` thanks to A.7's stub creation — r4 fix per AGENTS.md invariant #1)
- [ ] `pnpm dev` + visit `/help` as admin: header + sidebar (with one entry highlighted) + breadcrumb render
- [ ] `pnpm dev` + visit `/help` unauth: 403
- [ ] `pnpm build` completes without static-prerender errors
- [ ] 13 page files exist (1 fully implemented landing placeholder, 12 stubs); Phase E tasks edit-in-place
- [ ] **Hand off to Phase B** ([02-catalog-extension.md](02-catalog-extension.md))

Phase A introduces ~7 commits, ~250 LOC of new code + 12 single-line stub MDX/TSX files.

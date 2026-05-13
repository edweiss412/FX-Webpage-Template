# Phase D — MDX components

**Scope:** Build the 6 MDX-injected components: `<Callout>`, `<Step>`, `<ScreenshotPlaceholder>` (draft scaffold), `<Screenshot>` (production), `<RefAnchor>`, `<TipFromSheets>`. Register them in `mdx-components.tsx` so they're available inside every `.mdx` file under `app/help/`.

**Prereqs:** Phase C complete (strict sequential per 00-overview.md). Phase A's `mdx-components.tsx` and Phase B's catalog schema extension are the practical interactions; Phase C's time utility is a no-op interaction but the strict-sequential ordering applies.

**Tasks:** D.1 → D.7 (6 components + 1 wiring task). Order within phase is flexible; do them in alphabetical order for predictability.

---

### Task D.1: `<Callout type>` component

**Files:**
- Create: `app/help/_components/Callout.tsx`

Per spec §6.2 — `note` / `warning` / `tip` variants, palette tokens from `app/globals.css`, fixed icon + heading color per type. Unknown `type` defaults to `note` (spec §6.3 guard).

- [ ] **Step 1: Write the failing test**

Create `tests/help/callout.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Callout } from "@/app/help/_components/Callout";

describe("<Callout>", () => {
  it("renders children", () => {
    render(<Callout type="note">Hello world</Callout>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it.each(["note", "warning", "tip"] as const)("variant '%s' renders with role status", (t) => {
    render(<Callout type={t}>x</Callout>);
    expect(screen.getByRole(t === "warning" ? "alert" : "note")).toBeInTheDocument();
  });

  it("defaults to 'note' for unknown type (spec §6.3 guard)", () => {
    // @ts-expect-error — intentionally passing an invalid type for the runtime guard.
    render(<Callout type="bogus">x</Callout>);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("renders an icon per variant", () => {
    render(<Callout type="warning">x</Callout>);
    expect(screen.getByTestId("callout-icon-warning")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/callout.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `Callout`**

```tsx
// app/help/_components/Callout.tsx
import type { ReactNode } from "react";

const VARIANTS = {
  note: {
    bg: "bg-info-bg",
    border: "border-border",
    text: "text-callout-note-text",
    role: "note" as const,
    icon: "ℹ",
    iconTestid: "callout-icon-note",
  },
  warning: {
    bg: "bg-warning-bg",
    border: "border-warning-text",
    text: "text-callout-warning-text",
    role: "alert" as const,
    icon: "⚠",
    iconTestid: "callout-icon-warning",
  },
  tip: {
    bg: "bg-stale-tint",
    border: "border-accent",
    text: "text-callout-tip-text",
    role: "note" as const,
    icon: "✓",
    iconTestid: "callout-icon-tip",
  },
} as const;

export function Callout({
  type,
  children,
}: {
  type: keyof typeof VARIANTS;
  children: ReactNode;
}) {
  // Defensive: unknown type → default to "note" per spec §6.3.
  const v = VARIANTS[type] ?? VARIANTS.note;
  return (
    <div
      role={v.role}
      className={`my-4 flex gap-3 rounded-md border-l-4 px-4 py-3 ${v.bg} ${v.border} ${v.text}`}
    >
      <span data-testid={v.iconTestid} className="font-bold shrink-0">
        {v.icon}
      </span>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
```

(Token classes like `bg-info-bg` must be added to `app/globals.css` `@theme` if not already present — coordinate with the impeccable v3 design audit during Phase I.)

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm typecheck && pnpm test tests/help/callout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/help/_components/Callout.tsx tests/help/callout.test.tsx
git commit -m "feat(help): Callout component (note/warning/tip) (Task D.1)"
```

---

### Task D.2: `<Step n>` component

**Files:**
- Create: `app/help/_components/Step.tsx`

Per spec §6.2 — numbered procedural step. Used in adoption-track + onboarding-wizard pages.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/help/step.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Step } from "@/app/help/_components/Step";

describe("<Step>", () => {
  it("renders the step number prominently", () => {
    render(<Step n={3}>Click Share.</Step>);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Click Share.")).toBeInTheDocument();
  });

  it("uses tabular figures for the number", () => {
    render(<Step n={10}>x</Step>);
    const num = screen.getByText("10");
    expect(num.className).toMatch(/tabular-nums/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/step.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `Step`**

```tsx
// app/help/_components/Step.tsx
import type { ReactNode } from "react";

export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="my-3 flex gap-3 items-start">
      <span
        className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-text font-semibold text-sm tabular-nums"
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="pt-0.5 leading-relaxed">
        <span className="sr-only">Step {n}: </span>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm typecheck && pnpm test tests/help/step.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/help/_components/Step.tsx tests/help/step.test.tsx
git commit -m "feat(help): Step component for numbered procedures (Task D.2)"
```

---

### Task D.3: `<ScreenshotPlaceholder>` (draft scaffold)

**Files:**
- Create: `app/help/_components/ScreenshotPlaceholder.tsx`

Per spec §6.2 — labeled empty box for pages authored before the underlying surface stabilizes. **Lint-prohibited in shipped v1 MDX** (spec §7.1 test 7, Phase H Task H.4). Useful during Phase E content-authoring before Phase F's real screenshots land.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/help/screenshot-placeholder.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScreenshotPlaceholder } from "@/app/help/_components/ScreenshotPlaceholder";

describe("<ScreenshotPlaceholder>", () => {
  it("renders the alt text inside an explicit 'screenshot pending' label", () => {
    render(<ScreenshotPlaceholder alt="Dashboard with yellow review badge" />);
    expect(screen.getByText(/screenshot pending/i)).toBeInTheDocument();
    expect(screen.getByText(/dashboard with yellow review badge/i)).toBeInTheDocument();
  });

  it("renders with role='img' and aria-label", () => {
    render(<ScreenshotPlaceholder alt="X" />);
    const el = screen.getByRole("img");
    expect(el).toHaveAttribute("aria-label", "X");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/screenshot-placeholder.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `ScreenshotPlaceholder`**

```tsx
// app/help/_components/ScreenshotPlaceholder.tsx
//
// DRAFT-ONLY component. Phase H Task H.4 enforces zero references in shipped
// v1 MDX. Use during Phase E content authoring before Phase F captures real
// screenshots, then replace each with <Screenshot name="..." alt="..." />.

export function ScreenshotPlaceholder({
  alt,
  caption,
}: {
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="my-4">
      <div
        role="img"
        aria-label={alt}
        className="aspect-video w-full rounded border-2 border-dashed border-border-strong bg-surface-raised flex items-center justify-center text-center p-4"
      >
        <span className="text-sm italic text-text-subtle">
          Screenshot pending — {alt}
        </span>
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-text-subtle text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm typecheck && pnpm test tests/help/screenshot-placeholder.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/help/_components/ScreenshotPlaceholder.tsx tests/help/screenshot-placeholder.test.tsx
git commit -m "feat(help): ScreenshotPlaceholder draft component (Task D.3)"
```

---

### Task D.4: `<Screenshot name>` (production component)

**Files:**
- Create: `app/help/_components/Screenshot.tsx`

Per spec §6.2 / AC-12.25 — renders `<picture>` with light/dark WebP sources from `public/help/screenshots/<name>-{light,dark}.webp`. The `name` value must exist in the screenshot manifest (Phase F). The `<picture>`-contract test is Phase F Task F.6.

**r2 fix per D-r1 finding 1 (CRITICAL):** the r1 draft used `<Screenshot name="...">`. `key` is a React reserved attribute — it's consumed by React's reconciler and never reaches component props. The r1 implementation destructured `key: screenshotKey` from props, but React strips `key` BEFORE props arrive, so `screenshotKey` would always be `undefined` and every page would render `/help/screenshots/undefined-light.webp`. Renaming the public prop to **`name`** is cross-phase: Phase D component + Phase E MDX call sites + Phase F manifest walker test (F.6) + Phase F.10 retrofit + Phase F.8 coverage + manifest meta-test references all migrate from `key=` to `name=`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/help/screenshot.test.tsx
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Screenshot } from "@/app/help/_components/Screenshot";

describe("<Screenshot>", () => {
  it("renders a <picture> with light + dark sources at the expected paths", () => {
    const { container } = render(<Screenshot name="dashboard-active-shows" alt="The dashboard." />);
    const picture = container.querySelector("picture");
    expect(picture).not.toBeNull();

    const darkSource = picture!.querySelector("source[media='(prefers-color-scheme: dark)']");
    expect(darkSource).not.toBeNull();
    expect(darkSource!.getAttribute("srcset")).toBe("/help/screenshots/dashboard-active-shows-dark.webp");

    const img = picture!.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/help/screenshots/dashboard-active-shows-light.webp");
    expect(img!.getAttribute("alt")).toBe("The dashboard.");
  });

  it("renders an optional caption", () => {
    const { container } = render(
      <Screenshot name="x" alt="Y" caption="Dashboard, mid-show" />,
    );
    expect(container.querySelector("figcaption")?.textContent).toContain("Dashboard, mid-show");
  });

  // r2 fix per D-r1 finding 1: regression guard. If someone reintroduces
  // `key` as the public prop, React would strip it and the rendered src
  // would contain "undefined".
  it("never renders a src/srcset containing the literal 'undefined' (regression guard for reserved-key trap)", () => {
    const { container } = render(<Screenshot name="dashboard-overview" alt="x" />);
    const html = container.innerHTML;
    expect(html).not.toContain("undefined");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/screenshot.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `Screenshot`**

```tsx
// app/help/_components/Screenshot.tsx

const BASE = "/help/screenshots";

export function Screenshot({
  name,
  alt,
  caption,
}: {
  // Manifest key (matches scripts/help-screenshots.manifest.ts `key` field).
  // Phase F's _metaScreenshotManifest meta-test (test #9) catches missing
  // manifest entries. Phase F's screenshot-coverage test (test #8) catches
  // missing WebPs on disk.
  //
  // NOTE: prop is `name`, NOT `key`. `key` is React-reserved and would never
  // arrive in props.
  name: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="my-4">
      <picture>
        <source
          media="(prefers-color-scheme: dark)"
          srcSet={`${BASE}/${name}-dark.webp`}
        />
        <img
          src={`${BASE}/${name}-light.webp`}
          alt={alt}
          className="block w-full rounded border border-border"
          loading="lazy"
          decoding="async"
        />
      </picture>
      {caption && (
        <figcaption className="mt-2 text-xs text-text-subtle text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm typecheck && pnpm test tests/help/screenshot.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/help/_components/Screenshot.tsx tests/help/screenshot.test.tsx
git commit -m "feat(help): Screenshot production component with <picture> + dark source; prop is name (not React-reserved key) (Task D.4)"
```

---

### Task D.5: `<RefAnchor id>` component

**Files:**
- Create: `app/help/_components/RefAnchor.tsx`

Per spec §6.2 / §5.4 (slug-stability invariant). Renders a heading with `id={id}` and a click-to-copy link icon. `id` must match `/^[A-Z][A-Z0-9_]*$/` (catalog code shape).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/help/ref-anchor.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RefAnchor } from "@/app/help/_components/RefAnchor";

describe("<RefAnchor>", () => {
  it("renders an h3 with id={id}", () => {
    render(<RefAnchor id="REPORT_HORIZON_EXPIRED">Report horizon expired</RefAnchor>);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveAttribute("id", "REPORT_HORIZON_EXPIRED");
    expect(heading).toHaveTextContent("Report horizon expired");
  });

  it("renders a copy-link affordance with aria-label", () => {
    render(<RefAnchor id="X">Y</RefAnchor>);
    const linkBtn = screen.getByRole("link", { name: /copy link to this section/i });
    expect(linkBtn).toHaveAttribute("href", "#X");
  });

  it("throws when id violates the catalog-code regex (build-time invariant)", () => {
    expect(() => render(<RefAnchor id="bad-id">x</RefAnchor>)).toThrow();
    expect(() => render(<RefAnchor id="123_NUMERIC_LEAD">x</RefAnchor>)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/ref-anchor.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `RefAnchor`**

```tsx
// app/help/_components/RefAnchor.tsx
import type { ReactNode } from "react";

const VALID_ID = /^[A-Z][A-Z0-9_]*$/;

export function RefAnchor({ id, children }: { id: string; children: ReactNode }) {
  if (!VALID_ID.test(id)) {
    throw new Error(
      `<RefAnchor id="${id}"> — id must match /^[A-Z][A-Z0-9_]*$/ (catalog code shape).`,
    );
  }
  return (
    <h3 id={id} className="mt-8 mb-2 text-lg font-semibold text-text-strong group flex items-center gap-2">
      {children}
      <a
        href={`#${id}`}
        aria-label="Copy link to this section"
        className="text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity text-sm"
      >
        🔗
      </a>
    </h3>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm typecheck && pnpm test tests/help/ref-anchor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/help/_components/RefAnchor.tsx tests/help/ref-anchor.test.tsx
git commit -m "feat(help): RefAnchor with click-to-copy link icon + id regex validation (Task D.5)"
```

---

### Task D.6: `<TipFromSheets>` component

**Files:**
- Create: `app/help/_components/TipFromSheets.tsx`

Per spec §6.2 — adoption-track aside framing "In your old workflow, you'd … now …". Distinct background tone so it reads as a side-note, not body.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/help/tip-from-sheets.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TipFromSheets } from "@/app/help/_components/TipFromSheets";

describe("<TipFromSheets>", () => {
  it("renders the 'From Sheets' label + children", () => {
    render(<TipFromSheets>In your old workflow…</TipFromSheets>);
    expect(screen.getByText(/from sheets/i)).toBeInTheDocument();
    expect(screen.getByText(/In your old workflow/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/tip-from-sheets.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `TipFromSheets`**

```tsx
// app/help/_components/TipFromSheets.tsx
import type { ReactNode } from "react";

export function TipFromSheets({ children }: { children: ReactNode }) {
  return (
    <aside className="my-4 rounded-md border-l-4 border-accent bg-info-bg px-4 py-3">
      <span className="block text-xs uppercase tracking-wider font-bold text-accent-text mb-1">
        From Sheets
      </span>
      <div className="leading-relaxed text-sm">{children}</div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm typecheck && pnpm test tests/help/tip-from-sheets.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/help/_components/TipFromSheets.tsx tests/help/tip-from-sheets.test.tsx
git commit -m "feat(help): TipFromSheets adoption-track aside component (Task D.6)"
```

---

### Task D.7: Register all components in `mdx-components.tsx`

**Files:**
- Modify: `mdx-components.tsx` (project root)

Per spec §3.3 — `mdx-components.tsx` is required by `@next/mdx` App Router integration. Phase A.1 scaffolded the empty function; D.7 registers the six components so `.mdx` files can use them by name without per-file imports.

- [ ] **Step 1: Write the failing test**

```ts
// tests/help/mdx-components-registration.test.ts
import { describe, it, expect } from "vitest";
import { useMDXComponents } from "@/mdx-components";

describe("mdx-components.tsx registration (Task D.7)", () => {
  it("registers all six M12 components", () => {
    const components = useMDXComponents({});
    expect(typeof components.Callout).toBe("function");
    expect(typeof components.Step).toBe("function");
    expect(typeof components.Screenshot).toBe("function");
    expect(typeof components.ScreenshotPlaceholder).toBe("function");
    expect(typeof components.RefAnchor).toBe("function");
    expect(typeof components.TipFromSheets).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/help/mdx-components-registration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `mdx-components.tsx`**

```tsx
// mdx-components.tsx
import type { MDXComponents } from "mdx/types";
import { Callout } from "@/app/help/_components/Callout";
import { Step } from "@/app/help/_components/Step";
import { Screenshot } from "@/app/help/_components/Screenshot";
import { ScreenshotPlaceholder } from "@/app/help/_components/ScreenshotPlaceholder";
import { RefAnchor } from "@/app/help/_components/RefAnchor";
import { TipFromSheets } from "@/app/help/_components/TipFromSheets";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    Callout,
    Step,
    Screenshot,
    ScreenshotPlaceholder,
    RefAnchor,
    TipFromSheets,
  };
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm typecheck && pnpm test tests/help/mdx-components-registration.test.ts`
Expected: PASS.

- [ ] **Step 5: Smoke-test in a real MDX page**

Edit `app/help/page.mdx` (Phase A's placeholder) to use a component:

```mdx
# Help

<Callout type="note">If you're reading this, Phase D is wired correctly.</Callout>
```

Run `pnpm dev`; visit `/help` as admin. Expected: the Callout renders with the note styling.

Revert the page content (don't commit the smoke test — Phase E will replace this content).

- [ ] **Step 6: Commit**

```bash
git add mdx-components.tsx tests/help/mdx-components-registration.test.ts
git commit -m "feat(help): register all six MDX components in mdx-components.tsx (Task D.7)"
```

---

## Phase D close-out

After D.1 – D.7 commits land:

- [ ] All six components exist with their own unit tests
- [ ] `mdx-components.tsx` registers all six; `.mdx` files can use them without per-file imports
- [ ] `pnpm test tests/help/` shows green for all D.* tests + the A.* tests
- [ ] Manual MDX smoke check (Step 5 above) confirms wiring
- [ ] **Hand off to Phase E** ([05-content.md](05-content.md)) — content authoring uses all six components

Phase D introduces ~7 commits, ~400 LOC of new code (six components + tests + registration).

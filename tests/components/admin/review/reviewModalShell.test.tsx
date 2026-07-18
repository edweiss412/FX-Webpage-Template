// @vitest-environment jsdom
/**
 * tests/components/admin/review/reviewModalShell.test.tsx
 * (admin-show-modal spec §5 — Task 1/2)
 *
 * Unit contract for the extracted `ReviewModalShell`: the source-agnostic
 * modal chrome (portal, scrim, panel, grab strip, header/footer wrappers,
 * focus trap, Esc, scroll lock) shared by Step3ReviewModal and the published
 * review modal. The Step-3 wizard suite is the byte-identity pin for the
 * `step3-review` consumer; this file pins the shell's OWN prop surface —
 * both `dataAttrPrefix` values interpolate (never hardcode), `footer` is
 * omissible, and `initialFocusRef` receives initial focus.
 *
 * Task 2 rider (spec §5, D6): the globals.css entrance-animation twin scan —
 * every media context in which `[data-step3-review-*]` receives an animation
 * body must give `[data-review-modal-*]` the IDENTICAL body.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ReviewModalShell,
  type ReviewModalShellProps,
} from "@/components/admin/review/ReviewModalShell";

afterEach(cleanup);

type HostProps = {
  open?: boolean;
  dataAttrPrefix?: ReviewModalShellProps["dataAttrPrefix"];
  testIdBase?: string;
  onClose?: () => void;
  footer?: React.ReactNode;
};

/** Consumer stand-in: owns its close button + ref inside the header slot,
 *  exactly as Step3ReviewModal does (spec §5 initialFocusRef contract). */
function Host({
  open = true,
  dataAttrPrefix = "step3-review",
  testIdBase = "shell-under-test",
  onClose = () => {},
  footer,
}: HostProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  return (
    <ReviewModalShell
      open={open}
      onClose={onClose}
      labelledBy="host-title-id"
      dataAttrPrefix={dataAttrPrefix}
      testIdBase={testIdBase}
      initialFocusRef={closeRef}
      header={
        <>
          <h2 id="host-title-id">Host title</h2>
          <button ref={closeRef} type="button" data-testid="host-close" onClick={onClose}>
            Close
          </button>
        </>
      }
      {...(footer !== undefined ? { footer } : {})}
    >
      <div data-testid="host-body">body content</div>
    </ReviewModalShell>
  );
}

describe("ReviewModalShell — open guard (§6.2)", () => {
  it("renders nothing when open === false", () => {
    const { container } = render(<Host open={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("shell-under-test-modal")).toBeNull();
    expect(document.querySelector("[data-step3-review-panel]")).toBeNull();
  });
});

describe("ReviewModalShell — chrome topology (both dataAttrPrefix values interpolate)", () => {
  for (const prefix of ["step3-review", "review-modal"] as const) {
    it(`prefix "${prefix}": portal to body; scrim/panel data hooks + testIdBase ids; dialog semantics`, () => {
      render(<Host dataAttrPrefix={prefix} testIdBase={`base-${prefix}`} />);

      // Dialog root: portaled directly under document.body.
      const dialog = screen.getByTestId(`base-${prefix}-modal`);
      expect(dialog.parentElement).toBe(document.body);
      expect(dialog.getAttribute("role")).toBe("dialog");
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBe("host-title-id");

      // Scrim: `${testIdBase}-backdrop` + interpolated data hook.
      const scrim = screen.getByTestId(`base-${prefix}-backdrop`);
      expect(scrim.hasAttribute(`data-${prefix}-scrim`)).toBe(true);

      // Panel: interpolated data hook inside the dialog root.
      const panel = dialog.querySelector(`[data-${prefix}-panel]`);
      expect(panel).not.toBeNull();

      // The OTHER prefix must not leak (attr names interpolate, not hardcode).
      const other = prefix === "step3-review" ? "review-modal" : "step3-review";
      expect(scrim.hasAttribute(`data-${other}-scrim`)).toBe(false);
      expect(dialog.querySelector(`[data-${other}-panel]`)).toBeNull();

      // Grab strip + header wrapper are shell-owned nodes.
      expect(screen.getByTestId(`base-${prefix}-grab`)).toBeInTheDocument();
      const header = screen.getByTestId(`base-${prefix}-header`);
      expect(header.contains(screen.getByTestId("host-close"))).toBe(true);

      // Children mount in the panel (no shell body wrapper — spec §5).
      const body = screen.getByTestId("host-body");
      expect(panel!.contains(body)).toBe(true);
      expect(body.parentElement).toBe(panel);
    });
  }

  it("footer omitted → no footer element at all", () => {
    render(<Host />);
    expect(screen.queryByTestId("shell-under-test-footer")).toBeNull();
    expect(document.querySelector("footer")).toBeNull();
  });

  it("footer provided → wrapper present with the slot content inside", () => {
    render(<Host footer={<button type="button">Publish</button>} />);
    const footer = screen.getByTestId("shell-under-test-footer");
    expect(footer.tagName).toBe("FOOTER");
    expect(footer.textContent).toContain("Publish");
  });
});

describe("ReviewModalShell — close paths + initial focus", () => {
  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("scrim click calls onClose", () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    fireEvent.click(screen.getByTestId("shell-under-test-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("initial focus lands on the element initialFocusRef points at (consumer close button)", () => {
    render(<Host />);
    expect(document.activeElement).toBe(screen.getByTestId("host-close"));
  });
});

// ── Task 2: globals.css entrance-animation twin scan (spec §5, D6) ──────────
//
// Wherever `[data-step3-review-scrim]` / `[data-step3-review-panel]` receive an
// animation body (base, ≥640px, reduced-motion), the `review-modal` twin must
// receive the IDENTICAL body in the SAME media context — via a shared selector
// list or an adjacent twin rule (the reduced-motion block keeps the step3 pair
// as its own leading rule because the §11 T1 suite pins that exact shape).

/** Every (mediaContext :: ruleBody) pair in which `attr` appears as a selector.
 *  Minimal walk — top-level rules plus one level of `@media` nesting, which is
 *  exactly globals.css's shape for these hooks. */
function animationContexts(css: string, attr: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  const blockRe = /@media\s*([^{]+)\{((?:[^{}]*\{[^{}]*\})*)\s*\}|([^@{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(noComments)) !== null) {
    if (m[1] !== undefined) {
      const media = m[1].trim();
      const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
      let r: RegExpExecArray | null;
      while ((r = ruleRe.exec(m[2] ?? "")) !== null) {
        if (r[1]!.includes(`[${attr}]`)) {
          out.push(`${media} :: ${r[2]!.replace(/\s+/g, " ").trim()}`);
        }
      }
    } else if (m[3]!.includes(`[${attr}]`)) {
      out.push(`(base) :: ${m[4]!.replace(/\s+/g, " ").trim()}`);
    }
  }
  return out.sort();
}

describe("globals.css — review-modal entrance twins mirror step3-review in every media context (Task 2)", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  for (const part of ["scrim", "panel"] as const) {
    it(`[data-review-modal-${part}] receives exactly the animation contexts of [data-step3-review-${part}]`, () => {
      const step3 = animationContexts(css, `data-step3-review-${part}`);
      // Anti-vacuity: the step3 hooks are animated in base + ≥640px + reduced-motion.
      expect(step3.length).toBe(3);
      expect(animationContexts(css, `data-review-modal-${part}`)).toEqual(step3);
    });
  }
});

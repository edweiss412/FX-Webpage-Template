import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("META picker role chip contract", () => {
  // RETARGETED 2026-08-09 (UI spec §2.3). `IdentityChip` is now a Server
  // Component seam that declares the `clearIdentity` action and renders the
  // `AvatarMenu` client island; the props contract stays on the seam, and the
  // DOM contract moved into the island with it. Both halves are still pinned —
  // splitting the component must not lose either.
  test("IdentityChip props carry identity, route, and show identifiers", () => {
    const source = readFileSync("components/auth/IdentityChip.tsx", "utf8");
    for (const prop of ["name", "role", "slug", "shareToken", "showId"]) {
      expect(source).toMatch(new RegExp(`${prop}:\\s*string`));
    }
    // The seam forwards every one of them to the island. A prop that stopped
    // being passed would leave the menu rendering a blank identity or a form
    // missing a route input, which is exactly the class this contract exists for.
    for (const prop of ["name", "role", "slug", "shareToken", "showId"]) {
      expect(source).toMatch(new RegExp(`${prop}=\\{${prop}\\}`));
    }
    expect(source).toMatch(/clearAction=\{clearIdentityFormAction\}/);
  });

  test("the AvatarMenu island carries the identity DOM and the form's route inputs", () => {
    const source = readFileSync("components/auth/AvatarMenu.tsx", "utf8");
    expect(source).toMatch(/data-testid="avatar-menu-trigger"/);
    expect(source).toMatch(/data-testid="avatar-menu-switch-person"/);
    // The form boundary, not a bare action call: these hidden inputs are what
    // make the clear land on the right show.
    expect(source).toMatch(/name="slug"/);
    expect(source).toMatch(/name="shareToken"/);
    expect(source).toMatch(/name="showId"/);
    // Menu semantics: a stateful toggle inside a menu is a menuitemcheckbox,
    // never a button with aria-pressed (which does not ride along on menu items).
    expect(source).toMatch(/role="menuitemcheckbox"/);
    // The ATTRIBUTE, not the word: this file's own header explains why
    // `aria-pressed` is wrong on a menu item, and a bare word match would be
    // tripped by the explanation — a use-vs-mention error.
    expect(source).not.toMatch(/aria-pressed=/);
  });

  test("Header exposes a right slot that replaces the decorative wordmark", () => {
    const source = readFileSync("components/layout/Header.tsx", "utf8");
    expect(source).toMatch(/identityChip\?:\s*ReactNode/);
    expect(source).toMatch(/data-testid="page-header-right-slot"/);
    expect(source).toMatch(/data-testid="page-header-fxav-wordmark"/);
    expect(source).toMatch(/identityChip\s*!==\s*undefined\s*&&\s*identityChip\s*!==\s*null/);
  });

  test("show body passes IdentityChip into Header's right slot", () => {
    // The crew-page body migrated from _ShowBody.tsx to _CrewShell.tsx (the
    // redesigned section shell); the Header→IdentityChip right-slot wiring moved
    // verbatim (_CrewShell.tsx Header block).
    const source = readFileSync("app/show/[slug]/[shareToken]/_CrewShell.tsx", "utf8");
    expect(source).toMatch(/<Header[\s\S]*identityChip=\{/);
    expect(source).toMatch(/<IdentityChip[\s\S]*name=\{identityChip\.name\}/);
    expect(source).toMatch(/role=\{identityChip\.role\}/);
    expect(source).toMatch(/shareToken=\{identityChip\.shareToken\}/);
  });
});

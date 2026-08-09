/**
 * `cn` — the class-name callee `better-tailwindcss/enforce-canonical-classes` can see.
 *
 * Spec: docs/superpowers/specs/2026-08-07-classname-array-join-cn.md §3
 *
 * WHY THIS EXISTS. The canonical-class eslint rule (`eslint.config.mjs`, severity
 * "error") cannot traverse `[...].join(" ")`: the plugin's String matcher returns an
 * UNCROSSABLE_BOUNDARY at any CallExpression, so `.join()` blocks traversal into the
 * array. Tailwind drift inside those classNames escaped `pnpm lint` and therefore escaped
 * CI. `^cn$` is a DEFAULT callee selector in the installed plugin, so routing class lists
 * through this function makes them visible with no config change.
 *
 * WHY IT IS LOCAL AND NOT `clsx`. Ratified, spec §1.1 R1: no new dependency.
 * `tailwind-merge` was rejected explicitly — its conflict-resolution semantics would
 * change what ~36 existing class strings render, which is a behavior risk this arc does
 * not take on.
 *
 * THE SEMANTICS ARE COMPLETE AS WRITTEN (spec §3.2). `cn` is exactly
 * `filter(Boolean).join(" ")`. It does NOT merge, dedupe, resolve Tailwind conflicts,
 * trim, or collapse interior whitespace, and it does not accept nested arrays or objects.
 * Every one of those non-behaviors is pinned by an assertion in `tests/ui/cn.test.ts`,
 * because each would silently rewrite rendered output at call sites that look untouched.
 *
 * A SINGLE-ARGUMENT call is deliberate and not a mistake. `cn("px-4 py-2")` is
 * exactly `"px-4 py-2"` at runtime; it exists so the canonical-class rule can
 * TRAVERSE the string. The rule follows recognized callees and direct JSX
 * attributes, and reaches neither a bare `const X = "…"` initializer nor an
 * object VALUE — nine such constants shipped with Tailwind drift inside them
 * (`THUMB_BASE`'s `h-5 w-5` where its three sibling switches said `size-5`),
 * invisible to `pnpm lint` and therefore to CI. The wrap is what makes them
 * visible; `tests/specLint/canonicalClassConstWrap.test.ts` pins the named
 * sites. Spec: docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md §2.3.
 *
 * `number` is deliberately outside `ClassValue`: admitting it would let a `0` be silently
 * dropped by the `Boolean` filter. Nested arrays are excluded for the same reason the
 * type is narrow at all — no call site needs them, and a narrow type keeps the eslint
 * traversal premise in spec §2.3 true.
 */

export type ClassValue = string | false | null | undefined;

export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}

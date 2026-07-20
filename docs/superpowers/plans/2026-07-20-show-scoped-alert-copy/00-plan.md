# Show-Scoped Alert Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An alert rendered inside its own show stops repeating the show name and stops telling the reader to go to the page they are already on, and one resolve action stops reading three different ways across three surfaces.

**Architecture:** Two independent mechanisms. (1) A new optional catalog field `dougFacingShowScoped` holds an authored short variant; `safeDougFacingTemplate`, reachable only from the show modal, prefers it. The bell and telemetry read `dougFacing` through separate code paths and cannot see the new field. (2) A new lib/adminAlerts/resolveActionLabel.ts maps alert code → `"confirm" | "resolve"`, and all three resolve buttons read their labels from it.

**Tech Stack:** TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Next.js 16, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md` (APPROVED at adversarial R9, after 4 BLOCKING rounds and three mechanism redesigns).

## Global Constraints

- **TDD per task.** Failing test → minimal implementation → passing test → commit. Never implementation first.
- **No raw error codes in user-visible UI** (invariant 5). Copy comes from the catalog.
- **Commit per task**, conventional style: `<type>(<scope>): <summary>`. Scope is `alerts` or `admin`.
- **Frozen-literal oracle.** The catalog is the subject under test here, so expected copy is a **hardcoded literal in the test**, never derived from the catalog. This deliberately inverts the usual project rule; a template edit is *meant* to fail these tests. (Spec §8.)
- **No em-dashes in user-visible copy.** Apostrophes are the literal `'` in code strings.
- **Buttons keep `min-h-tap-min`** and every existing class; only the text changes.
- **`pnpm typecheck`, `pnpm lint`, `pnpm format:check` before push**, vitest strips types, so a green suite is not a green build.

---

## File Structure

**Create:**
- lib/adminAlerts/resolveActionLabel.ts, intent map + label pairs. Pure, no imports from components.
- tests/adminAlerts/resolveIntentsBaseline.json, frozen `code → intent` baseline (JSON, so the history gate parses it exactly) for the lifecycle oracle.
- tests/adminAlerts/resolveActionLabel.test.ts
- tests/messages/_metaShowScopedTemplates.test.ts, defenses 1, 2, 3 (prefix declaration, rendered validity, paired fixture).
- tests/adminAlerts/_metaResolveIntentLifecycle.test.ts, defense 5 (completeness + two-layer lifecycle).
- tests/admin/_metaAttentionItemsTopology.test.ts, defense 6 (single-caller topology).
- tests/messages/showScopedCopy.test.ts, per-code copy + guards.
- tests/components/admin/resolveLabelCrossProduct.test.tsx, 3 buttons × 2 intents.

**Modify:**
- `lib/messages/catalog.ts`, type gains one optional field; 3 entries gain a variant; 2 error rows lose the button-name reference.
- `lib/admin/attentionItems.ts:128-138`, `safeDougFacingTemplate` prefers the variant.
- `lib/adminAlerts/deriveMessageParams.ts:285`, required `scope` param; `lead-hint` empty in show scope.
- `lib/adminAlerts/fetchPerShowAlerts.ts:170`, `lib/admin/bellFeed.ts:293`, `components/admin/telemetry/HealthAlertsPanel.tsx:78`, pass scope literally.
- `components/admin/PerShowAlertResolveButton.tsx:88`, `components/admin/telemetry/HealthAlertResolveButton.tsx:28`, `components/admin/BellPanel.tsx:336`, read labels from the module.
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 + `lib/messages/__generated__/spec-codes.ts`, lockstep triple with the catalog error-copy edit.
- `.github/workflows/unit-suite.yml:62`, fetch `origin/main` at depth 1.

---

### Task 1: Catalog field + the three authored variants

**Files:**
- Modify: `lib/messages/catalog.ts:1` (the type), and the three entries `ROLE_FLAGS_NOTICE` (`lib/messages/catalog.ts:855`), `PICKER_BOOTSTRAP_RPC_FAILED` (`lib/messages/catalog.ts:3290`), `OAUTH_IDENTITY_CLAIMED` (`lib/messages/catalog.ts:3324`)
- Test: tests/messages/showScopedCopy.test.ts

**Interfaces:**
- Produces: `MessageCatalogEntry["dougFacingShowScoped"]?: string`, consumed by Task 2's selector and Task 5's meta-tests.

- [ ] **Step 1: Write the failing test**

```ts
// tests/messages/showScopedCopy.test.ts
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

describe("authored show-scoped variants", () => {
  it("ROLE_FLAGS_NOTICE drops the location prefix", () => {
    expect(MESSAGE_CATALOG.ROLE_FLAGS_NOTICE.dougFacingShowScoped).toBe(
      "<role-changes><lead-hint>",
    );
  });

  it("PICKER_BOOTSTRAP_RPC_FAILED drops the prefix and the redundant same-show clause", () => {
    expect(MESSAGE_CATALOG.PICKER_BOOTSTRAP_RPC_FAILED.dougFacingShowScoped).toBe(
      "Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening, contact the developer.",
    );
  });

  it("OAUTH_IDENTITY_CLAIMED opens on the crew name", () => {
    expect(MESSAGE_CATALOG.OAUTH_IDENTITY_CLAIMED.dougFacingShowScoped).toBe(
      "<crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
    );
  });

  it("the two lowercase-opening codes deliberately have NO variant", () => {
    expect(MESSAGE_CATALOG.AMBIGUOUS_EMAIL_BINDING).not.toHaveProperty("dougFacingShowScoped");
    expect(MESSAGE_CATALOG.PICKER_SELECTION_RACE).not.toHaveProperty("dougFacingShowScoped");
  });

  it("global dougFacing is untouched for every adopting code", () => {
    expect(MESSAGE_CATALOG.ROLE_FLAGS_NOTICE.dougFacing).toBe(
      "In <sheet-name>, <role-changes><lead-hint>",
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/messages/showScopedCopy.test.ts`
Expected: FAIL with `expected undefined to be "<role-changes><lead-hint>"`. Note this is a RUNTIME assertion failure, not a type error: vitest strips types, so the "property does not exist on MessageCatalogEntry" error appears only under `pnpm typecheck` (review R1 finding 15).

- [ ] **Step 3: Add the field to the type**

In `lib/messages/catalog.ts`, inside the `MessageCatalogEntry` type (starts line 1), after the `dougFacing` declaration:

```ts
  /**
   * Show-scoped variant of `dougFacing`, used ONLY when the alert renders
   * inside the show it belongs to, where the modal header already names the
   * show, so the template's "In <sheet-name>, " opening is redundant.
   * Selected by safeDougFacingTemplate (lib/admin/attentionItems.ts), which is
   * reachable only from the show modal. The bell builds its copy from
   * `dougFacing` via rowCopy (BellPanel.tsx) and never sees this field.
   * Absent = the global string is used in both places (correct, just
   * redundant). Spec 2026-07-20-show-scoped-alert-copy-design §3.1.
   */
  dougFacingShowScoped?: string;
```

- [ ] **Step 4: Add the three variants**

`ROLE_FLAGS_NOTICE` (after its `dougFacing`, line ~855):

```ts
    dougFacingShowScoped: "<role-changes><lead-hint>",
```

`PICKER_BOOTSTRAP_RPC_FAILED` (after its `dougFacing`, line ~3291):

```ts
    dougFacingShowScoped:
      "Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening, contact the developer.",
```

`OAUTH_IDENTITY_CLAIMED` (after its `dougFacing`, line ~3325):

```ts
    dougFacingShowScoped:
      "<crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm vitest run tests/messages/showScopedCopy.test.ts && pnpm typecheck`
Expected: PASS, and typecheck clean.

- [ ] **Step 6: Run the catalog's existing guards**

Run: `pnpm vitest run tests/messages/`
Expected: PASS. If `_metaCatalogCopyHygiene` fails on an apostrophe or dash, fix the copy, do not weaken the guard.

- [ ] **Step 7: Commit**

```bash
git add lib/messages/catalog.ts tests/messages/showScopedCopy.test.ts
git commit -m "feat(alerts): add dougFacingShowScoped and the three authored variants"
```

---

### Task 2: `safeDougFacingTemplate` prefers the variant

**Files:**
- Modify: `lib/admin/attentionItems.ts:128-138`
- Test: `tests/admin/attentionItems.test.ts` (extend), tests/messages/showScopedCopy.test.ts (extend)

**Interfaces:**
- Consumes: `MessageCatalogEntry["dougFacingShowScoped"]` from Task 1.
- Produces: `safeDougFacingTemplate(code: string, params: MessageParams | undefined): string | null`, signature **unchanged**. Scope is structural, not a parameter (spec §3.5).

- [ ] **Step 1: Write the failing test**

Append to tests/messages/showScopedCopy.test.ts:

```ts
import { safeDougFacingTemplate } from "@/lib/admin/attentionItems";

describe("safeDougFacingTemplate selects the show-scoped variant", () => {
  const params = {
    "role-changes": "Doug Larson was added with LEAD + V1.",
    "lead-hint": "",
    "sheet-name": "'II - RIA Investment Forum - Central 2025'",
  };

  it("returns the variant when one exists", () => {
    expect(safeDougFacingTemplate("ROLE_FLAGS_NOTICE", params)).toBe(
      "<role-changes><lead-hint>",
    );
  });

  it("falls back to dougFacing when no variant exists", () => {
    const p = { "email": "a@b.com", "crew-row-count": "2 crew rows", "show-name": "'X'" };
    expect(safeDougFacingTemplate("AMBIGUOUS_EMAIL_BINDING", p)).toBe(
      MESSAGE_CATALOG.AMBIGUOUS_EMAIL_BINDING.dougFacing,
    );
  });

  it("returns null for an uncataloged code under the new selection branch", () => {
    expect(safeDougFacingTemplate("NOT_A_REAL_CODE", params)).toBeNull();
  });

  it("returns null when params leave a placeholder unresolved in the VARIANT", () => {
    // <role-changes> unresolvable -> the guard must reject the selected variant,
    // not the global template.
    expect(safeDougFacingTemplate("ROLE_FLAGS_NOTICE", undefined)).toBeNull();
  });

  it("returns a param-free variant unchanged even with undefined params", () => {
    expect(safeDougFacingTemplate("PICKER_BOOTSTRAP_RPC_FAILED", undefined)).toBe(
      MESSAGE_CATALOG.PICKER_BOOTSTRAP_RPC_FAILED.dougFacingShowScoped,
    );
  });
});
```

The last two together are the anti-tautology pair: the first proves the guard fires, the second proves it fires *for the right reason* rather than rejecting everything.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/messages/showScopedCopy.test.ts`
Expected: FAIL, the first test returns the global `"In <sheet-name>, <role-changes><lead-hint>"`.

- [ ] **Step 3: Implement**

Replace the body of `safeDougFacingTemplate` (`lib/admin/attentionItems.ts:128-138`):

```ts
export function safeDougFacingTemplate(
  code: string,
  params: MessageParams | undefined,
): string | null {
  if (!(code in MESSAGE_CATALOG)) return null;
  const entry = messageFor(code as MessageCode);
  // Show-scoped selection. This function is reachable ONLY from
  // deriveAttentionItems, whose only caller is the show modal, so the scope is
  // structural and needs no parameter, pinned by
  // tests/admin/_metaAttentionItemsTopology.test.ts. The bell reads
  // entry.dougFacing directly through BellPanel's rowCopy and is unaffected.
  const template = entry.dougFacingShowScoped ?? entry.dougFacing;
  if (!template) return null;
  const interpolated = interpolate(template, params);
  if (!interpolated || UNRESOLVED_PLACEHOLDER_RE.test(interpolated)) return null;
  return template;
}
```

Note the validation now interpolates **the selected template**, not `messageFor(code, params).dougFacing`. Import `interpolate` from `@/lib/messages/lookup` if it is not already imported.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/messages/showScopedCopy.test.ts tests/admin/attentionItems.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/attentionItems.ts tests/messages/showScopedCopy.test.ts
git commit -m "feat(alerts): select the show-scoped template in safeDougFacingTemplate"
```

---

### Task 3: `lead-hint` empty in show scope

**Files:**
- Modify: `lib/adminAlerts/deriveMessageParams.ts:285` (signature) and its `lead-hint` assignment at `lib/adminAlerts/deriveMessageParams.ts:358`
- Modify: `lib/adminAlerts/fetchPerShowAlerts.ts:170`, `lib/admin/bellFeed.ts:293`, `components/admin/telemetry/HealthAlertsPanel.tsx:78`
- Test: `tests/adminAlerts/deriveMessageParams.test.ts` (extend)

**Interfaces:**
- Produces: `export type AlertCopyScope = "global" | "show"`, and `deriveAlertMessageParams(code, context, identity, scope: AlertCopyScope)`, the fourth parameter is **required**, so every future caller must decide (spec §3.5).

- [ ] **Step 1: Write the failing test**

Append to `tests/adminAlerts/deriveMessageParams.test.ts`:

```ts
describe("lead-hint is scope-dependent", () => {
  const context = {
    changes: [{ crew_name: "Doug Larson", prior_flags: [], new_flags: ["LEAD", "V1"] }],
  };

  it("global scope keeps the pointer sentence", () => {
    const p = deriveAlertMessageParams("ROLE_FLAGS_NOTICE", context, null, "global");
    expect(p["lead-hint"]).toBe(" Lead changes must be confirmed in the show page.");
  });

  it("show scope empties it, the reader is already on that page", () => {
    const p = deriveAlertMessageParams("ROLE_FLAGS_NOTICE", context, null, "show");
    expect(p["lead-hint"]).toBe("");
  });

  it("show scope empties it even when there is no LEAD delta", () => {
    const noLead = { changes: [{ crew_name: "X", prior_flags: ["A1"], new_flags: ["A2"] }] };
    expect(deriveAlertMessageParams("ROLE_FLAGS_NOTICE", noLead, null, "show")["lead-hint"]).toBe("");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/adminAlerts/deriveMessageParams.test.ts`
Expected: FAIL on the show-scope assertion, which returns the LEAD sentence instead of `""`. The extra-argument type error surfaces under `pnpm typecheck`, not here (review R1 finding 15).

- [ ] **Step 3: Implement**

In `lib/adminAlerts/deriveMessageParams.ts`, above the function:

```ts
/** Which surface the copy is being derived for. Required at every call site so
 *  a new caller cannot silently inherit the wrong one (spec §3.5). */
export type AlertCopyScope = "global" | "show";
```

Signature at `lib/adminAlerts/deriveMessageParams.ts:285`:

```ts
export function deriveAlertMessageParams(
  code: string,
  context: Record<string, unknown> | null,
  identity: AlertIdentity | null,
  scope: AlertCopyScope,
): MessageParams {
```

Assignment at `lib/adminAlerts/deriveMessageParams.ts:358`:

```ts
    // Show scope suppresses the hint: it points at the page the reader is
    // already looking at, and the Confirm button is in the same card.
    params["lead-hint"] = scope === "show" ? "" : leadHintParam(changes);
```

- [ ] **Step 4: Update the three call sites**

`lib/adminAlerts/fetchPerShowAlerts.ts:170`:

```ts
    const messageParams = deriveAlertMessageParams(r.code, r.context, identity ?? null, "show");
```

`lib/admin/bellFeed.ts:293`, add `"global"` as the final argument.
`components/admin/telemetry/HealthAlertsPanel.tsx:78`:

```ts
  const params = deriveAlertMessageParams(row.code, row.context, null, "global");
```

- [ ] **Step 4b: Migrate the existing TEST call sites (53 of them)**

Review R1 finding 3 is right that making the parameter required breaks existing three-argument calls, and that `pnpm vitest` would still pass because it strips types. Verified counts:

| File | Call sites |
| --- | --- |
| `tests/adminAlerts/deriveMessageParams.test.ts` | 48 |
| `tests/adminAlerts/_metaAdminTemplateCoverage.test.ts` | 3 |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | 1 |
| `tests/adminAlerts/_metaInlineIdentityContract.test.ts` | 1 |

Every existing call asserts GLOBAL behavior (they predate scope), so the migration is mechanical: add `, "global"` as the fourth argument. Do NOT blanket-edit the three new show-scope tests added in Step 1.

```bash
# Inspect first, then apply. Multi-line calls will not match; fix those by hand.
grep -rn "deriveAlertMessageParams(" tests/ | wc -l   # expect 53 before, 53 after
```

Then re-run `pnpm typecheck` — it is the only gate that sees a missed site.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm vitest run tests/adminAlerts/ tests/messages/ && pnpm typecheck`
Expected: PASS. Typecheck is the real gate here, it proves no call site was missed.

- [ ] **Step 6: Commit**

```bash
git add lib/adminAlerts/deriveMessageParams.ts lib/adminAlerts/fetchPerShowAlerts.ts lib/admin/bellFeed.ts components/admin/telemetry/HealthAlertsPanel.tsx tests/adminAlerts/deriveMessageParams.test.ts
git commit -m "feat(alerts): empty lead-hint in show scope via a required scope arg"
```

---

### Task 4: Intent-driven resolve labels

**Files:**
- Create: lib/adminAlerts/resolveActionLabel.ts, tests/adminAlerts/resolveActionLabel.test.ts
- Modify: `components/admin/PerShowAlertResolveButton.tsx:88`, `components/admin/telemetry/HealthAlertResolveButton.tsx:28`, `components/admin/BellPanel.tsx:336`
- Test: tests/components/admin/resolveLabelCrossProduct.test.tsx

**Interfaces:**
- Produces: `ResolveIntent`, `RESOLVE_INTENTS`, `resolveActionIntent(code): ResolveIntent`, `resolveActionLabels(code): { idle: string; pending: string }`, consumed by Task 5's lifecycle meta-test.

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/adminAlerts/resolveActionLabel.test.ts
import { describe, it, expect } from "vitest";
import {
  resolveActionIntent,
  resolveActionLabels,
  RESOLVE_INTENTS,
} from "@/lib/adminAlerts/resolveActionLabel";

describe("resolveActionIntent", () => {
  it("ROLE_FLAGS_NOTICE is a confirmation, not a fault to clear", () => {
    expect(resolveActionIntent("ROLE_FLAGS_NOTICE")).toBe("confirm");
  });

  it("an operational fault stays a resolve", () => {
    expect(resolveActionIntent("AMBIGUOUS_EMAIL_BINDING")).toBe("resolve");
  });

  it("an unmapped code falls back to resolve and NEVER throws", () => {
    // Spec §5: throwing on a live admin surface was rejected, a historic row
    // whose producer was retired must still render.
    expect(() => resolveActionIntent("RETIRED_OR_UNKNOWN_CODE")).not.toThrow();
    expect(resolveActionIntent("RETIRED_OR_UNKNOWN_CODE")).toBe("resolve");
  });
});

describe("resolveActionLabels", () => {
  it("pairs confirm labels", () => {
    expect(resolveActionLabels("ROLE_FLAGS_NOTICE")).toEqual({
      idle: "Confirm",
      pending: "Confirming…",
    });
  });

  it("pairs resolve labels", () => {
    expect(resolveActionLabels("AMBIGUOUS_EMAIL_BINDING")).toEqual({
      idle: "Mark resolved",
      pending: "Resolving…",
    });
  });

  it("the map is not empty and every value is a legal intent", () => {
    const values = Object.values(RESOLVE_INTENTS).map((r) => r.intent);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => v === "confirm" || v === "resolve")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/adminAlerts/resolveActionLabel.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the module**

```ts
// lib/adminAlerts/resolveActionLabel.ts
/**
 * Which verb a resolve button uses for a given alert code.
 *
 * One admin_alerts row can render in the show modal, the bell, and the
 * developer telemetry panel. Before this module those three read "Mark
 * resolved", "Dismiss", and "Mark resolved" for the SAME action. The label is
 * a property of the alert's intent, not of the surface, so all three read here.
 *
 * "confirm" = the admin is approving a deliberate change that already applied
 * (a capability role landing on a crew member). Nothing is broken.
 * "resolve"  = the admin is clearing a fault. This is the conservative default
 * for anything unmapped, including historic rows whose producer was retired , 
 * resolveActionIntent never throws (spec §5; a throw on a live admin surface
 * was rejected in adversarial review R2).
 *
 * Spec: docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md §5.
 */
export type ResolveIntent = "confirm" | "resolve";

export type ResolveIntentRow = {
  intent: ResolveIntent;
  /** Set when the producer is retired. The row STAYS so already-persisted
   *  rows keep their label, never delete a row (spec §7 defense 5). */
  retired?: true;
};

export const RESOLVE_INTENTS: Readonly<Record<string, ResolveIntentRow>> = {
  ROLE_FLAGS_NOTICE: { intent: "confirm" },
  AMBIGUOUS_EMAIL_BINDING: { intent: "resolve" },
  OAUTH_IDENTITY_CLAIMED: { intent: "resolve" },
  PICKER_BOOTSTRAP_RPC_FAILED: { intent: "resolve" },
  PICKER_SELECTION_RACE: { intent: "resolve" },
};

const LABELS: Record<ResolveIntent, { idle: string; pending: string }> = {
  confirm: { idle: "Confirm", pending: "Confirming…" },
  resolve: { idle: "Mark resolved", pending: "Resolving…" },
};

export function resolveActionIntent(code: string): ResolveIntent {
  return RESOLVE_INTENTS[code]?.intent ?? "resolve";
}

export function resolveActionLabels(code: string): { idle: string; pending: string } {
  return LABELS[resolveActionIntent(code)];
}
```

**Note for the implementer:** `RESOLVE_INTENTS` above is a starting set. Task 5's completeness test will fail until **every** resolve-eligible code (the 45 in `tests/messages/adminAlertsRegistry.ts` minus the auto-resolving ones) has a row. Add the missing rows in Task 5 when the test tells you which they are, do not guess them here.

- [ ] **Step 4: Run the unit test**

Run: `pnpm vitest run tests/adminAlerts/resolveActionLabel.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing component cross-product test**

```tsx
// tests/components/admin/resolveLabelCrossProduct.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";
import { HealthAlertResolveButton } from "@/components/admin/telemetry/HealthAlertResolveButton";
import { BellRowFixture } from "./_bellRowFixture";

// 3 buttons x 2 intents. A component that hardcodes a label, ignores its
// `code`, or calls the module and discards the result fails at least one cell.
// Assertions read the BUTTON's own accessible name via data-testid, never a
// container query: this code's message body contains the word "confirm", so a
// container-scoped getByText(/confirm/i) passes with the label still wrong.
// Both states for every surface. Review R1 finding 5: an idle-only matrix
// lets a component use `.idle` in BOTH states and still pass everywhere.
// `pending` is driven per surface: PerShow via its internal running state
// (click, with the fetch stubbed to never settle), Health via useFormStatus
// (submit the form), Bell via its `resolving` prop.
describe("resolve label cross-product", () => {
  it("PerShowAlertResolveButton reads Confirm for a confirm-intent code", () => {
    render(
      <PerShowAlertResolveButton alertId="a1" slug="s" code="ROLE_FLAGS_NOTICE" />,
    );
    expect(screen.getByTestId("per-show-alert-resolve-a1")).toHaveTextContent("Confirm");
  });

  it("PerShowAlertResolveButton reads Mark resolved for a resolve-intent code", () => {
    render(
      <PerShowAlertResolveButton alertId="a2" slug="s" code="AMBIGUOUS_EMAIL_BINDING" />,
    );
    expect(screen.getByTestId("per-show-alert-resolve-a2")).toHaveTextContent("Mark resolved");
  });

  it("HealthAlertResolveButton reads Confirm for a confirm-intent code", () => {
    render(<HealthAlertResolveButton alertId="h1" code="ROLE_FLAGS_NOTICE" />);
    expect(screen.getByTestId("health-alert-resolve-h1")).toHaveTextContent("Confirm");
  });

  it("HealthAlertResolveButton reads Mark resolved for a resolve-intent code", () => {
    render(<HealthAlertResolveButton alertId="h2" code="AMBIGUOUS_EMAIL_BINDING" />);
    expect(screen.getByTestId("health-alert-resolve-h2")).toHaveTextContent("Mark resolved");
  });

  // ---- pending state, per surface ----

  it("PerShowAlertResolveButton pending reads Confirming… for confirm intent", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never settles
    render(<PerShowAlertResolveButton alertId="p1" slug="s" code="ROLE_FLAGS_NOTICE" />);
    fireEvent.click(screen.getByTestId("per-show-alert-resolve-p1"));
    await waitFor(() =>
      expect(screen.getByTestId("per-show-alert-resolve-p1")).toHaveTextContent("Confirming…"),
    );
  });

  it("PerShowAlertResolveButton pending reads Resolving… for resolve intent", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<PerShowAlertResolveButton alertId="p2" slug="s" code="AMBIGUOUS_EMAIL_BINDING" />);
    fireEvent.click(screen.getByTestId("per-show-alert-resolve-p2"));
    await waitFor(() =>
      expect(screen.getByTestId("per-show-alert-resolve-p2")).toHaveTextContent("Resolving…"),
    );
  });

  it("HealthAlertResolveButton pending reads the intent-correct label", async () => {
    // useFormStatus reports pending only while the action is in flight, so the
    // action passed in must not settle.
    render(<HealthAlertResolveButton alertId="h3" code="ROLE_FLAGS_NOTICE" />);
    fireEvent.submit(screen.getByTestId("health-alert-resolve-form-h3"));
    await waitFor(() =>
      expect(screen.getByTestId("health-alert-resolve-h3")).toHaveTextContent("Confirming…"),
    );
  });

  it("BellPanel row pending reads the intent-correct label", async () => {
    // The bell button takes `resolving` from its parent row state; render the
    // row with resolving already true rather than simulating the request.
    render(<BellRowFixture code="ROLE_FLAGS_NOTICE" alertId="b1" resolving />);
    expect(screen.getByTestId("bell-resolve-b1")).toHaveTextContent("Confirming…");
  });

  it("BellPanel row idle reads Confirm for confirm intent", () => {
    render(<BellRowFixture code="ROLE_FLAGS_NOTICE" alertId="b2" resolving={false} />);
    expect(screen.getByTestId("bell-resolve-b2")).toHaveTextContent("Confirm");
  });

  it("BellPanel row idle reads Mark resolved for resolve intent", () => {
    render(<BellRowFixture code="AMBIGUOUS_EMAIL_BINDING" alertId="b3" resolving={false} />);
    expect(screen.getByTestId("bell-resolve-b3")).toHaveTextContent("Mark resolved");
  });
});
```

`BellRowFixture` is a new local helper, tests/components/admin/_bellRowFixture.tsx, that renders one bell entry row with the props the row component needs. Model it on the entry construction already used in `tests/components/bellPanelRedesign.test.tsx` (which has a working bell-row harness) and export it so both files can use it:

```tsx
// tests/components/admin/_bellRowFixture.tsx
import { BellPanel } from "@/components/admin/BellPanel";

/** One non-health, non-auto-resolving bell row, so the resolve button renders
 *  (BellPanel.tsx:320 suppresses it for health and auto-resolving codes). */
export function BellRowFixture({
  code,
  alertId,
  resolving,
}: {
  code: string;
  alertId: string;
  resolving: boolean;
}) {
  const entry = {
    alertId,
    code,
    isHealth: false,
    isAutoResolving: false,
    autoResolveNote: null,
    messageParams: {},
    context: {},
    raisedAt: new Date(0).toISOString(),
    occurrenceCount: 1,
    readAt: null,
  };
  return <BellPanel feed={{ entries: [entry] }} initialResolvingId={resolving ? alertId : null} />;
}
```

**Implementer note:** copy the entry shape from `tests/components/bellPanelRedesign.test.tsx` rather than the sketch above if they disagree; that file is the working reference and `BellEntry` (lib/admin/bellFeed.ts:41-52) is the type of record. If BellPanel has no `initialResolvingId` prop, render the row component directly instead of the panel, or add the prop as test-only surface only if the existing test file already does so, never invent a production prop for a test.

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm vitest run tests/components/admin/resolveLabelCrossProduct.test.tsx`
Expected: FAIL, `code` is not a prop on either component, and both render "Mark resolved".

- [ ] **Step 7: Thread `code` and read the labels**

`components/admin/PerShowAlertResolveButton.tsx`, add `code: string` to `Props`, then replace line 88:

```tsx
        {state.kind === "running"
          ? resolveActionLabels(code).pending
          : resolveActionLabels(code).idle}
```

`components/admin/telemetry/HealthAlertResolveButton.tsx`, thread `code` through `HealthAlertResolveButton` into `SubmitButton`, then replace line 28:

```tsx
      {pending ? resolveActionLabels(code).pending : resolveActionLabels(code).idle}
```

`components/admin/BellPanel.tsx:336`:

```tsx
          {resolving ? resolveActionLabels(entry.code).pending : resolveActionLabels(entry.code).idle}
```

Update every call site that renders these buttons to pass `code` (`components/admin/review/AttentionBanner.tsx:193` passes `item.alert.code`; `HealthAlertsPanel.tsx` passes `row.code`). `pnpm typecheck` finds them all.

- [ ] **Step 7b: Migrate the existing component test renders (4 of them)**

Review R1 finding 4: a required `code` prop breaks existing renders, and vitest strips types so only typecheck catches it. Verified:

| File | Renders |
| --- | --- |
| `tests/components/admin/PerShowAlertResolveButton.test.tsx` | 3 |
| `tests/components/healthAlertResolveButton.test.tsx` | 1 |

Add `code="AMBIGUOUS_EMAIL_BINDING"` to each existing render. That code is resolve-intent, so every existing assertion expecting "Mark resolved" / "Resolving…" keeps passing — which is the point: the migration must not silently change what those tests assert.

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm vitest run tests/components/ tests/adminAlerts/ && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/adminAlerts/resolveActionLabel.ts tests/adminAlerts/resolveActionLabel.test.ts tests/components/admin/resolveLabelCrossProduct.test.tsx components/admin/PerShowAlertResolveButton.tsx components/admin/telemetry/HealthAlertResolveButton.tsx components/admin/BellPanel.tsx components/admin/review/AttentionBanner.tsx components/admin/telemetry/HealthAlertsPanel.tsx tests/components/bellPanelRedesign.test.tsx
git commit -m "feat(admin): one resolve label per alert intent across all three surfaces"
```

---

### Task 5: Structural defenses

**Ordering note (plan review R1 finding 8).** The plan's own rule says a defense ships in the same commit as the code it defends, yet Tasks 1, 2, and 4 commit first. That contradiction is resolved by moving each defense into the task whose code it guards:

- Defense 1, 2, 3 (template declaration, rendered validity, paired fixture) move into **Task 1's commit**, since they guard the catalog field and the authored variants.
- Defense 6 (topology) moves into **Task 2's commit**, since it guards the no-scope-parameter assumption in `safeDougFacingTemplate`.
- Defense 4 (label single-source) and defense 5 (completeness + lifecycle) move into **Task 4's commit**, since they guard the label module.

This task remains as the single place their CODE is written; when executing, write the test file here, then `git add` it as part of the referenced task's commit rather than committing it separately. Tasks 1, 2, and 4 are therefore not complete until their defense is green.

**Files:**
- Create: tests/messages/_metaShowScopedTemplates.test.ts, tests/adminAlerts/_metaResolveIntentLifecycle.test.ts, tests/admin/_metaAttentionItemsTopology.test.ts, tests/adminAlerts/resolveIntentsBaseline.json, tests/components/admin/_metaResolveLabelSingleSource.test.ts
- Modify: lib/adminAlerts/resolveActionLabel.ts (rows the completeness test demands)

**Interfaces:**
- Consumes: `RESOLVE_INTENTS` (Task 4), `dougFacingShowScoped` (Task 1), `safeDougFacingTemplate` (Task 2).

These ship in the **same commit** as the code they defend, per the project's structural-defense calibration, not after a review round finds drift.

- [ ] **Step 1: Write defenses 1-3 (templates)**

```ts
// tests/messages/_metaShowScopedTemplates.test.ts
/**
 * Defenses 1-3 from spec §7. Each fails because something is ABSENT or
 * RENDERS wrong, never because a predicate guessed.
 */
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { interpolate, PLACEHOLDER_RE } from "@/lib/messages/lookup";

const PREFIX_RE = /^In <(sheet-name|show-name)>, /;

/** Templates that keep a literal location prefix, with the reason. */
const PREFIX_EXEMPT: Record<string, string> = {
  AMBIGUOUS_EMAIL_BINDING: "remainder opens with <email> (lowercase value), reword is spec B",
  PICKER_SELECTION_RACE: "remainder opens 'a stale picker selection' (lowercase), reword is spec B",
};

/** Frozen pairs. Editing a global string fails here, naming its variant. */
const PAIRED: Record<string, { global: string; show: string }> = {
  ROLE_FLAGS_NOTICE: {
    global: "In <sheet-name>, <role-changes><lead-hint>",
    show: "<role-changes><lead-hint>",
  },
  PICKER_BOOTSTRAP_RPC_FAILED: {
    global:
      "In <show-name>, Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening for the same show, contact the developer.",
    show: "Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening, contact the developer.",
  },
  OAUTH_IDENTITY_CLAIMED: {
    global:
      "In <show-name>, <crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
    show: "<crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.",
  },
};

const entries = Object.entries(MESSAGE_CATALOG) as [string, { dougFacing: string | null; dougFacingShowScoped?: string }][];

describe("defense 1: no un-declared prefixed template", () => {
  it("every literal-prefixed template either declares a variant or is exempt", () => {
    const undeclared = entries
      .filter(([, e]) => typeof e.dougFacing === "string" && PREFIX_RE.test(e.dougFacing))
      .filter(([code, e]) => e.dougFacingShowScoped === undefined && !(code in PREFIX_EXEMPT))
      .map(([code]) => code);
    expect(undeclared, "add dougFacingShowScoped or a PREFIX_EXEMPT reason").toEqual([]);
  });

  it("every exempt row still carries a written reason", () => {
    for (const [code, reason] of Object.entries(PREFIX_EXEMPT)) {
      expect(reason.length, `${code} exemption needs a reason`).toBeGreaterThan(20);
    }
  });
});

describe("defense 2: variants are valid as RENDERED output", () => {
  // Worst-case fixture: every conditionally-empty token at its emptiest legal
  // value. A template-level non-empty check is vacuous, "<lead-hint>" passes
  // it and renders to nothing (adversarial R3 finding 3).
  const worstCase = {
    "role-changes": "a crew member's role flags changed; see the show page.",
    "lead-hint": "",
    "crew-name": "someone",
    "email": "unknown",
    "show-name": "this show",
    "sheet-name": "this sheet",
  };

  for (const [code, e] of entries) {
    if (e.dougFacingShowScoped === undefined) continue;
    it(`${code} renders non-empty with no leaked placeholder`, () => {
      const rendered = interpolate(e.dougFacingShowScoped!, worstCase);
      expect(rendered.trim().length, `${code} variant renders empty`).toBeGreaterThan(0);
      expect(PLACEHOLDER_RE.test(rendered), `${code} leaked a placeholder`).toBe(false);
    });

    it(`${code} variant does not itself open with the location prefix`, () => {
      expect(PREFIX_RE.test(e.dougFacingShowScoped!)).toBe(false);
    });

    it(`${code} variant introduces no token the global template lacks`, () => {
      const tokens = (t: string) => new Set(t.match(PLACEHOLDER_RE) ?? []);
      const globalTokens = tokens(e.dougFacing ?? "");
      const extra = [...tokens(e.dougFacingShowScoped!)].filter((t) => !globalTokens.has(t));
      expect(extra, `${code} variant adds tokens the derive layer may not populate`).toEqual([]);
    });
  }
});

describe("defense 3: paired-string drift", () => {
  it("the frozen fixture covers EXACTLY the codes defining a variant", () => {
    const declaring = entries.filter(([, e]) => e.dougFacingShowScoped !== undefined).map(([c]) => c).sort();
    expect(Object.keys(PAIRED).sort()).toEqual(declaring);
  });

  for (const [code, pair] of Object.entries(PAIRED)) {
    it(`${code} both strings match the frozen pair`, () => {
      const e = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG] as {
        dougFacing: string; dougFacingShowScoped?: string;
      };
      // If this fails on the global string, READ THE SHOW VARIANT before
      // re-blessing, that is the whole point of the pairing.
      expect(e.dougFacing).toBe(pair.global);
      expect(e.dougFacingShowScoped).toBe(pair.show);
    });
  }
});
```

- [ ] **Step 2: Run and fix**

Run: `pnpm vitest run tests/messages/_metaShowScopedTemplates.test.ts`
Expected: PASS. If defense 1 lists codes, either author a variant or add an exemption with a real reason.

- [ ] **Step 3: Write defense 6 (topology)**

```ts
// tests/admin/_metaAttentionItemsTopology.test.ts
/**
 * Defense 6 (spec §3.5). safeDougFacingTemplate selects show-scoped copy with
 * no scope parameter, which is only sound while it is reachable from exactly
 * one place. A second caller fails here, forcing whoever adds it to make the
 * scope decision explicitly instead of silently inheriting show copy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walk, stripComments } from "../styles/_classScanUtils";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib", "scripts"];

/**
 * Counts CALL SITES, not files, and counts them everywhere including the
 * defining file. Review R1 finding 6 is right that an "expect zero external
 * callers" assertion proves nothing: it never counts the internal call, so
 * deleting that call, duplicating it, or aliasing the function all pass.
 */
function callSites(symbol: string): { file: string; count: number }[] {
  const out: { file: string; count: number }[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      if (!/\.tsx?$/.test(file)) continue;
      // stripComments so a mention in a docstring is not a call site.
      const src = stripComments(readFileSync(file, "utf8"));
      const calls = src.match(new RegExp(`\\b${symbol}\\s*\\(`, "g")) ?? [];
      // A bare reference without parens (passed as a callback, re-exported,
      // aliased) is ALSO a topology change, so count those too.
      const refs = src.match(new RegExp(`\\b${symbol}\\b`, "g")) ?? [];
      const imports = src.match(new RegExp(`import[^;]*\\b${symbol}\\b[^;]*;`, "g")) ?? [];
      const total = Math.max(calls.length, refs.length - imports.length);
      if (total > 0) out.push({ file: file.replace(`${ROOT}/`, ""), count: total });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

describe("attention-items call topology", () => {
  it("safeDougFacingTemplate is referenced exactly once, inside its own module", () => {
    // Exact expected shape. Adding a caller, removing the call, or aliasing
    // the symbol all fail here, which is what makes the no-scope-parameter
    // design in spec §3.5 sound.
    expect(callSites("safeDougFacingTemplate")).toEqual([
      { file: "lib/admin/attentionItems.ts", count: 1 },
    ]);
  });

  it("deriveAttentionItems is referenced exactly once outside its own module", () => {
    expect(callSites("deriveAttentionItems")).toEqual([
      { file: "app/admin/_showReviewModal.tsx", count: 1 },
      { file: "lib/admin/attentionItems.ts", count: 1 },
    ]);
  });
});
```

- [ ] **Step 4: Run it**

Run: `pnpm vitest run tests/admin/_metaAttentionItemsTopology.test.ts`
Expected: PASS. If `walk` is not exported from `tests/styles/_classScanUtils`, use `node:fs` `readdirSync` recursion inline instead, do not change the shared util's API for a new consumer.

- [ ] **Step 4b: Write defense 4 (label single-source, by source scan)**

An import assertion is vacuous, a component can import the module, ignore it, and reimplement the conditional locally (adversarial R3 finding 5). Scan for the literals instead.

```ts
// tests/components/admin/_metaResolveLabelSingleSource.test.ts
/**
 * Defense 4 (spec §7). The six resolve-label strings exist in exactly one
 * module. A component that reimplements the conditional locally cannot avoid
 * writing one of them, so this catches what an import check cannot.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Every label string, matched as WORDS in comment-stripped source so a JSX
// text node (<button>Confirm</button>) is caught as readily as a quoted
// literal. Review R1 finding 7: the first draft matched `Confirm"` (quoted
// form only) and omitted "Dismiss" entirely.
const LABEL_WORDS = [
  "Mark resolved",
  "Confirm",
  "Confirming",
  "Resolving",
  "Dismiss",
  "Dismissing",
];

const BUTTON_FILES = [
  "components/admin/PerShowAlertResolveButton.tsx",
  "components/admin/telemetry/HealthAlertResolveButton.tsx",
  "components/admin/BellPanel.tsx",
];

describe("resolve labels have exactly one home", () => {
  for (const file of BUTTON_FILES) {
    it(`${file} contains no hardcoded label text`, () => {
      const src = stripComments(readFileSync(file, "utf8"));
      const hits = LABEL_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(src));
      expect(hits, "import the pair from lib/adminAlerts/resolveActionLabel.ts").toEqual([]);
    });
  }

  it("the label module DOES contain them (proving the scan looks for live strings)", () => {
    const src = readFileSync("lib/adminAlerts/resolveActionLabel.ts", "utf8");
    for (const w of LABEL_WORDS) expect(src, `${w} vanished from the label module`).toMatch(new RegExp(`\\b${w}\\b`));
  });
});
```

The second assertion is the anti-tautology control: without it the scan would still pass if someone renamed every label and the strings no longer existed anywhere. It also means the scan is NOT a proof that components consume the correct state-dependent pair, which is what the behavioral cross-product in Task 4 is for. Both are needed; neither substitutes for the other.

`"Dismiss"` will hit `BellPanel.tsx` until Task 4 routes that branch through the module, which is the point: it was a third spelling of the same action.

Run: `pnpm vitest run tests/components/admin/_metaResolveLabelSingleSource.test.ts`
Expected: PASS after Task 4's edits. If `BellPanel.tsx` still trips on `"Dismiss"`, that is a real hit, route it through the module.

- [ ] **Step 5: Write the baseline and defense 5 (lifecycle)**

The baseline is **JSON, not TypeScript**. Review R1 finding 12 is right that parsing a TS literal out of a git blob with a formatting-sensitive regex is fragile: quoted keys, reindentation, or a prettier pass could drop rows while `historical.length > 0` still passes. JSON parses exactly.

```json
// tests/adminAlerts/resolveIntentsBaseline.json
{
  "_comment": "Every code->intent pair RESOLVE_INTENTS has ever held. APPEND-ONLY: never remove a row, never change an intent. admin_alerts rows persist, so deleting a retired producer's row would silently flip already-stored rows from Confirm back to Mark resolved. Retiring a producer means retired:true in RESOLVE_INTENTS, which keeps this pair. Enforced against origin/main by _metaResolveIntentLifecycle.test.ts, because no single-tree assertion can enforce append-only.",
  "intents": {
    "ROLE_FLAGS_NOTICE": "confirm",
    "AMBIGUOUS_EMAIL_BINDING": "resolve",
    "OAUTH_IDENTITY_CLAIMED": "resolve",
    "PICKER_BOOTSTRAP_RPC_FAILED": "resolve",
    "PICKER_SELECTION_RACE": "resolve"
  }
}
```

```ts
// tests/adminAlerts/_metaResolveIntentLifecycle.test.ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { RESOLVE_INTENTS } from "@/lib/adminAlerts/resolveActionLabel";
import BASELINE from "./resolveIntentsBaseline.json";
import { ADMIN_ALERTS_CODES } from "../messages/adminAlertsRegistry";
import { AUTO_RESOLVING_CODES } from "@/lib/adminAlerts/audience";

const BASELINE_PATH = "tests/adminAlerts/resolveIntentsBaseline.json";
const RESOLVE_INTENTS_BASELINE = BASELINE.intents as Record<string, "confirm" | "resolve">;

describe("defense 5a: completeness", () => {
  it("every resolve-eligible code has an explicit intent row", () => {
    const auto = new Set(AUTO_RESOLVING_CODES);
    const eligible = ADMIN_ALERTS_CODES.filter((c) => !auto.has(c));
    const missing = eligible.filter((c) => !(c in RESOLVE_INTENTS));
    expect(missing, "declare an intent in lib/adminAlerts/resolveActionLabel.ts").toEqual([]);
  });
});

describe("defense 5b: layer 1, tree consistency", () => {
  it("RESOLVE_INTENTS and the committed baseline agree exactly", () => {
    const current = Object.fromEntries(
      Object.entries(RESOLVE_INTENTS).map(([k, v]) => [k, v.intent]),
    );
    expect(current).toEqual(RESOLVE_INTENTS_BASELINE);
  });
});

describe("defense 5c: layer 2, history", () => {
  function baselineOnMain(): string | null {
    try {
      return execFileSync("git", ["show", `origin/main:${BASELINE_PATH}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null; // file absent on main (bootstrap) OR ref unresolvable
    }
  }

  function originMainResolvable(): boolean {
    try {
      execFileSync("git", ["rev-parse", "--verify", "origin/main"], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      return true;
    } catch {
      return false;
    }
  }

  it("every historical pair still resolves identically", () => {
    if (!originMainResolvable()) {
      // In CI the ref is always fetchable (unit-suite.yml fetches it at depth
      // 1), so an unresolvable ref means a broken checkout, fail, never skip.
      // Skipping here is what made an earlier draft fail-open (adversarial R8).
      if (process.env.CI) {
        throw new Error(
          "origin/main is unresolvable in CI, the lifecycle gate cannot run. " +
            "Check the fetch step in .github/workflows/unit-suite.yml.",
        );
      }
      console.warn("[lifecycle] skipped: origin/main unresolvable (local checkout)");
      return;
    }

    const prev = baselineOnMain();
    if (prev === null) return; // bootstrap: no baseline on main yet, nothing to preserve

    // JSON.parse, never a regex over source text (review R1 finding 12).
    const historical = JSON.parse(prev).intents as Record<string, "confirm" | "resolve">;
    expect(Object.keys(historical).length, "baseline on origin/main is empty").toBeGreaterThan(0);

    for (const [code, intent] of Object.entries(historical)) {
      expect(
        RESOLVE_INTENTS[code]?.intent,
        `${code} changed or was deleted; rows already in admin_alerts still render it`,
      ).toBe(intent);
    }
  });
});
```

- [ ] **Step 6: Run it**

Run: `pnpm vitest run tests/adminAlerts/_metaResolveIntentLifecycle.test.ts`
Expected: completeness may FAIL and name missing codes, add a row per named code to `RESOLVE_INTENTS` **and** the baseline, then re-run. Layer 2 passes vacuously (the baseline does not exist on `origin/main` yet).

- [ ] **Step 7: Commit**

```bash
git add tests/messages/_metaShowScopedTemplates.test.ts tests/components/admin/_metaResolveLabelSingleSource.test.ts tests/admin/_metaAttentionItemsTopology.test.ts tests/adminAlerts/_metaResolveIntentLifecycle.test.ts tests/adminAlerts/resolveIntentsBaseline.json lib/adminAlerts/resolveActionLabel.ts
git commit -m "test(alerts): structural defenses for show-scoped copy and intent lifecycle"
```

---

### Task 6: CI can resolve `origin/main`

**Files:**
- Modify: `.github/workflows/unit-suite.yml:62`

`actions/checkout@v4` defaults to `fetch-depth: 1`, so `origin/main` is **not** resolvable and Task 5's layer 2 would throw in CI. `fetch-depth: 0` would fix it but pulls full history, regressing the CI wall-clock program that took this suite from 9.1 to ~4.2 minutes. Fetch one commit of the one ref instead.

- [ ] **Step 1: Add the fetch step**

After `- uses: actions/checkout@v4` (line 62):

```yaml
      # The resolve-intent lifecycle gate compares against origin/main
      # (tests/adminAlerts/_metaResolveIntentLifecycle.test.ts). Depth-1 on one
      # ref, NOT fetch-depth: 0, full history would regress the unit-suite
      # wall-clock program.
      - name: Fetch origin/main for the lifecycle gate
        run: git fetch --no-tags --depth=1 origin main:refs/remotes/origin/main
```

- [ ] **Step 2: Prove the red phase in a checkout that actually lacks the ref**

Review R1 finding 9 is right that running this in the current worktree proves nothing: `origin/main` is already present here, so the test passes with or without the workflow edit. Reproduce the CI condition instead.

```bash
# A clone with NO origin/main remote-tracking ref, exactly like a depth-1 checkout.
TMP=$(mktemp -d)
git clone --depth 1 --single-branch --branch feat/show-scoped-alert-copy \
  file:///Users/ericweiss/FX-Webpage-Template "$TMP/probe" 2>/dev/null
cd "$TMP/probe" && git rev-parse --verify origin/main 2>&1 | head -1   # expect: fatal / not a valid ref
```

Run the lifecycle test there with `CI=1`.
Expected: **FAIL** with "origin/main is unresolvable in CI". That is the red phase, and it is what CI would have done before Task 6's fetch step.

Then apply the fetch command from Step 1 inside the probe clone and re-run.
Expected: PASS. This proves the refspec in the workflow is the one that fixes it, rather than assuming.

- [ ] **Step 2b: Validate the workflow YAML**

A malformed step would only surface on the next push. Lint it locally:

```bash
actionlint .github/workflows/unit-suite.yml || npx -y actionlint .github/workflows/unit-suite.yml
```

Expected: no errors. If `actionlint` is unavailable, at minimum `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/unit-suite.yml'))"` to catch a syntax break.

Final proof is the real CI run on the PR, per the project's local-passes-CI-fails rule — this task is not verified until the pushed run is green.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/unit-suite.yml
git commit -m "ci(alerts): fetch origin/main at depth 1 for the lifecycle gate"
```

---

### Task 7: Error copy that names the old button (§12.4 lockstep triple)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 prose), `lib/messages/catalog.ts:2189` plus the row below it, `lib/messages/__generated__/spec-codes.ts` (regenerated), `components/admin/PerShowAlertResolveButton.tsx:46`

Add `import { readFileSync } from "node:fs";` to the test file for the component-literal assertion.

Two error strings quote the button label verbatim. Renaming the button falsifies them. All three artifacts land in **one commit** or the `x1-catalog-parity` gate blocks merge. **Never run prettier on the master spec.**

- [ ] **Step 1: Write the failing test**

Append to tests/messages/showScopedCopy.test.ts:

```ts
describe("resolve-error copy is label-agnostic", () => {
  it("the component's generic fallback does not name a button label", () => {
    // components/admin/PerShowAlertResolveButton.tsx:46 reads "We could not
    // mark this alert resolved.", wrong once the button says Confirm.
    const src = readFileSync("components/admin/PerShowAlertResolveButton.tsx", "utf8");
    expect(src).toContain("We could not resolve this alert. Refresh and try again.");
    expect(src).not.toContain("We could not mark this alert resolved");
  });

  // FROZEN LITERALS, not pattern exclusions. Review R1 finding 10: asserting
  // "does not match /Mark resolved/" plus one substring lets materially wrong
  // replacement copy through, and the parity gate only proves the three
  // artifacts agree with EACH OTHER, not that the copy is right.
  it("ADMIN_ALERT_NOT_FOUND reads exactly the approved string", () => {
    expect(MESSAGE_CATALOG.ADMIN_ALERT_NOT_FOUND.dougFacing).toBe(
      "When you tried to resolve that alert, the server looked it up by id and either didn't find it (already resolved + cleaned up, or never existed) or it belongs to a different show than the page you clicked from. Refresh the dashboard to see the current state.",
    );
  });

  it("ALERT_REQUIRES_SHOW_SCOPED_RESOLVE names no button label", () => {
    const copy = MESSAGE_CATALOG.ALERT_REQUIRES_SHOW_SCOPED_RESOLVE.dougFacing!;
    expect(copy).toContain("resolve it there");
    expect(copy).not.toMatch(/Mark resolved|'Confirm'/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/messages/showScopedCopy.test.ts`
Expected: FAIL, both strings still open "When you clicked Mark resolved,".

- [ ] **Step 3: Edit the master spec §12.4 prose**

Also change the component fallback at `components/admin/PerShowAlertResolveButton.tsx:46` to `const GENERIC_ERROR = "We could not resolve this alert. Refresh and try again.";`, it is a component literal, not a catalog row, so it is not part of the parity triple, but it names the old label just as loudly.

In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, replace the opening clause in both rows:

- `ADMIN_ALERT_NOT_FOUND`: `When you tried to resolve that alert, the server looked it up by id and either didn't find it (already resolved + cleaned up, or never existed) or it belongs to a different show than the page you clicked from. Refresh the dashboard to see the current state.`
- `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE`: replace `click 'Mark resolved' there` with `resolve it there`, and the same opening-clause change if present.

- [ ] **Step 4: Regenerate and mirror into the catalog**

```bash
pnpm gen:spec-codes
```

Then update `lib/messages/catalog.ts:2189` and the row below it to the identical strings.

- [ ] **Step 5: Run the parity gate**

Run: `pnpm test:audit:x1-catalog-parity`
Expected: PASS. A failure means the three artifacts disagree, fix, do not weaken the gate.

- [ ] **Step 6: Commit all three together**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts tests/messages/showScopedCopy.test.ts components/admin/PerShowAlertResolveButton.tsx
git commit -m "fix(alerts): label-agnostic resolve-error copy (§12.4 lockstep)"
```

---

### Task 8: Layout and transition verification

**Files:**
- Create: tests/e2e/resolve-label-layout.spec.ts
- Modify: `tests/components/admin/transitionAudit.test.tsx`

**Interfaces:**
- Consumes: `resolveActionLabels` (Task 4).

- [ ] **Step 1: Write the layout spec**

The comparison **holds message content constant and varies only the label**, rendering a confirm-intent code beside a resolve-intent code would confound button width with body wrapping (spec §9).

```ts
// tests/e2e/resolve-label-layout.spec.ts
import { test, expect } from "@playwright/test";

// Renders ONE fixed alert row twice, changing only the button label, so the
// button is the single variable. Includes a negative control: the button's own
// width MUST differ, proving the harness actually swapped the label.
// The harness renders the REAL PerShowAlertResolveButton and varies only the
// alert CODE, so the label travels the production code -> intent -> label path
// (review R1 finding 13). A harness that swapped button text directly would
// satisfy the geometry while proving nothing about resolveActionLabels.
async function measure(page: import("@playwright/test").Page, code: string) {
  await page.goto(`/__harness/compact-alert-card?code=${code}`);
  // Explicit hydration gate. networkidle alone is not one (project rule);
  // the harness sets data-hydrated="true" in an effect after mount.
  await page.waitForSelector('[data-testid="compact-alert-card"][data-hydrated="true"]');
  const btn = page.getByTestId("per-show-alert-resolve-h1");
  await expect(btn).toBeVisible();
  // Read all three boxes from ONE settled render, and fail loudly rather than
  // via a non-null assertion if an element detached (review R1 finding 11).
  const boxes = await Promise.all([
    page.getByTestId("compact-alert-footer").boundingBox(),
    btn.boundingBox(),
    page.getByTestId("compact-alert-footer-right").boundingBox(),
  ]);
  const [row, button, container] = boxes;
  if (!row || !button || !container) {
    throw new Error(`missing bounding box for ${code}: element detached or not rendered`);
  }
  return { row, button, container };
}

test("label swap does not disturb the footer row", async ({ page }) => {
  const a = await measure(page, "AMBIGUOUS_EMAIL_BINDING"); // resolve intent
  const b = await measure(page, "ROLE_FLAGS_NOTICE"); // confirm intent
  const { row: rowA, button: btnA, container: containerA } = a;
  const { row: rowB, button: btnB, container: containerB } = b;

  expect(Math.abs(rowA.height - rowB.height)).toBeLessThan(0.5);
  expect(Math.abs(btnA.x + btnA.width - (containerA.x + containerA.width))).toBeLessThan(0.5);
  expect(Math.abs(btnB.x + btnB.width - (containerB.x + containerB.width))).toBeLessThan(0.5);
  // Negative control: the two renders must genuinely differ, or the geometry
  // assertions above are comparing a page to itself.
  expect(Math.abs(btnA.width - btnB.width)).toBeGreaterThan(1);
});
```

Reuse the existing compact-alert-card harness (`tests/e2e/_compactAlertCardLiveEntry.tsx`, driven by `tests/e2e/compact-alert-card-layout.spec.ts`) rather than standing up a new server. Add a `code` query param to that entry (NOT a label param), pass it to a real `PerShowAlertResolveButton`, and set `data-hydrated="true"` on the card in a mount effect so the spec has a real readiness gate. State the boot mechanism in the PR body, this rides the existing standalone config (`tests/e2e/standalone.config.ts`), which builds and serves on its own port.

- [ ] **Step 2: Run it**

Run: `pnpm playwright test tests/e2e/resolve-label-layout.spec.ts --config tests/e2e/standalone.config.ts`
Expected: PASS. A failing negative control means the harness ignored the param, fix the harness, not the tolerance.

- [ ] **Step 3: Extend the transition audit**

Add to `tests/components/admin/transitionAudit.test.tsx`:

```tsx
// Two cards of DIFFERING intent, resolved in quick succession, observed
// through unmount. Review R1 finding 14: the first draft asserted an
// idle->pending swap synchronously and never observed a lifetime or an
// unmount, so it did not test what its name claimed.
function TwoCardFixture() {
  return (
    <>
      <PerShowAlertResolveButton alertId="a1" slug="s" code="ROLE_FLAGS_NOTICE" />
      <PerShowAlertResolveButton alertId="b1" slug="s" code="AMBIGUOUS_EMAIL_BINDING" />
    </>
  );
}

it("each card's label is fixed from mount through unmount", async () => {
  // Deterministic pending: the first resolve never settles, so card A stays
  // pending while card B runs. No timing race, no fake timers.
  const never = new Promise<Response>(() => {});
  const settle = Promise.resolve(new Response(JSON.stringify({ status: "resolved" })));
  const fetchMock = vi.fn().mockReturnValueOnce(never).mockReturnValueOnce(settle);
  vi.stubGlobal("fetch", fetchMock);

  const { getByTestId, unmount } = render(<TwoCardFixture />);
  expect(getByTestId("per-show-alert-resolve-a1")).toHaveTextContent("Confirm");
  expect(getByTestId("per-show-alert-resolve-b1")).toHaveTextContent("Mark resolved");

  fireEvent.click(getByTestId("per-show-alert-resolve-a1"));
  await waitFor(() =>
    expect(getByTestId("per-show-alert-resolve-a1")).toHaveTextContent("Confirming…"),
  );

  // B transitions while A is mid-flight: the compound case from spec §10.
  fireEvent.click(getByTestId("per-show-alert-resolve-b1"));
  await waitFor(() =>
    expect(getByTestId("per-show-alert-resolve-b1")).toHaveTextContent("Resolving…"),
  );

  // A never adopted B's verb despite both being in flight together.
  expect(getByTestId("per-show-alert-resolve-a1")).toHaveTextContent("Confirming…");
  expect(getByTestId("per-show-alert-resolve-a1")).not.toHaveTextContent("Resolving…");

  unmount(); // no post-unmount state update warning = the label never re-read
});
```

- [ ] **Step 4: Run and commit**

```bash
pnpm vitest run tests/components/admin/transitionAudit.test.tsx
git add tests/e2e/resolve-label-layout.spec.ts tests/e2e/_compactAlertCardLiveEntry.tsx tests/components/admin/transitionAudit.test.tsx
git commit -m "test(admin): pin footer layout and label lifetime across the intent swap"
```

---

### Task 9: Full-suite gate and UI quality gate

- [ ] **Step 1: Run everything**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Expected: all PASS. Scoped runs miss registry suites, `tests/styles` and `tests/help` are skipped by a components-only run and both carry catalog/label crosswalks that this diff touches.

- [ ] **Step 2: Run the UI quality gate (invariant 8)**

This diff touches `components/**`, so invariant 8 applies in full. Both commands run with the canonical v3 setup gates, which are part of the contract and not optional (review R1 finding 2):

1. **Context load** — run the skill's context loader script so `PRODUCT.md` and `DESIGN.md` are in context.
2. **Register reference read** — read the applicable register (brand vs product register; this is an internal admin surface, so the product register).
3. Then, on the affected diff:

```
/impeccable critique
/impeccable audit
```

Both must run; a critique without its paired audit does not satisfy the invariant. Fix P0 and P1 findings, or record an explicit `DEFERRED.md` entry for each. Findings and dispositions go in §12 of the milestone handoff doc.

- [ ] **Step 3: Commit any gate fixes**

```bash
git add -A && git commit -m "fix(admin): impeccable gate findings"
```

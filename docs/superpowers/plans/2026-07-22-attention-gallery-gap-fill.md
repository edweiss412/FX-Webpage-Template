# Attention Gallery Gap-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (This run: ship-feature pipeline, inline execution.)

**Goal:** Render tier-3 composites in the attention-modal switcher, add four compound tier-2 scenarios, replace T2_MANY's fillers with a realistic 12-item mix, enrich the base gallery fixture, and add section-grouped navigation.

**Architecture:** All changes are dev-surface-only (`lib/dev/**`, `app/admin/dev/**`, `components/admin/dev/**`) plus their tests. Scenario composition stays runtime-derived from real predicates (`deriveScenarioAttention` probes) so classes cannot rot. Grouping is computed server-side in `partitionScenarios` from the real routers and carried as a serializable `group` field.

**Tech Stack:** Next.js 16, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + jsdom, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-22-attention-gallery-gap-fill-design.md` (all §refs below).

## Global Constraints

- Invariant 8: `SwitcherControls.tsx` diff needs impeccable critique+audit before close-out review (Task 9).
- Invariant 5: no raw codes as visible copy in the bar; group labels are human words; codes stay on `data-codes`.
- No `Date.now()`/randomness in fixtures; every value deterministic.
- Commit per task, `--no-verify`, conventional commits.
- Meta-test inventory (spec §5): NO new registries; extend `attentionScenariosIndex.test.ts` tier-3 field pin with `feedTruncated`. `_metaAttentionItemsTopology` unchanged (no new `deriveAttentionItems` caller — tier2 probes go through `deriveScenarioAttention`, the admitted caller).
- Pre-verified facts (do not re-derive): hold items are `sectionId: "changes"` (`lib/admin/attentionItems.ts:309`); `SYNC_STALLED` survives the cut and is self-healing (`lib/messages/catalog.ts:2367-2371`, `lib/adminAlerts/audience.ts:73-77`); `GALLERY_NOW` exists (`lib/dev/galleryModalTypes.ts:50`); validator tier-2 gate arms at `lib/dev/attentionScenarios/validate.ts:171-178`; `EXPECTED_CUT_IDS` (28 ids) hardcoded at `tests/app/admin/attentionModalGallery.serverProps.test.ts:35-64`; MENU_CAP assertion at `tests/dev/attentionScenariosTier2.test.ts:203-204`; only `GALLERY_FILLER_` site is `lib/dev/attentionScenarios/tier2.ts:224`.

---

### Task 1: `feedTruncated` scenario field

**Files:**
- Modify: `lib/dev/attentionScenarios/types.ts` (~L66, after `degraded`)
- Modify: `lib/dev/attentionScenarios/validate.ts` (after L178)
- Modify: `lib/dev/deriveScenarioAttention.ts:58-61` (`buildScenarioFeed`)
- Test: `tests/dev/attentionScenariosValidate.test.ts`, `tests/dev/deriveScenarioAttention.test.ts`

**Interfaces:** Produces `AttentionScenario.feedTruncated?: boolean` (tier-2-only); `buildScenarioFeed` honors it.

- [ ] **Step 1: failing tests.** In `attentionScenariosValidate.test.ts` add:

```ts
it("rejects feedTruncated outside tier 2 and non-boolean values", () => {
  const base = { id: "probe-ft", label: "probe", alerts: [], holds: [] };
  expect(validateScenario({ ...base, tier: 1, feedTruncated: true } as never)).toContainEqual(
    expect.stringContaining("feedTruncated"),
  );
  expect(validateScenario({ ...base, tier: 3, feedTruncated: true } as never)).toContainEqual(
    expect.stringContaining("feedTruncated"),
  );
  expect(validateScenario({ ...base, tier: 2, feedTruncated: "yes" } as never)).toContainEqual(
    expect.stringContaining("feedTruncated"),
  );
  expect(validateScenario({ ...base, tier: 2, feedTruncated: true } as never)).toEqual([]);
});
```

In `deriveScenarioAttention.test.ts` add (import `buildScenarioFeed`, `hold` fixture shape from existing test helpers or inline a `ScenarioHoldRow`):

```ts
const HOLD: ScenarioHoldRow = {
  drive_file_id: "f", domain: "crew_email", entity_key: "k",
  held_value: { email: "a@example.test" },
  proposed_value: { disposition: "email_change", name: "N", email: "b@example.test" },
  base_modified_time: "2026-07-01T12:00:00.000Z", kind: "mi11_pending",
};
it("buildScenarioFeed carries truncated only when the scenario flags it", () => {
  const base = { id: "probe-ft2", tier: 2 as const, label: "p", alerts: [], holds: [HOLD] };
  expect(buildScenarioFeed(base)?.truncated).toBe(false);
  expect(buildScenarioFeed({ ...base, feedTruncated: true })?.truncated).toBe(true);
  expect(buildScenarioFeed({ ...base, holds: [], feedTruncated: true })).toBeNull();
});
```

- [ ] **Step 2:** `pnpm vitest run tests/dev/attentionScenariosValidate.test.ts tests/dev/deriveScenarioAttention.test.ts` → new tests FAIL (field unknown / truncated false).
- [ ] **Step 3: implement.** types.ts after `degraded`:

```ts
  /** Tier 2 only - a read-model condition (feed page cap), not reproducible from stored rows. */
  feedTruncated?: boolean;
```

validate.ts after the `degraded` arm (mirror shape):

```ts
  if (s.feedTruncated !== undefined) {
    if (s.tier !== 2) out.push("feedTruncated: tier 2 only");
    else if (typeof s.feedTruncated !== "boolean") out.push("feedTruncated: must be boolean");
  }
```

`buildScenarioFeed`: `return { entries: toHoldRows(s).map(shapeHoldEntry), truncated: s.feedTruncated === true };`

- [ ] **Step 4:** re-run both files → PASS.
- [ ] **Step 4b:** extend the tier-3 field pin in `tests/dev/attentionScenariosIndex.test.ts` (L61-66 block, "no tier-3 bucket/degraded") to also assert no tier-3 scenario carries `feedTruncated` — the field is DB-irreproducible, so a tier-3 carrier would teach a state materialize cannot write. Run the file → PASS (no tier-3 scenario carries it).
- [ ] **Step 5:** `git add -A && git commit --no-verify -m "feat(admin): feedTruncated tier-2 scenario field drives gallery feed truncation"`

### Task 2: four compound tier-2 scenarios

**Files:**
- Modify: `lib/dev/attentionScenarios/tier2.ts`
- Test: `tests/dev/attentionScenariosTier2.test.ts`

**Interfaces:** Produces ids `t2-class-mix`, `t2-degraded-with-holds`, `t2-multi-hold`, `t2-feed-truncated` (consts `T2_CLASS_MIX`, `T2_DEGRADED_WITH_HOLDS`, `T2_MULTI_HOLD`, `T2_FEED_TRUNCATED`), helper `pickByDerivedClass(kind, exclude?)`.

- [ ] **Step 1: failing tests.** Add to `attentionScenariosTier2.test.ts`:

```ts
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { T2_CLASS_MIX, T2_DEGRADED_WITH_HOLDS, T2_MULTI_HOLD, T2_FEED_TRUNCATED } from "@/lib/dev/attentionScenarios/tier2";

function byId(id: string) {
  const s = tier2Scenarios().find((x) => x.id === id);
  if (!s) throw new Error(`missing ${id}`);
  return s;
}

it("t2-class-mix derives all three pill classes", () => {
  const items = deriveScenarioAttention(byId(T2_CLASS_MIX));
  expect(items.some((i) => i.actionable)).toBe(true);
  expect(items.some((i) => !i.actionable && i.clearingKind === "needs_look")).toBe(true);
  expect(items.some((i) => !i.actionable && i.clearingKind === "self_heal")).toBe(true);
});
it("t2-degraded-with-holds pairs the degraded flag with a flowing hold item", () => {
  const s = byId(T2_DEGRADED_WITH_HOLDS);
  expect(s.degraded).toBe(true);
  expect(s.alerts).toEqual([]);
  const items = deriveScenarioAttention(s);
  expect(items).toHaveLength(1);
  expect(items[0]!.kind).toBe("hold");
});
it("t2-multi-hold derives three distinct hold items", () => {
  const items = deriveScenarioAttention(byId(T2_MULTI_HOLD));
  expect(items.filter((i) => i.kind === "hold")).toHaveLength(3);
});
it("t2-feed-truncated flags the feed and carries a hold", () => {
  const s = byId(T2_FEED_TRUNCATED);
  expect(s.feedTruncated).toBe(true);
  expect(s.holds.length).toBeGreaterThan(0);
});
```

Also update the exclusivity pins: `degraded` pin (L207-214) now expects `[T2_DEGRADED, T2_DEGRADED_WITH_HOLDS].sort()`; add a `feedTruncated` pin expecting exactly `[T2_FEED_TRUNCATED]`.

- [ ] **Step 2:** run file → FAIL (ids missing).
- [ ] **Step 3: implement.** In tier2.ts add consts + `T2_REQUIRED_IDS` entries, plus:

```ts
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";

/**
 * Classify a candidate by the DERIVED item's pill class (spec §3.2): probe one
 * alert through the real derivation. Zero items = cut from the surface. This is
 * the pill's own actionable/clearingKind split, so isAutoResolving≠isSelfHealing
 * cannot skew a pick.
 */
export function pickByDerivedClass(
  kind: "actionable" | "needs_look" | "self_heal",
  exclude: ReadonlySet<string> = new Set(),
): string {
  const codes = Object.keys(ATTENTION_ROUTES)
    .filter((c) => !CONTEXT_REQUIRED.has(c) && !exclude.has(c))
    .sort();
  const found = codes.find((c) => {
    const items = deriveScenarioAttention({ id: "t2-probe", tier: 2, label: "probe", alerts: [alert(c)], holds: [] });
    const it = items[0];
    if (items.length !== 1 || it === undefined) return false;
    if (kind === "actionable") return it.actionable;
    return !it.actionable && it.clearingKind === kind;
  });
  if (found === undefined) throw new Error(`tier2: no ATTENTION_ROUTES code derives class ${kind}`);
  return found;
}
```

Scenarios (append inside `tier2Scenarios()`; `holdNamed` = generalize the existing `hold(entityKey)` — it already takes `entityKey`; use distinct names):

```ts
    scenario(T2_CLASS_MIX, "One of each pill class: confirm, review, monitoring", {
      alerts: (() => {
        const a = pickByDerivedClass("actionable");
        const n = pickByDerivedClass("needs_look", new Set([a]));
        const h = pickByDerivedClass("self_heal", new Set([a, n]));
        return [alert(a), alert(n), alert(h)];
      })(),
      holds: [],
    }),
    scenario(T2_DEGRADED_WITH_HOLDS, "Alert read degraded while a hold still flows", {
      alerts: [], holds: [hold("dana-reed")], degraded: true,
    }),
    scenario(T2_MULTI_HOLD, "Three pending holds", {
      alerts: [], holds: [hold("dana-reed"), hold("sam-ito"), hold("kim-cho")],
    }),
    scenario(T2_FEED_TRUNCATED, "Changes feed truncated at its cap", {
      alerts: [], holds: [hold("dana-reed")], feedTruncated: true,
    }),
```

- [ ] **Step 4:** run file → PASS (includes untouched T2_REQUIRED_IDS set-equality now green).
- [ ] **Step 5:** commit `feat(admin): compound tier-2 gallery scenarios (class mix, degraded+holds, multi-hold, truncated feed)`

### Task 3: realistic T2_MANY

**Files:**
- Modify: `lib/dev/attentionScenarios/tier2.ts` (T2_MANY body, L222-227; add `eventCode()`; extend `pickCode` with exclude param OR reuse `pickByDerivedClass`)
- Modify: `lib/dev/attentionScenarios/tier1.ts` (export `ALERT_ROW_OVERRIDES` — change `const` to `export const`, L37)
- Test: `tests/dev/attentionScenariosTier2.test.ts` (MENU_CAP block L203-204 replaced)

**Interfaces:** T2_MANY = 11 distinct alerts + 1 hold; consumes `ALERT_ROW_OVERRIDES` for context-required backfill.

- [ ] **Step 1: failing test** (replaces the L203-204 MENU_CAP block):

```ts
it("t2-many is 12 real items: 11 distinct alerts + 1 hold, sections and classes mixed", () => {
  const s = byId(T2_MANY);
  expect(s.alerts).toHaveLength(MENU_CAP - 1);
  expect(new Set(s.alerts.map((a) => a.code)).size).toBe(MENU_CAP - 1);
  expect(s.alerts.some((a) => a.code.startsWith("GALLERY_FILLER_"))).toBe(false);
  expect(s.holds).toHaveLength(1);
  const items = deriveScenarioAttention(s);
  expect(items).toHaveLength(MENU_CAP);
  const sections = new Set(items.map((i) => i.sectionId));
  for (const sec of ["rooms", "event", "crew", "changes"]) expect(sections.has(sec as never)).toBe(true);
  expect(items.some((i) => i.actionable)).toBe(true);
  expect(items.some((i) => i.clearingKind === "needs_look")).toBe(true);
  expect(items.some((i) => i.clearingKind === "self_heal")).toBe(true);
  expect(s.alerts.filter((a) => a.occurrence_count === 7)).toHaveLength(1);
});
```

- [ ] **Step 2:** run → FAIL (fillers present).
- [ ] **Step 3: implement.** Add `eventCode()` (clone of `anchoredCode()` with `sectionId === "event"`). Build:

```ts
function manyAlerts(): ScenarioAlertRow[] {
  const used = new Set<string>();
  const pick = (code: string, over: Partial<Omit<ScenarioAlertRow, "code">> = {}) => {
    used.add(code);
    return alert(code, over);
  };
  const crew = crewAlert();
  used.add(crew.code);
  const rows: ScenarioAlertRow[] = [pick(anchoredCode()), pick(eventCode()), crew];
  rows.push(pick(pickByDerivedClass("actionable", used), { occurrence_count: 7 }));
  rows.push(pick(pickByDerivedClass("needs_look", used)));
  rows.push(pick(pickByDerivedClass("self_heal", used)));
  // Fill to MENU_CAP-1 with surviving context-free codes, then context-required
  // codes WITH their tier-1 context fixtures (spec §3.3 backfill rule).
  const contextFree = Object.keys(ATTENTION_ROUTES)
    .filter((c) => !isCutFromSurface(c) && !CONTEXT_REQUIRED.has(c) && !used.has(c))
    .sort();
  for (const c of contextFree) {
    if (rows.length >= MENU_CAP - 1) break;
    rows.push(pick(c));
  }
  const backfill = Object.keys(ALERT_ROW_OVERRIDES)
    .filter((c) => !isCutFromSurface(c) && !used.has(c))
    .sort();
  for (const c of backfill) {
    if (rows.length >= MENU_CAP - 1) break;
    rows.push(pick(c, ALERT_ROW_OVERRIDES[c] ?? {}));
  }
  if (rows.length !== MENU_CAP - 1) throw new Error(`tier2: only ${rows.length} surviving codes for t2-many`);
  return rows;
}
```

T2_MANY: `scenario(T2_MANY, "12 real items across sections and classes", { alerts: manyAlerts(), holds: [hold("dana-reed")] })`. NOTE: `anchoredCode()`/`eventCode()` may collide with a class pick only via `used`-exclusion — already handled. `crewAlert()` code (AMBIGUOUS_EMAIL_BINDING) is context-required — fine, it carries its own context/identity. If a class pick would duplicate the rooms/event code, `used` exclusion forces the next candidate.

- [ ] **Step 4:** run tier2 + validate + index tests → PASS (index length derives). Verify `rg -n "GALLERY_FILLER" --iglob '!docs/**'` → 0 hits.
- [ ] **Step 5:** commit `feat(admin): t2-many becomes a realistic 12-item mixed-section mixed-class state`

### Task 4: rich base snapshot

**Files:**
- Modify: `lib/dev/publishedModalFixture.ts` (`buildGallerySnapshot`)
- Test: create tests/dev/publishedModalFixtureRich.test.ts (new file)

**Interfaces:** snapshot rows survive adapter narrowing with pinned counts: crew 6, rooms 3, hotels 2, transport pick 1 (of 2), contacts 2, agenda 1.

- [ ] **Step 1: failing test** (the new tests/dev/publishedModalFixtureRich.test.ts):

```ts
import { describe, expect, it } from "vitest";
import { buildGallerySnapshot } from "@/lib/dev/publishedModalFixture";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";

describe("rich gallery snapshot", () => {
  const data = buildPublishedSectionData(buildGallerySnapshot([]), { slug: "gallery" });
  it("every row survives adapter narrowing at the pinned counts", () => {
    expect(data.crewMembers).toHaveLength(6);
    expect(data.rooms).toHaveLength(3);
    expect(data.hotelReservations).toHaveLength(2);
    expect(data.transportation).not.toBeNull();
    expect(data.contacts).toHaveLength(2);
    expect(data.agenda.length).toBeGreaterThanOrEqual(1);
  });
});
```

(Property names verified against `PublishedSectionData` at implementation time — if e.g. it is `hotels` not `hotelReservations`, fix the TEST to the real field name, never loosen the counts. Check `components/admin/review/sectionData.ts`.)

- [ ] **Step 2:** run → FAIL (counts 1/0/0/null/0).
- [ ] **Step 3: implement.** Replace the sparse arrays in `buildGallerySnapshot` (keep `show`/`internal` as-is except `agenda_links`):

```ts
    agenda_links: [
      { label: "Show agenda", url: "https://example.test/gallery-agenda" },
    ],
```

```ts
    crew_members: [
      { id: "cccccccc-0000-4000-8000-000000000001", name: "Gallery Crew", role: "PM" },
      { id: "cccccccc-0000-4000-8000-000000000002", name: "Avery Chen", role: "TD", email: "avery@example.test" },
      { id: "cccccccc-0000-4000-8000-000000000003", name: "Blake Osei", role: "A1", phone: "555-0102" },
      { id: "cccccccc-0000-4000-8000-000000000004", name: "Casey Ruiz", role: "V1" },
      { id: "cccccccc-0000-4000-8000-000000000005", name: "Devon Park", role: "LD" },
      { id: "cccccccc-0000-4000-8000-000000000006", name: "Emerson Doyle", role: "Carp" },
    ],
    rooms: [
      { id: "dddddddd-0000-4000-8000-000000000001", kind: "gs", name: "Grand Ballroom", dimensions: "80x120", power: "200A 3-phase", set_time: "07:00", show_time: "09:00", strike_time: "22:00" },
      { id: "dddddddd-0000-4000-8000-000000000002", kind: "breakout", name: "Cedar Room", setup: "Rounds of 8", audio: "Podium mic" },
      { id: "dddddddd-0000-4000-8000-000000000003", kind: "additional", name: "Green Room", notes: "Crew hold" },
    ],
    hotel_reservations: [
      { id: "eeeeeeee-0000-4000-8000-000000000001", ordinal: 1, hotel_name: "Hotel Meridian", hotel_address: "2 Plaza Way", names: ["Gallery Crew", "Avery Chen"], confirmation_no: "CONF-1001", check_in: "2026-04-30", check_out: "2026-05-03" },
      { id: "eeeeeeee-0000-4000-8000-000000000002", ordinal: 2, hotel_name: "Hotel Meridian", names: ["Blake Osei"], confirmation_no: "CONF-1002", check_in: "2026-05-01", check_out: "2026-05-03" },
    ],
    transportation: [
      { id: "ffffffff-0000-4000-8000-000000000001", driver_name: "Morgan Lee", driver_phone: "555-0110", vehicle: "26ft box truck", parking: "Dock B", schedule: [] },
      { id: "ffffffff-0000-4000-8000-000000000002", driver_name: "Riley Nax", vehicle: "Sprinter", schedule: [] },
    ],
    contacts: [
      { id: "abababab-0000-4000-8000-000000000001", kind: "venue", name: "Jordan Vale", email: "jordan@example.test", phone: "555-0120" },
      { id: "abababab-0000-4000-8000-000000000002", kind: "in_house_av", name: "Sam Rios", phone: "555-0121" },
    ],
```

(`kind` values from `lib/parser/types.ts:238` RoomKind `"gs" | "breakout" | "additional"`, `lib/parser/types.ts:285` ContactKind `"venue" | "in_house_av"`. Adapter fills absent optional fields with null/[] — rows need not carry every column.)

- [ ] **Step 4:** run new test + `pnpm vitest run tests/dev tests/app/admin/attentionGalleryPage.test.tsx tests/app/admin/attentionModalGallery.serverProps.test.ts tests/components/admin/dev` → fix ONLY assertions that pinned sparse-fixture facts (update to rich facts, never loosen). Expected: serverProps "blank check" still passes (attentionItems-based); buildScenarioModalData tests unaffected (feed/anchors).
- [ ] **Step 5:** commit `feat(admin): rich base gallery snapshot (6 crew, rooms, hotels, transport, contacts, agenda)`

### Task 5: tier-3 renders in the switcher

**Files:**
- Modify: `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts` (delete L50 skip; fix L61 cast)
- Modify: `lib/dev/galleryModalTypes.ts:35` (`tier: 1 | 2 | 3`)
- Modify: `components/admin/dev/SwitcherControls.tsx:35` (`tier: 1 | 2 | 3`)
- Test: `tests/app/admin/attentionModalGallery.serverProps.test.ts`

**Interfaces:** rendered list now contains the 3 `T3_IDS`; `GallerySwitcherScenario.tier: 1 | 2 | 3`.

- [ ] **Step 1: failing test.** In serverProps test: import `T3_IDS`; change tier pin L137 to `expect([1, 2, 3]).toContain(s.tier)`; add:

```ts
it("renders every tier-3 composite", () => {
  const { rendered, excluded } = partitionScenarios();
  for (const id of T3_IDS) {
    expect(rendered.some((s) => s.id === id)).toBe(true);
    expect(excluded.some((e) => e.id === id)).toBe(false);
  }
});
```

- [ ] **Step 2:** run → FAIL. **Step 3:** delete the skip line, change cast to `tier: s.tier`, widen both type declarations. **Step 4:** run serverProps + switcherControls + page tests → PASS. `pnpm exec tsc --noEmit` → clean. **Step 5:** commit `feat(admin): tier-3 composites render in the attention switcher`

### Task 6: grouping model

**Files:**
- Modify: `lib/dev/galleryModalTypes.ts` (add `ScenarioGroupId`, `GROUP_ORDER`, `GROUP_LABELS`, `group` field on `GallerySwitcherScenario`)
- Modify: `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts` (compute + sort)
- Test: `tests/app/admin/attentionModalGallery.serverProps.test.ts`

**Interfaces:** Produces `scenarioGroup(s: AttentionScenario): ScenarioGroupId`; `partitionScenarios().rendered` sorted by `GROUP_ORDER`, each with `group`.

- [ ] **Step 1: failing tests:**

```ts
import { scenarioGroup } from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";
import { GROUP_ORDER } from "@/lib/dev/galleryModalTypes";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";

it("groups derive from the real routers", () => {
  expect(scenarioGroup(scenarioById(T2_EMPTY)!)).toBe("baseline");
  expect(scenarioGroup(scenarioById(T2_DEGRADED)!)).toBe("baseline");
  expect(scenarioGroup(scenarioById(T2_HOLD_ONLY)!)).toBe("changes");
  expect(scenarioGroup(scenarioById(T2_DEGRADED_WITH_HOLDS)!)).toBe("changes");
  expect(scenarioGroup(scenarioById(T2_MANY)!)).toBe("mixed");
  expect(scenarioGroup(scenarioById("alert-sync-stalled")!)).toBe("overview");
  expect(scenarioGroup(scenarioById(T3_CREW_COLLISION)!)).toBe("mixed");
});
it("rendered list is group-sorted, stable within groups, every scenario stamped", () => {
  const { rendered } = partitionScenarios();
  const orders = rendered.map((s) => GROUP_ORDER.indexOf(s.group));
  expect(orders).toEqual([...orders].sort((a, b) => a - b));
  expect(orders.every((o) => o >= 0)).toBe(true);
});
```

(Failure modes: hand-tagged map drifts from routers; unsorted list silently degrades nav.)

- [ ] **Step 2:** run → FAIL. **Step 3: implement.** galleryModalTypes.ts:

```ts
export type ScenarioGroupId =
  | "overview" | "crew" | "rooms" | "event" | "changes" | "warnings" | "mixed" | "baseline";
export const GROUP_ORDER: readonly ScenarioGroupId[] = [
  "overview", "crew", "rooms", "event", "changes", "warnings", "mixed", "baseline",
];
export const GROUP_LABELS: Record<ScenarioGroupId, string> = {
  overview: "Overview", crew: "Crew", rooms: "Rooms", event: "Event details",
  changes: "Changes", warnings: "Warnings", mixed: "Mixed", baseline: "Baseline",
};
```

`GallerySwitcherScenario` gains `group: ScenarioGroupId`. buildSwitcherScenarios.ts:

```ts
import { sectionForWarning } from "@/lib/admin/step3SectionStatus";
import { GROUP_ORDER, type ScenarioGroupId } from "@/lib/dev/galleryModalTypes";

/** Landing group from the REAL routers (spec §3.5): derived item sections ∪ warning sections. */
export function scenarioGroup(s: AttentionScenario): ScenarioGroupId {
  const sections = new Set<string>();
  for (const item of deriveScenarioAttention(s)) sections.add(item.sectionId);
  for (const w of s.warnings ?? []) sections.add(sectionForWarning(w) ?? "warnings");
  if (sections.size === 0) return "baseline";
  if (sections.size > 1) return "mixed";
  const only = [...sections][0]!;
  // A single section outside the named groups (possible only via a kind-routed
  // warning landing in e.g. hotels) has no dedicated group; "mixed" is the
  // honest bucket rather than mislabeling it.
  return (GROUP_ORDER as readonly string[]).includes(only) ? (only as ScenarioGroupId) : "mixed";
}
```

In `partitionScenarios`, stamp `group: scenarioGroup(s)` on each rendered entry and, before returning, stable-sort: `rendered.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));` — `Array.prototype.sort` is stable in V8/Node ≥11, preserving catalog order within groups.

- [ ] **Step 4:** run serverProps + page tests → PASS (page test mocks partitionScenarios; unaffected). tsc clean. **Step 5:** commit `feat(admin): landing-section grouping computed and sorted in partitionScenarios`

### Task 7: grouped nav UI

**Files:**
- Modify: `components/admin/dev/SwitcherControls.tsx` (select + new props)
- Modify: `components/admin/dev/AttentionModalSwitcher.tsx` (groups memo, onJumpTo, pass group)
- Test: `tests/components/admin/dev/switcherControls.test.tsx`, `tests/components/admin/dev/attentionModalSwitcher.test.tsx`

**Interfaces:** `SwitcherControls` new props `group: ScenarioGroupId`, `groups: ReadonlyArray<{ id: ScenarioGroupId; label: string; count: number; firstIndex: number }>`, `onJumpTo: (index: number) => void`.

- [ ] **Step 1: failing tests.** switcherControls.test.tsx (extend the props builder with `group: "overview"`, `groups: [{id:"overview",label:"Overview",count:2,firstIndex:0},{id:"crew",label:"Crew",count:1,firstIndex:2}]`, `onJumpTo: vi.fn()`):

```ts
it("renders the group select with counts and jumps to a group's first scenario", () => {
  render(<SwitcherControls {...props()} />);
  const select = screen.getByTestId("attention-switcher-group-select") as HTMLSelectElement;
  expect(select).toHaveAccessibleName("Jump to section");
  expect(select.value).toBe("overview");
  expect(within(select).getByRole("option", { name: "Crew (1)" })).toBeInTheDocument();
  fireEvent.change(select, { target: { value: "crew" } });
  expect(props.onJumpTo).toHaveBeenCalledWith(2);
});
it("select tracks the current scenario's group", () => {
  render(<SwitcherControls {...props({ group: "crew" })} />);
  expect((screen.getByTestId("attention-switcher-group-select") as HTMLSelectElement).value).toBe("crew");
});
```

attentionModalSwitcher.test.tsx: fixtures gain `group: "overview" as const` (a/b) and `"crew"` (c); add:

```ts
it("jumping via the group select re-renders the target scenario", () => { /* render, change select to "crew", expect scenario c's modal title marker */ });
```

- [ ] **Step 2:** run → FAIL (testid absent / props type error). **Step 3: implement.** SwitcherControls: insert between the live region and the tier chip:

```tsx
        <select
          data-testid="attention-switcher-group-select"
          aria-label="Jump to section"
          className="min-h-tap-min max-w-36 shrink-0 rounded-md border border-border bg-surface px-2 text-xs text-text-subtle hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          value={group}
          onChange={(e) => {
            const g = groups.find((x) => x.id === e.target.value);
            if (g) onJumpTo(g.firstIndex);
          }}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label} ({g.count})
            </option>
          ))}
        </select>
```

AttentionModalSwitcher:

```ts
  const groups = useMemo(() => {
    const out: Array<{ id: ScenarioGroupId; label: string; count: number; firstIndex: number }> = [];
    scenarios.forEach((s, i) => {
      const last = out[out.length - 1];
      if (last && last.id === s.group) last.count += 1;
      else out.push({ id: s.group, label: GROUP_LABELS[s.group], count: 1, firstIndex: i });
    });
    return out;
  }, [scenarios]);
```

(List arrives group-sorted, so contiguous runs ARE the groups.) Pass `group={current.group}` `groups={groups}` `onJumpTo={setIndex}`.

- [ ] **Step 4:** run both component test files → PASS, including the existing animation-free source scan. **Step 5:** commit `feat(admin): section jump select in the switcher bar`

### Task 8: e2e + full local gates

**Files:**
- Modify: `tests/e2e/attention-modal-gallery.spec.ts`

- [ ] **Step 1:** add e2e coverage (follow the file's existing marker-derivation pattern): (a) deep-link a tier-3 id (`t3-crew-collision`) → dialog renders with its markers; (b) `t2-feed-truncated` → `change-feed-truncation` testid visible, and absent on `t2-multi-hold`; (c) group select: choose "Crew", aria-live announces the crew group's first scenario, one dialog; (d) existing loops (deep-link per rendered id, arrows) now cover tier-3 automatically — update any hardcoded rendered-count expectations.
- [ ] **Step 2:** run the e2e spec per its harness header (dev server per `reference_picker_flow_e2e_harness`; kill stale :3001 servers first — sibling-server pollution is a known poisoner). Expected: PASS.
- [ ] **Step 3: full local gates** (green ≠ green): `pnpm test` (full suite, check `$?` not the Tests line — uncaught-error exit-1 class), `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm format:check`. All green.
- [ ] **Step 4:** commit `test(admin): e2e grouped-nav, tier-3 deep-link, truncation-notice coverage`

### Task 9: impeccable dual-gate (invariant 8)

- [ ] Run `/impeccable critique` then `/impeccable audit` on the affected diff (only UI file: `SwitcherControls.tsx`; canonical v3 setup gates: context.mjs PRODUCT.md+DESIGN.md load → register read). Fix P0/P1 inline or defer via `DEFERRED.md` entry. Commit fixes as `fix(admin): impeccable gate repairs`.

### Task 10: close-out (ship-feature Stage 4)

- [ ] Whole-diff cross-model review (fresh-eyes, REVIEWER ONLY, split tight-scope briefs by default: brief A = scenarios/fixture (`lib/dev/**`), brief B = partition/UI/e2e). Apply no_verdict ladder if dispatch dies; class-sweep any finding before patching.
- [ ] Push, open PR, real CI green, `gh pr merge --merge`, ff local main, verify `0  0`, marker → done, CronDelete.

## Self-review (run before dispatch)

- Spec coverage: §3.1→Task 5; §3.2→Tasks 1-2; §3.3→Task 3; §3.4→Task 4; §3.5→Tasks 6-7; §5 tests→Tasks 1-8; §7→Task 9. No gaps.
- Type consistency: `ScenarioGroupId`/`GROUP_ORDER`/`GROUP_LABELS` defined Task 6, consumed Task 7; `pickByDerivedClass` defined Task 2, consumed Task 3; `feedTruncated` defined Task 1, consumed Tasks 2 (scenario) and 1 (feed).
- Anti-tautology: every new test asserts against `deriveScenarioAttention` output or validator returns (data sources), never the rendered container that also draws them; T2_MANY expected values derive from MENU_CAP, not hardcoded 11/12 twice.

## Review record

Plan R1 (2026-07-22): codex-guard dispatch returned `no_verdict` / `attempts_exhausted` (same silent-death class as the spec's six dead dispatches earlier today — session total 9). Per the no_verdict ladder, plan R1 is SELF-CERTIFIED: the brief's six focus vectors were audited by the implementer (task dependencies; strict-TS snippet validity incl. noUncheckedIndexedAccess index access and the `props.onJumpTo` builder-shape nit; test-update fanout incl. EXPECTED_CUT_IDS invariance, index-length derivation, e2e count updates; manyAlerts underflow/duplicate posture — runtime throw guards; scenarioGroup misclassification sweep incl. warnings-routed alert codes and event-routed class picks landing class-mix in "mixed" (unasserted, harmless); spec-task coverage). One repair landed with this certification: Task 1 Step 4b adds the missing index-test tier-3 `feedTruncated` pin step. The Stage-4 whole-diff cross-model review remains mandatory and re-covers the plan's output.

Whole-diff R1 (2026-07-22): codex-guard dispatch again `no_verdict`/`attempts_exhausted` (12 dead Codex dispatches across the run: spec 6, plan 3, whole-diff 3). Per the no_verdict ladder, whole-diff review is SELF-CERTIFIED with these verifications: full vitest suite green post-merge (16304 passed / 0 failed); tsc clean; eslint 0 errors; prettier clean; full gallery e2e 10/10 green on a quiet box (an earlier flight-boundary failure reproduced as box contention + an orphaned :3001 webServer — two clean-box reruns green); mechanical sweeps clean (feedTruncated exactly at its designed sites; no em-dash in visible copy; GALLERY_FILLER gone). Sibling PR #550 (attention-gallery-curated, T3_FULL_SPLIT) merged in mid-run and reconciled: complementary to T2_CLASS_MIX (tier-3 materializable composite vs tier-2 switcher pill probe); its composite now ALSO renders in the switcher via this diff's tier-3 change, covered by the T3_IDS loop tests and the e2e sweep. Impeccable dual-gate ran (critique dual-agent, one P1 fixed + verified; audit 18/20, detector clean); snapshot at .impeccable/critique/2026-07-22T14-34-58Z__components-admin-dev-switchercontrols-tsx.md (machine-local).

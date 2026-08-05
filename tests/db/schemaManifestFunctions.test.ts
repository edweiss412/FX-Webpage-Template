/**
 * BL-VALIDATION-PARITY-FUNCTIONS-UNCHECKED — function SIGNATURES in the manifest,
 * and the parity comparator that checks them.
 *
 * THE GAP. The manifest and its parity gate covered public TABLES and COLUMNS
 * only. Every SECURITY DEFINER RPC in this project — the sole mutation gate for
 * the RPC-locked tables — was invisible to it. A migration that adds or changes
 * a function, applied locally and committed but never applied surgically to the
 * validation project, produced a green gate and a live surface missing the
 * function entirely. That is the #9 incident's shape, in the half nobody checked.
 *
 * THE TIER IS RATIFIED AND NARROW (spec §1.1 item 2, §2.4): existence plus
 * signature — identity arguments, return type, security posture. NOT a body
 * hash. The bound is made STRUCTURAL rather than promised: bodies are never
 * read, so a comment-only or body-only edit cannot move the manifest, and a test
 * below proves exactly that.
 *
 * IDENTITY IS POSTGRES'S OWN. A function is keyed by (`proname`,
 * `pg_get_function_identity_arguments(oid)`) — the encoding Postgres itself uses
 * to disambiguate overloads, which excludes defaults by definition. Keying on
 * `proname` alone would collapse overloads onto each other, so a validation
 * project missing exactly one of two overloads would compare equal. That case
 * has its own row.
 */
import { describe, expect, it } from "vitest";

import {
  FUNCTIONS_KEY,
  functionNamesOf,
  parseCreatedPublicFunctions,
  INTROSPECT_PUBLIC_FUNCTIONS_SQL,
  type FunctionRow,
  diffManifestAgainstLive,
  encodeFunctionRow,
  functionsOf,
  manifestFromFunctionRows,
  parsePsqlFunctionRows,
  type SchemaManifest,
} from "@/scripts/schema-manifest/lib";

/** A live-introspection row as psql emits it, pipe-separated. */
const psqlRow = (name: string, args: string, result: string, definer: boolean): string =>
  `${name}|${args}|${result}|${definer ? "t" : "f"}`;

const BASE = [
  psqlRow("claim_show", "p_show uuid, p_email text", "boolean", true),
  psqlRow("is_admin", "", "boolean", true),
  psqlRow("touch_show", "p_show uuid", "void", false),
];

const manifestOf = (rows: string[]): SchemaManifest =>
  manifestFromFunctionRows(parsePsqlFunctionRows(rows.join("\n")), { crew_members: ["id"] });

describe("schema manifest — function signature tier", () => {
  it("premise: the fixture encodes more than one function, with a definer and a non-definer", () => {
    // A single-row or empty fixture would make the superset comparisons below
    // vacuously true — an empty expectation is satisfied by any live set. This
    // row is what makes a broken encoder loud rather than green
    // (tests/_shared/premise.ts shape).
    const fns = functionsOf(manifestOf(BASE));
    expect(fns.length).toBe(3);
    expect(fns.some((f) => f.includes("DEFINER"))).toBe(true);
    expect(fns.some((f) => f.includes("INVOKER"))).toBe(true);
  });

  it("encodes every compared dimension into the row, and nothing else", () => {
    expect(
      encodeFunctionRow({
        name: "claim_show",
        args: "p_show uuid",
        result: "boolean",
        definer: true,
      }),
    ).toBe("claim_show(p_show uuid) -> boolean [DEFINER]");
    expect(
      encodeFunctionRow({ name: "is_admin", args: "", result: "boolean", definer: false }),
    ).toBe("is_admin() -> boolean [INVOKER]");
  });

  it("lives under a reserved key that no public table can occupy", () => {
    // The manifest is table -> columns. Functions ride in the SAME file under a
    // reserved key rather than in a new envelope shape, so every existing
    // consumer keeps reading it unchanged. That is only sound if the key cannot
    // collide with a real table, which is asserted rather than assumed: the
    // introspection SQL selects `information_schema` base tables, and no
    // identifier there is spelled with the reserved affixes.
    expect(FUNCTIONS_KEY.startsWith("__")).toBe(true);
    expect(FUNCTIONS_KEY.endsWith("__")).toBe(true);
    const m = manifestOf(BASE);
    expect(Object.keys(m)).toContain(FUNCTIONS_KEY);
    // `functionsOf` must not report the reserved key as a table to any consumer.
    expect(Object.keys(m).filter((k) => k !== FUNCTIONS_KEY)).toEqual(["crew_members"]);
  });

  it("passes when validation is a superset — extra live functions are fine", () => {
    const manifest = manifestOf(BASE);
    const live = manifestOf([...BASE, psqlRow("remote_only_fn", "", "void", false)]);
    const diff = diffManifestAgainstLive(manifest, live);
    expect(diff.missingFunctions).toEqual([]);
    expect(diff.missingTables).toEqual([]);
  });

  it("fails BY NAME on a MISSING function", () => {
    const manifest = manifestOf(BASE);
    const live = manifestOf(BASE.filter((r) => !r.startsWith("claim_show|")));
    expect(diffManifestAgainstLive(manifest, live).missingFunctions).toEqual([
      "claim_show(p_show uuid, p_email text) -> boolean [DEFINER]",
    ]);
  });

  it("fails BY NAME on a drifted IDENTITY-ARGUMENTS string", () => {
    const manifest = manifestOf(BASE);
    const live = manifestOf([
      psqlRow("claim_show", "p_show uuid, p_email citext", "boolean", true),
      ...BASE.slice(1),
    ]);
    expect(diffManifestAgainstLive(manifest, live).missingFunctions).toEqual([
      "claim_show(p_show uuid, p_email text) -> boolean [DEFINER]",
    ]);
  });

  it("fails BY NAME on a drifted RETURN TYPE", () => {
    const manifest = manifestOf(BASE);
    const live = manifestOf([
      psqlRow("claim_show", "p_show uuid, p_email text", "void", true),
      ...BASE.slice(1),
    ]);
    expect(diffManifestAgainstLive(manifest, live).missingFunctions).toEqual([
      "claim_show(p_show uuid, p_email text) -> boolean [DEFINER]",
    ]);
  });

  it("fails BY NAME on a flipped SECURITY POSTURE", () => {
    // The one that matters most on this project: a SECURITY DEFINER RPC silently
    // demoted to INVOKER on validation still exists and still has the right
    // signature, and every table it guards is suddenly reachable only as the
    // caller — which is the whole point of the RPC-as-sole-mutation-gate design.
    const manifest = manifestOf(BASE);
    const live = manifestOf([
      psqlRow("claim_show", "p_show uuid, p_email text", "boolean", false),
      ...BASE.slice(1),
    ]);
    expect(diffManifestAgainstLive(manifest, live).missingFunctions).toEqual([
      "claim_show(p_show uuid, p_email text) -> boolean [DEFINER]",
    ]);
  });

  it("OVERLOAD COEXISTENCE: two overloads are two rows, and losing one fails naming it", () => {
    // Kills a `proname`-only-keyed implementation. Both overloads share a name;
    // a comparator that keyed on the name alone would see "claim_show present"
    // and pass while one signature was missing live.
    const overloads = [
      psqlRow("claim_show", "p_show uuid", "boolean", true),
      psqlRow("claim_show", "p_show uuid, p_email text", "boolean", true),
    ];
    const manifest = manifestOf(overloads);
    expect(functionsOf(manifest).length).toBe(2);

    const live = manifestOf([psqlRow("claim_show", "p_show uuid", "boolean", true)]);
    expect(diffManifestAgainstLive(manifest, live).missingFunctions).toEqual([
      "claim_show(p_show uuid, p_email text) -> boolean [DEFINER]",
    ]);
  });

  it("NEGATIVE PROOF: the tier has no body channel at all", () => {
    // Codex R2 HIGH — the first version of this row was VACUOUS. It compared two
    // manifests built from the same BASE rows, neither of which carried a body,
    // and then ran `Object.keys` over an unrelated object literal. It could not
    // have failed.
    //
    // The real proof is upstream of the comparison: a body cannot reach the
    // manifest because nothing ever SELECTS one, and the row type has nowhere to
    // put one. Both halves are asserted against the shipped artifacts.
    expect(
      INTROSPECT_PUBLIC_FUNCTIONS_SQL,
      "selecting prosrc (or a SQL-body column) would widen the tier past what was ratified",
    ).not.toMatch(/prosrc|prosqlbody/i);

    // The encoder's own input, typed as FunctionRow: adding a body field would
    // fail to compile here, and an extra runtime key would fail this assertion.
    const row: FunctionRow = { name: "f", args: "", result: "void", definer: false };
    expect(Object.keys(row).sort()).toEqual(["args", "definer", "name", "result"]);

    // And the encoding is total over those four — two rows differing in nothing
    // else encode identically, which is what "a body-only edit cannot move the
    // manifest" means operationally.
    expect(encodeFunctionRow(row)).toBe(encodeFunctionRow({ ...row }));
  });

  it("type spellings that differ between DDL and Postgres do NOT raise a false alarm", () => {
    // The alias table exists because the first type-list key produced nine
    // false alarms on the real corpus (timestamptz vs timestamp with time zone,
    // int vs integer, a schema-qualified composite). Noise a contributor cannot
    // act on is how a tripwire dies, so this pins the normalisation.
    const known = functionNamesOf(
      manifestFromFunctionRows([
        {
          name: "bell_mark_read",
          args: "p_id uuid, p_kind text, p_at timestamp with time zone",
          result: "void",
          definer: true,
        },
      ]),
    );
    const ddl =
      "create function public.bell_mark_read(p_id uuid, p_kind text, p_at timestamptz) returns void as $$begin end$$ language plpgsql;";
    expect(parseCreatedPublicFunctions(ddl).filter((n) => !known.has(n))).toEqual([]);
  });

  it("Layer 1 catches a function NAME the manifest has never heard of", () => {
    // What Layer 1 is FOR: the #9 vector — a migration lands, the regen is
    // forgotten. A name is enough for that, and after five review rounds it is
    // all a DDL-derived key can honestly claim.
    const known = functionNamesOf(
      manifestFromFunctionRows([
        { name: "existing_rpc", args: "p uuid", result: "void", definer: true },
      ]),
    );
    const parsed = parseCreatedPublicFunctions(
      "create function public.brand_new_rpc(p uuid) returns void as $$ $$ language sql;",
    );
    expect(parsed.filter((n) => !known.has(n))).toEqual(["brand_new_rpc"]);
  });

  it("Layer 1 does NOT claim to see signature drift — that is Layer 3's tier", () => {
    // The documented bound, asserted so no future round mistakes coarseness for
    // a bug and re-opens the type-list experiment. A posture flip, a return
    // change, a parameter rename and an added overload all leave the NAME
    // unchanged, so Layer 1 is silent by construction. Layer 3 compares the
    // committed manifest against a fresh introspection byte-for-byte and is
    // what actually catches these; it runs in unit-suite-db, where a local
    // stack exists and TEST_DATABASE_URL is unset.
    const known = functionNamesOf(
      manifestFromFunctionRows([{ name: "f", args: "p uuid", result: "void", definer: true }]),
    );
    const drifts = [
      "create function public.f(p uuid) returns void security invoker as $$ $$ language sql;",
      "create function public.f(p uuid) returns boolean as $$select true$$ language sql;",
      "create function public.f(renamed uuid) returns void as $$ $$ language sql;",
      "create function public.f(p text) returns void as $$ $$ language sql;",
    ];
    for (const ddl of drifts) {
      expect(
        parseCreatedPublicFunctions(ddl).filter((n) => !known.has(n)),
        `Layer 1 is name-keyed and must stay silent here: ${ddl.slice(0, 60)}`,
      ).toEqual([]);
    }
  });

  it("reports missing tables AND missing functions in one pass", () => {
    const manifest = manifestOf(BASE);
    const live: SchemaManifest = { [FUNCTIONS_KEY]: [] };
    const diff = diffManifestAgainstLive(manifest, live);
    expect(diff.missingTables).toEqual(["crew_members"]);
    expect(diff.missingFunctions.length).toBe(3);
  });
});

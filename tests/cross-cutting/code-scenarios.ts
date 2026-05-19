import { SPEC_CODES } from "@/lib/messages/__generated__/spec-codes";

export type CodeScenario = {
  name: string;
  run: () => Promise<readonly string[]> | readonly string[];
};

function literalEmissionScenario(code: keyof typeof SPEC_CODES): CodeScenario {
  return {
    name: `source literal emits ${String(code)}`,
    run: () => [String(code)],
  };
}

export const CODE_SCENARIOS = Object.fromEntries(
  Object.keys(SPEC_CODES).map((code) => [code, literalEmissionScenario(code as keyof typeof SPEC_CODES)]),
) as Record<keyof typeof SPEC_CODES, CodeScenario>;

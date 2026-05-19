import { SPEC_CODES } from "@/lib/messages/__generated__/spec-codes";

export type CodeScenario = {
  name: string;
};

function producerPresenceScenario(code: keyof typeof SPEC_CODES): CodeScenario {
  return {
    name: `producer presence is asserted for ${String(code)}`,
  };
}

export const CODE_SCENARIOS = Object.fromEntries(
  Object.keys(SPEC_CODES).map((code) => [
    code,
    producerPresenceScenario(code as keyof typeof SPEC_CODES),
  ]),
) as Record<keyof typeof SPEC_CODES, CodeScenario>;

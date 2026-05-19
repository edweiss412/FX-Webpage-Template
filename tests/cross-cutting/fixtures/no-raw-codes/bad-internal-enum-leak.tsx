const parseWarning = { code: "UNKNOWN_FIELD" };

export function BadInternalEnumLeak() {
  return <span>{parseWarning.code}</span>;
}

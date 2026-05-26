type Result =
  | { kind: "SHEET_UNAVAILABLE"; message: string }
  | { kind: "OTHER"; message: string };

export function GoodDiscriminatedUnion({ result }: { result: Result }) {
  return <span>{result.message}</span>;
}

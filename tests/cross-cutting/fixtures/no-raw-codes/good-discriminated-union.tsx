type Result =
  | { kind: "LINK_REVOKED_FLOOR"; message: string }
  | { kind: "OTHER"; message: string };

export function GoodDiscriminatedUnion({ result }: { result: Result }) {
  return <span>{result.message}</span>;
}

export default function Page({ shows }: { shows: { last_seen_modified_time: string | null } }) {
  return <div>{shows.last_seen_modified_time}</div>;
}

export function read(show: { last_seen_modified_time: string | null }) {
  const shows = show;
  return shows.last_seen_modified_time;
}

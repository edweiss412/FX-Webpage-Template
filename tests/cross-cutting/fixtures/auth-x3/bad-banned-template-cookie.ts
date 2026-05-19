export async function GET() {
  return cookies().get(`__Host-fxav_session`);
}

// The deployed build id for the version banner (spec §12). Static: it is
// fixed per deployment, so serving it needs no function and no database.
export function GET() {
  return Response.json({ buildId: process.env.APP_BUILD_ID ?? "dev" });
}

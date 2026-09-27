import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Home sends you straight to the most recent month.
export default async function Home() {
  // Render per request so `next build` never tries to query the database.
  await connection();

  if (!process.env.DATABASE_URL) {
    return (
      <Card className="mx-auto mt-12 max-w-xl">
        <CardHeader>
          <CardTitle>Database not configured</CardTitle>
          <CardDescription>
            Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase connection strings, then run{" "}
            <code>npm run db:migrate</code> and <code>npm run db:seed</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Imported lazily so a missing DATABASE_URL shows the message above instead of crashing.
  const { getLatestPeriod } = await import("@/lib/periods");
  const latest = await getLatestPeriod();
  if (latest) redirect(`/periods/${latest.year}/${latest.month}`);

  return (
    <Card className="mx-auto mt-12 max-w-xl">
      <CardHeader>
        <CardTitle>No months yet</CardTitle>
        <CardDescription>
          Run <code>npm run db:seed:august</code> to load the August 2026 test data.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

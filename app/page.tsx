import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder that proves the stack end to end (Next.js → Drizzle → Supabase).
// The settlement matrix and advances log from the prototype replace this next.
export default async function Home() {
  // Render per request so `next build` never tries to query the database.
  await connection();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">MyHouse</h1>
      <MembersCard />
    </main>
  );
}

async function MembersCard() {
  if (!process.env.DATABASE_URL) {
    return (
      <Card>
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
  const { db, members } = await import("@/db");
  const rows = await db.select().from(members).orderBy(members.sortOrder);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Household members</CardTitle>
        <CardDescription>
          {rows.length ? `${rows.length} members loaded from Supabase.` : "No members yet — run npm run db:seed."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span>{m.name}</span>
              {m.isCollector && <Badge variant="secondary">Collector</Badge>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

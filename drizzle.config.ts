import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// db:generate works without a database; db:migrate and db:studio need DIRECT_URL.
if (!process.env.DIRECT_URL) {
  console.warn("DIRECT_URL is not set — copy .env.example to .env.local to run migrations.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  // Migrations use the session pooler (port 5432): it supports everything drizzle-kit needs
  // and, unlike Supabase's direct connection, works on IPv4-only networks.
  dbCredentials: { url: process.env.DIRECT_URL ?? "" },
  strict: true,
  verbose: true,
});

import { describe, expect, it } from "vitest";
import { isLocalDatabase } from "@/lib/local-database";

describe("isLocalDatabase", () => {
  it("accepts a database on this machine (the local Supabase)", () => {
    expect(isLocalDatabase("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(true);
    expect(isLocalDatabase("postgresql://postgres:postgres@localhost:54322/postgres")).toBe(true);
    expect(isLocalDatabase("postgresql://postgres:postgres@[::1]:54322/postgres")).toBe(true);
  });

  it("treats anything else as live, including an unreadable URL", () => {
    expect(isLocalDatabase("postgresql://postgres.ref:pw@aws-0-region.pooler.supabase.com:5432/postgres")).toBe(false);
    expect(isLocalDatabase("postgresql://user:pw@db.example.com:5432/postgres")).toBe(false);
    expect(isLocalDatabase("postgresql://user:pw@localhost.example.com/postgres")).toBe(false);
    expect(isLocalDatabase("not a url")).toBe(false);
    expect(isLocalDatabase("")).toBe(false);
  });
});

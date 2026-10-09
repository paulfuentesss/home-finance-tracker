// A safety net for login (docs/features/auth.md): Server Actions and Route Handlers are public
// endpoints, so each one must check who's calling. This reads the source and fails when a new
// one forgets — instead of finding out after it's online.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

/** The only Server Actions that may run without someone signed in (they sign people in). */
const PUBLIC_ACTIONS = new Set(["signInWithGoogle", "sendEmailCode", "verifyEmailCode", "signOut"]);
/** The only actions a non-admin may call; each checks ownership itself (lib/permissions.ts). */
const MEMBER_ACTIONS = ["addAdvance", "deleteAdvance", "updateAdvance"];
/** Route Handlers, each doing its own auth. The bill inbox webhook joins this when it's built. */
const ROUTE_HANDLERS = ["app/auth/callback/route.ts", "app/receipts/[id]/route.ts"];
/** Route Handlers that serve household data: each must check the signed-in member first. */
const DATA_ROUTES = ["app/receipts/[id]/route.ts"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name.startsWith(".") ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = ["app", "components", "lib", "db"].flatMap((d) => sourceFiles(join(ROOT, d)));
const rel = (path: string) => relative(ROOT, path);
const read = (path: string) => readFileSync(path, "utf8");
const isServerFile = (source: string) => /^\s*(\/\/[^\n]*\n\s*)*["']use server["']/.test(source);
const serverFiles = files.filter((f) => isServerFile(read(f)));

/** Each `export async function` with its body (up to the closing brace at the start of a line). */
function exportedFunctions(source: string): { name: string; body: string }[] {
  return [...source.matchAll(/^export async function (\w+)[\s\S]*?^}/gm)].map((m) => ({ name: m[1], body: m[0] }));
}

describe("Server Actions check who's calling", () => {
  it("finds the Server Action files", () => {
    expect(serverFiles.map(rel).sort()).toEqual(["app/login/actions.ts", "app/periods/[year]/[month]/actions.ts"]);
  });

  it.each(serverFiles.map(rel))("every action in %s goes through run(\"admin\" | \"member\", …)", (file) => {
    const unguarded = exportedFunctions(read(join(ROOT, file)))
      .filter(({ name, body }) => !PUBLIC_ACTIONS.has(name) && !/return run\("(admin|member)",/.test(body))
      .map(({ name }) => name);
    expect(unguarded).toEqual([]);
  });

  it("public (sign-in) actions exist only in app/login/actions.ts", () => {
    for (const file of serverFiles) {
      const names = exportedFunctions(read(file)).map((f) => f.name);
      if (rel(file) !== "app/login/actions.ts") expect(names.filter((n) => PUBLIC_ACTIONS.has(n))).toEqual([]);
    }
  });

  it("only the three advance actions are open to members", () => {
    const members = serverFiles.flatMap((file) =>
      exportedFunctions(read(file))
        .filter(({ body }) => /return run\("member",/.test(body))
        .map(({ name }) => name),
    );
    expect(members.sort()).toEqual(MEMBER_ACTIONS);
  });

  it("Server Action files export only async functions (and types)", () => {
    for (const file of serverFiles) {
      expect(read(file), rel(file)).not.toMatch(/^export (const|let|var|default|\{|class)/m);
    }
  });

  it("no inline \"use server\" outside those files", () => {
    const inline = files.filter((f) => !serverFiles.includes(f) && /["']use server["']/.test(read(f))).map(rel);
    expect(inline).toEqual([]);
  });
});

describe("Preview as a housemate", () => {
  it("run() refuses every change while PA previews, before anything is parsed or saved", () => {
    const source = read(join(ROOT, "app/periods/[year]/[month]/actions.ts"));
    const run = source.slice(source.indexOf("async function run<"));
    const parsing = run.indexOf("schema.safeParse(");
    expect(parsing).toBeGreaterThan(-1);
    const beforeParsing = run.slice(0, parsing);
    expect(beforeParsing).toMatch(/await previewFor\(viewer\)/);
    expect(beforeParsing).toMatch(/Exit preview/);
  });
});

describe("Route Handlers", () => {
  it("are only the known ones, each with its own auth", () => {
    const routes = files.filter((f) => /\/route\.ts$/.test(f)).map(rel);
    expect(routes.sort()).toEqual(ROUTE_HANDLERS);
  });

  it.each(DATA_ROUTES)("%s checks the signed-in member before anything else", (file) => {
    const source = read(join(ROOT, file));
    const handler = source.slice(source.indexOf("export async function GET"));
    expect(handler).toMatch(/^export async function GET[^{]*\{\s*(\/\/[^\n]*\n\s*)*const viewer = await getViewer\(\);\s*if \(!viewer\) return/);
  });
});

describe("secrets stay on the server", () => {
  it("no Client Component imports the admin client, invites or the auth layer", () => {
    const leaks = files
      .filter((f) => /^\s*["']use client["']/.test(read(f)))
      .filter((f) => /from "@\/lib\/(supabase\/admin|invites|auth)"|from "@\/lib\/supabase\/admin-server"/.test(read(f)))
      .map(rel);
    expect(leaks).toEqual([]);
  });

  it("SUPABASE_SECRET_KEY is read only by admin-server.ts (and the invite script)", () => {
    const readers = files.filter((f) => read(f).includes("process.env.SUPABASE_SECRET_KEY")).map(rel);
    expect(readers).toEqual(["lib/supabase/admin-server.ts"]);
  });
});

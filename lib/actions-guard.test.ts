// A safety net for login (docs/features/auth.md): Server Actions and Route Handlers are public
// endpoints, so each one must check who's calling. This reads the source and fails when a new
// one forgets — instead of finding out after it's online.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

/** The only Server Actions that may run without someone signed in (they sign people in). */
const PUBLIC_ACTIONS = new Set(["signInWithGoogle", "sendEmailCode", "verifyEmailCode", "signOut"]);
/**
 * The only actions a non-admin may call; each checks ownership itself (lib/permissions.ts):
 * their own advances, the Helper visits and early pay they paid, and their own "I paid" (sent to
 * the collector; cancelled while waiting).
 */
const MEMBER_ACTIONS = [
  "addAdvance",
  "addHelperEntry",
  "cancelPayment",
  "deleteAdvance",
  "deleteHelperEntry",
  "submitPayment",
  "updateAdvance",
  "updateHelperEntry",
];
/** Route Handlers, each doing its own auth. */
const ROUTE_HANDLERS = [
  "app/api/bill-email/route.ts",
  "app/auth/callback/route.ts",
  "app/backup/route.ts",
  "app/biller-secrets/[id]/route.ts",
  "app/receipts/[id]/route.ts",
];
/** The one route without a login (the Gmail script calls it): the shared secret comes first. */
const SECRET_ROUTE = "app/api/bill-email/route.ts";
/** Route Handlers that serve household data: each must check the signed-in member first. */
const DATA_ROUTES = ["app/backup/route.ts", "app/biller-secrets/[id]/route.ts", "app/receipts/[id]/route.ts"];
/** Data routes only the admin may use: the admin check comes right after the login check. */
const ADMIN_ROUTES = ["app/backup/route.ts"];

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

  it("only the advance and I-paid actions are open to members", () => {
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

describe("View-only logins", () => {
  it("run() refuses every change from a view-only login, before anything is parsed or saved", () => {
    const source = read(join(ROOT, "app/periods/[year]/[month]/actions.ts"));
    const run = source.slice(source.indexOf("async function run<"));
    const beforeParsing = run.slice(0, run.indexOf("schema.safeParse("));
    // Unconditional: not tied to `access`, so a "member" action can't let one through.
    expect(beforeParsing).toMatch(/^\s*if \(isViewOnly\(viewer\)\) return \{ ok: false,/m);
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

  it(`${SECRET_ROUTE} checks the shared secret before anything else`, () => {
    const source = read(join(ROOT, SECRET_ROUTE));
    const handler = source.slice(source.indexOf("export async function POST"));
    expect(handler).toMatch(
      /^export async function POST[^{]*\{\s*const secret = process\.env\.BILL_EMAIL_SECRET;\s*if \(!secret\) return[^\n]*\n\s*if \(!checkBillEmailSecret\(request\.headers\.get\("authorization"\), secret\)\) \{\s*return[^\n]*status: 401/,
    );
    expect(source).not.toMatch(/export async function (GET|PUT|PATCH|DELETE)/);
  });

  it("app/receipts/[id]/route.ts shows a payment's proof only to PA and the people in it", () => {
    const source = read(join(ROOT, "app/receipts/[id]/route.ts"));
    expect(source).toMatch(/if \(!canOpenReceipt\(viewer, \{ payment \}\)\) return/);
    // Whether it's a payment's receipt comes from receipts.payment_id, never from the payment's
    // sides: a House Budget side is NULL too.
    expect(source).toMatch(/receipt\.paymentId === null\s*\?\s*null/);
    // The check happens before the signed link is made.
    expect(source.indexOf("canOpenReceipt(viewer")).toBeLessThan(source.indexOf("createSignedUrl"));
  });

  it("app/biller-secrets/[id]/route.ts unlocks a password only for someone it's shared with", () => {
    const source = read(join(ROOT, "app/biller-secrets/[id]/route.ts"));
    expect(source).toMatch(/if \(!canSeeBillerField\(viewer, field\)\) return/);
    expect(source.indexOf("canSeeBillerField(viewer")).toBeLessThan(source.indexOf("decryptSecret("));
    expect(source).toMatch(/"Cache-Control": "no-store"/);
  });

  it.each(ADMIN_ROUTES)("%s refuses anyone but the admin, before anything else", (file) => {
    const source = read(join(ROOT, file));
    const handler = source.slice(source.indexOf("export async function GET"));
    expect(handler).toMatch(/if \(!viewer\) return[^\n]*\n\s*if \(!isAdmin\(viewer\)\) return/);
  });
});

describe("secrets stay on the server", () => {
  it("no Client Component imports the admin client, invites or the auth layer", () => {
    const leaks = files
      .filter((f) => /^\s*["']use client["']/.test(read(f)))
      .filter((f) =>
        /from "@\/lib\/(supabase\/admin|invites|auth|biller-secrets)"|from "@\/lib\/supabase\/admin-server"/.test(read(f)),
      )
      .map(rel);
    expect(leaks).toEqual([]);
  });

  it("SUPABASE_SECRET_KEY is read only by admin-server.ts (and the invite script)", () => {
    const readers = files.filter((f) => read(f).includes("process.env.SUPABASE_SECRET_KEY")).map(rel);
    expect(readers).toEqual(["lib/supabase/admin-server.ts"]);
  });

  it("BILLER_SECRET_KEY is read only by lib/biller-secrets.ts", () => {
    const readers = files.filter((f) => read(f).includes("process.env.BILLER_SECRET_KEY")).map(rel);
    expect(readers).toEqual(["lib/biller-secrets.ts"]);
  });

  it("BILL_EMAIL_SECRET is read only by the bill-email route", () => {
    const readers = files.filter((f) => read(f).includes("process.env.BILL_EMAIL_SECRET")).map(rel);
    expect(readers).toEqual([SECRET_ROUTE]);
  });
});

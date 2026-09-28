// lib/invites.ts with a fake database and a fake Supabase admin API: the order of the calls is
// what keeps Postgres and Supabase Auth in step, so that's what these check. (A fake can't prove
// the SQL returns the *old* login id — that's checked on the real database, see
// docs/testing.md.)

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { ActionError } from "./errors";
import { inviteMember, uninviteMember } from "./invites";
import type { AuthAdmin } from "./supabase/admin";

const user = (id: string) => ({ data: { user: { id } }, error: null });
const ok = { data: {}, error: null };

let findFirst: ReturnType<typeof vi.fn>;
let execute: ReturnType<typeof vi.fn>;
let createUser: ReturnType<typeof vi.fn>;
let deleteUser: ReturnType<typeof vi.fn>;
let listUsers: ReturnType<typeof vi.fn>;
let db: Database;
let auth: AuthAdmin;

beforeEach(() => {
  findFirst = vi.fn();
  execute = vi.fn();
  createUser = vi.fn();
  deleteUser = vi.fn().mockResolvedValue(ok);
  listUsers = vi.fn();
  db = { query: { members: { findFirst } }, execute } as unknown as Database;
  auth = { createUser, deleteUser, listUsers } as unknown as AuthAdmin;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const member = (over: object = {}) => ({ id: 3, name: "Housemate", active: true, email: null, authUserId: null, ...over });

describe("inviteMember", () => {
  it("creates a confirmed login and links it to the member", async () => {
    findFirst.mockResolvedValueOnce(member()).mockResolvedValueOnce(undefined);
    createUser.mockResolvedValue(user("new"));
    execute.mockResolvedValue([{ auth_user_id: null }]);

    await inviteMember(db, auth, 3, "  Someone@Example.com ");

    expect(createUser).toHaveBeenCalledWith({ email: "someone@example.com", email_confirm: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("replacing an email deletes the login the statement returns (the old one), after the write", async () => {
    findFirst.mockResolvedValueOnce(member({ email: "old@example.com", authUserId: "old" })).mockResolvedValueOnce(undefined);
    createUser.mockResolvedValue(user("new"));
    execute.mockResolvedValue([{ auth_user_id: "old" }]);

    await inviteMember(db, auth, 3, "new@example.com");

    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith("old");
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
  });

  it("does nothing when the email is the same (letter case aside), keeping the login", async () => {
    findFirst.mockResolvedValueOnce(member({ email: "someone@example.com", authUserId: "u1" }));

    await inviteMember(db, auth, 3, "Someone@example.com");

    expect(createUser).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a removed member", async () => {
    findFirst.mockResolvedValueOnce(member({ active: false }));
    await expect(inviteMember(db, auth, 3, "a@example.com")).rejects.toThrow(ActionError);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("refuses an email another member already has", async () => {
    findFirst.mockResolvedValueOnce(member()).mockResolvedValueOnce({ name: "Someone Else" });
    await expect(inviteMember(db, auth, 3, "a@example.com")).rejects.toThrow("already used by Someone Else");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rolls the new login back when the member was removed meanwhile (0 rows)", async () => {
    findFirst.mockResolvedValueOnce(member()).mockResolvedValueOnce(undefined);
    createUser.mockResolvedValue(user("new"));
    execute.mockResolvedValue([]);

    await expect(inviteMember(db, auth, 3, "a@example.com")).rejects.toThrow("removed");
    expect(deleteUser).toHaveBeenCalledWith("new");
  });

  it("rolls the new login back when the database write fails", async () => {
    findFirst.mockResolvedValueOnce(member()).mockResolvedValueOnce(undefined);
    createUser.mockResolvedValue(user("new"));
    execute.mockRejectedValue(new Error("connection lost"));

    await expect(inviteMember(db, auth, 3, "a@example.com")).rejects.toThrow("connection lost");
    expect(deleteUser).toHaveBeenCalledWith("new");
  });

  it("turns a race on the same email into a readable message", async () => {
    findFirst.mockResolvedValueOnce(member()).mockResolvedValueOnce(undefined);
    createUser.mockResolvedValue(user("new"));
    execute.mockRejectedValue(
      Object.assign(new Error("query failed"), { cause: { code: "23505", constraint_name: "members_email_unique" } }),
    );

    await expect(inviteMember(db, auth, 3, "a@example.com")).rejects.toThrow("already used by someone else");
    expect(deleteUser).toHaveBeenCalledWith("new");
  });

  it("replaces a leftover login with the same email instead of reusing it", async () => {
    findFirst
      .mockResolvedValueOnce(member())
      .mockResolvedValueOnce(undefined) // no other member has the email
      .mockResolvedValueOnce(undefined); // no member is linked to the leftover
    createUser
      .mockResolvedValueOnce({ data: { user: null }, error: { code: "email_exists", message: "exists" } })
      .mockResolvedValueOnce(user("new"));
    listUsers.mockResolvedValue({ data: { users: [{ id: "leftover", email: "A@Example.com" }] }, error: null });
    execute.mockResolvedValue([{ auth_user_id: null }]);

    await inviteMember(db, auth, 3, "a@example.com");

    expect(deleteUser).toHaveBeenCalledWith("leftover");
    expect(createUser).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("won't take over a login another member is linked to", async () => {
    findFirst
      .mockResolvedValueOnce(member())
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ name: "Someone Else" });
    createUser.mockResolvedValueOnce({ data: { user: null }, error: { code: "email_exists", message: "exists" } });
    listUsers.mockResolvedValue({ data: { users: [{ id: "theirs", email: "a@example.com" }] }, error: null });

    await expect(inviteMember(db, auth, 3, "a@example.com")).rejects.toThrow("belongs to Someone Else");
    expect(deleteUser).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("uninviteMember", () => {
  it("clears the member first, then deletes the login the statement returns", async () => {
    execute.mockResolvedValue([{ auth_user_id: "old" }]);

    await uninviteMember(db, auth, 3);

    expect(deleteUser).toHaveBeenCalledWith("old");
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
  });

  it("does nothing more for someone who wasn't invited", async () => {
    execute.mockResolvedValue([{ auth_user_id: null }]);
    await uninviteMember(db, auth, 3);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("only logs a failed delete (the member is already locked out)", async () => {
    execute.mockResolvedValue([{ auth_user_id: "old" }]);
    deleteUser.mockResolvedValue({ data: null, error: { message: "network" } });
    await expect(uninviteMember(db, auth, 3)).resolves.toBeUndefined();
  });
});

// The test-data scripts (`db:seed:august`, `bills:import` with its sample emails) load the
// made-up August 2026 fixture. They must never write it into the live database, which holds the
// household's real data, so they run only against a database on this machine (a local Supabase).

/** True only for a database on this machine; anything else — or an unreadable URL — is live. */
export function isLocalDatabase(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/** Stops a test-data script before it touches a database that isn't local. */
export function refuseLiveDatabase(url: string, script: string): void {
  if (isLocalDatabase(url)) return;
  console.error(
    `${script} loads made-up test data, so it only runs against a local database — DIRECT_URL points ` +
      "elsewhere (the live one?). Nothing was changed. See docs/operations.md → One database.",
  );
  process.exit(1);
}

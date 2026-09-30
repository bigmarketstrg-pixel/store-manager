import postgres from "npm:postgres@3.4.7";

const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
if (!databaseUrl) {
  throw new Error("SUPABASE_DB_URL is not configured");
}

// One connection per isolate; Supabase provides the database URL in hosted functions.
export const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  idle_timeout: 10,
});

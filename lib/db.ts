import pg, { type QueryResultRow } from "pg";
import { getEnv } from "./env";

let pool: pg.Pool | null = null;

export function getDbPool() {
  if (pool) return pool;
  const { DATABASE_URL } = getEnv();
  const url = new URL(DATABASE_URL);
  const usesSupabase =
    url.hostname.includes("supabase.co") || url.hostname.includes("pooler.supabase.com") || DATABASE_URL.includes("sslmode=require");
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: usesSupabase ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

export async function dbQuery<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  const p = getDbPool();
  const result = await p.query<T>(text, values);
  return result;
}

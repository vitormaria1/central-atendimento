import pg, { type QueryResultRow } from "pg";
import { getEnv } from "./env";

let pool: pg.Pool | null = null;

export function getDbPool() {
  if (pool) return pool;
  const { DATABASE_URL } = getEnv();
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  return pool;
}

export async function dbQuery<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  const p = getDbPool();
  const result = await p.query<T>(text, values);
  return result;
}

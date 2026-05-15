import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "..", "db", "migrations");

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

await client.query(`
  create table if not exists _migrations (
    id text primary key,
    ran_at timestamptz not null default now()
  );
`);

const entries = (await fs.readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

for (const name of entries) {
  const id = name;
  const { rowCount } = await client.query("select 1 from _migrations where id = $1", [id]);
  if (rowCount && rowCount > 0) continue;

  const sql = await fs.readFile(path.join(migrationsDir, name), "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into _migrations (id) values ($1)", [id]);
    await client.query("commit");
    console.log(`Migrated ${id}`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

await client.end();


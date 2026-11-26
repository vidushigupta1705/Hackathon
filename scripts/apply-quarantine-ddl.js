/* Apply drizzle/0001_quarantine.sql. Safe to re-run: every statement is idempotent. */
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = fs.readFileSync(path.join(__dirname, "..", "drizzle", "0001_quarantine.sql"), "utf8");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    const tables = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('quarantined_inputs','entity_aliases') order by 1",
    );
    console.log(`applied: ${tables.rows.map((r) => r.table_name).join(", ")}`);
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

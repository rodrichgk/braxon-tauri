import pg from 'pg';
import fs from 'fs';
import os from 'os';
import path from 'path';

async function main() {
  const configPath = path.join(process.env.APPDATA || os.homedir(), 'pic-abs-tester', 'db_config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: false,
  });
  await client.connect();
  try {
    const cols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'RemanForecastSnapshot' ORDER BY ordinal_position`
    );
    console.log('Columns:', cols.rows);

    const count = await client.query(`SELECT COUNT(*) FROM "RemanForecastSnapshot"`);
    console.log('Row count:', count.rows[0].count);

    const sample = await client.query(`SELECT * FROM "RemanForecastSnapshot" LIMIT 5`);
    console.log('Sample rows:', sample.rows);
  } catch (e) {
    console.log('ERR', e.message);
  } finally {
    await client.end();
  }
}

main();

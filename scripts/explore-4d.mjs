import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

async function main() {
  console.log('Connecting to 4D REMAN database...');
  let conn;
  try {
    conn = await odbc.connect(connectionString);
    console.log('Connected!\n');
  } catch (err) {
    console.error('Connection failed:');
    if (err.odbcErrors) err.odbcErrors.forEach(e => console.error(`  [${e.state}] ${e.message}`));
    else console.error(err);
    process.exit(1);
  }

  try {
    const tables = await conn.query('SELECT TABLE_NAME FROM _USER_TABLES ORDER BY TABLE_NAME');
    console.log('=== TABLES ===');
    tables.forEach(r => console.log(' -', r.TABLE_NAME));
    console.log(`\nTotal: ${tables.length} tables\n`);

    if (tables.length > 0) {
      const cols = await conn.query('SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM _USER_COLUMNS ORDER BY TABLE_NAME, COLUMN_NAME');
      console.log('=== COLUMNS ===');
      let lastTable = '';
      for (const col of cols) {
        if (col.TABLE_NAME !== lastTable) { console.log(`\n[${col.TABLE_NAME}]`); lastTable = col.TABLE_NAME; }
        console.log(`  ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
      }
    }
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();

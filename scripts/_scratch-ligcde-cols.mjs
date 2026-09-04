import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    const cols = await conn.query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM _USER_COLUMNS WHERE TABLE_NAME = 'LigCde' ORDER BY COLUMN_NAME`
    );
    console.log(`=== LigCde columns (${cols.length}) ===`);
    for (const c of cols) console.log(`  ${c.COLUMN_NAME} (${c.DATA_TYPE})`);
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();

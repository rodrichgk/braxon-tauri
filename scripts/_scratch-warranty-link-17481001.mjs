import net from 'net';
import odbc from 'odbc';

const PROXY_PORT = 19812;
const REMAN_HOST = '192.168.77.10';
const REMAN_PORT = 19822;

const server = net.createServer(client => {
  const remote = net.connect(REMAN_PORT, REMAN_HOST, () => {
    client.pipe(remote);
    remote.pipe(client);
  });
  remote.on('error', () => client.destroy());
  client.on('error', () => remote.destroy());
});

server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') { await main(); }
  else { console.error('Proxy error:', err); process.exit(1); }
});

server.listen(PROXY_PORT, '127.0.0.1', async () => { await main(); });

async function dumpTableRow(conn, table, whereClause) {
  const cols = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE FROM _USER_COLUMNS WHERE TABLE_NAME = '${table}' ORDER BY COLUMN_NAME`
  );
  // DATA_TYPE 1 looked boolean-shaped in past exploration (matches the
  // established -1/BIT quirk) — skip anything that isn't a plain
  // text/numeric/date type to avoid the known odbc-api Boolean crash
  // pattern (being conservative here even though this is the Node odbc
  // package, not Rust odbc-api).
  const safeCols = cols.filter(c => c.DATA_TYPE !== 1).map(c => c.COLUMN_NAME);
  const boolCols = cols.filter(c => c.DATA_TYPE === 1).map(c => c.COLUMN_NAME);
  console.log(`\n[${table}] ${safeCols.length} non-boolean cols, ${boolCols.length} boolean cols skipped: ${boolCols.join(', ')}`);

  const quotedCols = safeCols.map(c => /[^A-Za-z0-9_]/.test(c) || /^(Date|Soldée)$/.test(c) ? `"${c}"` : c);
  const sql = `SELECT ${quotedCols.join(', ')} FROM ${table} ${whereClause}`;
  const rows = await conn.query(sql);
  return { rows, safeCols };
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const lig = await conn.query(
      `SELECT NoInt_Ligcde, NoInt_cde FROM LigCde WHERE NoIntervention = '17481001'`
    );
    console.log('LigCde lookup for 17481001:', lig);
    if (!lig.length) { console.log('Job 17481001 not found'); return; }
    const ligcdeId = lig[0].NOINT_LIGCDE;
    const cdeId = lig[0].NOINT_CDE;

    const { rows: ligRows, safeCols: ligCols } = await dumpTableRow(conn, 'LigCde', `WHERE NoInt_Ligcde = ${ligcdeId}`);
    console.log('\n=== Full LigCde row (non-boolean cols) for 17481001 ===');
    if (ligRows.length) {
      const r = ligRows[0];
      for (const c of ligCols) {
        const key = c.toUpperCase();
        const val = r[key];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          console.log(`  ${c}: ${val}`);
        }
      }
      console.log('\n--- Searching for "17423601" or "423601" anywhere in this row ---');
      for (const c of ligCols) {
        const key = c.toUpperCase();
        const val = r[key];
        if (val !== null && val !== undefined && String(val).includes('423601')) {
          console.log(`  MATCH: ${c} = ${val}`);
        }
      }
    }

    if (cdeId) {
      const { rows: cdeRows, safeCols: cdeCols } = await dumpTableRow(conn, 'Commande', `WHERE NoInt_Cde = ${cdeId}`);
      console.log('\n=== Full Commande row (non-boolean cols) for this job\'s order ===');
      if (cdeRows.length) {
        const r = cdeRows[0];
        for (const c of cdeCols) {
          const key = c.toUpperCase();
          const val = r[key];
          if (val !== null && val !== undefined && String(val).trim() !== '') {
            console.log(`  ${c}: ${val}`);
          }
        }
        console.log('\n--- Searching for "17423601" or "423601" anywhere in this row ---');
        for (const c of cdeCols) {
          const key = c.toUpperCase();
          const val = r[key];
          if (val !== null && val !== undefined && String(val).includes('423601')) {
            console.log(`  MATCH: ${c} = ${val}`);
          }
        }
      }
    }

    // Also directly confirm 17423601 exists and see its ligcde/client/article.
    const prev = await conn.query(
      `SELECT NoInt_Ligcde, NomClient, CodeArt, LibelleArt, DateDernInterv FROM LigCde WHERE NoIntervention = '17423601'`
    );
    console.log('\n=== Previous job 17423601 ===', prev);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

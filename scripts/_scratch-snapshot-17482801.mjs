import net from 'net';
import odbc from 'odbc';
import fs from 'fs';

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
  const safeCols = cols.filter(c => c.DATA_TYPE !== 1).map(c => c.COLUMN_NAME);
  const boolCols = cols.filter(c => c.DATA_TYPE === 1).map(c => c.COLUMN_NAME);
  const quotedCols = safeCols.map(c => (/[^A-Za-z0-9_]/.test(c) ? `"${c}"` : c));
  const rows = await conn.query(`SELECT ${quotedCols.join(', ')} FROM ${table} ${whereClause}`);
  return { rows, safeCols, boolCols };
}

async function probeBool(conn, ligcdeId, col) {
  const r = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId} AND "${col}" = True`);
  return r.length > 0;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const lig = await conn.query(`SELECT NoInt_Ligcde, NoInt_cde FROM LigCde WHERE NoIntervention = '17482801'`);
    if (!lig.length) { console.log('Job 17482801 not found'); return; }
    const ligcdeId = lig[0].NOINT_LIGCDE;
    console.log('Job 17482801 -> ligcde', ligcdeId);

    const { rows: ligRows, safeCols: ligCols, boolCols } = await dumpTableRow(conn, 'LigCde', `WHERE NoInt_Ligcde = ${ligcdeId}`);
    const nonBooleanSnapshot = ligRows[0];

    const booleanSnapshot = {};
    for (const col of boolCols) {
      booleanSnapshot[col] = await probeBool(conn, ligcdeId, col);
    }
    // Only keep True ones for readability, but store all for diffing.
    console.log(`\nCaptured ${ligCols.length} non-boolean + ${boolCols.length} boolean columns.`);
    console.log('True booleans right now:', Object.entries(booleanSnapshot).filter(([, v]) => v).map(([k]) => k));

    const steps = await conn.query(
      `SELECT NoInt_interv, "Date", HeureInterv, NoIntTechn, TypeCode, TypeLibelle, Commentaire, NiveauPanne, TempsPasse
       FROM Intervention WHERE NoIntLigcde = ${ligcdeId} ORDER BY NoInt_interv ASC`
    );
    console.log(`\nStep history (${steps.length} steps):`);
    steps.forEach(s => console.log(`  [${s.NOINT_INTERV}] ${s.DATE} ${s.HEUREINTERV} tech=${s.NOINTTECHN} ${s.TYPECODE} "${s.TYPELIBELLE}"`));

    const snapshot = { ligcdeId, nonBooleanSnapshot, booleanSnapshot, steps, capturedAt: new Date().toISOString() };
    const outPath = 'scripts/_scratch-snapshot-17482801-before.json';
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
    console.log(`\nSnapshot written to ${outPath}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

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
  const safeCols = cols.filter(c => c.DATA_TYPE !== 1).map(c => c.COLUMN_NAME);
  const quotedCols = safeCols.map(c => (/[^A-Za-z0-9_]/.test(c) ? `"${c}"` : c));
  return { rows: await conn.query(`SELECT ${quotedCols.join(', ')} FROM ${table} ${whereClause}`), safeCols };
}

async function probeBool(conn, ligcdeId, col) {
  const r = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId} AND "${col}" = True`);
  return r.length > 0;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const lig = await conn.query(`SELECT NoInt_Ligcde, NoInt_cde FROM LigCde WHERE NoIntervention = '17477701'`);
    console.log('LigCde lookup:', lig);
    if (!lig.length) { console.log('Job 17477701 not found'); return; }
    const ligcdeId = lig[0].NOINT_LIGCDE;
    const cdeId = lig[0].NOINT_CDE;

    const { rows: ligRows, safeCols: ligCols } = await dumpTableRow(conn, 'LigCde', `WHERE NoInt_Ligcde = ${ligcdeId}`);
    console.log('\n=== Full LigCde row (non-boolean cols) ===');
    if (ligRows.length) {
      const r = ligRows[0];
      for (const c of ligCols) {
        const val = r[c.toUpperCase()];
        if (val !== null && val !== undefined && String(val).trim() !== '') console.log(`  ${c}: ${val}`);
      }
    }

    console.log('\n=== Key outcome/status booleans ===');
    for (const col of ['Soldée', 'RAS', 'ND', 'Réparation', 'Vente', 'EchgeS', 'Garantie', 'AvanceES', 'RetourEnEtat', 'NonRetour', 'DemandeSWAP', 'DemandeClonage', 'GRE', 'GREd']) {
      console.log(`  ${col}: ${await probeBool(conn, ligcdeId, col)}`);
    }

    console.log('\n=== Intervention step history ===');
    const steps = await conn.query(
      `SELECT NoInt_interv, "Date", HeureInterv, NoIntTechn, TypeCode, TypeLibelle, Commentaire
       FROM Intervention WHERE NoIntLigcde = ${ligcdeId} ORDER BY NoInt_interv ASC`
    );
    steps.forEach(s => console.log(`  [${s.NOINT_INTERV}] ${s.DATE} ${s.HEUREINTERV} tech=${s.NOINTTECHN} ${s.TYPECODE} "${s.TYPELIBELLE}" -- ${s.COMMENTAIRE || ''}`));

    if (cdeId) {
      const { rows: cdeRows, safeCols: cdeCols } = await dumpTableRow(conn, 'Commande', `WHERE NoInt_Cde = ${cdeId}`);
      console.log('\n=== Full Commande row (non-boolean cols) ===');
      if (cdeRows.length) {
        const r = cdeRows[0];
        for (const c of cdeCols) {
          const val = r[c.toUpperCase()];
          if (val !== null && val !== undefined && String(val).trim() !== '') console.log(`  ${c}: ${val}`);
        }
      }
    }

    // Any Stock movement (DateSortie = "left the shop"?) tied to this line.
    const stock = await conn.query(`SELECT NoInt_Stock, CodeArt, NoSerie, DateSortie, NoBLclt FROM Stock WHERE NoIntLigCdeVte = ${ligcdeId}`);
    console.log('\n=== Stock rows tied to this LigCde ===', stock);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

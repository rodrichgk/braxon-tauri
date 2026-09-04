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

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const total = await conn.query(`SELECT NoInt_Ligcde FROM LigCde`);
    console.log(`Total LigCde rows: ${total.length}`);

    const linked = await conn.query(
      `SELECT NoInt_Ligcde, NoIntervention, SuiviGar_AncNoInterv, TechDernInterv, NomClient, Famille, Type_Service, DateDernInterv
       FROM LigCde WHERE SuiviGar_AncNoInterv > '0'`
    );
    console.log(`Jobs with SuiviGar_AncNoInterv populated (a comeback link): ${linked.length}`);

    console.log('\n=== Sample of 15 ===');
    linked.slice(0, 15).forEach(r => console.log(
      ` - job ${r.NOINTERVENTION} (ligcde ${r.NOINT_LIGCDE}) <- prev ${r.SUIVIGAR_ANCNOINTERV} | ${r.NOMCLIENT} | ${r.FAMILLE} | svc=${r.TYPE_SERVICE} | ${r.DATEDERNINTERV}`
    ));

    // How many of those "previous" jobs can we actually resolve back to a
    // real LigCde row (confirms the field reliably points at a real job,
    // not a stale/orphaned reference)?
    let resolvable = 0;
    const sampleForResolve = linked.slice(0, 200);
    for (const r of sampleForResolve) {
      const prevNo = r.SUIVIGAR_ANCNOINTERV;
      const found = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoIntervention = '${prevNo}'`);
      if (found.length > 0) resolvable++;
    }
    console.log(`\nOf a 200-job sample, ${resolvable} previous-job references resolved to a real LigCde row.`);

    // Rough comeback rate by family, among linked jobs.
    const byFamily = new Map();
    for (const r of linked) {
      const f = r.FAMILLE || '(none)';
      byFamily.set(f, (byFamily.get(f) || 0) + 1);
    }
    console.log('\n=== Comeback counts by Famille ===');
    [...byFamily.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([f, c]) => console.log(`  ${f}: ${c}`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

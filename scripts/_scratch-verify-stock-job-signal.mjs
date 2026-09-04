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
    // Broad check: for each of the 6 titles (3 "stock" candidates + 3 normal siblings),
    // how many of their LigCde rows have NomClient empty vs populated.
    for (const libelle of ['Réparation = SWAP', 'R.A.S. = SWAP', 'Non Dépannable = Défect', 'Réparation', 'NFF', 'ND(final)']) {
      const steps = await conn.query(
        `SELECT NoIntLigcde FROM Intervention WHERE TypeLibelle = '${libelle}' LIMIT 500`
      );
      const ids = [...new Set(steps.map(s => s.NOINTLIGCDE))];
      let emptyClient = 0, populatedClient = 0, notFound = 0;
      for (const id of ids) {
        const lig = await conn.query(`SELECT NomClient FROM LigCde WHERE NoInt_Ligcde = ${id}`);
        if (!lig.length) { notFound++; continue; }
        const nc = (lig[0].NOMCLIENT || '').trim();
        if (nc === '') emptyClient++; else populatedClient++;
      }
      console.log(`${libelle}: ${ids.length} distinct ligcde | empty client=${emptyClient} | populated client=${populatedClient} | not found=${notFound}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

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
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 365);
    const fromYmd = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    const toYmdStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const closed = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l.NomClient = '' AND l."Soldée" = True AND l.Type_Service IN ('100','101','102','103')
         AND c.DateCommande BETWEEN '${fromYmd}' AND '${toYmdStr}' LIMIT 20000`
    );
    console.log('Internal stock-processing closed jobs (trailing 365d):', closed.length);

    const totalClosed = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = True AND l.Type_Service IN ('100','101','102','103')
         AND c.DateCommande BETWEEN '${fromYmd}' AND '${toYmdStr}' LIMIT 20000`
    );
    console.log('Total closed bench jobs (trailing 365d):', totalClosed.length);
    console.log('Fraction internal:', (closed.length/totalClosed.length*100).toFixed(1)+'%');
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

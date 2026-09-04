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
    const from = '2026-07-01';
    const to = '2026-07-31';

    // Risky combined form: Soldée + BETWEEN on the SAME table.
    const combined = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '${from}' AND '${to}' LIMIT 20000`
    );
    console.log('Combined (Soldée=True AND same-table BETWEEN) row count:', combined.length);

    // Safe two-query form: fetch by date range alone, then check membership
    // against an unconditional closed-id set separately.
    const byDate = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l WHERE l.DateDernInterv BETWEEN '${from}' AND '${to}' LIMIT 20000`
    );
    const closed = await conn.query(`SELECT l.NoInt_Ligcde FROM LigCde l WHERE l."Soldée" = True ORDER BY l.NoInt_Ligcde DESC LIMIT 20000`);
    const closedSet = new Set(closed.map(r => r.NOINT_LIGCDE));
    const intersection = byDate.filter(r => closedSet.has(r.NOINT_LIGCDE));
    console.log('byDate row count:', byDate.length, '| closed set size:', closedSet.size, '| intersection count:', intersection.length);

    console.log('\nMatch?', combined.length === intersection.length ? 'YES — combined form is safe' : 'NO — combined form is silently wrong, must use the two-query split');
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

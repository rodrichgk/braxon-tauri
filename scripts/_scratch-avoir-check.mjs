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
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l."NoAvoir_lié", l."MtAvoir_Lié", c.MtHT_Lignes
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '2026-07-01' AND '2026-07-31'
       ORDER BY l.NoInt_Ligcde DESC LIMIT 20000`
    );
    console.log('Total July cohort rows:', rows.length);

    const withAvoir = rows.filter(r => {
      const v = parseFloat(r.MTAVOIR_LIÉ);
      return !isNaN(v) && v !== 0;
    });
    console.log('Rows with nonzero MtAvoir_Lié:', withAvoir.length);
    let sumAvoir = 0;
    withAvoir.forEach(r => {
      const v = parseFloat(r.MTAVOIR_LIÉ);
      sumAvoir += v;
      console.log(' -', r.NOINTERVENTION, 'NoAvoir_lié=' + r.NOAVOIR_LIÉ, 'MtAvoir_Lié=' + r.MTAVOIR_LIÉ, 'MtHT_Lignes=' + r.MTHT_LIGNES);
    });
    console.log('Sum MtAvoir_Lié:', sumAvoir.toFixed(1));

    // Also check NoAvoir_lié alone (maybe amount field is elsewhere / this one is sparser)
    const withNo = rows.filter(r => r.NOAVOIR_LIÉ && String(r.NOAVOIR_LIÉ).trim() !== '' && String(r.NOAVOIR_LIÉ) !== '0');
    console.log('\nRows with a NoAvoir_lié set at all:', withNo.length);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

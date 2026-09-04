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
    const families = ['MK100', 'MK70', 'MK60', 'MK61', 'Bosch 8.0', 'Bosch 9.0'];
    for (const fam of families) {
      const rows = await conn.query(
        `SELECT l.NoInt_Ligcde, l.Observations FROM LigCde l
         LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
         WHERE am.Famille = '${fam}' AND l."Soldée" = True AND l.Observations IS NOT NULL
         ORDER BY l.NoInt_Ligcde DESC LIMIT 2000`
      );
      const codeCounts = new Map();
      const codePattern = /\b(0*[0-9A-F]{3,5})\b/g;
      for (const r of rows) {
        const text = (r.OBSERVATIONS || '').toUpperCase();
        const seen = new Set();
        let m;
        while ((m = codePattern.exec(text)) !== null) {
          let code = m[1].replace(/^0+/, '') || '0';
          if (code.length < 3 || !/[A-F]/.test(code)) continue;
          seen.add(code);
        }
        for (const c of seen) codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
      }
      const top = [...codeCounts.entries()].filter(([,n]) => n >= 5).sort((a,b) => b[1]-a[1]).slice(0, 8);
      console.log(`\n=== ${fam} (${rows.length} closed jobs sampled) ===`);
      for (const [code, n] of top) console.log(' ', code, ':', n);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

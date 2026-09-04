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
    // Broad sample of closed jobs with real Observations text, most recent first.
    const rows = await conn.query(
      `SELECT NoInt_Ligcde, Observations FROM LigCde
       WHERE "Soldée" = True AND Observations IS NOT NULL
       ORDER BY NoInt_Ligcde DESC LIMIT 4000`
    );
    console.log(`Sampled ${rows.length} closed jobs with Observations text.`);

    // Extract fault-code-like tokens: 4-char hex-ish DTC codes (letters+digits mix, 4-5 chars)
    const codeCounts = new Map();
    const codePattern = /\b(0*[0-9A-F]{3,5})\b/g;
    for (const r of rows) {
      const text = (r.OBSERVATIONS || '').toUpperCase();
      const seen = new Set();
      let m;
      while ((m = codePattern.exec(text)) !== null) {
        let code = m[1].replace(/^0+/, '') || '0';
        if (code.length < 3) continue; // skip too-short leftovers
        // Skip pure-numeric short years/dates-ish noise (require at least one letter, common DTC shape)
        if (!/[A-F]/.test(code)) continue;
        seen.add(code);
      }
      for (const c of seen) codeCounts.set(c, (codeCounts.get(c) || 0) + 1);
    }
    const top = [...codeCounts.entries()].filter(([,n]) => n >= 8).sort((a,b) => b[1]-a[1]).slice(0, 25);
    console.log('\nTop recurring fault-code-like tokens (>=8 occurrences):');
    for (const [code, n] of top) console.log(' ', code, ':', n);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

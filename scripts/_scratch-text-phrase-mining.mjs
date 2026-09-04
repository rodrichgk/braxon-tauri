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

const STOPWORDS = new Set([
  'PANNE','PERMANENTE','INTERMITENTE','INTERMITTENTE','DE','DU','LA','LE','LES','ET','EN','UN','UNE',
  'AU','AUX','A','DES','QUI','QUE','SUR','AVEC','PAS','EST','SONT','ET/OU','OU','DANS','SE','CE','CES',
  'SANS','PLUS','TRES','TOUT','TOUS','TOUTE','TOUTES','APRES','AVANT','QUAND','MEME','FAUT','FONT',
  'THE','AND','ON','WITH','IS','ARE','FOR','TO','OF','IN','AT','FROM'
]);

function normalize(s) {
  return s
    .toUpperCase()
    .replace(/[ÉÈÊË]/g, 'E').replace(/[ÀÂ]/g, 'A').replace(/[ÎÏ]/g, 'I').replace(/[ÔÖ]/g, 'O').replace(/[ÙÛÜ]/g, 'U').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCodeLike(word) {
  // Skip tokens that look like DTC/fault codes (mix of digits+letters, short)
  return /^[0-9]*[A-F][0-9A-F]*$/.test(word) && word.length <= 6 && /[0-9]/.test(word) && /[A-F]/.test(word);
}

async function ngramsFor(rows) {
  const counts = new Map();
  for (const r of rows) {
    const norm = normalize(r.OBSERVATIONS || '');
    const words = norm.split(' ').filter(w => w.length >= 2 && !STOPWORDS.has(w) && !isCodeLike(w) && !/^\d+$/.test(w));
    const seenInThisJob = new Set();
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n).join(' ');
        if (gram.length < 6) continue;
        seenInThisJob.add(gram);
      }
    }
    for (const g of seenInThisJob) counts.set(g, (counts.get(g) || 0) + 1);
  }
  return counts;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const families = ['Bosch 8.0', 'Bosch 9.0', 'MK70', 'MK60', 'MK61', 'MK100'];
    for (const fam of families) {
      const rows = await conn.query(
        `SELECT Observations FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
         WHERE am.Famille = '${fam}' AND l."Soldée" = True AND l.Observations IS NOT NULL
         ORDER BY l.NoInt_Ligcde DESC LIMIT 2000`
      );
      const counts = await ngramsFor(rows);
      // Only keep 3-4 word phrases (more specific/meaningful) with strong frequency,
      // and drop any phrase that's a strict substring of a longer phrase with the same count
      // (keeps the most specific version).
      let top = [...counts.entries()].filter(([g, n]) => n >= 15).sort((a, b) => b[1] - a[1]);
      const kept = [];
      for (const [g, n] of top) {
        if (kept.some(([kg, kn]) => kg.includes(g) && kn >= n * 0.9)) continue;
        kept.push([g, n]);
        if (kept.length >= 8) break;
      }
      console.log(`\n=== ${fam} (${rows.length} closed jobs sampled) — top text phrases ===`);
      for (const [g, n] of kept) console.log(`  "${g}" : ${n}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

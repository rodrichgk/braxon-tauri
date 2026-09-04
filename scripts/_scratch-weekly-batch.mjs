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

const WEEKS = [
  { name: 'S3',  from: '2026-01-12', to: '2026-01-16', realVol: 91, realRep: 89, realMontant: 23528.0, realRt: 2 },
  { name: 'S7',  from: '2026-02-09', to: '2026-02-13', realVol: 100, realRep: 100, realMontant: 23746.0, realRt: 0 },
  { name: 'S11', from: '2026-03-09', to: '2026-03-13', realVol: 126, realRep: 124, realMontant: 28201.0, realRt: 2 },
  { name: 'S15', from: '2026-04-07', to: '2026-04-10', realVol: 80, realRep: 76, realMontant: 16008.0, realRt: 4 },
  { name: 'S19', from: '2026-05-04', to: '2026-05-07', realVol: 84, realRep: 83, realMontant: 17867.0, realRt: 1 },
  { name: 'S28', from: '2026-07-13', to: '2026-07-17', realVol: 87, realRep: 85, realMontant: 22541.2, realRt: 2 },
];

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    for (const w of WEEKS) {
      const rows = await conn.query(
        `SELECT l.NoInt_Ligcde, l.NoInt_cde, c.MtHT_Lignes, i.TypeCode
         FROM LigCde l
         LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
         LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
         WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '${w.from}' AND '${w.to}' AND c.StatutDossier = 'EXPEDIE'
         ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
      );
      const seen = new Set();
      let vol = 0, rt = 0, sum = 0, cdeSeen = new Set();
      for (const r of rows) {
        if (seen.has(r.NOINT_LIGCDE)) continue;
        seen.add(r.NOINT_LIGCDE);
        vol++;
        if (r.TYPECODE === 'REE') { rt++; continue; }
        const cde = r.NOINT_CDE;
        if (cde != null) {
          if (cdeSeen.has(cde)) continue;
          cdeSeen.add(cde);
        }
        sum += parseFloat(r.MTHT_LIGNES) || 0;
      }
      const rep = vol - rt;
      const montantDiffPct = w.realMontant !== 0 ? ((sum - w.realMontant) / w.realMontant * 100) : 0;
      console.log(
        `${w.name} (${w.from}..${w.to}): REAL vol=${w.realVol} rep=${w.realRep} montant=${w.realMontant.toFixed(1)} rt=${w.realRt} | ` +
        `OURS vol=${vol} rep=${rep} montant=${sum.toFixed(1)} rt=${rt} | ` +
        `DIFF vol=${vol - w.realVol} rep=${rep - w.realRep} montant=${(sum - w.realMontant).toFixed(1)} (${montantDiffPct.toFixed(1)}%) rt=${rt - w.realRt}`
      );
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

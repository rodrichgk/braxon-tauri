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

// Mirrors reman.rs's classify_abs_fault_hint exactly (same term lists) —
// spot-checking the compiled Rust logic against currently-OPEN 101 jobs,
// not just the closed-job dataset it was mined from.
const HYD = ['DESEQUILIBRE', 'FREINAGE', 'BLOQUENT', 'BLOQUEES', 'BLOQUEE', 'BLOQUE', 'PEDALE MOLLE', 'PEDALE A FOND', 'FREINE TOUTE SEULE', 'FREINENT', 'FREINE', 'FUITE', 'PURGE', 'PURGER', 'C1380'];
const ECU = ['PAS DE COMMS', 'NO COMMS', 'COMMUNICATION', 'VOYANT ALLUME', 'VOYANTS ALLUMES', 'SIGNAL IMPLAUSIBLE', 'CALCULATEUR', 'CAPTEUR DE VITESSE', 'ESP'];
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function classify(text) {
  const t = norm(text);
  const h = HYD.some(w => t.includes(w));
  const e = ECU.some(w => t.includes(w));
  if (h && !e) return 'HYDRAULIC';
  if (e && !h) return 'ECU';
  return null;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.Observations
       FROM LigCde l
       WHERE l."Soldée" = False AND l.Type_Service = '101'`
    );
    const withObs = rows.filter(r => r.OBSERVATIONS && r.OBSERVATIONS.trim().length > 0);
    console.log(`Currently OPEN 101 jobs with Observations: ${withObs.length} (of ${rows.length} total open 101)`);

    let hyd = 0, ecu = 0, none = 0;
    const examples = { HYDRAULIC: [], ECU: [] };
    for (const r of withObs) {
      const c = classify(r.OBSERVATIONS);
      if (c === 'HYDRAULIC') { hyd++; if (examples.HYDRAULIC.length < 8) examples.HYDRAULIC.push(r); }
      else if (c === 'ECU') { ecu++; if (examples.ECU.length < 8) examples.ECU.push(r); }
      else none++;
    }
    console.log(`Would show HYDRAULIC badge: ${hyd}`);
    console.log(`Would show ECU badge: ${ecu}`);
    console.log(`No badge (no lexical match): ${none}`);

    console.log('\n=== Sample currently-open jobs that would get HYDRAULIC badge ===');
    examples.HYDRAULIC.forEach(r => console.log(` - [${r.NOINT_LIGCDE}] "${r.OBSERVATIONS}"`));
    console.log('\n=== Sample currently-open jobs that would get ECU badge ===');
    examples.ECU.forEach(r => console.log(` - [${r.NOINT_LIGCDE}] "${r.OBSERVATIONS}"`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

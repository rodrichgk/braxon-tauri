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
    const total = await conn.query(`SELECT NoInt_access FROM Accessoires LIMIT 20000`);
    console.log('Total Accessoires rows (capped 20000):', total.length);

    const byParam = new Map();
    for (const r of total) {
      const p = r.NOINTPARAM;
      byParam.set(p, (byParam.get(p) || 0) + 1);
    }
    console.log('Distinct NoIntParam values and counts:');
    for (const [p, n] of [...byParam.entries()].sort((a,b) => b[1]-a[1])) console.log(' ', p, ':', n);

    const trueCount = await conn.query(`SELECT NoInt_access FROM Accessoires WHERE CtrlPresence = True LIMIT 20000`);
    console.log(`CtrlPresence = True: ${trueCount.length}`);
    const falseCount = await conn.query(`SELECT NoInt_access FROM Accessoires WHERE CtrlPresence = False LIMIT 20000`);
    console.log(`CtrlPresence = False: ${falseCount.length}`);

    // Recent rows tied to real ligcde to see how often NoIntParam=2200 appears vs others, and check closed jobs with False
    const recentFalseClosed = await conn.query(
      `SELECT a.NoInt_ligCde FROM Accessoires a
       JOIN LigCde l ON a.NoInt_ligCde = l.NoInt_Ligcde
       WHERE a.CtrlPresence = False AND l."Soldée" = True
       LIMIT 20`
    );
    console.log('Closed jobs with an unconfirmed accessory (CtrlPresence=False):', recentFalseClosed.length, JSON.stringify(recentFalseClosed));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

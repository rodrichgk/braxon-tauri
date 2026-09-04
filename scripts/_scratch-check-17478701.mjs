import net from 'net';
import odbc from 'odbc';

const server = net.createServer(client => {
  const remote = net.connect(19822, '192.168.77.10', () => { client.pipe(remote); remote.pipe(client); });
  remote.on('error', () => client.destroy());
  client.on('error', () => remote.destroy());
});
server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') { await main(); } else { console.error(err); process.exit(1); }
});
server.listen(19812, '127.0.0.1', async () => { await main(); });

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const lig = await conn.query(`SELECT NoInt_Ligcde, "DernièreInterv", DateDernInterv, TechDernInterv, NomDernierTech FROM LigCde WHERE NoIntervention = '17478701'`);
    console.log('LigCde:', JSON.stringify(lig, null, 2));
    if (!lig.length) { console.log('not found'); return; }
    const ligcdeId = lig[0].NOINT_LIGCDE;
    const soldee = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId} AND "Soldée" = True`);
    console.log('Soldee:', soldee.length === 1);
    const steps = await conn.query(`SELECT NoInt_interv, NoIntTechn, TypeCode, TypeLibelle, "Date", HeureInterv, Commentaire FROM Intervention WHERE NoIntLigcde = ${ligcdeId} ORDER BY NoInt_interv ASC`);
    console.log('Steps:', JSON.stringify(steps, null, 2));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

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

// Mirrors classify_outcome(true, TypeCode) from reman.rs.
function classifyOutcome(typeCode) {
  switch (typeCode) {
    case 'R': return 'repaired';
    case 'NDL': case 'ND': case 'RSTND': return 'non_repairable';
    case 'RAS': case 'RSTNF': case 'REE': return 'no_fault_found';
    case 'ES': return 'standard_exchange';
    case 'V': return 'sold';
    case 'VST': case 'RST': return 'sent_to_subcontractor';
    default: return 'other';
  }
}

async function outcomeMixForRange(conn, from, to) {
  const rows = await conn.query(
    `SELECT l.NoInt_Ligcde, i.TypeCode, i."Date", i.HeureInterv, i.NoInt_interv
     FROM LigCde l
     LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
     WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '${from}' AND '${to}' AND l.NomClient <> ''
     ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
     LIMIT 20000`
  );
  const latest = new Map();
  for (const r of rows) {
    const id = r.NOINT_LIGCDE;
    if (!id) continue;
    const key = `${r.DATE || ''} ${r.HEUREINTERV || ''} ${String(r.NOINT_INTERV || 0).padStart(10, '0')}`;
    const existing = latest.get(id);
    if (!existing || key > existing.key) latest.set(id, { key, typeCode: r.TYPECODE });
  }
  const mix = {};
  for (const [, v] of latest) {
    const o = classifyOutcome(v.typeCode);
    mix[o] = (mix[o] || 0) + 1;
  }
  return { total: latest.size, mix };
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const today = await outcomeMixForRange(conn, '2026-08-28', '2026-08-28');
    console.log('Today (2026-08-28) under the NEW reman_analytics outcome_sql (no Type_Service filter):');
    console.log(`  total=${today.total}`, today.mix);

    const yesterday = await outcomeMixForRange(conn, '2026-08-27', '2026-08-27');
    console.log('\nYesterday (2026-08-27) same query:');
    console.log(`  total=${yesterday.total}`, yesterday.mix);

    const sixMonths = await outcomeMixForRange(conn, '2026-02-28', '2026-08-28');
    console.log('\n6-month range (regression check — should still be a large, sensible number):');
    console.log(`  total=${sixMonths.total}`, sixMonths.mix);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}

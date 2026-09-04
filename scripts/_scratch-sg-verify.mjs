import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    // Same WHERE shape reman_search_interventions builds for the Open queue.
    const combined = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l
       WHERE l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103') AND l.Garantie = True
       LIMIT 5000`
    );
    console.log(`Combined (Soldee=False AND Type_Service IN (...) AND Garantie=True): ${combined.length} rows`);
    console.log(combined.slice(0, 10).map(r => r.NOINT_LIGCDE));

    // Sanity cross-check: same query without the Garantie filter, then
    // probe a handful of returned ids individually for Garantie=True.
    const open = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l
       WHERE l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103')
       LIMIT 5000`
    );
    console.log(`\nUnfiltered open bench: ${open.length} rows`);

    let manualTrueCount = 0;
    const sample = open.slice(0, 60);
    for (const r of sample) {
      const id = r.NOINT_LIGCDE;
      const res = await conn.query(`SELECT COUNT(*) AS N FROM LigCde WHERE NoInt_Ligcde = ${id} AND Garantie = True`);
      if (Number(res[0].N) > 0) manualTrueCount++;
    }
    console.log(`\nManually probed ${sample.length} open-bench rows one at a time: ${manualTrueCount} are Garantie=True`);
    const combinedIdsInSample = new Set(combined.map(r => r.NOINT_LIGCDE));
    const sampleIdsThatShouldMatch = sample.filter(r => combinedIdsInSample.has(r.NOINT_LIGCDE)).length;
    console.log(`Of those ${sample.length} sampled rows, ${sampleIdsThatShouldMatch} appear in the combined-query result`);
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();

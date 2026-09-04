import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    const testId = -999001;

    console.log('=== Step 1: confirm', testId, 'is unused ===');
    const existsInterv = await conn.query('SELECT NoInt_interv FROM Intervention WHERE NoInt_interv = ' + testId);
    console.log('In Intervention:', existsInterv.length, 'rows');
    const existsDetail = await conn.query('SELECT NoIntDetail FROM DetailInterv WHERE NoIntIntervAppel = ' + testId);
    console.log('Referenced in DetailInterv:', existsDetail.length, 'rows');
    if (existsInterv.length > 0 || existsDetail.length > 0) {
      console.log('NOT SAFE — this id is already in use somewhere. Aborting.');
      return;
    }

    console.log('\n=== Step 2: first insert with id', testId, '===');
    try {
      const r1 = await conn.query(`INSERT INTO Intervention (NoInt_interv, NoIntLigcde, TypeCode, TypeLibelle, Commentaire) VALUES (${testId}, 39500, 'ER', 'Etape de réparation', 'DUPLICATE TEST A')`);
      console.log('Insert A result:', r1.count);
    } catch (e) {
      console.log('Insert A FAILED:', e.odbcErrors || e.message);
      return;
    }

    console.log('\n=== Step 3: second insert with the SAME id', testId, '===');
    try {
      const r2 = await conn.query(`INSERT INTO Intervention (NoInt_interv, NoIntLigcde, TypeCode, TypeLibelle, Commentaire) VALUES (${testId}, 39500, 'ER', 'Etape de réparation', 'DUPLICATE TEST B')`);
      console.log('Insert B result:', r2.count, '(no error raised — no uniqueness enforced!)');
    } catch (e) {
      console.log('Insert B FAILED (uniqueness enforced, good):', e.odbcErrors || e.message);
    }

    console.log('\n=== Step 4: what actually exists now with id', testId, '===');
    const rows = await conn.query('SELECT NoInt_interv, NoIntLigcde, Commentaire FROM Intervention WHERE NoInt_interv = ' + testId);
    console.log('Row count:', rows.length);
    rows.forEach(r => console.log(' -', JSON.stringify(r)));

    console.log('\n=== Step 5: cleanup ===');
    const del = await conn.query('DELETE FROM Intervention WHERE NoInt_interv = ' + testId);
    console.log('Deleted:', del.count);
    const after = await conn.query('SELECT NoInt_interv FROM Intervention WHERE NoInt_interv = ' + testId);
    console.log('Remaining rows with test id:', after.length);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
  }
}

main();

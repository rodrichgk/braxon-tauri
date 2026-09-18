#!/usr/bin/env node
// Regenerates src/lib/absCanStrings.json from the SC F2-EVO
// ElectronicsData.accdb `Stringhe` table.
//
// `Stringhe` is the per-model CAN init sequence `ABS.cs` `StartABS` /
// `FillTable` push to the ECU board on Key Power so a CAN-bus ABS unit
// starts answering `Comunication:`. Columns: ID_Modello, Order, Test,
// Address1 (CAN id, decimal), D1..D8 (data bytes, nullable → DLC < 8),
// Type (byte), Delay (µs between frames).
//
// `Test` selects which loop a row belongs to — ABS.cs reads:
//   Test = 3  → StartABS   (init frames, sent individually + "Start ABS")
//   Test = 0  → FillTable   "base" loop
//   Test = 1  → FillTable   "motor" loop  (Type == 5 ⇒ the unit can Turn Off)
// (Test = 2 is the gearbox/`Cambi.cs` table — 57 k rows — and Tests 4-10 are
// other bench screens; none are part of the ABS Key-Power flow.)
//
// Only ~17 of the 278 catalog models carry ABS strings — modern CAN units
// (MK60/MK61/MK70, Bosch 8.x/9.0). K-line units have none and need no upload.
//
// First, dump the rows to JSON on Windows (ACE OLEDB reads .accdb natively —
// do NOT read the .accdb from Rust; see hydraulic_import.rs). The join to
// `Modelli` on `Component = 0` drops the 13 `Component = 1` gearbox/DSG rows
// (incl. the 8 373-row "00" scratch model) that aren't in absModelCatalog:
//
//   powershell -c '
//     $db = "<path>\ElectronicsData.accdb"
//     $out = "reference-data\electronics-models"
//     $c = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$db;")
//     $c.Open()
//     $sql = "SELECT s.ID_Modello, s.[Order], s.Test, s.Address1, s.D1,s.D2,s.D3,s.D4,s.D5,s.D6,s.D7,s.D8, s.Type, s.Delay " +
//            "FROM Stringhe s INNER JOIN Modelli m ON s.ID_Modello = m.ID " +
//            "WHERE s.Test IN (0,1,3) AND m.Component = 0 ORDER BY s.ID_Modello, s.Test, s.[Order]"
//     $cmd = $c.CreateCommand(); $cmd.CommandText = $sql
//     $a = New-Object System.Data.OleDb.OleDbDataAdapter $cmd; $d = New-Object System.Data.DataTable; [void]$a.Fill($d)
//     $rows = foreach ($r in $d.Rows) { $o = [ordered]@{}; foreach ($col in $d.Columns) { $v = $r[$col.ColumnName]; if ($v -is [DBNull]) { $v = $null }; $o[$col.ColumnName] = $v }; [pscustomobject]$o }
//     ($rows | ConvertTo-Json -Depth 4 -Compress) | Set-Content (Join-Path $out "stringhe-abs.json") -Encoding UTF8
//     $c.Close()'
//
// Then: node scripts/gen-abs-can-strings.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8').replace(/^﻿/, ''));

const rows = readJson('reference-data/electronics-models/stringhe-abs.json');

// `Test` → the key ABS.cs' StartABS/FillTable put that loop under.
const LOOP = { 0: 'base', 1: 'motor', 3: 'init' };

// One row → the compact wire tuple `[address1, delayUs, type, ...dataBytes]`.
// `Order` is dropped: it's contiguous 0..n-1 per (model, test) in the source
// and the loader re-derives `indx`/`pos` from array position + the FillTable
// interleave, so storing it would be redundant.
const toTuple = (r) => {
  const data = [];
  let ended = false;
  for (let i = 1; i <= 8; i += 1) {
    const b = r[`D${i}`];
    // `ABS.cs` skips null D-columns individually
    // (`if (row["D"+i] != DBNull.Value) data.Add(...)`). Breaking on the
    // first null instead is identical *iff* there are no non-trailing nulls
    // — assert that, don't assume it.
    if (b == null) { ended = true; continue; }
    if (ended) {
      throw new Error(`Stringhe model ${r.ID_Modello} order ${r.Order}: non-trailing null D-column (D${i} set after a gap)`);
    }
    data.push(b);
  }
  return [r.Address1, r.Delay ?? 0, r.Type ?? 0, ...data];
};

/** @type {Record<string, Record<string, number[][]>>} */
const catalog = {};
for (const r of rows) {
  const loop = LOOP[r.Test];
  if (!loop) continue;
  const id = String(r.ID_Modello);
  ((catalog[id] ??= {})[loop] ??= []).push({ order: r.Order, tuple: toTuple(r) });
}

// Sort each loop by Order, then flatten to just the tuples. The loader
// re-derives `indx`/`pos` from array position, which is only sound while
// `Order` is a dense `0..n-1` sequence — assert it here rather than ship a
// silently-wrong `indx` if a future export has gaps or a 1-based `Order`.
let frameCount = 0;
for (const id of Object.keys(catalog)) {
  for (const loop of Object.keys(catalog[id])) {
    catalog[id][loop].sort((a, b) => a.order - b.order);
    catalog[id][loop].forEach((x, i) => {
      if (x.order !== i) {
        throw new Error(`Stringhe model ${id} loop "${loop}": Order not 0..n-1 (row ${i} has Order ${x.order})`);
      }
    });
    catalog[id][loop] = catalog[id][loop].map((x) => x.tuple);
    frameCount += catalog[id][loop].length;
  }
}

// Deterministic key order (numeric) so the file diffs cleanly on regen.
const ordered = {};
for (const id of Object.keys(catalog).sort((a, b) => Number(a) - Number(b))) {
  ordered[id] = catalog[id];
}

writeFileSync(join(root, 'src/lib/absCanStrings.json'), JSON.stringify(ordered), 'utf8');
console.log(
  `absCanStrings.json: ${Object.keys(ordered).length} models, ${frameCount} CAN frames`,
);

#!/usr/bin/env node
// Regenerates src/lib/absModelCatalog.json from the SC F2-EVO
// ElectronicsData.accdb exports in reference-data/electronics-models/.
//
// First, dump the Access tables to JSON on Windows (ACE OLEDB reads .accdb
// natively; do NOT try to read the .accdb from Rust — see hydraulic_import.rs):
//
//   powershell -c '
//     $db = "<path>\ElectronicsData.accdb"
//     $out = "reference-data\electronics-models"
//     $c = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$db;")
//     $c.Open()
//     function Dump($sql,$f){ $cmd=$c.CreateCommand(); $cmd.CommandText=$sql
//       $a=New-Object System.Data.OleDb.OleDbDataAdapter $cmd; $d=New-Object System.Data.DataTable; [void]$a.Fill($d)
//       $rows = foreach($r in $d.Rows){ $o=[ordered]@{}; foreach($col in $d.Columns){ $v=$r[$col.ColumnName]; if($v -is [DBNull]){$v=$null}; $o[$col.ColumnName]=$v }; [pscustomobject]$o }
//       ($rows|ConvertTo-Json -Depth 4 -Compress)|Set-Content (Join-Path $out $f) -Encoding UTF8 }
//     Dump "SELECT ID, Nome FROM Produttori ORDER BY Nome" "produttori.json"
//     Dump "SELECT * FROM Modelli WHERE Component = 0 ORDER BY Nome" "modelli.json"
//     $c.Close()'
//
// Then: node scripts/gen-abs-model-catalog.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8').replace(/^﻿/, ''));

const producers = new Map(
  readJson('reference-data/electronics-models/produttori.json').map((p) => [p.ID, p.Nome]),
);
const models = readJson('reference-data/electronics-models/modelli.json');

const n = (v, d = 0) => (v == null ? d : v);
const cmp = new Intl.Collator('en', { sensitivity: 'base', numeric: true }).compare;

const catalog = models
  .map((m) => {
    const manufacturer = producers.get(m.ID_Produttore) ?? '';
    const name = String(m.Nome ?? '').trim();
    if (!name || name === '00' || name === '0' || !manufacturer || manufacturer === '0') return null;
    return {
      id: m.ID,
      manufacturer,
      name,
      type: m.Type ? 1 : 0,
      speedCan: n(m.SpeedCAN),
      signal: n(m.Signal),
      code: n(m.Code, 2000),
      coefficient: Number((n(m.Coefficient, 0.16) || 0.16).toFixed(6)),
      breakSpeed: n(m.BreakSpeed, 0.7) || 0.7,
      pausa: n(m.Pausa, 30) || 30,
      deltaSpeed: n(m.DeltaSpeed, 1) || 1,
      spike: Boolean(m.Spike),
      waitComunication: Boolean(m.WaitComunication),
      enable: n(m.Enable),
      // ABS.cs Model_Click: a null wheel-N resistance falls back to wheel 1's.
      wheelRes: [1, 2, 3, 4].map((w) => [
        n(m[`Wheel${w}Res1`], n(m.Wheel1Res1, 1500)),
        n(m[`Wheel${w}Res2`], n(m.Wheel1Res2, 200)),
      ]),
      alfa: [1, 2, 3, 4].map((a) => n(m[`Alfa${a}`], 1)),
    };
  })
  .filter(Boolean)
  // Grouped by manufacturer (CATALOG_MANUFACTURERS' contiguous scan relies on
  // this), models name-sorted within each so the picker reads in order.
  .sort((a, b) => cmp(a.manufacturer, b.manufacturer) || cmp(a.name, b.name));

writeFileSync(
  join(root, 'src/lib/absModelCatalog.json'),
  JSON.stringify(catalog),
  'utf8',
);
console.log(
  `absModelCatalog.json: ${catalog.length} models, ` +
    `${new Set(catalog.map((m) => m.manufacturer)).size} manufacturers`,
);

// The SC F2-EVO electronics bench's `Modelli` table (`ElectronicsData.accdb`,
// `Component = 0` = ABS), exported to JSON and bundled here so the model
// picker has the real manufacturer → model list the original's
// `SelectModelForm` shows — without needing the Access DB at runtime.
//
// Regenerate with `node scripts/gen-abs-model-catalog.mjs` (after re-dumping
// the Access tables to `reference-data/electronics-models/` — the OleDb
// command is in that script's header). It drops the `'0'`-manufacturer
// placeholder rows and fills nulls with `ABS.cs Model_Click`'s own
// fallbacks (a null wheel-N resistance → wheel 1's). ~280 units. The
// per-model `Stringhe` CAN-init frames are bundled separately in
// `absCanStrings.json` (only ~17 units carry them) and keyed by `id`.

import rawCatalog from './absModelCatalog.json';
import { defaultModel, type AbsElectronicsModel } from './absModel';

export interface CatalogModel {
  id: number;
  manufacturer: string;
  name: string;
  /** 0 = passive WSS, 1 = active. */
  type: 0 | 1;
  speedCan: number;
  signal: number;
  /** ABS ident → cable `GRM<code-2000>`. 2000 = the "not set in the DB"
   *  stub — many rows have it; the operator fills the real value. */
  code: number;
  coefficient: number;
  breakSpeed: number;
  pausa: number;
  deltaSpeed: number;
  spike: boolean;
  /** `Modelli.WaitComunication` — Key Power waits for a live `Comunication:`
   *  before starting the test (see `AbsElectronicsModel.waitComunication`). */
  waitComunication: boolean;
  /** `Modelli.Enable` bitfield (bit0 = Motor Test, bit1 = Valve Test). */
  enable: number;
  wheelRes: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  alfa: readonly [number, number, number, number];
}

export const ABS_MODEL_CATALOG = rawCatalog as unknown as CatalogModel[];

/** Distinct manufacturers, locale-alphabetical. */
export const CATALOG_MANUFACTURERS: string[] = [
  ...new Set(ABS_MODEL_CATALOG.map(m => m.manufacturer)),
].sort((a, b) => a.localeCompare(b));

export function catalogModelsFor(manufacturer: string): CatalogModel[] {
  return ABS_MODEL_CATALOG.filter(m => m.manufacturer === manufacturer);
}

/** Fill the editable form from a catalog row. Values the catalog stubs
 *  (notably `code === 2000`) stay as-is for the operator to correct. */
export function catalogToModel(c: CatalogModel): AbsElectronicsModel {
  // Some `Modelli.Nome` values already lead with the make ("Mini MK60"),
  // others don't ("147  Bosch 5.3") — only prefix when it's missing, so we
  // don't get "Mini Mini MK60".
  const name = c.name.toLowerCase().startsWith(c.manufacturer.toLowerCase())
    ? c.name.replace(/\s+/g, ' ').trim()
    : `${c.manufacturer} ${c.name}`.replace(/\s+/g, ' ').trim();
  return defaultModel({
    name,
    // Carried so the bench can look up this model's `Stringhe` CAN-init
    // sequence (absCanStrings.ts) on Key Power.
    id: c.id,
    type: c.type === 1 ? 1 : 0,
    speedCan: c.speedCan,
    signal: c.signal,
    code: c.code,
    coefficient: c.coefficient > 0 ? c.coefficient : defaultModel().coefficient,
    breakSpeed: c.breakSpeed > 0 ? c.breakSpeed : defaultModel().breakSpeed,
    pausa: c.pausa,
    deltaSpeed: c.deltaSpeed,
    spike: c.spike,
    waitComunication: c.waitComunication,
    wheelRes: c.wheelRes,
    alfa: c.alfa,
  });
}

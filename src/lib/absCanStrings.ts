// The SC F2-EVO `Stringhe` table (`ElectronicsData.accdb`) — the per-model
// CAN init sequence the ECU/ABS board needs before a CAN-bus unit will
// answer `Comunication:`. `ABS.cs` `StartABS` / `FillTable` pull these on
// Key Power and stream them to the board (`InviaComando(Electronic,
// Serialize(FRAME))`).
//
// Bundled (regenerate with `node scripts/gen-abs-can-strings.mjs`, header
// there for the OleDb dump). Only ~17 catalog models carry strings — modern
// CAN units (MK60/MK61/MK70, Bosch 8.x/9.0); K-line units have none. The
// sequencing that turns these rows into wire frames is `absCanUpload.ts`.

import rawStrings from './absCanStrings.json';

/** One `Stringhe` row, decoded from its compact `[address1, delayUs, type,
 *  ...dataBytes]` tuple. `data` length is the frame's DLC (0-8). */
export interface CanStringRow {
  /** CAN identifier, decimal (`Stringhe.Address1`; 11- or 29-bit). */
  address1: number;
  /** `Stringhe.Delay` — microseconds the board waits after this frame. */
  delayUs: number;
  /** `Stringhe.Type` — 0 normally; on a `motor` row, 5 marks a unit that
   *  supports Turn Off Motor (`ABS.cs FillTable`: `EnableTurnOff |= Type == 5`). */
  type: number;
  data: number[];
}

/** A model's CAN init rows, split by which `ABS.cs` loop consumes them:
 *  `init` = `Test 3` (StartABS), `base` = `Test 0`, `motor` = `Test 1`
 *  (both FillTable). Any list may be empty. */
export interface ModelCanStrings {
  init: CanStringRow[];
  base: CanStringRow[];
  motor: CanStringRow[];
}

type RawTuple = number[];
type RawModel = { init?: RawTuple[]; base?: RawTuple[]; motor?: RawTuple[] };
const RAW = rawStrings as Record<string, RawModel>;

function decodeTuple(t: RawTuple): CanStringRow {
  const [address1 = 0, delayUs = 0, type = 0, ...data] = t;
  return { address1, delayUs, type, data };
}

function decodeList(list: RawTuple[] | undefined): CanStringRow[] {
  return (list ?? []).map(decodeTuple);
}

/** The CAN init rows for a catalog model id, or `null` when it has none
 *  (the common case — most units don't need a CAN preamble). */
export function canStringsFor(modelId: number | null | undefined): ModelCanStrings | null {
  if (modelId == null) return null;
  const raw = RAW[String(modelId)];
  if (!raw) return null;
  return {
    init: decodeList(raw.init),
    base: decodeList(raw.base),
    motor: decodeList(raw.motor),
  };
}

/** Does this model carry a CAN init sequence? */
export function hasCanStrings(modelId: number | null | undefined): boolean {
  return modelId != null && Object.prototype.hasOwnProperty.call(RAW, String(modelId));
}

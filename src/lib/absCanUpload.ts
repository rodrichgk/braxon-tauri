// The CAN init upload `ABS.cs` `StartABS` + `FillTable` run on Key Power —
// turns a model's `Stringhe` rows (see `absCanStrings.ts`) into the exact
// STX frames the ECU board expects, so a CAN-bus ABS unit comes alive and
// starts answering `Comunication:`.
//
// Pure: no React, no Tauri. The frame JSON matches .NET's
// `JavaScriptSerializer.Serialize(FRAME)` — `FRAME.cs` public-field order is
// `address1, indx, pos, type, us, data`, whole numbers without forced
// decimals, `address1` a *string* (`row["Address1"].ToString()`).

import type { CanStringRow, ModelCanStrings } from './absCanStrings';
import type { ElectronicsCmd } from './absBench';

/** `MainMenuForm.cs:66` — `public static byte N_STRING = 5`. The board is
 *  told this many `FillTable` frames per message, as a JSON array. It drops
 *  to 1 (one frame per message, bare object) only for the older
 *  "Test Centralina" single-frame firmware, which BRAXON doesn't drive —
 *  none of the bundled units use it. */
export const N_STRING = 5;

/** One CAN frame, shaped and field-ordered like the .NET `FRAME`. */
export interface CanFrame {
  address1: string;
  indx: number;
  pos: number;
  type: number;
  us: number;
  data: number[];
}

function frame(row: CanStringRow, indx: number, opts: { pos: number; forceType0?: boolean }): CanFrame {
  return {
    address1: String(row.address1),
    indx,
    pos: opts.pos,
    type: opts.forceType0 ? 0 : row.type,
    us: row.delayUs,
    data: row.data.slice(),
  };
}

/** `ABS.cs StartABS` — `Test = 3` rows become individual frames with
 *  `type` forced to 0, `pos` left 0, `indx = Order` (here the row's array
 *  position, Order being contiguous in the source). */
export function buildStartAbsFrames(init: readonly CanStringRow[]): CanFrame[] {
  return init.map((row, i) => frame(row, i, { pos: 0, forceType0: true }));
}

/** `ABS.cs FillTable` — interleave the `base` (`Test 0`) and `motor`
 *  (`Test 1`) loops one-for-one (`base` first: `num % 2 == 0`), then drain
 *  whichever is longer, numbering `pos` 0,1,2,… as we go. `indx` is the
 *  row's position within its own loop — the original adds `BaseDataCAN.Count`
 *  to the motor `indx`, but `StartABS` has already drained that queue by the
 *  time `FillTable` reads it, so it's always `+ 0`. With `N_STRING > 1` the
 *  last frame's `pos` is negated — the board's end-of-sequence marker. */
export function buildFillTableFrames(
  base: readonly CanStringRow[],
  motor: readonly CanStringRow[],
  nString: number = N_STRING,
): CanFrame[] {
  // `ABS.cs FillTable:1788` — when the motor loop runs more than 2 rows
  // longer than the base loop, the original re-`Fill`s `TableBase`, and an
  // `OleDbDataAdapter` with no inferred PK *appends*, so the base rows go
  // round twice before the queues are built. `indx` still comes off each
  // row's `Order`, so the second pass repeats `0..n-1` (not `n..2n-1`).
  const doubleBase = base.length > 0 && motor.length - base.length > 2;
  const baseRows = doubleBase ? [...base, ...base] : base;
  const baseQ = baseRows.map((row, i) => frame(row, doubleBase ? i % base.length : i, { pos: 0 }));
  const motorQ = motor.map((row, i) => frame(row, i, { pos: 0 }));

  const out: CanFrame[] = [];
  let num = 0;
  let bi = 0;
  let mi = 0;
  while (bi < baseQ.length && mi < motorQ.length) {
    const f = num % 2 !== 0 ? motorQ[mi++] : baseQ[bi++];
    f.pos = num++;
    out.push(f);
  }
  while (bi < baseQ.length) {
    const f = baseQ[bi++];
    f.pos = num++;
    out.push(f);
  }
  while (mi < motorQ.length) {
    const f = motorQ[mi++];
    f.pos = num++;
    out.push(f);
  }

  if (nString > 1 && out.length > 0) {
    const last = out[out.length - 1];
    last.pos = -last.pos;
  }
  return out;
}

function serializeFrame(f: CanFrame): string {
  // Key order must match FRAME.cs; JSON.stringify keeps insertion order.
  return JSON.stringify({
    address1: f.address1,
    indx: f.indx,
    pos: f.pos,
    type: f.type,
    us: f.us,
    data: f.data,
  });
}

/** Group frames into the messages `ABS.cs` sends: `N_STRING`-sized batches,
 *  serialized as a JSON array when `nString > 1`, else one bare object per
 *  message. The trailing partial batch always goes out as an array
 *  (`ABS.cs:1852` — `list2.ToArray()`), matching the original even when it
 *  holds a single frame. */
export function batchCanFrames(frames: CanFrame[], nString: number = N_STRING): string[] {
  if (frames.length === 0) return [];
  if (nString <= 1) return frames.map(serializeFrame);

  const messages: string[] = [];
  for (let i = 0; i < frames.length; i += nString) {
    messages.push(JSON.stringify(frames.slice(i, i + nString).map(f => ({
      address1: f.address1,
      indx: f.indx,
      pos: f.pos,
      type: f.type,
      us: f.us,
      data: f.data,
    }))));
  }
  return messages;
}

/** Whether any `motor` row is `Type == 5` — `ABS.cs FillTable` uses this to
 *  enable the Turn Off Motor control. */
export function canTurnOffMotor(strings: ModelCanStrings): boolean {
  return strings.motor.some(r => r.type === 5);
}

/** The complete Key-Power CAN upload for a model, as queue commands in send
 *  order: the `StartABS` init frames (+ `Start ABS`) when present, then the
 *  interleaved `FillTable` batches. Empty when the model carries no strings.
 *  Returns `{ commands, hadInit }` — `hadInit` is `ABS.cs`'s `flag` (the
 *  `StartABS` return), which lets Key Power start the test without waiting
 *  on comms. */
export function buildCanUpload(
  strings: ModelCanStrings | null,
  nString: number = N_STRING,
): { commands: ElectronicsCmd[]; hadInit: boolean } {
  if (!strings) return { commands: [], hadInit: false };

  const commands: ElectronicsCmd[] = [];
  const initFrames = buildStartAbsFrames(strings.init);
  if (initFrames.length > 0) {
    for (const json of batchCanFrames(initFrames, 1)) commands.push({ action: 'can_frames', json });
    commands.push({ action: 'start_abs' });
  }

  const fill = buildFillTableFrames(strings.base, strings.motor, nString);
  for (const json of batchCanFrames(fill, nString)) commands.push({ action: 'can_frames', json });

  return { commands, hadInit: initFrames.length > 0 };
}

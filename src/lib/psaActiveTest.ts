/* ── Peugeot 207 BSI active test — replays the exact IOControlByLocalIdentifier
   sequence decoded from a real bench capture
   (reference-data/peugeot-207-bsi-commodo-can.md), so a technician can click
   a button and watch a real connected dash react, the same way the Autel's
   own active-test menu did on the bench.

   Only local ID 0xC5 is *confirmed* — it's the only one that ever appeared
   on the bus in that capture (activated 3 separate times), and which
   physical output it drives was never confirmed either. Every other local
   ID is an untested candidate: click it, watch the dash, note what lit up.

   Frames here are deliberately NOT padded to 8 bytes. The capture's own DLC
   column proves this BSI sends/expects exact-length frames (`06 30 C5 00 09
   06 01` is DLC 7, `02 10 C0` is DLC 3) — never padded — the same "don't pad"
   gotcha already known from VAG TP2.0 (see vwtp20.ts). `isotp.ts`'s
   `buildFrame`/`buildSingleFrame` always pad to 8, so they're not reused
   here for the IOControl frames themselves (session-open/keep-alive still
   goes through the shared `udsSession.ts`, which does pad — most ECUs
   tolerate trailing padding on those simple requests; if this BSI turns out
   not to, that's the first thing to revisit). ───────────────────────────── */

export const PSA_BSI_SEND_ID = 0x752;
export const PSA_BSI_RECV_ID = 0x652;

/** The one local ID confirmed to do *something* in the real capture. */
export const CONFIRMED_LOCAL_ID = 0xc5;

const SID_IO_CONTROL = 0x30;
/** The capture's 4th start byte varied across activations (0x09, 0x08,
 *  0x05) with no confirmed meaning — this is "a value that worked", not a
 *  decoded parameter. */
const DEFAULT_N = 0x0a;

function unpaddedFrame(canId: number, bytes: number[]): string {
  const hex = bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  return `CANTx : ${canId.toString(16).toUpperCase().padStart(3, '0')} ${hex}\n`;
}

/** `06 30 <id> 00 <n> 06 01` — starts (or re-arms) the active test. */
export function buildActiveTestStart(localId: number, n = DEFAULT_N): string {
  const bytes = [SID_IO_CONTROL, localId, 0x00, n, 0x06, 0x01];
  return unpaddedFrame(PSA_BSI_SEND_ID, [bytes.length, ...bytes]);
}

/** `03 30 <id> 01` — keep-alive, sent every ~230-250ms while held (the
 *  capture's own cadence) so the BSI doesn't time the test back out. */
export function buildActiveTestKeepAlive(localId: number): string {
  const bytes = [SID_IO_CONTROL, localId, 0x01];
  return unpaddedFrame(PSA_BSI_SEND_ID, [bytes.length, ...bytes]);
}

/** `03 30 <id> 11` — stops the test. */
export function buildActiveTestStop(localId: number): string {
  const bytes = [SID_IO_CONTROL, localId, 0x11];
  return unpaddedFrame(PSA_BSI_SEND_ID, [bytes.length, ...bytes]);
}

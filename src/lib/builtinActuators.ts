/* ── Built-in active tests ────────────────────────────────────
   Actuator commands for ABS units the DDT4ALL database doesn't cover,
   decoded from commercial-tool bus captures. Used as a fallback when
   get_ecu_actuators returns nothing for the selected hardware family.

   Each `sentBytes` is the raw service payload (no ISO-TP length prefix);
   the Diagnostics panel wraps it as a single frame and sends it inside the
   held 0xC0 session — byte-for-byte what the reference tool did.

   Grow this as more captures are decoded — key by hardware family (see
   guessHardwareFamily in ./ecu). ─────────────────────────────────────── */

import type { ActuatorEntry } from '@/lib/ecu';
import { normalizeAbsRef } from '@/lib/ecu';

export const BUILTIN_ACTUATORS: Record<string, ActuatorEntry[]> = {
  // Bosch/ATE MK61 — Renault/Dacia (e.g. 10.0961-1464.3).
  // Source: Autel capture 2026-07-24, session 10 C0 on 0x740 → 0x760:
  //   30 01 00 FF BF  → 70 01 01   return-pump motor run
  //   30 01 00 FF FF  → 70 01 01   return-pump motor stop
  // Service 0x30 = KWP2000 InputOutputControlByLocalIdentifier, LID 0x01.
  MK61: [
    {
      id: 'mk61-pump-run',
      name: 'Return-pump motor — RUN (30 01 00 FF BF)',
      label: 'Pump RUN',
      sentBytes: '300100FFBF',
      category: 'pump',
    },
    {
      id: 'mk61-pump-stop',
      name: 'Return-pump motor — STOP (30 01 00 FF FF)',
      label: 'Pump STOP',
      sentBytes: '300100FFFF',
      category: 'reset',
    },
  ],

  // Bosch 8.0 / 8.1 on the Renault X84 platform (Mégane II / Scénic II) —
  // Abs_X84_Bosch8.0_F05_V2 / F10_V3 / F05_R84_V4, Abs_X84_Bosch8.1_V1.3.
  //
  // NO pressure-sensor calibration built-in here, on purpose. A re-check of the
  // DDT4ALL DB (2026-09-05) showed these X84 files carry no pressure-sensor
  // offset routine at all, and — the important part — on this ECU generation
  // the bytes 31 01 00 02 are already taken: routine 01 is "Start Poles
  // Counting" per wheel (31 01 00 01/02/03/04 = FL/FR/RL/RR, status
  // 31 01 01 01). So 31 01 00 02 on a Bosch 8.0 X84 unit = Start Poles
  // Counting Front-Right, a wheel-speed routine that expects a turning wheel —
  // not a pressure offset. The earlier "0002 is the missing number" guess was
  // wrong (misread the bleed list — routine 01 there is poles-counting, not
  // part of the bleed sequence).
  //
  // "31 01 00 02 = braking pressure offset" IS real, but only on the newer
  // ESP-integrated Renault files, where routine 01 is the ESP sensor-offset
  // group (00 = steering angle, 01 = lateral accel, 02 = master-cylinder
  // pressure, 03 = longitudinal accel):
  //   ABS___X95_Version_1.0.3            Mégane III / Scénic III / Fluence
  //   ABSESCAPB___XEF_Version_1.7        Kadjar
  //   ABS_ESC_X92_X67_V1.2 / V2.0        Dacia Logan / Sandero / MCV (B0)
  //   ABS_ESC_XJK_V1.5                   Dacia (Dokker / Lodgy family)
  //   ABS_ESP___X74ph2_J81_X73ph2_v14    Laguna II / Espace IV era — but 31 90 00 02
  // Those are already served through the normal get_ecu_actuators path, so no
  // built-in is needed. If a bench unit is actually X95-era, pick that
  // reference and the DB offers "Clear Pressure Sensor Offset" directly.

  // Bosch 8.x also covers PSA (Citroën / Peugeot). From an Autel capture on a
  // C4 Grand Picasso ABS, Bosch 0265244185 (2026-09-07, UDS on 0x6AD → 0x68D,
  // session 10 03). The Autel's "motor test" was RoutineControl 0xDF16, run
  // TWICE (identical bytes), ~1 s each, no security:
  //   31 01 DF 16 11 00   start   → 71 01 DF 16 01
  //   31 03 DF 16          poll    → 71 03 DF 16 01 (running) … 02 (complete)
  // During each run the broadcast frame 0x3CD bytes 2-3 went FF FF → 00 00
  // (something energised — pump/valve). Exact function not cross-checked vs
  // Diagbox. Renault Bosch-8.x units answer 7F 31 31 to it (harmless).
  //
  // Note: BRAXON's Active Tests just fire one frame — for a run→poll routine,
  // click "start", then click "read result" a few times to watch it reach 02.
  'Bosch 8.x': [
    {
      id: 'psa-df16-motor',
      name: 'PSA motor test — start (31 01 DF 16 11 00) · Autel "motor test", C4 Picasso Bosch',
      label: 'Motor test',
      sentBytes: '3101DF161100',
      category: 'pump',
    },
    {
      id: 'psa-df16-poll',
      name: 'PSA motor test — read result (31 03 DF 16) · 71 03 DF 16 02 = complete',
      label: 'Motor test — result',
      sentBytes: '3103DF16',
      category: 'other',
    },
  ],
};

// Some units don't share their actuator bytes with a whole hardware family —
// there's nothing to classify them into (`guessHardwareFamily` only knows the
// Bosch/ATE part-number shapes) and no DDT4ALL ecu_file link, so
// `BUILTIN_ACTUATORS` above never resolves for them. Keyed by
// `normalizeAbsRef(reference)` instead, mirroring `BUILTIN_WSS_READ` in
// `wssReadback.ts` — checked in addition to the family table, not instead of
// it, so a unit that DOES have a family still gets both.
export const BUILTIN_ACTUATORS_BY_REF: Record<string, ActuatorEntry[]> = {
  // ATE/Continental ref 10.0961-0315.3 — same 0x740→0x760 addressing as MK61,
  // but pump/motor control is KWP `31` StartRoutineByLocalIdentifier (routine
  // 0xB8), not MK61's `30 01` InputOutputControlByLocalIdentifier. From
  // BRAXON's own bus recording (dtc-bus-both-10.0961-0315.3-
  // 2026-09-15T14-04-42-487Z.log), session 10 C0 on 0x740 → 0x760:
  //   31 B8 00 00  → 71 B8 01 01 01 02 01 03 01 14 01 06 01 08   (t≈5.4s)
  //   31 B8 01 02  → 71 B8 01 02                                (t≈218s)
  // Both option pairs were accepted (positive `71`); the first's long
  // multi-frame reply looks like a status/counter dump rather than a plain
  // ack. Which option pair actually starts vs. stops the motor wasn't
  // cross-checked against a reference tool — click "Pump" and listen/feel
  // for it running, same as the operator did capturing this.
  '10096103153': [
    {
      id: '10096103153-pump-b8-0000',
      name: 'Pump/motor routine 0xB8, option 00 00 (31 B8 00 00) → 71 B8 …',
      label: 'Pump — mode A',
      sentBytes: '31B80000',
      category: 'pump',
    },
    {
      id: '10096103153-pump-b8-0102',
      name: 'Pump/motor routine 0xB8, option 01 02 (31 B8 01 02) → 71 B8 01 02',
      label: 'Pump — mode B',
      sentBytes: '31B80102',
      category: 'pump',
    },
  ],

  // Renault X45-platform ABS — ref 476601KD2A. No DDT4ALL ecu_file identified
  // (see wssReadback.ts) and the part-number shape isn't one guessHardwareFamily
  // recognises, so this is the only way these show up in Active Tests at all.
  // Decoded from the same Autel capture as the wheel-speed DIDs (2026-09-15,
  // KWP-on-CAN 10 C0, 0x740→0x760) — both IOControlByLocalID, no security.
  '476601KD2A': [
    {
      id: '476601kd2a-pump-run',
      name: 'Return-pump motor — RUN (30 06 00 01) → 70 06 01',
      label: 'Pump RUN',
      sentBytes: '30060001',
      category: 'pump',
    },
    {
      id: '476601kd2a-pump-stop',
      name: 'Return-pump motor — STOP (30 06 11 00) → 70 06 11',
      label: 'Pump STOP',
      sentBytes: '30061100',
      category: 'reset',
    },
    // The Autel cycled these two alternately several times, then sent the
    // stop frame — click open/close by hand to bleed, same as the Autel did.
    {
      id: '476601kd2a-bleed-open',
      name: 'Bleeding — valve cycle OPEN (30 02 00 02) → 70 02 01',
      label: 'Bleed OPEN',
      sentBytes: '30020002',
      category: 'valve',
    },
    {
      id: '476601kd2a-bleed-close',
      name: 'Bleeding — valve cycle CLOSE (30 02 00 00) → 70 02 01',
      label: 'Bleed CLOSE',
      sentBytes: '30020000',
      category: 'valve',
    },
    {
      id: '476601kd2a-bleed-stop',
      name: 'Bleeding — stop (30 02 11 01) → 70 02 11',
      label: 'Bleed STOP',
      sentBytes: '30021101',
      category: 'reset',
    },
  ],
};

/**
 * Built-in tests for a hardware family, plus any that are keyed to this exact
 * ABS reference (see `BUILTIN_ACTUATORS_BY_REF` above) — merged, not either/or,
 * so a unit with no recognisable family still gets its own tests, and a unit
 * that has both isn't forced to pick one source.
 */
export function builtinActuatorsFor(
  family: string | null | undefined,
  absRef?: string | null,
): ActuatorEntry[] {
  const byFamily = (family && BUILTIN_ACTUATORS[family]) || [];
  const byRef = (absRef && BUILTIN_ACTUATORS_BY_REF[normalizeAbsRef(absRef)]) || [];
  if (!byRef.length) return byFamily;
  const seen = new Set(byFamily.map((a) => a.id));
  return [...byFamily, ...byRef.filter((a) => !seen.has(a.id))];
}

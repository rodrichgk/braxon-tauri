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
};

/** Built-in tests for a hardware family, or [] when none are defined. */
export function builtinActuatorsFor(family: string | null | undefined): ActuatorEntry[] {
  return (family && BUILTIN_ACTUATORS[family]) || [];
}

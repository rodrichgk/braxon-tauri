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
};

/** Built-in tests for a hardware family, or [] when none are defined. */
export function builtinActuatorsFor(family: string | null | undefined): ActuatorEntry[] {
  return (family && BUILTIN_ACTUATORS[family]) || [];
}

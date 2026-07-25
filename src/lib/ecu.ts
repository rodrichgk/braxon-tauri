/* ── Shared ECU types + ABS reference helpers ──────────────────
   Types mirror the camelCase structs returned by the Tauri commands in
   src-tauri/src/commands.rs. ─────────────────────────────────────────── */

export type Protocol = 'OBD2' | 'UDS' | 'KWP2000';
export type VehicleBrand = 'Renault' | 'Nissan' | 'Mitsubishi' | 'Other';

export interface EcuInfo {
  ecuFile: string;
  ecuName: string;
  protocol: string;
  sendId: string | null;
  recvId: string | null;
  hardwareFamily: string | null;
}

export interface ActuatorEntry {
  id: string;
  name: string;
  label: string;
  sentBytes: string;
  category: 'pump' | 'valve' | 'relay' | 'reset' | 'other';
}

/** Result of `get_ecu_by_abs_ref` — everything the reference implies. */
export interface AbsRefLookup {
  absRef: string;
  normalized: string;
  source: 'mapping' | 'family' | 'unknown';
  hardwareFamily: string | null;
  manufacturer: string | null;
  sendId: string | null;
  recvId: string | null;
  protocol: string | null;
  ecu: EcuInfo | null;
  candidates: EcuInfo[];
  inAbsData: boolean;
}

/** Result of `get_discovery_candidates` — known-good addressing to try first. */
export interface DiscoveryCandidateRow {
  sendId: string;
  recvId: string;
  source: 'saved' | 'family' | 'db';
  label: string;
}

/** Alphanumeric-only uppercase key: `10.0961-1464.3` → `10096114643`, so
    dots, spaces and dashes never split a match. Matches normalize_abs_ref()
    in src-tauri/src/commands.rs. */
export function normalizeAbsRef(ref: string): string {
  return ref.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

/**
 * Hardware family guessed from the physical part number printed on the unit.
 * ATE/Continental: 10.0960-xxxx → MK60, 10.0970-xxxx → MK70
 * Bosch: 0 265 25x xxx → Bosch 8.x, 0 265 95x xxx → Bosch Gen 9
 * Mirrors guess_hardware_family() in src-tauri/src/commands.rs — keep in sync.
 */
export function guessHardwareFamily(pn: string): string | null {
  const n = normalizeAbsRef(pn);
  if (/^10(0961)/.test(n))                return 'MK61';
  if (/^10(0960|0175|0176)/.test(n))      return 'MK60';
  if (/^10(0970|0971|0972|0973)/.test(n)) return 'MK70';
  if (/^10(0200|0201|0202|0203)/.test(n)) return 'MK20';
  if (/^026595/.test(n))                  return 'Bosch Gen 9';
  if (/^02652[0-9]/.test(n))              return 'Bosch 8.x';
  if (/^02650[89]/.test(n))               return 'Bosch 8.0';
  return null;
}

/** `0x740` / `740` / `  740 ` → 0x740. NaN-safe: returns null on garbage. */
export function parseCanId(id: string | null | undefined): number | null {
  if (!id) return null;
  const n = parseInt(id.trim().replace(/^0x/i, ''), 16);
  return isNaN(n) || n < 0 || n > 0x7ff ? null : n;
}

export function toHex3(n: number): string {
  return n.toString(16).toUpperCase().padStart(3, '0');
}

/** Map the DDT4ALL protocol string onto the scanner's protocol tabs. */
export function protocolFromDb(protocol: string | null | undefined): Protocol | null {
  const p = protocol?.toUpperCase() ?? '';
  if (!p) return null;
  if (p.includes('KWP')) return 'KWP2000';
  if (p.includes('UDS') || p.includes('ISO15765')) return 'UDS';
  return null;
}

/** True for the standard OBD-II diagnostic IDs (broadcast + 8 ECU slots). */
export function isObdAddress(canId: number | null): boolean {
  return canId !== null && (canId === 0x7df || (canId >= 0x7e0 && canId <= 0x7e7));
}

/**
 * Protocol to assume when the DB does not say. Manufacturer-specific
 * addressing (0x740 and friends) never answers OBD-II mode 03, so anything
 * outside the standard range defaults to the KWP2000-on-CAN services these
 * Renault/Nissan/Mitsubishi ABS units use.
 */
export function defaultProtocolFor(canId: number | null): Protocol | null {
  if (canId === null) return null;
  return isObdAddress(canId) ? 'OBD2' : 'KWP2000';
}

/** Vehicle brand from an ABSData manufacturer string. Returns null rather than
    guessing 'Other' — 'Other' switches the ECU DB off entirely. */
export function brandFromManufacturer(manufacturer: string | null | undefined): VehicleBrand | null {
  const m = manufacturer?.toLowerCase() ?? '';
  if (!m) return null;
  if (m.includes('renault') || m.includes('dacia')) return 'Renault';
  if (m.includes('nissan'))                         return 'Nissan';
  if (m.includes('mitsubishi'))                     return 'Mitsubishi';
  return null;
}

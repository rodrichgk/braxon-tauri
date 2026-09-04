// QR-code scan plumbing shared by the generator (ScanModal), the in-app
// USB-camera scanner (QrScannerPanel) and the phone push listener
// (ScanListener).
//
// A BRAXON QR encodes a URL the phone's stock camera can open:
//     https://<scan-service>/s/<pcId>/<entity>/<key>?label=<text>
// The scan-service (scan-service/) writes it to Postgres; the desktop app
// on <pcId> picks it up and navigates here. The in-app camera decodes the
// same URL locally and skips the round trip (it *is* <pcId>).

import type { Page } from './pages';

export type ScanEntity = 'job' | 'abs' | 'stock';

export const SCAN_ENTITIES: readonly ScanEntity[] = ['job', 'abs', 'stock'];

export interface ParsedScan {
  entity: ScanEntity;
  key: string;
  /** Present when the code carried a full URL; absent for the bare token form. */
  pcId?: string;
  label?: string;
}

/** Which page each entity opens on. RemanPage / SignalPage read the
 *  pending scan on arrival and act on it (switch tab, focus the job, …). */
export const SCAN_ROUTES: Record<ScanEntity, Page> = {
  job: 'reman',
  abs: 'signal',
  stock: 'reman',
};

const SERVICE_URL_KEY = 'scanServiceUrl';
const DEFAULT_SERVICE_URL = 'https://192.168.77.182:8481';

const LABEL_PRINTER_KEY = 'braxonLabelPrinter';
/** Shop Zebra ZD420, raw/JetDirect socket. Empty string = no direct
 *  printer, fall back to the PDF download. */
const DEFAULT_LABEL_PRINTER = '192.168.77.32:9100';

export function getScanServiceUrl(): string {
  try {
    return localStorage.getItem(SERVICE_URL_KEY)?.trim() || DEFAULT_SERVICE_URL;
  } catch {
    return DEFAULT_SERVICE_URL;
  }
}

export function setScanServiceUrl(url: string): void {
  try {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (trimmed) localStorage.setItem(SERVICE_URL_KEY, trimmed);
    else localStorage.removeItem(SERVICE_URL_KEY);
  } catch {
    /* private mode / storage disabled — QR generation just falls back to the default */
  }
}

export function getLabelPrinter(): string {
  try {
    const v = localStorage.getItem(LABEL_PRINTER_KEY);
    return v === null ? DEFAULT_LABEL_PRINTER : v.trim();
  } catch {
    return DEFAULT_LABEL_PRINTER;
  }
}

export function setLabelPrinter(value: string): void {
  try {
    // Stored even when blank (empty string, not removed) so "no printer,
    // use PDF" is a real saved choice, not "unset → back to default".
    localStorage.setItem(LABEL_PRINTER_KEY, value.trim());
  } catch {
    /* ignore */
  }
}

/** `host` or `host:port` → { host, port } (port defaults to 9100). */
export function parsePrinterTarget(value: string): { host: string; port: number } | null {
  const m = /^([^:\s/]+)(?::(\d{1,5}))?$/.exec(value.trim());
  if (!m) return null;
  const port = m[2] ? Number(m[2]) : 9100;
  if (port < 1 || port > 65535) return null;
  return { host: m[1], port };
}

function isEntity(v: string): v is ScanEntity {
  return (SCAN_ENTITIES as readonly string[]).includes(v);
}

/** The value baked into a QR code. */
export function buildScanUrl(
  base: string,
  pcId: string,
  entity: ScanEntity,
  key: string,
  label?: string,
): string {
  const root = base.replace(/\/+$/, '');
  const path = `/s/${encodeURIComponent(pcId)}/${entity}/${encodeURIComponent(key)}`;
  const query = label ? `?label=${encodeURIComponent(label.slice(0, 200))}` : '';
  return `${root}${path}${query}`;
}

/** Compact offline form — used only when no scan-service URL is configured,
 *  so the in-app camera still works even if the phone path can't. */
export function buildScanToken(entity: ScanEntity, key: string): string {
  return `braxon:${entity}:${key}`;
}

export function parseScan(text: string): ParsedScan | null {
  const raw = text.trim();
  if (!raw) return null;

  // Bare token: braxon:<entity>:<key>
  const token = /^braxon:([a-z]+):(.+)$/i.exec(raw);
  if (token && isEntity(token[1].toLowerCase())) {
    return { entity: token[1].toLowerCase() as ScanEntity, key: token[2].trim() };
  }

  // URL: <scheme>://<host>[:port]/s/<pcId>/<entity>/<key>[?label=…]
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const seg = url.pathname.split('/').filter(Boolean);
  if (seg.length === 4 && seg[0] === 's') {
    const entity = decodeURIComponent(seg[2]).toLowerCase();
    const key = decodeURIComponent(seg[3]).trim();
    if (isEntity(entity) && key) {
      return {
        entity,
        key,
        pcId: decodeURIComponent(seg[1]).trim() || undefined,
        label: url.searchParams.get('label') || undefined,
      };
    }
  }
  return null;
}

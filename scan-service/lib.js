// Pure helpers for the BRAXON scan service — no `pg`, no `http`, no sockets,
// so they can be unit-tested (scan-service/lib.test.js) without a database or
// a listening server. server.js imports these; the wire behaviour is
// identical to the original single-file version.

export const ENTITIES = new Set(['job', 'abs', 'stock']);
export const ENTITY_LABEL = { job: 'Job', abs: 'ABS reference', stock: 'Stock item' };
export const KEY_MAX = 128;
export const LABEL_MAX = 200;

/** HTML-escape the five markup-significant characters. */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Validate + normalise a scan request from either the POST body or the GET
 *  path. `lowerEntity` mirrors the GET route, which lower-cases the entity
 *  segment; the POST route takes it verbatim. Returns
 *  `{ ok: true, value }` with trimmed/clamped fields, or `{ ok: false }`. */
export function parseScanRequest({ pcId, entity, key, label, source } = {}, { lowerEntity = false, defaultSource = 'phone' } = {}) {
  const p = String(pcId || '').trim();
  let e = String(entity || '').trim();
  if (lowerEntity) e = e.toLowerCase();
  const k = String(key || '').trim();
  if (!p || !ENTITIES.has(e) || !k || k.length > KEY_MAX) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      pcId: p,
      entity: e,
      key: k,
      label: String(label || '').slice(0, LABEL_MAX),
      source: String(source || defaultSource).slice(0, 32),
    },
  };
}

/** Parse `GET /s/<pcId>/<entity>/<key>?label=&src=` into a validated scan
 *  request. Returns `{ ok:false }` for the wrong path shape or bad fields. */
export function parseScanPath(pathname, searchParams = new URLSearchParams()) {
  const parts = String(pathname).split('/').filter(Boolean);
  if (parts[0] !== 's' || parts.length !== 4) return { ok: false };
  return parseScanRequest(
    {
      pcId: safeDecode(parts[1]),
      entity: safeDecode(parts[2]),
      key: safeDecode(parts[3]),
      label: searchParams.get('label') || '',
      source: searchParams.get('src') || 'phone',
    },
    { lowerEntity: true },
  );
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The confirmation / error HTML page shown to the phone. */
export function page({ title, accent, heading, lines }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
         background:#0b0b0c; color:#f5f5f7; padding:24px; }
  .card { max-width:340px; width:100%; text-align:center; background:#1c1c1e;
          border:1px solid #2c2c2f; border-radius:20px; padding:32px 24px; }
  .badge { width:64px; height:64px; border-radius:50%; margin:0 auto 18px;
           display:flex; align-items:center; justify-content:center; font-size:32px;
           background:${accent}22; color:${accent}; border:1px solid ${accent}55; }
  h1 { font-size:19px; margin:0 0 6px; }
  p { margin:2px 0; color:#a1a1a6; font-size:14px; }
  .key { color:#f5f5f7; font-weight:600; word-break:break-all; }
  .hint { margin-top:16px; font-size:12px; color:#6e6e73; }
</style></head><body><div class="card">
  <div class="badge">${heading.icon}</div>
  <h1>${esc(heading.text)}</h1>
  ${lines.map((l) => `<p${l.strong ? ' class="key"' : ''}>${esc(l.text)}</p>`).join('')}
  <div class="hint">You can put your phone away.</div>
</div></body></html>`;
}

/** Build the confirmation page lines for a successful scan. */
export function confirmationLines(entity, label, key, { known, online, hostname }) {
  const lines = [
    { text: `${ENTITY_LABEL[entity]}${label ? '' : ':'}`, strong: false },
    { text: label || key, strong: true },
  ];
  if (!known) {
    lines.push({ text: 'That bench PC has never registered — check the pc_id.' });
  } else if (!online) {
    lines.push({ text: `${hostname} is offline right now — it will open when BRAXON reconnects.` });
  }
  return lines;
}

// BRAXON scan service — the one HTTP endpoint a phone talks to.
//
// A QR code printed by BRAXON encodes:
//     https://<this-host>:<port>/s/<pcId>/<entity>/<key>?label=<text>
//
// A phone's stock camera opens that URL. This service writes one row into
// Postgres ("BraxonScanInbox") addressed to <pcId>; the BRAXON desktop app
// on that machine polls the table (src-tauri/src/scan_inbox.rs) and opens
// the job. The phone just sees a "sent" confirmation.
//
// Runs on the Ubuntu box next to Postgres. Single file, one dependency
// (`pg`). See README.md for deployment.

import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { page, parseScanRequest, parseScanPath, confirmationLines } from './lib.js';

const {
  PGHOST = '127.0.0.1',
  PGPORT = '5432',
  PGDATABASE,
  PGUSER,
  PGPASSWORD,
  SCAN_PORT = '8481',
  SCAN_BIND = '0.0.0.0',
  SCAN_TLS = 'on',
  SCAN_TLS_CERT = '/etc/braxon-scan/cert.pem',
  SCAN_TLS_KEY = '/etc/braxon-scan/key.pem',
} = process.env;

const pool = new pg.Pool({
  host: PGHOST,
  port: Number(PGPORT),
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
  max: 4,
  idleTimeoutMillis: 30_000,
});

// Same schema as src-tauri/src/client_registry.rs's ensure_scan_tables —
// whichever process (this service, or any BRAXON client) reaches Postgres
// first creates it; every statement is idempotent.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS "BraxonClient" (
    pc_id       TEXT PRIMARY KEY,
    hostname    TEXT,
    os_user     TEXT,
    app_version TEXT,
    first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "BraxonScanInbox" (
    id          BIGSERIAL PRIMARY KEY,
    pc_id       TEXT NOT NULL,
    entity      TEXT NOT NULL,
    key         TEXT NOT NULL,
    label       TEXT,
    source      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "BraxonScanInbox_pending_idx"
    ON "BraxonScanInbox" (pc_id, created_at) WHERE consumed_at IS NULL;
`;

async function init() {
  await pool.query(SCHEMA);
  // Housekeeping — the desktop app marks rows consumed but never deletes
  // them; keep two days of history for debugging, drop the rest.
  setInterval(() => {
    pool
      .query(`DELETE FROM "BraxonScanInbox" WHERE created_at < now() - interval '2 days'`)
      .catch((e) => console.error('[cleanup]', e.message));
  }, 60 * 60 * 1000).unref();
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

async function recordScan({ pcId, entity, key, label, source }) {
  const client = await pool.query(
    `SELECT hostname, (last_seen > now() - interval '2 minutes') AS online
       FROM "BraxonClient" WHERE pc_id = $1`,
    [pcId],
  );
  await pool.query(
    `INSERT INTO "BraxonScanInbox" (pc_id, entity, key, label, source)
     VALUES ($1, $2, $3, $4, $5)`,
    [pcId, entity, key, label || null, source || 'phone'],
  );
  const row = client.rows[0];
  return { hostname: row?.hostname || null, online: row?.online ?? false, known: !!row };
}

const server = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && parts.length === 0) {
      return send(res, 200, 'BRAXON scan service\n', 'text/plain');
    }
    if (req.method === 'GET' && parts[0] === 'healthz') {
      await pool.query('SELECT 1');
      return send(res, 200, 'ok\n', 'text/plain');
    }

    // POST /s   { pcId, entity, key, label?, source? }
    if (req.method === 'POST' && parts[0] === 's' && parts.length === 1) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        return send(res, 400, JSON.stringify({ error: 'bad json' }), 'application/json');
      }
      const parsed = parseScanRequest(body, { defaultSource: 'manual' });
      if (!parsed.ok) {
        return send(res, 400, JSON.stringify({ error: 'invalid' }), 'application/json');
      }
      const { pcId, entity, key } = parsed.value;
      const r = await recordScan(parsed.value);
      console.log(`[scan] POST ${entity}/${key} -> ${pcId} (${r.hostname || '?'}, online=${r.online})`);
      return send(res, 200, JSON.stringify({ ok: true, ...r }), 'application/json');
    }

    // GET /s/<pcId>/<entity>/<key>
    if (req.method === 'GET' && parts[0] === 's' && parts.length === 4) {
      const parsed = parseScanPath(url.pathname, url.searchParams);
      if (!parsed.ok) {
        return send(res, 400, page({
          title: 'BRAXON — invalid code',
          accent: '#ff453a',
          heading: { icon: '!', text: 'That code looks wrong' },
          lines: [{ text: 'The scanned link is missing a machine, type, or reference.' }],
        }));
      }
      const { pcId, entity, key, label } = parsed.value;

      const r = await recordScan(parsed.value);
      console.log(`[scan] GET ${entity}/${key} -> ${pcId} (${r.hostname || '?'}, online=${r.online})`);

      const target = r.hostname ? `Opening on ${r.hostname}` : 'Sent to BRAXON';
      const lines = confirmationLines(entity, label, key, r);
      return send(res, 200, page({
        title: 'BRAXON — sent',
        accent: r.online || !r.known ? '#30d158' : '#ff9f0a',
        heading: { icon: r.online ? '✓' : '↑', text: target },
        lines,
      }));
    }

    return send(res, 404, 'not found\n', 'text/plain');
  } catch (e) {
    console.error('[error]', e);
    return send(res, 500, 'internal error\n', 'text/plain');
  }
};

await init();

const listener =
  SCAN_TLS === 'on'
    ? https.createServer(
        { cert: readFileSync(SCAN_TLS_CERT), key: readFileSync(SCAN_TLS_KEY) },
        (req, res) => { server(req, res); },
      )
    : http.createServer((req, res) => { server(req, res); });

listener.listen(Number(SCAN_PORT), SCAN_BIND, () => {
  console.log(
    `[braxon-scan] ${SCAN_TLS === 'on' ? 'https' : 'http'}://${SCAN_BIND}:${SCAN_PORT}  (db ${PGHOST}:${PGPORT}/${PGDATABASE})`,
  );
});

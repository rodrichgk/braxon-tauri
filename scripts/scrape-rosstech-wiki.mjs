#!/usr/bin/env node
/**
 * scrape-rosstech-wiki.mjs — pull the Ross-Tech Wiki `Category:Fault_Codes`
 * (~1000 curated VAG 5-digit fault codes, with causes / solutions / notes) into
 * `EcuDtc` under `ecu_file = 'VAG_WIKI'`.
 *
 * This is the authoritative free structured set. OpenVAG's 995-row SQLite is a
 * scrape of the exact same wiki category — going to the source directly gets
 * fresher data, our own parsing, and the causes/solutions/notes intact.
 *
 * Internal workshop reference only — do not redistribute the extracted text.
 * The curated ABS subset in `ecu_file = 'VAG_ABS'` (48 rows, hand-enriched with
 * shop notes) is left untouched; `resolve_dtcs` sorts `VAG_ABS` ahead of
 * `VAG_WIKI` so those enrichments still win on a cross-unit match.
 *
 *   node scripts/scrape-rosstech-wiki.mjs             # scrape + upsert
 *   node scripts/scrape-rosstech-wiki.mjs --dry       # parse + print, no DB
 *   node scripts/scrape-rosstech-wiki.mjs --limit 30  # first 30 codes (test)
 *   node scripts/scrape-rosstech-wiki.mjs --wipe      # delete VAG_WIKI rows first
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const API = 'https://wiki.ross-tech.com/wiki/api.php';
const UA = 'BRAXON/1.0 (internal workshop diagnostic reference)';
const DB_CONFIG = 'C:/Users/Gabhy Kiba/AppData/Roaming/braxon/db_config.json';

// The category holds two kinds of page:
//   plain 5-digit  "01130"                    → KWP-era VAG-specific, no SAE code
//   combined       "16486/P0102/000258"       → <5-digit>/<P|C|U-code>/<SAE 2-byte dec>
//   bare UDS       "U1122"                     → SAE code only
// They use incompatible numbering (a VAG 5-digit and an SAE 2-byte value overlap
// in 0..16383), so they go to separate ecu_files keyed differently:
//   VAG_WIKI      dtc_raw = 5-digit int   (matches a VCDS-printout lookup)
//   VAG_WIKI_UDS  dtc_raw = SAE 2-byte    (matches a live BRAXON 19 02 scan)
const BUCKETS = {
  plain: { ecuFile: 'VAG_WIKI', ecuName: 'VAG 5-digit (Ross-Tech Wiki)' },
  uds: { ecuFile: 'VAG_WIKI_UDS', ecuName: 'OBD/VAG (Ross-Tech Wiki)' },
};

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const WIPE = args.includes('--wipe');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    } catch (e) {
      if (attempt >= 4) throw e;
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) return res.json();
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`API ${res.status} ${res.statusText} for ${url}`);
    }
    await sleep(2000 * attempt);
  }
}

/** Enumerate the category → [{ pageid, title }]. */
async function listCategory() {
  const out = [];
  let cont;
  do {
    const j = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: 'Category:Fault_Codes',
      cmlimit: '500',
      cmtype: 'page',
      ...(cont || {}),
    });
    for (const m of j.query.categorymembers) out.push({ pageid: m.pageid, title: m.title });
    cont = j.continue;
    await sleep(300);
  } while (cont);
  return out;
}

/** Wikitext for up to 50 pageids at once → Map<pageid, { title, wikitext }>. */
async function fetchContent(pageids) {
  const j = await api({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    pageids: pageids.join('|'),
  });
  const map = new Map();
  for (const p of j.query.pages) {
    const wt = p.revisions?.[0]?.slots?.main?.content;
    if (wt) map.set(String(p.pageid), { title: p.title, wikitext: wt });
  }
  return map;
}

function stripMarkup(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1')
    .replace(/\[https?:\/\/\S+\]/g, '')
    .replace(/'''?/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** SAE/ISO 2-byte value for a "P0102" / "U1122" display code. */
function saePack(disp) {
  const cat = { P: 0, C: 1, B: 2, U: 3 }[disp[0].toUpperCase()];
  const d1 = parseInt(disp[1], 16);
  const d2 = parseInt(disp[2], 16);
  const d3 = parseInt(disp[3], 16);
  const d4 = parseInt(disp[4], 16);
  return (((cat << 6) | (d1 << 4) | d2) << 8) | ((d3 << 4) | d4);
}

/**
 * Turn a category-member title into { bucket, raw, code }.
 *  "01130"                → plain, raw 1130,  code "01130"
 *  "16486/P0102/000258"   → uds,   raw 258,   code "P0102"
 *  "U102F/053295"         → uds,   raw 53295, code "U102F"
 *  "16491/P0107"          → uds,   raw 263,   code "P0107"  (packed from the code)
 *  "U1122"                → uds,   raw 53538, code "U1122"
 */
function resolveKey(title) {
  const segs = title.split('/');
  let disp;
  for (const s of segs) {
    const m = s.match(/^([PCBU][0-9A-F]{4})(?![0-9A-Za-z])/i); // tolerate "P189A - Clutch 1: …" titles
    if (m) {
      disp = m[1].toUpperCase();
      break;
    }
  }
  const saeDec = segs.find((s) => /^\d{6}$/.test(s));
  const fiveDigit = segs.find((s) => /^\d{4,5}$/.test(s));
  if (disp) {
    const raw = saeDec ? parseInt(saeDec, 10) : saePack(disp);
    return { bucket: 'uds', raw, code: disp.toUpperCase() };
  }
  if (fiveDigit) return { bucket: 'plain', raw: parseInt(fiveDigit, 10), code: fiveDigit };
  return { bucket: 'plain', raw: NaN, code: title };
}

/** Bullet lines (`*`, `**`, …) following a heading, until the next heading. */
function collectBullets(lines, startIdx) {
  const out = [];
  for (let i = startIdx; i < lines.length; i++) {
    if (/^\s*={2,}/.test(lines[i])) break;
    const m = lines[i].match(/^\s*\*+\s*(.+)$/);
    if (m) {
      const t = stripMarkup(m[1]);
      if (t) out.push(t);
    }
  }
  return out;
}

const mkVariant = (subtitle = '') => ({ subtitle, symptoms: [], causes: [], solutions: [], notes: [] });

function parsePage(code, wikitext) {
  const lines = wikitext.split(/\r?\n/);
  let shortTitle = '';
  const variants = [];
  let cur = null;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = l.match(/^====\s*(.+?)\s*====\s*$/))) {
      const h = m[1].toLowerCase();
      const bullets = collectBullets(lines, i + 1);
      if (!cur) {
        cur = mkVariant();
        variants.push(cur);
      }
      if (h.includes('symptom')) cur.symptoms.push(...bullets);
      else if (h.includes('cause')) cur.causes.push(...bullets);
      else if (h.includes('solution')) cur.solutions.push(...bullets);
      else if (h.includes('note')) cur.notes.push(...bullets);
    } else if ((m = l.match(/^===\s*([^=].*?)\s*===\s*$/))) {
      const t = stripMarkup(m[1]);
      let sub = t;
      const colon = t.indexOf(': ');
      if (colon >= 0) sub = t.slice(colon + 2).trim();
      else {
        const dash = t.indexOf(' - ');
        if (dash >= 0) sub = t.slice(dash + 3).trim();
      }
      cur = mkVariant(sub);
      variants.push(cur);
    } else if ((m = l.match(/^==\s*([^=].*?)\s*==\s*$/))) {
      const t = stripMarkup(m[1]);
      const dash = t.indexOf(' - ');
      shortTitle = dash >= 0 ? t.slice(dash + 3).trim() : t.replace(/^[\dPCBU][\w/]*\s*-?\s*/, '').trim();
    }
  }
  return { code, shortTitle, variants };
}

function buildDescription({ shortTitle, variants }) {
  const base = shortTitle || '(no title)';
  const subs = [...new Set(variants.map((v) => v.subtitle).filter(Boolean))]
    .filter((s) => s.toLowerCase() !== base.toLowerCase());
  const symptoms = [...new Set(variants.flatMap((v) => v.symptoms))];
  const causes = [...new Set(variants.flatMap((v) => v.causes))];
  const sol = [...new Set(variants.flatMap((v) => v.solutions))];
  const notes = [...new Set(variants.flatMap((v) => v.notes))];

  let d = base;
  if (subs.length) d += ` — ${subs.join('; ')}`;
  if (symptoms.length) d += `  ·  Symptoms: ${symptoms.slice(0, 5).join('; ')}`;
  if (causes.length) d += `  ·  Causes: ${causes.slice(0, 8).join('; ')}`;
  if (sol.length) d += `  ·  Fix: ${sol.slice(0, 6).join('; ')}`;
  if (notes.length) d += `  ·  Note: ${notes.join(' ')}`;
  if (d.length > 1000) d = `${d.slice(0, 997)}…`;
  return d;
}

async function main() {
  console.log('[wiki] enumerating Category:Fault_Codes …');
  let members = await listCategory();
  members.sort((a, b) => a.title.localeCompare(b.title));
  if (LIMIT !== Infinity) members = members.slice(0, LIMIT);
  console.log(`[wiki] ${members.length} pages`);

  const rows = []; // { bucket, raw, code, pageTitle, desc }
  const skipped = [];
  for (let i = 0; i < members.length; i += 50) {
    const chunk = members.slice(i, i + 50);
    const content = await fetchContent(chunk.map((m) => m.pageid));
    for (const m of chunk) {
      const c = content.get(String(m.pageid));
      if (!c) {
        skipped.push(`${m.title}(no content)`);
        continue;
      }
      const parsed = parsePage(m.title, c.wikitext);
      if (!parsed.shortTitle && parsed.variants.length === 0) {
        skipped.push(`${m.title}(unparsed)`);
        continue;
      }
      const key = resolveKey(m.title);
      if (!Number.isFinite(key.raw)) {
        skipped.push(`${m.title}(no key)`);
        continue;
      }
      rows.push({ bucket: key.bucket, raw: key.raw, code: key.code, pageTitle: m.title, desc: buildDescription(parsed) });
    }
    process.stdout.write(`\r[wiki] parsed ${Math.min(i + 50, members.length)}/${members.length}`);
    await sleep(700);
  }
  console.log('');

  // Collapse raw collisions within a bucket (curated wiki → rare); keep the first.
  const seen = new Set();
  const deduped = [];
  const collisions = [];
  for (const r of rows) {
    const k = `${r.bucket}:${r.raw}`;
    if (seen.has(k)) {
      collisions.push(`${r.pageTitle}→${r.bucket}:${r.raw}`);
      continue;
    }
    seen.add(k);
    deduped.push(r);
  }

  const byBucket = (b) => deduped.filter((r) => r.bucket === b);
  console.log(`[wiki] plain(VAG_WIKI)=${byBucket('plain').length}  uds(VAG_WIKI_UDS)=${byBucket('uds').length}  skipped=${skipped.length}  collisions=${collisions.length}`);

  if (DRY) {
    for (const b of ['plain', 'uds']) {
      console.log(`\n--- ${BUCKETS[b].ecuFile} (first 15) ---`);
      for (const r of byBucket(b).slice(0, 15)) console.log(`  ${String(r.raw).padStart(6)} ${r.code.padEnd(7)} ${r.desc.slice(0, 150)}`);
    }
    if (skipped.length) console.log('\nskipped:', skipped.slice(0, 50).join(', '));
    if (collisions.length) console.log('collisions:', collisions.slice(0, 30).join(', '));
    return;
  }

  const cfg = JSON.parse(readFileSync(DB_CONFIG, 'utf8'));
  const client = new pg.Client({
    host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.username, password: cfg.password,
  });
  await client.connect();
  try {
    if (WIPE) {
      const d = await client.query('DELETE FROM "EcuDtc" WHERE ecu_file = ANY($1)', [Object.values(BUCKETS).map((x) => x.ecuFile)]);
      console.log(`[db] wiped ${d.rowCount} existing rows`);
    }
    let up = 0;
    const BATCH = 200;
    for (const b of ['plain', 'uds']) {
      const { ecuFile, ecuName } = BUCKETS[b];
      const brows = byBucket(b);
      for (let i = 0; i < brows.length; i += BATCH) {
        const chunk = brows.slice(i, i + BATCH);
        const vals = [];
        const ph = chunk
          .map((r, k) => {
            const p = k * 8;
            vals.push(randomUUID(), ecuName, ecuFile, 'KWP2000', r.raw, r.code, r.desc, 0);
            return `($${p + 1},$${p + 2},$${p + 3},$${p + 4},$${p + 5},$${p + 6},$${p + 7},$${p + 8})`;
          })
          .join(',');
        const res = await client.query(
          `INSERT INTO "EcuDtc" (id, ecu_name, ecu_file, protocol, dtc_raw, dtc_code, description, dtc_type)
           VALUES ${ph}
           ON CONFLICT (ecu_file, dtc_raw) DO UPDATE SET
             dtc_code = EXCLUDED.dtc_code, description = EXCLUDED.description, ecu_name = EXCLUDED.ecu_name`,
          vals,
        );
        up += res.rowCount;
      }
    }
    console.log(`[db] upserted ${up} rows across ${Object.values(BUCKETS).map((x) => x.ecuFile).join(' + ')}`);
    console.log(`[db] EcuDtc total now ${(await client.query('SELECT count(*)::int n FROM "EcuDtc"')).rows[0].n}`);
    if (skipped.length) console.log(`[wiki] ${skipped.length} skipped: ${skipped.slice(0, 50).join(', ')}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

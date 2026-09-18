#!/usr/bin/env node
// Produce a BRAXON `AppUser.password_hash` value for a given plaintext.
// Matches `hash_password` in src-tauri/src/commands.rs exactly:
//   "$sha256v2$<salt>$<hex(sha256(salt_bytes ++ password_bytes))>"
// The salt is any string; the Rust side generates a UUIDv4 but `verify_password`
// treats it as opaque, so we do the same.
//
//   node scripts/hash-app-password.mjs '<new password>' [--name maciej]
//
// Prints the hash and a ready-to-run UPDATE for the "AppUser" table.

import { createHash, randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const password = args.find((a) => !a.startsWith('--'));
const nameIdx = args.indexOf('--name');
const name = nameIdx >= 0 ? args[nameIdx + 1] : null;

if (!password) {
  console.error("usage: node scripts/hash-app-password.mjs '<password>' [--name <user>]");
  process.exit(1);
}

const salt = randomUUID();
const digest = createHash('sha256')
  .update(Buffer.from(salt, 'utf8'))
  .update(Buffer.from(password, 'utf8'))
  .digest('hex');
const hash = `$sha256v2$${salt}$${digest}`;

console.log('password_hash:');
console.log(hash);
console.log();
if (name) {
  console.log('-- run against the BRAXON Postgres:');
  console.log(`UPDATE "AppUser" SET password_hash = '${hash}' WHERE name = '${name.replace(/'/g, "''")}';`);
} else {
  console.log('-- run against the BRAXON Postgres (set the name):');
  console.log(`UPDATE "AppUser" SET password_hash = '${hash}' WHERE name = '<user>';`);
}

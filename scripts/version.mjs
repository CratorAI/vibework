// package.json is authoritative; Cargo requires a literal mirrored version.
import fs from 'node:fs';
const version = JSON.parse(fs.readFileSync('package.json')).version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw Error('Invalid version');
const path = 'src-tauri/Cargo.toml';
const old = fs.readFileSync(path, 'utf8');
const next = old.replace(/^version = ".*"/m, `version = "${version}"`);
if (process.argv.includes('--check')) { if (old !== next) throw Error('Run node scripts/version.mjs'); }
else fs.writeFileSync(path, next);

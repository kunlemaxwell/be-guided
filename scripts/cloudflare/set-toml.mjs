// Sets one value in wrangler.toml without disturbing the rest of the file:
//   node scripts/cloudflare/set-toml.mjs database_id <uuid>
//   node scripts/cloudflare/set-toml.mjs SITE_URL https://example.pages.dev
// Replaces the first `KEY = "..."` line (keeping its trailing comment),
// un-comments `# KEY = "..."` if that is all there is, or adds the key under
// [vars]. Prints "changed" or "unchanged" so callers know whether to redeploy.
import fs from 'node:fs';
import path from 'node:path';

const [key, value] = process.argv.slice(2);
if (!key || value === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /["\n\r\\]/.test(value)) {
  console.error('usage: set-toml.mjs KEY VALUE (value without quotes or new lines)');
  process.exit(2);
}
const file = path.resolve(process.argv[4] ?? 'wrangler.toml');
const lines = fs.readFileSync(file, 'utf8').split('\n');
const live = new RegExp(`^(\\s*${key}\\s*=\\s*)"[^"]*"(.*)$`);
const commented = new RegExp(`^\\s*#\\s*${key}\\s*=\\s*"[^"]*"`);
let i = lines.findIndex((l) => live.test(l));
let next;
if (i >= 0) {
  next = lines[i].replace(live, (_, head, tail) => `${head}"${value}"${tail}`);
} else {
  i = lines.findIndex((l) => commented.test(l));
  if (i < 0) {
    const vars = lines.findIndex((l) => l.trim() === '[vars]');
    if (vars < 0) throw new Error('wrangler.toml has no [vars] section');
    lines.splice(vars + 1, 0, '');
    i = vars + 1;
  }
  next = `${key} = "${value}"`;
}
if (lines[i] === next) {
  console.log('unchanged');
} else {
  lines[i] = next;
  fs.writeFileSync(file, lines.join('\n'));
  console.log('changed');
}

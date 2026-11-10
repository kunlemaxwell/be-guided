// Copies every content/products/<product>/<module>/images/* file into
// public/_content/... so the static site can serve them. Runs before dev and
// build. Images are compressed by scripts/annotate.mjs when they are marked up.
import fs from 'node:fs';
import path from 'node:path';

const contentDir = path.resolve(process.env.CONTENT_DIR ?? './content');
const outDir = path.resolve('public/_content');

// Copy over the top (no delete first) so it also works where deleting is
// restricted; stale files are harmless and vanish on a clean build.
let count = 0;
const productsDir = path.join(contentDir, 'products');
if (fs.existsSync(productsDir)) {
  for (const product of fs.readdirSync(productsDir)) {
    const pDir = path.join(productsDir, product);
    if (!fs.statSync(pDir).isDirectory()) continue;
    for (const mod of fs.readdirSync(pDir)) {
      // images/ = marked-up screenshots, media/ = walkthrough videos + posters
      for (const kind of ['images', 'media']) {
        const srcDir = path.join(pDir, mod, kind);
        if (!fs.existsSync(srcDir)) continue;
        const dest = path.join(outDir, product, mod, kind);
        fs.mkdirSync(dest, { recursive: true });
        for (const f of fs.readdirSync(srcDir)) {
          const from = path.join(srcDir, f);
          const to = path.join(dest, f);
          // skip unchanged files (videos are large)
          if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size && fs.statSync(to).mtimeMs >= fs.statSync(from).mtimeMs) continue;
          fs.copyFileSync(from, to);
          count++;
        }
      }
    }
  }
}
console.log(`sync-assets: ${count} file(s) copied`);

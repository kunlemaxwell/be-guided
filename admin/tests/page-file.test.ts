import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { joinPageFile, splitPageFile, updateFrontmatter } from '../../backend/src/domain/page-file';

const CONTENT = path.resolve(__dirname, '../../backend/tests/fixtures/content/products');

function pages(): string[] {
  const out: string[] = [];
  for (const product of fs.readdirSync(CONTENT)) {
    const pdir = path.join(CONTENT, product);
    if (!fs.statSync(pdir).isDirectory()) continue;
    for (const mod of fs.readdirSync(pdir)) {
      const mdir = path.join(pdir, mod);
      if (!fs.statSync(mdir).isDirectory()) continue;
      for (const f of fs.readdirSync(mdir)) if (f.endsWith('.md')) out.push(path.join(mdir, f));
    }
  }
  return out;
}

describe('page files', () => {
  for (const file of pages()) {
    it(`saving ${path.basename(file)} without changes keeps it byte-identical`, () => {
      const text = fs.readFileSync(file, 'utf8');
      const parts = splitPageFile(text);
      const fm = updateFrontmatter(parts.frontmatterSource, structuredClone(parts.frontmatter));
      expect(joinPageFile(fm, parts.body)).toBe(text);
    });
  }

  it('keeps dates as plain strings', () => {
    const { frontmatter } = splitPageFile('---\ntitle: A\nupdated: 2026-11-03\n---\n\nBody\n');
    expect(frontmatter.updated).toBe('2026-11-03');
  });

  it('changes only the fields that changed', () => {
    const src = 'title: "Quoted"   # keep me\nsummary: S\nupdated: 2026-01-01\n';
    const out = updateFrontmatter(src, { title: 'Quoted', summary: 'S', updated: '2026-11-03', status: 'draft' });
    expect(out).toContain('title: "Quoted" # keep me');
    expect(out).toContain('updated: 2026-11-03');
    expect(out).toContain('status: draft');
  });

  it('removes fields that were cleared', () => {
    const out = updateFrontmatter('title: A\naudience: Everyone\n', { title: 'A' });
    expect(out).not.toContain('audience');
  });

  it('writes a new page', () => {
    const fm = updateFrontmatter('', { title: 'New', summary: 'S', updated: '2026-11-03', status: 'draft', author: 'human', order: 10 });
    expect(joinPageFile(fm, '')).toBe('---\ntitle: New\nsummary: S\nupdated: 2026-11-03\nstatus: draft\nauthor: human\norder: 10\n---\n');
  });
});

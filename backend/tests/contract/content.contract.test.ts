import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LibraryDto, PageDetailDto, PageSummary, ProductJson, SavePageResult } from '../../../admin/shared/api-types';
import { dataOf, IN_PROCESS, localHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await localHarness();
});
afterAll(() => h.cleanup());

const PAGE = '/api/v1/pages/acme-books/sales/add-a-customer';

describe('library', () => {
  it('lists products → modules → pages with badges, author names and visibility', async () => {
    const lib = dataOf<LibraryDto>(await h.api.get('/api/v1/library'));
    const sales = lib.products.find((p) => p.slug === 'acme-books')?.modules.find((m) => m.slug === 'sales');
    const invoice = sales?.pages.find((p) => p.slug === 'create-an-invoice');
    expect(invoice).toMatchObject({ id: 'acme-books/sales/create-an-invoice', visibility: 'public', badges: { text: true, screenshots: true } });
    expect(typeof invoice?.authorName).toBe('string');
    expect(invoice?.authorName).not.toBe('claude');
  });
});

describe('products and modules', () => {
  it('creates a product (private, coming soon) and refuses a duplicate', async () => {
    const r = await h.api.post('/api/v1/products', { slug: 'payroll-app', name: 'Payroll', summary: 'Pay people.' });
    expect(r.status).toBe(201);
    expect(dataOf<ProductJson>(r)).toMatchObject({ name: 'Payroll', visibility: 'private', status: 'coming-soon' });
    const again = await h.api.post('/api/v1/products', { slug: 'payroll-app', name: 'Payroll', summary: 'Pay people.' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_EXISTS');
  });

  it('validates new products field by field', async () => {
    const r = await h.api.post('/api/v1/products', { slug: 'Bad Slug!', name: '', summary: 'x' });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('INVALID');
    expect(r.body.issues?.map((i) => i.field).sort()).toEqual(['name', 'slug']);
  });

  it('saves a product, keeps unknown fields, stores a repo localPath, and validates it', async () => {
    const lib = dataOf<LibraryDto>(await h.api.get('/api/v1/library'));
    const meta = lib.products.find((p) => p.slug === 'acme-books')!.meta;
    const repos = [{ url: 'your-org/your-app', branch: 'main', paths: ['src/app'], localPath: '/Users/test/code/frontend' }];
    const r = await h.api.put('/api/v1/products/acme-books', { ...meta, source: { repos }, visibility: 'private' });
    expect(r.status).toBe(200);
    expect(dataOf<ProductJson>(r)).toMatchObject({ visibility: 'private', source: { repos } });
    const bad = await h.api.put('/api/v1/products/acme-books', { ...meta, source: { repos: [{ ...repos[0], localPath: 'relative/path' }] } });
    expect(bad.status).toBe(422);
    expect(bad.body.issues?.[0]?.field).toBe('source.repos.0.localPath');
    const badVis = await h.api.put('/api/v1/products/acme-books', { ...meta, visibility: 'secret' });
    expect(badVis.status).toBe(422);
    await h.api.put('/api/v1/products/acme-books', meta);
  });

  it('404s an unknown product and 400s an unsafe one', async () => {
    expect((await h.api.put('/api/v1/products/nope', { name: 'x', summary: 'y', visibility: 'public' })).status).toBe(404);
    const bad = await h.api.put(`/api/v1/products/${encodeURIComponent('../content')}`, { name: 'x', summary: 'y', visibility: 'public' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('BAD_PATH');
  });

  it('creates and saves a module', async () => {
    const r = await h.api.post('/api/v1/products/acme-books/modules', { slug: 'payroll', title: 'Payroll', summary: 'Pay people.', group: 'run' });
    expect(r.status).toBe(201);
    const s = await h.api.put('/api/v1/products/acme-books/modules/payroll', { title: 'Payroll & pay', summary: 'Pay people.', group: 'run', order: 5 });
    expect(dataOf<{ title: string }>(s).title).toBe('Payroll & pay');
    expect((await h.api.post('/api/v1/products/acme-books/modules', { slug: 'payroll', title: 'P', summary: 'S', group: 'run' })).status).toBe(409);
    expect((await h.api.post('/api/v1/products/acme-books/modules', { slug: 'x', title: 'P', summary: 'S', group: 'nope' })).status).toBe(422);
    expect((await h.api.put('/api/v1/products/acme-books/modules/payroll', { title: '', summary: 'S' })).status).toBe(422);
  });
});

describe('pages', () => {
  it('gets a page for the editor with images and media lists', async () => {
    const p = dataOf<PageDetailDto>(await h.api.get(PAGE));
    expect(p.id).toBe('acme-books/sales/add-a-customer');
    expect(p.frontmatter.title).toBeTruthy();
    expect(Array.isArray(p.images)).toBe(true);
    expect(Array.isArray(p.media)).toBe(true);
    expect(p.siteUrl).toMatch(/\/acme-books\/sales\/add-a-customer\/$/);
  });

  it('saves a page with an author and visibility, and returns the revision id', async () => {
    const p = dataOf<PageDetailDto>(await h.api.get(PAGE));
    const r = await h.api.put(PAGE, { frontmatter: { ...p.frontmatter, author: 'Site Owner', visibility: 'private' }, body: `${p.body}\n\nA new line.` });
    expect(r.status).toBe(200);
    const saved = dataOf<SavePageResult>(r);
    expect(saved.revisionId).toBeTruthy();
    const lib = dataOf<LibraryDto>(await h.api.get('/api/v1/library'));
    const summary = lib.products[0]!.modules.flatMap((m) => m.pages).find((x) => x.slug === 'add-a-customer') as PageSummary;
    expect(summary).toMatchObject({ authorName: 'Site Owner', visibility: 'private' });
  });

  it('refuses invalid page details with field issues', async () => {
    const p = dataOf<PageDetailDto>(await h.api.get(PAGE));
    const r = await h.api.put(PAGE, { frontmatter: { ...p.frontmatter, title: '', visibility: 'hidden' }, body: p.body });
    expect(r.status).toBe(422);
    expect(r.body.issues?.map((i) => i.field).sort()).toEqual(['title', 'visibility']);
    const noBody = await h.api.put(PAGE, { frontmatter: p.frontmatter });
    expect(noBody.status).toBe(422);
    const emptyAuthor = await h.api.put(PAGE, { frontmatter: { ...p.frontmatter, author: '   ' }, body: p.body });
    expect(emptyAuthor.status).toBe(422);
  });

  it('refuses path traversal in page addresses', async () => {
    for (const bad of [`/api/v1/pages/acme-books/sales/${encodeURIComponent('../../site')}`, `/api/v1/pages/${encodeURIComponent('../x')}/sales/x`, `/api/v1/pages/acme-books/${encodeURIComponent('sales\\..')}/x`]) {
      const r = await h.api.get(bad);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('BAD_PATH');
    }
    expect((await h.api.get('/api/v1/pages/acme-books/sales/no-such-page')).status).toBe(404);
    // A bare ".." segment is resolved by URL parsing before routing: it can only reach another API address.
    expect((await h.api.get('/api/v1/pages/acme-books/../../../../etc/passwd')).status).toBe(404);
  });

  it('creates a draft page and refuses a duplicate', async () => {
    const r = await h.api.post('/api/v1/products/acme-books/modules/sales/pages', { slug: 'issue-a-refund', title: 'Issue a refund', summary: 'Give money back.' });
    expect(r.status).toBe(201);
    const page = dataOf<PageSummary>(r);
    expect(page).toMatchObject({ status: 'draft', visibility: 'public' });
    expect(page.authorName).toBe('Site Owner');
    expect((await h.api.post('/api/v1/products/acme-books/modules/sales/pages', { slug: 'issue-a-refund', title: 'X', summary: 'Y' })).status).toBe(409);
    expect((await h.api.post('/api/v1/products/acme-books/modules/nope/pages', { slug: 'a', title: 'X', summary: 'Y' })).status).toBe(404);
  });

  it('"remove from the site" makes a draft and never deletes the file', async () => {
    const r = await h.api.post(`${PAGE}/draft`);
    expect(r.status).toBe(200);
    expect(dataOf<PageDetailDto>(await h.api.get(PAGE)).frontmatter.status).toBe('draft');
    if (IN_PROCESS) expect(fs.existsSync(path.join(h.workspace!.contentDir, 'products/acme-books/sales/add-a-customer.md'))).toBe(true);
  });
});

describe('site settings', () => {
  it('saves the theme customizer and rejects bad values', async () => {
    const site = dataOf<Record<string, unknown>>(await h.api.get('/api/v1/site'));
    const themeCustom = { colors: { light: { accent: '#123456' } }, fontBody: 'Inter', radius: 6, shadow: 'soft' };
    const ok = await h.api.put('/api/v1/site', { ...site, themeCustom });
    expect(ok.status).toBe(200);
    expect(dataOf<Record<string, unknown>>(await h.api.get('/api/v1/site')).themeCustom).toEqual(themeCustom);
    for (const bad of [{ colors: { light: { accent: 'blue' } } }, { fontBody: 'Comic Sans' }, { radius: 99 }]) {
      const r = await h.api.put('/api/v1/site', { ...site, themeCustom: bad });
      expect(r.status).toBe(422);
      expect(r.body.code).toBe('INVALID');
    }
    expect((await h.api.put('/api/v1/site', { ...site, theme: 'neon' })).status).toBe(422);
  });
});

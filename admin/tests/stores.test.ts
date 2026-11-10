import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../backend/src/domain/errors';
import { splitPageFile } from '../../backend/src/domain/page-file';
import type { Services } from '../../backend/src/api/context';
import { localApp, TEST_CTX, tempWorkspace } from '../../backend/tests/helpers';

let ws: ReturnType<typeof tempWorkspace>;
let s: Services;

async function code(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return e instanceof AppError ? e.code : 'OTHER';
  }
}

beforeEach(async () => {
  ws = tempWorkspace();
  s = (await localApp(ws)).services;
});

afterEach(() => ws.cleanup());

describe('content service (local files)', () => {
  it('lists products, modules and pages with badges', async () => {
    const lib = await s.content.getLibrary();
    const acme = lib.products.find((p) => p.slug === 'acme-books');
    const invoice = acme?.modules.find((m) => m.slug === 'sales')?.pages.find((p) => p.slug === 'create-an-invoice');
    expect(invoice?.badges.text).toBe(true);
    expect(invoice?.badges.screenshots).toBe(true);
    // The test copy never includes media/, so the listed video is always "missing" here.
    expect(invoice?.badges.video).toBe('missing');
  });

  it('refuses paths outside the content folder', async () => {
    expect(await code(() => s.content.getPage('..', 'sales', 'x'))).toBe('BAD_PATH');
    expect(await code(() => s.content.getPage('acme-books', 'sales', '../../site'))).toBe('BAD_PATH');
    expect(await code(() => s.content.getFile('products/../site.json'))).toBe('BAD_PATH');
    expect(await code(() => s.content.getFile('products/acme-books/sales/create-an-invoice.md'))).toBe('BAD_PATH');
    expect(await code(() => s.content.getFile('/etc/passwd'))).toBe('BAD_PATH');
  });

  it('validates site settings with the site schema', async () => {
    expect(await code(() => s.content.saveSite(TEST_CTX, { siteName: 'X', theme: 'neon' }))).toBe('INVALID');
    const site = await s.content.getSite();
    await s.content.saveSite(TEST_CTX, { ...site, video: { display: 'expanded' } });
    expect((await s.content.getSite()).video).toEqual({ display: 'expanded' });
  });

  it('saves a page, sets today as updated, and rejects a missing title', async () => {
    const page = await s.content.getPage('acme-books', 'sales', 'add-a-customer');
    expect(await code(() => s.content.savePage(TEST_CTX, 'acme-books', 'sales', 'add-a-customer', { frontmatter: { ...page.frontmatter, title: '' }, body: page.body }))).toBe('INVALID');
    const r = await s.content.savePage(TEST_CTX, 'acme-books', 'sales', 'add-a-customer', { frontmatter: page.frontmatter, body: `${page.body}\n\nOne more line.` });
    expect(r.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const after = splitPageFile(fs.readFileSync(path.join(ws.contentDir, 'products/acme-books/sales/add-a-customer.md'), 'utf8'));
    expect(after.body.endsWith('One more line.')).toBe(true);
    expect(fs.readdirSync(path.join(ws.contentDir, 'products/acme-books/sales')).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('"removing" a page makes it a draft instead of deleting it', async () => {
    await s.content.markDraft(TEST_CTX, 'acme-books', 'sales', 'add-a-customer');
    const file = path.join(ws.contentDir, 'products/acme-books/sales/add-a-customer.md');
    expect(fs.existsSync(file)).toBe(true);
    expect(splitPageFile(fs.readFileSync(file, 'utf8')).frontmatter.status).toBe('draft');
  });

  it('creates modules and draft pages, and refuses duplicates', async () => {
    await s.content.createModule(TEST_CTX, 'acme-books', { slug: 'payroll', title: 'Payroll', summary: 'Pay people.', group: 'run' });
    const page = await s.content.createPage(TEST_CTX, 'acme-books', 'payroll', { slug: 'run-payroll', title: 'Run payroll', summary: 'Pay everyone.' });
    expect(page.status).toBe('draft');
    expect(page.author).toBe('human');
    expect(page.badges.text).toBe(false);
    expect(await code(() => s.content.createPage(TEST_CTX, 'acme-books', 'payroll', { slug: 'run-payroll', title: 'Again', summary: 'S' }))).toBe('ALREADY_EXISTS');
  });

  it('keeps product fields the form does not know about', async () => {
    const meta = (await s.content.getLibrary()).products.find((p) => p.slug === 'crm')?.meta;
    if (!meta) throw new Error('no crm');
    await s.content.saveProduct(TEST_CTX, 'crm', { ...meta, environments: { staging: { appUrl: 'https://crm.example.com' } } });
    expect(await code(() => s.content.saveProduct(TEST_CTX, 'crm', { ...meta, environments: { local: { appUrl: 'not a url' } } }))).toBe('INVALID');
  });
});

describe('request queue (local .admin files)', () => {
  it('queues, cancels, removes and records approvals', async () => {
    expect(await s.requests.list()).toEqual([]);
    const r = await s.requests.create(TEST_CTX, { type: 'check-updates', scope: { products: 'all' }, contentMode: 'text+screens' });
    expect(r.status).toBe('queued');
    expect(await code(() => s.requests.dismiss(TEST_CTX, r.id))).toBe('INVALID');
    await s.requests.cancel(TEST_CTX, r.id);
    await s.requests.dismiss(TEST_CTX, r.id);
    expect(await s.requests.list()).toEqual([]);

    const v = await s.requests.create(TEST_CTX, { type: 'make-video', scope: { products: ['acme-books'], pages: ['acme-books/sales/create-an-invoice'] }, contentMode: 'video' });
    fs.mkdirSync(path.join(ws.stateDir, 'proposals'), { recursive: true });
    fs.writeFileSync(path.join(ws.stateDir, 'proposals', `${v.id}.json`), JSON.stringify({ changes: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }));
    expect(await code(() => s.requests.approve(TEST_CTX, v.id, []))).toBe('INVALID');
    const approved = await s.requests.approve(TEST_CTX, v.id, ['b', 'zzz']);
    expect(approved.status).toBe('in-progress');
    expect(approved.proposal?.approved).toEqual(['b']);
    expect(await code(() => s.requests.cancel(TEST_CTX, '../../x'))).toBe('BAD_PATH');
    // The file format Claude reads is unchanged.
    const onDisk = JSON.parse(fs.readFileSync(path.join(ws.stateDir, 'requests.json'), 'utf8')) as { id: string }[];
    expect(onDisk.map((x) => x.id)).toEqual([v.id]);
  });
});

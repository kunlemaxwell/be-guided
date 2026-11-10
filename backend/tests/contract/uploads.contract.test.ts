import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditEntryDto, Paged, PageDetailDto, UploadResultDto } from '../../../admin/shared/api-types';
import { MAGIC } from '../magic-bytes';
import { dataOf, IN_PROCESS, localHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await localHarness();
});
afterAll(() => h.cleanup());

const UPLOAD = '/api/v1/products/acme-books/modules/sales/uploads';

function form(kind: string, name: string, bytes: Uint8Array, type = 'application/octet-stream'): FormData {
  const f = new FormData();
  f.set('kind', kind);
  f.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return f;
}

function padded(head: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set(head);
  return out;
}

describe('uploads ("Choose file…")', () => {
  it('saves a picture into images/ with a safe name and returns a clickable link', async () => {
    const r = await h.api.request(UPLOAD, { method: 'POST', form: form('image', 'My Screen Shot.PNG', padded(MAGIC.png, 2048)) });
    expect(r.status).toBe(201);
    const up = dataOf<UploadResultDto>(r);
    expect(up).toMatchObject({ src: 'images/my-screen-shot.png', name: 'my-screen-shot.png', size: 2048 });
    const file = await h.api.get(up.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
  });

  it('never overwrites: a second file with the same name gets a new name', async () => {
    const r = await h.api.request(UPLOAD, { method: 'POST', form: form('image', 'my-screen-shot.png', padded(MAGIC.png, 100)) });
    const up = dataOf<UploadResultDto>(r);
    expect(up).toMatchObject({ name: 'my-screen-shot-2.png', renamed: true });
    expect(r.body.message).toContain('my-screen-shot-2.png');
  });

  it('saves a video into media/ and the editor sees it', async () => {
    const up = dataOf<UploadResultDto>(await h.api.request(UPLOAD, { method: 'POST', form: form('video', 'walk.mp4', padded(MAGIC.mp4, 4096)) }));
    expect(up.src).toBe('media/walk.mp4');
    const page = dataOf<PageDetailDto>(await h.api.get('/api/v1/pages/acme-books/sales/create-an-invoice'));
    expect(page.media.map((m) => m.src)).toContain('media/walk.mp4');
  });

  it('refuses forged content, wrong kinds, SVG and empty files', async () => {
    const cases: [FormData, number, string][] = [
      [form('image', 'evil.png', new TextEncoder().encode('<html><script>alert(1)</script></html>')), 415, 'UNSUPPORTED_FILE'],
      [form('image', 'clip.mp4', padded(MAGIC.mp4, 100)), 415, 'UNSUPPORTED_FILE'],
      [form('image', 'logo.svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), 415, 'UNSUPPORTED_FILE'],
      [form('video', 'fake.mp4', padded(MAGIC.png, 100)), 415, 'UNSUPPORTED_FILE'],
      [form('image', 'empty.png', new Uint8Array()), 422, 'INVALID'],
      [form('document', 'a.pdf', new Uint8Array(10)), 422, 'INVALID'],
    ];
    for (const [f, status, code] of cases) {
      const r = await h.api.request(UPLOAD, { method: 'POST', form: f });
      expect(r.status, code).toBe(status);
      expect(r.body.code).toBe(code);
    }
    const noFile = new FormData();
    noFile.set('kind', 'image');
    expect((await h.api.request(UPLOAD, { method: 'POST', form: noFile })).status).toBe(422);
  });

  it.runIf(IN_PROCESS)('refuses files over the size limit (test limit: pictures 1 MB, videos 2 MB)', async () => {
    const big = await h.api.request(UPLOAD, { method: 'POST', form: form('image', 'big.png', padded(MAGIC.png, 1024 * 1024 + 10)) });
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('FILE_TOO_LARGE');
    const huge = await h.api.request(UPLOAD, { method: 'POST', form: form('video', 'huge.mp4', padded(MAGIC.mp4, 4 * 1024 * 1024)) });
    expect(huge.status).toBe(413);
  });

  it('refuses unsafe or unknown upload targets', async () => {
    const f = form('image', 'a.png', padded(MAGIC.png, 64));
    expect((await h.api.request(`/api/v1/products/${encodeURIComponent('../x')}/modules/sales/uploads`, { method: 'POST', form: f })).status).toBe(400);
    expect((await h.api.request('/api/v1/products/acme-books/modules/nope/uploads', { method: 'POST', form: form('image', 'a.png', padded(MAGIC.png, 64)) })).status).toBe(404);
  });

  it.runIf(IN_PROCESS)('writes the file inside the module only, and logs the upload', async () => {
    expect(fs.existsSync(path.join(h.workspace!.contentDir, 'products/acme-books/sales/images/my-screen-shot.png'))).toBe(true);
    const log = dataOf<Paged<AuditEntryDto>>(await h.api.get('/api/v1/audit-log?area=uploads'));
    expect(log.items.map((e) => e.action)).toContain('upload.video');
  });
});

describe('files', () => {
  it('serves module pictures and refuses anything else', async () => {
    const ok = await h.api.get(`/api/v1/files?path=${encodeURIComponent('products/acme-books/sales/images/my-screen-shot.png')}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-security-policy')).toContain("default-src 'none'");
    for (const bad of ['products/../site.json', 'products/acme-books/sales/create-an-invoice.md', '/etc/passwd', 'products/acme-books/sales/images/../../../site.json', 'products/acme-books/sales/_capture/x.png']) {
      const r = await h.api.get(`/api/v1/files?path=${encodeURIComponent(bad)}`);
      expect(r.status, bad).toBe(400);
      expect(r.body.code).toBe('BAD_PATH');
    }
    expect((await h.api.get(`/api/v1/files?path=${encodeURIComponent('products/acme-books/sales/images/none.png')}`)).status).toBe(404);
    expect((await h.api.get('/api/v1/files')).status).toBe(422);
  });
});

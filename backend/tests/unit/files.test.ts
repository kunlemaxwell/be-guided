import { describe, expect, it } from 'vitest';
import { checkUpload, detectFormat } from '../../src/domain/files';
import { safeBaseName } from '../../src/domain/slugs';
import { MAGIC } from '../magic-bytes';

describe('upload checks (extension AND content)', () => {
  it('recognises formats from their first bytes', () => {
    expect(detectFormat(MAGIC.png)).toBe('png');
    expect(detectFormat(MAGIC.jpeg)).toBe('jpeg');
    expect(detectFormat(MAGIC.gif)).toBe('gif');
    expect(detectFormat(MAGIC.webp)).toBe('webp');
    expect(detectFormat(MAGIC.mp4)).toBe('isobmff');
    expect(detectFormat(MAGIC.webm)).toBe('webm');
    expect(detectFormat(new TextEncoder().encode('<html><script>'))).toBeNull();
  });

  it('accepts matching files', () => {
    expect(checkUpload('image', 'Shot.PNG', MAGIC.png)).toEqual({ ok: true, extension: '.png' });
    expect(checkUpload('image', 'a.jpeg', MAGIC.jpeg)).toEqual({ ok: true, extension: '.jpg' });
    expect(checkUpload('video', 'walk.mov', MAGIC.mp4)).toEqual({ ok: true, extension: '.mov' });
  });

  it('refuses a wrong kind, SVG, forged content and no extension', () => {
    expect(checkUpload('image', 'a.mp4', MAGIC.mp4)).toEqual({ ok: false, reason: 'extension' });
    expect(checkUpload('image', 'logo.svg', new TextEncoder().encode('<svg'))).toEqual({ ok: false, reason: 'extension' });
    expect(checkUpload('image', 'fake.png', new TextEncoder().encode('MZ\x90\x00 not a png'))).toEqual({ ok: false, reason: 'content' });
    expect(checkUpload('image', 'fake.png', MAGIC.jpeg)).toEqual({ ok: false, reason: 'content' });
    expect(checkUpload('video', 'noext', MAGIC.mp4)).toEqual({ ok: false, reason: 'extension' });
  });
});

describe('safe file names', () => {
  it.each([
    ['Walkthrough Video (final).MP4', 'walkthrough-video-final'],
    ['../../etc/passwd', 'passwd'],
    ['Café crème.png', 'cafe-creme'],
    ['....png', 'file'],
  ])('%s → %s', (input, out) => expect(safeBaseName(input)).toBe(out));
});

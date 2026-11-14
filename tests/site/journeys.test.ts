import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeJourneys } from '../../src/lib/journeys/merge';

const FIXTURE = path.resolve(__dirname, 'fixtures/content');
const saved = { c: process.env.CONTENT_DIR, e: process.env.NEXT_PUBLIC_HELP_ENV };

async function journeys(helpEnv: 'local' | 'production') {
  vi.resetModules();
  process.env.CONTENT_DIR = FIXTURE;
  process.env.NEXT_PUBLIC_HELP_ENV = helpEnv;
  return import('../../src/lib/content/journeys');
}

afterEach(() => {
  if (saved.c === undefined) delete process.env.CONTENT_DIR; else process.env.CONTENT_DIR = saved.c;
  if (saved.e === undefined) delete process.env.NEXT_PUBLIC_HELP_ENV; else process.env.NEXT_PUBLIC_HELP_ENV = saved.e;
});

describe('journeys', () => {
  it('keeps only steps that exist in a public build, once each, in order', async () => {
    const { getJourneys } = await journeys('production');
    const seller = getJourneys('alpha').find((j) => j.slug === 'seller');
    expect(seller?.steps.map((s) => s.id)).toEqual(['alpha/sales/open-page', 'alpha/sales/public-setup']);
    expect(seller?.steps[0]?.why).toBe('Start here.');
    expect(seller?.steps[0]?.href).toBe('/alpha/sales/open-page/');
  });

  it('drops a journey that has no page left in the build', async () => {
    const { getJourneys } = await journeys('production');
    expect(getJourneys('alpha').map((j) => j.slug)).toEqual(['seller']);
  });

  it('shows draft steps while previewing locally', async () => {
    const { getJourneys } = await journeys('local');
    const seller = getJourneys('alpha').find((j) => j.slug === 'seller');
    expect(seller?.steps.map((s) => s.id)).toContain('alpha/sales/draft-page');
  });

  it('has no journeys for a product without the file', async () => {
    const { getJourneys } = await journeys('production');
    expect(getJourneys('secret')).toEqual([]);
    expect(getJourneys('nope')).toEqual([]);
  });

  it('lists which journeys use a page', async () => {
    const { journeysWithPage } = await journeys('production');
    expect(journeysWithPage('alpha', 'alpha/sales/open-page')).toEqual(['seller']);
  });
});

describe('mergeJourneys', () => {
  const step = (id: string) => ({ id, title: id, summary: '', href: `/${id}/`, moduleTitle: 'M' });
  it('joins journeys in order and lists a shared page once with everyone it serves', () => {
    const out = mergeJourneys([
      { slug: 'a', title: 'A', steps: [step('x'), step('y')] },
      { slug: 'b', title: 'B', steps: [step('y'), step('z')] },
    ]);
    expect(out.map((s) => s.id)).toEqual(['x', 'y', 'z']);
    expect(out.find((s) => s.id === 'y')?.for).toEqual(['A', 'B']);
  });
  it('returns nothing for no journeys', () => {
    expect(mergeJourneys([])).toEqual([]);
  });
});

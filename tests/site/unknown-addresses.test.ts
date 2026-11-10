import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// With output: 'export', an address not returned by generateStaticParams made
// the preview server answer 500 ("missing param") instead of 404.
const DYNAMIC_PAGES = ['src/app/[product]/page.tsx', 'src/app/[product]/[module]/page.tsx', 'src/app/[product]/[module]/[page]/page.tsx'];

describe('unknown guide addresses', () => {
  it.each(DYNAMIC_PAGES)('%s answers 404 for addresses it does not build', (file) => {
    const source = fs.readFileSync(path.resolve(file), 'utf8');
    expect(source).toMatch(/export const dynamicParams = false;/);
  });
});
